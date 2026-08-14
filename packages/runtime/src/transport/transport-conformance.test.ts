/* eslint-disable @typescript-eslint/naming-convention -- Transport descriptors intentionally use protocol-shaped keys. */
/**
 * Conformance test C2 — bundled transports satisfy the canonical
 * fat {@link RuntimeTransportClient} / {@link RuntimeTransportHost}
 * contract from `docs/research/runtime-transport-architecture-v6.md`.
 *
 * Plugin surface assertions: `id`, `describe()`, `materialize()`.
 *
 * Materialised {@link RuntimeTransportClient} assertions: same as legacy
 * client surface (`open()`, `initialize`, …).
 *
 * Host surface assertions via standalone factories {@link webWorkerHost} /
 * {@link nodeWorkerHost}: `id`, `open()`, `adoptInitialize(handle)`,
 * `encodeGeometry(g)`, `close()`, `closed` Promise.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';

import { createChannelServer, wrapMessagePort } from '@taucad/rpc';
import type { Channel, Port } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';

import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { createRuntimeClientWithTransport } from '#client/runtime-client-core.js';
import type { KernelWorker } from '#framework/kernel-worker.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { nodeWorkerHost } from '#transport/node-worker-host.js';
import type { WebWorkerTransportOptions } from '#transport/web-worker-client.js';
import { webWorkerHost } from '#transport/web-worker-host.js';
import { triggerRenderTimeout } from '#transport/_internal/abort-channel.js';
import { buildHelloPayload } from '#transport/_internal/transport-hello.js';
import { runtimeChannelSessionKey } from '#transport/_internal/runtime-worker-dispatcher.js';
import type { RuntimeTransportClient } from '#transport/runtime-transport.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const testGeometry = { format: 'gltf', content: new Uint8Array([1]), hash: 'mock' } satisfies Geometry;
const unsupportedSameIsolateTimeoutMessage =
  'renderTimeout must be 0 because this transport cannot enforce a wall-clock render deadline. Use a worker-backed transport with terminable timeout recovery.';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Surface stub for `KernelWorker` — only used to satisfy host typing in conformance assertions. */
const makeStubKernelWorker = (): KernelWorker => {
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
    handleWireAbort: vi.fn(),
    capabilitiesManifest: { routes: [], renderCapabilities: {} },
  };
  return base as unknown as KernelWorker;
};

/* ============================================================ *
 * In-process slice                                               *
 * ============================================================ */

