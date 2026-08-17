/**
 * Electron utility-process transport — utility host factory (Topology C).
 *
 * @public
 */

import { Topic } from '@taucad/events';
import type { ChannelServerHandle, Port } from '@taucad/rpc';
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
import { encodeGeometryAsOwnedCopy } from '#transport/_internal/owned-transfer-bytes.js';
import { buildHelloPayload } from '#transport/_internal/transport-hello.js';

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
              ['state', 'detail', 'renderId', 'kernelId', 'reason'].includes(key),
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
const wrapMessagePortMain = (port: MessagePortMainLike, label: string): Port<unknown> => {
  let started = false;
  let closed = false;
  const messages = new Topic<unknown>({ name: `electron-utility:${label}` });

  const onPortMessage = (event: { readonly data: unknown }): void => {
    if (closed) {
      return;
    }
    debugLog(label, 'rx-frame', summariseFrame(event.data));
    messages.emit(event.data);
  };

  port.on('close', () => {
    debugLog(label, 'underlying-port-closed');
    closed = true;
    messages.dispose();
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
      const unsubscribe = messages.subscribe(handler);
      if (!started) {
        started = true;
        debugLog(label, 'starting-port');
        port.on('message', onPortMessage);
        port.start();
      }
      return unsubscribe;
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      messages.dispose();
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
      });
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
