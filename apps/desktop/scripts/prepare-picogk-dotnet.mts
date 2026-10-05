#!/usr/bin/env node

/**
 * Purpose: Assemble the pinned self-contained PicoGK C# worker for Electron.
 * Why: Runtime model execution must not discover system .NET or restore packages.
 * Environment: Node 24+, tar/network; Darwin arm64 builds also need Apple Clang/SDK, CMake 3.25.1+ and Ninja. Linux x64 is worker-only.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/prepare-picogk-dotnet.mts [--target darwin-arm64|linux-x64] [--native-only]
 * Exit codes: 0 for an integrity-verified resource; non-zero for unsupported targets or build/integrity failure.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { picogkRuntimeManifestSchema } from '@taucad/picogk';

type Target = {
  readonly dotnetArchive: string;
  readonly dotnetSha512: string;
  readonly dotnetUrl: string;
  readonly rid: string;
  /**
   * NuGet lock file name for this runtime, resolved in each restored project's directory. A lock
   * file records one runtime identifier, so every target keeps its own.
   */
  readonly lockFile: string;
  /** PicoGK's native subdirectory, when upstream ships one for this target. */
  readonly nativeDirectory?: string;
};

const dotnetVersion = '10.0.400';
const dotnetRuntimeVersion = '10.0.11';
const roslynVersion = '5.9.0';
const picoGkCommit = '0e6cf6b6f4993ec16dbcd72d8f27f26b999980f3';
const picoGkArchiveSha256 = '6e188832832241ce5fad3639e2cab63982e4b392eaea367c49a32aac361f4ca5';
const targets: Readonly<Record<string, Target>> = {
  'darwin-arm64': {
    dotnetArchive: `dotnet-sdk-${dotnetVersion}-osx-arm64.tar.gz`,
    dotnetSha512:
      'e440e9a58d4ff7741c8342ac3e086fa9ee2dadc25e01c0449a88317a74cfbd63625b8092c3b2a131ae14b16ab3401e9cc470e578e4c65a72a0b5786bd2308cde',
    dotnetUrl: `https://builds.dotnet.microsoft.com/dotnet/Sdk/${dotnetVersion}/dotnet-sdk-${dotnetVersion}-osx-arm64.tar.gz`,
    rid: 'osx-arm64',
    lockFile: 'packages.lock.json',
    nativeDirectory: 'osx-arm64',
  },
  // SHA512 from Microsoft's release metadata for SDK 10.0.400:
  // https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json
  'linux-x64': {
    dotnetArchive: `dotnet-sdk-${dotnetVersion}-linux-x64.tar.gz`,
    dotnetSha512:
      '1033977dd837150e0814cf0c5d5b17ceb63925fda7ba2158b47258a4bd7c048cf82eac3bc1166f3146f53124a3f5fba09db1de1260d2ce96399860303b404b48',
    dotnetUrl: `https://builds.dotnet.microsoft.com/dotnet/Sdk/${dotnetVersion}/dotnet-sdk-${dotnetVersion}-linux-x64.tar.gz`,
    rid: 'linux-x64',
    lockFile: 'packages.linux-x64.lock.json',
    // Ponytail: upstream PicoGK ships natives for osx-arm64 and win-x64 only, so a
    // Linux payload carries the managed worker without the voxel library. That is
    // enough for CI and for regenerating the C# API corpus, which is Roslyn-only;
    // it is not a runnable kernel until upstream publishes Linux natives.
  },
};

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const desktopRoot = resolve(workspaceRoot, 'apps/desktop');
const resourceRoot = resolve(desktopRoot, 'resources/picogk');
const cacheRoot = resolve(workspaceRoot, 'out/cache/picogk');
const picoGkSourceRoot = resolve(cacheRoot, `PicoGK-${picoGkCommit}`);
const dotnetProjectRoot = resolve(workspaceRoot, 'packages/plugins/picogk/dotnet');
const workerProject = resolve(dotnetProjectRoot, 'Tau.PicoGK.Worker/Tau.PicoGK.Worker.csproj');
const picoGkHostedPatch = resolve(dotnetProjectRoot, 'PicoGK.hosted.patch');
const nativeSourceRoot = resolve(dotnetProjectRoot, 'native');
const topologySchema = resolve(workspaceRoot, 'packages/core/geometry/schema/tau-cad-topology.schema.json');

const digest = async (path: string, algorithm: 'sha256' | 'sha512' = 'sha256'): Promise<string> =>
  createHash(algorithm)
    .update(await readFile(path))
    .digest('hex');

const parseTargets = (): string[] => {
  const arguments_ = process.argv.slice(2);
  const selected: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--native-only') {
      continue;
    }
    if (arguments_[index] !== '--target' || !arguments_[index + 1]) {
      throw new TypeError('Usage: prepare-picogk-dotnet.mts [--target darwin-arm64|linux-x64] [--native-only]');
    }
    selected.push(arguments_[index + 1]!);
    index += 1;
  }
  return selected.length > 0 ? selected : [`${process.platform}-${process.arch}`];
};

