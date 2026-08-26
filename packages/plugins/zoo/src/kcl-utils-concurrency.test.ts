// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { FileSystemManager } from '#filesystem-manager.js';
import { KclUtilities } from '#kcl-utils.js';
import type { KernelFileSystem } from '@taucad/runtime/kernel';

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
  it('rejects an aborted operation before touching the engine', async () => {
    const fs = new FileSystemManager(memoryFs());
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    const bustCacheAndResetScene = vi.fn();
    Reflect.set(utils, 'engineManager', { context: { bustCacheAndResetScene } });
    const controller = new AbortController();
    const reason = new Error('render timeout');
    controller.abort(reason);

    await expect(utils.clearProgram({ signal: controller.signal })).rejects.toBe(reason);
    expect(bustCacheAndResetScene).not.toHaveBeenCalled();
  });

  it('serializes concurrent executeProgram calls — second waits for first Context.execute', async () => {
    const fs = new FileSystemManager(memoryFs());
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
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
