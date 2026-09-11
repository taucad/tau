/**
 * Electron utility-process transport — utility host factory (Topology C).
 *
 * @public
 */

import type { ChannelServerHandle, MessagePortMainLike } from '@taucad/rpc';
import { wrapMessagePortMain } from '@taucad/rpc';
import type {
  EncodedGeometry,
  HostInitializeBindings,
  RuntimeInitializeMemoryHandle,
  RuntimeTransportHost,
  TransportHostReady,
} from '#transport/index.js';
import type { Geometry } from '@taucad/types';
import type { RuntimeProtocol } from '#index.js';
import { extractInlineFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import { createWorkerDispatcher } from '#transport/_internal/runtime-worker-dispatcher.js';
import { installWorkerCrashTrap } from '#transport/_internal/worker-crash-trap.js';
import { encodeBinaryAsOwnedCopy, encodeGeometryAsOwnedCopy } from '#transport/_internal/owned-transfer-bytes.js';
import { buildHelloPayload } from '#transport/_internal/transport-hello.js';

import type { ElectronUtilityHostOptions } from '#electron/electron-utility-transport.schemas.js';

const electronUtilityId = 'electron-utility';

const debugEnabled = typeof process === 'undefined' ? true : process.env['TAU_ELECTRON_DEBUG'] === '1';

const debugLog = (origin: string, message: string, data?: Record<string, unknown>): void => {
  if (!debugEnabled) {
    return;
  }
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  // oxlint-disable-next-line no-console -- diagnostic seam
  console.log(`[tau-electron:${origin}] ${message}${payload}`);
};

/**
 * Utility-process kernel host factory (`MessagePortMain` from parent).
 *
 * @public
 */
export const electronUtilityHost = (
  hostOptions: ElectronUtilityHostOptions,
): RuntimeTransportHost<RuntimeProtocol, Readonly<Record<never, never>>, typeof electronUtilityId> => {
  const utilityFsBase = extractInlineFileSystem(hostOptions.fileSystem);
  if (!utilityFsBase) {
    throw new Error('electronUtilityHost: fileSystem option is required');
  }

  debugLog('utility:host', 'constructed');

  let openPromise: Promise<TransportHostReady> | undefined;
  let dispatcherHandle: ChannelServerHandle<RuntimeProtocol> | undefined;
  let isClosed = false;

  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  /* Encoders are inline-only — Electron `MessagePortMain` cannot
   * carry SAB or non-port transferables */
  const encodeGeometry = (geometry: Geometry): EncodedGeometry => {
    return encodeGeometryAsOwnedCopy(geometry);
  };

  const open = async (): Promise<TransportHostReady> => {
    if (openPromise) {
      return openPromise;
    }
    openPromise = new Promise<TransportHostReady>((resolve, reject) => {
      if (isClosed) {
        reject(new Error('electronUtilityHost: closed before open()'));
        return;
      }
      // oxlint-disable-next-line n/prefer-global/process -- guarded
      const procPort = (
        process as unknown as {
          readonly parentPort?: {
            once(event: string, listener: (event: { readonly ports: readonly MessagePortMainLike[] }) => void): void;
          };
        }
      ).parentPort;
      const { parentPort: globalParentPort } = globalThis as unknown as {
        readonly parentPort?: {
          once(event: string, listener: (event: { readonly ports: readonly MessagePortMainLike[] }) => void): void;
        };
      };
      const port = procPort ?? globalParentPort;
      if (!port) {
        reject(new Error('electronUtilityHost: process.parentPort unavailable (must run inside utilityProcess)'));
        debugLog('utility:host', 'no-parent-port');
        return;
      }
      debugLog('utility:host', 'awaiting-parent-port-message');
      port.once(
        'message',
        (event: {
          readonly ports: readonly MessagePortMainLike[];
          readonly data?: { readonly computeBindingMode?: 'off' | 'memory' | 'durable' };
        }) => {
          const [utilityPort, computeStorePort] = event.ports;
          debugLog('utility:host', 'parent-port-message-received', {
            portCount: event.ports.length,
          });
          if (!utilityPort) {
            reject(new Error('electronUtilityHost: hello frame missing MessagePortMain'));
            return;
          }
          try {
            const wireport = wrapMessagePortMain<unknown>(utilityPort, { label: 'utility:wire' });
            debugLog('utility:host', 'wire-port-wrapped');
            const { worker } = hostOptions;
            debugLog('utility:host', 'kernel-runtime-worker-instantiated');
            const dispatcher = createWorkerDispatcher(worker, wireport, {
              inlineFileSystem: utilityFsBase,
              computeBindingMode: event.data?.computeBindingMode === 'off' ? 'off' : 'memory',
              ...(computeStorePort
                ? { computeStorePort: wrapMessagePortMain(computeStorePort, { label: 'utility:compute' }) }
                : {}),
              encodeGeometry,
              encodeBinary: encodeBinaryAsOwnedCopy,
            });
            dispatcherHandle = dispatcher;
            debugLog('utility:host', 'dispatcher-wired');
            installWorkerCrashTrap(dispatcher);
            debugLog('utility:host', 'crash-trap-installed');
            resolve({
              channel: dispatcher,
              peerHello: buildHelloPayload(electronUtilityId),
            });
          } catch (error) {
            debugLog('utility:host', 'dispatcher-init-failed', {
              error: error instanceof Error ? error.message : String(error),
            });
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        },
      );
    });
    return openPromise;
  };

  return {
    id: electronUtilityId,
    open,
    adoptInitialize(_handle: RuntimeInitializeMemoryHandle): HostInitializeBindings {
      return {
        geometryDelivery: {
          publish(geometry): EncodedGeometry {
            return encodeGeometry(geometry);
          },
          publishBytes(_key, source) {
            return encodeBinaryAsOwnedCopy(_key, source);
          },
          acknowledge: () => undefined,
          tier: 'copy',
        },
      };
    },
    encodeGeometry,
    async close(reason?: string): Promise<void> {
      if (isClosed) {
        return;
      }
      isClosed = true;
      debugLog('utility:host', 'closing', reason ? { reason } : undefined);
      try {
        dispatcherHandle?.dispose();
      } catch {
        /* Best-effort */
      }
      resolveClosed?.();
    },
    closed,
  };
};
