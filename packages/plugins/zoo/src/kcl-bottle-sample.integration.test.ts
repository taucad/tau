/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { FileSystemManager } from '#filesystem-manager.js';
import { KclUtilities } from '#kcl-utils.js';
import { EXECUTE_INTERRUPTED_ERROR_CODE } from '#kcl-errors.js';
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

describe('KclUtilities bottle-shaped execute (stub engine)', () => {
  it('executeProgram returns non-empty variables via stubbed engine execute', async () => {
    const fs = new FileSystemManager(memoryFs());
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl(`width = 12
height = 20
`);

    Reflect.set(utils, 'isEngineInitialized', true);
    Reflect.set(utils, 'engineManager', {
      bridge: { flushPending: vi.fn().mockResolvedValue(undefined) },
      context: {
        execute: vi.fn(async () => ({
          variables: {
            width: { type: 'Number', value: 12, ty: { type: 'Unknown' } },
            height: { type: 'Number', value: 20, ty: { type: 'Unknown' } },
          },
          operations: [],
          artifactGraph: { map: {}, itemCount: 0 },
          issues: [],
          filenames: {},
          defaultPlanes: null,
        })),
      },
    });

    const outcome = await utils.executeProgram(program, '/main.kcl');
    expect(Object.keys(outcome.variables).length).toBeGreaterThan(0);

    await utils.cleanup();
  });
});

describe('KclUtilities executeMockKcl (real WASM, no WebSocket)', () => {
  it('evaluates a trivial program via executeMock (covers eval_prelude / std path)', async () => {
    const fs = new FileSystemManager(memoryFs());
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl('width = 12\nheight = 20\n');
    const outcome = await utils.executeMockKcl(program, 'main.kcl');
    expect(outcome.errors.length).toBe(0);
    expect(Object.keys(outcome.variables).length).toBeGreaterThan(0);

    await utils.cleanup();
  });
});

describe('KclUtilities cancel', () => {
  it('rejectAllPendingCommand surfaces execution_interrupted on in-flight execute', async () => {
    const fs = new FileSystemManager(memoryFs());
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl('x = 1\n');

    const rejectAllPendingCommand = vi.fn();
    Reflect.set(utils, 'isEngineInitialized', true);
    Reflect.set(utils, 'engineManager', {
      bridge: { rejectAllPendingCommand, flushPending: vi.fn().mockResolvedValue(undefined) },
      context: {
        execute: vi.fn(
          async () =>
            new Promise<void>(() => {
              /* Intentionally pending until cancel() rejects the bridge */
            }),
        ),
      },
    });

    void utils.executeProgram(program, '/main.kcl');
    await Promise.resolve();
    await utils.cancel();
    expect(rejectAllPendingCommand).toHaveBeenCalledWith({
      error_code: EXECUTE_INTERRUPTED_ERROR_CODE,
      message: 'kcl execution was interrupted',
    });

    await utils.cleanup();
  });
});
