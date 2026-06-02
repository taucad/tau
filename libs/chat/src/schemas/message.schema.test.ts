import type { ReasoningUIPart } from 'ai';
import { describe, it, expect, expectTypeOf } from 'vitest';
import { uiMessagesSchema } from '#schemas/message.schema.js';
import type { MyUIMessage, MyMessagePart } from '#types/message.types.js';
import type { CommonReasoningMetadata } from '#schemas/common-reasoning-metadata.schema.js';
import { toolName } from '#constants/tool.constants.js';

const userMessage: MyUIMessage = { id: 'm0', role: 'user', parts: [{ type: 'text', text: 'hello' }] };

const findToolPart = <PartType extends MyMessagePart['type']>(
  parts: readonly MyMessagePart[],
  type: PartType,
): Extract<MyMessagePart, { type: PartType }> => {
  const part = parts.find((p): p is Extract<MyMessagePart, { type: PartType }> => p.type === type);
  if (!part) {
    throw new Error(`expected a ${type} part`);
  }
  return part;
};

const baseMessage = (parts: MyUIMessage['parts']): MyUIMessage => ({
  id: 'm1',
  role: 'assistant',
  parts,
});

const reasoningPart = (
  providerMetadata?: ReasoningUIPart['providerMetadata'],
  state: 'streaming' | 'done' = 'done',
): MyUIMessage['parts'][number] => ({
  type: 'reasoning',
  text: 'thinking…',
  state,
  providerMetadata,
});

const findReasoning = (parts: readonly MyMessagePart[]): MyMessagePart & { type: 'reasoning' } => {
  const part = parts.find((p): p is MyMessagePart & { type: 'reasoning' } => p.type === 'reasoning');
  if (!part) {
    throw new Error('expected a reasoning part');
  }
  return part;
};

