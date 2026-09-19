import type { LlmGatewayErrorType } from '#api/llm/llm-gateway.error.js';
import { createSseDecoder } from '#api/llm/llm-gateway.stream.js';
import type { SseEvent } from '#api/llm/llm-gateway.stream.js';
import {
  classifyUpstreamRefusal,
  cloudUpstreamRefusalMessage,
  maximumRefusalMessageCharacters,
} from '#api/llm/upstream-refusal.js';
import {
  cloudProviderAccountMessage,
  providerAccountMessage,
  recognizeProviderAccountRefusal,
} from '#api/llm/provider-account-refusal.js';
import type {
  ProviderAccountOwner,
  ProviderAccountRefusal,
  ProviderAccountRefusalDetails,
} from '#api/llm/provider-account-refusal.js';
import type { GatewayProviderId } from '#api/providers/provider-gateway.js';

const carriageReturn = 13;
const lineFeed = 10;
/* Matches the SSE decoder's own event ceiling: a frame larger than this is forwarded raw
 * rather than buffered or parsed, so one oversized provider event cannot become the
 * gateway's memory profile. */
const maximumFrameBytes = 256 * 1024;
const encoder = new TextEncoder();
const textDecoder = new TextDecoder();
const errorNeedle = encoder.encode('error');
/* The exact marker the transport switches a stream to failed on
 * (`tauGatewayFrameMarker`, gateway-model-transport.ts). Scanned for unescaped,
 * which is why relayed model text cannot trip it. */
const tauGatewayNeedle = encoder.encode('"type":"tau_gateway"');
/** The status a forged marker is reported as: the upstream is not answering honestly. */
const forgedMarkerStatus = 502;

/** Whether `needle` occurs in `haystack`: the cheap gate that keeps healthy frames unparsed. */
const containsBytes = (haystack: Uint8Array<ArrayBuffer>, needle: Uint8Array<ArrayBuffer>): boolean => {
  const last = haystack.length - needle.length;
  for (let index = 0; index <= last; index += 1) {
    let matched = 0;
    while (matched < needle.length && haystack[index + matched] === needle[matched]) {
      matched += 1;
    }
    if (matched === needle.length) {
      return true;
    }
  }
  return false;
};

const concat = (head: Uint8Array<ArrayBuffer>, tail: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const joined = new Uint8Array(head.byteLength + tail.byteLength);
  joined.set(head);
  joined.set(tail, head.byteLength);
  return joined;
};

/**
 * The Tau-coded frame that replaces a classified provider failure on the wire.
 * One envelope for every code, so a client that switches on `error.code` needs no
 * new parsing when a new failure becomes codable.
 *
 * @param input - The gateway code its clients switch on, the message the account
 * owner is allowed to read, and the structured fields the code carries.
 * @returns The complete SSE frame, blank line included, so both the API decoder
 * and the transport see one finished event.
 */
export const gatewayErrorFrame = (input: {
  readonly code: LlmGatewayErrorType;
  readonly message: string;
  readonly details: ProviderAccountRefusalDetails;
}): string =>
  `event: error\ndata: ${JSON.stringify({
    type: 'error',
    code: input.code,
    message: input.message,
    error: {
      type: 'tau_gateway',
      code: input.code,
      message: input.message,
      details: input.details,
    },
  })}\n\n`;

/**
 * Vertex wraps its trailing refusal in a one-element array; every recognizer and
 * the failure log read the object inside it.
 *
 * @param body - A parsed provider body.
 * @returns The single element of a one-element array, or the body unchanged.
 */
const unwrapProviderBody = (body: unknown): unknown =>
  Array.isArray(body) && body.length === 1 ? (body[0] as unknown) : body;

/**
 * The `error` member of a provider body.
 *
 * @param body - A parsed provider body, already unwrapped.
 * @returns The error object, or undefined when the body carries none.
 */
const providerErrorRecord = (body: unknown): Record<string, unknown> | undefined => {
  if (body === null || typeof body !== 'object') {
    return undefined;
  }
  const { error } = body as { error?: unknown };
  return error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
};

