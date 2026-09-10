#!/usr/bin/env node
/**
 * Regenerate the development tariff's fleet, rates and routes from the code-owned
 * billable model route table, leaving its offers, promotion and markup untouched.
 * `policyVersion` is preserved; bump it by hand before republishing a regenerated tariff.
 * Required env: none. Never reads API dotenv files or the database.
 * Usage: pnpm nx run api:generate:billing-policy:development
 * Exit codes: 0 written, 1 the generated policy failed commercial validation.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  billableModelRouteMeters,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';
import { validateCommercialPolicy } from '#api/billing/billing-policy.js';

/** The checked-in development tariff this generator owns. */
export const developmentPolicyPath = resolve(
  import.meta.dirname,
  '../../../infra/billing/development.billing-policy.json',
);

/* Both budgets are seeded by `development-billing-account.ts budgets`, which the
 * `api:billing-policy:publish:development` bootstrap runs before publishing. */
const spendBudgetId = 'development-spend';
const riskBudgetId = 'development-risk';
/* Supplier tariffs in the route table are quoted per million tokens. */
const denominatorUnits = '1000000';
// Identities are restricted to `[A-Za-z0-9._:-]`, so meter dimensions lose their underscore.
// oxlint-disable-next-line typescript/no-restricted-types -- financial meter tiers use explicit null
const rateId = (routeId: string, dimension: string, tier: string | null): string =>
  `${routeId}:${dimension.replaceAll('_', '-')}:${tier ?? 'none'}`;

/**
 * Projects the route table onto an existing development policy document.
 *
 * Retail is left to `markupBps`: `retailOverride: null` makes the ledger derive
 * `reference * 1e6 * (10000 + markupBps) / (denominator * 1e12 * 10000)` credit
 * atoms per token, so one markup change reprices every route.
 */
export const generateDevelopmentBillingPolicy = (current: string): string => {
  registerBillableModelMeterContracts();
  const { policy } = validateCommercialPolicy(current);
  const generated = {
    ...policy,
    fleet: { ...policy.fleet, meterContractIds: billableModelRouteMeters.map((route) => route.meterContractId) },
    rates: billableModelRouteMeters.flatMap((route) =>
      route.rates.map((rate) => ({
        rateId: rateId(route.routeId, rate.dimension, rate.tier),
        meterContractId: route.meterContractId,
        dimension: rate.dimension,
        tier: rate.tier,
        unit: 'token',
        referenceNumeratorPicoUsd: rate.numeratorPicoUsd.toString(),
        denominatorUnits,
        retailOverride: null,
      })),
    ),
    routes: billableModelRouteMeters.map((route) => ({
      routeId: route.routeId,
      sku: `model:${route.routeId}`,
      meterContractId: route.meterContractId,
      rateIds: route.rates.map((rate) => rateId(route.routeId, rate.dimension, rate.tier)),
      enabled: true,
      spendBudgetId,
      riskBudgetId,
    })),
  };
  return `${JSON.stringify(validateCommercialPolicy(generated).policy, undefined, 2)}\n`;
};

if (import.meta.filename === process.argv[1]) {
  const generated = generateDevelopmentBillingPolicy(await readFile(developmentPolicyPath, 'utf8'));
  await writeFile(developmentPolicyPath, generated);
  console.log(`Wrote ${developmentPolicyPath}`);
}
