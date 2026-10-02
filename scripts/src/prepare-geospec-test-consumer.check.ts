/**
 * Check consumer preparation with inert filesystem, process and Nx boundaries.
 * Usage: node --test scripts/src/prepare-geospec-test-consumer.check.ts
 * Environment: installed workspace TypeScript; no build or product inputs needed.
 * Output: Node test results; all simulated packages and receipts stay in memory.
 * Exit: 0 all checks pass; 1 a preparation invariant fails.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as url from 'node:url';
import vm from 'node:vm';
import * as ts from 'typescript';
import { load } from 'js-yaml';
import { publishableClosure, workspace } from '@taucad/nx';

void test('should declare the complete normal consumer build closure except the assembled native package', async () => {
  const project = JSON.parse(readFileSync(new URL('../project.json', import.meta.url), 'utf8')) as {
    targets: { 'prepare-geospec-test-consumer': { dependsOn: Array<{ target: string; projects: string[] }> } };
  };
  const roots = new Set(
    project.targets['prepare-geospec-test-consumer'].dependsOn
      .filter(({ target }) => target === 'build')
      .flatMap(({ projects }) => projects),
  );
  const closure = publishableClosure(await workspace({ fresh: true }), ['geospec', 'geospec-engine']);
  assert.deepEqual(
    closure.filter((name) => name !== 'geospec-engine-native' && !roots.has(name)),
    [],
    'Normal consumer target omits publishable build prerequisites',
  );
  assert.ok(!roots.has('geospec-engine-native'), 'Native production must remain separately assembled');
});

type Manifest = {
  name: string;
  version: string;
  main?: string;
  exports?: Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
type CommandOptions = { cwd: string; env: Record<string, string> };
type RecordedCommand = { command: string; args: string[]; options: CommandOptions };
type Receipt = {
  consumerRoot: string;
  installed: Array<{ name: string }>;
  packages: unknown[];
  source: { revision: string };
  lock: { sha256: string };
  frameworkSuccessor: {
    version: string;
    lock: { sha256: string };
    initialLock: { sha256: string };
    unchangedPackages: string[];
  };
  harness: Array<{ source: { path: string; sha256: string }; staged: { path: string; sha256: string } }>;
};
type Fault = 'missing-build' | 'missing-wasm' | 'registry' | 'stale-assembly';

const source = readFileSync(new URL('prepare-geospec-test-consumer.ts', import.meta.url), 'utf8');
const cliStart = source.lastIndexOf('\nif (process.argv');
assert.ok(cliStart > 0, 'Preparation source must retain its guarded CLI entry');
// Execute the actual preparation body without importing its real IO dependencies.
const compiled = ts
  .transpileModule(
    source
      .slice(0, cliStart)
      .replaceAll('import.meta.dirname', "'/repo/scripts/src'")
      .replaceAll('import.meta.url', "'file:///repo/scripts/src/prepare-geospec-test-consumer.ts'"),
    {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      transformers: {
        before: [
          (context) => (node) => {
            const visit: ts.Visitor = (child) =>
              ts.isImportDeclaration(child) ? undefined : ts.visitEachChild(child, visit, context);
            return ts.visitEachChild(node, visit, context);
          },
        ],
      },
    },
  )
  .outputText.replace(/export {};?\s*$/, '');
const native = '@taucad/geospec-engine-native';
const platform = `${native}-darwin-arm64`;
const nativePayload = [
  'dist/native/index.js',
  'dist/bindings/mixed-wasm/geospec_engine_native.mjs',
  'dist/bindings/mixed-wasm/geospec_engine_native.wasm',
];
const manifest = (name: string): Manifest => ({ name, version: '0.1.0', exports: { '.': './dist/index.mjs' } });
const harnessPaths = [
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
];

const prepare = async (fault?: Fault) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const directories = new Set(['/repo', '/assembly', '/assembly/tarballs', '/tmp']);
  const commands: RecordedCommand[] = [];
  const archives = new Map<string, Manifest>();
  const add = (name: string, value: unknown): void => {
    files.set(
      name,
      Buffer.from(value instanceof Uint8Array || typeof value === 'string' ? value : JSON.stringify(value)),
    );
    for (let directory = path.dirname(name); directory !== '/'; directory = path.dirname(directory)) {
      directories.add(directory);
    }
  };
  const projects = [
    { name: 'support', root: 'packages/support', manifest: manifest('@taucad/support') },
    {
      name: 'geospec',
      root: 'packages/geospec',
      manifest: { ...manifest('geospec'), dependencies: { '@taucad/support': '0.1.0' } },
    },
    {
      name: 'geospec-engine',
      root: 'packages/geospec-engine',
      manifest: { ...manifest('@taucad/geospec-engine'), dependencies: { geospec: '0.1.0' } },
    },
  ];
  const nativeManifest = { ...manifest(native), optionalDependencies: { [platform]: '0.1.0' } };
  const platformManifest = { name: platform, version: '0.1.0', main: 'geospec-engine-native.darwin-arm64.node' };
  for (const project of [...projects, { root: 'packages/geospec-engine-native', manifest: nativeManifest }]) {
    add(`/repo/${project.root}/package.json`, project.manifest);
    add(`/repo/${project.root}/dist/index.mjs`, 'inert built bytes');
  }
  for (const entry of nativePayload) {
    add(`/repo/packages/geospec-engine-native/${entry}`, 'inert payload bytes');
  }
  add('/repo/scripts/src/prepare-geospec-test-consumer.ts', source);
  add('/repo/pnpm-workspace.yaml', 'catalog:\n  vitest: 4.1.11\n');
  for (const name of harnessPaths) {
    add(`/repo/packages/geospec/host-tests/${name}`, `inert harness ${name}`);
  }
  add(`/repo/packages/geospec-engine-native/bindings/node/generated/${platformManifest.main}`, 'inert addon bytes');
  const archive = (name: string, metadata: Manifest): void => {
    add(name, `inert tarball ${metadata.name}`);
    archives.set(name, metadata);
  };
  archive('/assembly/tarballs/root.tgz', nativeManifest);
  archive('/assembly/tarballs/darwin-arm64.tgz', platformManifest);
  if (fault === 'missing-wasm') {
    files.delete(`/repo/packages/geospec-engine-native/${nativePayload[2]}`);
  }
  if (fault === 'missing-build') {
    files.delete('/repo/packages/geospec/dist/index.mjs');
  }
  const read = (name: string): Uint8Array<ArrayBuffer> => {
    const bytes = files.get(name);
    assert.ok(bytes, `Missing ${name}`);
    return bytes;
  };
  const scope = vm.createContext({
    assert,
    createHash,
    load,
    ...url,
    ...path,
    process: {
      argv: ['node', 'inert-driver', '/assembly', '/out/receipt.json'],
      env: {},
      platform: 'darwin',
      arch: 'arm64',
    },
    console: {
      log() {
        /* Preparation progress is intentionally silent in this inert check. */
      },
      error() {
        /* No real console or process is injected into the preparation body. */
      },
    },
    tmpdir: () => '/tmp',
    lstatSync(name: string) {
      assert.ok(files.has(name) || directories.has(name), `Missing ${name}`);
      return { isFile: () => files.has(name), isDirectory: () => directories.has(name), isSymbolicLink: () => false };
    },
    readFileSync: (name: string, encoding?: BufferEncoding) =>
      encoding ? Buffer.from(read(name)).toString(encoding) : read(name),
    writeFileSync: add,
    rmSync: (name: string) => files.delete(name),
    mkdirSync: (name: string) => directories.add(name),
    realpathSync: (name: string) => name,
    mkdtempSync(prefix: string) {
      const name = `${prefix}inert`;
      directories.add(name);
      return name;
    },
    readdirSync: (root: string, options?: { recursive?: boolean; withFileTypes?: boolean }) =>
      [...files.keys()]
        .filter((name) => name.startsWith(`${root}/`))
        .filter((name) => options?.recursive === true || !name.slice(root.length + 1).includes('/'))
        .map((name) =>
          options?.withFileTypes
            ? { name: path.basename(name), parentPath: path.dirname(name), isFile: () => true }
            : name.slice(root.length + 1),
        ),
    workspace: async () => ({ projects }),
    publishable: (value: { projects: typeof projects }) => value.projects,
    publishableClosure(_value: unknown, names: string[]) {
      assert.deepEqual([...names], ['geospec', 'geospec-engine']);
      return ['support', 'geospec', 'geospec-engine'];
    },
    spawnSync(command: string, args: string[], options: CommandOptions) {
      // Normalize VM arrays before strict host-realm assertions and recording.
      const commandArguments = [...args];
      commands.push({ command, args: commandArguments, options });
      let stdout = '';
      assert.equal(options.env['npm_config_ignore_scripts'], 'true');
      switch (command) {
        case 'git': {
          stdout = args[0] === 'rev-parse' ? 'inert-revision' : '';
          break;
        }
        case 'pnpm': {
          assert.equal(args[0], 'pack');
          archive(
            path.join(args[2]!, 'packed.tgz'),
            JSON.parse(new TextDecoder().decode(read(path.join(options.cwd, 'package.json')))) as Manifest,
          );
          break;
        }
        case 'tar': {
          stdout = JSON.stringify(archives.get(args[1]!));
          break;
        }
        case 'npm': {
          assert.deepEqual(commandArguments.slice(0, 4), ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
          if (args.includes('--save-dev')) {
            assert.deepEqual(commandArguments.slice(4), ['--save-dev', '--save-exact', 'vitest@4.1.11']);
            assert.ok(files.has('/tmp/tau-geospec-consumer-inert/receipt.json'));
            assert.ok(files.has('/tmp/tau-geospec-consumer-inert/sdk-package-lock.json'));
            const lock = JSON.parse(Buffer.from(read(path.join(options.cwd, 'package-lock.json'))).toString()) as {
              packages: Record<string, unknown>;
            };
            lock.packages['node_modules/vitest'] = { version: '4.1.11' };
            add(path.join(options.cwd, 'package-lock.json'), lock);
            add(path.join(options.cwd, 'node_modules/vitest/package.json'), { name: 'vitest', version: '4.1.11' });
            break;
          }
          const packages: Record<string, { version: string; resolved: string; integrity: string }> = {};
          for (const name of args.slice(4)) {
            const metadata = archives.get(name);
            assert.ok(metadata, `Missing inert archive ${name}`);
            const root = path.join(options.cwd, 'node_modules', metadata.name);
            add(path.join(root, 'package.json'), metadata);
            if (metadata.name === native) {
              for (const entry of nativePayload) {
                add(path.join(root, entry), 'inert payload bytes');
              }
            }
            if (metadata.name === platform) {
              assert.ok(metadata.main);
              add(path.join(root, metadata.main), 'inert addon bytes');
            } else {
              add(
                path.join(root, 'dist/index.mjs'),
                fault === 'stale-assembly' && metadata.name === native ? 'stale bytes' : 'inert built bytes',
              );
            }
            packages[`node_modules/${metadata.name}`] = {
              version: metadata.version,
              resolved:
                fault === 'registry' && metadata.name === 'geospec'
                  ? 'https://registry.invalid/geospec.tgz'
                  : `file:${name}`,
              integrity: `sha512-${createHash('sha512').update(read(name)).digest('base64')}`,
            };
          }
          add(path.join(options.cwd, 'package-lock.json'), { packages });
          break;
        }
        default: {
          assert.fail(`Unexpected command ${command}`);
        }
      }
      return { status: 0, stdout, stderr: '' };
    },
  });
  scope['Buffer'] = Buffer;
  let capturedError: unknown;
  try {
    await (vm.runInContext(`${compiled}\nmain();`, scope) as Promise<void>);
  } catch (error) {
    capturedError = error;
  }
  return {
    commands,
    error: capturedError,
    files,
    receipt: files.has('/out/receipt.json')
      ? (JSON.parse(new TextDecoder().decode(read('/out/receipt.json'))) as Receipt)
      : undefined,
  };
};

