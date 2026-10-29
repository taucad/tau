import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Entitlements, SubscriptionStatus } from '@taucad/billing';
import { entitlementsFromTier, financialEnvironmentSchema } from '@taucad/billing';
import { DatabaseService } from '#database/database.service.js';
import {
  billingOwnerBinding,
  billingStripeCustomer,
  subscription,
  subscriptionExtension,
  user,
} from '#database/schema.js';
import type { Environment } from '#config/environment.config.js';
import { effectiveTrainingConsent } from '#api/privacy/training-consent.js';
import { Span } from '#telemetry/tracer.service.js';
import { stripeReadClientKey } from '#api/billing/billing.constants.js';
import { resolveDefaultCard } from '#api/billing/resolve-default-card.js';
import { subscriptionTierOf, subscriptionTierAssuranceOf } from '#api/billing/subscription-tier.js';
import type { TierAssurance } from '#api/billing/subscription-tier.js';

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

/** Projects paid access from the owned financial deadlines, independent of caches. */
@Injectable()
export class BillingService {
  readonly #logger = new Logger(BillingService.name);
  readonly #freeTierSync: boolean;

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService<Environment, true>,
    @Inject(stripeReadClientKey) private readonly stripe: Stripe,
  ) {
    /*
     * D23, in code and not by convention: a production process that inherits
     * the flag (a stray Fly secret, a copied env file) still keeps free sync
     * shut. The go-live commit deletes this clause, then sets the flag.
     */
    const requested = configService.get('TAU_FREE_TIER_SYNC_ENABLED', { infer: true });
    const production = configService.get('NODE_ENV', { infer: true }) === 'production';
    if (requested && production) {
      this.#logger.warn('Ignoring TAU_FREE_TIER_SYNC_ENABLED under NODE_ENV=production while charter D23 is open.');
    }
    this.#freeTierSync = requested && !production;
  }

  /** Reads PostgreSQL; a stale cached active label cannot extend paid access. */
  @Span()
  public async getEntitlements(userId: string): Promise<Entitlements> {
    return this.projectEntitlements(userId);
  }

  /**
   * The tier, and whether the plan name behind it was recognised (blueprint T04).
   *
   * Access semantics are unchanged: an unrecognised plan still projects the
   * free tier everywhere else. Only callers that must establish the
   * entitlement affirmatively read `assured`.
   *
   * @param userId - The account to project.
   * @returns The tier and its assurance.
   */
  @Span()
  public async getTierAssurance(userId: string): Promise<TierAssurance> {
    const environment = financialEnvironmentSchema.safeParse(
      this.configService.get('BILLING_ENVIRONMENT', { infer: true }),
    );
    if (!environment.success) {
      /* A build with no financial environment establishes nothing. */
      return { tier: 'free', assured: false };
    }
    const binding = await this.databaseService.database.query.billingOwnerBinding.findFirst({
      where: and(
        eq(billingOwnerBinding.authUserId, userId),
        eq(billingOwnerBinding.environment, environment.data),
        isNull(billingOwnerBinding.revokedAt),
      ),
    });
    if (binding === undefined) {
      /* No binding at all is an account that has never subscribed. */
      return { tier: 'free', assured: true };
    }
    const rows = await this.databaseService.database.query.subscription.findMany({
      where: and(eq(subscription.accountId, binding.accountId), eq(subscription.environment, binding.environment)),
      orderBy: desc(subscription.paidThrough),
    });
    return subscriptionTierAssuranceOf(rows, Date.now());
  }

  /**
   * Whether real Stripe credentials are configured. When false (local dev), the
   * projection still works — payment-method lookups short-circuit to false and
   * billing endpoints that need Stripe fail closed.
   */
  public isStripeConfigured(): boolean {
    const secretKey = this.configService.get<string>('STRIPE_READ_SECRET_KEY');
    return typeof secretKey === 'string' && secretKey.length > 0;
  }

  private async projectEntitlements(userId: string): Promise<Entitlements> {
    const userRow = await this.databaseService.database.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { allowsAiTraining: true, aiTrainingDecidedAt: true },
    });
    const environment = financialEnvironmentSchema.safeParse(
      this.configService.get('BILLING_ENVIRONMENT', { infer: true }),
    );
    const binding = environment.success
      ? await this.databaseService.database.query.billingOwnerBinding.findFirst({
          where: and(
            eq(billingOwnerBinding.authUserId, userId),
            eq(billingOwnerBinding.environment, environment.data),
            isNull(billingOwnerBinding.revokedAt),
          ),
        })
      : undefined;
    const subscriptionRows =
      binding === undefined
        ? []
        : await this.databaseService.database.query.subscription.findMany({
            where: and(
              eq(subscription.accountId, binding.accountId),
              eq(subscription.environment, binding.environment),
            ),
            orderBy: desc(subscription.paidThrough),
          });
    const { relevant, tier } = subscriptionTierOf(subscriptionRows, Date.now());
    const status = this.resolveStatus(relevant);
    /* D23: the free tier's sync is a deployment gate, closed unless configured. */
    const base = entitlementsFromTier(tier, { freeTierSync: this.#freeTierSync });
    const overrides = tier === 'enterprise' && relevant ? await this.loadOverrides(relevant.id) : {};
    const stripeAccountId = this.configService.get('STRIPE_ACCOUNT_ID', { infer: true });
    const livemode = this.configService.get('STRIPE_LIVEMODE', { infer: true });
    const customer =
      binding === undefined || !stripeAccountId || livemode === undefined
        ? undefined
        : await this.databaseService.database.query.billingStripeCustomer.findFirst({
            where: and(
              eq(billingStripeCustomer.accountId, binding.accountId),
              eq(billingStripeCustomer.environment, binding.environment),
              eq(billingStripeCustomer.stripeAccountId, stripeAccountId),
              eq(billingStripeCustomer.livemode, livemode),
            ),
          });
    const defaultCard =
      customer?.stripeCustomerId && this.isStripeConfigured()
        ? await resolveDefaultCard(this.stripe, customer.stripeCustomerId)
        : undefined;

    return {
      ...base,
      ...overrides,
      tier,
      status,
      // Free follows the user's preference; a paid plan is off until the user opts in themselves.
      trainingConsent: effectiveTrainingConsent({
        tier,
        assured: true,
        allowsAiTraining: userRow?.allowsAiTraining ?? false,
        decidedAt: userRow?.aiTrainingDecidedAt ?? undefined,
      }),
      hasPaymentMethod: defaultCard !== undefined,
      paymentMethod: defaultCard ? { brand: defaultCard.brand, last4: defaultCard.last4 } : undefined,
      paidThrough: relevant?.paidThrough ?? undefined,
      graceEndsAt: relevant?.graceEndsAt ?? undefined,
      cancelAtPeriodEnd: relevant?.cancelAtPeriodEnd ?? false,
    };
  }

  private resolveStatus(row: SubscriptionRow | undefined): SubscriptionStatus {
    if (!row) {
      return 'none';
    }
    if (row.status === 'active' && row.paidThrough !== null) {
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
