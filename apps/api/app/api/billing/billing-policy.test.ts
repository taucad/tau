import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  assertPolicyFleetCompatibility,
  commercialPolicySchema,
  qualifiedMeterContracts,
  resolvePolicyRoute,
  validateCommercialPolicy,
  validatePolicyActivationNotice,
} from '#api/billing/billing-policy.js';
import type { CommercialPolicy } from '#api/billing/billing-policy.js';
import { runBillingPolicyCommand } from '#api/billing/billing-policy.command.js';
import type { BillingPolicyService } from '#api/billing/billing-policy.service.js';

const launchPolicy = (): CommercialPolicy => ({
  schemaVersion: 1,
  environment: 'staging',
  policyVersion: 'P1',
  markupBps: 3000,
  fleet: { minimumSchemaVersion: 1, meterContractIds: [] },
  rates: [],
  routes: [],
  offers: [
    {
      offerId: 'pro-monthly-v1',
      kind: 'pro_monthly',
      currency: 'usd',
      principalMinor: '2000',
      grantCreditAtoms: '20000000',
      ceilingCreditAtoms: '40000000',
    },
    {
      offerId: 'top-up-v1',
      kind: 'top_up',
      currency: 'usd',
      minimumPrincipalMinor: '500',
      maximumPrincipalMinor: '50000',
      creditAtomsPerPrincipalMinor: '10000',
    },
  ],
  promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
});

