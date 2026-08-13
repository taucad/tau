/**
 * Electron preload helper for exposing a Tau runtime port bridge.
 *
 * @public
 */

import { contextBridge, ipcRenderer } from 'electron';

import { electronRuntimeChannel } from '#electron/constants.js';

/**
 * Options for {@link exposeElectronRuntime}.
 *
 * @public
 */
export type ExposeElectronRuntimeOptions = {
  /** IPC channel shared with the main-process broker. */
  readonly channel?: string;
  /** Renderer global used for the debug flag. */
  readonly debugGlobalName?: string;
  /** Renderer global used for the request/release bridge. */
  readonly globalName?: string;
};

/**
 * Narrow preload bridge exposed to an Electron renderer.
 *
 * @public
 */
export type ElectronRuntimePreloadBridge = {
  /** Relay tags exposed to the renderer. */
  readonly relayTag: {
    /** Relay tag used for runtime utility-process port delivery. */
    readonly runtime: string;
  };
  /** Ask the main process to spawn one utility runtime and relay its port. */
  requestRuntimePort(): void;
  /**
   * Release exactly one opaque utility host lease.
   *
   * @param hostId - Opaque lease received with the relayed runtime port.
   * @param reason - Requested shutdown or hard render-timeout recovery.
   * @returns Nothing.
   */
  releaseRuntimeHost(hostId: string, reason: 'requested' | 'render-timeout'): void;
};

/**
 * Expose the narrow runtime request/release bridge from Electron preload.
 *
 * @param options - Optional IPC channel and renderer-global names.
 * @returns The bridge exposed to the renderer.
 * @public
 *
 * @example <caption>Expose the default preload bridge</caption>
 * ```typescript
 * import { exposeElectronRuntime } from '@taucad/runtime/electron/preload';
 *
 * exposeElectronRuntime();
 * ```
 */
export const exposeElectronRuntime = (options: ExposeElectronRuntimeOptions = {}): ElectronRuntimePreloadBridge => {
  const channel = options.channel ?? electronRuntimeChannel;
  const relayTag = `${channel}:port`;
  const globalName = options.globalName ?? 'taucad';
  const debugGlobalName = options.debugGlobalName ?? '__TAU_ELECTRON_DEBUG';

  contextBridge.exposeInMainWorld(debugGlobalName, process.env['TAU_ELECTRON_DEBUG'] === '1');

  ipcRenderer.on(relayTag, (event, payload: unknown) => {
    if (event.ports.length === 0) {
      return;
    }
    const hostId =
      payload && typeof payload === 'object' && typeof (payload as { hostId?: unknown }).hostId === 'string'
        ? (payload as { hostId: string }).hostId
        : undefined;
    if (!hostId) {
      return;
    }
    window.postMessage({ taucadRelay: relayTag, hostId }, '*', event.ports as unknown as Transferable[]);
  });

  const bridge = {
    requestRuntimePort: (): void => {
      ipcRenderer.send(channel);
    },
    releaseRuntimeHost: (hostId, reason): void => {
      ipcRenderer.send(`${channel}:release`, { hostId, reason });
    },
    relayTag: Object.freeze({
      runtime: relayTag,
    }),
  } satisfies ElectronRuntimePreloadBridge;

  contextBridge.exposeInMainWorld(globalName, bridge);
  return bridge;
};
