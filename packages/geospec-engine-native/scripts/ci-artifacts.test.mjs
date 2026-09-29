import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { test } from 'node:test';
import process from 'node:process';
/* oxlint-disable no-restricted-imports -- Standalone Node host check consumes its co-located CLI without a public package export. */
import {
  darwinGroupAlive,
  deliveryCacheKey,
  ensureDelivery,
  prepareArtifacts,
  recoverExitedProducer,
  snapshotDelivery,
  verifyArtifacts,
  verifyDelivery,
  withProducerMarker,
} from './ci-artifacts.mjs';
/* oxlint-enable no-restricted-imports -- End co-located CLI import exception. */

void test('malformed process listings cannot prove a producer group exited', (context) => {
  const listing = context.mock.method(childProcess, 'spawnSync', () => ({
    status: 0,
    stdout: '123 S\nmalformed row\n',
  }));
  assert.throws(() => darwinGroupAlive(123), /Malformed process listing/);
  listing.mock.mockImplementation(() => ({ status: 0, stdout: undefined }));
  assert.throws(() => darwinGroupAlive(123), /Could not prove GeoSpec producer group exit/);
});

void test('cache key follows source and selected toolchain without generated outputs', (context) => {
  const scratch = resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'cache-key-'));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const source = 'packages/geospec-engine-native/native/occt/patches/fixture.patch';
  for (const name of [
    source,
    'packages/geospec-engine-native/scripts/ci-artifacts.mjs',
    'packages/geospec-engine-native/scripts/collect-native-proof.py',
    'packages/geospec-engine-native/scripts/test_native_proof.py',
  ]) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, name);
  }
  context.mock.method(
    childProcess,
    'execFileSync',
    /** @type {(executable: string, args: string[]) => string} */ (_executable, args) =>
      args[0] === 'rev-parse' ? `${'a'.repeat(40)}\n` : `${source}\0`,
  );
  let generation = 'a'.repeat(64);
  context.mock.method(
    childProcess,
    'spawnSync',
    /** @type {(executable: string, args: string[]) => {status: number, stdout: string}} */ (_executable, _args) => ({
      status: 0,
      stdout: `${generation}\n`,
    }),
  );
  const original = deliveryCacheKey(root);
  writeFileSync(join(root, source), 'changed patch');
  const changedSource = deliveryCacheKey(root);
  assert.notEqual(changedSource, original);
  generation = 'b'.repeat(64);
  assert.notEqual(deliveryCacheKey(root), changedSource);
  const builder = join(root, 'external/build.sh');
  mkdirSync(dirname(builder), { recursive: true });
  writeFileSync(builder, 'builder');
  const previousBuilder = process.env['GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER'];
  process.env['GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER'] = builder;
  context.after(() => {
    if (previousBuilder === undefined) {
      delete process.env['GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER'];
    } else {
      process.env['GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER'] = previousBuilder;
    }
  });
  const selectedBuilder = deliveryCacheKey(root);
  writeFileSync(join(dirname(builder), 'fix.patch'), 'patch');
  const selectedPatch = deliveryCacheKey(root);
  assert.notEqual(selectedPatch, selectedBuilder);
  writeFileSync(join(dirname(builder), 'source-manifest.json'), '{}');
  const selectedManifest = deliveryCacheKey(root);
  assert.notEqual(selectedManifest, selectedPatch);
  const previousProfile = process.env['CARGO_PROFILE_RELEASE_DEBUG'];
  process.env['CARGO_PROFILE_RELEASE_DEBUG'] = '2';
  context.after(() => {
    if (previousProfile === undefined) {
      delete process.env['CARGO_PROFILE_RELEASE_DEBUG'];
    } else {
      process.env['CARGO_PROFILE_RELEASE_DEBUG'] = previousProfile;
    }
  });
  const selectedProfile = deliveryCacheKey(root);
  assert.notEqual(selectedProfile, selectedManifest);
  const config = join(root, '.cargo/config.toml');
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, '[profile.release]\ndebug = 0\n');
  const selectedConfig = deliveryCacheKey(root);
  assert.notEqual(selectedConfig, selectedProfile);
  writeFileSync(config, '[profile.release]\ndebug = 1\n');
  assert.notEqual(deliveryCacheKey(root), selectedConfig);
  const secondRoot = mkdtempSync(join(scratch, 'cache-key-peer-'));
  context.after(() => {
    rmSync(secondRoot, { recursive: true, force: true });
  });
  cpSync(root, secondRoot, { recursive: true });
  delete process.env['GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER'];
  assert.equal(deliveryCacheKey(secondRoot), deliveryCacheKey(root), 'workspace Cargo config uses relative identity');
  process.env['GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER'] = builder;
  const wrapper = join(root, 'external/rustc-wrapper');
  writeFileSync(wrapper, 'first wrapper');
  const previousWrapper = process.env['RUSTC_WRAPPER'];
  process.env['RUSTC_WRAPPER'] = wrapper;
  context.after(() => {
    if (previousWrapper === undefined) {
      delete process.env['RUSTC_WRAPPER'];
    } else {
      process.env['RUSTC_WRAPPER'] = previousWrapper;
    }
  });
  const selectedWrapper = deliveryCacheKey(root);
  writeFileSync(wrapper, 'second wrapper');
  assert.notEqual(deliveryCacheKey(root), selectedWrapper);
  process.env['RUSTC_WRAPPER'] = '';
  assert.match(deliveryCacheKey(root), /^[0-9a-f]{64}$/u, 'empty wrapper disables the override');
});

