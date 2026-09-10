import { describe, expect, it } from 'vitest';
import { calculatePreliminarySupplierCost } from '#api/billing/billable-model-cost.js';
import type { SupplierValuation, TerminalEvidence } from '#api/billing/credit-ledger.types.js';

describe('calculatePreliminarySupplierCost', () => {
  it('keeps exact mixed-denominator USD economics', () => {
    expect(
      calculatePreliminarySupplierCost({
        invocation: {
          supplierValuation: {
            version: 'supplier-valuation-v1',
            sourceRevision: 'official-pricing-2026-09-06',
            longContextMinimumInputTokens: null,
            baseRates: [
              { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '3', denominatorUnits: '2' },
              { dimension: 'output', tier: null, numeratorPicoUsd: '5', denominatorUnits: '3' },
            ],
            longContextRates: null,
          },
        },
        evidence: {
          kind: 'final_usage',
          usageOccurredAt: new Date(0),
          meterItems: [
            { dimension: 'uncached_input', tier: null, quantity: 2n },
            { dimension: 'output', tier: null, quantity: 3n },
          ],
        },
        payloadDigest: 'sha256:evidence',
      }),
    ).toEqual({
      sourceRevision: 'official-pricing-2026-09-06:normalized-usage:sha256:evidence',
      payloadDigest: 'sha256:evidence',
      currency: 'usd',
      numerator: '1',
      denominator: '125000000000',
      completeness: 'complete',
    });
  });

  it('selects the inclusive long-context band from the complete input partition', () => {
    const makeEvidence = (uncached: bigint, read: bigint, write: bigint): TerminalEvidence => ({
      kind: 'final_usage',
      usageOccurredAt: new Date(0),
      meterItems: [
        { dimension: 'uncached_input', tier: null, quantity: uncached },
        { dimension: 'cache_read', tier: null, quantity: read },
        { dimension: 'cache_write', tier: '30m', quantity: write },
        { dimension: 'output', tier: null, quantity: 1n },
      ],
    });
    const supplierValuation: SupplierValuation = {
      version: 'supplier-valuation-v1',
      sourceRevision: 'tiered',
      longContextMinimumInputTokens: '3',
      baseRates: [
        { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
        { dimension: 'cache_read', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
        { dimension: 'cache_write', tier: '30m', numeratorPicoUsd: '1', denominatorUnits: '1' },
        { dimension: 'output', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
      ],
      longContextRates: [
        { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '2', denominatorUnits: '1' },
        { dimension: 'cache_read', tier: null, numeratorPicoUsd: '2', denominatorUnits: '1' },
        { dimension: 'cache_write', tier: '30m', numeratorPicoUsd: '2', denominatorUnits: '1' },
        { dimension: 'output', tier: null, numeratorPicoUsd: '2', denominatorUnits: '1' },
      ],
    };
    expect(
      calculatePreliminarySupplierCost({
        invocation: { supplierValuation },
        evidence: makeEvidence(1n, 1n, 0n),
        payloadDigest: 'base',
      })?.numerator,
    ).toBe('3');
    expect(
      calculatePreliminarySupplierCost({
        invocation: { supplierValuation },
        evidence: makeEvidence(1n, 1n, 1n),
        payloadDigest: 'long',
      })?.numerator,
    ).toBe('1');
  });

  it('uses the pinned inclusive xAI boundary at 199999, 200000, and 200001 input tokens', () => {
    const supplierValuation: SupplierValuation = {
      version: 'supplier-valuation-v1',
      sourceRevision: 'xai-pricing-discrepancy-2026-09-06',
      longContextMinimumInputTokens: '200000',
      baseRates: [
        { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '0', denominatorUnits: '1' },
        { dimension: 'cache_read', tier: null, numeratorPicoUsd: '0', denominatorUnits: '1' },
        { dimension: 'output', tier: null, numeratorPicoUsd: '0', denominatorUnits: '1' },
      ],
      longContextRates: [
        { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
        { dimension: 'cache_read', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
        { dimension: 'output', tier: null, numeratorPicoUsd: '0', denominatorUnits: '1' },
      ],
    };
    const cost = (quantity: bigint) =>
      calculatePreliminarySupplierCost({
        invocation: { supplierValuation },
        evidence: {
          kind: 'final_usage',
          usageOccurredAt: new Date(0),
          meterItems: [
            { dimension: 'uncached_input', tier: null, quantity },
            { dimension: 'cache_read', tier: null, quantity: 0n },
            { dimension: 'output', tier: null, quantity: 0n },
          ],
        },
        payloadDigest: quantity.toString(),
      });

    expect(cost(199_999n)).toMatchObject({ numerator: '0', denominator: '1' });
    expect(cost(200_000n)).toMatchObject({ numerator: '1', denominator: '5000000' });
    expect(cost(200_001n)).toMatchObject({ numerator: '200001', denominator: '1000000000000' });
  });

  it('fails closed for legacy maximum rates, incomplete partitions, and wrong cache TTL', () => {
    expect(
      calculatePreliminarySupplierCost({
        invocation: {},
        evidence: {
          kind: 'final_usage',
          usageOccurredAt: new Date(0),
          meterItems: [{ dimension: 'output', tier: null, quantity: 1n }],
        },
        payloadDigest: 'sha256:evidence',
      }),
    ).toBeUndefined();
    const supplierValuation: SupplierValuation = {
      version: 'supplier-valuation-v1',
      sourceRevision: 'ttl',
      longContextMinimumInputTokens: null,
      baseRates: [
        { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
        { dimension: 'cache_write', tier: '30m', numeratorPicoUsd: '1', denominatorUnits: '1' },
        { dimension: 'output', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
      ],
      longContextRates: null,
    };
    expect(
      calculatePreliminarySupplierCost({
        invocation: { supplierValuation },
        evidence: {
          kind: 'final_usage',
          usageOccurredAt: new Date(0),
          meterItems: [
            { dimension: 'uncached_input', tier: null, quantity: 1n },
            { dimension: 'output', tier: null, quantity: 1n },
          ],
        },
        payloadDigest: 'partial',
      }),
    ).toBeUndefined();
    expect(
      calculatePreliminarySupplierCost({
        invocation: { supplierValuation },
        evidence: {
          kind: 'final_usage',
          usageOccurredAt: new Date(0),
          meterItems: [
            { dimension: 'uncached_input', tier: null, quantity: 1n },
            { dimension: 'cache_write', tier: '5m', quantity: 1n },
            { dimension: 'output', tier: null, quantity: 1n },
          ],
        },
        payloadDigest: 'ttl',
      }),
    ).toBeUndefined();
  });
});
