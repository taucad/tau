import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { BillingTaxService, classifyTaxEvidence, taxFactEvidenceSchema } from '#api/billing/billing-tax.service.js';
import type {
  QualifiedCashTaxCorrection,
  TaxFactEvidence,
  TaxFxResolver,
  TaxSourceClaim,
} from '#api/billing/billing-tax.service.js';
import { cashProjectionDigest } from '#api/billing/billing-payment-contract.js';
import type { CashProjectionEvidence, PaidPaymentEvidence } from '#api/billing/billing-payment-contract.js';
import { seedPaidPurchase } from '#testing/billing-payment.fixture.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { DatabaseService, DatabaseType } from '#database/database.service.js';
import type Stripe from 'stripe';
import * as schema from '#database/schema.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const evidence = (overrides: Partial<TaxFactEvidence> = {}): TaxFactEvidence =>
  taxFactEvidenceSchema.parse({
    version: 'tax-fact-evidence-v1',
    sourceComplete: true,
    countryCode: 'FR',
    countryEvidenceSource: 'invoice',
    customerType: 'consumer',
    vat: { type: null, countryCode: null, reference: null, validation: 'unavailable', validatedAt: null },
    currency: 'usd',
    principalMinor: '1100000',
    taxMinor: '0',
    grossMinor: '1100000',
    cumulativeRefundPrincipalMinor: '0',
    cumulativeRefundTaxMinor: '0',
    cumulativeRefundGrossMinor: '0',
    fx: {
      reportingCurrency: 'eur',
      numerator: '1',
      denominator: '1',
      provider: 'fixture',
      sourceRevision: 'fixture-1',
      effectiveAt: '2026-01-01T00:00:00.000Z',
      retrievedAt: '2026-01-02T00:00:00.000Z',
    },
    automaticTaxStatus: 'complete',
    productTaxCode: null,
    taxabilityReason: null,
    classificationReason: 'native fixture',
    lineage: { kind: 'sale', canonicalSourceId: 'invoice' },
    ...overrides,
  });

/* eslint-disable @typescript-eslint/naming-convention -- Stripe snapshots preserve provider field names */
/** A snapshot `paidTaxSourceIncompleteness` accepts: Stripe Tax completed and the retained tax matches the proof. */
const completeInvoice = (id: string): Stripe.Invoice =>
  ({
    id,
    customer_address: { country: 'FR' },
    customer_tax_ids: [],
    automatic_tax: { status: 'complete' },
    total_taxes: [{ amount: 0 }],
  }) as unknown as Stripe.Invoice;

const completeCheckout = (id: string): Stripe.Checkout.Session =>
  ({
    id,
    status: 'complete',
    automatic_tax: { status: 'complete' },
    total_details: { amount_tax: 0 },
    customer_details: { address: { country: 'FR' }, tax_ids: [] },
  }) as unknown as Stripe.Checkout.Session;
/* eslint-enable @typescript-eslint/naming-convention -- Stripe snapshot block ends */

const paidFor = (input: {
  suffix: string;
  stripeAccountId: string;
  principalMinor?: string;
  paidAt?: string;
}): PaidPaymentEvidence => ({
  version: 'stripe-paid-v1',
  stripeAccountId: input.stripeAccountId,
  livemode: false,
  customerId: `cus-${input.suffix}`,
  currency: 'usd',
  principalMinor: input.principalMinor ?? '1100000',
  taxMinor: '0',
  grossMinor: input.principalMinor ?? '1100000',
  paymentIntentIds: [`pi-${input.suffix}`],
  chargeIds: [`ch-${input.suffix}`],
  invoiceId: `in-${input.suffix}`,
  subscriptionId: null,
  subscriptionItemId: null,
  sourceDigest: 'a'.repeat(64),
  paidAt: input.paidAt ?? '2026-01-01T00:00:00.000Z',
  paymentMethod: null,
});

/** Production wires no reporting-rate resolver yet, so the monitor cases supply their own 1:1 rate. */
const fixtureFx: TaxFxResolver = async () => ({
  reportingCurrency: 'eur',
  numerator: '1',
  denominator: '1',
  provider: 'fixture',
  sourceRevision: 'fixture-1',
  effectiveAt: '2026-01-01T00:00:00.000Z',
  retrievedAt: '2026-01-02T00:00:00.000Z',
});

