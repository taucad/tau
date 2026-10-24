/**
 * Purpose: The per-target half of the PicoGK engine build in prepare-picogk-dotnet.mts: the toolchain, the CMake and
 *   Boost flags, how a build command runs and how the shipped libraries are audited, for darwin-arm64 (Apple Clang on
 *   the host) and linux-x64 (the pinned manylinux_2_28 builder image).
 * Why: both targets build the same pinned sources through the same steps; only these differ, and each difference is
 *   part of the engine's recorded toolchain or profile, so equal inputs build equal bytes (X26).
 * Environment: Node 24+. darwin-arm64 needs Xcode's clang, CMake and Ninja; linux-x64 needs Docker, unzip and readelf.
 * Usage: imported by apps/desktop/scripts/prepare-picogk-dotnet.mts; not run directly.
 * Exit codes: none; failures throw.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

/** The engine's shipped libraries: the engine, the readback companion and the shared TBB beside them. */
export type NativeLibraries = { readonly engine: string; readonly readback: string; readonly tbb: string };

/** One build command, as the receipt records it. */
export type NativeCommand = { readonly command: string; readonly arguments: readonly string[]; readonly cwd?: string };

/** What differs between the engine targets. */
export type NativePlatform = {
  readonly libraries: NativeLibraries;
  /** Recorded in the receipt and part of every cache key. */
  readonly toolchain: Readonly<Record<string, string>>;
  readonly compilerPath: string;
  readonly cmakePath: string;
  readonly commonFlags: readonly string[];
  readonly boostToolset: 'clang' | 'gcc';
  readonly boostToolsetFlags: readonly string[];
  /** Profile entries beside the shared ones, part of every cache key. */
  readonly profile: Readonly<Record<string, string>>;
  /** Build variables beside the shared ones. */
  readonly environment: Readonly<Record<string, string>>;
  /** Run one build command with the build environment. */
  readonly execute: (command: NativeCommand, environment: NodeJS.ProcessEnv) => void;
  /**
   * Make the staged libraries loadable beside each other, prove they link nothing unbundled and, on macOS, sign them.
   * @returns Each library's link record for the receipt.
   */
  readonly finish: (
    staging: string,
    run: (command: NativeCommand) => void,
  ) => Readonly<Record<string, readonly string[]>>;
};

/** What the platform needs from the preparation script. */
export type NativePlatformContext = {
  readonly workspaceRoot: string;
  readonly cacheRoot: string;
  readonly digest: (path: string) => Promise<string>;
  readonly download: (options: {
    readonly algorithm: 'sha256';
    readonly expected: string;
    readonly name: string;
    readonly url: string;
  }) => Promise<string>;
};

/** The engine's shipped libraries per target. */
export const nativeLibraries: Readonly<Record<string, NativeLibraries>> = {
  'darwin-arm64': { engine: 'picogk.26.2.dylib', readback: 'tau-picogk-readback.dylib', tbb: 'libtbb.12.dylib' },
  'linux-x64': { engine: 'picogk.26.2.so', readback: 'tau-picogk-readback.so', tbb: 'libtbb.so.12' },
};

/**
 * The Linux x64 engine builder (D13): manylinux_2_28, so glibc 2.28, gcc-toolset-14 and CMake, pinned by digest. Every
 * compile, link and install of the Linux engine runs in it without network, and its digest is part of the toolchain.
 */
const linuxBuilderImage =
  'quay.io/pypa/manylinux_2_28_x86_64:2026.10.16-1@sha256:1e7b8460ad8fb3fb0fbe1cd818845159ac896b4fd17452d56e892c291f3b97a8';
/** The workspace inside the builder: a fixed mount, so compile paths and receipts never name the checkout. */
const linuxBuilderWorkspace = '/tau';
/** Ninja for the builder: the PyPI wheel's static manylinux2014 binary, the version the macOS runners use. */
const linuxNinjaWheel = {
  name: 'ninja-1.13.2-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl',
  member: 'ninja-1.13.2.data/scripts/ninja',
  url: 'https://files.pythonhosted.org/packages/6e/53/ebfed7b689c338dd8ebeec9c0730c8d56821292f14e2536e5f3ef1a05744/ninja-1.13.2-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl',
  sha256: '65a24341b5ac09fcadcc37082660be40a94174e51a937fabf6e2cae26225fa2c',
} as const;
/**
 * The newest symbol versions a shipped Linux library may need from the host: glibc 2.28, the `minimumLibcVersion` of
 * the linux-x64 variant, and the libstdc++ of that baseline (GCC 8). gcc-toolset links newer libstdc++ code statically.
 */
