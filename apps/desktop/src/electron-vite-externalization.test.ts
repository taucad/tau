/**
 * The packaged app contains one self-sufficient ASAR. Workspace sources are
 * bundled; Electron, Node built-ins, and the runtime-loaded engines stay
 * external so each native loader can resolve its adjacent `.node` binary — for
 * `@taulabs/openrscad-engine` that is the whole point of its `node` export
 * condition, which a bundler would otherwise resolve away.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Exercise the package script's actual staging boundary.
import { copyGeoSpecEngine, copyGeoSpecSourceRelink } from '../scripts/runtime-closure.mjs';

const appRoot = join(import.meta.dirname, '..');

describe('macOS GeoSpec engine selection', () => {
  it('should stage the installed engine pin rather than a workspace producer', () => {
    const project = JSON.parse(readFileSync(join(appRoot, 'project.json'), 'utf8')) as {
      readonly targets: Record<string, { readonly dependsOn: unknown[] }>;
    };
    for (const mode of ['package-macos', 'package-macos-release', 'package-macos-unsigned']) {
      expect(JSON.stringify(project.targets[mode]?.dependsOn)).not.toContain('geospec');
    }
    const manifest = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    expect(manifest.dependencies?.['geospec-engine']).toBe('catalog:');
  });

  it('should refuse a release without the source/relink archive before staging the engine', () => {
    const source = readFileSync(join(appRoot, 'scripts/package-macos.mts'), 'utf8');
    const mode = source.indexOf('parseMacosPackageMode(');
    const unsafeOutput = source.indexOf('Refusing unsafe package output root:');
    const selection = source.indexOf(
      "const geospecSourceRelinkArchive = process.env['TAU_GEOSPEC_SOURCE_RELINK_ARCHIVE']?.trim()",
    );
    const refusal = source.indexOf(
      'if (shipsNativeGeometry && release && geospecSourceRelinkArchive === undefined)',
      selection,
    );
    const stage = source.indexOf('await rm(outputRoot, { recursive: true, force: true })', refusal);
    const engineCopy = source.indexOf('copyGeoSpecEngine(desktopRoot,', stage);
    const receipt = source.indexOf("'node_modules/geospec-engine/licenses/SOURCE-RELINK.json'", engineCopy);
    const sourceCopy = source.indexOf(
      'copyGeoSpecSourceRelink(resolve(geospecSourceRelinkArchive), geospecSourceRelinkReceipt, resources)',
      receipt,
    );

    expect(mode).toBeGreaterThan(-1);
    expect(unsafeOutput).toBeGreaterThan(mode);
    expect(selection).toBeGreaterThan(mode);
    expect(refusal).toBeGreaterThan(selection);
    expect(stage).toBeGreaterThan(refusal);
    expect(engineCopy).toBeGreaterThan(stage);
    expect(receipt).toBeGreaterThan(engineCopy);
    expect(sourceCopy).toBeGreaterThan(receipt);
  });
});

type ElectronViteApi = {
  resolveConfig(
    config: Record<string, unknown>,
    command: 'build',
    mode: 'production',
  ): Promise<{ config?: Record<string, Record<string, unknown> | undefined> }>;
};

type ViteApi = {
  resolveConfig(
    config: Record<string, unknown>,
    command: 'build',
    mode: 'production',
  ): Promise<{ build: { rollupOptions?: { external?: unknown }; rolldownOptions?: { external?: unknown } } }>;
};

const matchesExternal = async (rule: unknown, id: string): Promise<boolean> => {
  if (Array.isArray(rule)) {
    const matches = await Promise.all(rule.map(async (item) => matchesExternal(item, id)));
    return matches.includes(true);
  }
  if (typeof rule === 'string') {
    return rule === id;
  }
  if (rule instanceof RegExp) {
    rule.lastIndex = 0;
    return rule.test(id);
  }
  if (typeof rule === 'function') {
    return Boolean(await (rule as (specifier: string) => unknown)(id));
  }
  return false;
};

type ProcessExternals = {
  readonly isExternal: (id: string) => Promise<boolean>;
  /** `externalizeDeps.include` as the config declares it. */
  readonly include: readonly string[];
};