describe('transport conformance — in-process (C2)', () => {
  const runtime = defineRuntime({});

  it('callable exposes TransportPlugin surface with literal id', () => {
    expect(typeof inProcessTransport).toBe('function');
    const plugin = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
    expect(plugin.id).toBe('in-process');
    expect(typeof plugin.describe).toBe('function');
    expect(typeof plugin.materialize).toBe('function');
  });

  it('materialise() returns the v6 fat client handle surface', () => {
    const mainEntry = '/main.ts';
    const plugin = inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ [mainEntry]: 'export default () => true;' }),
    });
    const client = plugin.materialize();
    expect(client.id).toBe('in-process');
    expect(typeof client.describe).toBe('function');
    expect(typeof client.open).toBe('function');
    expect(typeof client.initialize).toBe('function');
    expect(typeof client.reservePreview).toBe('function');
    expect(client.renderTimeoutRecovery.kind).toBe('unsupported');
    expect(typeof client.resolveGeometry).toBe('function');
    expect(typeof client.close).toBe('function');
    expect(client.closed).toBeInstanceOf(Promise);
    void plugin;
  });

  it('describe() advertises in-isolate FS, pool delivery, and SAB abort', () => {
    const plugin = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
    const descriptor = plugin.describe();
    expect(descriptor.id).toBe('in-process');
    expect(descriptor.wire).toBe('in-process');
    expect(descriptor.fileSystem).toBe('inline');
    expect(descriptor.memory.geometryDelivery).toBe('pool');
    expect(descriptor.memory.abortSignal).toBe('sab-atomics');
  });

  it('materialised client.open() resolves a typed channel + hello frame', async () => {
    const plugin = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
    const client = plugin.materialize();
    const ready = await client.open();
    expect(ready.channel).toBeDefined();
    expect(typeof ready.channel.call).toBe('function');
    expect(typeof ready.channel.notify).toBe('function');
    expect(ready.hello.server).toBe('kernel-runtime-worker');
    expect(ready.hello.transportId).toBe('in-process');
    expect(typeof ready.hello.runtimeVersion).toBe('string');
    await client.close();
    await client.closed;
  });

  it('client.open() is idempotent (second call resolves the same channel)', async () => {
    const client = inProcessTransport({ runtime, fileSystem: fromMemoryFs() }).materialize();
    const a = await client.open();
    const b = await client.open();
    expect(b.channel).toBe(a.channel);
    await client.close();
  });

  it('client.close() resolves the closed Promise', async () => {
    const client = inProcessTransport({ runtime, fileSystem: fromMemoryFs() }).materialize();
    await client.open();
    let resolved = false;
    const waiter = (async (): Promise<void> => {
      await client.closed;
      resolved = true;
    })();
    await client.close();
    await waiter;
    expect(resolved).toBe(true);
  });

  it.each([
    ['with SharedArrayBuffer', true],
    ['without SharedArrayBuffer', false],
  ] as const)(
    'rejects non-zero wall-clock timeout at construction and connected setter %s',
    async (_label, sharedArrayBufferAvailable) => {
      if (!sharedArrayBufferAvailable) {
        vi.stubGlobal('SharedArrayBuffer', undefined);
      }
      const makeTransport = () => inProcessTransport({ runtime, fileSystem: fromMemoryFs() });

      expect(() =>
        createRuntimeClientWithTransport({
          transport: makeTransport(),
          renderTimeout: 1,
        }),
      ).toThrow(new TypeError(unsupportedSameIsolateTimeoutMessage));

      const client = createRuntimeClientWithTransport({ transport: makeTransport() });
      await client.connect();
      expect(() => {
        client.setRenderTimeout(1);
      }).toThrow(new TypeError(unsupportedSameIsolateTimeoutMessage));
      client.terminate();
    },
  );

  /* R3 — in-process passthrough transports do not synthesise `.host()`
   * on the consumer callable — same-isolate authors use {@link inProcessClient}
   * only; standalone host transports are sibling modules for worker kernels. */

  /* S9: bundled transports wire `runtimeProtocolSchemas` by default at
   * both wire boundaries (client and dispatcher server), so a malformed
   * call frame is rejected at the channel layer with a typed
   * `WireValidationError` rather than reaching the kernel impl. */
  it('rejects malformed call args with a WireValidationError at the wire boundary', async () => {
    const client = inProcessTransport({ runtime, fileSystem: fromMemoryFs() }).materialize();
    try {
      const ready = await client.open();
      await ready.channel.ready;
      /* `export` requires `format: FileExtension` (strict object); an
       * empty payload triggers server-side validation before the impl
       * runs. */
      await expect(
        // Validation test intentionally passes an invalid payload (missing `format`)
        ready.channel.call(
          'export',
          // oxlint-disable-next-line ban-ts-comment -- invalid payload exercises wire-validation path before impl runs
          // @ts-expect-error Intentionally invalid export args — wire rejects before impl
          {},
        ),
      ).rejects.toThrow(/wire validation failed for server-call-args 'export'/);
    } finally {
      await client.close();
    }
  });
});

/* ============================================================ *
 * Web-worker slice                                               *
 * ============================================================ */

