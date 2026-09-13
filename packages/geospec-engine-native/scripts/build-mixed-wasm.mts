/** Build the selected ST mixed engine from a hash-qualified local tool closure. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

type Input = { path: string; sha256: string };
type Closure = {
  schema: 'geospec-mixed-build-inputs-v1';
  sourceRoot: string;
  rustc: string;
  cargo: string;
  emxx: string;
  emcc: string;
  emar: string;
  environment: Record<string, string>;
  occtPrefix: string;
  libraries: string[];
  inputs: Input[];
};

const root = resolve(import.meta.dirname, '../../..');
const cache = resolve(
  process.env['GEOSPEC_MIXED_CACHE'] ??
    resolve(root, 'node_modules/.cache/geospec-engine-native/matcher-full-mixed-build'),
);
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const main = (): void => {
  const manifestPath = process.env['GEOSPEC_MIXED_INPUTS'];
  if (!manifestPath) {
    throw new Error('Set GEOSPEC_MIXED_INPUTS to a verified geospec-mixed-build-inputs-v1 JSON closure.');
  }
  const manifestBytes = readFileSync(manifestPath);
  const closure = JSON.parse(manifestBytes.toString()) as Closure;
  const packageRoot = resolve(closure.sourceRoot, 'packages/geospec-engine-native');
  const output = process.env['GEOSPEC_MIXED_OUTPUT'] ?? resolve(packageRoot, 'bindings/emscripten/generated');
  if (closure.schema !== 'geospec-mixed-build-inputs-v1' || closure.libraries.length === 0) {
    throw new Error('Invalid mixed build closure.');
  }
  for (const input of closure.inputs) {
    if (digest(readFileSync(input.path)) !== input.sha256) {
      throw new Error(`Mixed build input hash mismatch: ${input.path}`);
    }
  }
  const space = statfsSync(root);
  if (space.bavail * space.bsize < 6 * 1024 ** 3) {
    throw new Error('Mixed build needs at least 6 GiB free for current-source compiler and linker outputs.');
  }
  mkdirSync(cache, { recursive: true });
  mkdirSync(output, { recursive: true });
  const runDirectory = resolve(cache, `attempt-${Date.now()}`);
  mkdirSync(runDirectory);
  const environment = {
    ...process.env,
    ...closure.environment,
    RUSTC: closure.rustc,
    GEOSPEC_OCCT_PREFIX: closure.occtPrefix,
    CARGO_INCREMENTAL: '0',
    CC_wasm32_unknown_emscripten: closure.emcc,
    CXX_wasm32_unknown_emscripten: closure.emxx,
    AR_wasm32_unknown_emscripten: closure.emar,
    CXXFLAGS_wasm32_unknown_emscripten:
      '-fexceptions -frtti -sDISABLE_EXCEPTION_CATCHING=0 -sSUPPORT_LONGJMP=emscripten',
  };
  const commands: { executable: string; args: string[]; status: number | null }[] = [];
  const run = (name: string, executable: string, args: string[]): string => {
    const result = spawnSync(executable, args, {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 ** 2,
    });
    writeFileSync(resolve(runDirectory, `${name}.stdout`), result.stdout ?? '');
    writeFileSync(resolve(runDirectory, `${name}.stderr`), result.stderr ?? String(result.error ?? ''));
    commands.push({ executable, args, status: result.status });
    writeFileSync(resolve(runDirectory, 'commands.json'), `${JSON.stringify(commands, null, 2)}\n`);
    if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr?.slice(-3000) ?? result.error}`);
    return result.stdout;
  };
  const rustVersion = run('rust-version', closure.rustc, ['-vV']);
  if (!rustVersion.includes('c656540d6467dee1381f0cbd882412d6bd1cd5ae'))
    throw new Error('Wrong selected Rust nightly.');
  const emVersion = run('emscripten-version', closure.emxx, ['--version']);
  if (!emVersion.includes('6.0.5')) throw new Error('Wrong selected Emscripten version.');
  const binding = readFileSync(resolve(packageRoot, 'bindings/emscripten/src/lib.rs'));
  const exports = [...binding.toString().matchAll(/pub extern "C" fn (geospec_engine_native_[a-z_]+)/g)].map(
    (match) => `_${match[1]}`,
  );
  exports.push('_malloc', '_free');
  const target = resolve(cache, 'target');
  run('cargo-release', closure.cargo, [
    'build',
    '--manifest-path',
    resolve(packageRoot, 'bindings/emscripten/Cargo.toml'),
    '--locked',
    '--offline',
    '--release',
    '--target',
    'wasm32-unknown-emscripten',
    '--target-dir',
    target,
  ]);
  const staticlib = resolve(target, 'wasm32-unknown-emscripten/release/libgeospec_engine_native_emscripten.a');
  const modulePath = resolve(output, 'geospec_engine_native.mjs');
  run('link', closure.emxx, [
    '-O0',
    '-fexceptions',
    '-frtti',
    '--no-entry',
    '-Wl,--start-group',
    staticlib,
    ...closure.libraries,
    '-Wl,--end-group',
    `-Wl,-Map,${resolve(cache, 'geospec_engine_native.map')}`,
    '-sDISABLE_EXCEPTION_CATCHING=0',
    '-sSUPPORT_LONGJMP=emscripten',
    '-sMODULARIZE=1',
    '-sEXPORT_ES6=1',
    '-sENVIRONMENT=web,worker,node',
    '-sINVOKE_RUN=0',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sINITIAL_MEMORY=134217728',
    '-sSTACK_SIZE=5242880',
    '-sWASM_BIGINT=1',
    '-sEXIT_RUNTIME=0',
    `-sEXPORTED_FUNCTIONS=${JSON.stringify(exports)}`,
    '-sEXPORTED_RUNTIME_METHODS=HEAPU8',
    '-o',
    modulePath,
  ]);
  const artifacts = ['geospec_engine_native.mjs', 'geospec_engine_native.wasm'].map((name) => {
    const path = resolve(output, name);
    const bytes = readFileSync(path);
    return { path, bytes: bytes.length, sha256: digest(bytes) };
  });
  writeFileSync(
    resolve(runDirectory, 'build-receipt.json'),
    `${JSON.stringify(
      {
        manifestSha256: digest(manifestBytes),
        bindingSha256: digest(binding),
        rustVersion,
        emVersion,
        profile: 'emscripten-6.0.5-js-exceptions-sjlj-st-rust-c656540-panic-abort-link-O0',
        artifacts,
        qualification: 'Current-source compile/link only; runtime and target parity require independent checks.',
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify(artifacts));
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
