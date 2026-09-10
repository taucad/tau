import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { PaidPaymentEvidence, PaymentOfferSnapshot } from '#api/billing/billing-payment-contract.js';
import { seedPaidPurchase, fulfillPaidFixture } from '#testing/billing-payment.fixture.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use the isolated billing launcher');
}
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const runtimeClient = postgres(databaseUrl, {
  max: 2,
  prepare: false,
  connection: { role: 'tau_billing_runtime' },
});
const database = drizzle(adminClient, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });
const ledger = new CreditLedgerService(
  { database: runtimeDatabase },
  new BillingPolicyService({ database: runtimeDatabase }),
);

afterAll(async () => Promise.all([adminClient.end(), runtimeClient.end()]));

const createAccount = async () => {
  const accountId = randomUUID();
  await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development' });
  return accountId;
};

const monthlyOffer = (accountId: string): PaymentOfferSnapshot => ({
  version: 'payment-offer-v1',
  policyId: 'source-policy',
  offerId: 'pro-monthly',
  environment: 'development',
  accountId,
  stripeAccountId: 'acct_fixture',
  livemode: false,
  currency: 'usd',
  principalMinor: '2000',
  taxMinor: '0',
  grossMinor: '2000',
  maximumGrossMinor: '2000',
  creditAtoms: '20000000',
  ceilingCreditAtoms: '40000000',
  stripePriceId: 'price_monthly',
  stripeProductId: null,
  quantity: 1,
  term: 'month',
  taxBasis: 'synthetic_local_zero_tax',
  paymentMethod: null,
});

const seedPeriod = async (input: {
  accountId: string;
  paymentIntentId: string;
  chargeId: string;
  periodStart: Date;
  periodEnd: Date;
}) => {
  const suffix = randomUUID();
  const bindingId = `customer-${suffix}`;
  const subscriptionId = `subscription-${suffix}`;
  const invoiceId = `in_${suffix}`;
  const customerId = `cus_${suffix}`;
  const remoteSubscriptionId = `sub_${suffix}`;
  const offer = monthlyOffer(input.accountId);
  const paidAt = new Date('2026-09-06T00:00:00.000Z');
  const evidence: PaidPaymentEvidence = {
    version: 'stripe-paid-v1',
    stripeAccountId: 'acct_fixture',
    livemode: false,
    customerId,
    currency: 'usd',
    principalMinor: '2000',
    taxMinor: '0',
    grossMinor: '2000',
    paymentIntentIds: [input.paymentIntentId],
    chargeIds: [input.chargeId],
    invoiceId,
    subscriptionId: remoteSubscriptionId,
    subscriptionItemId: `si_${suffix}`,
    sourceDigest: suffix.replaceAll('-', '').repeat(2),
    paidAt: paidAt.toISOString(),
    paymentMethod: null,
  };
  await database.insert(schema.billingStripeCustomer).values({
    id: bindingId,
    accountId: input.accountId,
    environment: 'development',
    stripeAccountId: 'acct_fixture',
    livemode: false,
    stripeCustomerId: customerId,
  });
  await database.insert(schema.subscription).values({
    id: subscriptionId,
    plan: 'pro',
    referenceId: `financial:${subscriptionId}`,
    stripeCustomerId: customerId,
    stripeSubscriptionId: remoteSubscriptionId,
    accountId: input.accountId,
    environment: 'development',
    customerBindingId: bindingId,
    requestId: randomUUID(),
    requestHash: 'a'.repeat(64),
    offerSnapshot: offer,
    slotState: 'current',
    status: 'active',
  });
  const periodId = randomUUID();
  await database.insert(schema.billingPeriod).values({
    id: periodId,
    accountId: input.accountId,
    sourceIdentity: `period:${periodId}`,
    creditAtoms: 20_000_000n,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    subscriptionId,
    invoiceId,
    offerSnapshot: offer,
    paidEvidence: evidence,
    state: 'verified',
    paidAt,
  });
  return periodId;
};

