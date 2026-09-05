import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { desc, eq } from 'drizzle-orm';
import type { BillingTier, Entitlements, SubscriptionStatus } from '@taucad/billing';
import { entitlementsFromTier, parseEntitlements, serializeEntitlements } from '@taucad/billing';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import { subscription, subscriptionExtension, user } from '#database/schema.js';
import type { Environment } from '#config/environment.config.js';
import { Span } from '#telemetry/tracer.service.js';
import { entitlementsCacheTtlSeconds, entitlementsRedisKey, stripeClientKey } from '#api/billing/billing.constants.js';
import { resolveDefaultCard } from '#api/billing/resolve-default-card.js';

type SubscriptionRow = typeof subscription.$inferSelect;

/**
 * Entitlement fields Enterprise deals may override via `subscription_extension`
 * (Q28). Anything outside this list in the JSONB is ignored — the column is ops
 * input, not trusted config.
 */
const overridableEntitlementKeys = [
  'canUseProKernels',
  'canCreatePrivateShares',
  'canSyncFiles',
  'canConnectGitHub',
  'canConnectEnterpriseGit',
  'apiCadGatewayMonthlyLimit',
  'conversionApiMonthlyLimit',
  'canUseHostedGeoSpecValidation',
  'geospecValidationMonthlyLimit',
  'geospecConcurrentRuns',
  'canUseGeoSpecCiApi',
  'canCreateGeoSpecEvidenceReports',
  'geospecEvidenceRetentionDays',
] as const;

const planToTier = (plan: string): BillingTier => {
  if (plan === 'pro') {
    return 'pro';
  }
  if (plan === 'enterprise') {
    return 'enterprise';
  }
  // Fail closed: an unrecognised plan name grants nothing.
  return 'free';
};

/**
 * Picks the subscription row that determines entitlements when a user has
 * history: a live row (active/trialing) with the latest period end wins, then a
 * past-due row (surfaced as status while tier drops), else none.
 */
const pickRelevantSubscription = (rows: SubscriptionRow[]): SubscriptionRow | undefined => {
  const byPeriodEndDesc = [...rows].sort((a, b) => (b.periodEnd?.getTime() ?? 0) - (a.periodEnd?.getTime() ?? 0));
  return (
    byPeriodEndDesc.find((row) => row.status === 'active' || row.status === 'trialing') ??
    byPeriodEndDesc.find((row) => row.status === 'past_due')
  );
};

/**
 * Dunning grace in milliseconds (B9/S8): a `past_due` subscription keeps its
 * paid tier while Stripe Smart Retries run, until `periodEnd + 7 days` —
 * renewal failure time ≈ periodEnd, so no schema addition is needed. After
 * the window the tier suspends to free with credits intact.
 */
const dunningGrace = 7 * 24 * 60 * 60 * 1000;

const isWithinDunningGrace = (row: SubscriptionRow): boolean => {
  if (row.status !== 'past_due') {
    return false;
  }
  const periodEnd = row.periodEnd?.getTime();
  return periodEnd !== undefined && Date.now() < periodEnd + dunningGrace;
};