const download = async (options: {
  readonly algorithm: 'sha256' | 'sha512';
  readonly expected: string;
  readonly name: string;
  readonly url: string;
}): Promise<string> => {
  await mkdir(cacheRoot, { recursive: true });
  const path = resolve(cacheRoot, options.name);
  await mkdir(resolve(path, '..'), { recursive: true });
  try {
    if ((await digest(path, options.algorithm)) === options.expected) {
      return path;
    }
  } catch {
    // Download below.
  }
  const response = await fetch(options.url);
  if (!response.ok) {
    throw new Error(`${options.name} download failed with HTTP ${String(response.status)}`);
  }
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporary, new Uint8Array(await response.arrayBuffer()));
  if ((await digest(temporary, options.algorithm)) !== options.expected) {
    await rm(temporary, { force: true });
    throw new Error(`${options.name} integrity mismatch`);
  }
  await rename(temporary, path);
  return path;
};

const ensureExtracted = async (options: {
  readonly archive: string;
  readonly expectedMarker: string;
  readonly markerName: string;
  readonly root: string;
}): Promise<void> => {
  try {
    const marker = await readFile(resolve(options.root, options.markerName), 'utf8');
    if (marker.trim() === options.expectedMarker) {
      return;
    }
  } catch {
    // Extract below.
  }
  const temporary = `${options.root}.${String(process.pid)}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  execFileSync('tar', ['-xzf', options.archive, '-C', temporary, '--strip-components=1'], { stdio: 'inherit' });
  await writeFile(resolve(temporary, options.markerName), `${options.expectedMarker}\n`);
  await rm(options.root, { recursive: true, force: true });
  await rename(temporary, options.root);
};

const ensurePatchedPicoGk = async (options: {
  readonly archive: string;
  readonly patchSha256: string;
}): Promise<void> => {
  const markerName = '.tau-picogk-hosted-source';
  const expectedMarker = `${picoGkArchiveSha256}:${options.patchSha256}`;
  try {
    const marker = await readFile(resolve(picoGkSourceRoot, markerName), 'utf8');
    if (marker.trim() === expectedMarker) {
      return;
    }
  } catch {
    // Extract and patch below.
  }
  const temporary = `${picoGkSourceRoot}.${String(process.pid)}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  execFileSync('tar', ['-xzf', options.archive, '-C', temporary, '--strip-components=1'], { stdio: 'inherit' });
  execFileSync('git', ['apply', '--whitespace=error-all', picoGkHostedPatch], {
    cwd: temporary,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
    env: { ...process.env, GIT_CEILING_DIRECTORIES: cacheRoot },
    stdio: 'inherit',
  });
  await writeFile(resolve(temporary, markerName), `${expectedMarker}\n`);
  await rm(picoGkSourceRoot, { recursive: true, force: true });
  await rename(temporary, picoGkSourceRoot);
};

const filesUnder = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        // oxlint-disable-next-line no-await-in-loop -- bounded deterministic filesystem traversal.
        await visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  await visit(root);
  return files.sort();
};

const sourceDigest = async (): Promise<string> => {
  const hash = createHash('sha256');
  const sourceFiles = await filesUnder(dotnetProjectRoot);
  const sources = sourceFiles.filter((path) => !path.includes('/bin/') && !path.includes('/obj/'));
  for (const path of [...sources, topologySchema, import.meta.filename]) {
    hash.update(relative(workspaceRoot, path));
    // oxlint-disable-next-line no-await-in-loop -- file order is part of the deterministic digest.
    hash.update(await readFile(path));
  }
  return hash.digest('hex');
};

