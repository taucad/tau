/* oxlint-disable typescript/no-restricted-types, unicorn/better-regex, typescript/promise-function-async, curly -- financial evidence preserves explicit null and compact validation guards */
import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type Stripe from 'stripe';
import type { WireFinancialCase } from '@taucad/billing';
import {
  cashProjectionDigest,
  cashProjectionEvidenceSchema,
  paidPaymentEvidenceSchema,
} from '#api/billing/billing-payment-contract.js';
import type { PaidPaymentEvidence } from '#api/billing/billing-payment-contract.js';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type { DatabaseService } from '#database/database.service.js';
import {
  billingFinancialCase,
  billingOwnerBinding,
  billingPeriod,
  billingPurchase,
  billingReversalCase,
  billingStripeSource,
  billingTaxFact,
} from '#database/schema.js';

export type DatabaseTransaction = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];

export type QualifiedCashTaxCorrection = {
  readonly sourceClaimId: string;
  readonly sourceGeneration: bigint;
  readonly projectionDigest: string;
  readonly evidence: unknown;
  readonly taxCorrectionEvidence?: {
    readonly effectiveAt: string;
    readonly sourceDigest: string;
    readonly sources: ReadonlyArray<{
      readonly kind: 'refund' | 'dispute_balance_transaction';
      readonly id: string;
      readonly created: number;
    }>;
  };
};

const money = z.string().regex(/^(0|[1-9]\d*)$/);
const euCountries = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);

