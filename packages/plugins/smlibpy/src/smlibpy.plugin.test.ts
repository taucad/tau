import { describe, expect, it } from 'vitest';

import { plugin, smlibpy } from '#index.js';
import { smlibpyOptionsSchema } from '#smlibpy.schemas.js';

describe('@taucad/smlibpy', () => {
  it('binds the mechanical plugin alias to the package-named factory', () => {
    expect(smlibpy).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin({
      kernels: {
        default: {
          closure: {
            pythonExecutable: '/python',
            workerPath: '/worker.py',
            pythonSha256: 'a'.repeat(64),
            workerSha256: 'b'.repeat(64),
            supportFiles: [
              { path: '/native_materials.py', sha256: 'c'.repeat(64) },
              { path: '/mechanisms.py', sha256: 'd'.repeat(64) },
              { path: '/tau_kernel/analyzer.py', sha256: 'd'.repeat(64) },
              { path: '/tau_kernel/glb.py', sha256: 'd'.repeat(64) },
              { path: '/tau_kernel/model.py', sha256: 'd'.repeat(64) },
              { path: '/tau_kernel/protocol.py', sha256: 'd'.repeat(64) },
            ],
          },
        },
      },
    });
    expect(capabilities.kernels.map(({ id }) => id)).toEqual(['smlibpy']);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
  });

  it('rejects a support-file manifest without both checked-in worker modules', () => {
    expect(
      smlibpyOptionsSchema.safeParse({
        pythonExecutable: '/python',
        workerPath: '/worker.py',
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
