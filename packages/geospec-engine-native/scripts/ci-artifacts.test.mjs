import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
// oxlint-disable-next-line no-restricted-imports -- Standalone Node host check consumes its co-located CLI without a public package export.
import { ensureDelivery, prepareArtifacts, snapshotDelivery, verifyArtifacts, verifyDelivery } from './ci-artifacts.mjs';

/** @type {(context: import('node:test').TestContext, reusePrefixes: boolean) => void} */
const checkTransport = (context, reusePrefixes) => {
  const scratch = resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts');
  mkdirSync(scratch, { recursive: true });
  const temporary = mkdtempSync(join(scratch, 'transport-'));
  context.after(() => {
    rmSync(temporary, { recursive: true, force: true });
  });
  const producer = join(temporary, 'darwin-checkout');
  const consumer = join(temporary, 'ubuntu-checkout');
  const mixedCache = join(producer, 'node_modules/.cache/geospec-engine-native/delivery-wasm-eh');
  const cargoHome = join(mixedCache, 'cargo');
  const rustPrefix = join(mixedCache, 'rust');
  const packagePath = 'packages/geospec-engine-native';
  const transportPath = 'out/artifacts/geospec-native-engine/ci';
  const snapshotPath = `${packagePath}/bindings/node/types/generated/index.d.ts`;
  const bindingPath = `${packagePath}/bindings/emscripten/src/lib.rs`;
  const generatedPath = `${packagePath}/bindings/node/generated`;
  const mixedPath = `${packagePath}/bindings/emscripten/generated`;
  const trackedPath = `${packagePath}/bench/tracked-fixture.ts`;
  const missingTrackedPath = `${packagePath}/bench/moved-fixture.ts`;
  const addedPath = `${packagePath}/bench/new-fixture.ts`;
  const productPath = process.env.PATH;
  const nativePrefixPath = '/inert-native-node-26.7/bin:/inert-native-tools/bin';
  const wasmSimd = { rustFlags: ['-C', 'target-feature=+simd128'], cxxFlag: '-msimd128', linkFlag: '-msimd128' };
  const wasmEh = {
    compileFlags: ['-fwasm-exceptions', '-sWASM_LEGACY_EXCEPTIONS=1', '-sSUPPORT_LONGJMP=wasm'],
    linkFlags: ['-fwasm-exceptions', '-sWASM_LEGACY_EXCEPTIONS=1', '-sSUPPORT_LONGJMP=wasm'],
  };
  const buildEnvironment = {
    CARGO_ENCODED_RUSTFLAGS: [
      '-C',
      'target-feature=+simd128',
      `--remap-path-prefix=${producer}=tau`,
      `--remap-path-prefix=${cargoHome}=cargo`,
      `--remap-path-prefix=${join(rustPrefix, 'lib/rustlib/src/rust')}=rust-src`,
    ].join('\u001F'),
    CXXFLAGS_wasm32_unknown_emscripten:
      '-msimd128 -frtti -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=1 -sSUPPORT_LONGJMP=wasm',
    GEOSPEC_WASM_SIMD_PROFILE: 'simd128-v1',
  };
  /** @type {(bytes: import('node:crypto').BinaryLike) => string} */
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  /** @type {(path: string, bytes: string | Uint8Array) => void} */
  const put = (path, bytes) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  };
  put(join(producer, snapshotPath), 'fixture declaration\n');
  put(join(producer, bindingPath), 'fixture source\n');
  put(join(producer, trackedPath), 'tracked fixture\n');
  put(join(producer, packagePath, 'scripts/ci-artifacts.mjs'), 'fixture inventory script');
  put(join(producer, packagePath, 'scripts/collect-native-proof.py'), 'inert collector source');
  put(join(producer, packagePath, 'scripts/test_native_proof.py'), 'inert positive fixture source');
  put(join(producer, packagePath, 'project.json'), JSON.stringify({ targets: { 'build-node': { fixture: true } } }));
  put(join(producer, packagePath, 'rust/target/untracked-output'), 'not source');
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
      assert.ok(args.includes('--others'));
      assert.ok(args.includes('--exclude-standard'));
      return [snapshotPath, bindingPath, trackedPath, missingTrackedPath, addedPath].join('\0') + '\0';
    },
  );
  /** @type {string[]} */
  const targets = [];
  const buildCache = join(mixedCache, 'mixed-build-simd128');
  put(join(buildCache, 'attempt-0/commands.json'), 'old attempt must not be selected');
  put(join(mixedCache, 'mixed-inputs.json'), 'historical inputs must not be selected or overwritten');
  const nativeCache = reusePrefixes ? join(producer, 'retained-native-cache') : mixedCache;
  const nativeBuilder = join(
    producer,
    reusePrefixes ? 'native-producing-builder.sh' : `${packagePath}/native/occt/build-occt.sh`,
  );
  let failNode = false;
  let failPrefix = false;
  let changeSource = false;
  let omitReceipt = false;
  let omitCommands = false;
  let observations = 0;
  let pythonFetches = 0;
  let attempt = 0;
  context.mock.method(
    childProcess,
    'spawnSync',
    /** @type {(executable: string, args: string[], options: {cwd: string, env: {PATH?: string, CARGO_HOME: string, GEOSPEC_NODE_MANIFEST: string, GEOSPEC_OCCT_PREFIX: string, GEOSPEC_MIXED_INPUTS: string, GEOSPEC_DELIVERY_CACHE: string, GEOSPEC_OCCT_PRODUCER_BUILDER?: string, GEOSPEC_OCCT_PRODUCER_RECIPE?: string, GIT_CEILING_DIRECTORIES?: string}}) => {status: number}} */ (
      executable,
      args,
      options,
    ) => {
      if (executable === 'rustup') {
        assert.equal(options.env.PATH, productPath);
        assert.deepEqual(args, [
          'run',
          '1.88',
          'cargo',
          'fetch',
          '--locked',
          '--manifest-path',
          join(producer, packagePath, 'bindings/python/Cargo.toml'),
        ]);
        assert.equal(options.cwd, producer);
        assert.equal(options.env.CARGO_HOME, join(producer, 'assembly-cargo-home'));
        assert.equal(observations, 1);
        assert.ok(!targets.includes('assemble-package'));
        pythonFetches += 1;
        return { status: 0 };
      }
      if (executable === 'python3') {
        assert.equal(options.env.PATH, productPath);
        observations += 1;
        assert.equal(args[1], join(producer, packagePath, 'scripts/collect-native-proof.py'));
        /** @type {unknown} */
        const invocationData = JSON.parse(readFileSync(args[3], 'utf8'));
        const invocation =
          /** @type {{exitCode: number, environment: {PATH?: string, CARGO_TARGET_DIR: string, GEOSPEC_OCCT_PREFIX: string}, prefixBuilder: string, addon: {sha256: string}, orchestratorNode: {path: string, version: string, sha256: string}}} */ (
            invocationData
          );
        assert.equal(invocation.exitCode, 0);
        assert.equal(invocation.environment.PATH, productPath);
        assert.equal(invocation.orchestratorNode.path, process.execPath);
        assert.equal(invocation.orchestratorNode.version, process.version);
        assert.equal(invocation.orchestratorNode.sha256, digest(readFileSync(process.execPath)));
        assert.equal(invocation.prefixBuilder, nativeBuilder);
        assert.equal(invocation.environment.GEOSPEC_OCCT_PREFIX, join(nativeCache, 'occt-native/install'));
        assert.ok(invocation.environment.CARGO_TARGET_DIR.includes('/ci-node-target-'));
        assert.equal(
          invocation.addon.sha256,
          digest(readFileSync(join(producer, generatedPath, 'geospec-engine-native.darwin-arm64.node'))),
        );
        put(join(args[4], 'identity-source-proof.json'), JSON.stringify({ fixture: 'inert same-build proof' }));
        return { status: 0 };
      }
      assert.equal(executable, 'pnpm');
      assert.deepEqual(args.slice(0, 2), ['nx', 'run']);
      assert.equal(options.cwd, producer);
      const command = args[2];
      assert.ok(command);
      const target = command.replace('geospec-engine-native:', '');
      targets.push(target);
      assert.equal(options.env.GEOSPEC_OCCT_PREFIX, join(nativeCache, 'occt-native/install'));
      if (target === 'prepare-delivery:reuse-native') {
        assert.equal(options.env.PATH, nativePrefixPath);
        assert.equal(options.env.GEOSPEC_DELIVERY_CACHE, nativeCache);
        assert.equal(options.env.GEOSPEC_OCCT_PRODUCER_BUILDER, nativeBuilder);
        assert.equal(options.env.GEOSPEC_OCCT_PRODUCER_RECIPE, join(producer, 'native-producing-recipe.json'));
        assert.equal(options.env.GIT_CEILING_DIRECTORIES, nativeCache);
        if (failPrefix) {
          return { status: 1 };
        }
      } else {
        assert.equal(options.env.PATH, productPath);
        assert.equal(options.env.GEOSPEC_DELIVERY_CACHE, mixedCache);
        assert.equal(
          options.env.GEOSPEC_OCCT_PRODUCER_BUILDER,
          reusePrefixes ? join(producer, 'mixed-producing-builder.sh') : undefined,
        );
        assert.equal(
          options.env.GEOSPEC_OCCT_PRODUCER_RECIPE,
          reusePrefixes ? join(producer, 'mixed-producing-recipe.json') : undefined,
        );
        assert.equal(options.env.GIT_CEILING_DIRECTORIES, undefined);
      }
      if (target === 'assemble-package') {
        // Nx owns the target's build dependency. The real input inventory must already verify.
        verifyArtifacts(producer);
        assert.equal(observations, 1);
        assert.equal(pythonFetches, 1);
        assert.equal(options.env.CARGO_HOME, join(producer, 'assembly-cargo-home'));
        assert.equal(options.env.GEOSPEC_MIXED_INPUTS, join(producer, transportPath, 'mixed-inputs.json'));
        const assembly = join(producer, 'fresh-assembly');
        for (const name of ['root.tgz', 'darwin-arm64.tgz', 'geospec-engine-native-source-relink.tar.gz']) {
          put(join(assembly, 'tarballs', name), `inert ${name}`);
        }
        return { status: 0, stdout: `ASSEMBLY_ROOT=${assembly}\n` };
      }
      if (target === 'build-node') {
        assert.equal(options.env.GEOSPEC_NODE_MANIFEST, 'bindings/node/Cargo.toml');
        assert.equal(options.env.GEOSPEC_OCCT_PREFIX, join(nativeCache, 'occt-native/install'));
        if (failNode) {
          return { status: 1 };
        }
        for (const name of ['index.js', 'geospec-engine-native.darwin-arm64.node']) {
          put(join(producer, generatedPath, name), `inert fixture ${name}`);
        }
        put(join(producer, generatedPath, 'index.d.ts'), readFileSync(join(producer, snapshotPath)));
      }
      if (target === 'prepare-delivery:inputs') {
        assert.equal(options.env.GEOSPEC_MIXED_INPUTS, join(mixedCache, 'mixed-inputs-simd128.json'));
        put(
          options.env.GEOSPEC_MIXED_INPUTS,
          JSON.stringify(
            {
              schema: 'geospec-mixed-build-inputs-v3',
              sourceRoot: producer,
              sourceRevision: revision,
              preparationCache: mixedCache,
              rustPrefix,
              environment: { CARGO_HOME: cargoHome },
              cache: buildCache,
              occtPrefix: join(mixedCache, 'occt-mixed-simd128/install'),
              output: join(producer, mixedPath),
              rustc: '/inert-tools/rustc',
              cargo: '/inert-tools/cargo',
              emxx: '/inert-tools/em++',
              linkOptimization: 'O3',
              wasmSimd,
              wasmEh,
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
          join(buildCache, `attempt-${attempt}/build-receipt.json`),
          JSON.stringify({
            schema: 'geospec-mixed-build-receipt-v2',
            sourceRoot: producer,
            sourceRevision: revision,
            output: join(producer, mixedPath),
            manifestSha256: digest(readFileSync(options.env.GEOSPEC_MIXED_INPUTS)),
            bindingSha256: digest(readFileSync(join(producer, bindingPath))),
            artifacts,
            wasmSimd,
            wasmEh,
            buildEnvironment,
            profile: 'emscripten-6.0.5-wasm-legacy-exceptions-wasm-sjlj-st-simd128-v1-rust-c656540-panic-abort-link-O3',
          }),
        );
        if (!omitCommands) {
          put(
            join(buildCache, `attempt-${attempt}/commands.json`),
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
                    join(buildCache, 'target'),
                  ],
                  status: 0,
                },
                {
                  executable: '/inert-tools/em++',
                  args: [
                    '-O3',
                    '-msimd128',
                    ...wasmEh.linkFlags,
                    '-o',
                    join(producer, mixedPath, 'geospec_engine_native.mjs'),
                  ],
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
  process.env = {
    ...process.env,
    GEOSPEC_DELIVERY_CACHE: undefined,
    GEOSPEC_NATIVE_DELIVERY_CACHE: reusePrefixes ? nativeCache : undefined,
    GEOSPEC_NATIVE_PREFIX_PATH: nativePrefixPath,
    GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER: reusePrefixes ? nativeBuilder : undefined,
    GEOSPEC_NATIVE_OCCT_PRODUCER_RECIPE: reusePrefixes ? join(producer, 'native-producing-recipe.json') : undefined,
    GEOSPEC_NATIVE_GIT_CEILING_DIRECTORIES: reusePrefixes ? nativeCache : undefined,
    GEOSPEC_OCCT_PRODUCER_BUILDER: reusePrefixes ? join(producer, 'mixed-producing-builder.sh') : undefined,
    GEOSPEC_OCCT_PRODUCER_RECIPE: reusePrefixes ? join(producer, 'mixed-producing-recipe.json') : undefined,
    GIT_CEILING_DIRECTORIES: undefined,
    CARGO_HOME: join(producer, 'assembly-cargo-home'),
  };
  context.after(() => {
    process.env = previousEnvironment;
  });
  assert.throws(() => verifyArtifacts(producer), /Missing GeoSpec artifact inventory/);
  const inventory = ensureDelivery(producer);
  assert.deepEqual(targets, [
    'prepare-delivery:sources',
    'prepare-delivery:tools',
    ...(reusePrefixes
      ? ['prepare-delivery:reuse-native', 'prepare-delivery:reuse-mixed']
      : ['prepare-delivery:prefixes']),
    'build-node',
    'prepare-delivery:inputs',
    'build-wasm',
    'assemble-package',
  ]);
  assert.equal(inventory.artifacts.length, 5);
  assert.ok(inventory.source.files.some((file) => file.path === trackedPath));
  assert.ok(!inventory.source.files.some((file) => file.path === missingTrackedPath));
  rmSync(join(producer, trackedPath));
  assert.throws(() => verifyArtifacts(producer), /source revision\/inputs differ/);
  put(join(producer, trackedPath), 'tracked fixture\n');
  put(join(producer, addedPath), 'new source\n');
  assert.throws(() => verifyArtifacts(producer), /source revision\/inputs differ/);
  rmSync(join(producer, addedPath));
  put(join(producer, trackedPath), 'changed source\n');
  assert.throws(() => verifyArtifacts(producer), /source revision\/inputs differ/);
  put(join(producer, trackedPath), 'tracked fixture\n');
  assert.deepEqual(verifyArtifacts(producer), inventory);
  const builtTargets = [...targets];
  assert.deepEqual(ensureDelivery(producer), inventory);
  assert.deepEqual(targets, builtTargets, 'an unchanged delivery must not invoke a producer');
  const snapshot = snapshotDelivery(producer);
  assert.deepEqual(targets, builtTargets, 'a verified snapshot must not invoke a producer');
  for (const name of ['root.tgz', 'darwin-arm64.tgz', 'geospec-engine-native-source-relink.tar.gz']) {
    const canonical = join(producer, transportPath, 'assembly/tarballs', name);
    const selected = join(snapshot, 'tarballs', name);
    const bytes = readFileSync(canonical);
    assert.deepEqual(readFileSync(selected), bytes);
    put(canonical, 'next producer');
    assert.deepEqual(readFileSync(selected), bytes, 'a package snapshot cannot change with canonical output');
    put(canonical, bytes);
  }
  for (const [name, original] of [
    ['mixed-inputs.json', join(mixedCache, 'mixed-inputs-simd128.json')],
    ['mixed-commands.json', join(buildCache, 'attempt-1/commands.json')],
  ]) {
    assert.deepEqual(readFileSync(join(producer, transportPath, name)), readFileSync(original));
  }
  assert.equal(
    readFileSync(join(mixedCache, 'mixed-inputs.json'), 'utf8'),
    'historical inputs must not be selected or overwritten',
  );
  assert.ok(!inventory.source.files.some((file) => file.path.includes('/target/')));
  cpSync(producer, consumer, { recursive: true });
  rmSync(join(consumer, 'node_modules'), { recursive: true });
  assert.deepEqual(verifyArtifacts(consumer), inventory);
  assert.deepEqual(verifyDelivery(consumer), inventory);
  assert.equal(targets.length, reusePrefixes ? 8 : 7, 'verification must not invoke a producer');
  assert.equal(observations, 1, 'verification must not observe a native module');
  assert.equal(pythonFetches, 1, 'verification must not fetch Cargo material');
  for (const name of ['root.tgz', 'darwin-arm64.tgz', 'geospec-engine-native-source-relink.tar.gz']) {
    const path = join(consumer, transportPath, 'assembly/tarballs', name);
    const bytes = readFileSync(path);
    put(path, 'other assembly');
    assert.throws(() => verifyDelivery(consumer), /archive\/proof hashes or workflow run differ/);
    put(path, bytes);
  }
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
  /** @type {(name: string) => Record<string, unknown>} */
  const transportedRecord = (name) => {
    /** @type {unknown} */
    const value = JSON.parse(readFileSync(join(consumer, transportPath, name), 'utf8'));
    assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
    return /** @type {Record<string, unknown>} */ (value);
  };
  const validInputs = transportedRecord('mixed-inputs.json');
  const validReceipt = transportedRecord('mixed-build-receipt.json');
  const validCommands = readFileSync(join(consumer, transportPath, 'mixed-commands.json'), 'utf8');
  // Recompute all transport joins so each failure checks actual build selection, not a stale hash.
  for (const selection of [
    { inputChanges: { schema: 'geospec-mixed-build-inputs-v2' }, message: /Unsupported mixed input manifest/ },
    { receiptChanges: { schema: 'geospec-mixed-build-receipt-v1' }, message: /Unsupported mixed build receipt/ },
    { inputChanges: { wasmSimd: { ...wasmSimd, cxxFlag: '' } }, message: /inputs lack selected fixed-SIMD/ },
    { receiptChanges: { wasmSimd: { ...wasmSimd, rustFlags: [] } }, message: /receipt fixed-SIMD flags differ/ },
    { inputChanges: { wasmEh: { ...wasmEh, compileFlags: [] } }, message: /inputs lack selected native WASM EH/ },
    { receiptChanges: { wasmEh: { ...wasmEh, linkFlags: [] } }, message: /receipt native WASM EH flags differ/ },
    { inputChanges: { environment: null }, message: /lack the producer environment/ },
    { inputChanges: { environment: { CARGO_HOME: 'relative' } }, message: /lack Cargo source root/ },
    { inputChanges: { rustPrefix: 'relative' }, message: /lack Rust source root/ },
    {
      receiptChanges: { buildEnvironment: { ...buildEnvironment, CARGO_ENCODED_RUSTFLAGS: '' } },
      message: /compile environment differs/,
    },
    {
      receiptChanges: {
        buildEnvironment: { ...buildEnvironment, CARGO_ENCODED_RUSTFLAGS: '-C\u001Ftarget-feature=+simd128' },
      },
      message: /compile environment differs/,
    },
    {
      receiptChanges: {
        buildEnvironment: {
          ...buildEnvironment,
          CARGO_ENCODED_RUSTFLAGS: buildEnvironment.CARGO_ENCODED_RUSTFLAGS.replace('=tau', '=wrong-root'),
        },
      },
      message: /compile environment differs/,
    },
    {
      receiptChanges: { buildEnvironment: { ...buildEnvironment, CXXFLAGS_wasm32_unknown_emscripten: '-fexceptions' } },
      message: /compile environment differs/,
    },
    { inputChanges: { occtPrefix: join(mixedCache, 'occt-mixed/install') }, message: /isolated fixed-SIMD prefix/ },
    { inputChanges: { cache: join(mixedCache, 'mixed-build') }, message: /isolated fixed-SIMD prefix/ },
    { commands: validCommands.replace('"-msimd128",', ''), message: /link profile\/output differs/ },
    { commands: validCommands.replace('"-fwasm-exceptions",', ''), message: /link profile\/output differs/ },
    { commands: validCommands.replace('"-msimd128"', '"-msimd128", "-pthread"'), message: /unselected threading/ },
    { commands: validCommands.replace('"-msimd128"', '"-msimd128", "-ffast-math"'), message: /floating-point flags/ },
    { commands: validCommands.replace('"-msimd128"', '"-msimd128", "-mno-simd128"'), message: /floating-point flags/ },
  ]) {
    const { inputChanges, receiptChanges, commands, message } = {
      inputChanges: {},
      receiptChanges: {},
      commands: validCommands,
      ...selection,
    };
    const inputs = JSON.stringify({ ...validInputs, ...inputChanges });
    const receipt = JSON.stringify({ ...validReceipt, ...receiptChanges, manifestSha256: digest(inputs) });
    const changedInventory = { ...inventory };
    for (const [key, name, bytes] of [
      ['mixedInputs', 'mixed-inputs.json', inputs],
      ['mixedReceipt', 'mixed-build-receipt.json', receipt],
      ['mixedCommands', 'mixed-commands.json', commands],
    ]) {
      put(join(consumer, transportPath, name), bytes);
      changedInventory[key] = {
        path: `${transportPath}/${name}`,
        bytes: Buffer.byteLength(bytes),
        sha256: digest(bytes),
      };
    }
    put(inventoryFile, JSON.stringify(changedInventory));
    assert.throws(() => verifyArtifacts(consumer), message);
  }
  for (const name of ['mixed-inputs.json', 'mixed-build-receipt.json', 'mixed-commands.json']) {
    cpSync(join(producer, transportPath, name), join(consumer, transportPath, name));
  }
  put(inventoryFile, JSON.stringify(inventory));
  put(inventoryFile, JSON.stringify({ ...inventory, artifacts: inventory.artifacts.slice(1) }));
  assert.throws(() => verifyArtifacts(consumer), /membership\/bytes\/hashes differ/);
  put(inventoryFile, JSON.stringify(inventory));
  put(join(consumer, transportPath, 'mixed-build-receipt.json'), '{}');
  assert.throws(() => verifyArtifacts(consumer), /mixedReceipt changed during transport/);
  put(join(producer, transportPath, 'assembly/tarballs/root.tgz'), 'corrupt delivery must not be reused');
  failNode = true;
  assert.throws(() => ensureDelivery(producer), /build-node failed/);
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
  if (reusePrefixes) {
    changeSource = false;
    failPrefix = true;
    targets.length = 0;
    assert.throws(() => prepareArtifacts(producer), /prepare-delivery:reuse-native failed/);
    assert.equal(existsSync(join(producer, transportPath, 'inventory.json')), false);
    assert.ok(!targets.includes('build-node'));
    assert.ok(!targets.includes('build-wasm'));
    assert.ok(!targets.includes('assemble-package'));
  }
};

await test('default cold preparation transports complete artifacts without loading a product', (context) => {
  checkTransport(context, false);
});

await test('independent retained prefixes transport complete artifacts without loading a product', (context) => {
  checkTransport(context, true);
});

/** @type {(context: import('node:test').TestContext) => {root: string, cli: string, lock: string, bin: string, marker: string}} */
const isolatedLockFixture = (context) => {
  const scratch = resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'lock-cli-'));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const cli = join(root, 'packages/geospec-engine-native/scripts/ci-artifacts.mjs');
  const lock = join(root, 'node_modules/.cache/geospec-engine-native/ci-artifacts.lock');
  const bin = join(root, 'bin');
  const marker = join(root, 'marker');
  mkdirSync(dirname(cli), { recursive: true });
  mkdirSync(dirname(lock), { recursive: true });
  mkdirSync(bin);
  copyFileSync(resolve(import.meta.dirname, 'ci-artifacts.mjs'), cli);
  for (const name of ['collect-native-proof.py', 'test_native_proof.py']) {
    writeFileSync(join(dirname(cli), name), 'fixture source');
  }
  return { root, cli, lock, bin, marker };
};

/** @type {(path: string, contents: string) => void} */
const executable = (path, contents) => {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
};

/** @type {(path: string) => Promise<void>} */
const waitForFile = async (path) => {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    if (existsSync(path)) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- Each poll observes the active subprocess after the prior tick.
    await delay(20);
  }
  assert.fail(`Timed out waiting for ${path}`);
};

await test('should let a nested verifier complete under the exact producer lock', { skip: process.platform !== 'darwin' }, async (context) => {
  const { cli, lock, marker } = isolatedLockFixture(context);
  const holder = childProcess.spawn('/bin/sh', [
    '-c', 'set -e; exec 9>> "$1"; lockf /dev/fd/9; touch "$2"; sleep 3', 'lock-holder', lock, marker,
  ], { stdio: 'ignore' });
  context.after(() => {
    holder.kill('SIGTERM');
  });
  await waitForFile(marker);
  assert.notEqual(childProcess.spawnSync('lockf', ['-t', '0', lock, '/usr/bin/true']).status, 0);
  const result = childProcess.spawnSync(process.execPath, [cli, 'verify'], { encoding: 'utf8', timeout: 1000 });
  assert.equal(result.status, 1, `Verifier did not complete: ${result.error?.message ?? result.signal}`);
  assert.match(result.stderr, /Missing GeoSpec artifact inventory/);
  const absent = childProcess.spawnSync(process.execPath, [cli, 'prepare-locked'], {
    encoding: 'utf8', env: { ...process.env, GEOSPEC_PRODUCER_LOCK_FD: '9' },
  });
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /lock descriptor differs|bad file descriptor|ebadf/i);
  const wrongFile = join(dirname(lock), 'wrong.lock');
  const wrongFd = openSync(wrongFile, 'a+');
  try {
    const wrong = childProcess.spawnSync(process.execPath, [cli, 'prepare-locked'], {
      encoding: 'utf8', env: { ...process.env, GEOSPEC_PRODUCER_LOCK_FD: '9' },
      stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', wrongFd],
    });
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /lock descriptor differs/);
  } finally {
    closeSync(wrongFd);
  }
  const unlockedFd = openSync(lock, 'a+');
  try {
    const unavailable = childProcess.spawnSync(process.execPath, [cli, 'prepare-locked'], {
      encoding: 'utf8', env: { ...process.env, GEOSPEC_PRODUCER_LOCK_FD: '9' },
      stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', unlockedFd],
    });
    assert.equal(unavailable.status, 1);
    assert.match(unavailable.stderr, /producer lock unavailable/);
  } finally {
    closeSync(unlockedFd);
  }
});

