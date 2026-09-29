/** Build the selected ST or opt-in pthread mixed engine from a hash-qualified local tool closure. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statfsSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
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
const treeDigest = (directory: string): string => {
  const hash = createHash('sha256');
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) {
        visit(child);
      } else {
        hash.update(child.slice(directory.length)).update(readFileSync(child));
      }
    }
  };
  visit(directory);
  return hash.digest('hex');
};
const stdCrates = ['alloc', 'core', 'panic_abort', 'std'];

/**
 * Select the rebuilt std closure from Cargo's JSON messages for this build.
 * Cargo's build-dir layout has no stable `deps/` directory, and a reused target can hold stale units.
 * @param messages - Cargo `--message-format=json-render-diagnostics` stdout.
 * @param library - Pinned rust-src `library` directory.
 * @returns One rlib path per std crate, in crate-name order.
 */
export const rustStdArchivePaths = (messages: string, library: string): string[] => {
  const archives = messages
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .flatMap((line) => {
      const message = JSON.parse(line) as {
        reason?: string;
        manifest_path?: string;
        target?: { name?: string };
        filenames?: string[];
      };
      const name = message.target?.name ?? '';
      return message.reason === 'compiler-artifact' &&
        stdCrates.includes(name) &&
        message.manifest_path?.startsWith(`${library}/`) === true
        ? (message.filenames ?? []).filter((path) => path.endsWith('.rlib')).map((path) => ({ name, path }))
        : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  if (JSON.stringify(archives.map(({ name }) => name)) !== JSON.stringify(stdCrates)) {
    throw new Error('MT Cargo build did not report exactly one rebuilt std/core/alloc/panic_abort archive each.');
  }
  return archives.map(({ path }) => path);
};

/**
 * Identify the pthread OCCT prefix by the verified inputs it reads.
 * Rust, bridge, binding and delivery-script sources and Rust toolchains are excluded, so a
 * source-only input refresh can reuse the prefix; OCCT sources, patches, builder, recipe,
 * SDK, tools, environment and the CMake command stay bound.
 * @param manifest - Verified mixed build input closure.
 * @param command - Exact prefix builder command.
 * @returns Hex SHA-256 identity.
 */
export const pthreadPrefixIdentity = (
  manifest: Pick<Closure, 'environment' | 'inputs' | 'preparationCache' | 'rustPrefix' | 'sourceRoot' | 'tools'>,
  command: string[],
): string => {
  const packageRoot = `${manifest.sourceRoot}/packages/geospec-engine-native`;
  const unread = [
    ...[
      'bindings',
      'native/cache-host',
      'native/manifold-rust',
      'native/occt/bridge',
      'native/occt/rust',
      'native/occt/tests',
      'native/runtime',
      'rust',
    ].map((path) => `${packageRoot}/${path}/`),
    `${packageRoot}/scripts/build-mixed-wasm.mts`,
    `${packageRoot}/scripts/prepare-delivery.py`,
    `${manifest.rustPrefix}/`,
    ...['cargo', 'em-cache', 'occt-mixed-simd128'].map((path) => `${manifest.preparationCache}/${path}/`),
    ...(manifest.tools['rustup'] === undefined ? [] : [manifest.tools['rustup']]),
  ];
  const inputs = manifest.inputs.filter(({ path }) => !unread.some((prefix) => path.startsWith(prefix)));
  return digest(
    Buffer.from(JSON.stringify({ inputs, environment: manifest.environment, tools: manifest.tools, command })),
  );
};

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
  const variant = process.env['GEOSPEC_MIXED_VARIANT'] ?? 'st';
  if (variant !== 'st' && variant !== 'mt') {
    throw new Error('GEOSPEC_MIXED_VARIANT must be st or mt.');
  }
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
  const { linkOptimization } = closure;
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
  const mt = variant === 'mt';
  const mtPermitsInput = process.env['GEOSPEC_MIXED_MT_PERMITS'];
  const mtPermits = mtPermitsInput === undefined ? Number.NaN : Number(mtPermitsInput);
  if (mt && (!/^[1-9]\d*$/.test(mtPermitsInput ?? '') || !Number.isSafeInteger(mtPermits))) {
    throw new Error('MT build requires GEOSPEC_MIXED_MT_PERMITS as a positive integer including the computing caller.');
  }
  const mtBaseCache = resolve(closure.preparationCache, 'mixed-build-pthread-simd128');
  const cache = mt ? resolve(mtBaseCache, `permits-${mtPermits}`) : closure.cache;
  const mtSettings = {
    rustFeatures: '+simd128,+atomics,+bulk-memory,+mutable-globals',
    executionPermits: mtPermits,
    poolSize: mtPermits - 1,
    pthreadStackBytes: 5 * 1024 ** 2,
    initialMemoryBytes: 128 * 1024 ** 2,
    maximumMemoryBytes: 2 * 1024 ** 3,
    allocator: 'dlmalloc',
  };
  if (
    (process.env['GEOSPEC_MIXED_OUTPUT'] !== undefined &&
      resolve(process.env['GEOSPEC_MIXED_OUTPUT']) !== closure.output) ||
    (process.env['GEOSPEC_MIXED_CACHE'] !== undefined && resolve(process.env['GEOSPEC_MIXED_CACHE']) !== closure.cache)
  ) {
    throw new Error('Build output/cache must match the prepared closure.');
  }
  const space = statfsSync(root);
  if (space.bavail * space.bsize < 6 * 1024 ** 3) {
    throw new Error('Mixed build needs at least 6 GiB free for current-source compiler and linker outputs.');
  }
  mkdirSync(cache, { recursive: true });
  const runDirectory = mt ? mkdtempSync(resolve(cache, 'attempt-')) : resolve(cache, `attempt-${Date.now()}`);
  const output = mt ? resolve(runDirectory, 'product') : closure.output;
  if (!mt) {
    mkdirSync(runDirectory);
  }
  mkdirSync(output, { recursive: true });
  const mtPrefix = resolve(mtBaseCache, 'occt-pthread');
  /* eslint-disable @typescript-eslint/naming-convention -- Exact Rust, Cargo and cc-rs environment keys. */
  const environment = {
    ...closure.environment,
    ...(mt ? { EM_CACHE: resolve(cache, 'em-cache') } : {}),
    RUSTC: closure.rustc,
    GEOSPEC_OCCT_PREFIX: mt ? resolve(mtPrefix, 'install') : closure.occtPrefix,
    CARGO_INCREMENTAL: '0',
    CC_wasm32_unknown_emscripten: closure.emcc,
    CXX_wasm32_unknown_emscripten: closure.emxx,
    AR_wasm32_unknown_emscripten: closure.emar,
    CARGO_ENCODED_RUSTFLAGS: [
      ...closure.wasmSimd.rustFlags,
      ...(mt ? ['-C', 'target-feature=+atomics,+bulk-memory,+mutable-globals'] : []),
      // Builder paths stay out of Rust panic locations; the runtime build script ignores remap flags.
      `--remap-path-prefix=${closure.sourceRoot}=tau`,
      `--remap-path-prefix=${closure.environment['CARGO_HOME']}=cargo`,
      `--remap-path-prefix=${resolve(closure.rustPrefix, 'lib/rustlib/src/rust')}=rust-src`,
    ].join('\u001F'),
    GEOSPEC_WASM_SIMD_PROFILE: 'simd128-v1',
    CXXFLAGS_wasm32_unknown_emscripten: [
      closure.wasmSimd.cxxFlag,
      '-frtti',
      ...closure.wasmEh.compileFlags,
      ...(mt ? ['-pthread'] : []),
    ].join(' '),
    ...(mt ? { CFLAGS_wasm32_unknown_emscripten: '-msimd128 -pthread' } : {}),
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
  let { libraries } = closure;
  let mtIdentity: string | undefined;
  if (mt) {
    const recipePath = resolve(packageRoot, 'scripts/selected-delivery.json');
    const recipeInput = closure.inputs.find(({ path }) => path === recipePath);
    if (recipeInput === undefined || digest(readFileSync(recipePath)) !== recipeInput.sha256) {
      throw new Error('Selected delivery recipe is outside the verified closure.');
    }
    const recipe = JSON.parse(readFileSync(recipePath, 'utf8')) as {
      mixedOcctOptions: string[];
      wasmSimd: Closure['wasmSimd'];
      wasmEh: Closure['wasmEh'];
    };
    if (
      JSON.stringify(recipe.wasmSimd) !== JSON.stringify(closure.wasmSimd) ||
      JSON.stringify(recipe.wasmEh) !== JSON.stringify(closure.wasmEh)
    ) {
      throw new Error('Selected OCCT recipe differs from the verified SIMD/EH closure.');
    }
    const rustSource = resolve(closure.rustPrefix, 'lib/rustlib/src/rust/library/Cargo.lock');
    if (!existsSync(rustSource)) {
      throw new Error(`Pinned nightly rust-src is required for -Zbuild-std: ${rustSource}`);
    }
    const mtOptions = recipe.mixedOcctOptions.map((option) =>
      option.startsWith('-DCMAKE_C_FLAGS=') || option.startsWith('-DCMAKE_CXX_FLAGS=') ? `${option} -pthread` : option,
    );
    if (mtOptions.filter((option) => option.includes('FLAGS=') && option.endsWith(' -pthread')).length !== 2) {
      throw new Error('MT OCCT must compile both C and C++ with -pthread.');
    }
    const sdk = closure.sdkPrefix;
    const prep = closure.preparationCache;
    const mtCommand = [
      resolve(packageRoot, 'native/occt/build-occt.sh'),
      ...mtOptions,
      `-DCMAKE_TOOLCHAIN_FILE=${sdk}/emscripten/cmake/Modules/Platform/Emscripten.cmake`,
      `-DCMAKE_CROSSCOMPILING_EMULATOR=${verifiedTool(closure, 'node')}`,
    ];
    const mtPrefixIdentity = pthreadPrefixIdentity(closure, mtCommand);
    mtIdentity = digest(
      Buffer.from(
        JSON.stringify({
          mtPrefixIdentity,
          rustSourceSha256: treeDigest(resolve(rustSource, '..')),
          mtSettings,
          mtCommand,
          emCache: environment.EM_CACHE,
          rustFlags: environment.CARGO_ENCODED_RUSTFLAGS,
          cxxFlags: environment.CXXFLAGS_wasm32_unknown_emscripten,
          cFlags: environment.CFLAGS_wasm32_unknown_emscripten,
        }),
      ),
    );
    const receiptPath = resolve(mtPrefix, 'pthread-prefix-receipt.json');
    if (!existsSync(receiptPath)) {
      if (existsSync(mtPrefix)) {
        throw new Error(`Unverified MT OCCT prefix exists: ${mtPrefix}`);
      }
      /* eslint-disable @typescript-eslint/naming-convention -- Exact OCCT builder environment keys. */
      Object.assign(environment, {
        GEOSPEC_OCCT_CACHE: mtPrefix,
        GEOSPEC_OCCT_SOURCE: resolve(prep, 'sources/occt'),
        GEOSPEC_OCCT_ARCHIVE: resolve(prep, 'downloads/occt.tar.gz'),
        GEOSPEC_GIT: verifiedTool(closure, 'git'),
      });
      /* eslint-enable @typescript-eslint/naming-convention -- Resume ordinary object keys. */
      run('occt-pthread', verifiedTool(closure, 'bash'), mtCommand);
      const cmakeCache = resolve(mtPrefix, 'build/CMakeCache.txt');
      const cmakeFlags = readFileSync(cmakeCache, 'utf8');
      if (
        // The builder appends its path map after the recipe's flags, so -pthread is any token of the value.
        !/^CMAKE_C_FLAGS:STRING=(?:.*\s)?-pthread(?:\s.*)?$/m.test(cmakeFlags) ||
        !/^CMAKE_CXX_FLAGS:STRING=(?:.*\s)?-pthread(?:\s.*)?$/m.test(cmakeFlags)
      ) {
        throw new Error('MT OCCT CMake cache lacks pthread flags on C or C++ objects.');
      }
      const mtArchives = closure.libraries.map((path) =>
        path.replace(closure.occtPrefix, resolve(mtPrefix, 'install')),
      );
      const cmakeConfig = resolve(mtPrefix, 'install/lib/cmake/opencascade/OpenCASCADEConfig.cmake');
      writeFileSync(
        receiptPath,
        `${JSON.stringify(
          {
            identity: mtPrefixIdentity,
            cmake: [cmakeCache, cmakeConfig].map((path) => ({ path, sha256: digest(readFileSync(path)) })),
            archives: mtArchives.map((path) => ({ path, sha256: digest(readFileSync(path)) })),
          },
          null,
          2,
        )}\n`,
      );
    }
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as {
      identity: string;
      cmake: Input[];
      archives: Input[];
    };
    const expectedArchives = closure.libraries.map((path) =>
      path.replace(closure.occtPrefix, resolve(mtPrefix, 'install')),
    );
    const config = readFileSync(resolve(mtPrefix, 'install/lib/cmake/opencascade/OpenCASCADEConfig.cmake'), 'utf8');
    const selectedToolkits = /set\s*\(OpenCASCADE_LIBRARIES\s+([^)]*)\)/
      .exec(config)?.[1]
      ?.trim()
      .split(/[\s;]+/)
      .map((name) => `lib${name}.a`);
    if (
      receipt.identity !== mtPrefixIdentity ||
      receipt.cmake.length !== 2 ||
      receipt.cmake.some(({ path, sha256 }) => digest(readFileSync(path)) !== sha256) ||
      JSON.stringify(selectedToolkits) !== JSON.stringify(expectedArchives.map((path) => basename(path))) ||
      JSON.stringify(receipt.archives.map(({ path }) => path)) !== JSON.stringify(expectedArchives) ||
      receipt.archives.some(({ path, sha256 }) => digest(readFileSync(path)) !== sha256)
    ) {
      throw new Error('MT OCCT prefix identity or archive bytes changed.');
    }
    libraries = expectedArchives;
  }
  const binding = readFileSync(resolve(packageRoot, 'bindings/emscripten/src/lib.rs'));
  const exports = [...binding.toString().matchAll(/pub extern "C" fn (geospec_engine_native_[_a-z]+)/g)].map(
    (match) => `_${match[1]}`,
  );
  exports.push('_malloc', '_free');
  const target = resolve(cache, 'target');
  const cargoMessages = run('cargo-release', closure.cargo, [
    'build',
    ...(mt ? ['-Zbuild-std=std,panic_abort', '--message-format=json-render-diagnostics'] : []),
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
  const linkerMap = resolve(mt ? runDirectory : cache, 'geospec_engine_native.map');
  run('link', closure.emxx, [
    `-${linkOptimization}`,
    ...(mt ? ['-pthread'] : []),
    closure.wasmSimd.linkFlag,
    ...closure.wasmEh.linkFlags,
    '-frtti',
    '--no-entry',
    '-Wl,--start-group',
    staticlib,
    ...libraries,
    '-Wl,--end-group',
    `-Wl,-Map,${linkerMap}`,
    '-sMODULARIZE=1',
    '-sEXPORT_ES6=1',
    mt
      ? '-sINCOMING_MODULE_JS_API=["locateFile","wasmBinary","mainScriptUrlOrBlob"]'
      : '-sINCOMING_MODULE_JS_API=["locateFile","wasmBinary"]',
    '-sENVIRONMENT=web,worker,node',
    '-sINVOKE_RUN=0',
    '-sALLOW_MEMORY_GROWTH=1',
    mt ? `-sINITIAL_MEMORY=${mtSettings.initialMemoryBytes}` : '-sINITIAL_MEMORY=134217728',
    '-sSTACK_SIZE=5242880',
    ...(mt
      ? [
          `-sMAXIMUM_MEMORY=${mtSettings.maximumMemoryBytes}`,
          `-sPTHREAD_POOL_SIZE=${mtSettings.poolSize}`,
          '-sPTHREAD_POOL_SIZE_STRICT=2',
          `-sDEFAULT_PTHREAD_STACK_SIZE=${mtSettings.pthreadStackBytes}`,
          `-sMALLOC=${mtSettings.allocator}`,
        ]
      : []),
    '-sWASM_BIGINT=1',
    '-sEXIT_RUNTIME=0',
    `-sEXPORTED_FUNCTIONS=${JSON.stringify(exports)}`,
    // A pthread grow of shared memory refreshes only that thread's views, so the main thread's HEAPU8 can be
    // stale; the MT loader takes current views from the exported wasmMemory. ST always grows on the caller.
    mt ? '-sEXPORTED_RUNTIME_METHODS=HEAPU8,wasmMemory' : '-sEXPORTED_RUNTIME_METHODS=HEAPU8',
    // Binaryen's unlimited one-caller inlining folded the STEP entity readers into one 455 KB
    // RWStepAP214_ReadWriteModule::ReadStep. V8 tiers it up in about 1.5 s and Node's exit waits for that
    // in-flight compile, so every short-lived process paid it. The cap keeps each function under 100 KB.
    '-sBINARYEN_EXTRA_PASSES=--one-caller-inline-max-function-size=100',
    '-o',
    modulePath,
  ]);
  const systemCache = environment.EM_CACHE;
  const linkedSystemLibraries = [
    ...new Set(
      [...readFileSync(linkerMap, 'utf8').matchAll(/\s(\/\S+\.a)\([^)]*\):\(/g)]
        .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
        .filter((path) => path.startsWith(`${systemCache}/`)),
    ),
  ]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({ path, sha256: digest(readFileSync(path)) }));
  if (
    !linkedSystemLibraries.some(({ path }) =>
      path.endsWith(mt ? '/libc++abi-mt-legacyexcept.a' : '/libc++abi-legacyexcept.a'),
    )
  ) {
    throw new Error('Linker map does not select the native legacy EH C++ ABI library.');
  }
  if (mt && !linkedSystemLibraries.some(({ path }) => path.endsWith('/libc-mt.a'))) {
    throw new Error('MT linker map does not select the pthread libc archive.');
  }
  const rustStdArchives = mt
    ? rustStdArchivePaths(cargoMessages, resolve(closure.rustPrefix, 'lib/rustlib/src/rust/library')).map((path) => ({
        path,
        sha256: digest(readFileSync(path)),
      }))
    : [];
  const artifactNames = mt
    ? readdirSync(output).filter((name) => /^geospec_engine_native\.(?:mjs|wasm)$/.test(name))
    : ['geospec_engine_native.mjs', 'geospec_engine_native.wasm'];
  if (
    mt &&
    (!artifactNames.includes('geospec_engine_native.mjs') ||
      !artifactNames.includes('geospec_engine_native.wasm') ||
      !readFileSync(modulePath, 'utf8').includes('new Worker('))
  ) {
    throw new Error('MT link did not emit the WASM and Emscripten pthread-capable ES module.');
  }
  const artifacts = artifactNames.map((name) => {
    const path = resolve(output, name);
    const bytes = readFileSync(path);
    return { path, bytes: bytes.length, sha256: digest(bytes) };
  });
  for (const input of closure.inputs.filter((input) => input.path.startsWith(`${packageRoot}/`))) {
    if (digest(readFileSync(input.path)) !== input.sha256) {
      throw new Error(`Source changed during the build: ${input.path}`);
    }
  }
  const buildReceipt = `${JSON.stringify(
    {
      schema: mt ? 'geospec-mixed-build-receipt-mt-v1' : 'geospec-mixed-build-receipt-v2',
      ...(mt ? { variant, mtIdentity, mtSettings, mtOcctPrefix: mtPrefix, rustStdArchives } : {}),
      manifestSha256: digest(manifestBytes),
      sourceRoot: closure.sourceRoot,
      sourceRevision: closure.sourceRevision,
      output,
      bindingSha256: digest(binding),
      rustVersion,
      emVersion,
      wasmSimd: closure.wasmSimd,
      wasmEh: closure.wasmEh,
      ...(mt
        ? {
            rustStdSourceSha256: treeDigest(resolve(closure.rustPrefix, 'lib/rustlib/src/rust/library')),
            mtOcctReceiptSha256: digest(readFileSync(resolve(mtPrefix, 'pthread-prefix-receipt.json'))),
          }
        : {}),
      linkerMap: { path: linkerMap, sha256: digest(readFileSync(linkerMap)) },
      linkedSystemLibraries,
      /* eslint-disable @typescript-eslint/naming-convention -- Exact Cargo and cc-rs environment keys. */
      buildEnvironment: {
        CARGO_ENCODED_RUSTFLAGS: environment.CARGO_ENCODED_RUSTFLAGS,
        CXXFLAGS_wasm32_unknown_emscripten: environment.CXXFLAGS_wasm32_unknown_emscripten,
        GEOSPEC_WASM_SIMD_PROFILE: environment.GEOSPEC_WASM_SIMD_PROFILE,
        ...(mt ? { CFLAGS_wasm32_unknown_emscripten: environment.CFLAGS_wasm32_unknown_emscripten } : {}),
      },
      /* eslint-enable @typescript-eslint/naming-convention -- Resume ordinary receipt keys. */
      profile: `emscripten-6.0.5-wasm-legacy-exceptions-wasm-sjlj-${variant}${mt ? `-permits-${mtPermits}` : ''}-simd128-v1-rust-c656540-panic-abort-link-${linkOptimization}`,
      artifacts,
      qualification: 'Current-source compile/link only; runtime and target parity require independent checks.',
    },
    null,
    2,
  )}\n`;
  writeFileSync(resolve(runDirectory, 'build-receipt.json'), buildReceipt);
  if (mt) {
    writeFileSync(resolve(output, 'build-receipt.json'), buildReceipt);
    const asset = (name: string): { file: string; bytes: number; sha256: string } => {
      const found = artifacts.find(({ path }) => basename(path) === name);
      if (found === undefined) {
        throw new Error(`MT product is missing ${name}.`);
      }
      return { file: name, bytes: found.bytes, sha256: found.sha256 };
    };
    const glue = asset('geospec_engine_native.mjs');
    writeFileSync(
      resolve(output, 'geospec_engine_native.mt.json'),
      `${JSON.stringify(
        {
          schema: 'geospec-mixed-mt-assets-v1',
          permits: mtPermits,
          buildReceipt: {
            file: 'build-receipt.json',
            bytes: Buffer.byteLength(buildReceipt),
            sha256: digest(Buffer.from(buildReceipt)),
          },
          // Emscripten EXPORT_ES6 without WASM_ESM_INTEGRATION starts pthreads from the main ES module.
          glue,
          wasm: asset('geospec_engine_native.wasm'),
          worker: glue,
        },
        null,
        2,
      )}\n`,
    );
  }
  console.log(JSON.stringify(artifacts));
};

if (resolve(process.argv[1] ?? '') === import.meta.filename) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
