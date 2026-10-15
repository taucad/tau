import { describe, expect, it } from 'vitest';

import { plugin, grbl } from '#index.js';

describe('@taucad/grbl', () => {
  it('binds the mechanical plugin alias to the package-named factory', () => {
    expect(grbl).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin();
    expect(capabilities.kernels.map(({ id }) => id)).toEqual([]);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
    expect(capabilities.jobs.map(({ id }) => id)).toEqual([]);
    expect(capabilities.machines.map(({ id }) => id)).toEqual(['grbl']);
  });
});
