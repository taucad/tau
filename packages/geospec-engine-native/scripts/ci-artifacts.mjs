#!/usr/bin/env node
/**
 * Prepare or verify the complete Node/mixed package payload for CI transport.
 * Uses existing Nx producers; hashes establish transport identity, not qualification.
 * Usage: node packages/geospec-engine-native/scripts/ci-artifacts.mjs prepare|verify|verify-delivery|ensure-delivery|snapshot-delivery|cache-key
 * Optional env: GEOSPEC_DELIVERY_CACHE and existing delivery tool selectors.
 * GEOSPEC_NATIVE_DELIVERY_CACHE selects independent retained native-prefix reuse;
 * GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER/RECIPE and GEOSPEC_NATIVE_GIT_CEILING_DIRECTORIES
 * apply only to that prefix's verification. Mixed selectors remain independent.
 * GEOSPEC_NATIVE_PREFIX_PATH overrides PATH only for native-prefix verification.
 * Output: out/artifacts/geospec-native-engine/ci/{inventory,mixed-build-receipt,mixed-inputs,mixed-commands}.json
 * Exit: 0 complete and matching; 1 missing, changed or failed prerequisite.
 */
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  accessSync,
  copyFileSync,
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const packagePath = 'packages/geospec-engine-native';
const transportPath = 'out/artifacts/geospec-native-engine/ci';
const inventoryPath = `${transportPath}/inventory.json`;
const receiptPath = `${transportPath}/mixed-build-receipt.json`;
const mixedInputsPath = `${transportPath}/mixed-inputs.json`;
const mixedCommandsPath = `${transportPath}/mixed-commands.json`;
const proofPath = `${transportPath}/native-proof/identity-source-proof.json`;
const archiveNames = ['root.tgz', 'darwin-arm64.tgz', 'geospec-engine-native-source-relink.tar.gz'];
const archivePaths = archiveNames.map((name) => `${transportPath}/assembly/tarballs/${name}`);
const sourceKitOnly = new Set([
  `${packagePath}/scripts/ci-artifacts.test.mjs`,
  `${packagePath}/bindings/browser-conformance/run-browser-conformance.ts`,
  `${packagePath}/bindings/browser-conformance/app/run.ts`,
  `${packagePath}/bench/performance-lab-cli.ts`,
  `${packagePath}/bench/performance-lab-cli.test.ts`,
  `${packagePath}/bench/performance-lab-focus.ts`,
  `${packagePath}/bench/performance-lab-focus.test.ts`,
  `${packagePath}/bench/performance-lab-runner.ts`,
  `${packagePath}/bench/performance-lab-runner.test.ts`,
  `${packagePath}/bench/performance-lab.test.ts`,
  `${packagePath}/vitest.config.ts`,
]);
const lockPath = 'node_modules/.cache/geospec-engine-native/ci-artifacts.lock';
const activePath = 'node_modules/.cache/geospec-engine-native/ci-artifacts.active.json';
/** @type {number | undefined} */
let heldLockFile;
/** Keep the lock alive in an active producer even if this coordinator is killed. */
const producerStdio = (capture = false) =>
  heldLockFile === undefined
    ? capture
      ? 'pipe'
      : 'inherit'
    : capture
      ? ['inherit', 'pipe', 'pipe', heldLockFile]
      : ['inherit', 'inherit', 'inherit', heldLockFile];
/** @type {() => {id: string | null, attempt: string | null}} */
const workflowRun = () => ({ id: process.env.GITHUB_RUN_ID ?? null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null });
/** The recorded workflow belongs to the original producer, not the verifying host. */
/** @type {(value: unknown) => {id: string | null, attempt: string | null}} */
const recordedWorkflowRun = (value) => {
  const run = /** @type {{id?: unknown, attempt?: unknown}} */ (value);
  assert.ok(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      isDeepStrictEqual(Object.keys(value).sort(), ['attempt', 'id']) &&
      (typeof run.id === 'string' || run.id === null) &&
      (typeof run.attempt === 'string' || run.attempt === null),
    'Delivery lacks producer workflow provenance.',
  );
  return { id: run.id, attempt: run.attempt };
};
const outputs = [
  `${packagePath}/bindings/node/generated/index.d.ts`,
  `${packagePath}/bindings/node/generated/index.js`,
  `${packagePath}/bindings/node/generated/geospec-engine-native.darwin-arm64.node`,
  `${packagePath}/bindings/emscripten/generated/geospec_engine_native.mjs`,
  `${packagePath}/bindings/emscripten/generated/geospec_engine_native.wasm`,
];
/** @type {(bytes: import('node:crypto').BinaryLike) => string} */
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** Resolve a runner against its caller PATH before a producer receives a stricter PATH.
 * @type {(name: string, path: string | undefined) => string | undefined}
 */
