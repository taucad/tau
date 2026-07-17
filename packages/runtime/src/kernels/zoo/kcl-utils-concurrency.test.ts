// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { FileSystemManager } from '#kernels/zoo/filesystem-manager.js';
import { KclUtilities } from '#kernels/zoo/kcl-utils.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';

const memoryFs = (): KernelFileSystem =>
  ({
    async readFile(path: string) {
      void path;
      return new TextEncoder().encode('x = 1\n');
    },
    async exists(path: string) {
      void path;
      return true;
    },
    async readdir() {
      return ['main.kcl'];
    },
  }) as unknown as KernelFileSystem;

describe('KclUtilities execute serialization', () => {
  it('serializes concurrent executeProgram calls — second waits for first Context.execute', async () => {
    const fs = new FileSystemManager(memoryFs());
    const utils = new KclUtilities({ fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl('x = 1\n');

    let executeCallCount = 0;
    const deferred = Promise.withResolvers<void>();

    Reflect.set(utils, 'isEngineInitialized', true);
    Reflect.set(utils, 'engineManager', {
      bridge: { flushPending: vi.fn().mockResolvedValue(undefined) },
      context: {
        execute: vi.fn(async () => {
          executeCallCount++;
          await deferred.promise;
          return {
            variables: { x: { type: 'Number', value: 1, ty: { type: 'Unknown' } } },
            operations: [],
            artifactGraph: { map: {}, itemCount: 0 },
            issues: [],
            filenames: {},
            defaultPlanes: null,
          };
        }),
      },
    });

    const first = utils.executeProgram(program, '/main.kcl');
    await Promise.resolve();
    expect(executeCallCount).toBe(1);

    const second = utils.executeProgram(program, '/main.kcl');
    await Promise.resolve();
    expect(executeCallCount).toBe(1);

    deferred.resolve();
    await first;
    await Promise.resolve();
    expect(executeCallCount).toBe(2);
    await second;

    await utils.cleanup();
  });
});
