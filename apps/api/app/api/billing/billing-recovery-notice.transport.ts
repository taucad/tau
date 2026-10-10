import { Logger } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { BillingRecoveryNoticeTransport } from '#api/billing/billing-payments.service.js';
import { billingOwnerBinding, user } from '#database/schema.js';
import type { DatabaseService } from '#database/database.service.js';
import type { EmailService } from '#email/email.service.js';

/** The three senders this transport needs from `EmailService`; a test supplies exactly these. */
export type RecoveryNoticeEmailSender = Pick<
  EmailService,
  'sendPaymentFailed' | 'sendAutoReloadDisabled' | 'sendAutoReloadActionRequired'
>;

/** The notice kinds this transport turns into email; the outbox's check constraint admits no others. */
const deliveredKinds = new Set(['renewal_failed', 'consent_disabled', 'authentication_required']);

/**
 * Turns the `billing_recovery_notice` outbox into transactional email.
 *
 * `BillingPaymentsService` already enqueues one deduplicated row per failed renewal, disabled
 * reload consent and reload that needs the customer's confirmation, and `deliverRecoveryNotices`
 * owns the lease, the retry backoff and delivery marking. This transport only resolves the
 * recipient and renders the message, so a failed send leaves the row pending for its next attempt
 * instead of losing the notice.
 */
// Constructed directly by the billing module factory and the operations worker, never resolved by
// a Nest token, so it needs no @Injectable().
export class BillingRecoveryNoticeEmailTransport implements BillingRecoveryNoticeTransport {
  private readonly logger = new Logger(this.constructor.name);

  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly emailService: RecoveryNoticeEmailSender,
    private readonly frontendURL: string,
  ) {}

  public async deliver(input: {
    readonly kind: string;
    readonly accountId: string;
    readonly payload: Record<string, unknown>;
    readonly dedupeKey: string;
  }): Promise<{ readonly receipt: string }> {
    if (!deliveredKinds.has(input.kind)) {
      throw new Error(`Unsupported recovery notice kind: ${input.kind}`);
    }

    // The notice row's own account, not its payload: the reload kinds carry no account in their payload.
    const email = await this.findOwnerEmail(input.accountId);
    if (email === undefined) {
      throw new Error(`No active account owner for ${input.accountId}`);
    }

    const billingUrl = new URL('/?settings=billing', this.frontendURL).toString();
    if (input.kind === 'consent_disabled') {
      await this.emailService.sendAutoReloadDisabled({ email, billingUrl });
    } else if (input.kind === 'authentication_required') {
      await this.emailService.sendAutoReloadActionRequired({ email, billingUrl });
    } else {
      await this.emailService.sendPaymentFailed({
        email,
        billingUrl,
        amount: this.readString(input.payload, 'amount'),
        nextAttemptAt: this.readString(input.payload, 'nextAttemptAt'),
      });
    }

    this.logger.log(`Delivered ${input.kind} notice ${input.dedupeKey}`);
    return { receipt: `email:${input.dedupeKey}` };
  }

  private readString(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  }

  private async findOwnerEmail(accountId: string): Promise<string | undefined> {
    const rows = await this.databaseService.database
      .select({ email: user.email })
      .from(billingOwnerBinding)
      .innerJoin(user, eq(user.id, billingOwnerBinding.authUserId))
      .where(and(eq(billingOwnerBinding.accountId, accountId), isNull(billingOwnerBinding.revokedAt)))
      .limit(1);
    return rows[0]?.email;
  }
}
