/**
 * Pack every publishable package, install the TGZs with npm outside Tau, and exercise the
 * published surface: every export subpath, every `files` entry, the native payloads that only
 * fail once instantiated, and the runtime's shipped README quick start.
 *
 * All tarballs install into ONE application in a single `npm install`, so npm resolves the
 * `@taucad/*` and `geospec` sibling specifiers against the local tarballs instead of the
 * registry — the registry copies are stale or absent.
 *
 * Usage: node scripts/src/check-pack-install.ts [package-dir…]
 *
 * A subset only works when it is closed under workspace dependencies; omitting a sibling makes npm
 * fall back to the registry and 404. Requesting `packages/runtime` also packs the packages its
 * README quick start imports and their publishable closure, computed from the graph.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundledLibraries, publishable, publishableClosure, publishWaves, workspace } from '@taucad/nx';

type Dependencies = Record<string, string>;

type ExportEntry = string | { types?: string; import?: string; default?: string };

export type Manifest = {
  readonly name: string;
  readonly version: string;
  readonly files?: readonly string[];
  readonly exports?: Record<string, ExportEntry>;
  readonly dependencies?: Dependencies;
  readonly optionalDependencies?: Dependencies;
  readonly peerDependencies?: Dependencies;
};

export type ImportFailure = {
  readonly specifier: string;
  readonly code?: string;
  readonly message: string;
};

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Subpaths that cannot be imported in a bare Node process for a stated reason, keyed by a
 * substring the produced error must contain. A tolerated entry still has to *resolve* — the
 * module body runs, so a missing sibling file surfaces as ERR_MODULE_NOT_FOUND and stays red.
 * Anything not listed here, and any listed entry that fails differently, is red.
 */
const toleratedImportFailures: Record<string, string> = {};

/**
 * Payloads that only fail when instantiated, keyed by package name; the source runs inside the
 * installed application.
 *
 * `@taucad/geospec-engine` is loaded through `dist/native/opencascade-module.mjs` rather than the
 * published `./native/opencascade/single` subpath, because the adapter is the module every shipped
 * consumer path reaches — it is what proves the subpath resolves and instantiates from inside the
 * installed tree. It is not itself an export target, so it is imported by file URL from
 * `node_modules`.
 */
const instantiationProbes: Record<string, string> = {
  '@taucad/geospec-engine': `
const moduleUrl = new URL('./node_modules/@taucad/geospec-engine/dist/native/opencascade-module.mjs', import.meta.url);
const { getOpenCascadeStepModule } = await import(moduleUrl.href);
const occt = await getOpenCascadeStepModule();
if (!(occt.HEAPF64?.length > 0)) {
  throw new Error('OCCT module instantiated without a heap.');
}
`,
};

const invariant: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = (command: string, arguments_: string[], cwd: string): string => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with status ${String(result.status)}\n${result.error?.message ?? ''}${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
};

const exportTarget = (entry: ExportEntry): string | undefined =>
  typeof entry === 'string' ? entry : (entry.import ?? entry.default);

/** Every subpath a consumer can `import()`, as bare specifiers. Type-only entries have no runtime target. */
export const importableSpecifiers = (manifest: Manifest): string[] =>
  Object.entries(manifest.exports ?? {})
    .filter(([key, entry]) => key !== './package.json' && exportTarget(entry) !== undefined)
    .map(([key]) => (key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`));

/** Every file an installed tree must contain: `files` entries plus every export condition target. */
export const requiredArtifactPaths = (manifest: Manifest): string[] => [
  ...(manifest.files ?? []),
  ...Object.values(manifest.exports ?? {}).flatMap((entry) =>
    typeof entry === 'string'
      ? [entry]
      : [entry.types, entry.import, entry.default].filter((path) => path !== undefined),
  ),
];

/** Specifiers that must not survive into a published manifest, plus bundled private libraries. */
export const manifestViolations = (manifest: Manifest, bundledLibraryNames: ReadonlySet<string>): string[] => {
  const violations: string[] = [];
  for (const dependencies of [manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies]) {
    for (const [name, specifier] of Object.entries(dependencies ?? {})) {
      if (/^(?:file|workspace|catalog):/u.test(specifier)) {
        violations.push(`${manifest.name} declares ${name} as ${specifier}.`);
      }
      if (bundledLibraryNames.has(name)) {
        violations.push(`${manifest.name} leaks bundled private dependency ${name}.`);
      }
    }
  }
  return violations;
};

/**
 * A failure is tolerated only when it is a missing *external optional peer* of the package that
 * declared it, or an explicitly listed environment-dependent entry. A missing relative sibling
 * (`./geospec_opencascade_single.js`) reports a path rather than a package name and stays red.
 */
export const isToleratedImportFailure = (failure: ImportFailure, peerDependencies: readonly string[]): boolean => {
  const expected = toleratedImportFailures[failure.specifier];
  if (expected !== undefined) {
    return failure.message.includes(expected);
  }
  const missingPackage = /Cannot find package '(?<name>[^']+)'/u.exec(failure.message)?.groups?.['name'];
  return (
    failure.code === 'ERR_MODULE_NOT_FOUND' && missingPackage !== undefined && peerDependencies.includes(missingPackage)
  );
};

/**
 * Every `new URL('<relative>', import.meta.url)` literal in an emitted module.
 * That form is the published asset contract — it is how a bundler fingerprints a
 * WASM payload and how the installed `dist/wasm/…` resolves with no
 * `node_modules` lookup at consumer runtime — so each one must land inside the
 * installed package.
 */
export const assetUrlSpecifiers = (source: string): string[] =>
  [...source.matchAll(/new URL\(\s*(["'`])(?<specifier>[^"'`]+)\1\s*,\s*import\.meta\.url\s*\)/gu)].flatMap((match) => {
    const specifier = match.groups?.['specifier'];
    // A bare scheme is not a file the tarball has to carry.
    return specifier === undefined || /^[a-z][\d+.a-z-]*:/u.test(specifier) ? [] : [specifier];
  });