describe('uiMessagesSchema reasoning part narrowing', () => {
  describe('backwards compatibility', () => {
    it('should accept a legacy persisted reasoning part with no providerMetadata', () => {
      const result = uiMessagesSchema.safeParse([baseMessage([reasoningPart()])]);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const part = findReasoning(result.data[0]?.parts ?? []);
      expect(part.providerMetadata).toBeUndefined();
    });

    it('should preserve a legacy provider-only namespace (anthropic) with no common keys', () => {
      const result = uiMessagesSchema.safeParse([
        baseMessage([reasoningPart({ anthropic: { thinkingSignature: 'abc' } })]),
      ]);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const part = findReasoning(result.data[0]?.parts ?? []);
      expect(part.providerMetadata).toEqual({ anthropic: { thinkingSignature: 'abc' } });
    });

    it('should accept reasoning parts in mixed messages with text parts and no metadata', () => {
      const result = uiMessagesSchema.safeParse([
        baseMessage([reasoningPart(), { type: 'text', text: 'Hello', state: 'done' }]),
      ]);

      expect(result.success).toBe(true);
    });
  });

  describe('common namespace acceptance', () => {
    it('should accept and preserve typed reasoningStartedAtMs and reasoningEndedAtMs', () => {
      const result = uiMessagesSchema.safeParse([
        baseMessage([
          reasoningPart({
            common: {
              reasoningStartedAtMs: 1_700_000_000_000,
              reasoningEndedAtMs: 1_700_000_002_000,
            },
          }),
        ]),
      ]);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const part = findReasoning(result.data[0]?.parts ?? []);
      expect(part.providerMetadata).toEqual({
        common: {
          reasoningStartedAtMs: 1_700_000_000_000,
          reasoningEndedAtMs: 1_700_000_002_000,
        },
      });
    });

    it('should accept mixed common + anthropic namespaces and retain both', () => {
      const result = uiMessagesSchema.safeParse([
        baseMessage([
          reasoningPart({
            common: {
              reasoningStartedAtMs: 1_700_000_000_000,
              reasoningEndedAtMs: 1_700_000_001_000,
            },
            anthropic: { thinkingSignature: 'abc' },
          }),
        ]),
      ]);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const part = findReasoning(result.data[0]?.parts ?? []);
      expect(part.providerMetadata).toEqual({
        common: {
          reasoningStartedAtMs: 1_700_000_000_000,
          reasoningEndedAtMs: 1_700_000_001_000,
        },
        anthropic: { thinkingSignature: 'abc' },
      });
    });

    it('should accept common containing only one endpoint (in-progress block)', () => {
      const result = uiMessagesSchema.safeParse([
        baseMessage([reasoningPart({ common: { reasoningStartedAtMs: 1_700_000_000_000 } }, 'streaming')]),
      ]);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const part = findReasoning(result.data[0]?.parts ?? []);
      expect(part.providerMetadata).toEqual({ common: { reasoningStartedAtMs: 1_700_000_000_000 } });
    });
  });

  describe('common namespace rejection', () => {
    it('should reject a negative reasoningStartedAtMs', () => {
      const result = uiMessagesSchema.safeParse([
        baseMessage([reasoningPart({ common: { reasoningStartedAtMs: -1 } })]),
      ]);

      expect(result.success).toBe(false);
      if (result.success) {
        return;
      }
      expect(result.error.issues.some((issue) => issue.path.includes('reasoningStartedAtMs'))).toBe(true);
    });

    it('should reject a string reasoningStartedAtMs', () => {
      const result = uiMessagesSchema.safeParse([
        baseMessage([reasoningPart({ common: { reasoningStartedAtMs: 'oops' } })]),
      ]);

      expect(result.success).toBe(false);
    });

    it('should reject a non-integer reasoningEndedAtMs', () => {
      const result = uiMessagesSchema.safeParse([
        baseMessage([reasoningPart({ common: { reasoningEndedAtMs: 1.5 } })]),
      ]);

      expect(result.success).toBe(false);
    });
  });

  describe('interrupted tool parts (output-error with partial input)', () => {
    const interruptedReadFilePart = (overrides: Partial<MyMessagePart> = {}): MyMessagePart => {
      const literal = {
        type: 'tool-read_file',
        toolCallId: 'call_test',
        state: 'output-error',
        input: { limit: 15 },
        errorText: JSON.stringify({
          errorCode: 'USER_INTERRUPTED',
          message: 'Interrupted by user.',
          toolName: 'read_file',
          toolCallId: 'call_test',
        }),
        ...overrides,
      };
      return literal as unknown as MyMessagePart;
    };

    it('should accept tool-read_file in output-error with partial input lacking required fields', () => {
      const result = uiMessagesSchema.safeParse([userMessage, baseMessage([interruptedReadFilePart()])]);

      expect(result.success).toBe(true);
    });

    it('should accept tool-read_file in output-error with rawInput populated and input cleared', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          interruptedReadFilePart({
            input: undefined,
            rawInput: { limit: 15 },
          } as unknown as Partial<MyMessagePart>),
        ]),
      ]);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const part = findToolPart(result.data[1]?.parts ?? [], 'tool-read_file');
      expect(part.state).toBe('output-error');
      if (part.state !== 'output-error') {
        return;
      }
      expect(part.input).toBeUndefined();
      expect((part as { rawInput?: unknown }).rawInput).toEqual({ limit: 15 });
    });

    it('should accept tool-test_model in output-error with rawInput populated', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: `tool-${toolName.testModel}`,
            toolCallId: 'call_test_model',
            state: 'output-error',
            input: undefined,
            rawInput: { stray: 'ignored partial' },
            errorText: JSON.stringify({
              errorCode: 'USER_INTERRUPTED',
              message: 'Interrupted by user.',
              toolName: 'test_model',
              toolCallId: 'call_test_model',
            }),
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
    });

    it('should heal a legacy persisted output-error part by moving invalid input to rawInput', () => {
      const result = uiMessagesSchema.safeParse([userMessage, baseMessage([interruptedReadFilePart()])]);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const part = findToolPart(result.data[1]?.parts ?? [], 'tool-read_file');
      expect(part.state).toBe('output-error');
      if (part.state !== 'output-error') {
        return;
      }
      expect(part.input).toBeUndefined();
      expect((part as { rawInput?: unknown }).rawInput).toEqual({ limit: 15 });
    });

    it('should preserve a strictly valid output-error input untouched', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          interruptedReadFilePart({
            input: { targetFile: 'main.ts', limit: 15 },
          } as unknown as Partial<MyMessagePart>),
        ]),
      ]);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const part = findToolPart(result.data[1]?.parts ?? [], 'tool-read_file');
      expect(part.state).toBe('output-error');
      if (part.state !== 'output-error') {
        return;
      }
      expect(part.input).toEqual({ targetFile: 'main.ts', limit: 15 });
      expect((part as { rawInput?: unknown }).rawInput).toBeUndefined();
    });

    it('should leave non-output-error tool parts untouched even if their input is unusual', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: 'tool-read_file',
            toolCallId: 'call_streaming',
            state: 'input-streaming',
            input: { limit: 15 },
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const part = findToolPart(result.data[1]?.parts ?? [], 'tool-read_file');
      expect(part.state).toBe('input-streaming');
      if (part.state !== 'input-streaming') {
        return;
      }
      expect(part.input).toEqual({ limit: 15 });
    });

    it('should accept dynamic-tool in output-error with rawInput populated', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: 'dynamic-tool',
            toolName: 'experimental_tool',
            toolCallId: 'call_dynamic',
            state: 'output-error',
            input: undefined,
            rawInput: { partial: true },
            errorText: 'interrupted',
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
    });
  });

  /**
   * Backfill of the AI SDK approval lifecycle. The upstream
   * `validateUIMessages` schema accepts `approval-requested`,
   * `approval-responded`, and `output-denied` for both static and dynamic tool
   * parts. Mirroring those keeps `uiMessagesSchema` forward-compatible the
   * moment any tool starts emitting approval UI, without a follow-up schema
   * change blocking the UX work.
   */
  describe('AI SDK approval-lifecycle tool-part states', () => {
    it('should accept a static tool-read_file part in approval-requested state', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: 'tool-read_file',
            toolCallId: 'call_approval_request',
            state: 'approval-requested',
            input: { targetFile: 'main.ts' },
            approval: { id: 'approval_1' },
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
    });

    it('should accept a static tool-read_file part in approval-responded state', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: 'tool-read_file',
            toolCallId: 'call_approval_response',
            state: 'approval-responded',
            input: { targetFile: 'main.ts' },
            approval: { id: 'approval_1', approved: true, reason: 'looks safe' },
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
    });

    it('should accept a static tool-read_file part in output-denied state', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: 'tool-read_file',
            toolCallId: 'call_denied',
            state: 'output-denied',
            input: { targetFile: 'main.ts' },
            approval: { id: 'approval_1', approved: false, reason: 'forbidden path' },
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
    });

    it('should accept a filtered tool-test_model part in approval-requested state', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: `tool-${toolName.testModel}`,
            toolCallId: 'call_test_model_approval',
            state: 'approval-requested',
            input: { files: ['main.geospec.ts'], testNamePattern: 'watertight' },
            approval: { id: 'approval_test_model' },
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
    });

    it('should accept a dynamic-tool part in approval-requested state', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: 'dynamic-tool',
            toolName: 'experimental_tool',
            toolCallId: 'call_dynamic_approval',
            state: 'approval-requested',
            input: { foo: 'bar' },
            approval: { id: 'approval_dynamic' },
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
    });

    it('should accept a dynamic-tool part in approval-responded state', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: 'dynamic-tool',
            toolName: 'experimental_tool',
            toolCallId: 'call_dynamic_response',
            state: 'approval-responded',
            input: { foo: 'bar' },
            approval: { id: 'approval_dynamic', approved: true },
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
    });

    it('should accept a dynamic-tool part in output-denied state', () => {
      const result = uiMessagesSchema.safeParse([
        userMessage,
        baseMessage([
          {
            type: 'dynamic-tool',
            toolName: 'experimental_tool',
            toolCallId: 'call_dynamic_denied',
            state: 'output-denied',
            input: { foo: 'bar' },
            approval: { id: 'approval_dynamic', approved: false, reason: 'no' },
          } as unknown as MyMessagePart,
        ]),
      ]);

      expect(result.success).toBe(true);
    });
  });

  describe('type-level narrowing', () => {
    it('should treat the typed common namespace as assignable to MyMessagePart reasoning providerMetadata', () => {
      const typedCommon: { common: CommonReasoningMetadata } = {
        common: {
          reasoningStartedAtMs: 1_700_000_000_000,
          reasoningEndedAtMs: 1_700_000_001_000,
        },
      };
      const part: MyMessagePart = {
        type: 'reasoning',
        text: 'hello',
        state: 'done',
        providerMetadata: typedCommon,
      };

      expect(part.providerMetadata).toEqual(typedCommon);
      expectTypeOf<CommonReasoningMetadata>().toExtend<{
        reasoningStartedAtMs?: number | undefined;
        reasoningEndedAtMs?: number | undefined;
      }>();
    });
  });
});
