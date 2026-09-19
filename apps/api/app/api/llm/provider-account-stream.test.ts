import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createProviderAccountFrameFilter, providerAccountExhaustedFrame } from '#api/llm/provider-account-stream.js';
import type { ProviderAccountOwner, ProviderAccountRefusal } from '#api/llm/provider-account-refusal.js';

/* The real 200 stream OpenAI sent on 2026-09-19 with an exhausted organisation balance. */
const capture = readFileSync(new URL('provider-account-stream.fixture.sse', import.meta.url), 'utf8');
const captureFrames = capture.split('\n\n').filter((frame) => frame !== '');
const frame = (index: number): string => `${captureFrames[index]!}\n\n`;
const providerMessage =
  'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.';

const completedFrame = `event: response.completed\ndata: ${JSON.stringify({
  type: 'response.completed',
  response: { id: 'resp_0963fce9a012eaee006aad94b8503487d0910e257a189cf919', status: 'completed' },
})}\n\n`;

const encoder = new TextEncoder();

/* The exact wire frame the shared contract fixes; every client parses this text. */
const contractFrame = (message: string, accountOwner: ProviderAccountOwner): string =>
  `event: error\ndata: {"type":"error","code":"PROVIDER_ACCOUNT_EXHAUSTED","message":"${message}","error":{"type":"tau_gateway","code":"PROVIDER_ACCOUNT_EXHAUSTED","message":"${message}","details":{"providerId":"openai","providerCode":"credit_balance_exhausted","accountOwner":"${accountOwner}"}}}\n\n`;

/** Feeds `text` through the filter in fixed-size chunks that ignore frame boundaries. */
const filtered = async (input: {
  readonly text: string;
  readonly accountOwner: ProviderAccountOwner;
  readonly chunkBytes: number;
  readonly onRefusal?: (refusal: ProviderAccountRefusal) => void;
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
      providerId: 'openai',
      accountOwner: input.accountOwner,
      ...(input.onRefusal === undefined ? {} : { onRefusal: input.onRefusal }),
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
      providerAccountExhaustedFrame({
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
      // frame(3) is the captured `response.failed`; no `error` event precedes it here.
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
