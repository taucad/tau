/**
 * Purpose: Resolve and stage the desktop app's runtime-loaded npm packages for one packaged target.
 * Why: Every package script (macOS, Linux, Windows) ships the same externalized engines, adapters and
 * bundled imports; only the native platform packages beside them differ per target.
 * Environment: Node with filesystem access to the workspace store and the staging directory.
 * Usage: import { resolveRuntimePackages, stageRuntimePackages } from './runtime-stage.mts'
 * Exit codes: n/a (library module).
 */

import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';

import { acpAgentProfiles } from '@taucad/host';

/* oxlint-disable no-restricted-imports -- Operational scripts are outside the app's # source alias. */
import { copyRuntimeClosure, copyTree } from './runtime-closure.mjs';
/* oxlint-enable no-restricted-imports -- End operational script import exception. */

/** A `<platform>-<arch>` the desktop app is packaged for. */
export type RuntimeTarget = 'darwin-arm64' | 'linux-x64' | 'win32-x64';

/** The optional platform package each runtime engine loads its native payload from. */
export type RuntimePlatformPackages = Readonly<{
  openrscadEngine: string;
  esbuild: string;
  libassimp: string;
  nanoraster: string;
  /**
   * Native payloads the bundled imports load through `optionalDependencies`: sharp's libvips (where it
   * is a separate package) before sharp's addon, so the addon finds it as a sibling, then
   * `@parcel/watcher`'s addon. Each is staged at the version its consumer installed.
   */
  bundledOptionalDependencies: readonly string[];
}>;

/** Platform package names, exactly as each engine's `optionalDependencies` declares them. */
export const runtimePlatformPackages: Readonly<Record<RuntimeTarget, RuntimePlatformPackages>> = {
  'darwin-arm64': {
    openrscadEngine: '@taulabs/openrscad-engine-darwin-arm64',
    esbuild: '@esbuild/darwin-arm64',
    libassimp: 'libassimp-darwin-arm64',
    nanoraster: 'nanoraster-darwin-arm64',
    bundledOptionalDependencies: [
      '@img/sharp-libvips-darwin-arm64',
      '@img/sharp-darwin-arm64',
      '@parcel/watcher-darwin-arm64',
    ],
  },
  'linux-x64': {
    openrscadEngine: '@taulabs/openrscad-engine-linux-x64-gnu',
    esbuild: '@esbuild/linux-x64',
    libassimp: 'libassimp-linux-x64-gnu',
    nanoraster: 'nanoraster-linux-x64-gnu',
    bundledOptionalDependencies: [
      '@img/sharp-libvips-linux-x64',
      '@img/sharp-linux-x64',
      '@parcel/watcher-linux-x64-glibc',
    ],
  },
  'win32-x64': {
    openrscadEngine: '@taulabs/openrscad-engine-win32-x64-msvc',
    esbuild: '@esbuild/win32-x64',
    libassimp: 'libassimp-win32-x64-msvc',
    nanoraster: 'nanoraster-win32-x64-msvc',
    /* `@img/sharp-win32-x64` carries libvips itself; there is no separate libvips package. */
    bundledOptionalDependencies: ['@img/sharp-win32-x64', '@parcel/watcher-win32-x64'],
  },
};

type InstalledPackage = Readonly<{ name: string; source: string; version: string }>;

/** Every installed package one target stages, resolved from the workspace before anything is written. */
export type ResolvedRuntimePackages = Readonly<{
  platform: RuntimePlatformPackages;
  openrscadEngine: InstalledPackage;
  openrscadEnginePlatform: string;
  esbuild: InstalledPackage;
  esbuildPlatform: string;
  libassimp: InstalledPackage;
  libassimpPlatform: string;
  nanoraster: InstalledPackage;
  nanorasterPlatform: string;
  sandboxRuntime: InstalledPackage;
  bundledImports: readonly InstalledPackage[];
  acpAdapters: readonly InstalledPackage[];
}>;

const readJson = async <Value extends NonNullable<unknown>>(path: string): Promise<Value> =>
  JSON.parse(await readFile(path, 'utf8')) as Value;

/* Bundler and declaration source maps are build diagnostics. Other `.map` files are payload:
 * replicad's kernel loads its `replicad.js-<hash>.map` asset at run time to map library frames. */
export const excludesBuildDiagnostics = (path: string): boolean =>
  !/\.(?:[cm]?[jt]s|css)\.map$|^tau-module-graph.*\.json$/u.test(basename(path));

/**
 * Resolve every runtime package one target stages, failing before the output is touched.
 * @param options - The desktop app and workspace roots, and the packaged target.
 * @returns The installed packages and their versions.
 * @throws When a platform package for `target` is not installed (pnpm installs only the host's).
 */
