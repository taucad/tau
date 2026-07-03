/**
 * Electron utility-process transport — utility host factory (Topology C).
 *
 * @public
 */

import type { ChannelServerHandle, Port } from '@taucad/rpc';
import type {
  EncodedFileBytes,
  EncodedGeometry,
  HostInitializeBindings,
  RuntimeInitializeMemoryHandle,
  RuntimeTransportHost,
  TransportHostReady,
} from '#transport/index.js';
import type { Geometry } from '@taucad/types';
import type { RuntimeProtocol } from '#index.js';
import { extractInlineFileSystem } from '#transport-internals.js';
import { installWorkerCrashTrap, createWorkerDispatcher } from '#worker-internals.js';
import { encodeFileAsOwnedCopy, encodeGeometryAsOwnedCopy } from '#transport/_internal/owned-transfer-bytes.js';

import type { ElectronUtilityHostOptions } from '#electron/electron-utility-transport.schemas.js';

type MessagePortMainLike = {
  postMessage(value: unknown, transfer?: readonly unknown[]): void;
  on(event: 'message', listener: (event: { readonly data: unknown }) => void): MessagePortMainLike;
  on(event: 'close', listener: () => void): MessagePortMainLike;
  start(): void;
  close(): void;
};

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

const summariseFrame = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object') {
    return { frameType: typeof value };
  }
  const record = value as Record<string, unknown>;
  return {
    k: record['k'],
    n: record['n'],
    a:
      typeof record['a'] === 'object' && record['a'] !== null
        ? Object.fromEntries(
            Object.entries(record['a'] as Record<string, unknown>).filter(([key]) =>
              ['state', 'detail', 'rgen', 'kernelId', 'reason'].includes(key),
            ),
          )
        : undefined,
    r: record['r'],
    kind: record['kind'],
    method: record['method'],
    name: record['name'],
    id: record['id'],
    keys: Object.keys(record),
  };
};

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

/** */
const wrapMessagePortMain = (port: MessagePortMainLike, label: string): Port<unknown> => {
  let started = false;
  let closed = false;
  const handlers = new Set<(value: unknown) => void>();

  const onPortMessage = (event: { readonly data: unknown }): void => {
    if (closed) {
      return;
    }
    debugLog(label, 'rx-frame', summariseFrame(event.data));
    for (const handler of handlers) {
      handler(event.data);
    }
  };

  port.on('close', () => {
    debugLog(label, 'underlying-port-closed');
    closed = true;
    handlers.clear();
  });

  return {
    postMessage(value, transferables) {
      if (closed) {
        debugLog(label, 'tx-after-close-dropped');
        return;
      }
      const tList = transferables ? [...(transferables as readonly unknown[])] : undefined;
      const portsOnly = tList?.filter(
        (entry): entry is MessagePortMainLike =>
          entry !== null &&
          typeof entry === 'object' &&
          typeof (entry as { postMessage?: unknown }).postMessage === 'function' &&
          typeof (entry as { start?: unknown }).start === 'function',
      );
      debugLog(label, 'tx-frame', {
        transferableCount: tList?.length ?? 0,
        portsOnlyCount: portsOnly?.length ?? 0,
        ...summariseFrame(value),
      });
      if (portsOnly && portsOnly.length > 0) {
        port.postMessage(value, portsOnly);
      } else {
        port.postMessage(value);
      }
    },
    onMessage(handler) {
      handlers.add(handler);
      if (!started) {
        started = true;
        debugLog(label, 'starting-port');
        port.on('message', onPortMessage);
        port.start();
      }
      return () => {
        handlers.delete(handler);
      };
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      handlers.clear();
      try {
        port.close();
      } catch (error) {
        throw new Error(`${label}: close failed`, { cause: error });
      }
    },
  };
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

  // oxlint-disable-next-line enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- binding signature uses Uint8Array
  const encodeFile = (file: Uint8Array): EncodedFileBytes => {
    return encodeFileAsOwnedCopy(file as Uint8Array<ArrayBuffer>);
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
      port.once('message', (event: { readonly ports: readonly MessagePortMainLike[] }) => {
        const [utilityPort] = event.ports;
        debugLog('utility:host', 'parent-port-message-received', {
          portCount: event.ports.length,
        });
        if (!utilityPort) {
          reject(new Error('electronUtilityHost: hello frame missing MessagePortMain'));
          return;
        }
        try {
          const wireport = wrapMessagePortMain(utilityPort, 'utility:wire');
          debugLog('utility:host', 'wire-port-wrapped');
          const { worker } = hostOptions;
          debugLog('utility:host', 'kernel-runtime-worker-instantiated');
          const dispatcher = createWorkerDispatcher(worker, wireport, {
            inlineFileSystem: utilityFsBase,
            encodeGeometry,
            encodeFile,
          });
          dispatcherHandle = dispatcher;
          debugLog('utility:host', 'dispatcher-wired');
          installWorkerCrashTrap(dispatcher);
          debugLog('utility:host', 'crash-trap-installed');
          resolve({
            channel: dispatcher,
            peerHello: buildHelloPayload(),
          });
        } catch (error) {
          debugLog('utility:host', 'dispatcher-init-failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
    return openPromise;
  };

  return {
    id: electronUtilityId,
    open,
    adoptInitialize(_handle: RuntimeInitializeMemoryHandle): HostInitializeBindings {
      const controller = new AbortController();
      return {
        abort: {
          signal: controller.signal,
          strategy: 'wire-notify',
        },
        geometryDelivery: {
          publish(geometry): EncodedGeometry {
            return encodeGeometry(geometry);
          },
          tier: 'copy',
        },
        fileDelivery: {
          publish(file): EncodedFileBytes {
            return encodeFile(file);
          },
          tier: 'copy',
        },
      };
    },
    encodeGeometry,
    encodeFile,
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
