#!/usr/bin/env node
/**
 * Prepare or verify the complete Node/mixed package payload for CI transport.
 * Uses existing Nx producers; hashes establish transport identity, not qualification.
 * Usage: node packages/geospec-engine-native/scripts/ci-artifacts.mjs prepare|verify|verify-delivery
 * Optional env: GEOSPEC_DELIVERY_CACHE and existing delivery tool selectors.
 * GEOSPEC_NATIVE_DELIVERY_CACHE selects independent retained native-prefix reuse;
 * GEOSPEC_NATIVE_OCCT_PRODUCER_BUILDER/RECIPE and GEOSPEC_NATIVE_GIT_CEILING_DIRECTORIES
 * apply only to that prefix's verification. Mixed selectors remain independent.
 * Output: out/artifacts/geospec-native-engine/ci/{inventory,mixed-build-receipt,mixed-inputs,mixed-commands}.json
 * Exit: 0 complete and matching; 1 missing, changed or failed prerequisite.
 */
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, posix, resolve } from 'node:path';
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
/** @type {() => {id: string | null, attempt: string | null}} */
const workflowRun = () => ({ id: process.env.GITHUB_RUN_ID ?? null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null });
const outputs = [
  `${packagePath}/bindings/node/generated/index.d.ts`,
  `${packagePath}/bindings/node/generated/index.js`,
  `${packagePath}/bindings/node/generated/geospec-engine-native.darwin-arm64.node`,
  `${packagePath}/bindings/emscripten/generated/geospec_engine_native.mjs`,
  `${packagePath}/bindings/emscripten/generated/geospec_engine_native.wasm`,
];
/** @type {(bytes: import('node:crypto').BinaryLike) => string} */
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
/** @type {(root: string) => {revision: string, files: ReturnType<typeof fileRecord>[]}} */
const sourceIdentity = (root) => {
  /** @type {(args: string[]) => string} */
  const git = (args) => childProcess.execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const paths = git([
    'ls-files',
    '--cached',
    '-z',
    '--',
    packagePath,
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'nx.json',
    'tsconfig.base.json',
    'tools/tsdown.plugin.ts',
  ])
    .split('\0')
    .filter(Boolean);
  // Bind the source-kit package, including licenses; also cover owned helpers before their first commit.
  paths.push(`${packagePath}/scripts/ci-artifacts.mjs`);
  paths.push(`${packagePath}/scripts/collect-native-proof.py`);
  paths.push(`${packagePath}/scripts/test_native_proof.py`);
  return {
    revision: git(['rev-parse', 'HEAD']).trim(),
    files: [...new Set(paths)].sort().map((path) => fileRecord(root, path)),
  };
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
  const { sourceRevision, sourceRoot, manifestSha256, bindingSha256, artifacts, output } = readJson(
    resolve(root, receiptPath),
  );
  assert.ok(sourceRevision === inventory.source.revision, 'Mixed receipt source revision differs.');
  assert.ok(typeof sourceRoot === 'string' && posix.isAbsolute(sourceRoot), 'Mixed receipt lacks producer root.');
  assert.ok(manifestSha256 === fileRecord(root, mixedInputsPath).sha256, 'Mixed receipt/input-manifest hash differs.');
  const inputs = readJson(resolve(root, mixedInputsPath));
  assert.ok(inputs.schema === 'geospec-mixed-build-inputs-v2', 'Unsupported mixed input manifest.');
  assert.ok(
    inputs.sourceRoot === sourceRoot && inputs.sourceRevision === sourceRevision,
    'Mixed input source differs from receipt.',
  );
  assert.ok(
    output === posix.join(sourceRoot, packagePath, 'bindings/emscripten/generated') && inputs.output === output,
    'Mixed input/receipt output differs.',
  );
  assert.ok(typeof inputs.cache === 'string' && posix.isAbsolute(inputs.cache), 'Mixed inputs lack build cache.');
  assert.ok(inputs.linkOptimization === 'O3', 'Unsupported mixed link profile.');
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
    commandArguments[3][0] === `-${inputs.linkOptimization}` &&
      isDeepStrictEqual(commandArguments[3].slice(-2), ['-o', posix.join(output, 'geospec_engine_native.mjs')]),
    'Mixed link profile/output differs from inputs.',
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
  const { schema, source: recordedSource, artifacts: recordedArtifacts } = inventory;
  const source = sourceIdentity(root);
  const artifacts = payload(root);
  assert.ok(schema === 'geospec-ci-artifacts-v2', 'Unsupported GeoSpec artifact inventory.');
  assert.ok(
    isDeepStrictEqual(recordedSource, source),
    'GeoSpec artifact source revision/inputs differ from this checkout.',
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
  checkReceipt(root, { source, artifacts });
  return { ...inventory, source, artifacts };
};

/** Verify the final assembly as well as the build inputs; portable across checkout paths.
 * @type {(root: string) => ReturnType<typeof verifyArtifacts>}
 * @internal
 */
export const verifyDelivery = (root) => {
  const inventory = verifyArtifacts(root);
  const archives = archivePaths.map((path) => fileRecord(root, path));
  assert.ok(
    archives.every((file) => file.bytes > 0),
    'Empty delivery archive.',
  );
  assert.ok(
    isDeepStrictEqual(inventory.delivery, {
      platform: 'darwin-arm64',
      run: workflowRun(),
      archives,
      nativeProof: fileRecord(root, proofPath),
    }),
    'Delivery archive/proof hashes or workflow run differ.',
  );
  return inventory;
};

/**
 * Run the existing producers sequentially and inventory only their successful outputs.
 * @type {(root: string) => ReturnType<typeof verifyArtifacts>}
 * @internal
 */
export const prepareArtifacts = (root) => {
  rmSync(resolve(root, inventoryPath), { force: true });
  const source = sourceIdentity(root);
  const { GEOSPEC_DELIVERY_CACHE: deliveryCache } = process.env;
  const cache = resolve(root, deliveryCache ?? 'node_modules/.cache/geospec-engine-native/delivery');
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
    CARGO_HOME: resolve(root, process.env.CARGO_HOME ?? join(homedir(), '.cargo')),
    pnpm_config_verify_deps_before_run: 'warn',
    GEOSPEC_DELIVERY_CACHE: cache,
    GEOSPEC_NODE_MANIFEST: 'bindings/node/Cargo.toml',
    GEOSPEC_OCCT_PREFIX: join(nativeCache, 'occt-native/install'),
    GEOSPEC_MIXED_INPUTS: resolve(root, mixedInputsPath),
    GEOSPEC_MIXED_COMMANDS: resolve(root, mixedCommandsPath),
    GEOSPEC_MIXED_RECEIPT: resolve(root, receiptPath),
    GEOSPEC_PRODUCER_RECEIPT: resolve(root, proofPath),
  };
  const inputsPath = join(cache, 'mixed-inputs.json');
  mkdirSync(resolve(root, transportPath), { recursive: true });
  /** @type {(target: string, preparationEnvironment?: Record<string, string | undefined>) => string} */
  const run = (target, preparationEnvironment = {}) => {
    const argv = ['pnpm', 'nx', 'run', `geospec-engine-native:${target}`];
    const capture = target === 'build-node' || target === 'assemble-package';
    const overrides =
      target === 'build-node'
        ? { CARGO_TARGET_DIR: nativeTarget, RUSTC_LOG: 'rustc_codegen_ssa::back::link=info' }
        : {};
    const started = new Date().toISOString();
    const result = childProcess.spawnSync('pnpm', argv.slice(1), {
      cwd: root,
      stdio: capture ? 'pipe' : 'inherit',
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
            environment: {
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
    run('prepare-delivery:reuse-native', {
      GEOSPEC_DELIVERY_CACHE: nativeCache,
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
  assert.ok(isDeepStrictEqual(source, sourceIdentity(root)), 'GeoSpec sources changed during production.');
  const artifacts = payload(root);
  mkdirSync(resolve(root, transportPath), { recursive: true });
  writeFileSync(resolve(root, receiptPath), receiptBytes);
  writeFileSync(resolve(root, mixedInputsPath), inputsBytes);
  writeFileSync(resolve(root, mixedCommandsPath), readFileSync(join(mixedCache, newAttempt, 'commands.json')));
  const inventory = {
    schema: 'geospec-ci-artifacts-v2',
    source,
    artifacts,
    mixedReceipt: fileRecord(root, receiptPath),
    mixedInputs: fileRecord(root, mixedInputsPath),
    mixedCommands: fileRecord(root, mixedCommandsPath),
  };
  checkReceipt(root, inventory);
  writeFileSync(resolve(root, inventoryPath), `${JSON.stringify(inventory, null, 2)}\n`);
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
      stdio: 'inherit',
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
    { cwd: root, stdio: 'inherit', env: environment },
  );
  assert.ok(pythonSources.status === 0, 'Locked Python Cargo material fetch failed.');
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
  assert.ok(isDeepStrictEqual(source, sourceIdentity(root)), 'GeoSpec sources changed during assembly.');
  const complete = {
    ...inventory,
    delivery: {
      platform: 'darwin-arm64',
      run: workflowRun(),
      archives: archivePaths.map((path) => fileRecord(root, path)),
      nativeProof: fileRecord(root, proofPath),
    },
  };
  writeFileSync(resolve(root, inventoryPath), `${JSON.stringify(complete, null, 2)}\n`);
  return verifyDelivery(root);
};

const invokedScript = process.argv.at(1);
if (invokedScript !== undefined && resolve(invokedScript) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(import.meta.dirname, '../../..');
    assert.ok(process.argv.length === 3, 'Usage: ci-artifacts.mjs prepare|verify|verify-delivery');
    const mode = process.argv[2];
    assert.ok(
      mode === 'prepare' || mode === 'verify' || mode === 'verify-delivery',
      'Usage: ci-artifacts.mjs prepare|verify|verify-delivery',
    );
    const inventory =
      mode === 'prepare'
        ? prepareArtifacts(root)
        : mode === 'verify-delivery'
          ? verifyDelivery(root)
          : verifyArtifacts(root);
    console.log(`Verified ${inventory.artifacts.length} GeoSpec artifacts for ${inventory.source.revision}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
