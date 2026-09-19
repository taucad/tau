import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createProviderAccountFrameFilter, gatewayErrorFrame } from '#api/llm/provider-account-stream.js';
import type { ProviderAccountOwner, ProviderAccountRefusal } from '#api/llm/provider-account-refusal.js';
import type { GatewayProviderId } from '#api/providers/provider-gateway.js';

/* The real 200 stream OpenAI sent on 2026-09-19 with an exhausted organisation balance. */
const capture = readFileSync(new URL('provider-account-stream.fixture.sse', import.meta.url), 'utf8');
const captureFrames = capture.split('\n\n').filter((frame) => frame !== '');
const frame = (index: number): string => `${captureFrames[index]!}\n\n`;
const providerMessage =
  'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.';

/*
 * The real 200 stream Vertex sent on 2026-09-19 when its shared quota ran out mid-turn:
 * one well-formed chunk, then a bare pretty-printed JSON array in place of an SSE frame,
 * then a clean EOF. No decoder in the chain sees a `data:` field in that tail, so before
 * Finding 3 it was forwarded raw and the turn died as `Stream ended without
 * finish_reason` — the real cause, a mid-stream rate limit, erased.
 */
const vertexCapture = readFileSync(new URL('provider-account-stream.vertex-429.fixture.sse', import.meta.url), 'utf8');
const vertexChunk = `${vertexCapture.split('\n\n')[0]!}\n\n`;
const vertexTail = vertexCapture.split('\n\n')[1]!;
const vertexMessage =
  'Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.';

const completedFrame = `event: response.completed\ndata: ${JSON.stringify({
  type: 'response.completed',
  response: { id: 'resp_0963fce9a012eaee006aad94b8503487d0910e257a189cf919', status: 'completed' },
})}\n\n`;

const encoder = new TextEncoder();

/* The exact wire frame the shared contract fixes; every client parses this text. */
const contractFrame = (message: string, accountOwner: ProviderAccountOwner): string =>
  `event: error\ndata: {"type":"error","code":"PROVIDER_ACCOUNT_EXHAUSTED","message":"${message}","error":{"type":"tau_gateway","code":"PROVIDER_ACCOUNT_EXHAUSTED","message":"${message}","details":{"providerId":"openai","providerCode":"credit_balance_exhausted","accountOwner":"${accountOwner}"}}}\n\n`;

/*
 * The same envelope with only its code and message changed. The contract is one frame
 * shape for every Tau-coded failure, so a client that switches on `error.code` needs no
 * new parsing to see a rate limit.
 */
const cloudRateLimitMessage = 'The model provider is rate limiting this request.';
const rateLimitedFrame = (accountOwner: ProviderAccountOwner): string => {
  // Tau owns the key on Cloud, so the supplier's own sentence never leaves the API.
  const message = accountOwner === 'tau' ? cloudRateLimitMessage : vertexMessage;
  return `event: error\ndata: {"type":"error","code":"RATE_LIMITED","message":"${message}","error":{"type":"tau_gateway","code":"RATE_LIMITED","message":"${message}","details":{"providerId":"vertexai","providerCode":"RESOURCE_EXHAUSTED","accountOwner":"${accountOwner}"}}}\n\n`;
};

/** Feeds `text` through the filter in fixed-size chunks that ignore frame boundaries. */
const filtered = async (input: {
  readonly text: string;
  readonly accountOwner: ProviderAccountOwner;
  readonly chunkBytes: number;
  readonly providerId?: GatewayProviderId;
  readonly onRefusal?: (refusal: ProviderAccountRefusal) => void;
  readonly onTerminalFailure?: (failure: { readonly code?: string; readonly message?: string }) => void;
}): Promise<string> => {
  const bytes = encoder.encode(input.text);
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += input.chunkBytes) {
        controller.enqueue(bytes.slice(offset, offset + input.chunkBytes));
      }
      controller.close();
    },
  });
  const parts: Array<Uint8Array<ArrayBuffer>> = [];
  const decoder = new TextDecoder();
  for await (const part of source.pipeThrough(
    createProviderAccountFrameFilter({
      providerId: input.providerId ?? 'openai',
      accountOwner: input.accountOwner,
      ...(input.onRefusal === undefined ? {} : { onRefusal: input.onRefusal }),
      ...(input.onTerminalFailure === undefined ? {} : { onTerminalFailure: input.onTerminalFailure }),
    }),
  )) {
    parts.push(part);
  }
  return parts.map((part) => decoder.decode(part, { stream: true })).join('') + decoder.decode();
};

