/**
 * Validate that every publishable package's emitted dependency imports resolve
 * from npm, including subpaths, named exports, and one private-transitive
 * workspace hop.
 *
 * Usage: node scripts/src/check-registry-dependencies.ts [manifest-path…]
 */
import { execFile } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import ts from 'typescript';
import { publishable, workspace } from '@taucad/nx';

const execFileAsync = promisify(execFile);
type Dependencies = Record<string, string>;

export type ArtifactImportRequirement = {
  readonly dependency: string;
  readonly specifier: string;
  readonly subpath: string;
  readonly names: readonly string[];
};

type WorkspaceManifest = {
  readonly dependencies?: Dependencies;
  readonly optionalDependencies?: Dependencies;
  readonly private?: boolean;
  readonly version?: string;
};

type RegistryPackageSurface = {
  readonly subpaths: Readonly<Record<string, readonly string[]>>;
};

type RegistryInspection = (
  specifier: string,
  requirements: readonly ArtifactImportRequirement[],
) => Promise<RegistryPackageSurface>;

export const findUnavailableDependencies = async (
  dependencies: Dependencies,
  exists: (specifier: string) => Promise<boolean>,
): Promise<string[]> => {
  const checks = Object.entries(dependencies)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(async ([name, range]) => {
      const specifier = range.startsWith('npm:') ? range.slice(4) : `${name}@${range}`;
      return (await exists(specifier)) ? undefined : specifier;
    });
  const results = await Promise.all(checks);
  return results.filter((specifier): specifier is string => specifier !== undefined);
};

const registrySpecifier = (name: string, range: string): string =>
  range.startsWith('npm:') ? range.slice(4) : `${name}@${range}`;

const dependencyForSpecifier = (specifier: string, dependencyNames: readonly string[]): string | undefined =>
  dependencyNames.find((name) => specifier === name || specifier.startsWith(`${name}/`));

export const collectArtifactImportRequirements = (
  distributionDirectory: string,
  dependencyNames: readonly string[],
): ArtifactImportRequirement[] => {
  const requirements = new Map<string, { dependency: string; subpath: string; names: Set<string> }>();
  const sortedDependencyNames = [...dependencyNames].sort((left, right) => right.length - left.length);

  const add = (specifier: string, names: readonly string[]): void => {
    const dependency = dependencyForSpecifier(specifier, sortedDependencyNames);
    if (!dependency) {
      return;
    }
    const current = requirements.get(specifier) ?? {
      dependency,
      subpath: specifier === dependency ? '.' : `.${specifier.slice(dependency.length)}`,
      names: new Set<string>(),
    };
    for (const name of names) {
      current.names.add(name);
    }
    requirements.set(specifier, current);
  };

  for (const path of globSync(['**/*.mjs', '**/*.js'], { cwd: distributionDirectory })) {
    const source = ts.createSourceFile(
      path,
      readFileSync(join(distributionDirectory, path), 'utf8'),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.JS,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const names: string[] = [];
        if (node.importClause?.name) {
          names.push('default');
        }
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          names.push(...bindings.elements.map((element) => (element.propertyName ?? element.name).text));
        }
        add(node.moduleSpecifier.text, names);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const names =
          node.exportClause && ts.isNamedExports(node.exportClause)
            ? node.exportClause.elements.map((element) => (element.propertyName ?? element.name).text)
            : [];
        add(node.moduleSpecifier.text, names);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1
      ) {
        const argument = node.arguments[0];
        if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
          add(argument.text, []);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return [...requirements.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([specifier, requirement]) => ({
      dependency: requirement.dependency,
      specifier,
      subpath: requirement.subpath,
      names: [...requirement.names].sort(),
    }));
};

export const findRegistryDependencyIssues = async (options: {
  readonly dependencies: Dependencies;
  readonly requirements: readonly ArtifactImportRequirement[];
  readonly workspaceManifests: ReadonlyMap<string, WorkspaceManifest>;
  readonly exists: (specifier: string) => Promise<boolean>;
  readonly inspect: RegistryInspection;
}): Promise<string[]> => {
  const { dependencies, requirements, workspaceManifests, exists, inspect } = options;
  const issues = new Set<string>();
  const availability = new Map<string, boolean>();

  /**
   * A non-private workspace sibling pinned at its own workspace version is
   * published earlier in this same fixed-version run (publish order is asserted
   * by `check-release-projects`), so npm not having it yet is the normal state
   * rather than a blocker — and there is no registry copy to inspect. The real
   * tarballs are exercised by `check-pack-install`. Private siblings and
   * mismatched versions stay blockers.
   */
  const providedByThisRelease = new Set(
    Object.entries(dependencies)
      .filter(([name, range]) => {
        const manifest = workspaceManifests.get(name);
        return manifest !== undefined && manifest.private !== true && manifest.version === range;
      })
      .map(([name]) => name),
  );

  await Promise.all(
    Object.entries(dependencies).map(async ([name, range]) => {
      if (providedByThisRelease.has(name)) {
        return;
      }
      const specifier = registrySpecifier(name, range);
      const available = await exists(specifier);
      availability.set(name, available);
      if (!available) {
        issues.add(specifier);
      }
    }),
  );

  const requirementsByDependency = Map.groupBy(requirements, ({ dependency }) => dependency);
  await Promise.all(
    [...requirementsByDependency].map(async ([name, dependencyRequirements]) => {
      if (!availability.get(name)) {
        return;
      }
      const specifier = registrySpecifier(name, dependencies[name]!);
      const surface = await inspect(specifier, dependencyRequirements);
      for (const requirement of dependencyRequirements) {
        const names = surface.subpaths[requirement.subpath];
        if (!names) {
          issues.add(`${specifier}: ${requirement.specifier} is not exported`);
          continue;
        }
        const exportedNames = new Set(names);
        for (const name of requirement.names) {
          if (!exportedNames.has(name)) {
            issues.add(`${specifier}: ${requirement.specifier} is missing named export ${name}`);
          }
        }
      }
    }),
  );

  for (const [name, range] of Object.entries(dependencies)) {
    const manifest = workspaceManifests.get(name);
    if (!manifest) {
      continue;
    }
    const transitiveDependencies = { ...manifest.dependencies, ...manifest.optionalDependencies };
    for (const [transitiveName, transitiveRange] of Object.entries(transitiveDependencies)) {
      const transitiveManifest = workspaceManifests.get(transitiveName);
      if (!transitiveManifest?.private) {
        continue;
      }
      const transitiveVersion = transitiveRange.startsWith('workspace:')
        ? (transitiveManifest.version ?? transitiveRange)
        : transitiveRange;
      issues.add(
        `${registrySpecifier(name, range)}: dependency ${transitiveName}@${transitiveVersion} is a private workspace package`,
      );
    }
  }

  return [...issues].sort();
};

const findWorkspaceRoot = (start: string): string => {
  let directory = resolve(start);
  while (dirname(directory) !== directory) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) {
      return directory;
    }
    directory = dirname(directory);
  }
  throw new Error(`No pnpm-workspace.yaml found above ${start}`);
};

