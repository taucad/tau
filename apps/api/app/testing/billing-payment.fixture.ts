import type { PaidCauseReceipt } from '#api/billing/credit-ledger.types.js';
import { and, eq, sql } from 'drizzle-orm';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { paidPaymentEvidenceSchema, cashProjectionDigest } from '#api/billing/billing-payment-contract.js';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseType } from '#database/database.service.js';
import {
  billingPurchase,
  billingPeriod,
  billingStripeCustomer,
  billingStripeSource,
  creditAccount,
} from '#database/schema.js';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type {
  PaymentOfferSnapshot,
  PaidPaymentEvidence,
  CashProjectionEvidence,
} from '#api/billing/billing-payment-contract.js';

/** Explicit controlled source facts for ledger tests; HTTP source qualification is tested separately. */
export async function seedPaidPurchase(input: {
  database: DatabaseType;
  accountId: string;
  environment: FinancialEnvironment;
  atoms: bigint;
  prepared?: boolean;
  stripeAccountId?: string;
}): Promise<{
  purchaseId: string;
  proof: { paidAt: Date; paidEvidence: PaidPaymentEvidence; paymentIntentId: string; chargeId: string };
}> {
  const id = randomUUID();
  const stripeAccountId = input.stripeAccountId ?? 'acct_fixture';
  const customerBindingId = `customer-${id}`;
  const paidAt = new Date();
  const offerSnapshot: PaymentOfferSnapshot = {
    version: 'payment-offer-v1',
    policyId: 'fixture-policy',
    offerId: 'fixture-topup',
    environment: input.environment,
    accountId: input.accountId,
    stripeAccountId,
    livemode: false,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    maximumGrossMinor: '500',
    creditAtoms: input.atoms.toString(),
    ceilingCreditAtoms: null,
    stripePriceId: null,
    stripeProductId: 'prod_fixture',
    quantity: 1,
    term: 'one_time',
    taxBasis: 'synthetic_local_zero_tax',
    paymentMethod: null,
  };
  const paidEvidence: PaidPaymentEvidence = {
    version: 'stripe-paid-v1',
    stripeAccountId,
    livemode: false,
    customerId: `cus_${id}`,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    paymentIntentIds: [`pi_${id}`],
    chargeIds: [`ch_${id}`],
    invoiceId: null,
    subscriptionId: null,
    subscriptionItemId: null,
    sourceDigest: '0'.repeat(64),
    paidAt: paidAt.toISOString(),
    paymentMethod: null,
  };
  await input.database.insert(billingStripeCustomer).values({
    id: customerBindingId,
    accountId: input.accountId,
    environment: input.environment,
    stripeAccountId,
    livemode: false,
    stripeCustomerId: `cus_${id}`,
  });
  const proof = { paidAt, paidEvidence, paymentIntentId: `pi_${id}`, chargeId: `ch_${id}` };
  await input.database.insert(billingPurchase).values({
    id,
    accountId: input.accountId,
    sourceIdentity: `purchase:${id}`,
    offerSnapshot,
    creditAtoms: input.atoms,
    state: input.prepared ? 'prepared' : 'paid_unfulfilled',
    customerBindingId,
    requestId: id,
    requestHash: '0'.repeat(64),
    purpose: 'manual_checkout',
    stripeAccountId,
    livemode: false,
    ...(input.prepared ? {} : proof),
  });
  return { purchaseId: id, proof };
}

/** Controlled complete zero-loss source observation; provider completeness is qualified by separate transport suites. */
export async function fulfillPaidFixture(input: {
  database: DatabaseType;
  ledger: CreditLedgerService;
  accountId: string;
  causeId: string;
  source: 'plan' | 'purchased';
}): Promise<PaidCauseReceipt> {
  const [account] = await input.database.select().from(creditAccount).where(eq(creditAccount.id, input.accountId));
  const [cause] =
    input.source === 'plan'
      ? await input.database.select().from(billingPeriod).where(eq(billingPeriod.id, input.causeId))
      : await input.database.select().from(billingPurchase).where(eq(billingPurchase.id, input.causeId));
  if (!account || !cause) {
    throw new Error('Fixture paid cause is missing');
  }
  const paid = paidPaymentEvidenceSchema.parse(cause.paidEvidence);
  const evidence: CashProjectionEvidence = {
    version: 'stripe-cash-projection-v1',
    stripeAccountId: paid.stripeAccountId,
    livemode: paid.livemode,
    customerId: paid.customerId,
    paymentIntentId: paid.paymentIntentIds[0]!,
    chargeId: paid.chargeIds[0]!,
    currency: paid.currency,
    originalPrincipalMinor: paid.principalMinor,
    originalTaxMinor: paid.taxMinor,
    originalGrossMinor: paid.grossMinor,
    principalLossMinor: '0',
    taxLossMinor: '0',
    grossLossMinor: '0',
    refundIds: [],
    disputeIds: [],
    balanceTransactionIds: [],
  };
  const id = createHash('sha256')
    .update(JSON.stringify([account.environment, paid.stripeAccountId, paid.livemode, evidence.chargeId]))
    .digest('hex');
  const [claim] = await input.database
    .insert(billingStripeSource)
    .values({
      id,
      environment: account.environment,
      stripeAccountId: paid.stripeAccountId,
      livemode: paid.livemode,
      sourceType: 'cash_charge',
      sourceId: evidence.chargeId,
      state: 'processing',
      generation: 1n,
      leaseUntil: sql`clock_timestamp() + interval '5 minutes'`,
    })
    .onConflictDoUpdate({
      target: [
        billingStripeSource.environment,
        billingStripeSource.stripeAccountId,
        billingStripeSource.livemode,
        billingStripeSource.sourceType,
        billingStripeSource.sourceId,
      ],
      set: {
        state: 'processing',
        generation: sql`${billingStripeSource.generation} + 1`,
        leaseUntil: sql`clock_timestamp() + interval '5 minutes'`,
      },
    })
    .returning();
  if (!claim) {
    throw new Error('Fixture cash claim is missing');
  }
  return input.database.transaction(async (tx) => {
    const receipt = await input.ledger.applyCashDisposition(
      {
        accountId: input.accountId,
        causeId: input.causeId,
        source: input.source,
        sourceClaimId: claim.id,
        sourceGeneration: claim.generation,
        projectionDigest: cashProjectionDigest(evidence),
        principalLossMinor: 0n,
        taxLossMinor: 0n,
        grossLossMinor: 0n,
        evidence,
        occurredAt: new Date(),
      },
      tx,
    );
    await tx
      .update(billingStripeSource)
      .set({ state: 'done', leaseUntil: null })
      .where(and(eq(billingStripeSource.id, claim.id), eq(billingStripeSource.generation, claim.generation)));
    return receipt;
  });
}
