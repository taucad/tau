/**
 * Electron renderer helpers for connecting to a Tau utility-process runtime.
 *
 * @public
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public Electron renderer subpath */

import type { RuntimeClientOptionsWithTransport } from '#client/runtime-client-core.js';
import { electronUtilityTransport } from '#electron/electron-utility-transport.js';
import type { AnyRuntimeDefinition, RuntimeConfigInput, RuntimeConfigProvider } from '#worker/runtime-definition.js';

export { electronUtilityClient, electronUtilityClientDescribe } from '#electron/electron-utility-client.js';
export { electronUtilityTransport } from '#electron/electron-utility-transport.js';
export type { ElectronUtilityTransportOptions } from '#electron/electron-utility-transport.schemas.js';

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

/**
 * Options for {@link createElectronClientOptions}.
 *
 * @public
 */
export type CreateElectronClientOptionsOptions<Runtime extends AnyRuntimeDefinition | undefined = undefined> =
  RequestElectronRuntimePortOptions & {
    /** Optional runtime client render timeout. */
    readonly renderTimeout?: number;
  } & ([RuntimeConfigInput<Runtime>] extends [never]
      ? { readonly config?: never }
      : undefined extends RuntimeConfigInput<Runtime>
        ? { readonly config?: RuntimeConfigProvider<Runtime> }
        : { readonly config: RuntimeConfigProvider<Runtime> });

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

/**
 * Builds an async runtime-client options provider for Electron renderers.
 *
 * Keep the returned provider in module scope and pass it to `useRuntime`.
 * It requests a fresh `MessagePort` from preload each time the hook creates a
 * client, then wraps the port in `electronUtilityTransport`.
 *
 * @public
 */
export const createElectronClientOptions = <Runtime extends AnyRuntimeDefinition | undefined = undefined>(
  options: CreateElectronClientOptionsOptions<Runtime> = {} as CreateElectronClientOptionsOptions<Runtime>,
): (() => Promise<RuntimeClientOptionsWithTransport<Runtime, ReturnType<typeof electronUtilityTransport>>>) => {
  const { config, renderTimeout, ...portOptions } = options;
  return async () => {
    const port = await requestElectronRuntimePort(portOptions);
    const clientOptions = {
      transport: electronUtilityTransport({ port }),
      ...(config === undefined ? {} : { config }),
      ...(renderTimeout === undefined ? {} : { renderTimeout }),
    };
    return clientOptions as RuntimeClientOptionsWithTransport<Runtime, ReturnType<typeof electronUtilityTransport>>;
  };
};
