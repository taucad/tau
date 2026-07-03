import type { Plugin } from 'vite';
import { describe, it, expect } from 'vitest';
import { runtime } from '#vite/index.js';
import { wasmAssetsInlineLimit } from '#vite/runtime-invariants.js';

type AssetsInlineLimit = number | boolean | ((file: string) => number | boolean | undefined);

const wasmInlineLimitOf = (limit: AssetsInlineLimit): ((file: string) => number | boolean | undefined) => {
  if (typeof limit !== 'function') {
    throw new TypeError('expected assetsInlineLimit to be a callback');
  }
  return limit;
};

const findInvariants = (plugins: Plugin[]): Plugin => {
  const invariants = plugins.find((plugin) => plugin.name === 'taucad-runtime:invariants');
  if (!invariants) {
    throw new TypeError('runtime() did not register the invariants plugin');
  }
  return invariants;
};

const resolveConfig = (plugin: Plugin): Record<string, unknown> => {
  const { config } = plugin;
  if (typeof config !== 'function') {
    throw new TypeError('invariants plugin must expose a config() function');
  }
  /* Vite's ConfigPluginContext is satisfied by an empty stub for hooks that ignore `this`; the tested hook only reads its parameters. */
  type CallSeam = (
    userConfig: Record<string, unknown>,
    env: { command: 'serve'; mode: 'development' },
  ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
  const callable = config as unknown as CallSeam;
  const result = callable({}, { command: 'serve', mode: 'development' });
  if (!result || typeof result !== 'object' || result instanceof Promise) {
    throw new TypeError('invariants plugin config() must return an object synchronously for these tests');
  }
  return result;
};

describe('runtime (vite plugin)', () => {
  it('should return cross-origin isolation, TS module URL, and invariants plugins in order', () => {
    const plugins = runtime();

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      'taucad-runtime:cross-origin-isolation',
      'vite:ts-module-url-build',
      'vite:ts-module-url-serve',
      'taucad-runtime:invariants',
    ]);
  });

  it('should omit the cross-origin-isolation plugin when crossOriginIsolation: false', () => {
    const plugins = runtime({ crossOriginIsolation: false });

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      'vite:ts-module-url-build',
      'vite:ts-module-url-serve',
      'taucad-runtime:invariants',
    ]);
  });

  it('should mark the invariants plugin with enforce: "pre" so it runs before user plugins', () => {
    const invariants = findInvariants(runtime());

    expect(invariants.enforce).toBe('pre');
  });

  it('should not configure optimizeDeps (runtime invariants intentionally avoid externalizing WASM-bearing deps)', () => {
    const config = resolveConfig(findInvariants(runtime()));

    expect(config['optimizeDeps']).toBeUndefined();
  });

  it('should force worker.format to "es" so workers preserve import.meta.url', () => {
    const config = resolveConfig(findInvariants(runtime()));

    expect(config['worker']).toEqual({ format: 'es' });
  });

  it('should keep native Node runtime dependencies external in SSR and Electron utility builds', () => {
    const config = resolveConfig(findInvariants(runtime()));

    expect(config['ssr']).toEqual({ external: ['esbuild', 'esbuild-wasm'] });
  });

  it('should expose an assetsInlineLimit callback that disables WASM inlining only', () => {
    const config = resolveConfig(findInvariants(runtime()));

    const build = config['build'] as { assetsInlineLimit: AssetsInlineLimit };
    const callback = wasmInlineLimitOf(build.assetsInlineLimit);
    expect(callback('foo.wasm')).toBe(false);
    expect(callback('foo.png')).toBeUndefined();
    expect(callback('foo.wasm')).toBe(wasmAssetsInlineLimit('foo.wasm'));
    expect(callback('foo.png')).toBe(wasmAssetsInlineLimit('foo.png'));
  });
});