await test('should serialize two actual CLI producers', { skip: process.platform !== 'darwin' }, async (context) => {
  const { root, cli, bin, marker } = isolatedLockFixture(context);
  const events = join(root, 'events');
  executable(join(bin, 'git'), `#!/bin/sh
printf '%s-start\\n' "$LABEL" >> "$EVENTS"
touch "$MARKER"
sleep 0.3
printf '%s-end\\n' "$LABEL" >> "$EVENTS"
exit 1
`);
  /** @type {(label: string) => import('node:child_process').ChildProcess} */
  const start = (label) => childProcess.spawn(process.execPath, [cli, 'prepare'], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LABEL: label, EVENTS: events, MARKER: marker },
    stdio: 'ignore',
  });
  const first = start('A');
  const firstExit = new Promise((resolve) => {
    first.once('exit', resolve);
  });
  await waitForFile(marker);
  const second = start('B');
  const secondExit = new Promise((resolve) => {
    second.once('exit', resolve);
  });
  assert.deepEqual(await Promise.all([firstExit, secondExit]), [1, 1]);
  assert.deepEqual(readFileSync(events, 'utf8').trim().split('\n'), ['A-start', 'A-end', 'B-start', 'B-end']);
});

await test('should retain the actual CLI lock in an active child after coordinator termination', { skip: process.platform !== 'darwin' }, async (context) => {
  const { root, cli, lock, bin, marker } = isolatedLockFixture(context);
  const done = join(root, 'done');
  const producerPid = join(root, 'producer-pid');
  executable(join(bin, 'git'), `#!/bin/sh
case "$1" in
  ls-files) exit 0 ;;
  rev-parse) printf '%040d\\n' 0; exit 0 ;;
esac
exit 1
`);
  executable(join(bin, 'pnpm'), `#!/bin/sh
printf '%s\\n' "$PPID" > "$PRODUCER_PID"
touch "$MARKER"
sleep 0.7
touch "$DONE"
exit 1
`);
  const coordinator = childProcess.spawn(process.execPath, [cli, 'prepare'], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MARKER: marker, DONE: done, PRODUCER_PID: producerPid },
    stdio: 'ignore',
  });
  context.after(() => {
    if (coordinator.exitCode === null) {
      coordinator.kill('SIGTERM');
    }
  });
  await waitForFile(marker);
  process.kill(Number(readFileSync(producerPid, 'utf8')), 'SIGTERM');
  const contender = () => childProcess.spawnSync('lockf', ['-t', '0', lock, '/usr/bin/true']);
  assert.notEqual(contender().status, 0, 'Active child lost the producer lock');
  await waitForFile(done);
  for (let attempt = 0; attempt < 250 && contender().status !== 0; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Wait for the active child to close its inherited descriptor.
    await delay(20);
  }
  assert.equal(contender().status, 0, 'Producer lock remained after the child exited');
});
