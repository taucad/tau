import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDefaultKernelOptions, createDebugKernelOptions } from '#constants/kernel-worker.constants.js';
import { runtime, uiRuntimeConfigSchema } from '#runtime/ui-runtime.definition.js';
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
      'openscad',
      'zoo',
      'replicad',
      'opencascade',
      'manifold',
      'jscad',
      'tau',
    ]);
    for (const kernel of resolvedRuntime.kernels) {
      expect(typeof kernel.id).toBe('string');
      expect(Array.isArray(kernel.extensions)).toBe(true);
    }
    expect(resolvedRuntime.middleware.map((middleware) => middleware.id)).toEqual([
      'observability',
      'parameterFileResolver',
      'parameterCache',
      'geometryCache',
      'gltfCoordinateTransform',
      'gltfEdgeDetection',
    ]);
  });

  it('createDefaultKernelOptions builds client options with boot config and a wired TransportPlugin', () => {
    const fileSystem = fromMemoryFs();
    const options = createDefaultKernelOptions({ fileSystem, runtimeConfig: expectedConfig });

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
    const debugOptions = createDebugKernelOptions({ fileSystem, runtimeConfig: expectedConfig });

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

  it('should keep worker-reachable kernel option builders free of environment value imports', async () => {
    const source = await readFile(resolve(process.cwd(), 'app/constants/kernel-worker.constants.ts'), 'utf8');

    expect(source).not.toContain('#environment.config.js');
    expect(source).not.toContain(' ENV ');
    expect(source).not.toContain('ENV.');
  });
});
