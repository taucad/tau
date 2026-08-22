// oxlint-disable unicorn/no-process-exit, no-restricted-imports, import/extensions -- CLI tool shares its adjacent helper.
/**
 * Package Check Orchestrator
 *
 * Validates that a publishable package is ready for npm publication by running
 * a suite of checks: publint, attw (are-the-types-wrong), and madge (circular deps).
 *
 * Usage: tsx tools/pkgcheck.ts <projectRoot>
 */
import { execFileSync, execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  bundledArtifactIssues,
  bundledWorkspaceMirrors,
  bundleOwnershipIssues,
  copyTargetPaths,
  doubledPathSegments,
  packageMetadataIssues,
  strictConsumerCompilerOptions,
} from './pkgcheck-metadata.js';

type CheckResult = {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  details?: string[];
  /** Printed on pass as well as failure, so an allow-listed defect stays visible. */
  notes?: string[];
};

type PackageJson = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  exports?: unknown;
  files?: unknown;
  name?: string;
  peerDependencies?: Record<string, string>;
  private?: boolean;
  publishConfig?: Record<string, unknown>;
  'size-limit'?: unknown;
};

type WorkspaceProject = { name: string; directory: string; manifest: PackageJson };

const projectRoot = process.argv[2];
if (!projectRoot) {
  console.error('Usage: tsx tools/pkgcheck.ts <projectRoot>');
  process.exit(1);
}

const absoluteRoot = resolve(projectRoot);
const workspaceRoot = resolve(import.meta.dirname, '..');
const packageJsonPath = join(absoluteRoot, 'package.json');

if (!existsSync(packageJsonPath)) {
  console.error(`No package.json found at ${packageJsonPath}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson;
const packageName = packageJson.name ?? projectRoot;

console.log(`\n${packageName} package check`);
console.log('='.repeat(`${packageName} package check`.length));
console.log();

const results: CheckResult[] = [];

/** Workspace globs that can hold a bundle-able library or a publishable package. */
const workspaceParents = ['libs', 'apps/libs', 'packages', 'packages/kernels'];

function readWorkspaceProjects(): WorkspaceProject[] {
  const projects: WorkspaceProject[] = [];
  for (const parent of workspaceParents) {
    const parentDirectory = join(workspaceRoot, parent);
    if (!existsSync(parentDirectory)) {
      continue;
    }

    for (const entry of readdirSync(parentDirectory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const manifestPath = join(parentDirectory, entry.name, 'package.json');
      if (!entry.isDirectory() || !existsSync(manifestPath)) {
        continue;
      }

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageJson;
      if (manifest.name) {
        projects.push({ name: manifest.name, directory: `${parent}/${entry.name}`, manifest });
      }
    }
  }

  return projects;
}

const workspaceProjects = readWorkspaceProjects();

/** Publishable roots, discovered the way `tools/pkgcheck.plugin.ts` discovers them. */
const publishableProjects = workspaceProjects.filter(
  (project) =>
    project.manifest.private !== true &&
    (project.directory.startsWith('packages/') || project.directory.startsWith('packages/kernels/')) &&
    existsSync(join(workspaceRoot, project.directory, 'tsdown.config.ts')),
);

/** Every directory under `<projectDirectory>/dist`, relative to that `dist`. */
function distributionDirectories(projectDirectory: string): string[] {
  const distribution = join(projectDirectory, 'dist');
  const directories: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const fullPath = join(directory, entry.name);
      directories.push(relative(distribution, fullPath));
      walk(fullPath);
    }
  };

  if (existsSync(distribution)) {
    walk(distribution);
  }

  return directories;
}

/**
 * Workspace projects whose sources were inlined into a package's build output.
 * The project itself always owns its own name, so bundling a *published*
 * package is reported as the ownership conflict it is.
 */
function bundledWorkspaceProjects(project: WorkspaceProject): string[] {
  const others = workspaceProjects.filter((candidate) => candidate.directory !== project.directory);
  return [
    project.name,
    ...bundledWorkspaceMirrors(distributionDirectories(join(workspaceRoot, project.directory)), others),
  ];
}

async function runPublint(): Promise<CheckResult> {
  try {
    const { publint } = await import('publint');
    const { formatMessage } = await import('publint/utils');

    const { messages, pkg } = await publint({
      pkgDir: absoluteRoot,
      level: 'warning',
    });

    if (messages.length === 0) {
      return {
        name: 'publint',
        status: 'pass',
        details: ['package structure valid'],
      };
    }

    const formatted = messages
      .map((message) => formatMessage(message, pkg))
      .filter((m): m is string => m !== undefined);
    return {
      name: 'publint',
      status: 'fail',
      details: [`${String(messages.length)} issue(s) found`, ...formatted],
    };
  } catch (error) {
    return {
      name: 'publint',
      status: 'fail',
      details: [`error running publint: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Apply publishConfig overrides to a package.json object, the same way
 * `npm publish` / `pnpm publish` does at publish time.
 */
function applyPublishConfig(package_: PackageJson): PackageJson {
  const result = { ...package_ };
  const { publishConfig } = package_;
  if (!publishConfig) {
    return result;
  }

  for (const [key, value] of Object.entries(publishConfig)) {
    if (key === 'access' || key === 'registry' || key === 'tag') {
      continue;
    }

    result[key] = value;
  }

  delete result.publishConfig;
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateEsmOnlyPackageMetadata(): CheckResult {
  const publishPackage = applyPublishConfig(packageJson);
  const issues: string[] = [];

  function visit(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        visit(item, `${path}[${String(index)}]`);
      }
      return;
    }

    if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        const nextPath = `${path}.${key}`;
        if (key === 'require') {
          issues.push(`${nextPath}: CommonJS export conditions are not allowed`);
        }
        if (path === '$' && key === 'module') {
          issues.push(`${nextPath}: legacy package.json module field is not allowed`);
        }
        visit(child, nextPath);
      }
      return;
    }

    if (typeof value !== 'string') {
      return;
    }

    if (value.includes('dist/cjs')) {
      issues.push(`${path}: CJS dist path is not allowed (${value})`);
    }
    if (value.includes('.cjs')) {
      issues.push(`${path}: .cjs output is not allowed (${value})`);
    }
    if (value.includes('.d.cts')) {
      issues.push(`${path}: .d.cts declarations are not allowed (${value})`);
    }
  }

  visit(publishPackage, '$');

  if (issues.length === 0) {
    return {
      name: 'tau-esm-metadata',
      status: 'pass',
      details: ['published metadata is ESM-only'],
    };
  }

  return {
    name: 'tau-esm-metadata',
    status: 'fail',
    details: [`${String(issues.length)} CJS metadata issue(s) found`, ...issues],
  };
}

