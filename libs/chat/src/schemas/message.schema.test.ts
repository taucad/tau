import type { ReasoningUIPart } from 'ai';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { safeValidateUiMessages, validateUiMessages } from '#schemas/message.schema.js';
import type { CommonReasoningMetadata } from '#schemas/common-reasoning-metadata.schema.js';
import type { MyMessagePart, MyUIMessage } from '#types/message.types.js';

const userMessage: MyUIMessage = { id: 'm0', role: 'user', parts: [{ type: 'text', text: 'hello' }] };

const reasoningPart = (providerMetadata?: ReasoningUIPart['providerMetadata']): MyUIMessage['parts'][number] => ({
  type: 'reasoning',
  text: 'thinking…',
  state: 'done',
  providerMetadata,
});

const findPart = <PartType extends MyMessagePart['type']>(
  messages: MyUIMessage[],
  type: PartType,
): Extract<MyMessagePart, { type: PartType }> => {
  const part = messages.flatMap(({ parts }) => parts).find((value) => value.type === type);
  if (!part) {
    throw new Error(`Expected ${type} part`);
  }
  return part as Extract<MyMessagePart, { type: PartType }>;
};

describe('safeValidateUiMessages Tau wire extensions', () => {
  it('delegates generic UI-message validation to the AI SDK', async () => {
    const result = await safeValidateUiMessages([{ id: 'bad', role: 'user', parts: [{ type: 'text' }] }]);
    expect(result.success).toBe(false);
  });

  it('validates Tau message metadata', async () => {
    const result = await safeValidateUiMessages([
      { ...userMessage, metadata: { createdAt: 1, status: 'not-a-status' } },
    ]);
    expect(result.success).toBe(false);
  });

  it('validates Tau data parts', async () => {
    const result = await safeValidateUiMessages([
      {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'data-usage', data: { type: 'usage', id: 'usage_1' } }],
      },
    ]);
    expect(result.success).toBe(false);
  });

  it('accepts and preserves common reasoning timing beside provider metadata', async () => {
    const providerMetadata = {
      common: { reasoningStartedAtMs: 1_700_000_000_000, reasoningEndedAtMs: 1_700_000_002_000 },
      anthropic: { thinkingSignature: 'abc' },
    };
    const result = await safeValidateUiMessages([
      { id: 'm1', role: 'assistant', parts: [reasoningPart(providerMetadata)] },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(findPart(result.data, 'reasoning').providerMetadata).toEqual(providerMetadata);
    }
  });

  it.each([{ reasoningStartedAtMs: -1 }, { reasoningStartedAtMs: 'oops' }, { reasoningEndedAtMs: 1.5 }])(
    'rejects malformed common reasoning timing',
    async (common) => {
      const result = await safeValidateUiMessages([
        { id: 'm1', role: 'assistant', parts: [reasoningPart({ common })] },
      ]);
      expect(result.success).toBe(false);
    },
  );

  it('heals invalid interrupted static-tool input into rawInput', async () => {
    const result = await safeValidateUiMessages([
      userMessage,
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read_file',
            toolCallId: 'call_read',
            state: 'output-error',
            input: { limit: 15 },
            errorText: 'Interrupted by user.',
          },
        ],
      },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(findPart(result.data, 'tool-read_file')).toMatchObject({
        state: 'output-error',
        input: undefined,
        rawInput: { limit: 15 },
      });
    }
  });

  it('preserves valid interrupted static-tool input', async () => {
    const result = await safeValidateUiMessages([
      userMessage,
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read_file',
            toolCallId: 'call_read',
            state: 'output-error',
            input: { targetFile: 'main.ts', limit: 15 },
            errorText: 'Interrupted by user.',
          },
        ],
      },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(findPart(result.data, 'tool-read_file')).toMatchObject({
        state: 'output-error',
        input: { targetFile: 'main.ts', limit: 15 },
      });
    }
  });

  it('terminalizes stale historical static tool parts before validation', async () => {
    const result = await safeValidateUiMessages([
      userMessage,
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read_file',
            toolCallId: 'call_read',
            state: 'input-available',
            input: { limit: 40 },
          },
        ],
      },
      { id: 'm2', role: 'user', parts: [{ type: 'text', text: 'continue' }] },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(findPart(result.data, 'tool-read_file')).toMatchObject({
        state: 'output-error',
        input: undefined,
        rawInput: { limit: 40 },
      });
    }
  });

  it.each([
    ['string', 'partial'],
    ['array', ['partial']],
  ])('rejects active static input-streaming %s input that is not a typed partial', async (_kind, input) => {
    const result = await safeValidateUiMessages([
      userMessage,
      {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'tool-read_file', toolCallId: 'call_streaming', state: 'input-streaming', input }],
      },
    ]);

    expect(result.success).toBe(false);
  });

  it('accepts active static input-streaming input that matches the partial tool schema', async () => {
    const result = await safeValidateUiMessages([
      userMessage,
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          { type: 'tool-read_file', toolCallId: 'call_streaming', state: 'input-streaming', input: { limit: 15 } },
        ],
      },
    ]);

    expect(result.success).toBe(true);
  });

  it.each(['approval-requested', 'approval-responded', 'output-denied'] as const)(
    'rejects incomplete static input in %s state',
    async (state) => {
      const approval =
        state === 'approval-requested'
          ? { id: 'approval_1' }
          : { id: 'approval_1', approved: state === 'approval-responded' };
      const result = await safeValidateUiMessages([
        userMessage,
        {
          id: 'm1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-read_file',
              toolCallId: 'call_approval',
              state,
              input: { limit: 15 },
              approval,
            },
          ],
        },
      ]);

      expect(result.success).toBe(false);
    },
  );

  it('terminalizes stale historical dynamic tool parts without a static schema', async () => {
    const result = await safeValidateUiMessages([
      userMessage,
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'future_tool',
            toolCallId: 'call_dynamic',
            state: 'input-streaming',
            input: { partial: true },
          },
        ],
      },
      { id: 'm2', role: 'user', parts: [{ type: 'text', text: 'continue' }] },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      const part = findPart(result.data, 'dynamic-tool');
      expect(part).toMatchObject({
        state: 'output-error',
        input: { partial: true },
      });
      expect(part.state === 'output-error' && part.errorText).toContain('USER_INTERRUPTED');
    }
  });

  it('repairs historical slash-prefixed project paths before strict tool validation', async () => {
    const messages = await validateUiMessages([
      {
        id: 'm-path',
        role: 'assistant',
        parts: [
          {
            type: 'tool-get_kernel_result',
            toolCallId: 'call-path',
            state: 'output-available',
            input: { targetFile: '/main.ts' },
            output: { status: 'error', kernelIssues: [], issues: [], truncated: false },
          },
        ],
      },
    ]);

    expect(findPart(messages, 'tool-get_kernel_result')).toMatchObject({ input: { targetFile: 'main.ts' } });
  });

  it('keeps common reasoning metadata assignable to MyMessagePart', () => {
    const typedCommon: CommonReasoningMetadata = { reasoningStartedAtMs: 10, reasoningEndedAtMs: 30 };
    const part = reasoningPart({ common: typedCommon });
    expect(part.type === 'reasoning' && part.providerMetadata).toEqual({ common: typedCommon });
    expectTypeOf<CommonReasoningMetadata>().toExtend<{
      reasoningStartedAtMs?: number | undefined;
      reasoningEndedAtMs?: number | undefined;
    }>();
  });
});
