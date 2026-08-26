import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { electronRuntimeConfig } from '#electron/vite.js';
import type { ElectronRuntimeUserConfig } from '#electron/vite.js';

const pluginNames = (plugins: readonly unknown[] | undefined): string[] =>
  (plugins ?? [])
    .flat(Infinity)
    .flatMap((plugin) =>
      plugin && typeof plugin === 'object' && 'name' in plugin ? [String((plugin as Plugin).name)] : [],
    );

describe('electronRuntimeConfig', () => {
  it('should install runtime plugins only in main and renderer', () => {
    const input = { main: {}, preload: {}, renderer: {} };
    const config: ElectronRuntimeUserConfig = electronRuntimeConfig(input);

    expect(config).not.toBe(input);
    expect(input).toEqual({ main: {}, preload: {}, renderer: {} });
    expect(pluginNames(config.main?.plugins)).toEqual(['taucad-runtime:ssr-assets', 'taucad-runtime:invariants']);
    expect(pluginNames(config.preload?.plugins)).toEqual([]);
    expect(pluginNames(config.renderer?.plugins)).toEqual([
      'taucad-runtime:cross-origin-isolation',
      'taucad-runtime:ssr-assets',
      'taucad-runtime:invariants',
    ]);
  });

  it('should merge runtime roots into externalizeDeps while preserving consumer configuration', () => {
    const consumerPlugin: Plugin = { name: 'consumer' };
    const config: ElectronRuntimeUserConfig = electronRuntimeConfig({
      main: {
        plugins: [consumerPlugin],
        build: {
          outDir: 'main-out',
          externalizeDeps: {
            exclude: ['consumer-root', '@taucad/runtime'],
            include: ['native-addon'],
          },
        },
      },
      preload: { build: { externalizeDeps: true } },
      renderer: { root: 'renderer-root', plugins: [consumerPlugin] },
    });

    expect(config.main?.build).toMatchObject({
      outDir: 'main-out',
      externalizeDeps: {
        exclude: ['consumer-root', '@taucad/runtime'],
        include: ['native-addon'],
      },
    });
    expect(config.preload?.build?.externalizeDeps).toEqual({
      exclude: ['@taucad/runtime'],
    });
    expect(config.renderer).toMatchObject({ root: 'renderer-root' });
    expect(pluginNames(config.main?.plugins)).toContain('consumer');
    expect(pluginNames(config.renderer?.plugins)).toContain('consumer');
  });

  it('should preserve the externalizeDeps false escape hatch and omitted process sections', () => {
    const config: ElectronRuntimeUserConfig = electronRuntimeConfig({
      main: { build: { externalizeDeps: false } },
    });

    expect(config.main?.build?.externalizeDeps).toBe(false);
    expect(config.preload).toBeUndefined();
    expect(config.renderer).toBeUndefined();
  });
});
