import ts from 'typescript';

type PackageMetadata = {
  exports?: unknown;
  files?: unknown;
  publishConfig?: { exports?: unknown };
};

type PublishableManifest = {
  bugs?: { url?: unknown };
  engines?: { node?: unknown };
  files?: unknown;
  homepage?: unknown;
  repository?: { directory?: unknown };
  sideEffects?: unknown;
  type?: unknown;
};

const recordKeys = (value: unknown): string[] =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value).sort() : [];

export const packageMetadataIssues = (
  packageJson: PackageMetadata,
  pathExists: (path: string) => boolean,
): string[] => {
  const developmentExports = recordKeys(packageJson.exports);
  const publishExports = new Set(recordKeys(packageJson.publishConfig?.exports));
  const developmentExportSet = new Set(developmentExports);
  const issues = developmentExports
    .filter((specifier) => !publishExports.has(specifier))
    .map((specifier) => `publishConfig.exports is missing development export: ${specifier}`);

  for (const specifier of [...publishExports].filter((value) => !developmentExportSet.has(value)).sort()) {
    issues.push(`development exports is missing published export: ${specifier}`);
  }

  if (Array.isArray(packageJson.files)) {
    for (const path of packageJson.files) {
      if (typeof path !== 'string' || pathExists(path)) {
        continue;
      }
      issues.push(`files entry does not exist: ${path}`);
    }
  }

  return issues;
};

/** Required publish metadata that must not vary between package templates and hand-written manifests. */
export const publishableManifestIssues = ({
  packageName,
  projectDirectory,
  manifest,
  pathExists,
}: {
  readonly packageName: string;
  readonly projectDirectory: string;
  readonly manifest: PublishableManifest;
  readonly pathExists: (path: string) => boolean;
}): string[] => {
  const issues: string[] = [];
  if (manifest.type !== 'module') {
    issues.push(`${packageName}: package.json type must be "module"`);
  }
  if (!Object.hasOwn(manifest, 'sideEffects')) {
    issues.push(`${packageName}: package.json sideEffects must be declared`);
  }
  if (manifest.engines?.node !== '>=24.0.0') {
    issues.push(`${packageName}: package.json engines.node must be ">=24.0.0"`);
  }
  if (typeof manifest.homepage !== 'string' || manifest.homepage.length === 0) {
    issues.push(`${packageName}: package.json homepage must be declared`);
  }
  if (typeof manifest.bugs?.url !== 'string' || manifest.bugs.url.length === 0) {
    issues.push(`${packageName}: package.json bugs.url must be declared`);
  }
  if (manifest.repository?.directory !== projectDirectory) {
    issues.push(`${packageName}: package.json repository.directory must be ${JSON.stringify(projectDirectory)}`);
  }

  const files = new Set(Array.isArray(manifest.files) ? manifest.files.filter((path) => typeof path === 'string') : []);
  if (!files.has('LICENSE')) {
    issues.push(`${packageName}: package.json files must include LICENSE`);
  }
  if (pathExists('CHANGELOG.md') && !files.has('CHANGELOG.md')) {
    issues.push(`${packageName}: package.json files must include the existing CHANGELOG.md`);
  }

  return issues.sort();
};

export const bundleOwnershipIssues = (roots: Array<{ owner: string; bundled: string[] }>): string[] => {
  const owners = new Map<string, string>();
  const issues: string[] = [];

  for (const { owner, bundled } of roots) {
    for (const packageName of bundled) {
      const previousOwner = owners.get(packageName);
      if (previousOwner) {
        issues.push(`${packageName} is bundled by both ${previousOwner} and ${owner}`);
      } else {
        owners.set(packageName, owner);
      }
    }
  }

  return issues.sort();
};

type PrivateLibraryManifest = {
  readonly name: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
};

/**
 * Close each owner's direct bundle candidates over private-library runtime declarations.
 * Root candidates already come only from the owner's devDependencies; transitive
 * devDependencies are deliberately ignored.
 */