function validateFlatDistributionLayout(): CheckResult {
  const publishPackage = applyPublishConfig(packageJson);
  const issues: string[] = [];

  function visit(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        visit(item, `${path}[${String(index)}]`);
      }
      return;
    }

    if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, `${path}.${key}`);
      }
      return;
    }

    if (typeof value === 'string' && value.includes('dist/esm')) {
      issues.push(`${path}: redundant dist/esm path is not allowed (${value}); use dist/...`);
    }
  }

  visit(publishPackage, '$');

  const tsdownConfigPath = join(absoluteRoot, 'tsdown.config.ts');
  if (existsSync(tsdownConfigPath)) {
    const source = readFileSync(tsdownConfigPath, 'utf8');
    if (source.includes('dist/esm')) {
      issues.push('tsdown.config.ts: redundant dist/esm output path is not allowed; use outDir: "dist"');
    }
  }

  if (issues.length === 0) {
    return {
      name: 'tau-flat-dist-layout',
      status: 'pass',
      details: ['published metadata and build config use flat dist output'],
    };
  }

  return {
    name: 'tau-flat-dist-layout',
    status: 'fail',
    details: [`${String(issues.length)} flat dist layout issue(s) found`, ...issues],
  };
}

function validatePackageMetadata(): CheckResult {
  const issues = packageMetadataIssues(packageJson, (path) => existsSync(join(absoluteRoot, path)));
  return issues.length === 0
    ? { name: 'tau-package-metadata', status: 'pass', details: ['exports and packed files match reality'] }
    : {
        name: 'tau-package-metadata',
        status: 'fail',
        details: [`${String(issues.length)} package metadata issue(s) found`, ...issues],
      };
}

function validateBundleOwnership(): CheckResult {
  const unbuilt = publishableProjects.filter((project) => !existsSync(join(workspaceRoot, project.directory, 'dist')));
  const roots = publishableProjects
    .filter((project) => !unbuilt.includes(project))
    .map((project) => ({ owner: project.name, bundled: bundledWorkspaceProjects(project) }));

  const issues = bundleOwnershipIssues(roots);
  const notes =
    unbuilt.length === 0
      ? undefined
      : [`ownership unverified for unbuilt package(s): ${unbuilt.map((project) => project.name).join(', ')}`];

  return issues.length === 0
    ? { name: 'tau-bundle-ownership', status: 'pass', details: ['bundled workspace modules have one owner'], notes }
    : {
        name: 'tau-bundle-ownership',
        status: 'fail',
        details: [`${String(issues.length)} bundle ownership conflict(s) found`, ...issues],
        notes,
      };
}

/**
 * Workspace packages inlined into this artifact: whatever the build actually
 * mirrored, unioned with whatever the config declares it bundles. The config
 * half keeps the runtime's explicit contract enforced even if a mirror moves.
 */