void test('cached preparation target uses verified ensure-delivery on source changes', () => {
  const project =
    /** @type {{targets: Record<string, {cache?: boolean, inputs?: unknown[], options?: {command?: string}} >}} */ JSON.parse(
      (readFileSync(resolve(import.meta.dirname, '../project.json'), 'utf8')),
    );
  const target = project.targets['prepare-geospec-ci-artifacts'];
  assert.ok(target);
  assert.equal(target.cache, true);
  assert.deepEqual(target.inputs, [
    { runtime: 'node packages/geospec-engine-native/scripts/ci-artifacts.mjs cache-key' },
  ]);
  assert.equal(target.options?.command, 'node packages/geospec-engine-native/scripts/ci-artifacts.mjs ensure-delivery');
});

void test('explicit delivery cache remains the exact selected path', (context) => {
  const scratch = resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'explicit-cache-'));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const packagePath = 'packages/geospec-engine-native/scripts';
  for (const name of ['ci-artifacts.mjs', 'collect-native-proof.py', 'test_native_proof.py']) {
    const path = join(root, packagePath, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, name);
  }
  context.mock.method(childProcess, 'execFileSync', (_executable, args) =>
    args[0] === 'rev-parse' ? `${'a'.repeat(40)}\n` : '',
  );
  const selected = join(root, 'retained-cache');
  const previous = process.env.GEOSPEC_DELIVERY_CACHE;
  process.env.GEOSPEC_DELIVERY_CACHE = selected;
  context.after(() => {
    if (previous === undefined) {
      delete process.env.GEOSPEC_DELIVERY_CACHE;
    } else {
      process.env.GEOSPEC_DELIVERY_CACHE = previous;
    }
  });
  const producer = context.mock.method(
    childProcess,
    'spawnSync',
    /** @type {(executable: string, args: string[], options: {env: {GEOSPEC_DELIVERY_CACHE: string, GEOSPEC_DELIVERY_GENERATION?: string}}) => {status: number, stdout?: string}} */
    (executable, _args, options) => {
      if (executable === 'python3') {
        return { status: 0, stdout: `${'a'.repeat(64)}\n` };
      }
      assert.ok(isAbsolute(executable) && executable.endsWith('/pnpm'));
      assert.equal(options.env.GEOSPEC_DELIVERY_CACHE, selected);
      assert.equal(options.env.GEOSPEC_DELIVERY_GENERATION, undefined);
      return { status: 1 };
    },
  );
  assert.throws(() => prepareArtifacts(root), /GeoSpec producer prepare-delivery:sources failed/);
  assert.equal(producer.mock.callCount(), 2);
});

/** @type {(condition: () => boolean, label: string) => Promise<void>} */
const waitForCondition = async (condition, label) =>
  new Promise((resolve, reject) => {
    const poll = setInterval(() => {
      if (condition()) {
        clearInterval(poll);
        clearTimeout(deadline);
        resolve();
      }
    }, 20);
    const deadline = setTimeout(() => {
      clearInterval(poll);
      reject(new Error(`Timed out waiting for ${label}`));
    }, 2000);
  });

