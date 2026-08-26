import { describe, expect, it } from 'vitest';

import { plugin, opencascadeNative } from '#index.js';

describe('@taucad/opencascade-native', () => {
  it('binds the package-named alias to the same factory', () => {
    expect(opencascadeNative).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin();
    expect(capabilities.kernels.map(({ id }) => id)).toEqual(['opencascade-native']);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
  });
});
