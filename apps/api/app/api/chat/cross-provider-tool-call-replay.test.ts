import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { convertMessagesToResponsesInput } from '@langchain/openai';
import { describe, it, expect, vi } from 'vitest';
import { createCrossProviderContentNormalizerMiddleware } from '#api/chat/middleware/cross-provider-content-normalizer.middleware.js';
import { messageContentSanitizerMiddleware } from '#api/chat/middleware/message-content-sanitizer.middleware.js';
import { invokeWrapModelCall } from '#testing/middleware-testing.utils.js';

/**
 * Runs the real upstream OpenAI Responses converter over normalized messages so
 * assertions target the actual wire payload shape (not regex over content). The
 * converter rejects `input_text` for the assistant role and only honors native
 * items via the `non_standard` passthrough gated on `model_provider === 'openai'`.
 */
const toResponsesInput = (messages: BaseMessage[]): Array<Record<string, unknown>> =>
  convertMessagesToResponsesInput({
    messages,
    zdrEnabled: false,
    model: 'gpt-4.1',
  }) as Array<Record<string, unknown>>;

/**
 * The Responses API rejects an `id` (or `call_id`) of `''`: it must be omitted
 * entirely or be a non-empty value matching [A-Za-z0-9_-].
 */
const isValidOrAbsentId = (value: unknown): boolean =>
  value === undefined || (typeof value === 'string' && /^[\w-]+$/.test(value));

const assertNoEmptyIds = (items: Array<Record<string, unknown>>): void => {
  for (const [index, item] of items.entries()) {
    expect(
      isValidOrAbsentId(item.id),
      `input[${index}].id must be valid or absent, got ${JSON.stringify(item.id)}`,
    ).toBe(true);
    expect(
      isValidOrAbsentId(item.call_id),
      `input[${index}].call_id must be valid or absent, got ${JSON.stringify(item.call_id)}`,
    ).toBe(true);
  }
};

/**
 * Block types accepted by @langchain/google-common's messageContentComplexToPart
 * (dist/utils/gemini.js). Any other type throws CrossProviderContentError before
 * the Vertex API is contacted.
 */
const googlePortableBlockTypes = new Set([
  'text',
  'image_url',
  'media',
  'reasoning',
  'thinking',
  'input_audio',
  'image',
  'video',
  'audio',
  'file',
  'text-plain',
  'non_standard',
]);

const toolCallContentBlockTypes = new Set([
  'tool_use',
  'tool_call',
  'tool_call_chunk',
  'input_json_delta',
  'server_tool_use',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertGooglePortableMessages(messages: BaseMessage[]): void {
  for (const message of messages) {
    if (!AIMessage.isInstance(message)) {
      continue;
    }

    const { content } = message;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const block of content) {
      if (!isRecord(block)) {
        continue;
      }

      const blockType = block.type;
      if (typeof blockType === 'string') {
        expect(googlePortableBlockTypes.has(blockType), `block type "${blockType}" must be portable to Google`).toBe(
          true,
        );
        expect(toolCallContentBlockTypes.has(blockType)).toBe(false);
      }
    }
  }
}

const runModelCallPipeline = async (
  targetProvider: 'vertexai' | 'anthropic' | 'openai',
  messages: BaseMessage[],
): Promise<BaseMessage[]> => {
  const handler = vi.fn().mockResolvedValue({ content: 'ok' });
  const normalizer = createCrossProviderContentNormalizerMiddleware(targetProvider);

  await invokeWrapModelCall(normalizer, { messages }, handler);
  const afterNormalizer = (handler.mock.calls[0] as [{ messages: BaseMessage[] }])[0].messages;

  handler.mockClear();
  await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages: afterNormalizer }, handler);
  return (handler.mock.calls[0] as [{ messages: BaseMessage[] }])[0].messages;
};

/**
 * Hermetic replay of turn 2 after switching from Anthropic (opus) to Vertex (gemini):
 * assistant history carries native tool_use content blocks that Google rejects unless
 * the cross-provider normalizer strips them (tool_calls field remains authoritative).
 */
