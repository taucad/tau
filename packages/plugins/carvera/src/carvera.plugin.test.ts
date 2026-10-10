import { describe, expect, it } from 'vitest';

import { plugin, carvera } from '#index.js';

describe('@taucad/carvera', () => {
  it('should bind the mechanical plugin alias to the package-named factory', () => {
    expect(carvera).toBe(plugin);
  });

  it('should register only the Carvera machine', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin();
    expect(capabilities.kernels.map(({ id }) => id)).toEqual([]);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
    expect(capabilities.jobs.map(({ id }) => id)).toEqual([]);
    expect(capabilities.machines.map(({ id }) => id)).toEqual(['makera-carvera']);
  });
});
