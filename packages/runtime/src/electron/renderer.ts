/**
 * Electron renderer helpers for connecting to a Tau utility-process runtime.
 *
 * @public
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public Electron renderer subpath */

import { randomUuid } from '@taucad/utils/id';
import type { RuntimeClientOptionsWithTransport } from '#client/runtime-client-core.js';
import { electronUtilityTransport } from '#electron/electron-utility-transport.js';
import type { AnyRuntimeDefinition, RuntimeConfigInput, RuntimeConfigProvider } from '#worker/runtime-definition.js';
import {
  registerElectronRuntimeHostExit,
  registerElectronRuntimeHostRelease,
} from '#electron/_internal/runtime-host-lease.js';
import type { ElectronRuntimeHostExitDetail } from '#electron/_internal/runtime-host-lease.js';

export {
  electronUtilityClient,
  electronUtilityClientDescribe,
  electronUtilityMainClient,
} from '#electron/electron-utility-client.js';
export type { ElectronUtilityMainClientOptions } from '#electron/electron-utility-client.js';
export { electronUtilityMainTransport, electronUtilityTransport } from '#electron/electron-utility-transport.js';
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
  /**
   * Ask the main process to spawn one utility runtime and relay its port,
   * optionally carrying the fork context the main-process resolver reads.
   */
  requestRuntimePort(requestId: string, context?: Record<string, string>): void;
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
  /**
   * Flat string record describing which utility this client wants — e.g.
   * `{ projectRoot, definition }`. The main-process broker sanitizes it and
   * hands it to the application's fork resolver; the runtime assigns no meaning
   * to the keys.
   */
  readonly context?: Record<string, string>;
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
 * identity, and preload targets `'/'`, which only same-origin documents
 * receive. The origin comparison is the cheap second condition, and an opaque
 * document is where the two strings stop agreeing: on Electron 43 a `file://`
 * document reports `location.origin === 'file://'` while its own relay event
 * carries `'null'` (36 stringified both as `'null'`). Accepting `'null'`
 * restores the example apps without touching the identity check — a foreign
 * frame posting from an opaque origin is still rejected on `source`. */
const isSameWindowRelay = (event: MessageEvent): boolean =>
  event.source === globalThis.window && (event.origin === globalThis.location.origin || event.origin === 'null');

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
 * Await one `MessagePort` relayed into this document by `relayElectronPorts`.
 *
 * The relay crosses the page's own `window`, so the acceptance predicate is
 * the security boundary and lives here, once, for every Electron port hand-off
 * in the tree: same-window `source` identity, a same-origin (or opaque)
 * `origin`, the relay tag, and the caller's own `match` on the payload the
 * shell sent with the port.
 *
 * The listener is registered before this function returns, so a caller may
 * safely ask for the port only after calling it.
 *
 * @param tag - Relay tag the preload stamped as `taucadRelay`.
 * @param match - Predicate over the relay payload; the caller's correlation
 * check (a request id, a host lease, a concern name).
 * @param target - Renderer message target.
 * @returns A promise resolving with the first port whose relay matches, and
 * rejecting when the shell answers that request with an `error` instead of a
 * port — a refusal the caller would otherwise wait out forever.
 * @public
 *
 * @example <caption>Correlate a shell's service port by request id</caption>
 * ```typescript
 * import { awaitElectronRelayedPort } from '@taucad/runtime/electron/renderer';
 *
 * const requestId = 'services-1';
 * // Subscribe first, then ask the shell — a synchronous relay must not beat
 * // its own listener.
 * const port = await awaitElectronRelayedPort('tau:services-port', (payload) => payload['requestId'] === requestId);
 * ```
 */
