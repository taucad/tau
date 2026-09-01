/**
 * Electron renderer helpers for connecting to a Tau utility-process runtime.
 *
 * @public
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public Electron renderer subpath */

import type { RuntimeClientOptionsWithTransport } from '#client/runtime-client-core.js';
import { electronUtilityTransport } from '#electron/electron-utility-transport.js';
import type { AnyRuntimeDefinition, RuntimeConfigInput, RuntimeConfigProvider } from '#worker/runtime-definition.js';
import {
  registerElectronRuntimeHostExit,
  registerElectronRuntimeHostRelease,
} from '#electron/_internal/runtime-host-lease.js';

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
    /**
     * Relay tag carrying the exit code of a dead utility host. Optional so a
     * preload bundled before this tag existed still satisfies the bridge; the
     * exit relay is simply not subscribed when it is absent.
     */
    readonly hostExit?: string;
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
export type ElectronClientOptionsInput<Runtime extends AnyRuntimeDefinition | undefined = undefined> =
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

/* The relay crosses the page's own `window`, so any script or same-page frame
 * can post one; `contextIsolation` does not fence it. The `source` identity
 * check is the load-bearing condition — a foreign window cannot forge its own
 * identity. The origin comparison is the cheap second condition and is
 * honestly weak here: a `loadFile()` document has an opaque origin, where both
 * sides stringify as `'null'`. */
const isSameWindowRelay = (event: MessageEvent): boolean =>
  event.source === globalThis.window && event.origin === globalThis.location.origin;

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
      if (!data || data.taucadRelay !== relayTag || !isSameWindowRelay(event)) {
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
  /* One release closure for both triggers. The transport client takes the
   * lease at materialize time, so `pagehide` must call this same closure —
   * re-taking the lease from the listener would release nothing. The document
   * is unloading and main kills the utility, so the port is left alone; a
   * `persisted` branch is unnecessary because Electron renderers have no
   * back/forward cache. */
  let released = false;
  const onPagehide = (): void => {
    release('requested');
  };
  /* Main relays the dead utility's exit code through the same preload relay
   * that carried the port. The client subscribes at materialize time, so the
   * notifier is a slot the listener reads rather than a callback it captures. */
  let notifyHostExit: ((exitCode?: number) => void) | undefined;
  const hostExitTag = bridge.relayTag.hostExit;
  const onHostExit = (event: MessageEvent): void => {
    const data = event.data as { taucadRelay?: string; hostId?: string; exitCode?: number } | undefined;
    if (!data || data.taucadRelay !== hostExitTag || data.hostId !== hostId || !isSameWindowRelay(event)) {
      return;
    }
    notifyHostExit?.(data.exitCode);
  };
  const release = (reason: 'requested' | 'render-timeout'): void => {
    if (released) {
      return;
    }
    released = true;
    target.removeEventListener('pagehide', onPagehide);
    target.removeEventListener('message', onHostExit);
    bridge.releaseRuntimeHost(hostId, reason);
  };
  target.addEventListener('pagehide', onPagehide, { once: true });
  if (hostExitTag !== undefined) {
    target.addEventListener('message', onHostExit);
    registerElectronRuntimeHostExit(port, (notify) => {
      notifyHostExit = notify;
    });
  }
  registerElectronRuntimeHostRelease(port, release);
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
  options: ElectronClientOptionsInput<Runtime> = {} as ElectronClientOptionsInput<Runtime>,
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
