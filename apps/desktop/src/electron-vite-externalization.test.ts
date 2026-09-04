/**
 * The packaged app contains one self-sufficient ASAR. Workspace sources are
 * bundled; Electron, Node built-ins, and the runtime-loaded N-API package stay
 * external so the native loader can resolve its adjacent `.node` binary.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

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

const resolveMainExternals = async (): Promise<(id: string) => Promise<boolean>> => {
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
    return async (id: string) => matchesExternal(external, id);
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
    const isExternal = await resolveMainExternals();
    for (const id of [
      '@taucad/openrscad-native',
      '@taucad/openrscad',
      '@taucad/middleware',
      '@taucad/filesystem',
      '@taucad/agent-host',
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one resolved config, cheap predicate
      expect([id, await isExternal(id)]).toEqual([id, false]);
    }
    for (const id of ['@taulabs/openrscad-engine-native', 'libassimp', 'electron', 'node:fs']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one resolved config, cheap predicate
      expect([id, await isExternal(id)]).toEqual([id, true]);
    }
  }, 60_000);

  it('declares runtime-loaded packages as direct dependencies', () => {
    const manifest = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };

    expect(Object.keys(manifest.dependencies ?? {})).toEqual(
      expect.arrayContaining(['@taulabs/openrscad-engine-native', 'libassimp']),
    );
  });

  it.runIf(process.platform === 'darwin' && process.arch === 'arm64')(
    'loads the local libassimp addon through the desktop dependency boundary',
    () => {
      const require = createRequire(join(appRoot, 'package.json'));
      const addon = require('libassimp-darwin-arm64') as {
        readonly buildIdentity: string;
        readonly napiVersion: number;
        readonly packageVersion: string;
      };

      expect(addon).toMatchObject({
        buildIdentity: 'darwin-arm64-napi8',
        napiVersion: 8,
        packageVersion: '0.2.0',
      });
      expect(require.resolve('libassimp/package.json')).toBeTruthy();
    },
  );
});
