import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { financialIdentitySchema } from '@taucad/billing';
import {
  billableModelRouteMeters,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';
import {
  commercialPolicySchema,
  validateCommercialPolicy,
  validatePolicyActivationNotice,
} from '#api/billing/billing-policy.js';
import type { CommercialPolicy, FinancialEnvironment, ValidatedCommercialPolicy } from '#api/billing/billing-policy.js';
import { seedDevelopmentBudgets } from '#api/billing/development-budgets.js';
import type { BillingPolicyService, PolicyReplica } from '#api/billing/billing-policy.service.js';
import type { DatabaseType } from '#database/database.service.js';

/* The overlay reuses the document's own sub-schemas so a change to an offer or the promotion
 * cannot drift between the two files; only the four keys the overlay adds are written here. */
const policyShape = commercialPolicySchema.shape;

export const commercialOverlaySchema = z
  .object({
    schemaVersion: policyShape.schemaVersion,
    environment: policyShape.environment,
    /** `policyVersion` is `${series}-${hash12}`, so the series names the tariff line, not the revision. */
    series: financialIdentitySchema,
    markupBps: policyShape.markupBps,
    budgets: z.object({ spendBudgetId: financialIdentitySchema, riskBudgetId: financialIdentitySchema }).strict(),
    offers: policyShape.offers,
    promotionalIssuance: policyShape.promotionalIssuance,
    // A checked-in overlay states "no automatic reload" as an explicit null; the document omits the key.
    autoReload: policyShape.autoReload.unwrap().nullable().optional(),
  })
  .strict();

export type CommercialOverlay = z.infer<typeof commercialOverlaySchema>;

/** Parses an overlay from a file or environment channel and pins it to the command's environment. */
export const parseCommercialOverlay = (input: unknown, environment: FinancialEnvironment): CommercialOverlay => {
  const overlay = commercialOverlaySchema.parse(typeof input === 'string' ? (JSON.parse(input) as unknown) : input);
  if (overlay.environment !== environment) {
    throw new Error(`commercial overlay environment ${overlay.environment} does not match command ${environment}`);
  }
  return overlay;
};

type RouteMeter = (typeof billableModelRouteMeters)[number];

/* Supplier tariffs in the route table are quoted per million tokens. */
const denominatorUnits = '1000000';
// Identities are restricted to `[A-Za-z0-9._:-]`, so meter dimensions lose their underscore.
// oxlint-disable-next-line typescript/no-restricted-types -- financial meter tiers use explicit null
const rateId = (routeId: string, dimension: string, tier: string | null): string =>
  `${routeId}:${dimension.replaceAll('_', '-')}:${tier ?? 'none'}`;

/* Deterministic key order so identical content always derives the identical version. It mirrors
 * `canonicalize` inside billing-policy.ts, which is private to the hash the database stores.
 * ponytail: five lines beat exporting a second canonicaliser; the two can only disagree about
 * key order, and the document this hashes is composed here from plain data with no undefined. */
const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, child: unknown) =>
    typeof child === 'object' && child !== null && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
      : child,
  );

/**
 * Composes the full tariff from the code-owned route table over the operator-owned overlay.
 *
 * Retail is left to `markupBps`: `retailOverride: null` makes the ledger derive
 * `reference * 1e6 * (10000 + markupBps) / (denominator * 1e12 * 10000)` credit atoms per token,
 * so one markup change reprices every route. `policyVersion` is derived from the content, so the
 * same catalogue and overlay always yield the same version, hash and publication.
 */
