/**
 * Wire-protocol envelope for runtime transport messages. Every call and
 * notify that crosses a `RuntimeChannel` is structurally a payload from
 * the typed {@link RuntimeProtocol} contract intersected with a
 * {@link ProtocolHeader}, giving downstream layers stable correlation,
 * ordering, and version-skew detection without re-parsing the payload
 * itself.
 *
 * The current wire targets `protocolVersion === 3`. Bumping the version is
 * a wire-breaking change validated end-to-end by the conformance suite.
 *
 * @public
 */

/**
 * Current wire protocol version. Receivers compare incoming `header.v`
 * against this constant; mismatched values surface as a typed
 * {@link TransportProtocolVersionError} so consumers can distinguish
 * "wire shape changed" from "kernel produced an error".
 *
 * @public
 */
export const protocolVersion = 3;

/**
 * Header fields stamped on every wire message. The header is structurally
 * intersected with the payload via {@link WireMessage}; transports add the
 * header on send and validate it on receive.
 *
 * @public
 */
export type ProtocolHeader = {
  /**
   * Wire protocol version literal. Bumped on any breaking change to the
   * envelope or payload shape. Always equals {@link protocolVersion} on
   * outbound messages; receivers reject mismatches via
   * {@link TransportProtocolVersionError}.
   */
  readonly v: typeof protocolVersion;
  /**
   * Per-channel monotonic sequence number. Receivers may assert monotonicity
   * to detect transport-level corruption or dropped frames.
   */
  readonly seq: number;
  /**
   * Optional command correlation id. Set on command messages and echoed by
   * the matching response so multiple in-flight commands on a single channel
   * can settle independently. Generated via
   * `generatePrefixedId(idPrefix.command)` (`cmd_…`).
   */
  readonly cid?: string;
  /**
   * Optional render-generation correlation id. Set on autonomous render-loop
   * events (`progress`, `parameters`, `geometry`, `error`) so consumers can
   * group events belonging to the same `openFile`/`updateParameters`/
   * `setOptions` cycle.
   */
  readonly rgen?: number;
};

/**
 * Structural intersection of a payload and a {@link ProtocolHeader}. Every
 * value crossing a `RuntimeChannel` is a `WireMessage<RuntimeProtocol['calls'][K]['args']>` or
 * `WireMessage<RuntimeProtocol['notifies'][K]['args']>` for some key `K`.
 *
 * @public
 */
export type WireMessage<T> = T & ProtocolHeader;

/**
 * Thrown when a receiver decodes a wire message whose `header.v` does not
 * match the local {@link protocolVersion}. Indicates client/server skew on
 * remote transports; on local transports it indicates a build-cache mismatch
 * between the runtime client and the worker bundle.
 *
 * @public
 */
export class TransportProtocolVersionError extends Error {
  public readonly expected: number;
  public readonly received: number;

  /**
   * @param expected - Local protocol version (the version this build supports).
   * @param received - The `v` field carried by the offending wire message.
   */
  public constructor(expected: number, received: number) {
    super(
      `Runtime transport protocol version mismatch: expected ${expected}, received ${received}. ` +
        'Local and remote runtime versions must agree on the wire protocol — verify both ends ship the same @taucad/runtime build.',
    );
    this.name = 'TransportProtocolVersionError';
    this.expected = expected;
    this.received = received;
  }

  /** */
  public get code(): 'TRANSPORT_PROTOCOL_VERSION_MISMATCH' {
    return 'TRANSPORT_PROTOCOL_VERSION_MISMATCH';
  }
}

/**
 * Realm-safe type guard for {@link TransportProtocolVersionError} — checks
 * `error.name` rather than the prototype chain so cross-realm errors
 * (Web Workers, iframes, sub-processes) are still recognised.
 *
 * @param error - the value to test
 * @returns `true` when the error is a {@link TransportProtocolVersionError}
 * @public
 */
export function isTransportProtocolVersionError(error: unknown): error is TransportProtocolVersionError {
  return error instanceof Error && error.name === 'TransportProtocolVersionError';
}

/**
 * Validate the `v` field on an incoming wire header. Throws
 * {@link TransportProtocolVersionError} on mismatch; returns silently
 * otherwise. Receivers call this on every inbound message before the
 * payload is dispatched to consumers.
 *
 * The parameter type widens `v` to `number` because the value originates
 * from an untrusted wire payload — the literal-typed {@link ProtocolHeader}
 * narrowing applies only after this validator has succeeded.
 *
 * @param header - the inbound wire header to validate
 * @public
 */
export function validateProtocolHeader(header: { v: number }): void {
  if (header.v !== protocolVersion) {
    throw new TransportProtocolVersionError(protocolVersion, header.v);
  }
}

/**
 * Construct a per-channel sequence-number generator. Each call returns the
 * next monotonic integer starting at 0. One counter instance per channel
 * direction; receivers may assert monotonicity to detect dropped frames.
 *
 * @returns a stateful function that yields the next sequence value
 * @public
 */
export function createSequenceCounter(): () => number {
  let next = 0;
  return () => next++;
}
