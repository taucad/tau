/* eslint-disable @typescript-eslint/naming-convention -- xAI/OpenAI Responses fixtures use provider wire names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type {
  XAIResponse,
  XAIResponsesCreateParams,
  XAIResponsesCreateParamsNonStreaming,
  XAIResponsesCreateParamsStreaming,
  XAIResponsesStreamEvent,
} from '@langchain/xai';
import { TauChatXaiResponses } from '#api/providers/xai-responses.adapter.js';

const baseResponse = {
  id: 'resp_xai_1',
  object: 'response',
  created_at: 0,
  status: 'completed',
  model: 'grok-4.5',
  output: [],
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    total_tokens: 15,
    input_tokens_details: { cached_tokens: 3 },
    output_tokens_details: { reasoning_tokens: 2 },
  },
} as unknown as XAIResponse;

class FakeTauChatXaiResponses extends TauChatXaiResponses {
  public readonly requests: XAIResponsesCreateParams[] = [];

  public constructor(private readonly result: XAIResponse | XAIResponsesStreamEvent[]) {
    super({ apiKey: 'xai-test-key', model: 'grok-4.5', streaming: Array.isArray(result) });
  }

  protected override async _makeRequest(request: XAIResponsesCreateParamsNonStreaming): Promise<XAIResponse>;
  protected override async _makeRequest(
    request: XAIResponsesCreateParamsStreaming,
  ): Promise<AsyncIterable<XAIResponsesStreamEvent>>;
  protected override async _makeRequest(
    request: XAIResponsesCreateParams,
  ): Promise<XAIResponse | AsyncIterable<XAIResponsesStreamEvent>> {
    this.requests.push(request);
    if (request.stream) {
      const events = this.result as XAIResponsesStreamEvent[];
      return (async function* streamEvents() {
        yield* events;
      })();
    }

    return this.result as XAIResponse;
  }
}

const streamEvents = [
  {
    type: 'response.created',
    response: baseResponse,
  },
  {
    type: 'response.reasoning_summary_text.delta',
    output_index: 0,
    summary_index: 0,
    delta: 'Planning the file edit.',
  },
  {
    type: 'response.output_item.added',
    output_index: 1,
    item: {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'create_file',
      arguments: '',
    },
  },
  {
    type: 'response.function_call_arguments.delta',
    output_index: 1,
    call_id: 'call_1',
    delta: '{"targetFile"',
  },
  {
    type: 'response.function_call_arguments.delta',
    output_index: 1,
    call_id: 'call_1',
    delta: ':"main.ts"}',
  },
  {
    type: 'response.completed',
    response: {
      ...baseResponse,
      output: [
        {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'create_file',
          arguments: '{"targetFile":"main.ts"}',
        },
      ],
    },
  },
] as unknown as XAIResponsesStreamEvent[];

describe('TauChatXaiResponses', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should stream reasoning and incremental tool-call chunks through LangChain shapes', async () => {
    const model = new FakeTauChatXaiResponses(streamEvents);
    const chunks = [];

    for await (const chunk of await model.stream([new HumanMessage('create main.ts')])) {
      chunks.push(chunk);
    }

    const reasoning = chunks.flatMap((chunk) =>
      Array.isArray(chunk.content) ? chunk.content.filter((block) => block.type === 'reasoning') : [],
    );
    expect(reasoning).toEqual([{ type: 'reasoning', reasoning: 'Planning the file edit.', index: 0 }]);

    const toolChunks = chunks.flatMap((chunk) => chunk.tool_call_chunks ?? []);
    expect(toolChunks[0]).toMatchObject({ id: 'call_1', name: 'create_file', type: 'tool_call_chunk' });
    expect(toolChunks.map((chunk) => chunk.args ?? '').join('')).toBe('{"targetFile":"main.ts"}');

    const usage = chunks.find((chunk) => chunk.usage_metadata)?.usage_metadata;
    expect(usage?.input_token_details?.cache_read).toBe(3);
    expect(usage?.output_token_details?.reasoning).toBe(2);
    expect(chunks.every((chunk) => chunk.response_metadata.model_provider === 'xai')).toBe(true);
  });

  it('should bind LangChain tools as xAI Responses function tools', async () => {
    const fake = new FakeTauChatXaiResponses(baseResponse);
    const readFile = tool(async ({ targetFile }: { targetFile: string }) => `read:${targetFile}`, {
      name: 'read_file',
      description: 'Read a project file.',
      schema: z.object({
        targetFile: z.string(),
      }),
    });
    const model = fake.bindTools([readFile]);

    await model.invoke([new HumanMessage('read main.ts')]);

    const formattedTool = fake.requests[0]?.tools?.[0] as Record<string, unknown> | undefined;
    expect(formattedTool).toMatchObject({
      type: 'function',
      name: 'read_file',
      description: 'Read a project file.',
      parameters: {
        type: 'object',
        properties: {
          targetFile: { type: 'string' },
        },
        required: ['targetFile'],
      },
    });
    expect(formattedTool?.['function']).toBeUndefined();
  });

  it('should convert tool replay messages into function_call_output input', async () => {
    const model = new FakeTauChatXaiResponses(baseResponse);
    const messages: BaseMessage[] = [
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call_1', name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' }],
      }),
      new ToolMessage({
        content: 'file contents',
        tool_call_id: 'call_1',
      }),
    ];

    await model.invoke(messages);

    expect(model.requests[0]?.input).toEqual([
      {
        type: 'function_call',
        name: 'read_file',
        arguments: '{"targetFile":"main.ts"}',
        call_id: 'call_1',
        id: undefined,
      },
      {
        type: 'function_call_output',
        call_id: 'call_1',
        id: undefined,
        output: 'file contents',
      },
    ]);
  });

  it('should send x-grok-conv-id without leaking unsafe header characters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => baseResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    const model = new TauChatXaiResponses({
      apiKey: 'xai-test-key',
      model: 'grok-4.5',
      conversationId: 'chat_1\r\nbad',
    });

    await model.invoke([new HumanMessage('hi')]);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['x-grok-conv-id']).toBe('chat_1bad');
  });
});
