import { describe, expect, it, vi } from 'vitest';
import { validateCommercialPolicy } from '#billing-policy.js';
import type { CommercialPolicy } from '#billing-policy.js';
import { BillingPolicyMissingError, BillingPolicyService } from '#billing-policy.service.js';
import type { DatabaseService } from '@taucad/api-database';

const policy = (): CommercialPolicy => ({
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
      maximumPrincipalMinor: '500000',
      creditAtomsPerPrincipalMinor: '10000',
    },
  ],
  promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
});

/* Chat performance WP-05 and WP-14: one statement on the pool, the document only when it is not already validated. */
describe('BillingPolicyService.selectEffectivePolicy', () => {
  const validated = validateCommercialPolicy(policy());
  const selectedAt = '2026-11-26T20:00:00.000Z';
  // oxlint-disable-next-line typescript/no-restricted-types -- the column is null when the memo answers
  const row = (canonicalContent: string | null) => ({
    observedActivationId: 'activation-p1',
    policyId: 'policy-p1',
    activationId: 'activation-p1',
    requestHash: 'request-hash',
    contentHash: validated.contentHash,
    canonicalContent,
    selectedAt,
  });
  const input = { environment: 'staging', replica: { schemaVersion: 1, meterContractIds: [] } } as const;
  const serviceWith = (execute: ReturnType<typeof vi.fn>) =>
    new BillingPolicyService({ database: { execute, transaction: vi.fn() } } as unknown as Pick<
      DatabaseService,
      'database'
    >);

  it('should read the activation and its document from the one statement, without a transaction', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([row(validated.canonicalContent)])
      .mockResolvedValueOnce([row(null)]);
    const service = serviceWith(execute);

    const first = await service.selectEffectivePolicy(input);
    const second = await service.selectEffectivePolicy(input);

    expect(first).toEqual({
      policyId: 'policy-p1',
      activationId: 'activation-p1',
      policy: validated.policy,
      contentHash: validated.contentHash,
      selectedAt: new Date(selectedAt),
    });
    // The second read is sent no document: the memo of the validated content answers it.
    expect(second).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('should refuse when no activation is effective', async () => {
    const service = serviceWith(vi.fn().mockResolvedValueOnce([{ observedActivationId: null, activationId: null }]));

    await expect(service.selectEffectivePolicy(input)).rejects.toBeInstanceOf(BillingPolicyMissingError);
  });
});