/** Exported package assets reached through Node's standard package resolver. */
export const packageAssetUrlSpecifiers = (source: string): string[] =>
  [...source.matchAll(/new URL\(\s*import\.meta\.resolve\(\s*(["'`])(?<specifier>[^"'`]+)\1\s*\)\s*\)/gu)].flatMap(
    (match) => (match.groups?.['specifier'] === undefined ? [] : [match.groups['specifier']]),
  );

/** Every asset an installed package's modules reach for must exist inside that package. */
const assertAssetUrlsResolve = (installedRoot: string, name: string): number => {
  const modules = readdirSync(installedRoot, { recursive: true, encoding: 'utf8' }).filter((path) =>
    path.endsWith('.mjs'),
  );
  let checked = 0;
  for (const module_ of modules) {
    const modulePath = join(installedRoot, module_);
    const source = readFileSync(modulePath, 'utf8');
    for (const specifier of assetUrlSpecifiers(source)) {
      const asset = fileURLToPath(new URL(specifier, pathToFileURL(modulePath)));
      invariant(
        asset.startsWith(`${installedRoot}/`) && existsSync(asset),
        `${name} resolves ${specifier} from ${module_} to ${asset}, which the installed package does not contain.`,
      );
      checked += 1;
    }
    const require_ = createRequire(modulePath);
    for (const specifier of packageAssetUrlSpecifiers(source)) {
      let asset: string;
      try {
        asset = require_.resolve(specifier);
      } catch (error) {
        throw new Error(`${name} cannot resolve exported package asset ${specifier} from ${module_}.`, {
          cause: error,
        });
      }
      invariant(existsSync(asset), `${name} resolves exported package asset ${specifier} to missing file ${asset}.`);
      checked += 1;
    }
  }
  return checked;
};

/**
 * One zod in the installed tree. The schema types carry instance identity
 * (`instanceof ZodType` inside the runtime's `parse`) and type identity
 * (`$strip`/`$strict` brands), so a second copy breaks both — this is the
 * independent witness for the `tau-peer-dependency-shape` gate, read from a real
 * npm install rather than from the manifests.
 */
const assertSingleZodInstance = (appRoot: string): void => {
  type Node = { readonly path?: string; readonly dependencies?: Record<string, Node> };
  // `--long` carries each node's install `path`: `--all` lists the same hoisted
  // copy once per dependent, so paths — not node counts — say how many copies
  // exist. `npm ls` exits non-zero on any tree advisory, so the JSON is read
  // regardless of status.
  const listing = spawnSync('npm', ['ls', 'zod', '--json', '--all', '--long'], {
    cwd: appRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const installs = new Set<string>();
  const walk = (node: Node): void => {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      if (name === 'zod' && child.path !== undefined) {
        installs.add(child.path);
      }
      walk(child);
    }
  };
  walk(JSON.parse(listing.stdout || '{}') as Node);
  invariant(installs.size === 1, `npm resolved ${String(installs.size)} zod copies: ${[...installs].join(', ')}`);
  console.log(`zod: one instance in the installed tree (${[...installs][0]!}).`);
};

const quickStartSource = (readme: string): string => {
  const source = /## Quick start\s+[\s\S]*?```(?:typescript|javascript|ts|js)\n(?<source>[\s\S]*?)\n```/u.exec(readme)
    ?.groups?.['source'];
  invariant(source, 'Installed runtime README must contain a JavaScript-compatible fence under `## Quick start`.');
  return source;
};

const runRuntimeQuickStart = (appRoot: string, installedRoot: string): void => {
  writeFileSync(join(appRoot, 'smoke.mjs'), quickStartSource(readFileSync(join(installedRoot, 'README.md'), 'utf8')));
  const quickStartOutput = run(process.execPath, ['smoke.mjs'], appRoot).trim();
  // The quick start reports the exported artifact's size; a zero-byte or absent
  // GLB otherwise exits 0 and reports success, so assert the bytes it names.
  const exportedBytes = /(?<bytes>\d+) bytes/u.exec(quickStartOutput)?.groups?.['bytes'];
  invariant(
    exportedBytes !== undefined,
    `README quick start did not report an exported byte count: ${quickStartOutput}`,
  );
  invariant(Number(exportedBytes) > 0, `README quick start exported an empty artifact: ${quickStartOutput}`);
  console.log(`README quick start: ${quickStartOutput}`);
};

const probeSource = `
import { readFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync(new URL('./probe-plan.json', import.meta.url), 'utf8'));
const failures = [];
const record = (specifier, error) => {
  failures.push({
    specifier,
    code: typeof error?.code === 'string' ? error.code : undefined,
    message: String(error?.message ?? error).split('\\n')[0],
  });
};

for (const specifier of plan.specifiers) {
  try {
    await import(specifier);
  } catch (error) {
    record(specifier, error);
  }
}
for (const [name, file] of Object.entries(plan.instantiations)) {
  try {
    await import(new URL(file, import.meta.url).href);
  } catch (error) {
    record(\`\${name} (instantiate)\`, error);
  }
}
console.log(JSON.stringify(failures));
`;

const main = async (): Promise<void> => {
  const resolved = await workspace({ fresh: true });
  const projectByName = new Map(publishable(resolved).map((project) => [project.name, project]));
  // The release train, in dependency order, derived from the graph.
  const releaseTrainDirectories = publishWaves(resolved)
    .flat()
    .flatMap((name) => {
      const project = projectByName.get(name);
      return project ? [project.root] : [];
    });
  /** Private workspace libraries bundled into some artifact; none may ever be declared. */
  const bundledLibraryNames = new Set(
    publishable(resolved).flatMap((project) => bundledLibraries(resolved, project.name)),
  );

  const requested = process.argv.slice(2);
  // The runtime README quick start imports these plugins, so a subset that packs the runtime must
  // pack them and everything they publishably depend on, or the install 404s against the registry.
  const quickStartDirectories = requested.includes('packages/runtime')
    ? publishableClosure(resolved, ['esbuild', 'replicad']).flatMap((name) => {
        const root = projectByName.get(name)?.root;
        return root === undefined || requested.includes(root) ? [] : [root];
      })
    : [];
  const packageDirectories = requested.length > 0 ? [...requested, ...quickStartDirectories] : releaseTrainDirectories;
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'tau-npm-local-'));
  const artifactRoot = join(temporaryRoot, 'artifact');
  const appRoot = join(temporaryRoot, 'app');
  let passed = false;

  mkdirSync(artifactRoot);
  mkdirSync(appRoot);
  try {
    console.log(`Node: ${process.version}`);
    console.log(`npm: ${run('npm', ['--version'], appRoot).trim()}`);
    console.log(`Platform: ${process.platform}/${process.arch}`);

    const tarballs: string[] = [];
    for (const packageDirectory of packageDirectories) {
      const packageRoot = resolve(repositoryRoot, packageDirectory);
      const destination = join(artifactRoot, basename(packageDirectory));
      mkdirSync(destination);
      // `prepack` hooks write to stdout, so the tarball is identified by the (empty, per-package)
      // destination directory rather than by parsing `pnpm pack --json`.
      run('pnpm', ['pack', '--pack-destination', destination], packageRoot);
      const produced = readdirSync(destination).filter((filename) => filename.endsWith('.tgz'));
      invariant(produced.length === 1, `pnpm pack must create exactly one TGZ for ${packageDirectory}.`);
      const tarball = resolve(destination, produced[0]!);
      const tarballBytes = statSync(tarball).size;
      invariant(tarballBytes > 0, `${packageDirectory} TGZ is empty.`);
      console.log(`TGZ ${basename(tarball)}: ${tarballBytes} bytes (${(tarballBytes / 1_048_576).toFixed(3)} MiB)`);
      tarballs.push(tarball);
    }

    // The app declares zod itself, the way a consumer satisfying the plugin peer
    // does; `assertSingleZodInstance` then proves npm did not fork it.
    writeFileSync(
      join(appRoot, 'package.json'),
      JSON.stringify({ private: true, type: 'module', dependencies: { zod: '^4.0.0' } }, undefined, 2),
    );
    // One install for every tarball: npm resolves the sibling `@taucad/*` and `geospec`
    // specifiers against the local files instead of their stale registry copies.
    run('npm', ['install', '--no-save', '--no-audit', '--no-fund', ...tarballs], appRoot);

    const dependencyTree = JSON.parse(run('npm', ['ls', '--json', '--depth=0'], appRoot)) as {
      dependencies?: Record<string, { version?: string; resolved?: string }>;
    };

    assertSingleZodInstance(appRoot);

    const specifiers: string[] = [];
    const instantiations: Record<string, string> = {};
    const failureContext = new Map<string, readonly string[]>();
    let assetUrls = 0;
    for (const packageDirectory of packageDirectories) {
      const sourceManifest = JSON.parse(
        readFileSync(resolve(repositoryRoot, packageDirectory, 'package.json'), 'utf8'),
      ) as Manifest;
      const installedRoot = join(appRoot, 'node_modules', sourceManifest.name);
      const installed = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8')) as Manifest;

      const violations = manifestViolations(installed, bundledLibraryNames);
      invariant(violations.length === 0, violations.join('\n'));

      for (const required of requiredArtifactPaths(installed)) {
        invariant(
          existsSync(join(installedRoot, required)),
          `${installed.name} ships a manifest path that the installed tree lacks: ${required}`,
        );
      }

      assetUrls += assertAssetUrlsResolve(installedRoot, installed.name);

      const resolvedFrom = dependencyTree.dependencies?.[installed.name];
      invariant(
        resolvedFrom?.version === installed.version && resolvedFrom.resolved?.startsWith('file:') === true,
        `${installed.name} did not resolve from its local TGZ: ${JSON.stringify(resolvedFrom)}`,
      );

      const peerDependencies = Object.keys(installed.peerDependencies ?? {});
      for (const specifier of importableSpecifiers(installed)) {
        specifiers.push(specifier);
        failureContext.set(specifier, peerDependencies);
      }
      const probe = instantiationProbes[installed.name];
      if (probe !== undefined) {
        const file = `./instantiate-${installed.name.replaceAll(/\W/gu, '-')}.mjs`;
        writeFileSync(join(appRoot, file), probe);
        instantiations[installed.name] = file;
        failureContext.set(`${installed.name} (instantiate)`, peerDependencies);
      }
    }
    console.log(`npm install: ${packageDirectories.length} TGZ resolved from disk, no registry copies.`);
    console.log(`Asset URLs: ${String(assetUrls)} relative or exported package reference(s) resolve after install.`);

    writeFileSync(join(appRoot, 'probe-plan.json'), JSON.stringify({ specifiers, instantiations }));
    writeFileSync(join(appRoot, 'probe.mjs'), probeSource);
    const failures = JSON.parse(run(process.execPath, ['probe.mjs'], appRoot)) as ImportFailure[];
    const unexpected = failures.filter(
      (failure) => !isToleratedImportFailure(failure, failureContext.get(failure.specifier) ?? []),
    );
    for (const failure of failures.filter((failure) => !unexpected.includes(failure))) {
      console.log(`tolerated: ${failure.specifier} — ${failure.message}`);
    }
    invariant(
      unexpected.length === 0,
      `Published entry points failed to load:\n${unexpected
        .map((failure) => `- ${failure.specifier}: ${failure.code ?? 'no code'} — ${failure.message}`)
        .join('\n')}`,
    );
    console.log(
      `Imported ${String(specifiers.length)} published subpaths and instantiated ${String(Object.keys(instantiations).length)} native payload(s).`,
    );

    const runtimeRoot = join(appRoot, 'node_modules/@taucad/runtime');
    if (existsSync(runtimeRoot)) {
      runRuntimeQuickStart(appRoot, runtimeRoot);
    }
    console.log('npm-local TGZ install and published-surface smoke passed.');
    passed = true;
  } finally {
    if (passed) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    } else {
      console.error(`Temporary app retained for diagnosis: ${appRoot}`);
    }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error('npm-local pack-install smoke failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