export const bundleDeclarationClosure = (
  directByOwner: ReadonlyMap<string, readonly string[]>,
  libraries: readonly PrivateLibraryManifest[],
): Map<string, string[]> => {
  const byName = new Map(libraries.map((library) => [library.name, library]));

  return new Map(
    [...directByOwner].map(([owner, direct]) => {
      const bundled = new Set(direct);
      const pending = [...direct];
      for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
        const library = byName.get(name);
        for (const dependency of Object.keys({
          ...library?.dependencies,
          ...library?.optionalDependencies,
        })) {
          if (!byName.has(dependency) || bundled.has(dependency)) {
            continue;
          }
          bundled.add(dependency);
          pending.push(dependency);
        }
      }

      return [owner, [...bundled].sort()] as const;
    }),
  );
};

/**
 * The second witness on bundling: every library a build actually mirrored into
 * an owner's `dist` must be one the manifest/tag rule permits that owner to
 * bundle. A package always mirrors its own sources, so it is not a candidate.
 * The converse invariant — one library, one permitted owner — is the rule's own
 * (`bundleOwnershipIssues` in `@taucad/nx`), not a mirror-side failure.
 */
export const bundleWitnessIssues = (
  mirroredByOwner: ReadonlyArray<{ owner: string; bundled: readonly string[] }>,
  permittedByOwner: ReadonlyMap<string, readonly string[]>,
): string[] =>
  mirroredByOwner
    .flatMap(({ owner, bundled }) =>
      bundled
        .filter((name) => name !== owner && !(permittedByOwner.get(owner) ?? []).includes(name))
        .map(
          (name) =>
            `${name} is mirrored into ${owner}'s dist but ${owner}'s manifest and tags do not permit bundling it`,
        ),
    )
    .sort();

/** One module specifier an emitted file references, with the file that references it. */
export type EmittedSpecifier = { readonly path: string; readonly specifier: string };

/**
 * Every module specifier an emitted file imports, exports, re-declares, or
 * loads dynamically, read from the syntax tree so prose — JSDoc, string
 * literals describing the runtime's virtual `/node_modules/` mount — can never
 * masquerade as an import.
 */