const executableOnPath = (name, path) =>
  path
    ?.split(delimiter)
    .map((entry) => resolve(entry || '.', name))
    .find((candidate) => {
      try {
        if (!statSync(candidate).isFile()) {
          return false;
        }
        accessSync(candidate, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
const producerRecipe = digest(readFileSync(fileURLToPath(import.meta.url)));
/** @type {(path: string) => Record<string, unknown>} */
const readJson = (path) => {
  /** @type {unknown} */
  const value = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `Expected JSON object: ${path}`);
  return /** @type {Record<string, unknown>} */ (value);
};
/** @type {(root: string, path: string) => {path: string, bytes: number, sha256: string}} */
const fileRecord = (root, path) => {
  assert.ok(existsSync(resolve(root, path)), `Missing artifact/input: ${path}`);
  const bytes = readFileSync(resolve(root, path));
  return { path, bytes: bytes.length, sha256: digest(bytes) };
};
/** Publish an inventory as one complete file, never a torn JSON write.
 * @type {(root: string, inventory: Record<string, unknown>) => void}
 */
const publishInventory = (root, inventory) => {
  const destination = resolve(root, inventoryPath);
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(inventory, null, 2)}\n`);
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
};
/** A killed coordinator leaves a durable refusal; only its clean completion clears it.
 * @type {<T>(root: string, work: () => T, producer?: {pgid: number, recipeSha256?: string}) => T}
 * @internal
 */
export const withProducerMarker = (root, work, producer) => {
  const path = resolve(root, activePath);
  mkdirSync(resolve(root, 'node_modules/.cache/geospec-engine-native'), { recursive: true });
  assert.ok(
    !existsSync(path),
    `GeoSpec producer interrupted: ${path}; inspect live descendants and shared outputs before explicit recovery.`,
  );
  const marker = {
    owner: randomUUID(),
    pid: process.pid,
    pgid: producer?.pgid ?? null,
    recipeSha256: producer?.recipeSha256 ?? producerRecipe,
    started: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(marker)}\n`, { flag: 'wx' });
  const result = work();
  assert.deepEqual(readJson(path), marker, 'GeoSpec producer marker changed during production.');
  rmSync(path);
  return result;
};
/** A retry is only possible after the complete owned producer group has exited.
 * Legacy/unknown markers deliberately require operator-confirmed recovery.
 * @type {(root: string, groupAlive: (pgid: number) => boolean, recipeSha256?: string) => boolean}
 * @internal
 */
export const recoverExitedProducer = (root, groupAlive, recipeSha256 = producerRecipe) => {
  const path = resolve(root, activePath);
  if (!existsSync(path)) {
    return false;
  }
  const marker = readJson(path);
  assert.ok(
    typeof marker.owner === 'string' &&
      typeof marker.pid === 'number' &&
      Number.isSafeInteger(marker.pgid) &&
      marker.pgid === marker.pid &&
      marker.pgid > 0 &&
      marker.recipeSha256 === recipeSha256 &&
      typeof marker.started === 'string',
    `GeoSpec producer marker is not a recognized closed recipe: ${path}; explicit operator recovery required.`,
  );
  assert.ok(
    !groupAlive(marker.pgid),
    `GeoSpec producer group ${marker.pgid} still has a possible writer; refusing retry.`,
  );
  // Invalidate the only reusable publication before allowing another producer.
  rmSync(resolve(root, inventoryPath), { force: true });
  assert.deepEqual(readJson(path), marker, 'GeoSpec producer marker changed during recovery.');
  rmSync(path);
  return true;
};
/** Report any non-zombie member of the owned Darwin process group. A failed
 * process listing is not evidence of absence and must fail closed.
 * @type {(pgid: number) => boolean}
 */
export const darwinGroupAlive = (pgid) => {
  const result = childProcess.spawnSync('ps', ['-axo', 'pgid=,state='], { encoding: 'utf8' });
  assert.ok(result.status === 0 && typeof result.stdout === 'string', 'Could not prove GeoSpec producer group exit.');
  const members = result.stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const match = /^\s*(\d+)\s+([^\s]+)\s*$/u.exec(line);
      assert.ok(match, 'Malformed process listing cannot prove GeoSpec producer group exit.');
      return { pgid: match[1], state: match[2] };
    });
  return members.some((member) => member.pgid === String(pgid) && !member.state?.startsWith('Z'));
};
/** @type {(root: string) => {revision: string, files: ReturnType<typeof fileRecord>[]}} */
const sourceIdentity = (root) => {
  /** @type {(args: string[]) => string} */
  const git = (args) => childProcess.execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const paths = git([
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    packagePath,
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'nx.json',
    'tsconfig.base.json',
    'tsconfig.json',
    'rust-toolchain.toml',
    'Cargo.toml',
    'Cargo.lock',
    '.cargo',
    'tools',
    'tools/tsdown.plugin.ts',
  ])
    .split('\0')
    .filter(
      (path) =>
        path &&
        !path.startsWith(`${packagePath}/bindings/node/generated/`) &&
        !path.startsWith(`${packagePath}/bindings/emscripten/generated/`) &&
        !path.split('/').some((part) => ['target', 'dist', 'out'].includes(part)),
    );
  // Bind the source-kit package, including licenses; also cover owned helpers before their first commit.
  paths.push(`${packagePath}/scripts/ci-artifacts.mjs`);
  paths.push(`${packagePath}/scripts/collect-native-proof.py`);
  paths.push(`${packagePath}/scripts/test_native_proof.py`);
  return {
    revision: git(['rev-parse', 'HEAD']).trim(),
    files: [...new Set(paths)].sort().map((path) => fileRecord(root, path)),
  };
};
/** The closed producer recipe is the complete selected source closure, not just
 * this coordinator. Changing any producer script forces explicit inspection.
 * @type {(root: string) => string}
 */
const closedRecipe = (root) => digest(JSON.stringify(sourceIdentity(root).files));
/** @type {(source: ReturnType<typeof sourceIdentity>) => ReturnType<typeof sourceIdentity>} */
const producerIdentity = (source) => ({
  ...source,
  files: source.files.filter((file) => !sourceKitOnly.has(file.path)),
});
/** Nx's runtime input uses the same source closure as transport verification.
 * The delivery generation covers the selected host tools, compilers, SDK and
 * pinned OCCT recipe without requiring downloads or generated outputs.
 * @type {(root: string) => string}
 * @internal
 */