describe('transport conformance — web-worker (C2)', () => {
  it('callable exposes paired plugin + standalone host factories', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    expect(typeof webWorkerTransport).toBe('function');
    const { workerCtor, dispose } = makeFakeWorkerCtor();
    try {
      const plugin = webWorkerTransport({ url: 'about:blank', workerCtor });
      expect(plugin.id).toBe('web-worker');
      expect(typeof webWorkerHost).toBe('function');
    } finally {
      dispose();
    }
  });

  it('createWebWorkerClientOptions() builds client options with an empty memory filesystem by default', async () => {
    const { createWebWorkerClientOptions } = await import('#transport/web.js');
    const { workerCtor, dispose } = makeFakeWorkerCtor();
    try {
      const options = createWebWorkerClientOptions({
        url: 'about:blank',
        workerCtor,
      });

      expect(options.transport.describe().fileSystem).toBe('inline');
    } finally {
      dispose();
    }
  });

  it('createWebWorkerClientOptions() builds client options with seeded memory filesystem', async () => {
    const { createWebWorkerClientOptions } = await import('#transport/web.js');
    const { workerCtor, dispose } = makeFakeWorkerCtor();
    try {
      const options = createWebWorkerClientOptions({
        url: 'about:blank',
        workerCtor,
        files: { '/main.ts': 'export default () => true;' },
        renderTimeout: 4567,
      });

      expect(options.renderTimeout).toBe(4567);
      expect(options.transport.id).toBe('web-worker');
      const description = options.transport.describe();
      expect(description.fileSystem).toBe('inline');
      expect(description.wire).toBe('web-worker');
      expect(typeof description.memory.geometryDelivery).toBe('string');
    } finally {
      dispose();
    }
  });

  it('createWebWorkerClientOptions() rejects ambiguous filesystem inputs', async () => {
    const { createWebWorkerClientOptions } = await import('#transport/web.js');
    const createWorker = (): never => {
      throw new Error('createWorker should not be called for invalid filesystem inputs');
    };

    expect(() =>
      createWebWorkerClientOptions({
        createWorker,
        files: { '/main.ts': 'export default () => true;' },
        fileSystem: fromMemoryFs(),
      }),
    ).toThrow(/either `files` or `fileSystem`/);
  });

  it('materialise() returns the v6 fat client handle surface', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    const { workerCtor, dispose } = makeFakeWorkerCtor();
    try {
      const client = webWorkerTransport({ url: 'about:blank', workerCtor }).materialize();
      expect(client.id).toBe('web-worker');
      expect(typeof client.describe).toBe('function');
      expect(typeof client.open).toBe('function');
      expect(typeof client.initialize).toBe('function');
      expect(typeof client.reservePreview).toBe('function');
      expect(client.renderTimeoutRecovery.kind).toBe('terminable');
      expect(typeof client.resolveGeometry).toBe('function');
      expect(typeof client.close).toBe('function');
      expect(client.closed).toBeInstanceOf(Promise);
    } finally {
      dispose();
    }
  });

  it('describe() declares SAB tier when sharedMemory.geometry is supplied', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    const { workerCtor, dispose } = makeFakeWorkerCtor();
    try {
      const plugin = webWorkerTransport({
        url: 'about:blank',
        workerCtor,
        sharedMemory: { geometry: { bytes: 256 * 1024 } },
        fileSystem: fromMemoryFs(),
      });
      const d = plugin.describe();
      expect(d.id).toBe('web-worker');
      expect(d.wire).toBe('web-worker');
      expect(d.memory.geometryDelivery).toBe('pool');
      expect(['sab-atomics', 'wire-notify']).toContain(d.memory.abortSignal);
      expect(d.fileSystem).toBe('inline');
    } finally {
      dispose();
    }
  });

  it('describe() degrades to transferables when no SAB pool is supplied', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    const { workerCtor, dispose } = makeFakeWorkerCtor();
    try {
      const plugin = webWorkerTransport({ url: 'about:blank', workerCtor });
      const d = plugin.describe();
      expect(d.memory.geometryDelivery).toBe('transfer');
      expect(d.fileSystem).toBe('unbound');
    } finally {
      dispose();
    }
  });

  it('open() instantiates the worker via the supplied ctor and returns a channel', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    const fake = makeFakeWorkerCtor();
    try {
      const client = webWorkerTransport({
        url: 'about:blank',
        workerCtor: fake.workerCtor,
      }).materialize();
      const ready = await client.open();
      expect(fake.created).toHaveLength(1);
      expect(typeof ready.channel.call).toBe('function');
      expect(typeof ready.channel.notify).toBe('function');
      expect(ready.hello.transportId).toBe('web-worker');
      await client.close();
    } finally {
      fake.dispose();
    }
  });

  it('throws on a forged RuntimeFileSystem (must come from a fromX factory)', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    const { workerCtor, dispose } = makeFakeWorkerCtor();
    try {
      expect(() =>
        webWorkerTransport({
          url: 'about:blank',
          workerCtor,
          // @ts-expect-error Intentionally malformed `fileSystem` (must come from a `fromX` factory).
          fileSystem: { kind: 'inline' },
        }).materialize(),
      ).toThrow(/fromX. factory/);
    } finally {
      dispose();
    }
  });

  it('throws a clear error when no Worker constructor is available', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    expect(() => webWorkerTransport({ url: 'about:blank' }).materialize()).toThrow(/Worker.*constructor/);
  });

  it('requires `createWorker` or an explicit worker `url`', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    const fake = makeFakeWorkerCtor();
    try {
      const options = { workerCtor: fake.workerCtor } as unknown as WebWorkerTransportOptions;
      const client = webWorkerTransport(options).materialize();
      await expect(client.open()).rejects.toThrow(/createWorker.*worker `url`/);
      expect(fake.urls).toEqual([]);
      await client.close();
    } finally {
      fake.dispose();
    }
  });

  it('honours an explicit `url` override over the default', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    const fake = makeFakeWorkerCtor();
    try {
      const client = webWorkerTransport({
        url: 'about:blank',
        workerCtor: fake.workerCtor,
      }).materialize();
      await client.open();
      expect(fake.urls).toEqual(['about:blank']);
      await client.close();
    } finally {
      fake.dispose();
    }
  });

  it('honours app-owned createWorker over URL construction', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    const fake = makeFakeWorkerCtor();
    try {
      const client = webWorkerTransport({
        url: 'about:blank',
        workerCtor: fake.workerCtor,
        createWorker: () =>
          Reflect.construct(fake.workerCtor, ['app-owned-worker.js', { type: 'module' }]) as unknown as FakeWorker,
      }).materialize();
      await client.open();
      expect(fake.urls).toEqual(['app-owned-worker.js']);
      expect(fake.created).toHaveLength(1);
      await client.close();
    } finally {
      fake.dispose();
    }
  });

  it.each([
    ['SAB signalling', true],
    ['wire signalling', false],
  ] as const)(
    'timeout recovery terminates the Web Worker once and settles typed closed with %s',
    async (_label, useSab) => {
      if (!useSab) {
        vi.stubGlobal('SharedArrayBuffer', undefined);
      }
      const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
      const fake = makeFakeWorkerCtor();
      try {
        const client = webWorkerTransport({ url: 'about:blank', workerCtor: fake.workerCtor }).materialize();
        await client.open();
        const recovery = client.renderTimeoutRecovery;
        expect(recovery.kind).toBe('terminable');
        if (recovery.kind !== 'terminable') {
          throw new TypeError('Expected terminable Web Worker recovery');
        }

        await recovery.terminate();
        await client.close();

        await expect(client.closed).resolves.toEqual({ cause: 'render-timeout' });
        expect(fake.terminateCalls()).toBe(1);
      } finally {
        fake.dispose();
      }
    },
  );

  it('settles a native Web Worker failure as wire-failure and terminates once', async () => {
    const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
    const fake = makeFakeWorkerCtor();
    try {
      const client = webWorkerTransport({ url: 'about:blank', workerCtor: fake.workerCtor }).materialize();
      await client.open();
      const failure = new Error('worker crashed');

      fake.emit('error', { error: failure });

      await expect(client.closed).resolves.toEqual({ cause: 'wire-failure', error: failure });
      expect(fake.terminateCalls()).toBe(1);
    } finally {
      fake.dispose();
    }
  });

  it('webWorkerHost() returns the v6 fat handle surface', async () => {
    const host = webWorkerHost({ worker: makeStubKernelWorker() });
    expect(host.id).toBe('web-worker');
    expect(typeof host.open).toBe('function');
    expect(typeof host.adoptInitialize).toBe('function');
    expect(typeof host.encodeGeometry).toBe('function');
    expect(host.closed).toBeInstanceOf(Promise);
  });
});

