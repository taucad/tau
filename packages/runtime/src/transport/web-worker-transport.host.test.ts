// @vitest-environment jsdom
/**
 * R3 — `webWorkerHost({ worker })` is load-bearing.
 *
 * In v6 the host side of a worker transport owns the worker-side
 * `MessagePort` acquisition, the dispatcher wiring, and the crash
 * trap. The legacy split (worker entry IIFE → `getWorkerMessagePort`
 * → `bootstrapKernelRuntimeWorker`) is gone; consumers compose the
 * worker entry by importing `webWorkerHost` directly from their
 * per-environment subpath module (e.g. `@taucad/runtime/worker/web`).
 *
 * Asserts the real surface contract:
 *
 * 1. `host()` accepts a `worker: KernelWorker` option.
 * 2. `host.open()` returns a `ChannelServerHandle` whose `notify` is a
 *    real callable (not the no-op stub from
 *    `createNoopChannelServerHandle`).
 * 3. The acquired port subscribes to `message` events on `self`,
 *    proving the dispatcher is wired to the actual worker wire.
 * 4. `host.close()` disposes the channel and resolves `closed`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Geometry } from '@taucad/types';
import type { KernelWorker } from '#framework/kernel-worker.js';
import { webWorkerHost } from '#transport/web-worker-host.js';

type Listener = (event: { data: unknown }) => void;
const testGeometry = { format: 'gltf', content: new Uint8Array([1]), hash: 'mock' } satisfies Geometry;

const createMockKernelWorker = (): KernelWorker => {
  const base = {
    initialize: vi.fn().mockResolvedValue(undefined),
    render: vi.fn().mockResolvedValue({ success: true, data: testGeometry, issues: [] }),
    exportGeometry: vi.fn().mockResolvedValue({
      success: true,
      data: [
        { name: 'model.gltf', mimeType: 'model/gltf+json', bytes: new Uint8Array([1]) },
        { name: 'model.bin', mimeType: 'application/octet-stream', bytes: new Uint8Array([2]) },
      ],
      issues: [],
    }),
    cleanup: vi.fn().mockResolvedValue(undefined),
    notifyFileChanged: vi.fn().mockResolvedValue(undefined),
    handleOpenFile: vi.fn(),
    handleStageAndOpenFile: vi.fn().mockResolvedValue(undefined),
    handleUpdateParameters: vi.fn(),
    handleSetOptions: vi.fn(),
    ensureLoadedBundler: vi.fn().mockResolvedValue(undefined),
    setTelemetrySend: vi.fn(),
    setDevtoolsTelemetryEnabled: vi.fn(),
    setCompiledWasmModules: vi.fn(),
    flushTelemetry: vi.fn(),
    setSignalBuffer: vi.fn(),
    handleWireAbort: vi.fn(),
    capabilitiesManifest: { routes: [], renderCapabilities: {} },
  };
  return base as unknown as KernelWorker;
};

describe('webWorkerHost — real port acquisition (R3)', () => {
  const messageListeners = new Set<Listener>();
  const postedMessages: Array<{ data: unknown; transfer?: readonly Transferable[] }> = [];

  beforeEach(() => {
    messageListeners.clear();
    postedMessages.length = 0;

    const postMessageSpy = vi.spyOn(globalThis as unknown as Window, 'postMessage');
    postMessageSpy.mockImplementation(((
      data: unknown,
      options?: { transfer?: Transferable[] } | readonly Transferable[],
    ) => {
      const transfer = Array.isArray(options)
        ? options
        : (options as { transfer?: Transferable[] } | undefined)?.transfer;
      postedMessages.push({ data, transfer });
    }) as unknown as Window['postMessage']);

    const addSpy = vi.spyOn(globalThis, 'addEventListener');
    addSpy.mockImplementation(((type: string, listener: EventListener) => {
      if (type === 'message') {
        messageListeners.add(listener as unknown as Listener);
      }
    }) as unknown as typeof globalThis.addEventListener);

    const removeSpy = vi.spyOn(globalThis, 'removeEventListener');
    removeSpy.mockImplementation(((type: string, listener: EventListener) => {
      if (type === 'message') {
        messageListeners.delete(listener as unknown as Listener);
      }
    }) as unknown as typeof globalThis.removeEventListener);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('host() accepts a `worker` option and exposes the v6 fat-handle surface', () => {
    const worker = createMockKernelWorker();
    const host = webWorkerHost({ worker });

    expect(host.id).toBe('web-worker');
    expect(typeof host.open).toBe('function');
    expect(typeof host.adoptInitialize).toBe('function');
    expect(typeof host.encodeGeometry).toBe('function');
    expect(host.closed).toBeInstanceOf(Promise);
  });

  it('host.open() acquires the worker-side port and returns a real ChannelServerHandle', async () => {
    const worker = createMockKernelWorker();
    const host = webWorkerHost({ worker });

    const ready = await host.open();

    // Real channel — must subscribe to `message` on the global self port,
    // proving acquisition of the worker's actual wire (not the noop stub
    // which would never touch addEventListener).
    expect(messageListeners.size).toBeGreaterThanOrEqual(1);

    // ChannelServerHandle surface — `notify` is callable, `dispose`
    // closes the channel, `closed` resolves on dispose.
    expect(typeof ready.channel.notify).toBe('function');
    expect(typeof ready.channel.dispose).toBe('function');
    expect(ready.channel.closed).toBeInstanceOf(Promise);

    // Hello payload identifies the runtime worker and carries the transport id.
    expect(ready.peerHello.server).toBe('kernel-runtime-worker');
    expect(ready.peerHello.transportId).toBe('web-worker');

    await host.close();
  });

  it('host.close() resolves the closed promise and removes message listeners', async () => {
    const worker = createMockKernelWorker();
    const host = webWorkerHost({ worker });
    await host.open();

    let closedFlag = false;
    const watcher = (async (): Promise<void> => {
      await host.closed;
      closedFlag = true;
    })();

    await host.close();
    await watcher;

    expect(closedFlag).toBe(true);
    expect(messageListeners.size).toBe(0);
  });
});
