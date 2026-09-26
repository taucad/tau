import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, resolveConfig } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';
import { describe, it, expect, vi } from 'vitest';
import { tauRuntime } from '#vite/index.js';
import type { RuntimeVitePlugin } from '#vite/index.js';

type AssetsInlineLimit = ResolvedConfig['build']['assetsInlineLimit'];
type AssetsInlineLimitCallback = Exclude<AssetsInlineLimit, number | boolean>;

const wasmInlineLimitOf = (limit: AssetsInlineLimit): AssetsInlineLimitCallback => {
  if (typeof limit !== 'function') {
    throw new TypeError('expected assetsInlineLimit to be a callback');
  }
  return limit;
};

const findInvariants = (plugins: RuntimeVitePlugin[]): Plugin => {
  const invariants = plugins.find((plugin) => plugin.name === 'taucad-runtime:invariants');
  if (!invariants) {
    throw new TypeError('tauRuntime() did not register the invariants plugin');
  }
  return invariants as Plugin;
};

const resolvePluginConfig = (plugin: Plugin): Record<string, unknown> => {
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

describe('tauRuntime (Vite plugin)', () => {
  it('should return cross-origin isolation, assets, and invariants plugins in order', () => {
    const plugins = tauRuntime();

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      'taucad-runtime:cross-origin-isolation',
      'taucad-runtime:assets',
      'taucad-runtime:invariants',
    ]);
  });

  it('should omit the cross-origin-isolation plugin when crossOriginIsolation: false', () => {
    const plugins = tauRuntime({ crossOriginIsolation: false });

    expect(plugins.map((plugin) => plugin.name)).toEqual(['taucad-runtime:assets', 'taucad-runtime:invariants']);
  });

  it('should mark the invariants plugin with enforce: "pre" so it runs before user plugins', () => {
    const invariants = findInvariants(tauRuntime());

    expect(invariants.enforce).toBe('pre');
  });

  it('should force worker.format to "es" so workers preserve import.meta.url', () => {
    const config = resolvePluginConfig(findInvariants(tauRuntime()));

    expect(config['worker']).toMatchObject({ format: 'es' });
  });

  it('should install fresh Node builtin stubs in Vite worker builds', () => {
    const config = resolvePluginConfig(findInvariants(tauRuntime()));
    const worker = config['worker'] as { plugins?: () => Plugin[] };

    expect(worker.plugins?.().map((plugin) => plugin.name)).toEqual([
      'taucad-runtime:assets',
      'taucad-runtime:browser-node-builtins',
    ]);
    expect(worker.plugins?.()[0]).not.toBe(worker.plugins?.()[0]);
  });

  it('should leave Node builtins available to Vitest while stubbing browser builds', () => {
    const invariants = findInvariants(tauRuntime());
    const { handler: resolveId } = invariants.resolveId as unknown as {
      handler: (this: { environment: { config: { consumer: string; mode: string } } }, source: string) => unknown;
    };
    const browserBuild = { environment: { config: { consumer: 'client', mode: 'production' } } };

    expect(resolveId.call({ environment: { config: { consumer: 'client', mode: 'test' } } }, 'node:fs')).toBeNull();
    expect(resolveId.call(browserBuild, 'node:fs')).toBe('\0taucad-runtime:browser-node-builtins');
    // Hosts that ignore hook filters call the handler for every import.
    expect(resolveId.call(browserBuild, 'node:path')).toBeNull();
  });

  it('should stub every browser Node builtin in a Vite client build', async () => {
    const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'tau-runtime-builtins-'));
    try {
      const entry = path.join(fixtureDirectory, 'entry.mjs');
      writeFileSync(
        entry,
        [
          `import { readFileSync } from 'fs';`,
          `import { randomUUID } from 'node:crypto';`,
          `import { statSync } from 'node:fs';`,
          `import { readFile } from 'node:fs/promises';`,
          `import { fileURLToPath } from 'node:url';`,
          `export const builtins = [readFileSync, randomUUID, statSync, readFile, fileURLToPath];`,
        ].join('\n'),
      );
      const outputDirectory = path.join(fixtureDirectory, 'dist');

      await build({
        configFile: false,
        logLevel: 'silent',
        plugins: [tauRuntime()],
        build: { lib: { entry, formats: ['es'] }, outDir: outputDirectory },
      });

      const output = readdirSync(outputDirectory).find((file) => /\.[cm]?js$/.test(file)) ?? 'missing';
      const built = (await import(pathToFileURL(path.join(outputDirectory, output)).href)) as {
        readonly builtins: ReadonlyArray<() => unknown>;
      };
      expect(built.builtins).toHaveLength(5);
      for (const builtin of built.builtins) {
        expect(builtin).toThrow('is unavailable in a browser runtime');
      }
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it('should compose the WASM invariant with a resolved numeric asset limit', async () => {
    const config = await resolveConfig(
      {
        configFile: false,
        plugins: [tauRuntime()],
        build: { assetsInlineLimit: 10 },
      },
      'build',
      'test',
    );
    const callback = wasmInlineLimitOf(config.build.assetsInlineLimit);

    expect(callback('foo.wasm', Buffer.alloc(1))).toBe(false);
    expect(callback('small.png', Buffer.alloc(9))).toBe(true);
    expect(callback('large.png', Buffer.alloc(10))).toBe(false);
    expect(callback('pointer.png', Buffer.from('version https://git-lfs.github.com/spec/v1'))).toBe(false);
  });

  it('should delegate every non-WASM asset to a resolved consumer callback', async () => {
    const consumerLimit = vi.fn((filePath: string): false | undefined =>
      filePath.endsWith('.svg') ? false : undefined,
    );
    const config = await resolveConfig(
      {
        configFile: false,
        plugins: [tauRuntime()],
        build: { assetsInlineLimit: consumerLimit },
      },
      'build',
      'test',
    );
    const callback = wasmInlineLimitOf(config.build.assetsInlineLimit);

    expect(callback('module.wasm', Buffer.alloc(1))).toBe(false);
    expect(callback('icon.svg', Buffer.alloc(1))).toBe(false);
    expect(callback('photo.png', Buffer.alloc(1))).toBeUndefined();
    expect(consumerLimit).toHaveBeenCalledTimes(2);
  });
});