export const emittedSpecifiers = (
  files: ReadonlyArray<{ readonly path: string; readonly source: string }>,
): EmittedSpecifier[] => {
  const specifiers: EmittedSpecifier[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(file.path, file.source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        specifiers.push({ path: file.path, specifier: node.moduleSpecifier.text });
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        specifiers.push({ path: file.path, specifier: node.argument.literal.text });
      } else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
        specifiers.push({ path: file.path, specifier: node.name.text });
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments.length === 1 &&
        node.arguments[0] !== undefined &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        specifiers.push({ path: file.path, specifier: node.arguments[0].text });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return specifiers;
};

export const bundledArtifactIssues = (
  dependencies: Readonly<Record<string, string>>,
  files: ReadonlyArray<{ readonly path: string; readonly source: string }>,
  bundledPackages: readonly string[],
): string[] => {
  const issues = new Set<string>();
  for (const name of bundledPackages) {
    if (name in dependencies) {
      issues.add(`package.json: bundled package remains a production dependency: ${name}`);
    }
  }

  for (const { path, specifier } of emittedSpecifiers(files)) {
    if (bundledPackages.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
      issues.add(`${path}: bundled package specifier remains: ${specifier}`);
    }
  }

  return [...issues].sort();
};

/**
 * `tau-no-vendored-node-modules`. Under `unbundle: true` tsdown cannot
 * externalize a specifier the manifest never declared, so it copies the package
 * under `dist/node_modules/.pnpm/<pkg>@<version>/…`, rewrites the import to
 * point at the copy, and `files: ["dist"]` packs the lot — a store path that
 * resolves to nothing on a consumer machine, an undeclared redistribution, and
 * a dependency nobody can patch. Both witnesses are structural: an emitted
 * *specifier* (never a text grep — the runtime's shipped prose describes its own
 * virtual `/node_modules/` mount) and the directory itself.
 */
export const vendoredNodeModulesIssues = (
  packageName: string,
  emitted: readonly EmittedSpecifier[],
  distributionDirectories: readonly string[],
): string[] => {
  const issues = new Set<string>();

  for (const directory of distributionDirectories) {
    if (directory === 'node_modules' || directory.endsWith('/node_modules')) {
      issues.add(
        `${packageName}: dist/${directory} exists; declare the vendored dependencies so the build keeps them external`,
      );
    }
  }

  for (const { path, specifier } of emitted) {
    if (specifier.includes('/node_modules/')) {
      issues.add(`${packageName}: ${path} imports a vendored specifier: ${specifier}`);
    }
  }

  return [...issues].sort();
};

/**
 * One dependency whose instance must never fork across an install, and why.
 *
 * @see docs/research/runtime-plugin-manifest-guards-blueprint.md
 */
export type PeerRule = {
  readonly name: string;
  readonly reason: string;
  readonly dependencyLeafAllowlist?: readonly string[];
};

/** The one registry shared by publishable-peer and internal-library rules. */
export const peerRules: readonly PeerRule[] = [
  { name: 'zod', reason: 'schema instance and type identity must not fork across an install' },
  {
    name: '@taucad/runtime',
    reason: 'one runtime instance must own protocol and type identity across an install',
    dependencyLeafAllowlist: ['@taucad/cli', 'geospec', '@taucad/geospec-engine'],
  },
];

type PeerManifest = {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
};

/**
 * `tau-peer-dependency-shape`. Detection reads the built artifact, not the
 * source: packages whose zod types arrive transitively through
 * `defineKernel({ optionsSchema })` never write `from 'zod'` anywhere in `src`,
 * yet their declarations import it. A vendored store path counts as the same
 * witness — it is what an undeclared requirement looks like after the bundler
 * gave up on externalizing it.
 */
export const peerDependencyIssues = ({
  packageName,
  manifest,
  emitted,
  rules,
}: {
  readonly packageName: string;
  readonly manifest: PeerManifest;
  readonly emitted: ReadonlyArray<{ readonly path: string; readonly specifier: string }>;
  readonly rules: readonly PeerRule[];
}): string[] => {
  const issues: string[] = [];

  for (const { name, reason, dependencyLeafAllowlist } of rules) {
    const witness = emitted.find(
      ({ specifier }) =>
        specifier === name ||
        specifier.startsWith(`${name}/`) ||
        (specifier.includes('/node_modules/') &&
          (specifier.includes(`/node_modules/${name}/`) || specifier.includes(`/${name}@`))),
    );
    const peerRange = manifest.peerDependencies?.[name];

    if (dependencyLeafAllowlist?.includes(packageName) === true && manifest.dependencies?.[name] !== undefined) {
      continue;
    }

    // No witness, no contract: a leaf package (cli, geospec, geospec-engine, an
    // app) whose own emit never imports the dependency declares it precisely to
    // satisfy the peer its plugins require, which is bucket B of npm-policy
    // Rule 1 — not a forked instance.
    if (witness === undefined) {
      if (peerRange !== undefined) {
        issues.push(
          `${packageName}: ${name} is a peerDependency but no emitted file imports it; drop the peer or fix the emit`,
        );
      }
      continue;
    }

    if (manifest.dependencies?.[name] !== undefined) {
      issues.push(
        `${packageName}: ${name} is a production dependency; it must be a required peerDependency with a workspace devDependency — ${reason}`,
      );
    }
    if (manifest.optionalDependencies?.[name] !== undefined) {
      issues.push(
        `${packageName}: ${name} is an optionalDependency; it must be a required peerDependency with a workspace devDependency — ${reason}`,
      );
    }

    if (peerRange === undefined) {
      issues.push(
        `${packageName}: ${name} must be declared in peerDependencies (witness: ${witness.path} imports "${witness.specifier}")`,
      );
      continue;
    }

    if (manifest.peerDependenciesMeta?.[name]?.optional === true) {
      issues.push(`${packageName}: peerDependenciesMeta.${name}.optional is true; the peer is required — ${reason}`);
    }
    if (manifest.devDependencies?.[name] === undefined) {
      issues.push(
        `${packageName}: ${name} is a peerDependency without a matching devDependency; the workspace must develop against the peer it declares`,
      );
    }
  }

  return issues.sort();
};

/** Identity singletons are supplied by a bundle owner or leaf, never by a private library. */
export const libDependencyIssues = (
  projects: ReadonlyArray<{
    readonly name: string;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly optionalDependencies?: Readonly<Record<string, string>>;
  }>,
  rules: readonly PeerRule[] = peerRules,
): string[] =>
  projects
    .flatMap((project) =>
      rules.flatMap(({ name }) =>
        (['dependencies', 'optionalDependencies'] as const).flatMap((field) =>
          project[field]?.[name] === undefined
            ? []
            : [`${project.name}: ${name} must not be declared in ${field}; its bundle owner or leaf supplies it`],
        ),
      ),
    )
    .sort();

/**
 * `tau-workspace-range-parity`. `workspace:^` publishes a caret range, so a
 * consumer can resolve a second copy of a package whose module state must be
 * singular (`@taucad/geometry-core` owns glTF extension registries);
 * `workspace:*` publishes the exact version the workspace built against. A peer
 * is the mirror case: the consumer installs it, so it must carry a real semver
 * range and never the workspace protocol.
 *
 * @see docs/research/runtime-plugin-manifest-guards-blueprint.md Finding 6, R8
 */
export const workspaceRangeIssues = (
  projects: ReadonlyArray<{
    readonly name: string;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
  }>,
): string[] => {
  const issues: string[] = [];

  for (const project of projects) {
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      for (const [dependency, range] of Object.entries(project[field] ?? {})) {
        if (!range.startsWith('workspace:') || (field !== 'peerDependencies' && range === 'workspace:*')) {
          continue;
        }
        issues.push(
          field === 'peerDependencies'
            ? `${project.name}: ${dependency} is declared ${JSON.stringify(range)} in peerDependencies; a peer must publish a real semver range, not the workspace protocol`
            : `${project.name}: ${dependency} is declared ${JSON.stringify(range)} in ${field}; workspace ranges must be uniform "workspace:*"`,
        );
      }
    }
  }

  return issues.sort();
};