const linuxSymbolFloors: ReadonlyMap<string, string> = new Map([
  ['GLIBC', '2.28'],
  ['GLIBCXX', '3.4.25'],
  ['CXXABI', '1.3.11'],
]);
/** Libraries a Linux engine may load from the host: glibc's, libstdc++, libgcc and zlib, as Darwin links the OS's. */
const linuxSystemLibraries = new Set([
  'ld-linux-x86-64.so.2',
  'libc.so.6',
  'libdl.so.2',
  'libgcc_s.so.1',
  'libm.so.6',
  'libpthread.so.0',
  'librt.so.1',
  'libstdc++.so.6',
  'libz.so.1',
]);
/** The build variables the builder receives: only these, never the host's. */
const builderVariables = [
  'SOURCE_DATE_EPOCH',
  'LC_ALL',
  'CXX',
  'CFLAGS',
  'CXXFLAGS',
  'LDFLAGS',
  'CPATH',
  'CPLUS_INCLUDE_PATH',
  'C_INCLUDE_PATH',
  'LIBRARY_PATH',
];

const compareVersions = (left: string, right: string): number => {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

/**
 * Audit one shipped Linux library: every `NEEDED` entry is shipped beside it or is a host system library, a shipped
 * dependency is found through `$ORIGIN` alone, and no required glibc or libstdc++ symbol version is newer than the
 * declared baseline.
 * @param path - The library.
 * @param shipped - The file names shipped beside it.
 * @returns The library's `NEEDED` and `RUNPATH` entries and its required symbol versions, for the receipt.
 * @throws When the library breaks one of those rules.
 */
export const auditLinuxLibrary = (path: string, shipped: readonly string[]): string[] => {
  const name = basename(path);
  const dynamic = execFileSync('readelf', ['--dynamic', '--wide', path], { encoding: 'utf8' });
  const needed = [...dynamic.matchAll(/\(NEEDED\)\s+Shared library: \[(?<library>[^\]]+)\]/gu)].map(
    (match) => match.groups!['library']!,
  );
  const runpaths = [...dynamic.matchAll(/\((?:RUNPATH|RPATH)\)\s+Library r(?:un)?path: \[(?<path>[^\]]+)\]/gu)].flatMap(
    (match) => match.groups!['path']!.split(':'),
  );
  for (const library of needed) {
    if (!linuxSystemLibraries.has(library) && !shipped.includes(library)) {
      throw new Error(`Unbundled native dependency in ${name}: ${library}`);
    }
  }
  if (runpaths.some((entry) => entry !== '$ORIGIN')) {
    throw new Error(`${name} searches ${runpaths.join(':')}; a shipped library may search only $ORIGIN.`);
  }
  if (needed.some((library) => shipped.includes(library)) && !runpaths.includes('$ORIGIN')) {
    throw new Error(`${name} needs a shipped library but does not search $ORIGIN.`);
  }
  const versionInfo = execFileSync('readelf', ['--version-info', '--wide', path], { encoding: 'utf8' });
  const needs = versionInfo.split(/^Version needs section/mu)[1] ?? '';
  const required = [
    ...new Set(
      [...needs.matchAll(/Name: (?<version>(?:GLIBC|GLIBCXX|CXXABI)_[\d.]+)/gu)].map(
        (match) => match.groups!['version']!,
      ),
    ),
  ].toSorted();
  for (const version of required) {
    const [family, number] = version.split('_') as [string, string];
    const floor = linuxSymbolFloors.get(family)!;
    if (compareVersions(number, floor) > 0) {
      throw new Error(`${name} requires ${version}, newer than the declared ${family} ${floor} baseline.`);
    }
  }
  return [...needed.map((library) => `NEEDED ${library}`), ...runpaths.map((entry) => `RUNPATH ${entry}`), ...required];
};

const sharedBoostFlags = ['address-model=64', 'cxxstd=20', 'variant=release', 'link=static', 'threading=multi'];