const readWorkspaceConfiguration = async (
  workspaceRoot: string,
): Promise<{ catalog: Dependencies; overrides: Dependencies }> => {
  const source = await readFile(join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8');
  const workspace = load(source) as { catalog?: Dependencies; overrides?: Dependencies };
  return { catalog: workspace.catalog ?? {}, overrides: workspace.overrides ?? {} };
};

const readWorkspaceManifests = async (workspaceRoot: string): Promise<Map<string, WorkspaceManifest>> => {
  const source = await readFile(join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8');
  const workspace = load(source) as { packages?: string[] };
  const paths = globSync(
    (workspace.packages ?? []).map((pattern) => `${pattern}/package.json`),
    { cwd: workspaceRoot },
  );
  const manifests = await Promise.all(
    paths.map(async (path) => {
      const manifest = JSON.parse(await readFile(join(workspaceRoot, path), 'utf8')) as WorkspaceManifest & {
        name?: string;
      };
      return [manifest.name, manifest] as const;
    }),
  );
  return new Map(manifests.filter((entry): entry is [string, WorkspaceManifest] => entry[0] !== undefined));
};

const resolveRanges = (
  dependencies: Dependencies,
  catalog: Dependencies,
  workspaceVersions: Dependencies,
): Dependencies =>
  Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (range === 'catalog:') {
        const catalogRange = catalog[name];
        if (!catalogRange) {
          throw new Error(`Missing catalog entry: ${name}`);
        }
        return [name, catalogRange];
      }
      if (range.startsWith('catalog:')) {
        throw new Error(`Named catalogs are unsupported by this gate: ${name} (${range})`);
      }
      if (range.startsWith('workspace:')) {
        const version = workspaceVersions[name];
        if (!version) {
          throw new Error(`Missing workspace package version: ${name}`);
        }
        return [name, version];
      }
      return [name, range];
    }),
  );

/** A range npm can serve: not a checkout, a tarball path, or a workspace link. `npm:` aliases are registry ranges. */
const isRegistryRange = (range: string): boolean => {
  const aliased = range.startsWith('npm:') ? range.slice(4) : range;
  const version = aliased.slice(aliased.lastIndexOf('@') + 1);
  return !['file:', 'link:', 'portal:', 'git+', 'http:', 'https:'].some(
    (prefix) => aliased.startsWith(prefix) || version.startsWith(prefix),
  );
};

