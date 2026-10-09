import { describe, expect, it, vi } from 'vitest';
import { recordSettledGenAiUsage } from '#api/billing/credit-ledger.service.js';
import type { MetricsService } from '#telemetry/metrics.js';

const attributes = {
  'gen_ai.request.model': 'model-a',
  'gen_ai.provider.name': 'provider-a',
  'tau.surface': 'gateway',
  'tau.activity': 'agent',
};
const meters = () => ({
  genAiCost: { add: vi.fn() },
  genAiTokenUsage: { record: vi.fn() },
  billingSupplierCostPicoUsd: { add: vi.fn() },
});
const supplierAttributes = {
  'gen_ai.request.model': 'model-a',
  'gen_ai.provider.name': 'provider-a',
  'deployment.environment': 'prod-eu',
};

describe('recordSettledGenAiUsage', () => {
  it('should record charged USD and each known token type of settled usage', () => {
    const metrics = meters();

    recordSettledGenAiUsage(
      metrics as unknown as MetricsService,
      attributes,
      {
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [
          { dimension: 'uncached_input', tier: null, quantity: 10n },
          { dimension: 'output', tier: null, quantity: 3n },
          { dimension: 'web_search', tier: null, quantity: 1n },
        ],
      },
      { chargedAtoms: 2_500_000n, supplierCostPicoUsd: 1_750_000n },
      'prod-eu',
    );

    expect(metrics.genAiCost.add).toHaveBeenCalledExactlyOnceWith(2.5, attributes);
    expect(metrics.billingSupplierCostPicoUsd.add).toHaveBeenCalledExactlyOnceWith(1_750_000, supplierAttributes);
    expect(metrics.genAiTokenUsage.record.mock.calls).toEqual([
      [10, { ...attributes, 'gen_ai.token.type': 'input' }],
      [3, { ...attributes, 'gen_ai.token.type': 'output' }],
    ]);
  });

  it('should record the cost of an absorbed operation but not its partial tokens', () => {
    const metrics = meters();

    recordSettledGenAiUsage(
      metrics as unknown as MetricsService,
      attributes,
      { kind: 'absorbed_unknown', meterItems: [{ dimension: 'output', tier: null, quantity: 9n }] },
      { chargedAtoms: 7n, supplierCostPicoUsd: null },
      'prod-eu',
    );

    expect(metrics.genAiCost.add).toHaveBeenCalledExactlyOnceWith(7e-6, attributes);
    expect(metrics.genAiTokenUsage.record).not.toHaveBeenCalled();
    expect(metrics.billingSupplierCostPicoUsd.add).not.toHaveBeenCalled();
  });

  it('should not count supplier cost for a refusal that cost nothing', () => {
    const metrics = meters();

    recordSettledGenAiUsage(
      metrics as unknown as MetricsService,
      attributes,
      { kind: 'provider_rejected' },
      { chargedAtoms: 0n, supplierCostPicoUsd: 0n },
      'prod-eu',
    );

    expect(metrics.billingSupplierCostPicoUsd.add).not.toHaveBeenCalled();
  });
});
