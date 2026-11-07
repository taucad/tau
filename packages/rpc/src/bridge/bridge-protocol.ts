import type { WireValidator } from '#wire-validation-error.js';

/**
 * Object shape accepted by the generic bridge proxy/server layer.
 *
 * @public
 */
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- bridge handlers may be class instances; Record<string, unknown> rejects nominal services without an index signature.
export type StringKeyedObject = object;

/**
 * Base watch-request payload type for bridge adapters that expose streaming
 * events.
 *
 * @public
 */
export type BridgeWatchRequest = unknown;

/**
 * Base watch-event payload type for bridge adapters that expose streaming
 * events.
 *
 * @public
 */
export type BridgeWatchEvent = unknown;

/**
 * How far one long bridge call has got. `done` and `total` count the call's own
 * units (files, entries); `bytes` and `totalBytes` count content bytes.
 *
 * @public
 */
export type BridgeProgress = Readonly<{ done: number; total?: number; bytes: number; totalBytes?: number }>;

/**
 * Caller-side controls of a long bridge call: abort it, and observe its progress.
 *
 * @public
 */
export type BridgeLongCall = Readonly<{
  signal?: AbortSignal;
  onProgress?: (progress: BridgeProgress) => void;
}>;

/**
 * What a bridge handler serving a long call receives: the caller's abort, as a
 * signal, and a sink for progress reports.
 *
 * @public
 */
export type BridgeServerLongCall = Readonly<{
  signal: AbortSignal;
  onProgress: (progress: BridgeProgress) => void;
}>;

/**
 * One call's client deadline policy.
 *
 * - a number: milliseconds of wall clock, the ordinary call's deadline (Rule 32);
 * - `'none'`: no timer at all; only the channel closing settles the call;
 * - `'liveness'`: no wall-clock deadline; the call rejects with
 *   `PEER_UNRESPONSIVE` only when the server sends nothing for it (no heartbeat,
 *   no progress) for a whole liveness window. A call whose size decides its
 *   duration uses this, so a transport deadline never fails it while the
 *   server is still working on it (I10).
 *
 * @public
 */
export type BridgeCallTimeout = number | 'none' | 'liveness';

/**
 * Optional client-side call hooks for generic bridge users.
 * @public
 */
export type BridgeCallOptions<Hello = unknown, WatchRequest = unknown, WatchEvent = unknown> = {
  prepareCallArgs?: (method: string, args: unknown[]) => unknown[];
  /**
   * Resolve one call's client deadline. `undefined` keeps the default (30 s);
   * see {@link BridgeCallTimeout}.
   */
  resolveCallTimeout?: (method: string) => BridgeCallTimeout | undefined;
  /** Domain-owned validators applied by the underlying typed channel. */
  protocolSchemas?: BridgeProtocolSchemas<Hello, WatchRequest, WatchEvent>;
};

/** Runtime validators for a domain layered over the generic object bridge. @public */
export type BridgeProtocolSchemas<Hello = unknown, WatchRequest = unknown, WatchEvent = unknown> = {
  readonly hello: WireValidator<Hello>;
  readonly calls: Readonly<Record<string, { readonly args: WireValidator<unknown[]>; readonly result: WireValidator }>>;
  readonly listens: {
    readonly watch: {
      readonly args: WireValidator<WatchRequest>;
      readonly event: WireValidator<WatchEvent>;
    };
    readonly broadcast: {
      readonly event: WireValidator<{ readonly event: string; readonly data: unknown }>;
    };
  };
};
