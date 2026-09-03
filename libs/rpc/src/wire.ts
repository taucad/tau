import { z } from 'zod';

/**
 * Internal wire codec between {@link createChannelClient} and {@link createChannelServer}.
 *
 * Versioned with `v` for forward compatibility; uses 2-character family-prefixed kind
 * codes for legibility (`r*` RPC, `n*` notify, `s*` stream, `l*` lifecycle, `f*` flow).
 *
 * The full normative specification lives in {@link ../../../docs/architecture/rpc-wire-spec.md},
 * with prior art mapped to LSP, VS Code's `rpcProtocol.ts`, and `kkrpc`.
 *
 * @public
 */
export const wireVersion = 1;

/** Diagnostic emitted before a known wire-frame kind is dropped for version skew. @public */
export type WireVersionMismatchDiagnostic = {
  readonly expected: number;
  readonly received: unknown;
  readonly kind: string;
};

/** Sink for version-skew diagnostics produced by {@link isWireMessage}. @public */
export type WireVersionMismatchHandler = (diagnostic: WireVersionMismatchDiagnostic) => void;

/**
 * Structured error payload. `m` is mandatory and human-readable; `c` is an optional
 * machine-readable code; `s` is an optional stack (typically dev-only).
 *
 * @public
 */
export type WireError = {
  readonly m: string;
  readonly c?: string | number;
  readonly s?: string;
};

/* ============================================================================ *
 * RPC family (`r*`)                                                            *
 * ============================================================================ */

/**
 * Client → server: invoke a one-shot call by name.
 *
 * @public
 */
export type WireRequest = {
  readonly v: 1;
  readonly k: 'rq';
  readonly i: string;
  readonly n: string;
  readonly a: unknown;
};

/**
 * Server → client: successful reply for a {@link WireRequest}.
 *
 * @public
 */
export type WireResponseOk = {
  readonly v: 1;
  readonly k: 'rs';
  readonly i: string;
  readonly o: 1;
  readonly d: unknown;
};

/**
 * Server → client: error reply for a {@link WireRequest}.
 *
 * @public
 */
export type WireResponseError = {
  readonly v: 1;
  readonly k: 'rs';
  readonly i: string;
  readonly o: 0;
  readonly e: WireError;
};

/**
 * Server → client: union of {@link WireResponseOk} and {@link WireResponseError}.
 *
 * @public
 */
export type WireResponse = WireResponseOk | WireResponseError;

/**
 * Client → server: cooperatively cancel a pending {@link WireRequest}.
 * Mirrors LSP `$/cancelRequest`. Server piping the request observes `signal.aborted`.
 *
 * @public
 */
export type WireRequestCancel = {
  readonly v: 1;
  readonly k: 'rc';
  readonly i: string;
  readonly e?: WireError;
};

/* ============================================================================ *
 * Notification family (`n*`)                                                   *
 * ============================================================================ */

/**
 * Bidirectional fire-and-forget notification. No correlation id, no reply.
 * Used for autonomous server events (e.g. `progress`, `geometry`) and client-to-server
 * commands without return values (e.g. `openFile`, `updateParameters`).
 *
 * @public
 */
export type WireNotify = {
  readonly v: 1;
  readonly k: 'nt';
  readonly n: string;
  readonly a: unknown;
};

/* ============================================================================ *
 * Stream family (`s*`)                                                         *
 * ============================================================================ */

/**
 * Client → server: open a server-pushed stream.
 *
 * @public
 */
export type WireStreamSubscribe = {
  readonly v: 1;
  readonly k: 'ss';
  readonly i: string;
  readonly n: string;
  readonly a: unknown;
};

/**
 * Server → client: stream chunk.
 *
 * @public
 */
export type WireStreamNext = {
  readonly v: 1;
  readonly k: 'sn';
  readonly i: string;
  readonly d: unknown;
};

/**
 * Server → client: stream finished cleanly.
 *
 * @public
 */
export type WireStreamComplete = {
  readonly v: 1;
  readonly k: 'sc';
  readonly i: string;
};

/**
 * Server → client: stream errored (terminal).
 *
 * @public
 */
export type WireStreamError = {
  readonly v: 1;
  readonly k: 'se';
  readonly i: string;
  readonly e: WireError;
};

/**
 * Client → server: consumer-initiated cancel of an active subscription.
 * Producer should stop emitting `sn` and respond with terminal `sc` once cleanup is done.
 *
 * @public
 */
export type WireStreamUnsubscribe = {
  readonly v: 1;
  readonly k: 'su';
  readonly i: string;
};

/* ============================================================================ *
 * Lifecycle family (`l*`)                                                      *
 * ============================================================================ */

/**
 * Server → client: connection-established handshake (success).
 *
 * @public
 */
export type WireHelloOk = {
  readonly v: 1;
  readonly k: 'lh';
  readonly o: 1;
  readonly d?: unknown;
};

/**
 * Server → client: connection-established handshake (failure).
 *
 * @public
 */
export type WireHelloError = {
  readonly v: 1;
  readonly k: 'lh';
  readonly o: 0;
  readonly e: WireError;
};

/**
 * Server → client: union of {@link WireHelloOk} and {@link WireHelloError}.
 *
 * @public
 */
export type WireHello = WireHelloOk | WireHelloError;

/**
 * Bidirectional graceful close control. After `lb`, no further frames are accepted.
 *
 * @public
 */
export type WireBye = {
  readonly v: 1;
  readonly k: 'lb';
  readonly r?: string;
};

