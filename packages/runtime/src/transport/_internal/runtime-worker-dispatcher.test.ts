/* oxlint-disable unicorn-js/prevent-abbreviations -- handler-callback shorthand `fn`/`telemetryFn` mirrors the runtime API surface. */
/* oxlint-disable enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- structural cast types in `(result as { data: Array<{ bytes: Uint8Array }> })` describe wire payloads, not runtime allocations. */
/* oxlint-disable prefer-destructuring -- `(seen[0]!.result as { data: ... }).data` casts then accesses; not a destructure-friendly pattern. */
/* oxlint-disable curly -- single-line `if (cond) continue;` guard is intentional in compact loops. */
import process from 'node:process';
import { MessageChannel } from 'node:worker_threads';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SharedPool } from '@taucad/memory';
import { createChannelClient, wrapMessagePort } from '@taucad/rpc';
import type { Channel, ChannelServerHandle, Port } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import { createWorkerDispatcher, runtimeChannelSessionKey } from '#transport/_internal/runtime-worker-dispatcher.js';
import type { KernelWorker } from '#framework/kernel-worker.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { CapabilitiesManifest, ExportGeometryResult } from '#types/runtime.types.js';
import type { GeometryEncoder } from '#transport/_internal/runtime-worker-dispatcher.js';
import type { EncodedGeometry } from '#transport/runtime-transport.types.js';
import { RuntimeAlreadyInitializedError } from '#transport/runtime-transport.types.js';

type DispatcherFixture = {
  client: Channel<RuntimeProtocol>;
  server: ChannelServerHandle<RuntimeProtocol>;
  serverPort: Port<unknown>;
  channel: MessageChannel;
};

type FixtureOptions = Parameters<typeof createWorkerDispatcher>[2];
const testGeometry = { format: 'gltf', content: new Uint8Array([1]), hash: 'mock' } satisfies Geometry;
const renderId = '550e8400-e29b-41d4-a716-446655440000';

/** Build a dispatcher fixture wired against an in-memory `MessageChannel` pair. */
async function buildFixture(worker: KernelWorker, options?: FixtureOptions): Promise<DispatcherFixture> {
  const messageChannel = new MessageChannel();
  const serverPort: Port<unknown> = wrapMessagePort<unknown>(messageChannel.port1, { label: 'server' });
  const clientPort = wrapMessagePort<unknown>(messageChannel.port2, { label: 'client' });
  serverPort.start?.();
  clientPort.start?.();

  const server = createWorkerDispatcher(worker, serverPort, options);
  const client = createChannelClient<RuntimeProtocol>({
    port: clientPort,
    sessionKey: runtimeChannelSessionKey,
  });
  await client.ready;

  return { client, server, serverPort, channel: messageChannel };
}

async function flushMicrotasks(): Promise<void> {
  /* Yield long enough for several event-loop turns; the dispatcher's
   * settle path may queue chained promises across notify routing. */
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });
}

function createMockWorker(overrides?: Partial<KernelWorker>): KernelWorker {
  const base = {
    initialize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    render: vi
      .fn<() => Promise<{ success: true; data: typeof testGeometry; issues: never[] }>>()
      .mockResolvedValue({ success: true, data: testGeometry, issues: [] }),
    exportGeometry: vi
      .fn<() => Promise<{ success: true; data: unknown[] }>>()
      .mockResolvedValue({ success: true, data: [] }),
    exportModel: vi
      .fn<() => Promise<{ success: true; data: unknown[] }>>()
      .mockResolvedValue({ success: true, data: [] }),
    cleanup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    notifyFileChanged: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleOpenFile: vi.fn(),
    handleStageAndOpenFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleUpdateParameters: vi.fn(),
    handleSetOptions: vi.fn(),
    ensureLoadedBundler: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setTelemetrySend: vi.fn(),
    setDevtoolsTelemetryEnabled: vi.fn(),
    setCompiledWasmModules: vi.fn(),
    flushTelemetry: vi.fn(),
    setSignalBuffer: vi.fn(),
    handleWireAbort: vi.fn(),
    capabilitiesManifest: { routes: [], renderCapabilities: {} },
    ...overrides,
  };
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to KernelWorker
  return base as unknown as KernelWorker;
}

async function tearDown(fixture: DispatcherFixture): Promise<void> {
  fixture.server.dispose('test');
  fixture.client.close('test');
  fixture.channel.port1.close();
  fixture.channel.port2.close();
}

