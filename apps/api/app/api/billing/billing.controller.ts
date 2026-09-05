import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Ip,
  Logger,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { WireCreditAccount, WireEntitlements } from '@taucad/billing';
import { centsToMicro, serializeEntitlements } from '@taucad/billing';
import type { AuthUser } from '#auth/auth.type.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import { creditAccount, user as userTable } from '#database/schema.js';
import type { Environment } from '#config/environment.config.js';
import { sanitizeFrontendRedirectPath } from '#email/email-link-builder.js';
import { BillingService } from '#api/billing/billing.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { TopupRequestDto } from '#api/billing/billing.dto.js';
import { resolveDefaultCard } from '#api/billing/resolve-default-card.js';
import {
  stripeClientKey,
  topupRateLimitRedisKey,
  topupSessionsPerIpPerHour,
  topupSessionsPerUserPerHour,
} from '#api/billing/billing.constants.js';

const rateLimitWindowSeconds = 3600;

const incrByExpireLua = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

/** Nest's second `logger.error` argument — a stack when there is one. */
const stackOf = (error: unknown): string => (error instanceof Error ? (error.stack ?? error.message) : String(error));

/** UTC hour bucket shared by the top-up rate-limit keys. */
const hourBucket = (): string => new Date().toISOString().slice(0, 13);