const resolveProcessExternals = async (processType: 'main' | 'preload' = 'main'): Promise<ProcessExternals> => {
  const electronVite = (await import(
    pathToFileURL(join(appRoot, 'node_modules/electron-vite/dist/index.js')).href
  )) as ElectronViteApi;
  const vite = (await import(pathToFileURL(join(appRoot, 'node_modules/vite/dist/node/index.js')).href)) as ViteApi;

  const previousDirectory = process.cwd();
  const previousNodeEnvironment = process.env['NODE_ENV'];
  process.chdir(appRoot);
  try {
    const resolved = await electronVite.resolveConfig(
      { configFile: join(appRoot, 'electron.vite.config.ts'), logLevel: 'silent', root: appRoot },
      'build',
      'production',
    );
    const processConfig = resolved.config?.[processType];
    if (!processConfig) {
      throw new TypeError(`electron-vite did not resolve a ${processType} config`);
    }
    const viteConfig = await vite.resolveConfig(
      { ...processConfig, configFile: false, logLevel: 'silent' },
      'build',
      'production',
    );
    const external = viteConfig.build.rolldownOptions?.external ?? viteConfig.build.rollupOptions?.external;
    const declared = (processConfig['build'] as { externalizeDeps?: { include?: readonly string[] } } | undefined)
      ?.externalizeDeps?.include;
    if (!declared && processType === 'main') {
      throw new TypeError('electron-vite main config declares no externalizeDeps.include');
    }
    return { isExternal: async (id: string) => matchesExternal(external, id), include: declared ?? [] };
  } finally {
    process.chdir(previousDirectory);
    if (previousNodeEnvironment === undefined) {
      Reflect.deleteProperty(process.env, 'NODE_ENV');
    } else {
      Reflect.set(process.env, 'NODE_ENV', previousNodeEnvironment);
    }
  }
};

describe('electron-vite main externalization', () => {
  it('bundles workspace sources and keeps host/runtime imports external', async () => {
    const { isExternal, include } = await resolveProcessExternals();
    expect(include).toContain('geospec-engine');
    for (const id of [
      '@taucad/events',
      '@taucad/types/browser',
      '@taucad/openrscad',
      '@taucad/middleware',
      '@taucad/filesystem',
      '@taucad/agent-host',
      '@taucad/host/agent-tools',
      '@taucad/skills/resources',
      'pino-pretty',
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one resolved config, cheap predicate
      expect([id, await isExternal(id)]).toEqual([id, false]);
    }
    for (const id of [...include, 'geospec-engine/node', 'electron', 'node:fs']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one resolved config, cheap predicate
      expect([id, await isExternal(id)]).toEqual([id, true]);
    }
  }, 60_000);

  it('should bundle the browser contract and validator into the preload', async () => {
    const { isExternal } = await resolveProcessExternals('preload');
    expect(await isExternal('@taucad/types/browser')).toBe(false);
    expect(await isExternal('zod')).toBe(false);
    expect(await isExternal('electron')).toBe(true);
  });

  it('declares runtime-loaded packages as direct dependencies', async () => {
    const { include } = await resolveProcessExternals();
    const manifest = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };

    /* Every externalized package must be a declared dependency: the unpackaged
     * build resolves them from `apps/desktop/node_modules`, and an undeclared
     * one kills the kernel host at boot (`nanoraster/options`, 2026-09-07). */
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(expect.arrayContaining([...include]));
  });

  it.runIf(process.platform === 'darwin' && process.arch === 'arm64')(
    'loads the local libassimp addon through the desktop dependency boundary',
    () => {
      const require = createRequire(join(appRoot, 'package.json'));
      const assimpRequire = createRequire(require.resolve('libassimp/package.json'));
      const manifest = assimpRequire('libassimp/package.json') as { readonly version: string };
      const addon = assimpRequire('libassimp-darwin-arm64') as {
        readonly buildIdentity: string;
        readonly napiVersion: number;
        readonly packageVersion: string;
      };

      expect(addon).toMatchObject({
        buildIdentity: 'darwin-arm64-napi8',
        napiVersion: 8,
        packageVersion: manifest.version,
      });
      expect(assimpRequire.resolve('libassimp-darwin-arm64/package.json')).toBeTruthy();
    },
  );
});

/** Inert package fixtures exercise packaging only; no native code is loaded. */
const sourceRelinkName = 'geospec-engine-native-source-relink.tar.gz';
const sourceRelinkBytes = 'inert source/relink fixture';
const platformAddon = 'geospec-engine.darwin-arm64.node';

type EngineFixture = { readonly desktopRoot: string; readonly archive: string };