const darwinPlatform = async (context: NativePlatformContext): Promise<NativePlatform> => {
  const libraries = nativeLibraries['darwin-arm64']!;
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
    compilerSha256: await context.digest(compilerPath),
    sdkPath,
    sdk,
    sdkZlibSha256: await context.digest(resolve(sdkPath, 'usr/lib/libz.tbd')),
    cmakePath,
    cmake: execFileSync(cmakePath, ['--version'], { encoding: 'utf8' }).trim(),
    cmakeSha256: await context.digest(cmakePath),
    ninjaPath,
    ninja: execFileSync(ninjaPath, ['--version'], { encoding: 'utf8' }).trim(),
    ninjaSha256: await context.digest(ninjaPath),
  };
  // Apple's ar, ranlib and ld write zero member dates under ZERO_AR_DATE, so the static archives do not carry build times.
  const zeroArDate = '1';
  const shipped = Object.values(libraries);
  return {
    libraries,
    toolchain,
    compilerPath,
    cmakePath,
    commonFlags: [
      '-G',
      'Ninja',
      '-DCMAKE_BUILD_TYPE=Release',
      `-DCMAKE_C_COMPILER=${cCompilerPath}`,
      `-DCMAKE_CXX_COMPILER=${compilerPath}`,
      `-DCMAKE_OSX_SYSROOT=${sdkPath}`,
      '-DCMAKE_OSX_ARCHITECTURES=arm64',
      '-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0',
      '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
    ],
    boostToolset: 'clang',
    boostToolsetFlags: [
      'toolset=clang-tau',
      'architecture=arm',
      ...sharedBoostFlags,
      `cxxflags=-arch arm64 -mmacosx-version-min=14.0 -isysroot ${sdkPath} -fPIC`,
      `linkflags=-arch arm64 -mmacosx-version-min=14.0 -isysroot ${sdkPath} -fPIC`,
    ],
    profile: { zeroArDate },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
    environment: { ZERO_AR_DATE: zeroArDate },
    execute: (command, environment) => {
      execFileSync(command.command, [...command.arguments], { cwd: command.cwd, env: environment, stdio: 'inherit' });
    },
    finish: (staging, run) => {
      const linkedLibraries: Record<string, readonly string[]> = {};
      for (const name of shipped) {
        const library = resolve(staging, name);
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
          if (!shipped.includes(bundledName)) {
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
      }
      return linkedLibraries;
    },
  };
};