/* ============================================================ *
 * Node-worker slice                                              *
 * ============================================================ */

describe('transport conformance — node-worker (C2)', () => {
  it('callable exposes paired plugin + standalone host factories', async () => {
    const { nodeWorkerTransport } = await import('#transport/node-worker-transport.js');
    expect(typeof nodeWorkerTransport).toBe('function');
    const fake = makeFakeNodeWorkerCtor();
    try {
      const plugin = nodeWorkerTransport({
        url: new URL('about:blank'),
        workerCtor: fake.workerCtor,
      });
      expect(plugin.id).toBe('node-worker');
      expect(typeof nodeWorkerHost).toBe('function');
    } finally {
      fake.dispose();
    }
  });

  it('materialise() returns the v6 fat client handle surface', async () => {
    const { nodeWorkerTransport } = await import('#transport/node-worker-transport.js');
    const fake = makeFakeNodeWorkerCtor();
    try {
      const client = nodeWorkerTransport({
        url: new URL('about:blank'),
        workerCtor: fake.workerCtor,
      }).materialize();
      expect(client.id).toBe('node-worker');
      expect(typeof client.describe).toBe('function');
      expect(typeof client.open).toBe('function');
      expect(typeof client.initialize).toBe('function');
      expect(typeof client.reservePreview).toBe('function');
      expect(client.renderTimeoutRecovery.kind).toBe('terminable');
      expect(typeof client.resolveGeometry).toBe('function');
      expect(typeof client.close).toBe('function');
      expect(client.closed).toBeInstanceOf(Promise);
    } finally {
      fake.dispose();
    }
  });

  it('describe() declares SAB tier when sharedMemory.geometry is supplied', async () => {
    const { nodeWorkerTransport } = await import('#transport/node-worker-transport.js');
    const fake = makeFakeNodeWorkerCtor();
    try {
      const plugin = nodeWorkerTransport({
        url: new URL('about:blank'),
        workerCtor: fake.workerCtor,
        sharedMemory: { geometry: { bytes: 256 * 1024 } },
        fileSystem: fromMemoryFs(),
      });
      const d = plugin.describe();
      expect(d.id).toBe('node-worker');
      expect(d.wire).toBe('node-worker');
      expect(d.memory.geometryDelivery).toBe('pool');
      expect(['sab-atomics', 'wire-notify']).toContain(d.memory.abortSignal);
      expect(d.fileSystem).toBe('inline');
    } finally {
      fake.dispose();
    }
  });

  it('open() instantiates the worker via the supplied ctor and returns a channel', async () => {
    const { nodeWorkerTransport } = await import('#transport/node-worker-transport.js');
    const fake = makeFakeNodeWorkerCtor();
    try {
      const client = nodeWorkerTransport({
        url: new URL('about:blank'),
        workerCtor: fake.workerCtor,
      }).materialize();
      const ready = await client.open();
      expect(fake.created).toHaveLength(1);
      expect(typeof ready.channel.call).toBe('function');
      expect(ready.hello.transportId).toBe('node-worker');
      await client.close();
    } finally {
      fake.dispose();
    }
  });

  it('throws on a forged RuntimeFileSystem (must come from a fromX factory)', async () => {
    const { nodeWorkerTransport } = await import('#transport/node-worker-transport.js');
    const fake = makeFakeNodeWorkerCtor();
    try {
      expect(() =>
        nodeWorkerTransport({
          url: new URL('about:blank'),
          workerCtor: fake.workerCtor,
          // @ts-expect-error Intentionally malformed `fileSystem` (must come from a `fromX` factory).
          fileSystem: { kind: 'inline' },
        }).materialize(),
      ).toThrow(/fromX. factory/);
    } finally {
      fake.dispose();
    }
  });

  it('passes the consumer-owned URL to the Node Worker unchanged', async () => {
    const { nodeWorkerTransport } = await import('#transport/node-worker-transport.js');
    const fake = makeFakeNodeWorkerCtor();
    try {
      const url = new URL('file:///tmp/custom-runtime.worker.js');
      const client = nodeWorkerTransport({ url, workerCtor: fake.workerCtor }).materialize();
      await client.open();
      expect(fake.urls).toEqual([url]);
      await client.close();
    } finally {
      fake.dispose();
    }
  });

  it.each([
    ['SAB signalling', true],
    ['wire signalling', false],
  ] as const)(
    'timeout recovery terminates the Node Worker once and settles typed closed with %s',
    async (_label, useSab) => {
      if (!useSab) {
        vi.stubGlobal('SharedArrayBuffer', undefined);
      }
      const { nodeWorkerTransport } = await import('#transport/node-worker-transport.js');
      const fake = makeFakeNodeWorkerCtor();
      try {
        const client = nodeWorkerTransport({
          url: new URL('about:blank'),
          workerCtor: fake.workerCtor,
        }).materialize();
        await client.open();
        const recovery = client.renderTimeoutRecovery;
        expect(recovery.kind).toBe('terminable');
        if (recovery.kind !== 'terminable') {
          throw new TypeError('Expected terminable Node Worker recovery');
        }

        await recovery.terminate();
        await client.close();

        await expect(client.closed).resolves.toEqual({ cause: 'render-timeout' });
        expect(fake.terminateCalls()).toBe(1);
      } finally {
        fake.dispose();
      }
    },
  );

  it('settles a native Node Worker exit as host-exit and terminates once', async () => {
    const { nodeWorkerTransport } = await import('#transport/node-worker-transport.js');
    const fake = makeFakeNodeWorkerCtor();
    try {
      const client = nodeWorkerTransport({
        url: new URL('about:blank'),
        workerCtor: fake.workerCtor,
      }).materialize();
      await client.open();

      fake.emit('exit', 17);

      await expect(client.closed).resolves.toEqual({ cause: 'host-exit', exitCode: 17 });
      expect(fake.terminateCalls()).toBe(1);
    } finally {
      fake.dispose();
    }
  });

  it('nodeWorkerHost() returns the v6 fat handle surface', async () => {
    const host = nodeWorkerHost({ worker: makeStubKernelWorker() });
    expect(host.id).toBe('node-worker');
    expect(typeof host.open).toBe('function');
    expect(typeof host.adoptInitialize).toBe('function');
    expect(typeof host.encodeGeometry).toBe('function');
    expect(host.closed).toBeInstanceOf(Promise);
  });
});

