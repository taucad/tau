import type { WithTransferables } from '#channel.js';
import type { BridgeError } from '#bridge/bridge-errors.js';
import { extractTransferables } from '#bridge/transferables.js';
import { z } from 'zod';

/** Milliseconds. */
export const messagePortCallTimeout = 30_000;

export const broadcastEvent = 'broadcast';
export const watchEvent = 'watch';
export const bridgeWatchReadyMarker = '__tauBridgeWatchReady';

export type BridgeWatchReadyFrame = { readonly [bridgeWatchReadyMarker]: true };

export const bridgeWatchReadyFrameSchema: z.ZodType<BridgeWatchReadyFrame> = z.object({
  [bridgeWatchReadyMarker]: z.literal(true),
});

/** Return whether a bridge stream frame acknowledges watch registration. */
export const isBridgeWatchReadyFrame = (value: unknown): value is BridgeWatchReadyFrame =>
  bridgeWatchReadyFrameSchema.safeParse(value).success;

/** Wire frame carrying a broadcast event name and its payload. */
export type BroadcastFrame = { event: string; data: unknown };

export const wrapAsTransferables = <T>(value: T): WithTransferables<T> | T => {
  const transferables = extractTransferables(value);
  if (transferables.length === 0) {
    return value;
  }
  return { value, transferables } satisfies WithTransferables<T>;
};

export const bridgeErrorSchema: z.ZodType<BridgeError> = z.looseObject({
  message: z.string(),
  name: z.string(),
  stack: z.string().optional(),
  code: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const bridgeErrorWireSchema = z.object({ __bridgeError: bridgeErrorSchema });

const errorInstanceSchema = z.instanceof(Error);
const bridgeErrorCodeSchema = z.object({ code: z.string().optional() });
const bridgeErrorMetadataSchema = z.object({ metadata: z.record(z.string(), z.unknown()).optional() });

export const serializeBridgeError = (error: unknown): BridgeError => {
  const parsedError = errorInstanceSchema.safeParse(error);
  const parsedStack = z.string().safeParse(parsedError.success ? parsedError.data.stack : undefined);
  const parsedCode = bridgeErrorCodeSchema.safeParse(error);
  const parsedMetadata = bridgeErrorMetadataSchema.safeParse(error);
  const stack = parsedStack.success ? parsedStack.data : undefined;
  const code = parsedCode.success ? parsedCode.data.code : undefined;
  const metadata = parsedMetadata.success ? parsedMetadata.data.metadata : undefined;
  /* An explicit `undefined` property is not an absent one once a byte codec is
   * in the path: `msgpackCodec` writes it as nil (deliberately — see
   * `codec/msgpack.ts`) and the decoded `null` fails `.optional()` here. Every
   * ENOENT raised by a bridged filesystem carries `metadata: undefined`, so
   * every one of them reached the far side as an unreadable
   * `WireValidationError` instead of the not-found error a caller can test. */
  return bridgeErrorSchema.parse({
    message: parsedError.success ? parsedError.data.message : String(error),
    name: parsedError.success ? parsedError.data.constructor.name : 'Error',
    ...(stack === undefined ? {} : { stack }),
    ...(code === undefined ? {} : { code }),
    ...(metadata === undefined ? {} : { metadata }),
  });
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
  return bridgeErrorWireSchema.safeParse(value).success;
};