const seedSiblingPeriod = async (input: {
  accountId: string;
  priorPeriodId: string;
  periodStart: Date;
  periodEnd: Date;
}) => {
  const [prior] = await database
    .select()
    .from(schema.billingPeriod)
    .where(eq(schema.billingPeriod.id, input.priorPeriodId));
  if (
    prior?.subscriptionId === null ||
    prior?.subscriptionId === undefined ||
    prior.offerSnapshot === null ||
    prior.paidEvidence === null
  ) {
    throw new Error('Prior period fixture is incomplete');
  }
  const suffix = randomUUID();
  const periodId = randomUUID();
  const invoiceId = `in_${suffix}`;
  const evidence: PaidPaymentEvidence = {
    ...prior.paidEvidence,
    paymentIntentIds: [`pi_${suffix}`],
    chargeIds: [`ch_${suffix}`],
    invoiceId,
    sourceDigest: suffix.replaceAll('-', '').repeat(2),
  };
  await database.insert(schema.billingPeriod).values({
    id: periodId,
    accountId: input.accountId,
    sourceIdentity: `period:${periodId}`,
    creditAtoms: prior.creditAtoms,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    subscriptionId: prior.subscriptionId,
    invoiceId,
    offerSnapshot: prior.offerSnapshot,
    paidEvidence: evidence,
    state: 'verified',
    paidAt: prior.paidAt,
  });
  return periodId;
};

