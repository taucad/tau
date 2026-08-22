import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

const externalizationReport = async (
  processConfig: Record<string, unknown> | undefined,
  processName: string,
  vite: ViteApi,
): Promise<Readonly<Record<string, boolean>>> => {
  if (!processConfig) {
    throw new TypeError(`${processName} config was not resolved`);
  }
  const viteConfig = await vite.resolveConfig(
    { ...processConfig, configFile: false, logLevel: 'silent' },
    'build',
    'production',
  );
  const external = viteConfig.build.rolldownOptions?.external ?? viteConfig.build.rollupOptions?.external;

  const modules = [
    '@taucad/esbuild',
    '@taucad/middleware',
    '@taucad/replicad',
    '@taucad/runtime',
    '@taucad/runtime/electron/main',
    '@taucad/openrscad',
    'replicad-opencascadejs',
    'react',
    'react/jsx-runtime',
    'electron',
    'node:fs',
  ] as const;
  return Object.fromEntries(
    await Promise.all(modules.map(async (module) => [module, await matchesExternal(external, module)] as const)),
  );
};

export const resolvedElectronExternalization = async (
  appRoot: string,
): Promise<Readonly<Record<string, Readonly<Record<string, boolean>>>>> => {
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
    return Object.fromEntries(
      await Promise.all(
        ['main', 'preload'].map(
          async (processName) =>
            [processName, await externalizationReport(resolved.config?.[processName], processName, vite)] as const,
        ),
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
