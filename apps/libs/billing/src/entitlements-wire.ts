import { z } from 'zod';
import { billingTiers } from '#billing-tier.js';
import type { Entitlements } from '#entitlements.js';

/**
 * Wire form of {@link Entitlements} for `GET /v1/billing/entitlements` and the
 * server-side Redis cache. JSON cannot carry `Infinity` (it serialises to
 * `null` silently) or `Date`, so unlimited quotas are `null` on the wire and
 * timestamps are ISO strings; {@link parseEntitlements} restores the runtime
 * shape losslessly.
 * @public
 */
export const wireEntitlementsSchema = z.object({
  tier: z.enum(billingTiers),
  status: z.enum(['active', 'past_due', 'canceled', 'none']),
  aiEnabled: z.boolean(),
  canUseProKernels: z.boolean(),
  canCreatePrivateShares: z.boolean(),
  canSyncFiles: z.boolean(),
  canConnectGitHub: z.boolean(),
  canConnectEnterpriseGit: z.boolean(),
  apiCadGatewayMonthlyLimit: z.number().nullable(),
  conversionApiMonthlyLimit: z.number().nullable(),
  hasPaymentMethod: z.boolean(),
  // Plain JSON (object or null) — `serializeEntitlements`/`parseEntitlements`
  // pass it through unchanged (no `Infinity`/`Date` to normalise).
  paymentMethod: z.object({ brand: z.string(), last4: z.string() }).nullable(),
  canUseHostedGeoSpecValidation: z.boolean(),
  geospecValidationMonthlyLimit: z.number().nullable(),
  geospecConcurrentRuns: z.number(),
  canUseGeoSpecCiApi: z.boolean(),
  canCreateGeoSpecEvidenceReports: z.boolean(),
  geospecEvidenceRetentionDays: z.number(),
  trainingConsent: z.boolean(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
});

/**
 * JSON-safe projection of {@link Entitlements}.
 * @public
 */
export type WireEntitlements = z.infer<typeof wireEntitlementsSchema>;

type WireLimit = WireEntitlements['apiCadGatewayMonthlyLimit'];

const toWireLimit = (value: number): WireLimit => (Number.isFinite(value) ? value : null);

const fromWireLimit = (value: WireLimit): number => value ?? Number.POSITIVE_INFINITY;

/**
 * Converts a runtime {@link Entitlements} object into its JSON-safe wire form.
 *
 * @param entitlements - The runtime projection
 * @returns The wire projection (unlimited quotas as `null`, dates as ISO strings)
 * @public
 */
export const serializeEntitlements = (entitlements: Entitlements): WireEntitlements => {
  return {
    ...entitlements,
    apiCadGatewayMonthlyLimit: toWireLimit(entitlements.apiCadGatewayMonthlyLimit),
    conversionApiMonthlyLimit: toWireLimit(entitlements.conversionApiMonthlyLimit),
    geospecValidationMonthlyLimit: toWireLimit(entitlements.geospecValidationMonthlyLimit),
    currentPeriodEnd: entitlements.currentPeriodEnd?.toISOString() ?? null,
    paymentMethod: entitlements.paymentMethod ?? null,
  };
};

/**
 * Parses an untrusted wire payload back into the runtime {@link Entitlements}
 * shape, restoring `Infinity` quotas and `Date` timestamps. Throws when the
 * payload does not match {@link wireEntitlementsSchema}.
 *
 * @param wire - The untrusted wire payload (API response or cache entry)
 * @returns The runtime entitlements projection
 * @public
 */
export const parseEntitlements = (wire: unknown): Entitlements => {
  const parsed = wireEntitlementsSchema.parse(wire);
  return {
    ...parsed,
    apiCadGatewayMonthlyLimit: fromWireLimit(parsed.apiCadGatewayMonthlyLimit),
    conversionApiMonthlyLimit: fromWireLimit(parsed.conversionApiMonthlyLimit),
    geospecValidationMonthlyLimit: fromWireLimit(parsed.geospecValidationMonthlyLimit),
    currentPeriodEnd: parsed.currentPeriodEnd === null ? undefined : new Date(parsed.currentPeriodEnd),
    paymentMethod: parsed.paymentMethod ?? undefined,
  };
};