/* ============================================================ *
 * Shared transport internals slice (T37)                         *
 * ============================================================ */

describe('transport conformance — shared transport internals (T37)', () => {
  const renderId = '550e8400-e29b-41d4-a716-446655440000';

  /** The abort frame the shared helper would emit for `target` — the byte-for-byte reference. */
  const sharedAbortFrame = (target: { renderId: string; abortGeneration?: number }): [string, unknown] => {
    const notify = vi.fn();
    triggerRenderTimeout({ notify } as unknown as Channel<RuntimeProtocol>, undefined, target);
    return notify.mock.calls[0] as [string, unknown];
  };

  /**
   * Far end of a real `MessageChannel` running an rpc server, so the client
   * completes its handshake and actually flushes queued notify frames.
   */
  const wireBackedPeer = (): {
    port: MessagePort;
    firstNotify: Promise<[string, unknown]>;
    dispose: () => void;
  } => {
    const pair = new MessageChannel();
    const received = Promise.withResolvers<[string, unknown]>();
    const server = createChannelServer<RuntimeProtocol>({
      port: wrapMessagePort<unknown>(pair.port2, { label: 't37:peer' }),
      sessionKey: runtimeChannelSessionKey,
      impl: {
        async call() {
          throw new Error('T37 conformance issues no calls');
        },
        notify(_context, name, args) {
          received.resolve([name, args]);
        },
        listen: () => {
          throw new Error('T37 conformance subscribes to nothing');
        },
      },
    });
    return {
      port: pair.port1,
      firstNotify: received.promise,
      dispose: () => {
        server.dispose();
        pair.port1.close();
        pair.port2.close();
      },
    };
  };

  const portBacked = (port: MessagePort): Port<unknown> => {
    const wrapped = wrapMessagePort<unknown>(port, { label: 't37:worker' });
    wrapped.start?.();
    return wrapped;
  };

  const terminableTransports = [
    [
      'web-worker',
      async (port: MessagePort): Promise<RuntimeTransportClient> => {
        const { webWorkerTransport } = await import('#transport/web-worker-transport.js');
        const wrapped = portBacked(port);
        const worker = {
          postMessage: (data: unknown, transfer?: readonly Transferable[]) => {
            wrapped.postMessage(data, transfer);
          },
          addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
            if (type === 'message') {
              wrapped.onMessage((data) => {
                listener({ data });
              });
            }
          },
          removeEventListener: () => undefined,
          terminate: () => {
            wrapped.close();
          },
        };
        return webWorkerTransport({
          url: 'about:blank',
          createWorker: () => worker as unknown as Worker,
        }).materialize() as unknown as RuntimeTransportClient;
      },
    ],
    [
      'node-worker',
      async (port: MessagePort): Promise<RuntimeTransportClient> => {
        const { nodeWorkerTransport } = await import('#transport/node-worker-transport.js');
        const wrapped = portBacked(port);
        const worker = {
          postMessage: (data: unknown, transfer?: readonly Transferable[]) => {
            wrapped.postMessage(data, transfer);
          },
          on(event: string, listener: (data: unknown) => void) {
            if (event === 'message') {
              wrapped.onMessage(listener);
            }
            return worker;
          },
          off: () => worker,
          terminate: async () => {
            wrapped.close();
            return 0;
          },
        };
        return nodeWorkerTransport({
          url: new URL('about:blank'),
          workerCtor: function fakeNodeWorker() {
            return worker;
          } as unknown as WorkerConstructorLike,
        }).materialize() as unknown as RuntimeTransportClient;
      },
    ],
    [
      'electron-utility',
      async (port: MessagePort): Promise<RuntimeTransportClient> => {
        const { electronUtilityClient } = await import('#electron/electron-utility-client.js');
        return electronUtilityClient({ port }) as unknown as RuntimeTransportClient;
      },
    ],
  ] as const;

  it.each(terminableTransports)(
    '%s builds its hello with the shared builder and its abort frame with the shared helper',
    async (transportId, materialize) => {
      const peer = wireBackedPeer();
      const client = await materialize(peer.port);
      try {
        const ready = await client.open();
        expect(ready.hello).toEqual(buildHelloPayload(transportId));
        await ready.channel.ready;

        const recovery = client.renderTimeoutRecovery;
        if (recovery.kind !== 'terminable') {
          throw new TypeError(`Expected terminable ${transportId} recovery`);
        }
        const target = { renderId, ...client.reservePreview() };
        recovery.abortRender(target);

        await expect(peer.firstNotify).resolves.toEqual(sharedAbortFrame(target));
      } finally {
        await client.close();
        peer.dispose();
      }
    },
  );
});

