import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CreditLedgerService, isBillingAdmissionInvalid, recordSettledGenAiUsage } from '#credit-ledger.service.js';
import { supplierIdentityForRoute } from '#billable-model-qualification.js';
import type { QualifiedAdmissionInput } from '#credit-ledger.types.js';
import type { BillingPolicyService } from '#billing-policy.service.js';
import type { DatabaseService } from '@taucad/api-database';
import type { MetricsService } from '@taucad/api-observability/metrics';

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

describe('CreditLedgerService.recordFundedWorkDenial', () => {
  /** A ledger whose owner lookup finds no binding: the denial stops there, after its input checks. */
  const unboundLedger = () => {
    const select = vi.fn(() => ({ from: () => ({ where: async () => [] }) }));
    const ledger = new CreditLedgerService(
      { database: { select } } as unknown as Pick<DatabaseService, 'database'>,
      {} as BillingPolicyService,
    );
    return { ledger, select };
  };
  const denial = (requestDigest: string): Parameters<CreditLedgerService['recordFundedWorkDenial']>[0] => ({
    environment: 'development',
    authUserId: 'user',
    attemptKey: 'attempt_0000000001',
    requestDigest,
  });

  it('should accept the hmac-sha256 request digest a funded invocation sends', async () => {
    const { ledger, select } = unboundLedger();

    await expect(ledger.recordFundedWorkDenial(denial(`hmac-sha256:${'a'.repeat(64)}`))).resolves.toBeUndefined();

    expect(select).toHaveBeenCalledOnce();
  });

  it.each([
    ['a bare hex digest', 'a'.repeat(64)],
    ['an upper-case digest', `hmac-sha256:${'A'.repeat(64)}`],
    ['a short digest', `hmac-sha256:${'a'.repeat(63)}`],
    ['another algorithm', `sha256:${'a'.repeat(64)}`],
  ])('should refuse %s before reading the database', async (_name, requestDigest) => {
    const { ledger, select } = unboundLedger();

    await expect(ledger.recordFundedWorkDenial(denial(requestDigest))).rejects.toThrow('Invalid funded request digest');

    expect(select).not.toHaveBeenCalled();
  });
});

describe('CreditLedgerService.admitOperation', () => {
  /** A ledger whose first database read is the account binding; reaching it means every input check passed. */
  const ledgerReachingDatabase = () => {
    const transaction = vi.fn(async () => {
      throw new Error('database reached');
    });
    const ledger = new CreditLedgerService(
      { database: { transaction } } as unknown as Pick<DatabaseService, 'database'>,
      {} as BillingPolicyService,
    );
    return { ledger, transaction };
  };
  /* The catalog fact a funded Together route bills against: its supplier id carries an organization prefix. */
  const together = supplierIdentityForRoute('together-kimi-k3.1-pro');
  const admission = (overrides: Partial<QualifiedAdmissionInput> = {}): QualifiedAdmissionInput => ({
    environment: 'development',
    authUserId: 'user',
    surface: 'gateway',
    attemptKey: 'attempt_0000000001',
    requestDigest: `hmac-sha256:${'a'.repeat(64)}`,
    requestKeyVersion: 1,
    category: 'llm',
    modelId: together.modelId,
    modelDisplayName: 'Kimi K3.1 Pro',
    providerId: together.providerId,
    activity: 'agent',
    sku: 'model:together-kimi-k3.1-pro',
    maximumQuantities: [{ dimension: 'uncached_input', tier: null, quantity: 1n }],
    replica: { schemaVersion: 1, meterContractIds: ['model-meter-v1:together-kimi-k3.1-pro'] },
    executionDeadline: new Date(Date.now() + 30_000),
    ...overrides,
  });

  it('should admit a Together supplier model id past validation to the account binding', async () => {
    const { ledger, transaction } = ledgerReachingDatabase();

    expect(together).toEqual({ modelId: 'moonshotai/Kimi-K3.1-Pro', providerId: 'together' });
    await expect(ledger.admitOperation(admission())).rejects.toThrow('database reached');

    expect(transaction).toHaveBeenCalledOnce();
  });

  it.each([
    ['a model id with whitespace', { modelId: 'moonshotai/Kimi K3' }],
    ['a model id with an empty segment', { modelId: 'moonshotai//Kimi' }],
    ['a provider id with a slash', { providerId: 'together/ai' }],
    ['a project hint outside the identity class', { projectHint: 'project hint' }],
  ])('should refuse %s as a typed bad request before reading the database', async (_name, overrides) => {
    const { ledger, transaction } = ledgerReachingDatabase();

    const refusal = await ledger.admitOperation(admission(overrides)).then(
      () => expect.fail('admission should refuse'),
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(BadRequestException);
    expect(isBillingAdmissionInvalid(refusal)).toBe(true);
    expect((refusal as BadRequestException).getResponse()).toMatchObject({ code: 'billing_admission_invalid' });
    expect(transaction).not.toHaveBeenCalled();
  });
});
