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
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type { WorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
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
 * @param hostOptions - Runtime dispatcher and filesystem configuration.
 * @returns A transport host that accepts one parent-transferred boot frame.
 * @public
 */
export const electronUtilityHost = (
  hostOptions: ElectronUtilityHostOptions,
): RuntimeTransportHost<RuntimeProtocol, Readonly<Record<never, never>>, typeof electronUtilityId> => {
  const utilityFsBase = extractInlineFileSystem(hostOptions.fileSystem);

  debugLog('utility:host', 'constructed');

  let openPromise: Promise<TransportHostReady> | undefined;
  let dispatcherHandle: ChannelServerHandle<RuntimeProtocol> | undefined;
  let transferredFileSystem: WorkerFileSystemProxy | undefined;
  let receivedPortHandles: Array<{ close(): void }> = [];
  let fileSystemDisposed = false;
  let isClosed = false;
  let rejectOpen: ((reason?: unknown) => void) | undefined;

  const disposeFileSystem = (): void => {
    if (fileSystemDisposed) {
      return;
    }
    fileSystemDisposed = true;
    transferredFileSystem?.dispose();
    for (const portHandle of receivedPortHandles) {
      portHandle.close();
    }
    receivedPortHandles = [];
    if (utilityFsBase && 'dispose' in utilityFsBase && typeof utilityFsBase.dispose === 'function') {
      utilityFsBase.dispose();
    }
  };

  const closeReceivedPorts = (ports: readonly MessagePortMainLike[]): void => {
    for (const receivedPort of ports) {
      try {
        receivedPort.close();
      } catch {
        /* Best-effort */
      }
    }
  };

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
      rejectOpen = reject;
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
        disposeFileSystem();
        reject(new Error('electronUtilityHost: process.parentPort unavailable (must run inside utilityProcess)'));
        debugLog('utility:host', 'no-parent-port');
        return;
      }
      debugLog('utility:host', 'awaiting-parent-port-message');
      port.once(
        'message',
        (event: {
          readonly ports: readonly MessagePortMainLike[];
          readonly data?: {
            readonly computeBindingMode?: 'off' | 'memory' | 'durable';
            readonly computeStorePortIndex?: number;
            readonly fileSystemPortIndex?: number;
            readonly runtimePortIndex?: number;
          };
        }) => {
          if (isClosed) {
            closeReceivedPorts(event.ports);
            reject(new Error('electronUtilityHost: closed before parent boot frame'));
            return;
          }
          const runtimePortIndex = event.data?.runtimePortIndex ?? 0;
          const fileSystemPortIndex = event.data?.fileSystemPortIndex;
          const computeStorePortIndex =
            event.data?.computeStorePortIndex ??
            (fileSystemPortIndex === undefined && event.ports.length > 1 ? 1 : undefined);
          const indices = [runtimePortIndex, computeStorePortIndex, fileSystemPortIndex].filter(
            (index): index is number => index !== undefined,
          );
          debugLog('utility:host', 'parent-port-message-received', {
            portCount: event.ports.length,
          });
          if (
            indices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= event.ports.length) ||
            new Set(indices).size !== indices.length
          ) {
            closeReceivedPorts(event.ports);
            disposeFileSystem();
            reject(new Error('electronUtilityHost: hello frame contains invalid MessagePortMain indices'));
            return;
          }
          const utilityPort = event.ports[runtimePortIndex];
          const computeStorePort = computeStorePortIndex === undefined ? undefined : event.ports[computeStorePortIndex];
          const fileSystemPort = fileSystemPortIndex === undefined ? undefined : event.ports[fileSystemPortIndex];
          if (!utilityPort || (!utilityFsBase && !fileSystemPort) || (utilityFsBase && fileSystemPort)) {
            closeReceivedPorts(event.ports);
            disposeFileSystem();
            reject(
              new Error(
                utilityFsBase && fileSystemPort
                  ? 'electronUtilityHost: static and transferred filesystems are mutually exclusive'
                  : 'electronUtilityHost: hello frame missing runtime or filesystem MessagePortMain',
              ),
            );
            return;
          }
          const wireport = wrapMessagePortMain<unknown>(utilityPort, { label: 'utility:wire' });
          const wrappedFileSystemPort =
            fileSystemPort === undefined
              ? undefined
              : wrapMessagePortMain<unknown>(fileSystemPort, { label: 'utility:filesystem' });
          const wrappedComputeStorePort =
            computeStorePort === undefined
              ? undefined
              : wrapMessagePortMain(computeStorePort, { label: 'utility:compute' });
          receivedPortHandles = [wireport, wrappedFileSystemPort, wrappedComputeStorePort].filter(
            (handle): handle is NonNullable<typeof handle> => handle !== undefined,
          );
          // async-iife: bootstrap -- Electron event callbacks cannot return initialization settlement.
          void (async (): Promise<void> => {
            try {
              debugLog('utility:host', 'wire-port-wrapped');
              if (wrappedFileSystemPort) {
                const proxy = await createWorkerFileSystemProxy({
                  port: wrappedFileSystemPort,
                  dispose: () => {
                    wrappedFileSystemPort.close();
                  },
                });
                if (fileSystemDisposed) {
                  proxy.dispose();
                  throw new Error('electronUtilityHost: closed during filesystem handshake');
                }
                transferredFileSystem = proxy;
              }
              const { worker } = hostOptions;
              debugLog('utility:host', 'kernel-runtime-worker-instantiated');
              const dispatcher = createWorkerDispatcher(worker, wireport, {
                inlineFileSystem: transferredFileSystem ?? utilityFsBase!,
                computeBindingMode: event.data?.computeBindingMode === 'off' ? 'off' : 'memory',
                ...(wrappedComputeStorePort ? { computeStorePort: wrappedComputeStorePort } : {}),
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
              disposeFileSystem();
              debugLog('utility:host', 'dispatcher-init-failed', {
                error: error instanceof Error ? error.message : String(error),
              });
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          })();
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
      rejectOpen?.(new Error('electronUtilityHost: closed before parent boot frame'));
      try {
        dispatcherHandle?.dispose();
      } catch {
        /* Best-effort */
      }
      try {
        disposeFileSystem();
      } catch {
        /* Best-effort */
      }
      resolveClosed?.();
    },
    closed,
  };
};
