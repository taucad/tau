/**
 * Prepare one current installed GeoSpec test consumer; never import or probe products.
 * Usage: node scripts/src/prepare-geospec-test-consumer.ts <receipt.json>
 * Inputs: completed SDK dependency builds, and the `geospec` and `geospec-engine` catalog pins with
 * their pnpm-lock.yaml integrity; both install from the npm registry at exactly those pins.
 * Output: retained consumer and initial SDK/framework receipts.
 * Environment: existing Node/pnpm/npm/tar/git on PATH and registry access; no build or install scripts run.
 * Exit: 0 prepared and inventoried; 1 missing inputs, incomplete closure or install failure.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { publishable, publishableClosure, workspace } from '@taucad/nx';
import { load } from 'js-yaml';

type Manifest = {
  name: string;
  version: string;
  main?: string;
  exports?: Record<string, unknown>;
  publishConfig?: { exports?: Record<string, unknown> };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
type LockEntry = { version?: string; resolved?: string; integrity?: string; link?: boolean };

const repositoryRoot = resolve(import.meta.dirname, '../..');
/**
 * The packages published from taucad/geospec: the compiled engine and the `geospec` authoring package that
 * runs on it. Tau's exporter for the engine's pool ships in `@taucad/cli`.
 */
const registryPackages = [
  {
    name: 'geospec-engine',
    payload: [
      'dist/node.mjs',
      'dist/native/index.js',
      'dist/bindings/mixed-wasm/geospec_engine_native.mjs',
      'dist/bindings/mixed-wasm/geospec_engine_native.wasm',
      'licenses/SOURCE-RELINK.json',
    ],
  },
  { name: 'geospec', payload: ['dist/index.mjs', 'dist/cli/main.mjs', 'agent/skills.json', 'agent/resources.js'] },
] as const;
const registryNames: ReadonlySet<string> = new Set(registryPackages.map(({ name }) => name));
/**
 * Whether a caret range admits an exact release pin: the same major (and minor below 1.0), at or above its floor.
 * A prerelease pin or any other range form is never admitted.
 */
const caretAdmits = (range: string, pin: string): boolean => {
  const floor = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range)?.slice(1).map(Number);
  const target = /^(\d+)\.(\d+)\.(\d+)$/.exec(pin)?.slice(1).map(Number);
  if (floor === undefined || target === undefined || floor[0] !== target[0]) {
    return false;
  }
  if (floor[0] === 0 && floor[1] !== target[1]) {
    return false;
  }
  const differing = [0, 1, 2].find((index) => floor[index] !== target[index]);
  return differing === undefined || target[differing]! > floor[differing]!;
};
const sha256 = (bytes: BinaryLike): string => createHash('sha256').update(bytes).digest('hex');
const readManifest = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8')) as Manifest;
const run = (command: string, arguments_: string[], cwd = repositoryRoot): string => {
  const environment = { ...process.env };
  environment['npm_config_ignore_scripts'] = 'true';
  environment['pnpm_config_verify_deps_before_run'] = 'warn';
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: environment,
  });
  assert.equal(result.status, 0, `${command} failed: ${result.error?.message ?? ''}\n${result.stdout}${result.stderr}`);
  return result.stdout;
};
const fileRecord = (path: string) => {
  assert.ok(lstatSync(path).isFile(), `Expected regular file: ${path}`);
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
};
const exportPaths = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return value.includes('*') ? [] : [value];
  }
  return value && typeof value === 'object' ? Object.values(value).flatMap((entry) => exportPaths(entry)) : [];
};
const requireBuilt = (root: string, manifest: Manifest): void => {
  const paths = exportPaths(manifest.publishConfig?.exports ?? manifest.exports);
  assert.ok(
    paths.some((path) => path.startsWith('./dist/')),
    `No built exports for ${manifest.name}`,
  );
  for (const path of paths) {
    assert.ok(fileRecord(resolve(root, path)).bytes > 0, `Missing built export: ${manifest.name} ${path}`);
  }
};
const installedFiles = (root: string) =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = fileRecord(join(entry.parentPath, entry.name));
      return { ...file, path: relative(root, file.path).split(sep).join('/') };
    })
    .filter((file) => !file.path.split('/').includes('node_modules'))
    .sort((left, right) => left.path.localeCompare(right.path));