/**
 * Appends a superseding tax fact directly. `BillingTaxService.observe` is private so that no caller can record a
 * complete fact from an unfenced source, and no guarded entry point can produce an Invoice-source correction, so
 * the registration-monitor cases write the row the monitor reads.
 */
async function seedCorrectionFact(
  sql: postgres.Sql,
  input: {
    claim: TaxSourceClaim;
    accountId: string;
    supersedesFactId: string;
    effectiveAt: string;
    reportingRevenueMinor: bigint;
    evidence: TaxFactEvidence;
  },
): Promise<void> {
  await sql`insert into billing.billing_tax_fact
    (id,environment,stripe_account_id,livemode,account_id,source_type,source_id,source_claim_id,source_generation,
      source_digest,supersedes_fact_id,effective_at,classification,reporting_revenue_minor,evidence)
    values (${randomUUID()},${input.claim.environment},${input.claim.stripeAccountId},${input.claim.livemode},
      ${input.accountId},${input.claim.sourceType},${input.claim.sourceId},${input.claim.id},
      ${input.claim.generation.toString()}::bigint,${input.claim.digest},${input.supersedesFactId},
      ${input.effectiveAt}::timestamptz,${classifyTaxEvidence(input.evidence)},
      ${input.reportingRevenueMinor.toString()}::bigint,${JSON.stringify(input.evidence)}::jsonb)`;
}

async function fixture(
  run: (input: {
    sql: postgres.Sql;
    service: BillingTaxService;
    suffix: string;
    stripeAccountId: string;
    database: DatabaseService['database'];
  }) => Promise<void>,
): Promise<void> {
  const client = postgres(databaseUrl!, { max: 1, prepare: false });
  const suffix = randomUUID();
  const stripeAccountId = `acct-tax-${suffix}`;
  try {
    const database = drizzle(client, { schema });
    await run({
      sql: client,
      database,
      service: new BillingTaxService({ database } as DatabaseService, fixtureFx),
      suffix,
      stripeAccountId,
    });
  } finally {
    await client.end();
  }
}

async function source(
  sql: postgres.Sql,
  input: { id: string; stripeAccountId: string; sourceId: string; generation?: bigint },
): Promise<TaxSourceClaim> {
  const generation = input.generation ?? 1n;
  await sql`insert into billing.billing_stripe_source
    (id,environment,stripe_account_id,livemode,source_type,source_id,generation,lease_until,state,next_attempt_at)
    values (${input.id},'staging',${input.stripeAccountId},false,'invoice',${input.sourceId},${generation.toString()}::bigint,clock_timestamp()+interval '5 minutes','processing',clock_timestamp())`;
  return {
    id: input.id,
    environment: 'staging',
    stripeAccountId: input.stripeAccountId,
    livemode: false,
    sourceType: 'invoice',
    sourceId: input.sourceId,
    generation,
    digest: `digest-${generation.toString()}`,
  };
}

async function reclaim(sql: postgres.Sql, claim: TaxSourceClaim, generation: bigint): Promise<TaxSourceClaim> {
  await sql`update billing.billing_stripe_source set generation=${generation.toString()}::bigint, state='processing',
    lease_until=clock_timestamp()+interval '5 minutes' where id=${claim.id}`;
  return { ...claim, generation, digest: `digest-${generation.toString()}` };
}