/**
 * The only `package.json#imports` map a Tau project may declare: one wildcard
 * for `#name.js` → source, one for everything else. Recorded exceptions are the
 * single escape hatch.
 *
 * @see docs/research/runtime-plugin-manifest-guards-blueprint.md
 */
export const canonicalInternalImports: Readonly<Record<string, string>> = {
  '#*.js': './src/*.ts',
  '#*': './src/*',
};

const canonicalKeyList = Object.keys(canonicalInternalImports)
  .map((key) => JSON.stringify(key))
  .join(', ');

/**
 * `tau-internal-imports-shape`. Every hand-added alias is drift: the generators
 * emit exactly the canonical map, and `publishConfig.imports: {}` keeps the map
 * out of the registry, so an extra key buys nothing a relative import does not
 * already give. An absent map is fine — a project need not use subpath imports.
 */
export const internalImportsIssues = (
  projects: ReadonlyArray<{ readonly name: string; readonly imports: Readonly<Record<string, unknown>> | undefined }>,
  exceptions: Readonly<Record<string, Readonly<Record<string, string>>>>,
): string[] => {
  const issues: string[] = [];

  for (const { name, imports } of projects) {
    const allowed = exceptions[name] ?? {};
    if (imports === undefined) {
      for (const key of Object.keys(allowed).sort()) {
        issues.push(
          `${name}: recorded imports exception names a key this package does not declare: ${JSON.stringify(key)}`,
        );
      }
      continue;
    }

    for (const [key, target] of Object.entries(canonicalInternalImports)) {
      if (!(key in imports)) {
        issues.push(
          `${name}: package.json imports is missing the canonical entry ${JSON.stringify(key)}: ${JSON.stringify(target)}`,
        );
      } else if (imports[key] !== target) {
        issues.push(
          `${name}: package.json imports retargets ${JSON.stringify(key)} to ${JSON.stringify(imports[key])} (expected ${JSON.stringify(target)})`,
        );
      }
    }

    for (const key of Object.keys(imports)) {
      if (key in canonicalInternalImports || key in allowed) {
        continue;
      }
      issues.push(
        `${name}: package.json imports declares a package-specific alias: ${JSON.stringify(key)}: ${JSON.stringify(imports[key])} (allowed keys: ${canonicalKeyList})`,
      );
    }

    for (const key of Object.keys(allowed).sort()) {
      if (!(key in imports)) {
        issues.push(
          `${name}: recorded imports exception names a key this package does not declare: ${JSON.stringify(key)}`,
        );
      }
    }
  }

  return issues;
};

