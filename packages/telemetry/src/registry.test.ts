import { describe, it, expect } from 'vitest';
import { TauMetrics } from '#registry.js';

describe('TauMetrics', () => {
  const metrics = Object.values(TauMetrics);

  it('should define all canonical metrics', () => {
    expect(metrics).toHaveLength(27);
  });

  it('should expose the tool-result offload counter with the canonical OTEL name', () => {
    expect(TauMetrics.chatToolResultOffloaded.name).toBe('chat.tool_result.offloads');
    expect(TauMetrics.chatToolResultOffloaded.type).toBe('counter');
  });

  it('should expose the agent-safeguard counter with the canonical OTEL name', () => {
    expect(TauMetrics.genAiAgentSafeguardInterventions.name).toBe('gen_ai.agent.safeguard.interventions');
    expect(TauMetrics.genAiAgentSafeguardInterventions.type).toBe('counter');
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
