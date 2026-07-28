/* eslint-disable @typescript-eslint/naming-convention -- fixtures mirror Kimi/OpenAI wire keys. */
import { describe, expect, it } from 'vitest';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { OpenAIClient } from '@langchain/openai';
import { TauChatKimiCompletions } from '#api/providers/kimi-completions.adapter.js';
import type { KimiModelProvider, TauChatKimiCompletionsInput } from '#api/providers/kimi-completions.adapter.js';

type KimiUsage = OpenAIClient.Completions.CompletionUsage & { cached_tokens?: number };
type KimiCompletion = Omit<OpenAIClient.Chat.Completions.ChatCompletion, 'usage'> & { usage?: KimiUsage };
type KimiChunk = Omit<OpenAIClient.Chat.Completions.ChatCompletionChunk, 'usage'> & {
  usage?: KimiUsage;
};
type KimiRequest = OpenAIClient.Chat.Completions.ChatCompletionCreateParams;

const baseCompletion = {
  id: 'chatcmpl_moonshot_1',
  object: 'chat.completion',
  created: 1,
  model: 'kimi-k3',
  choices: [
    {
      index: 0,
      finish_reason: 'stop',
      logprobs: null,
      message: {
        role: 'assistant',
        reasoning_content: 'Check the exact result.',
        content: 'Ack.',
        refusal: null,
      },
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    cached_tokens: 60,
  },
} satisfies KimiCompletion;

const togetherCompletion = {
  id: 'chatcmpl_together_1',
  object: 'chat.completion',
  created: 1,
  model: 'moonshotai/Kimi-K3',
  choices: [
    {
      index: 0,
      finish_reason: 'stop',
      logprobs: null,
      message: {
        role: 'assistant',
        reasoning: 'Use the documented Together reasoning field.',
        content: 'Ack.',
        refusal: null,
      },
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    prompt_tokens_details: { cached_tokens: 60 },
    completion_tokens_details: { reasoning_tokens: 12 },
  },
} satisfies KimiCompletion;

const streamChunks = [
  {
    id: 'chatcmpl_moonshot_stream',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'kimi-k3',
    choices: [{ index: 0, finish_reason: null, logprobs: null, delta: { role: 'assistant' } }],
  },
  {
    id: 'chatcmpl_moonshot_stream',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'kimi-k3',
    choices: [{ index: 0, finish_reason: null, logprobs: null, delta: { reasoning_content: 'Plan.' } }],
  },
  {
    id: 'chatcmpl_moonshot_stream',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'kimi-k3',
    choices: [
      {
        index: 0,
        finish_reason: null,
        logprobs: null,
        delta: {
          tool_calls: [
            { index: 0, id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"target' } },
          ],
        },
      },
    ],
  },
  {
    id: 'chatcmpl_moonshot_stream',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'kimi-k3',
    choices: [
      {
        index: 0,
        finish_reason: 'tool_calls',
        logprobs: null,
        delta: { tool_calls: [{ index: 0, function: { arguments: 'File":"main.ts"}' } }] },
      },
    ],
  },
  {
    id: 'chatcmpl_moonshot_stream',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'kimi-k3',
    choices: [],
    usage: {
      prompt_tokens: 90,
      completion_tokens: 10,
      total_tokens: 100,
      cached_tokens: 50,
    },
  },
] satisfies KimiChunk[];

class FakeKimi extends TauChatKimiCompletions {
  public readonly requests: KimiRequest[] = [];

  public constructor(
    modelProvider: KimiModelProvider,
    private readonly result: KimiCompletion | KimiChunk[],
    fields: Partial<Omit<TauChatKimiCompletionsInput, 'modelProvider'>> = {},
  ) {
    super({
      apiKey: `test-${modelProvider}-key`,
      model: modelProvider === 'together' ? 'moonshotai/Kimi-K3' : 'kimi-k3',
      streaming: Array.isArray(result),
      outputVersion: 'v1',
      modelProvider,
      ...fields,
    });
  }

  public override async completionWithRetry(
    request: OpenAIClient.Chat.Completions.ChatCompletionCreateParamsStreaming,
  ): Promise<AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>>;
  public override async completionWithRetry(
    request: OpenAIClient.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  ): Promise<OpenAIClient.Chat.Completions.ChatCompletion>;
  public override async completionWithRetry(
    request: OpenAIClient.Chat.Completions.ChatCompletionCreateParams,
  ): Promise<
    OpenAIClient.Chat.Completions.ChatCompletion | AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>
  > {
    this.requests.push(request);
    if (request.stream) {
      const chunks = this.result as KimiChunk[];
      return (async function* stream() {
        yield* chunks as OpenAIClient.Chat.Completions.ChatCompletionChunk[];
      })();
    }
    return this.result as OpenAIClient.Chat.Completions.ChatCompletion;
  }
}

describe('TauChatKimiCompletions', () => {
  it('should replay V1 reasoning and the complete assistant tool turn', async () => {
    const model = new FakeKimi('moonshot', baseCompletion);
    const messages: BaseMessage[] = [
      new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'I should inspect the file.' },
          { type: 'tool_call', id: 'call_1', name: 'read_file', args: { targetFile: 'main.ts' } },
        ],
        tool_calls: [{ id: 'call_1', name: 'read_file', args: { targetFile: 'main.ts' } }],
        response_metadata: { output_version: 'v1', model_provider: 'moonshot' },
      }),
      new ToolMessage({ content: 'file contents', tool_call_id: 'call_1' }),
    ];

    await model.invoke(messages);

    expect(model.requests[0]?.messages).toEqual([
      {
        role: 'assistant',
        content: [],
        reasoning_content: 'I should inspect the file.',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"targetFile":"main.ts"}' } },
        ],
      },
      { role: 'tool', content: 'file contents', tool_call_id: 'call_1' },
    ]);
  });

  it('should replay Together reasoning with the documented field and a complete tool turn', async () => {
    const model = new FakeKimi('together', togetherCompletion);
    const messages: BaseMessage[] = [
      new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'Inspect the current file.' },
          { type: 'tool_call', id: 'call_1', name: 'read_file', args: { targetFile: 'main.ts' } },
        ],
        tool_calls: [{ id: 'call_1', name: 'read_file', args: { targetFile: 'main.ts' } }],
        response_metadata: { output_version: 'v1', model_provider: 'together' },
      }),
      new ToolMessage({ content: 'file contents', tool_call_id: 'call_1' }),
    ];

    await model.invoke(messages);

    expect(model.requests[0]?.messages).toEqual([
      {
        role: 'assistant',
        content: [],
        reasoning: 'Inspect the current file.',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"targetFile":"main.ts"}' } },
        ],
      },
      { role: 'tool', content: 'file contents', tool_call_id: 'call_1' },
    ]);
  });

  it('should replay legacy reasoning without inventing it for foreign messages', async () => {
    const model = new FakeKimi('moonshot', baseCompletion);
    await model.invoke([
      new AIMessage({ content: 'legacy', additional_kwargs: { reasoning_content: 'legacy thought' } }),
      new AIMessage({ content: 'foreign', response_metadata: { model_provider: 'anthropic' } }),
    ]);

    expect(model.requests[0]?.messages).toEqual([
      { role: 'assistant', content: 'legacy', reasoning_content: 'legacy thought' },
      { role: 'assistant', content: 'foreign' },
    ]);
  });

  it('should preserve base64 image input and omit fixed K3 parameters', async () => {
    const model = new FakeKimi('moonshot', baseCompletion);
    await model.invoke(
      [
        new HumanMessage({
          content: [
            { type: 'text', text: 'Describe this.' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        }),
      ],
      {
        reasoning: { effort: 'high' },
      },
    );

    expect(model.requests[0]).toMatchObject({
      model: 'kimi-k3',
      reasoning_effort: 'high',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this.' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      ],
    });
    expect(model.requests[0]).not.toHaveProperty('temperature');
    expect(model.requests[0]).not.toHaveProperty('top_p');
    expect(model.requests[0]).not.toHaveProperty('n');
    expect(model.requests[0]).not.toHaveProperty('frequency_penalty');
    expect(model.requests[0]).not.toHaveProperty('presence_penalty');
    expect(model.requests[0]).not.toHaveProperty('max_tokens');
    expect(model.requests[0]).not.toHaveProperty('max_completion_tokens');
  });

  it('should preserve standard Together parameters without sending Moonshot reasoning effort', async () => {
    const model = new FakeKimi('together', togetherCompletion, {
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 512,
    });

    await model.invoke([new HumanMessage('Reply Ack.')], { reasoning: { effort: 'high' } });

    expect(model.requests[0]).toMatchObject({
      model: 'moonshotai/Kimi-K3',
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 512,
    });
    expect(model.requests[0]).not.toHaveProperty('reasoning_effort');
  });

  it('should emit Moonshot V1 reasoning, text, and cache usage for non-streaming responses', async () => {
    const message = await new FakeKimi('moonshot', baseCompletion).invoke([new HumanMessage('Reply Ack.')]);

    expect(message.content).toEqual([
      { type: 'reasoning', reasoning: 'Check the exact result.' },
      { type: 'text', text: 'Ack.' },
    ]);
    expect(message.response_metadata).toMatchObject({
      model_provider: 'moonshot',
      model_name: 'kimi-k3',
      output_version: 'v1',
      usage: { cached_tokens: 60 },
    });
    expect(message.usage_metadata).toEqual({
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_token_details: { cache_read: 60 },
    });
  });

  it('should emit a V1 tool block with its matching parsed tool call', async () => {
    const toolCompletion = {
      ...baseCompletion,
      choices: [
        {
          index: 0,
          finish_reason: 'tool_calls',
          logprobs: null,
          message: {
            role: 'assistant',
            reasoning_content: 'Inspect the requested file.',
            content: null,
            refusal: null,
            tool_calls: [
              {
                id: 'call_read_1',
                type: 'function',
                function: { name: 'read_file', arguments: '{"targetFile":"main.ts"}' },
              },
            ],
          },
        },
      ],
    } satisfies KimiCompletion;

    const message = await new FakeKimi('moonshot', toolCompletion).invoke([new HumanMessage('Read main.ts')]);

    expect(message.content).toEqual([
      { type: 'reasoning', reasoning: 'Inspect the requested file.' },
      { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' } },
    ]);
    expect(message.tool_calls).toEqual([
      { type: 'tool_call', id: 'call_read_1', name: 'read_file', args: { targetFile: 'main.ts' } },
    ]);
  });

  it('should materialize documented Together reasoning and nested usage as V1 content', async () => {
    const message = await new FakeKimi('together', togetherCompletion).invoke([new HumanMessage('Reply Ack.')]);

    expect(message.content).toEqual([
      { type: 'reasoning', reasoning: 'Use the documented Together reasoning field.' },
      { type: 'text', text: 'Ack.' },
    ]);
    expect(message.response_metadata).toMatchObject({
      model_provider: 'together',
      model_name: 'moonshotai/Kimi-K3',
      output_version: 'v1',
    });
    expect(message.usage_metadata).toEqual({
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_token_details: { cache_read: 60 },
      output_token_details: { reasoning: 12 },
    });
  });

  it('should stream reasoning, incremental tool arguments, and final cache usage', async () => {
    const chunks = [];
    for await (const chunk of await new FakeKimi('moonshot', streamChunks).stream([new HumanMessage('Read main.ts')])) {
      chunks.push(chunk);
    }

    expect(chunks.flatMap((chunk) => (Array.isArray(chunk.content) ? chunk.content : []))).toContainEqual({
      type: 'reasoning',
      reasoning: 'Plan.',
      index: 0,
    });
    expect(
      chunks
        .flatMap((chunk) => chunk.tool_call_chunks ?? [])
        .map((chunk) => chunk.args)
        .join(''),
    ).toBe('{"targetFile":"main.ts"}');
    expect(chunks.find((chunk) => chunk.usage_metadata)?.usage_metadata).toMatchObject({
      input_tokens: 90,
      output_tokens: 10,
      input_token_details: { cache_read: 50 },
    });
    expect(chunks.every((chunk) => chunk.response_metadata.model_provider === 'moonshot')).toBe(true);
  });

  it('should emit native Moonshot reasoning and normalized usage events', async () => {
    const events = [];
    const model = new FakeKimi('moonshot', streamChunks);
    for await (const event of model._streamChatModelEvents([new HumanMessage('Read main.ts')], {})) {
      events.push(event);
    }

    expect(events).toContainEqual({
      event: 'content-block-delta',
      index: 0,
      delta: { type: 'reasoning-delta', reasoning: 'Plan.' },
    });
    expect(events).toContainEqual({
      event: 'usage',
      usage: {
        input_tokens: 90,
        output_tokens: 10,
        total_tokens: 100,
        input_token_details: { cache_read: 50 },
      },
    });
    expect(events).toContainEqual({
      event: 'provider',
      provider: 'moonshot',
      name: 'stream_metadata',
      payload: { model: 'kimi-k3', service_tier: undefined },
    });
  });

  it('should label observed Together reasoning-content streams as Together', async () => {
    const chunks = [];
    for await (const chunk of await new FakeKimi('together', streamChunks).stream([new HumanMessage('Read main.ts')])) {
      chunks.push(chunk);
    }

    expect(chunks.flatMap((chunk) => (Array.isArray(chunk.content) ? chunk.content : []))).toContainEqual({
      type: 'reasoning',
      reasoning: 'Plan.',
      index: 0,
    });
    expect(chunks.every((chunk) => chunk.response_metadata.model_provider === 'together')).toBe(true);
  });

  it('should reject negative provider usage', async () => {
    const invalid = {
      ...baseCompletion,
      usage: { ...baseCompletion.usage, cached_tokens: -1 },
    } satisfies KimiCompletion;

    const invocation = new FakeKimi('moonshot', invalid).invoke([new HumanMessage('hello')]);

    await expect(invocation).rejects.toThrow(
      new TypeError('Kimi usage cached_tokens must be a non-negative safe integer'),
    );
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end Kimi/OpenAI fixtures. */
