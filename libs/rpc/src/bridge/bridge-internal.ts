import type { WithTransferables } from '#channel.js';
import type { BridgeError } from '#bridge/bridge-errors.js';
import { extractTransferables } from '#bridge/transferables.js';

/** Milliseconds. */
export const messagePortCallTimeout = 30_000;

export const broadcastEvent = 'broadcast';
export const watchEvent = 'watch';
export const bridgeWatchReadyMarker = '__tauBridgeWatchReady';

export type BridgeWatchReadyFrame = { readonly [bridgeWatchReadyMarker]: true };

/** Return whether a bridge stream frame acknowledges watch registration. */
export const isBridgeWatchReadyFrame = (value: unknown): value is BridgeWatchReadyFrame =>
  value !== null && typeof value === 'object' && (value as Record<string, unknown>)[bridgeWatchReadyMarker] === true;

/** Wire frame carrying a broadcast event name and its payload. */
export type BroadcastFrame = { event: string; data: unknown };

export const wrapAsTransferables = <T>(value: T): WithTransferables<T> | T => {
  const transferables = extractTransferables(value);
  if (transferables.length === 0) {
    return value;
  }
  return { value, transferables } satisfies WithTransferables<T>;
};

export const serializeBridgeError = (error: unknown): BridgeError => {
  const record = error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.constructor.name : 'Error',
    stack: error instanceof Error ? error.stack : undefined,
    code: record['code'] as string | undefined,
    metadata: record['metadata'] as Record<string, unknown> | undefined,
  };
};

export const reconstructError = (
  bridgeError: BridgeError,
): Error & {
  code?: string;
  metadata?: Record<string, unknown>;
} => {
  const error = Object.assign(new Error(bridgeError.message), {
    name: bridgeError.name,
    code: bridgeError.code,
    metadata: bridgeError.metadata,
  });
  if (bridgeError.stack) {
    error.stack = bridgeError.stack;
  }
  return error;
};

export const isBridgeErrorWire = (value: unknown): value is { __bridgeError: BridgeError } => {
  return value !== null && typeof value === 'object' && '__bridgeError' in (value as Record<string, unknown>);
};