const manifestIsCurrent = async (options: {
  readonly targetName: string;
  readonly output: string;
  readonly expectedSourceDigest: string;
  readonly picoGkHostedPatchSha256: string;
}): Promise<boolean> => {
  const { output } = options;
  try {
    const manifest = picogkRuntimeManifestSchema.parse(
      JSON.parse(await readFile(resolve(output, 'tau-runtime-manifest.json'), 'utf8')),
    );
    if (
      manifest.target !== options.targetName ||
      manifest.sourceFilesSha256 !== options.expectedSourceDigest ||
      manifest.picoGkCommit !== picoGkCommit ||
      manifest.picoGkArchiveSha256 !== picoGkArchiveSha256 ||
      manifest.picoGkHostedPatchSha256 !== options.picoGkHostedPatchSha256 ||
      manifest.workerSha256 !== (await digest(resolve(output, manifest.workerPath)))
    ) {
      return false;
    }
    for (const resource of manifest.resourceFiles) {
      // oxlint-disable-next-line no-await-in-loop -- fail-fast integrity validation avoids needless rebuilds.
      if (resource.sha256 !== (await digest(resolve(output, resource.path)))) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};

/** Build the complete engine and compatibility companion from verified pinned archives. */
const prepareNative = async (): Promise<string> => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Building the PicoGK Darwin payload requires a Darwin arm64 host.');
  }
  type NativeSource = {
    readonly name: string;
    readonly repository: string;
    readonly commit: string;
    readonly url: string;
    readonly sha256: string;
    readonly runtimeDirectory?: string;
  };
  type HashedFile = { readonly name: string; readonly sha256: string };
  type CompiledEngine = {
    readonly engineSha256: string;
    readonly directory: string;
    readonly files: readonly HashedFile[];
    readonly provenance: unknown;
  };
  const sources = JSON.parse(
    await readFile(resolve(nativeSourceRoot, 'sources.json'), 'utf8'),
  ) as readonly NativeSource[];
  const source = (name: string): NativeSource => {
    const pin = sources.find((entry) => entry.name === name);
    if (!pin) {
      throw new Error(`PicoGK native source pins require ${name}.`);
    }
    return pin;
  };
  const compilerPath = execFileSync('xcrun', ['--find', 'clang++'], { encoding: 'utf8' }).trim();
  const cCompilerPath = execFileSync('xcrun', ['--find', 'clang'], { encoding: 'utf8' }).trim();
  const compiler = execFileSync(compilerPath, ['--version'], { encoding: 'utf8' }).trim();
  const sdkPath = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
  const sdk = execFileSync('xcrun', ['--show-sdk-version'], { encoding: 'utf8' }).trim();
  const cmakePath = execFileSync('which', ['cmake'], { encoding: 'utf8' }).trim();
  const ninjaPath = execFileSync('which', ['ninja'], { encoding: 'utf8' }).trim();
  const toolchain = {
    compilerPath,
    cCompilerPath,
    compiler,
    compilerSha256: await digest(compilerPath),
    sdkPath,
    sdk,
    sdkZlibSha256: await digest(resolve(sdkPath, 'usr/lib/libz.tbd')),
    cmakePath,
    cmake: execFileSync(cmakePath, ['--version'], { encoding: 'utf8' }).trim(),
    cmakeSha256: await digest(cmakePath),
    ninjaPath,
    ninja: execFileSync(ninjaPath, ['--version'], { encoding: 'utf8' }).trim(),
    ninjaSha256: await digest(ninjaPath),
  };
  // Runtime commit time, fixed before compilation; this is provenance, not a parity claim.
  const sourceDateEpoch = '1780666983';
  const commonFlags = [
    '-G',
    'Ninja',
    '-DCMAKE_BUILD_TYPE=Release',
    `-DCMAKE_C_COMPILER=${cCompilerPath}`,
    `-DCMAKE_CXX_COMPILER=${compilerPath}`,
    `-DCMAKE_OSX_SYSROOT=${sdkPath}`,
    '-DCMAKE_OSX_ARCHITECTURES=arm64',
    '-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0',
    '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
  ];
  const bloscFlags = [
    '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
    '-DBUILD_STATIC=ON',
    '-DBUILD_SHARED=OFF',
    '-DBUILD_TESTS=OFF',
    '-DBUILD_FUZZERS=OFF',
    '-DBUILD_BENCHMARKS=OFF',
    '-DDEACTIVATE_SNAPPY=ON',
    '-DPREFER_EXTERNAL_LZ4=OFF',
    '-DPREFER_EXTERNAL_ZLIB=OFF',
    '-DPREFER_EXTERNAL_ZSTD=OFF',
  ];
  const tbbFlags = [
    '-DBUILD_SHARED_LIBS=ON',
    '-DTBB_TEST=OFF',
    '-DTBB_STRICT=OFF',
    '-DTBBMALLOC_BUILD=OFF',
    '-DTBBMALLOC_PROXY_BUILD=OFF',
    '-DTBB_DISABLE_HWLOC_AUTOMATIC_SEARCH=ON',
    '-DTBB_ENABLE_IPO=OFF',
  ];
  const boostFlags = [
    '--with-iostreams',
    '--with-random',
    '--layout=system',
    '-j2',
    '-d0',
    'toolset=clang-tau',
    'architecture=arm',
    'address-model=64',
    'cxxstd=20',
    'variant=release',
    'link=static',
    'threading=multi',
    `cxxflags=-arch arm64 -mmacosx-version-min=14.0 -isysroot ${sdkPath} -fPIC`,
    `linkflags=-arch arm64 -mmacosx-version-min=14.0 -isysroot ${sdkPath} -fPIC`,
    // Boost supplies memory-mapped I/O only. OpenVDB's own Blosc and zlib stay enabled.
    '-sNO_ZLIB=1',
    '-sNO_BZIP2=1',
    '-sNO_LZMA=1',
    '-sNO_ZSTD=1',
  ];
  const profile = { target: 'darwin-arm64', sourceDateEpoch, commonFlags, bloscFlags, tbbFlags, boostFlags };
  const patchSha256 = await digest(resolve(nativeSourceRoot, 'Runtime.patch'));
  const fingerprint = createHash('sha256').update(JSON.stringify({ sources, toolchain, profile }));
  for (const path of [...(await filesUnder(nativeSourceRoot)), import.meta.filename]) {
    // oxlint-disable-next-line no-await-in-loop -- deterministic build-input fingerprint.
    fingerprint.update(relative(workspaceRoot, path)).update(await readFile(path));
  }
  const sourceSha256 = fingerprint.digest('hex');
  // Packaging edits retain exact receipts without rebuilding unchanged engine inputs.
  const engineFingerprint = createHash('sha256').update(JSON.stringify({ sources, toolchain, profile }));
  for (const name of ['CMakeLists.txt', 'Runtime.patch', 'mesh-readback.cpp']) {
    // oxlint-disable-next-line no-await-in-loop -- deterministic native compile-input fingerprint.
    engineFingerprint.update(name).update(await readFile(resolve(nativeSourceRoot, name)));
  }
  const engineSha256 = engineFingerprint.digest('hex');
  const preparerSha256 = await digest(import.meta.filename);
  const root = resolve(cacheRoot, `native-${sourceSha256}`);
  const engineRoot = resolve(cacheRoot, `native-engine-${engineSha256}`);
  const output = resolve(root, 'resources');
  const verifyFiles = async (directory: string, files: readonly HashedFile[]): Promise<boolean> => {
    if (files.length === 0) {
      return false;
    }
    for (const file of files) {
      // oxlint-disable-next-line no-await-in-loop -- fail-fast integrity validation.
      if ((await digest(resolve(directory, file.name))) !== file.sha256) {
        return false;
      }
    }
    return true;
  };
  const hasVerifiedOutput = async (): Promise<boolean> => {
    try {
      const receipt = JSON.parse(await readFile(resolve(output, 'tau-picogk-native-build.json'), 'utf8')) as {
        readonly sourceSha256: string;
        readonly files: readonly HashedFile[];
      };
      return receipt.sourceSha256 === sourceSha256 && (await verifyFiles(output, receipt.files));
    } catch {
      return false;
    }
  };
  if (await hasVerifiedOutput()) {
    return output;
  }
  const sourceRoots = new Map<string, string>();
  await Promise.all(
    sources.map(async (pin) => {
      const archive = await download({
        algorithm: 'sha256',
        expected: pin.sha256,
        name: `native-sources/${pin.name}-${pin.commit}.tar.gz`,
        url: pin.url,
      });
      const extracted = resolve(cacheRoot, 'native-sources', `${pin.name}-${pin.sha256}`);
      await ensureExtracted({
        archive,
        root: extracted,
        markerName: '.tau-archive-sha256',
        expectedMarker: pin.sha256,
      });
      sourceRoots.set(pin.name, extracted);
    }),
  );
  const sourceRoot = (name: string): string => {
    const extracted = sourceRoots.get(name);
    if (!extracted) {
      throw new Error(`Missing extracted native source ${name}.`);
    }
    return extracted;
  };
  const environment: NodeJS.ProcessEnv = { ...process.env };
  environment['SOURCE_DATE_EPOCH'] = sourceDateEpoch;
  environment['LC_ALL'] = 'C';
  environment['CXX'] = compilerPath;
  for (const name of [
    'CFLAGS',
    'CXXFLAGS',
    'LDFLAGS',
    'CPATH',
    'CPLUS_INCLUDE_PATH',
    'C_INCLUDE_PATH',
    'LIBRARY_PATH',
    'DYLD_LIBRARY_PATH',
  ]) {
    environment[name] = '';
  }
  const commands: Array<{ readonly command: string; readonly arguments: readonly string[]; readonly cwd?: string }> =
    [];
  const run = (options: {
    readonly command: string;
    readonly arguments: readonly string[];
    readonly cwd?: string;
  }): void => {
    commands.push(options);
    execFileSync(options.command, [...options.arguments], { cwd: options.cwd, env: environment, stdio: 'inherit' });
  };
  const dependencyPins = [source('blosc'), source('tbb'), source('boost')];
  const dependencySha256 = createHash('sha256')
    .update(JSON.stringify({ dependencyPins, toolchain, profile }))
    .digest('hex');
  const dependencyRoot = resolve(cacheRoot, `native-deps-${dependencySha256}`);
  const dependencies = resolve(dependencyRoot, 'install');
  const dependencyArtifactNames = [
    'lib/libblosc.a',
    'lib/libtbb.12.dylib',
    'lib/libboost_iostreams.a',
    'lib/libboost_random.a',
  ];
  let dependencyFiles: readonly HashedFile[] = [];
  let dependencyCommands: typeof commands = [];
  let dependencyCurrent = false;
  try {
    const receipt = JSON.parse(await readFile(resolve(dependencyRoot, 'receipt.json'), 'utf8')) as {
      readonly dependencySha256: string;
      readonly files: readonly HashedFile[];
      readonly commands: typeof commands;
    };
    dependencyCurrent =
      receipt.dependencySha256 === dependencySha256 && (await verifyFiles(dependencies, receipt.files));
    dependencyFiles = receipt.files;
    dependencyCommands = receipt.commands;
  } catch {
    // Build below.
  }
  if (!dependencyCurrent) {
    await rm(dependencyRoot, { recursive: true, force: true });
    await mkdir(dependencyRoot, { recursive: true });
    const configureDependency = (name: string, flags: readonly string[]): void => {
      const build = resolve(dependencyRoot, `${name}-build`);
      run({
        command: cmakePath,
        arguments: [
          '-S',
          sourceRoot(name),
          '-B',
          build,
          ...commonFlags,
          ...flags,
          `-DCMAKE_INSTALL_PREFIX=${dependencies}`,
        ],
      });
      run({ command: cmakePath, arguments: ['--build', build, '--parallel', '2'] });
      run({ command: cmakePath, arguments: ['--install', build] });
    };
    configureDependency('blosc', bloscFlags);
    configureDependency('tbb', tbbFlags);
    // B2 writes its bootstrap/configuration into its source tree, so use an owned build copy.
    const boostRoot = resolve(dependencyRoot, 'boost');
    await cp(sourceRoot('boost'), boostRoot, { recursive: true });
    run({
      command: 'sh',
      arguments: ['./bootstrap.sh', '--with-toolset=clang', '--with-libraries=iostreams,random'],
      cwd: boostRoot,
    });
    const userConfig = resolve(dependencyRoot, 'boost-user-config.jam');
    await writeFile(userConfig, `using clang : tau : ${JSON.stringify(compilerPath)} ;\n`);
    run({
      command: resolve(boostRoot, 'b2'),
      arguments: [
        `--user-config=${userConfig}`,
        ...boostFlags,
        `--prefix=${dependencies}`,
        `--build-dir=${resolve(dependencyRoot, 'boost-build')}`,
        'install',
      ],
      cwd: boostRoot,
    });
    dependencyFiles = await Promise.all(
      dependencyArtifactNames.map(async (name) => ({ name, sha256: await digest(resolve(dependencies, name)) })),
    );
    dependencyCommands = [...commands];
    await writeFile(
      resolve(dependencyRoot, 'receipt.json'),
      `${JSON.stringify(
        {
          dependencySha256,
          dependencyPins,
          toolchain,
          profile,
          files: dependencyFiles,
          commands: dependencyCommands,
          boostBuildToolSha256: await digest(resolve(boostRoot, 'b2')),
        },
        undefined,
        2,
      )}\n`,
    );
  }
  const build = resolve(engineRoot, 'build');
  const assemblyMarker = createHash('sha256').update(JSON.stringify({ sources, patchSha256 })).digest('hex');
  const readCompiledEngine = async (): Promise<CompiledEngine | undefined> => {
    try {
      const cached = JSON.parse(await readFile(resolve(engineRoot, 'compiled.json'), 'utf8')) as CompiledEngine;
      const names = cached.files
        .map((file) => file.name)
        .sort()
        .join(',');
      if (
        cached.engineSha256 === engineSha256 &&
        names === 'libtbb.12.dylib,picogk.26.2.dylib,tau-picogk-readback.dylib' &&
        (await verifyFiles(cached.directory, cached.files))
      ) {
        return cached;
      }
    } catch {
      // Missing or changed compiled artifacts require a real build below.
    }
    return undefined;
  };
  const compiledEngine = await readCompiledEngine();
  if (compiledEngine === undefined) {
    const runtimeRoot = resolve(engineRoot, 'source');
    let assembled = false;
    try {
      const marker = await readFile(resolve(runtimeRoot, '.tau-pinned-source'), 'utf8');
      assembled = marker.trim() === assemblyMarker;
    } catch {
      /* Assemble below. */
    }
    if (!assembled) {
      const temporary = `${runtimeRoot}.${String(process.pid)}.tmp`;
      await rm(temporary, { recursive: true, force: true });
      await cp(sourceRoot('runtime'), temporary, { recursive: true });
      await Promise.all(
        sources
          .filter((pin) => pin.runtimeDirectory !== undefined)
          .map(async (pin) => cp(sourceRoot(pin.name), resolve(temporary, pin.runtimeDirectory!), { recursive: true })),
      );
      execFileSync('git', ['apply', '--whitespace=error-all', resolve(nativeSourceRoot, 'Runtime.patch')], {
        cwd: temporary,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Git's environment variable uses its prescribed spelling.
        env: { ...environment, GIT_CEILING_DIRECTORIES: cacheRoot },
        stdio: 'inherit',
      });
      await writeFile(resolve(temporary, '.tau-pinned-source'), `${assemblyMarker}\n`);
      await mkdir(engineRoot, { recursive: true });
      await rm(runtimeRoot, { recursive: true, force: true });
      await rename(temporary, runtimeRoot);
    }
    run({
      command: cmakePath,
      arguments: [
        '-S',
        nativeSourceRoot,
        '-B',
        build,
        ...commonFlags,
        `-DPICOGK_SOURCE=${runtimeRoot}`,
        `-DTAU_NATIVE_DEPS=${dependencies}`,
      ],
    });
    run({
      command: cmakePath,
      arguments: ['--build', build, '--target', 'picogk', 'tau-picogk-readback', '--parallel', '2'],
    });
  }
  const temporary = `${output}.${String(process.pid)}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  await Promise.all([
    cp(
      compiledEngine === undefined
        ? resolve(build, 'lib/picogk.26.2.dylib')
        : resolve(compiledEngine.directory, 'picogk.26.2.dylib'),
      resolve(temporary, 'picogk.26.2.dylib'),
      { dereference: true },
    ),
    cp(
      compiledEngine === undefined
        ? resolve(build, 'tau-picogk-readback.dylib')
        : resolve(compiledEngine.directory, 'tau-picogk-readback.dylib'),
      resolve(temporary, 'tau-picogk-readback.dylib'),
      {
        dereference: true,
      },
    ),
    cp(
      compiledEngine === undefined
        ? resolve(dependencies, 'lib/libtbb.12.dylib')
        : resolve(compiledEngine.directory, 'libtbb.12.dylib'),
      resolve(temporary, 'libtbb.12.dylib'),
      { dereference: true },
    ),
  ]);
  const libraries = ['picogk.26.2.dylib', 'tau-picogk-readback.dylib', 'libtbb.12.dylib'];
  const linkedLibraries: Record<string, readonly string[]> = {};
  const auditAndSign = (name: string): void => {
    const library = resolve(temporary, name);
    run({ command: 'install_name_tool', arguments: ['-id', `@loader_path/${name}`, library] });
    const links = execFileSync('otool', ['-L', library], { encoding: 'utf8' })
      .split('\n')
      .slice(2)
      .map((line) => line.trim().split(' (')[0]!)
      .filter(Boolean);
    for (const link of links) {
      if (link.startsWith('/usr/lib/') || link.startsWith('/System/Library/')) {
        continue;
      }
      const bundledName = basename(link);
      if (!libraries.includes(bundledName)) {
        throw new Error(`Unbundled native dependency in ${name}: ${link}`);
      }
      if (link !== `@loader_path/${bundledName}`) {
        run({ command: 'install_name_tool', arguments: ['-change', link, `@loader_path/${bundledName}`, library] });
      }
    }
    linkedLibraries[name] = execFileSync('otool', ['-L', library], { encoding: 'utf8' })
      .split('\n')
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean);
    run({ command: 'codesign', arguments: ['--force', '--sign', '-', '--timestamp=none', library] });
  };
  for (const name of libraries) {
    auditAndSign(name);
  }
  const licenses = [
    ['runtime', 'LICENSE', 'PicoGKRuntime-LICENSE'],
    ['openvdb', 'LICENSE', 'OpenVDB-LICENSE'],
    ['glfw', 'LICENSE.md', 'GLFW-LICENSE'],
    ['imgui', 'LICENSE.txt', 'ImGui-LICENSE'],
    ['tbb', 'LICENSE.txt', 'oneTBB-LICENSE'],
    ['boost', 'LICENSE_1_0.txt', 'Boost-LICENSE'],
    ['blosc', 'LICENSE.txt', 'Blosc-LICENSE'],
  ];
  await Promise.all(
    licenses.map(async ([name, path, outputName]) =>
      cp(resolve(sourceRoot(name!), path!), resolve(temporary, outputName!)),
    ),
  );
  await cp(resolve(sourceRoot('blosc'), 'LICENSES'), resolve(temporary, 'Blosc-LICENSES'), { recursive: true });
  await cp(resolve(nativeSourceRoot, 'licenses/Zstd-LICENSE'), resolve(temporary, 'Zstd-LICENSE'));
  await cp(
    resolve(nativeSourceRoot, 'licenses/Zstd-license-receipt.json'),
    resolve(temporary, 'Zstd-license-receipt.json'),
  );
  const nativeFiles = await filesUnder(temporary);
  const files = await Promise.all(
    nativeFiles.map(async (path) => ({ name: relative(temporary, path), sha256: await digest(path) })),
  );
  await writeFile(
    resolve(temporary, 'tau-picogk-native-build.json'),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        sourceSha256,
        engineSha256,
        preparerSha256,
        engineCompilation: compiledEngine?.provenance ?? {
          sourceSha256,
          engineSha256,
          preparerSha256,
          sources,
          runtimePatchSha256: patchSha256,
          toolchain,
          profile,
          dependencySha256,
          dependencyFiles,
          dependencyCommands,
          commands,
        },
        sources,
        runtimePatchSha256: patchSha256,
        assemblyMarker,
        toolchain,
        profile,
        dependencySha256,
        dependencyFiles,
        dependencyCommands,
        commands,
        linkedLibraries,
        target: 'darwin-arm64',
        files,
      },
      undefined,
      2,
    )}\n`,
  );
  await rm(output, { recursive: true, force: true });
  await rename(temporary, output);
  if (compiledEngine === undefined) {
    await mkdir(engineRoot, { recursive: true });
    const receipt = JSON.parse(await readFile(resolve(output, 'tau-picogk-native-build.json'), 'utf8')) as {
      engineCompilation: unknown;
    };
    await writeFile(
      resolve(engineRoot, 'compiled.json'),
      `${JSON.stringify(
        {
          engineSha256,
          directory: output,
          files: files.filter((file) => libraries.includes(file.name)),
          provenance: receipt.engineCompilation,
        },
        undefined,
        2,
      )}\n`,
    );
  }
  return output;
};
const prepareTarget = async (targetName: string): Promise<void> => {
  const target = targets[targetName];
  if (!target) {
    throw new Error(`Unsupported PicoGK resource target: ${targetName}`);
  }
  const expectedSourceDigest = await sourceDigest();
  const picoGkHostedPatchSha256 = await digest(picoGkHostedPatch);
  const output = resolve(resourceRoot, targetName);
  const dotnetRoot = resolve(cacheRoot, `dotnet-${dotnetVersion}-${targetName}`);
  if (await manifestIsCurrent({ targetName, output, expectedSourceDigest, picoGkHostedPatchSha256 })) {
    console.log(`PicoGK .NET is current: ${targetName}`);
    return;
  }

  const [dotnetArchive, picoGkArchive] = await Promise.all([
    download({
      algorithm: 'sha512',
      expected: target.dotnetSha512,
      name: target.dotnetArchive,
      url: target.dotnetUrl,
    }),
    download({
      algorithm: 'sha256',
      expected: picoGkArchiveSha256,
      name: `PicoGK-${picoGkCommit}.tar.gz`,
      url: `https://github.com/leap71/PicoGK/archive/${picoGkCommit}.tar.gz`,
    }),
  ]);
  await Promise.all([
    ensureExtracted({
      archive: dotnetArchive,
      expectedMarker: target.dotnetSha512,
      markerName: '.tau-dotnet-archive-sha512',
      root: dotnetRoot,
    }),
    ensurePatchedPicoGk({ archive: picoGkArchive, patchSha256: picoGkHostedPatchSha256 }),
  ]);
  await cp(resolve(dotnetProjectRoot, `PicoGK.${target.lockFile}`), resolve(picoGkSourceRoot, target.lockFile));

  const dotnet = resolve(dotnetRoot, 'dotnet');
  await chmod(dotnet, 0o755);
  const temporary = resolve(resourceRoot, `.${targetName}.${String(process.pid)}.tmp`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  const buildEnvironment: NodeJS.ProcessEnv = { ...process.env };
  buildEnvironment['DOTNET_CLI_TELEMETRY_OPTOUT'] = '1';
  buildEnvironment['DOTNET_MULTILEVEL_LOOKUP'] = '0';
  buildEnvironment['DOTNET_NOLOGO'] = '1';
  buildEnvironment['DOTNET_ROOT'] = dotnetRoot;
  buildEnvironment['NUGET_PACKAGES'] = resolve(cacheRoot, 'nuget-packages');
  const projectProperties = [`-p:PicoGKProject=${resolve(picoGkSourceRoot, 'PicoGK.csproj')}`];
  const lockProperties = ['-p:RestorePackagesWithLockFile=true', `-p:NuGetLockFilePath=${target.lockFile}`];
  execFileSync(
    dotnet,
    ['restore', workerProject, '--runtime', target.rid, '--locked-mode', ...projectProperties, ...lockProperties],
    { env: buildEnvironment, stdio: 'inherit' },
  );
  execFileSync(
    dotnet,
    [
      'publish',
      workerProject,
      '--configuration',
      'Release',
      '--runtime',
      target.rid,
      '--self-contained',
      'true',
      '--no-restore',
      '--output',
      temporary,
      ...projectProperties,
    ],
    { env: buildEnvironment, stdio: 'inherit' },
  );
  for (const path of await filesUnder(temporary)) {
    if (path.endsWith('.pdb') || path.endsWith('.xml')) {
      // oxlint-disable-next-line no-await-in-loop -- deterministic bounded publish cleanup.
      await rm(path, { force: true });
    }
  }
  if (target.nativeDirectory !== undefined) {
    const readbackRoot = await prepareNative();
    const readbackFiles = await readdir(readbackRoot);
    await Promise.all(
      readbackFiles.map(async (name) => cp(resolve(readbackRoot, name), resolve(temporary, name), { recursive: true })),
    );
  }
  await Promise.all([
    cp(resolve(picoGkSourceRoot, 'LICENSE'), resolve(temporary, 'PicoGK-LICENSE')),
    cp(resolve(workspaceRoot, 'packages/plugins/picogk/LICENSE'), resolve(temporary, 'Tau-PicoGK-LICENSE')),
    cp(topologySchema, resolve(temporary, basename(topologySchema))),
  ]);

  const nativeSources =
    target.nativeDirectory === undefined
      ? []
      : (JSON.parse(await readFile(resolve(nativeSourceRoot, 'sources.json'), 'utf8')) as ReadonlyArray<{
          name: string;
          commit: string;
          sha256: string;
        }>);
  const workerPath = 'Tau.PicoGK.Worker';
  await chmod(resolve(temporary, workerPath), 0o755);
  await writeFile(
    resolve(temporary, 'tau-picogk-sbom.cdx.json'),
    `${JSON.stringify(
      {
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        version: 1,
        metadata: {
          component: { type: 'application', name: 'Tau PicoGK C# runtime', version: picoGkCommit },
          properties: [{ name: 'taucad:target', value: targetName }],
        },
        components: [
          ...nativeSources.map((source) => ({
            type: 'library',
            name: source.name,
            version: source.commit,
            hashes: [{ alg: 'SHA-256', content: source.sha256 }],
          })),
          ...(nativeSources.length === 0
            ? []
            : [
                { type: 'library', name: 'LZ4 (Blosc bundled)', version: '1.9.4' },
                { type: 'library', name: 'zlib (Blosc bundled)', version: '1.3.1' },
                { type: 'library', name: 'Zstd (Blosc bundled)', version: '1.5.6' },
              ]),
          { type: 'platform', name: '.NET Runtime', version: dotnetRuntimeVersion },
          { type: 'library', name: 'Microsoft.CodeAnalysis.CSharp', version: roslynVersion },
          {
            type: 'library',
            name: 'PicoGK',
            version: picoGkCommit,
            hashes: [{ alg: 'SHA-256', content: picoGkHostedPatchSha256 }],
          },
        ],
      },
      undefined,
      2,
    )}\n`,
  );
  const publishedFiles = await filesUnder(temporary);
  const resourceFiles = await Promise.all(
    publishedFiles
      .filter((path) => relative(temporary, path) !== workerPath)
      .map(async (path) => ({
        path: relative(temporary, path),
        sha256: await digest(path),
        label: `PicoGK runtime ${relative(temporary, path)}`,
      })),
  );
  const manifest = picogkRuntimeManifestSchema.parse({
    schemaVersion: 2,
    target: targetName,
    rid: target.rid,
    dotnetSdkVersion: dotnetVersion,
    dotnetRuntimeVersion,
    roslynVersion,
    picoGkCommit,
    picoGkArchiveSha256,
    picoGkHostedPatchSha256,
    hostApiVersion: 2,
    protocolVersion: picogkRuntimeManifestSchema.shape.protocolVersion.value,
    sceneArtifactVersion: 4,
    topologySchemaVersion: 1,
    sourceFilesSha256: expectedSourceDigest,
    workerPath,
    workerSha256: await digest(resolve(temporary, workerPath)),
    resourceFiles,
  });
  await writeFile(resolve(temporary, 'tau-runtime-manifest.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);
  await rm(output, { recursive: true, force: true });
  await rename(temporary, output);
  console.log(`Prepared PicoGK .NET: ${targetName}`);
};

const main = async (): Promise<void> => {
  const selected = parseTargets();
  if (process.argv.includes('--native-only')) {
    if (selected.length !== 1 || selected[0] !== 'darwin-arm64') {
      throw new Error('--native-only supports darwin-arm64 only.');
    }
    console.log(`Prepared PicoGK native: ${await prepareNative()}`);
    return;
  }
  for (const target of selected) {
    // oxlint-disable-next-line no-await-in-loop -- shared MSBuild intermediates require serialized target builds.
    await prepareTarget(target);
  }
};

try {
  await main();
} catch (error) {
  console.error('PicoGK preparation failed:', error);
  process.exit(1);
}
