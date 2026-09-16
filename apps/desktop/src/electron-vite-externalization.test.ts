/**
 * The packaged app contains one self-sufficient ASAR. Workspace sources are
 * bundled; Electron, Node built-ins, and the runtime-loaded engines stay
 * external so each native loader can resolve its adjacent `.node` binary — for
 * `@taulabs/openrscad-engine` that is the whole point of its `node` export
 * condition, which a bundler would otherwise resolve away.
 */

import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Exercise the package script's actual staging boundary.
import { copyGeoSpecNative } from '../scripts/runtime-closure.mjs';

const appRoot = join(import.meta.dirname, '..');

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
  it('resolves the GeoSpec native STEP backend from the desktop runtime boundary', () => {
    const require = createRequire(join(appRoot, 'package.json'));
    expect(require.resolve('@taucad/geospec-engine/native/opencascade/single')).toMatch(/init\.js$/u);
  });

  it('instantiates GeoSpec STEP evidence from the staged native payload without workspace resolution', async () => {
    const require = createRequire(join(appRoot, 'package.json'));
    const source = dirname(require.resolve('@taucad/geospec-engine/package.json'));
    const stage = await mkdtemp(join(tmpdir(), 'tau-geospec-stage-'));
    try {
      await copyGeoSpecNative(source, join(stage, 'node_modules'));
      const output = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "const { default: init } = await import('@taucad/geospec-engine/native/opencascade/single'); const module = await init(); console.log(typeof module.GeoSpecXdeReader);",
        ],
        { cwd: stage, encoding: 'utf8', timeout: 60_000 },
      );
      expect(output.trim()).toBe('function');
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }, 90_000);

  it('bundles workspace sources and keeps host/runtime imports external', async () => {
    const { isExternal, include } = await resolveMainExternals();
    for (const id of [
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
    for (const id of [...include, 'electron', 'node:fs']) {
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
