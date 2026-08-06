/**
 * Node-worker transport — client factory.
 *
 * Owns the consumer-facing client handle, the `node:worker_threads.Worker`
 * constructor lookup, the SAB pool allocator, the FS bridge plumbing, and
 * the single `new URL('../worker/node.js', import.meta.url)` literal that
 * tells the bundler to emit the bundled Node worker entry chunk.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R2):
 * the chunk-emit literal lives **here**, in a file the worker entry never
 * reaches. The host file (`node-worker-host.ts`) is bundled into the
 * worker entry chunk and must remain free of `new URL` literals so
 * Rolldown's chunk planner has no static path back to the chunk-emitter.
 *
 * @public
 */

import { Worker as NodeWorker } from 'node:worker_threads';
import type { Transferable as NodeTransferable } from 'node:worker_threads';

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
import { buildFileSystemBridge } from '#transport/_internal/file-system-bridge.js';
import { nodeWorkerId } from '#transport/_internal/node-worker-id.js';
import type { NodeWorkerId } from '#transport/_internal/node-worker-id.js';

/**
 * Default URL of the bundled node-worker entry. Resolved at module-load
 * via `new URL('../worker/node.js', import.meta.url)` so consumers no
 * longer have to write a `new URL('@taucad/runtime/worker/node', ...)`
 * literal at every callsite.
 *
 * The relative `.js` reference is the form `tsModuleUrlBuildPlugin`
 * handles via its synchronous fast path. Hoisting the URL into the
 * runtime package keeps the only `new URL(...)` instance in source we
 * control.
 *
 * @internal
 */
const defaultNodeWorkerUrl = new URL('../worker/node.js', import.meta.url);

/**
 * Subset of `node:worker_threads.Worker` the transport depends on.
 *
 * @public
 */
export type NodeWorkerLike = {
  postMessage(value: unknown, transferList?: readonly NodeTransferable[]): void;
  on(event: 'message', listener: (data: unknown) => void): NodeWorkerLike;
  off(event: 'message', listener: (data: unknown) => void): NodeWorkerLike;
  terminate(): Promise<number>;
};

/**
 * Options accepted by {@link nodeWorkerClient}.
 *
 * @public
 */
export type NodeWorkerClientOptions = {
  /**
   * URL of the worker module entry. Optional — when omitted the
   * transport defaults to the bundled `@taucad/runtime/worker/node`
   * entry. Override only when hosting a custom Node worker module
   * that composes `KernelRuntimeWorker` with `nodeWorkerHost`
   * directly.
   */
  readonly url?: string | URL;
  readonly workerCtor?: unknown;
  readonly sharedMemory?: { readonly geometry?: { readonly bytes: number } };
  readonly fileSystem?: RuntimeFileSystem;
};

const wrapNodeWorkerAsPort = (worker: NodeWorkerLike, label: string): Port<unknown> => {
  const listeners = new Set<(data: unknown) => void>();
  let closed = false;
  return {
    postMessage(data, transfer) {
      if (closed) {
        return;
      }
      worker.postMessage(data, transfer as NodeTransferable[] | undefined);
    },
    onMessage(handler) {
      const listener = (data: unknown): void => {
        handler(data);
      };
      worker.on('message', listener);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        worker.off('message', listener);
      };
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      for (const listener of listeners) {
        worker.off('message', listener);
      }
      listeners.clear();
      const terminated = (async (): Promise<void> => {
        try {
          await worker.terminate();
        } catch (error) {
          throw new Error(`${label}: terminate failed`, { cause: error });
        }
      })();
      // async-iife: bootstrap — Port#close is sync per the @taucad/rpc contract; terminate is fire-and-forget.
      void terminated;
    },
  };
};

/**
 * Pure diagnostic descriptor for Node worker client options.
 *
 * @param options - Same shape as {@link nodeWorkerClient}.
 * @returns Diagnostic {@link TransportDescriptor} for the node-worker transport.
 * @public
 */
export const nodeWorkerClientDescribe = (options: NodeWorkerClientOptions): TransportDescriptor<NodeWorkerId> => {
  const fsKind = options.fileSystem ? 'inline' : 'unbound';
  const sabAvailable = typeof SharedArrayBuffer === 'function';
  const geometryDelivery = sabAvailable && options.sharedMemory?.geometry !== undefined ? 'pool' : 'transfer';
  const fileDelivery = 'transfer';
  const abortSignal = sabAvailable ? 'sab-atomics' : 'wire-notify';

  return {
    id: nodeWorkerId,
    wire: 'node-worker',
    memory: {
      geometryDelivery,
      fileDelivery,
      abortSignal,
    },
    fileSystem: fsKind,
  };
};

/**
 * Standalone client factory for the node-worker transport.
 *
 * @param options - Client options; see {@link NodeWorkerClientOptions}.
 * @returns The {@link RuntimeTransportClient} fat handle for the node-worker wire.
 * @public
 */
export const nodeWorkerClient = (
  options: NodeWorkerClientOptions,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, NodeWorkerId> => {
  const ctor = (options.workerCtor ?? NodeWorker) as new (url: string | URL) => NodeWorkerLike;
  if (typeof ctor !== 'function') {
    throw new TypeError('nodeWorkerTransport: requires `node:worker_threads.Worker` (or `workerCtor` test seam)');
  }
  if (options.fileSystem !== undefined && !isRuntimeFileSystem(options.fileSystem)) {
    throw new TypeError('nodeWorkerTransport: `fileSystem` must be produced by a `fromX` factory');
  }

  let pools: ReturnType<typeof allocatePools> | undefined;
  const ensurePools = (): ReturnType<typeof allocatePools> => {
    pools ??= allocatePools({
      geometry: options.sharedMemory?.geometry,
    });
    return pools;
  };

  let bridge: ReturnType<typeof buildFileSystemBridge>;
  let openPromise: Promise<TransportClientReady> | undefined;
  let worker: NodeWorkerLike | undefined;
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
        throw new Error('nodeWorkerTransport: client closed before open()');
      }
      void ensurePools();
      const resolvedUrl = options.url ?? defaultNodeWorkerUrl;
      worker = Reflect.construct(ctor, [resolvedUrl]);
      port = wrapNodeWorkerAsPort(worker, `node-worker:${nodeWorkerId}`);
      channel = createChannelClient<RuntimeProtocol>({
        port,
        sessionKey: runtimeChannelSessionKey,
        protocolSchemas: runtimeProtocolSchemas,
      });
      return {
        channel,
        hello: buildHelloPayload(nodeWorkerId),
      };
    })();
    return openPromise;
  };

  return {
    id: nodeWorkerId,
    describe(): TransportDescriptor<NodeWorkerId> {
      return nodeWorkerClientDescribe(options);
    },
    open,
    async initialize(input: RuntimeInitializePayload): Promise<RuntimeInitializeResult> {
      if (!channel) {
        await open();
      }
      if (!channel) {
        throw new Error('nodeWorkerTransport: channel unavailable after open()');
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
        return result;
      } catch (error) {
        if (bridge) {
          try {
            bridge.dispose();
          } finally {
            bridge = undefined;
          }
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
        await worker?.terminate();
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

nodeWorkerClient.describe = nodeWorkerClientDescribe;
