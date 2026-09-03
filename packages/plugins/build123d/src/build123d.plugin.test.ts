import { describe, expect, it } from 'vitest';

import { plugin, build123d } from '#index.js';
import { build123dOptionsSchema } from '#build123d.schemas.js';

describe('@taucad/build123d', () => {
  it('binds the mechanical plugin alias to the package-named factory', () => {
    expect(build123d).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin({
      kernels: {
        default: {
          pythonExecutable: '/python',
          workerPath: '/worker.py',
          trustFile: '/trust.json',
          pythonSha256: 'a'.repeat(64),
          workerSha256: 'b'.repeat(64),
          supportFiles: [
            { path: '/analyzer.py', sha256: 'c'.repeat(64) },
            { path: '/glb.py', sha256: 'd'.repeat(64) },
          ],
        },
      },
    });
    expect(capabilities.kernels.map(({ id }) => id)).toEqual(['build123d']);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
  });

  it('rejects a support-file manifest without both checked-in worker modules', () => {
    expect(
      build123dOptionsSchema.safeParse({
        pythonExecutable: '/python',
        workerPath: '/worker.py',
        trustFile: '/trust.json',
        pythonSha256: 'a'.repeat(64),
        workerSha256: 'b'.repeat(64),
        supportFiles: [
          { path: '/analyzer.py', sha256: 'c'.repeat(64) },
          { path: '/other.py', sha256: 'd'.repeat(64) },
        ],
      }).success,
    ).toBe(false);
  });
});