@UseAuth()
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  public constructor(
    private readonly billingService: BillingService,
    private readonly creditLedgerService: CreditLedgerService,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<Environment, true>,
    @Inject(stripeClientKey) private readonly stripe: Stripe,
  ) {}

  /**
   * The entitlements projection consumed by `useEntitlements()` (tiers doc T8).
   * Unlimited quotas are `null` on the wire; the client restores `Infinity`
   * via `parseEntitlements`.
   */
  @Get('entitlements')
  public async getEntitlements(@User() user: AuthUser): Promise<WireEntitlements> {
    return serializeEntitlements(await this.billingService.getEntitlements(user.id));
  }

  /**
   * Durable balances + recent journal lines for the BillingSettings balance
   * card (µ$ as strings — JSON cannot carry bigint). Threshold notifications
   * (Q26) are claimed here at read time with server-side markers, so the 80%
   * and 95% toasts fire exactly once per grant cycle across tabs and devices.
   */
  @Get('credits')
  public async getCredits(@User() user: AuthUser): Promise<WireCreditAccount> {
    const account = await this.creditLedgerService.getAccount(user.id);
    const transactions = await this.creditLedgerService.getRecentTransactions(user.id);
    const notifications = await this.claimThresholdNotifications(user.id, {
      grantBalanceMicro: account.grantBalanceMicro,
      monthlyGrantMicro: account.monthlyGrantMicro,
    });
    return {
      balanceMicro: account.balanceMicro.toString(),
      grantBalanceMicro: account.grantBalanceMicro.toString(),
      topupBalanceMicro: account.topupBalanceMicro.toString(),
      reservedMicro: account.reservedMicro.toString(),
      monthlyGrantMicro: account.monthlyGrantMicro.toString(),
      rolloverCeilingMicro: account.rolloverCeilingMicro.toString(),
      notifications,
      transactions: transactions.map((row) => ({
        id: row.id,
        deltaMicro: row.deltaMicro.toString(),
        balanceAfterMicro: row.balanceAfterMicro.toString(),
        reason: row.reason,
        category: row.category ?? null,
        modelId: row.modelId ?? null,
        note: row.note ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Settles a credit-pack top-up (C7/Q6/AD4) by the most seamless route the
   * buyer's state allows:
   *
   * 1. **Fast path** — if a saved card is on file, charge it in-app with a
   *    server-side PaymentIntent and credit the ledger in this same request, so
   *    the buyer sees the new balance before the modal closes. Returns
   *    `{ status: 'succeeded', balanceMicro }`.
   * 2. **Hosted Checkout fallback** — otherwise (no saved card, or the charge
   *    needs 3DS / is declined) mint a redirect session; returns `{ url }`. This
   *    also covers first-time buyers and SCA, neither of which can complete
   *    in-page because Stripe.js is COEP-blocked under Tau's cross-origin
   *    isolation (docs/research/credit-topup-hosted-checkout-migration.md).
   *
   * Both paths stamp `kind: 'credit-topup'` metadata the webhook router settles
   * on — the PaymentIntent for the fast path, the Checkout session for the
   * fallback — which can never double-credit (a Checkout-created PI carries no
   * such metadata). For the fast path the webhook is now only a safety net for
   * a crash between charging and crediting; it shares this handler's
   * `pi:{id}` idempotency key, so whichever writer arrives second no-ops.
   * Fails closed without Stripe config; requires a verified email (Q38) and
   * consumes per-user + per-IP hourly session slots (C18).
   */
  @Post('topup')
  public async createTopupSession(
    @User() user: AuthUser,
    @Body() body: TopupRequestDto,
    @Ip() ip: string,
  ): Promise<{ url: string } | { status: 'succeeded'; balanceMicro?: string }> {
    const secretKey = this.configService.get('STRIPE_SECRET_KEY', { infer: true });
    const productId = this.configService.get('STRIPE_PRODUCT_ID_CREDIT_PACK', { infer: true });
    if (secretKey === '' || productId === '') {
      throw new ServiceUnavailableException('BILLING_NOT_CONFIGURED');
    }
    if (!user.emailVerified) {
      throw new ForbiddenException('EMAIL_VERIFICATION_REQUIRED');
    }
    await this.consumeTopupSlots(user.id, ip);

    const customerId = await this.getOrCreateCustomerId(user);

    const paymentIntent = await this.chargeSavedCard(user, customerId, body.amountCents, body.idempotencyKey);
    if (paymentIntent !== undefined) {
      return this.creditChargedTopup(user.id, paymentIntent);
    }

    // Return the buyer to where they started (chat, billing settings, …). The
    // client passes its current URL; the sanitiser collapses anything off the
    // frontend origin to `/`, so this is never an open redirect.
    const frontendUrl = this.configService.get('TAU_FRONTEND_URL', { infer: true });
    const returnPath = sanitizeFrontendRedirectPath({ callbackURL: body.returnUrl, frontendURL: frontendUrl });
    const successUrl = new URL(returnPath, frontendUrl);
    successUrl.searchParams.set('topup', 'success');

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      success_url: successUrl.toString(),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      cancel_url: new URL(returnPath, frontendUrl).toString(),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      line_items: [
        {
          quantity: 1,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
          price_data: { currency: 'usd', product: productId, unit_amount: body.amountCents },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      payment_intent_data: { setup_future_usage: 'on_session' },
      // Surface the buyer's already-saved card so returning customers pay in one
      // click. Cards saved via the subscription flow default to
      // `allow_redisplay: 'limited'`, which Checkout hides by default; the filter
      // widens that to show them (a user-present top-up is a compliant redisplay
      // context). See docs/research/credit-topup-hosted-checkout-migration.md.
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      saved_payment_method_options: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
        allow_redisplay_filters: ['always', 'limited', 'unspecified'],
      },
      metadata: { kind: 'credit-topup', tauUserId: user.id, tauTopupCents: String(body.amountCents) },
    });
    if (session.url === null) {
      throw new ServiceUnavailableException('CHECKOUT_SESSION_MISSING_URL');
    }
    return { url: session.url };
  }

  /**
   * Fixed-window hourly caps per user AND per client IP (S43). Sessions are
   * counted at mint time — an abandoned session still burns a slot.
   */
  private async consumeTopupSlots(userId: string, ip: string): Promise<void> {
    const bucket = hourBucket();
    const [userCount, ipCount] = await Promise.all([
      this.consumeSlot(topupRateLimitRedisKey('user', userId, bucket)),
      this.consumeSlot(topupRateLimitRedisKey('ip', ip, bucket)),
    ]);
    if (userCount > topupSessionsPerUserPerHour || ipCount > topupSessionsPerIpPerHour) {
      throw new HttpException('TOPUP_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async consumeSlot(key: string): Promise<number> {
    const raw = await this.redisService.client.eval(incrByExpireLua, 1, key, String(rateLimitWindowSeconds));
    return Number(raw);
  }

  /**
   * Lazily creates the Stripe customer at the first billing action (plan
   * deviation 8 — signup never touches Stripe). A lost creation race leaks at
   * most one unlinked Stripe customer (ponytail: no cross-instance lock; the
   * IS-NULL-guarded update makes the linked id deterministic).
   */
  private async getOrCreateCustomerId(user: AuthUser): Promise<string> {
    const existing = await this.databaseService.database.query.user.findFirst({
      where: eq(userTable.id, user.id),
      columns: { stripeCustomerId: true },
    });
    const existingCustomerId = existing?.stripeCustomerId ?? '';
    if (existingCustomerId !== '') {
      return existingCustomerId;
    }

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: user.id },
    });
    await this.databaseService.database
      .update(userTable)
      .set({ stripeCustomerId: customer.id })
      .where(and(eq(userTable.id, user.id), isNull(userTable.stripeCustomerId)));
    const winner = await this.databaseService.database.query.user.findFirst({
      where: eq(userTable.id, user.id),
      columns: { stripeCustomerId: true },
    });
    return winner?.stripeCustomerId ?? customer.id;
  }

  /**
   * Fast-path settlement: charge the customer's default saved card server-side
   * so a returning buyer tops up in one click without leaving Tau. Returns the
   * succeeded PaymentIntent for the caller to credit, or `undefined` to signal a
   * fall back to hosted Checkout — when there is no saved card, or the charge
   * needs authentication (`error_on_requires_action`) or is declined, since
   * neither 3DS nor card re-entry can happen in-page under COEP. The
   * `kind: 'credit-topup'` metadata on the PaymentIntent is what the webhook
   * router settles on if this request dies before crediting.
   */
  private async chargeSavedCard(
    user: AuthUser,
    customerId: string,
    amountCents: number,
    idempotencyKey?: string,
  ): Promise<Stripe.PaymentIntent | undefined> {
    // Same resolver the entitlements projection uses to display the card (Finding 6).
    const defaultCard = await resolveDefaultCard(this.stripe, customerId);
    if (defaultCard === undefined) {
      return undefined;
    }
    try {
      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: 'usd',
          customer: customerId,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
          payment_method: defaultCard.id,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
          payment_method_types: ['card'],
          confirm: true,
          // The buyer is present (they clicked), but Stripe.js can't run under COEP
          // to satisfy a 3DS step — so error out and let hosted Checkout handle it.
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
          error_on_requires_action: true,
          metadata: { kind: 'credit-topup', tauUserId: user.id, tauTopupCents: String(amountCents) },
        },
        // Scoped per user so one buyer's key can never collide with another's.
        idempotencyKey === undefined ? undefined : { idempotencyKey: `topup:${user.id}:${idempotencyKey}` },
      );
      return paymentIntent.status === 'succeeded' ? paymentIntent : undefined;
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeError &&
        !(error instanceof Stripe.errors.StripeConnectionError) &&
        !(error instanceof Stripe.errors.StripeAPIError)
      ) {
        // Stripe processed the request and refused (decline, 3DS required, bad
        // payment method) — no charge happened, so hosted Checkout is safe.
        return undefined;
      }
      // Ambiguous: the charge may have succeeded and only the response been
      // lost. Never fall through to a second payment path here — the webhook
      // settles a silent success, and the client's retry key makes a manual
      // retry return this same PaymentIntent.
      throw new ServiceUnavailableException('TOPUP_CHARGE_UNCONFIRMED');
    }
  }

  /**
   * Credits a charge that already succeeded, in the same request, so the buyer
   * sees the new balance before the top-up modal closes. Shares the `pi:{id}`
   * idempotency key with `handlePaymentIntentSucceeded`, so a webhook that wins
   * the race merely makes `topup` a no-op — the balance read is correct either
   * way.
   *
   * Never throws. The card is already charged, so failing the request would be a
   * lie and would invite the client to offer a retry. When crediting fails the
   * response omits `balanceMicro`, the client degrades to "your balance will
   * update shortly", and the webhook settles it.
   */
  private async creditChargedTopup(
    userId: string,
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<{ status: 'succeeded'; balanceMicro?: string }> {
    if (paymentIntent.amount_received <= 0) {
      // Mirrors the webhook's guard. Journalling a zero-delta row would claim
      // the shared `pi:` key and leave the webhook with nothing to settle.
      this.logger.warn(`Charged payment intent ${paymentIntent.id} received nothing — not crediting`);
      return { status: 'succeeded' };
    }
    try {
      await this.creditLedgerService.topup({
        userId,
        // `amount_received` is what the webhook settles on and what Stripe
        // actually took — keeping both writers on it makes them identical.
        amountMicro: centsToMicro(paymentIntent.amount_received),
        stripeEventId: `pi:${paymentIntent.id}`,
      });
    } catch (error) {
      this.logger.error(
        `Inline credit failed for ${paymentIntent.id} (charge succeeded) — webhook will settle`,
        stackOf(error),
      );
      return { status: 'succeeded' };
    }
    try {
      const account = await this.creditLedgerService.getAccount(userId);
      return { status: 'succeeded', balanceMicro: account.balanceMicro.toString() };
    } catch (error) {
      // The credit is durable — only the read-back failed, so the client shows
      // the "will update shortly" copy and the next balance fetch catches up.
      this.logger.warn(`Credited ${paymentIntent.id} but the balance read-back failed`, stackOf(error));
      return { status: 'succeeded' };
    }
  }

  /**
   * Claims 80%/95% grant-consumption markers atomically (`IS NULL` guarded
   * update — concurrent readers race safely; only one wins each marker).
   * Markers reset when the next grant lands (`grantMonthly` clears them).
   */
  private async claimThresholdNotifications(
    userId: string,
    balances: { grantBalanceMicro: bigint; monthlyGrantMicro: bigint },
  ): Promise<Array<'grant-80' | 'grant-95'>> {
    if (balances.monthlyGrantMicro <= 0n) {
      return [];
    }
    const consumedPercent = Number(
      ((balances.monthlyGrantMicro - balances.grantBalanceMicro) * 100n) / balances.monthlyGrantMicro,
    );
    const claimed: Array<'grant-80' | 'grant-95'> = [];
    if (consumedPercent >= 95) {
      const rows = await this.databaseService.database
        .update(creditAccount)
        .set({ notified95At: sql`now()` })
        .where(sql`${eq(creditAccount.userId, userId)} AND ${isNull(creditAccount.notified95At)}`)
        .returning({ userId: creditAccount.userId });
      if (rows.length > 0) {
        claimed.push('grant-95');
      }
    } else if (consumedPercent >= 80) {
      const rows = await this.databaseService.database
        .update(creditAccount)
        .set({ notified80At: sql`now()` })
        .where(sql`${eq(creditAccount.userId, userId)} AND ${isNull(creditAccount.notified80At)}`)
        .returning({ userId: creditAccount.userId });
      if (rows.length > 0) {
        claimed.push('grant-80');
      }
    }
    return claimed;
  }
}
