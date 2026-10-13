/**
 * The packaged app contains one self-sufficient ASAR. Workspace sources are
 * bundled; Electron, Node built-ins, and the runtime-loaded engines stay
 * external so each native loader can resolve its adjacent `.node` binary — for
 * `@taulabs/openrscad-engine` that is the whole point of its `node` export
 * condition, which a bundler would otherwise resolve away.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Exercise the package script's actual staging boundary.
import { copyGeoSpecNativeAssembly, copyGeoSpecSourceRelink } from '../scripts/runtime-closure.mjs';

const appRoot = join(import.meta.dirname, '..');

describe('macOS GeoSpec assembly selection', () => {
  it('should depend on the GeoSpec producer in every macOS packaging mode', () => {
    const project = JSON.parse(readFileSync(join(appRoot, 'project.json'), 'utf8')) as {
      readonly targets: Record<string, { readonly dependsOn: unknown[] }>;
    };
    const producer = { projects: ['geospec-engine-native'], target: 'prepare-geospec-ci-artifacts' };
    for (const mode of ['package-macos', 'package-macos-release', 'package-macos-unsigned']) {
      expect(project.targets[mode]?.dependsOn).toContainEqual(producer);
    }
  });

  it('should select and finish copying a verified snapshot for the default assembly', () => {
    const source = readFileSync(join(appRoot, 'scripts/package-macos.mts'), 'utf8');
    const mode = source.indexOf('parseMacosPackageMode(process.argv.slice(2))');
    const unsafeOutput = source.indexOf('Refusing unsafe package output root:');
    const selection = source.indexOf(
      "const selectedGeoSpecAssembly = process.env['TAU_GEOSPEC_NATIVE_ASSEMBLY_ROOT'];",
    );
    const conditional = source.indexOf('if (selectedGeoSpecAssembly === undefined)', selection);
    const snapshot = source.indexOf("'snapshot-delivery'", conditional);
    const selected = source.indexOf('geospecAssemblyInput = selections[0]', snapshot);
    const realPath = source.indexOf('const geospecAssemblyRoot = await realpath(', selected);
    const stage = source.indexOf('await rm(outputRoot, { recursive: true, force: true })', realPath);
    const nativeCopy = source.indexOf('copyGeoSpecNativeAssembly(', stage);
    const sourceCopy = source.indexOf('copyGeoSpecSourceRelink(geospecAssemblyRoot', nativeCopy);
    const earlyCleanupBranch = source.indexOf('if (selectedGeoSpecAssembly === undefined)', sourceCopy);
    const earlyCleanup = source.indexOf(
      'await rm(geospecAssemblyRoot, { recursive: true, force: true })',
      earlyCleanupBranch,
    );
    const cleanup = source.indexOf('await rm(ownedGeoSpecSnapshot, { recursive: true, force: true })', sourceCopy);

    expect(mode).toBeGreaterThan(-1);
    expect(unsafeOutput).toBeGreaterThan(mode);
    expect(selection).toBeGreaterThan(unsafeOutput);
    expect(conditional).toBeGreaterThan(selection);
    expect(snapshot).toBeGreaterThan(conditional);
    expect(selected).toBeGreaterThan(snapshot);
    expect(realPath).toBeGreaterThan(selected);
    expect(stage).toBeGreaterThan(realPath);
    expect(nativeCopy).toBeGreaterThan(stage);
    expect(sourceCopy).toBeGreaterThan(nativeCopy);
    expect(earlyCleanupBranch).toBeGreaterThan(sourceCopy);
    expect(earlyCleanup).toBeGreaterThan(earlyCleanupBranch);
    expect(cleanup).toBeGreaterThan(sourceCopy);
    expect(source).not.toContain("'ensure-delivery'");
    expect(source).not.toContain('maxBuffer: 64 * 1024 ** 2');
    expect(source).toContain("if (selectedGeoSpecAssembly === '')");
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

type MainExternals = {
  readonly isExternal: (id: string) => Promise<boolean>;
  /** `externalizeDeps.include` as the config declares it. */
  readonly include: readonly string[];
};

