import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
/* oxlint-disable no-restricted-imports -- the generator owns the checked-in file and lives outside the `#` app aliases. */
import {
  developmentPolicyPath,
  generateDevelopmentBillingPolicy,
} from '../../../scripts/generate-development-billing-policy.mjs';
/* oxlint-enable no-restricted-imports */
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import {
  billableModelRouteIds,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';

describe('development billing policy', () => {
  const checkedIn = readFileSync(developmentPolicyPath, 'utf8');

  it('matches its generator', () => {
    expect(checkedIn).toBe(generateDevelopmentBillingPolicy(checkedIn));
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
