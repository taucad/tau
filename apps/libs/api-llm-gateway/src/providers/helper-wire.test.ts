/* eslint-disable @typescript-eslint/naming-convention -- fixtures mirror provider wire keys. */
import { describe, expect, it } from 'vitest';
import type { Model } from '@taucad/chat/model-catalog';
import { modelList } from '#models/model.constants.js';
import { HelperStreamFailure, helperRequestBody, readHelperStream } from '#providers/helper-wire.js';
import type { HelperPrompt, HelperStreamEvent } from '#providers/helper-wire.js';
import { helperModelRoute } from '#providers/provider-gateway.js';
import type { HelperModelRoute } from '#providers/provider-gateway.js';

const pngBase64 = 'iVBORw0KGgo=';
const pngDataUrl = `data:image/png;base64,${pngBase64}`;

const textPrompt: HelperPrompt = {
  system: 'Name it.',
  messages: [{ role: 'user', content: 'A bracket with two holes' }],
  maximumOutputTokens: 64,
};

/* The shapes `convertToModelMessages` and callers produce: a UI file part as a data URL, a
 * remote image, raw base64 and bytes. */
const imagePrompt: HelperPrompt = {
  system: 'Name it.',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Name this part' },
        { type: 'file', mediaType: 'image/png', data: pngDataUrl },
        { type: 'image', image: new URL('https://example.test/part.png') },
        { type: 'image', image: pngBase64, mediaType: 'image/png' },
        { type: 'file', mediaType: 'image/png', data: Buffer.from(pngBase64, 'base64') },
      ],
    },
  ],
  maximumOutputTokens: 64,
};

const catalogRow = (providerId: keyof typeof modelList, slug: string): Model =>
  (modelList[providerId] as Record<string, Model>)[slug]!;

const routeOf = (model: Model): HelperModelRoute => {
  const route = helperModelRoute(model);
  if (!route) {
    throw new Error(`No helper route for ${model.id}`);
  }
  return route;
};

const bodyFor = (model: Model, prompt: HelperPrompt = textPrompt): Record<string, unknown> =>
  helperRequestBody(routeOf(model), model, prompt);

const ollamaModel = {
  id: 'llama3.2:latest',
  model: 'llama3.2:latest',
  provider: { id: 'ollama', name: 'Ollama' },
  configuration: { streaming: true, temperature: 0 },
} as unknown as Model;

describe('helperModelRoute', () => {
  it.each([
    ['openai', 'gpt-5.6-luna', 'openai-responses'],
    ['xai', 'grok-4.6', 'openai-responses'],
    ['anthropic', 'claude-haiku-5.5', 'anthropic'],
    ['vertexai', 'gemini-3.8-flash', 'openai-completions'],
    ['together', 'kimi-k3', 'openai-completions'],
    ['morph', 'minimax-m2.7', 'openai-completions'],
  ] as const)('should route %s %s to its provider model on its wire', (providerId, slug, wire) => {
    const row = catalogRow(providerId, slug);

    expect(helperModelRoute(row)).toEqual({ providerId, modelId: row.model, wire });
  });

  it('should route a discovered Ollama model to the local completions target', () => {
    expect(helperModelRoute(ollamaModel)).toEqual({
      providerId: 'ollama',
      modelId: 'llama3.2:latest',
      wire: 'openai-completions',
    });
  });

  it.each([
    ['cerebras', 'qwen-3-235b'],
    ['moonshot', 'kimi-k3'],
  ] as const)('should not route the disabled %s %s row', (providerId, slug) => {
    expect(helperModelRoute(catalogRow(providerId, slug))).toBeUndefined();
  });
});

