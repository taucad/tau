/* eslint-disable @typescript-eslint/naming-convention -- Metric names use OTEL dot notation. */
import { describe, it, expect } from 'vitest';
import { TauMetrics } from '#registry.js';

describe('TauMetrics', () => {
  const metrics = Object.values(TauMetrics);

  it('should define all canonical metrics', () => {
    expect(metrics).toHaveLength(35);
  });

  it('should expose the tool-result offload counter with the canonical OTEL name', () => {
    expect(TauMetrics.chatToolResultOffloaded.name).toBe('chat.tool_result.offloads');
    expect(TauMetrics.chatToolResultOffloaded.type).toBe('counter');
  });

  it('should expose the tool-result media preservation counter with the canonical OTEL name', () => {
    expect(TauMetrics.chatToolResultMediaPreserved.name).toBe('chat.tool_result.media_preservations');
    expect(TauMetrics.chatToolResultMediaPreserved.type).toBe('counter');
    expect(TauMetrics.chatToolResultMediaPreserved.unit).toBe('{preservation}');
  });

  it('should expose the agent-safeguard counter with the canonical OTEL name', () => {
    expect(TauMetrics.genAiAgentSafeguardInterventions.name).toBe('gen_ai.agent.safeguard.interventions');
    expect(TauMetrics.genAiAgentSafeguardInterventions.type).toBe('counter');
  });

  it('should expose the tool-input repair counter with the canonical OTEL name', () => {
    expect(TauMetrics.genAiToolInputRepairs.name).toBe('gen_ai.tool_input.repairs');
    expect(TauMetrics.genAiToolInputRepairs.type).toBe('counter');
    expect(TauMetrics.genAiToolInputRepairs.unit).toBe('{repair}');
  });

  it('should expose the tool-duration histogram with bounded file-edit dimensions', () => {
    expect(TauMetrics.genAiToolDuration.name).toBe('gen_ai.tool.duration');
    expect(TauMetrics.genAiToolDuration.type).toBe('histogram');
    expect(
      TauMetrics.genAiToolDuration.attributes.safeParse({
        'gen_ai.file_edit.interface': 'patch',
        'gen_ai.file_edit.operation_count': 2,
        'gen_ai.file_edit.hunk_count': 1,
      }).success,
    ).toBe(true);
  });

  it('should expose the interrupt-recovery counter with the canonical OTEL name', () => {
    expect(TauMetrics.genAiInterruptRecoveryReminders.name).toBe('gen_ai.agent.interrupt_recovery.reminders');
    expect(TauMetrics.genAiInterruptRecoveryReminders.type).toBe('counter');
  });

  it('should expose the prompt-section-size histogram with the canonical OTEL name', () => {
    expect(TauMetrics.genAiPromptSectionSize.name).toBe('gen_ai.prompt.section.size');
    expect(TauMetrics.genAiPromptSectionSize.type).toBe('histogram');
    expect(TauMetrics.genAiPromptSectionSize.unit).toBe('By');
    expect(TauMetrics.genAiPromptSectionSize.buckets.length).toBeGreaterThan(0);
  });

  it('should expose context-budget metrics with canonical OTEL names', () => {
    expect(TauMetrics.genAiContextBudgetTokens.name).toBe('gen_ai.context_budget.tokens');
    expect(TauMetrics.genAiContextBudgetTokens.type).toBe('histogram');
    expect(TauMetrics.genAiContextCompactionDecisions.name).toBe('gen_ai.context_compaction.decisions');
    expect(TauMetrics.genAiContextCompactionDecisions.type).toBe('counter');
  });

  it('should use lowercase dot-delimited names for all metrics', () => {
    for (const metric of metrics) {
      expect(metric.name).toMatch(/^[a-z][\d._a-z]*$/);
    }
  });

  it('should have non-empty descriptions for all metrics', () => {
    for (const metric of metrics) {
      expect(metric.description.length).toBeGreaterThan(0);
    }
  });

  it('should not use .total suffix on counter names (OTEL semconv violation)', () => {
    const counters = metrics.filter((m) => m.type === 'counter');
    for (const counter of counters) {
      expect(counter.name).not.toMatch(/\.total$/);
    }
  });

  it('should use pluralized names or mass nouns for counters', () => {
    const counters = metrics.filter((m) => m.type === 'counter');
    const validSuffixes = /s$|cost$/;
    for (const counter of counters) {
      const lastSegment = counter.name.split('.').at(-1) ?? '';
      expect(lastSegment).toMatch(validSuffixes);
    }
  });

  it('should provide buckets only for histogram metrics', () => {
    for (const metric of metrics) {
      if (metric.type === 'histogram') {
        expect(metric.buckets).toBeDefined();
        expect(metric.buckets.length).toBeGreaterThan(0);
      } else {
        expect(metric.buckets).toBeUndefined();
      }
    }
  });
});