/**
 * `pnpm-workspace.yaml` overrides rewrite every consumer's resolution, including
 * a published package's transitive tree, so a non-registry override is exactly
 * as unpublishable as a non-registry dependency — and no manifest scan sees it.
 * Named catalogs are unsupported here for the same reason as in `resolveRanges`.
 */
export const findOverrideIssues = (overrides: Dependencies, catalog: Dependencies): string[] =>
  Object.entries(overrides)
    .flatMap(([name, range]) => {
      const resolved = range.startsWith('catalog:') ? (range === 'catalog:' ? catalog[name] : undefined) : range;
      if (resolved === undefined) {
        return [`${name}: ${range} does not resolve through the workspace catalog`];
      }
      return isRegistryRange(resolved) ? [] : [`${name}: ${resolved} is not a registry specifier`];
    })
    .sort();

const registryHas = async (specifier: string): Promise<boolean> => {
  if (!isRegistryRange(specifier)) {
    return false;
  }
  try {
    await execFileAsync('npm', ['view', specifier, 'version', '--json'], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
};

const targetCandidates = (path: string): string[] => [
  path,
  `${path}.mjs`,
  `${path}.js`,
  `${path}.cjs`,
  join(path, 'index.mjs'),
  join(path, 'index.js'),
  join(path, 'index.cjs'),
];

const resolveTargetValue = (value: unknown, wildcard = ''): string[] => {
  if (typeof value === 'string') {
    return [value.replaceAll('*', wildcard)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => resolveTargetValue(item, wildcard));
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const conditions = value as Record<string, unknown>;
  return ['import', 'node', 'browser', 'default']
    .filter((condition) => condition in conditions)
    .flatMap((condition) => resolveTargetValue(conditions[condition], wildcard));
};

const resolvePackageTarget = (
  packageDirectory: string,
  manifest: { exports?: unknown; main?: string; module?: string },
  subpath: string,
): string | undefined => {
  let targets: string[] = [];
  const { exports } = manifest;
  if (exports === undefined) {
    targets = subpath === '.' ? [manifest.module ?? manifest.main ?? './index.js'] : [subpath];
  } else if (typeof exports === 'object' && exports !== null && !Array.isArray(exports)) {
    const entries = Object.entries(exports as Record<string, unknown>);
    if (entries.some(([key]) => key.startsWith('.'))) {
      const exact = entries.find(([key]) => key === subpath);
      if (exact) {
        targets = resolveTargetValue(exact[1]);
      } else {
        const wildcard = entries.find(([key]) => {
          const [prefix = '', suffix = ''] = key.split('*');
          return key.includes('*') && subpath.startsWith(prefix) && subpath.endsWith(suffix);
        });
        if (wildcard) {
          const [prefix = '', suffix = ''] = wildcard[0].split('*');
          targets = resolveTargetValue(wildcard[1], subpath.slice(prefix.length, subpath.length - suffix.length));
        }
      }
    } else if (subpath === '.') {
      targets = resolveTargetValue(exports);
    }
  } else if (subpath === '.') {
    targets = resolveTargetValue(exports);
  }

  for (const target of targets) {
    const absoluteTarget = resolve(packageDirectory, target);
    const found = targetCandidates(absoluteTarget).find((candidate) => existsSync(candidate));
    if (found) {
      return found;
    }
  }
  return undefined;
};

const resolveRelativeModule = (from: string, specifier: string): string | undefined => {
  if (!specifier.startsWith('.')) {
    return undefined;
  }
  return targetCandidates(resolve(dirname(from), specifier)).find((candidate) => existsSync(candidate));
};

const collectBindingNames = (name: ts.BindingName): string[] => {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : collectBindingNames(element.name)));
};

const addExportDeclarationNames = (
  statement: ts.ExportDeclaration,
  names: Set<string>,
  context: { path: string; visited: Set<string> },
): void => {
  if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
    for (const element of statement.exportClause.elements) {
      names.add(element.name.text);
    }
    return;
  }
  if (statement.exportClause && ts.isNamespaceExport(statement.exportClause)) {
    names.add(statement.exportClause.name.text);
    return;
  }
  if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
    return;
  }
  const target = resolveRelativeModule(context.path, statement.moduleSpecifier.text);
  if (!target) {
    return;
  }
  for (const name of collectModuleExportNames(target, context.visited)) {
    names.add(name);
  }
};

const addExportedStatementNames = (statement: ts.Statement, names: Set<string>): void => {
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
    return;
  }
  if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
    names.add('default');
  }
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    names.add(statement.name.text);
    return;
  }
  if (!ts.isVariableStatement(statement)) {
    return;
  }
  for (const declaration of statement.declarationList.declarations) {
    for (const name of collectBindingNames(declaration.name)) {
      names.add(name);
    }
  }
};

