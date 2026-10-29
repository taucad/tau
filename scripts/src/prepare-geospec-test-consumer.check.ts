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

void test('should declare the complete normal consumer build closure', async () => {
  const project = JSON.parse(readFileSync(new URL('../project.json', import.meta.url), 'utf8')) as {
    targets: { 'prepare-geospec-test-consumer': { dependsOn: Array<{ target: string; projects: string[] }> } };
  };
  const roots = new Set(
    project.targets['prepare-geospec-test-consumer'].dependsOn
      .filter(({ target }) => target === 'build')
      .flatMap(({ projects }) => projects),
  );
  const closure = publishableClosure(await workspace({ fresh: true }), ['cli']);
  assert.deepEqual(
    closure.filter((name) => !roots.has(name)),
    [],
    'Normal consumer target omits publishable build prerequisites',
  );
});

type Manifest = {
  name: string;
  version: string;
  main?: string;
  exports?: Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
type CommandOptions = { cwd: string; env: Record<string, string> };
type RecordedCommand = { command: string; args: string[]; options: CommandOptions };
type Receipt = {
  consumerRoot: string;
  registry: Array<{ name: string; version: string; resolved: string; integrity: string }>;
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
};
type Fault =
  | 'missing-build'
  | 'missing-wasm'
  | 'registry'
  | 'stale-build'
  | 'engine-pin'
  | 'engine-peer'
  | 'engine-integrity'
  | 'engine-tarball'
  | 'geospec-pin'
  | 'geospec-peer'
  | 'geospec-integrity'
  | 'geospec-tarball'
  | 'geospec-payload';

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
const engine = 'geospec-engine';
const enginePin = '0.1.0-next.19';
const engineIntegrity = `sha512-${createHash('sha512').update('inert engine registry tarball').digest('base64')}`;
const enginePayload = [
  'dist/node.mjs',
  'dist/native/index.js',
  'dist/bindings/mixed-wasm/geospec_engine_native.mjs',
  'dist/bindings/mixed-wasm/geospec_engine_native.wasm',
  'licenses/SOURCE-RELINK.json',
];
const geospec = 'geospec';
const geospecPin = '0.1.0-next.19';
const geospecIntegrity = `sha512-${createHash('sha512').update('inert geospec registry tarball').digest('base64')}`;
const geospecPayload = ['dist/index.mjs', 'dist/cli/main.mjs', 'agent/skills.json', 'agent/resources.js'];
const registryUrl = (name: string, version: string): string =>
  `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;
const manifest = (name: string): Manifest => ({ name, version: '0.1.0', exports: { '.': './dist/index.mjs' } });

const prepare = async (fault?: Fault) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const directories = new Set(['/repo', '/tmp']);
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
    {
      name: 'support',
      root: 'packages/support',
      manifest: {
        ...manifest('@taucad/support'),
        // A caret peer never admits the prerelease pin, so it is another engine or geospec.
        ...(fault === 'engine-peer' ? { peerDependencies: { [engine]: '^0.1.0' } } : {}),
        ...(fault === 'geospec-peer' ? { peerDependencies: { [geospec]: '^0.1.0' } } : {}),
      },
    },
    {
      name: 'cli',
      root: 'packages/cli',
      manifest: {
        ...manifest('@taucad/cli'),
        dependencies: {
          '@taucad/support': '0.1.0',
          [geospec]: fault === 'geospec-pin' ? '0.1.0-next.18' : geospecPin,
          [engine]: fault === 'engine-pin' ? '0.1.0-next.18' : enginePin,
        },
      },
    },
  ];
  for (const project of projects) {
    add(`/repo/${project.root}/package.json`, project.manifest);
    add(`/repo/${project.root}/dist/index.mjs`, 'inert built bytes');
  }
  add('/repo/scripts/src/prepare-geospec-test-consumer.ts', source);
  add(
    '/repo/pnpm-workspace.yaml',
    `catalog:\n  vitest: 4.1.11\n  ${engine}: ${enginePin}\n  ${geospec}: ${geospecPin}\n`,
  );
  add(
    '/repo/pnpm-lock.yaml',
    [
      'packages:',
      `  ${engine}@${enginePin}:`,
      `    resolution: {integrity: ${engineIntegrity}}`,
      `  ${geospec}@${geospecPin}:`,
      `    resolution: {integrity: ${geospecIntegrity}}`,
      '',
    ].join('\n'),
  );
  const archive = (name: string, metadata: Manifest): void => {
    add(name, `inert tarball ${metadata.name}`);
    archives.set(name, metadata);
  };
  if (fault === 'missing-build') {
    files.delete('/repo/packages/cli/dist/index.mjs');
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
      argv: ['node', 'inert-driver', '/out/receipt.json'],
      env: {},
      platform: 'linux',
      arch: 'x64',
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
      assert.deepEqual([...names], ['cli']);
      return ['support', 'cli'];
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
          const packed = JSON.parse(new TextDecoder().decode(read(path.join(options.cwd, 'package.json')))) as Manifest;
          const renamed =
            fault === 'engine-tarball' && packed.name === '@taucad/cli'
              ? engine
              : fault === 'geospec-tarball' && packed.name === '@taucad/support'
                ? geospec
                : packed.name;
          archive(path.join(args[2]!, 'packed.tgz'), { ...packed, name: renamed });
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
          const requested = commandArguments.slice(4);
          assert.deepEqual(
            requested.slice(-2),
            [`${engine}@${enginePin}`, `${geospec}@${geospecPin}`],
            'Both GeoSpec packages install at exactly their catalog pins',
          );
          const registry = [
            { name: engine, version: enginePin, integrity: engineIntegrity, payload: enginePayload, prefix: 'engine' },
            {
              name: geospec,
              version: geospecPin,
              integrity: geospecIntegrity,
              payload: geospecPayload,
              prefix: 'geospec',
            },
          ];
          for (const { name, version, integrity, payload, prefix } of registry) {
            const root = path.join(options.cwd, 'node_modules', name);
            add(path.join(root, 'package.json'), { name, version });
            for (const entry of payload) {
              const missing =
                (fault === 'missing-wasm' && entry === enginePayload[3]) ||
                (fault === 'geospec-payload' && name === geospec && entry === geospecPayload[2]);
              if (!missing) {
                add(path.join(root, entry), 'inert registry payload bytes');
              }
            }
            packages[`node_modules/${name}`] = {
              version,
              resolved: registryUrl(name, version),
              integrity: fault === `${prefix}-integrity` ? 'sha512-substituted' : integrity,
            };
          }
          for (const name of requested.slice(0, -2)) {
            const metadata = archives.get(name);
            assert.ok(metadata, `Missing inert archive ${name}`);
            const root = path.join(options.cwd, 'node_modules', metadata.name);
            add(path.join(root, 'package.json'), metadata);
            add(
              path.join(root, 'dist/index.mjs'),
              fault === 'stale-build' && metadata.name === '@taucad/cli' ? 'stale bytes' : 'inert built bytes',
            );
            packages[`node_modules/${metadata.name}`] = {
              version: metadata.version,
              resolved:
                fault === 'registry' && metadata.name === '@taucad/cli'
                  ? 'https://registry.invalid/cli.tgz'
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

void test('should prepare one local-tarball closure with the pinned registry GeoSpec packages on any host without probes', async () => {
  const result = await prepare();
  assert.ifError(result.error);
  assert.equal(result.commands.filter((command) => command.command === 'npm').length, 2);
  assert.equal(result.commands.filter((command) => command.command === 'pnpm').length, 2);
  assert.ok(result.receipt);
  assert.equal(result.receipt.installed.length, 4);
  assert.deepEqual(result.receipt.registry, [
    { name: engine, version: enginePin, resolved: registryUrl(engine, enginePin), integrity: engineIntegrity },
    { name: geospec, version: geospecPin, resolved: registryUrl(geospec, geospecPin), integrity: geospecIntegrity },
  ]);
  assert.equal(result.receipt.source.revision, 'inert-revision');
  assert.ok(result.receipt.consumerRoot.startsWith('/tmp/'));
  assert.equal(result.receipt.packages.length, 2);
  assert.equal(result.receipt.frameworkSuccessor.version, '4.1.11');
  assert.equal(result.receipt.frameworkSuccessor.unchangedPackages.length, 4);
  assert.equal(result.receipt.lock.sha256, result.receipt.frameworkSuccessor.lock.sha256);
  assert.notEqual(result.receipt.lock.sha256, result.receipt.frameworkSuccessor.initialLock.sha256);
  const initial = JSON.parse(
    Buffer.from(result.files.get('/tmp/tau-geospec-consumer-inert/receipt.json')!).toString(),
  ) as Receipt;
  assert.equal(initial.lock.sha256, result.receipt.frameworkSuccessor.initialLock.sha256);
  assert.equal(initial.frameworkSuccessor, undefined);
});
void test('should install the current Tau CLI, whose exporter the pool loads, through the same local tarball closure', async () => {
  const result = await prepare();
  assert.ifError(result.error);
  assert.ok(result.receipt?.installed.some((entry) => entry.name === '@taucad/cli'));
});
const faultMessages: Record<Fault, RegExp> = {
  'missing-build': /Missing .*cli\/dist\/index\.mjs/,
  'missing-wasm': /Missing .*geospec-engine\/dist\/bindings\/mixed-wasm\/geospec_engine_native\.wasm/,
  registry: /did not install from a tarball/,
  'stale-build': /differs from current built bytes/,
  'engine-pin': /@taucad\/cli pins another geospec-engine/,
  'engine-peer': /@taucad\/support pins another geospec-engine/,
  'engine-integrity': /geospec-engine integrity differs from pnpm-lock\.yaml/,
  'engine-tarball': /geospec-engine must come from the registry/,
  'geospec-pin': /@taucad\/cli pins another geospec$/,
  'geospec-peer': /@taucad\/support pins another geospec$/,
  'geospec-integrity': /^geospec integrity differs from pnpm-lock\.yaml/,
  'geospec-tarball': /^geospec must come from the registry/,
  'geospec-payload': /Missing .*node_modules\/geospec\/agent\/skills\.json/,
};
for (const fault of Object.keys(faultMessages) as Fault[]) {
  void test(`should reject ${fault} without a successful receipt`, async () => {
    const result = await prepare(fault);
    assert.ok(result.error instanceof assert.AssertionError);
    assert.equal(result.receipt, undefined);
    if (fault === 'missing-build') {
      assert.equal(result.commands.length, 0);
    }
    assert.match(result.error.message, faultMessages[fault]);
  });
}
