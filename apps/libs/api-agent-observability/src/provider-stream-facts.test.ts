/* eslint-disable @typescript-eslint/naming-convention -- provider wire fields use snake_case. */
import { describe, expect, it } from 'vitest';
import { ProviderStreamFacts } from '#provider-stream-facts.js';
import type { ModelProviderWire } from '@taucad/api-llm-gateway';

const secret = 'PRIVATE_OUTPUT_TEXT_91c2';
const frames = (events: readonly unknown[]): string =>
  events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('');

/** Feed the stream in awkward slices, as a socket would. */
const read = (wire: ModelProviderWire, body: string, slice = 7) => {
  let now = 100;
  const facts = new ProviderStreamFacts(wire, 100, () => {
    now += 10;
    return now;
  });
  const bytes = new TextEncoder().encode(body);
  for (let offset = 0; offset < bytes.byteLength; offset += slice) {
    facts.accept(bytes.subarray(offset, offset + slice));
  }
  return facts.summary();
};

describe('ProviderStreamFacts', () => {
  it('should read an Anthropic stream that ends on a tool call', () => {
    const summary = read(
      'anthropic',
      frames([
        {
          type: 'message_start',
          message: {
            id: 'msg_1',
            model: 'claude-test',
            usage: { input_tokens: 12, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 },
          },
        },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: secret } },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
        { type: 'message_stop' },
      ]),
    );

    expect(summary).toMatchObject({
      stop: 'toolUse',
      resolvedModel: 'claude-test',
      response: 'msg_1',
      usage: { input: 12, output: 5, cacheRead: 3, cacheWrite: 0, reasoning: null, missing: 'none' },
    });
    expect(summary.firstChunk).toBeGreaterThan(0);
    expect(summary.firstText).toBeGreaterThanOrEqual(summary.firstChunk!);
    expect(JSON.stringify(summary)).not.toContain(secret);
  });

  it('should report no first output for a stream that ended before any byte', () => {
    const summary = read('anthropic', '');

    expect(summary.firstChunk).toBeUndefined();
    expect(summary.usage.missing).toBe('unreported');
  });

  it('should read a Responses stream and tell length from a normal stop', () => {
    const completed = (status: string, extra: Record<string, unknown>) =>
      frames([
        { type: 'response.created', response: { id: 'resp_1', model: 'gpt-test' } },
        { type: 'response.output_text.delta', delta: secret },
        {
          type: status,
          response: {
            id: 'resp_1',
            model: 'gpt-test',
            output: [{ type: 'message', content: [{ type: 'output_text', text: secret }] }],
            usage: {
              input_tokens: 20,
              output_tokens: 8,
              input_tokens_details: { cached_tokens: 4 },
              output_tokens_details: { reasoning_tokens: 2 },
            },
            ...extra,
          },
        },
        '[DONE]',
      ]);

    expect(read('openai-responses', completed('response.completed', {}))).toMatchObject({
      stop: 'stop',
      usage: { input: 16, output: 8, cacheRead: 4, reasoning: 2, missing: 'none' },
    });
    expect(
      read(
        'openai-responses',
        completed('response.incomplete', { incomplete_details: { reason: 'max_output_tokens' } }),
      ).stop,
    ).toBe('length');
  });

  it('should read a Chat Completions stream with a trailing usage chunk', () => {
    const summary = read(
      'openai-completions',
      frames([
        { id: 'cmpl_1', model: 'kimi-test', choices: [{ index: 0, delta: { content: secret } }] },
        { id: 'cmpl_1', model: 'kimi-test', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        { id: 'cmpl_1', model: 'kimi-test', choices: [], usage: { prompt_tokens: 9, completion_tokens: 3 } },
        '[DONE]',
      ]),
    );

    expect(summary).toMatchObject({ stop: 'toolUse', usage: { input: 9, output: 3, missing: 'none' } });
  });

  /*
   * Vertex's OpenAI-compatible wire bills thinking on top of `completion_tokens`, so output is their sum there, as the
   * ledger counts it (`billable-model-evidence.ts`); every other supplier on the wire counts it inside (LI4, LA3).
   */
  it.each([
    ['vertexai', 205 + 127],
    ['openai', 205],
    [undefined, 205],
  ] as const)(
    'should count reasoning as output on the completions wire when the supplier is %s',
    (provider, output) => {
      const facts = new ProviderStreamFacts('openai-completions', 0, () => 1);
      if (provider !== undefined) {
        facts.routedTo(provider);
      }
      facts.accept(
        new TextEncoder().encode(
          frames([
            { id: 'cmpl_1', model: 'gemini-test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
            {
              id: 'cmpl_1',
              model: 'gemini-test',
              choices: [],
              usage: {
                prompt_tokens: 1935,
                completion_tokens: 205,
                completion_tokens_details: { reasoning_tokens: 127 },
              },
            },
          ]),
        ),
      );

      expect(facts.summary().usage).toMatchObject({ input: 1935, output, reasoning: 127, missing: 'none' });
    },
  );

  it('should report what it cannot read instead of throwing', () => {
    const summary = read('anthropic', 'data: {not json}\n\nevent: ping\n\n');

    expect(summary.stop).toBeUndefined();
    expect(summary.usage.missing).toBe('unreported');
  });

  /* 10,000 prompt tokens of which 8,000 were cached: `usage.input` is the uncached 2,000 on every wire (LI4, LF-33). */
  it.each([
    [
      'anthropic',
      [
        {
          type: 'message_start',
          message: {
            id: 'msg_1',
            model: 'claude-test',
            usage: { input_tokens: 2000, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0 },
          },
        },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 500 } },
      ],
    ],
    [
      'openai-responses',
      [
        {
          type: 'response.completed',
          response: {
            id: 'resp_1',
            model: 'gpt-test',
            output: [],
            usage: { input_tokens: 10_000, output_tokens: 500, input_tokens_details: { cached_tokens: 8000 } },
          },
        },
      ],
    ],
    [
      'openai-completions',
      [
        { id: 'cmpl_1', model: 'gpt-test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        {
          id: 'cmpl_1',
          model: 'gpt-test',
          choices: [],
          usage: { prompt_tokens: 10_000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 8000 } },
        },
      ],
    ],
  ] as const)('should report uncached input on the %s wire', (wire, events) => {
    expect(read(wire, frames(events)).usage).toMatchObject({
      input: 2000,
      cacheRead: 8000,
      output: 500,
      missing: 'none',
    });
  });
});

