/**
 * Electron renderer helpers for connecting to a Tau utility-process runtime.
 *
 * @public
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public Electron renderer subpath */

import type { RuntimeClientOptionsWithTransport } from '#client/runtime-client-core.js';
import { electronUtilityTransport } from '#electron/electron-utility-transport.js';
import type { AnyRuntimeDefinition, RuntimeConfigInput, RuntimeConfigProvider } from '#worker/runtime-definition.js';
import { registerElectronRuntimeHostRelease } from '#electron/_internal/runtime-host-lease.js';

export { electronUtilityClient, electronUtilityClientDescribe } from '#electron/electron-utility-client.js';
export { electronUtilityTransport } from '#electron/electron-utility-transport.js';
export type { ElectronUtilityTransportOptions } from '#electron/electron-utility-transport.schemas.js';

/**
 * Renderer-facing view of the bridge exposed by Electron preload.
 *
 * @public
 */
export type ElectronRuntimeRendererBridge = {
  /** Relay tags exposed by preload for Electron runtime messages. */
  readonly relayTag: {
    /** Relay tag used for runtime utility-process port delivery. */
    readonly runtime: string;
  };
  /** Ask the main process to spawn one utility runtime and relay its port. */
  requestRuntimePort(): void;
  /**
   * Release exactly one opaque utility host lease. Called by the transport;
   * application code should normally use `RuntimeClient.terminate()`.
   */
  releaseRuntimeHost(hostId: string, reason: 'requested' | 'render-timeout'): void;
};

/**
 * Options for requesting a leased Electron utility-process port.
 *
 * @public
 */
export type RequestElectronRuntimePortOptions = {
  /** Explicit preload bridge, primarily for alternate globals and tests. */
  readonly bridge?: ElectronRuntimeRendererBridge;
  /** Name of the preload bridge on `window`. Defaults to `taucad`. */
  readonly globalName?: string;
  /** Message target that receives the relayed utility-process port. */
  readonly target?: ElectronRuntimeMessageTarget;
};

/**
 * Options for {@link createElectronClientOptions}.
 *
 * @public
 */
export type CreateElectronClientOptionsOptions<Runtime extends AnyRuntimeDefinition | undefined = undefined> =
  RequestElectronRuntimePortOptions & {
    /**
     * Wall-clock deadline applied independently to each preview. Milliseconds.
     * Zero disables timeout enforcement.
     */
    readonly renderTimeout?: number;
  } & ([RuntimeConfigInput<Runtime>] extends [never]
      ? { readonly config?: never }
      : undefined extends RuntimeConfigInput<Runtime>
        ? { readonly config?: RuntimeConfigProvider<Runtime> }
        : { readonly config: RuntimeConfigProvider<Runtime> });

type ElectronRuntimeMessageTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;
const runtimeHostIdsByPort = new WeakMap<MessagePort, string>();

const isElectronRuntimeRendererBridge = (value: unknown): value is ElectronRuntimeRendererBridge =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as { requestRuntimePort?: unknown }).requestRuntimePort === 'function' &&
  typeof (value as { releaseRuntimeHost?: unknown }).releaseRuntimeHost === 'function' &&
  typeof (value as { relayTag?: { runtime?: unknown } }).relayTag?.runtime === 'string';

/**
 * Resolve and validate the preload bridge exposed in the renderer global.
 *
 * @param globalName - Renderer global containing the preload bridge.
 * @returns The validated Electron runtime bridge.
 * @public
 */
export const getElectronRuntimeBridge = (globalName = 'taucad'): ElectronRuntimeRendererBridge => {
  const bridge = (globalThis as unknown as Record<string, unknown>)[globalName];
  if (!isElectronRuntimeRendererBridge(bridge)) {
    throw new Error(`getElectronRuntimeBridge: window.${globalName} bridge is unavailable`);
  }
  return bridge;
};

/**
 * Await one relayed Electron utility-process port and retain its opaque host lease.
 *
 * @param relayTag - Preload relay tag to match.
 * @param target - Renderer message target.
 * @returns A promise resolving with the leased runtime port.
 * @public
 */
export const awaitElectronRuntimePort = async (
  relayTag: string,
  target: ElectronRuntimeMessageTarget = globalThis,
): Promise<MessagePort> =>
  new Promise<MessagePort>((resolve) => {
    const handler = (event: MessageEvent): void => {
      const data = event.data as { taucadRelay?: string; hostId?: string } | undefined;
      if (!data || data.taucadRelay !== relayTag) {
        return;
      }
      const port = event.ports[0];
      if (!port || typeof data.hostId !== 'string') {
        return;
      }
      runtimeHostIdsByPort.set(port, data.hostId);
      target.removeEventListener('message', handler);
      resolve(port);
    };
    target.addEventListener('message', handler);
  });

/**
 * Request one Electron utility-process runtime from preload.
 *
 * @param options - Optional bridge, global name, and message target overrides.
 * @returns A promise resolving with the leased runtime port.
 * @public
 */
export const requestElectronRuntimePort = async (
  options: RequestElectronRuntimePortOptions = {},
): Promise<MessagePort> => {
  const bridge = options.bridge ?? getElectronRuntimeBridge(options.globalName);
  const target = options.target ?? globalThis;
  const portPromise = awaitElectronRuntimePort(bridge.relayTag.runtime, target);
  bridge.requestRuntimePort();
  const port = await portPromise;
  const hostId = runtimeHostIdsByPort.get(port);
  runtimeHostIdsByPort.delete(port);
  if (!hostId) {
    port.close();
    throw new Error('requestElectronRuntimePort: preload relay omitted the runtime host ID');
  }
  registerElectronRuntimeHostRelease(port, (reason) => {
    bridge.releaseRuntimeHost(hostId, reason);
  });
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
 * @param options - Renderer bridge/config options and optional render deadline.
 * @returns A stable provider that materializes fresh client options per client lifecycle.
 * @public
 *
 * @example <caption>Create an Electron renderer transport</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime/client';
 * import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
 *
 * const provideClientOptions = createElectronClientOptions({ renderTimeout: 60_000 });
 * const client = createRuntimeClient(await provideClientOptions());
 * ```
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
