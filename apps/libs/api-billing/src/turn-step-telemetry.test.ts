/* eslint-disable @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation */
import { describe, expect, it, vi } from 'vitest';
import { llmGatewayProviders } from '@taucad/telemetry';
import {
  gatewayProviderLabel,
  inlineImageBytesOf,
  promptCacheOutcome,
  recordTurnStepCache,
  turnStepTokenType,
} from '#turn-step-telemetry.js';
import type { NormalizedMeterItem, TerminalEvidence } from '#credit-ledger.types.js';
import type { GatewayProviderId } from '@taucad/api-llm-gateway';
import type { MetricsService } from '@taucad/api-observability/metrics';

const item = (dimension: string, quantity: bigint, tier?: string): NormalizedMeterItem => ({
  dimension,
  tier: tier ?? null,
  quantity,
});

describe('gatewayProviderLabel', () => {
  it('should keep the telemetry copy of the gateway provider ids in step with the gateway', () => {
    // Compile-time: every gateway id is a label, so a new provider fails here rather than becoming `other`.
    const everyGatewayId: Record<GatewayProviderId, true> = {
      anthropic: true,
      cerebras: true,
      moonshot: true,
      morph: true,
      openai: true,
      together: true,
      vertexai: true,
      xai: true,
    };
    expect([...Object.keys(everyGatewayId), 'other'].sort()).toEqual([...llmGatewayProviders].sort());
    expect(gatewayProviderLabel('vertexai')).toBe('vertexai');
    expect(gatewayProviderLabel('local-llama')).toBe('other');
  });
});

describe('turnStepTokenType', () => {
  it('should split the 1-hour cache write tier from the other write tiers', () => {
    expect(turnStepTokenType(item('cache_write', 1n, '1h'))).toBe('cache_write_1h');
    expect(turnStepTokenType(item('cache_write', 1n, '5m'))).toBe('cache_write');
    expect(turnStepTokenType(item('cache_write', 1n, '30m'))).toBe('cache_write');
    expect(turnStepTokenType(item('uncached_input', 1n))).toBe('input');
    expect(turnStepTokenType(item('cache_read', 1n))).toBe('cache_read');
    expect(turnStepTokenType(item('output', 1n))).toBe('output');
    expect(turnStepTokenType(item('web_search_requests', 1n))).toBeUndefined();
  });
});

describe('promptCacheOutcome', () => {
  it('should classify hit, partial, miss and unreported', () => {
    expect(
      promptCacheOutcome([item('uncached_input', 10n), item('cache_read', 90n), item('cache_write', 0n, '5m')]),
    ).toBe('hit');
    expect(promptCacheOutcome([item('uncached_input', 50n), item('cache_read', 50n)])).toBe('hit');
    expect(
      promptCacheOutcome([item('uncached_input', 10n), item('cache_read', 7000n), item('cache_write', 16_000n, '5m')]),
    ).toBe('partial');
    expect(
      promptCacheOutcome([item('uncached_input', 10n), item('cache_read', 0n), item('cache_write', 16_000n, '5m')]),
    ).toBe('miss');
    expect(promptCacheOutcome([item('uncached_input', 10n), item('output', 5n)])).toBe('unreported');
  });
});

describe('recordTurnStepCache', () => {
  const metrics = () => {
    const tokens = vi.fn();
    const outcomes = vi.fn();
    const ttft = vi.fn();
    return {
      tokens,
      outcomes,
      ttft,
      service: {
        llmTurnStepCacheTokens: { add: tokens },
        llmTurnStepCacheOutcomes: { add: outcomes },
        llmTurnStepTimeToFirstToken: { record: ttft },
      } as unknown as MetricsService,
    };
  };
  const settled = {
    kind: 'final_usage',
    meterItems: [
      item('uncached_input', 4n),
      item('cache_read', 0n),
      item('cache_write', 16_000n, '1h'),
      item('output', 9n),
    ],
  } as unknown as TerminalEvidence;

  it('should record tokens, outcome and first-token time under the asserted turn labels', () => {
    const { tokens, outcomes, ttft, service } = metrics();
    recordTurnStepCache(service, {
      providerId: 'anthropic',
      turn: { step: 'first', gap: '5m_60m' },
      evidence: settled,
      timeToFirstTokenSeconds: 3.5,
    });
    const labels = { 'gen_ai.provider.name': 'anthropic', 'tau.turn.step': 'first', 'tau.turn.gap': '5m_60m' };
    expect(tokens.mock.calls).toEqual([
      [4, { ...labels, 'gen_ai.token.type': 'input' }],
      [16_000, { ...labels, 'gen_ai.token.type': 'cache_write_1h' }],
      [9, { ...labels, 'gen_ai.token.type': 'output' }],
    ]);
    expect(outcomes).toHaveBeenCalledWith(1, { ...labels, 'tau.prompt_cache.outcome': 'miss' });
    expect(ttft).toHaveBeenCalledWith(3.5, { ...labels, 'tau.prompt_cache.outcome': 'miss' });
  });

  it('should record nothing without turn labels or settled usage', () => {
    const { tokens, outcomes, ttft, service } = metrics();
    recordTurnStepCache(service, {
      providerId: 'anthropic',
      turn: undefined,
      evidence: settled,
      timeToFirstTokenSeconds: 1,
    });
    recordTurnStepCache(service, {
      providerId: 'anthropic',
      turn: { step: 'first', gap: 'lt_5m' },
      evidence: { kind: 'provider_rejected' } as unknown as TerminalEvidence,
      timeToFirstTokenSeconds: undefined,
    });
    expect(tokens).not.toHaveBeenCalled();
    expect(outcomes).not.toHaveBeenCalled();
    expect(ttft).not.toHaveBeenCalled();
  });
});

describe('inlineImageBytesOf', () => {
  it('should count Anthropic base64 sources and data:image URLs, and nothing else', () => {
    expect(inlineImageBytesOf({ type: 'base64', media_type: 'image/webp', data: 'QUJD' })).toBe(4);
    expect(inlineImageBytesOf({ type: 'base64', media_type: 'application/pdf', data: 'QUJD' })).toBe(0);
    expect(inlineImageBytesOf({ type: 'input_image', image_url: 'data:image/png;base64,QUJD' })).toBe(26);
    expect(inlineImageBytesOf({ type: 'image_url', image_url: { url: 'https://example.com/a.png' } })).toBe(0);
    expect(inlineImageBytesOf({ type: 'text', text: 'data:image is just text here' })).toBe(0);
  });
});
