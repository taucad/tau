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
import { materialiseGeometry } from '#transport/_internal/geometry-materialiser.js';
import { triggerRenderTimeout } from '#transport/_internal/abort-channel.js';
import type {
  RuntimeInitializeMemoryHandle,
  RuntimeInitializePayload,
  RuntimeTransportCloseResult,
  RuntimeTransportClient,
  TransportClientReady,
  TransportDescriptor,
} from '#transport/index.js';

import type { ElectronUtilityTransportOptions } from '#electron/electron-utility-transport.schemas.js';
import { takeElectronRuntimeHostRelease } from '#electron/_internal/runtime-host-lease.js';

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
  const releaseRuntimeHost = takeElectronRuntimeHostRelease(receivedPort);
  const wrappedPort = wrapMessagePort<unknown>(receivedPort, {
    label: 'electron-utility:renderer',
  });
  debugLog('renderer:client', 'port-wrapped');

  let openPromise: Promise<TransportClientReady> | undefined;
  let channel: Channel<RuntimeProtocol> | undefined;
  let isClosed = false;

  let resolveClosed: ((result: RuntimeTransportCloseResult) => void) | undefined;
  const closed = new Promise<RuntimeTransportCloseResult>((resolve) => {
    resolveClosed = resolve;
  });

  const finish = async (result: RuntimeTransportCloseResult): Promise<void> => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    debugLog('renderer:client', 'closing', { reason: result.cause });
    try {
      channel?.close(result.cause);
    } catch {
      /* Best-effort */
    }
    try {
      wrappedPort.close();
    } catch {
      /* Best-effort */
    }
    try {
      releaseRuntimeHost?.(result.cause === 'render-timeout' ? 'render-timeout' : 'requested');
    } catch {
      /* Best-effort */
    }
    resolveClosed?.(result);
  };

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
      return { channel };
    })();
    return openPromise;
  };

  return {
    id: electronUtilityId,
    reservePreview() {
      return {};
    },
    renderTimeoutRecovery: {
      kind: 'terminable',
      abortRender(target): void {
        if (!channel) {
          return;
        }
        debugLog('renderer:client', 'render-timeout', target);
        /* No SAB on this wire — `undefined` signal buffer, wire notify only.
         * A closed-channel throw is caught by the sole caller
         * (`handleRenderTimeout`), which has already armed host-termination
         * escalation. */
        triggerRenderTimeout(channel, undefined, target);
      },
      async terminate(): Promise<void> {
        await finish({ cause: 'render-timeout' });
      },
    },
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
    async resolveGeometry(transport: GeometryTransport): Promise<Geometry> {
      return materialiseGeometry(transport, undefined);
    },
    async close(): Promise<void> {
      await finish({ cause: 'requested' });
    },
    closed,
  };
};

electronUtilityClient.describe = electronUtilityClientDescribe;
