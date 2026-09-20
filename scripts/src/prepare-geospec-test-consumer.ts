/**
 * Prepare one current installed GeoSpec test consumer; never import or probe products.
 * Usage: node scripts/src/prepare-geospec-test-consumer.ts <assembly-root> <receipt.json>
 * Inputs: completed SDK dependency builds and assemble-package.sh's root/platform TGZs.
 * Output: retained consumer, initial SDK/framework receipts and ten hash-bound harness files.
 * Environment: existing Node/pnpm/npm/tar/git on PATH; no build or install scripts run.
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
const nativeName = '@taucad/geospec-engine-native';
const platformName = `${nativeName}-darwin-arm64`;
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
  const [assemblyArgument, receiptArgument] = process.argv.slice(2);
  assert.ok(assemblyArgument && receiptArgument && process.argv.length === 4, 'Supply assembly-root and receipt.json');
  assert.ok(
    process.platform === 'darwin' && process.arch === 'arm64',
    'Selected native test consumer requires Darwin ARM64',
  );
  const assemblyRoot = realpathSync(resolve(assemblyArgument));
  const receiptPath = resolve(receiptArgument);
  rmSync(receiptPath, { force: true });
  const nativeRoot = join(repositoryRoot, 'packages/geospec-engine-native');
  requireBuilt(nativeRoot, readManifest(join(nativeRoot, 'package.json')));
  const nativePayload = [
    'dist/native/index.js',
    'dist/bindings/mixed-wasm/geospec_engine_native.mjs',
    'dist/bindings/mixed-wasm/geospec_engine_native.wasm',
  ];
  for (const path of [...nativePayload, 'bindings/node/generated/geospec-engine-native.darwin-arm64.node']) {
    assert.ok(fileRecord(join(nativeRoot, path)).bytes > 0, `Missing native payload: ${path}`);
  }
  const resolved = await workspace({ fresh: true });
  const projects = new Map(publishable(resolved).map((project) => [project.name, project]));
  const closure = publishableClosure(resolved, ['geospec']);
  assert.ok(closure.includes('geospec'), 'GeoSpec is missing from the publishable closure');
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
    'packages/geospec-engine-native',
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
  const nativeTarballs = ['root', 'darwin-arm64'].map((name) => join(assemblyRoot, 'tarballs', `${name}.tgz`));
  for (const tarball of nativeTarballs) {
    assert.ok(fileRecord(tarball).bytes > 0, `Empty assembled tarball: ${tarball}`);
  }
  const temporaryRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tau-geospec-consumer-')));
  const distance = relative(realpathSync(repositoryRoot), temporaryRoot);
  assert.ok(isAbsolute(distance) || distance.startsWith(`..${sep}`), 'Consumer must be outside the workspace');
  const artifactRoot = join(temporaryRoot, 'tarballs');
  const consumerRoot = join(temporaryRoot, 'consumer');
  mkdirSync(artifactRoot);
  mkdirSync(consumerRoot);
  console.log(`Preparing retained consumer: ${consumerRoot}`);
  const tarballs = [...nativeTarballs];
  for (const { root, manifest } of packages) {
    if (manifest.name === nativeName) {
      continue;
    }
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
  const native = byName.get(nativeName);
  const platform = byName.get(platformName);
  assert.ok(native && platform, 'Assembly lacks native root/platform packages');
  assert.equal(native.manifest.version, platform.manifest.version, 'Native root/platform versions differ');
  assert.equal(native.manifest.optionalDependencies?.[platformName], platform.manifest.version);
  assert.equal(
    native.manifest.version,
    readManifest(join(repositoryRoot, 'packages/geospec-engine-native/package.json')).version,
  );
  const workspaceNames = new Set(
    resolved.projects.flatMap((project) => (project.manifest?.name ? [project.manifest.name] : [])),
  );
  for (const { manifest } of packed) {
    for (const dependencies of [manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies]) {
      for (const [name, version] of Object.entries(dependencies ?? {})) {
        assert.ok(
          !/^(?:workspace|catalog|link|file):/.test(version),
          `Unpublished dependency: ${manifest.name} ${name}`,
        );
        assert.ok(!workspaceNames.has(name) || byName.has(name), `Missing local workspace dependency: ${name}`);
      }
    }
  }
  writeFileSync(join(consumerRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], consumerRoot);
  const lock = JSON.parse(readFileSync(join(consumerRoot, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, LockEntry>;
  };
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
    if (manifest.name === nativeName) {
      for (const path of nativePayload) {
        assert.ok(fileRecord(join(root, path)).bytes > 0, `Missing installed native payload: ${path}`);
      }
    }
    const builtRoot =
      manifest.name === nativeName ? nativeRoot : packages.find((entry) => entry.manifest.name === manifest.name)?.root;
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
    if (manifest.name === platformName) {
      assert.ok(
        actual.main && !actual.main.includes('/') && actual.main.endsWith('.node'),
        'Invalid platform addon path',
      );
      assert.equal(
        fileRecord(join(root, actual.main)).sha256,
        fileRecord(join(repositoryRoot, 'packages/geospec-engine-native/bindings/node/generated', actual.main)).sha256,
        'Assembly addon differs from current built addon',
      );
    }
    return { name: actual.name, version: actual.version, root, files };
  });
  assert.deepEqual(sourceIdentity(), source, 'Source inputs changed during consumer preparation');
  const receipt = {
    consumerRoot,
    assemblyRoot,
    source,
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
  const catalog = load(readFileSync(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')) as {
    catalog: Record<string, unknown>;
  };
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
    if (!workspaceNames.has(name) && !byName.has(name)) {
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
  const harness = [
    'm3-corpus/installed.mjs',
    'm3-corpus/installed.vitest.test.mjs',
    'm3-corpus/vitest.config.mjs',
    'm3-corpus/corpus.mjs',
    'm3-corpus/profile-v3.mjs',
    'f1-public-a1/authority.mjs',
    'f1-public-a1/f1-public.vitest.test.mjs',
    'f1-public-a1/vitest.config.mjs',
    'fixtures/read-fixture.mjs',
    'fixtures/manifest.json',
  ].map((path) => {
    const input = fileRecord(join(repositoryRoot, 'packages/geospec/host-tests', path));
    const destination = join(consumerRoot, 'host-tests', path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(input.path));
    const staged = fileRecord(destination);
    assert.equal(staged.sha256, input.sha256, `Harness copy differs: ${path}`);
    return { source: input, staged };
  });
  for (const entry of harness) {
    assert.deepEqual(fileRecord(entry.source.path), entry.source, 'Harness source changed during preparation');
  }
  assert.deepEqual(sourceIdentity(), source, 'Source inputs changed during framework/harness preparation');
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(
    receiptPath,
    `${JSON.stringify({ ...receipt, lock: frameworkSuccessor.lock, frameworkSuccessor, harness }, null, 2)}\n`,
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