describe('ProviderStreamFacts capture', () => {
  const anthropic = frames([
    { type: 'message_start', message: { id: 'msg_1', model: 'claude-test', usage: { input_tokens: 4 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: secret } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
  ]);
  const feed = (facts: ProviderStreamFacts, body: string): void => {
    const bytes = new TextEncoder().encode(body);
    for (let offset = 0; offset < bytes.byteLength; offset += 5) {
      facts.accept(bytes.subarray(offset, offset + 5));
    }
  };

  it('hands every data frame to a capture, including frames the facts do not read', () => {
    const seen: unknown[] = [];
    const facts = new ProviderStreamFacts('anthropic', 0, () => 1);
    facts.capture({ accept: (frame) => seen.push(frame) });

    feed(facts, anthropic);

    expect(seen.map((frame) => (frame as { type: string }).type)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'message_delta',
    ]);
  });

  it('reads the same facts whether a capture is attached, absent or throwing', () => {
    const plain = new ProviderStreamFacts('anthropic', 0, () => 1);
    const throwing = new ProviderStreamFacts('anthropic', 0, () => 1);
    throwing.capture({
      accept: () => {
        throw new Error('capture failed');
      },
    });

    feed(plain, anthropic);
    feed(throwing, anthropic);

    expect(throwing.summary()).toEqual(plain.summary());
  });
});
