import { describe, expect, it } from 'vitest';

import { plugin, picogk } from '#index.js';

const options = {
  kernels: {
    default: {
      workerExecutable: '/worker',
      workerSha256: 'a'.repeat(64),
      trustFile: '/trust.json',
      resourceFiles: [{ path: '/resource', sha256: 'b'.repeat(64), label: 'resource' }],
    },
  },
};

describe('@taucad/picogk', () => {
  it('binds the mechanical plugin alias to the package-named factory', () => {
    expect(picogk).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin(options);
    expect(capabilities.kernels.map(({ id }) => id)).toEqual(['picogk']);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
  });
});