/** Lay out an installed engine pin the way pnpm links it beside the desktop app. */
const writeEngineFixture = async (directory: string, platformVersion = '0.0.1'): Promise<EngineFixture> => {
  const name = 'geospec-engine';
  const desktopRoot = join(directory, 'desktop');
  const packages: Record<string, Array<[string, string]>> = {
    [name]: [
      ['LICENSE', 'packaging fixture license'],
      ['NOTICE', 'packaging fixture notice'],
      ['licenses/OCCT-LGPL-2.1.txt', 'packaging fixture OCCT license'],
      ['licenses/OCCT-LGPL-exception.txt', 'packaging fixture OCCT exception'],
      [
        'licenses/SOURCE-RELINK.json',
        JSON.stringify({
          schema: 'geospec-native-source-relink-asset-v2',
          artifact: {
            fileName: sourceRelinkName,
            bytes: Buffer.byteLength(sourceRelinkBytes),
            sha256: createHash('sha256').update(sourceRelinkBytes).digest('hex'),
          },
        }),
      ],
      [
        'package.json',
        JSON.stringify({
          name,
          version: '0.0.1',
          type: 'module',
          exports: { './node': { types: './dist/node.d.mts', node: './dist/node.mjs' } },
          imports: { '#native-binding': { node: './dist/native/index.js' } },
          optionalDependencies: { [`${name}-darwin-arm64`]: '0.0.1' },
        }),
      ],
      ['dist/node.mjs', '// packaging fixture public entry'],
      ['dist/native/index.js', '// packaging fixture generated loader'],
    ],
    [`${name}-darwin-arm64`]: [
      ['LICENSE', 'packaging fixture license'],
      [
        'package.json',
        JSON.stringify({
          name: `${name}-darwin-arm64`,
          version: platformVersion,
          main: platformAddon,
          os: ['darwin'],
          cpu: ['arm64'],
        }),
      ],
      [platformAddon, 'inert packaging fixture, never loaded'],
    ],
  };
  await Promise.all(
    Object.entries(packages).flatMap(([packageName, files]) =>
      files.map(async ([path, bytes]) => {
        const destination = join(desktopRoot, 'node_modules', packageName, path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
      }),
    ),
  );
  const archive = join(directory, 'release-assets', sourceRelinkName);
  await mkdir(dirname(archive), { recursive: true });
  await writeFile(archive, sourceRelinkBytes);
  return { desktopRoot, archive };
};

describe('GeoSpec engine staging', () => {
  it('should preserve published manifests, loader, platform addon and licenses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
    try {
      const { desktopRoot, archive } = await writeEngineFixture(directory);
      const modulesRoot = join(directory, 'stage/node_modules');
      const dependencies = await copyGeoSpecEngine(desktopRoot, modulesRoot);
      expect(dependencies).toEqual({
        'geospec-engine': '0.0.1',
        'geospec-engine-darwin-arm64': '0.0.1',
      });
      const root = await realpath(join(modulesRoot, 'geospec-engine'));
      const platform = `${root}-darwin-arm64`;
      const require = createRequire(join(directory, 'stage/package.json'));
      expect(require.resolve('geospec-engine/node')).toBe(join(root, 'dist/node.mjs'));
      expect(createRequire(join(root, 'package.json')).resolve('#native-binding')).toBe(
        join(root, 'dist/native/index.js'),
      );
      expect(require.resolve('geospec-engine-darwin-arm64')).toBe(join(platform, platformAddon));
      await Promise.all(
        [
          ['geospec-engine', root],
          ['geospec-engine-darwin-arm64', platform],
        ].map(async ([packageName, destination]) => {
          const source = join(desktopRoot, 'node_modules', packageName!);
          // These complete fixture trees include the manifests, code and legal files.
          const paths = await readdir(source, { recursive: true, withFileTypes: true });
          await Promise.all(
            paths
              .filter((entry) => entry.isFile())
              .map(async (entry) => {
                const path = relative(source, join(entry.parentPath, entry.name));
                expect(await readFile(join(destination!, path))).toEqual(await readFile(join(source, path)));
              }),
          );
        }),
      );
      const resources = join(directory, 'Tau.app/Contents/Resources');
      await copyGeoSpecSourceRelink(
        archive,
        await readFile(join(root, 'licenses/SOURCE-RELINK.json'), 'utf8'),
        resources,
      );
      expect(await readFile(join(resources, 'SOURCES', sourceRelinkName), 'utf8')).toBe(sourceRelinkBytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['missing', 'corrupt'])('should reject a %s source/relink archive before co-delivery', async (condition) => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
    try {
      const { desktopRoot, archive } = await writeEngineFixture(directory);
      const modulesRoot = join(directory, 'stage/node_modules');
      const resources = join(directory, 'Tau.app/Contents/Resources');
      await copyGeoSpecEngine(desktopRoot, modulesRoot);
      if (condition === 'missing') {
        await rm(archive);
      } else {
        const corruptBytes = sourceRelinkBytes.replace('inert', 'alter');
        expect(Buffer.byteLength(corruptBytes)).toBe(Buffer.byteLength(sourceRelinkBytes));
        await writeFile(archive, corruptBytes);
      }
      await expect(
        copyGeoSpecSourceRelink(
          archive,
          await readFile(join(modulesRoot, 'geospec-engine/licenses/SOURCE-RELINK.json'), 'utf8'),
          resources,
        ),
      ).rejects.toThrow(condition === 'missing' ? 'ENOENT' : 'source/relink archive differs');
      await expect(readFile(join(resources, 'SOURCES', sourceRelinkName))).rejects.toThrow('ENOENT');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should co-deliver regular archive bytes when the selected source is a symlink', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
    try {
      const { desktopRoot, archive } = await writeEngineFixture(directory);
      const modulesRoot = join(directory, 'stage/node_modules');
      const resources = join(directory, 'Tau.app/Contents/Resources');
      await copyGeoSpecEngine(desktopRoot, modulesRoot);
      const payload = join(directory, 'source-relink-payload');
      await rm(archive);
      await writeFile(payload, sourceRelinkBytes);
      await symlink(payload, archive);
      const destination = join(resources, 'SOURCES', sourceRelinkName);
      await copyGeoSpecSourceRelink(
        archive,
        await readFile(join(modulesRoot, 'geospec-engine/licenses/SOURCE-RELINK.json'), 'utf8'),
        resources,
      );
      const destinationInfo = await lstat(destination);
      expect(destinationInfo.isSymbolicLink()).toBe(false);
      await rm(payload);
      expect(await readFile(destination, 'utf8')).toBe(sourceRelinkBytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should reject mismatched root/platform versions without substituting another platform', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
    try {
      const { desktopRoot } = await writeEngineFixture(directory, '0.0.0');
      await expect(copyGeoSpecEngine(desktopRoot, join(directory, 'stage/node_modules'))).rejects.toThrow(
        'matching root/Darwin arm64 manifests',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should stop when the Darwin arm64 platform package is not installed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
    try {
      const { desktopRoot } = await writeEngineFixture(directory);
      await rm(join(desktopRoot, 'node_modules/geospec-engine-darwin-arm64'), { recursive: true });
      // The pnpm test launcher adds workspace dependencies to NODE_PATH.
      // Exclude that fallback to exercise a genuinely absent platform package.
      const nodeEnvironment = { ...process.env };
      delete nodeEnvironment['NODE_PATH'];
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `import { copyGeoSpecEngine } from ${JSON.stringify(pathToFileURL(join(appRoot, 'scripts/runtime-closure.mts')).href)};
           await copyGeoSpecEngine(process.argv[1], process.argv[2]);`,
          desktopRoot,
          join(directory, 'stage/node_modules'),
        ],
        { encoding: 'utf8', env: nodeEnvironment },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('geospec-engine-darwin-arm64 is not installed beside geospec-engine');
      await expect(readdir(join(directory, 'stage/node_modules'))).rejects.toThrow('ENOENT');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['LICENSE', platformAddon])('should stop when the platform %s is absent', async (missingPath) => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
    try {
      const { desktopRoot } = await writeEngineFixture(directory);
      await rm(join(desktopRoot, 'node_modules/geospec-engine-darwin-arm64', missingPath));
      await expect(copyGeoSpecEngine(desktopRoot, join(directory, 'stage/node_modules'))).rejects.toThrow('ENOENT');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should stop when the root package carries no dependency licenses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
    try {
      const { desktopRoot } = await writeEngineFixture(directory);
      await rm(join(desktopRoot, 'node_modules/geospec-engine/licenses'), { recursive: true });
      await expect(copyGeoSpecEngine(desktopRoot, join(directory, 'stage/node_modules'))).rejects.toThrow('ENOENT');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
