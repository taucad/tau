import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { centsToMicro } from '@taucad/billing';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { EmailService } from '#email/email.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingService } from '#api/billing/billing.service.js';
import { subscription, subscriptionExtension, user } from '#database/schema.js';
import type { Environment } from '#config/environment.config.js';
import { Span } from '#telemetry/tracer.service.js';
import { proMonthlyGrantMicro, proRolloverCeilingMicro } from '#api/billing/billing.constants.js';

/**
 * Grant-relevant invoice billing reasons: the initial subscribe invoice AND the
 * cycle renewal both grant exactly once via the single `invoice.paid` pathway
 * (AD17 + the S2 rule — subscription lifecycle hooks never grant).
 */
const grantBillingReasons = new Set(['subscription_create', 'subscription_cycle']);

/**
 * Extracts the subscription id an invoice belongs to across Stripe API shapes
 * (`invoice.subscription` classically; `invoice.parent.subscription_details`
 * on newer API versions).
 */
const subscriptionIdFromInvoice = (invoice: Stripe.Invoice): string | undefined => {
  const candidate: unknown =
    (invoice as { subscription?: unknown }).subscription ??
    (invoice as { parent?: { subscription_details?: { subscription?: unknown } } }).parent?.subscription_details
      ?.subscription;
  if (typeof candidate === 'string') {
    return candidate;
  }
  if (typeof candidate === 'object' && candidate !== null && 'id' in candidate) {
    const { id } = candidate as { id?: unknown };
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
};

/**
 * Whether any invoice line bills the given price id, across Stripe API shapes
 * (`line.price.id` classically; `line.pricing.price_details.price` on newer
 * API versions). Order-independent plan resolution: works even when the
 * invoice.paid webhook lands before the plugin mirrors the subscription row.
 */
const invoiceIncludesPrice = (invoice: Stripe.Invoice, priceId: string): boolean => {
  if (priceId === '') {
    return false;
  }
  const lines: unknown[] = invoice.lines.data;
  return lines.some((line) => {
    if (typeof line !== 'object' || line === null) {
      return false;
    }
    const legacyPrice = (line as { price?: { id?: unknown } }).price?.id;
    if (legacyPrice === priceId) {
      return true;
    }
    const modernPrice = (line as { pricing?: { price_details?: { price?: unknown } } }).pricing?.price_details?.price;
    return modernPrice === priceId;
  });
};

/**
 * First-party fan-out for Stripe events the `@better-auth/stripe` plugin routes
 * through `onEvent` (signature already verified upstream). Every handler is
 * idempotent — grants/top-ups key on `event.id`, and unknown events are 2xx
 * no-ops so Stripe stops retrying (S61).
 */
@Injectable()
export class StripeEventRouter {
  private readonly logger = new Logger(this.constructor.name);

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly creditLedgerService: CreditLedgerService,
    private readonly billingService: BillingService,
    private readonly configService: ConfigService<Environment, true>,
    private readonly metricsService: MetricsService,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
  ) {}

  @Span()
  public async dispatch(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.paid': {
        await this.handleInvoicePaid(event);
        return;
      }
      case 'checkout.session.completed': {
        await this.handleCheckoutSessionCompleted(event);
        return;
      }
      case 'payment_intent.succeeded': {
        await this.handlePaymentIntentSucceeded(event);
        return;
      }
      case 'charge.refunded': {
        await this.handleChargeRefunded(event);
        return;
      }
      case 'invoice.payment_failed': {
        await this.handleInvoicePaymentFailed(event);
        return;
      }
      default: {
        this.logger.debug(`Ignoring unhandled Stripe event type: ${event.type}`);
      }
    }
  }

  /**
   * The single credit-grant pathway (AD17): `invoice.paid` for the initial
   * subscribe or a cycle renewal grants the plan's monthly allotment exactly
   * once (idempotent by event id — S2/S9).
   */
  private async handleInvoicePaid(event: Stripe.Event & { type: 'invoice.paid' }): Promise<void> {
    const invoice = event.data.object;
    if (!grantBillingReasons.has(invoice.billing_reason ?? '')) {
      return;
    }

    const userId = await this.resolveUserId(invoice.customer ?? undefined);
    if (userId === undefined) {
      // Out-of-order delivery before the customer is linked (S10) — log and
      // no-op; Stripe's own retry policy is exhausted by our 2xx, but grants
      // for unlinked customers are unattributable by definition.
      this.logger.warn(`invoice.paid ${event.id} has no linked Tau user — skipping grant`);
      return;
    }

    const grant = await this.resolveGrantAmounts(invoice);
    if (grant === undefined) {
      this.logger.warn(`invoice.paid ${event.id}: no plan resolvable for user ${userId} — skipping grant`);
      return;
    }

    const applied = await this.creditLedgerService.grantMonthly({
      userId,
      monthlyGrantMicro: grant.monthlyGrantMicro,
      rolloverCeilingMicro: grant.rolloverCeilingMicro,
      stripeEventId: event.id,
    });
    if (applied) {
      this.logger.log(`Granted ${grant.monthlyGrantMicro} µ$ to ${userId} (${invoice.billing_reason})`);
    }
    await this.billingService.invalidateEntitlements(userId);
  }

  /**
   * Payment-mode Checkout settlement for credit-pack top-ups (B3). The plugin
   * handles subscription-mode sessions itself; this handler only reacts to the
   * `kind: 'credit-topup'` metadata stamped by the top-up endpoint.
   */
  private async handleCheckoutSessionCompleted(
    event: Stripe.Event & { type: 'checkout.session.completed' },
  ): Promise<void> {
    const session = event.data.object;
    if (session.mode !== 'payment' || session.metadata?.['kind'] !== 'credit-topup') {
      return;
    }

    const userId = session.metadata['tauUserId'] ?? (await this.resolveUserId(session.customer ?? undefined));
    if (userId === undefined) {
      this.logger.warn(`credit-topup session ${session.id} has no resolvable user — skipping`);
      return;
    }

    const amountCents = session.amount_total ?? 0;
    if (amountCents <= 0) {
      this.logger.warn(`credit-topup session ${session.id} has non-positive amount ${amountCents} — skipping`);
      return;
    }

    await this.creditLedgerService.topup({
      userId,
      amountMicro: centsToMicro(amountCents),
      stripeEventId: event.id,
    });
    // The hasPaymentMethod flag may have just flipped true (S47).
    await this.billingService.invalidateEntitlements(userId);
  }

  /**
   * Safety net for the in-app top-up fast path. The endpoint credits inline the
   * moment the saved-card charge succeeds, so this handler normally loses the
   * race and no-ops; it settles for real only when the API died between charging
   * and crediting.
   *
   * Both writers therefore key on `pi:{paymentIntent.id}` — the only identifier
   * the endpoint holds (the event does not exist yet when it charges). Sharing
   * one key is what makes the two writers idempotent against each other: the
   * loser hits the partial-unique index on `credit_transaction.stripe_event_id`
   * and rolls back whole. Only PaymentIntents stamped `kind: 'credit-topup'`
   * settle here — a Checkout-created PI never carries that metadata, so
   * `handleCheckoutSessionCompleted` can never double-credit the same top-up.
   */
  private async handlePaymentIntentSucceeded(
    event: Stripe.Event & { type: 'payment_intent.succeeded' },
  ): Promise<void> {
    const paymentIntent = event.data.object;
    if (paymentIntent.metadata['kind'] !== 'credit-topup') {
      return;
    }

    const customerId = typeof paymentIntent.customer === 'string' ? paymentIntent.customer : undefined;
    const userId = paymentIntent.metadata['tauUserId'] ?? (await this.resolveUserId(customerId));
    if (userId === undefined) {
      this.logger.warn(`credit-topup payment_intent ${paymentIntent.id} has no resolvable user — skipping`);
      return;
    }

    const amountCents = paymentIntent.amount_received;
    if (amountCents <= 0) {
      this.logger.warn(`credit-topup payment_intent ${paymentIntent.id} has non-positive amount — skipping`);
      return;
    }

    await this.creditLedgerService.topup({
      userId,
      amountMicro: centsToMicro(amountCents),
      // Shared with the inline credit in `BillingController.createTopupSession`.
      stripeEventId: `pi:${paymentIntent.id}`,
    });
    await this.billingService.invalidateEntitlements(userId);
  }

  /**
   * Refund clawback (Q37): automatic reversal drawn from unspent top-up balance
   * first; a refund of already-spent credits leaves the account negative, which
   * blocks all spend until topped up.
   */
  private async handleChargeRefunded(event: Stripe.Event & { type: 'charge.refunded' }): Promise<void> {
    const charge = event.data.object;
    const userId = await this.resolveUserId(charge.customer ?? undefined);
    if (userId === undefined) {
      return;
    }
    const refundedCents = charge.amount_refunded;
    if (refundedCents <= 0) {
      return;
    }

    await this.creditLedgerService.refundTopup({
      userId,
      amountMicro: centsToMicro(refundedCents),
      stripeEventId: event.id,
      note: `charge-refunded:${charge.id}`,
    });
    const account = await this.creditLedgerService.getAccount(userId);
    if (account.balanceMicro < 0n) {
      // Dispute-abuse signal: refunded credits were already spent (Q37/S46).
      this.metricsService.billingAccountsFlagged.add(1);
      this.logger.warn(
        `Account ${userId} is negative (${account.balanceMicro} µ$) after refund clawback — flagged for review`,
      );
    }
    await this.billingService.invalidateEntitlements(userId);
  }

  /**
   * Renewal failure (B9 dunning): the plugin mirrors `past_due` onto the
   * subscription row; the projection keeps the paid tier for the 7-day grace
   * while Stripe Smart Retries run. One notification email per Stripe event
   * (idempotent via a Redis NX marker — retried deliveries never double-send).
   */
  private async handleInvoicePaymentFailed(event: Stripe.Event & { type: 'invoice.payment_failed' }): Promise<void> {
    const invoice = event.data.object;
    const userId = await this.resolveUserId(invoice.customer ?? undefined);
    if (userId === undefined) {
      return;
    }
    this.logger.warn(`invoice.payment_failed for user ${userId} — grace window active, dunning email queued`);
    await this.billingService.invalidateEntitlements(userId);
    await this.sendDunningEmailOnce(event.id, userId);
  }

  /** Claims the per-event marker, then emails; a lost claim means already sent. */
  private async sendDunningEmailOnce(eventId: string, userId: string): Promise<void> {
    try {
      const claimed = await this.redisService.client.set(
        `tau:billing:dunning:${eventId}`,
        '1',
        'EX',
        30 * 24 * 60 * 60,
        'NX',
      );
      if (claimed !== 'OK') {
        return;
      }
      const row = await this.databaseService.database.query.user.findFirst({
        where: eq(user.id, userId),
        columns: { email: true },
      });
      if (!row) {
        return;
      }
      const frontendUrl = this.configService.get('TAU_FRONTEND_URL', { infer: true });
      await this.emailService.sendPaymentFailed({
        email: row.email,
        billingUrl: `${frontendUrl}/?settings=billing`,
      });
    } catch (error) {
      // Notification-only path: never fail the webhook 2xx over an email.
      this.logger.error(`Dunning email failed for ${userId}: ${String(error)}`);
    }
  }

  /**
   * Resolves the plan's grant amounts for a paid invoice: by price id first
   * (order-independent), then via the mirrored subscription row (covers
   * Enterprise's bespoke prices, whose custom allotment comes from
   * `subscription_extension.overrides`).
   */
  private async resolveGrantAmounts(
    invoice: Stripe.Invoice,
  ): Promise<{ monthlyGrantMicro: bigint; rolloverCeilingMicro: bigint } | undefined> {
    const proPriceId = this.configService.get('STRIPE_PRICE_ID_PRO_MONTHLY', { infer: true });
    if (invoiceIncludesPrice(invoice, proPriceId)) {
      return { monthlyGrantMicro: proMonthlyGrantMicro, rolloverCeilingMicro: proRolloverCeilingMicro };
    }

    const subscriptionId = subscriptionIdFromInvoice(invoice);
    if (subscriptionId === undefined) {
      return undefined;
    }
    const row = await this.databaseService.database.query.subscription.findFirst({
      where: eq(subscription.stripeSubscriptionId, subscriptionId),
    });
    if (!row) {
      return undefined;
    }
    if (row.plan === 'pro') {
      return { monthlyGrantMicro: proMonthlyGrantMicro, rolloverCeilingMicro: proRolloverCeilingMicro };
    }
    if (row.plan === 'enterprise') {
      const extension = await this.databaseService.database.query.subscriptionExtension.findFirst({
        where: eq(subscriptionExtension.subscriptionId, row.id),
      });
      const overrides = extension?.overrides ?? {};
      const monthly = overrides['monthlyGrantMicro'];
      const ceiling = overrides['rolloverCeilingMicro'];
      if (typeof monthly === 'number' && monthly >= 0) {
        return {
          monthlyGrantMicro: BigInt(Math.trunc(monthly)),
          rolloverCeilingMicro:
            typeof ceiling === 'number' && ceiling >= 0
              ? BigInt(Math.trunc(ceiling))
              : BigInt(Math.trunc(monthly)) * 2n,
        };
      }
      // Enterprise archetype with no configured allotment defaults to Pro amounts.
      return { monthlyGrantMicro: proMonthlyGrantMicro, rolloverCeilingMicro: proRolloverCeilingMicro };
    }
    return undefined;
  }

  private async resolveUserId(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | undefined,
  ): Promise<string | undefined> {
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    if (customerId === undefined) {
      return undefined;
    }
    const row = await this.databaseService.database.query.user.findFirst({
      where: eq(user.stripeCustomerId, customerId),
      columns: { id: true },
    });
    return row?.id;
  }
}