async function bundledWorkspacePackages(): Promise<string[]> {
  const project = publishableProjects.find((candidate) => candidate.name === packageName);
  const mirrored = project ? bundledWorkspaceProjects(project).filter((name) => name !== packageName) : [];

  const configPath = join(absoluteRoot, 'tsdown.config.ts');
  const config = existsSync(configPath)
    ? ((await import(pathToFileURL(configPath).href)) as { bundledWorkspaceDependencies?: unknown })
    : {};
  const declared = Array.isArray(config.bundledWorkspaceDependencies)
    ? config.bundledWorkspaceDependencies
        .filter((value): value is string => typeof value === 'string')
        .map((name) => `@taucad/${name}`)
    : [];

  return [...new Set([...mirrored, ...declared])].sort();
}

async function validateBundledArtifact(): Promise<CheckResult> {
  const bundledPackages = await bundledWorkspacePackages();
  const files = walkDirectory(join(absoluteRoot, 'dist'))
    .filter((path) => /(?:\.[cm]?js|\.d\.[cm]?ts)$/u.test(path))
    .map((path) => ({ path: relative(absoluteRoot, path), source: readFileSync(path, 'utf8') }));
  const issues = bundledArtifactIssues(packageJson.dependencies ?? {}, files, bundledPackages);
  return issues.length === 0
    ? {
        name: 'tau-bundled-artifact',
        status: 'pass',
        details: ['bundled workspace packages are absent from production dependencies and emitted specifiers'],
      }
    : {
        name: 'tau-bundled-artifact',
        status: 'fail',
        details: [`${String(issues.length)} bundled artifact issue(s) found`, ...issues],
      };
}

/**
 * Every tsdown `copy` target landed, and nothing was emitted at a doubled path.
 * `copy` may be absent, an entry, an array, or a function of the resolved config.
 */
async function validateDistributionAssets(): Promise<CheckResult> {
  const configPath = join(absoluteRoot, 'tsdown.config.ts');
  const configModule = existsSync(configPath)
    ? ((await import(pathToFileURL(configPath).href)) as { default?: unknown })
    : {};
  const configs = (Array.isArray(configModule.default) ? configModule.default : [configModule.default]).filter(
    (value): value is Record<string, unknown> => isRecord(value),
  );

  const issues: string[] = [];
  const targets: string[] = [];
  for (const config of configs) {
    const outDirectory = typeof config['outDir'] === 'string' ? config['outDir'] : 'dist';
    const copy =
      typeof config['copy'] === 'function'
        ? // oxlint-disable-next-line no-await-in-loop -- Bounded config list; sequential keeps target order stable.
          await (config['copy'] as (options: { outDir: string }) => unknown)({ outDir: outDirectory })
        : config['copy'];
    if (copy === undefined) {
      continue;
    }
    targets.push(...copyTargetPaths(Array.isArray(copy) ? copy : [copy], outDirectory));
  }

  for (const target of targets) {
    const fullPath = join(absoluteRoot, target);
    if (!existsSync(fullPath)) {
      issues.push(`copy target is missing from the build output: ${target}`);
      continue;
    }
    if (statSync(fullPath).isDirectory() && readdirSync(fullPath).length === 0) {
      issues.push(`copy target is an empty directory: ${target}`);
    }
  }

  for (const doubled of doubledPathSegments(
    walkDirectory(join(absoluteRoot, 'dist')).map((path) => relative(absoluteRoot, path)),
  )) {
    issues.push(`emitted path repeats its parent segment: ${doubled}`);
  }

  return issues.length === 0
    ? {
        name: 'tau-distribution-assets',
        status: 'pass',
        details: [`${String(targets.length)} copy target(s) present, no doubled path segments`],
      }
    : {
        name: 'tau-distribution-assets',
        status: 'fail',
        details: [`${String(issues.length)} distribution asset issue(s) found`, ...issues],
      };
}

/** `react` -> `@types/react`, `@scope/name` -> `@types/scope__name`. */
function typesPackageName(dependency: string): string {
  return `@types/${dependency.startsWith('@') ? dependency.slice(1).replace('/', '__') : dependency}`;
}

function linkInstalledPackage(from: string, nodeModules: string, dependency: string): boolean {
  const source = join(from, 'node_modules', dependency);
  const fallback = join(workspaceRoot, 'node_modules', dependency);
  const resolved = existsSync(source) ? source : existsSync(fallback) ? fallback : undefined;
  if (!resolved) {
    return false;
  }

  const destination = join(nodeModules, dependency);
  if (existsSync(destination)) {
    return true;
  }
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(resolved, destination, 'junction');
  return true;
}

