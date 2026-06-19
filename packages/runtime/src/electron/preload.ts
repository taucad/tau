/**
 * Electron preload helper for exposing a Tau runtime port bridge.
 *
 * @public
 */

import { contextBridge, ipcRenderer } from 'electron';

import { electronRuntimeChannel } from '#electron/constants.js';

export type ExposeElectronRuntimeOptions = {
  readonly channel?: string;
  readonly debugGlobalName?: string;
  readonly globalName?: string;
};

export type ElectronRuntimePreloadBridge = {
  readonly relayTag: {
    readonly runtime: string;
  };
  requestRuntimePort(): void;
};

export const exposeElectronRuntime = (options: ExposeElectronRuntimeOptions = {}): ElectronRuntimePreloadBridge => {
  const channel = options.channel ?? electronRuntimeChannel;
  const relayTag = `${channel}:port`;
  const globalName = options.globalName ?? 'taucad';
  const debugGlobalName = options.debugGlobalName ?? '__TAU_ELECTRON_DEBUG';

  contextBridge.exposeInMainWorld(debugGlobalName, process.env['TAU_ELECTRON_DEBUG'] === '1');

  ipcRenderer.on(relayTag, (event) => {
    if (event.ports.length === 0) {
      return;
    }
    window.postMessage({ taucadRelay: relayTag }, '*', event.ports as unknown as Transferable[]);
  });

  const bridge = {
    requestRuntimePort: (): void => {
      ipcRenderer.send(channel);
    },
    relayTag: Object.freeze({
      runtime: relayTag,
    }),
  } satisfies ElectronRuntimePreloadBridge;

  contextBridge.exposeInMainWorld(globalName, bridge);
  return bridge;
};
