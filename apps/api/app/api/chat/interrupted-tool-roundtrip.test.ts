import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { describe, it, expect, vi } from 'vitest';
import { uiMessagesSchema } from '@taucad/chat';
import type { MyUIMessage } from '@taucad/chat';
import { createCrossProviderContentNormalizerMiddleware } from '#api/chat/middleware/cross-provider-content-normalizer.middleware.js';
import { messageContentSanitizerMiddleware } from '#api/chat/middleware/message-content-sanitizer.middleware.js';
import { invokeWrapModelCall } from '#testing/middleware-testing.utils.js';
import { toBaseMessagesWithIds } from '#api/chat/utils/to-base-messages-with-ids.js';

/**
 * End-to-end regression for an interrupted-tool conversation: walks the
 * server pipeline (DTO Zod parse + healing -> @ai-sdk/langchain conversion ->
 * messageContentSanitizerMiddleware) without booting Nest. Mirrors the
 * legacy interrupted-tool-call payload shape (partial tool input + error text).
 */
describe('interrupted-tool-call round-trip', () => {
  const fillerPart = (index: number): MyUIMessage['parts'][number] =>
    ({
      type: 'reasoning',
      text: `reasoning filler ${index}`,
      state: 'done',
    }) as MyUIMessage['parts'][number];

  const buildLegacyAppendixPayload = (): MyUIMessage[] => [
    {
      id: 'u_initial',
      role: 'user',
      parts: [{ type: 'text', text: 'Open main.ts and continue.' }],
    },
    {
      id: 'a_interrupted',
      role: 'assistant',
      parts: [
        // Legacy persisted shape captured in the appendix:
        // - input present but missing required `targetFile`
        // - errorText sans `toolName`
        // - rawInput absent
        {
          type: 'tool-read_file',
          toolCallId: 'call_legacy_read',
          state: 'output-error',
          input: { limit: 15 },
          errorText: JSON.stringify({
            errorCode: 'USER_INTERRUPTED',
            message: 'Interrupted by user.',
            toolCallId: 'call_legacy_read',
          }),
        } as unknown as MyUIMessage['parts'][number],
      ],
    },
    {
      id: 'u_followup',
      role: 'user',
      parts: [{ type: 'text', text: 'continue' }],
    },
  ];

  const buildStaleHistoricalPayload = ({
    stalePartIndex,
    stalePart,
  }: {
    readonly stalePartIndex: number;
    readonly stalePart: unknown;
  }): MyUIMessage[] => [
    {
      id: 'u_initial',
      role: 'user',
      parts: [{ type: 'text', text: 'Start the planetary gear design.' }],
    },
    {
      id: 'a_interrupted',
      role: 'assistant',
      parts: [
        ...Array.from({ length: stalePartIndex }, (_, index) => fillerPart(index)),
        stalePart as MyUIMessage['parts'][number],
      ],
    },
    {
      id: 'u_followup',
      role: 'user',
      parts: [{ type: 'text', text: 'continue' }],
    },
  ];

  const getToolPartAt = (messages: readonly MyUIMessage[], index: number): MyUIMessage['parts'][number] => {
    const assistantMessage = messages[1];
    if (!assistantMessage) {
      throw new Error('expected assistant message in parsed result');
    }
    const part = assistantMessage.parts[index];
    if (!part) {
      throw new Error(`expected tool part at index ${index}`);
    }
    return part;
  };

  const hasToolCallContentBlock = (content: AIMessage['content']): boolean =>
    Array.isArray(content) &&
    content.some((block) => {
      if (typeof block !== 'object' || block === null || Array.isArray(block)) {
        return false;
      }
      const blockType = (block as { type?: unknown }).type;
      return (
        blockType === 'tool_use' ||
        blockType === 'tool_call' ||
        blockType === 'tool_call_chunk' ||
        blockType === 'input_json_delta' ||
        blockType === 'server_tool_use'
      );
    });

  const runThroughVertexReplay = async (
    messages: readonly MyUIMessage[],
  ): Promise<{ readonly aiMessage: AIMessage; readonly toolMessages: ToolMessage[] }> => {
    const baseMessages = await toBaseMessagesWithIds(messages);
    const vertexHandler = vi.fn().mockImplementation((request: { messages: BaseMessage[] }) => request);

    await invokeWrapModelCall(
      createCrossProviderContentNormalizerMiddleware('vertexai'),
      { messages: baseMessages },
      vertexHandler,
    );

    const [vertexRequest] = vertexHandler.mock.calls[0] as [{ messages: BaseMessage[] }];
    const sanitizerHandler = vi.fn().mockResolvedValue({ content: 'response' });

    await invokeWrapModelCall(
      messageContentSanitizerMiddleware,
      { messages: vertexRequest.messages },
      sanitizerHandler,
    );

    const [sanitizedRequest] = sanitizerHandler.mock.calls[0] as [{ messages: BaseMessage[] }];
    const aiMessage = sanitizedRequest.messages.find(
      (message): message is AIMessage => AIMessage.isInstance(message) && (message.tool_calls?.length ?? 0) > 0,
    );
    if (!aiMessage) {
      throw new Error('expected an AIMessage with tool_calls in the sanitized replay');
    }

    return {
      aiMessage,
      toolMessages: sanitizedRequest.messages.filter((message): message is ToolMessage =>
        ToolMessage.isInstance(message),
      ),
    };
  };

  it('should accept the legacy appendix payload via uiMessagesSchema and demote partial input to rawInput', () => {
    const result = uiMessagesSchema.safeParse(buildLegacyAppendixPayload());

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(`Schema rejected legacy payload: ${result.error.message}`);
    }

    const assistantMessage = result.data[1];
    if (!assistantMessage) {
      throw new Error('expected assistant message in parsed result');
    }
    const toolPart = assistantMessage.parts[0];
    if (toolPart?.type !== 'tool-read_file' || toolPart.state !== 'output-error') {
      throw new Error('expected tool-read_file output-error part');
    }

    expect(toolPart.input).toBeUndefined();
    expect((toolPart as { rawInput?: unknown }).rawInput).toEqual({ limit: 15 });
  });

  it.each([
    {
      label: 'June 11 edit_file part 47',
      stalePartIndex: 47,
      stalePart: {
        type: 'tool-edit_file',
        toolCallId: 'call_june11_edit',
        state: 'input-available',
        input: {},
      },
      expected: {
        type: 'tool-edit_file',
        toolName: 'edit_file',
        toolCallId: 'call_june11_edit',
        args: {},
      },
    },
    {
      label: 'June 18 read_file part 20',
      stalePartIndex: 20,
      stalePart: {
        type: 'tool-read_file',
        toolCallId: 'call_ad6083d2',
        state: 'input-available',
        input: { limit: 40 },
      },
      expected: {
        type: 'tool-read_file',
        toolName: 'read_file',
        toolCallId: 'call_ad6083d2',
        args: { limit: 40 },
      },
    },
  ])(
    'should normalize stale historical $label before follow-up validation',
    async ({ stalePartIndex, stalePart, expected }) => {
      const parsed = uiMessagesSchema.safeParse(buildStaleHistoricalPayload({ stalePartIndex, stalePart }));

      expect(parsed.success).toBe(true);
      if (!parsed.success) {
        throw new Error(`Schema rejected stale historical payload: ${parsed.error.message}`);
      }

      const part = getToolPartAt(parsed.data, stalePartIndex);
      expect(part).toMatchObject({
        type: expected.type,
        toolCallId: expected.toolCallId,
        state: 'output-error',
        input: undefined,
        rawInput: expected.args,
      });
      if (!('errorText' in part) || typeof part.errorText !== 'string') {
        throw new Error('expected normalized stale part to carry errorText');
      }
      expect(JSON.parse(part.errorText) as Record<string, unknown>).toMatchObject({
        errorCode: 'USER_INTERRUPTED',
        toolName: expected.toolName,
        toolCallId: expected.toolCallId,
      });

      const { aiMessage, toolMessages } = await runThroughVertexReplay(parsed.data);
      expect(aiMessage.tool_calls?.[0]).toMatchObject({
        id: expected.toolCallId,
        name: expected.toolName,
        args: expected.args,
      });
      expect(hasToolCallContentBlock(aiMessage.content)).toBe(false);

      const pairedToolMessages = toolMessages.filter((message) => message.tool_call_id === expected.toolCallId);
      expect(pairedToolMessages).toHaveLength(1);
      const [tool] = pairedToolMessages;
      if (!tool) {
        throw new Error('expected paired interrupted ToolMessage');
      }
      expect(JSON.parse(tool.content as string) as Record<string, unknown>).toMatchObject({
        errorCode: 'USER_INTERRUPTED',
        toolName: expected.toolName,
        toolCallId: expected.toolCallId,
      });
    },
  );

  it('should normalize stale historical dynamic tools without consulting the static registry', async () => {
    const parsed = uiMessagesSchema.parse(
      buildStaleHistoricalPayload({
        stalePartIndex: 3,
        stalePart: {
          type: 'dynamic-tool',
          toolName: 'provider_native_search',
          toolCallId: 'call_dynamic',
          state: 'input-streaming',
          input: ['partial', { nested: true }],
        },
      }),
    );

    const part = getToolPartAt(parsed, 3);
    expect(part).toMatchObject({
      type: 'dynamic-tool',
      toolName: 'provider_native_search',
      toolCallId: 'call_dynamic',
      state: 'output-error',
      input: ['partial', { nested: true }],
    });
    if (!('errorText' in part) || typeof part.errorText !== 'string') {
      throw new Error('expected normalized dynamic tool part to carry errorText');
    }
    expect(JSON.parse(part.errorText) as Record<string, unknown>).toMatchObject({
      errorCode: 'USER_INTERRUPTED',
      toolName: 'provider_native_search',
      toolCallId: 'call_dynamic',
    });
  });

  it('should carry the demoted rawInput through to the AIMessage tool_call.args', async () => {
    const parsed = uiMessagesSchema.parse(buildLegacyAppendixPayload());
    const baseMessages = await toBaseMessagesWithIds(parsed);

    const aiMessage = baseMessages.find(
      (message): message is AIMessage => AIMessage.isInstance(message) && (message.tool_calls?.length ?? 0) > 0,
    );
    if (!aiMessage) {
      throw new Error('expected an AIMessage with tool_calls in the converted base messages');
    }
    expect(aiMessage.tool_calls).toBeDefined();
    const toolCall = aiMessage.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('expected at least one tool_call');
    }
    expect(toolCall.id).toBe('call_legacy_read');
    expect(toolCall.name).toBe('read_file');
    expect(toolCall.args).toEqual({ limit: 15 });
  });

  it('should produce a tool_call paired with a tool_result so no orphan synthesis is needed', async () => {
    const parsed = uiMessagesSchema.parse(buildLegacyAppendixPayload());
    const baseMessages = await toBaseMessagesWithIds(parsed);
    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages: baseMessages }, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

    const aiMessage = request.messages.find(
      (message): message is AIMessage => AIMessage.isInstance(message) && (message.tool_calls?.length ?? 0) > 0,
    );
    if (!aiMessage) {
      throw new Error('expected an AIMessage with tool_calls in the sanitized stream');
    }
    const toolCallId = aiMessage.tool_calls?.[0]?.id;
    expect(toolCallId).toBe('call_legacy_read');

    const pairedToolMessages = request.messages.filter(
      (message): message is ToolMessage => ToolMessage.isInstance(message) && message.tool_call_id === toolCallId,
    );
    expect(pairedToolMessages).toHaveLength(1);

    const [tool] = pairedToolMessages;
    if (!tool) {
      throw new Error('expected a paired ToolMessage');
    }
    const content = JSON.parse(tool.content as string) as { errorCode: string };
    expect(content.errorCode).toBe('USER_INTERRUPTED');
  });

  it('should round-trip a modern finalizer payload (rawInput, toolName-bearing errorText)', async () => {
    const modernPayload: MyUIMessage[] = [
      { id: 'u_initial', role: 'user', parts: [{ type: 'text', text: 'Open main.ts.' }] },
      {
        id: 'a_modern_interrupt',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read_file',
            toolCallId: 'call_modern',
            state: 'output-error',
            input: undefined,
            rawInput: { limit: 15 },
            errorText: JSON.stringify({
              errorCode: 'USER_INTERRUPTED',
              message: 'Interrupted by user.',
              toolName: 'read_file',
              toolCallId: 'call_modern',
            }),
          } as unknown as MyUIMessage['parts'][number],
        ],
      },
      { id: 'u_followup', role: 'user', parts: [{ type: 'text', text: 'continue' }] },
    ];
    const parsed = uiMessagesSchema.parse(modernPayload);
    const baseMessages = await toBaseMessagesWithIds(parsed);
    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages: baseMessages }, handler);

    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
    const aiMessage = request.messages.find(
      (message): message is AIMessage => AIMessage.isInstance(message) && (message.tool_calls?.length ?? 0) > 0,
    );
    if (!aiMessage) {
      throw new Error('expected modern AIMessage with tool_calls');
    }
    expect(aiMessage.tool_calls?.[0]).toMatchObject({
      id: 'call_modern',
      name: 'read_file',
      args: { limit: 15 },
    });
    const tool = request.messages.find(
      (message): message is ToolMessage => ToolMessage.isInstance(message) && message.tool_call_id === 'call_modern',
    );
    if (!tool) {
      throw new Error('expected paired ToolMessage for modern payload');
    }
    const content = JSON.parse(tool.content as string) as {
      errorCode: string;
      toolName: string;
    };
    expect(content.errorCode).toBe('USER_INTERRUPTED');
    expect(content.toolName).toBe('read_file');
  });
});