/**
 * The HTTP status a provider error object names, when it names one as a number.
 * A provider whose `code` is symbolic (`rate_limit_exceeded`) names no status
 * here and keeps its frame on the raw-forward path.
 *
 * @param error - A provider error object.
 * @returns The status, or undefined when the error does not carry one.
 */
const providerErrorStatus = (error: Record<string, unknown>): number | undefined => {
  const { code } = error;
  if (typeof code === 'number') {
    return Number.isInteger(code) ? code : undefined;
  }
  if (typeof code !== 'string' || code.trim() === '') {
    return undefined;
  }
  const parsed = Number(code);
  return Number.isInteger(parsed) ? parsed : undefined;
};

/**
 * End index (exclusive) of the first complete SSE event in `buffer`, or -1 when
 * the buffer does not hold one yet. An event ends at a blank line, whichever of
 * the three SSE line terminators the provider uses.
 *
 * @param buffer - Undelivered bytes, starting at an event boundary.
 * @returns The exclusive end index of the first event, or -1.
 */
const eventEnd = (buffer: Uint8Array<ArrayBuffer>): number => {
  let lineStart = 0;
  let index = 0;
  while (index < buffer.length) {
    const byte = buffer[index]!;
    if (byte !== carriageReturn && byte !== lineFeed) {
      index += 1;
      continue;
    }
    let next = index + 1;
    if (byte === carriageReturn) {
      if (next === buffer.length) {
        // A trailing CR may still be half of a CRLF; wait for the next chunk.
        return -1;
      }
      if (buffer[next] === lineFeed) {
        next += 1;
      }
    }
    if (index === lineStart) {
      return next;
    }
    lineStart = next;
    index = next;
  }
  return -1;
};

/**
 * What a terminal failure frame says about itself: its own type, code and the
 * provider's sentence. Generated output is never read, but a provider sentence
 * can quote a fragment of the request it rejected.
 */
export type ProviderTerminalFailure = {
  readonly type?: string;
  readonly code?: string;
  readonly message?: string;
};

/**
 * The provider's own classification of a terminal frame, read from the frame
 * itself (OpenAI Responses `error` events are flat) or from its `error` member.
 *
 * @param data - Parsed data of a frame already recognised as terminal.
 * @returns The frame's type, code and sentence, as far as it carries them.
 */
const terminalFailureOf = (data: unknown): ProviderTerminalFailure => {
  const record = (data === null || typeof data !== 'object' ? {} : data) as Record<string, unknown>;
  const nested = record['error'];
  const source = nested !== null && typeof nested === 'object' ? (nested as Record<string, unknown>) : record;
  const { code } = source;
  return {
    ...(typeof source['type'] === 'string' ? { type: source['type'] } : {}),
    // Vertex names its status as a number; the log reads a code either way.
    ...(typeof code === 'string' || typeof code === 'number' ? { code: String(code) } : {}),
    ...(typeof source['message'] === 'string' ? { message: source['message'] } : {}),
  };
};

const isErrorEvent = (event: SseEvent): boolean =>
  event.event === 'error' ||
  (event.data !== null && typeof event.data === 'object' && (event.data as { type?: unknown }).type === 'error');

const failedResponseError = (
  data: unknown,
): { readonly payload: Record<string, unknown>; readonly error: Record<string, unknown> } | undefined => {
  if (data === null || typeof data !== 'object' || (data as { type?: unknown }).type !== 'response.failed') {
    return undefined;
  }
  const payload = (data as { response?: unknown }).response;
  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }
  const { error } = payload as { error?: unknown };
  if (error === null || typeof error !== 'object' || typeof (error as { message?: unknown }).message !== 'string') {
    return undefined;
  }
  return { payload: payload as Record<string, unknown>, error: error as Record<string, unknown> };
};

