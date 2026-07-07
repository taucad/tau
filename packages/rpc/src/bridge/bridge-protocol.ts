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
export type BridgeCallOptions = {
  prepareCallArgs?: (method: string, args: unknown[]) => unknown[];
};
