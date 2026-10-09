import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { billingRecoveryNotice, user } from '#database/schema.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { BillingPaymentsService, recoveryNoticeAttemptLimit } from '#api/billing/billing-payments.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { BillingRecoveryNoticeEmailTransport } from '#api/billing/billing-recovery-notice.transport.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
// Notices are drained by the `billing-operations` worker, which runs as this role.
const workerClient = postgres(databaseUrl, { max: 2, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(adminClient, { schema });
const workerDatabase = drizzle(workerClient, { schema });

/** Every send the fake email service accepted or refused, by template and recipient. */
const sends: Array<{ readonly template: string; readonly email: string; readonly billingUrl: string }> = [];
const refusedRecipients = new Set<string>();
const send =
  (template: string) =>
  async (args: { readonly email: string; readonly billingUrl: string }): Promise<void> => {
    sends.push({ template, email: args.email, billingUrl: args.billingUrl });
    if (refusedRecipients.has(args.email)) {
      throw new Error('Failed to send email');
    }
  };
const email = {
  sendPaymentFailed: send('payment-failed'),
  sendAutoReloadDisabled: send('auto-reload-disabled'),
  sendAutoReloadActionRequired: send('auto-reload-action-required'),
};

// Delivery never reaches Stripe; the services only need a client to construct.
const stripe = createBillingStripeClient({ secretKey: 'sk_test_notices', fixtureUrl: 'http://127.0.0.1:9/' });
const policy = new BillingPolicyService({ database: workerDatabase });
const ledger = new CreditLedgerService({ database: workerDatabase }, policy);
const payments = new BillingPaymentsService(
  { database: workerDatabase },
  stripe,
  stripe,
  {
    environment: 'development',
    stripeAccountId: 'acct_notice_native',
    livemode: false,
    uiOrigin: 'http://127.0.0.1:3000',
    webhookSecret: 'whsec_notice_native_12345',
    collection: { kind: 'local_fixture', monthlyPriceId: 'price_notice', topupProductId: 'prod_notice' },
  },
  policy,
  ledger,
  new BillingCashService({ database: workerDatabase }, stripe, stripe, ledger, {
    environment: 'development',
    stripeAccountId: 'acct_notice_native',
    livemode: false,
  }),
  new BillingRecoveryNoticeEmailTransport({ database: workerDatabase }, email, 'https://tau.example'),
);

const seedOwner = async (): Promise<{ readonly accountId: string; readonly email: string }> => {
  const userId = randomUUID();
  const address = `${userId}@test.invalid`;
  await database.insert(user).values({ id: userId, name: 'Notice Owner', email: address, emailVerified: true });
  const accountId = await ledger.ensureAccountBinding({ authUserId: userId, environment: 'development' });
  return { accountId, email: address };
};

/** Queues notices the way `BillingPaymentsService` does, with the payload each kind carries there. */
const queueNotices = async (
  accountId: string,
  kinds: ReadonlyArray<'renewal_failed' | 'consent_disabled' | 'authentication_required'>,
): Promise<string[]> => {
  const consentId = randomUUID();
  const actionId = randomUUID();
  const rows = kinds.map((kind) => ({
    id: randomUUID(),
    accountId,
    environment: 'development',
    kind,
    dedupeKey: `${kind}:${randomUUID()}`,
    payload:
      kind === 'renewal_failed'
        ? { subscriptionId: randomUUID(), invoiceId: 'in_notice', accountId, amount: 'US$20.00' }
        : { consentId, actionId },
  }));
  await database.insert(billingRecoveryNotice).values(rows);
  return rows.map((row) => row.id);
};

const noticeRows = async (ids: readonly string[]) =>
  database
    .select()
    .from(billingRecoveryNotice)
    .where(inArray(billingRecoveryNotice.id, [...ids]));

const makeDue = async (id: string): Promise<void> => {
  await database
    .update(billingRecoveryNotice)
    .set({ nextAttemptAt: sql`clock_timestamp() - interval '1 second'` })
    .where(eq(billingRecoveryNotice.id, id));
};

afterAll(async () => {
  await Promise.all([adminClient.end(), workerClient.end()]);
});

describe('billing recovery notices from the operations worker', { concurrent: false }, () => {
  it('should email the account owner for every notice kind, reading the owner under the worker role', async () => {
    const owner = await seedOwner();
    const ids = await queueNotices(owner.accountId, ['renewal_failed', 'consent_disabled', 'authentication_required']);

    const report = await payments.deliverRecoveryNotices({ environment: 'development', limit: 100 });

    expect(report.processed).toEqual(expect.arrayContaining(ids));
    const billingUrl = 'https://tau.example/?settings=billing';
    expect(
      sends.filter((sent) => sent.email === owner.email).toSorted((a, b) => a.template.localeCompare(b.template)),
    ).toStrictEqual([
      { template: 'auto-reload-action-required', email: owner.email, billingUrl },
      { template: 'auto-reload-disabled', email: owner.email, billingUrl },
      { template: 'payment-failed', email: owner.email, billingUrl },
    ]);
    for (const row of await noticeRows(ids)) {
      expect(row).toMatchObject({ state: 'delivered', deliveryReceipt: `email:${row.dedupeKey}`, attemptCount: 1 });
    }
  });

  it('should back off a failing notice and park it for an operator after its last attempt', async () => {
    const owner = await seedOwner();
    refusedRecipients.add(owner.email);
    const [id] = await queueNotices(owner.accountId, ['consent_disabled']);
    if (id === undefined) {
      throw new Error('Notice fixture missing');
    }

    for (let attempt = 1; attempt <= recoveryNoticeAttemptLimit; attempt += 1) {
      // The worker would find the notice due again once its backoff elapsed.
      // oxlint-disable-next-line no-await-in-loop -- one delivery pass per attempt, in order
      await makeDue(id);
      // oxlint-disable-next-line no-await-in-loop -- one delivery pass per attempt, in order
      const report = await payments.deliverRecoveryNotices({ environment: 'development', limit: 100 });
      // oxlint-disable-next-line no-await-in-loop -- one delivery pass per attempt, in order
      const [row] = await noticeRows([id]);
      if (attempt < recoveryNoticeAttemptLimit) {
        expect(report.failed).toContain(id);
        expect(report.abandoned).not.toContain(id);
        expect(row).toMatchObject({ state: 'pending', attemptCount: attempt, errorCode: 'delivery_failed' });
        // One minute, doubling with each failed attempt.
        const backoff = 60_000 * 2 ** (attempt - 1);
        const wait = (row?.nextAttemptAt.getTime() ?? 0) - Date.now();
        expect(wait).toBeGreaterThan(backoff - 10_000);
        expect(wait).toBeLessThanOrEqual(backoff);
      } else {
        expect(report.abandoned).toContain(id);
        expect(row).toMatchObject({
          state: 'pending',
          attemptCount: recoveryNoticeAttemptLimit,
          errorCode: 'delivery_abandoned',
          leaseUntil: null,
          nextAttemptAt: new Date('9999-12-31T00:00:00Z'),
        });
      }
    }
    const attempts = sends.filter((sent) => sent.email === owner.email).length;
    expect(attempts).toBe(recoveryNoticeAttemptLimit);

    await payments.deliverRecoveryNotices({ environment: 'development', limit: 100 });

    expect(sends.filter((sent) => sent.email === owner.email)).toHaveLength(attempts);
  });
});