/**
 * Install one workspace package into a throwaway consumer the way npm would:
 * its `publishConfig`-applied manifest plus its built `dist`, never its source
 * manifest (whose `exports` point at `.ts`). Workspace dependencies are staged
 * the same way, recursively; everything else is symlinked from the real install.
 */
function stagePublishedPackage(projectDirectory: string, nodeModules: string, staged: Set<string>): string[] {
  const manifest = JSON.parse(readFileSync(join(projectDirectory, 'package.json'), 'utf8')) as PackageJson;
  const name = manifest.name ?? projectDirectory;
  if (staged.has(name)) {
    return [];
  }
  staged.add(name);

  const failures: string[] = [];
  const destination = join(nodeModules, name);
  mkdirSync(destination, { recursive: true });
  const publishManifest = applyPublishConfig(manifest);
  delete publishManifest.scripts;
  writeFileSync(join(destination, 'package.json'), JSON.stringify(publishManifest, undefined, 2));

  const distribution = join(projectDirectory, 'dist');
  if (existsSync(distribution)) {
    cpSync(distribution, join(destination, 'dist'), { recursive: true });
  } else {
    failures.push(`${name}: dist/ is missing; build it before running pkgcheck`);
  }

  for (const [dependency, range] of [
    ...Object.entries(manifest.dependencies ?? {}),
    ...Object.entries(manifest.peerDependencies ?? {}),
  ]) {
    const workspaceProject = range.startsWith('workspace:')
      ? workspaceProjects.find((project) => project.name === dependency)
      : undefined;
    if (workspaceProject) {
      failures.push(...stagePublishedPackage(join(workspaceRoot, workspaceProject.directory), nodeModules, staged));
      continue;
    }

    if (!linkInstalledPackage(projectDirectory, nodeModules, dependency)) {
      // A peer dependency the workspace never installs is a legitimate absence;
      // the resulting TS2307 (if any) is the real signal.
      if (dependency in (manifest.dependencies ?? {})) {
        failures.push(`installed dependency is missing: ${dependency}`);
      }
      continue;
    }
    linkInstalledPackage(projectDirectory, nodeModules, typesPackageName(dependency));
  }

  return failures;
}

/**
 * The runtime's `./nextjs`, `./vite`, `./electron/*` and `./testing` surfaces are
 * typed against peer frameworks whose *own* shipped declarations do not survive
 * `skipLibCheck: false` (next@16.3.0 alone emits 12 errors of its own under both
 * resolution modes). Those are the peer's defects, not this package's, and a
 * consumer only meets them by opting into that framework. The runtime is probed
 * through the curated entry points below plus its whole kernels surface instead.
 */
const runtimeProbedSubpaths = /^\.\/kernels(\/|$)/u;

/** Every published subpath, as an importable specifier. Wildcards cannot be probed. */
function publishedSpecifiers(): string[] {
  const { exports } = applyPublishConfig(packageJson);
  if (!isRecord(exports)) {
    return [];
  }

  return Object.keys(exports)
    .filter((subpath) => subpath.startsWith('.') && !subpath.includes('*') && subpath !== './package.json')
    .filter((subpath) => packageName !== '@taucad/runtime' || runtimeProbedSubpaths.test(subpath))
    .map((subpath) => `${packageName}${subpath.slice(1)}`);
}

/** Named imports that pin the runtime's headline entry points by name, not just by module. */
const runtimeConsumerProbe = `import { createNodeClient } from '@taucad/runtime/node';
import { presets } from '@taucad/runtime/presets';
import { runtimeContentSchema, type RuntimeContentInput } from '@taucad/runtime/types';
import { defineRuntimeTransport, type RuntimeTransportClient } from '@taucad/runtime/transport';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { parameterFileResolver } from '@taucad/runtime/middleware/parameter-file-resolver';
import { parameterCache } from '@taucad/runtime/middleware/parameter-cache';
import { geometryCache } from '@taucad/runtime/middleware/geometry-cache';
import { gltfCoordinateTransform } from '@taucad/runtime/middleware/gltf-coordinate-transform';
import { gltfEdgeDetection } from '@taucad/runtime/middleware/gltf-edge-detection';

type ConsumerTypes = [RuntimeContentInput, RuntimeTransportClient];
declare const consumerTypes: ConsumerTypes;
void [
  createNodeClient,
  presets,
  runtimeContentSchema,
  defineRuntimeTransport,
  fromNodeFs,
  parameterFileResolver,
  parameterCache,
  geometryCache,
  gltfCoordinateTransform,
  gltfEdgeDetection,
  consumerTypes,
];
`;

/**
 * A namespace import per published subpath: enough for `tsc` to load and fully
 * check every shipped `.d.mts` under both resolution modes.
 */
