import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { BillingTaxService, taxFactEvidenceSchema } from '#api/billing/billing-tax.service.js';
import type { QualifiedCashTaxCorrection, TaxFactEvidence, TaxSourceClaim } from '#api/billing/billing-tax.service.js';
import { cashProjectionDigest } from '#api/billing/billing-payment-contract.js';
import type { CashProjectionEvidence } from '#api/billing/billing-payment-contract.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { DatabaseService } from '#database/database.service.js';
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
      service: new BillingTaxService({ database } as DatabaseService),
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
      const chargeId = `ch-${suffix}`;
      const paymentIntentId = `pi-${suffix}`;
      const sourceId = `cash-staging-${chargeId}`;
      const periodId = `period-cash-${suffix}`;
      const customerBindingId = `customer-cash-${suffix}`;
      const subscriptionId = `subscription-cash-${suffix}`;
      const initialProjection: CashProjectionEvidence = {
        version: 'stripe-cash-projection-v1',
        stripeAccountId,
        livemode: false,
        customerId: `cus-${suffix}`,
        paymentIntentId,
        chargeId,
        currency: 'usd',
        originalPrincipalMinor: '1100000',
        originalTaxMinor: '0',
        originalGrossMinor: '1100000',
        principalLossMinor: '0',
        taxLossMinor: '0',
        grossLossMinor: '0',
        refundIds: [],
        disputeIds: [],
        balanceTransactionIds: [],
      };
      const correctedProjection = {
        ...initialProjection,
        principalLossMinor: '200000',
        grossLossMinor: '200000',
        refundIds: [`refund-${suffix}`],
        balanceTransactionIds: [`txn-${suffix}`],
      };
      const initialDigest = cashProjectionDigest(initialProjection);
      const correctedDigest = cashProjectionDigest(correctedProjection);
      await sql`insert into billing.billing_stripe_source
        (id,environment,stripe_account_id,livemode,source_type,source_id,generation,lease_until,state,next_attempt_at)
        values (${sourceId},'staging',${stripeAccountId},false,'cash_charge',${chargeId},1,clock_timestamp()+interval '5 minutes','processing',clock_timestamp())`;
      const paid = {
        version: 'stripe-paid-v1',
        stripeAccountId,
        livemode: false,
        customerId: `cus-${suffix}`,
        currency: 'usd',
        principalMinor: '1100000',
        taxMinor: '0',
        grossMinor: '1100000',
        paymentIntentIds: [paymentIntentId],
        chargeIds: [chargeId],
        invoiceId: `invoice-${suffix}`,
        subscriptionId: `sub-${suffix}`,
        subscriptionItemId: `si-${suffix}`,
        sourceDigest: 'c'.repeat(64),
        paidAt: '2026-01-01T00:00:00.000Z',
        paymentMethod: null,
      };
      const offer = {
        version: 'payment-offer-v1',
        policyId: `policy-${suffix}`,
        offerId: 'pro-monthly',
        environment: 'staging',
        accountId: owner.accountId,
        stripeAccountId,
        livemode: false,
        currency: 'usd',
        principalMinor: '1100000',
        taxMinor: '0',
        grossMinor: '1100000',
        maximumGrossMinor: '1100000',
        creditAtoms: '1',
        ceilingCreditAtoms: null,
        stripePriceId: null,
        stripeProductId: null,
        quantity: 1,
        term: 'month',
        taxBasis: 'stripe_tax',
        paymentMethod: null,
      };
      await sql`insert into billing.billing_stripe_customer
        (id,account_id,environment,stripe_account_id,livemode,stripe_customer_id)
        values (${customerBindingId},${owner.accountId},'staging',${stripeAccountId},false,${paid.customerId})`;
      await sql`insert into public.subscription
        (id,plan,reference_id,stripe_customer_id,stripe_subscription_id,status,account_id,environment,customer_binding_id,
         request_id,request_hash,offer_snapshot,slot_state)
        values (${subscriptionId},'pro',${`reference-${suffix}`},${paid.customerId},${paid.subscriptionId},'active',${owner.accountId},
          'staging',${customerBindingId},'request','hash',${JSON.stringify(offer)}::jsonb,'current')`;
      await sql`insert into billing.billing_period
        (id,account_id,source_identity,credit_atoms,period_start,period_end,subscription_id,invoice_id,offer_snapshot,paid_evidence,paid_at)
        values (${periodId},${owner.accountId},${`period-cash-source-${suffix}`},1,'2026-01-01','2026-02-01',${subscriptionId},${paid.invoiceId},
          ${JSON.stringify(offer)}::jsonb,${JSON.stringify(paid)}::jsonb,'2026-01-01')`;
      const sale = await service.observeInvoice({
        claim: {
          id: sourceId,
          environment: 'staging',
          stripeAccountId,
          livemode: false,
          sourceType: 'cash_charge',
          sourceId: chargeId,
          generation: 1n,
          digest: initialDigest,
        },
        accountId: owner.accountId,
        effectiveAt: new Date(paid.paidAt),
        evidence: evidence({ lineage: { kind: 'sale', canonicalSourceId: chargeId } }),
      });
      await sql`update billing.billing_stripe_source set generation=2 where id=${sourceId}`;
      const sources: NonNullable<QualifiedCashTaxCorrection['taxCorrectionEvidence']>['sources'] = [
        { kind: 'refund', id: `refund-${suffix}`, created: 1_770_336_000 },
      ];
      const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
      const correction = await database.transaction(async (transaction) => {
        await ledger.applyCashDisposition(
          {
            accountId: owner.accountId,
            causeId: periodId,
            source: 'plan',
            sourceClaimId: sourceId,
            sourceGeneration: 2n,
            projectionDigest: correctedDigest,
            principalLossMinor: 200_000n,
            taxLossMinor: 0n,
            grossLossMinor: 200_000n,
            evidence: correctedProjection,
            occurredAt: new Date('2026-02-06T00:00:00Z'),
          },
          transaction,
        );
        return service.observeQualifiedCashCorrection({
          transaction,
          causeId: periodId,
          source: 'plan',
          qualified: {
            sourceClaimId: sourceId,
            sourceGeneration: 2n,
            projectionDigest: correctedDigest,
            evidence: correctedProjection,
            taxCorrectionEvidence: {
              effectiveAt: new Date(sources[0]!.created * 1000).toISOString(),
              sourceDigest: digest(sources),
              sources,
            },
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
      expect((stored.evidence as TaxFactEvidence).cumulativeRefundGrossMinor).toBe('200000');
    }));

  it('rejects an expired claim, then permits exact replay after a reclaimed generation only', async () =>
    fixture(async ({ sql, service, suffix, stripeAccountId }) => {
      const initial = await source(sql, { id: `source-${suffix}`, stripeAccountId, sourceId: `in-${suffix}` });
      const at = new Date('2026-01-01T00:00:00Z');
      const factEvidence = evidence();
      const first = await service.observeInvoice({ claim: initial, effectiveAt: at, evidence: factEvidence });
      const renewed = await reclaim(sql, initial, 2n);
      const replay = await service.observeInvoice({
        claim: { ...renewed, digest: initial.digest },
        effectiveAt: at,
        evidence: factEvidence,
      });
      expect(replay.factId).toBe(first.factId);
      await expect(
        service.observeInvoice({
          claim: { ...renewed, digest: initial.digest },
          effectiveAt: new Date('2026-01-02T00:00:00Z'),
          evidence: factEvidence,
        }),
      ).rejects.toThrow('tax_source_replay_payload_mismatch');
      await sql`update billing.billing_stripe_source set generation=3,lease_until=clock_timestamp()-interval '1 second' where id=${initial.id}`;
      await expect(
        service.observeInvoice({ claim: { ...initial, generation: 3n }, effectiveAt: at, evidence: factEvidence }),
      ).rejects.toThrow('stale_tax_source_generation');
    }));

  it('opens the original crossing when a later refund predates the first monitor run', async () =>
    fixture(async ({ sql, service, suffix, stripeAccountId }) => {
      const initial = await source(sql, { id: `source-${suffix}`, stripeAccountId, sourceId: `in-${suffix}` });
      const sale = await service.observeInvoice({
        claim: initial,
        effectiveAt: new Date('2026-01-01T00:00:00Z'),
        evidence: evidence(),
      });
      const renewed = await reclaim(sql, initial, 2n);
      await service.observeCorrection({
        claim: renewed,
        effectiveAt: new Date('2026-02-01T00:00:00Z'),
        supersedesFactId: sale.factId,
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
      const initial = await source(sql, { id: `source-${suffix}`, stripeAccountId, sourceId: `in-${suffix}` });
      const sale = await service.observeInvoice({
        claim: initial,
        effectiveAt: new Date('2026-06-01T00:00:00Z'),
        evidence: evidence(),
      });
      await service.evaluateRegistration({
        environment: 'staging',
        stripeAccountId,
        livemode: false,
        asOf: new Date('2026-07-01T00:00:00Z'),
      });
      const renewed = await reclaim(sql, initial, 2n);
      await service.observeCorrection({
        claim: renewed,
        effectiveAt: new Date('2026-01-01T00:00:00Z'),
        supersedesFactId: sale.factId,
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
      const paid = {
        version: 'stripe-paid-v1',
        stripeAccountId,
        livemode: false,
        customerId: `cus-${suffix}`,
        currency: 'usd',
        principalMinor: '1100000',
        taxMinor: '0',
        grossMinor: '1100000',
        paymentIntentIds: [`pi-${suffix}`],
        chargeIds: [`ch-${suffix}`],
        invoiceId: `in-${suffix}`,
        subscriptionId: null,
        subscriptionItemId: null,
        sourceDigest: 'a'.repeat(64),
        paidAt: '2026-01-15T00:00:00.000Z',
        paymentMethod: null,
      };
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
      await service.observeInvoice({
        claim,
        accountId: owner.accountId,
        effectiveAt: new Date('2026-02-01T00:00:00Z'),
        evidence: evidence(),
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
