import { describe, expect, it } from 'vitest';

describe('@taucad/runtime/presets subpath', () => {
  it('should expose presets from the dedicated subpath only', async () => {
    const root = await import('#index.js');
    const subpath = await import('#plugins/presets.js');

    expect('presets' in root).toBe(false);
    expect(subpath.presets.all().kernels.map((kernel) => kernel.id)).toEqual(
      expect.arrayContaining(['replicad', 'opencascade', 'jscad', 'manifold', 'zoo', 'tau']),
    );
  });
});