describe('helperRequestBody', () => {
  it('should send OpenAI no reasoning, the row temperature and the helper output ceiling on the Responses wire', () => {
    expect(bodyFor(catalogRow('openai', 'gpt-5.6-luna'), imagePrompt)).toEqual({
      model: 'gpt-5.6-luna',
      stream: true,
      max_output_tokens: 64,
      temperature: 1,
      // The funded helper's effort; the row's `high` and its summary would spend the 64 tokens thinking.
      reasoning: { effort: 'none' },
      input: [
        { role: 'system', content: 'Name it.' },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Name this part' },
            { type: 'input_image', image_url: pngDataUrl, detail: 'auto' },
            { type: 'input_image', image_url: 'https://example.test/part.png', detail: 'auto' },
            { type: 'input_image', image_url: pngDataUrl, detail: 'auto' },
            { type: 'input_image', image_url: pngDataUrl, detail: 'auto' },
          ],
        },
      ],
    });
  });

  it.each(['grok-4.7', 'grok-4.6'])(
    'should send xAI %s its lowest effort and the helper ceiling, not the row ceiling',
    (slug) => {
      const body = bodyFor(catalogRow('xai', slug));

      expect(body).toMatchObject({ model: slug, max_output_tokens: 64 });
      expect(body['reasoning']).toEqual({ effort: 'low' });
    },
  );

  it('should send a Responses row without reasoning no reasoning block', () => {
    const row = catalogRow('openai', 'gpt-4o-mini');
    const body = helperRequestBody(
      { providerId: 'openai', modelId: row.model, wire: 'openai-responses' },
      row,
      textPrompt,
    );

    expect(body).not.toHaveProperty('reasoning');
  });

  it('should send Anthropic no thinking or effort, a top-level system prompt and image sources', () => {
    const row = catalogRow('anthropic', 'claude-haiku-5.5');
    const body = bodyFor(row, imagePrompt);

    expect(body).toEqual({
      model: row.model,
      stream: true,
      max_tokens: 64,
      system: 'Name it.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Name this part' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
            { type: 'image', source: { type: 'url', url: 'https://example.test/part.png' } },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
          ],
        },
      ],
    });
    // The row's own 16k ceilings never reach a 64-token helper.
    expect(body).not.toHaveProperty('max_tokens', 16_000);
  });

  it('should send no Anthropic thinking even on a row with adaptive display and a higher effort', () => {
    const body = bodyFor(catalogRow('anthropic', 'claude-fable-5.1'));

    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('output_config');
  });

  it('should prefix the Vertex model with google/ and send its lowest thinking level under extra_body', () => {
    expect(bodyFor(catalogRow('vertexai', 'gemini-3.8-flash'), imagePrompt)).toEqual({
      model: 'google/gemini-3.8-flash',
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 64,
      extra_body: { google: { thinking_config: { thinking_level: 'LOW' } } },
      messages: [
        { role: 'system', content: 'Name it.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Name this part' },
            { type: 'image_url', image_url: { url: pngDataUrl } },
            { type: 'image_url', image_url: { url: 'https://example.test/part.png' } },
            { type: 'image_url', image_url: { url: pngDataUrl } },
            { type: 'image_url', image_url: { url: pngDataUrl } },
          ],
        },
      ],
    });
  });

  it('should send the argon row LOW, not its HIGH default', () => {
    expect(bodyFor(catalogRow('vertexai', 'gemini-4-argon'))).toMatchObject({
      extra_body: { google: { thinking_config: { thinking_level: 'LOW' } } },
    });
  });

  it('should carry a Vertex row temperature', () => {
    const row = catalogRow('vertexai', 'gemini-3.1-pro');

    expect(bodyFor(row)).toMatchObject({ model: `google/${row.model}`, temperature: 1 });
  });

  it('should send Together Kimi the standard ceiling and thinking off, without a Moonshot reasoning effort', () => {
    const body = bodyFor(catalogRow('together', 'kimi-k3'));

    expect(body).toEqual({
      model: 'moonshotai/Kimi-K3',
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 64,
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: 'Name it.' },
        { role: 'user', content: 'A bracket with two holes' },
      ],
    });
  });

  it('should turn Together GLM thinking off', () => {
    const body = bodyFor(catalogRow('together', 'glm-5.2'));

    expect(body).toMatchObject({ model: 'zai-org/GLM-5.2', max_tokens: 64, reasoning: { enabled: false } });
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('should send a Together row outside the Kimi and GLM families no reasoning switch', () => {
    const row = catalogRow('together', 'llama-4-maverick');
    const body = helperRequestBody(
      { providerId: 'together', modelId: row.model, wire: 'openai-completions' },
      row,
      textPrompt,
    );

    expect(body).not.toHaveProperty('reasoning');
  });

  it('should send Morph the ceiling but not the row reasoning effort it never received', () => {
    const body = bodyFor(catalogRow('morph', 'minimax-m2.7'));

    expect(body).toMatchObject({ model: 'morph-minimax27-230b', max_tokens: 64 });
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('reasoning');
  });

  it('should send Moonshot Kimi its lowest reasoning effort and omit the fixed K3 sampling and ceiling', () => {
    // The row is disabled, so no listed model routes here today; the codec still owns its shape.
    const row = catalogRow('moonshot', 'kimi-k3');
    const body = helperRequestBody(
      { providerId: 'moonshot', modelId: row.model, wire: 'openai-completions' },
      row,
      imagePrompt,
    );

    expect(body).toMatchObject({
      model: 'kimi-k3',
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: 'Name it.' },
        {
          role: 'user',
          content: expect.arrayContaining([{ type: 'image_url', image_url: { url: pngDataUrl } }]) as unknown,
        },
      ],
    });
    for (const name of ['temperature', 'top_p', 'max_tokens', 'max_completion_tokens']) {
      expect(body).not.toHaveProperty(name);
    }
  });

  it('should send a discovered Ollama model its zero temperature and the ceiling', () => {
    expect(bodyFor(ollamaModel)).toMatchObject({ model: 'llama3.2:latest', temperature: 0, max_tokens: 64 });
  });

  it('should fold system messages into the system prompt and drop tool traffic', () => {
    const body = helperRequestBody(
      routeOf(catalogRow('anthropic', 'claude-haiku-5.5')),
      { configuration: { streaming: true } },
      {
        system: 'Name it.',
        messages: [
          { role: 'system', content: 'Prefer short names.' },
          { role: 'user', content: 'A vase' },
          { role: 'assistant', content: [{ type: 'text', text: 'Vase' }] },
          { role: 'tool', content: [] },
        ],
        maximumOutputTokens: 64,
      },
    );

    expect(body['system']).toBe('Name it.\n\nPrefer short names.');
    expect(body['messages']).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'A vase' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Vase' }] },
    ]);
  });
});

