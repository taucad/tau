import { describe, expect, it, vi } from 'vitest';
import { BillingRecoveryNoticeEmailTransport } from '#api/billing/billing-recovery-notice.transport.js';
import type { EmailService } from '#email/email.service.js';

type OwnerRows = ReadonlyArray<{ readonly email: string }>;

const databaseReturning = (rows: OwnerRows): never => {
  const stub = {
    database: {
      select: () => ({
        from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => rows }) }) }),
      }),
    },
  };
  return stub as never;
};

const createTransport = (rows: OwnerRows) => {
  const sendPaymentFailed = vi.fn(async () => undefined);
  const transport = new BillingRecoveryNoticeEmailTransport(
    databaseReturning(rows),
    { sendPaymentFailed } as unknown as EmailService,
    'https://tau.new',
  );
  return { transport, sendPaymentFailed };
};

const payload = {
  subscriptionId: 'sub_1',
  invoiceId: 'in_1',
  accountId: 'acct_1',
  amount: '$20.00',
  nextAttemptAt: '19 Sep 2026',
};

describe('BillingRecoveryNoticeEmailTransport', () => {
  it('sends the dunning email to the account owner with the rows the payload carried', async () => {
    const { transport, sendPaymentFailed } = createTransport([{ email: 'owner@example.com' }]);

    const result = await transport.deliver({ kind: 'renewal_failed', payload, dedupeKey: 'renewal-failed:in_1' });

    expect(sendPaymentFailed).toHaveBeenCalledWith({
      email: 'owner@example.com',
      billingUrl: 'https://tau.new/?settings=billing',
      amount: '$20.00',
      nextAttemptAt: '19 Sep 2026',
    });
    // The receipt is what `deliverRecoveryNotices` records against the row.
    expect(result.receipt).toBe('email:renewal-failed:in_1');
  });

  it('throws without sending when the account has no active owner, so the notice stays pending', async () => {
    const { transport, sendPaymentFailed } = createTransport([]);

    await expect(
      transport.deliver({ kind: 'renewal_failed', payload, dedupeKey: 'renewal-failed:in_1' }),
    ).rejects.toThrow(/no active account owner/iu);
    expect(sendPaymentFailed).not.toHaveBeenCalled();
  });

  it('refuses a kind it does not own rather than sending the wrong email', async () => {
    const { transport, sendPaymentFailed } = createTransport([{ email: 'owner@example.com' }]);

    await expect(
      transport.deliver({ kind: 'reload_failed', payload, dedupeKey: 'reload-failed:pi_1' }),
    ).rejects.toThrow(/unsupported/iu);
    expect(sendPaymentFailed).not.toHaveBeenCalled();
  });
});