export const resolveRuntimePackages = async (
  options: Readonly<{ desktopRoot: string; workspaceRoot: string; target: RuntimeTarget }>,
): Promise<ResolvedRuntimePackages> => {
  const { desktopRoot, workspaceRoot, target } = options;
  const platform = runtimePlatformPackages[target];
  const pluginModules = (plugin: string): string => resolve(workspaceRoot, 'packages/plugins', plugin, 'node_modules');
  const installed = async (source: string): Promise<InstalledPackage> => {
    const { name, version } = await readJson<{ readonly name: string; readonly version: string }>(
      resolve(source, 'package.json'),
    );
    return { name, source, version };
  };
  /* A platform package is an optional dependency of its engine, resolved from the engine itself. */
  const platformPackage = (engine: string, name: string): string =>
    dirname(createRequire(resolve(engine, 'package.json')).resolve(`${name}/package.json`));

  /* One engine package, two payloads: the addon ships in the platform package its
   * `node` entry loads, exactly as libassimp does. Staging the engine without it
   * would still run — through the WebAssembly fallback — which is precisely the
   * silent downgrade `verify-macos-package.mts` refuses. */
  const openrscadEngine = await installed(
    await realpath(resolve(pluginModules('openrscad'), '@taulabs/openrscad-engine')),
  );
  const esbuild = await installed(await realpath(resolve(pluginModules('esbuild'), 'esbuild')));
  const libassimp = await installed(await realpath(resolve(pluginModules('assimp'), 'libassimp')));
  const nanoraster = await installed(await realpath(resolve(pluginModules('image'), 'nanoraster')));
  /* The ACP adapters are spawned as `node <modulePath>` from inside the packaged
   * app, so they are staged with their runtime dependency closure and unpacked
   * out of the ASAR — a module path inside `app.asar` is not a real file. A native
   * ACP agent (Grok Build) is the user's installed CLI and has nothing to stage. */
  const acpAdapters = await Promise.all(
    acpAgentProfiles
      .flatMap((profile) => (profile.package === undefined ? [] : [profile.package]))
      .map(async (name) => ({
        ...(await installed(await realpath(resolve(desktopRoot, 'node_modules', name)))),
        name,
      })),
  );
  /* The sandbox runtime resolves its vendored helpers relative to its own module file
   * and is spawned nowhere: it is staged with its runtime closure so the kernel utility
   * can import it from a real directory, and stays inside the ASAR. */
  const sandboxRuntime = await installed(
    await realpath(resolve(desktopRoot, 'node_modules/@anthropic-ai/sandbox-runtime')),
  );
  const bundledImports = await Promise.all(
    [
      '@gltf-transform/core',
      '@gltf-transform/functions',
      'fflate',
      'uint8array-extras',
      'xstate',
      '@parcel/watcher',
    ].map(async (name) => ({
      ...(await installed(await realpath(resolve(desktopRoot, 'node_modules', name)))),
      name,
    })),
  );
  return {
    platform,
    openrscadEngine,
    openrscadEnginePlatform: platformPackage(openrscadEngine.source, platform.openrscadEngine),
    esbuild,
    esbuildPlatform: platformPackage(esbuild.source, platform.esbuild),
    libassimp,
    libassimpPlatform: platformPackage(libassimp.source, platform.libassimp),
    nanoraster,
    nanorasterPlatform: platformPackage(nanoraster.source, platform.nanoraster),
    sandboxRuntime,
    bundledImports,
    acpAdapters,
  };
};

/** A channel a package is assembled for, as the desktop main process reads it (src/main/environment.ts). */
export type DesktopPackageChannel = 'production' | 'staging';

/**
 * Parse `TAU_DESKTOP_CHANNEL`; unset or blank is `production`.
 * @param value - The variable's value.
 * @returns The channel to package.
 */
export const desktopPackageChannel = (value: string | undefined): DesktopPackageChannel => {
  const channel = value?.trim() ?? '';
  if (channel === '' || channel === 'production') {
    return 'production';
  }
  if (channel === 'staging') {
    return 'staging';
  }
  throw new Error(`TAU_DESKTOP_CHANNEL must be production or staging, not ${channel}`);
};

/**
 * The staged manifest's `tauDesktop` block, which main reads at launch; nothing when it would be empty.
 * @param options - Whether the package honours environment overrides (ad-hoc and unsigned only) and its channel.
 * @returns Extra manifest fields for `stageRuntimePackages`.
 */
export const desktopManifestFields = (
  options: Readonly<{ environmentOverrides: boolean; channel: DesktopPackageChannel }>,
): Readonly<Record<string, unknown>> => {
  const tauDesktop = {
    ...(options.environmentOverrides ? { environmentOverrides: true } : {}),
    ...(options.channel === 'staging' ? { channel: 'staging' } : {}),
  };
  return Object.keys(tauDesktop).length === 0 ? {} : { tauDesktop };
};

/**
 * Stage the built main/preload bundles, every runtime package and the app manifest into `stageRoot`.
 * @param options - The desktop root, the staging directory, the resolved packages, any dependencies
 *   the caller already staged (listed first in the staged manifest) and any extra manifest fields.
 */