const resolveMainExternals = async (): Promise<MainExternals> => {
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
    const mainConfig = resolved.config?.['main'];
    if (!mainConfig) {
      throw new TypeError('electron-vite did not resolve a main config');
    }
    const viteConfig = await vite.resolveConfig(
      { ...mainConfig, configFile: false, logLevel: 'silent' },
      'build',
      'production',
    );
    const external = viteConfig.build.rolldownOptions?.external ?? viteConfig.build.rollupOptions?.external;
    const declared = (mainConfig['build'] as { externalizeDeps?: { include?: readonly string[] } } | undefined)
      ?.externalizeDeps?.include;
    if (!declared) {
      throw new TypeError('electron-vite main config declares no externalizeDeps.include');
    }
    return { isExternal: async (id: string) => matchesExternal(external, id), include: declared };
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
    const { isExternal, include } = await resolveMainExternals();
    expect(include).toContain('@taucad/geospec-engine-native');
    for (const id of [
      '@taucad/events',
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
    for (const id of [...include, '@taucad/geospec-engine-native/node', 'electron', 'node:fs']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one resolved config, cheap predicate
      expect([id, await isExternal(id)]).toEqual([id, true]);
    }
  }, 60_000);

  it('declares runtime-loaded packages as direct dependencies', async () => {
    const { include } = await resolveMainExternals();
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

/** Inert archive fixtures exercise packaging only; no native code is loaded. */
const sourceRelinkName = 'geospec-engine-native-source-relink.tar.gz';
const sourceRelinkBytes = 'inert source/relink fixture';
const writeNativeAssemblyFixture = async (assemblyRoot: string, platformVersion = '0.0.1'): Promise<void> => {
  const name = '@taucad/geospec-engine-native';
  const commonFiles: Array<[string, string]> = [
    ['LICENSE', 'packaging fixture license'],
    ['NOTICE', 'packaging fixture notice'],
    ['licenses/OCCT-LICENSE_LGPL_21.txt', 'packaging fixture OCCT license'],
    ['licenses/OCCT-EXCEPTION.txt', 'packaging fixture OCCT exception'],
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
  ];
  const packages: Record<string, Array<[string, string]>> = {
    root: [
      ...commonFiles,
      [
        'package.json',
        JSON.stringify({
          name,
          version: '0.0.1',
          type: 'module',
          exports: { './node': { node: './dist/node.mjs' } },
          imports: { '#native-binding': { node: './dist/native/index.js' } },
          optionalDependencies: { [`${name}-darwin-arm64`]: '0.0.1' },
        }),
      ],
      ['dist/node.mjs', '// packaging fixture public entry'],
      ['dist/native/index.js', '// packaging fixture generated loader'],
    ],
    'darwin-arm64': [
      ...commonFiles,
      [
        'package.json',
        JSON.stringify({
          name: `${name}-darwin-arm64`,
          version: platformVersion,
          main: 'geospec-engine-native.darwin-arm64.node',
          os: ['darwin'],
          cpu: ['arm64'],
        }),
      ],
      ['geospec-engine-native.darwin-arm64.node', 'inert packaging fixture, never loaded'],
    ],
  };
  await mkdir(join(assemblyRoot, 'tarballs'), { recursive: true });
  await writeFile(join(assemblyRoot, 'tarballs', sourceRelinkName), sourceRelinkBytes);
  await Promise.all(
    Object.entries(packages).map(async ([target, files]) => {
      const directory = join(assemblyRoot, target);
      await Promise.all(
        files.map(async ([path, bytes]) => {
          const destination = join(directory, 'package', path);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, bytes);
        }),
      );
      execFileSync('tar', ['-czf', join(assemblyRoot, 'tarballs', `${target}.tgz`), '-C', directory, 'package']);
    }),
  );
};

describe('GeoSpec native assembly staging', () => {
  it('should preserve published manifests, loader, platform addon and both license closures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
    try {
      const assemblyRoot = join(directory, 'assembly');
      const modulesRoot = join(directory, 'stage/node_modules');
      await writeNativeAssemblyFixture(assemblyRoot);
      const dependencies = await copyGeoSpecNativeAssembly(assemblyRoot, modulesRoot);
      expect(dependencies).toEqual({
        '@taucad/geospec-engine-native': '0.0.1',
        '@taucad/geospec-engine-native-darwin-arm64': '0.0.1',
      });
      const root = await realpath(join(modulesRoot, '@taucad/geospec-engine-native'));
      const platform = `${root}-darwin-arm64`;
      const require = createRequire(join(directory, 'stage/package.json'));
      expect(require.resolve('@taucad/geospec-engine-native/node')).toBe(join(root, 'dist/node.mjs'));
      expect(createRequire(join(root, 'package.json')).resolve('#native-binding')).toBe(
        join(root, 'dist/native/index.js'),
      );
      expect(require.resolve('@taucad/geospec-engine-native-darwin-arm64')).toBe(
        join(platform, 'geospec-engine-native.darwin-arm64.node'),
      );
      await Promise.all(
        ['root', 'darwin-arm64'].map(async (target) => {
          const source = join(assemblyRoot, target, 'package');
          const destination = target === 'root' ? root : platform;
          // These complete fixture trees include the manifests, code and legal files.
          const paths = await readdir(source, { recursive: true, withFileTypes: true });
          await Promise.all(
            paths
              .filter((entry) => entry.isFile())
              .map(async (entry) => {
                const path = relative(source, join(entry.parentPath, entry.name));
                expect(await readFile(join(destination, path))).toEqual(await readFile(join(source, path)));
              }),
          );
        }),
      );
      const resources = join(directory, 'Tau.app/Contents/Resources');
      await copyGeoSpecSourceRelink(
        assemblyRoot,
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
      const assemblyRoot = join(directory, 'assembly');
      const modulesRoot = join(directory, 'stage/node_modules');
      const resources = join(directory, 'Tau.app/Contents/Resources');
      await writeNativeAssemblyFixture(assemblyRoot);
      await copyGeoSpecNativeAssembly(assemblyRoot, modulesRoot);
      const archive = join(assemblyRoot, 'tarballs', sourceRelinkName);
      if (condition === 'missing') {
        await rm(archive);
      } else {
        const corruptBytes = sourceRelinkBytes.replace('inert', 'alter');
        expect(Buffer.byteLength(corruptBytes)).toBe(Buffer.byteLength(sourceRelinkBytes));
        await writeFile(archive, corruptBytes);
      }
      await expect(
        copyGeoSpecSourceRelink(
          assemblyRoot,
          await readFile(join(modulesRoot, '@taucad/geospec-engine-native/licenses/SOURCE-RELINK.json'), 'utf8'),
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
      const assemblyRoot = join(directory, 'assembly');
      const modulesRoot = join(directory, 'stage/node_modules');
      const resources = join(directory, 'Tau.app/Contents/Resources');
      await writeNativeAssemblyFixture(assemblyRoot);
      await copyGeoSpecNativeAssembly(assemblyRoot, modulesRoot);
      const archive = join(assemblyRoot, 'tarballs', sourceRelinkName);
      const payload = join(directory, 'source-relink-payload');
      await rm(archive);
      await writeFile(payload, sourceRelinkBytes);
      await symlink(payload, archive);
      const destination = join(resources, 'SOURCES', sourceRelinkName);
      await copyGeoSpecSourceRelink(
        assemblyRoot,
        await readFile(join(modulesRoot, '@taucad/geospec-engine-native/licenses/SOURCE-RELINK.json'), 'utf8'),
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

  it('should reject mismatched assembly versions without substituting an installed platform', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
    try {
      await writeNativeAssemblyFixture(directory, '0.0.0');
      await expect(copyGeoSpecNativeAssembly(directory, join(directory, 'stage/node_modules'))).rejects.toThrow(
        'matching published root/Darwin arm64 manifests',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['licenses', 'geospec-engine-native.darwin-arm64.node'])(
    'should stop when the platform %s is absent',
    async (missingPath) => {
      const directory = await mkdtemp(join(tmpdir(), 'tau-native-packaging-'));
      try {
        await writeNativeAssemblyFixture(directory);
        await rm(join(directory, 'darwin-arm64/package', missingPath), { recursive: true });
        execFileSync('tar', [
          '-czf',
          join(directory, 'tarballs/darwin-arm64.tgz'),
          '-C',
          join(directory, 'darwin-arm64'),
          'package',
        ]);
        await expect(copyGeoSpecNativeAssembly(directory, join(directory, 'stage/node_modules'))).rejects.toThrow(
          'ENOENT',
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