function consumerProbeSource(specifiers: readonly string[]): string {
  const imports = specifiers.map((specifier, index) => `import * as probe${String(index)} from '${specifier}';`);
  const bindings = specifiers.map((_, index) => `probe${String(index)}`);
  const prologue = packageName === '@taucad/runtime' ? runtimeConsumerProbe : '';
  return `${prologue}${imports.join('\n')}\nvoid [${bindings.join(', ')}];\n`;
}

function validateStrictConsumerTypes(): CheckResult {
  const specifiers = publishedSpecifiers();
  if (specifiers.length === 0) {
    return { name: 'tau-strict-consumer-types', status: 'skip', details: ['no published export subpaths'] };
  }

  const pkgcheckRoot = join(workspaceRoot, 'node_modules', '.cache', 'tau-pkgcheck');
  mkdirSync(pkgcheckRoot, { recursive: true });
  const directory = mkdtempSync(join(pkgcheckRoot, 'consumer-'));
  const failures: string[] = [];

  try {
    const nodeModules = join(directory, 'node_modules');
    failures.push(...stagePublishedPackage(absoluteRoot, nodeModules, new Set()));
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    writeFileSync(join(directory, 'probe.ts'), consumerProbeSource(specifiers));

    for (const resolution of ['bundler', 'nodenext'] as const) {
      const configPath = join(directory, `tsconfig.${resolution}.json`);
      writeFileSync(
        configPath,
        JSON.stringify(
          { compilerOptions: strictConsumerCompilerOptions(resolution), include: ['probe.ts'] },
          undefined,
          2,
        ),
      );
      try {
        execFileSync(join(workspaceRoot, 'node_modules/.bin/tsc'), ['--project', configPath, '--pretty', 'false'], {
          cwd: directory,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string };
        failures.push(`${resolution}:\n${`${execError.stdout ?? ''}${execError.stderr ?? ''}`.trim()}`);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  const summary = `${String(specifiers.length)} published subpath(s) typecheck with skipLibCheck:false under bundler and nodenext`;
  return failures.length === 0
    ? { name: 'tau-strict-consumer-types', status: 'pass', details: [summary] }
    : {
        name: 'tau-strict-consumer-types',
        status: 'fail',
        details: [`${String(failures.length)} strict consumer mode(s) failed`, ...failures],
      };
}

/**
 * Create a publish-ready staging directory with publishConfig applied,
 * then pack and run attw against the tarball.
 *
 * pnpm pack DOES apply publishConfig overrides (npm does not); attw's own
 * `--pack` shells out to npm, so publishConfig is applied here by hand.
 */
async function runAttw(): Promise<CheckResult> {
  const stagingDirectory = join(tmpdir(), `pkgcheck-attw-${Date.now()}`);

  try {
    mkdirSync(stagingDirectory, { recursive: true });

    const publishPackage = applyPublishConfig(packageJson);
    // This staging package contains already-built outputs, not the source files
    // that package lifecycle scripts may invoke.
    delete publishPackage.scripts;
    writeFileSync(join(stagingDirectory, 'package.json'), JSON.stringify(publishPackage, undefined, 2));

    const distributionSource = join(absoluteRoot, 'dist');
    if (existsSync(distributionSource)) {
      cpSync(distributionSource, join(stagingDirectory, 'dist'), { recursive: true });
    }

    const readmeSource = join(absoluteRoot, 'README.md');
    if (existsSync(readmeSource)) {
      cpSync(readmeSource, join(stagingDirectory, 'README.md'));
    }

    const attwConfigSource = join(absoluteRoot, '.attw.json');
    if (existsSync(attwConfigSource)) {
      cpSync(attwConfigSource, join(stagingDirectory, '.attw.json'));
    }

    const output = execFileSync(
      resolve('node_modules/.bin/attw'),
      ['--pack', '.', '--format', 'table', '--profile', 'esm-only'],
      {
        cwd: stagingDirectory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    return {
      name: 'attw',
      status: 'pass',
      details: ['types resolve correctly', output.trim()],
    };
  } catch (error) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    const output = (execError.stdout ?? '') + (execError.stderr ?? '');
    const lines = output.split('\n').filter((line) => line.trim().length > 0);

    return {
      name: 'attw',
      status: 'fail',
      details: ['type resolution issues found', ...lines],
    };
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

async function runMadge(): Promise<CheckResult> {
  try {
    const madgeModule = await import('madge');
    const madge = madgeModule.default;

    const tsconfigPath = existsSync(join(absoluteRoot, 'tsconfig.lib.json'))
      ? join(absoluteRoot, 'tsconfig.lib.json')
      : join(absoluteRoot, 'tsconfig.json');

    const result = await madge(join(absoluteRoot, 'src'), {
      fileExtensions: ['ts', 'tsx', 'js', 'jsx'],
      tsConfig: tsconfigPath,
      excludeRegExp: [/\.test\./, /\.spec\./, /\/testing\//],
    });

    const circular = result.circular();

    if (circular.length === 0) {
      return {
        name: 'madge',
        status: 'pass',
        details: ['no circular dependencies'],
      };
    }

    const cycles = circular.map((cycle) => cycle.join(' → '));
    return {
      name: 'madge',
      status: 'fail',
      details: [`${String(circular.length)} circular dependency chain(s) found`, ...cycles],
    };
  } catch (error) {
    return {
      name: 'madge',
      status: 'fail',
      details: [`error running madge: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function runSizeLimit(): Promise<CheckResult> {
  const hasSizeLimitConfig = packageJson['size-limit'] || existsSync(join(absoluteRoot, '.size-limit.json'));
  if (!hasSizeLimitConfig) {
    return {
      name: 'size-limit',
      status: 'skip',
      details: ['no config found in package.json or .size-limit.json'],
    };
  }

  try {
    const output = execSync('pnpm size-limit', {
      cwd: absoluteRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { name: 'size-limit', status: 'pass', details: [output.trim()] };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    const output = (execError.stdout ?? '') + (execError.stderr ?? '');
    return {
      name: 'size-limit',
      status: 'fail',
      details: ['bundle size budget exceeded', output.trim()],
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} kB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function walkDirectory(directory: string): string[] {
  const paths: string[] = [];
  if (!existsSync(directory)) {
    return paths;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...walkDirectory(fullPath));
    } else {
      paths.push(fullPath);
    }
  }

  return paths;
}

type ExportsMap = Record<string, Record<string, unknown> | string>;

function fileSize(relativePath: string | undefined): number {
  if (!relativePath) {
    return 0;
  }

  const fullPath = join(absoluteRoot, relativePath);
  return existsSync(fullPath) ? statSync(fullPath).size : 0;
}

function collectAssets(directory: string): Map<string, { count: number; bytes: number }> {
  const byExtension = new Map<string, { count: number; bytes: number }>();
  for (const f of walkDirectory(directory)) {
    if (/\.(js|cjs|mjs|d\.ts|d\.cts|d\.mts)$/.test(basename(f))) {
      continue;
    }

    const extension = basename(f).split('.').pop() ?? '?';
    const entry = byExtension.get(extension) ?? { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += statSync(f).size;
    byExtension.set(extension, entry);
  }

  return byExtension;
}

function getExportTarget(value: Record<string, unknown>): { js?: string; dts?: string } {
  const directImport = value['import'];
  if (typeof directImport === 'string') {
    return {
      js: directImport,
      dts: typeof value['types'] === 'string' ? value['types'] : undefined,
    };
  }

  if (typeof value['default'] === 'string') {
    return {
      js: value['default'],
      dts: typeof value['types'] === 'string' ? value['types'] : undefined,
    };
  }

  if (isRecord(directImport)) {
    return {
      js: typeof directImport['default'] === 'string' ? directImport['default'] : undefined,
      dts: typeof directImport['types'] === 'string' ? directImport['types'] : undefined,
    };
  }

  return {
    dts: typeof value['types'] === 'string' ? value['types'] : undefined,
  };
}

type ExportRow = {
  specifier: string;
  jsBytes: number;
  dtsBytes: number;
  assets: Map<string, { count: number; bytes: number }>;
  total: number;
};

function buildExportRows(): ExportRow[] {
  const publishPackage = applyPublishConfig(packageJson);
  const exports = publishPackage['exports'] as ExportsMap | undefined;
  if (!exports) {
    return [];
  }

  const rows: ExportRow[] = [];
  for (const [specifier, value] of Object.entries(exports)) {
    if (typeof value === 'string') {
      const size = fileSize(value);
      rows.push({
        specifier,
        jsBytes: size,
        dtsBytes: 0,
        assets: new Map(),
        total: size,
      });
      continue;
    }

    const target = getExportTarget(value);
    const jsBytes = fileSize(target.js);
    const dtsBytes = fileSize(target.dts);
    const exportDirectory = target.js ? dirname(join(absoluteRoot, target.js)) : undefined;
    const isRootExport = exportDirectory === join(absoluteRoot, 'dist');
    const assets =
      exportDirectory && !isRootExport && existsSync(exportDirectory)
        ? collectAssets(exportDirectory)
        : new Map<string, { count: number; bytes: number }>();
    const assetBytes = [...assets.values()].reduce((sum, { bytes }) => sum + bytes, 0);

    rows.push({
      specifier,
      jsBytes,
      dtsBytes,
      assets,
      total: jsBytes + dtsBytes + assetBytes,
    });
  }

  return rows;
}

function formatAssetCell(bytes: number, count: number, width: number): string {
  const sizeText = formatBytes(bytes);
  return `${sizeText} (${String(count)})`.padStart(width);
}

function printExportsSummary(): void {
  const rows = buildExportRows();
  if (rows.length === 0) {
    return;
  }

  const allAssetTypes = [...new Set(rows.flatMap((r) => [...r.assets.keys()]))].sort();
  const sizeCol = 10;
  const specCol = Math.max(...rows.map((r) => r.specifier.length), 10);
  const assetColWidth = 15;

  const assetHeaders = allAssetTypes.map((extension) => `.${extension}`.padStart(assetColWidth)).join('');
  const header = `  ${'Specifier'.padEnd(specCol)}${'JS'.padStart(sizeCol)}${'Types'.padStart(sizeCol)}${assetHeaders}${'Total'.padStart(sizeCol)}`;
  const divider = '─'.repeat(header.length - 2);

  console.log('\n  Exports');
  console.log(`  ${divider}`);
  console.log(header);
  console.log(`  ${divider}`);

  for (const row of rows) {
    const assetCells = allAssetTypes
      .map((extension) => {
        const entry = row.assets.get(extension);
        return entry ? formatAssetCell(entry.bytes, entry.count, assetColWidth) : '—'.padStart(assetColWidth);
      })
      .join('');

    const dtsCell = row.dtsBytes > 0 ? formatBytes(row.dtsBytes).padStart(sizeCol) : '—'.padStart(sizeCol);
    console.log(
      `  ${row.specifier.padEnd(specCol)}${formatBytes(row.jsBytes).padStart(sizeCol)}${dtsCell}${assetCells}${formatBytes(row.total).padStart(sizeCol)}`,
    );
  }

  let totalJs = 0;
  let totalDts = 0;
  let totalAll = 0;
  for (const row of rows) {
    totalJs += row.jsBytes;
    totalDts += row.dtsBytes;
    totalAll += row.total;
  }

  const totalAssetCells = allAssetTypes
    .map((extension) => {
      let bytes = 0;
      let count = 0;
      for (const row of rows) {
        const entry = row.assets.get(extension);
        if (entry) {
          bytes += entry.bytes;
          count += entry.count;
        }
      }

      return bytes > 0 ? formatAssetCell(bytes, count, assetColWidth) : '—'.padStart(assetColWidth);
    })
    .join('');

  console.log(`  ${divider}`);
  const totalDtsCell = totalDts > 0 ? formatBytes(totalDts).padStart(sizeCol) : '—'.padStart(sizeCol);
  console.log(
    `  ${`Total (${String(rows.length)} exports)`.padEnd(specCol)}${formatBytes(totalJs).padStart(sizeCol)}${totalDtsCell}${totalAssetCells}${formatBytes(totalAll).padStart(sizeCol)}`,
  );
}

type DistributionRow = {
  label: string;
  fileCount: number;
  jsBytes: number;
  dtsBytes: number;
  assets: Map<string, { count: number; bytes: number }>;
  total: number;
};

type DistributionStats = Omit<DistributionRow, 'label'>;

function createDistributionStats(): DistributionStats {
  return {
    fileCount: 0,
    jsBytes: 0,
    dtsBytes: 0,
    assets: new Map<string, { count: number; bytes: number }>(),
    total: 0,
  };
}

function addDistributionFile(stats: DistributionStats, filePath: string): void {
  const { size } = statSync(filePath);
  stats.fileCount += 1;
  stats.total += size;
  const name = basename(filePath);

  if (/\.(js|cjs|mjs)$/.test(name)) {
    stats.jsBytes += size;
    return;
  }

  if (/\.(d\.ts|d\.cts|d\.mts)$/.test(name)) {
    stats.dtsBytes += size;
    return;
  }

  const extension = name.split('.').pop() ?? '?';
  const entry = stats.assets.get(extension) ?? { count: 0, bytes: 0 };
  entry.count += 1;
  entry.bytes += size;
  stats.assets.set(extension, entry);
}

function buildDistributionRows(): DistributionRow[] {
  const distributionDirectory = join(absoluteRoot, 'dist');
  if (!existsSync(distributionDirectory)) {
    return [];
  }

  const rows: DistributionRow[] = [];
  const entries = readdirSync(distributionDirectory, { withFileTypes: true });
  const topLevelFiles = entries
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .sort();
  if (topLevelFiles.length > 0) {
    const stats = createDistributionStats();
    for (const file of topLevelFiles) {
      addDistributionFile(stats, join(distributionDirectory, file));
    }

    rows.push({
      label: 'dist',
      ...stats,
    });
  }

  const subdirs = readdirSync(distributionDirectory, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const sub of subdirs) {
    const files = walkDirectory(join(distributionDirectory, sub));
    const stats = createDistributionStats();
    for (const f of files) {
      addDistributionFile(stats, f);
    }

    rows.push({
      label: `dist/${sub}`,
      ...stats,
    });
  }

  return rows;
}

function printSizeSummary(): void {
  const rows = buildDistributionRows();
  if (rows.length === 0) {
    return;
  }

  const allAssetTypes = [...new Set(rows.flatMap((r) => [...r.assets.keys()]))].sort();
  const sizeCol = 10;
  const labelCol = Math.max(...rows.map((r) => r.label.length), 10);
  const filesCol = 8;
  const assetColWidth = 15;

  const assetHeaders = allAssetTypes.map((extension) => `.${extension}`.padStart(assetColWidth)).join('');
  const header = `  ${''.padEnd(labelCol)}${'Files'.padStart(filesCol)}${'JS'.padStart(sizeCol)}${'Types'.padStart(sizeCol)}${assetHeaders}${'Total'.padStart(sizeCol)}`;
  const divider = '─'.repeat(header.length - 2);

  console.log('\n  Size');
  console.log(`  ${divider}`);
  console.log(header);
  console.log(`  ${divider}`);

  for (const row of rows) {
    const assetCells = allAssetTypes
      .map((extension) => {
        const entry = row.assets.get(extension);
        return entry ? formatAssetCell(entry.bytes, entry.count, assetColWidth) : '—'.padStart(assetColWidth);
      })
      .join('');

    console.log(
      `  ${row.label.padEnd(labelCol)}${String(row.fileCount).padStart(filesCol)}${formatBytes(row.jsBytes).padStart(sizeCol)}${formatBytes(row.dtsBytes).padStart(sizeCol)}${assetCells}${formatBytes(row.total).padStart(sizeCol)}`,
    );
  }

  let sumFiles = 0;
  let sumJs = 0;
  let sumDts = 0;
  let sumTotal = 0;
  for (const row of rows) {
    sumFiles += row.fileCount;
    sumJs += row.jsBytes;
    sumDts += row.dtsBytes;
    sumTotal += row.total;
  }

  const totalAssetCells = allAssetTypes
    .map((extension) => {
      let bytes = 0;
      let count = 0;
      for (const row of rows) {
        const entry = row.assets.get(extension);
        if (entry) {
          bytes += entry.bytes;
          count += entry.count;
        }
      }

      return bytes > 0 ? formatAssetCell(bytes, count, assetColWidth) : '—'.padStart(assetColWidth);
    })
    .join('');

  console.log(`  ${divider}`);
  console.log(
    `  ${'Total'.padEnd(labelCol)}${String(sumFiles).padStart(filesCol)}${formatBytes(sumJs).padStart(sizeCol)}${formatBytes(sumDts).padStart(sizeCol)}${totalAssetCells}${formatBytes(sumTotal).padStart(sizeCol)}`,
  );
}

function printResult(result: CheckResult): void {
  const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⊘';
  const tag = result.status.toUpperCase();
  const summary = result.details?.[0] ?? '';

  console.log(`  [${tag}] ${icon} ${result.name} -- ${summary}`);

  for (const note of result.notes ?? []) {
    console.log(`  [NOTE] ! ${note}`);
  }

  if (result.status === 'fail' && result.details && result.details.length > 1) {
    for (const detail of result.details.slice(1)) {
      for (const line of detail.split('\n')) {
        console.log(`         ${line}`);
      }
    }
  }
}

async function main(): Promise<void> {
  results.push(validateEsmOnlyPackageMetadata());
  printResult(results.at(-1)!);

  results.push(validateFlatDistributionLayout());
  printResult(results.at(-1)!);

  results.push(validatePackageMetadata());
  printResult(results.at(-1)!);

  results.push(validateBundleOwnership());
  printResult(results.at(-1)!);

  results.push(await validateDistributionAssets());
  printResult(results.at(-1)!);

  results.push(await validateBundledArtifact());
  printResult(results.at(-1)!);

  results.push(validateStrictConsumerTypes());
  printResult(results.at(-1)!);

  results.push(await runPublint());
  printResult(results.at(-1)!);

  results.push(await runAttw());
  printResult(results.at(-1)!);

  results.push(await runMadge());
  printResult(results.at(-1)!);

  results.push(await runSizeLimit());
  printResult(results.at(-1)!);

  printExportsSummary();
  printSizeSummary();

  const failures = results.filter((r) => r.status === 'fail');
  console.log();

  if (failures.length > 0) {
    console.log(`${String(failures.length)} check(s) failed. Package is NOT ready for publishing.`);
    process.exit(1);
  }

  console.log('All checks passed. Package is ready for publishing.');
}

await main();