/**
 * Replaces a recognised provider-account refusal in a relayed SSE body with the
 * Tau-coded frame its clients switch on, and leaves every other frame byte-for-byte.
 *
 * Ponytail: the filter holds one event's bytes back to decide on it, which is the
 * unit SSE dispatches anyway, and re-encodes nothing else. Only the frames it
 * rewrites are built from parsed data.
 *
 * @param input - The route's provider, who owns its account (which decides the
 * message and whether the supplier sentence may stay on the wire), an optional
 * observer for the recognised refusal, and an optional observer for any other
 * terminal failure frame the relay would otherwise forward without a trace,
 * called at most once per stream.
 * @returns A transform to pipe the relayed body through.
 */
export const createProviderAccountFrameFilter = (input: {
  readonly providerId: GatewayProviderId;
  readonly accountOwner: ProviderAccountOwner;
  readonly onRefusal?: (refusal: ProviderAccountRefusal) => void;
  readonly onTerminalFailure?: (failure: ProviderTerminalFailure) => void;
}): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> => {
  let pending = new Uint8Array(0);
  let oversized = false;
  /** The tail of the last oversized piece, so a marker split across it is still seen. */
  let oversizedCarry = new Uint8Array(0);
  /** Set once the upstream has counterfeited Tau's envelope; nothing more is relayed. */
  let forged = false;
  let rewritten = false;
  let reported = false;
  let decoded: SseEvent | undefined;
  const newDecoder = (): ReturnType<typeof createSseDecoder> =>
    createSseDecoder({
      onEvent: (event) => {
        decoded = event;
      },
      maxEventBytes: maximumFrameBytes,
    });
  let decoder = newDecoder();

  const decode = (frame: Uint8Array<ArrayBuffer>, final: boolean): SseEvent | undefined => {
    decoded = undefined;
    decoder.write(frame);
    if (final) {
      // A stream that stopped mid-frame still dispatches what it had.
      decoder.end();
    }
    return decoded;
  };

  /** The Tau-coded frame for a recognised refusal; records that this stream has been coded. */
  const coded = (refusal: ProviderAccountRefusal): Uint8Array<ArrayBuffer> => {
    rewritten = true;
    input.onRefusal?.(refusal);
    return encoder.encode(
      gatewayErrorFrame({
        code: 'PROVIDER_ACCOUNT_EXHAUSTED',
        message: providerAccountMessage(input.accountOwner, refusal),
        details: {
          providerId: input.providerId,
          ...(refusal.providerCode === undefined ? {} : { providerCode: refusal.providerCode }),
          accountOwner: input.accountOwner,
        },
      }),
    );
  };

  /**
   * The Tau-coded frame for a provider failure the account matchers do not claim,
   * mapped through the same status table the pre-stream legs use so the two cannot
   * drift. Undefined when the body names no status, which keeps the raw forward.
   */
  const codedByStatus = (body: unknown): Uint8Array<ArrayBuffer> | undefined => {
    const error = providerErrorRecord(body);
    const status = error === undefined ? undefined : providerErrorStatus(error);
    if (error === undefined || status === undefined) {
      return undefined;
    }
    const { type } = classifyUpstreamRefusal({ status, accountOwner: input.accountOwner });
    const { status: providerCode, message } = error;
    /* The operator owns the key, so the supplier's own reason stays in the message,
     * clamped the way the pre-stream leg clamps it because the chat persists it. On
     * Cloud the key is Tau's and the customer reads the shared sentence instead.
     * Either way the raw sentence still reaches the server log through `report`. */
    const supplierSentence =
      typeof message === 'string' && message !== '' ? message.slice(0, maximumRefusalMessageCharacters) : undefined;
    rewritten = true;
    return encoder.encode(
      gatewayErrorFrame({
        code: type,
        message:
          input.accountOwner === 'tau' || supplierSentence === undefined
            ? cloudUpstreamRefusalMessage({ type, status })
            : supplierSentence,
        details: {
          providerId: input.providerId,
          ...(typeof providerCode === 'string' ? { providerCode } : {}),
          accountOwner: input.accountOwner,
        },
      }),
    );
  };

  /**
   * Reports the frame the turn ended on, once: a stream that carries both an
   * `error` event and a `response.failed` is one failure, not two.
   */
  const report = (data: unknown): void => {
    if (reported) {
      return;
    }
    reported = true;
    input.onTerminalFailure?.(terminalFailureOf(data));
  };

  /**
   * Codes one provider error body — the account matchers first, then the status
   * table — and records the failure when it codes one. Undefined leaves the
   * frame on the raw-forward path.
   */
  const codedProviderFailure = (raw: unknown): Uint8Array<ArrayBuffer> | undefined => {
    const body = unwrapProviderBody(raw);
    // An account refusal has its own observer; every other coded failure is
    // reported here, so one failure never logs twice.
    const refusal = recognizeProviderAccountRefusal({ providerId: input.providerId, body });
    if (refusal) {
      return coded(refusal);
    }
    if (providerErrorRecord(body) === undefined) {
      return undefined;
    }
    /* Reported whether or not the status table can code it: a provider whose
     * in-band error names a symbolic code (`rate_limit_exceeded`) maps to
     * nothing here and used to forward with no trace at all (R6). */
    report(body);
    return codedByStatus(body);
  };

  /**
   * Replaces a raw frame that carries Tau's own envelope. A provider controls
   * its whole response body, so it can emit `"type":"tau_gateway"` verbatim —
   * model text cannot, because content and tool arguments are JSON strings whose
   * quotes arrive escaped. Left alone, such a frame lets the upstream end the
   * turn with a code, message and details it chose, on the operator path where
   * the caller configures the base URL (R5).
   *
   * The client gets Tau's own outage sentence for either account owner; the raw
   * frame goes to the server log, where only Tau reads it.
   */
  const codedForgedMarker = (frame: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
    forged = true;
    rewritten = true;
    report({
      error: {
        type: 'forged_tau_gateway_frame',
        message: textDecoder.decode(frame).slice(0, maximumRefusalMessageCharacters),
      },
    });
    return encoder.encode(
      gatewayErrorFrame({
        code: 'PROVIDER_UNAVAILABLE',
        message: cloudUpstreamRefusalMessage({ type: 'PROVIDER_UNAVAILABLE', status: forgedMarkerStatus }),
        // No `providerCode`: the only code such a frame carries is the one it invented.
        details: { providerId: input.providerId, accountOwner: input.accountOwner },
      }),
    );
  };

  /** One complete frame the filter chose not to rewrite, made safe to forward. */
  const forwarded = (frame: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
    containsBytes(frame, tauGatewayNeedle) ? codedForgedMarker(frame) : frame;

  /**
   * Vertex ends a quota-exhausted stream by abandoning SSE framing altogether: it
   * appends a bare, pretty-printed JSON array carrying a 429 after the last
   * well-formed chunk and closes cleanly. No line in it is a `data:` field, so
   * every decoder in the chain discards it and the turn dies as `Stream ended
   * without finish_reason` with the real cause erased (Finding 3).
   *
   * Bytes that are not such an error object — including a tail the stream cut
   * before it became valid JSON — parse as nothing and keep today's raw forward.
   */
  const codedTrailingJson = (frame: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> | undefined => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(textDecoder.decode(frame)) as unknown;
    } catch {
      return undefined;
    }
    return codedProviderFailure(parsed);
  };

  /** The replacement bytes for one complete frame, or undefined to forward it unchanged. */
  const rewrite = (frame: Uint8Array<ArrayBuffer>, final = false): Uint8Array<ArrayBuffer> | undefined => {
    /* Only a frame that can name an error is worth parsing, and only one the
     * decoder accepts: a healthy frame past its ceiling is forwarded, never
     * thrown on. */
    if (frame.byteLength > maximumFrameBytes || !containsBytes(frame, errorNeedle)) {
      return undefined;
    }
    const event = decode(frame, final);
    if (event === undefined) {
      return codedTrailingJson(frame);
    }
    if (isErrorEvent(event)) {
      const refusal = recognizeProviderAccountRefusal({ providerId: input.providerId, body: event.data });
      if (refusal) {
        return coded(refusal);
      }
      // Coded or forwarded, but no longer unrecorded: the relay's only sight
      // of why the turn ended (R8).
      report(event.data);
      return codedByStatus(event.data);
    }
    const failed = failedResponseError(event.data);
    if (!failed) {
      /* A provider can also refuse in-band, as a plain chunk carrying an `error`
       * object and none of the markers above; Vertex does. Forwarded, its status
       * never reached the client, so a mid-stream 429 arrived as a provider
       * outage with no rate-limit card (F3). */
      return codedProviderFailure(event.data);
    }
    /* A refusal that reaches the wire only as `response.failed` (no `error`
     * event ahead of it) is coded here, once, ahead of the frame itself. */
    const refusal = rewritten
      ? undefined
      : recognizeProviderAccountRefusal({ providerId: input.providerId, body: failed.payload });
    if (refusal === undefined && !rewritten) {
      report(failed.payload);
      return undefined;
    }
    const head = refusal === undefined ? undefined : coded(refusal);
    if (input.accountOwner !== 'tau') {
      return head === undefined ? undefined : concat(head, frame);
    }
    // The supplier's own sentence names Tau's account; the customer gets the opaque one.
    const data = {
      ...(event.data as Record<string, unknown>),
      response: { ...failed.payload, error: { ...failed.error, message: cloudProviderAccountMessage } },
    };
    const redacted = encoder.encode(`event: ${event.event ?? 'response.failed'}\ndata: ${JSON.stringify(data)}\n\n`);
    return head === undefined ? redacted : concat(head, redacted);
  };

  /**
   * Forwards one piece of a frame too large to hold for a decision. The marker
   * scan carries the previous piece's tail so a marker split across the seam is
   * still seen; on a hit the stream ends here, because the pieces already sent
   * cannot be recalled and a body that counterfeits Tau's envelope has nothing
   * further worth relaying.
   */
  const forwardOversized = (
    piece: Uint8Array<ArrayBuffer>,
    controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>,
  ): void => {
    if (containsBytes(concat(oversizedCarry, piece), tauGatewayNeedle)) {
      controller.enqueue(codedForgedMarker(piece));
      return;
    }
    oversizedCarry = piece.slice(Math.max(0, piece.byteLength - (tauGatewayNeedle.byteLength - 1)));
    controller.enqueue(piece);
  };

  const drain = (controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>): void => {
    for (;;) {
      if (forged) {
        pending = new Uint8Array(0);
        return;
      }
      const end = eventEnd(pending);
      if (end < 0) {
        if (oversized || pending.byteLength > maximumFrameBytes) {
          // Too large to hold for a decision: forward its bytes as they arrive.
          oversized = true;
          if (pending.byteLength > 0) {
            forwardOversized(pending, controller);
            pending = new Uint8Array(0);
          }
        }
        return;
      }
      const frame = pending.subarray(0, end);
      pending = pending.slice(end);
      if (oversized) {
        oversized = false;
        oversizedCarry = new Uint8Array(0);
        // The decoder never saw this frame's head; start the next one from a clean line.
        decoder = newDecoder();
        forwardOversized(frame, controller);
        continue;
      }
      controller.enqueue(rewrite(frame) ?? forwarded(frame));
    }
  };

  return new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
    transform(chunk, controller) {
      const merged = new Uint8Array(pending.byteLength + chunk.byteLength);
      merged.set(pending);
      merged.set(chunk, pending.byteLength);
      pending = merged;
      drain(controller);
    },
    flush(controller) {
      if (forged || pending.byteLength === 0) {
        return;
      }
      if (oversized) {
        forwardOversized(pending, controller);
        pending = new Uint8Array(0);
        return;
      }
      // A stream that ends without its final blank line still carries a decidable frame.
      controller.enqueue(rewrite(pending, true) ?? forwarded(pending));
      pending = new Uint8Array(0);
    },
  });
};