describe('createProviderAccountFrameFilter', () => {
  it('should replace the captured supplier refusal with the Tau-coded frame on self-host', async () => {
    const seen: ProviderAccountRefusal[] = [];

    const output = await filtered({
      text: capture,
      accountOwner: 'operator',
      chunkBytes: 37,
      onRefusal: (refusal) => seen.push(refusal),
    });

    expect(output).toBe(frame(0) + frame(1) + contractFrame(providerMessage, 'operator') + frame(3));
    expect(contractFrame(providerMessage, 'operator')).toBe(
      gatewayErrorFrame({
        code: 'PROVIDER_ACCOUNT_EXHAUSTED',
        message: providerMessage,
        details: { providerId: 'openai', providerCode: 'credit_balance_exhausted', accountOwner: 'operator' },
      }),
    );
    // The operator owns the key, so the provider's sentence and the supplier frame stay whole.
    expect(output).toContain('"code":"PROVIDER_ACCOUNT_EXHAUSTED"');
    expect(output).toContain(providerMessage);
    expect(seen).toEqual([{ providerCode: 'credit_balance_exhausted', message: providerMessage }]);
  });

  it('should keep the supplier sentence off the wire on Cloud', async () => {
    const output = await filtered({ text: capture, accountOwner: 'tau', chunkBytes: 13 });

    expect(output).toContain(contractFrame("The model provider's account is unavailable.", 'tau'));
    // Both the error frame and the response.failed sentence behind it are redacted.
    expect(output).not.toContain('You have no credits remaining');
    expect(output).not.toContain('platform.openai.com');
    const failed = JSON.parse(
      output
        .split('\n\n')
        .findLast((part) => part !== '')!
        .replace(/^event: .*\ndata: /, ''),
    ) as {
      type: string;
      response: { status: string; error: { code: string; message: string } };
    };
    expect(failed).toMatchObject({
      type: 'response.failed',
      response: {
        status: 'failed',
        error: { code: 'credit_balance_exhausted', message: "The model provider's account is unavailable." },
      },
    });
  });

  it.each([1, 3, 37, 512, 8192])(
    'should pass a healthy stream through byte-for-byte in %i-byte chunks',
    async (chunkBytes) => {
      const healthy = frame(0) + frame(1) + completedFrame;
      const onRefusal = vi.fn();

      expect(await filtered({ text: healthy, accountOwner: 'tau', chunkBytes, onRefusal })).toBe(healthy);
      expect(onRefusal).not.toHaveBeenCalled();
    },
  );

  it('should forward an error frame it does not recognize unchanged', async () => {
    const rejected = `event: error\ndata: ${JSON.stringify({
      type: 'error',
      error: { type: 'rate_limit_error', code: 'rate_limit_exceeded', message: 'Slow down.' },
    })}\n\n`;
    const onRefusal = vi.fn();

    expect(await filtered({ text: frame(0) + rejected, accountOwner: 'tau', chunkBytes: 11, onRefusal })).toBe(
      frame(0) + rejected,
    );
    expect(onRefusal).not.toHaveBeenCalled();
  });

  it('should forward a healthy frame past the decoder ceiling byte-for-byte', async () => {
    // A long generation's terminal `response.completed` can exceed 256 KiB while
    // still completing inside one drain; it must be forwarded, never parsed.
    const large = `event: response.completed\ndata: ${JSON.stringify({
      type: 'response.completed',
      // The text names an error, so only the size gate keeps the decoder off it.
      response: { id: 'resp_large', status: 'completed', summary: 'no error here. '.repeat(20 * 1024) },
    })}\n\n`;
    const text = frame(0) + large + completedFrame;

    expect(await filtered({ text, accountOwner: 'tau', chunkBytes: 64 * 1024 })).toBe(text);
  });

  it.each<ProviderAccountOwner>(['tau', 'operator'])(
    'should code a refusal that arrives only as response.failed for the %s account',
    async (accountOwner) => {
      const seen: ProviderAccountRefusal[] = [];
      // The captured `response.failed` is frame(3); no `error` event precedes it here.
      const text = frame(0) + frame(1) + frame(3);
      const output = await filtered({
        text,
        accountOwner,
        chunkBytes: 7,
        onRefusal: (refusal) => {
          seen.push(refusal);
        },
      });

      expect(seen).toEqual([{ providerCode: 'credit_balance_exhausted', message: providerMessage }]);
      const message = accountOwner === 'tau' ? "The model provider's account is unavailable." : providerMessage;
      expect(output.startsWith(frame(0) + frame(1) + contractFrame(message, accountOwner))).toBe(true);
      const failed = output.slice((frame(0) + frame(1) + contractFrame(message, accountOwner)).length);
      expect(failed).toContain('response.failed');
      if (accountOwner === 'tau') {
        expect(failed).not.toContain(providerMessage);
      } else {
        expect(failed).toBe(frame(3));
      }
    },
  );

  /*
   * Healthy Gemini turns died intermittently as pi's `Stream ended without
   * finish_reason`, which is what a relay stage losing the terminal frame looks
   * like. The filter holds one event's bytes to decide on it, so it is replayed
   * here at every single byte split — inside a `data:` prefix, between the two
   * newlines of an event boundary, inside a multi-byte character and with no
   * closing blank line — and held to byte identity with the unsplit run.
   */
  const healthyStreams = {
    /* Thought markers, a signed tool call, `finish_reason` and a usage-only final chunk. */
    geminiToolTurn:
      `data: {"id":"c1","choices":[{"index":0,"delta":{"role":"assistant","content":"<think>寸法…</think>","extra_content":{"google":{"thought":true}}}}]}\n\n` +
      `data: {"id":"c1","choices":[{"index":0,"delta":{"content":"Fillet R‑3 mm ✅"}}]}\n\n` +
      `data: {"id":"c1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"run","arguments":"{\\"a\\":1}"},"extra_content":{"google":{"thought_signature":"sig"}}}]}}]}\n\n` +
      `data: {"id":"c1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n` +
      `data: {"id":"c1","choices":[],"usage":{"prompt_tokens":9,"completion_tokens":4096}}\n\n` +
      `data: [DONE]\n\n`,
    /* A turn whose generated text names an error, so every frame takes the parsing path. */
    errorWord:
      `data: {"id":"c2","choices":[{"index":0,"delta":{"content":"The error was a wall thickness of 0.2 mm."}}]}\n\n` +
      `data: {"id":"c2","choices":[{"index":0,"delta":{},"finish_reason":"length"}]}\n\n` +
      `data: [DONE]\n\n`,
    /* CRLF terminators and a body that ends on its last event with no blank line. */
    crlfNoTrailingBlankLine:
      `data: {"id":"c3","choices":[{"index":0,"delta":{"content":"ok"}}]}\r\n\r\n` +
      `data: {"id":"c3","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
  } as const;

  it.each(Object.entries(healthyStreams))(
    'should relay the %s stream identically at every single chunk boundary',
    async (_name, text) => {
      const length = encoder.encode(text).byteLength;
      const split = async (cuts: readonly number[]): Promise<string> => {
        const bytes = encoder.encode(text);
        const offsets = [0, ...cuts, length];
        const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
          start(controller) {
            for (let index = 0; index < offsets.length - 1; index += 1) {
              controller.enqueue(bytes.slice(offsets[index], offsets[index + 1]));
            }
            controller.close();
          },
        });
        const parts: Array<Uint8Array<ArrayBuffer>> = [];
        for await (const part of source.pipeThrough(
          createProviderAccountFrameFilter({ providerId: 'vertexai', accountOwner: 'operator' }),
        )) {
          parts.push(part);
        }
        const decoder = new TextDecoder();
        return parts.map((part) => decoder.decode(part, { stream: true })).join('') + decoder.decode();
      };

      expect(await split([])).toBe(text);
      for (let cut = 1; cut < length; cut += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each split is a separate stream run.
        expect(await split([cut])).toBe(text);
      }
      for (const stride of [1, 2, 3, 5, 7, 11, 13, 17, 29, 47, 101]) {
        const cuts = Array.from({ length: Math.ceil(length / stride) - 1 }, (_value, index) => (index + 1) * stride);
        // oxlint-disable-next-line no-await-in-loop -- each partition is a separate stream run.
        expect(await split(cuts)).toBe(text);
      }
    },
  );

  it('should rewrite a refusal that arrives with CRLF terminators and no trailing blank line', async () => {
    const crlf = `event: error\r\ndata: ${JSON.stringify({
      type: 'error',
      error: { type: 'insufficient_quota', code: 'credit_balance_exhausted', message: providerMessage },
    })}`;

    expect(await filtered({ text: crlf, accountOwner: 'operator', chunkBytes: 5 })).toBe(
      contractFrame(providerMessage, 'operator'),
    );
  });
});

describe('a provider that cuts a live stream by its status (Finding 3)', () => {
  const vertex = { providerId: 'vertexai', accountOwner: 'operator' } as const;

  it.each([1, 7, 37, 300, 512, 8192])(
    'should code the captured non-SSE 429 tail as RATE_LIMITED in %i-byte chunks',
    async (chunkBytes) => {
      const onTerminalFailure = vi.fn();

      const output = await filtered({
        ...vertex,
        text: vertexChunk + vertexChunk + vertexTail,
        chunkBytes,
        onTerminalFailure,
      });

      expect(output).toBe(vertexChunk + vertexChunk + rateLimitedFrame('operator'));
      expect(onTerminalFailure).toHaveBeenCalledOnce();
      expect(onTerminalFailure).toHaveBeenCalledWith({ code: '429', message: vertexMessage });
    },
  );

  it('should replace the raw tail rather than forward it as well', async () => {
    const output = await filtered({ ...vertex, text: vertexCapture, chunkBytes: 64 });

    expect(output).toBe(vertexChunk + rateLimitedFrame('operator'));
    // The bare array and its pretty-printed status reach no client once coded.
    expect(output).not.toContain(vertexTail);
    expect(output).not.toContain('"code": 429');
  });

  it('should pin the coded frame to the shared gateway envelope', () => {
    expect(rateLimitedFrame('operator')).toBe(
      gatewayErrorFrame({
        code: 'RATE_LIMITED',
        message: vertexMessage,
        details: { providerId: 'vertexai', providerCode: 'RESOURCE_EXHAUSTED', accountOwner: 'operator' },
      }),
    );
  });

  it.each(['tail', 'in-band'] as const)(
    'should give a Cloud customer the shared sentence for a %s refusal, never the supplier text',
    async (shape) => {
      const inBand = `data: ${JSON.stringify({
        error: { code: 429, message: vertexMessage, status: 'RESOURCE_EXHAUSTED' },
      })}\n\n`;
      const onTerminalFailure = vi.fn();

      const output = await filtered({
        providerId: 'vertexai',
        accountOwner: 'tau',
        text: vertexChunk + (shape === 'tail' ? vertexTail : inBand),
        chunkBytes: 41,
        onTerminalFailure,
      });

      expect(output).toBe(vertexChunk + rateLimitedFrame('tau'));
      expect(output).not.toContain('Resource exhausted');
      expect(output).not.toContain('cloud.google.com');
      // The operator's own log still gets the supplier's sentence: it is the only
      // thing that says which quota ran out.
      expect(onTerminalFailure).toHaveBeenCalledWith({ code: '429', message: vertexMessage });
    },
  );

  it.each([
    [500, 'The model provider is unavailable.'],
    [400, 'The model provider rejected the request (HTTP 400).'],
  ] as const)('should answer a Cloud customer a trailing %i with the shared sentence', async (code, expected) => {
    const tail = JSON.stringify([{ error: { code, message: vertexMessage, status: 'SOME_STATUS' } }]);

    const output = await filtered({
      providerId: 'vertexai',
      accountOwner: 'tau',
      text: vertexChunk + tail,
      chunkBytes: 31,
    });

    expect(output).toContain(`"message":"${expected}"`);
    expect(output).not.toContain('cloud.google.com');
  });

  it('should clamp the supplier sentence an operator is shown to 500 characters', async () => {
    // The message is persisted into the chat's error row, exactly as the pre-stream
    // leg clamps it.
    const long = 'y'.repeat(900);
    const tail = JSON.stringify([{ error: { code: 429, message: long } }]);

    const output = await filtered({ ...vertex, text: vertexChunk + tail, chunkBytes: 4096 });

    expect(output).toContain(`"message":"${'y'.repeat(500)}"`);
    expect(output).not.toContain('y'.repeat(501));
  });

  it('should forward a trailing tail past the decoder ceiling instead of buffering it', async () => {
    /* The tail is held undelivered until it can be decided, so the decision has to
     * keep the decoder's own ceiling: one oversized tail must not become the
     * gateway's memory profile. Past the ceiling it is forwarded as it arrives. */
    const huge = JSON.stringify([{ error: { code: 429, message: 'x'.repeat(300 * 1024) } }]);
    const onTerminalFailure = vi.fn();

    expect(await filtered({ ...vertex, text: vertexChunk + huge, chunkBytes: 64 * 1024, onTerminalFailure })).toBe(
      vertexChunk + huge,
    );
    expect(onTerminalFailure).not.toHaveBeenCalled();
  });

  it('should forward a trailing tail that never becomes valid JSON', async () => {
    // A stream cut inside the tail leaves bytes that parse as nothing. Swallowing
    // them would hide the cut instead of letting the client report it.
    const partial = vertexChunk + vertexTail.slice(0, 40);
    const onTerminalFailure = vi.fn();

    expect(await filtered({ ...vertex, text: partial, chunkBytes: 9, onTerminalFailure })).toBe(partial);
    expect(onTerminalFailure).not.toHaveBeenCalled();
  });

  it('should code an in-band SSE error frame by the status it names (F3)', async () => {
    /* Vertex also refuses in-band, as a plain chunk carrying an `error` object and no
     * `type: "error"` marker. Forwarded, it reached the client as a provider outage
     * with no rate-limit card; the status it names is the whole signal. */
    const inBand = `data: ${JSON.stringify({
      error: { code: 429, message: vertexMessage, status: 'RESOURCE_EXHAUSTED' },
    })}\n\n`;
    const onTerminalFailure = vi.fn();

    const output = await filtered({ ...vertex, text: vertexChunk + inBand, chunkBytes: 23, onTerminalFailure });

    expect(output).toBe(vertexChunk + rateLimitedFrame('operator'));
    expect(onTerminalFailure).toHaveBeenCalledOnce();
  });

  it.each([
    [500, 'PROVIDER_UNAVAILABLE'],
    [499, 'PROVIDER_UNAVAILABLE'],
    [400, 'UPSTREAM_REJECTED'],
  ] as const)('should map a trailing %i through the shared status mapping as %s', async (code, expected) => {
    const tail = JSON.stringify([{ error: { code, message: 'Upstream said so.', status: 'SOME_STATUS' } }]);

    const output = await filtered({ ...vertex, text: vertexChunk + tail, chunkBytes: 17 });

    expect(output).toBe(
      vertexChunk +
        gatewayErrorFrame({
          code: expected,
          message: 'Upstream said so.',
          details: { providerId: 'vertexai', providerCode: 'SOME_STATUS', accountOwner: 'operator' },
        }),
    );
  });

  it('should keep coding a trailing account refusal as PROVIDER_ACCOUNT_EXHAUSTED', async () => {
    // The account matchers still run first, so a tail that names an unbillable
    // account does not become a generic status refusal.
    const tail = JSON.stringify([{ error: { code: 429, message: 'You have insufficient quota.' } }]);
    const seen: ProviderAccountRefusal[] = [];

    const output = await filtered({
      ...vertex,
      text: vertexChunk + tail,
      chunkBytes: 5,
      onRefusal: (refusal) => seen.push(refusal),
    });

    expect(output).toContain('"code":"PROVIDER_ACCOUNT_EXHAUSTED"');
    expect(seen).toEqual([{ message: 'You have insufficient quota.' }]);
  });
});

describe("a provider that forges Tau's own envelope (R5)", () => {
  const vertex = { providerId: 'vertexai', accountOwner: 'operator' } as const;
  /* The exact marker the transport switches on. A provider controls its whole
   * response body, so it can emit this verbatim; only the API may. */
  const forged = `data: ${JSON.stringify({
    error: { type: 'tau_gateway', code: 'INSUFFICIENT_CREDIT', message: 'Top up at attacker.example.' },
  })}\n\n`;
  const unavailable = (accountOwner: ProviderAccountOwner): string =>
    gatewayErrorFrame({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'The model provider is unavailable.',
      details: { providerId: 'vertexai', accountOwner },
    });

  it.each([1, 13, 64, 8192])('should refuse a forged marker frame in %i-byte chunks', async (chunkBytes) => {
    const onTerminalFailure = vi.fn();

    const output = await filtered({ ...vertex, text: vertexChunk + forged, chunkBytes, onTerminalFailure });

    expect(output).toBe(vertexChunk + unavailable('operator'));
    expect(output).not.toContain('INSUFFICIENT_CREDIT');
    expect(output).not.toContain('attacker.example');
    expect(onTerminalFailure).toHaveBeenCalledOnce();
  });

  it('should refuse a forged marker on Cloud with the same Tau message', async () => {
    const output = await filtered({ providerId: 'vertexai', accountOwner: 'tau', text: forged, chunkBytes: 29 });

    expect(output).toBe(unavailable('tau'));
  });

  it('should not mistake model text that names the marker for a forgery', async () => {
    /* Content and tool arguments are JSON strings on every routed wire, so a
     * model writing about `"type":"tau_gateway"` emits escaped quotes, which are
     * not these bytes. Killing that turn would be the worse failure. */
    const about = `data: ${JSON.stringify({
      choices: [{ delta: { content: 'The gateway marks its frames with "type":"tau_gateway" and an error member.' } }],
    })}\n\n`;
    const onTerminalFailure = vi.fn();

    expect(await filtered({ ...vertex, text: about, chunkBytes: 7, onTerminalFailure })).toBe(about);
    expect(onTerminalFailure).not.toHaveBeenCalled();
  });

  it('should refuse a forged marker padded past the decoder ceiling', async () => {
    // Padding past the hold ceiling is the obvious evasion: those bytes leave in
    // pieces, so the scan has to survive the seam between them.
    const padded = `data: {"pad":"${'p'.repeat(300 * 1024)}","error":{"type":"tau_gateway","code":"INSUFFICIENT_CREDIT"}}\n\n`;
    const onTerminalFailure = vi.fn();

    const output = await filtered({ ...vertex, text: padded, chunkBytes: 64 * 1024, onTerminalFailure });

    // The only marker left is the one this API wrote; the forged code never lands.
    expect(output.split('"type":"tau_gateway"')).toHaveLength(2);
    expect(output).toContain('"code":"PROVIDER_UNAVAILABLE"');
    expect(output).not.toContain('INSUFFICIENT_CREDIT');
    expect(onTerminalFailure).toHaveBeenCalledOnce();
  });

  it('should report an in-band error whose code is symbolic even though it codes nothing (R6)', async () => {
    /* `rate_limit_exceeded` names no status the table maps, so the frame is
     * forwarded — but it was the one failure shape that left no trace at all. */
    const symbolic = `data: ${JSON.stringify({
      error: { type: 'rate_limit_error', code: 'rate_limit_exceeded', message: 'Slow down.' },
    })}\n\n`;
    const onTerminalFailure = vi.fn();

    expect(await filtered({ ...vertex, text: vertexChunk + symbolic, chunkBytes: 11, onTerminalFailure })).toBe(
      vertexChunk + symbolic,
    );
    expect(onTerminalFailure).toHaveBeenCalledExactlyOnceWith({
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
      message: 'Slow down.',
    });
  });
});

/*
 * L3's end-shape table, restricted to the rows this filter alone decides. The
 * socket-level rows (`socket-destroy`, `socket-end-raw`) never reach a transform,
 * and the client-visible codes for every row belong to the transport.
 */
describe('relay end shapes the filter decides', () => {
  const content = `data: {"id":"c1","choices":[{"index":0,"delta":{"content":"Hello from the fake upstream."}}]}\n\n`;
  const terminal = `data: {"id":"c1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`;

  it.each([
    ['clean-terminal', content + terminal + `data: [DONE]\n\n`, undefined],
    ['clean-no-finish', content, undefined],
    ['finish-no-blank', content + terminal.slice(0, -2), undefined],
    [
      'in-stream-error',
      content + `data: {"error":{"code":429,"message":"${vertexMessage}","status":"RESOURCE_EXHAUSTED"}}\n\n`,
      'RATE_LIMITED',
    ],
    ['captured-vertex-429-tail', content + vertexTail, 'RATE_LIMITED'],
  ] as const)('should answer the %s shape as L3 recorded it', async (_shape, text, coded) => {
    const output = await filtered({ providerId: 'vertexai', accountOwner: 'operator', text, chunkBytes: 29 });

    if (coded === undefined) {
      // Nothing to classify: these shapes are forwarded byte-for-byte and the
      // transport decides what a missing terminal frame means.
      expect(output).toBe(text);
      return;
    }
    expect(output).toBe(content + rateLimitedFrame('operator'));
  });
});
