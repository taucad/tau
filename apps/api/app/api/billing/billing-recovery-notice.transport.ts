import { Logger } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { BillingRecoveryNoticeTransport } from '#api/billing/billing-payments.service.js';
import { billingOwnerBinding, user } from '#database/schema.js';
import type { DatabaseService } from '#database/database.service.js';
import type { EmailService } from '#email/email.service.js';

/**
 * Turns the `billing_recovery_notice` outbox into transactional email.
 *
 * `BillingPaymentsService` already enqueues one deduplicated row per failed invoice at the moment
 * dunning starts, and `deliverRecoveryNotices` already owns the lease, retry and delivery marking.
 * This transport only resolves the recipient and renders the message, so a failed send leaves the
 * row pending for the next pass instead of losing the notice.
 */
// Constructed directly by the billing module factory and the operations worker, never resolved by
// a Nest token, so it needs no @Injectable().
export class BillingRecoveryNoticeEmailTransport implements BillingRecoveryNoticeTransport {
  private readonly logger = new Logger(this.constructor.name);

  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly emailService: EmailService,
    private readonly frontendURL: string,
  ) {}

  public async deliver(input: {
    readonly kind: string;
    readonly payload: Record<string, unknown>;
    readonly dedupeKey: string;
  }): Promise<{ readonly receipt: string }> {
    if (input.kind !== 'renewal_failed') {
      throw new Error(`Unsupported recovery notice kind: ${input.kind}`);
    }

    const accountId = this.readString(input.payload, 'accountId');
    if (accountId === undefined) {
      throw new Error('Recovery notice payload has no accountId');
    }

    const email = await this.findOwnerEmail(accountId);
    if (email === undefined) {
      throw new Error(`No active account owner for ${accountId}`);
    }

    await this.emailService.sendPaymentFailed({
      email,
      billingUrl: new URL('/?settings=billing', this.frontendURL).toString(),
      amount: this.readString(input.payload, 'amount'),
      nextAttemptAt: this.readString(input.payload, 'nextAttemptAt'),
    });

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