export const deliveryCacheKey = (root) => {
  const generation = childProcess.spawnSync(
    'python3',
    ['-B', resolve(root, packagePath, 'scripts/prepare-delivery.py'), 'generation'],
    { cwd: root, encoding: 'utf8', env: process.env },
  );
  assert.ok(generation.status === 0, `GeoSpec delivery generation failed: ${generation.stderr || generation.error}`);
  const selectedGeneration = generation.stdout.trim();
  assert.match(selectedGeneration, /^[0-9a-f]{64}$/u, 'Invalid GeoSpec delivery generation.');
  const selectedEnvironment = Object.fromEntries(
    [
      'CC',
      'CXX',
      'CFLAGS',
      'CXXFLAGS',
      'LDFLAGS',
      'RUSTFLAGS',
      'CARGO_ENCODED_RUSTFLAGS',
      'MACOSX_DEPLOYMENT_TARGET',
      'SDKROOT',
      'CARGO_HOME',
      'GEOSPEC_DELIVERY_CACHE',
      'GEOSPEC_NATIVE_DELIVERY_CACHE',
      'GEOSPEC_NATIVE_PREFIX_PATH',
      'GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER',
      'GEOSPEC_NATIVE_OCCT_PRODUCER_RECIPE',
      'GEOSPEC_NATIVE_GIT_CEILING_DIRECTORIES',
      'GEOSPEC_OCCT_PRODUCER_BUILDER',
      'GEOSPEC_OCCT_PRODUCER_RECIPE',
      'GEOSPEC_OCCT_SUPPORT_INPUTS',
      'GIT_CEILING_DIRECTORIES',
    ].map((name) => [name, process.env[name] ?? null]),
  );
  const cargoEnvironment = Object.fromEntries(
    Object.entries(process.env)
      .filter(
        ([name]) =>
          (name.startsWith('CARGO_') &&
            name !== 'CARGO_BUILD_JOBS' &&
            name !== 'CARGO_TARGET_DIR' &&
            !/(?:TOKEN|PASSWORD|CREDENTIAL|AUTH)/u.test(name)) ||
          /^(?:RUSTC(?:_WRAPPER|_WORKSPACE_WRAPPER)?|CC(?:_.+)?|CXX(?:_.+)?|AR(?:_.+)?|CFLAGS(?:_.+)?|CXXFLAGS(?:_.+)?|CXXSTDLIB|CRATE_CC_NO_DEFAULTS|CC_SHELL_ESCAPED_FLAGS)$/u.test(
            name,
          ),
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const cargoHome = resolve(root, process.env['CARGO_HOME'] ?? join(homedir(), '.cargo'));
  const cargoConfigPaths = [join(cargoHome, 'config'), join(cargoHome, 'config.toml')];
  for (let directory = resolve(root, packagePath); ; directory = dirname(directory)) {
    cargoConfigPaths.push(join(directory, '.cargo/config'), join(directory, '.cargo/config.toml'));
    if (dirname(directory) === directory) {
      break;
    }
  }
  const cargoConfigs = [...new Set(cargoConfigPaths)]
    .filter((path) => existsSync(path))
    .map((path) => {
      const local = relative(root, path);
      return fileRecord(root, local.startsWith('..') || isAbsolute(local) ? path : local);
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const executableOverrides = Object.fromEntries(
    Object.entries(cargoEnvironment)
      .filter(([name]) =>
        /^(?:RUSTC(?:_WRAPPER|_WORKSPACE_WRAPPER)?|CARGO_TARGET_.+_LINKER|CARGO_BUILD_RUSTC(?:_WRAPPER|_WORKSPACE_WRAPPER)?)$/u.test(
          name,
        ),
      )
      .map(([name, value]) => {
        assert.ok(typeof value === 'string', `Missing Cargo executable override: ${name}`);
        if (value === '') {
          return [name, null];
        }
        const executable = executableOnPath(value, process.env['PATH']) ?? resolve(root, value);
        return [name, fileRecord(root, executable)];
      }),
  );
  const externalInputs = Object.fromEntries(
    [
      'GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER',
      'GEOSPEC_NATIVE_OCCT_PRODUCER_RECIPE',
      'GEOSPEC_OCCT_PRODUCER_BUILDER',
      'GEOSPEC_OCCT_PRODUCER_RECIPE',
      'GEOSPEC_OCCT_SUPPORT_INPUTS',
    ].map((name) => {
      const selected = process.env[name];
      if (selected === undefined) {
        return [name, null];
      }
      const path = resolve(root, selected);
      const files = name.endsWith('_BUILDER')
        ? [
            path,
            ...readdirSync(dirname(path))
              .filter((entry) => entry.endsWith('.patch') || entry === 'source-manifest.json')
              .map((entry) => join(dirname(path), entry)),
          ]
        : [path];
      return [name, [...new Set(files)].sort().map((file) => fileRecord(root, file))];
    }),
  );
  const pnpmRunner = executableOnPath('pnpm', process.env['PATH']);
  assert.ok(pnpmRunner, 'pnpm is not executable on the caller PATH.');
  return digest(
    JSON.stringify({
      sources: sourceIdentity(root).files,
      generation: selectedGeneration,
      environment: selectedEnvironment,
      cargoEnvironment,
      cargoConfigs,
      executableOverrides,
      externalInputs,
      platform: process.platform,
      arch: process.arch,
      node: { version: process.version, sha256: digest(readFileSync(process.execPath)) },
      pnpm: digest(readFileSync(pnpmRunner)),
    }),
  );
};
/** @type {(root: string) => ReturnType<typeof fileRecord>[]} */
const payload = (root) => {
  const files = outputs.map((path) => fileRecord(root, path));
  for (const file of files) {
    assert.ok(file.bytes > 0, `Empty artifact: ${file.path}`);
  }
  const [declaration] = files;
  assert.ok(declaration, 'Missing generated declaration.');
  assert.ok(
    declaration.sha256 === fileRecord(root, `${packagePath}/bindings/node/types/generated/index.d.ts`).sha256,
    'Generated Node declaration differs from the tracked snapshot; review regenerated types.',
  );
  const copied = [
    ...readdirSync(resolve(root, `${packagePath}/bindings/node/generated`))
      .filter((name) => /\.(?:js|node)$/.test(name))
      .map((name) => `${packagePath}/bindings/node/generated/${name}`),
    ...readdirSync(resolve(root, `${packagePath}/bindings/emscripten/generated`))
      .filter((name) => /\.(?:mjs|wasm)$/.test(name))
      .map((name) => `${packagePath}/bindings/emscripten/generated/${name}`),
  ];
  assert.ok(
    isDeepStrictEqual(copied.sort(), outputs.slice(1).sort()),
    'Unexpected package-copy artifact outside inventory.',
  );
  return files;
};
/** @type {(root: string, inventory: {source: ReturnType<typeof sourceIdentity>, artifacts: ReturnType<typeof payload>}) => void} */
const checkReceipt = (root, inventory) => {
  const {
    schema,
    sourceRevision,
    sourceRoot,
    manifestSha256,
    bindingSha256,
    artifacts,
    output,
    wasmSimd,
    wasmEh,
    buildEnvironment,
    profile,
  } = readJson(resolve(root, receiptPath));
  assert.ok(schema === 'geospec-mixed-build-receipt-v2', 'Unsupported mixed build receipt.');
  assert.ok(sourceRevision === inventory.source.revision, 'Mixed receipt source revision differs.');
  assert.ok(typeof sourceRoot === 'string' && posix.isAbsolute(sourceRoot), 'Mixed receipt lacks producer root.');
  assert.ok(manifestSha256 === fileRecord(root, mixedInputsPath).sha256, 'Mixed receipt/input-manifest hash differs.');
  const inputs = readJson(resolve(root, mixedInputsPath));
  assert.ok(inputs.schema === 'geospec-mixed-build-inputs-v3', 'Unsupported mixed input manifest.');
  const fixedSimd = { rustFlags: ['-C', 'target-feature=+simd128'], cxxFlag: '-msimd128', linkFlag: '-msimd128' };
  assert.deepEqual(inputs.wasmSimd, fixedSimd, 'Mixed inputs lack selected fixed-SIMD flags.');
  assert.deepEqual(wasmSimd, fixedSimd, 'Mixed receipt fixed-SIMD flags differ from inputs.');
  const nativeEh = {
    compileFlags: ['-fwasm-exceptions', '-sWASM_LEGACY_EXCEPTIONS=1', '-sSUPPORT_LONGJMP=wasm'],
    linkFlags: ['-fwasm-exceptions', '-sWASM_LEGACY_EXCEPTIONS=1', '-sSUPPORT_LONGJMP=wasm'],
  };
  assert.deepEqual(inputs.wasmEh, nativeEh, 'Mixed inputs lack selected native WASM EH flags.');
  assert.deepEqual(wasmEh, nativeEh, 'Mixed receipt native WASM EH flags differ from inputs.');
  assert.ok(
    inputs.environment !== null && typeof inputs.environment === 'object' && !Array.isArray(inputs.environment),
    'Mixed inputs lack the producer environment.',
  );
  const { CARGO_HOME: cargoHome } = /** @type {Record<string, unknown>} */ (inputs.environment);
  assert.ok(typeof cargoHome === 'string' && posix.isAbsolute(cargoHome), 'Mixed inputs lack Cargo source root.');
  assert.ok(
    typeof inputs.rustPrefix === 'string' && posix.isAbsolute(inputs.rustPrefix),
    'Mixed inputs lack Rust source root.',
  );
  assert.deepEqual(
    buildEnvironment,
    {
      CARGO_ENCODED_RUSTFLAGS: [
        '-C',
        'target-feature=+simd128',
        `--remap-path-prefix=${sourceRoot}=tau`,
        `--remap-path-prefix=${cargoHome}=cargo`,
        `--remap-path-prefix=${posix.join(inputs.rustPrefix, 'lib/rustlib/src/rust')}=rust-src`,
      ].join('\u001F'),
      CXXFLAGS_wasm32_unknown_emscripten:
        '-msimd128 -frtti -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=1 -sSUPPORT_LONGJMP=wasm',
      GEOSPEC_WASM_SIMD_PROFILE: 'simd128-v1',
    },
    'Mixed receipt compile environment differs from fixed-SIMD selection.',
  );
  assert.ok(
    inputs.sourceRoot === sourceRoot && inputs.sourceRevision === sourceRevision,
    'Mixed input source differs from receipt.',
  );
  assert.ok(
    output === posix.join(sourceRoot, packagePath, 'bindings/emscripten/generated') && inputs.output === output,
    'Mixed input/receipt output differs.',
  );
  assert.ok(typeof inputs.cache === 'string' && posix.isAbsolute(inputs.cache), 'Mixed inputs lack build cache.');
  assert.ok(
    typeof inputs.preparationCache === 'string' &&
      posix.isAbsolute(inputs.preparationCache) &&
      inputs.cache === posix.join(inputs.preparationCache, 'mixed-build-simd128') &&
      inputs.occtPrefix === posix.join(inputs.preparationCache, 'occt-mixed-simd128/install'),
    'Mixed inputs lack isolated fixed-SIMD prefix/cache.',
  );
  assert.ok(inputs.linkOptimization === 'O3', 'Unsupported mixed link profile.');
  assert.equal(
    profile,
    'emscripten-6.0.5-wasm-legacy-exceptions-wasm-sjlj-st-simd128-v1-rust-c656540-panic-abort-link-O3',
    'Mixed receipt compiler profile differs.',
  );
  /** @type {unknown} */
  const commands = JSON.parse(readFileSync(resolve(root, mixedCommandsPath), 'utf8'));
  assert.ok(Array.isArray(commands) && commands.length === 4, 'Incomplete mixed commands.');
  /** @type {unknown[]} */
  const records = commands;
  const commandArguments = records.map((command, index) => {
    assert.ok(command !== null && typeof command === 'object' && !Array.isArray(command), 'Invalid mixed command.');
    const record = /** @type {Record<string, unknown>} */ (command);
    const tool = ['rustc', 'emxx', 'cargo', 'emxx'][index];
    assert.ok(tool !== undefined && typeof inputs[tool] === 'string', 'Missing mixed command tool.');
    assert.ok(
      record.executable === inputs[tool] &&
        record.status === 0 &&
        Array.isArray(record.args) &&
        record.args.every((argument) => typeof argument === 'string'),
      'Mixed command/tool selection differs from inputs.',
    );
    return record.args;
  });
  assert.deepEqual(commandArguments[0], ['-vV'], 'Mixed Rust version command differs.');
  assert.deepEqual(commandArguments[1], ['--version'], 'Mixed Emscripten version command differs.');
  assert.deepEqual(
    commandArguments[2],
    [
      'build',
      '--manifest-path',
      posix.join(sourceRoot, packagePath, 'bindings/emscripten/Cargo.toml'),
      '--locked',
      '--offline',
      '--release',
      '--target',
      'wasm32-unknown-emscripten',
      '--target-dir',
      posix.join(inputs.cache, 'target'),
    ],
    'Mixed Cargo route differs from inputs.',
  );
  assert.ok(
    isDeepStrictEqual(commandArguments[3].slice(0, 2), [`-${inputs.linkOptimization}`, fixedSimd.linkFlag]) &&
      nativeEh.linkFlags.every((flag) => commandArguments[3].includes(flag)) &&
      isDeepStrictEqual(commandArguments[3].slice(-2), ['-o', posix.join(output, 'geospec_engine_native.mjs')]),
    'Mixed link profile/output differs from inputs.',
  );
  assert.ok(
    commandArguments[3].every(
      (argument) =>
        !/^(?:-pthread|-matomics|-mno-simd128|-mrelaxed-simd|-ffast-math|-funsafe-math-optimizations|-fassociative-math|-ffp-contract=fast|-Ofast|-s(?:PTHREADS|USE_PTHREADS|PTHREAD_POOL_SIZE)(?:=.*)?|-Wl,--shared-memory)$/.test(
          argument,
        ),
    ),
    'Mixed link enables unselected threading or floating-point flags.',
  );
  assert.ok(
    bindingSha256 === fileRecord(root, `${packagePath}/bindings/emscripten/src/lib.rs`).sha256,
    'Mixed receipt binding source differs.',
  );
  // Producer paths remain in the original receipt; never open them on a consumer host.
  const producerRoot = sourceRoot;
  const expected = inventory.artifacts.slice(3).map((file) => ({
    ...file,
    path: posix.join(producerRoot, file.path),
  }));
  assert.ok(isDeepStrictEqual(artifacts, expected), 'Mixed receipt output hashes differ from payload.');
};

/**
 * Verify transported bytes against this checkout without executing any product.
 * @type {(root: string) => {source: ReturnType<typeof sourceIdentity>, artifacts: ReturnType<typeof payload>}}
 * @internal
 */
export const verifyArtifacts = (root) => {
  assert.ok(
    existsSync(resolve(root, inventoryPath)),
    'Missing GeoSpec artifact inventory; run geospec-engine-native:prepare-geospec-ci-artifacts on Darwin ARM64 or restore its complete same-source transport.',
  );
  const inventory = readJson(resolve(root, inventoryPath));
  const { schema, source: recordedSource, producerSource, artifacts: recordedArtifacts } = inventory;
  const source = sourceIdentity(root);
  const artifacts = payload(root);
  assert.ok(
    schema === 'geospec-ci-artifacts-v2' || schema === 'geospec-ci-artifacts-v3',
    'Unsupported GeoSpec artifact inventory.',
  );
  assert.ok(
    schema === 'geospec-ci-artifacts-v3'
      ? isDeepStrictEqual(producerSource?.files, producerIdentity(source).files)
      : isDeepStrictEqual(recordedSource.files, source.files),
    'GeoSpec artifact source inputs differ from this checkout.',
  );
  assert.ok(
    isDeepStrictEqual(recordedArtifacts, artifacts),
    'GeoSpec artifact membership/bytes/hashes differ from inventory.',
  );
  for (const [key, path] of [
    ['mixedReceipt', receiptPath],
    ['mixedInputs', mixedInputsPath],
    ['mixedCommands', mixedCommandsPath],
  ]) {
    assert.ok(isDeepStrictEqual(inventory[key], fileRecord(root, path)), `${key} changed during transport.`);
  }
  checkReceipt(root, { source: schema === 'geospec-ci-artifacts-v3' ? producerSource : recordedSource, artifacts });
  return { ...inventory, source: recordedSource, artifacts };
};

/** @type {(root: string, archive: string, member: string) => Buffer} */
const archiveMember = (root, archive, member) => {
  const result = childProcess.spawnSync('tar', ['-xOzf', resolve(root, archive), member], {
    cwd: root,
    maxBuffer: 8 * 1024 ** 2,
  });
  assert.ok(result.status === 0 && Buffer.isBuffer(result.stdout), `Cannot read ${member} from ${archive}.`);
  return result.stdout;
};
const checkSourceTree = `
import hashlib, json, pathlib, sys, tarfile
archive, checkout, expected_json = sys.argv[1:]
prefix = 'geospec-engine-native-source-relink/'
with tarfile.open(archive, 'r:gz') as bundle:
    members = {member.name: member for member in bundle.getmembers()}
    assert len(members) == len(bundle.getmembers())
    for name, member in members.items():
        path = pathlib.PurePosixPath(name)
        assert name.startswith(prefix) and not path.is_absolute() and '..' not in path.parts and path.as_posix() == name
        assert member.isfile(), f'Unexpected non-file archive member: {name}'
    assert members[prefix + 'manifest.json'].isfile()
    manifest = json.load(bundle.extractfile(members[prefix + 'manifest.json']))
    entries = manifest['sourceTree']['entries']
    assert manifest['schema'] == 'geospec-native-source-relink-v2'
    assert len(entries) == manifest['sourceTree']['files']
    encoded = json.dumps(entries, sort_keys=True, separators=(',', ':')).encode()
    assert hashlib.sha256(encoded).hexdigest() == manifest['sourceTree']['sha256']
    paths = [entry['path'] for entry in entries]
    assert len(paths) == len(set(paths)) and set(json.loads(expected_json)) <= set(paths)
    expected_members = {prefix + 'source/' + path for path in paths}
    actual_members = {name for name in members if name.startswith(prefix + 'source/')}
    assert expected_members == actual_members, (sorted(expected_members - actual_members), sorted(actual_members - expected_members))
    for entry in entries:
        path = pathlib.PurePosixPath(entry['path'])
        assert not path.is_absolute() and '..' not in path.parts
        source = (pathlib.Path(checkout) / entry['path']).read_bytes()
        archived = bundle.extractfile(members[prefix + 'source/' + entry['path']]).read()
        assert len(source) == entry['bytes'] == len(archived)
        assert hashlib.sha256(source).hexdigest() == entry['sha256'] == hashlib.sha256(archived).hexdigest()
`;
/** @type {(selection: {checkout: string, archiveRoot: string, archives: ReturnType<typeof fileRecord>[], source: ReturnType<typeof sourceIdentity>}) => void} */
const checkCurrentSourceKit = ({ checkout, archiveRoot, archives, source }) => {
  const relink = archives[2];
  assert.ok(relink, 'Missing source-relink archive.');
  const kitRoots = ['rust', 'native', 'bindings/node', 'bindings/python', 'bindings/emscripten', 'scripts'];
  const kitFiles = new Set(['LICENSE', 'NOTICE', 'README.md', 'package.json', 'project.json']);
  const expected = [];
  for (const file of source.files) {
    if (!file.path.startsWith(`${packagePath}/`)) {
      continue;
    }
    const relative = file.path.slice(packagePath.length + 1);
    if (
      (kitFiles.has(relative) || kitRoots.some((part) => relative.startsWith(`${part}/`))) &&
      !relative.split('/').some((part) => ['dist', 'generated', 'licenses', 'target'].includes(part)) &&
      !['.node', '.pyc', '.pyo', '.so', '.whl'].some((suffix) => relative.endsWith(suffix))
    ) {
      expected.push(file.path);
    }
  }
  const checked = childProcess.spawnSync(
    'python3',
    ['-I', '-c', checkSourceTree, resolve(archiveRoot, relink.path), checkout, JSON.stringify(expected)],
    { cwd: checkout, encoding: 'utf8' },
  );
  assert.ok(
    checked.status === 0,
    `Source-relink archive does not contain current source: ${checked.stderr || checked.error}`,
  );
  for (const archive of archives.slice(0, 2)) {
    /** @type {unknown} */
    const receipt = JSON.parse(
      archiveMember(archiveRoot, archive.path, 'package/licenses/SOURCE-RELINK.json').toString(),
    );
    assert.ok(receipt !== null && typeof receipt === 'object' && 'artifact' in receipt);
    const { artifact: recordedArtifact } = receipt;
    const artifact = /** @type {{sha256?: unknown, bytes?: unknown}} */ (recordedArtifact);
    assert.ok(
      artifact.sha256 === relink.sha256 && artifact.bytes === relink.bytes,
      `Package source-relink receipt differs from ${relink.path}.`,
    );
  }
};

/** Verify the final assembly as well as the build inputs; portable across checkout paths.
 * @type {(root: string) => ReturnType<typeof verifyArtifacts>}
 * @internal
 */
export const verifyDelivery = (root) => {
  const inventory = verifyArtifacts(root);
  const { delivery: recordedDelivery } = inventory;
  const delivery = /** @type {{archives: ReturnType<typeof fileRecord>[]} | undefined} */ (recordedDelivery);
  const archives =
    inventory.schema === 'geospec-ci-artifacts-v3'
      ? delivery?.archives.map((archive) => fileRecord(root, archive.path))
      : archivePaths.map((path) => fileRecord(root, path));
  assert.ok(Array.isArray(archives) && archives.length === archiveNames.length, 'Missing delivery archive set.');
  assert.deepEqual(
    archives.map((archive) => posix.basename(archive.path)),
    archiveNames,
    'Wrong delivery archive names.',
  );
  const run = recordedWorkflowRun(inventory.delivery?.run);
  const assemblyRun =
    inventory.schema === 'geospec-ci-artifacts-v3' ? recordedWorkflowRun(inventory.delivery?.assemblyRun) : undefined;
  assert.ok(
    archives.every((file) => file.bytes > 0),
    'Empty delivery archive.',
  );
  assert.ok(
    isDeepStrictEqual(inventory.delivery, {
      platform: 'darwin-arm64',
      run,
      ...(inventory.schema === 'geospec-ci-artifacts-v3' ? { assemblyRun } : {}),
      archives,
      nativeProof: fileRecord(root, proofPath),
    }),
    'Delivery archive/proof hashes or producer provenance differ.',
  );
  assert.ok(
    isDeepStrictEqual(inventory.source.files, sourceIdentity(root).files),
    'GeoSpec source kit differs from this checkout.',
  );
  if (inventory.schema === 'geospec-ci-artifacts-v3') {
    checkCurrentSourceKit({ checkout: root, archiveRoot: root, archives, source: inventory.source });
  }
  return inventory;
};

/**
 * Run the existing producers sequentially and inventory only their successful outputs.
 * @type {(root: string) => ReturnType<typeof verifyArtifacts>}
 * @internal
 */
export const prepareArtifacts = (root) => {
  rmSync(resolve(root, inventoryPath), { force: true });
  const cacheKey = deliveryCacheKey(root);
  const source = sourceIdentity(root);
  const pnpmRunner = executableOnPath('pnpm', process.env.PATH);
  assert.ok(pnpmRunner, 'pnpm is not executable on the caller PATH.');
  const { GEOSPEC_DELIVERY_CACHE: deliveryCache } = process.env;
  let cache = resolve(root, deliveryCache ?? 'node_modules/.cache/geospec-engine-native/delivery-wasm-eh');
  let generation;
  if (deliveryCache === undefined) {
    const selection = childProcess.spawnSync(
      'python3',
      ['-B', resolve(root, packagePath, 'scripts/prepare-delivery.py'), 'generation'],
      { cwd: root, encoding: 'utf8', env: process.env },
    );
    assert.ok(selection.status === 0, `GeoSpec delivery generation failed: ${selection.stderr || selection.error}`);
    generation = selection.stdout.trim();
    assert.ok(/^[0-9a-f]{64}$/u.test(generation), 'Invalid GeoSpec delivery generation.');
    cache = join(cache, 'generations', generation);
  }
  const reusePrefixes = process.env.GEOSPEC_NATIVE_DELIVERY_CACHE !== undefined;
  const nativeCache = resolve(root, process.env.GEOSPEC_NATIVE_DELIVERY_CACHE ?? cache);
  const nativeBuilder = resolve(
    root,
    (reusePrefixes ? process.env.GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER : process.env.GEOSPEC_OCCT_PRODUCER_BUILDER) ??
      `${packagePath}/native/occt/build-occt.sh`,
  );
  mkdirSync(cache, { recursive: true });
  const nativeTarget = mkdtempSync(join(cache, 'ci-node-target-'));
  const environment = {
    ...process.env,
    NX_DAEMON: 'false',
    PATH: process.env.PATH,
    CARGO_HOME: resolve(root, process.env.CARGO_HOME ?? join(homedir(), '.cargo')),
    pnpm_config_verify_deps_before_run: 'warn',
    GEOSPEC_DELIVERY_CACHE: cache,
    GEOSPEC_DELIVERY_GENERATION: generation,
    GEOSPEC_NODE_MANIFEST: 'bindings/node/Cargo.toml',
    GEOSPEC_OCCT_PREFIX: join(nativeCache, 'occt-native/install'),
    GEOSPEC_MIXED_INPUTS: resolve(root, mixedInputsPath),
    GEOSPEC_MIXED_COMMANDS: resolve(root, mixedCommandsPath),
    GEOSPEC_MIXED_RECEIPT: resolve(root, receiptPath),
    GEOSPEC_PRODUCER_RECEIPT: resolve(root, proofPath),
  };
  const inputsPath = join(cache, 'mixed-inputs-simd128.json');
  mkdirSync(resolve(root, transportPath), { recursive: true });
  /** @type {(target: string, preparationEnvironment?: Record<string, string | undefined>) => string} */
  const run = (target, preparationEnvironment = {}) => {
    console.log(`GeoSpec producer: ${target}`);
    const argv = [
      'pnpm',
      'nx',
      'run',
      `geospec-engine-native:${target}`,
      ...(['build', 'assemble-package'].includes(target) ? ['--excludeTaskDependencies'] : []),
    ];
    const capture = target === 'build-node' || target === 'assemble-package';
    const overrides =
      target === 'build-node'
        ? { CARGO_TARGET_DIR: nativeTarget, RUSTC_LOG: 'rustc_codegen_ssa::back::link=info' }
        : {};
    const started = new Date().toISOString();
    const result = childProcess.spawnSync(pnpmRunner, argv.slice(1), {
      cwd: root,
      stdio: producerStdio(capture),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 ** 2,
      env: {
        ...environment,
        GEOSPEC_MIXED_INPUTS: target === 'assemble-package' ? environment.GEOSPEC_MIXED_INPUTS : inputsPath,
        ...overrides,
        ...preparationEnvironment,
      },
    });
    if (capture) {
      writeFileSync(resolve(root, transportPath, `${target}.stdout`), result.stdout || '');
      writeFileSync(resolve(root, transportPath, `${target}.stderr`), result.stderr || String(result.error ?? ''));
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }
    assert.ok(result.status === 0, `GeoSpec producer ${target} failed: ${result.error?.message ?? result.status}`);
    if (target === 'build-node') {
      const project = readJson(resolve(root, packagePath, 'project.json'));
      writeFileSync(
        resolve(root, transportPath, 'native-invocation.json'),
        `${JSON.stringify(
          {
            argv,
            cwd: root,
            started,
            exitCode: result.status,
            source,
            addon: fileRecord(root, outputs[2]),
            orchestratorNode: { ...fileRecord(root, process.execPath), version: process.version },
            environment: {
              PATH: environment.PATH,
              CARGO_TARGET_DIR: nativeTarget,
              CARGO_HOME: environment.CARGO_HOME,
              GEOSPEC_OCCT_PREFIX: environment.GEOSPEC_OCCT_PREFIX,
              GEOSPEC_NODE_MANIFEST: environment.GEOSPEC_NODE_MANIFEST,
              RUSTC_LOG: overrides.RUSTC_LOG,
            },
            prefixBuilder: nativeBuilder,
            ownedTarget: /** @type {{'build-node': unknown}} */ (project.targets)['build-node'],
            logs: ['build-node.stdout', 'build-node.stderr'].map((name) =>
              fileRecord(root, `${transportPath}/${name}`),
            ),
          },
          null,
          2,
        )}\n`,
      );
    }
    return result.stdout || '';
  };
  run('prepare-delivery:sources');
  run('prepare-delivery:tools');
  if (reusePrefixes) {
    assert.ok(
      executableOnPath('node', process.env.GEOSPEC_NATIVE_PREFIX_PATH ?? process.env.PATH),
      'Native prefix PATH lacks executable node for nested Nx and env-node scripts.',
    );
    run('prepare-delivery:reuse-native', {
      PATH: process.env.GEOSPEC_NATIVE_PREFIX_PATH ?? process.env.PATH,
      GEOSPEC_DELIVERY_CACHE: nativeCache,
      GEOSPEC_DELIVERY_GENERATION: undefined,
      GEOSPEC_OCCT_PRODUCER_BUILDER: nativeBuilder,
      GEOSPEC_OCCT_PRODUCER_RECIPE: process.env.GEOSPEC_NATIVE_OCCT_PRODUCER_RECIPE,
      GIT_CEILING_DIRECTORIES: process.env.GEOSPEC_NATIVE_GIT_CEILING_DIRECTORIES,
    });
    run('prepare-delivery:reuse-mixed');
  } else {
    run('prepare-delivery:prefixes');
  }
  run('build-node');
  run('prepare-delivery:inputs');
  const inputsBytes = readFileSync(inputsPath);
  const { cache: mixedCache } = readJson(inputsPath);
  assert.ok(typeof mixedCache === 'string', 'Prepared inputs lack mixed cache path.');
  const receipts = () =>
    existsSync(mixedCache) ? readdirSync(mixedCache).filter((name) => /^attempt-\d+$/.test(name)) : [];
  const previous = new Set(receipts());
  run('build-wasm');
  const created = receipts().filter((name) => !previous.has(name));
  const newAttempt = created.at(0);
  assert.ok(
    newAttempt !== undefined && created.length === 1,
    'Expected exactly one new mixed build attempt; preserve and inspect producer logs.',
  );
  const producedReceipt = join(mixedCache, newAttempt, 'build-receipt.json');
  const receiptBytes = readFileSync(producedReceipt);
  const { manifestSha256 } = readJson(producedReceipt);
  assert.ok(manifestSha256 === digest(inputsBytes), 'Mixed build did not use the prepared inputs.');
  assert.ok(isDeepStrictEqual(source.files, sourceIdentity(root).files), 'GeoSpec sources changed during production.');
  const artifacts = payload(root);
  mkdirSync(resolve(root, transportPath), { recursive: true });
  writeFileSync(resolve(root, receiptPath), receiptBytes);
  writeFileSync(resolve(root, mixedInputsPath), inputsBytes);
  writeFileSync(resolve(root, mixedCommandsPath), readFileSync(join(mixedCache, newAttempt, 'commands.json')));
  const inventory = {
    schema: 'geospec-ci-artifacts-v3',
    source,
    producerSource: producerIdentity(source),
    artifacts,
    mixedReceipt: fileRecord(root, receiptPath),
    mixedInputs: fileRecord(root, mixedInputsPath),
    mixedCommands: fileRecord(root, mixedCommandsPath),
  };
  checkReceipt(root, { source: inventory.producerSource, artifacts });
  publishInventory(root, inventory);
  verifyArtifacts(root);
  // The collector is a source-owned adaptation of the accepted ordinary identity observation.
  // It runs only on the real producer; pure tests replace this subprocess with inert metadata.
  const proofDirectory = resolve(root, transportPath, 'native-proof');
  rmSync(proofDirectory, { recursive: true, force: true });
  const collection = childProcess.spawnSync(
    'python3',
    [
      '-B',
      resolve(root, packagePath, 'scripts/collect-native-proof.py'),
      root,
      resolve(root, transportPath, 'native-invocation.json'),
      proofDirectory,
      process.execPath,
    ],
    {
      cwd: root,
      stdio: producerStdio(),
      env: environment,
    },
  );
  assert.ok(collection.status === 0, 'Native producer proof collection failed.');
  // Node materials include the locked Python Cargo license closure. Seed the same
  // native Cargo home that the unchanged generator reads with --locked --offline.
  const pythonSources = childProcess.spawnSync(
    'rustup',
    [
      'run',
      '1.88',
      'cargo',
      'fetch',
      '--locked',
      '--manifest-path',
      resolve(root, packagePath, 'bindings/python/Cargo.toml'),
    ],
    { cwd: root, stdio: producerStdio(), env: environment },
  );
  assert.ok(pythonSources.status === 0, 'Locked Python Cargo material fetch failed.');
  // Build the JS facades from this attempt's fresh generated bindings without
  // re-entering require-geospec-artifacts while this producer owns its lock.
  run('build');
  const assemblyOutput = run('assemble-package');
  const selections = [...assemblyOutput.matchAll(/^ASSEMBLY_ROOT=(.+)$/gm)].map((match) => match[1]?.trim());
  assert.ok(
    selections.length === 1 && selections[0] && posix.isAbsolute(selections[0]),
    'Missing unique successful assembly root.',
  );
  mkdirSync(resolve(root, transportPath, 'assembly/tarballs'), { recursive: true });
  for (const name of archiveNames) {
    copyFileSync(join(selections[0], 'tarballs', name), resolve(root, transportPath, 'assembly/tarballs', name));
  }
  assert.ok(isDeepStrictEqual(source.files, sourceIdentity(root).files), 'GeoSpec sources changed during assembly.');
  const complete = {
    ...inventory,
    delivery: {
      platform: 'darwin-arm64',
      run: workflowRun(),
      assemblyRun: workflowRun(),
      archives: archivePaths.map((path) => fileRecord(root, path)),
      nativeProof: fileRecord(root, proofPath),
    },
  };
  assert.equal(
    cacheKey,
    deliveryCacheKey(root),
    'GeoSpec source, toolchain or selected environment changed during production.',
  );
  publishInventory(root, complete);
  return verifyDelivery(root);
};

/** Repackage unchanged verified products with a source kit made from this checkout.
 * @type {(root: string, inventory: ReturnType<typeof verifyArtifacts>) => ReturnType<typeof verifyDelivery>}
 */
const reassembleDelivery = (root, inventory) => {
  const source = sourceIdentity(root);
  const inputs = readJson(resolve(root, mixedInputsPath));
  const proof = readJson(resolve(root, proofPath));
  const nativePrefix =
    proof.actualPrefix !== null && typeof proof.actualPrefix === 'object'
      ? /** @type {{path?: unknown}} */ (proof.actualPrefix).path
      : undefined;
  const nativeCargoHome = /** @type {{invocation?: {environment?: {CARGO_HOME?: unknown}}} | undefined} */ (
    proof.actualBuild
  )?.invocation?.environment?.CARGO_HOME;
  const nativeToolPath = /** @type {{invocation?: {environment?: {PATH?: unknown}}} | undefined} */ (proof.actualBuild)
    ?.invocation?.environment?.PATH;
  assert.ok(
    typeof inputs.preparationCache === 'string' &&
      posix.isAbsolute(inputs.preparationCache) &&
      typeof nativePrefix === 'string' &&
      posix.isAbsolute(nativePrefix) &&
      typeof nativeCargoHome === 'string' &&
      posix.isAbsolute(nativeCargoHome) &&
      typeof nativeToolPath === 'string',
    'Verified delivery lacks source-kit assembly inputs.',
  );
  const pnpmRunner = executableOnPath('pnpm', nativeToolPath);
  assert.ok(pnpmRunner, 'Recorded GeoSpec pnpm runner is unavailable.');
  const result = childProcess.spawnSync(
    pnpmRunner,
    ['nx', 'run', 'geospec-engine-native:assemble-package', '--excludeTaskDependencies'],
    {
      cwd: root,
      stdio: producerStdio(true),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 ** 2,
      env: {
        ...process.env,
        NX_DAEMON: 'false',
        pnpm_config_verify_deps_before_run: 'warn',
        PATH: nativeToolPath,
        CARGO_HOME: nativeCargoHome,
        GEOSPEC_DELIVERY_CACHE: inputs.preparationCache,
        GEOSPEC_OCCT_PREFIX: nativePrefix,
        GEOSPEC_PRODUCER_RECEIPT: resolve(root, proofPath),
        GEOSPEC_MIXED_INPUTS: resolve(root, mixedInputsPath),
        GEOSPEC_MIXED_COMMANDS: resolve(root, mixedCommandsPath),
        GEOSPEC_MIXED_RECEIPT: resolve(root, receiptPath),
      },
    },
  );
  assert.ok(result.status === 0, `GeoSpec source-kit assembly failed: ${result.stderr || result.error}`);
  const selections = [...result.stdout.matchAll(/^ASSEMBLY_ROOT=(.+)$/gm)].map((match) => match[1]?.trim());
  assert.ok(
    selections.length === 1 && selections[0] && posix.isAbsolute(selections[0]),
    'Missing unique successful source-kit assembly root.',
  );
  const assemblyRoot = selections[0];
  const selected = archiveNames.map((name) => fileRecord(assemblyRoot, `tarballs/${name}`));
  const selectedArchives = selected.map((record) => ({
    ...record,
    path: `${transportPath}/assembly/${posix.basename(assemblyRoot)}/tarballs/${posix.basename(record.path)}`,
  }));
  checkCurrentSourceKit({ checkout: root, archiveRoot: assemblyRoot, archives: selected, source });
  assert.ok(
    isDeepStrictEqual(source.files, sourceIdentity(root).files),
    'GeoSpec sources changed during source-kit assembly.',
  );
  const directory = resolve(root, transportPath, 'assembly', posix.basename(assemblyRoot), 'tarballs');
  mkdirSync(directory, { recursive: true });
  for (const name of archiveNames) {
    copyFileSync(join(assemblyRoot, 'tarballs', name), join(directory, name));
  }
  const complete = {
    ...inventory,
    schema: 'geospec-ci-artifacts-v3',
    source,
    producerSource:
      inventory.schema === 'geospec-ci-artifacts-v3'
        ? /** @type {ReturnType<typeof sourceIdentity>} */ (inventory.producerSource)
        : producerIdentity(inventory.source),
    delivery: {
      platform: 'darwin-arm64',
      run: recordedWorkflowRun(inventory.delivery?.run),
      assemblyRun: workflowRun(),
      archives: selectedArchives,
      nativeProof: fileRecord(root, proofPath),
    },
  };
  assert.ok(
    isDeepStrictEqual(complete.artifacts, payload(root)),
    'GeoSpec products changed during source-kit assembly.',
  );
  publishInventory(root, complete);
  return verifyDelivery(root);
};

/** Reuse a verified delivery or rebuild it through the existing producers.
 * @type {(root: string) => ReturnType<typeof verifyDelivery>}
 * @internal
 */
export const ensureDelivery = (root) => {
  try {
    return verifyDelivery(root);
  } catch (error) {
    let compatible;
    try {
      compatible = verifyArtifacts(root);
      const { archives, nativeProof, platform, run, assemblyRun } =
        /** @type {{archives: ReturnType<typeof fileRecord>[], nativeProof: ReturnType<typeof fileRecord>, platform: string, run: ReturnType<typeof workflowRun>, assemblyRun?: ReturnType<typeof workflowRun>}} */ (
          compatible.delivery
        );
      assert.ok(
        platform === 'darwin-arm64' &&
          isDeepStrictEqual(run, recordedWorkflowRun(run)) &&
          (compatible.schema === 'geospec-ci-artifacts-v2' ||
            isDeepStrictEqual(assemblyRun, recordedWorkflowRun(assemblyRun))) &&
          isDeepStrictEqual(nativeProof, fileRecord(root, proofPath)) &&
          isDeepStrictEqual(
            archives,
            archives.map((archive) => fileRecord(root, archive.path)),
          ),
        'Previous delivery is not intact for source-kit assembly.',
      );
    } catch {
      console.log(`Preparing GeoSpec delivery: ${error instanceof Error ? error.message : String(error)}`);
      return prepareArtifacts(root);
    }
    return reassembleDelivery(root, compatible);
  }
};

/** Select immutable archives while holding the same producer lock as prepare/verify.
 * @type {(root: string) => string}
 * @internal
 */
export const snapshotDelivery = (root) => {
  let inventory;
  try {
    inventory = verifyDelivery(root);
  } catch (error) {
    throw new Error(
      `GeoSpec delivery is missing or stale; run pnpm nx run geospec-engine-native:prepare-geospec-ci-artifacts: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const cache = resolve(root, 'node_modules/.cache/geospec-engine-native');
  mkdirSync(cache, { recursive: true });
  const snapshot = mkdtempSync(join(cache, 'assembly-snapshot-'));
  try {
    mkdirSync(join(snapshot, 'tarballs'));
    const { archives } = /** @type {{archives: ReturnType<typeof fileRecord>[]}} */ (inventory.delivery);
    for (const archive of archives) {
      const destination = join(snapshot, 'tarballs', posix.basename(archive.path));
      copyFileSync(resolve(root, archive.path), destination);
      const copied = readFileSync(destination);
      assert.ok(
        copied.length === archive.bytes && digest(copied) === archive.sha256,
        `Assembly snapshot changed: ${archive.path}`,
      );
    }
    assert.ok(
      isDeepStrictEqual(inventory.source.files, sourceIdentity(root).files),
      'GeoSpec sources changed during snapshot.',
    );
    return snapshot;
  } catch (error) {
    rmSync(snapshot, { recursive: true, force: true });
    throw error;
  }
};

const invokedScript = process.argv.at(1);
if (invokedScript !== undefined && resolve(invokedScript) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(import.meta.dirname, '../../..');
    if (process.argv.length === 3 && process.argv[2] === 'cache-key') {
      console.log(deliveryCacheKey(root));
      process.exit(0);
    }
    const worker = process.argv[2] === '--producer';
    assert.ok(
      process.argv.length === (worker ? 4 : 3),
      'Usage: ci-artifacts.mjs prepare|verify|verify-delivery|ensure-delivery|snapshot-delivery',
    );
    const mode = process.argv[worker ? 3 : 2];
    assert.ok(
      mode === 'prepare' ||
        mode === 'verify' ||
        mode === 'verify-delivery' ||
        mode === 'ensure-delivery' ||
        mode === 'snapshot-delivery',
      'Usage: ci-artifacts.mjs prepare|verify|verify-delivery|ensure-delivery|snapshot-delivery',
    );
    const produces = mode === 'prepare' || mode === 'ensure-delivery';
    assert.ok(
      process.platform === 'darwin' || (!produces && mode !== 'snapshot-delivery'),
      'GeoSpec production and snapshot selection require Darwin; non-Darwin supports verified transport reads only.',
    );
    if (worker) {
      assert.ok(produces && process.platform === 'darwin', 'Unsupported GeoSpec producer worker.');
      heldLockFile = 3;
    } else if (process.platform === 'darwin') {
      const file = resolve(root, lockPath);
      mkdirSync(resolve(root, 'node_modules/.cache/geospec-engine-native'), { recursive: true });
      heldLockFile = openSync(file, 'a+');
      const lock = childProcess.spawnSync('lockf', ['3'], { stdio: ['ignore', 'inherit', 'inherit', heldLockFile] });
      assert.ok(lock.status === 0, `GeoSpec delivery lock failed: ${lock.error?.message ?? lock.status}`);
    }
    try {
      if (!worker && produces) {
        recoverExitedProducer(root, darwinGroupAlive, closedRecipe(root));
      } else if (!worker) {
        assert.ok(
          !existsSync(resolve(root, activePath)),
          'GeoSpec producer active or interrupted; read-only verification refused.',
        );
      }
      if (!worker && produces) {
        const child = childProcess.spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--producer', mode], {
          cwd: root,
          detached: true,
          stdio: ['inherit', 'inherit', 'inherit', heldLockFile],
        });
        assert.ok(child.status === 0, `GeoSpec producer failed: ${child.error?.message ?? child.status}`);
      } else if (mode === 'snapshot-delivery') {
        console.log(`ASSEMBLY_ROOT=${snapshotDelivery(root)}`);
      } else {
        const inventory =
          mode === 'ensure-delivery'
            ? withProducerMarker(root, () => ensureDelivery(root), {
                pgid: process.pid,
                recipeSha256: closedRecipe(root),
              })
            : mode === 'prepare'
              ? withProducerMarker(root, () => prepareArtifacts(root), {
                  pgid: process.pid,
                  recipeSha256: closedRecipe(root),
                })
              : mode === 'verify-delivery'
                ? verifyDelivery(root)
                : verifyArtifacts(root);
        console.log(`Verified ${inventory.artifacts.length} GeoSpec artifacts for ${inventory.source.revision}.`);
      }
    } finally {
      if (heldLockFile !== undefined) {
        closeSync(heldLockFile);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