export const stageRuntimePackages = async (
  options: Readonly<{
    desktopRoot: string;
    stageRoot: string;
    packages: ResolvedRuntimePackages;
    stagedDependencies?: Readonly<Record<string, string>>;
    manifestFields?: Readonly<Record<string, unknown>>;
  }>,
): Promise<void> => {
  const { desktopRoot, stageRoot, packages } = options;
  const { platform } = packages;
  /**
   * Stage one installed package without its sources, nested packages, build diagnostics or `unused` paths.
   * @param name - Package name, which is also its directory under the staged `node_modules`.
   * @param source - Installed package root.
   * @param unused - Paths relative to `source` the packaged app never loads.
   */
  const copyRuntimePackage = async (name: string, source: string, unused: readonly string[] = []): Promise<void> => {
    const excluded = new Set(unused.map((path) => resolve(source, path)));
    await copyTree(
      source,
      resolve(stageRoot, 'node_modules', name),
      (path) =>
        !['node_modules', 'src'].includes(basename(path)) && excludesBuildDiagnostics(path) && !excluded.has(path),
    );
  };
  await Promise.all([
    mkdir(resolve(stageRoot, 'dist'), { recursive: true }),
    mkdir(resolve(stageRoot, 'node_modules/@taulabs'), { recursive: true }),
    mkdir(resolve(stageRoot, 'node_modules/@esbuild'), { recursive: true }),
  ]);
  const metadata = await readJson<{
    readonly name: string;
    readonly productName: string;
    readonly version: string;
    readonly main: string;
    readonly type: string;
  }>(resolve(desktopRoot, 'package.json'));
  await Promise.all([
    copyTree(resolve(desktopRoot, 'dist/main'), resolve(stageRoot, 'dist/main'), excludesBuildDiagnostics),
    copyTree(resolve(desktopRoot, 'dist/preload'), resolve(stageRoot, 'dist/preload'), excludesBuildDiagnostics),
    /* The utilities import the engine through its `node` export (`dist/node.js`: addon, else `pkg/node`);
     * only the `browser` export and the `./web` subpaths load `pkg/web`. */
    copyRuntimePackage('@taulabs/openrscad-engine', packages.openrscadEngine.source, ['pkg/web']),
    copyRuntimePackage(platform.openrscadEngine, packages.openrscadEnginePlatform),
    /* `bin/esbuild` is install.js's copy of the platform binary for the CLI. The API in `lib/main.js`
     * runs `ESBUILD_BINARY_PATH`, which the utilities point at the unpacked platform binary. */
    copyRuntimePackage('esbuild', packages.esbuild.source, ['bin']),
    copyRuntimePackage(platform.esbuild, packages.esbuildPlatform),
    copyRuntimePackage('libassimp', packages.libassimp.source),
    copyRuntimePackage(platform.libassimp, packages.libassimpPlatform),
    copyRuntimePackage('nanoraster', packages.nanoraster.source),
    copyRuntimePackage(platform.nanoraster, packages.nanorasterPlatform),
    writeFile(
      resolve(stageRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: metadata.name,
          productName: metadata.productName,
          version: metadata.version,
          main: metadata.main,
          type: metadata.type,
          ...options.manifestFields,
          dependencies: {
            ...options.stagedDependencies,
            '@taulabs/openrscad-engine': packages.openrscadEngine.version,
            [platform.openrscadEngine]: packages.openrscadEngine.version,
            [platform.esbuild]: packages.esbuild.version,
            esbuild: packages.esbuild.version,
            libassimp: packages.libassimp.version,
            [platform.libassimp]: packages.libassimp.version,
            nanoraster: packages.nanoraster.version,
            [platform.nanoraster]: packages.nanoraster.version,
            '@anthropic-ai/sandbox-runtime': packages.sandboxRuntime.version,
            ...Object.fromEntries(packages.bundledImports.map(({ name, version }) => [name, version])),
            ...Object.fromEntries(packages.acpAdapters.map(({ name, version }) => [name, version])),
          },
        },
        undefined,
        2,
      )}\n`,
    ),
  ]);

  for (const { name, source } of packages.bundledImports) {
    // oxlint-disable-next-line no-await-in-loop -- Package-local native versions require serial nested staging.
    await copyRuntimeClosure({
      name,
      source,
      modulesRoot: resolve(stageRoot, 'node_modules'),
      filter: excludesBuildDiagnostics,
      optionalDependencies: platform.bundledOptionalDependencies,
    });
  }
  for (const { name, source } of [
    ...packages.acpAdapters,
    { name: '@anthropic-ai/sandbox-runtime', source: packages.sandboxRuntime.source },
  ]) {
    /* Serial: the closure nests one package inside another, so two adapters
     * racing on the same staged directories would make the layout undecidable. */
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await copyRuntimeClosure({
      name,
      source,
      modulesRoot: resolve(stageRoot, 'node_modules'),
      filter: excludesBuildDiagnostics,
    });
  }
};