describe('commercial policy', () => {
  it('should pass explicit protected-command inputs to publication', async () => {
    const service = mock<BillingPolicyService>();
    service.publishPolicy.mockResolvedValue({ activationId: 'activation-p1', headRevision: 1n, replay: false });
    const result = await runBillingPolicyCommand(
      service,
      [
        'publish',
        '--file',
        '/policy.json',
        '--environment',
        'staging',
        '--activation-id',
        'activation-p1',
        '--job-key',
        'job-p1',
        '--expected-head-revision',
        '0',
        '--expected-predecessor-activation-id',
        'none',
        '--announced-at',
        'now',
        '--effective-at',
        'now',
      ],
      async () => JSON.stringify(launchPolicy()),
    );

    expect(result).toEqual({ activationId: 'activation-p1', headRevision: 1n, replay: false });
    expect(service.publishPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'staging', activationId: 'activation-p1', expectedHeadRevision: 0n }),
    );
  });

  it('should canonicalize validated launch policy into a stable immutable hash', () => {
    const policy = launchPolicy();
    const reordered = JSON.stringify({
      promotionalIssuance: policy.promotionalIssuance,
      offers: policy.offers,
      routes: policy.routes,
      rates: policy.rates,
      fleet: policy.fleet,
      markupBps: policy.markupBps,
      policyVersion: policy.policyVersion,
      environment: policy.environment,
      schemaVersion: policy.schemaVersion,
    });

    expect(validateCommercialPolicy(reordered)).toEqual(validateCommercialPolicy(policy));
  });

  it('should reject open, malformed, or unqualified commercial data', () => {
    const launch = launchPolicy();
    expect(() => validateCommercialPolicy({ ...launch, markupBps: 10_001 })).toThrow();
    expect(() => validateCommercialPolicy({ ...launch, extra: true })).toThrow();
    expect(() =>
      validateCommercialPolicy({
        ...launch,
        promotionalIssuance: { enabled: true, budgetCreditAtoms: '0', offer: null },
      }),
    ).toThrow('promotion requires');
    expect(() =>
      validateCommercialPolicy({
        ...launch,
        promotionalIssuance: {
          enabled: true,
          budgetCreditAtoms: '1',
          offer: {
            promotionProgramId: 'future',
            eligibility: 'all_accounts',
            period: 'month',
            grantCreditAtoms: '1',
            accountCeilingCreditAtoms: '1',
            budgetId: 'budget',
          },
        },
      }),
    ).toThrow();
    expect(() =>
      validateCommercialPolicy({
        ...launch,
        promotionalIssuance: { enabled: false, budgetCreditAtoms: '1', offer: null },
      }),
    ).toThrow('promotion requires');
    expect(() =>
      validateCommercialPolicy({
        ...launch,
        promotionalIssuance: {
          enabled: false,
          budgetCreditAtoms: '0',
          offer: {
            promotionProgramId: 'future',
            eligibility: 'verified_account',
            period: 'month',
            grantCreditAtoms: '1',
            accountCeilingCreditAtoms: '1',
            budgetId: 'budget',
          },
        },
      }),
    ).toThrow('promotion requires');
    expect(() =>
      validateCommercialPolicy({
        ...launch,
        fleet: { minimumSchemaVersion: 1, meterContractIds: ['unqualified-v1'] },
        rates: [
          {
            rateId: 'input',
            meterContractId: 'unqualified-v1',
            dimension: 'uncached_input',
            tier: null,
            unit: 'token',
            referenceNumeratorPicoUsd: '1',
            denominatorUnits: '1',
            retailOverride: null,
          },
        ],
        routes: [
          {
            routeId: 'provider:model',
            sku: 'model',
            meterContractId: 'unqualified-v1',
            rateIds: ['input'],
            enabled: true,
            spendBudgetId: 'spend-budget-1',
            riskBudgetId: 'risk-budget-1',
          },
        ],
      }),
    ).toThrow('is not qualified');
  });

  it('should return validation failures for malformed nested numeric data without throwing', () => {
    const launch = launchPolicy();
    const malformed = [
      { ...launch, offers: [{ ...launch.offers[0]!, grantCreditAtoms: 'oops' }, launch.offers[1]!] },
      { ...launch, offers: [launch.offers[0]!, { ...launch.offers[1]!, maximumPrincipalMinor: '9'.repeat(20) }] },
      { ...launch, markupBps: Number.NaN },
      {
        ...launch,
        rates: [
          {
            rateId: 'too-large',
            meterContractId: 'meter-v1',
            dimension: 'output',
            tier: null,
            unit: 'token',
            referenceNumeratorPicoUsd: '9'.repeat(79),
            denominatorUnits: '1',
            retailOverride: null,
          },
        ],
      },
    ];

    for (const candidate of malformed) {
      expect(commercialPolicySchema.safeParse(candidate).success).toBe(false);
    }
  });

  it('should require distinct spend and risk budgets on a qualified route', () => {
    const meterContractId = 'policy-distinct-budget-meter-v1';
    qualifiedMeterContracts.set(meterContractId, new Set(['output:']));
    const policy = {
      ...launchPolicy(),
      fleet: { minimumSchemaVersion: 1, meterContractIds: [meterContractId] },
      rates: [
        {
          rateId: 'output-rate',
          meterContractId,
          dimension: 'output',
          tier: null,
          unit: 'token',
          referenceNumeratorPicoUsd: '1',
          denominatorUnits: '1',
          retailOverride: null,
        },
      ],
      routes: [
        {
          routeId: 'provider:model',
          sku: 'model',
          meterContractId,
          rateIds: ['output-rate'],
          enabled: true,
          spendBudgetId: 'shared-budget',
          riskBudgetId: 'shared-budget',
        },
      ],
    };

    expect(commercialPolicySchema.safeParse(policy).success).toBe(false);
    expect(
      commercialPolicySchema.safeParse({
        ...policy,
        routes: [{ ...policy.routes[0]!, riskBudgetId: 'risk-budget' }],
      }).success,
    ).toBe(true);
  });

  it('should allow a promotion ceiling or budget below its nominal grant', () => {
    const launch = launchPolicy();
    for (const accountCeilingCreditAtoms of ['50', '0']) {
      expect(
        commercialPolicySchema.safeParse({
          ...launch,
          promotionalIssuance: {
            enabled: true,
            budgetCreditAtoms: '50',
            offer: {
              promotionProgramId: 'future',
              eligibility: 'verified_account',
              period: 'month',
              grantCreditAtoms: '100',
              accountCeilingCreditAtoms,
              budgetId: 'promotion-budget',
            },
          },
        }).success,
      ).toBe(true);
    }
  });

  it('should require 30 days notice for every rate increase and allow an immediate decrease', () => {
    const previous: CommercialPolicy = {
      ...launchPolicy(),
      rates: [
        {
          rateId: 'rate-p1',
          meterContractId: 'meter-v1',
          dimension: 'output',
          tier: null,
          unit: 'token',
          referenceNumeratorPicoUsd: '2',
          denominatorUnits: '3',
          retailOverride: null,
        },
      ],
      routes: [
        {
          routeId: 'route-v1',
          sku: 'sku-v1',
          meterContractId: 'meter-v1',
          rateIds: ['rate-p1'],
          enabled: true,
          spendBudgetId: 'spend-budget-v1',
          riskBudgetId: 'risk-budget-v1',
        },
      ],
    };
    const announcedAt = new Date('2026-09-05T00:00:00.000Z');
    const increase: CommercialPolicy = {
      ...previous,
      policyVersion: 'P2',
      rates: [{ ...previous.rates[0]!, rateId: 'rate-p2', referenceNumeratorPicoUsd: '3' }],
      routes: [{ ...previous.routes[0]!, rateIds: ['rate-p2'] }],
    };
    const decrease: CommercialPolicy = {
      ...increase,
      policyVersion: 'P3',
      rates: [{ ...increase.rates[0]!, rateId: 'rate-p3', referenceNumeratorPicoUsd: '1' }],
      routes: [{ ...increase.routes[0]!, rateIds: ['rate-p3'] }],
    };

    expect(() => {
      validatePolicyActivationNotice({ previous, next: increase, announcedAt, effectiveAt: announcedAt });
    }).toThrow('30 days');
    expect(() => {
      validatePolicyActivationNotice({
        previous,
        next: increase,
        announcedAt,
        effectiveAt: new Date('2026-10-05T00:00:00.000Z'),
      });
    }).not.toThrow();
    expect(() => {
      validatePolicyActivationNotice({ previous: increase, next: decrease, announcedAt, effectiveAt: announcedAt });
    }).not.toThrow();
  });

  it('should judge a tier split and every sku rename against the parent sku a customer already paid', () => {
    const announcedAt = new Date('2026-09-05T00:00:00.000Z');
    const rate = (
      rateId: string,
      referenceNumeratorPicoUsd: string,
      meterContractId = 'meter-v1',
    ): CommercialPolicy['rates'][number] => ({
      rateId,
      meterContractId,
      dimension: 'output',
      tier: null,
      unit: 'token',
      referenceNumeratorPicoUsd,
      denominatorUnits: '3',
      retailOverride: null,
    });
    const route = (routeId: string, sku: string, rateIds: string[]): CommercialPolicy['routes'][number] => ({
      routeId,
      sku,
      meterContractId: 'meter-v1',
      rateIds,
      enabled: true,
      spendBudgetId: 'spend-budget-v1',
      riskBudgetId: 'risk-budget-v1',
    });
    // The premium tariff every call was held and charged at before the split.
    const previous: CommercialPolicy = {
      ...launchPolicy(),
      rates: [rate('rate-p1', '9')],
      routes: [route('route-v1', 'sku-v1', ['rate-p1'])],
    };
    // W1's split: the base sku drops to a third, and the premium sibling carries exactly the old rate.
    const split: CommercialPolicy = {
      ...previous,
      policyVersion: 'P2',
      rates: [rate('rate-base', '3'), rate('rate-long-context', '9')],
      routes: [
        route('route-v1', 'sku-v1', ['rate-base']),
        route('route-v1-long-context', 'sku-v1:long-context', ['rate-long-context']),
      ],
    };
    // Re-pointing the route id at a dearer sibling is the same repricing by another name.
    const repointed: CommercialPolicy = {
      ...previous,
      policyVersion: 'P2',
      rates: [rate('rate-p1', '9'), rate('rate-v2', '27')],
      routes: [route('route-v1', 'sku-v1', ['rate-p1']), route('route-v1-v2', 'sku-v1:v2', ['rate-v2'])],
    };
    // So is bumping the meter contract id, which used to make every term of every route new at once.
    const remetered: CommercialPolicy = {
      ...previous,
      policyVersion: 'P2',
      rates: [rate('rate-p2', '27', 'meter-v2')],
      routes: [{ ...route('route-v1', 'sku-v1', ['rate-p2']), meterContractId: 'meter-v2' }],
    };

    expect(() => {
      validatePolicyActivationNotice({ previous, next: split, announcedAt, effectiveAt: announcedAt });
    }).not.toThrow();
    expect(() => {
      validatePolicyActivationNotice({ previous, next: repointed, announcedAt, effectiveAt: announcedAt });
    }).toThrow('30 days');
    expect(() => {
      validatePolicyActivationNotice({ previous, next: remetered, announcedAt, effectiveAt: announcedAt });
    }).toThrow('30 days');
  });

  it('should apply default or SKU markup once without changing an old policy pin', () => {
    const base = launchPolicy();
    const p1: CommercialPolicy = {
      ...base,
      rates: [
        {
          rateId: 'reference-v1',
          meterContractId: 'meter-v1',
          dimension: 'output',
          tier: null,
          unit: 'token',
          referenceNumeratorPicoUsd: '1000000000000',
          denominatorUnits: '1',
          retailOverride: null,
        },
      ],
      routes: [
        {
          routeId: 'route-v1',
          sku: 'sku-v1',
          meterContractId: 'meter-v1',
          rateIds: ['reference-v1'],
          enabled: true,
          spendBudgetId: 'spend-budget-v1',
          riskBudgetId: 'risk-budget-v1',
        },
      ],
    };
    const pinnedP1 = resolvePolicyRoute(p1, 'sku-v1')?.rates[0];
    const p2: CommercialPolicy = { ...p1, policyVersion: 'P2', markupBps: 4000 };
    const p2Rate = resolvePolicyRoute(p2, 'sku-v1')?.rates[0];
    const overridden: CommercialPolicy = {
      ...p2,
      routes: [{ ...p2.routes[0]!, markupBps: 1000 }],
    };

    expect(pinnedP1?.numeratorCreditAtoms).toBe('13000000000000000000000');
    expect(p2Rate?.numeratorCreditAtoms).toBe('14000000000000000000000');
    expect(resolvePolicyRoute(overridden, 'sku-v1')?.rates[0]?.numeratorCreditAtoms).toBe('11000000000000000000000');
    expect(pinnedP1?.numeratorCreditAtoms).toBe('13000000000000000000000');
  });

  it('should reject incompatible replicas before dispatch', () => {
    const policy = {
      ...launchPolicy(),
      routes: [
        {
          routeId: 'route',
          sku: 'sku',
          meterContractId: 'meter-v2',
          rateIds: ['rate'],
          enabled: true,
          spendBudgetId: 'spend-budget',
          riskBudgetId: 'risk-budget',
        },
      ],
    };

    expect(() => {
      assertPolicyFleetCompatibility(policy, 1, ['meter-v1']);
    }).toThrow('meter contract');
  });
});
