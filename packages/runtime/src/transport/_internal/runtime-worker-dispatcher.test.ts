/* eslint-disable @typescript-eslint/naming-convention -- file-system path keys (e.g. '/projects/proj/main.ts') are not camelCase identifiers. */
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
import { createWorkerDispatcher, runtimeChannelSessionKey } from '#transport/_internal/runtime-worker-dispatcher.js';
import type { KernelWorker } from '#framework/kernel-worker.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { CapabilitiesManifest } from '#types/runtime.types.js';
import type { GeometryEncoder } from '#transport/_internal/runtime-worker-dispatcher.js';
import type { EncodedGeometry } from '#transport/runtime-transport.types.js';

type DispatcherFixture = {
  client: Channel<RuntimeProtocol>;
  server: ChannelServerHandle<RuntimeProtocol>;
  serverPort: Port<unknown>;
  channel: MessageChannel;
};

type FixtureOptions = Parameters<typeof createWorkerDispatcher>[2];

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

function createMockWorker(overrides?: Partial<KernelWorker> & { geometryPool?: SharedPool }): KernelWorker {
  const { geometryPool, ...rest } = overrides ?? {};
  const base = {
    initialize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    render: vi.fn<() => Promise<{ success: true; data: unknown[] }>>().mockResolvedValue({ success: true, data: [] }),
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
    flushTelemetry: vi.fn(),
    setSignalBuffer: vi.fn(),
    setGeometryPoolBuffer: vi.fn(),
    setFilePoolBuffer: vi.fn(),
    handleWireAbort: vi.fn(),
    geometryPool: geometryPool ?? undefined,
    capabilitiesManifest: { routes: [], renderSchemas: {} },
    ...rest,
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
        routes: [
          {
            targetFormat: 'usdz',
            kernelId: 'replicad',
            sourceFormat: 'glb',
            transcoderId: 'converter',
            fidelity: 'mesh',
            schema: {},
            defaults: {},
          },
        ],
        renderSchemas: {},
      } as const satisfies CapabilitiesManifest;

      const worker = createMockWorker({ capabilitiesManifest: manifest });
      fixture = await buildFixture(worker);

      const result = await fixture.client.call('initialize', {});

      expect(result).toEqual({ capabilities: manifest });
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
      const worker = createMockWorker({
        exportGeometry: vi.fn().mockResolvedValue({
          success: true,
          data: [{ bytes: exportBytes, mimeType: 'model/stl' }],
          issues: [],
        }),
      });
      fixture = await buildFixture(worker);

      const result = await fixture.client.call('export', { format: 'stl' });

      expect(result).toMatchObject({ success: true });
      const data = (result as { data: Array<{ bytes: Uint8Array; mimeType: string }> }).data;
      // Export bytes are transferred — compare against an unrelated snapshot so the
      // detached source buffer doesn't blow up the structural equality check.
      expect(data[0]?.bytes).toEqual(expectedSnapshot);
      expect(data[0]?.mimeType).toBe('model/stl');
      expect(worker.flushTelemetry).toHaveBeenCalledOnce();
    });

    it('should settle `exportModel` with the worker request-scoped export result', async () => {
      const exportBytes = new Uint8Array([8, 7, 6]);
      const expectedSnapshot = new Uint8Array(exportBytes);
      const exportModel = vi.fn().mockResolvedValue({
        success: true,
        data: [{ bytes: exportBytes, mimeType: 'model/gltf-binary' }],
        issues: [],
      });
      const worker = createMockWorker({ exportModel });
      fixture = await buildFixture(worker);

      const result = await fixture.client.call('exportModel', {
        file: { path: '/', filename: 'main.ts' },
        parameters: { height: 10 },
        options: { quality: 'fine' },
        format: 'glb',
        exportOptions: { binary: true },
      });

      expect(exportModel).toHaveBeenCalledWith({
        file: { path: '/', filename: 'main.ts' },
        parameters: { height: 10 },
        options: { quality: 'fine' },
        format: 'glb',
        exportOptions: { binary: true },
      });
      expect(result).toMatchObject({ success: true });
      const data = (result as { data: Array<{ bytes: Uint8Array; mimeType: string }> }).data;
      expect(data[0]?.bytes).toEqual(expectedSnapshot);
      expect(data[0]?.mimeType).toBe('model/gltf-binary');
      expect(worker.flushTelemetry).toHaveBeenCalledOnce();
    });

    it('forwards memoryHandle SABs to the worker setters', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      const signalBuffer = new SharedArrayBuffer(8, { maxByteLength: 16 });
      const geometryBuffer = new SharedArrayBuffer(4096);
      const fileBuffer = new SharedArrayBuffer(8192);

      await fixture.client.call('initialize', {
        memoryHandle: {
          signalBuffer,
          geometryPoolBuffer: geometryBuffer,
          filePoolBuffer: fileBuffer,
        },
      });

      expect(worker.setSignalBuffer).toHaveBeenCalledTimes(1);
      expect(worker.setGeometryPoolBuffer).toHaveBeenCalledTimes(1);
      expect(worker.setFilePoolBuffer).toHaveBeenCalledTimes(1);
    });
  });

  describe('client → worker notifies', () => {
    it('routes `openFile` notify to worker.handleOpenFile', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      const file = { path: '/projects/proj', filename: 'main.ts' };
      fixture.client.notify('openFile', { file, parameters: { foo: 'bar' }, options: { coordinateSystem: 'z-up' } });
      await flushMicrotasks();

      expect(worker.handleOpenFile).toHaveBeenCalledWith(file, { foo: 'bar' }, { coordinateSystem: 'z-up' });
    });

    it('routes `stage-and-render` notify to worker.handleStageAndOpenFile', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      const stage = { '/projects/proj/main.ts': new Uint8Array([1, 2, 3]) };
      const file = { path: '/projects/proj', filename: 'main.ts' };
      fixture.client.notify('stage-and-render', { stage, file, parameters: { foo: 'bar' } });
      await flushMicrotasks();

      expect(worker.handleStageAndOpenFile).toHaveBeenCalledWith({
        stage,
        file,
        parameters: { foo: 'bar' },
        options: undefined,
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
        stage: { '/projects/proj/main.ts': new Uint8Array([1]) },
        file: { path: '/projects/proj', filename: 'main.ts' },
        parameters: {},
      });
      await flushMicrotasks();

      expect(errors).toHaveLength(1);
      expect(errors[0]!.issues[0]!.message).toContain('writeFile blew up');
    });

    it('routes `updateParameters`, `setOptions`, `fileChanged`, and `abort` notifies', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      fixture.client.notify('updateParameters', { parameters: { width: 10 } });
      fixture.client.notify('setOptions', { options: { density: 'high' } });
      fixture.client.notify('fileChanged', { paths: ['/a', '/b'] });
      fixture.client.notify('abort', { reason: 2 });
      await flushMicrotasks();

      expect(worker.handleUpdateParameters).toHaveBeenCalledWith({ width: 10 });
      expect(worker.handleSetOptions).toHaveBeenCalledWith({ density: 'high' });
      expect(worker.notifyFileChanged).toHaveBeenCalledWith(['/a', '/b']);
      expect(worker.handleWireAbort).toHaveBeenCalledWith(2);
    });

    it('routes `cleanup` notify to worker.cleanup', async () => {
      const worker = createMockWorker();
      fixture = await buildFixture(worker);

      fixture.client.notify('cleanup', undefined);
      await flushMicrotasks();

      expect(worker.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('autonomous worker → client notifies', () => {
    it('emits `geometryComputed` from worker.onGeometryComputed', async () => {
      const sab = new SharedArrayBuffer(256 * 1024);
      const pool = new SharedPool(sab, { maxEntries: 64 });
      const content = new Uint8Array([42]);

      let onGeometryComputed: ((result: unknown, rgen: number) => void) | undefined;
      const worker = createMockWorker();
      Object.defineProperty(worker, 'onGeometryComputed', {
        set(fn: (result: unknown, rgen: number) => void) {
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

      onGeometryComputed!(
        {
          success: true,
          data: [{ format: 'gltf', content, hash: 'auto-0' }],
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      expect(seen).toHaveLength(1);
      const result = seen[0]!.result as {
        data: Array<{ format: string; content: { delivery: string; key?: string } }>;
      };
      expect(result.data[0]!.format).toBe('gltf');
      expect(result.data[0]!.content.delivery).toBe('pooled');
      expect(result.data[0]!.content.key).toBe('auto-0');
    });

    it('emits `progress` and `parametersResolved` notifies with `rgen` from the autonomous worker callbacks', async () => {
      let onProgressUpdate: ((phase: string, rgen: number, detail?: unknown) => void) | undefined;
      let onParametersResolved: ((result: unknown, rgen: number) => void) | undefined;

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

      const phases: Array<{ phase: string; rgen: number }> = [];
      fixture.client.onNotify('progress', (args) => {
        phases.push(args as { phase: string; rgen: number });
      });
      const params: Array<{ result: unknown; rgen: number }> = [];
      fixture.client.onNotify('parametersResolved', (args) => {
        params.push(args as { result: unknown; rgen: number });
      });

      // Wire callbacks via initialize.
      await fixture.client.call('initialize', {});

      // Drive the autonomous-event surface as the kernel worker would for rgen=1.
      onParametersResolved!({ success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] }, 1);
      onProgressUpdate!('bundling', 1);
      onProgressUpdate!('computingGeometry', 1);
      await flushMicrotasks();

      expect(phases).toEqual([
        { phase: 'bundling', rgen: 1 },
        { phase: 'computingGeometry', rgen: 1 },
      ]);
      expect(params).toHaveLength(1);
      expect(params[0]!.rgen).toBe(1);
    });

    it('emits `stateChanged`, `activeKernelChanged`, and `capabilitiesUpdated`', async () => {
      let onStateChanged: ((state: string, detail?: string) => void) | undefined;
      let onActiveKernelChanged: ((id: string | undefined) => void) | undefined;
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

      const state: Array<{ state: string }> = [];
      const kernels: Array<{ kernelId: string | undefined }> = [];
      const caps: Array<{ capabilities: unknown }> = [];
      fixture.client.onNotify('stateChanged', (args) => state.push(args as { state: string }));
      fixture.client.onNotify('activeKernelChanged', (args) => kernels.push(args as { kernelId: string | undefined }));
      fixture.client.onNotify('capabilitiesUpdated', (args) => caps.push(args as { capabilities: unknown }));

      await fixture.client.call('initialize', {});

      onStateChanged!('rendering');
      onActiveKernelChanged!('replicad');
      onCapabilitiesUpdated!({ routes: [], renderSchemas: {} });
      await flushMicrotasks();

      expect(state).toEqual([{ state: 'rendering' }]);
      expect(kernels).toEqual([{ kernelId: 'replicad' }]);
      expect(caps).toEqual([{ capabilities: { routes: [], renderSchemas: {} } }]);
    });

    it('emits `errorEvent` from worker.onError', async () => {
      let onError: ((issues: unknown[]) => void) | undefined;

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

      onError!([{ message: 'boom', code: 'KERNEL', type: 'kernel', severity: 'error' }]);
      await flushMicrotasks();

      expect(seen).toEqual([{ issues: [{ message: 'boom', code: 'UNKNOWN', type: 'kernel', severity: 'error' }] }]);
    });
  });

  describe('geometry transport types', () => {
    type GeometryComputedListener = (args: { result: unknown; rgen: number }) => void;
    type GeometryComputedFn = (result: unknown, rgen: number) => void;

    /**
     * Build a fixture wired to capture `geometryComputed` notify args
     * and expose the worker's `onGeometryComputed` setter so each test
     * can synthesise the result the kernel would emit autonomously.
     *
     * `encoder` injects the wire-tier choice (pool / transfer / copy)
     * the dispatcher should apply.
     */
    async function buildGeometryFixture(encoder?: GeometryEncoder): Promise<{
      seen: Array<{ result: unknown; rgen: number }>;
      emit: GeometryComputedFn;
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

      const seen: Array<{ result: unknown; rgen: number }> = [];
      const listener: GeometryComputedListener = (args) => {
        seen.push(args);
      };
      fixture.client.onNotify('geometryComputed', listener);

      await fixture.client.call('initialize', {});

      return {
        seen,
        emit: (result, rgen) => {
          onGeometryComputed!(result, rgen);
        },
      };
    }

    function makePoolEncoder(pool: SharedPool, allowTransferFallback = false): GeometryEncoder {
      return (geometry): EncodedGeometry => {
        if (geometry.format !== 'gltf') return { value: geometry, transferables: [], tier: 'copy' };
        try {
          if (!pool.has(geometry.hash)) pool.store(geometry.hash, geometry.content);
          if (pool.has(geometry.hash)) {
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
          data: [{ format: 'gltf', content, hash: 'dep-hash-0' }],
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      expect(pool.has('dep-hash-0')).toBe(true);
      const stored = pool.resolveCopy('dep-hash-0');
      expect(stored).toEqual(expectedSnapshot);

      expect(seen).toHaveLength(1);
      expect(seen[0]!.rgen).toBe(1);
      const data = (seen[0]!.result as { data: Array<{ content: { delivery: string; key?: string } }> }).data;
      expect(data[0]!.content.delivery).toBe('pooled');
      expect(data[0]!.content.key).toBe('dep-hash-0');
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
          data: [{ format: 'gltf', content, hash: 'oversized-0' }],
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      const data = (
        seen[0]!.result as {
          data: Array<{ format: string; content: { delivery: string; bytes?: Uint8Array } }>;
        }
      ).data;
      expect(data[0]!.content.delivery).toBe('inline');
      // Source `content` was transferred (detached) by the dispatcher; compare
      // the receiver-side bytes against an unrelated snapshot of the original.
      expect(data[0]!.content.bytes).toEqual(expectedSnapshot);
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
          data: [{ format: 'gltf', content, hash: 'pre-stored-0' }],
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
          data: [{ format: 'gltf', content, hash: 'h1' }],
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      const data = (
        seen[0]!.result as {
          data: Array<{ format: string; content: { delivery: string; bytes?: Uint8Array } }>;
        }
      ).data;
      expect(data[0]!.content.delivery).toBe('inline');
      expect(data[0]!.content.bytes).toEqual(expectedSnapshot);
    });

    it('passes SVG geometries through unchanged', async () => {
      const { seen, emit } = await buildGeometryFixture();

      emit(
        {
          success: true,
          data: [
            {
              format: 'svg',
              paths: ['M0 0'],
              viewbox: '0 0 100 100',
              name: 'test',
              hash: 'svg-hash',
            },
          ],
          issues: [],
        },
        1,
      );
      await flushMicrotasks();

      const data = (seen[0]!.result as { data: Array<{ format: string; paths: string[] }> }).data;
      expect(data[0]!.format).toBe('svg');
      expect(data[0]!.paths).toEqual(['M0 0']);
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
      let onError: ((issues: unknown[], rgen?: number) => void) | undefined;
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

      const seen: Array<{ issues: ReadonlyArray<{ message: string }>; rgen?: number }> = [];
      fixture.client.onNotify('errorEvent', (args) => {
        seen.push(args);
      });

      await fixture.client.call('initialize', {});

      onError!([{ message: 'WASM worker crash', code: 'KERNEL', type: 'kernel', severity: 'error' }], 7);
      await flushMicrotasks();

      expect(seen).toHaveLength(1);
      expect(seen[0]!.issues[0]!.message).toBe('WASM worker crash');
      expect(seen[0]!.issues[0]).toMatchObject({ code: 'UNKNOWN' });
      expect(seen[0]!.rgen).toBe(7);
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
        const wireHelloPayload = first.d as { server: string; runtimeVersion: string } | undefined;
        expect(wireHelloPayload?.server).toBe('kernel-runtime-worker');
        expect(typeof wireHelloPayload?.runtimeVersion).toBe('string');
        expect(wireHelloPayload?.runtimeVersion.length).toBeGreaterThan(0);
        const clientHelloPayload = client.hello.payload as { server: string; runtimeVersion: string } | undefined;
        expect(clientHelloPayload?.server).toBe('kernel-runtime-worker');
        expect(typeof clientHelloPayload?.runtimeVersion).toBe('string');
        expect(clientHelloPayload?.runtimeVersion.length).toBeGreaterThan(0);
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
