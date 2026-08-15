import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@playwright/test';

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
    const externalRule = rule as (specifier: string) => unknown | Promise<unknown>;
    return Boolean(await externalRule(id));
  }
  return false;
};

const expectProcessExternalization = async (
  processConfig: Record<string, unknown> | undefined,
  processName: string,
  vite: ViteApi,
): Promise<void> => {
  if (!processConfig) {
    throw new TypeError(`${processName} config was not resolved`);
  }
  const viteConfig = await vite.resolveConfig(
    { ...processConfig, configFile: false, logLevel: 'silent' },
    'build',
    'production',
  );
  const external = viteConfig.build.rolldownOptions?.external ?? viteConfig.build.rollupOptions?.external;

  await Promise.all([
    expect(matchesExternal(external, '@taucad/runtime')).resolves.toBe(false),
    expect(matchesExternal(external, '@taucad/runtime/electron/main')).resolves.toBe(false),
    expect(matchesExternal(external, '@taucad/openscad')).resolves.toBe(false),
    expect(matchesExternal(external, 'react')).resolves.toBe(true),
    expect(matchesExternal(external, 'react/jsx-runtime')).resolves.toBe(true),
    expect(matchesExternal(external, 'electron')).resolves.toBe(true),
    expect(matchesExternal(external, 'node:fs')).resolves.toBe(true),
  ]);
};

export const expectResolvedElectronExternalization = async (appRoot: string): Promise<void> => {
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
    await Promise.all(
      ['main', 'preload'].map(async (processName) =>
        expectProcessExternalization(resolved.config?.[processName], processName, vite),
      ),
    );
  } finally {
    process.chdir(previousDirectory);
    if (previousNodeEnvironment === undefined) {
      Reflect.deleteProperty(process.env, 'NODE_ENV');
    } else {
      Reflect.set(process.env, 'NODE_ENV', previousNodeEnvironment);
    }
  }
};
