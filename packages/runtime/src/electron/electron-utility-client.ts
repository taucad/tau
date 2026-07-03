/**
 * Electron utility-process transport — renderer client factory (Topology C).
 *
 * @public
 */

import { wrapMessagePort, createChannelClient } from '@taucad/rpc';
import type { Channel } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import type { GeometryTransport, RuntimeInitializeResult, RuntimeProtocol } from '#index.js';
import { runtimeProtocolSchemas } from '#transport/index.js';
import type {
  RuntimeInitializeMemoryHandle,
  RuntimeInitializePayload,
  RuntimeTransportClient,
  TransportClientReady,
  TransportDescriptor,
} from '#transport/index.js';

import type { ElectronUtilityTransportOptions } from '#electron/electron-utility-transport.schemas.js';

const electronUtilityId = 'electron-utility';
const sessionKey = 'tau.runtime/v1';

const isDebugEnabled = (): boolean => {
  if ((globalThis as { __TAU_ELECTRON_DEBUG?: unknown }).__TAU_ELECTRON_DEBUG === true) {
    return true;
  }
  // oxlint-disable-next-line n/prefer-global/process -- guarded by typeof check below
  const processEnv = typeof process === 'undefined' ? undefined : process.env;
  return processEnv?.['TAU_ELECTRON_DEBUG'] === '1';
};

const debugLog = (origin: string, message: string, data?: Record<string, unknown>): void => {
  if (!isDebugEnabled()) {
    return;
  }
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  // oxlint-disable-next-line no-console -- diagnostic seam (gated by TAU_ELECTRON_DEBUG)
  console.log(`[tau-electron:${origin}] ${message}${payload}`);
};

/** */
const abortReasonToCode = (reason: 'superseded' | 'timeout'): 0 | 1 | 2 => (reason === 'timeout' ? 2 : 1);

/** */
const buildHelloPayload = (): {
  readonly server: 'kernel-runtime-worker';
  readonly runtimeVersion: string;
  readonly transportId: typeof electronUtilityId;
} => ({
  server: 'kernel-runtime-worker',
  runtimeVersion: 'electron-utility',
  transportId: electronUtilityId,
});

/**
 * Pure descriptor for Electron utility renderer client options.
 *
 * @public
 */
export const electronUtilityClientDescribe = (
  _options: ElectronUtilityTransportOptions,
): TransportDescriptor<typeof electronUtilityId> => ({
  id: electronUtilityId,
  wire: 'electron-utility',
  memory: {
    geometryDelivery: 'copy',
    fileDelivery: 'copy',
    abortSignal: 'wire-notify',
  },
  fileSystem: 'host-local',
});

/**
 * Renderer-side client factory (`MessagePort`).
 *
 * @public
 */
export const electronUtilityClient = (
  clientOptions: ElectronUtilityTransportOptions,
): RuntimeTransportClient<RuntimeProtocol, Readonly<Record<never, never>>, typeof electronUtilityId> => {
  debugLog('renderer:client', 'constructed');
  const { port: receivedPort } = clientOptions;
  const wrappedPort = wrapMessagePort<unknown>(receivedPort, {
    label: 'electron-utility:renderer',
  });
  debugLog('renderer:client', 'port-wrapped');

  let openPromise: Promise<TransportClientReady> | undefined;
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
        throw new Error('electronUtilityClient: closed before open()');
      }
      channel = createChannelClient<RuntimeProtocol>({
        port: wrappedPort,
        sessionKey,
        protocolSchemas: runtimeProtocolSchemas,
      });
      debugLog('renderer:client', 'channel-created');
      await channel.ready;
      debugLog('renderer:client', 'channel-ready');
      return {
        channel,
        hello: buildHelloPayload(),
      };
    })();
    return openPromise;
  };

  return {
    id: electronUtilityId,
    describe(): TransportDescriptor<typeof electronUtilityId> {
      return electronUtilityClientDescribe(clientOptions);
    },
    open,
    async initialize(input: RuntimeInitializePayload): Promise<RuntimeInitializeResult> {
      if (!channel) {
        await open();
      }
      if (!channel) {
        throw new Error('electronUtilityClient: channel unavailable after open()');
      }
      const memoryHandle: RuntimeInitializeMemoryHandle = {};
      return channel.call('initialize', { ...input, memoryHandle });
    },
    abort(reason): void {
      if (!channel) {
        return;
      }
      debugLog('renderer:client', 'abort', { reason });
      try {
        channel.notify('abort', { reason: abortReasonToCode(reason) });
      } catch {
        /* Best-effort */
      }
    },
    async resolveGeometry(transport: GeometryTransport): Promise<Geometry> {
      if (transport.format !== 'gltf') {
        throw new Error(`electronUtilityClient: unsupported geometry format '${transport.format}'`);
      }
      const content = transport.content as { delivery: 'inline'; bytes: Uint8Array<ArrayBuffer> };
      return { format: 'gltf', content: content.bytes, hash: transport.hash };
    },
    async close(reason?: string): Promise<void> {
      if (isClosed) {
        return;
      }
      isClosed = true;
      debugLog('renderer:client', 'closing', reason ? { reason } : undefined);
      try {
        channel?.close(reason);
      } catch {
        /* Best-effort */
      }
      try {
        wrappedPort.close();
      } catch {
        /* Best-effort */
      }
      resolveClosed?.();
    },
    closed,
  };
};

electronUtilityClient.describe = electronUtilityClientDescribe;