/**
 * One `copy-files-from-to.cjson` entry. `project` labels the owner in messages;
 * `root` is its workspace-relative directory, which is what `to` and the git
 * index are relative to.
 */
export type CopyEntry = {
  readonly project: string;
  readonly root: string;
  readonly from: string;
  readonly to: string;
};

/** A binary under a project's asset directories, project-relative. */
export type AssetFile = { readonly project: string; readonly path: string };

/**
 * An upstream `exports` subpath that resolves to exactly the file a copy entry
 * reaches for by literal path. `file` is that entry's `from` string, so the rule
 * stays pure: the caller does the resolution and the realpath comparison.
 */
export type UpstreamExport = { readonly package: string; readonly subpath: string; readonly file: string };

/** `…/node_modules/@scope/pkg/deep/file` → `@scope/pkg`. */
const upstreamPackageOf = (from: string): string => {
  const segments = from.split('node_modules/').at(-1)?.split('/') ?? [];
  return segments[0]?.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? from);
};

/**
 * `tau-vendored-assets`. Four structural sub-rules, no content hashing:
 * a generated copy must not be tracked in git (one `git add -A` otherwise
 * commits ~180 MB of binaries), every generated destination must be git-ignored,
 * every binary under the asset directories must
 * have a recipe naming the dependency it came from, and no WASM recipe may copy
 * a file already exposed by an upstream `exports` subpath. A file no subpath
 * covers needs a recorded reason; a reason that outlives the defect it excused
 * is itself an issue.
 */
