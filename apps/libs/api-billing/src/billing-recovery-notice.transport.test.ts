import { describe, expect, it, vi } from 'vitest';
import { BillingRecoveryNoticeEmailTransport } from '#billing-recovery-notice.transport.js';
import { RecoveryNoticeUndeliverableError } from '#billing-payments.service.js';
import type { DatabaseService } from '@taucad/api-database';

type OwnerRows = ReadonlyArray<{ readonly email: string }>;

/**
 * The transport walks exactly one `select(…).from(…).innerJoin(…).where(…).limit(…)`
 * chain, so the fake implements that chain and nothing else. Drizzle's `select` is
 * overloaded, which no single-signature fake can satisfy; the one assertion that
 * bridges it stays here rather than at each call site.
 */
const databaseReturning = (rows: OwnerRows): Pick<DatabaseService, 'database'> => {
  const database = {
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => rows }) }) }),
    }),
  };
  return { database: database as unknown as DatabaseService['database'] };
};

const createTransport = (rows: OwnerRows, undeliverable: readonly string[] = []) => {
  const email = {
    sendPaymentFailed: vi.fn(async () => undefined),
    sendAutoReloadDisabled: vi.fn(async () => undefined),
    sendAutoReloadActionRequired: vi.fn(async () => undefined),
  };
  const deliverability = {
    undeliverableAmong: vi.fn(async () => new Set(undeliverable)),
  };
  const transport = new BillingRecoveryNoticeEmailTransport(databaseReturning(rows), email, {
    frontendURL: 'https://tau.new',
    deliverability,
  });
  return { transport, email, deliverability };
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
    const { transport, email } = createTransport([{ email: 'owner@example.com' }]);

    const result = await transport.deliver({
      kind: 'renewal_failed',
      accountId: 'acct_1',
      payload,
      dedupeKey: 'renewal-failed:in_1',
    });

    expect(email.sendPaymentFailed).toHaveBeenCalledWith({
      email: 'owner@example.com',
      billingUrl: 'https://tau.new/?settings=billing',
      amount: '$20.00',
      nextAttemptAt: '19 Sep 2026',
    });
    // The receipt is what `deliverRecoveryNotices` records against the row.
    expect(result.receipt).toBe('email:renewal-failed:in_1');
  });

  it.each([
    ['consent_disabled', 'sendAutoReloadDisabled', 'consent-disabled:consent_1'],
    ['authentication_required', 'sendAutoReloadActionRequired', 'authentication-required:purchase_1'],
  ] as const)('sends the %s email to the owner of the notice account', async (kind, sender, dedupeKey) => {
    const { transport, email } = createTransport([{ email: 'owner@example.com' }]);

    // These notices carry no account in their payload; the row's own account names the owner.
    const result = await transport.deliver({
      kind,
      accountId: 'acct_1',
      payload: { consentId: 'consent_1', actionId: 'purchase_1' },
      dedupeKey,
    });

    expect(email[sender]).toHaveBeenCalledExactlyOnceWith({
      email: 'owner@example.com',
      billingUrl: 'https://tau.new/?settings=billing',
    });
    expect(email.sendPaymentFailed).not.toHaveBeenCalled();
    expect(result.receipt).toBe(`email:${dedupeKey}`);
  });

  it('throws without sending when the account has no active owner, so the notice stays pending', async () => {
    const { transport, email } = createTransport([]);

    await expect(
      transport.deliver({ kind: 'renewal_failed', accountId: 'acct_1', payload, dedupeKey: 'renewal-failed:in_1' }),
    ).rejects.toThrow(/no active account owner/iu);
    expect(email.sendPaymentFailed).not.toHaveBeenCalled();
  });

  it('refuses a kind it does not own rather than sending the wrong email', async () => {
    const { transport, email } = createTransport([{ email: 'owner@example.com' }]);

    await expect(
      transport.deliver({ kind: 'reload_failed', accountId: 'acct_1', payload, dedupeKey: 'reload-failed:pi_1' }),
    ).rejects.toThrow(/unsupported/iu);
    expect(email.sendPaymentFailed).not.toHaveBeenCalled();
    expect(email.sendAutoReloadDisabled).not.toHaveBeenCalled();
    expect(email.sendAutoReloadActionRequired).not.toHaveBeenCalled();
  });

  // T9 (email bounce blueprint R10): an owner Resend suppresses is never sent to and the notice is not delivered.
  it.each(['renewal_failed', 'consent_disabled', 'authentication_required'])(
    'refuses %s for an undeliverable owner address before any send',
    async (kind) => {
      const { transport, email, deliverability } = createTransport(
        [{ email: 'Owner@Example.com' }],
        ['owner@example.com'],
      );

      const delivery = transport.deliver({
        kind,
        accountId: 'acct_1',
        payload,
        dedupeKey: `${kind}:1`,
      });

      await expect(delivery).rejects.toBeInstanceOf(RecoveryNoticeUndeliverableError);
      await expect(delivery).rejects.toMatchObject({ accountId: 'acct_1' });
      expect(deliverability.undeliverableAmong).toHaveBeenCalledWith(['Owner@Example.com']);
      expect(email.sendPaymentFailed).not.toHaveBeenCalled();
      expect(email.sendAutoReloadDisabled).not.toHaveBeenCalled();
      expect(email.sendAutoReloadActionRequired).not.toHaveBeenCalled();
    },
  );
});
