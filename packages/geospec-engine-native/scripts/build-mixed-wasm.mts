/** Build the selected ST mixed engine from a hash-qualified local tool closure. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

type Input = { path: string; sha256: string };
type Closure = {
  schema: string;
  sourceRoot: string;
  sourceRevision: string;
  output: string;
  cache: string;
  preparationCache: string;
  rustPrefix: string;
  sdkPrefix: string;
  rustc: string;
  cargo: string;
  emxx: string;
  emcc: string;
  emar: string;
  tools: Record<string, string>;
  environment: Record<string, string>;
  occtPrefix: string;
  libraries: string[];
  inputs: Input[];
  linkOptimization?: string;
  wasmSimd: { rustFlags: string[]; cxxFlag: string; linkFlag: string };
  wasmEh: { compileFlags: string[]; linkFlags: string[] };
};

const root = resolve(import.meta.dirname, '../../..');
const digest = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const verifiedTool = (closure: Closure, name: string): string => {
  const executable = closure.tools[name];
  if (executable === undefined) {
    throw new Error(`Prepared closure does not select ${name}.`);
  }
  const input = closure.inputs.find((candidate) => candidate.path === executable);
  if (input === undefined || digest(readFileSync(executable)) !== input.sha256) {
    throw new Error(`Prepared ${name} bytes changed.`);
  }
  return executable;
};

const main = (): void => {
  const manifestPath =
    process.env['GEOSPEC_MIXED_INPUTS'] ??
    resolve(
      process.env['GEOSPEC_DELIVERY_CACHE'] ??
        resolve(root, 'node_modules/.cache/geospec-engine-native/delivery-wasm-eh'),
      'mixed-inputs-simd128.json',
    );
  const manifestBytes = readFileSync(manifestPath);
  const closure = JSON.parse(manifestBytes.toString()) as Closure;
  if (closure.schema !== 'geospec-mixed-build-inputs-v3' || closure.sourceRoot !== root) {
    throw new Error('Run prepare-delivery.py inputs for this checkout after the source freeze.');
  }
  const python = verifiedTool(closure, 'python3');
  const validation = spawnSync(
    python,
    [
      '-B',
      resolve(root, 'packages/geospec-engine-native/scripts/prepare-delivery.py'),
      'verify',
      '--manifest',
      resolve(manifestPath),
    ],
    {
      cwd: root,
      /* eslint-disable @typescript-eslint/naming-convention -- Exact preparation environment variable names. */
      env: {
        ...closure.environment,
        GEOSPEC_DELIVERY_CACHE: closure.preparationCache,
        GEOSPEC_DELIVERY_RUST_PREFIX: closure.rustPrefix,
        GEOSPEC_DELIVERY_EMSDK_PREFIX: closure.sdkPrefix,
      },
      /* eslint-enable @typescript-eslint/naming-convention -- Resume ordinary property naming after external environment keys. */
      encoding: 'utf8',
      maxBuffer: 4 * 1024 ** 2,
      timeout: 5 * 60_000,
    },
  );
  if (validation.status !== 0) {
    throw new Error(`Delivery closure verification failed: ${validation.stderr || validation.error}`);
  }
  const { linkOptimization, output, cache } = closure;
  if (linkOptimization !== 'O0' && linkOptimization !== 'O3') {
    throw new Error('Mixed link optimization must be O0 or O3.');
  }
  const ehFlags = ['-fwasm-exceptions', '-sWASM_LEGACY_EXCEPTIONS=1', '-sSUPPORT_LONGJMP=wasm'];
  if (
    JSON.stringify(closure.wasmSimd) !==
      JSON.stringify({ rustFlags: ['-C', 'target-feature=+simd128'], cxxFlag: '-msimd128', linkFlag: '-msimd128' }) ||
    JSON.stringify(closure.wasmEh) !== JSON.stringify({ compileFlags: ehFlags, linkFlags: ehFlags })
  ) {
    throw new Error('Prepared closure must select fixed SIMD, native legacy WASM EH and matching WASM longjmp.');
  }
  const packageRoot = resolve(closure.sourceRoot, 'packages/geospec-engine-native');
  if (
    (process.env['GEOSPEC_MIXED_OUTPUT'] !== undefined && resolve(process.env['GEOSPEC_MIXED_OUTPUT']) !== output) ||
    (process.env['GEOSPEC_MIXED_CACHE'] !== undefined && resolve(process.env['GEOSPEC_MIXED_CACHE']) !== cache)
  ) {
    throw new Error('Build output/cache must match the prepared closure.');
  }
  const space = statfsSync(root);
  if (space.bavail * space.bsize < 6 * 1024 ** 3) {
    throw new Error('Mixed build needs at least 6 GiB free for current-source compiler and linker outputs.');
  }
  mkdirSync(cache, { recursive: true });
  mkdirSync(output, { recursive: true });
  const runDirectory = resolve(cache, `attempt-${Date.now()}`);
  mkdirSync(runDirectory);
  /* eslint-disable @typescript-eslint/naming-convention -- Exact Rust, Cargo and cc-rs environment keys. */
  const environment = {
    ...closure.environment,
    RUSTC: closure.rustc,
    GEOSPEC_OCCT_PREFIX: closure.occtPrefix,
    CARGO_INCREMENTAL: '0',
    CC_wasm32_unknown_emscripten: closure.emcc,
    CXX_wasm32_unknown_emscripten: closure.emxx,
    AR_wasm32_unknown_emscripten: closure.emar,
    CARGO_ENCODED_RUSTFLAGS: closure.wasmSimd.rustFlags.join('\u001F'),
    GEOSPEC_WASM_SIMD_PROFILE: 'simd128-v1',
    CXXFLAGS_wasm32_unknown_emscripten: [closure.wasmSimd.cxxFlag, '-frtti', ...closure.wasmEh.compileFlags].join(' '),
  };
  /* eslint-enable @typescript-eslint/naming-convention -- Resume normal identifier checks after external keys. */
  const commands: Array<{ executable: string; args: string[]; status: ReturnType<typeof spawnSync>['status'] }> = [];
  const run = (name: string, executable: string, args: string[]): string => {
    const result = spawnSync(executable, args, {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 ** 2,
    });
    writeFileSync(resolve(runDirectory, `${name}.stdout`), result.stdout || '');
    writeFileSync(resolve(runDirectory, `${name}.stderr`), result.stderr || String(result.error ?? ''));
    commands.push({ executable, args, status: result.status });
    writeFileSync(resolve(runDirectory, 'commands.json'), `${JSON.stringify(commands, null, 2)}\n`);
    if (result.status !== 0) {
      throw new Error(`${name} failed: ${(result.stderr || '').slice(-3000) || result.error}`);
    }
    return result.stdout;
  };
  const rustVersion = run('rust-version', closure.rustc, ['-vV']);
  if (!rustVersion.includes('c656540d6467dee1381f0cbd882412d6bd1cd5ae')) {
    throw new Error('Wrong selected Rust nightly.');
  }
  const emVersion = run('emscripten-version', closure.emxx, ['--version']);
  if (!emVersion.includes('6.0.5') || !emVersion.includes('1db513782be24469589d7cb8a1f1834e9a33f271')) {
    throw new Error('Wrong selected Emscripten version.');
  }
  const binding = readFileSync(resolve(packageRoot, 'bindings/emscripten/src/lib.rs'));
  const exports = [...binding.toString().matchAll(/pub extern "C" fn (geospec_engine_native_[_a-z]+)/g)].map(
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
  const linkerMap = resolve(cache, 'geospec_engine_native.map');
  run('link', closure.emxx, [
    `-${linkOptimization}`,
    closure.wasmSimd.linkFlag,
    ...closure.wasmEh.linkFlags,
    '-frtti',
    '--no-entry',
    '-Wl,--start-group',
    staticlib,
    ...closure.libraries,
    '-Wl,--end-group',
    `-Wl,-Map,${linkerMap}`,
    '-sMODULARIZE=1',
    '-sEXPORT_ES6=1',
    '-sINCOMING_MODULE_JS_API=["locateFile","wasmBinary"]',
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
  const systemCache = closure.environment['EM_CACHE'];
  const linkedSystemLibraries = [
    ...new Set(
      [...readFileSync(linkerMap, 'utf8').matchAll(/\s(\/\S+\.a)\([^)]*\):\(/g)]
        .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
        .filter((path) => path.startsWith(`${systemCache}/`)),
    ),
  ]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({ path, sha256: digest(readFileSync(path)) }));
  if (!linkedSystemLibraries.some(({ path }) => path.endsWith('/libc++abi-legacyexcept.a'))) {
    throw new Error('Linker map does not select the native legacy EH C++ ABI library.');
  }
  const artifacts = ['geospec_engine_native.mjs', 'geospec_engine_native.wasm'].map((name) => {
    const path = resolve(output, name);
    const bytes = readFileSync(path);
    return { path, bytes: bytes.length, sha256: digest(bytes) };
  });
  for (const input of closure.inputs.filter((input) => input.path.startsWith(`${packageRoot}/`))) {
    if (digest(readFileSync(input.path)) !== input.sha256) {
      throw new Error(`Source changed during the build: ${input.path}`);
    }
  }
  writeFileSync(
    resolve(runDirectory, 'build-receipt.json'),
    `${JSON.stringify(
      {
        schema: 'geospec-mixed-build-receipt-v2',
        manifestSha256: digest(manifestBytes),
        sourceRoot: closure.sourceRoot,
        sourceRevision: closure.sourceRevision,
        output,
        bindingSha256: digest(binding),
        rustVersion,
        emVersion,
        wasmSimd: closure.wasmSimd,
        wasmEh: closure.wasmEh,
        linkerMap: { path: linkerMap, sha256: digest(readFileSync(linkerMap)) },
        linkedSystemLibraries,
        /* eslint-disable @typescript-eslint/naming-convention -- Exact Cargo and cc-rs environment keys. */
        buildEnvironment: {
          CARGO_ENCODED_RUSTFLAGS: environment.CARGO_ENCODED_RUSTFLAGS,
          CXXFLAGS_wasm32_unknown_emscripten: environment.CXXFLAGS_wasm32_unknown_emscripten,
          GEOSPEC_WASM_SIMD_PROFILE: environment.GEOSPEC_WASM_SIMD_PROFILE,
        },
        /* eslint-enable @typescript-eslint/naming-convention -- Resume ordinary receipt keys. */
        profile: `emscripten-6.0.5-wasm-legacy-exceptions-wasm-sjlj-st-simd128-v1-rust-c656540-panic-abort-link-${linkOptimization}`,
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