/**
 * Projects `Entitlements` from the subscription mirror + credit-account world
 * (tiers doc Finding 1/9), Redis-cached and invalidated by the webhook fan-out.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(this.constructor.name);

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<Environment, true>,
    @Inject(stripeClientKey) private readonly stripe: Stripe,
  ) {}

  /**
   * Whether real Stripe credentials are configured. When false (local dev), the
   * projection still works — payment-method lookups short-circuit to false and
   * billing endpoints that need Stripe fail closed.
   */
  public isStripeConfigured(): boolean {
    return this.configService.get('STRIPE_SECRET_KEY', { infer: true }) !== '';
  }

  /**
   * Returns the user's entitlements projection (cached ~5 minutes; webhook
   * fan-out invalidates eagerly on every subscription/payment event).
   */
  @Span()
  public async getEntitlements(userId: string): Promise<Entitlements> {
    const cacheKey = entitlementsRedisKey(userId);
    try {
      const cached = await this.redisService.client.get(cacheKey);
      if (cached !== null) {
        return parseEntitlements(JSON.parse(cached));
      }
    } catch (error) {
      // The cache is advisory; a corrupt or unreachable entry falls through to projection.
      this.logger.warn(`Entitlements cache read failed for ${userId}: ${String(error)}`);
    }

    const entitlements = await this.projectEntitlements(userId);

    try {
      await this.redisService.client.set(
        cacheKey,
        JSON.stringify(serializeEntitlements(entitlements)),
        'EX',
        entitlementsCacheTtlSeconds,
      );
    } catch (error) {
      this.logger.warn(`Entitlements cache write failed for ${userId}: ${String(error)}`);
    }

    return entitlements;
  }

  /**
   * Drops the cached projection — called by every webhook lifecycle hook so
   * tier changes propagate immediately rather than at TTL expiry.
   */
  @Span()
  public async invalidateEntitlements(userId: string): Promise<void> {
    try {
      await this.redisService.client.del(entitlementsRedisKey(userId));
    } catch (error) {
      this.logger.warn(`Entitlements cache invalidation failed for ${userId}: ${String(error)}`);
    }
  }

  private async projectEntitlements(userId: string): Promise<Entitlements> {
    const userRow = await this.databaseService.database.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { allowsAiTraining: true, stripeCustomerId: true },
    });
    const subscriptionRows = await this.databaseService.database.query.subscription.findMany({
      where: eq(subscription.referenceId, userId),
      orderBy: desc(subscription.periodEnd),
    });

    const relevant = pickRelevantSubscription(subscriptionRows);
    const status = this.resolveStatus(relevant);
    // S8/B9: live rows keep their tier; past_due keeps it only inside the
    // 7-day dunning grace (status stays 'past_due' so the UI banners fire).
    // Everything else suspends to free — credits always preserved (AD7).
    const tier =
      relevant && (relevant.status === 'active' || relevant.status === 'trialing' || isWithinDunningGrace(relevant))
        ? planToTier(relevant.plan)
        : 'free';

    const base = entitlementsFromTier(tier);
    const overrides = tier === 'enterprise' && relevant ? await this.loadOverrides(relevant.id) : {};
    // One shared resolver feeds both this display projection and the top-up
    // charge path, so the card shown always equals the card charged (Finding 6).
    const stripeCustomerId = userRow?.stripeCustomerId ?? undefined;
    const defaultCard =
      stripeCustomerId !== undefined && this.isStripeConfigured()
        ? await resolveDefaultCard(this.stripe, stripeCustomerId)
        : undefined;

    return {
      ...base,
      ...overrides,
      tier,
      status,
      // AD19 kill switch: one env flag zeroes Free-tier AI without a deploy.
      aiEnabled: tier === 'free' ? this.configService.get('FREE_TIER_AI_ENABLED', { infer: true }) : true,
      // AD15: paid tiers carry the no-train guarantee; Free reflects the user's
      // privacy-settings opt-in (the existing `allowsAiTraining` surface).
      trainingConsent: tier === 'free' ? (userRow?.allowsAiTraining ?? false) : false,
      hasPaymentMethod: defaultCard !== undefined,
      paymentMethod: defaultCard ? { brand: defaultCard.brand, last4: defaultCard.last4 } : undefined,
      currentPeriodEnd: relevant?.periodEnd ?? undefined,
      cancelAtPeriodEnd: relevant?.cancelAtPeriodEnd ?? false,
    };
  }

  private resolveStatus(row: SubscriptionRow | undefined): SubscriptionStatus {
    if (!row) {
      return 'none';
    }
    if (row.status === 'active' || row.status === 'trialing') {
      return 'active';
    }
    if (row.status === 'past_due') {
      return 'past_due';
    }
    if (row.status === 'canceled') {
      return 'canceled';
    }
    return 'none';
  }

  private async loadOverrides(subscriptionId: string): Promise<Partial<Entitlements>> {
    const extension = await this.databaseService.database.query.subscriptionExtension.findFirst({
      where: eq(subscriptionExtension.subscriptionId, subscriptionId),
    });
    const raw = extension?.overrides;
    if (!raw) {
      return {};
    }

    const sanitized: Record<string, number | boolean> = {};
    for (const key of overridableEntitlementKeys) {
      const value = raw[key];
      if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }
    return sanitized as Partial<Entitlements>;
  }
}
