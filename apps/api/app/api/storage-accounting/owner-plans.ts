import { storageLimitBytesByTier } from '@taucad/billing';
import type { BillingTier } from '@taucad/billing';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseType } from '#database/database.service.js';
import { billingOwnerBinding, subscription, subscriptionExtension } from '#database/schema.js';
import { subscriptionTierOf } from '#api/billing/subscription-tier.js';
import type { TierSubscription } from '#api/billing/subscription-tier.js';

/**
 * Each owner's plan and storage allowance for the usage pass (W14 OB3, N43–N47), read in batched SQL.
 *
 * This is the allowance `GitRepositoryService.authorize` enforces through `storageLimitOf`, projected
 * the way `BillingService.getEntitlements` projects it (shared `subscriptionTierOf`), but without the
 * per-owner Stripe card lookup that projection makes: nothing here leaves the database.
 */

/** What decides plans in this deployment. */
export type OwnerPlanSettings = {
  /** `TAU_CLOUD_ENABLED`. A self-host build has no tiers: every owner counts as `pro` with the Pro allowance. */
  readonly tauCloudEnabled: boolean;
  /** `BILLING_ENVIRONMENT`; unset or invalid binds no account, so every owner is `free`. */
  readonly environment: string | undefined;
  /** `TAU_FREE_TIER_SYNC_ENABLED` outside production (charter D23): the free tier's sync gate. */
  readonly freeTierSync: boolean;
};

export type OwnerPlan = { readonly plan: BillingTier; readonly limitBytes: number };

export type OwnerSubscriptionRow = TierSubscription & {
  readonly ownerId: string;
  readonly overrides: (typeof subscriptionExtension.$inferSelect)['overrides'];
};

/** Owners per query; well under PostgreSQL's bind-parameter limit. */
const ownerBatch = 1000;

/**
 * Folds the owners' subscription rows to plans and allowances, as `storageLimitOf` computes them:
 * nothing without `canSyncFiles` (the free tier while D23's gate is closed, or an Enterprise override
 * that turns sync off), otherwise the tier's allowance.
 *
 * @param ownerIds - The owners to resolve.
 * @param rows - Their subscriptions in this environment, each owner's newest `paid_through` first.
 * @param settings - The deployment's plan settings, and `now` in epoch milliseconds.
 * @returns A plan for every owner id.
 */
export const ownerPlansOf = (
  ownerIds: readonly string[],
  rows: readonly OwnerSubscriptionRow[],
  settings: OwnerPlanSettings & { readonly now: number },
): Map<string, OwnerPlan> => {
  const byOwner = new Map<string, OwnerSubscriptionRow[]>();
  for (const row of rows) {
    byOwner.set(row.ownerId, [...(byOwner.get(row.ownerId) ?? []), row]);
  }
  return new Map(
    ownerIds.map((ownerId): [string, OwnerPlan] => {
      if (!settings.tauCloudEnabled) {
        return [ownerId, { plan: 'pro', limitBytes: storageLimitBytesByTier.pro }];
      }
      const { relevant, tier } = subscriptionTierOf(byOwner.get(ownerId) ?? [], settings.now);
      const override = tier === 'enterprise' ? relevant?.overrides?.['canSyncFiles'] : undefined;
      const canSyncFiles = typeof override === 'boolean' ? override : tier !== 'free' || settings.freeTierSync;
      return [ownerId, { plan: tier, limitBytes: canSyncFiles ? storageLimitBytesByTier[tier] : 0 }];
    }),
  );
};

/**
 * Reads the owners' bound subscriptions, a thousand owners per query, and folds them to plans.
 *
 * @param database - The database or the accounting transaction.
 * @param ownerIds - The owners the usage aggregate found.
 * @param settings - The deployment's plan settings.
 * @returns A plan for every owner id.
 */
export const readOwnerPlans = async (
  database: Pick<DatabaseType, 'select'>,
  ownerIds: readonly string[],
  settings: OwnerPlanSettings,
): Promise<Map<string, OwnerPlan>> => {
  const rows: OwnerSubscriptionRow[] = [];
  if (settings.tauCloudEnabled && settings.environment !== undefined) {
    for (let start = 0; start < ownerIds.length; start += ownerBatch) {
      // oxlint-disable-next-line no-await-in-loop -- one batch at a time keeps the read light
      const batch = await database
        .select({
          ownerId: billingOwnerBinding.authUserId,
          plan: subscription.plan,
          paidThrough: subscription.paidThrough,
          failedRenewalInvoiceId: subscription.failedRenewalInvoiceId,
          graceEndsAt: subscription.graceEndsAt,
          overrides: subscriptionExtension.overrides,
        })
        .from(billingOwnerBinding)
        .innerJoin(
          subscription,
          and(
            eq(subscription.accountId, billingOwnerBinding.accountId),
            eq(subscription.environment, billingOwnerBinding.environment),
          ),
        )
        .leftJoin(subscriptionExtension, eq(subscriptionExtension.subscriptionId, subscription.id))
        .where(
          and(
            inArray(billingOwnerBinding.authUserId, ownerIds.slice(start, start + ownerBatch)),
            eq(billingOwnerBinding.environment, settings.environment),
            isNull(billingOwnerBinding.revokedAt),
          ),
        )
        /* `BillingService` orders each account's subscriptions by `paid_through desc`. */
        .orderBy(asc(billingOwnerBinding.authUserId), desc(subscription.paidThrough));
      for (const row of batch) {
        if (row.ownerId !== null) {
          rows.push({ ...row, ownerId: row.ownerId });
        }
      }
    }
  }
  return ownerPlansOf(ownerIds, rows, { ...settings, now: Date.now() });
};
