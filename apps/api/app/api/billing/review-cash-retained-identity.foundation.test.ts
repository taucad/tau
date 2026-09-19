import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { cashProjectionDigest } from '#api/billing/billing-payment-contract.js';
import type { CashProjectionEvidence } from '#api/billing/billing-payment-contract.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { seedPaidPurchase } from '#testing/billing-payment.fixture.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const runtimeClient = postgres(databaseUrl, { max: 2, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(adminClient, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });
const ledger = new CreditLedgerService(
  { database: runtimeDatabase },
  new BillingPolicyService({ database: runtimeDatabase }),
);
const stripeAccountId = 'acct_review_retained_identity';

afterAll(async () => {
  await Promise.all([adminClient.end(), runtimeClient.end()]);
});

/** Paid purchase of 500 minor for 1000 atoms with a live cash claim, ready for a ledger-level disposition. */
async function fixture() {
  const accountId = randomUUID();
  await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development' });
  const purchase = await seedPaidPurchase({
    database,
    accountId,
    environment: 'development',
    atoms: 1000n,
    stripeAccountId,
  });
  const claimId = createHash('sha256')
    .update(JSON.stringify(['development', stripeAccountId, false, purchase.proof.chargeId]))
    .digest('hex');
  await database.insert(schema.billingStripeSource).values({
    id: claimId,
    environment: 'development',
    stripeAccountId,
    livemode: false,
    sourceType: 'cash_charge',
    sourceId: purchase.proof.chargeId,
    state: 'processing',
    generation: 1n,
    leaseUntil: sql`clock_timestamp() + interval '30 seconds'`,
  });
  return { accountId, purchase, claimId };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function projectionOf(
  value: Fixture,
  input: {
    readonly principalLossMinor: string;
    readonly refundIds: readonly string[];
    readonly disputeIds: readonly string[];
    readonly balanceTransactionIds: readonly string[];
  },
): CashProjectionEvidence {
  return {
    version: 'stripe-cash-projection-v1',
    stripeAccountId,
    livemode: false,
    customerId: value.purchase.proof.paidEvidence.customerId,
    paymentIntentId: value.purchase.proof.paymentIntentId,
    chargeId: value.purchase.proof.chargeId,
    currency: 'usd',
    originalPrincipalMinor: '500',
    originalTaxMinor: '0',
    originalGrossMinor: '500',
    principalLossMinor: input.principalLossMinor,
    taxLossMinor: '0',
    grossLossMinor: input.principalLossMinor,
    refundIds: [...input.refundIds].sort(),
    disputeIds: [...input.disputeIds].sort(),
    balanceTransactionIds: [...input.balanceTransactionIds].sort(),
  };
}

async function apply(value: Fixture, projection: CashProjectionEvidence, generation: bigint) {
  return ledger.applyCashDisposition({
    accountId: value.accountId,
    causeId: value.purchase.purchaseId,
    source: 'purchased',
    sourceClaimId: value.claimId,
    sourceGeneration: generation,
    projectionDigest: cashProjectionDigest(projection),
    principalLossMinor: BigInt(projection.principalLossMinor),
    taxLossMinor: 0n,
    grossLossMinor: BigInt(projection.grossLossMinor),
    evidence: projection,
    occurredAt: new Date(),
  });
}

async function reclaim(value: Fixture, generation: bigint): Promise<void> {
  await database
    .update(schema.billingStripeSource)
    .set({ state: 'processing', generation, leaseUntil: sql`clock_timestamp() + interval '30 seconds'` })
    .where(eq(schema.billingStripeSource.id, value.claimId));
}

/** Every durable money fact the disposition could move, for an exact before/after comparison. */
async function money(value: Fixture) {
  const [account] = await database
    .select()
    .from(schema.creditAccount)
    .where(eq(schema.creditAccount.id, value.accountId));
  const [cashCase] = await database
    .select()
    .from(schema.billingReversalCase)
    .where(eq(schema.billingReversalCase.purchaseId, value.purchase.purchaseId));
  const transactions = await database
    .select()
    .from(schema.creditTransaction)
    .where(eq(schema.creditTransaction.accountId, value.accountId))
    .orderBy(schema.creditTransaction.revision);
  return {
    balance: {
      promoAtoms: account?.promoAtoms,
      planAtoms: account?.planAtoms,
      purchasedAtoms: account?.purchasedAtoms,
      debtAtoms: account?.debtAtoms,
      revision: account?.revision,
    },
    cashCase: {
      originalAtoms: cashCase?.originalAtoms,
      initialIssuedAtoms: cashCase?.initialIssuedAtoms,
      withheldAtoms: cashCase?.withheldAtoms,
      deferredIssuedAtoms: cashCase?.deferredIssuedAtoms,
      netAppliedAtoms: cashCase?.netAppliedAtoms,
      cumulativePrincipalLossMinor: cashCase?.cumulativePrincipalLossMinor,
      cumulativeGrossLossMinor: cashCase?.cumulativeGrossLossMinor,
      projectionDigest: cashCase?.projectionDigest,
      projectionSourceGeneration: cashCase?.projectionSourceGeneration,
      projectionEvidence: cashCase?.projectionEvidence,
    },
    transactions: transactions.map((entry) => ({
      kind: entry.kind,
      accountDeltaAtoms: entry.accountDeltaAtoms,
    })),
  };
}

const retention = {
  refund: { refundIds: ['re_retained'], disputeIds: [], balanceTransactionIds: ['txn_refund_movement'] },
  dispute: { refundIds: [], disputeIds: ['dp_retained'], balanceTransactionIds: ['txn_dispute_withdrawal'] },
  balanceTransaction: { refundIds: ['re_kept'], disputeIds: [], balanceTransactionIds: ['txn_retained'] },
} as const;

/**
 * Seeds a retained projection carrying one provider identity, then offers a later projection that omits exactly
 * that identity while claiming the cash came back. The money boundary must refuse it and move nothing, and must
 * still accept the same restoration once the identity is carried forward.
 */
async function assertOmissionRefused(kind: keyof typeof retention): Promise<void> {
  const value = await fixture();
  const retained = retention[kind];
  const first = projectionOf(value, { principalLossMinor: '200', ...retained });
  const receipt = await apply(value, first, 1n);
  expect(receipt.grantedAtoms).toBe(600n);
  await reclaim(value, 2n);
  const before = await money(value);
  expect(before.balance.purchasedAtoms).toBe(600n);
  expect(before.cashCase).toMatchObject({ initialIssuedAtoms: 600n, withheldAtoms: 400n, deferredIssuedAtoms: 0n });

  const omitted = projectionOf(value, {
    principalLossMinor: '0',
    refundIds: kind === 'refund' ? [] : retained.refundIds,
    disputeIds: kind === 'dispute' ? [] : retained.disputeIds,
    balanceTransactionIds: kind === 'balanceTransaction' ? [] : retained.balanceTransactionIds,
  });
  await expect(apply(value, omitted, 2n)).rejects.toThrow('Cash projection omits retained source identities');
  expect(await money(value)).toEqual(before);

  const covered = projectionOf(value, {
    principalLossMinor: '0',
    refundIds: retained.refundIds,
    disputeIds: retained.disputeIds,
    balanceTransactionIds: [...retained.balanceTransactionIds, 'txn_restoring_movement'],
  });
  await apply(value, covered, 2n);
  const after = await money(value);
  expect(after.balance.purchasedAtoms).toBe(1000n);
  expect(after.cashCase).toMatchObject({ deferredIssuedAtoms: 400n, cumulativePrincipalLossMinor: 0n });
  expect(after.transactions).toEqual([
    { kind: 'purchase_grant', accountDeltaAtoms: 600n },
    { kind: 'deferred_grant', accountDeltaAtoms: 400n },
  ]);
}

describe('cash retained identity money boundary', () => {
  it('refuses a projection that omits a retained refund identity', async () => {
    await assertOmissionRefused('refund');
  });

  it('refuses a projection that omits a retained dispute identity', async () => {
    await assertOmissionRefused('dispute');
  });

  it('refuses a projection that omits a retained balance transaction identity', async () => {
    await assertOmissionRefused('balanceTransaction');
  });
});