/* ============================================================ *
 * Test helpers                                                   *
 * ============================================================ */

type WorkerConstructorLike = new (url: string | URL) => unknown;

type FakeWorker = {
  postMessage: (data: unknown, transfer?: readonly Transferable[]) => void;
  addEventListener: (type: 'message', listener: (event: { data: unknown }) => void) => void;
  removeEventListener: (type: 'message', listener: (event: { data: unknown }) => void) => void;
  terminate: () => void;
};

function makeFakeWorkerCtor(): {
  workerCtor: typeof Worker;
  created: FakeWorker[];
  urls: Array<string | URL>;
  terminateCalls: () => number;
  emit: (type: 'error' | 'messageerror', event: { readonly error?: unknown; readonly message?: string }) => void;
  dispose: () => void;
} {
  const created: FakeWorker[] = [];
  const urls: Array<string | URL> = [];
  let terminationCount = 0;
  let latestListeners: Map<string, Set<(event: unknown) => void>> | undefined;
  const ctor = function fakeWorkerImpl(this: FakeWorker, url: string | URL, _options?: WorkerOptions): FakeWorker {
    urls.push(url);
    const listeners = new Map<string, Set<(event: unknown) => void>>();
    latestListeners = listeners;
    const fake: FakeWorker = {
      postMessage() {
        /* Tests never round-trip messages; channel handshake exercised in lifecycle tests */
      },
      addEventListener(type, listener) {
        const eventListeners = listeners.get(type) ?? new Set<(event: unknown) => void>();
        eventListeners.add(listener as (event: unknown) => void);
        listeners.set(type, eventListeners);
      },
      removeEventListener(type, listener) {
        listeners.get(type)?.delete(listener as (event: unknown) => void);
      },
      terminate() {
        terminationCount++;
        listeners.clear();
      },
    };
    created.push(fake);
    return fake;
  } as unknown as typeof Worker;
  return {
    workerCtor: ctor,
    created,
    urls,
    terminateCalls: () => terminationCount,
    emit(type, event) {
      for (const listener of latestListeners?.get(type) ?? []) {
        listener(event);
      }
    },
    dispose() {
      for (const w of created) {
        w.terminate();
      }
    },
  };
}