export const vendoredAssetIssues = ({
  entries,
  trackedPaths,
  ignoredPaths,
  assetFiles,
  upstreamExports,
  reasons,
}: {
  readonly entries: readonly CopyEntry[];
  readonly trackedPaths: readonly string[];
  readonly ignoredPaths: readonly string[];
  readonly assetFiles: readonly AssetFile[];
  readonly upstreamExports: readonly UpstreamExport[];
  readonly reasons: Readonly<Record<string, Readonly<Record<string, string>>>>;
}): string[] => {
  const issues: string[] = [];
  const tracked = new Set(trackedPaths);
  const ignored = new Set(ignoredPaths);
  const excused = new Set<string>();

  for (const entry of entries) {
    const destination = `${entry.root}/${entry.to}`;
    if (tracked.has(destination)) {
      issues.push(
        `${entry.project}: copy-assets writes ${entry.to}, but that path is tracked in git; ignore it instead`,
      );
    }
    if (!ignored.has(destination)) {
      issues.push(`${entry.project}: copy-assets writes ${entry.to}, but that path is not git-ignored`);
    }

    if (!entry.from.includes('node_modules/')) {
      continue;
    }
    const exported = upstreamExports.find((candidate) => candidate.file === entry.from);
    const reason = reasons[entry.project]?.[entry.from];
    if (exported !== undefined && entry.from.endsWith('.wasm')) {
      issues.push(
        `${entry.project}: copy-assets reads ${entry.from}, but ${exported.package} exports it as "${exported.subpath}"; load the exported WASM directly and delete the copy`,
      );
      if (reason !== undefined) {
        issues.push(
          `${entry.project}: vendoredAssetReasons records a reason for ${entry.from}, but ${exported.package} exports it as "${exported.subpath}"; delete the stale reason`,
        );
        excused.add(`${entry.project} ${entry.from}`);
      }
    } else if (exported === undefined) {
      if (reason === undefined) {
        issues.push(
          `${entry.project}: copy-assets reads ${entry.from}, which ${upstreamPackageOf(entry.from)} does not expose through package.json#exports; record a reason in vendoredAssetReasons or move the asset behind an exported subpath`,
        );
      } else {
        excused.add(`${entry.project} ${entry.from}`);
      }
    } else if (reason !== undefined) {
      issues.push(
        `${entry.project}: vendoredAssetReasons records a reason for ${entry.from}, but ${exported.package} exports it as "${exported.subpath}"; delete the stale reason`,
      );
      // Reported here; the generic stale-reason sweep below must not repeat it.
      excused.add(`${entry.project} ${entry.from}`);
    }
  }

  const destinations = new Set(entries.map((entry) => `${entry.project} ${entry.to}`));
  for (const asset of assetFiles) {
    if (destinations.has(`${asset.project} ${asset.path}`)) {
      continue;
    }
    if (reasons[asset.project]?.[asset.path] === undefined) {
      issues.push(
        `${asset.project}: ${asset.path} is not written by any copy-assets entry; vendored binaries must be generated from a declared dependency`,
      );
    } else {
      excused.add(`${asset.project} ${asset.path}`);
    }
  }

  for (const [project, paths] of Object.entries(reasons)) {
    for (const path of Object.keys(paths)) {
      if (!excused.has(`${project} ${path}`)) {
        issues.push(`${project}: recorded vendored-asset reason names a path that no longer needs one: ${path}`);
      }
    }
  }

  return issues.sort();
};

/** Every published plugin must name the runtime contract it expects its host to provide. */
export const pluginRuntimePeerDependencyIssues = (
  packageName: string,
  peerDependencies: Readonly<Record<string, string>> | undefined,
): string[] =>
  peerDependencies?.['@taucad/runtime'] === undefined
    ? [`${packageName}: package.json peerDependencies must declare @taucad/runtime`]
    : [];

/**
 * Dependencies that cannot run in a browser. A `hostTarget: browser` package
 * that hard-declares one is lying about its payload isolation; the recursive
 * payload-isolation guard test is the second witness, in code.
 */
export const nodeOnlyDependencies: readonly string[] = [
  'better-sqlite3',
  'bufferutil',
  'canvas',
  'fs-extra',
  'node-fetch',
  'node-gyp-build',
  'sharp',
  'utf-8-validate',
  'ws',
];

/**
 * `taucad.hostTarget` was inert metadata read once at scaffold time. This is the
 * gate that makes the declaration mean something.
 */
export const hostTargetIssues = ({
  packageName,
  hostTarget,
  dependencyNames,
  hasPayloadGuardTest,
}: {
  readonly packageName: string;
  readonly hostTarget: unknown;
  readonly dependencyNames: readonly string[];
  readonly hasPayloadGuardTest: boolean;
}): string[] => {
  if (hostTarget === undefined) {
    return [`${packageName}: package.json taucad.hostTarget is not declared (expected "browser" or "node")`];
  }
  if (hostTarget !== 'browser' && hostTarget !== 'node') {
    return [
      `${packageName}: package.json taucad.hostTarget is ${JSON.stringify(hostTarget)} (expected "browser" or "node")`,
    ];
  }
  if (hostTarget === 'node') {
    return [];
  }

  const issues = hasPayloadGuardTest
    ? []
    : [`${packageName}: taucad.hostTarget is "browser" but src/ carries no payload-isolation guard test`];
  for (const name of dependencyNames.filter((name) => nodeOnlyDependencies.includes(name)).sort()) {
    issues.push(`${packageName}: taucad.hostTarget is "browser" but ${name} is declared as a node-only dependency`);
  }

  return issues;
};

