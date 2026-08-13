/**
 * R3 — `nodeWorkerHost({ worker })` is load-bearing.
 *
 * Mirrors `web-worker-transport.host.test.ts` for the Node side: the
 * host owns `parentPort` acquisition from `node:worker_threads`, the
 * dispatcher wiring, and the crash trap. Consumers compose the worker
 * entry by importing `@taucad/runtime/worker/node` and never touch
 * `parentPort` directly.
 *
 * The test runs in the default Node vitest env (no jsdom) so we have a
 * real Worker scope. We use a `MessageChannel.port1` as a parentPort
 * stub (Node's `parentPort` is a `MessagePort` underneath) and inject
 * it via a transport-internal acquirer hook.
 */

import { MessageChannel } from 'node:worker_threads';
import { describe, it, expect, vi } from 'vitest';
import type { Geometry } from '@taucad/types';
import type { KernelWorker } from '#framework/kernel-worker.js';
import { nodeWorkerHost } from '#transport/node-worker-host.js';
import * as nodeParentPortModule from '#transport/_internal/node-parent-port.js';

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
    flushTelemetry: vi.fn(),
    setSignalBuffer: vi.fn(),
    setGeometryPoolBuffer: vi.fn(),
    setFilePoolBuffer: vi.fn(),
    handleWireAbort: vi.fn(),
    capabilitiesManifest: { routes: [], renderCapabilities: {} },
  };
  return base as unknown as KernelWorker;
};

describe('nodeWorkerHost — real port acquisition (R3)', () => {
  it('host() accepts a `worker` option and exposes the v6 fat-handle surface', () => {
    const channel = new MessageChannel();
    const acquireSpy = vi.spyOn(nodeParentPortModule, 'acquireNodeParentPort').mockReturnValue({
      postMessage: () => undefined,
      onMessage: () => () => undefined,
      close: () => undefined,
    });
    try {
      const worker = createMockKernelWorker();
      const host = nodeWorkerHost({ worker });

      expect(host.id).toBe('node-worker');
      expect(typeof host.open).toBe('function');
      expect(typeof host.adoptInitialize).toBe('function');
      expect(typeof host.encodeGeometry).toBe('function');
      expect(host.closed).toBeInstanceOf(Promise);
    } finally {
      acquireSpy.mockRestore();
      channel.port1.close();
      channel.port2.close();
    }
  });

  it('host.open() acquires the worker-side parent port and returns a real ChannelServerHandle', async () => {
    const onMessageCallbacks = new Set<(value: unknown) => void>();
    let acquireCallCount = 0;
    const acquireSpy = vi.spyOn(nodeParentPortModule, 'acquireNodeParentPort').mockImplementation(() => {
      acquireCallCount += 1;
      return {
        postMessage: () => undefined,
        onMessage: (handler) => {
          onMessageCallbacks.add(handler);
          return () => {
            onMessageCallbacks.delete(handler);
          };
        },
        close: () => {
          onMessageCallbacks.clear();
        },
      };
    });

    try {
      const worker = createMockKernelWorker();
      const host = nodeWorkerHost({ worker });
      const ready = await host.open();

      expect(acquireCallCount).toBe(1);
      expect(onMessageCallbacks.size).toBeGreaterThanOrEqual(1);
      expect(typeof ready.channel.notify).toBe('function');
      expect(typeof ready.channel.dispose).toBe('function');
      expect(ready.peerHello.transportId).toBe('node-worker');
      expect(ready.peerHello.server).toBe('kernel-runtime-worker');

      await host.close();
      expect(onMessageCallbacks.size).toBe(0);
    } finally {
      acquireSpy.mockRestore();
    }
  });

  it('throws a clear error when no `parentPort` is available (called outside a worker)', async () => {
    const acquireSpy = vi.spyOn(nodeParentPortModule, 'acquireNodeParentPort').mockImplementation(() => {
      throw new Error(
        'nodeWorkerHost(): `parentPort` unavailable — must be called from a `node:worker_threads.Worker`',
      );
    });
    try {
      const worker = createMockKernelWorker();
      const host = nodeWorkerHost({ worker });
      await expect(host.open()).rejects.toThrow(/parentPort.*unavailable/);
    } finally {
      acquireSpy.mockRestore();
    }
  });
});
