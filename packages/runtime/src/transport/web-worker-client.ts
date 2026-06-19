/**
 * Web-worker transport — client factory.
 *
 * Owns the consumer-facing client handle, the `Worker` constructor
 * lookup, the SAB pool allocator, and the FS bridge plumbing.
 * Application code owns the worker module URL so framework bundlers
 * can see the native `new Worker(new URL(...), { type: 'module' })`
 * expression in the app graph.
 *
 * @public
 */

import { createChannelClient } from '@taucad/rpc';
import type { Channel, Port } from '@taucad/rpc';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';
import type { Geometry } from '@taucad/types';
import type {
  RuntimeInitializeMemoryHandle,
  RuntimeInitializePayload,
  RuntimeTransportClient,
  TransportClientReady,
  TransportDescriptor,
} from '#transport/runtime-transport.types.js';
import { runtimeChannelSessionKey } from '#transport/_internal/runtime-worker-dispatcher.js';
import { isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { materialiseGeometry } from '#transport/_internal/geometry-materialiser.js';
import type { GeometryTransport, RuntimeInitializeResult, RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { allocatePools } from '#transport/_internal/sab-pools.js';
import { triggerAbort } from '#transport/_internal/abort-channel.js';
import { buildHelloPayload } from '#transport/_internal/transport-hello.js';
import {
  RuntimeFileSystemBridgeConsumedError,
  buildFileSystemBridge,
} from '#transport/_internal/file-system-bridge.js';
import { webWorkerId } from '#transport/_internal/web-worker-id.js';
import type { WebWorkerId } from '#transport/_internal/web-worker-id.js';

/**
 * Subset of the DOM `Worker` surface the transport depends on. Tests
 * substitute a stub that exposes the same shape without dragging in
 * `worker_threads`.
 *
 * @public
 */
export type WebWorkerLike = {
  postMessage(value: unknown, transfer?: readonly Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  terminate(): void;
};

/**
 * Options accepted by {@link webWorkerClient}.
 *
 * @public
 */
export type WebWorkerClientOptions = {
  /**
   * URL of the worker module entry. Must resolve to a `type: 'module'`
   * worker that composes `createRuntimeWorker({ runtime })` with
   * `webWorkerHost(...)`. Required unless `createWorker` is supplied.
   */
  readonly url?: string | URL;
  /**
   * Override for the global `Worker` constructor — primary use is
   * unit-test injection of a fake worker.
   */
  readonly workerCtor?: typeof Worker;
  /**
   * Create an app-owned worker instance. Use this in frameworks whose bundler
   * requires the native worker expression at the app callsite, for example
   * `new Worker(new URL('./runtime.worker.ts', import.meta.url), { type:
   * 'module' })` in Next/Turbopack.
   */
  readonly createWorker?: () => WebWorkerLike;
  readonly sharedMemory?: { readonly geometry?: { readonly bytes: number } };
  readonly fileSystem?: RuntimeFileSystem;
  readonly filePoolBuffer?: SharedArrayBuffer;
};

const wrapWorkerAsPort = (worker: WebWorkerLike, label: string): Port<unknown> => {
  const listeners = new Set<(event: { data: unknown }) => void>();
  let closed = false;
  return {
    postMessage(data, transfer) {
      if (closed) {
        return;
      }
      worker.postMessage(data, transfer);
    },
    onMessage(handler) {
      const listener = (event: { data: unknown }): void => {
        handler(event.data);
      };
      worker.addEventListener('message', listener);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        worker.removeEventListener('message', listener);
      };
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      for (const listener of listeners) {
        worker.removeEventListener('message', listener);
      }
      listeners.clear();
      try {
        worker.terminate();
      } catch (error) {
        throw new Error(`${label}: terminate failed`, { cause: error });
      }
    },
  };
};

/**
 * Pure descriptor for bundled web-worker client options — no SAB
 * allocation or worker spawn.
 *
 * @param options - Client options; same shape as {@link webWorkerClient}.
 * @returns Diagnostic {@link TransportDescriptor}.
 * @public
 */
export const webWorkerClientDescribe = (options: WebWorkerClientOptions): TransportDescriptor<WebWorkerId> => {
  const fsKind = options.fileSystem ? 'inline' : 'unbound';
  const sabAvailable = typeof SharedArrayBuffer === 'function';
  const geometryDelivery = sabAvailable && options.sharedMemory?.geometry !== undefined ? 'pool' : 'transfer';
  const fileDelivery = sabAvailable && options.filePoolBuffer !== undefined ? 'pool' : 'transfer';
  const abortSignal = sabAvailable ? 'sab-atomics' : 'wire-notify';

  return {
    id: webWorkerId,
    wire: 'web-worker',
    memory: {
      geometryDelivery,
      fileDelivery,
      abortSignal,
    },
    fileSystem: fsKind,
  };
};

/**
 * Standalone client factory for the web-worker transport.
 * Compose into {@link defineRuntimeTransport} via
 * {@link web-worker-transport.ts}.
 *
 * @param options - Client options; see {@link WebWorkerClientOptions}.
 * @returns The {@link RuntimeTransportClient} fat handle for the web-worker wire.
 * @public
 */
export const webWorkerClient = (
  options: WebWorkerClientOptions,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, WebWorkerId> => {
  const workerCtor: typeof Worker | undefined =
    options.workerCtor ?? (typeof Worker === 'function' ? Worker : undefined);
  if (typeof options.createWorker !== 'function' && typeof workerCtor !== 'function') {
    throw new TypeError('webWorkerTransport: requires a `Worker` constructor (browser context or `workerCtor` option)');
  }
  if (options.fileSystem !== undefined && !isRuntimeFileSystem(options.fileSystem)) {
    throw new TypeError('webWorkerTransport: `fileSystem` must be produced by a `fromX` factory');
  }

  let pools: ReturnType<typeof allocatePools> | undefined;

  const ensurePools = (): ReturnType<typeof allocatePools> => {
    pools ??= allocatePools({
      geometry: options.sharedMemory?.geometry,
      filePoolBuffer: options.filePoolBuffer,
    });
    return pools;
  };

  let bridge: ReturnType<typeof buildFileSystemBridge>;
  let bridgeConsumedByFailedInitialize = false;
  let openPromise: Promise<TransportClientReady> | undefined;
  let worker: WebWorkerLike | undefined;
  let port: Port<unknown> | undefined;
  let channel: Channel<RuntimeProtocol> | undefined;
  let isClosed = false;

  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const open = async (): Promise<TransportClientReady> => {
    if (openPromise) {
      return openPromise;
    }
    openPromise = (async () => {
      if (isClosed) {
        throw new Error('webWorkerTransport: client closed before open()');
      }
      void ensurePools();
      if (typeof options.createWorker === 'function') {
        worker = options.createWorker();
      } else {
        if (typeof workerCtor !== 'function') {
          throw new TypeError('webWorkerTransport: requires a `Worker` constructor');
        }
        if (!options.url) {
          throw new TypeError('webWorkerTransport: requires `createWorker` or an explicit worker `url`');
        }
        const url = typeof options.url === 'string' ? options.url : options.url.href;
        worker = Reflect.construct(workerCtor, [url, { type: 'module' }]) as WebWorkerLike;
      }
      port = wrapWorkerAsPort(worker, `web-worker:${webWorkerId}`);
      channel = createChannelClient<RuntimeProtocol>({
        port,
        sessionKey: runtimeChannelSessionKey,
        protocolSchemas: runtimeProtocolSchemas,
      });
      // We deliberately do NOT `await channel.ready` here — the fake
      // worker used in unit tests never replies. The runtime client
      // will await readiness before issuing any RPC. Production
      // workers reply with `lh` on module load.
      return {
        channel,
        hello: buildHelloPayload(webWorkerId),
      };
    })();
    return openPromise;
  };

  return {
    id: webWorkerId,
    describe(): TransportDescriptor<WebWorkerId> {
      return webWorkerClientDescribe(options);
    },
    open,
    async initialize(input: RuntimeInitializePayload): Promise<RuntimeInitializeResult> {
      if (!channel) {
        await open();
      }
      if (!channel) {
        throw new Error('webWorkerTransport: channel unavailable after open()');
      }
      if (bridgeConsumedByFailedInitialize && bridge?.kind === 'channel') {
        throw new RuntimeFileSystemBridgeConsumedError('webWorkerTransport');
      }
      bridge ??= buildFileSystemBridge(options.fileSystem);
      const pooled = ensurePools();
      const memoryHandle: RuntimeInitializeMemoryHandle = {
        ...(pooled.signalBuffer ? { signalBuffer: pooled.signalBuffer } : {}),
        ...(pooled.geometryPoolBuffer ? { geometryPoolBuffer: pooled.geometryPoolBuffer } : {}),
        ...(pooled.filePoolBuffer ? { filePoolBuffer: pooled.filePoolBuffer } : {}),
        ...(bridge ? { fileSystemPort: bridge.port } : {}),
      };
      const transferables: Transferable[] = bridge ? [bridge.port] : [];
      const args = { ...input, memoryHandle };
      try {
        const result = await channel.call(
          'initialize',
          transferables.length > 0 ? { value: args, transferables } : args,
        );
        bridgeConsumedByFailedInitialize = false;
        return result;
      } catch (error) {
        if (bridge?.kind === 'inline') {
          try {
            bridge.dispose();
          } finally {
            bridge = undefined;
            bridgeConsumedByFailedInitialize = false;
          }
        } else if (bridge?.kind === 'channel') {
          bridgeConsumedByFailedInitialize = true;
        }
        throw error;
      }
    },
    abort(reason): void {
      if (!channel) {
        return;
      }
      triggerAbort(channel, ensurePools().signalBuffer, reason);
    },
    async resolveGeometry(transport: GeometryTransport): Promise<Geometry> {
      return materialiseGeometry(transport, ensurePools().geometryPool);
    },
    async close(reason?: string): Promise<void> {
      if (isClosed) {
        return;
      }
      isClosed = true;
      try {
        channel?.close(reason);
      } catch {
        /* Best-effort */
      }
      try {
        port?.close();
      } catch {
        /* Best-effort */
      }
      try {
        worker?.terminate();
      } catch {
        /* Best-effort */
      }
      try {
        bridge?.dispose();
      } catch {
        /* Best-effort */
      }
      resolveClosed?.();
    },
    closed,
  };
};

webWorkerClient.describe = webWorkerClientDescribe;
