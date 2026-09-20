import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import process from 'node:process';
// oxlint-disable-next-line no-restricted-imports -- Standalone Node host check consumes its co-located CLI without a public package export.
import { prepareArtifacts, verifyArtifacts } from './ci-artifacts.mjs';

await test('complete transport relocates, rejects missing/stale bytes, and never loads a product', (context) => {
  const scratch = resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts');
  mkdirSync(scratch, { recursive: true });
  const temporary = mkdtempSync(join(scratch, 'transport-'));
  context.after(() => {
    rmSync(temporary, { recursive: true, force: true });
  });
  const producer = join(temporary, 'darwin-checkout');
  const consumer = join(temporary, 'ubuntu-checkout');
  const packagePath = 'packages/geospec-engine-native';
  const transportPath = 'out/artifacts/geospec-native-engine/ci';
  const snapshotPath = `${packagePath}/bindings/node/types/generated/index.d.ts`;
  const bindingPath = `${packagePath}/bindings/emscripten/src/lib.rs`;
  const generatedPath = `${packagePath}/bindings/node/generated`;
  const mixedPath = `${packagePath}/bindings/emscripten/generated`;
  /** @type {(bytes: import('node:crypto').BinaryLike) => string} */
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  /** @type {(path: string, bytes: string | Uint8Array) => void} */
  const put = (path, bytes) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  };
  put(join(producer, snapshotPath), 'fixture declaration\n');
  put(join(producer, bindingPath), 'fixture source\n');
  put(join(producer, packagePath, 'scripts/ci-artifacts.mjs'), 'fixture inventory script');
  put(join(producer, packagePath, 'rust/target/untracked-output'), 'not source');
  put(join(producer, 'mixed-cache/attempt-0/commands.json'), 'old attempt must not be selected');
  let revision = 'a'.repeat(40);
  context.mock.method(
    childProcess,
    'execFileSync',
    /** @type {(executable: string, args: string[]) => string} */ (executable, args) => {
      assert.equal(executable, 'git');
      if (args[0] === 'rev-parse') {
        return `${revision}\n`;
      }
      assert.ok(args.includes('--cached'));
      assert.ok(!args.includes('--others'));
      return `${snapshotPath}\0${bindingPath}\0`;
    },
  );
  /** @type {string[]} */
  const targets = [];
  let failNode = false;
  let changeSource = false;
  let omitReceipt = false;
  let omitCommands = false;
  let attempt = 0;
  context.mock.method(
    childProcess,
    'spawnSync',
    /** @type {(executable: string, args: string[], options: {cwd: string, env: {GEOSPEC_NODE_MANIFEST: string, GEOSPEC_OCCT_PREFIX: string, GEOSPEC_MIXED_INPUTS: string}}) => {status: number}} */ (
      executable,
      args,
      options,
    ) => {
      assert.equal(executable, 'pnpm');
      assert.deepEqual(args.slice(0, 2), ['nx', 'run']);
      assert.equal(options.cwd, producer);
      const command = args[2];
      assert.ok(command);
      const target = command.replace('geospec-engine-native:', '');
      targets.push(target);
      if (target === 'build-node') {
        assert.equal(options.env.GEOSPEC_NODE_MANIFEST, 'bindings/node/Cargo.toml');
        assert.equal(
          options.env.GEOSPEC_OCCT_PREFIX,
          join(producer, 'node_modules/.cache/geospec-engine-native/delivery/occt-native/install'),
        );
        if (failNode) {
          return { status: 1 };
        }
        for (const name of ['index.js', 'geospec-engine-native.darwin-arm64.node']) {
          put(join(producer, generatedPath, name), `inert fixture ${name}`);
        }
        put(join(producer, generatedPath, 'index.d.ts'), readFileSync(join(producer, snapshotPath)));
      }
      if (target === 'prepare-delivery:inputs') {
        assert.ok(typeof options.env.GEOSPEC_MIXED_INPUTS === 'string');
        put(
          options.env.GEOSPEC_MIXED_INPUTS,
          JSON.stringify(
            {
              schema: 'geospec-mixed-build-inputs-v2',
              sourceRoot: producer,
              sourceRevision: revision,
              cache: join(producer, 'mixed-cache'),
              output: join(producer, mixedPath),
              rustc: '/inert-tools/rustc',
              cargo: '/inert-tools/cargo',
              emxx: '/inert-tools/em++',
              linkOptimization: 'O3',
            },
            null,
            2,
          ) + '\n',
        );
      }
      if (target === 'build-wasm' && !omitReceipt) {
        assert.ok(typeof options.env.GEOSPEC_MIXED_INPUTS === 'string');
        const artifacts = ['geospec_engine_native.mjs', 'geospec_engine_native.wasm'].map((name) => {
          const path = join(producer, mixedPath, name);
          const bytes = `inert fixture ${name}`;
          put(path, bytes);
          return { path, bytes: Buffer.byteLength(bytes), sha256: digest(bytes) };
        });
        attempt += 1;
        put(
          join(producer, `mixed-cache/attempt-${attempt}/build-receipt.json`),
          JSON.stringify({
            sourceRoot: producer,
            sourceRevision: revision,
            output: join(producer, mixedPath),
            manifestSha256: digest(readFileSync(options.env.GEOSPEC_MIXED_INPUTS)),
            bindingSha256: digest(readFileSync(join(producer, bindingPath))),
            artifacts,
          }),
        );
        if (!omitCommands) {
          put(
            join(producer, `mixed-cache/attempt-${attempt}/commands.json`),
            JSON.stringify(
              [
                { executable: '/inert-tools/rustc', args: ['-vV'], status: 0 },
                { executable: '/inert-tools/em++', args: ['--version'], status: 0 },
                {
                  executable: '/inert-tools/cargo',
                  args: [
                    'build',
                    '--manifest-path',
                    join(producer, packagePath, 'bindings/emscripten/Cargo.toml'),
                    '--locked',
                    '--offline',
                    '--release',
                    '--target',
                    'wasm32-unknown-emscripten',
                    '--target-dir',
                    join(producer, 'mixed-cache/target'),
                  ],
                  status: 0,
                },
                {
                  executable: '/inert-tools/em++',
                  args: ['-O3', '-o', join(producer, mixedPath, 'geospec_engine_native.mjs')],
                  status: 0,
                },
              ],
              null,
              2,
            ) + '\n',
          );
        }
        if (changeSource) {
          put(join(producer, bindingPath), 'changed during build');
        }
      }
      return { status: 0 };
    },
  );
  // No environment override may redirect even mocked preparation outside scratch.
  const previousEnvironment = process.env;
  process.env = { ...process.env, GEOSPEC_DELIVERY_CACHE: undefined };
  context.after(() => {
    process.env = previousEnvironment;
  });
  assert.throws(() => verifyArtifacts(producer), /Missing GeoSpec artifact inventory/);
  const inventory = prepareArtifacts(producer);
  assert.deepEqual(targets, [
    'prepare-delivery:sources',
    'prepare-delivery:tools',
    'prepare-delivery:prefixes',
    'build-node',
    'prepare-delivery:inputs',
    'build-wasm',
  ]);
  assert.equal(inventory.artifacts.length, 5);
  for (const [name, original] of [
    ['mixed-inputs.json', 'node_modules/.cache/geospec-engine-native/delivery/mixed-inputs.json'],
    ['mixed-commands.json', 'mixed-cache/attempt-1/commands.json'],
  ]) {
    assert.deepEqual(readFileSync(join(producer, transportPath, name)), readFileSync(join(producer, original)));
  }
  assert.ok(!inventory.source.files.some((file) => file.path.includes('/target/')));
  cpSync(producer, consumer, { recursive: true });
  rmSync(join(consumer, 'mixed-cache'), { recursive: true });
  rmSync(join(consumer, 'node_modules'), { recursive: true });
  assert.deepEqual(verifyArtifacts(consumer), inventory);
  assert.equal(targets.length, 6, 'verification must not invoke a producer');
  for (const file of inventory.artifacts) {
    const path = join(consumer, file.path);
    const bytes = readFileSync(path);
    rmSync(path);
    assert.throws(() => verifyArtifacts(consumer), /Missing artifact\/input/);
    put(path, '');
    assert.throws(() => verifyArtifacts(consumer), /Empty artifact/);
    put(path, bytes);
  }
  put(join(consumer, generatedPath, 'extra.js'), 'unexpected copied output');
  assert.throws(() => verifyArtifacts(consumer), /Unexpected package-copy artifact/);
  rmSync(join(consumer, generatedPath, 'extra.js'));
  put(join(consumer, generatedPath, 'index.d.ts'), 'different declaration');
  assert.throws(() => verifyArtifacts(consumer), /declaration differs/);
  cpSync(join(producer, generatedPath), join(consumer, generatedPath), { recursive: true });
  put(join(consumer, mixedPath, 'geospec_engine_native.wasm'), 'different output');
  assert.throws(() => verifyArtifacts(consumer), /membership\/bytes\/hashes differ/);
  cpSync(join(producer, mixedPath), join(consumer, mixedPath), { recursive: true });
  put(join(consumer, bindingPath), 'changed input');
  assert.throws(() => verifyArtifacts(consumer), /source revision\/inputs differ/);
  put(join(consumer, bindingPath), 'fixture source\n');
  revision = 'b'.repeat(40);
  assert.throws(() => verifyArtifacts(consumer), /source revision\/inputs differ/);
  revision = 'a'.repeat(40);
  const inventoryFile = join(consumer, transportPath, 'inventory.json');
  for (const name of ['mixed-inputs.json', 'mixed-commands.json']) {
    const path = join(consumer, transportPath, name);
    const bytes = readFileSync(path);
    rmSync(path);
    assert.throws(() => verifyArtifacts(consumer), /Missing artifact\/input/);
    put(path, '{}');
    assert.throws(() => verifyArtifacts(consumer), /changed during transport/);
    put(path, bytes);
  }
  // Even an updated transport hash must still join the selected manifest and command tools to the receipt.
  for (const [key, name, replacement, message] of [
    ['mixedInputs', 'mixed-inputs.json', '{}', /receipt\/input-manifest hash differs/],
    ['mixedCommands', 'mixed-commands.json', '[]', /Incomplete mixed commands/],
    [
      'mixedCommands',
      'mixed-commands.json',
      readFileSync(join(consumer, transportPath, 'mixed-commands.json'), 'utf8').replace(
        '/inert-tools/cargo',
        '/other/cargo',
      ),
      /command\/tool selection differs/,
    ],
  ]) {
    const path = join(consumer, transportPath, name);
    const bytes = readFileSync(path);
    put(path, replacement);
    put(
      inventoryFile,
      JSON.stringify({
        ...inventory,
        [key]: {
          path: `${transportPath}/${name}`,
          bytes: Buffer.byteLength(replacement),
          sha256: digest(replacement),
        },
      }),
    );
    assert.throws(() => verifyArtifacts(consumer), message);
    put(path, bytes);
    put(inventoryFile, JSON.stringify(inventory));
  }
  put(inventoryFile, JSON.stringify({ ...inventory, artifacts: inventory.artifacts.slice(1) }));
  assert.throws(() => verifyArtifacts(consumer), /membership\/bytes\/hashes differ/);
  put(inventoryFile, JSON.stringify(inventory));
  put(join(consumer, transportPath, 'mixed-build-receipt.json'), '{}');
  assert.throws(() => verifyArtifacts(consumer), /mixedReceipt changed during transport/);
  failNode = true;
  assert.throws(() => prepareArtifacts(producer), /build-node failed/);
  assert.equal(existsSync(join(producer, transportPath, 'inventory.json')), false);
  failNode = false;
  omitReceipt = true;
  assert.throws(() => prepareArtifacts(producer), /exactly one new mixed build attempt/);
  assert.equal(existsSync(join(producer, transportPath, 'inventory.json')), false);
  omitReceipt = false;
  omitCommands = true;
  assert.throws(() => prepareArtifacts(producer), /ENOENT.*commands.json/);
  assert.equal(existsSync(join(producer, transportPath, 'inventory.json')), false);
  omitCommands = false;
  changeSource = true;
  assert.throws(() => prepareArtifacts(producer), /sources changed during production/);
  assert.equal(existsSync(join(producer, transportPath, 'inventory.json')), false);
});