const main = async (): Promise<void> => {
  const [receiptArgument] = process.argv.slice(2);
  assert.ok(receiptArgument && process.argv.length === 3, 'Supply receipt.json');
  const receiptPath = resolve(receiptArgument);
  rmSync(receiptPath, { force: true });
  const catalog = load(readFileSync(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')) as {
    catalog: Record<string, unknown>;
  };
  const lockfile = load(readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8')) as {
    packages?: Record<string, { resolution?: { integrity?: string } }>;
  };
  const pins: ReadonlyMap<string, { name: string; version: string; integrity: string; payload: readonly string[] }> =
    new Map(
      registryPackages.map(({ name, payload }) => {
        const version = catalog.catalog[name];
        assert.ok(
          typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version),
          `Pin an exact ${name} version in the pnpm catalog`,
        );
        const integrity = lockfile.packages?.[`${name}@${version}`]?.resolution?.integrity;
        assert.ok(integrity, `pnpm-lock.yaml has no integrity for ${name}@${version}`);
        return [name, { name, version, integrity, payload }] as const;
      }),
    );
  const resolved = await workspace({ fresh: true });
  const projects = new Map(publishable(resolved).map((project) => [project.name, project]));
  const closure = publishableClosure(resolved, ['cli']);
  assert.ok(closure.includes('cli'), 'The Tau CLI is missing from the publishable closure');
  const packages = closure.map((name) => {
    const project = projects.get(name);
    assert.ok(project, `Missing publishable project: ${name}`);
    const root = resolve(repositoryRoot, project.root);
    const manifest = readManifest(join(root, 'package.json'));
    requireBuilt(root, manifest);
    return { root, manifest };
  });
  const sourcePaths = [
    ...packages.map(({ root }) => relative(repositoryRoot, root)),
    'tools/nx',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'nx.json',
    'scripts/src/prepare-geospec-test-consumer.ts',
  ];
  const sourceIdentity = () => ({
    revision: run('git', ['rev-parse', 'HEAD']).trim(),
    trackedDiffSha256: sha256(Buffer.from(run('git', ['diff', 'HEAD', '--binary', '--', ...sourcePaths]))),
    script: fileRecord(fileURLToPath(import.meta.url)),
    manifests: packages.map(({ root }) => fileRecord(join(root, 'package.json'))),
  });
  const source = sourceIdentity();
  const temporaryRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tau-geospec-consumer-')));
  const distance = relative(realpathSync(repositoryRoot), temporaryRoot);
  assert.ok(isAbsolute(distance) || distance.startsWith(`..${sep}`), 'Consumer must be outside the workspace');
  const artifactRoot = join(temporaryRoot, 'tarballs');
  const consumerRoot = join(temporaryRoot, 'consumer');
  mkdirSync(artifactRoot);
  mkdirSync(consumerRoot);
  console.log(`Preparing retained consumer: ${consumerRoot}`);
  const tarballs: string[] = [];
  for (const { root, manifest } of packages) {
    const destination = join(artifactRoot, manifest.name.replaceAll('/', '-'));
    mkdirSync(destination);
    run('pnpm', ['pack', '--pack-destination', destination], root);
    const produced = readdirSync(destination).filter((name) => name.endsWith('.tgz'));
    assert.equal(produced.length, 1, `Expected one tarball for ${manifest.name}`);
    tarballs.push(join(destination, produced[0]!));
  }
  const packed = tarballs.map((path) => {
    const manifest = JSON.parse(run('tar', ['-xOf', path, 'package/package.json'])) as Manifest;
    assert.ok(manifest.name && manifest.version, `Incomplete packed manifest: ${path}`);
    return {
      manifest,
      tarball: fileRecord(path),
      integrity: `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`,
    };
  });
  const byName = new Map(packed.map((entry) => [entry.manifest.name, entry]));
  assert.equal(byName.size, packed.length, 'Duplicate packed package names');
  for (const name of registryNames) {
    assert.ok(!byName.has(name), `${name} must come from the registry, not a local tarball`);
  }
  const workspaceNames = new Set(
    resolved.projects.flatMap((project) => (project.manifest?.name ? [project.manifest.name] : [])),
  );
  for (const { manifest } of packed) {
    for (const dependencies of [manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies]) {
      const peers = dependencies !== undefined && dependencies === manifest.peerDependencies;
      for (const [name, version] of Object.entries(dependencies ?? {})) {
        assert.ok(
          !/^(?:workspace|catalog|link|file):/.test(version),
          `Unpublished dependency: ${manifest.name} ${name}`,
        );
        assert.ok(!workspaceNames.has(name) || byName.has(name), `Missing local workspace dependency: ${name}`);
        // A peer may name a caret range (`@taucad/host`'s optional GeoSpec peers); it must admit the pin.
        const pin = pins.get(name)?.version;
        assert.ok(
          pin === undefined || version === pin || (peers && caretAdmits(version, pin)),
          `${manifest.name} pins another ${name}`,
        );
      }
    }
  }
  writeFileSync(join(consumerRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      ...tarballs,
      ...[...pins.values()].map(({ name, version }) => `${name}@${version}`),
    ],
    consumerRoot,
  );
  const lock = JSON.parse(readFileSync(join(consumerRoot, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, LockEntry>;
  };
  // Each GeoSpec package resolves exactly once, from the registry, with the bytes the workspace lockfile admitted.
  const registryEntries = [...pins.values()].map((pin) => {
    const entries = Object.entries(lock.packages).filter(([path]) => path.split('node_modules/').at(-1) === pin.name);
    assert.deepEqual(
      entries.map(([path]) => path),
      [`node_modules/${pin.name}`],
      `Expected one ${pin.name} occurrence`,
    );
    const entry = entries[0]![1];
    assert.equal(entry.version, pin.version, `Installed ${pin.name} differs from the catalog pin`);
    assert.ok(
      !entry.link && typeof entry.resolved === 'string' && entry.resolved.startsWith('https://'),
      `${pin.name} did not install from the registry`,
    );
    assert.equal(entry.integrity, pin.integrity, `${pin.name} integrity differs from pnpm-lock.yaml`);
    return { ...pin, resolved: entry.resolved };
  });
  // Inspect every occurrence, including nested npm copies, so a mismatched sibling cannot use the registry.
  for (const [path, entry] of Object.entries(lock.packages)) {
    const name = path.split('node_modules/').at(-1)!;
    if (!workspaceNames.has(name) && !byName.has(name)) {
      continue;
    }
    const selected = byName.get(name);
    assert.ok(selected, `Installed undeclared workspace package: ${name}`);
    assert.ok(
      !entry.link && typeof entry.resolved === 'string' && entry.resolved.startsWith('file:'),
      `Workspace package did not install from a tarball: ${path}`,
    );
    assert.equal(realpathSync(resolve(consumerRoot, entry.resolved.slice(5))), realpathSync(selected.tarball.path));
    assert.equal(entry.integrity, selected.integrity, `Tarball integrity differs: ${path}`);
    assert.equal(entry.version, selected.manifest.version, `Installed version differs: ${path}`);
  }
  const installed = packed.map(({ manifest }) => {
    const root = join(consumerRoot, 'node_modules', manifest.name);
    assert.ok(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), `Linked package: ${manifest.name}`);
    const actual = readManifest(join(root, 'package.json'));
    assert.equal(actual.name, manifest.name);
    assert.equal(actual.version, manifest.version);
    assert.ok(lock.packages[`node_modules/${manifest.name}`], `Package absent from lock: ${manifest.name}`);
    const files = installedFiles(root);
    const builtRoot = packages.find((entry) => entry.manifest.name === manifest.name)?.root;
    if (builtRoot) {
      requireBuilt(root, actual);
      for (const file of files.filter((entry) => entry.path.startsWith('dist/'))) {
        assert.equal(
          file.sha256,
          fileRecord(join(builtRoot, file.path)).sha256,
          `Installed package differs from current built bytes: ${file.path}`,
        );
      }
    }
    return { name: actual.name, version: actual.version, root, files };
  });
  for (const { name, version, payload } of registryEntries) {
    const root = join(consumerRoot, 'node_modules', name);
    assert.ok(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), `Linked ${name}`);
    const manifest = readManifest(join(root, 'package.json'));
    assert.equal(manifest.name, name);
    assert.equal(manifest.version, version);
    for (const path of payload) {
      assert.ok(fileRecord(join(root, path)).bytes > 0, `Missing installed ${name} payload: ${path}`);
    }
    installed.push({ name, version, root, files: installedFiles(root) });
  }
  const registry = registryEntries.map(({ name, version, resolved, integrity }) => ({
    name,
    version,
    resolved,
    integrity,
  }));
  assert.deepEqual(sourceIdentity(), source, 'Source inputs changed during consumer preparation');
  const receipt = {
    consumerRoot,
    source,
    registry,
    packages: packed,
    installed,
    lock: fileRecord(join(consumerRoot, 'package-lock.json')),
    qualification: 'Installation and byte identity only; no product execution',
  };
  const initialReceiptPath = join(temporaryRoot, 'receipt.json');
  writeFileSync(initialReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  for (const name of ['package.json', 'package-lock.json']) {
    writeFileSync(join(temporaryRoot, `sdk-${name}`), readFileSync(join(consumerRoot, name)));
  }
  const vitestVersion = catalog.catalog['vitest'];
  assert.ok(typeof vitestVersion === 'string' && /^\d+\.\d+\.\d+$/.test(vitestVersion), 'Pin an exact Vitest version');
  run(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-dev', '--save-exact', `vitest@${vitestVersion}`],
    consumerRoot,
  );
  const successorLock = JSON.parse(readFileSync(join(consumerRoot, 'package-lock.json'), 'utf8')) as typeof lock;
  // Framework installation may change npm flags, but never the selected local package identities.
  for (const path of new Set([...Object.keys(lock.packages), ...Object.keys(successorLock.packages)])) {
    const name = path.split('node_modules/').at(-1)!;
    if (!workspaceNames.has(name) && !byName.has(name) && !registryNames.has(name)) {
      continue;
    }
    const before = lock.packages[path];
    const after = successorLock.packages[path];
    assert.ok(before && after, `Framework install changed local package occurrences: ${path}`);
    for (const field of ['version', 'resolved', 'integrity', 'link'] as const) {
      assert.equal(after[field], before[field], `Framework install changed ${path} ${field}`);
    }
  }
  for (const entry of installed) {
    assert.deepEqual(installedFiles(entry.root), entry.files, `Framework install changed ${entry.name} bytes`);
  }
  for (const entry of packed) {
    assert.deepEqual(fileRecord(entry.tarball.path), entry.tarball, 'Selected tarball changed during preparation');
  }
  const frameworkManifestPath = join(consumerRoot, 'node_modules/vitest/package.json');
  assert.equal(readManifest(frameworkManifestPath).version, vitestVersion);
  assert.equal(successorLock.packages['node_modules/vitest']?.version, vitestVersion);
  const frameworkSuccessor = {
    initialReceipt: fileRecord(initialReceiptPath),
    initialManifest: fileRecord(join(temporaryRoot, 'sdk-package.json')),
    initialLock: fileRecord(join(temporaryRoot, 'sdk-package-lock.json')),
    version: vitestVersion,
    manifest: fileRecord(frameworkManifestPath),
    lock: fileRecord(join(consumerRoot, 'package-lock.json')),
    unchangedPackages: installed.map((entry) => entry.name),
  };
  writeFileSync(join(temporaryRoot, 'framework-successor.json'), `${JSON.stringify(frameworkSuccessor, null, 2)}\n`);
  assert.deepEqual(sourceIdentity(), source, 'Source inputs changed during framework preparation');
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(
    receiptPath,
    `${JSON.stringify({ ...receipt, lock: frameworkSuccessor.lock, frameworkSuccessor }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ consumerRoot, receiptPath }));
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error('GeoSpec test consumer preparation failed:', error);
    process.exitCode = 1;
  }
}
