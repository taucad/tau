import { createSseDecoder } from '#api/llm/llm-gateway.stream.js';
import type { SseEvent } from '#api/llm/llm-gateway.stream.js';
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
const errorNeedle = encoder.encode('error');

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

/** The Tau-coded frame that replaces a recognised supplier refusal on the wire. */
export const providerAccountExhaustedFrame = (input: {
  readonly message: string;
  readonly details: ProviderAccountRefusalDetails;
}): string =>
  `event: error\ndata: ${JSON.stringify({
    type: 'error',
    code: 'PROVIDER_ACCOUNT_EXHAUSTED',
    message: input.message,
    error: {
      type: 'tau_gateway',
      code: 'PROVIDER_ACCOUNT_EXHAUSTED',
      message: input.message,
      details: input.details,
    },
  })}\n\n`;

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

/** What a terminal failure frame says about itself: no prompt or response content. */
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
  return {
    ...(typeof source['type'] === 'string' ? { type: source['type'] } : {}),
    ...(typeof source['code'] === 'string' ? { code: source['code'] } : {}),
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
 * terminal failure frame the relay would otherwise forward without a trace.
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
  let rewritten = false;
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
      providerAccountExhaustedFrame({
        message: providerAccountMessage(input.accountOwner, refusal),
        details: {
          providerId: input.providerId,
          ...(refusal.providerCode === undefined ? {} : { providerCode: refusal.providerCode }),
          accountOwner: input.accountOwner,
        },
      }),
    );
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
      return undefined;
    }
    if (isErrorEvent(event)) {
      const refusal = recognizeProviderAccountRefusal({ providerId: input.providerId, body: event.data });
      if (refusal) {
        return coded(refusal);
      }
      // Forwarded unchanged, but no longer unrecorded: the relay's only sight
      // of why the turn ended (R8).
      input.onTerminalFailure?.(terminalFailureOf(event.data));
      return undefined;
    }
    const failed = failedResponseError(event.data);
    if (!failed) {
      return undefined;
    }
    /* A refusal that reaches the wire only as `response.failed` (no `error`
     * event ahead of it) is coded here, once, ahead of the frame itself. */
    const refusal = rewritten
      ? undefined
      : recognizeProviderAccountRefusal({ providerId: input.providerId, body: failed.payload });
    if (refusal === undefined && !rewritten) {
      input.onTerminalFailure?.(terminalFailureOf(failed.payload));
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

  const drain = (controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>): void => {
    for (;;) {
      const end = eventEnd(pending);
      if (end < 0) {
        if (oversized || pending.byteLength > maximumFrameBytes) {
          // Too large to hold for a decision: forward its bytes as they arrive.
          oversized = true;
          if (pending.byteLength > 0) {
            controller.enqueue(pending);
            pending = new Uint8Array(0);
          }
        }
        return;
      }
      const frame = pending.subarray(0, end);
      pending = pending.slice(end);
      if (oversized) {
        oversized = false;
        // The decoder never saw this frame's head; start the next one from a clean line.
        decoder = newDecoder();
        controller.enqueue(frame);
        continue;
      }
      controller.enqueue(rewrite(frame) ?? frame);
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
      if (pending.byteLength === 0) {
        return;
      }
      // A stream that ends without its final blank line still carries a decidable frame.
      controller.enqueue((oversized ? undefined : rewrite(pending, true)) ?? pending);
      pending = new Uint8Array(0);
    },
  });
};
