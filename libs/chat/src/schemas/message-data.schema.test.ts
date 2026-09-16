import { describe, expect, it } from 'vitest';
import {
  acpSessionDataSchema,
  contextCompactionDataSchema,
  contextUsageDataSchema,
  usageDataSchema,
} from '#schemas/message-data.schema.js';

describe('acpSessionDataSchema', () => {
  it('accepts protocol-null optional command, configuration, and mode metadata', () => {
    expect(
      acpSessionDataSchema.parse({
        type: 'acp-session',
        id: 'state',
        agentId: 'codex',
        commands: [{ name: 'help', description: 'Help', input: null }],
        configOptions: [
          {
            type: 'boolean',
            id: 'search',
            name: 'Search',
            description: null,
            category: null,
            currentValue: false,
          },
        ],
        modeId: 'default',
        modes: [{ id: 'default', name: 'Default', description: null }],
      }),
    ).toMatchObject({ commands: [{ input: null }], configOptions: [{ description: null, category: null }] });
  });
});

describe('contextCompactionDataSchema', () => {
  it('should accept the enriched compaction cursor fields', () => {
    expect(
      contextCompactionDataSchema.parse({
        type: 'context-compaction',
        id: 'dat_compaction',
        compactionId: 'dat_compaction',
        status: 'compacted',
        triggerReason: 'previous_usage',
        budgetKind: 'estimated',
        estimatedInputTokens: 180_000,
        contextWindow: 200_000,
        triggerThreshold: 170_000,
        tokensBeforeCompaction: 180_000,
        tokensAfterCompaction: 12_000,
        compressionRatio: 0.067,
        messagesEvicted: 32,
        transcriptFilePath: '.tau/transcripts/chat.jsonl',
        compactionFailureKind: 'morph_contract_error',
        failureDisposition: 'blocked_before_provider',
        debugId: 'dat_debug',
        providerNativeReplayMetadataPresent: false,
        missingFunctionCallSignatureCount: 0,
      }),
    ).toMatchObject({
      status: 'compacted',
      triggerReason: 'previous_usage',
      budgetKind: 'estimated',
      compactionId: 'dat_compaction',
      compactionFailureKind: 'morph_contract_error',
      failureDisposition: 'blocked_before_provider',
    });
  });

  it('should keep the legacy minimal shape valid for persisted messages', () => {
    expect(
      contextCompactionDataSchema.parse({
        type: 'context-compaction',
        id: 'dat_old',
        tokensBeforeCompaction: 100,
        tokensAfterCompaction: 10,
        compressionRatio: 0.1,
        messagesEvicted: 2,
        transcriptFilePath: null,
      }),
    ).toMatchObject({ id: 'dat_old' });
  });
});

describe('contextUsageDataSchema', () => {
  it('should accept budget metadata and latest compaction status', () => {
    expect(
      contextUsageDataSchema.parse({
        type: 'context-usage',
        id: 'dat_usage',
        totalInputTokens: 100_000,
        contextWindow: 200_000,
        percentUsed: 50,
        modelId: 'anthropic-claude-haiku-4.5',
        budgetKind: 'estimated',
        triggerReason: 'estimate',
        triggerThreshold: 170_000,
        lastCompactionId: 'dat_compaction',
        lastCompactionStatus: 'overflow_retry_succeeded',
        compactionScheduleStatus: 'none',
      }),
    ).toMatchObject({
      budgetKind: 'estimated',
      triggerReason: 'estimate',
      lastCompactionStatus: 'overflow_retry_succeeded',
    });
  });

  it('should accept scheduled-next-turn compaction metadata', () => {
    expect(
      contextUsageDataSchema.parse({
        type: 'context-usage',
        id: 'dat_usage',
        totalInputTokens: 180_000,
        contextWindow: 200_000,
        percentUsed: 90,
        modelId: 'anthropic-claude-haiku-4.5',
        triggerThreshold: 170_000,
        compactionScheduleStatus: 'scheduled_next_turn',
        scheduledTriggerReason: 'previous_usage',
        scheduledInputTokens: 180_000,
      }),
    ).toMatchObject({
      compactionScheduleStatus: 'scheduled_next_turn',
      scheduledTriggerReason: 'previous_usage',
      scheduledInputTokens: 180_000,
    });
  });
});

describe('usageDataSchema', () => {
  const tokens = {
    type: 'usage',
    id: 'dat_usage',
    model: 'openai-gpt-5.5',
    inputTokens: 10,
    outputTokens: 4,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  } as const;

  it('should accept the bounded funded-operation projection', () => {
    expect(
      usageDataSchema.parse({
        ...tokens,
        reasoningTokens: 3,
        operationId: 'op_01JABCDEF',
        attemptId: 'att_01JABCDEF',
        billingStatus: 'terminal',
      }),
    ).toMatchObject({ operationId: 'op_01JABCDEF', attemptId: 'att_01JABCDEF', billingStatus: 'terminal' });
  });

  it('should keep an unfunded turn valid and leave reasoning unreported', () => {
    expect(usageDataSchema.parse({ ...tokens, agent: 'codex' })).toEqual({ ...tokens, agent: 'codex' });
  });

  /* A persisted transcript is untrusted input that a later authenticated
   * receipt request is built from, so the identity it can carry is bounded
   * exactly as the gateway transport bounds it. */
  it('should refuse an oversized, empty, or non-printable operation identity', () => {
    expect(usageDataSchema.safeParse({ ...tokens, operationId: 'o'.repeat(129) }).success).toBe(false);
    expect(usageDataSchema.safeParse({ ...tokens, operationId: '' }).success).toBe(false);
    expect(usageDataSchema.safeParse({ ...tokens, attemptId: 'att 1' }).success).toBe(false);
    expect(usageDataSchema.safeParse({ ...tokens, billingStatus: 'settled' }).success).toBe(false);
  });

  /* B4 R2: a turn carries no price, so a persisted legacy cost field is dropped
   * rather than read back as a charge. */
  it('should drop the retired local cost fields', () => {
    expect(usageDataSchema.parse({ ...tokens, totalCost: 0.24, inputTokensCost: 0.12 })).toEqual(tokens);
  });
});
