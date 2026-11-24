import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  createDefaultKernelOptions,
  createDebugKernelOptions,
  sizeComputeBinding,
} from '#constants/kernel-worker.constants.js';
import { runtime } from '#runtime/ui-runtime.definition.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.schema.js';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';

/* `webWorkerTransport(...)` validates a `Worker` ctor is in scope at
 * construction time (the actual worker is only spawned on `open()`). jsdom
 * does not expose `Worker` as a global, so install a minimal stub for the
 * duration of the suite — no real `postMessage` traffic happens here, the
 * test only inspects the synchronously-built transport handle shape. */
const noop = (): void => {
  /* No-op for stubbing browser APIs not present in jsdom. */
};
const originalWorker = (globalThis as { Worker?: unknown }).Worker;
beforeAll(() => {
  (globalThis as { Worker?: unknown }).Worker = class StubWorker {
    public postMessage = noop;
    public addEventListener = noop;
    public removeEventListener = noop;
    public terminate = noop;
  };
});
afterAll(() => {
  (globalThis as { Worker?: unknown }).Worker = originalWorker;
});

describe('kernel-worker constants', () => {
  const expectedConfig = {
    tauApiUrl: 'http://localhost:4000',
    tauWebSocketUrl: 'ws://localhost:4001',
  };

  it('the UI runtime definition materializes the editor plugins from boot config', async () => {
    const parsedConfig = uiRuntimeConfigSchema.parse(expectedConfig);
    const resolvedRuntime = await resolveRuntimeDefinition(runtime, parsedConfig);

    expect(resolvedRuntime.kernels.map((kernel) => kernel.id)).toEqual([
      'opencascade',
      'openrscad',
      'picogk',
      'jscad',
      'manifold',
      'picovoxel',
      'smlib',
      'gltf',
      'brep',
      'cadmpeg',
      'assimp',
      'replicad',
      'zoo',
      'tscircuit',
    ]);
    for (const kernel of resolvedRuntime.kernels) {
      expect(typeof kernel.id).toBe('string');
      expect(Array.isArray(kernel.extensions)).toBe(true);
    }
    // PicoVoxel keeps its default wasm 'auto' (resolved per worker from the isolation snapshot).
    expect(resolvedRuntime.kernels.find((kernel) => kernel.id === 'picovoxel')).not.toHaveProperty('options.wasm');
    expect(resolvedRuntime.middleware.map((middleware) => middleware.id)).toEqual([
      'parameterFileResolver',
      'parameterUnits',
      'geometryCache',
      'gltfEdgeDetection',
    ]);
  });

  it('createDefaultKernelOptions builds client options with boot config and a wired TransportPlugin', () => {
    const fileSystem = fromMemoryFs();
    const options = createDefaultKernelOptions({
      fileSystem,
      runtimeConfig: expectedConfig,
    });

    expect(options.config).toEqual(expectedConfig);
    expect(options.transport).toBeDefined();
    const transportPlugin = options.transport;
    expect(typeof transportPlugin.materialize).toBe('function');
    expect(typeof transportPlugin.describe).toBe('function');
    const transport = transportPlugin.materialize();
    expect(typeof transport.open).toBe('function');
    expect(typeof transport.close).toBe('function');
    expect(options).not.toHaveProperty('kernels');
    expect(options).not.toHaveProperty('middleware');
    expect(options).not.toHaveProperty('bundlers');
    expect(options).not.toHaveProperty('transcoders');
  });

  it('createDebugKernelOptions inherits transport composition from default', () => {
    const fileSystem = fromMemoryFs();
    const debugOptions = createDebugKernelOptions({
      fileSystem,
      runtimeConfig: expectedConfig,
    });

    expect(debugOptions.transport).toBeDefined();
    expect(debugOptions.config).toEqual(expectedConfig);
    const transportPlugin = debugOptions.transport;
    expect(typeof transportPlugin.materialize).toBe('function');
    expect(transportPlugin.materialize()).toHaveProperty('id', transportPlugin.id);
    expect(debugOptions).not.toHaveProperty('kernels');
  });

  it('createDefaultKernelOptions does not expose a top-level tessellation field', () => {
    const options = createDefaultKernelOptions({
      fileSystem: fromMemoryFs(),
      runtimeConfig: expectedConfig,
    });
    expect(options).not.toHaveProperty('tessellation');
  });

  /* PL7 staging verification 2026-11-21, row 5: the runtime worker's script failed to load and its owner, the CAD
   * unit, saw only a closed channel. The factory now tells the owner first, through the kernel options. */
  it('should tell the owner when the runtime worker’s code fails to load', async () => {
    const workers: EventTarget[] = [];
    const stub = (globalThis as { Worker?: unknown }).Worker;
    (globalThis as { Worker?: unknown }).Worker = class FailingWorker extends EventTarget {
      public postMessage = noop;
      public terminate = noop;
      public constructor() {
        super();
        workers.push(this);
      }
    };
    try {
      const onWorkerCodeLoadFailure = vi.fn();
      const options = createDefaultKernelOptions({
        fileSystem: fromMemoryFs(),
        runtimeConfig: expectedConfig,
        onWorkerCodeLoadFailure,
      });
      const transport = options.transport.materialize();
      await transport.open();

      workers[0]?.dispatchEvent(new Event('error'));

      expect(onWorkerCodeLoadFailure).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ code: 'WORKER_LOAD_FAILED', worker: 'runtime' }),
      );
      await transport.close();
    } finally {
      (globalThis as { Worker?: unknown }).Worker = stub;
    }
  });

  it('should keep worker-reachable kernel option builders free of environment value imports', async () => {
    const source = await readFile(resolve(process.cwd(), 'app/constants/kernel-worker.constants.ts'), 'utf8');

    expect(source).not.toContain('#environment.config.js');
    expect(source).not.toContain(' ENV ');
    expect(source).not.toContain('ENV.');
  });
});

describe('compute binding sizing', () => {
  const store = Object.freeze({}) as Extract<Parameters<typeof sizeComputeBinding>[0], { mode: 'durable' }>['store'];

  it.each([
    { compute: undefined, expected: { mode: 'memory', memoryConstrained: true } },
    { compute: { mode: 'memory' }, expected: { mode: 'memory', memoryConstrained: true } },
    { compute: { mode: 'durable', store }, expected: { mode: 'durable', store, memoryConstrained: true } },
    { compute: { mode: 'off' }, expected: { mode: 'off' } },
  ] as const)('should size a $compute.mode binding for a memory-constrained device', ({ compute, expected }) => {
    expect(sizeComputeBinding(compute, true)).toStrictEqual(expected);
  });

  it('should leave the binding as the host selected it on other devices', () => {
    const compute = { mode: 'durable', store } as const;
    expect(sizeComputeBinding(compute, false)).toBe(compute);
    expect(sizeComputeBinding(undefined, undefined)).toBeUndefined();
  });
});