describe('cross-provider tool-call replay (hermetic)', () => {
  const toolCallId = 'toolu_01R5Z5CnNyiC2oma7Gg8s12K';
  const toolArgs = { targetFile: 'main.ts' };

  const buildOpusToolTurnHistory = (): BaseMessage[] => [
    new HumanMessage('Make a manufacturable assembly'),
    new AIMessage({
      content: [
        { type: 'text', text: 'Let me inspect the workspace.' },
        {
          type: 'tool_use',
          id: toolCallId,
          name: 'list_directory',
          input: toolArgs,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      tool_calls: [{ id: toolCallId, name: 'list_directory', args: toolArgs, type: 'tool_call' }],
    }),
    new ToolMessage({
      content: 'Path: /\n  [dir] .tau\n   main.ts',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      tool_call_id: toolCallId,
      name: 'list_directory',
    }),
    new HumanMessage('continue'),
  ];

  it('normalizes Anthropic tool_use history for vertexai replay (opus -> gemini)', async () => {
    const normalized = await runModelCallPipeline('vertexai', buildOpusToolTurnHistory());

    const assistant = normalized.find(
      (message): message is AIMessage => AIMessage.isInstance(message) && (message.tool_calls?.length ?? 0) > 0,
    );
    if (!assistant) {
      throw new Error('expected assistant message with tool_calls');
    }

    expect(assistant.tool_calls).toEqual([
      { id: toolCallId, name: 'list_directory', args: toolArgs, type: 'tool_call' },
    ]);
    expect(assistant.content).toEqual([{ type: 'text', text: 'Let me inspect the workspace.' }]);
    assertGooglePortableMessages(normalized);
  });

  it('heals streamed empty tool_call args for anthropic self-replay', async () => {
    const messages: BaseMessage[] = [
      new HumanMessage('a cube'),
      new AIMessage({
        content: [
          { type: 'text', text: 'Creating tests.' },
          { type: 'tool_call', id: toolCallId, name: 'edit_tests', args: '' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: toolCallId, name: 'edit_tests', args: toolArgs, type: 'tool_call' }],
      }),
      new ToolMessage({
        content: '{}',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: toolCallId,
        name: 'edit_tests',
      }),
      new HumanMessage('continue'),
    ];

    const normalized = await runModelCallPipeline('anthropic', messages);
    const assistant = normalized[1] as AIMessage;
    const toolBlock = (assistant.content as Array<{ type: string; args: unknown }>).find(
      (block) => block.type === 'tool_call',
    );
    expect(toolBlock?.args).toEqual(toolArgs);
  });

  it('emits assistant output_text (not input_text) for openai replay and keeps output_version', async () => {
    const messages: BaseMessage[] = [
      new HumanMessage('a cube'),
      new AIMessage({
        content: [
          { type: 'text', text: 'Building the model.' },
          { type: 'tool_call', id: toolCallId, name: 'create_file', args: toolArgs },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'openai' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: toolCallId, name: 'create_file', args: toolArgs, type: 'tool_call' }],
      }),
      new ToolMessage({
        content: 'ok',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: toolCallId,
        name: 'create_file',
      }),
      new HumanMessage('continue'),
    ];

    const normalized = await runModelCallPipeline('openai', messages);

    // The middleware preserves output_version v1 (no band-aid clearing of the flag).
    const assistant = normalized[1] as AIMessage;
    expect(assistant.response_metadata.output_version).toBe('v1');

    // Assert the real Responses-API payload: assistant text must be output_text.
    const items = toResponsesInput(normalized);
    const assistantMessages = items.filter((item) => item.type === 'message' && item.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);

    const assistantContentTypes = assistantMessages.flatMap((item) =>
      (item.content as Array<{ type: string }>).map((part) => part.type),
    );
    expect(assistantContentTypes).toContain('output_text');
    expect(assistantContentTypes).not.toContain('input_text');

    const assistantText = assistantMessages.flatMap((item) =>
      (item.content as Array<{ type: string; text?: string }>)
        .filter((part) => part.type === 'output_text')
        .map((part) => part.text),
    );
    expect(assistantText).toContain('Building the model.');

    // The tool call still round-trips as a function_call with the correct arguments.
    const functionCall = items.find((item) => item.type === 'function_call');
    expect(functionCall).toMatchObject({
      name: 'create_file',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI Responses API uses snake_case
      call_id: toolCallId,
      arguments: JSON.stringify(toolArgs),
    });
  });

  it('recovers assistant output_text and healed tool args for cross-provider openai replay (opus -> gpt)', async () => {
    const messages: BaseMessage[] = [
      new HumanMessage('a cube'),
      new AIMessage({
        content: [
          { type: 'text', text: 'Inspecting first.' },
          // Streamed Anthropic tool_use left empty args behind; tool_calls is authoritative.
          { type: 'tool_call', id: toolCallId, name: 'list_directory', args: '' },
        ],
        // Persisted message originated from Anthropic.
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'anthropic' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: toolCallId, name: 'list_directory', args: toolArgs, type: 'tool_call' }],
      }),
      new ToolMessage({
        content: 'ok',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: toolCallId,
        name: 'list_directory',
      }),
      new HumanMessage('continue'),
    ];

    const normalized = await runModelCallPipeline('openai', messages);
    const items = toResponsesInput(normalized);

    const assistantContentTypes = items
      .filter((item) => item.type === 'message' && item.role === 'assistant')
      .flatMap((item) => (item.content as Array<{ type: string }>).map((part) => part.type));
    expect(assistantContentTypes).toContain('output_text');
    expect(assistantContentTypes).not.toContain('input_text');

    // The empty streamed args must be healed from tool_calls, not emitted as ''.
    const functionCall = items.find((item) => item.type === 'function_call');
    expect(functionCall?.arguments).toBe(JSON.stringify(toolArgs));
  });

  it('never emits an empty id for a reasoning + text + tool_calls turn replayed to openai (index-2 repro)', async () => {
    // GPT-5.5 turn 1: the OpenAI converter persists a reasoning item as a V1
    // `{ type: 'reasoning', reasoning }` block that DROPS the real `rs_` id. On
    // replay, convertReasoningBlock emits `id: block.id ?? ''` => `''`, which the
    // Responses API rejects (`400 Invalid 'input[2].id': ''`).
    const callIds = ['call_ls', 'call_read_a', 'call_read_b'];
    const messages: BaseMessage[] = [
      new HumanMessage('a cube with holecutout'),
      new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'Plan: inspect the workspace, then read the entry files.' },
          { type: 'text', text: 'Let me inspect the workspace first.' },
          { type: 'tool_call', id: callIds[0], name: 'list_directory', args: { path: '/' } },
          { type: 'tool_call', id: callIds[1], name: 'read_file', args: { targetFile: 'main.ts' } },
          { type: 'tool_call', id: callIds[2], name: 'read_file', args: { targetFile: 'part.ts' } },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        response_metadata: { output_version: 'v1', model_provider: 'openai' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [
          { id: callIds[0], name: 'list_directory', args: { path: '/' }, type: 'tool_call' },
          { id: callIds[1], name: 'read_file', args: { targetFile: 'main.ts' }, type: 'tool_call' },
          { id: callIds[2], name: 'read_file', args: { targetFile: 'part.ts' }, type: 'tool_call' },
        ],
      }),
      ...callIds.map(
        (id) =>
          new ToolMessage({
            content: 'ok',
            // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
            tool_call_id: id,
            name: 'tool',
          }),
      ),
      new HumanMessage('continue'),
    ];

    const normalized = await runModelCallPipeline('openai', messages);
    const items = toResponsesInput(normalized);

    // Every emitted item must have a valid id/call_id or none at all.
    assertNoEmptyIds(items);

    // No reasoning item may carry an empty id (the V1 reasoning block lost its rs_ id).
    const emptyIdReasoning = items.find((item) => item.type === 'reasoning' && item.id === '');
    expect(emptyIdReasoning).toBeUndefined();

    // The assistant text + all three tool calls still round-trip.
    const assistantText = items
      .filter((item) => item.type === 'message' && item.role === 'assistant')
      .flatMap((item) =>
        (item.content as Array<{ type: string; text?: string }>)
          .filter((part) => part.type === 'output_text')
          .map((part) => part.text),
      );
    expect(assistantText).toContain('Let me inspect the workspace first.');
    expect(items.filter((item) => item.type === 'function_call')).toHaveLength(3);

    // The load-bearing output_version flag is preserved (no band-aid clearing).
    expect((normalized[1] as AIMessage).response_metadata.output_version).toBe('v1');
  });
});