export const taxFactEvidenceSchema = z
  .object({
    version: z.literal('tax-fact-evidence-v1'),
    sourceComplete: z.literal(true),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    countryEvidenceSource: z.enum(['tax_transaction', 'checkout', 'invoice', 'customer', 'card', 'unknown']),
    customerType: z.enum(['consumer', 'business', 'unknown']),
    vat: z
      .object({
        type: z.string().min(1).nullable(),
        countryCode: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .nullable(),
        reference: z.string().min(1).nullable(),
        validation: z.enum(['verified', 'unverified', 'unavailable']),
        validatedAt: z.iso.datetime({ offset: true }).nullable(),
      })
      .strict(),
    currency: z.string().regex(/^[a-z]{3}$/),
    principalMinor: money,
    taxMinor: money,
    grossMinor: money,
    cumulativeRefundPrincipalMinor: money,
    cumulativeRefundTaxMinor: money,
    cumulativeRefundGrossMinor: money,
    fx: z
      .object({
        reportingCurrency: z.literal('eur'),
        numerator: z.string().regex(/^[1-9]\d*$/),
        denominator: z.string().regex(/^[1-9]\d*$/),
        provider: z.string().min(1),
        sourceRevision: z.string().min(1),
        effectiveAt: z.iso.datetime({ offset: true }),
        retrievedAt: z.iso.datetime({ offset: true }),
      })
      .strict()
      .nullable(),
    automaticTaxStatus: z.string().min(1).nullable(),
    productTaxCode: z.string().min(1).nullable(),
    taxabilityReason: z.string().min(1).nullable(),
    classificationReason: z.string().min(1),
    lineage: z
      .object({ kind: z.enum(['sale', 'refund', 'correction', 'reinstatement']), canonicalSourceId: z.string().min(1) })
      .strict(),
    correctionSource: z
      .object({
        effectiveAt: z.iso.datetime({ offset: true }),
        sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
        sources: z
          .array(
            z
              .object({
                kind: z.enum(['refund', 'dispute_balance_transaction']),
                id: z.string().min(1),
                created: z.number().int().positive(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const principal = BigInt(value.principalMinor);
    const tax = BigInt(value.taxMinor);
    const gross = BigInt(value.grossMinor);
    const refundedPrincipal = BigInt(value.cumulativeRefundPrincipalMinor);
    const refundedTax = BigInt(value.cumulativeRefundTaxMinor);
    const refundedGross = BigInt(value.cumulativeRefundGrossMinor);
    if (principal + tax !== gross) context.addIssue({ code: 'custom', message: 'principal_plus_tax_must_equal_gross' });
    if (refundedPrincipal + refundedTax !== refundedGross || refundedPrincipal > principal || refundedTax > tax)
      context.addIssue({ code: 'custom', message: 'refund_must_be_component_bounded' });
  });

export type TaxFactEvidence = z.infer<typeof taxFactEvidenceSchema>;
export type TaxSourceClaim = {
  readonly id: string;
  readonly environment: FinancialEnvironment;
  readonly stripeAccountId: string;
  readonly livemode: boolean;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly generation: bigint;
  readonly digest: string;
};
export type TaxObservation = {
  readonly claim: TaxSourceClaim;
  readonly accountId?: string;
  readonly effectiveAt: Date;
  readonly supersedesFactId?: string;
  readonly evidence: TaxFactEvidence;
};

export type TaxObservationResult = {
  readonly factId: string;
  readonly classification: 'eu_b2c' | 'uk_b2c' | 'enterprise_vat_invoice' | 'outside_monitor' | 'unknown';
  readonly reportingRevenueMinor: bigint | null;
};

export type QualifiedTaxFx = NonNullable<TaxFactEvidence['fx']>;
export type TaxFxResolver = (input: {
  readonly currency: string;
  readonly reportingCurrency: 'eur';
  readonly effectiveAt: Date;
}) => Promise<QualifiedTaxFx | undefined>;

/** Appends source-fenced tax observations and derives operational cases without claiming tax authority. */
@Injectable()
export class BillingTaxService {
  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly resolveFx?: TaxFxResolver,
  ) {}

  /** Projects an already-qualified paid Stripe source into one immutable tax fact or an explicit gap. */
  public async observePaidSource(input: {
    readonly claim: TaxSourceClaim;
    readonly accountId: string;
    readonly paidEvidence: PaidPaymentEvidence;
    readonly checkout?: Stripe.Checkout.Session;
    readonly invoice?: Stripe.Invoice;
  }): Promise<TaxObservationResult | undefined> {
    if (
      input.paidEvidence.stripeAccountId !== input.claim.stripeAccountId ||
      input.paidEvidence.livemode !== input.claim.livemode
    ) {
      throw new Error('tax_paid_source_scope_mismatch');
    }
    const effectiveAt = new Date(input.paidEvidence.paidAt);
    const projected = await projectPaidTaxEvidence({
      paidEvidence: input.paidEvidence,
      checkout: input.checkout,
      invoice: input.invoice,
      resolveFx: this.resolveFx,
    });
    if (projected === undefined) {
      const existing = await this.currentFactForSource({ claim: input.claim, accountId: input.accountId });
      if (existing !== undefined) return existing;
      await this.recordObservationGap({ claim: input.claim, effectiveAt, reason: 'incomplete_source' });
      return undefined;
    }
    return this.observe({ claim: input.claim, accountId: input.accountId, effectiveAt, evidence: projected });
  }

  public async currentFactForSource(input: {
    readonly claim: TaxSourceClaim;
    readonly accountId: string;
  }): Promise<TaxObservationResult | undefined> {
    const facts = await this.databaseService.database.query.billingTaxFact.findMany({
      where: and(
        eq(billingTaxFact.environment, input.claim.environment),
        eq(billingTaxFact.stripeAccountId, input.claim.stripeAccountId),
        eq(billingTaxFact.livemode, input.claim.livemode),
        eq(billingTaxFact.sourceType, input.claim.sourceType),
        eq(billingTaxFact.sourceId, input.claim.sourceId),
        eq(billingTaxFact.accountId, input.accountId),
      ),
    });
    const superseded = new Set(
      facts.flatMap((fact) => (fact.supersedesFactId === null ? [] : [fact.supersedesFactId])),
    );
    const current = facts.find((fact) => !superseded.has(fact.id));
    return current === undefined
      ? undefined
      : {
          factId: current.id,
          classification: current.classification as TaxObservationResult['classification'],
          reportingRevenueMinor: current.reportingRevenueMinor,
        };
  }

  /** Appends a cumulative cash correction using only a live canonical Charge claim and persisted sale evidence. */
  public async observeQualifiedCashCorrection(input: {
    readonly transaction: DatabaseTransaction;
    readonly causeId: string;
    readonly source: 'plan' | 'purchased';
    readonly qualified: QualifiedCashTaxCorrection;
  }): Promise<TaxObservationResult | undefined> {
    const { transaction: tx } = input;
    const projection = cashProjectionEvidenceSchema.parse(input.qualified.evidence);
    if (cashProjectionDigest(projection) !== input.qualified.projectionDigest) {
      throw new Error('tax_cash_projection_digest_mismatch');
    }
    const [reversal] = await tx
      .select()
      .from(billingReversalCase)
      .where(
        input.source === 'plan'
          ? eq(billingReversalCase.periodId, input.causeId)
          : eq(billingReversalCase.purchaseId, input.causeId),
      )
      .for('update');
    if (
      reversal?.chargeId === null ||
      reversal?.chargeId === undefined ||
      reversal.paymentIntentId === null ||
      reversal.environment === null ||
      reversal.stripeAccountId === null ||
      reversal.livemode === null ||
      reversal.originalPrincipalMinor === null ||
      reversal.originalTaxMinor === null ||
      reversal.originalGrossMinor === null ||
      reversal.projectionSourceId !== input.qualified.sourceClaimId ||
      projection.chargeId !== reversal.chargeId ||
      projection.paymentIntentId !== reversal.paymentIntentId ||
      projection.stripeAccountId !== reversal.stripeAccountId ||
      projection.livemode !== reversal.livemode ||
      BigInt(projection.originalPrincipalMinor) !== reversal.originalPrincipalMinor ||
      BigInt(projection.originalTaxMinor) !== reversal.originalTaxMinor ||
      BigInt(projection.originalGrossMinor) !== reversal.originalGrossMinor
    ) {
      throw new Error('tax_cash_reversal_scope_mismatch');
    }
    const [cause] =
      reversal.source === 'plan' && reversal.periodId !== null
        ? await tx
            .select({ paidEvidence: billingPeriod.paidEvidence })
            .from(billingPeriod)
            .where(and(eq(billingPeriod.id, reversal.periodId), eq(billingPeriod.accountId, reversal.accountId)))
            .for('update')
        : reversal.source === 'purchased' && reversal.purchaseId !== null
          ? await tx
              .select({ paidEvidence: billingPurchase.paidEvidence })
              .from(billingPurchase)
              .where(
                and(eq(billingPurchase.id, reversal.purchaseId), eq(billingPurchase.accountId, reversal.accountId)),
              )
              .for('update')
          : [];
    const paid = paidPaymentEvidenceSchema.parse(cause?.paidEvidence);
    if (
      paid.stripeAccountId !== reversal.stripeAccountId ||
      paid.livemode !== reversal.livemode ||
      paid.customerId !== projection.customerId ||
      paid.paymentIntentIds.length !== 1 ||
      paid.paymentIntentIds[0] !== projection.paymentIntentId ||
      paid.chargeIds.length !== 1 ||
      paid.chargeIds[0] !== projection.chargeId
    ) {
      throw new Error('tax_cash_paid_proof_mismatch');
    }
    const claim: TaxSourceClaim = {
      id: input.qualified.sourceClaimId,
      environment: reversal.environment as FinancialEnvironment,
      stripeAccountId: reversal.stripeAccountId,
      livemode: reversal.livemode,
      sourceType: 'cash_charge',
      sourceId: reversal.chargeId,
      generation: input.qualified.sourceGeneration,
      digest: input.qualified.projectionDigest,
    };
    const facts = await tx.query.billingTaxFact.findMany({
      where: and(
        eq(billingTaxFact.environment, claim.environment),
        eq(billingTaxFact.stripeAccountId, claim.stripeAccountId),
        eq(billingTaxFact.livemode, claim.livemode),
        eq(billingTaxFact.sourceType, claim.sourceType),
        eq(billingTaxFact.sourceId, claim.sourceId),
        eq(billingTaxFact.accountId, reversal.accountId),
      ),
    });
    const superseded = new Set(
      facts.flatMap((fact) => (fact.supersedesFactId === null ? [] : [fact.supersedesFactId])),
    );
    const predecessor = facts.find((fact) => !superseded.has(fact.id));
    if (predecessor === undefined) {
      await this.recordObservationGap({ claim, effectiveAt: new Date(paid.paidAt), reason: 'incomplete_source' }, tx);
      return undefined;
    }
    const predecessorEvidence = taxFactEvidenceSchema.parse(withoutEvidenceDigest(predecessor.evidence));
    if (predecessor.sourceDigest === input.qualified.projectionDigest) {
      return {
        factId: predecessor.id,
        classification: predecessor.classification as TaxObservationResult['classification'],
        reportingRevenueMinor: predecessor.reportingRevenueMinor,
      };
    }
    const priorPrincipalLoss = BigInt(predecessorEvidence.cumulativeRefundPrincipalMinor);
    const priorTaxLoss = BigInt(predecessorEvidence.cumulativeRefundTaxMinor);
    const priorGrossLoss = BigInt(predecessorEvidence.cumulativeRefundGrossMinor);
    const nextPrincipalLoss = BigInt(projection.principalLossMinor);
    const nextTaxLoss = BigInt(projection.taxLossMinor);
    const nextGrossLoss = BigInt(projection.grossLossMinor);
    if (priorPrincipalLoss === nextPrincipalLoss && priorTaxLoss === nextTaxLoss && priorGrossLoss === nextGrossLoss)
      return undefined;
    const correction = parseCorrectionEvidence(input.qualified.taxCorrectionEvidence);
    const evidence = taxFactEvidenceSchema.parse({
      ...predecessorEvidence,
      cumulativeRefundPrincipalMinor: projection.principalLossMinor,
      cumulativeRefundTaxMinor: projection.taxLossMinor,
      cumulativeRefundGrossMinor: projection.grossLossMinor,
      lineage: {
        kind:
          nextGrossLoss < priorGrossLoss
            ? 'reinstatement'
            : correction.sources.every((source) => source.kind === 'refund')
              ? 'refund'
              : 'correction',
        canonicalSourceId: projection.chargeId,
      },
      correctionSource: correction,
    });
    return this.observe(
      {
        claim,
        accountId: reversal.accountId,
        effectiveAt: new Date(correction.effectiveAt),
        supersedesFactId: predecessor.id,
        evidence,
      },
      tx,
    );
  }

  public observeCheckout(input: TaxObservation): Promise<TaxObservationResult> {
    return this.observe(input);
  }

  public observeInvoice(input: TaxObservation): Promise<TaxObservationResult> {
    return this.observe(input);
  }

  public observeCorrection(input: TaxObservation): Promise<TaxObservationResult> {
    if (input.supersedesFactId === undefined) throw new Error('tax_correction_requires_predecessor');
    return this.observe(input);
  }

  public async observe(input: TaxObservation, transaction?: DatabaseTransaction): Promise<TaxObservationResult> {
    const evidence = taxFactEvidenceSchema.parse(input.evidence);
    const classification = classifyTaxEvidence(evidence);
    const qualifyingRevenue = BigInt(evidence.principalMinor) - BigInt(evidence.cumulativeRefundPrincipalMinor);
    const requiresReportingFx = classification === 'eu_b2c' || classification === 'uk_b2c';
    const reportingRevenueMinor =
      !requiresReportingFx || evidence.fx === null
        ? null
        : (qualifyingRevenue * BigInt(evidence.fx.numerator)) / BigInt(evidence.fx.denominator);
    const factId = randomUUID();
    const evidenceDigest = digest(evidence);
    const persist = async (tx: DatabaseTransaction): Promise<TaxObservationResult> => {
      await tx.execute(sql`select id from billing.billing_stripe_source where id = ${input.claim.id} for update`);
      const current = await tx.query.billingStripeSource.findFirst({
        where: and(
          eq(billingStripeSource.id, input.claim.id),
          eq(billingStripeSource.environment, input.claim.environment),
          eq(billingStripeSource.stripeAccountId, input.claim.stripeAccountId),
          eq(billingStripeSource.livemode, input.claim.livemode),
          eq(billingStripeSource.sourceType, input.claim.sourceType),
          eq(billingStripeSource.sourceId, input.claim.sourceId),
          eq(billingStripeSource.generation, input.claim.generation),
          eq(billingStripeSource.state, 'processing'),
          sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
        ),
      });
      if (current === undefined) throw new Error('stale_tax_source_generation');
      const replay = await tx.query.billingTaxFact.findFirst({
        where: and(
          eq(billingTaxFact.environment, input.claim.environment),
          eq(billingTaxFact.stripeAccountId, input.claim.stripeAccountId),
          eq(billingTaxFact.livemode, input.claim.livemode),
          eq(billingTaxFact.sourceType, input.claim.sourceType),
          eq(billingTaxFact.sourceId, input.claim.sourceId),
          eq(billingTaxFact.sourceDigest, input.claim.digest),
        ),
      });
      if (replay !== undefined) {
        const replayEvidence = replay.evidence as { evidenceDigest?: unknown };
        if (
          replayEvidence.evidenceDigest !== evidenceDigest ||
          replay.effectiveAt.getTime() !== input.effectiveAt.getTime() ||
          replay.accountId !== (input.accountId ?? null) ||
          replay.supersedesFactId !== (input.supersedesFactId ?? null)
        )
          throw new Error('tax_source_replay_payload_mismatch');
        return {
          factId: replay.id,
          classification: replay.classification as TaxObservationResult['classification'],
          reportingRevenueMinor: replay.reportingRevenueMinor,
        };
      }
      if (input.supersedesFactId === undefined) {
        const prior = await tx.query.billingTaxFact.findFirst({
          where: and(
            eq(billingTaxFact.environment, input.claim.environment),
            eq(billingTaxFact.stripeAccountId, input.claim.stripeAccountId),
            eq(billingTaxFact.livemode, input.claim.livemode),
            eq(billingTaxFact.sourceType, input.claim.sourceType),
            eq(billingTaxFact.sourceId, input.claim.sourceId),
          ),
        });
        if (prior !== undefined) throw new Error('tax_source_changed_without_supersession');
      }
      if (input.supersedesFactId !== undefined) {
        const predecessor = await tx.query.billingTaxFact.findFirst({
          where: and(
            eq(billingTaxFact.id, input.supersedesFactId),
            eq(billingTaxFact.environment, input.claim.environment),
            eq(billingTaxFact.stripeAccountId, input.claim.stripeAccountId),
            eq(billingTaxFact.livemode, input.claim.livemode),
            eq(billingTaxFact.sourceType, input.claim.sourceType),
            eq(billingTaxFact.sourceId, input.claim.sourceId),
          ),
        });
        if (predecessor === undefined) throw new Error('tax_predecessor_source_mismatch');
      }
      await tx.insert(billingTaxFact).values({
        id: factId,
        environment: input.claim.environment,
        stripeAccountId: input.claim.stripeAccountId,
        livemode: input.claim.livemode,
        accountId: input.accountId,
        sourceType: input.claim.sourceType,
        sourceId: input.claim.sourceId,
        sourceClaimId: input.claim.id,
        sourceGeneration: input.claim.generation,
        sourceDigest: input.claim.digest,
        supersedesFactId: input.supersedesFactId,
        effectiveAt: input.effectiveAt,
        classification,
        reportingRevenueMinor,
        evidence: { ...evidence, evidenceDigest },
      });
      if (classification === 'unknown')
        await this.upsertCase(
          tx,
          input.claim,
          'tax_classification_unknown',
          `classification:${input.claim.sourceType}:${input.claim.sourceId}`,
          input.effectiveAt,
          null,
          { factId },
        );
      else if (requiresReportingFx && evidence.fx === null)
        await this.upsertCase(
          tx,
          input.claim,
          'tax_fx_missing',
          `fx:${input.claim.sourceType}:${input.claim.sourceId}`,
          input.effectiveAt,
          null,
          { factId },
        );
      return { factId, classification, reportingRevenueMinor };
    };
    return transaction === undefined ? this.databaseService.database.transaction(persist) : persist(transaction);
  }

  public async recordObservationGap(
    input: {
      readonly claim: TaxSourceClaim;
      readonly effectiveAt: Date;
      readonly reason: 'incomplete_source' | 'missing_amounts' | 'missing_fx' | 'unknown_classification';
    },
    transaction?: DatabaseTransaction,
  ): Promise<void> {
    const persist = async (tx: DatabaseTransaction): Promise<void> => {
      await tx.execute(sql`select id from billing.billing_stripe_source where id = ${input.claim.id} for update`);
      const current = await tx.query.billingStripeSource.findFirst({
        where: and(
          eq(billingStripeSource.id, input.claim.id),
          eq(billingStripeSource.environment, input.claim.environment),
          eq(billingStripeSource.stripeAccountId, input.claim.stripeAccountId),
          eq(billingStripeSource.livemode, input.claim.livemode),
          eq(billingStripeSource.sourceType, input.claim.sourceType),
          eq(billingStripeSource.sourceId, input.claim.sourceId),
          eq(billingStripeSource.generation, input.claim.generation),
          eq(billingStripeSource.state, 'processing'),
          sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
        ),
      });
      if (current === undefined) throw new Error('stale_tax_source_generation');
      await this.upsertCase(
        tx,
        input.claim,
        `tax_${input.reason}`,
        `${input.reason}:${input.claim.sourceType}:${input.claim.sourceId}`,
        input.effectiveAt,
        null,
        { reason: input.reason, sourceGeneration: input.claim.generation.toString() },
      );
    };
    await (transaction === undefined ? this.databaseService.database.transaction(persist) : persist(transaction));
  }

  public async evaluateRegistration(input: {
    readonly environment: FinancialEnvironment;
    readonly stripeAccountId: string;
    readonly livemode: boolean;
    readonly asOf: Date;
  }): Promise<typeof billingFinancialCase.$inferSelect | undefined> {
    const rows = await this.databaseService.database
      .select({
        id: billingTaxFact.id,
        supersedesFactId: billingTaxFact.supersedesFactId,
        amount: billingTaxFact.reportingRevenueMinor,
        effectiveAt: billingTaxFact.effectiveAt,
      })
      .from(billingTaxFact)
      .where(
        and(
          eq(billingTaxFact.environment, input.environment),
          eq(billingTaxFact.stripeAccountId, input.stripeAccountId),
          eq(billingTaxFact.livemode, input.livemode),
          inMonitorClassification(),
          lte(billingTaxFact.effectiveAt, input.asOf),
        ),
      )
      .limit(10_001);
    const claim: TaxSourceClaim = {
      id: 'rolling-monitor',
      environment: input.environment,
      stripeAccountId: input.stripeAccountId,
      livemode: input.livemode,
      sourceType: 'rolling_monitor',
      sourceId: 'eu-uk-b2c',
      generation: 1n,
      digest: 'derived',
    };
    if (rows.length > 10_000) {
      await this.databaseService.database.transaction((tx) =>
        this.upsertCase(tx, claim, 'tax_monitor_incomplete', 'eu-uk-b2c-fact-bound', input.asOf, null, {
          maximumFacts: 10_000,
        }),
      );
      return undefined;
    }
    const threshold = earliestRollingCrossing(rows, 1_000_000n);
    const crossing = threshold?.effectiveAt;
    const crossingTotal = threshold?.amount ?? 0n;
    if (crossing === undefined) {
      return this.databaseService.database.query.billingFinancialCase.findFirst({
        where: and(
          eq(billingFinancialCase.environment, input.environment),
          eq(billingFinancialCase.stripeAccountId, input.stripeAccountId),
          eq(billingFinancialCase.livemode, input.livemode),
          eq(billingFinancialCase.kind, 'tax_registration_review'),
          eq(billingFinancialCase.dedupeKey, 'eu-uk-b2c-rolling-12-month'),
        ),
      });
    }
    await this.databaseService.database.transaction((tx) =>
      this.upsertCase(tx, claim, 'tax_registration_review', 'eu-uk-b2c-rolling-12-month', crossing, crossingTotal, {
        thresholdMinor: '1000000',
      }),
    );
    return this.databaseService.database.query.billingFinancialCase.findFirst({
      where: and(
        eq(billingFinancialCase.environment, input.environment),
        eq(billingFinancialCase.stripeAccountId, input.stripeAccountId),
        eq(billingFinancialCase.livemode, input.livemode),
        eq(billingFinancialCase.kind, 'tax_registration_review'),
        eq(billingFinancialCase.dedupeKey, 'eu-uk-b2c-rolling-12-month'),
      ),
    });
  }

  public async requestEnterpriseVatInvoice(input: {
    readonly claim: TaxSourceClaim;
    readonly effectiveAt: Date;
    readonly accountId: string;
    readonly authUserId: string;
    readonly requestId: string;
  }): Promise<void> {
    await this.databaseService.database.transaction(async (tx) => {
      await tx.execute(sql`select id from billing.credit_account where id=${input.accountId} for update`);
      const owner = await tx.query.billingOwnerBinding.findFirst({
        where: and(
          eq(billingOwnerBinding.environment, input.claim.environment),
          eq(billingOwnerBinding.accountId, input.accountId),
          eq(billingOwnerBinding.authUserId, input.authUserId),
          isNull(billingOwnerBinding.revokedAt),
        ),
      });
      if (owner === undefined) throw new Error('tax_invoice_owner_not_found');
      await this.upsertCase(
        tx,
        input.claim,
        'tax_registration_review',
        'eu-uk-b2c-rolling-12-month',
        input.effectiveAt,
        null,
        {
          accountId: input.accountId,
          requestId: input.requestId,
        },
      );
    });
  }

  /** Opens the seller registration case from an authenticated, already-persisted paid Invoice period. */
  public async requestOwnedEnterpriseVatInvoice(input: {
    readonly environment: FinancialEnvironment;
    readonly authUserId: string;
    readonly invoiceId: string;
    readonly requestId: string;
  }): Promise<WireFinancialCase> {
    const discovered = await this.databaseService.database.query.billingOwnerBinding.findFirst({
      where: and(
        eq(billingOwnerBinding.environment, input.environment),
        eq(billingOwnerBinding.authUserId, input.authUserId),
        isNull(billingOwnerBinding.revokedAt),
      ),
    });
    if (discovered === undefined) throw new Error('tax_invoice_owner_not_found');
    return this.databaseService.database.transaction(async (tx) => {
      await tx.execute(sql`select id from billing.credit_account where id=${discovered.accountId} for update`);
      const owner = await tx.query.billingOwnerBinding.findFirst({
        where: and(
          eq(billingOwnerBinding.id, discovered.id),
          eq(billingOwnerBinding.environment, input.environment),
          eq(billingOwnerBinding.accountId, discovered.accountId),
          eq(billingOwnerBinding.authUserId, input.authUserId),
          isNull(billingOwnerBinding.revokedAt),
        ),
      });
      if (owner === undefined) throw new Error('tax_invoice_owner_changed');
      const periods = await tx
        .select()
        .from(billingPeriod)
        .where(and(eq(billingPeriod.accountId, discovered.accountId), eq(billingPeriod.invoiceId, input.invoiceId)))
        .limit(1)
        .for('update');
      const billingPeriodRow = periods[0];
      if (
        billingPeriodRow?.paidEvidence === null ||
        billingPeriodRow?.paidEvidence === undefined ||
        billingPeriodRow.paidAt === null
      )
        throw new Error('tax_owned_paid_invoice_not_found');
      const paid = billingPeriodRow.paidEvidence;
      const requestDigest = digest({
        accountId: discovered.accountId,
        invoiceId: input.invoiceId,
        requestId: input.requestId,
        paidSourceDigest: paid.sourceDigest,
      });
      const existing = await tx.query.billingFinancialCase.findFirst({
        where: and(
          eq(billingFinancialCase.environment, input.environment),
          eq(billingFinancialCase.stripeAccountId, paid.stripeAccountId),
          eq(billingFinancialCase.livemode, paid.livemode),
          eq(billingFinancialCase.kind, 'tax_registration_review'),
          eq(billingFinancialCase.dedupeKey, 'eu-uk-b2c-rolling-12-month'),
        ),
      });
      const triggers = ((existing?.evidence as { triggers?: unknown[] } | undefined)?.triggers ?? []) as Array<
        Record<string, unknown>
      >;
      const replay = triggers.find(
        (trigger) => trigger['accountId'] === discovered.accountId && trigger['requestId'] === input.requestId,
      );
      if (replay !== undefined) {
        if (replay['requestDigest'] !== requestDigest) throw new Error('tax_invoice_request_conflict');
        return projectFinancialCase({
          row: existing!,
          ownerId: input.authUserId,
          subjectId: discovered.accountId,
          environment: input.environment,
        });
      }
      const clock = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
      const rawRequestedAt = clock[0]?.now;
      const requestedAt =
        rawRequestedAt instanceof Date ? rawRequestedAt : new Date(rawRequestedAt as unknown as string);
      if (!Number.isFinite(requestedAt.getTime())) throw new Error('tax_request_clock_unavailable');
      const claim: TaxSourceClaim = {
        id: `enterprise-request:${input.requestId}`,
        environment: input.environment,
        stripeAccountId: paid.stripeAccountId,
        livemode: paid.livemode,
        sourceType: 'enterprise_invoice_request',
        sourceId: input.invoiceId,
        generation: 1n,
        digest: requestDigest,
      };
      await this.upsertCase(tx, claim, 'tax_registration_review', 'eu-uk-b2c-rolling-12-month', requestedAt, null, {
        accountId: discovered.accountId,
        invoiceId: input.invoiceId,
        requestId: input.requestId,
        requestDigest,
        paidSourceDigest: paid.sourceDigest,
      });
      const result = await tx.query.billingFinancialCase.findFirst({
        where: and(
          eq(billingFinancialCase.environment, input.environment),
          eq(billingFinancialCase.stripeAccountId, paid.stripeAccountId),
          eq(billingFinancialCase.livemode, paid.livemode),
          eq(billingFinancialCase.kind, 'tax_registration_review'),
          eq(billingFinancialCase.dedupeKey, 'eu-uk-b2c-rolling-12-month'),
        ),
      });
      if (result === undefined) throw new Error('tax_invoice_case_not_found');
      return projectFinancialCase({
        row: result,
        ownerId: input.authUserId,
        subjectId: discovered.accountId,
        environment: input.environment,
      });
    });
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- case identity, source fence, amount, and evidence remain explicit at this private boundary
  private async upsertCase(
    tx: Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0],
    claim: TaxSourceClaim,
    kind: string,
    dedupeKey: string,
    effectiveAt: Date,
    knownAmountMinor: bigint | null,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date();
    await tx
      .insert(billingFinancialCase)
      .values({
        id: randomUUID(),
        environment: claim.environment,
        stripeAccountId: claim.stripeAccountId,
        livemode: claim.livemode,
        kind,
        dedupeKey,
        sourceType: claim.sourceType,
        sourceId: claim.sourceId,
        currency: knownAmountMinor === null ? null : 'eur',
        knownAmountMinor,
        evidence: { triggers: [evidence] },
        owner: 'finance',
        nextStep: 'review_tax_evidence',
        state: 'open',
        firstEffectiveAt: effectiveAt,
        firstSeenAt: now,
        lastSeenAt: now,
        deadlineAt: kind === 'tax_registration_review' ? quarterEnd(effectiveAt) : null,
      })
      .onConflictDoUpdate({
        target: [
          billingFinancialCase.environment,
          billingFinancialCase.stripeAccountId,
          billingFinancialCase.livemode,
          billingFinancialCase.kind,
          billingFinancialCase.dedupeKey,
        ],
        set: {
          firstEffectiveAt: sql`least(${billingFinancialCase.firstEffectiveAt}, excluded.first_effective_at)`,
          deadlineAt: sql`least(coalesce(${billingFinancialCase.deadlineAt}, excluded.deadline_at), excluded.deadline_at)`,
          lastSeenAt: now,
          knownAmountMinor,
          evidence: sql`case
            when coalesce(${billingFinancialCase.evidence}->'triggers', '[]'::jsonb)
              @> (excluded.evidence->'triggers')
            then ${billingFinancialCase.evidence}
            else jsonb_set(
              ${billingFinancialCase.evidence} || excluded.evidence,
              '{triggers}',
              coalesce(${billingFinancialCase.evidence}->'triggers', '[]'::jsonb) || (excluded.evidence->'triggers')
            )
          end`,
        },
      });
  }
}

export function classifyTaxEvidence(evidence: TaxFactEvidence): TaxObservationResult['classification'] {
  if (evidence.countryCode === null || evidence.customerType === 'unknown') return 'unknown';
  if (evidence.customerType === 'business' && evidence.vat.validation === 'verified') return 'enterprise_vat_invoice';
  if (evidence.customerType !== 'consumer') return 'unknown';
  if (evidence.countryCode === 'GB') return 'uk_b2c';
  return euCountries.has(evidence.countryCode) ? 'eu_b2c' : 'outside_monitor';
}

/** Conservatively projects immutable Invoice or Checkout customer/tax fields; no mutable Customer lookup is guessed. */
export async function projectPaidTaxEvidence(input: {
  readonly paidEvidence: PaidPaymentEvidence;
  readonly checkout?: Stripe.Checkout.Session;
  readonly invoice?: Stripe.Invoice;
  readonly resolveFx?: TaxFxResolver;
}): Promise<TaxFactEvidence | undefined> {
  const source = input.invoice ?? input.checkout;
  if (source === undefined) return undefined;
  if (input.invoice && input.paidEvidence.invoiceId !== input.invoice.id)
    throw new Error('tax_invoice_identity_mismatch');
  const invoiceTaxIds = input.invoice?.customer_tax_ids ?? [];
  const checkoutDetails = input.checkout?.customer_details as
    | { address?: { country?: string | null } | null; tax_ids?: Array<{ type?: string; value?: string }> | null }
    | null
    | undefined;
  const checkoutTaxIds = checkoutDetails?.tax_ids ?? [];
  const taxIds = invoiceTaxIds.length > 0 ? invoiceTaxIds : checkoutTaxIds;
  const rawTaxId = taxIds[0] as
    | { type?: string; value?: string; verification?: { status?: string; verified_at?: number } | null }
    | undefined;
  const countryCode = input.invoice?.customer_address?.country ?? checkoutDetails?.address?.country ?? null;
  const verified = rawTaxId?.verification?.status === 'verified';
  const customerType = taxIds.length > 0 ? 'business' : 'consumer';
  const automaticTax = (source.automatic_tax as { status?: string | null } | undefined)?.status ?? null;
  const effectiveAt = new Date(input.paidEvidence.paidAt);
  const monitoredCountry = countryCode === 'GB' || (countryCode !== null && euCountries.has(countryCode));
  const fx =
    monitoredCountry && customerType === 'consumer'
      ? ((await input.resolveFx?.({
          currency: input.paidEvidence.currency,
          reportingCurrency: 'eur',
          effectiveAt,
        })) ?? null)
      : null;
  return taxFactEvidenceSchema.parse({
    version: 'tax-fact-evidence-v1',
    sourceComplete: true,
    countryCode,
    countryEvidenceSource: input.invoice ? 'invoice' : 'checkout',
    customerType,
    vat: {
      type: rawTaxId?.type ?? null,
      countryCode,
      reference: rawTaxId?.value ? `sha256:${digest(rawTaxId.value)}` : null,
      validation: verified ? 'verified' : rawTaxId ? 'unverified' : 'unavailable',
      validatedAt:
        verified && rawTaxId.verification?.verified_at
          ? new Date(rawTaxId.verification.verified_at * 1000).toISOString()
          : null,
    },
    currency: input.paidEvidence.currency,
    principalMinor: input.paidEvidence.principalMinor,
    taxMinor: input.paidEvidence.taxMinor,
    grossMinor: input.paidEvidence.grossMinor,
    cumulativeRefundPrincipalMinor: '0',
    cumulativeRefundTaxMinor: '0',
    cumulativeRefundGrossMinor: '0',
    fx,
    automaticTaxStatus: automaticTax,
    productTaxCode: null,
    taxabilityReason: null,
    classificationReason:
      rawTaxId === undefined
        ? 'immutable paid source contains no customer tax ID; treated as consumer'
        : verified
          ? 'immutable paid source contains a verified customer tax ID'
          : 'customer tax ID exists without verified VAT evidence',
    lineage: {
      kind: 'sale',
      canonicalSourceId: input.invoice?.id ?? input.checkout?.id ?? input.paidEvidence.paymentIntentIds[0]!,
    },
  });
}

export function earliestRollingCrossing(
  rows: ReadonlyArray<{
    readonly id: string;
    readonly supersedesFactId: string | null;
    readonly amount: bigint | null;
    readonly effectiveAt: Date;
  }>,
  threshold: bigint,
): { readonly effectiveAt: Date; readonly amount: bigint } | undefined {
  const amounts = new Map(rows.map((row) => [row.id, row.amount ?? 0n]));
  const ordered = rows
    .map((row) => ({
      effectiveAt: row.effectiveAt,
      delta: (row.amount ?? 0n) - (row.supersedesFactId === null ? 0n : (amounts.get(row.supersedesFactId) ?? 0n)),
    }))
    .sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
  let start = 0;
  let rolling = 0n;
  for (const [index, row] of ordered.entries()) {
    rolling += row.delta;
    const windowStart = new Date(row.effectiveAt);
    windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 1);
    while (start <= index && ordered[start]!.effectiveAt <= windowStart) {
      rolling -= ordered[start]!.delta;
      start += 1;
    }
    if (rolling >= threshold) return { effectiveAt: row.effectiveAt, amount: rolling };
  }
  return undefined;
}

function inMonitorClassification() {
  return or(eq(billingTaxFact.classification, 'eu_b2c'), eq(billingTaxFact.classification, 'uk_b2c'));
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function withoutEvidenceDigest(value: Record<string, unknown>): Record<string, unknown> {
  const { evidenceDigest: _evidenceDigest, ...evidence } = value;
  return evidence;
}

function parseCorrectionEvidence(
  value: QualifiedCashTaxCorrection['taxCorrectionEvidence'],
): NonNullable<QualifiedCashTaxCorrection['taxCorrectionEvidence']> {
  if (value === undefined || value.sources.length === 0) throw new Error('tax_correction_effective_time_missing');
  const sources = [...value.sources].sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id),
  );
  if (
    sources.some(
      (source, index) =>
        source.id.length === 0 ||
        !Number.isSafeInteger(source.created) ||
        source.created < 1 ||
        (index > 0 && sources[index - 1]!.kind === source.kind && sources[index - 1]!.id === source.id),
    ) ||
    digest(sources) !== value.sourceDigest
  ) {
    throw new Error('tax_correction_source_evidence_invalid');
  }
  const latest = Math.max(...sources.map((source) => source.created));
  if (new Date(latest * 1000).toISOString() !== value.effectiveAt) {
    throw new Error('tax_correction_effective_time_mismatch');
  }
  return { ...value, sources };
}

function quarterEnd(value: Date): Date {
  const quarterEndMonth = Math.floor(value.getUTCMonth() / 3) * 3 + 3;
  return new Date(Date.UTC(value.getUTCFullYear(), quarterEndMonth, 0, 23, 59, 59, 999));
}

function projectFinancialCase(input: {
  readonly row: typeof billingFinancialCase.$inferSelect;
  readonly ownerId: string;
  readonly subjectId: string;
  readonly environment: FinancialEnvironment;
}): WireFinancialCase {
  const { row } = input;
  return {
    version: 'financial-case-v1',
    environment: input.environment,
    ownerId: input.ownerId,
    subjectId: input.subjectId,
    caseId: row.id,
    state: row.state as WireFinancialCase['state'],
    nextStep: row.nextStep === 'wait' ? 'wait' : 'contact_support',
    updatedAt: row.lastSeenAt.toISOString(),
  };
}