const sseStream = (
  frames: readonly unknown[],
  options: { readonly splitAt?: number } = {},
): ReadableStream<Uint8Array<ArrayBuffer>> => {
  const text = frames
    .map((frame) => {
      const data = typeof frame === 'string' ? frame : JSON.stringify(frame);
      const type =
        typeof frame === 'object' && frame !== null && 'type' in frame ? `event: ${String(frame.type)}\n` : '';
      return `${type}data: ${data}\n\n`;
    })
    .join('');
  const bytes = new TextEncoder().encode(text);
  const splitAt = options.splitAt ?? bytes.length;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, splitAt));
      if (splitAt < bytes.length) {
        controller.enqueue(bytes.slice(splitAt));
      }
      controller.close();
    },
  });
};

const collect = async (events: AsyncGenerator<HelperStreamEvent>): Promise<HelperStreamEvent[]> => {
  const collected: HelperStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
};

describe('readHelperStream', () => {
  it('should read Responses text and usage, skipping reasoning summaries and function-call frames (xAI)', async () => {
    const usage = {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens_details: { reasoning_tokens: 2 },
    };
    const events = await collect(
      readHelperStream(
        'openai-responses',
        sseStream(
          [
            { type: 'response.created', response: { id: 'resp_xai_1', usage: null } },
            { type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 0, delta: 'Planning.' },
            {
              type: 'response.output_item.added',
              output_index: 1,
              item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'create_file', arguments: '' },
            },
            { type: 'response.function_call_arguments.delta', output_index: 1, call_id: 'call_1', delta: '{"a"' },
            { type: 'response.output_text.delta', output_index: 2, content_index: 0, delta: 'Twin ' },
            { type: 'response.output_text.delta', output_index: 2, content_index: 0, delta: 'Bracket' },
            { type: 'response.completed', response: { id: 'resp_xai_1', usage } },
          ],
          { splitAt: 37 },
        ),
      ),
    );

    expect(events).toEqual([
      { type: 'text', text: 'Twin ' },
      { type: 'text', text: 'Bracket' },
      { type: 'usage', usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 0, reasoning: 2 } },
    ]);
  });

  it('should report the usage of an incomplete Responses turn', async () => {
    const events = await collect(
      readHelperStream(
        'openai-responses',
        sseStream([
          {
            type: 'response.incomplete',
            response: {
              usage: { input_tokens: 40, output_tokens: 64, output_tokens_details: { reasoning_tokens: 64 } },
            },
          },
        ]),
      ),
    );

    expect(events).toEqual([
      { type: 'usage', usage: { input: 40, output: 64, cacheRead: 0, cacheWrite: 0, reasoning: 64 } },
    ]);
  });

  it('should throw a content-free failure on a Responses failure frame', async () => {
    const failed = collect(
      readHelperStream(
        'openai-responses',
        sseStream([
          { type: 'response.failed', response: { error: { code: 'server_error', message: 'Quoted request text.' } } },
        ]),
      ),
    );

    await expect(failed).rejects.toBeInstanceOf(HelperStreamFailure);
    await expect(failed).rejects.toThrow('Provider stream failed (server_error)');
    await expect(failed).rejects.not.toThrow('Quoted request text.');
  });

  it('should read Anthropic text, skip thinking, and total input with cache reads and writes', async () => {
    const events = await collect(
      readHelperStream(
        'anthropic',
        sseStream([
          {
            type: 'message_start',
            message: {
              usage: {
                input_tokens: 12,
                cache_read_input_tokens: 30,
                cache_creation_input_tokens: 5,
                output_tokens: 1,
              },
            },
          },
          { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Hmm.' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
          { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Vase' } },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } },
          { type: 'message_stop' },
        ]),
      ),
    );

    expect(events).toEqual([
      { type: 'text', text: 'Vase' },
      { type: 'usage', usage: { input: 47, output: 9, cacheRead: 30, cacheWrite: 5, reasoning: 0 } },
    ]);
  });

  it('should throw on an Anthropic error event with its body for account recognition', async () => {
    const error = { type: 'overloaded_error', message: 'Overloaded' };
    const failed = collect(readHelperStream('anthropic', sseStream([{ type: 'error', error }])));

    await expect(failed).rejects.toMatchObject({ code: 'overloaded_error', body: { error } });
  });

  it('should skip Moonshot reasoning_content and tool frames and read its top-level cache count', async () => {
    const chunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
      id: 'chatcmpl_moonshot_stream',
      object: 'chat.completion.chunk',
      model: 'kimi-k3',
      choices: [{ index: 0, finish_reason: null, delta }],
      ...extra,
    });
    const events = await collect(
      readHelperStream(
        'openai-completions',
        sseStream([
          chunk({ role: 'assistant' }),
          chunk({ reasoning_content: 'Plan.' }),
          chunk({
            tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{' } }],
          }),
          chunk({ content: 'Gear' }),
          {
            id: 'chatcmpl_moonshot_stream',
            object: 'chat.completion.chunk',
            choices: [],
            usage: { prompt_tokens: 90, completion_tokens: 10, total_tokens: 100, cached_tokens: 50 },
          },
          '[DONE]',
        ]),
      ),
    );

    expect(events).toEqual([
      { type: 'text', text: 'Gear' },
      { type: 'usage', usage: { input: 90, output: 10, cacheRead: 50, cacheWrite: 0, reasoning: 0 } },
    ]);
  });

  it('should skip Together reasoning and read nested cache and reasoning counts', async () => {
    const events = await collect(
      readHelperStream(
        'openai-completions',
        sseStream([
          { choices: [{ index: 0, delta: { reasoning: 'Use the documented field.' } }] },
          {
            choices: [{ index: 0, delta: { content: 'Ack.' }, finish_reason: 'stop' }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 20,
              total_tokens: 120,
              prompt_tokens_details: { cached_tokens: 60 },
              completion_tokens_details: { reasoning_tokens: 12 },
            },
          },
        ]),
      ),
    );

    expect(events).toEqual([
      { type: 'text', text: 'Ack.' },
      { type: 'usage', usage: { input: 100, output: 20, cacheRead: 60, cacheWrite: 0, reasoning: 12 } },
    ]);
  });

  it('should not report a negative or fractional provider count', async () => {
    const events = await collect(
      readHelperStream(
        'openai-completions',
        sseStream([{ choices: [], usage: { prompt_tokens: 100, completion_tokens: 2.5, cached_tokens: -1 } }]),
      ),
    );

    expect(events).toEqual([
      { type: 'usage', usage: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 } },
    ]);
  });

  it('should throw on a Vertex error array inside a completions stream', async () => {
    const failed = collect(
      readHelperStream(
        'openai-completions',
        sseStream([[{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Resource exhausted.' } }]]),
      ),
    );

    await expect(failed).rejects.toMatchObject({ code: '429' });
  });
});
