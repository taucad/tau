/**
 * In-process transport — standalone client factory.
 *
 * Uses an internal `MessageChannel` so the channel protocol stays
 * uniform with worker transports — see `inProcessTransport` composition
 * in `in-process-transport.ts`.
 *
 * @public
 */

import type { z } from 'zod';
import { createChannelClient, wrapMessagePort } from '@taucad/rpc';
import type { Channel } from '@taucad/rpc';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';
import type { Geometry } from '@taucad/types';
import type { inProcessClientOptionsSchema } from '#transport/in-process-transport.schemas.js';
import type { GeometryTransport, RuntimeInitializeResult, RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type {
  EncodedFileBytes,
  EncodedGeometry,
  RuntimeInitializeMemoryHandle,
  RuntimeInitializePayload,
  RuntimeTransportClient,
  TransportClientReady,
  TransportDescriptor,
} from '#transport/runtime-transport.types.js';
import { runtimeChannelSessionKey } from '#transport/_internal/runtime-worker-dispatcher.js';
import { isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { buildFileSystemBridge } from '#transport/_internal/file-system-bridge.js';
import { resolveRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import { materialiseGeometry } from '#transport/_internal/geometry-materialiser.js';
import { allocatePools } from '#transport/_internal/sab-pools.js';
import type { AllocatedPools } from '#transport/_internal/sab-pools.js';
import { triggerAbort } from '#transport/_internal/abort-channel.js';
import { buildHelloPayload } from '#transport/_internal/transport-hello.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';

/** Canonical id literal for bundled in-process transport. */
export const inProcessId = 'in-process';

/**
 *
 */
type InProcessClientSchemaOptions = z.input<typeof inProcessClientOptionsSchema>;

/**
 * Consumer options for {@link inProcessTransport}. The same-isolate transport
 * owns host creation, so the worker-owned runtime definition is required here
 * rather than on `createRuntimeClient`.
 *
 * @public
 */
export type InProcessClientOptions<Runtime extends AnyRuntimeDefinition = AnyRuntimeDefinition> = Omit<
  InProcessClientSchemaOptions,
  'runtime'
> & {
  readonly runtime: Runtime;
};

/**
 * Pure diagnostic snapshot for {@link InProcessClientOptions} — never
 * allocates pools or opens a wire.
 *
 * @public
 */
export const inProcessClientDescribe = (
  options: InProcessClientSchemaOptions,
): TransportDescriptor<typeof inProcessId> => {
  const sabAvailable = typeof SharedArrayBuffer === 'function';
  return {
    id: inProcessId,
    wire: 'in-process',
    memory: {
      geometryDelivery: sabAvailable ? 'pool' : 'copy',
      fileDelivery: sabAvailable ? 'pool' : 'copy',
      abortSignal: sabAvailable ? 'sab-atomics' : 'wire-notify',
    },
    fileSystem: options.fileSystem === undefined ? 'unbound' : 'inline',
  };
};

/**
 * Standalone in-process transport client factory.
 *
 * @param options - See {@link InProcessClientOptions}.
 * @public
 */
export const inProcessClient = (
  options: InProcessClientSchemaOptions,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, typeof inProcessId> => {
  const { fileSystem, runtime } = options as InProcessClientSchemaOptions & { readonly runtime?: AnyRuntimeDefinition };
  if (fileSystem !== undefined && !isRuntimeFileSystem(fileSystem)) {
    throw new TypeError('inProcessTransport: `fileSystem` must be produced by a `fromX` factory');
  }
  const fileSystemHandle = fileSystem === undefined ? undefined : resolveRuntimeFileSystem(fileSystem);
  const inlineFileSystem = fileSystemHandle?.kind === 'inline' ? fileSystemHandle.create() : undefined;

  let bridge: ReturnType<typeof buildFileSystemBridge>;
  let pooled: AllocatedPools | undefined;
  let channelPair: MessageChannel | undefined;
  let wrappedClientPort: ReturnType<typeof wrapMessagePort<unknown>> | undefined;
  let wrappedHostPort: ReturnType<typeof wrapMessagePort<unknown>> | undefined;
  let openPromise: Promise<TransportClientReady> | undefined;
  let channel: Channel<RuntimeProtocol> | undefined;
  let isClosed = false;

  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const ensurePoolsAndPorts = (): {
    readonly pooled: AllocatedPools;
    readonly clientPort: ReturnType<typeof wrapMessagePort<unknown>>;
    readonly hostPort: ReturnType<typeof wrapMessagePort<unknown>>;
    readonly geometryPool: AllocatedPools['geometryPool'];
    readonly filePool: AllocatedPools['filePool'];
  } => {
    if (!pooled || !channelPair || !wrappedClientPort || !wrappedHostPort) {
      pooled = allocatePools({
        geometry: options.geometry ?? { bytes: 64 * 1024 * 1024 },
        files: options.files ?? { bytes: 8 * 1024 * 1024 },
      });
      channelPair = new MessageChannel();
      wrappedClientPort = wrapMessagePort<unknown>(channelPair.port1, { label: 'in-process:client' });
      wrappedHostPort = wrapMessagePort<unknown>(channelPair.port2, { label: 'in-process:host' });
    }
    return {
      pooled,
      geometryPool: pooled.geometryPool,
      filePool: pooled.filePool,
      clientPort: wrappedClientPort,
      hostPort: wrappedHostPort,
    };
  };

  const encodeGeometry: (geometry: Geometry) => EncodedGeometry = (geometry) => {
    const { geometryPool } = ensurePoolsAndPorts();
    if (geometry.format !== 'gltf') {
      return { value: geometry, transferables: [], tier: 'copy' };
    }
    if (geometryPool) {
      if (!geometryPool.has(geometry.hash)) {
        geometryPool.store(geometry.hash, geometry.content);
      }
      if (geometryPool.has(geometry.hash)) {
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
    }
    return {
      value: {
        format: 'gltf',
        content: { delivery: 'inline', bytes: geometry.content },
        hash: geometry.hash,
      },
      transferables: [],
      tier: 'copy',
    };
  };

  const encodeFile: (file: Uint8Array<ArrayBuffer>) => EncodedFileBytes = (file) => {
    const { filePool } = ensurePoolsAndPorts();
    if (filePool) {
      const hash = `inline-${file.byteLength}`;
      if (!filePool.has(hash)) {
        filePool.store(hash, file);
      }
      if (filePool.has(hash)) {
        return { value: { delivery: 'pooled', key: hash }, transferables: [], tier: 'pool' };
      }
    }
    return { value: { delivery: 'inline', bytes: file }, transferables: [], tier: 'copy' };
  };

  const open = async (): Promise<TransportClientReady> => {
    if (openPromise) {
      return openPromise;
    }
    openPromise = (async () => {
      if (isClosed) {
        throw new Error('inProcessTransport: client closed before open()');
      }

      const { hostPort } = ensurePoolsAndPorts();

      const [kernelWorkerModule, { createWorkerDispatcher }] = await Promise.all([
        import('#framework/kernel-runtime-worker.js'),
        import('#transport/_internal/runtime-worker-dispatcher.js'),
      ]);
      if (!runtime) {
        throw new Error('inProcessTransport: `runtime` is required so the in-process host can own executable modules');
      }
      const worker = new kernelWorkerModule.KernelRuntimeWorker({ runtime });
      createWorkerDispatcher(worker, hostPort, {
        inlineFileSystem,
        encodeGeometry,
        encodeFile,
      });
      channel = createChannelClient<RuntimeProtocol>({
        port: ensurePoolsAndPorts().clientPort,
        sessionKey: runtimeChannelSessionKey,
        protocolSchemas: runtimeProtocolSchemas,
      });
      await channel.ready;
      return {
        channel,
        hello: buildHelloPayload(inProcessId),
      };
    })();
    return openPromise;
  };

  return {
    id: inProcessId,
    describe(): TransportDescriptor<typeof inProcessId> {
      return inProcessClientDescribe(options);
    },
    open,
    async initialize(input: RuntimeInitializePayload): Promise<RuntimeInitializeResult> {
      if (!channel) {
        await open();
      }
      if (!channel || !pooled) {
        throw new Error('inProcessTransport: channel unavailable after open()');
      }
      if (fileSystemHandle?.kind === 'channel') {
        bridge ??= buildFileSystemBridge(fileSystem);
      }
      const memoryHandle: RuntimeInitializeMemoryHandle = {
        ...(pooled.signalBuffer ? { signalBuffer: pooled.signalBuffer } : {}),
        ...(pooled.geometryPoolBuffer ? { geometryPoolBuffer: pooled.geometryPoolBuffer } : {}),
        ...(pooled.filePoolBuffer ? { filePoolBuffer: pooled.filePoolBuffer } : {}),
        ...(bridge ? { fileSystemPort: bridge.port } : {}),
      };
      const args = { ...input, memoryHandle };
      try {
        return await channel.call('initialize', bridge ? { value: args, transferables: [bridge.port] } : args);
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
      if (!channel || !pooled) {
        return;
      }
      triggerAbort(channel, pooled.signalBuffer, reason);
    },
    async resolveGeometry(transport: GeometryTransport): Promise<Geometry> {
      return materialiseGeometry(transport, pooled?.geometryPool);
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
        wrappedClientPort?.close();
      } catch {
        /* Best-effort */
      }
      try {
        wrappedHostPort?.close();
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

inProcessClient.describe = inProcessClientDescribe;
