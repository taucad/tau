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

import { createChannelServer, wrapMessagePort, wrapWebSocket } from '@taucad/rpc';
import type { Channel, ChannelServerHandle, Port, WebSocketLike } from '@taucad/rpc';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';
import type { Geometry } from '@taucad/types';

import { fromFileSystemBridge, fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { fromNodeFs } from '#filesystem/from-node-fs.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { createRuntimeClient } from '#client/runtime-client-core.js';
import type { KernelWorker } from '#framework/kernel-worker.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { nodeWorkerHost } from '#transport/node-worker-host.js';
import type { WebWorkerTransportOptions } from '#transport/web-worker-client.js';
import { webWorkerHost } from '#transport/web-worker-host.js';
import { webSocketClient } from '#transport/web-socket-client.js';
import { webSocketTransport } from '#transport/web-socket-transport.js';
import { webSocketClientOptionsSchema } from '#transport/web-socket-transport.schemas.js';
import { triggerRenderTimeout } from '#transport/_internal/abort-channel.js';
import { createWorkerDispatcher, runtimeChannelSessionKey } from '#transport/_internal/runtime-worker-dispatcher.js';
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

  it('materialised client.open() resolves a typed channel with the wire hello', async () => {
    const plugin = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
    const client = plugin.materialize();
    const ready = await client.open();
    expect(ready.channel).toBeDefined();
    expect(typeof ready.channel.call).toBe('function');
    expect(typeof ready.channel.notify).toBe('function');
    expect(ready.channel.hello.payload).toMatchObject({
      server: 'kernel-runtime-worker',
      protocolVersion: 1,
    });
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
        createRuntimeClient({
          transport: makeTransport(),
          renderTimeout: 1,
        }),
      ).toThrow(new TypeError(unsupportedSameIsolateTimeoutMessage));

      const client = createRuntimeClient({ transport: makeTransport() });
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
 * WebSocket slice                                                *
 * ============================================================ */

describe('transport conformance — web-socket (C2)', () => {
  const url = 'ws://127.0.0.1:8080';

  const hostLocalDescriptor = {
    id: 'web-socket',
    wire: 'remote',
    memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
    fileSystem: 'host-local',
  };

  it('callable exposes the TransportPlugin surface with a literal id', () => {
    expect(typeof webSocketTransport).toBe('function');
    const plugin = webSocketTransport({ url });
    expect(plugin.id).toBe('web-socket');
    expect(typeof plugin.describe).toBe('function');
    expect(typeof plugin.materialize).toBe('function');
  });

  it('materialise() returns the v6 fat client handle surface', () => {
    const bed = createWebSocketTestBed();
    const client = webSocketTransport({ url, createSocket: bed.createSocket }).materialize();
    expect(client.id).toBe('web-socket');
    expect(typeof client.describe).toBe('function');
    expect(typeof client.open).toBe('function');
    expect(typeof client.initialize).toBe('function');
    expect(typeof client.reservePreview).toBe('function');
    expect(client.renderTimeoutRecovery.kind).toBe('terminable');
    expect(typeof client.resolveGeometry).toBe('function');
    expect(typeof client.close).toBe('function');
    expect(client.closed).toBeInstanceOf(Promise);
  });

  it('describe() advertises a remote host-local wire without a filesystem', () => {
    expect(webSocketTransport({ url }).describe()).toEqual(hostLocalDescriptor);
  });

  it('describe() advertises a bridged filesystem when the consumer supplies one', () => {
    expect(webSocketTransport({ url, fileSystem: fromMemoryFs() }).describe()).toEqual({
      ...hostLocalDescriptor,
      fileSystem: 'bridged',
    });
  });

  it('open() is idempotent and completes the wire handshake over the socket', async () => {
    const bed = createWebSocketTestBed();
    const client = webSocketTransport({ url, createSocket: bed.createSocket }).materialize();
    try {
      const ready = await client.open();
      const again = await client.open();
      expect(again.channel).toBe(ready.channel);
      await ready.channel.ready;
      expect(ready.channel.hello.payload).toMatchObject({
        server: 'kernel-runtime-worker',
        protocolVersion: 1,
      });
      expect(bed.dialled.map((entry) => new URL(entry.url).pathname)).toEqual(['/runtime']);
      expect(new URL(bed.dialled[0]!.url).searchParams.get('session')).toEqual(expect.any(String));
    } finally {
      await client.close();
      bed.dispose();
    }
  });

  it('close() settles the closed promise once with `requested`', async () => {
    const bed = createWebSocketTestBed();
    const client = webSocketTransport({ url, createSocket: bed.createSocket }).materialize();
    try {
      await client.open();
      await client.close();
      await client.close();
      await expect(client.closed).resolves.toEqual({ cause: 'requested' });
      expect(bed.dialled[0]!.client.closeCalls).toHaveLength(1);
    } finally {
      bed.dispose();
    }
  });

  it.each([
    ['1000 (normal)', 1000],
    ['1001 (going away)', 1001],
  ] as const)(
    'settles a %s socket close as host-exit, and a late close() cannot overwrite it',
    async (_label, code) => {
      const bed = createWebSocketTestBed();
      const client = webSocketTransport({ url, createSocket: bed.createSocket }).materialize();
      try {
        await client.open();
        bed.dialled[0]!.host.close(code, 'host stopping');

        await expect(client.closed).resolves.toEqual({ cause: 'host-exit' });
        await client.close();
        await expect(client.closed).resolves.toEqual({ cause: 'host-exit' });
      } finally {
        bed.dispose();
      }
    },
  );

  it('settles an abnormal 1006 close as wire-failure carrying the code', async () => {
    const bed = createWebSocketTestBed();
    const client = webSocketTransport({ url, createSocket: bed.createSocket }).materialize();
    try {
      await client.open();
      bed.dialled[0]!.client.emitClose(1006, '');

      const result = await client.closed;
      expect(result.cause).toBe('wire-failure');
      if (result.cause !== 'wire-failure') {
        throw new TypeError('expected wire-failure');
      }
      expect(result.error.message).toContain('1006');
    } finally {
      bed.dispose();
    }
  });

  it('settles a socket `error` event as wire-failure carrying the error', async () => {
    const bed = createWebSocketTestBed();
    const client = webSocketTransport({ url, createSocket: bed.createSocket }).materialize();
    const failure = new Error('ECONNREFUSED');
    try {
      await client.open();
      bed.dialled[0]!.client.emitError(failure);

      await expect(client.closed).resolves.toEqual({ cause: 'wire-failure', error: failure });
    } finally {
      bed.dispose();
    }
  });

  it.each([
    ['without watch', fromMemoryFs(), false],
    /* Never read — only `typeof fs.watch === 'function'` is under test. */
    ['with watch', fromNodeFs(import.meta.dirname), true],
  ] as const)(
    'serves the consumer filesystem over a second socket %s',
    async (_label, fileSystem: RuntimeFileSystem, watchable: boolean) => {
      const bed = createWebSocketTestBed();
      const client = webSocketTransport({ url, fileSystem, createSocket: bed.createSocket }).materialize();
      try {
        await client.open();

        const paths = bed.dialled.map((entry) => new URL(entry.url).pathname);
        expect(paths).toEqual(['/runtime', '/fs']);
        const sessions = bed.dialled.map((entry) => new URL(entry.url).searchParams.get('session'));
        expect(sessions[0]).toBe(sessions[1]);

        /* The bridge server posts its hello during construction, so the far
         * end of the `/fs` socket already holds it. */
        expect(bed.fileSystemFrames).toHaveLength(1);
        expect(bed.fileSystemFrames[0]).toMatchObject({
          v: 1,
          k: 'lh',
          o: 1,
          d: { v: 1, state: 'ready', watchable },
        });
      } finally {
        await client.close();
        bed.dispose();
      }
    },
  );

  it('settles wire-failure when the host rejects the /fs socket with 1008 (topology mismatch)', async () => {
    const bed = createWebSocketTestBed();
    const client = webSocketTransport({
      url,
      fileSystem: fromMemoryFs(),
      createSocket: bed.createSocket,
    }).materialize();
    try {
      await client.open();
      const fileSystemSocket = bed.dialled.find((entry) => new URL(entry.url).pathname === '/fs')!;
      fileSystemSocket.host.close(1008, 'host owns its filesystem; /fs socket is not accepted');

      const result = await client.closed;
      expect(result.cause).toBe('wire-failure');
      if (result.cause !== 'wire-failure') {
        throw new TypeError('expected wire-failure');
      }
      expect(result.error.message).toContain('must not pass');
    } finally {
      bed.dispose();
    }
  });

  it('leaves closed unsettled when the /fs socket fails on its own', async () => {
    const bed = createWebSocketTestBed();
    const client = webSocketTransport({
      url,
      fileSystem: fromMemoryFs(),
      createSocket: bed.createSocket,
    }).materialize();
    try {
      await client.open();
      const fileSystemSocket = bed.dialled.find((entry) => new URL(entry.url).pathname === '/fs')!;

      /* An unlistened `error` throws out of a `ws` socket; the listener must
       * exist, but a lone `/fs` failure is a render error, not a transport
       * close — the runtime wire is still up. */
      fileSystemSocket.client.emitError(new Error('ECONNRESET'));
      fileSystemSocket.client.emitClose(1006, '');

      const unsettled = Symbol('unsettled');
      const settled = await Promise.race([client.closed, Promise.resolve(unsettled)]);
      expect(settled).toBe(unsettled);
    } finally {
      await client.close();
      bed.dispose();
    }
  });

  it('mints the pairing session at open(), not at materialize()', async () => {
    /* An insecure browser context has no `crypto.randomUUID`; materialising a
     * transport must not throw there. */
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) });
    const bed = createWebSocketTestBed();
    const client = webSocketTransport({ url, createSocket: bed.createSocket }).materialize();
    try {
      expect(bed.dialled).toHaveLength(0);
      await client.open();
      expect(new URL(bed.dialled[0]!.url).searchParams.get('session')).toMatch(/^[\da-f]{32}$/);
    } finally {
      await client.close();
      bed.dispose();
    }
  });

  it('rejects a bridged filesystem handle in the option schema', () => {
    const bridged = fromFileSystemBridge(() => {
      throw new Error('never connected in conformance');
    });
    const parsed = webSocketClientOptionsSchema.safeParse({ url, fileSystem: bridged });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('fromFileSystemBridge');
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
    peerPort: MessagePort;
    firstNotify: Promise<[string, unknown]>;
    dispose: () => void;
  } => {
    const pair = new MessageChannel();
    const received = Promise.withResolvers<[string, unknown]>();
    const server = createChannelServer<RuntimeProtocol>({
      port: wrapMessagePort<unknown>(pair.port2, { label: 't37:peer' }),
      sessionKey: runtimeChannelSessionKey,
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion: 1 },
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
      peerPort: pair.port2,
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
    [
      'web-socket',
      async (port: MessagePort): Promise<RuntimeTransportClient> => {
        /* The row's peer is a `MessagePort`-backed channel server, so the
         * socket shim carries the msgpack codec the real wire uses. */
        return webSocketClient({
          url: 'ws://127.0.0.1:8080',
          createSocket: () => messagePortAsWebSocket(port),
        }) as unknown as RuntimeTransportClient;
      },
    ],
  ] as const;

  it.each(terminableTransports)(
    '%s builds its abort frame with the shared helper',
    async (_transportId, materialize) => {
      const peer = wireBackedPeer();
      const client = await materialize(peer.port);
      try {
        const ready = await client.open();
        await ready.channel.ready;

        const recovery = client.renderTimeoutRecovery;
        if (recovery.kind !== 'terminable') {
          throw new TypeError(`Expected terminable ${_transportId} recovery`);
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

  it('electron-utility settles closed as host-exit when the utility end of the port closes', async () => {
    const materializeElectronUtility = terminableTransports.find(([id]) => id === 'electron-utility')![1];
    const peer = wireBackedPeer();
    const client = await materializeElectronUtility(peer.port);
    try {
      const ready = await client.open();
      await ready.channel.ready;

      peer.peerPort.close();

      await expect(client.closed).resolves.toEqual({ cause: 'host-exit' });
      await client.close();
      await expect(client.closed).resolves.toEqual({ cause: 'host-exit' });
    } finally {
      peer.dispose();
    }
  });

  it('electron-utility settles closed with the exit code main relayed for the dead utility', async () => {
    const { registerElectronRuntimeHostExit } = await import('#electron/_internal/runtime-host-lease.js');
    const materializeElectronUtility = terminableTransports.find(([id]) => id === 'electron-utility')![1];
    const peer = wireBackedPeer();
    let notifyHostExit: ((exitCode?: number) => void) | undefined;
    registerElectronRuntimeHostExit(peer.port, (notify) => {
      notifyHostExit = notify;
    });
    const client = await materializeElectronUtility(peer.port);
    try {
      const ready = await client.open();
      await ready.channel.ready;

      notifyHostExit?.(7);

      await expect(client.closed).resolves.toEqual({ cause: 'host-exit', exitCode: 7 });
      /* Both liveness signals exist; `finish` is idempotent and the first cause wins. */
      peer.peerPort.close();
      await expect(client.closed).resolves.toEqual({ cause: 'host-exit', exitCode: 7 });
    } finally {
      peer.dispose();
    }
  });
});

/* ============================================================ *
 * Test helpers                                                   *
 * ============================================================ */

const socketOpen = 1;
const socketClosed = 3;

/**
 * Fake `WebSocketLike` pair end. Connects instantly (a dialled socket in
 * these tests is already `OPEN`), delivers to its peer asynchronously as a
 * real wire does, supports several listeners per event, and records closes.
 */
class FakeWebSocket implements WebSocketLike {
  public binaryType = 'nodebuffer';
  public readyState = socketOpen;
  public peer: FakeWebSocket | undefined;
  public readonly closeCalls: Array<{ code?: number; reason?: string }> = [];
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  public addEventListener(type: string, listener: (event: unknown) => void): void {
    const bucket = this.listeners.get(type) ?? new Set<(event: unknown) => void>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  public removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  public send(data: Uint8Array<ArrayBuffer>): void {
    const { peer } = this;
    if (!peer || this.readyState !== socketOpen) {
      return;
    }
    /* MessagePack encodes into a pooled buffer — copy before the async hop. */
    const frame = new Uint8Array(data);
    queueMicrotask(() => {
      peer.emit('message', { data: frame });
    });
  }

  public close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.emitClose(code ?? 1000, reason ?? '');
    this.peer?.emitClose(code ?? 1000, reason ?? '');
  }

  /** Push a close at this end, as the network (not this side) would. */
  public emitClose(code: number, reason: string): void {
    if (this.readyState === socketClosed) {
      return;
    }
    this.readyState = socketClosed;
    this.emit('close', { code, reason });
  }

  /** Push a transport-level failure at this end. */
  public emitError(error: Error): void {
    this.emit('error', { error });
  }

  private emit(type: string, event: unknown): void {
    /* Snapshot: a listener may detach itself while the event is dispatched. */
    const bucket = [...(this.listeners.get(type) ?? [])];
    for (const listener of bucket) {
      listener(event);
    }
  }
}

type DialledSocket = { readonly url: string; readonly client: FakeWebSocket; readonly host: FakeWebSocket };

/**
 * A `createSocket` factory whose far ends are wired at dial time: the
 * runtime route gets a real `createWorkerDispatcher`, and the `/fs` route
 * records the decoded frames the client's bridge server posts.
 */
function createWebSocketTestBed(): {
  createSocket: (url: string) => WebSocketLike;
  dialled: readonly DialledSocket[];
  fileSystemFrames: readonly unknown[];
  dispose: () => void;
} {
  const dialled: DialledSocket[] = [];
  const dispatchers: Array<ChannelServerHandle<RuntimeProtocol>> = [];
  const fileSystemFrames: unknown[] = [];

  return {
    createSocket(url: string): WebSocketLike {
      const client = new FakeWebSocket();
      const host = new FakeWebSocket();
      client.peer = host;
      host.peer = client;
      dialled.push({ url, client, host });

      if (new URL(url).pathname.endsWith('/runtime')) {
        /* Wired here, not after `open()` resolves: the dispatcher posts its
         * hello during construction and a later listener never sees it. */
        dispatchers.push(createWorkerDispatcher(makeStubKernelWorker(), wrapWebSocket<unknown>(host, msgpackCodec)));
      } else {
        host.addEventListener('message', (event) => {
          fileSystemFrames.push(msgpackCodec.decode((event as { data: Uint8Array<ArrayBuffer> }).data));
        });
      }
      return client;
    },
    dialled,
    fileSystemFrames,
    dispose() {
      for (const dispatcher of dispatchers) {
        dispatcher.dispose('conformance teardown');
      }
      for (const entry of dialled) {
        entry.client.emitClose(1000, 'teardown');
        entry.host.emitClose(1000, 'teardown');
      }
    },
  };
}

/** Present a `MessagePort`-backed channel peer as a `WebSocketLike`. */
function messagePortAsWebSocket(port: MessagePort): WebSocketLike {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  port.addEventListener('message', (event) => {
    for (const listener of listeners.get('message') ?? []) {
      listener({ data: msgpackCodec.encode(event.data) });
    }
  });
  port.start();
  return {
    readyState: socketOpen,
    binaryType: 'nodebuffer',
    send(data) {
      port.postMessage(msgpackCodec.decode(data));
    },
    addEventListener(type: string, listener: (event: unknown) => void) {
      const bucket = listeners.get(type) ?? new Set<(event: unknown) => void>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      listeners.get(type)?.delete(listener);
    },
    close() {
      port.close();
    },
  };
}

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