/** @type {(context: import('node:test').TestContext, reusePrefixes: boolean) => void} */
const checkTransport = (context, reusePrefixes, sourceOnly = false) => {
  const actualSpawnSync = childProcess.spawnSync;
  const scratch = resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts');
  mkdirSync(scratch, { recursive: true });
  const temporary = mkdtempSync(join(scratch, 'transport-'));
  context.after(() => {
    rmSync(temporary, { recursive: true, force: true });
  });
  const producer = join(temporary, 'darwin-checkout');
  const consumer = join(temporary, 'ubuntu-checkout');
  const legacyCache = join(producer, 'node_modules/.cache/geospec-engine-native/delivery-wasm-eh');
  const generation = 'b'.repeat(64);
  const mixedCache = join(legacyCache, 'generations', generation);
  const cargoHome = join(mixedCache, 'cargo');
  const rustPrefix = join(mixedCache, 'rust');
  const packagePath = 'packages/geospec-engine-native';
  const transportPath = 'out/artifacts/geospec-native-engine/ci';
  const snapshotPath = `${packagePath}/bindings/node/types/generated/index.d.ts`;
  const bindingPath = `${packagePath}/bindings/emscripten/src/lib.rs`;
  const patchPath = `${packagePath}/native/occt/patches/fixture.patch`;
  const sourceKitPaths = [
    `${packagePath}/scripts/ci-artifacts.test.mjs`,
    `${packagePath}/bindings/browser-conformance/run-browser-conformance.ts`,
    `${packagePath}/bindings/browser-conformance/app/run.ts`,
  ];
  const sourceOnlyOutsideArchive = [
    `${packagePath}/bench/performance-lab-cli.ts`,
    `${packagePath}/bench/performance-lab-cli.test.ts`,
    `${packagePath}/bench/performance-lab-focus.ts`,
    `${packagePath}/bench/performance-lab-focus.test.ts`,
    `${packagePath}/bench/performance-lab-runner.ts`,
    `${packagePath}/bench/performance-lab-runner.test.ts`,
    `${packagePath}/bench/performance-lab.test.ts`,
    `${packagePath}/vitest.config.ts`,
  ];
  const sourceOnlyPaths = [...sourceKitPaths, ...sourceOnlyOutsideArchive];
  const toolchainPath = 'rust-toolchain.toml';
  const cargoLockPath = 'Cargo.lock';
  const generatedPath = `${packagePath}/bindings/node/generated`;
  const mixedPath = `${packagePath}/bindings/emscripten/generated`;
  const callerBin = join(temporary, 'caller-bin');
  mkdirSync(join(callerBin, 'pnpm'), { recursive: true });
  const productPath = `${callerBin}:${process.env.PATH}`;
  const nativeBin = join(temporary, 'strict-native-bin');
  mkdirSync(nativeBin);
  symlinkSync(process.execPath, join(nativeBin, 'node'));
  const nativePrefixPath = `${nativeBin}:/inert-native-tools/bin`;
  assert.equal(existsSync(join(nativeBin, 'pnpm')), false, 'strict native PATH must not supply pnpm');
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
  /** @type {(path: string) => {bytes: number, sha256: string}} */
  const fileRecordForTest = (path) => {
    const bytes = readFileSync(path);
    return { bytes: bytes.length, sha256: digest(bytes) };
  };
  /** @type {(path: string, bytes: string | Uint8Array) => void} */
  const put = (path, bytes) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  };
  /** @type {(assembly: string) => void} */
  const putAssembly = (assembly) => {
    const kit = join(assembly, 'kit/geospec-engine-native-source-relink');
    const sourcePaths = [
      bindingPath,
      patchPath,
      `${packagePath}/scripts/ci-artifacts.mjs`,
      `${packagePath}/scripts/collect-native-proof.py`,
      `${packagePath}/scripts/test_native_proof.py`,
      ...sourceKitPaths,
      cargoLockPath,
    ];
    const entries = sourcePaths.map((path) => {
      const bytes = readFileSync(join(producer, path));
      put(join(kit, 'source', path), bytes);
      return { path, bytes: bytes.length, sha256: digest(bytes) };
    });
    const sourceTreeSha256 = digest(
      JSON.stringify(entries.map(({ path, bytes, sha256 }) => ({ bytes, path, sha256 }))),
    );
    put(
      join(kit, 'manifest.json'),
      JSON.stringify({
        schema: 'geospec-native-source-relink-v2',
        sourceTree: { files: entries.length, sha256: sourceTreeSha256, entries },
      }),
    );
    const relink = join(assembly, 'tarballs/geospec-engine-native-source-relink.tar.gz');
    mkdirSync(dirname(relink), { recursive: true });
    assert.equal(
      actualSpawnSync(
        'tar',
        [
          '-czf',
          relink,
          '-C',
          join(assembly, 'kit'),
          'geospec-engine-native-source-relink/manifest.json',
          ...sourcePaths.map((path) => `geospec-engine-native-source-relink/source/${path}`),
        ],
        { env: { ...process.env, COPYFILE_DISABLE: '1' } },
      ).status,
      0,
    );
    const receipt = JSON.stringify({
      artifact: { sha256: digest(readFileSync(relink)), bytes: readFileSync(relink).length },
    });
    for (const name of ['root.tgz', 'darwin-arm64.tgz']) {
      const stage = join(assembly, `stage-${name}`);
      put(join(stage, 'package/licenses/SOURCE-RELINK.json'), receipt);
      assert.equal(
        actualSpawnSync('tar', ['-czf', join(assembly, 'tarballs', name), '-C', stage, 'package']).status,
        0,
      );
    }
  };
  put(join(producer, snapshotPath), 'fixture declaration\n');
  put(join(producer, bindingPath), 'fixture source\n');
  put(join(producer, patchPath), 'fixture native patch\n');
  put(join(producer, toolchainPath), 'fixture toolchain\n');
  put(join(producer, cargoLockPath), 'fixture cargo lock\n');
  put(
    join(producer, packagePath, 'scripts/ci-artifacts.mjs'),
    readFileSync(new URL('ci-artifacts.mjs', import.meta.url)),
  );
  put(join(producer, packagePath, 'scripts/collect-native-proof.py'), 'inert collector source');
  put(join(producer, packagePath, 'scripts/test_native_proof.py'), 'inert positive fixture source');
  for (const path of sourceKitPaths) {
    put(join(producer, path), `old source-kit input ${path}`);
  }
  for (const path of sourceOnlyOutsideArchive) {
    put(join(producer, path), `old non-product input ${path}`);
  }
  put(join(producer, packagePath, 'project.json'), JSON.stringify({ targets: { 'build-node': { fixture: true } } }));
  if (reusePrefixes) {
    for (const name of [
      'native-producing-builder.sh',
      'native-producing-recipe.json',
      'mixed-producing-builder.sh',
      'mixed-producing-recipe.json',
    ]) {
      put(join(producer, name), `fixture ${name}`);
    }
  }
  put(join(producer, packagePath, 'rust/target/untracked-output'), 'not source');
  let revision = 'f6ee22ab908e59d4335889cbc88e5907decd7198';
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
      return `${snapshotPath}\0${bindingPath}\0${patchPath}\0${toolchainPath}\0${cargoLockPath}\0${sourceOnlyPaths.join('\0')}\0`;
    },
  );
  /** @type {string[]} */
  const targets = [];
  const buildCache = join(mixedCache, 'mixed-build-simd128');
  put(join(buildCache, 'attempt-0/commands.json'), 'old attempt must not be selected');
  put(join(mixedCache, 'mixed-inputs.json'), 'historical inputs must not be selected or overwritten');
  put(join(legacyCache, 'occt-native/prefix-receipt.json'), 'retained legacy receipt');
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
  let assemblyAttempt = 0;
  context.mock.method(
    childProcess,
    'spawnSync',
    /** @type {(executable: string, args: string[], options: {cwd: string, stdio: unknown, env: {PATH?: string, CARGO_HOME: string, GEOSPEC_NODE_MANIFEST: string, GEOSPEC_OCCT_PREFIX: string, GEOSPEC_MIXED_INPUTS: string, GEOSPEC_DELIVERY_CACHE: string, GEOSPEC_OCCT_PRODUCER_BUILDER?: string, GEOSPEC_OCCT_PRODUCER_RECIPE?: string, GIT_CEILING_DIRECTORIES?: string}}) => {status: number}} */ (
      executable,
      args,
      options,
    ) => {
      if (executable === 'tar') {
        return actualSpawnSync(executable, args, options);
      }
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
        if (args[0] === '-I' && args[1] === '-c') {
          return actualSpawnSync(executable, args, options);
        }
        if (args[2] === 'generation') {
          assert.equal(args[1], join(producer, packagePath, 'scripts/prepare-delivery.py'));
          return { status: 0, stdout: `${generation}\n` };
        }
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
        put(
          join(args[4], 'identity-source-proof.json'),
          JSON.stringify({
            fixture: 'inert same-build proof',
            actualPrefix: { path: join(nativeCache, 'occt-native/install') },
            actualBuild: {
              invocation: {
                environment: {
                  CARGO_HOME: join(producer, 'assembly-cargo-home'),
                  PATH: productPath,
                },
              },
            },
          }),
        );
        return { status: 0 };
      }
      assert.ok(isAbsolute(executable) && executable.endsWith('/pnpm'));
      assert.notEqual(executable, join(callerBin, 'pnpm'), 'PATH directory is not an executable runner');
      assert.deepEqual(args.slice(0, 2), ['nx', 'run']);
      assert.equal(options.cwd, producer);
      const command = args[2];
      assert.ok(command);
      const target = command.replace('geospec-engine-native:', '');
      assert.deepEqual(
        args.slice(3),
        target === 'build' || target === 'assemble-package' ? ['--excludeTaskDependencies'] : [],
        'only the explicit facade build and assembly may omit recursive task dependencies',
      );
      assert.notEqual(target, 'require-geospec-artifacts', 'producer must not recursively verify its own lock');
      if (target !== 'assemble-package' || assemblyAttempt === 0) {
        assert.equal(
          options.env.GEOSPEC_DELIVERY_GENERATION,
          target === 'prepare-delivery:reuse-native' ? undefined : generation,
        );
      }
      assert.equal(options.stdio, target === 'build-node' || target === 'assemble-package' ? 'pipe' : 'inherit');
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
        if (sourceOnly && assemblyAttempt > 0) {
          assert.throws(() => withProducerMarker(producer, () => 'second writer'), /producer interrupted/);
        }
        // The explicit dependency-excluded build must have produced package facades first.
        verifyArtifacts(producer);
        for (const name of ['index.mjs', 'node.mjs', 'wasm.mjs']) {
          assert.ok(existsSync(join(producer, packagePath, 'dist', name)), `missing built facade: ${name}`);
        }
        assert.equal(observations, 1);
        assert.equal(pythonFetches, 1);
        assert.equal(options.env.CARGO_HOME, join(producer, 'assembly-cargo-home'));
        assert.equal(options.env.GEOSPEC_MIXED_INPUTS, join(producer, transportPath, 'mixed-inputs.json'));
        const assembly = join(producer, `fresh-assembly-${++assemblyAttempt}`);
        putAssembly(assembly);
        return { status: 0, stdout: `ASSEMBLY_ROOT=${assembly}\n` };
      }
      if (target === 'build') {
        assert.ok(targets.includes('build-wasm'), 'dist build must follow the mixed WASM producer');
        verifyArtifacts(producer);
        assert.equal(observations, 1, 'native proof must precede facade build');
        assert.equal(pythonFetches, 1, 'locked Python material must precede facade build');
        for (const name of ['index.mjs', 'node.mjs', 'wasm.mjs']) {
          put(join(producer, packagePath, 'dist', name), `inert fresh ${name}`);
        }
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
    PATH: productPath,
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
  if (sourceOnly) {
    process.env['GITHUB_RUN_ID'] = 'producer-A';
    process.env['GITHUB_RUN_ATTEMPT'] = '1';
  }
  const inventory = ensureDelivery(producer);
  assert.equal(readFileSync(join(legacyCache, 'occt-native/prefix-receipt.json'), 'utf8'), 'retained legacy receipt');
  assert.deepEqual(targets, [
    'prepare-delivery:sources',
    'prepare-delivery:tools',
    ...(reusePrefixes
      ? ['prepare-delivery:reuse-native', 'prepare-delivery:reuse-mixed']
      : ['prepare-delivery:prefixes']),
    'build-node',
    'prepare-delivery:inputs',
    'build-wasm',
    'build',
    'assemble-package',
  ]);
  assert.equal(inventory.artifacts.length, 5);
  assert.deepEqual(verifyArtifacts(producer), inventory);
  const builtTargets = [...targets];
  if (sourceOnly) {
    const { delivery: rawDelivery } = inventory;
    const delivery = /** @type {{run: unknown, assemblyRun: unknown, archives: {path: string}[]}} */ (rawDelivery);
    assert.deepEqual(delivery.run, { id: 'producer-A', attempt: '1' });
    assert.deepEqual(delivery.assemblyRun, delivery.run);
    const inventoryFile = join(producer, transportPath, 'inventory.json');
    assert.equal(inventory.schema, 'geospec-ci-artifacts-v3');
    for (const field of ['run', 'assemblyRun']) {
      put(
        inventoryFile,
        JSON.stringify({ ...inventory, delivery: { ...delivery, [field]: { id: 'producer-A', attempt: 1 } } }),
      );
      assert.throws(
        () => verifyDelivery(producer),
        /Delivery lacks producer workflow provenance/,
        `malformed ${field} must not be accepted as a recorded workflow`,
      );
      put(inventoryFile, JSON.stringify(inventory));
    }
    const relinkRecord = delivery.archives[2];
    assert.ok(relinkRecord);
    const relinkPath = join(producer, relinkRecord.path);
    const originalRelink = readFileSync(relinkPath);
    const assemblyKit = join(producer, 'fresh-assembly-1/kit');
    const originalMembers = actualSpawnSync('tar', ['-tzf', relinkPath]).stdout.toString().trim().split('\n');
    const extraLink = 'geospec-engine-native-source-relink/source/alias';
    symlinkSync('manifest.json', join(assemblyKit, extraLink));
    assert.equal(
      actualSpawnSync('tar', ['-czf', relinkPath, '-C', assemblyKit, ...originalMembers, extraLink], {
        env: { ...process.env, COPYFILE_DISABLE: '1' },
      }).status,
      0,
    );
    put(
      inventoryFile,
      JSON.stringify({
        ...inventory,
        delivery: {
          ...delivery,
          archives: delivery.archives.map((archive, index) =>
            index === 2 ? { path: archive.path, ...fileRecordForTest(relinkPath) } : archive,
          ),
        },
      }),
    );
    assert.throws(
      () => verifyDelivery(producer),
      /Source-relink archive does not contain current source/,
      'a substituted tar link must fail even with a matching inventory hash',
    );
    put(relinkPath, originalRelink);
    put(inventoryFile, JSON.stringify(inventory));
    const coordinatorFile = join(producer, packagePath, 'scripts/ci-artifacts.mjs');
    const coordinatorBytes = readFileSync(coordinatorFile);
    put(coordinatorFile, 'future coordinator edit');
    assert.throws(() => verifyArtifacts(producer), /source inputs differ/);
    put(coordinatorFile, coordinatorBytes);
    const originalDelivery = /** @type {{archives: {path: string}[]}} */ (inventory.delivery);
    const oldArchives = originalDelivery.archives.map((archive) => fileRecordForTest(join(producer, archive.path)));
    revision = 'b'.repeat(40);
    for (const path of sourceOnlyPaths) {
      put(join(producer, path), `current source-kit input ${path}`);
    }
    const legacy = { ...inventory, schema: 'geospec-ci-artifacts-v2' };
    delete legacy.producerSource;
    put(inventoryFile, JSON.stringify(legacy));
    assert.throws(() => verifyArtifacts(producer), /source inputs differ/, 'v2 cannot cross a changed source kit');
    put(inventoryFile, JSON.stringify(inventory));
    assert.deepEqual(verifyArtifacts(producer).artifacts, inventory.artifacts);
    assert.throws(() => verifyDelivery(producer), /source kit differs/);
    process.env['GITHUB_RUN_ID'] = 'assembly-B';
    process.env['GITHUB_RUN_ATTEMPT'] = '2';
    const renewed = withProducerMarker(producer, () => ensureDelivery(producer), { pgid: process.pid });
    assert.equal(renewed.schema, 'geospec-ci-artifacts-v3');
    assert.equal(renewed.source.revision, revision, 'source kit records the current checkout revision');
    assert.equal(
      renewed.producerSource.revision,
      inventory.producerSource.revision,
      'receipt retains the original producer revision',
    );
    assert.deepEqual(renewed.delivery.run, inventory.delivery.run, 'the original product producer remains A');
    assert.deepEqual(renewed.delivery.assemblyRun, { id: 'assembly-B', attempt: '2' });
    assert.deepEqual(renewed.artifacts, inventory.artifacts, 'five generated products retain exact bytes');
    assert.deepEqual(
      targets,
      [...builtTargets, 'assemble-package'],
      'source-only edit runs assembly without a compiler',
    );
    const renewedDelivery = /** @type {{archives: {path: string}[]}} */ (renewed.delivery);
    assert.notDeepEqual(renewedDelivery.archives, originalDelivery.archives);
    assert.deepEqual(ensureDelivery(producer), renewed, 'warm v3 delivery reuses its selected trio');
    assert.deepEqual(targets, [...builtTargets, 'assemble-package']);
    const relink = renewedDelivery.archives[2];
    assert.ok(relink);
    const archivedTest = actualSpawnSync('tar', [
      '-xOzf',
      join(producer, relink.path),
      `geospec-engine-native-source-relink/source/${sourceKitPaths[0]}`,
    ]);
    assert.equal(archivedTest.status, 0);
    assert.deepEqual(archivedTest.stdout, readFileSync(join(producer, sourceKitPaths[0])));
    for (const [index, archive] of originalDelivery.archives.entries()) {
      assert.deepEqual(fileRecordForTest(join(producer, archive.path)), oldArchives[index], 'old trio is immutable');
    }
    for (const [index, path] of sourceOnlyPaths.entries()) {
      put(join(producer, path), `second source-only edit ${path}`);
      assert.deepEqual(verifyArtifacts(producer).artifacts, inventory.artifacts);
      assert.throws(() => verifyDelivery(producer), /source kit differs/);
      process.env['GITHUB_RUN_ID'] = 'assembly-C';
      process.env['GITHUB_RUN_ATTEMPT'] = '3';
      const second = withProducerMarker(producer, () => ensureDelivery(producer), { pgid: process.pid });
      assert.deepEqual(second.artifacts, inventory.artifacts);
      assert.deepEqual(second.delivery.run, inventory.delivery.run, 'source-only relinks never relabel the product');
      assert.deepEqual(second.delivery.assemblyRun, { id: 'assembly-C', attempt: '3' });
      assert.deepEqual(targets, [...builtTargets, ...Array.from({ length: index + 2 }, () => 'assemble-package')]);
    }
    for (const [path, value] of [
      [bindingPath, 'different ABI'],
      [patchPath, 'different native patch'],
      [toolchainPath, 'different toolchain'],
      [cargoLockPath, 'different lock'],
      [`${packagePath}/scripts/ci-artifacts.mjs`, 'different producer script'],
    ]) {
      const original = readFileSync(join(producer, path));
      put(join(producer, path), value);
      assert.throws(() => verifyArtifacts(producer), /source inputs differ/);
      put(join(producer, path), original);
    }
    const product = join(producer, mixedPath, 'geospec_engine_native.wasm');
    const productBytes = readFileSync(product);
    put(product, 'different product');
    assert.throws(() => verifyArtifacts(producer), /membership\/bytes\/hashes differ/);
    put(product, productBytes);
    put(join(producer, cargoLockPath), 'different lock');
    failNode = true;
    assert.throws(() => ensureDelivery(producer), /build-node failed/);
    assert.equal(targets.at(-1), 'build-node', 'changed lock must return to producer, not source-kit assembly');
    return;
  }
  assert.deepEqual(ensureDelivery(producer), inventory);
  assert.deepEqual(targets, builtTargets, 'an unchanged delivery must not invoke a producer');
  const previousRunId = process.env['GITHUB_RUN_ID'];
  const previousRunAttempt = process.env['GITHUB_RUN_ATTEMPT'];
  try {
    process.env['GITHUB_RUN_ID'] = 'another-run';
    process.env['GITHUB_RUN_ATTEMPT'] = '3';
    assert.deepEqual(verifyDelivery(producer), inventory, 'producer provenance survives another workflow run');
  } finally {
    if (previousRunId === undefined) {
      delete process.env['GITHUB_RUN_ID'];
    } else {
      process.env['GITHUB_RUN_ID'] = previousRunId;
    }
    if (previousRunAttempt === undefined) {
      delete process.env['GITHUB_RUN_ATTEMPT'];
    } else {
      process.env['GITHUB_RUN_ATTEMPT'] = previousRunAttempt;
    }
  }
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
  const existingSnapshots = readdirSync(dirname(snapshot));
  const originalCopy = fs.copyFileSync;
  fs.copyFileSync = () => {
    throw new Error('fixture copy failure');
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => snapshotDelivery(producer), /fixture copy failure/);
  } finally {
    fs.copyFileSync = originalCopy;
    syncBuiltinESMExports();
  }
  assert.deepEqual(readdirSync(dirname(snapshot)), existingSnapshots, 'failed snapshots must be removed');
  const sourceFile = join(producer, bindingPath);
  const sourceBytes = readFileSync(sourceFile);
  fs.copyFileSync = (from, to) => {
    originalCopy(from, to);
    writeFileSync(sourceFile, 'changed during snapshot');
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => snapshotDelivery(producer), /sources changed during snapshot/);
  } finally {
    writeFileSync(sourceFile, sourceBytes);
    fs.copyFileSync = originalCopy;
    syncBuiltinESMExports();
  }
  assert.deepEqual(readdirSync(dirname(snapshot)), existingSnapshots, 'source-raced snapshots must be removed');
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
  assert.equal(targets.length, reusePrefixes ? 9 : 8, 'verification must not invoke a producer');
  assert.equal(observations, 1, 'verification must not observe a native module');
  assert.equal(pythonFetches, 1, 'verification must not fetch Cargo material');
  for (const name of ['root.tgz', 'darwin-arm64.tgz', 'geospec-engine-native-source-relink.tar.gz']) {
    const path = join(consumer, transportPath, 'assembly/tarballs', name);
    const bytes = readFileSync(path);
    put(path, 'other assembly');
    assert.throws(() => verifyDelivery(consumer), /archive\/proof hashes or producer provenance differ/);
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
  assert.throws(() => verifyArtifacts(consumer), /source inputs differ/);
  put(join(consumer, bindingPath), 'fixture source\n');
  put(join(consumer, patchPath), 'changed native patch');
  assert.throws(() => verifyArtifacts(consumer), /source inputs differ/);
  put(join(consumer, patchPath), 'fixture native patch\n');
  put(join(consumer, toolchainPath), 'changed toolchain');
  assert.throws(() => verifyArtifacts(consumer), /source inputs differ/);
  put(join(consumer, toolchainPath), 'fixture toolchain\n');
  revision = 'b'.repeat(40);
  assert.deepEqual(
    verifyArtifacts(consumer),
    inventory,
    'an unrelated HEAD change preserves the source-compatible product',
  );
  assert.deepEqual(verifyDelivery(consumer), inventory, 'the delivery keeps its original producer revision');
  const revisionSnapshot = snapshotDelivery(consumer);
  for (const name of ['root.tgz', 'darwin-arm64.tgz', 'geospec-engine-native-source-relink.tar.gz']) {
    assert.deepEqual(
      readFileSync(join(revisionSnapshot, 'tarballs', name)),
      readFileSync(join(consumer, transportPath, 'assembly/tarballs', name)),
    );
  }
  assert.deepEqual(targets, builtTargets, 'an unrelated HEAD change must not start a producer');
  revision = 'f6ee22ab908e59d4335889cbc88e5907decd7198';
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
  assert.throws(() => snapshotDelivery(producer), /run pnpm nx run geospec-engine-native:prepare-geospec-ci-artifacts/);
  assert.deepEqual(targets, builtTargets, 'a corrupt delivery snapshot must not invoke a producer');
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

await test('source-only edits reassemble a fresh trio without changing verified products', (context) => {
  checkTransport(context, false, true);
});

await test('a producer marker blocks a second waiter and clears only its unchanged successful owner', (context) => {
  const root = mkdtempSync(join(resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts'), 'marker-'));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  assert.equal(
    withProducerMarker(root, () => {
      assert.throws(() => withProducerMarker(root, () => 'second'), /producer interrupted/);
      return 'first';
    }),
    'first',
  );
  assert.equal(
    withProducerMarker(root, () => 'second'),
    'second',
  );
  const marker = join(root, 'node_modules/.cache/geospec-engine-native/ci-artifacts.active.json');
  assert.throws(() => {
    withProducerMarker(root, () => {
      writeFileSync(marker, JSON.stringify({ owner: 'other' }));
    });
  }, /marker changed/);
  assert.ok(existsSync(marker), 'a conflicting marker must remain for inspection');
  writeFileSync(marker, JSON.stringify({ owner: 'other', started: new Date(Date.now() - 61_000).toISOString() }));
  assert.throws(() => withProducerMarker(root, () => 'age steal'), /producer interrupted/);
});

await test('a killed coordinator leaves a refusal while a nested Python writer survives', async (context) => {
  const root = mkdtempSync(join(resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts'), 'nested-'));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const ready = join(root, 'ready');
  const done = join(root, 'done');
  const moduleUrl = new URL('ci-artifacts.mjs', import.meta.url).href;
  const program = `
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    import { withProducerMarker } from ${JSON.stringify(moduleUrl)};
    withProducerMarker(${JSON.stringify(root)}, () => {
      spawn('python3', ['-c', ${JSON.stringify(`import time; time.sleep(0.6); open(${JSON.stringify(done)}, 'w').write('done')`)}], { stdio: 'ignore' });
      writeFileSync(${JSON.stringify(ready)}, 'ready');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
    });
  `;
  const coordinator = childProcess.spawn(process.execPath, ['--input-type=module', '-e', program], { stdio: 'ignore' });
  /** @type {(path: string) => Promise<void>} */
  const waitFor = async (path) => {
    await new Promise((resolve, reject) => {
      const pollTimer = setInterval(() => {
        if (existsSync(path)) {
          clearInterval(pollTimer);
          clearTimeout(deadlineTimer);
          resolve();
        }
      }, 20);
      const deadlineTimer = setTimeout(() => {
        clearInterval(pollTimer);
        reject(new Error(`Timed out waiting for ${path}`));
      }, 2000);
    });
  };
  try {
    await waitFor(ready);
    coordinator.kill('SIGKILL');
    await new Promise((resolve) => {
      coordinator.once('exit', resolve);
    });
    assert.throws(() => withProducerMarker(root, () => 'unsafe second writer'), /producer interrupted/);
    await waitFor(done);
    assert.throws(() => withProducerMarker(root, () => 'late writer'), /producer interrupted/);
  } finally {
    coordinator.kill('SIGKILL');
  }
});

await test('an interrupted closed producer retries only after its process group exits', (context) => {
  const root = mkdtempSync(join(resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts'), 'recovery-'));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const inventory = join(root, 'out/artifacts/geospec-native-engine/ci/inventory.json');
  mkdirSync(dirname(inventory), { recursive: true });
  writeFileSync(inventory, 'stale complete publication');
  assert.throws(
    () =>
      withProducerMarker(
        root,
        () => {
          throw new Error('interrupted');
        },
        { pgid: process.pid },
      ),
    /interrupted/,
  );
  assert.throws(() => recoverExitedProducer(root, () => false, 'changed recipe'), /not a recognized closed recipe/);
  assert.throws(() => recoverExitedProducer(root, () => true), /possible writer/);
  assert.ok(existsSync(inventory), 'a live group keeps its original evidence');
  assert.equal(
    recoverExitedProducer(root, () => false),
    true,
  );
  assert.ok(!existsSync(inventory), 'recovery invalidates the old publication before retry');
  assert.equal(
    withProducerMarker(root, () => 'retry', { pgid: process.pid }),
    'retry',
  );
  assert.equal(
    recoverExitedProducer(root, () => false),
    false,
  );
});

await test(
  'Darwin producer lock serializes two independent waiters',
  { skip: process.platform !== 'darwin' },
  async (context) => {
    const root = mkdtempSync(join(resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts'), 'waiters-'));
    context.after(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const moduleUrl = new URL('ci-artifacts.mjs', import.meta.url).href;
    const program = `
    import { spawnSync } from 'node:child_process';
    import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    import { withProducerMarker } from ${JSON.stringify(moduleUrl)};
    const root = ${JSON.stringify(root)};
    const name = process.argv[1];
    mkdirSync(join(root, 'node_modules/.cache/geospec-engine-native'), { recursive: true });
    const fd = openSync(join(root, 'node_modules/.cache/geospec-engine-native/ci-artifacts.lock'), 'a+');
    const lock = spawnSync('lockf', ['3'], { stdio: ['ignore', 'ignore', 'inherit', fd] });
    if (lock.status !== 0) process.exit(2);
    withProducerMarker(root, () => {
      writeFileSync(join(root, name + '.started'), 'started');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, name === 'first' ? 250 : 1);
      writeFileSync(join(root, name + '.done'), 'done');
    });
    closeSync(fd);
  `;
    const first = childProcess.spawn(process.execPath, ['--input-type=module', '-e', program, 'first'], {
      stdio: 'ignore',
    });
    try {
      await waitForCondition(() => existsSync(join(root, 'first.started')), 'first waiter');
      const second = childProcess.spawn(process.execPath, ['--input-type=module', '-e', program, 'second'], {
        stdio: 'ignore',
      });
      try {
        await new Promise((resolve) => {
          setTimeout(resolve, 60);
        });
        assert.ok(!existsSync(join(root, 'second.started')), 'second waiter cannot enter during first writer');
        await waitForCondition(() => existsSync(join(root, 'first.done')), 'first completion');
        await waitForCondition(() => existsSync(join(root, 'second.done')), 'second completion');
      } finally {
        second.kill('SIGKILL');
      }
    } finally {
      first.kill('SIGKILL');
    }
  },
);

await test(
  'Darwin recovery waits for a nested writer in its owned group',
  { skip: process.platform !== 'darwin' },
  async (context) => {
    const root = mkdtempSync(
      join(resolve(import.meta.dirname, '../../../out/tests/geospec-ci-artifacts'), 'owned-group-'),
    );
    context.after(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const ready = join(root, 'ready');
    const done = join(root, 'done');
    const release = join(root, 'release');
    const moduleUrl = new URL('ci-artifacts.mjs', import.meta.url).href;
    const program = `
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    import { withProducerMarker } from ${JSON.stringify(moduleUrl)};
    withProducerMarker(${JSON.stringify(root)}, () => {
      spawn('python3', ['-c', ${JSON.stringify(`import os, time; deadline = time.monotonic() + 10; exec('while not os.path.exists(${JSON.stringify(release)}) and time.monotonic() < deadline: time.sleep(0.02)'); open(${JSON.stringify(done)}, 'w').write('done')`)}], { stdio: 'ignore' });
      writeFileSync(${JSON.stringify(ready)}, 'ready');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
    }, { pgid: process.pid });
  `;
    const coordinator = childProcess.spawn(process.execPath, ['--input-type=module', '-e', program], {
      detached: true,
      stdio: 'ignore',
    });
    try {
      await waitForCondition(() => existsSync(ready), 'owned group readiness');
      coordinator.kill('SIGKILL');
      await new Promise((resolve) => {
        coordinator.once('exit', resolve);
      });
      assert.throws(() => recoverExitedProducer(root, darwinGroupAlive), /possible writer/);
      writeFileSync(release, 'release');
      await waitForCondition(() => existsSync(done), 'nested writer completion');
      await waitForCondition(() => !darwinGroupAlive(coordinator.pid), 'owned group exit');
      assert.equal(recoverExitedProducer(root, darwinGroupAlive), true, 'retry follows actual process-group exit');
    } finally {
      writeFileSync(release, 'release');
      coordinator.kill('SIGKILL');
    }
  },
);