/** Seeds one paid purchase cause plus its live canonical Charge claim from the shared payment fixture. */
async function cashCause(input: {
  sql: postgres.Sql;
  database: DatabaseType;
  suffix: string;
  stripeAccountId: string;
  accountId: string;
}): Promise<{
  purchaseId: string;
  sourceId: string;
  paid: PaidPaymentEvidence;
  initial: CashProjectionEvidence;
  corrected: CashProjectionEvidence;
}> {
  const seeded = await seedPaidPurchase({
    database: input.database,
    accountId: input.accountId,
    environment: 'staging',
    atoms: 50_000n,
    stripeAccountId: input.stripeAccountId,
  });
  const paid = seeded.proof.paidEvidence;
  const sourceId = `cash-staging-${seeded.proof.chargeId}`;
  const initial: CashProjectionEvidence = {
    version: 'stripe-cash-projection-v1',
    stripeAccountId: input.stripeAccountId,
    livemode: false,
    customerId: paid.customerId,
    paymentIntentId: seeded.proof.paymentIntentId,
    chargeId: seeded.proof.chargeId,
    currency: 'usd',
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
  await input.sql`insert into billing.billing_stripe_source
    (id,environment,stripe_account_id,livemode,source_type,source_id,generation,lease_until,state,next_attempt_at)
    values (${sourceId},'staging',${input.stripeAccountId},false,'cash_charge',${seeded.proof.chargeId},1,
      clock_timestamp()+interval '5 minutes','processing',clock_timestamp())`;
  return {
    purchaseId: seeded.purchaseId,
    sourceId,
    paid,
    initial,
    corrected: {
      ...initial,
      principalLossMinor: '200',
      grossLossMinor: '200',
      refundIds: [`refund-${input.suffix}`],
      balanceTransactionIds: [`txn-${input.suffix}`],
    },
  };
}

const refundSources = (suffix: string): NonNullable<QualifiedCashTaxCorrection['taxCorrectionEvidence']>['sources'] => [
  { kind: 'refund', id: `refund-${suffix}`, created: 1_770_336_000 },
];

const correctionEvidence = (suffix: string): NonNullable<QualifiedCashTaxCorrection['taxCorrectionEvidence']> => ({
  effectiveAt: new Date(refundSources(suffix)[0]!.created * 1000).toISOString(),
  sourceDigest: digest(refundSources(suffix)),
  sources: refundSources(suffix),
});

async function ownedAccount(sql: postgres.Sql, suffix: string): Promise<{ userId: string; accountId: string }> {
  const userId = `user-${suffix}`;
  const accountId = `account-${suffix}`;
  await sql`insert into public."user" (id,name,email,email_verified,allows_ai_training,created_at,updated_at)
    values (${userId},'Tax fixture',${`${suffix}@example.invalid`},true,true,now(),now())`;
  await sql`insert into billing.credit_account (id,environment,status) values (${accountId},'staging','open')`;
  await sql`insert into billing.billing_owner_binding (id,account_id,environment,auth_user_id)
    values (${`binding-${suffix}`},${accountId},'staging',${userId})`;
  return { userId, accountId };
}

// These are authored for the isolated native billing job; this task does not start PostgreSQL.
describe.runIf(databaseUrl !== undefined)('tax PostgreSQL source and registration foundation', () => {
  it('derives a late cumulative refund from the live cash claim and immutable paid cause', async () =>
    fixture(async ({ sql, database, service, suffix, stripeAccountId }) => {
      const owner = await ownedAccount(sql, suffix);
      const cause = await cashCause({ sql, database, suffix, stripeAccountId, accountId: owner.accountId });
      const sale = await service.observePaidSource({
        claim: {
          id: cause.sourceId,
          environment: 'staging',
          stripeAccountId,
          livemode: false,
          sourceType: 'cash_charge',
          sourceId: cause.initial.chargeId,
          generation: 1n,
          digest: cashProjectionDigest(cause.initial),
        },
        accountId: owner.accountId,
        paidEvidence: cause.paid,
        checkout: completeCheckout(`cs-${suffix}`),
      });
      if (sale === undefined) {
        throw new Error('Tax sale fixture missing');
      }
      await sql`update billing.billing_stripe_source set generation=2 where id=${cause.sourceId}`;
      const correctedDigest = cashProjectionDigest(cause.corrected);
      const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
      const correction = await database.transaction(async (transaction) => {
        await ledger.applyCashDisposition(
          {
            accountId: owner.accountId,
            causeId: cause.purchaseId,
            source: 'purchased',
            sourceClaimId: cause.sourceId,
            sourceGeneration: 2n,
            projectionDigest: correctedDigest,
            principalLossMinor: 200n,
            taxLossMinor: 0n,
            grossLossMinor: 200n,
            evidence: cause.corrected,
            occurredAt: new Date('2026-02-06T00:00:00Z'),
          },
          transaction,
        );
        return service.observeQualifiedCashCorrection({
          transaction,
          causeId: cause.purchaseId,
          source: 'purchased',
          qualified: {
            sourceClaimId: cause.sourceId,
            sourceGeneration: 2n,
            projectionDigest: correctedDigest,
            evidence: cause.corrected,
            taxCorrectionEvidence: correctionEvidence(suffix),
          },
        });
      });
      if (correction === undefined) {
        throw new Error('Tax correction fixture missing');
      }
      expect(correction.factId).not.toBe(sale.factId);
      const stored = await database.query.billingTaxFact.findFirst({
        where: (table, operators) => operators.eq(table.id, correction.factId),
      });
      expect(stored).toMatchObject({ supersedesFactId: sale.factId });
      if (stored === undefined) {
        throw new Error('Stored tax correction fixture missing');
      }
      expect((stored.evidence as TaxFactEvidence).cumulativeRefundGrossMinor).toBe('200');
      expect((stored.evidence as TaxFactEvidence).lineage.kind).toBe('refund');
    }));

  it('records a missing sale-lineage gap beside the verified financial correction', async () =>
    fixture(async ({ sql, database, service, suffix, stripeAccountId }) => {
      const owner = await ownedAccount(sql, suffix);
      const cause = await cashCause({ sql, database, suffix, stripeAccountId, accountId: owner.accountId });
      const correctedDigest = cashProjectionDigest(cause.corrected);
      const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
      const correction = await database.transaction(async (transaction) => {
        await ledger.applyCashDisposition(
          {
            accountId: owner.accountId,
            causeId: cause.purchaseId,
            source: 'purchased',
            sourceClaimId: cause.sourceId,
            sourceGeneration: 1n,
            projectionDigest: correctedDigest,
            principalLossMinor: 200n,
            taxLossMinor: 0n,
            grossLossMinor: 200n,
            evidence: cause.corrected,
            occurredAt: new Date('2026-02-06T00:00:00Z'),
          },
          transaction,
        );
        return service.observeQualifiedCashCorrection({
          transaction,
          causeId: cause.purchaseId,
          source: 'purchased',
          qualified: {
            sourceClaimId: cause.sourceId,
            sourceGeneration: 1n,
            projectionDigest: correctedDigest,
            evidence: cause.corrected,
            taxCorrectionEvidence: correctionEvidence(suffix),
          },
        });
      });
      expect(correction).toBeUndefined();
      const [reversal] = await sql`select cumulative_gross_loss_minor as loss
        from billing.billing_reversal_case where purchase_id=${cause.purchaseId}`;
      expect(reversal?.['loss']).toBe('200');
      const gap = await database.query.billingFinancialCase.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.stripeAccountId, stripeAccountId),
            operators.eq(table.kind, 'tax_incomplete_source'),
          ),
      });
      expect(gap).toMatchObject({
        dedupeKey: `incomplete_source:cash_charge:${cause.initial.chargeId}`,
        state: 'open',
        owner: 'finance',
      });
      const facts = await database.query.billingTaxFact.findMany({
        where: (table, operators) => operators.eq(table.stripeAccountId, stripeAccountId),
      });
      expect(facts).toHaveLength(0);
    }));

  it('rejects a correction whose predecessor contradicts the verified original components', async () =>
    fixture(async ({ sql, database, service, suffix, stripeAccountId }) => {
      const owner = await ownedAccount(sql, suffix);
      const cause = await cashCause({ sql, database, suffix, stripeAccountId, accountId: owner.accountId });
      await service.observePaidSource({
        claim: {
          id: cause.sourceId,
          environment: 'staging',
          stripeAccountId,
          livemode: false,
          sourceType: 'cash_charge',
          sourceId: cause.initial.chargeId,
          generation: 1n,
          digest: cashProjectionDigest(cause.initial),
        },
        accountId: owner.accountId,
        // The recorded sale snapshot describes different money than the reversal case's verified originals.
        paidEvidence: { ...cause.paid, principalMinor: '1100000', grossMinor: '1100000' },
        checkout: completeCheckout(`cs-${suffix}`),
      });
      await sql`update billing.billing_stripe_source set generation=2 where id=${cause.sourceId}`;
      const correctedDigest = cashProjectionDigest(cause.corrected);
      const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
      await expect(
        database.transaction(async (transaction) => {
          await ledger.applyCashDisposition(
            {
              accountId: owner.accountId,
              causeId: cause.purchaseId,
              source: 'purchased',
              sourceClaimId: cause.sourceId,
              sourceGeneration: 2n,
              projectionDigest: correctedDigest,
              principalLossMinor: 200n,
              taxLossMinor: 0n,
              grossLossMinor: 200n,
              evidence: cause.corrected,
              occurredAt: new Date('2026-02-06T00:00:00Z'),
            },
            transaction,
          );
          return service.observeQualifiedCashCorrection({
            transaction,
            causeId: cause.purchaseId,
            source: 'purchased',
            qualified: {
              sourceClaimId: cause.sourceId,
              sourceGeneration: 2n,
              projectionDigest: correctedDigest,
              evidence: cause.corrected,
              taxCorrectionEvidence: correctionEvidence(suffix),
            },
          });
        }),
      ).rejects.toThrow('tax_cash_original_components_mismatch');
    }));

  it('records an actionable incomplete-tax case when Stripe Tax did not complete', async () =>
    fixture(async ({ sql, database, service, suffix, stripeAccountId }) => {
      const owner = await ownedAccount(sql, suffix);
      const cause = await cashCause({ sql, database, suffix, stripeAccountId, accountId: owner.accountId });
      /* eslint-disable @typescript-eslint/naming-convention -- Stripe snapshot preserves provider field names */
      const failed = {
        id: `in-${suffix}`,
        customer_address: { country: 'FR' },
        customer_tax_ids: [],
        automatic_tax: { status: 'failed' },
        total_taxes: [{ amount: 0 }],
      } as unknown as Stripe.Invoice;
      /* eslint-enable @typescript-eslint/naming-convention -- Stripe snapshot block ends */
      const observed = await service.observePaidSource({
        claim: {
          id: cause.sourceId,
          environment: 'staging',
          stripeAccountId,
          livemode: false,
          sourceType: 'cash_charge',
          sourceId: cause.initial.chargeId,
          generation: 1n,
          digest: cashProjectionDigest(cause.initial),
        },
        accountId: owner.accountId,
        paidEvidence: { ...cause.paid, invoiceId: `in-${suffix}` },
        invoice: failed,
      });
      expect(observed).toBeUndefined();
      const facts = await database.query.billingTaxFact.findMany({
        where: (table, operators) => operators.eq(table.stripeAccountId, stripeAccountId),
      });
      expect(facts).toHaveLength(0);
      const gap = await database.query.billingFinancialCase.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.stripeAccountId, stripeAccountId),
            operators.eq(table.kind, 'tax_incomplete_source'),
          ),
      });
      expect(gap?.evidence).toMatchObject({
        triggers: [{ reason: 'incomplete_source', detail: 'automatic_tax_status:failed' }],
      });
    }));

  it('keeps a missing reporting rate actionable instead of counting zero revenue', async () =>
    fixture(async ({ sql, database, suffix, stripeAccountId }) => {
      const owner = await ownedAccount(sql, suffix);
      const claim = await source(sql, { id: `source-${suffix}`, stripeAccountId, sourceId: `in-${suffix}` });
      // Production wires no reporting-rate resolver, so a monitored consumer sale projects without FX.
      const service = new BillingTaxService({ database } as DatabaseService);
      const observed = await service.observePaidSource({
        claim,
        accountId: owner.accountId,
        paidEvidence: paidFor({ suffix, stripeAccountId }),
        invoice: completeInvoice(`in-${suffix}`),
      });
      expect(observed).toMatchObject({ classification: 'eu_b2c', reportingRevenueMinor: null });
      const gap = await database.query.billingFinancialCase.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.stripeAccountId, stripeAccountId),
            operators.eq(table.kind, 'tax_fx_missing'),
          ),
      });
      expect(gap).toMatchObject({ dedupeKey: `fx:invoice:in-${suffix}`, state: 'open', owner: 'finance' });
      await expect(
        service.evaluateRegistration({ environment: 'staging', stripeAccountId, livemode: false, asOf: new Date() }),
      ).resolves.toBeUndefined();
    }));

  it('rejects an expired claim, then permits exact replay after a reclaimed generation only', async () =>
    fixture(async ({ sql, service, suffix, stripeAccountId }) => {
      const owner = await ownedAccount(sql, suffix);
      const initial = await source(sql, { id: `source-${suffix}`, stripeAccountId, sourceId: `in-${suffix}` });
      const paidEvidence = paidFor({ suffix, stripeAccountId });
      const snapshot = { accountId: owner.accountId, paidEvidence, invoice: completeInvoice(`in-${suffix}`) };
      const first = await service.observePaidSource({ claim: initial, ...snapshot });
      if (first === undefined) {
        throw new Error('Tax sale fixture missing');
      }
      const renewed = await reclaim(sql, initial, 2n);
      const replay = await service.observePaidSource({ claim: { ...renewed, digest: initial.digest }, ...snapshot });
      expect(replay?.factId).toBe(first.factId);
      await expect(
        service.observePaidSource({
          claim: { ...renewed, digest: initial.digest },
          ...snapshot,
          paidEvidence: { ...paidEvidence, paidAt: '2026-01-02T00:00:00.000Z' },
        }),
      ).rejects.toThrow('tax_source_replay_payload_mismatch');
      await sql`update billing.billing_stripe_source set generation=3,lease_until=clock_timestamp()-interval '1 second' where id=${initial.id}`;
      await expect(service.observePaidSource({ claim: { ...initial, generation: 3n }, ...snapshot })).rejects.toThrow(
        'stale_tax_source_generation',
      );
    }));

  it('opens the original crossing when a later refund predates the first monitor run', async () =>
    fixture(async ({ sql, service, suffix, stripeAccountId }) => {
      const owner = await ownedAccount(sql, suffix);
      const initial = await source(sql, { id: `source-${suffix}`, stripeAccountId, sourceId: `in-${suffix}` });
      const sale = await service.observePaidSource({
        claim: initial,
        accountId: owner.accountId,
        paidEvidence: paidFor({ suffix, stripeAccountId }),
        invoice: completeInvoice(`in-${suffix}`),
      });
      if (sale === undefined) {
        throw new Error('Tax sale fixture missing');
      }
      await seedCorrectionFact(sql, {
        claim: await reclaim(sql, initial, 2n),
        accountId: owner.accountId,
        supersedesFactId: sale.factId,
        effectiveAt: '2026-02-01T00:00:00Z',
        reportingRevenueMinor: 900_000n,
        evidence: evidence({
          cumulativeRefundPrincipalMinor: '200000',
          cumulativeRefundGrossMinor: '200000',
          lineage: { kind: 'refund', canonicalSourceId: `refund-${suffix}` },
        }),
      });
      const result = await service.evaluateRegistration({
        environment: 'staging',
        stripeAccountId,
        livemode: false,
        asOf: new Date('2026-03-01T00:00:00Z'),
      });
      expect(result?.firstEffectiveAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    }));

  it('moves an existing registration quarter earlier for a late backdated correction', async () =>
    fixture(async ({ sql, service, suffix, stripeAccountId }) => {
      const owner = await ownedAccount(sql, suffix);
      const initial = await source(sql, { id: `source-${suffix}`, stripeAccountId, sourceId: `in-${suffix}` });
      const sale = await service.observePaidSource({
        claim: initial,
        accountId: owner.accountId,
        paidEvidence: paidFor({ suffix, stripeAccountId, paidAt: '2026-06-01T00:00:00.000Z' }),
        invoice: completeInvoice(`in-${suffix}`),
      });
      if (sale === undefined) {
        throw new Error('Tax sale fixture missing');
      }
      await service.evaluateRegistration({
        environment: 'staging',
        stripeAccountId,
        livemode: false,
        asOf: new Date('2026-07-01T00:00:00Z'),
      });
      await seedCorrectionFact(sql, {
        claim: await reclaim(sql, initial, 2n),
        accountId: owner.accountId,
        supersedesFactId: sale.factId,
        effectiveAt: '2026-01-01T00:00:00Z',
        reportingRevenueMinor: 2_100_000n,
        evidence: evidence({
          principalMinor: '2100000',
          grossMinor: '2100000',
          lineage: { kind: 'correction', canonicalSourceId: `correction-${suffix}` },
        }),
      });
      const result = await service.evaluateRegistration({
        environment: 'staging',
        stripeAccountId,
        livemode: false,
        asOf: new Date('2026-07-01T00:00:00Z'),
      });
      expect(result?.firstEffectiveAt).toEqual(new Date('2026-01-01T00:00:00Z'));
      expect(result?.deadlineAt).toEqual(new Date('2026-03-31T23:59:59.999Z'));
    }));

  it('dedupes enterprise retries and retains enterprise plus threshold trigger provenance', async () =>
    fixture(async ({ sql, service, suffix, stripeAccountId }) => {
      const owner = await ownedAccount(sql, suffix);
      const claim = await source(sql, { id: `source-${suffix}`, stripeAccountId, sourceId: `in-${suffix}` });
      const paid = paidFor({ suffix, stripeAccountId, paidAt: '2026-01-15T00:00:00.000Z' });
      await sql`insert into billing.billing_period
        (id,account_id,source_identity,credit_atoms,period_start,period_end,invoice_id,paid_evidence,paid_at)
        values (${`period-${suffix}`},${owner.accountId},${`period-source-${suffix}`},1,'2026-01-01','2026-02-01',${`in-${suffix}`},${JSON.stringify(paid)}::jsonb,'2026-01-15')`;
      await sql`insert into billing.billing_period
        (id,account_id,source_identity,credit_atoms,period_start,period_end,invoice_id,paid_evidence,paid_at)
        values (${`period-other-${suffix}`},${owner.accountId},${`period-other-source-${suffix}`},1,'2026-02-01','2026-03-01',${`in-other-${suffix}`},${JSON.stringify({ ...paid, invoiceId: `in-other-${suffix}`, sourceDigest: 'b'.repeat(64) })}::jsonb,'2026-02-15')`;
      const request: Parameters<BillingTaxService['requestOwnedEnterpriseVatInvoice']>[0] = {
        environment: 'staging',
        authUserId: owner.userId,
        invoiceId: `in-${suffix}`,
        requestId: 'invoice-request-1',
      };
      const first = await service.requestOwnedEnterpriseVatInvoice(request);
      const replay = await service.requestOwnedEnterpriseVatInvoice(request);
      expect(replay.caseId).toBe(first.caseId);
      await expect(
        service.requestOwnedEnterpriseVatInvoice({ ...request, invoiceId: `in-other-${suffix}` }),
      ).rejects.toThrow('tax_invoice_request_conflict');
      await expect(
        service.requestOwnedEnterpriseVatInvoice({
          ...request,
          invoiceId: `in-missing-${suffix}`,
          requestId: 'missing',
        }),
      ).rejects.toThrow('tax_owned_paid_invoice_not_found');
      await service.observePaidSource({
        claim,
        accountId: owner.accountId,
        paidEvidence: paid,
        invoice: completeInvoice(`in-${suffix}`),
      });
      const result = await service.evaluateRegistration({
        environment: 'staging',
        stripeAccountId,
        livemode: false,
        asOf: new Date('2026-03-01T00:00:00Z'),
      });
      const triggers = (result?.evidence as { triggers?: unknown[] } | undefined)?.triggers;
      expect(triggers).toHaveLength(2);
      expect(triggers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ requestId: 'invoice-request-1' }),
          expect.objectContaining({ thresholdMinor: '1000000' }),
        ]),
      );
      expect(result).toMatchObject({ currency: 'eur', knownAmountMinor: 1_100_000n });
      const later = await service.requestOwnedEnterpriseVatInvoice({
        ...request,
        invoiceId: `in-other-${suffix}`,
        requestId: 'invoice-request-2',
      });
      expect(later.caseId).toBe(result?.id);
      const retained = await service.evaluateRegistration({
        environment: 'staging',
        stripeAccountId,
        livemode: false,
        asOf: new Date('2026-03-01T00:00:00Z'),
      });
      expect(retained).toMatchObject({
        currency: 'eur',
        knownAmountMinor: 1_100_000n,
        firstEffectiveAt: new Date('2026-01-15T00:00:00Z'),
      });
      expect((retained?.evidence as { triggers?: unknown[] } | undefined)?.triggers).toHaveLength(3);
    }));
});

it('produces a different canonical digest for a correction instead of mutating the old observation', () => {
  const base = evidence();
  const correction = evidence({
    cumulativeRefundPrincipalMinor: '500',
    cumulativeRefundGrossMinor: '500',
    lineage: { kind: 'refund', canonicalSourceId: 're_1' },
  });
  expect(digest(base)).not.toBe(digest(correction));
});