type FakeNodeWorker = {
  postMessage: (data: unknown, transferList?: unknown) => void;
  on: (event: 'message', listener: (data: unknown) => void) => FakeNodeWorker;
  off: (event: 'message', listener: (data: unknown) => void) => FakeNodeWorker;
  terminate: () => Promise<number>;
};

function makeFakeNodeWorkerCtor(): {
  workerCtor: unknown;
  created: FakeNodeWorker[];
  urls: Array<string | URL>;
  terminateCalls: () => number;
  emit: (type: 'error' | 'exit', payload: Error | number) => void;
  dispose: () => void;
} {
  const created: FakeNodeWorker[] = [];
  const urls: Array<string | URL> = [];
  let terminationCount = 0;
  let latestListeners: Map<string, Set<(data: unknown) => void>> | undefined;
  const ctor = function fakeNodeWorkerImpl(this: FakeNodeWorker, url: string | URL): FakeNodeWorker {
    urls.push(url);
    const listeners = new Map<string, Set<(data: unknown) => void>>();
    latestListeners = listeners;
    const fake: FakeNodeWorker = {
      postMessage() {
        /* No-op */
      },
      on(event, listener) {
        const eventListeners = listeners.get(event) ?? new Set<(data: unknown) => void>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
        return fake;
      },
      off(event, listener) {
        listeners.get(event)?.delete(listener);
        return fake;
      },
      async terminate() {
        terminationCount++;
        listeners.clear();
        return 0;
      },
    };
    created.push(fake);
    return fake;
  } as unknown as new (url: string | URL) => FakeNodeWorker;
  return {
    workerCtor: ctor,
    created,
    urls,
    terminateCalls: () => terminationCount,
    emit(type, payload) {
      for (const listener of latestListeners?.get(type) ?? []) {
        listener(payload);
      }
    },
    dispose() {
      for (const w of created) {
        void w.terminate();
      }
    },
  };
}
