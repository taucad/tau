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

/** Set of known kind codes. Frames whose `k` is not in this set are dropped. */
const knownKinds: ReadonlySet<string> = new Set<string>([
  'rq',
  'rs',
  'rc',
  'nt',
  'ss',
  'sn',
  'sc',
  'se',
  'su',
  'lh',
  'lb',
  'fa',
  'fw',
]);

const isString = (value: unknown): value is string => typeof value === 'string';
const isNonEmptyString = (value: unknown): value is string => isString(value) && value.length > 0;
const isWireErrorShape = (value: unknown): value is WireError => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const o = value as { m?: unknown; c?: unknown; s?: unknown };
  if (!isString(o.m)) {
    return false;
  }
  if (o.c !== undefined && typeof o.c !== 'string' && typeof o.c !== 'number') {
    return false;
  }
  if (o.s !== undefined && !isString(o.s)) {
    return false;
  }
  return true;
};

type WireFrameLike = {
  v?: unknown;
  k?: unknown;
  i?: unknown;
  n?: unknown;
  a?: unknown;
  d?: unknown;
  o?: unknown;
  e?: unknown;
  r?: unknown;
  s?: unknown;
};

type WireRawFrame = Record<string, unknown>;

const isResponseShape = (frame: WireFrameLike, raw: WireRawFrame): boolean => {
  if (!isNonEmptyString(frame.i)) {
    return false;
  }
  if (frame.o === 1) {
    return 'd' in raw;
  }
  if (frame.o === 0) {
    return isWireErrorShape(frame.e);
  }
  return false;
};

const isHelloShape = (frame: WireFrameLike): boolean => {
  if (frame.o === 1) {
    return true;
  }
  if (frame.o === 0) {
    return isWireErrorShape(frame.e);
  }
  return false;
};

const perKindValidators: Readonly<Record<string, (frame: WireFrameLike, raw: WireRawFrame) => boolean>> = {
  rq: (frame, raw) => isNonEmptyString(frame.i) && isNonEmptyString(frame.n) && 'a' in raw,
  rs: isResponseShape,
  rc: (frame) => isNonEmptyString(frame.i) && (frame.e === undefined || isWireErrorShape(frame.e)),
  nt: (frame, raw) => isNonEmptyString(frame.n) && 'a' in raw,
  ss: (frame, raw) => isNonEmptyString(frame.i) && isNonEmptyString(frame.n) && 'a' in raw,
  sn: (frame, raw) => isNonEmptyString(frame.i) && 'd' in raw,
  sc: (frame) => isNonEmptyString(frame.i),
  su: (frame) => isNonEmptyString(frame.i),
  se: (frame) => isNonEmptyString(frame.i) && isWireErrorShape(frame.e),
  lh: isHelloShape,
  lb: (frame) => frame.r === undefined || isString(frame.r),
  fa: (frame) => isNonEmptyString(frame.i),
  fw: (frame) => isNonEmptyString(frame.i) && typeof frame.s === 'number' && Number.isFinite(frame.s),
};

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
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const frame = value as WireFrameLike;
  if (!isString(frame.k) || frame.k.startsWith('_') || !knownKinds.has(frame.k)) {
    return false;
  }
  if (frame.v !== wireVersion) {
    onVersionMismatch?.({ expected: wireVersion, received: frame.v, kind: frame.k });
    return false;
  }
  const validator = perKindValidators[frame.k];
  return validator ? validator(frame, value as WireRawFrame) : false;
};
