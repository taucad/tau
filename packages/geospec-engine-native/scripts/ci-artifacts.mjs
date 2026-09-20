#!/usr/bin/env node
/**
 * Prepare or verify the complete Node/mixed package payload for CI transport.
 * Uses existing Nx producers; hashes establish transport identity, not qualification.
 * Usage: node packages/geospec-engine-native/scripts/ci-artifacts.mjs prepare|verify
 * Optional env: GEOSPEC_DELIVERY_CACHE and existing delivery tool selectors.
 * Output: out/artifacts/geospec-native-engine/ci/{inventory,mixed-build-receipt,mixed-inputs,mixed-commands}.json
 * Exit: 0 complete and matching; 1 missing, changed or failed prerequisite.
 */
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const packagePath = 'packages/geospec-engine-native';
const transportPath = 'out/artifacts/geospec-native-engine/ci';
const inventoryPath = `${transportPath}/inventory.json`;
const receiptPath = `${transportPath}/mixed-build-receipt.json`;
const mixedInputsPath = `${transportPath}/mixed-inputs.json`;
const mixedCommandsPath = `${transportPath}/mixed-commands.json`;
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
    ...[
      'rust',
      'native',
      'bindings/node',
      'bindings/emscripten',
      'scripts',
      'src',
      'package.json',
      'project.json',
      'tsdown.config.ts',
      'tsconfig*.json',
    ].map((path) => `${packagePath}/${path}`),
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'nx.json',
    'tsconfig.base.json',
    'tools/tsdown.plugin.ts',
  ])
    .split('\0')
    .filter(Boolean);
  // Explicitly cover this owned new script before its first commit; never scan untracked build trees.
  paths.push(`${packagePath}/scripts/ci-artifacts.mjs`);
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
  const inputsPath = join(cache, 'mixed-inputs.json');
  /** @type {(target: string) => void} */
  const run = (target) => {
    const result = childProcess.spawnSync('pnpm', ['nx', 'run', `geospec-engine-native:${target}`], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        pnpm_config_verify_deps_before_run: 'warn',
        GEOSPEC_NODE_MANIFEST: 'bindings/node/Cargo.toml',
        GEOSPEC_OCCT_PREFIX: join(cache, 'occt-native/install'),
        GEOSPEC_MIXED_INPUTS: inputsPath,
      },
    });
    assert.ok(result.status === 0, `GeoSpec producer ${target} failed: ${result.error?.message ?? result.status}`);
  };
  for (const target of [
    'prepare-delivery:sources',
    'prepare-delivery:tools',
    'prepare-delivery:prefixes',
    'build-node',
    'prepare-delivery:inputs',
  ]) {
    run(target);
  }
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
  return verifyArtifacts(root);
};

const invokedScript = process.argv.at(1);
if (invokedScript !== undefined && resolve(invokedScript) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(import.meta.dirname, '../../..');
    assert.ok(process.argv.length === 3, 'Usage: ci-artifacts.mjs prepare|verify');
    const mode = process.argv[2];
    assert.ok(mode === 'prepare' || mode === 'verify', 'Usage: ci-artifacts.mjs prepare|verify');
    const inventory = mode === 'prepare' ? prepareArtifacts(root) : verifyArtifacts(root);
    console.log(`Verified ${inventory.artifacts.length} GeoSpec artifacts for ${inventory.source.revision}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
