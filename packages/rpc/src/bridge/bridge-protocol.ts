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
 * Optional client-side call hooks for generic bridge users.
 * @public
 */
export type BridgeCallOptions<Hello = unknown, WatchRequest = unknown, WatchEvent = unknown> = {
  prepareCallArgs?: (method: string, args: unknown[]) => unknown[];
  /**
   * Milliseconds. Resolve one call's client deadline. `undefined` keeps the
   * default and `'none'` installs no wall-clock timer.
   */
  resolveCallTimeout?: (method: string) => number | 'none' | undefined;
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