export const awaitElectronRelayedPort = async (
  tag: string,
  match: (payload: Record<string, unknown>) => boolean,
  target: ElectronRuntimeMessageTarget = globalThis,
): Promise<MessagePort> =>
  new Promise<MessagePort>((resolve, reject) => {
    const handler = (event: MessageEvent): void => {
      const data = event.data as Record<string, unknown> | undefined;
      if (!data || data['taucadRelay'] !== tag || !isSameWindowRelay(event) || !match(data)) {
        return;
      }
      /* The shell answers a request it will not serve with a reason instead of
       * a port. Without this the caller — `nodeFs`, an agent host — waits on a
       * hand-off that is never coming. */
      const refusal = data['error'];
      if (typeof refusal === 'string') {
        target.removeEventListener('message', handler);
        reject(new Error(`Electron main refused the ${tag} request: ${refusal}`));
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

/**
 * Await one relayed Electron utility-process port and retain its opaque host lease.
 *
 * @param relayTag - Preload relay tag to match.
 * @param requestId - Opaque identity of the request whose port to accept.
 * @param target - Renderer message target.
 * @returns A promise resolving with the leased runtime port.
 * @public
 */
export const awaitElectronRuntimePort = async (
  relayTag: string,
  requestId: string,
  target: ElectronRuntimeMessageTarget = globalThis,
): Promise<MessagePort> => {
  let hostId: string | undefined;
  const port = await awaitElectronRelayedPort(
    relayTag,
    (payload) => {
      if (payload['requestId'] !== requestId) {
        return false;
      }
      /* Only a served request carries a lease: main answers a refusal with a
       * reason and no `hostId`, and requiring one here would drop that answer
       * and leave the caller waiting on a port that is never coming. */
      const { hostId: relayed } = payload;
      if (typeof relayed === 'string') {
        hostId = relayed;
      }
      return true;
    },
    target,
  );
  if (hostId !== undefined) {
    runtimeHostIdsByPort.set(port, hostId);
  }
  return port;
};

/**
 * Request one Electron utility-process runtime from preload.
 *
 * @param options - Optional bridge, global name, and message target overrides.
 * @returns A promise resolving with the leased runtime port, unstarted: frames
 * queue until its reader subscribes and calls `start()`.
 * @public
 */
export const requestElectronRuntimePort = async (
  options: RequestElectronRuntimePortOptions = {},
): Promise<MessagePort> => {
  const bridge = options.bridge ?? getElectronRuntimeBridge(options.globalName);
  const target = options.target ?? globalThis;
  const requestId = randomUuid();
  const portPromise = awaitElectronRuntimePort(bridge.relayTag.runtime, requestId, target);
  bridge.requestRuntimePort(requestId, options.context);
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
    target.removeEventListener('message', onHostExit);
  };
  /* Main relays the dead utility's exit report through the same preload relay
   * that carried the port. The client subscribes at materialize time, so the
   * notifier is a slot the listener reads rather than a callback it captures. */
  let notifyHostExit: ((detail: ElectronRuntimeHostExitDetail) => void) | undefined;
  const hostExitTag = bridge.relayTag.hostExit;
  const onHostExit = (event: MessageEvent): void => {
    const data = event.data as
      | { taucadRelay?: string; hostId?: string; exitCode?: number; released?: boolean; stderrTail?: string }
      | undefined;
    if (!data || data.taucadRelay !== hostExitTag || data.hostId !== hostId || !isSameWindowRelay(event)) {
      return;
    }
    /* This host reports exactly one exit, so the listener retires with it. */
    target.removeEventListener('message', onHostExit);
    notifyHostExit?.({
      released: data.released === true,
      ...(typeof data.exitCode === 'number' ? { exitCode: data.exitCode } : {}),
      ...(data.stderrTail === undefined ? {} : { stderrTail: data.stderrTail }),
    });
  };
  /* `release()` asks main to kill the utility, so the exit relay it provokes
   * arrives *after* it. Dropping the listener here is what made every
   * release-first teardown report an unexplained exit. */
  const release = (reason: 'requested' | 'render-timeout'): void => {
    if (released) {
      return;
    }
    released = true;
    target.removeEventListener('pagehide', onPagehide);
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
  /* Not started here. A started port dispatches each frame to whatever listens
   * at that moment, and a warm utility sends its hello the moment main hands it
   * the other leg — before a caller still waiting on its file manager has built
   * the client. The channel starts the port once it listens. */
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
