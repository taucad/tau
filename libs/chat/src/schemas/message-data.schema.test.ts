import { describe, expect, it } from 'vitest';
import { contextCompactionDataSchema, contextUsageDataSchema } from '#schemas/message-data.schema.js';

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