describe('createWorkerDispatcher', () => {
  let fixture: DispatcherFixture | undefined;

  afterEach(async () => {
    if (fixture) {
      await tearDown(fixture);
      fixture = undefined;
    }
    vi.restoreAllMocks();
  });

  describe('calls', () => {
    it('settles `initialize` with the worker capabilities manifest', async () => {
      const manifest = {
        registrations: [],
        routes: [
          {
            targetFormat: 'usdz',
            kernelId: 'replicad',
            sourceFormat: 'glb',
            transcoderId: 'converter',
            fidelity: 'mesh',
            exportOptions: { schema: {}, defaults: {} },
          },
        ],
        renderCapabilities: {},
      } as const satisfies CapabilitiesManifest;

      const worker = createMockWorker({ capabilitiesManifest: manifest });
      fixture = await buildFixture(worker);

      const result = await fixture.client.call('initialize', {});

      expect(result).toEqual({ capabilities: manifest });
    });

    it('rejects a second initialize call without reinitializing the worker', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      await expect(fixture.client.call('initialize', {})).resolves.toBeDefined();
      await expect(fixture.client.call('initialize', {})).rejects.toMatchObject({
        code: new RuntimeAlreadyInitializedError().code,
      });
      expect(worker.initialize).toHaveBeenCalledOnce();
    });

    it('rejects `initialize` when worker.initialize throws', async () => {
      const worker = createMockWorker({
        initialize: vi.fn().mockRejectedValue(new Error('WASM load failed')),
      });
      fixture = await buildFixture(worker);

      await expect(fixture.client.call('initialize', {})).rejects.toThrow('WASM load failed');
    });

    it('settles `export` with the worker export result', async () => {
      const exportBytes = new Uint8Array([1, 2, 3, 4]);
      const expectedSnapshot = new Uint8Array(exportBytes);
      const companionBytes = new Uint8Array([5, 6]);
      const companionSnapshot = new Uint8Array(companionBytes);
      const worker = createMockWorker({
        exportGeometry: vi.fn().mockResolvedValue({
          success: true,
          data: [
            { name: 'model.obj', bytes: exportBytes, mimeType: 'model/obj' },
            { name: 'model.mtl', bytes: companionBytes, mimeType: 'model/mtl' },
          ],
          issues: [],
        }),
      });
      fixture = await buildFixture(worker);

      const result = await fixture.client.call('export', { format: 'stl' });

      expect(result).toMatchObject({ success: true });
      const data = (
        result as unknown as {
          data: Array<{ name: string; bytes: { delivery: 'inline'; bytes: Uint8Array }; mimeType: string }>;
        }
      ).data;
      // Export bytes are transferred — compare against an unrelated snapshot so the
      // detached source buffer doesn't blow up the structural equality check.
      expect(data[0]?.bytes.bytes).toEqual(expectedSnapshot);
      expect(data[1]?.bytes.bytes).toEqual(companionSnapshot);
      expect(data.map(({ name, mimeType }) => ({ name, mimeType }))).toEqual([
        { name: 'model.obj', mimeType: 'model/obj' },
        { name: 'model.mtl', mimeType: 'model/mtl' },
      ]);
      expect(worker.flushTelemetry).toHaveBeenCalledOnce();
    });

    it('should settle `exportModel` with the worker request-scoped export result', async () => {
      const exportBytes = new Uint8Array([8, 7, 6]);
      const expectedSnapshot = new Uint8Array(exportBytes);
      const companionBytes = new Uint8Array([5, 4]);
      const companionSnapshot = new Uint8Array(companionBytes);
      const exportModel = vi.fn().mockResolvedValue({
        success: true,
        data: [
          { name: 'model.gltf', bytes: exportBytes, mimeType: 'model/gltf+json' },
          { name: 'buffer.bin', bytes: companionBytes, mimeType: 'application/octet-stream' },
        ],
        issues: [],
      });
      const worker = createMockWorker({ exportModel });
      fixture = await buildFixture(worker);

      const result = await fixture.client.call('exportModel', {
        file: { path: '', filename: 'main.ts' },
        parameters: { height: 10 },
        options: { quality: 'fine' },
        format: 'glb',
        exportOptions: { binary: true },
      });

      expect(exportModel).toHaveBeenCalledWith(
        {
          file: { path: '', filename: 'main.ts' },
          parameters: { height: 10 },
          options: { quality: 'fine' },
          format: 'glb',
          exportOptions: { binary: true },
        },
        expect.any(AbortSignal),
      );
      expect(result).toMatchObject({ success: true });
      const data = (
        result as unknown as {
          data: Array<{ name: string; bytes: { delivery: 'inline'; bytes: Uint8Array }; mimeType: string }>;
        }
      ).data;
      expect(data[0]?.bytes.bytes).toEqual(expectedSnapshot);
      expect(data[1]?.bytes.bytes).toEqual(companionSnapshot);
      expect(data.map(({ name }) => name)).toEqual(['model.gltf', 'buffer.bin']);
      expect(worker.flushTelemetry).toHaveBeenCalledOnce();
    });

    it('transfers source snapshot bytes and forwards the per-call signal', async () => {
      const content = new Uint8Array([4, 5, 6]);
      const expected = new Uint8Array(content);
      const snapshotSource = vi.fn().mockResolvedValue({
        success: true,
        data: {
          entryPath: 'main.ts',
          files: [{ path: 'main.ts', content, sha256: 'hash', role: 'entry' }],
          unresolvedPaths: [],
          kernelId: 'mock-kernel',
        },
        issues: [],
      });
      const worker = createMockWorker({ snapshotSource });
      fixture = await buildFixture(worker);

      const result = await fixture.client.call('snapshotSource', {
        file: { path: '', filename: 'main.ts' },
        additionalPaths: [{ path: 'tau.json', required: true }],
      });

      expect(snapshotSource).toHaveBeenCalledWith(
        {
          file: { path: '', filename: 'main.ts' },
          additionalPaths: [{ path: 'tau.json', required: true }],
        },
        expect.any(AbortSignal),
      );
      expect(result).toMatchObject({ success: true });
      if (result.success) {
        expect(result.data.files[0]?.content).toEqual(expected);
      }
      expect(worker.flushTelemetry).toHaveBeenCalledOnce();
    });

    it('should normalize unknown export issue codes before wire validation', async () => {
      const worker = createMockWorker({
        exportGeometry: vi.fn().mockResolvedValue({
          success: false,
          issues: [{ severity: 'error', type: 'kernel', message: 'failed', code: 'UPSTREAM_CODE' }],
        }),
      });
      fixture = await buildFixture(worker);

      await expect(fixture.client.call('export', { format: 'stl' })).resolves.toEqual({
        success: false,
        issues: [{ severity: 'error', type: 'kernel', message: 'failed', code: 'UNKNOWN' }],
      });
    });

    it('passes the per-call abort signal to the worker export', async () => {
      let observed: AbortSignal | undefined;
      const worker = createMockWorker({
        // The signal is `exportGeometry`'s fourth argument; rest args keep the
        // stub inside `max-params` while still recording it.
        exportGeometry: vi.fn(
          async (...args: unknown[]) =>
            new Promise<ExportGeometryResult>((_resolve, reject) => {
              const signal = args[3] as AbortSignal | undefined;
              observed = signal;
              signal?.addEventListener(
                'abort',
                () => {
                  reject(new Error('worker export aborted'));
                },
                { once: true },
              );
            }),
        ),
      });
      fixture = await buildFixture(worker);

      const controller = new AbortController();
      const call = fixture.client.call('export', { format: 'stl' }, controller.signal);
      await flushMicrotasks();
      controller.abort();

      await expect(call).rejects.toMatchObject({ name: 'AbortError' });
      // The client rejects synchronously; the `rc` cancel frame reaches the server one turn later.
      await flushMicrotasks();
      expect(observed?.aborted).toBe(true);
    });

    it('passes the per-call abort signal to exportModel', async () => {
      let observed: AbortSignal | undefined;
      const worker = createMockWorker({
        exportModel: vi.fn(
          async (_request: unknown, signal?: AbortSignal) =>
            new Promise<ExportGeometryResult>((_resolve, reject) => {
              observed = signal;
              signal?.addEventListener(
                'abort',
                () => {
                  reject(new Error('worker export aborted'));
                },
                { once: true },
              );
            }),
        ),
      });
      fixture = await buildFixture(worker);

      const controller = new AbortController();
      const call = fixture.client.call(
        'exportModel',
        { file: { path: '', filename: 'main.ts' }, parameters: {}, format: 'glb' },
        controller.signal,
      );
      await flushMicrotasks();
      controller.abort();

      await expect(call).rejects.toMatchObject({ name: 'AbortError' });
      // The client rejects synchronously; the `rc` cancel frame reaches the server one turn later.
      await flushMicrotasks();
      expect(observed?.aborted).toBe(true);
    });

    it('forwards worker-owned memory handles to the worker setters', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      const signalBuffer = new SharedArrayBuffer(8, { maxByteLength: 16 });
      const geometryBuffer = new SharedArrayBuffer(4096);
      const compiledModule = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      const compiledWasmModules = [{ url: 'https://example.com/kernel.wasm', module: compiledModule }];
      await fixture.client.call('initialize', {
        memoryHandle: {
          signalBuffer,
          geometryPoolBuffer: geometryBuffer,
          devtoolsTelemetry: true,
          compiledWasmModules,
        },
      });

      expect(worker.setSignalBuffer).toHaveBeenCalledTimes(1);
      expect(worker.setDevtoolsTelemetryEnabled).toHaveBeenCalledWith(true);
      expect(worker.setCompiledWasmModules).toHaveBeenCalledWith(compiledWasmModules);
    });
  });

  describe('client → worker notifies', () => {
    it('routes pooled-binary materialisation acknowledgements to the transport owner', async () => {
      const acknowledgeBinary = vi.fn();
      fixture = await buildFixture(createMockWorker(), { acknowledgeBinary });
      await fixture.client.call('initialize', {});

      fixture.client.notify('binaryMaterialised', { key: 'geometry-hash' });
      await flushMicrotasks();

      expect(acknowledgeBinary).toHaveBeenCalledWith('geometry-hash');
    });

    it('routes `openFile` notify to worker.handleOpenFile', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      const file = { path: '', filename: 'main.ts' };
      fixture.client.notify('openFile', {
        renderId,
        file,
        parameters: { foo: 'bar' },
        options: { coordinateSystem: 'z-up' },
      });
      await flushMicrotasks();

      expect(worker.handleOpenFile).toHaveBeenCalledWith({
        renderId,
        file,
        parameters: { foo: 'bar' },
        options: { coordinateSystem: 'z-up' },
      });
    });

    it('routes `stage-and-render` notify to worker.handleStageAndOpenFile', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      const stage = { 'main.ts': new Uint8Array([1, 2, 3]) };
      const file = { path: '', filename: 'main.ts' };
      fixture.client.notify('stage-and-render', { renderId, stage, file, parameters: { foo: 'bar' } });
      await flushMicrotasks();

      expect(worker.handleStageAndOpenFile).toHaveBeenCalledWith({
        renderId,
        stage,
        file,
        parameters: { foo: 'bar' },
      });
    });

    it('surfaces handleStageAndOpenFile rejection as an `errorEvent` notify', async () => {
      const worker = createMockWorker({
        handleStageAndOpenFile: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('writeFile blew up')),
      });
      fixture = await buildFixture(worker);

      const errors: Array<{ issues: ReadonlyArray<{ message: string }> }> = [];
      fixture.client.onNotify('errorEvent', (args) => {
        errors.push(args);
      });

      fixture.client.notify('stage-and-render', {
        renderId,
        stage: { 'main.ts': new Uint8Array([1]) },
        file: { path: '', filename: 'main.ts' },
        parameters: {},
      });
      await flushMicrotasks();

      expect(errors).toHaveLength(1);
      expect(errors[0]!.issues[0]!.message).toContain('writeFile blew up');
    });

    it('routes `updateParameters`, `setOptions`, and `abort` notifies (T18)', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      fixture.client.notify('updateParameters', { renderId, parameters: { width: 10 } });
      fixture.client.notify('setOptions', { renderId, options: { density: 'high' } });
      fixture.client.notify('abort', { renderId, reason: 2 });
      await flushMicrotasks();

      expect(worker.handleUpdateParameters).toHaveBeenCalledWith({ renderId, parameters: { width: 10 } });
      expect(worker.handleSetOptions).toHaveBeenCalledWith({ renderId, options: { density: 'high' } });
      expect(worker.notifyFileChanged).not.toHaveBeenCalled();
      expect(worker.handleWireAbort).toHaveBeenCalledWith({ renderId, reason: 2 });
    });

    it('should surface a synchronous preview command failure as one scoped error (T8, T15, T26)', async () => {
      const worker = createMockWorker({
        handleOpenFile: vi.fn(() => {
          throw new TypeError('invalid file locator');
        }),
      });
      fixture = await buildFixture(worker);
      const errors: Array<RuntimeProtocol['notifies']['errorEvent']['args']> = [];
      fixture.client.onNotify('errorEvent', (args) => errors.push(args));

      fixture.client.notify('openFile', {
        renderId,
        file: { path: 'relative', filename: 'main.ts' },
        parameters: {},
      });
      await flushMicrotasks();

      expect(errors).toEqual([
        {
          renderId,
          issues: [{ message: 'invalid file locator', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
        },
      ]);
    });

    it('should surface synchronous `updateParameters`/`setOptions` failures as scoped errors only (T15)', async () => {
      const worker = createMockWorker({
        handleUpdateParameters: vi.fn(() => {
          throw new TypeError('updateParameters blew up');
        }),
        handleSetOptions: vi.fn(() => {
          throw new TypeError('setOptions blew up');
        }),
      });
      fixture = await buildFixture(worker);
      const errors: Array<RuntimeProtocol['notifies']['errorEvent']['args']> = [];
      fixture.client.onNotify('errorEvent', (args) => errors.push(args));

      fixture.client.notify('updateParameters', { renderId, parameters: { width: 10 } });
      fixture.client.notify('setOptions', { renderId, options: { density: 'high' } });
      await flushMicrotasks();

      expect(errors).toEqual([
        {
          renderId,
          issues: [{ message: 'updateParameters blew up', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
        },
        {
          renderId,
          issues: [{ message: 'setOptions blew up', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
        },
      ]);
    });

    it('ignores a misrouted worker → client notify without touching the worker (T15)', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);
      const errors: Array<RuntimeProtocol['notifies']['errorEvent']['args']> = [];
      fixture.client.onNotify('errorEvent', (args) => errors.push(args));

      fixture.client.notify('activeKernelChanged', { kernelId: 'replicad', renderId });
      fixture.client.notify('stateChanged', { renderId, abortGeneration: 1, state: 'idle' });
      await flushMicrotasks();

      expect(errors).toEqual([]);
      expect(worker.handleOpenFile).not.toHaveBeenCalled();
      expect(worker.handleUpdateParameters).not.toHaveBeenCalled();
      expect(worker.handleSetOptions).not.toHaveBeenCalled();
      expect(worker.handleWireAbort).not.toHaveBeenCalled();
    });

    it('acknowledges `cleanup` only after worker cleanup completes', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      await expect(fixture.client.call('cleanup', undefined)).resolves.toBeNull();

      expect(worker.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('autonomous worker → client notifies', () => {
    it('emits kernel events with their kernel identity', async () => {
      let onKernelEvent: ((event: RuntimeProtocol['notifies']['kernelEvent']['args']) => void) | undefined;
      const worker = createMockWorker();
      Object.defineProperty(worker, 'onKernelEvent', {
        set(fn: typeof onKernelEvent) {
          onKernelEvent = fn;
        },
        get() {
          return onKernelEvent;
        },
      });
      fixture = await buildFixture(worker);
      const seen: Array<RuntimeProtocol['notifies']['kernelEvent']['args']> = [];
      fixture.client.onNotify('kernelEvent', (event) => seen.push(event));
      await fixture.client.call('initialize', {});

      onKernelEvent?.({ kernelId: 'solver', type: 'iteration', renderId, payload: { residual: 0.01 } });
      await flushMicrotasks();

      expect(seen).toEqual([{ kernelId: 'solver', type: 'iteration', renderId, payload: { residual: 0.01 } }]);
    });

    it('emits `geometryComputed` from worker.onGeometryComputed', async () => {
      const sab = new SharedArrayBuffer(256 * 1024);
      const pool = new SharedPool(sab, { maxEntries: 64 });
      const content = new Uint8Array([42]);

      let onGeometryComputed: ((event: { result: unknown; renderId: string }) => void) | undefined;
      const worker = createMockWorker();
      Object.defineProperty(worker, 'onGeometryComputed', {
        set(fn: (event: { result: unknown; renderId: string }) => void) {
          onGeometryComputed = fn;
        },
        get() {
          return onGeometryComputed;
        },
      });

      const poolEncoder: GeometryEncoder = (geometry): EncodedGeometry => {
        if (geometry.format !== 'gltf') return { value: geometry, transferables: [], tier: 'copy' };
        if (!pool.has(geometry.hash)) pool.store(geometry.hash, geometry.content);
        return {
          value: {
            format: 'gltf',
            content: { delivery: 'pooled', key: geometry.hash },
            hash: geometry.hash,
          },
          transferables: [],
          tier: 'pool',
        };
      };

      fixture = await buildFixture(worker, { encodeGeometry: poolEncoder });

      const seen: Array<{ result: unknown }> = [];
      fixture.client.onNotify('geometryComputed', (args) => {
        seen.push(args as { result: unknown });
      });

      await fixture.client.call('initialize', {});

      onGeometryComputed!({
        result: {
          success: true,
          data: { format: 'gltf', content, hash: 'auto-0' },
          issues: [],
        },
        renderId,
      });
      await flushMicrotasks();

      expect(seen).toHaveLength(1);
      const result = seen[0]!.result as {
        data: { format: string; content: { delivery: string; key?: string } };
      };
      expect(result.data.format).toBe('gltf');
      expect(result.data.content.delivery).toBe('pooled');
      expect(result.data.content.key).toBe('auto-0');
    });

    it('emits `progress` and `parametersResolved` notifies with the opaque render ID', async () => {
      let onProgressUpdate:
        | ((event: { phase: string; detail?: Record<string, unknown>; renderId: string }) => void)
        | undefined;
      let onParametersResolved: ((event: { result: unknown; renderId: string }) => void) | undefined;

      const worker = createMockWorker();
      Object.defineProperty(worker, 'onProgressUpdate', {
        set(fn: typeof onProgressUpdate) {
          onProgressUpdate = fn;
        },
        get() {
          return onProgressUpdate;
        },
      });
      Object.defineProperty(worker, 'onParametersResolved', {
        set(fn: typeof onParametersResolved) {
          onParametersResolved = fn;
        },
        get() {
          return onParametersResolved;
        },
      });

      fixture = await buildFixture(worker);

      const phases: Array<{ phase: string; renderId: string }> = [];
      fixture.client.onNotify('progress', (args) => {
        phases.push(args);
      });
      const params: Array<{ result: unknown; renderId: string }> = [];
      fixture.client.onNotify('parametersResolved', (args) => {
        params.push(args);
      });

      // Wire callbacks via initialize.
      await fixture.client.call('initialize', {});

      onParametersResolved!({
        result: { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] },
        renderId,
      });
      onProgressUpdate!({ phase: 'bundling', renderId });
      onProgressUpdate!({ phase: 'computingGeometry', renderId });
      await flushMicrotasks();

      expect(phases).toEqual([
        { phase: 'bundling', renderId },
        { phase: 'computingGeometry', renderId },
      ]);
      expect(params).toHaveLength(1);
      expect(params[0]!.renderId).toBe(renderId);
    });

    it('emits `stateChanged`, `activeKernelChanged`, and `capabilitiesUpdated`', async () => {
      let onStateChanged:
        | ((event: { state: string; detail?: string; renderId: string; abortGeneration: number }) => void)
        | undefined;
      let onActiveKernelChanged: ((event: { kernelId?: string; renderId?: string }) => void) | undefined;
      let onCapabilitiesUpdated: ((capabilities: unknown) => void) | undefined;

      const worker = createMockWorker();
      Object.defineProperty(worker, 'onStateChanged', {
        set(fn: typeof onStateChanged) {
          onStateChanged = fn;
        },
        get() {
          return onStateChanged;
        },
      });
      Object.defineProperty(worker, 'onActiveKernelChanged', {
        set(fn: typeof onActiveKernelChanged) {
          onActiveKernelChanged = fn;
        },
        get() {
          return onActiveKernelChanged;
        },
      });
      Object.defineProperty(worker, 'onCapabilitiesUpdated', {
        set(fn: typeof onCapabilitiesUpdated) {
          onCapabilitiesUpdated = fn;
        },
        get() {
          return onCapabilitiesUpdated;
        },
      });

      fixture = await buildFixture(worker);

      const state: Array<{ state: string; renderId: string; abortGeneration?: number }> = [];
      const kernels: Array<{ kernelId?: string; renderId?: string }> = [];
      const caps: Array<{ capabilities: unknown }> = [];
      fixture.client.onNotify('stateChanged', (args) => state.push(args));
      fixture.client.onNotify('activeKernelChanged', (args) => kernels.push(args));
      fixture.client.onNotify('capabilitiesUpdated', (args) => caps.push(args as { capabilities: unknown }));

      await fixture.client.call('initialize', {});

      onStateChanged!({ state: 'rendering', renderId, abortGeneration: 1 });
      onActiveKernelChanged!({ kernelId: 'replicad', renderId });
      onCapabilitiesUpdated!({ registrations: [], routes: [], renderCapabilities: {} });
      await flushMicrotasks();

      expect(state).toEqual([{ state: 'rendering', renderId, abortGeneration: 1 }]);
      expect(kernels).toEqual([{ kernelId: 'replicad', renderId }]);
      expect(caps).toEqual([{ capabilities: { registrations: [], routes: [], renderCapabilities: {} } }]);
    });

    it('emits `errorEvent` from worker.onError', async () => {
      let onError: ((event: { issues: unknown[]; renderId?: string }) => void) | undefined;

      const worker = createMockWorker();
      Object.defineProperty(worker, 'onError', {
        set(fn: typeof onError) {
          onError = fn;
        },
        get() {
          return onError;
        },
      });
      fixture = await buildFixture(worker);

      const seen: Array<{ issues: unknown[] }> = [];
      fixture.client.onNotify('errorEvent', (args) => seen.push(args as { issues: unknown[] }));

      await fixture.client.call('initialize', {});

      onError!({ issues: [{ message: 'boom', code: 'KERNEL', type: 'kernel', severity: 'error' }] });
      await flushMicrotasks();

      expect(seen).toEqual([{ issues: [{ message: 'boom', code: 'UNKNOWN', type: 'kernel', severity: 'error' }] }]);
    });
  });

  describe('geometry transport types', () => {
    type GeometryComputedListener = (args: { result: unknown; renderId: string }) => void;
    type GeometryComputedFn = (event: { result: unknown; renderId: string }) => void;

    /**
     * Build a fixture wired to capture `geometryComputed` notify args
     * and expose the worker's `onGeometryComputed` setter so each test
     * can synthesise the result the kernel would emit autonomously.
     *
     * `encoder` injects the wire-tier choice (pool / transfer / copy)
     * the dispatcher should apply.
     */
    async function buildGeometryFixture(encoder?: GeometryEncoder): Promise<{
      seen: Array<{ result: unknown; renderId: string }>;
      emit: (result: unknown, generation: number) => void;
    }> {
      let onGeometryComputed: GeometryComputedFn | undefined;
      const worker = createMockWorker();
      Object.defineProperty(worker, 'onGeometryComputed', {
        set(fn: GeometryComputedFn) {
          onGeometryComputed = fn;
        },
        get() {
          return onGeometryComputed;
        },
      });

      fixture = await buildFixture(worker, encoder ? { encodeGeometry: encoder } : undefined);

      const seen: Array<{ result: unknown; renderId: string }> = [];
      const listener: GeometryComputedListener = (args) => {
        seen.push(args);
      };
      fixture.client.onNotify('geometryComputed', listener);

      await fixture.client.call('initialize', {});

      return {
        seen,
        emit: (result, _generation) => {
          onGeometryComputed!({ result, renderId });
        },
      };
    }

    function makePoolEncoder(pool: SharedPool, allowTransferFallback = false): GeometryEncoder {
      return (geometry): EncodedGeometry => {
        if (geometry.format !== 'gltf') return { value: geometry, transferables: [], tier: 'copy' };
        try {
          if (pool.publish(geometry.hash, geometry.content)) {
            return {
              value: {
                format: 'gltf',
                content: { delivery: 'pooled', key: geometry.hash },
                hash: geometry.hash,
              },
              transferables: [],
              tier: 'pool',
            };
          }
        } catch {
          /* Pool full / oversized — fall through */
        }
        if (!allowTransferFallback) {
          return {
            value: {
              format: 'gltf',
              content: { delivery: 'inline', bytes: geometry.content },
              hash: geometry.hash,
            },
            transferables: [],
            tier: 'copy',
          };
        }
        return {
          value: {
            format: 'gltf',
            content: { delivery: 'inline', bytes: geometry.content },
            hash: geometry.hash,
          },
          transferables: [geometry.content.buffer],
          tier: 'transfer',
        };
      };
    }

    it('auto-stores GLTF geometry in pool and emits pooled delivery via geometryComputed (pool tier)', async () => {
      const sab = new SharedArrayBuffer(256 * 1024);
      const pool = new SharedPool(sab, { maxEntries: 64 });
      const content = new Uint8Array([10, 20, 30]);
      const expectedSnapshot = new Uint8Array(content);

      const { seen, emit } = await buildGeometryFixture(makePoolEncoder(pool));

      expect(pool.has('dep-hash-0')).toBe(false);
      emit(
        {
          success: true,
          data: { format: 'gltf', content, hash: 'dep-hash-0' },
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      expect(pool.has('dep-hash-0')).toBe(true);
      const stored = pool.resolveCopy('dep-hash-0');
      expect(stored).toEqual(expectedSnapshot);

      expect(seen).toHaveLength(1);
      expect(seen[0]!.renderId).toBe(renderId);
      const data = (seen[0]!.result as { data: { content: { delivery: string; key?: string } } }).data;
      expect(data.content.delivery).toBe('pooled');
      expect(data.content.key).toBe('dep-hash-0');
    });

    it('falls back to inline delivery when pool.store rejects an oversized entry (pool→transfer fallback)', async () => {
      const sab = new SharedArrayBuffer(256 * 1024);
      const pool = new SharedPool(sab, { maxEntries: 64, maxEntryBytes: 2 });
      const content = new Uint8Array([10, 20, 30]);
      const expectedSnapshot = new Uint8Array(content);

      const { seen, emit } = await buildGeometryFixture(makePoolEncoder(pool, true));

      emit(
        {
          success: true,
          data: { format: 'gltf', content, hash: 'oversized-0' },
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      const data = (
        seen[0]!.result as {
          data: { format: string; content: { delivery: string; bytes?: Uint8Array } };
        }
      ).data;
      expect(data.content.delivery).toBe('inline');
      // Source `content` was transferred (detached) by the dispatcher; compare
      // the receiver-side bytes against an unrelated snapshot of the original.
      expect(data.content.bytes).toEqual(expectedSnapshot);
    });

    it('skips re-storing geometry already present in the pool', async () => {
      const sab = new SharedArrayBuffer(256 * 1024);
      const pool = new SharedPool(sab, { maxEntries: 64 });
      const content = new Uint8Array([10, 20, 30]);
      pool.store('pre-stored-0', content);

      const storeSpy = vi.spyOn(pool, 'store');

      const { emit } = await buildGeometryFixture(makePoolEncoder(pool));

      emit(
        {
          success: true,
          data: { format: 'gltf', content, hash: 'pre-stored-0' },
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      expect(storeSpy).not.toHaveBeenCalled();
    });

    it('emits inline delivery when no pool is configured (transfer tier)', async () => {
      const content = new Uint8Array([1, 2, 3]);
      const expectedSnapshot = new Uint8Array(content);
      const { seen, emit } = await buildGeometryFixture();

      emit(
        {
          success: true,
          data: { format: 'gltf', content, hash: 'h1' },
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      const data = (
        seen[0]!.result as {
          data: { format: string; content: { delivery: string; bytes?: Uint8Array } };
        }
      ).data;
      expect(data.content.delivery).toBe('inline');
      expect(data.content.bytes).toEqual(expectedSnapshot);
    });

    it('passes SVG geometries through unchanged', async () => {
      const { seen, emit } = await buildGeometryFixture();

      emit(
        {
          success: true,
          data: {
            format: 'svg',
            content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0"></svg>',
            name: 'test',
            hash: 'svg-hash',
          },
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      const data = (seen[0]!.result as { data: { format: string; content: string } }).data;
      expect(data.format).toBe('svg');
      expect(data.content).toContain('<svg');
    });
  });

  describe('unhandled rejection trap', () => {
    let originalListenerCount: number;

    beforeEach(() => {
      originalListenerCount = process.listenerCount('unhandledRejection');
    });

    afterEach(() => {
      const currentCount = process.listenerCount('unhandledRejection');
      expect(currentCount).toBeLessThanOrEqual(originalListenerCount + 1);
    });

    it('catches unhandled rejections during init and rejects the call', async () => {
      const worker = createMockWorker({
        initialize: vi.fn().mockImplementation(
          async () =>
            new Promise<void>(() => {
              // Simulates Emscripten's pthread init: throws in a fire-and-forget promise
              // oxlint-disable-next-line promise/prefer-await-to-then -- intentional unhandled rejection for trap test
              void Promise.reject(new Error('SharedArrayBuffer transfer requires self.crossOriginIsolated'));
            }),
        ),
      });
      fixture = await buildFixture(worker);

      await expect(fixture.client.call('initialize', {})).rejects.toThrow(/crossOriginIsolated/);
    });

    it('surfaces autonomous render rejections as `errorEvent` notifies', async () => {
      let onError: ((event: { issues: unknown[]; renderId?: string }) => void) | undefined;
      const worker = createMockWorker();
      Object.defineProperty(worker, 'onError', {
        set(fn: typeof onError) {
          onError = fn;
        },
        get() {
          return onError;
        },
      });
      fixture = await buildFixture(worker);

      const seen: Array<{ issues: ReadonlyArray<{ message: string }>; renderId?: string }> = [];
      fixture.client.onNotify('errorEvent', (args) => {
        seen.push(args);
      });

      await fixture.client.call('initialize', {});

      onError!({
        issues: [{ message: 'WASM worker crash', code: 'KERNEL', type: 'kernel', severity: 'error' }],
        renderId,
      });
      await flushMicrotasks();

      expect(seen).toHaveLength(1);
      expect(seen[0]!.issues[0]!.message).toBe('WASM worker crash');
      expect(seen[0]!.issues[0]).toMatchObject({ code: 'UNKNOWN' });
      expect(seen[0]!.renderId).toBe(renderId);
    });

    it('catches unhandled rejections during export and rejects the call', async () => {
      const worker = createMockWorker({
        exportGeometry: vi.fn().mockImplementation(
          async () =>
            new Promise(() => {
              // oxlint-disable-next-line promise/prefer-await-to-then -- intentional unhandled rejection for trap test
              void Promise.reject(new Error('export worker failure'));
            }),
        ),
      });
      fixture = await buildFixture(worker);

      await expect(fixture.client.call('export', { format: 'stl' })).rejects.toThrow(/export worker failure/);
    });

    it('cleans up trap listeners after success', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      await fixture.client.call('initialize', {});

      const currentCount = process.listenerCount('unhandledRejection');
      expect(currentCount).toBeLessThanOrEqual(originalListenerCount + 1);
    });

    it('handles non-Error rejection reasons gracefully', async () => {
      const worker = createMockWorker({
        initialize: vi.fn().mockImplementation(
          async () =>
            new Promise<void>(() => {
              // oxlint-disable-next-line prefer-promise-reject-errors, promise/prefer-await-to-then -- testing non-Error rejection
              void Promise.reject('plain string rejection');
            }),
        ),
      });
      fixture = await buildFixture(worker);

      await expect(fixture.client.call('initialize', {})).rejects.toThrow(/plain string rejection/);
    });
  });

  describe('hello handshake', () => {
    it('emits the `lh` hello with a runtime-identifying payload before any other frame', async () => {
      const messageChannel = new MessageChannel();
      const wrappedServer = wrapMessagePort<unknown>(messageChannel.port1, { label: 'server' });
      const clientPort = wrapMessagePort<unknown>(messageChannel.port2, { label: 'client' });
      wrappedServer.start?.();
      clientPort.start?.();

      const observed: unknown[] = [];
      /* Spy on the underlying NodeJS port the wrappedServer was built from
       * so we observe the raw frames in send order. The dispatcher's
       * `createChannelServer` MUST emit `lh` first. node:worker_threads
       * MessagePort.postMessage's transfer-list arg is typed as
       * `Transferable[]`; rebinding via `Reflect.apply` keeps the original
       * signature without leaking `any` into the test surface. */
      const originalPostMessage = messageChannel.port1.postMessage.bind(messageChannel.port1);
      messageChannel.port1.postMessage = ((value: unknown, transfer?: readonly Transferable[]) => {
        observed.push(value);
        return Reflect.apply(
          originalPostMessage,
          messageChannel.port1,
          transfer === undefined ? [value] : [value, transfer],
        ) as ReturnType<typeof originalPostMessage>;
      }) as typeof messageChannel.port1.postMessage;

      const worker = createMockWorker();
      const server = createWorkerDispatcher(worker, wrappedServer);
      const client = createChannelClient<RuntimeProtocol>({
        port: clientPort,
        sessionKey: runtimeChannelSessionKey,
      });

      try {
        await client.ready;

        expect(observed.length).toBeGreaterThan(0);
        const first = observed[0] as { v: number; k: string; o?: number; d?: unknown };
        expect(first.k).toBe('lh');
        expect(first.o).toBe(1);
        const wireHelloPayload = first.d as
          | { server: string; runtimeVersion: string; protocolVersion: number }
          | undefined;
        expect(wireHelloPayload?.server).toBe('kernel-runtime-worker');
        expect(typeof wireHelloPayload?.runtimeVersion).toBe('string');
        expect(wireHelloPayload?.runtimeVersion.length).toBeGreaterThan(0);
        expect(wireHelloPayload?.protocolVersion).toBe(1);
        const clientHelloPayload = client.hello.payload as
          | { server: string; runtimeVersion: string; protocolVersion: number }
          | undefined;
        expect(clientHelloPayload?.server).toBe('kernel-runtime-worker');
        expect(typeof clientHelloPayload?.runtimeVersion).toBe('string');
        expect(clientHelloPayload?.runtimeVersion.length).toBeGreaterThan(0);
        expect(clientHelloPayload?.protocolVersion).toBe(1);
      } finally {
        server.dispose('test');
        client.close('test');
        messageChannel.port1.close();
        messageChannel.port2.close();
      }
    });
  });

  describe('telemetry forwarding', () => {
    it('emits telemetry batches via the worker telemetry callback', async () => {
      let telemetryFn: ((entries: unknown[]) => void) | undefined;
      const setTelemetrySend = vi.fn((fn: (entries: unknown[]) => void): void => {
        telemetryFn = fn;
      }) as unknown as KernelWorker['setTelemetrySend'];
      const worker = createMockWorker({
        setTelemetrySend,
      });
      fixture = await buildFixture(worker);

      const seen: Array<{ entries: unknown[] }> = [];
      fixture.client.onNotify('telemetry', (args) => seen.push(args as { entries: unknown[] }));

      expect(setTelemetrySend).toHaveBeenCalledTimes(1);
      telemetryFn!([{ name: 't', startTime: 0, duration: 1, workerTimeOrigin: 0 }]);
      await flushMicrotasks();

      expect(seen).toHaveLength(1);
      expect(seen[0]!.entries).toHaveLength(1);
    });
  });
});
