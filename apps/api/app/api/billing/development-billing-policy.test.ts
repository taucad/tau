/* eslint-disable @typescript-eslint/naming-convention -- provider wire keys use native snake_case. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
/* oxlint-disable no-restricted-imports -- the generator owns the checked-in file and lives outside the `#` app aliases. */
import {
  developmentPolicyPath,
  generateDevelopmentBillingPolicy,
} from '../../../scripts/generate-development-billing-policy.mjs';
/* oxlint-enable no-restricted-imports */
import { qualifiedMeterContracts, resolvePolicyRoute, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import {
  billableModelRouteIds,
  CodeOwnedBillableModelQualificationResolver,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';
import { maximumMeterCharge } from '#api/billing/billable-model-bound.js';
import type { BillableModelProviderAdapter } from '#api/billing/billable-model-invocation.types.js';

describe('development billing policy', () => {
  const checkedIn = readFileSync(developmentPolicyPath, 'utf8');

  it('matches its generator', () => {
    // Structural, not byte, equality: lint-staged runs oxfmt over the checked-in JSON.
    expect(JSON.parse(checkedIn)).toEqual(JSON.parse(generateDevelopmentBillingPolicy(checkedIn)));
  });

  it('funds every qualified catalog route against the registered meter contracts', () => {
    registerBillableModelMeterContracts();
    const { policy } = validateCommercialPolicy(checkedIn);
    const routes = new Map(policy.routes.map((route) => [route.sku, route]));
    const rates = new Map(policy.rates.map((rate) => [rate.rateId, rate]));
    for (const routeId of billableModelRouteIds) {
      const route = routes.get(`model:${routeId}`);
      expect(route, routeId).toBeDefined();
      expect(route?.enabled).toBe(true);
      expect(route?.meterContractId).toBe(`model-meter-v1:${routeId}`);
      expect(route?.spendBudgetId).toBe('development-spend');
      expect(route?.riskBudgetId).toBe('development-risk');
      const covered = route?.rateIds.map((rateId) => {
        const rate = rates.get(rateId);
        return `${rate?.dimension}:${rate?.tier ?? ''}`;
      });
      expect(new Set(covered), routeId).toStrictEqual(qualifiedMeterContracts.get(`model-meter-v1:${routeId}`));
    }
  });
});

/* The authorized customer hold is not the supplier tariff: the ledger recomputes it
 * from the effective policy rates of the pinned meter contract
 * (`credit-ledger.service.ts:645`). This mirrors that arithmetic against the
 * checked-in development tariff so the reserve promise is asserted end to end. */
const resolver = new CodeOwnedBillableModelQualificationResolver({
  adapters: new Map(billableModelRouteIds.map((routeId) => [routeId, mock<BillableModelProviderAdapter>()])),
  credentialAccounts: new Map(
    ['anthropic', 'openai', 'vertexai', 'together', 'morph', 'xai'].map((provider) => [
      provider,
      `${provider}-primary`,
    ]),
  ),
  executionTimeout: 30_000,
});

const authorizedAtoms = (body: Record<string, unknown>): { sku: string; atoms: bigint; input: bigint } => {
  const qualification = resolver.resolve({
    environment: 'development',
    surface: 'gateway',
    attempt: { version: 1, key: 'attempt-1' },
    providerWire: 'openai-responses',
    body,
    priceHeaders: {},
    activity: 'agent',
  });
  const { policy } = validateCommercialPolicy(readFileSync(developmentPolicyPath, 'utf8'));
  const resolved = resolvePolicyRoute(policy, qualification.sku);
  expect(resolved, qualification.sku).toBeDefined();
  const quantities = new Map(
    qualification.maximumQuantities.map((item) => [`${item.dimension}:${item.tier ?? ''}`, item.quantity]),
  );
  return {
    sku: qualification.sku,
    input: quantities.get('uncached_input:')!,
    atoms: maximumMeterCharge(
      resolved!.rates.map((rate) => ({
        dimension: rate.dimension,
        quantity: quantities.get(`${rate.dimension}:${rate.tier ?? ''}`)!,
        numerator: BigInt(rate.numeratorCreditAtoms),
        denominator: BigInt(rate.publicDenominatorUnits),
      })),
      qualification.invocation.jointInputMaximum,
    ),
  };
};

describe('development reserve promise', () => {
  it('holds a 120 KB Astra turn at the base tariff for the bytes it can prove', () => {
    registerBillableModelMeterContracts();
    const held = authorizedAtoms({
      model: 'openai-gpt-6-astra',
      input: [{ role: 'user', content: 'x'.repeat(120_000) }],
      max_output_tokens: 16_384,
      stream: true,
    });

    /* 120,109 serialized bytes + 64 per conversation element + 4,096 per route. */
    expect(held.input).toBe(124_269n);
    expect(held.sku).toBe('model:openai-gpt-6-astra');
    /* 124,269 x 16.25 + 16,384 x 65 atoms, ceiled once. The same turn held
     * 42,445,000 atoms under the whole-context reserve. */
    expect(held.atoms).toBe(3_084_332n);
    expect(held.atoms).toBeLessThanOrEqual(3_100_000n);
  });

  it('holds a request whose bound reaches the threshold at the long-context tariff', () => {
    registerBillableModelMeterContracts();
    const held = authorizedAtoms({
      model: 'openai-gpt-6-astra',
      input: [{ role: 'user', content: 'x'.repeat(300_000) }],
      max_output_tokens: 16_384,
      stream: true,
    });

    expect(held.sku).toBe('model:openai-gpt-6-astra:long-context');
    /* 304,269 x 32.5 + 16,384 x 97.5, the premium tariff the bound cannot rule out. */
    expect(held.atoms).toBe(11_486_183n);
  });

  it('funds a long-context meter contract for every tiered route', () => {
    registerBillableModelMeterContracts();
    const { policy } = validateCommercialPolicy(readFileSync(developmentPolicyPath, 'utf8'));
    const tiered = policy.routes.filter((route) => route.routeId.endsWith(':long-context'));
    expect(tiered.map((route) => route.routeId)).toEqual([
      'openai-gpt-6-astra:long-context',
      'openai-gpt-5.6-sol:long-context',
      'openai-gpt-5.6-terra:long-context',
      'openai-gpt-5.6-luna:long-context',
      'openai-gpt-5.5:long-context',
      'google-gemini-3.1-pro:long-context',
      'xai-grok-4.6:long-context',
    ]);
    for (const route of tiered) {
      expect(route.enabled).toBe(true);
      expect(qualifiedMeterContracts.get(route.meterContractId), route.routeId).toBeDefined();
      const base = resolvePolicyRoute(policy, `model:${route.routeId.replace(':long-context', '')}`);
      const premium = resolvePolicyRoute(policy, `model:${route.routeId}`);
      expect(base, route.routeId).toBeDefined();
      /* The premium schedule is never cheaper than the schedule it replaces. */
      for (const rate of premium!.rates) {
        const counterpart = base!.rates.find(
          (candidate) => candidate.dimension === rate.dimension && candidate.tier === rate.tier,
        );
        expect(counterpart, `${route.routeId}:${rate.dimension}`).toBeDefined();
        expect(BigInt(rate.numeratorCreditAtoms) * BigInt(counterpart!.publicDenominatorUnits)).toBeGreaterThanOrEqual(
          BigInt(counterpart!.numeratorCreditAtoms) * BigInt(rate.publicDenominatorUnits),
        );
      }
    }
  });
});
