import { describe, it, expect } from 'vitest';
import {
  AttributeKey,
  KernelStatus,
  GenAiToolStatus,
  GenAiTokenType,
  RpcStatus,
  GenAiSafeguardAction,
  GenAiSafeguardHelped,
  GenAiInterruptRecoveryOutcome,
  GenAiContextBudgetKind,
  GenAiContextBudgetTriggerReason,
  GenAiContextCompactionStatus,
} from '#attributes.js';

describe('AttributeKey', () => {
  it('should have unique values across all keys', () => {
    const values = Object.values(AttributeKey);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('should use dot-separated lowercase notation for all keys', () => {
    for (const value of Object.values(AttributeKey)) {
      expect(value).toMatch(/^[_a-z][\d._a-z]*$/);
    }
  });
});

describe('KernelStatus', () => {
  it('should define success and error values', () => {
    expect(KernelStatus.SUCCESS).toBe('success');
    expect(KernelStatus.ERROR).toBe('error');
  });
});

describe('GenAiToolStatus', () => {
  it('should define success and error values', () => {
    expect(GenAiToolStatus.SUCCESS).toBe('success');
    expect(GenAiToolStatus.ERROR).toBe('error');
  });
});

describe('GenAiTokenType', () => {
  it('should define input, output, and cache_read values', () => {
    expect(GenAiTokenType.INPUT).toBe('input');
    expect(GenAiTokenType.OUTPUT).toBe('output');
    expect(GenAiTokenType.CACHE_READ).toBe('cache_read');
  });
});

describe('RpcStatus', () => {
  it('should define ok and error values', () => {
    expect(RpcStatus.OK).toBe('ok');
    expect(RpcStatus.ERROR).toBe('error');
  });
});

describe('agent safeguard attribute keys', () => {
  it('should expose pattern, action, and helped keys under gen_ai.agent.safeguard.*', () => {
    expect(AttributeKey.GEN_AI_SAFEGUARD_PATTERN).toBe('gen_ai.agent.safeguard.pattern');
    expect(AttributeKey.GEN_AI_SAFEGUARD_ACTION).toBe('gen_ai.agent.safeguard.action');
    expect(AttributeKey.GEN_AI_SAFEGUARD_HELPED).toBe('gen_ai.agent.safeguard.helped');
  });
});

describe('GenAiSafeguardAction', () => {
  it('should define nudge and terminate values', () => {
    expect(GenAiSafeguardAction.NUDGE).toBe('nudge');
    expect(GenAiSafeguardAction.TERMINATE).toBe('terminate');
  });
});

describe('GenAiSafeguardHelped', () => {
  it('should define string-coerced boolean values', () => {
    expect(GenAiSafeguardHelped.TRUE).toBe('true');
    expect(GenAiSafeguardHelped.FALSE).toBe('false');
  });
});

describe('prompt-section attribute keys', () => {
  it('should expose section name and cache-break keys under gen_ai.prompt.section.*', () => {
    expect(AttributeKey.GEN_AI_PROMPT_SECTION_NAME).toBe('gen_ai.prompt.section.name');
    expect(AttributeKey.GEN_AI_PROMPT_SECTION_CACHE_BREAK).toBe('gen_ai.prompt.section.cache_break');
  });
});

describe('interrupt-recovery attribute keys', () => {
  it('should expose the outcome key under gen_ai.agent.interrupt_recovery.*', () => {
    expect(AttributeKey.GEN_AI_INTERRUPT_RECOVERY_OUTCOME).toBe('gen_ai.agent.interrupt_recovery.outcome');
  });
});

describe('GenAiInterruptRecoveryOutcome', () => {
  it('should define emitted and already_fired values', () => {
    expect(GenAiInterruptRecoveryOutcome.EMITTED).toBe('emitted');
    expect(GenAiInterruptRecoveryOutcome.ALREADY_FIRED).toBe('already_fired');
  });
});

describe('context-budget attribute keys', () => {
  it('should expose budget and compaction keys under gen_ai.context_*', () => {
    expect(AttributeKey.GEN_AI_CONTEXT_BUDGET_COMPONENT).toBe('gen_ai.context_budget.component');
    expect(AttributeKey.GEN_AI_CONTEXT_BUDGET_KIND).toBe('gen_ai.context_budget.kind');
    expect(AttributeKey.GEN_AI_CONTEXT_BUDGET_TRIGGER_REASON).toBe('gen_ai.context_budget.trigger_reason');
    expect(AttributeKey.GEN_AI_CONTEXT_COMPACTION_STATUS).toBe('gen_ai.context_compaction.status');
  });
});

describe('GenAiContextBudgetKind', () => {
  it('should define the active estimate-backed budget kind', () => {
    expect(GenAiContextBudgetKind.ESTIMATED).toBe('estimated');
  });
});

describe('GenAiContextBudgetTriggerReason', () => {
  it('should define compaction trigger reasons', () => {
    expect(GenAiContextBudgetTriggerReason.NONE).toBe('none');
    expect(GenAiContextBudgetTriggerReason.ESTIMATE).toBe('estimate');
    expect(GenAiContextBudgetTriggerReason.PREVIOUS_USAGE).toBe('previous_usage');
    expect(GenAiContextBudgetTriggerReason.OVERFLOW).toBe('overflow');
  });
});

describe('GenAiContextCompactionStatus', () => {
  it('should define compaction outcomes', () => {
    expect(GenAiContextCompactionStatus.SKIPPED).toBe('skipped');
    expect(GenAiContextCompactionStatus.COMPACTED).toBe('compacted');
    expect(GenAiContextCompactionStatus.FAILED).toBe('failed');
    expect(GenAiContextCompactionStatus.OVERFLOW_RETRY_SUCCEEDED).toBe('overflow_retry_succeeded');
  });
});
