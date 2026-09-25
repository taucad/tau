import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { BillingTier, Entitlements, SubscriptionStatus } from '@taucad/billing';
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
import { Span } from '#telemetry/tracer.service.js';
import { stripeReadClientKey } from '#api/billing/billing.constants.js';
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

/** Projects paid access from the owned financial deadlines, independent of caches. */
@Injectable()
export class BillingService {
  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService<Environment, true>,
    @Inject(stripeReadClientKey) private readonly stripe: Stripe,
  ) {}

  /** Reads PostgreSQL; a stale cached active label cannot extend paid access. */
  @Span()
  public async getEntitlements(userId: string): Promise<Entitlements> {
    return this.projectEntitlements(userId);
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
      columns: { allowsAiTraining: true },
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
    const now = Date.now();
    const relevant =
      subscriptionRows.find(
        (row) =>
          (row.paidThrough !== null && now < row.paidThrough.getTime()) ||
          (row.failedRenewalInvoiceId !== null && row.graceEndsAt !== null && now < row.graceEndsAt.getTime()),
      ) ?? subscriptionRows[0];
    const paid =
      relevant?.paidThrough !== null && relevant?.paidThrough !== undefined && now < relevant.paidThrough.getTime();
    const grace =
      relevant?.failedRenewalInvoiceId !== null &&
      relevant?.failedRenewalInvoiceId !== undefined &&
      relevant.graceEndsAt !== null &&
      now < relevant.graceEndsAt.getTime();
    const tier = relevant && (paid || grace) ? planToTier(relevant.plan) : 'free';
    const status = this.resolveStatus(relevant);
    const base = entitlementsFromTier(tier);
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
      // AD15: paid tiers carry the no-train guarantee; Free reflects the user's
      // privacy-settings opt-in (the existing `allowsAiTraining` surface).
      trainingConsent: tier === 'free' ? (userRow?.allowsAiTraining ?? false) : false,
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
