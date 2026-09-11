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
    /** Relay tag carrying the exit code of a dead utility host. */
    readonly hostExit: string;
    /** Relay tag used for runtime utility-process port delivery. */
    readonly runtime: string;
  };
  /**
   * Ask the main process to spawn one utility runtime and relay its port.
   *
   * @param requestId - Opaque request identity echoed with the relayed port.
   * @param context - Optional flat string record the main-process broker
   * sanitizes and hands to its application fork resolver (e.g. `projectRoot`).
   * @returns Nothing.
   */
  requestRuntimePort(requestId: string, context?: Record<string, string>): void;
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
 * Forward one main-process IPC relay into this document's own window, carrying
 * whatever `MessagePort`s rode with it.
 *
 * A transferred port can only be received by main-world code, and `preload`
 * runs in the isolated world, so every Electron port hand-off in Tau takes this
 * one hop. Pair it with `awaitElectronRelayedPort` on the page side — that
 * helper owns the acceptance guard, so the payload is forwarded verbatim here
 * (with `taucadRelay` stamped last, so a payload cannot spoof the tag).
 *
 * @param tag - IPC channel the main process posts on; also the `taucadRelay`
 * discriminator the page matches. One tag per concern.
 * @returns Nothing.
 * @public
 *
 * @example <caption>Relay a shell's own service port</caption>
 * ```typescript
 * import { relayElectronPorts } from '@taucad/runtime/electron/preload';
 *
 * relayElectronPorts('tau:services-port');
 * ```
 */
export const relayElectronPorts = (tag: string): void => {
  ipcRenderer.on(tag, (event, payload: unknown) => {
    const message = { ...(payload as Record<string, unknown> | undefined), taucadRelay: tag };
    /* Target `'/'` — the spec's "same origin as this document" — never
     * `location.origin`: a `loadFile()` renderer has an opaque origin, whose
     * `location.origin` is the string `'null'` and is not a valid target. */
    if (event.ports.length === 0) {
      window.postMessage(message, '/');
      return;
    }
    window.postMessage(message, '/', event.ports as unknown as Transferable[]);
  });
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
  const hostExitTag = `${channel}:host-exit`;
  const globalName = options.globalName ?? 'taucad';
  const debugGlobalName = options.debugGlobalName ?? '__TAU_ELECTRON_DEBUG';

  contextBridge.exposeInMainWorld(debugGlobalName, process.env['TAU_ELECTRON_DEBUG'] === '1');

  /* Both tags relay the same way; the renderer's `hostId` match is the guard
   * that decides which relay belongs to which leased host. */
  relayElectronPorts(relayTag);
  relayElectronPorts(hostExitTag);

  const bridge = {
    /* Forwarded verbatim: main is the trust boundary and sanitizes it there,
     * so preload does not duplicate (or diverge from) that validation. */
    requestRuntimePort: (requestId, context): void => {
      ipcRenderer.send(channel, { requestId, context });
    },
    releaseRuntimeHost: (hostId, reason): void => {
      ipcRenderer.send(`${channel}:release`, { hostId, reason });
    },
    relayTag: Object.freeze({
      hostExit: hostExitTag,
      runtime: relayTag,
    }),
  } satisfies ElectronRuntimePreloadBridge;

  contextBridge.exposeInMainWorld(globalName, bridge);
  return bridge;
};