type TsdownCopyEntry = string | { from: string | string[]; to?: string; rename?: string };

/**
 * Destination paths a tsdown `copy` list produces. `to` is a destination
 * *directory*: the basename of `from` lands under it, or `rename` when given.
 *
 * @see tsdown/dist/watch-*.mjs `resolveCopyEntry`
 */
export const copyTargetPaths = (entries: readonly TsdownCopyEntry[], outDirectory: string): string[] => {
  const targets: string[] = [];
  for (const entry of entries) {
    const { from, to = outDirectory, rename } = typeof entry === 'string' ? { from: entry } : entry;
    for (const source of Array.isArray(from) ? from : [from]) {
      // No workspace config uses a glob `from`; expanding one needs the filesystem, so add it when one appears.
      if (source.includes('*')) {
        continue;
      }
      targets.push(`${to}/${rename ?? source.split('/').pop() ?? source}`);
    }
  }

  return targets;
};

/** Emitted paths whose segment repeats its parent (`wasm/wasm`, `fonts/fonts`), reported at the repeat. */
export const doubledPathSegments = (paths: readonly string[]): string[] => {
  const issues = new Set<string>();
  for (const path of paths) {
    const segments = path.split('/');
    for (const [index, segment] of segments.entries()) {
      if (index > 0 && segment === segments[index - 1]) {
        issues.add(segments.slice(0, index + 1).join('/'));
      }
    }
  }

  return [...issues].sort();
};

/**
 * Workspace projects a package actually bundled, detected from the mirror
 * directories `unbundle: true` emits for sources outside the package root
 * (`dist/libs/<name>/src/...`). A bundled project leaves a mirror; an external
 * one leaves only a bare specifier, which {@linkcode bundledArtifactIssues} covers.
 */
export const bundledWorkspaceMirrors = (
  distributionDirectories: readonly string[],
  projects: ReadonlyArray<{ name: string; directory: string }>,
): string[] =>
  projects
    .filter(({ directory }) => distributionDirectories.some((path) => `/${path}/`.includes(`/${directory}/src/`)))
    .map(({ name }) => name)
    .sort();

/**
 * Every published subpath as an importable specifier, minus the ones with a
 * recorded reason. Wildcards cannot be probed. A reason naming a subpath the
 * package does not publish is itself an issue, so a stale excuse cannot linger
 * after the export it excused moved or was removed.
 */
export const probedSpecifiers = (
  packageName: string,
  exports: unknown,
  exclusions: Readonly<Record<string, string>>,
): { specifiers: string[]; issues: string[] } => {
  const published = recordKeys(exports).filter(
    (subpath) => subpath.startsWith('.') && !subpath.includes('*') && subpath !== './package.json',
  );

  return {
    specifiers: published
      .filter((subpath) => !(subpath in exclusions))
      .map((subpath) => `${packageName}${subpath.slice(1)}`),
    issues: Object.keys(exclusions)
      .filter((subpath) => !published.includes(subpath))
      .sort()
      .map((subpath) => `recorded strict-consumer exclusion names a subpath this package does not publish: ${subpath}`),
  };
};

export const strictConsumerCompilerOptions = (moduleResolution: 'bundler' | 'nodenext'): Record<string, unknown> => ({
  lib: ['ES2024', 'DOM', 'DOM.Iterable'],
  module: moduleResolution === 'bundler' ? 'ESNext' : 'NodeNext',
  moduleResolution,
  noEmit: true,
  skipLibCheck: false,
  strict: true,
  target: 'ES2024',
  types: ['node'],
});