const linuxPlatform = async (context: NativePlatformContext): Promise<NativePlatform> => {
  const libraries = nativeLibraries['linux-x64']!;
  const { workspaceRoot } = context;
  /** A path inside the builder, where the workspace is mounted at a fixed path. */
  const inBuilder = (value: string): string => value.replaceAll(workspaceRoot, linuxBuilderWorkspace);
  /** Run a shell script in the builder, without network and with the workspace read-only, and return its output. */
  const probe = (script: string): string =>
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--volume',
        `${workspaceRoot}:${linuxBuilderWorkspace}:ro`,
        linuxBuilderImage,
        'sh',
        '-c',
        script,
      ],
      { encoding: 'utf8' },
    ).trim();
  try {
    execFileSync('docker', ['image', 'inspect', linuxBuilderImage], { stdio: 'ignore' });
  } catch {
    execFileSync('docker', ['pull', linuxBuilderImage], { stdio: 'inherit' });
  }
  const wheel = await context.download({
    algorithm: 'sha256',
    expected: linuxNinjaWheel.sha256,
    name: `tools/${linuxNinjaWheel.name}`,
    url: linuxNinjaWheel.url,
  });
  const ninjaHostPath = resolve(context.cacheRoot, `tools/ninja-${linuxNinjaWheel.sha256}/ninja`);
  if (!existsSync(ninjaHostPath)) {
    await mkdir(dirname(ninjaHostPath), { recursive: true });
    const temporary = `${ninjaHostPath}.${String(process.pid)}.tmp`;
    await writeFile(
      temporary,
      execFileSync('unzip', ['-p', wheel, linuxNinjaWheel.member], { maxBuffer: 64 * 1024 * 1024 }),
    );
    await chmod(temporary, 0o755);
    await rename(temporary, ninjaHostPath);
  }
  /** A tool's path, the digest of the file it resolves to and its version output, read in the builder. */
  const tool = (path: string): { readonly path: string; readonly sha256: string; readonly version: string } => {
    const [sha256, ...version] = probe(
      `set -e; sha256sum "$(readlink -f '${path}')" | cut -d' ' -f1; '${path}' --version`,
    ).split('\n');
    return { path, sha256: sha256!, version: version.join('\n').trim() };
  };
  const compiler = tool('/opt/rh/gcc-toolset-14/root/usr/bin/g++');
  const cCompiler = tool('/opt/rh/gcc-toolset-14/root/usr/bin/gcc');
  const cmake = tool('/usr/local/bin/cmake');
  const ninja = tool(inBuilder(ninjaHostPath));
  const glibc = /(?<version>\d+\.\d+)$/u.exec(probe('ldd --version | head -n 1'))?.groups?.['version'];
  if (glibc !== linuxSymbolFloors.get('GLIBC')) {
    throw new Error(
      `The Linux builder has glibc ${String(glibc)}; the engine baseline is ${linuxSymbolFloors.get('GLIBC')!}.`,
    );
  }
  const toolchain = {
    builderImage: linuxBuilderImage,
    compilerPath: compiler.path,
    cCompilerPath: cCompiler.path,
    compiler: compiler.version,
    compilerSha256: compiler.sha256,
    cCompilerSha256: cCompiler.sha256,
    sdkPath: '/',
    sdk: `glibc ${glibc}`,
    sdkZlibSha256: probe(`sha256sum "$(readlink -f /usr/lib64/libz.so)" | cut -d' ' -f1`),
    cmakePath: cmake.path,
    cmake: cmake.version,
    cmakeSha256: cmake.sha256,
    ninjaPath: ninja.path,
    ninja: ninja.version,
    ninjaSha256: ninja.sha256,
  };
  const user =
    typeof process.getuid === 'function' && typeof process.getgid === 'function'
      ? ['--user', `${String(process.getuid())}:${String(process.getgid())}`, '--env', 'HOME=/tmp']
      : [];
  const shipped = Object.values(libraries);
  return {
    libraries,
    toolchain,
    compilerPath: compiler.path,
    cmakePath: cmake.path,
    commonFlags: [
      '-G',
      'Ninja',
      '-DCMAKE_BUILD_TYPE=Release',
      `-DCMAKE_C_COMPILER=${cCompiler.path}`,
      `-DCMAKE_CXX_COMPILER=${compiler.path}`,
      `-DCMAKE_MAKE_PROGRAM=${ninja.path}`,
      '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
      // RHEL's GNUInstallDirs default is lib64; the dependency paths name lib.
      '-DCMAKE_INSTALL_LIBDIR=lib',
    ],
    boostToolset: 'gcc',
    boostToolsetFlags: [
      'toolset=gcc-tau',
      'architecture=x86',
      ...sharedBoostFlags,
      'cxxflags=-fPIC',
      'linkflags=-fPIC',
    ],
    // GNU ar in the builder writes deterministic archives by default.
    profile: {},
    environment: {},
    execute: (command, environment) => {
      execFileSync(
        'docker',
        [
          'run',
          '--rm',
          '--network',
          'none',
          ...user,
          '--volume',
          `${workspaceRoot}:${linuxBuilderWorkspace}`,
          '--workdir',
          inBuilder(command.cwd ?? workspaceRoot),
          ...builderVariables.flatMap((name) => ['--env', `${name}=${environment[name] ?? ''}`]),
          linuxBuilderImage,
          inBuilder(command.command),
          ...command.arguments.map(inBuilder),
        ],
        { stdio: 'inherit' },
      );
    },
    // No rewrite or signature: CMake links `$ORIGIN` and the soname, and the audit proves both.
    finish: (staging) =>
      Object.fromEntries(shipped.map((name) => [name, auditLinuxLibrary(resolve(staging, name), shipped)])),
  };
};

/**
 * The engine build platform of one target.
 * @param targetName - darwin-arm64 or linux-x64, which must be this host.
 * @param context - What the platform needs from the preparation script.
 * @returns The platform.
 * @throws When the target has no engine build or is not this host.
 */
export const nativePlatform = async (targetName: string, context: NativePlatformContext): Promise<NativePlatform> => {
  if (nativeLibraries[targetName] === undefined) {
    throw new Error(`Tau builds the PicoGK engine for ${Object.keys(nativeLibraries).join(' and ')} only.`);
  }
  if (`${process.platform}-${process.arch}` !== targetName) {
    throw new Error(`Building the PicoGK ${targetName} engine requires a ${targetName} host.`);
  }
  return targetName === 'linux-x64' ? linuxPlatform(context) : darwinPlatform(context);
};