void test('should prepare one local-tarball closure and record source, payload and installed bytes without probes', async () => {
  const result = await prepare();
  assert.ifError(result.error);
  assert.equal(result.commands.filter((command) => command.command === 'npm').length, 2);
  assert.equal(result.commands.filter((command) => command.command === 'pnpm').length, 3);
  assert.ok(result.receipt);
  assert.equal(result.receipt.installed.length, 5);
  assert.equal(result.receipt.source.revision, 'inert-revision');
  assert.ok(result.receipt.consumerRoot.startsWith('/tmp/'));
  assert.equal(result.receipt.packages.length, 5);
  assert.equal(result.receipt.frameworkSuccessor.version, '4.1.11');
  assert.equal(result.receipt.frameworkSuccessor.unchangedPackages.length, 5);
  assert.equal(result.receipt.lock.sha256, result.receipt.frameworkSuccessor.lock.sha256);
  assert.notEqual(result.receipt.lock.sha256, result.receipt.frameworkSuccessor.initialLock.sha256);
  assert.deepEqual(
    result.receipt.harness.map((entry) =>
      path.relative(`${result.receipt!.consumerRoot}/host-tests`, entry.staged.path),
    ),
    harnessPaths,
  );
  for (const entry of result.receipt.harness) {
    assert.equal(entry.source.sha256, entry.staged.sha256);
    assert.deepEqual(result.files.get(entry.source.path), result.files.get(entry.staged.path));
  }
  const initial = JSON.parse(
    Buffer.from(result.files.get('/tmp/tau-geospec-consumer-inert/receipt.json')!).toString(),
  ) as Receipt;
  assert.equal(initial.lock.sha256, result.receipt.frameworkSuccessor.initialLock.sha256);
  assert.equal(initial.frameworkSuccessor, undefined);
});
void test('should install the current CLI package through the same local tarball closure', async () => {
  const result = await prepare();
  assert.ifError(result.error);
  assert.ok(result.receipt?.installed.some((entry) => entry.name === '@taucad/geospec-engine'));
});
for (const fault of ['missing-build', 'missing-wasm', 'registry', 'stale-assembly'] as const) {
  void test(`should reject ${fault} without a successful receipt`, async () => {
    const result = await prepare(fault);
    assert.ok(result.error instanceof assert.AssertionError);
    assert.equal(result.receipt, undefined);
    if (fault === 'missing-build' || fault === 'missing-wasm') {
      assert.equal(result.commands.length, 0);
      assert.match(
        result.error.message,
        fault === 'missing-build' ? /Missing .*geospec\/dist\/index\.mjs/ : /Missing .*geospec_engine_native\.wasm/,
      );
    } else {
      assert.match(
        result.error.message,
        fault === 'registry' ? /did not install from a tarball/ : /differs from current built bytes/,
      );
    }
  });
}