describe('billing collected-source PostgreSQL foundation', () => {
  it.each([
    {
      kind: 'PaymentIntent',
      sharedId: `pi_${randomUUID()}`,
      firstOtherId: `ch_${randomUUID()}`,
      secondOtherId: `ch_${randomUUID()}`,
      constraint: 'credit_transaction_payment_intent',
    },
    {
      kind: 'Charge',
      sharedId: `ch_${randomUUID()}`,
      firstOtherId: `pi_${randomUUID()}`,
      secondOtherId: `pi_${randomUUID()}`,
      constraint: 'credit_transaction_charge',
    },
  ])('prevents one $kind from funding periods in different accounts', async (fixture) => {
    const firstAccount = await createAccount();
    const secondAccount = await createAccount();
    const sharesPaymentIntent = fixture.kind === 'PaymentIntent';
    const first = await seedPeriod({
      accountId: firstAccount,
      paymentIntentId: sharesPaymentIntent ? fixture.sharedId : fixture.firstOtherId,
      chargeId: sharesPaymentIntent ? fixture.firstOtherId : fixture.sharedId,
      periodStart: new Date('2026-01-01Z'),
      periodEnd: new Date('2026-02-01Z'),
    });
    const second = await seedPeriod({
      accountId: secondAccount,
      paymentIntentId: sharesPaymentIntent ? fixture.sharedId : fixture.secondOtherId,
      chargeId: sharesPaymentIntent ? fixture.secondOtherId : fixture.sharedId,
      periodStart: new Date('2026-02-01Z'),
      periodEnd: new Date('2026-03-01Z'),
    });
    await fulfillPaidFixture({
      database,
      ledger,
      source: 'plan',
      accountId: firstAccount,
      causeId: first,
    });
    await expect(
      fulfillPaidFixture({
        database,
        ledger,
        source: 'plan',
        accountId: secondAccount,
        causeId: second,
      }),
    ).rejects.toMatchObject({
      cause: Object.fromEntries([
        ['code', '23505'],
        ['constraint_name', fixture.constraint],
      ]),
    });
    const [secondCause] = await database.select().from(schema.billingPeriod).where(eq(schema.billingPeriod.id, second));
    expect(secondCause).toMatchObject({ state: 'verified', receiptId: null });
    const [secondAccountAfter] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, secondAccount));
    expect(secondAccountAfter).toMatchObject({ planAtoms: 0n, revision: 0n });
  });

  it('prevents one collected source from funding a purchase and a period', async () => {
    const purchaseAccount = await createAccount();
    const periodAccount = await createAccount();
    const purchase = await seedPaidPurchase({
      database,
      accountId: purchaseAccount,
      environment: 'development',
      atoms: 5_000_000n,
    });
    const billingPeriodId = await seedPeriod({
      accountId: periodAccount,
      paymentIntentId: purchase.proof.paymentIntentId,
      chargeId: purchase.proof.chargeId,
      periodStart: new Date('2026-03-01Z'),
      periodEnd: new Date('2026-04-01Z'),
    });
    await fulfillPaidFixture({
      database,
      ledger,
      source: 'purchased',
      accountId: purchaseAccount,
      causeId: purchase.purchaseId,
    });
    await expect(
      fulfillPaidFixture({
        database,
        ledger,
        source: 'plan',
        accountId: periodAccount,
        causeId: billingPeriodId,
      }),
    ).rejects.toMatchObject({
      cause: Object.fromEntries([
        ['code', '23505'],
        ['constraint_name', 'credit_transaction_payment_intent'],
      ]),
    });
    const receipts = await database
      .select()
      .from(schema.creditTransaction)
      .where(eq(schema.creditTransaction.paymentIntentId, purchase.proof.paymentIntentId));
    expect(receipts).toHaveLength(1);
    const [periodAccountAfter] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, periodAccount));
    expect(periodAccountAfter).toMatchObject({ planAtoms: 0n, revision: 0n });
  });

  it('rejects a stored purchase whose frozen scope differs from its paid evidence', async () => {
    const accountId = await createAccount();
    const purchaseId = randomUUID();
    const customerBindingId = `customer-${purchaseId}`;
    const customerId = `cus_${purchaseId}`;
    const paidAt = new Date('2026-09-06T00:00:00.000Z');
    const offer = {
      ...monthlyOffer(accountId),
      offerId: 'topup',
      principalMinor: '500',
      grossMinor: '500',
      maximumGrossMinor: '500',
      creditAtoms: '5000000',
      ceilingCreditAtoms: null,
      stripePriceId: null,
      stripeProductId: 'prod_fixture',
      term: 'one_time',
    } satisfies PaymentOfferSnapshot;
    const evidence = {
      version: 'stripe-paid-v1',
      stripeAccountId: 'acct_fixture',
      livemode: false,
      customerId,
      currency: 'usd',
      principalMinor: '500',
      taxMinor: '0',
      grossMinor: '500',
      paymentIntentIds: [`pi_${purchaseId}`],
      chargeIds: [`ch_${purchaseId}`],
      invoiceId: null,
      subscriptionId: null,
      subscriptionItemId: null,
      sourceDigest: '0'.repeat(64),
      paidAt: paidAt.toISOString(),
      paymentMethod: null,
    } satisfies PaidPaymentEvidence;
    await database.insert(schema.billingStripeCustomer).values({
      id: customerBindingId,
      accountId,
      environment: 'development',
      stripeAccountId: 'acct_fixture',
      livemode: false,
      stripeCustomerId: customerId,
    });
    await database.insert(schema.billingPurchase).values({
      id: purchaseId,
      accountId,
      sourceIdentity: `purchase:${purchaseId}`,
      offerSnapshot: offer,
      creditAtoms: 5_000_000n,
      state: 'paid_unfulfilled',
      customerBindingId,
      requestId: purchaseId,
      requestHash: '0'.repeat(64),
      purpose: 'manual_checkout',
      stripeAccountId: 'acct_wrong',
      livemode: false,
      paidAt,
      paidEvidence: evidence,
      paymentIntentId: evidence.paymentIntentIds[0],
      chargeId: evidence.chargeIds[0],
    });
    await expect(
      fulfillPaidFixture({
        database,
        ledger,
        source: 'purchased',
        accountId,
        causeId: purchaseId,
      }),
    ).rejects.toThrow('Paid purchase scope does not match its evidence');
    const [account] = await database.select().from(schema.creditAccount).where(eq(schema.creditAccount.id, accountId));
    expect(account?.purchasedAtoms).toBe(0n);
  });

  it('allows adjacent periods but rejects overlapping paid periods before a second grant', async () => {
    const accountId = await createAccount();
    const first = await seedPeriod({
      accountId,
      paymentIntentId: `pi_${randomUUID()}`,
      chargeId: `ch_${randomUUID()}`,
      periodStart: new Date('2026-04-01Z'),
      periodEnd: new Date('2026-05-01Z'),
    });
    const adjacent = await seedSiblingPeriod({
      accountId,
      priorPeriodId: first,
      periodStart: new Date('2026-05-01Z'),
      periodEnd: new Date('2026-06-01Z'),
    });
    await fulfillPaidFixture({
      database,
      ledger,
      source: 'plan',
      accountId,
      causeId: first,
    });
    await fulfillPaidFixture({
      database,
      ledger,
      source: 'plan',
      accountId,
      causeId: adjacent,
    });
    const overlapping = await seedSiblingPeriod({
      accountId,
      priorPeriodId: first,
      periodStart: new Date('2026-05-15Z'),
      periodEnd: new Date('2026-06-15Z'),
    });
    await expect(
      fulfillPaidFixture({
        database,
        ledger,
        source: 'plan',
        accountId,
        causeId: overlapping,
      }),
    ).rejects.toMatchObject({
      response: { code: 'overlapping_paid_period' },
    });
    const receipts = await database
      .select()
      .from(schema.creditTransaction)
      .where(eq(schema.creditTransaction.accountId, accountId));
    expect(receipts.filter((receipt) => receipt.kind === 'period_grant')).toHaveLength(2);
  });
});
