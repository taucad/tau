/**
 * Electron renderer helpers for connecting to a Tau utility-process runtime.
 *
 * @public
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public Electron renderer subpath */

export { electronUtilityClient, electronUtilityClientDescribe } from '#electron/electron-utility-client.js';
export { electronUtilityTransport } from '#electron/electron-utility-transport.js';
export type { ElectronUtilityClientOptions } from '#electron/electron-utility-transport.schemas.js';

export type ElectronRuntimeRendererBridge = {
  readonly relayTag: {
    readonly runtime: string;
  };
  requestRuntimePort(): void;
};

export type RequestElectronRuntimePortOptions = {
  readonly bridge?: ElectronRuntimeRendererBridge;
  readonly globalName?: string;
  readonly target?: ElectronRuntimeMessageTarget;
};

type ElectronRuntimeMessageTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

const isElectronRuntimeRendererBridge = (value: unknown): value is ElectronRuntimeRendererBridge =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as { requestRuntimePort?: unknown }).requestRuntimePort === 'function' &&
  typeof (value as { relayTag?: { runtime?: unknown } }).relayTag?.runtime === 'string';

export const getElectronRuntimeBridge = (globalName = 'taucad'): ElectronRuntimeRendererBridge => {
  const bridge = (globalThis as unknown as Record<string, unknown>)[globalName];
  if (!isElectronRuntimeRendererBridge(bridge)) {
    throw new Error(`getElectronRuntimeBridge: window.${globalName} bridge is unavailable`);
  }
  return bridge;
};

export const awaitElectronRuntimePort = async (
  relayTag: string,
  target: ElectronRuntimeMessageTarget = globalThis,
): Promise<MessagePort> =>
  new Promise<MessagePort>((resolve) => {
    const handler = (event: MessageEvent): void => {
      const data = event.data as { taucadRelay?: string } | undefined;
      if (!data || data.taucadRelay !== relayTag) {
        return;
      }
      const port = event.ports[0];
      if (!port) {
        return;
      }
      target.removeEventListener('message', handler);
      resolve(port);
    };
    target.addEventListener('message', handler);
  });

export const requestElectronRuntimePort = async (
  options: RequestElectronRuntimePortOptions = {},
): Promise<MessagePort> => {
  const bridge = options.bridge ?? getElectronRuntimeBridge(options.globalName);
  const target = options.target ?? globalThis;
  const portPromise = awaitElectronRuntimePort(bridge.relayTag.runtime, target);
  bridge.requestRuntimePort();
  const port = await portPromise;
  port.start();
  return port;
};