const collectModuleExportNames = (path: string, visited = new Set<string>()): string[] => {
  if (visited.has(path)) {
    return [];
  }
  visited.add(path);
  const sourceText = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const names = new Set<string>();

  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) {
      names.add('default');
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      addExportDeclarationNames(statement, names, { path, visited });
      continue;
    }
    addExportedStatementNames(statement, names);
  }

  for (const match of sourceText.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gu)) {
    names.add(match[1]!);
  }
  return [...names].sort();
};

const inspectRegistryPackage: RegistryInspection = async (specifier, requirements) => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-registry-package-'));
  try {
    const { stdout } = await execFileAsync('npm', ['pack', specifier, '--json', '--pack-destination', directory], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const result = JSON.parse(stdout) as Array<{ filename: string }> | { filename: string };
    const filename = (Array.isArray(result) ? result[0] : result)?.filename;
    if (!filename) {
      throw new Error(`npm pack returned no filename for ${specifier}`);
    }
    await execFileAsync('tar', ['-xzf', resolve(directory, filename), '-C', directory]);
    const packageDirectory = join(directory, 'package');
    const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8')) as {
      exports?: unknown;
      main?: string;
      module?: string;
      type?: string;
    };
    const subpaths: Record<string, readonly string[]> = {};
    for (const subpath of new Set(requirements.map((requirement) => requirement.subpath))) {
      const target = resolvePackageTarget(packageDirectory, manifest, subpath);
      if (target) {
        const names = collectModuleExportNames(target);
        const commonJs = target.endsWith('.cjs') || (!target.endsWith('.mjs') && manifest.type !== 'module');
        subpaths[subpath] = commonJs ? [...new Set(['default', ...names])].sort() : names;
      }
    }
    return { subpaths };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

export const checkRegistryDependencies = async (manifestPath: string): Promise<string[]> => {
  const workspaceRoot = findWorkspaceRoot(dirname(manifestPath));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    dependencies?: Dependencies;
    optionalDependencies?: Dependencies;
  };
  const workspaceManifests = await readWorkspaceManifests(workspaceRoot);
  const workspaceVersions = Object.fromEntries(
    [...workspaceManifests].flatMap(([name, manifest]) => (manifest.version ? [[name, manifest.version]] : [])),
  );
  const { catalog } = await readWorkspaceConfiguration(workspaceRoot);
  const dependencies = resolveRanges(
    { ...manifest.dependencies, ...manifest.optionalDependencies },
    catalog,
    workspaceVersions,
  );
  return findRegistryDependencyIssues({
    dependencies,
    // An unbuilt package still has its declared dependencies checked; publish.yml
    // builds the release train before it runs this gate.
    requirements: existsSync(join(dirname(manifestPath), 'dist'))
      ? collectArtifactImportRequirements(join(dirname(manifestPath), 'dist'), Object.keys(dependencies))
      : [],
    workspaceManifests,
    exists: registryHas,
    inspect: inspectRegistryPackage,
  });
};

const main = async (): Promise<void> => {
  const repositoryRoot = resolve(import.meta.dirname, '../..');
  const manifestPaths =
    process.argv.length > 2
      ? process.argv.slice(2).map((path) => resolve(path))
      : publishable(await workspace({ fresh: true })).map((project) =>
          join(repositoryRoot, project.root, 'package.json'),
        );
  let blockers = 0;

  const { catalog, overrides } = await readWorkspaceConfiguration(repositoryRoot);
  const overrideIssues = findOverrideIssues(overrides, catalog);
  if (overrideIssues.length === 0) {
    console.log(
      `pnpm-workspace.yaml overrides: all ${String(Object.keys(overrides).length)} override(s) resolve to registry specifiers.`,
    );
  } else {
    blockers += overrideIssues.length;
    console.error(`pnpm-workspace.yaml overrides: registry blockers (${String(overrideIssues.length)}):`);
    for (const issue of overrideIssues) {
      console.error(`- ${issue}`);
    }
  }

  for (const manifestPath of manifestPaths) {
    // Serial: each manifest installs into its own temporary registry sandbox.
    // eslint-disable-next-line no-await-in-loop -- One npm sandbox at a time.
    const issues = await checkRegistryDependencies(manifestPath);
    const label = relative(process.cwd(), manifestPath);
    if (issues.length === 0) {
      console.log(`${label}: every dependency resolves from the public npm registry.`);
      continue;
    }
    blockers += issues.length;
    console.error(`${label}: registry dependency blockers (${issues.length}):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
  }
  if (blockers > 0) {
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error('Registry dependency check failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