/* ============================================================================ *
 * Flow control family (`f*`) — RESERVED for a future revision                  *
 * ============================================================================ */

/**
 * Reserved: acknowledge frames up to id `i`. Not implemented; receivers log once
 * and drop. Reserving the kind code prevents wire-format break when flow control
 * lands.
 *
 * @public
 */
export type WireFlowAck = {
  readonly v: 1;
  readonly k: 'fa';
  readonly i: string;
};

/**
 * Reserved: grant `s` more stream-frame slots for stream id `i`. Not implemented;
 * receivers log once and drop.
 *
 * @public
 */
export type WireFlowWindow = {
  readonly v: 1;
  readonly k: 'fw';
  readonly i: string;
  readonly s: number;
};

/* ============================================================================ *
 * Discriminated union                                                          *
 * ============================================================================ */

/**
 * Discriminated union of all v1 wire envelopes.
 *
 * @public
 */
export type WireMessage =
  | WireRequest
  | WireResponse
  | WireRequestCancel
  | WireNotify
  | WireStreamSubscribe
  | WireStreamNext
  | WireStreamComplete
  | WireStreamError
  | WireStreamUnsubscribe
  | WireHello
  | WireBye
  | WireFlowAck
  | WireFlowWindow;

const nonEmptyStringSchema = z.string().min(1);
const wireErrorSchema: z.ZodType<WireError> = z.object({
  m: z.string(),
  // Preserve the v1 guard's full JavaScript-number domain for error codes.
  c: z.union([z.string(), z.number(), z.nan(), z.literal(Infinity), z.literal(-Infinity)]).optional(),
  s: z.string().optional(),
});

const responseSchema = z.discriminatedUnion('o', [
  z.object({
    v: z.literal(wireVersion),
    k: z.literal('rs'),
    i: nonEmptyStringSchema,
    o: z.literal(1),
    d: z.unknown(),
  }),
  z.object({
    v: z.literal(wireVersion),
    k: z.literal('rs'),
    i: nonEmptyStringSchema,
    o: z.literal(0),
    e: wireErrorSchema,
  }),
]);

const helloSchema = z.discriminatedUnion('o', [
  z.object({
    v: z.literal(wireVersion),
    k: z.literal('lh'),
    o: z.literal(1),
    d: z.unknown().optional(),
  }),
  z.object({
    v: z.literal(wireVersion),
    k: z.literal('lh'),
    o: z.literal(0),
    e: wireErrorSchema,
  }),
]);

/** Canonical v1 wire-envelope schema. Its discriminators are the known-kind inventory. */
export const wireMessageSchema: z.ZodType<WireMessage> = z.discriminatedUnion('k', [
  z.object({
    v: z.literal(wireVersion),
    k: z.literal('rq'),
    i: nonEmptyStringSchema,
    n: nonEmptyStringSchema,
    a: z.unknown(),
  }),
  responseSchema,
  z.object({
    v: z.literal(wireVersion),
    k: z.literal('rc'),
    i: nonEmptyStringSchema,
    e: wireErrorSchema.optional(),
  }),
  z.object({
    v: z.literal(wireVersion),
    k: z.literal('nt'),
    n: nonEmptyStringSchema,
    a: z.unknown(),
  }),
  z.object({
    v: z.literal(wireVersion),
    k: z.literal('ss'),
    i: nonEmptyStringSchema,
    n: nonEmptyStringSchema,
    a: z.unknown(),
  }),
  z.object({
    v: z.literal(wireVersion),
    k: z.literal('sn'),
    i: nonEmptyStringSchema,
    d: z.unknown(),
  }),
  z.object({ v: z.literal(wireVersion), k: z.literal('sc'), i: nonEmptyStringSchema }),
  z.object({ v: z.literal(wireVersion), k: z.literal('se'), i: nonEmptyStringSchema, e: wireErrorSchema }),
  z.object({ v: z.literal(wireVersion), k: z.literal('su'), i: nonEmptyStringSchema }),
  helloSchema,
  z.object({ v: z.literal(wireVersion), k: z.literal('lb'), r: z.string().optional() }),
  z.object({ v: z.literal(wireVersion), k: z.literal('fa'), i: nonEmptyStringSchema }),
  z.object({ v: z.literal(wireVersion), k: z.literal('fw'), i: nonEmptyStringSchema, s: z.number() }),
]);

/**
 * Type guard for {@link WireMessage}. Validates `v`, the kind code, and per-kind required
 * fields. Frames with `_`-prefixed kinds (transport-internal) and unknown kinds are rejected.
 *
 * @param value - Arbitrary inbound payload from a {@link Port}
 * @param onVersionMismatch - Optional diagnostic sink for known kinds carrying the wrong version.
 * @returns `true` when `value` matches a known v1 wire envelope shape
 * @public
 */
export const isWireMessage = (value: unknown, onVersionMismatch?: WireVersionMismatchHandler): value is WireMessage => {
  if (typeof value === 'object' && value !== null) {
    const envelope = value as Record<string, unknown>;
    if (envelope['v'] !== wireVersion) {
      const kind = envelope['k'];
      const parsed = wireMessageSchema.safeParse(value);
      if (typeof kind === 'string' && !parsed.success && !parsed.error.issues.some((issue) => issue.path[0] === 'k')) {
        onVersionMismatch?.({ expected: wireVersion, received: envelope['v'], kind });
      }
      return false;
    }
  }
  return wireMessageSchema.safeParse(value).success;
};