export const composeTariff = (input: {
  overlay: CommercialOverlay;
  routes?: readonly RouteMeter[];
}): ValidatedCommercialPolicy => {
  registerBillableModelMeterContracts();
  const { overlay } = input;
  const routes = input.routes ?? billableModelRouteMeters;
  const document = {
    schemaVersion: 1,
    environment: overlay.environment,
    markupBps: overlay.markupBps,
    fleet: { minimumSchemaVersion: 1, meterContractIds: routes.map((route) => route.meterContractId) },
    rates: routes.flatMap((route) =>
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
    routes: routes.map((route) => ({
      routeId: route.routeId,
      sku: `model:${route.routeId}`,
      meterContractId: route.meterContractId,
      rateIds: route.rates.map((rate) => rateId(route.routeId, rate.dimension, rate.tier)),
      enabled: true,
      spendBudgetId: overlay.budgets.spendBudgetId,
      riskBudgetId: overlay.budgets.riskBudgetId,
    })),
    offers: overlay.offers,
    promotionalIssuance: overlay.promotionalIssuance,
    ...(overlay.autoReload === undefined || overlay.autoReload === null ? {} : { autoReload: overlay.autoReload }),
  };
  const policyVersion = `${overlay.series}-${createHash('sha256').update(canonicalJson(document)).digest('hex').slice(0, 12)}`;
  // The publisher's build must know every route it enables, so this is the full check, qualification included.
  return validateCommercialPolicy({ ...document, policyVersion });
};

type SyncDatabase = Pick<DatabaseType, 'execute' | 'insert'>;

export type PolicySyncResult =
  | { status: 'unchanged'; activationId: string; contentHash: string }
  | { status: 'published'; activationId: string; headRevision: bigint; contentHash: string; effectiveAt: Date };

export type SyncPolicyInput = {
  environment: FinancialEnvironment;
  overlay: CommercialOverlay;
  replica: PolicyReplica;
  /** The code-owned route table to project; defaults to this build's whole catalogue. */
  routes?: readonly RouteMeter[];
};

const headRowSchema = z.object({
  revision: z.coerce.bigint(),
  currentActivationId: z.string().nullable(),
  pendingActivationId: z.string().nullable(),
});

const noticeMessage = 'retail rate increase requires 30 days notice';
const noticeMilliseconds = 30 * 24 * 60 * 60 * 1000 + 60_000;
/* Both losable races. The second only happens on a scheduled rise: the two racers derive the same
 * activation id from the content and the head, but each computes `effectiveAt` from its own reading
 * of the database clock, so their request hashes differ and the loser is refused as a job-key
 * conflict rather than a lost compare-and-swap. Its retry finds the winner's pending activation
 * carrying the same content and reports `unchanged`. */
const retryableMessages = new Set([
  'policy publication head compare-and-swap failed',
  'policy publication job key conflicts with prior payload',
]);

const readDatabaseNow = async (database: SyncDatabase): Promise<Date> => {
  const rows = await database.execute(sql`select transaction_timestamp() as "now"`);
  return z.object({ now: z.coerce.date() }).parse(rows[0]).now;
};

/* Lock-free: the head this reads is only a proposal. `publishPolicy` locks the head and repeats the
 * compare-and-swap, so a concurrent sync loses there and retries rather than being serialised here. */
const readHead = async (
  database: SyncDatabase,
  environment: FinancialEnvironment,
): Promise<z.infer<typeof headRowSchema>> => {
  const rows = await database.execute(sql`
    select revision, current_activation_id as "currentActivationId", pending_activation_id as "pendingActivationId"
    from billing.billing_policy_head
    where environment = ${environment}
  `);
  return rows[0] === undefined
    ? { revision: 0n, currentActivationId: null, pendingActivationId: null }
    : headRowSchema.parse(rows[0]);
};

/* `billing_policy_head.pending_activation_id` is cleared only by a cancellation or the next
 * publication, so it keeps naming a scheduled activation after that activation matures. Only a
 * still-future one is pending: cancelling a matured activation is refused by the database, which
 * would wedge every later `sync` (and so the release job) until an operator published by hand.
 * `publishPolicy` filters its own pending probe the same way. */
const readUncancelledPendingHash = async (
  database: SyncDatabase,
  environment: FinancialEnvironment,
  pendingActivationId: string,
): Promise<string | undefined> => {
  const rows = await database.execute(sql`
    select policy.content_hash as "contentHash"
    from billing.billing_policy_activation activation
    join billing.billing_policy policy on policy.id = activation.policy_id
    left join billing.billing_policy_activation_cancellation cancellation
      on cancellation.activation_id = activation.id
    where activation.environment = ${environment}
      and activation.id = ${pendingActivationId}
      and activation.effective_at > transaction_timestamp()
      and cancellation.activation_id is null
  `);
  return rows[0] === undefined ? undefined : z.object({ contentHash: z.string() }).parse(rows[0]).contentHash;
};

const readEffective = async (
  service: BillingPolicyService,
  input: SyncPolicyInput,
): Promise<{ activationId: string; contentHash: string; policy: CommercialPolicy } | undefined> => {
  try {
    const effective = await service.selectEffectivePolicy({
      environment: input.environment,
      replica: input.replica,
    });
    return { activationId: effective.activationId, contentHash: effective.contentHash, policy: effective.policy };
  } catch (error) {
    if (error instanceof Error && error.message === 'no effective billing policy') {
      return undefined;
    }
    throw error;
  }
};

/**
 * Derives the tariff for one environment and publishes it only when its content differs from the
 * effective and pending policies. A rate rise is scheduled 30 days out by the notice rule itself, a
 * stale pending activation is cancelled and replaced, and a lost compare-and-swap retries.
 */
export const syncPolicy = async (
  service: BillingPolicyService,
  database: SyncDatabase,
  input: SyncPolicyInput,
): Promise<PolicySyncResult> => {
  const candidate = composeTariff({
    overlay: input.overlay,
    ...(input.routes === undefined ? {} : { routes: input.routes }),
  });
  if (input.environment === 'development') {
    await seedDevelopmentBudgets(database);
  }

  /* `retry` means the head moved under us: this pass cancelled a stale pending activation, or another
   * publisher won the publication. Both are resolved by reading the head again. */
  let lastError: Error | undefined;
  const attempt = async (): Promise<PolicySyncResult | 'retry'> => {
    const head = await readHead(database, input.environment);
    const effective = await readEffective(service, input);
    /* The scheduled future is judged before the effective present. A rise that is announced and then
     * reverted in code derives the effective policy again; comparing against the effective policy
     * first would report `unchanged` and let the abandoned rise activate with no code behind it. */
    if (head.pendingActivationId !== null) {
      const pendingHash = await readUncancelledPendingHash(database, input.environment, head.pendingActivationId);
      if (pendingHash === candidate.contentHash) {
        return { status: 'unchanged', activationId: head.pendingActivationId, contentHash: candidate.contentHash };
      }
      if (pendingHash !== undefined) {
        await service.cancelPendingActivation({
          environment: input.environment,
          activationId: head.pendingActivationId,
          jobKey: `sync-cancel-${head.pendingActivationId}`,
          expectedHeadRevision: head.revision,
        });
        return 'retry';
      }
    }
    if (effective?.contentHash === candidate.contentHash) {
      return { status: 'unchanged', activationId: effective.activationId, contentHash: candidate.contentHash };
    }

    const databaseNow = await readDatabaseNow(database);
    let effectiveAt: Date | undefined;
    try {
      validatePolicyActivationNotice({
        previous: effective?.policy,
        next: candidate.policy,
        announcedAt: databaseNow,
        effectiveAt: databaseNow,
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== noticeMessage) {
        throw error;
      }
      effectiveAt = new Date(databaseNow.getTime() + noticeMilliseconds);
    }

    const activationId = `sync-${candidate.contentHash.slice(0, 12)}-r${head.revision + 1n}`;
    try {
      const published = await service.publishPolicy({
        policyJson: candidate.canonicalContent,
        environment: input.environment,
        activationId,
        jobKey: activationId,
        expectedHeadRevision: head.revision,
        ...(head.currentActivationId === null ? {} : { expectedPredecessorActivationId: head.currentActivationId }),
        ...(effectiveAt === undefined ? {} : { effectiveAt }),
        replica: input.replica,
      });
      return {
        status: 'published',
        activationId: published.activationId,
        headRevision: published.headRevision,
        contentHash: candidate.contentHash,
        effectiveAt: effectiveAt ?? databaseNow,
      };
    } catch (error) {
      if (!(error instanceof Error) || !retryableMessages.has(error.message)) {
        throw error;
      }
      lastError = error;
      return 'retry';
    }
  };

  /* Three passes cover one cancellation plus one lost compare-and-swap; a third loss means another
   * publisher is winning every race, and the operator should see that rather than a spinning job. */
  for (let pass = 0; pass < 3; pass += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each pass reacts to the head the previous one moved
    const result = await attempt();
    if (result !== 'retry') {
      return result;
    }
  }
  throw lastError ?? new Error('billing policy sync could not settle the head');
};
