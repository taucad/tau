/* oxlint-disable curly, no-await-in-loop, unicorn/no-await-expression-member, eslint/complexity -- sequential source pagination and explicit financial guards are intentional */
/* eslint-disable @typescript-eslint/naming-convention, max-params-no-constructor/max-params-no-constructor -- Stripe metadata and database helper boundaries are protocol-defined */
import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { z } from 'zod';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingTaxService } from '#api/billing/billing-tax.service.js';
import { cashProjectionDigest } from '#api/billing/billing-payment-contract.js';
import type { CashProjectionEvidence } from '#api/billing/billing-payment-contract.js';
import { assertNewCollectionCashScope } from '#api/billing/billing-cash-reconciliation.service.js';
import type { DatabaseService } from '#database/database.service.js';
import {
  billingProviderLeg,
  billingRefundIntent,
  billingReversalCase,
  billingStripeSource,
  creditAccount,
} from '#database/schema.js';
import {
  createStripeRefundOnce,
  listStripeDisputePage,
  listStripeRefundPage,
  retrieveStripeCharge,
  retrieveStripeDispute,
  retrieveStripePaymentIntent,
  retrieveStripeRefund,
} from '#api/billing/billing-cash-stripe.js';

type Database = DatabaseService['database'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type CashProjectionResult =
  | { readonly status: 'qualified'; readonly evidence: CashProjectionEvidence; readonly digest: string }
  | { readonly status: 'pending'; readonly reason: string }
  | { readonly status: 'attention'; readonly reason: string };
type UnqualifiedCashSource = Extract<CashProjectionResult, { readonly status: 'pending' | 'attention' }>;

export type QualifiedCashSource = {
  readonly status: 'qualified';
  readonly sourceClaimId: string;
  readonly sourceGeneration: bigint;
  readonly projectionDigest: string;
  readonly principalLossMinor: bigint;
  readonly taxLossMinor: bigint;
  readonly grossLossMinor: bigint;
  readonly evidence: CashProjectionEvidence;
  readonly taxCorrectionEvidence?: CashTaxCorrectionEvidence;
};

export type CashTaxCorrectionEvidence = {
  readonly effectiveAt: string;
  readonly sourceDigest: string;
  readonly sources: ReadonlyArray<{
    readonly kind: 'refund' | 'dispute_balance_transaction';
    readonly id: string;
    readonly created: number;
  }>;
};

export type CashRefundSource = Pick<
  Stripe.Refund,
  | 'amount'
  | 'balance_transaction'
  | 'charge'
  | 'currency'
  | 'customer'
  | 'id'
  | 'metadata'
  | 'payment_intent'
  | 'status'
> & { readonly created?: number };
export type CashDisputeSource = Pick<
  Stripe.Dispute,
  'charge' | 'currency' | 'id' | 'livemode' | 'payment_intent' | 'status'
> & {
  readonly balance_transactions: ReadonlyArray<
    Pick<Stripe.BalanceTransaction, 'amount' | 'id'> & { readonly created?: number }
  >;
};

export type ReviewedRefundRequest = {
  readonly environment: FinancialEnvironment;
  readonly accountId: string;
  readonly reversalCaseId: string;
  readonly requestedPrincipalMinor: string;
  readonly requestedTaxMinor: string;
  readonly approvedMaximumGrossMinor: string;
  readonly reviewActorId: string;
  readonly reviewedAt: Date;
  readonly reason: string;
  readonly requestId: string;
};

type ChargeSourceInput = {
  readonly environment: FinancialEnvironment;
  readonly accountId: string;
  readonly reversalCaseId: string;
  readonly maximumRefundPages: number;
};

export type ProtectedRefundCapability = {
  readonly qualification: 'controlled-local-protected-refund';
  readonly environment: 'development';
  readonly stripeAccountId: string;
  readonly livemode: false;
};

export type BillingCashQualification = {
  assertNewCollectionScope(accountId: string, transaction?: Transaction): Promise<void>;
  releaseQualifiedClaim(input: {
    readonly environment: FinancialEnvironment;
    readonly stripeAccountId: string;
    readonly livemode: boolean;
    readonly sourceClaimId: string;
    readonly sourceGeneration: bigint;
    readonly reason: string;
  }): Promise<void>;
  qualifyInitialPayment(input: {
    readonly environment: FinancialEnvironment;
    readonly accountId: string;
    readonly causeId: string;
    readonly source: 'plan' | 'purchased';
    readonly stripeAccountId: string;
    readonly livemode: boolean;
    readonly customerId: string;
    readonly paymentIntentId: string;
    readonly chargeId: string;
    readonly currency: string;
    readonly originalPrincipalMinor: bigint;
    readonly originalTaxMinor: bigint;
    readonly maximumRefundPages: number;
  }): Promise<QualifiedCashSource | UnqualifiedCashSource>;
};
const protectedRefundCapabilitySchema = z.strictObject({
  qualification: z.literal('controlled-local-protected-refund'),
  environment: z.literal('development'),
  stripeAccountId: z.string().min(1),
  livemode: z.literal(false),
});
const reviewedRefundRequestSchema = z.strictObject({
  environment: z.enum(['development', 'staging', 'production']),
  accountId: z.string().min(1).max(255),
  reversalCaseId: z.string().min(1).max(255),
  requestedPrincipalMinor: z.string().regex(/^(0|[1-9][0-9]*)$/u),
  requestedTaxMinor: z.string().regex(/^(0|[1-9][0-9]*)$/u),
  approvedMaximumGrossMinor: z.string().regex(/^(0|[1-9][0-9]*)$/u),
  reviewActorId: z.string().min(1).max(255),
  reviewedAt: z.date(),
  reason: z.string().min(1).max(500),
  requestId: z.string().min(1).max(255),
});
const refundLegRequestSchema = z.strictObject({
  charge: z.string().min(1).max(255),
  amount: z.string().regex(/^[1-9][0-9]*$/u),
  reason: z.literal('requested_by_customer'),
  metadata: z.strictObject({
    tau_refund_intent_id: z.string().min(1).max(255),
    tau_reversal_case_id: z.string().min(1).max(255),
  }),
});

export function qualifyStripeCashProjection(input: {
  readonly stripeAccountId: string;
  readonly livemode: boolean;
  readonly customerId: string;
  readonly paymentIntentId: string;
  readonly chargeId: string;
  readonly currency: string;
  readonly originalPrincipalMinor: bigint;
  readonly originalTaxMinor: bigint;
  readonly refunds: readonly CashRefundSource[];
  readonly refundPagesComplete: boolean;
  readonly refundAllocations: Readonly<Record<string, { readonly principalMinor: bigint; readonly taxMinor: bigint }>>;
  readonly disputes: readonly CashDisputeSource[];
  readonly disputeAllocations?: Readonly<
    Record<string, { readonly principalMinor: bigint; readonly taxMinor: bigint }>
  >;
}): CashProjectionResult {
  const originalGross = input.originalPrincipalMinor + input.originalTaxMinor;
  if (
    input.originalPrincipalMinor <= 0n ||
    input.originalTaxMinor < 0n ||
    originalGross > BigInt(Number.MAX_SAFE_INTEGER) ||
    input.currency !== 'usd' ||
    !input.refundPagesComplete
  ) {
    return input.refundPagesComplete
      ? { status: 'attention', reason: 'invalid_original_cash' }
      : { status: 'pending', reason: 'incomplete_refund_pages' };
  }
  let principalLoss = 0n;
  let taxLoss = 0n;
  const refundIds: string[] = [];
  const disputeIds: string[] = [];
  const balanceTransactionIds: string[] = [];
  const seenRefunds = new Set<string>();
  const seenDisputes = new Set<string>();
  const seenMovements = new Set<string>();
  for (const refund of input.refunds) {
    if (seenRefunds.has(refund.id)) return { status: 'attention', reason: 'duplicate_refund' };
    seenRefunds.add(refund.id);
    if (
      !Number.isSafeInteger(refund.amount) ||
      refund.amount < 0 ||
      idOf(refund.charge) !== input.chargeId ||
      idOf(refund.payment_intent) !== input.paymentIntentId ||
      refund.currency !== input.currency ||
      (refund.customer !== null && idOf(refund.customer) !== input.customerId)
    ) {
      return { status: 'attention', reason: 'refund_source_mismatch' };
    }
    if (refund.status === 'pending' || refund.status === 'requires_action') {
      return { status: 'pending', reason: 'refund_not_final' };
    }
    if (!['succeeded', 'failed', 'canceled'].includes(refund.status ?? '')) {
      return { status: 'attention', reason: 'unsupported_refund_status' };
    }
    if (refund.status !== 'succeeded') continue;
    const allocation = input.refundAllocations[refund.id];
    if (
      allocation === undefined ||
      allocation.principalMinor < 0n ||
      allocation.taxMinor < 0n ||
      allocation.principalMinor + allocation.taxMinor !== BigInt(refund.amount) ||
      refund.balance_transaction === null
    ) {
      return { status: 'attention', reason: 'refund_allocation_incomplete' };
    }
    principalLoss += allocation.principalMinor;
    taxLoss += allocation.taxMinor;
    refundIds.push(refund.id);
    const movementId = idOf(refund.balance_transaction);
    if (movementId.length === 0 || seenMovements.has(movementId))
      return { status: 'attention', reason: 'cash_movement_overlap' };
    seenMovements.add(movementId);
    balanceTransactionIds.push(movementId);
  }
  for (const dispute of input.disputes) {
    if (seenDisputes.has(dispute.id)) return { status: 'attention', reason: 'duplicate_dispute' };
    seenDisputes.add(dispute.id);
    if (
      idOf(dispute.charge) !== input.chargeId ||
      (dispute.payment_intent !== null && idOf(dispute.payment_intent) !== input.paymentIntentId) ||
      dispute.currency !== input.currency ||
      dispute.livemode !== input.livemode
    ) {
      return { status: 'attention', reason: 'dispute_source_mismatch' };
    }
    if (
      ![
        'warning_needs_response',
        'warning_under_review',
        'warning_closed',
        'prevented',
        'needs_response',
        'under_review',
        'won',
        'lost',
      ].includes(dispute.status)
    ) {
      return { status: 'attention', reason: 'unsupported_dispute_status' };
    }
    const netWithdrawal = dispute.balance_transactions.reduce((total, value) => total - BigInt(value.amount), 0n);
    for (const value of dispute.balance_transactions) {
      if (!Number.isSafeInteger(value.amount) || seenMovements.has(value.id))
        return { status: 'attention', reason: 'cash_movement_overlap' };
      seenMovements.add(value.id);
      balanceTransactionIds.push(value.id);
    }
    disputeIds.push(dispute.id);
    if (netWithdrawal <= 0n) continue;
    const allocation =
      input.disputeAllocations?.[dispute.id] ??
      (netWithdrawal === originalGross && refundIds.length === 0
        ? { principalMinor: input.originalPrincipalMinor, taxMinor: input.originalTaxMinor }
        : undefined);
    if (
      allocation === undefined ||
      allocation.principalMinor < 0n ||
      allocation.taxMinor < 0n ||
      allocation.principalMinor + allocation.taxMinor !== netWithdrawal
    ) {
      return { status: 'attention', reason: 'dispute_allocation_required' };
    }
    principalLoss += allocation.principalMinor;
    taxLoss += allocation.taxMinor;
  }
  const grossLoss = principalLoss + taxLoss;
  if (principalLoss > input.originalPrincipalMinor || taxLoss > input.originalTaxMinor || grossLoss > originalGross) {
    return { status: 'attention', reason: 'cash_loss_exceeds_original' };
  }
  const evidence: CashProjectionEvidence = {
    version: 'stripe-cash-projection-v1',
    stripeAccountId: input.stripeAccountId,
    livemode: input.livemode,
    customerId: input.customerId,
    paymentIntentId: input.paymentIntentId,
    chargeId: input.chargeId,
    currency: 'usd',
    originalPrincipalMinor: input.originalPrincipalMinor.toString(),
    originalTaxMinor: input.originalTaxMinor.toString(),
    originalGrossMinor: originalGross.toString(),
    principalLossMinor: principalLoss.toString(),
    taxLossMinor: taxLoss.toString(),
    grossLossMinor: grossLoss.toString(),
    refundIds: [...refundIds].sort(),
    disputeIds: [...disputeIds].sort(),
    balanceTransactionIds: [...new Set(balanceTransactionIds)].sort(),
  };
  return { status: 'qualified', evidence, digest: cashProjectionDigest(evidence) };
}

function taxCorrectionEvidence(
  result: Extract<CashProjectionResult, { readonly status: 'qualified' }>,
  refunds: readonly CashRefundSource[],
  disputes: readonly CashDisputeSource[],
  requireEffectiveTime = result.evidence.grossLossMinor !== '0',
): CashTaxCorrectionEvidence | 'missing' | undefined {
  const refundIds = new Set(result.evidence.refundIds);
  const movementIds = new Set(result.evidence.balanceTransactionIds);
  const sources: Array<{
    kind: 'refund' | 'dispute_balance_transaction';
    id: string;
    created: number | undefined;
  }> = [];
  for (const refund of refunds) {
    if (refundIds.has(refund.id)) sources.push({ kind: 'refund', id: refund.id, created: refund.created });
  }
  for (const dispute of disputes) {
    for (const movement of dispute.balance_transactions) {
      if (movementIds.has(movement.id))
        sources.push({ kind: 'dispute_balance_transaction', id: movement.id, created: movement.created });
    }
  }
  if (sources.length === 0 && !requireEffectiveTime) return undefined;
  sources.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  if (
    sources.length === 0 ||
    sources.some(
      (source) => source.id.length === 0 || !Number.isSafeInteger(source.created) || (source.created ?? 0) < 1,
    )
  )
    return 'missing';
  const complete = sources.map((source) => ({ ...source, created: source.created ?? 0 }));
  const latest = Math.max(...complete.map((source) => source.created));
  return {
    effectiveAt: new Date(latest * 1000).toISOString(),
    sourceDigest: createHash('sha256').update(JSON.stringify(complete)).digest('hex'),
    sources: complete,
  };
}

@Injectable()
export class BillingCashService {
  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly protectedStripe: Stripe,
    private readonly sourceStripe: Stripe,
    private readonly ledger: CreditLedgerService,
    private readonly config: {
      readonly environment: FinancialEnvironment;
      readonly stripeAccountId: string;
      readonly livemode: boolean;
    },
    private readonly tax = new BillingTaxService(databaseService),
  ) {}

  public async assertNewCollectionScope(accountId: string, transaction?: Transaction): Promise<void> {
    await assertNewCollectionCashScope(this.databaseService, this.config, accountId, transaction);
  }

  public async qualifyInitialPayment(
    input: Parameters<BillingCashQualification['qualifyInitialPayment']>[0],
  ): Promise<QualifiedCashSource | UnqualifiedCashSource> {
    if (
      input.environment !== this.config.environment ||
      input.stripeAccountId !== this.config.stripeAccountId ||
      input.livemode !== this.config.livemode
    )
      return { status: 'attention', reason: 'cash_source_scope' };
    const claim = await this.claimCharge(input.environment, input.chargeId);
    let paymentIntent: Stripe.PaymentIntent;
    let charge: Stripe.Charge;
    try {
      [paymentIntent, charge] = await Promise.all([
        retrieveStripePaymentIntent(this.sourceStripe, input.paymentIntentId),
        retrieveStripeCharge(this.sourceStripe, input.chargeId),
      ]);
    } catch (error) {
      return this.releaseClaimAndRethrow(claim, 'cash_payment_source_read_failed', error);
    }
    if (
      paymentIntent.status !== 'succeeded' ||
      !isSafeMinor(paymentIntent.amount_received) ||
      !isSafeMinor(charge.amount) ||
      !isSafeMinor(charge.amount_captured) ||
      input.originalPrincipalMinor + input.originalTaxMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
      idOf(paymentIntent.customer) !== input.customerId ||
      idOf(paymentIntent.latest_charge) !== input.chargeId ||
      paymentIntent.currency !== input.currency ||
      paymentIntent.livemode !== input.livemode ||
      paymentIntent.amount_received !== charge.amount ||
      charge.amount !== Number(input.originalPrincipalMinor + input.originalTaxMinor) ||
      charge.status !== 'succeeded' ||
      !charge.paid ||
      charge.amount_captured !== charge.amount ||
      idOf(charge.payment_intent) !== input.paymentIntentId ||
      idOf(charge.customer) !== input.customerId ||
      charge.currency !== input.currency ||
      charge.livemode !== input.livemode
    ) {
      const result = { status: 'attention', reason: 'cash_payment_source_mismatch' } satisfies CashProjectionResult;
      await this.releaseClaim(claim, result.reason);
      return result;
    }
    let refunds: Awaited<ReturnType<typeof collectRefunds>>;
    let disputePages: Awaited<ReturnType<typeof collectDisputes>>;
    try {
      [refunds, disputePages] = await Promise.all([
        collectRefunds(this.sourceStripe, input.chargeId, input.maximumRefundPages),
        collectDisputes(this.sourceStripe, input.chargeId, input.maximumRefundPages),
      ]);
    } catch (error) {
      return this.releaseClaimAndRethrow(claim, 'cash_adjustment_pages_read_failed', error);
    }
    if (!disputePages.complete) {
      const result = { status: 'pending', reason: 'incomplete_dispute_pages' } satisfies CashProjectionResult;
      await this.releaseClaim(claim, result.reason);
      return result;
    }
    let disputes: Stripe.Dispute[];
    try {
      disputes = await Promise.all(
        disputePages.disputes.map(async (value) => retrieveStripeDispute(this.sourceStripe, value.id)),
      );
    } catch (error) {
      return this.releaseClaimAndRethrow(claim, 'cash_dispute_source_read_failed', error);
    }
    if (disputes.some((value, index) => value.id !== disputePages.disputes[index]?.id)) {
      const result = { status: 'attention', reason: 'dispute_source_changed' } satisfies UnqualifiedCashSource;
      await this.releaseClaim(claim, result.reason);
      return result;
    }
    const result = qualifyStripeCashProjection({
      ...input,
      refunds: refunds.refunds,
      refundPagesComplete: refunds.complete,
      refundAllocations: {},
      disputes,
    });
    if (result.status !== 'qualified') {
      await this.releaseClaim(claim, result.reason);
      return result;
    }
    const taxEvidence = taxCorrectionEvidence(result, refunds.refunds, disputes);
    if (taxEvidence === 'missing') {
      await this.releaseClaim(claim, 'cash_effective_time_missing');
      return { status: 'attention', reason: 'cash_effective_time_missing' };
    }
    return qualifiedFrom(claim, result, taxEvidence);
  }

  public async prepareReviewedRefund(
    input: ReviewedRefundRequest,
  ): Promise<{ readonly intentId: string; readonly legId: string }> {
    reviewedRefundRequestSchema.parse(input);
    const principal = parseUnsigned(input.requestedPrincipalMinor, 'principal');
    const tax = parseUnsigned(input.requestedTaxMinor, 'tax');
    const maximum = parseUnsigned(input.approvedMaximumGrossMinor, 'maximum');
    const gross = principal + tax;
    if (gross <= 0n || gross > maximum || input.environment !== this.config.environment)
      throw new ConflictException('refund_scope');
    return this.databaseService.database.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: billingRefundIntent.id })
        .from(billingRefundIntent)
        .where(
          and(
            eq(billingRefundIntent.reversalCaseId, input.reversalCaseId),
            eq(billingRefundIntent.requestId, input.requestId),
          ),
        );
      if (existing !== undefined) {
        const [original] = await tx.select().from(billingRefundIntent).where(eq(billingRefundIntent.id, existing.id));
        if (
          original === undefined ||
          original.accountId !== input.accountId ||
          original.environment !== input.environment ||
          original.requestedPrincipalMinor !== principal ||
          original.requestedTaxMinor !== tax ||
          original.approvedMaximumGrossMinor !== maximum ||
          original.reviewActorId !== input.reviewActorId ||
          original.reviewedAt.getTime() !== input.reviewedAt.getTime() ||
          original.reason !== input.reason
        )
          throw new ConflictException('refund_replay_mismatch');
        const [leg] = await tx
          .select({ id: billingProviderLeg.id })
          .from(billingProviderLeg)
          .where(eq(billingProviderLeg.refundIntentId, existing.id));
        if (leg === undefined) throw new ConflictException('refund_replay_incomplete');
        return { intentId: existing.id, legId: leg.id };
      }
      const [account] = await tx
        .select()
        .from(creditAccount)
        .where(eq(creditAccount.id, input.accountId))
        .for('update');
      if (account === undefined) throw new ConflictException('refund_account_missing');
      const [reversal] = await tx
        .select()
        .from(billingReversalCase)
        .where(
          and(eq(billingReversalCase.id, input.reversalCaseId), eq(billingReversalCase.accountId, input.accountId)),
        )
        .for('update');
      if (
        reversal === undefined ||
        reversal.environment !== input.environment ||
        reversal.stripeAccountId !== this.config.stripeAccountId ||
        reversal.livemode !== this.config.livemode ||
        reversal.customerBindingId === null ||
        reversal.chargeId === null ||
        reversal.projectionDigest === null ||
        reversal.projectionSourceGeneration === null
      )
        throw new ConflictException('refund_source_unqualified');
      if (reversal.source !== 'plan' && reversal.source !== 'purchased')
        throw new ConflictException('refund_source_unqualified');
      const { source } = reversal;
      const intents = await tx
        .select()
        .from(billingRefundIntent)
        .where(eq(billingRefundIntent.reversalCaseId, reversal.id));
      const pendingPrincipal = intents
        .filter((intent) => ['prepared', 'pending', 'attention'].includes(intent.state))
        .reduce((total, intent) => total + intent.requestedPrincipalMinor, 0n);
      const denominator = reversal.originalPrincipalMinor ?? 0n;
      const priorLoss = reversal.cumulativePrincipalLossMinor + pendingPrincipal;
      if (denominator <= 0n || priorLoss + principal > denominator)
        throw new ConflictException('refund_principal_exceeds_source');
      const priorTarget = (reversal.originalAtoms * priorLoss) / denominator;
      const cumulativeTarget = (reversal.originalAtoms * (priorLoss + principal)) / denominator;
      const hold = cumulativeTarget - priorTarget;
      const available =
        source === 'plan'
          ? account.planAtoms - account.planHeldAtoms
          : account.purchasedAtoms - account.purchasedHeldAtoms;
      if (hold < 0n || hold > available) throw new ConflictException('refund_hold_insufficient');
      const intentId = randomUUID();
      const legId = randomUUID();
      const request = {
        charge: reversal.chargeId,
        amount: gross.toString(),
        reason: 'requested_by_customer',
        metadata: { tau_refund_intent_id: intentId, tau_reversal_case_id: reversal.id },
      };
      const requestHash = digest(request);
      await tx.insert(billingRefundIntent).values({
        id: intentId,
        accountId: input.accountId,
        environment: input.environment,
        reversalCaseId: reversal.id,
        requestId: input.requestId,
        requestHash,
        requestedPrincipalMinor: principal,
        requestedTaxMinor: tax,
        requestedGrossMinor: gross,
        approvedMaximumGrossMinor: maximum,
        targetReversedAtoms: hold,
        holdAtoms: hold,
        reviewActorId: input.reviewActorId,
        reviewedAt: input.reviewedAt,
        reason: input.reason,
        sourceDigest: reversal.projectionDigest,
      });
      await tx.insert(billingProviderLeg).values({
        id: legId,
        accountId: input.accountId,
        environment: input.environment,
        customerBindingId: reversal.customerBindingId,
        refundIntentId: intentId,
        kind: 'refund',
        requestId: input.requestId,
        requestHash,
        request,
        idempotencyKey: `refund:${intentId}`,
      });
      await addSourceHold(tx, input.accountId, source, hold);
      return { intentId, legId };
    });
  }

  public async executeReviewedRefund(input: {
    readonly environment: FinancialEnvironment;
    readonly intentId: string;
    readonly reviewActorId: string;
    readonly capability: unknown;
  }): Promise<{ readonly status: 'pending'; readonly refundId: string }> {
    const capability = protectedRefundCapabilitySchema.parse(input.capability);
    if (
      this.config.environment !== 'development' ||
      input.environment !== this.config.environment ||
      this.config.livemode ||
      capability.stripeAccountId !== this.config.stripeAccountId
    ) {
      throw new ConflictException('refund_executor_unqualified');
    }
    const dispatch = await this.databaseService.database.transaction(async (tx) => {
      const [intent] = await tx
        .select()
        .from(billingRefundIntent)
        .where(eq(billingRefundIntent.id, input.intentId))
        .for('update');
      if (
        intent === undefined ||
        intent.environment !== input.environment ||
        intent.reviewActorId !== input.reviewActorId ||
        intent.state !== 'prepared'
      )
        throw new ConflictException('refund_not_dispatchable');
      const [leg] = await tx
        .select()
        .from(billingProviderLeg)
        .where(eq(billingProviderLeg.refundIntentId, intent.id))
        .for('update');
      const [reversal] = await tx
        .select()
        .from(billingReversalCase)
        .where(eq(billingReversalCase.id, intent.reversalCaseId));
      if (leg === undefined || reversal?.chargeId === null || reversal === undefined)
        throw new ConflictException('refund_leg_missing');
      const expectedRequest = {
        charge: reversal.chargeId,
        amount: intent.requestedGrossMinor.toString(),
        reason: 'requested_by_customer',
        metadata: { tau_refund_intent_id: intent.id, tau_reversal_case_id: intent.reversalCaseId },
      };
      const persistedRequest = refundLegRequestSchema.parse(leg.request);
      if (
        digest(expectedRequest) !== leg.requestHash ||
        persistedRequest.charge !== expectedRequest.charge ||
        persistedRequest.amount !== expectedRequest.amount ||
        persistedRequest.metadata.tau_refund_intent_id !== expectedRequest.metadata.tau_refund_intent_id ||
        persistedRequest.metadata.tau_reversal_case_id !== expectedRequest.metadata.tau_reversal_case_id
      )
        throw new ConflictException('refund_request_mismatch');
      const [winner] = await tx
        .update(billingProviderLeg)
        .set({ state: 'dispatched', dispatchStartedAt: sql`transaction_timestamp()` })
        .where(and(eq(billingProviderLeg.id, leg.id), eq(billingProviderLeg.state, 'prepared')))
        .returning({ id: billingProviderLeg.id });
      if (winner === undefined) throw new ConflictException('refund_dispatch_lost');
      await tx
        .update(billingRefundIntent)
        .set({ state: 'pending', updatedAt: sql`transaction_timestamp()` })
        .where(eq(billingRefundIntent.id, intent.id));
      return { intent, leg, chargeId: reversal.chargeId };
    });
    const refund = await createStripeRefundOnce(this.protectedStripe, {
      chargeId: dispatch.chargeId,
      amountMinor: dispatch.intent.requestedGrossMinor,
      reason: 'requested_by_customer',
      metadata: { tau_refund_intent_id: dispatch.intent.id, tau_reversal_case_id: dispatch.intent.reversalCaseId },
      idempotencyKey: dispatch.leg.idempotencyKey,
    });
    await this.databaseService.database
      .update(billingProviderLeg)
      .set({ state: 'known', providerObjectId: refund.id })
      .where(and(eq(billingProviderLeg.id, dispatch.leg.id), eq(billingProviderLeg.state, 'dispatched')));
    return { status: 'pending', refundId: refund.id };
  }

  public async recoverRefundIntent(input: {
    readonly environment: FinancialEnvironment;
    readonly intentId: string;
    readonly maximumPages: number;
  }): Promise<UnqualifiedCashSource | { readonly status: 'applied'; readonly refundId: string }> {
    const [stored] = await this.databaseService.database
      .select({ intent: billingRefundIntent, leg: billingProviderLeg, reversal: billingReversalCase })
      .from(billingRefundIntent)
      .innerJoin(billingProviderLeg, eq(billingProviderLeg.refundIntentId, billingRefundIntent.id))
      .innerJoin(billingReversalCase, eq(billingReversalCase.id, billingRefundIntent.reversalCaseId))
      .where(eq(billingRefundIntent.id, input.intentId));
    if (
      stored === undefined ||
      stored.intent.environment !== input.environment ||
      input.environment !== this.config.environment
    ) {
      throw new ConflictException('refund_recovery_scope');
    }
    let refundId = stored.leg.providerObjectId;
    if (refundId === null) {
      const provisionalClaim = await this.claimCanonicalSource({
        environment: input.environment,
        accountId: stored.intent.accountId,
        reversalCaseId: stored.reversal.id,
      });
      if (stored.reversal.chargeId === null) {
        await this.releaseClaim(provisionalClaim, 'refund_charge_missing');
        return { status: 'attention', reason: 'refund_charge_missing' };
      }
      const pages = await collectRefunds(this.sourceStripe, stored.reversal.chargeId, input.maximumPages);
      if (!pages.complete) {
        await this.releaseClaim(provisionalClaim, 'incomplete_refund_pages');
        return { status: 'pending', reason: 'incomplete_refund_pages' };
      }
      const matches = pages.refunds.filter((value) => {
        const { metadata } = value;
        return (
          metadata !== null &&
          metadata['tau_refund_intent_id'] === stored.intent.id &&
          metadata['tau_reversal_case_id'] === stored.reversal.id &&
          isSafeMinor(value.amount) &&
          BigInt(value.amount) === stored.intent.requestedGrossMinor
        );
      });
      if (matches.length !== 1 || matches[0] === undefined) {
        const result =
          matches.length === 0
            ? ({ status: 'pending', reason: 'refund_dispatch_unknown' } satisfies UnqualifiedCashSource)
            : ({ status: 'attention', reason: 'refund_dispatch_ambiguous' } satisfies UnqualifiedCashSource);
        await this.releaseClaim(provisionalClaim, result.reason);
        return result;
      }
      refundId = matches[0].id;
      const [linked] = await this.databaseService.database
        .update(billingProviderLeg)
        .set({ state: 'known', providerObjectId: refundId })
        .where(
          and(
            eq(billingProviderLeg.id, stored.leg.id),
            eq(billingProviderLeg.state, 'dispatched'),
            sql`${billingProviderLeg.providerObjectId} IS NULL`,
          ),
        )
        .returning({ id: billingProviderLeg.id });
      if (linked === undefined) throw new ServiceUnavailableException('refund_link_race');
      let qualified: QualifiedCashSource | UnqualifiedCashSource;
      try {
        qualified = await this.qualifyChargeSourceClaimed(
          {
            environment: input.environment,
            accountId: stored.intent.accountId,
            reversalCaseId: stored.reversal.id,
            maximumRefundPages: input.maximumPages,
          },
          provisionalClaim,
        );
      } catch (error) {
        await this.releaseClaim(provisionalClaim, 'refund_qualification_failed');
        throw error;
      }
      return this.applyRecoveredRefund(stored, refundId, qualified);
    }
    const qualified = await this.qualifyChargeSource({
      environment: input.environment,
      accountId: stored.intent.accountId,
      reversalCaseId: stored.reversal.id,
      maximumRefundPages: input.maximumPages,
    });
    return this.applyRecoveredRefund(stored, refundId, qualified);
  }

  public async qualifyChargeSource(input: ChargeSourceInput): Promise<QualifiedCashSource | UnqualifiedCashSource> {
    return this.qualifyChargeSourceClaimed(input);
  }

  public async applyQualifiedSource(input: {
    readonly accountId: string;
    readonly causeId: string;
    readonly source: 'plan' | 'purchased';
    readonly qualified: QualifiedCashSource;
    readonly occurredAt: Date;
  }): Promise<unknown> {
    return this.databaseService.database.transaction(async (tx) => {
      const receipt = await this.ledger.applyCashDisposition(
        {
          accountId: input.accountId,
          causeId: input.causeId,
          source: input.source,
          sourceClaimId: input.qualified.sourceClaimId,
          sourceGeneration: input.qualified.sourceGeneration,
          projectionDigest: input.qualified.projectionDigest,
          principalLossMinor: input.qualified.principalLossMinor,
          taxLossMinor: input.qualified.taxLossMinor,
          grossLossMinor: input.qualified.grossLossMinor,
          evidence: input.qualified.evidence,
          occurredAt: qualifiedCashOccurredAt(input.qualified, input.occurredAt),
        },
        tx,
      );
      await this.tax.observeQualifiedCashCorrection({
        transaction: tx,
        causeId: input.causeId,
        source: input.source,
        qualified: input.qualified,
      });
      const [finished] = await tx
        .update(billingStripeSource)
        .set({ state: 'done', leaseUntil: null, errorCode: null })
        .where(
          and(
            eq(billingStripeSource.id, input.qualified.sourceClaimId),
            eq(billingStripeSource.generation, input.qualified.sourceGeneration),
            eq(billingStripeSource.state, 'processing'),
            sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
          ),
        )
        .returning({ id: billingStripeSource.id });
      if (finished === undefined) throw new ServiceUnavailableException('cash_source_finish_fence');
      return receipt;
    });
  }

  public async releaseQualifiedClaim(input: {
    readonly environment: FinancialEnvironment;
    readonly stripeAccountId: string;
    readonly livemode: boolean;
    readonly sourceClaimId: string;
    readonly sourceGeneration: bigint;
    readonly reason: string;
  }): Promise<void> {
    if (
      input.environment !== this.config.environment ||
      input.stripeAccountId !== this.config.stripeAccountId ||
      input.livemode !== this.config.livemode ||
      input.sourceClaimId.length === 0 ||
      input.sourceGeneration < 1n ||
      input.reason.length === 0 ||
      input.reason.length > 100
    )
      throw new ConflictException('cash_source_release_scope');
    const [released] = await this.databaseService.database
      .update(billingStripeSource)
      .set({ state: 'pending', leaseUntil: null, errorCode: input.reason })
      .where(
        and(
          eq(billingStripeSource.id, input.sourceClaimId),
          eq(billingStripeSource.environment, input.environment),
          eq(billingStripeSource.stripeAccountId, input.stripeAccountId),
          eq(billingStripeSource.livemode, input.livemode),
          eq(billingStripeSource.sourceType, 'cash_charge'),
          eq(billingStripeSource.generation, input.sourceGeneration),
          eq(billingStripeSource.state, 'processing'),
          sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
        ),
      )
      .returning({ id: billingStripeSource.id });
    if (released === undefined) throw new ServiceUnavailableException('cash_source_claim_lost');
  }

  private async applyRecoveredRefund(
    stored: {
      readonly intent: typeof billingRefundIntent.$inferSelect;
      readonly leg: typeof billingProviderLeg.$inferSelect;
      readonly reversal: typeof billingReversalCase.$inferSelect;
    },
    refundId: string,
    qualified: QualifiedCashSource | UnqualifiedCashSource,
  ): Promise<UnqualifiedCashSource | { readonly status: 'applied'; readonly refundId: string }> {
    if (qualified.status !== 'qualified' || !('sourceClaimId' in qualified)) return qualified;
    let refund: Stripe.Refund;
    try {
      refund = await retrieveStripeRefund(this.sourceStripe, refundId);
    } catch (error) {
      await this.releaseClaim(
        { id: qualified.sourceClaimId, generation: qualified.sourceGeneration },
        'refund_source_read_failed',
      );
      throw error;
    }
    const refundMetadata = refund.metadata;
    if (
      refund.id !== refundId ||
      refundMetadata === null ||
      refundMetadata['tau_refund_intent_id'] !== stored.intent.id ||
      refundMetadata['tau_reversal_case_id'] !== stored.reversal.id ||
      !isSafeMinor(refund.amount) ||
      idOf(refund.charge) !== stored.reversal.chargeId ||
      BigInt(refund.amount) !== stored.intent.requestedGrossMinor
    ) {
      await this.releaseClaim(
        { id: qualified.sourceClaimId, generation: qualified.sourceGeneration },
        'refund_source_changed',
      );
      return { status: 'attention', reason: 'refund_source_changed' };
    }
    if (refund.status === 'pending' || refund.status === 'requires_action') {
      await this.releaseClaim(
        { id: qualified.sourceClaimId, generation: qualified.sourceGeneration },
        'refund_not_final',
      );
      return { status: 'pending', reason: 'refund_not_final' };
    }
    if (!['succeeded', 'failed', 'canceled'].includes(refund.status ?? '')) {
      await this.releaseClaim(
        { id: qualified.sourceClaimId, generation: qualified.sourceGeneration },
        'unsupported_refund_status',
      );
      return { status: 'attention', reason: 'unsupported_refund_status' };
    }
    const terminalState =
      refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' ? 'failed' : 'canceled';
    try {
      await this.databaseService.database.transaction(async (tx) => {
        const [account] = await tx
          .select({ id: creditAccount.id })
          .from(creditAccount)
          .where(eq(creditAccount.id, stored.intent.accountId))
          .for('update');
        const [reversal] = await tx
          .select()
          .from(billingReversalCase)
          .where(eq(billingReversalCase.id, stored.reversal.id))
          .for('update');
        const [intent] = await tx
          .select()
          .from(billingRefundIntent)
          .where(eq(billingRefundIntent.id, stored.intent.id))
          .for('update');
        const [claim] = await tx
          .select({ id: billingStripeSource.id })
          .from(billingStripeSource)
          .where(
            and(
              eq(billingStripeSource.id, qualified.sourceClaimId),
              eq(billingStripeSource.generation, qualified.sourceGeneration),
              eq(billingStripeSource.state, 'processing'),
              sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
            ),
          )
          .for('update');
        const causeId = reversal?.purchaseId ?? reversal?.periodId;
        if (
          account === undefined ||
          reversal === undefined ||
          intent === undefined ||
          claim === undefined ||
          causeId === null ||
          causeId === undefined ||
          intent.holdState !== 'held'
        ) {
          throw new ServiceUnavailableException('refund_apply_fence');
        }
        const source = reversal.source === 'plan' ? 'plan' : 'purchased';
        await addSourceHold(tx, intent.accountId, source, -intent.holdAtoms);
        await this.ledger.applyCashDisposition(
          {
            accountId: intent.accountId,
            causeId,
            source,
            sourceClaimId: qualified.sourceClaimId,
            sourceGeneration: qualified.sourceGeneration,
            projectionDigest: qualified.projectionDigest,
            principalLossMinor: qualified.principalLossMinor,
            taxLossMinor: qualified.taxLossMinor,
            grossLossMinor: qualified.grossLossMinor,
            evidence: qualified.evidence,
            occurredAt: qualifiedCashOccurredAt(qualified, stored.intent.reviewedAt),
          },
          tx,
        );
        await this.tax.observeQualifiedCashCorrection({
          transaction: tx,
          causeId,
          source,
          qualified,
        });
        const [finished] = await tx
          .update(billingRefundIntent)
          .set({
            state: terminalState,
            holdState: terminalState === 'succeeded' ? 'applied' : 'released',
            confirmedAt: sql`transaction_timestamp()`,
            updatedAt: sql`transaction_timestamp()`,
          })
          .where(and(eq(billingRefundIntent.id, intent.id), eq(billingRefundIntent.state, intent.state)))
          .returning({ id: billingRefundIntent.id });
        const [sourceFinished] = await tx
          .update(billingStripeSource)
          .set({ state: 'done', leaseUntil: null, errorCode: null })
          .where(
            and(
              eq(billingStripeSource.id, qualified.sourceClaimId),
              eq(billingStripeSource.generation, qualified.sourceGeneration),
              eq(billingStripeSource.state, 'processing'),
              sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
            ),
          )
          .returning({ id: billingStripeSource.id });
        if (finished === undefined || sourceFinished === undefined)
          throw new ServiceUnavailableException('refund_apply_fence');
      });
    } catch (error) {
      await this.releaseClaim(
        { id: qualified.sourceClaimId, generation: qualified.sourceGeneration },
        'refund_application_failed',
      );
      throw error;
    }
    return { status: 'applied', refundId: refund.id };
  }

  private async releaseClaimAndRethrow(
    claim: { readonly id: string; readonly generation: bigint },
    reason: string,
    error: unknown,
  ): Promise<never> {
    await this.releaseClaim(claim, reason).catch(() => undefined);
    throw error;
  }

  private async qualifyChargeSourceClaimed(
    input: ChargeSourceInput,
    existingClaim?: { readonly id: string; readonly generation: bigint },
  ): Promise<QualifiedCashSource | UnqualifiedCashSource> {
    const claim = existingClaim ?? (await this.claimCanonicalSource(input));
    const stop = async <T extends Extract<CashProjectionResult, { readonly status: 'pending' | 'attention' }>>(
      result: T,
    ): Promise<T> => {
      await this.releaseClaim(claim, result.reason);
      return result;
    };
    const [reversal] = await this.databaseService.database
      .select()
      .from(billingReversalCase)
      .where(and(eq(billingReversalCase.id, input.reversalCaseId), eq(billingReversalCase.accountId, input.accountId)));
    if (
      reversal?.chargeId === null ||
      reversal?.chargeId === undefined ||
      reversal.paymentIntentId === null ||
      reversal.currency === null ||
      reversal.customerBindingId === null ||
      reversal.originalPrincipalMinor === null ||
      reversal.originalTaxMinor === null
    )
      return stop({ status: 'attention', reason: 'cash_case_incomplete' });
    const paymentIntent = await retrieveStripePaymentIntent(this.sourceStripe, reversal.paymentIntentId);
    const charge = await retrieveStripeCharge(this.sourceStripe, reversal.chargeId);
    const [customer] = await this.databaseService.database.query.billingStripeCustomer.findMany({
      where: (table, operators) => operators.eq(table.id, reversal.customerBindingId ?? ''),
    });
    if (customer === undefined) return stop({ status: 'attention', reason: 'cash_customer_missing' });
    if (
      paymentIntent.id !== reversal.paymentIntentId ||
      paymentIntent.status !== 'succeeded' ||
      !isSafeMinor(paymentIntent.amount_received) ||
      !isSafeMinor(charge.amount) ||
      !isSafeMinor(charge.amount_captured) ||
      reversal.originalPrincipalMinor + reversal.originalTaxMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
      idOf(paymentIntent.customer) !== customer.stripeCustomerId ||
      idOf(paymentIntent.latest_charge) !== reversal.chargeId ||
      paymentIntent.currency !== reversal.currency ||
      paymentIntent.livemode !== reversal.livemode ||
      paymentIntent.amount_received !== charge.amount ||
      charge.amount !== Number(reversal.originalPrincipalMinor + reversal.originalTaxMinor) ||
      charge.id !== reversal.chargeId ||
      charge.status !== 'succeeded' ||
      !charge.paid ||
      charge.amount_captured !== charge.amount ||
      idOf(charge.payment_intent) !== reversal.paymentIntentId ||
      idOf(charge.customer) !== customer.stripeCustomerId ||
      charge.currency !== reversal.currency ||
      charge.livemode !== reversal.livemode
    )
      return stop({ status: 'attention', reason: 'cash_payment_source_mismatch' });
    const pages = await collectRefunds(this.sourceStripe, reversal.chargeId, input.maximumRefundPages);
    const disputePages = await collectDisputes(this.sourceStripe, reversal.chargeId, input.maximumRefundPages);
    if (!disputePages.complete) return stop({ status: 'pending', reason: 'incomplete_dispute_pages' });
    const disputes = await Promise.all(
      disputePages.disputes.map(async (value) => retrieveStripeDispute(this.sourceStripe, value.id)),
    );
    if (disputes.some((value, index) => value.id !== disputePages.disputes[index]?.id))
      return stop({ status: 'attention', reason: 'dispute_source_changed' });
    const intents = await this.databaseService.database
      .select()
      .from(billingRefundIntent)
      .where(eq(billingRefundIntent.reversalCaseId, reversal.id));
    const allocations: Record<string, { principalMinor: bigint; taxMinor: bigint }> = {};
    for (const intent of intents) {
      const matching = pages.refunds.filter((refund) => refund.metadata?.['tau_refund_intent_id'] === intent.id);
      if (matching.length !== 1 || matching[0]?.metadata?.['tau_reversal_case_id'] !== reversal.id)
        return stop({ status: 'attention', reason: 'refund_intent_binding' });
      const [leg] = await this.databaseService.database
        .select()
        .from(billingProviderLeg)
        .where(eq(billingProviderLeg.refundIntentId, intent.id));
      if (leg?.providerObjectId !== matching[0].id || intent.requestedGrossMinor !== BigInt(matching[0].amount))
        return stop({ status: 'attention', reason: 'refund_leg_binding' });
      allocations[matching[0].id] = {
        principalMinor: intent.requestedPrincipalMinor,
        taxMinor: intent.requestedTaxMinor,
      };
    }
    const result = qualifyStripeCashProjection({
      stripeAccountId: reversal.stripeAccountId ?? '',
      livemode: reversal.livemode,
      customerId: customer.stripeCustomerId,
      paymentIntentId: reversal.paymentIntentId,
      chargeId: reversal.chargeId,
      currency: reversal.currency,
      originalPrincipalMinor: reversal.originalPrincipalMinor,
      originalTaxMinor: reversal.originalTaxMinor,
      refunds: pages.refunds,
      refundPagesComplete: pages.complete,
      refundAllocations: allocations,
      disputes,
    });
    if (result.status !== 'qualified') return stop(result);
    const taxEvidence = taxCorrectionEvidence(
      result,
      pages.refunds,
      disputes,
      reversal.cumulativeGrossLossMinor !== BigInt(result.evidence.grossLossMinor),
    );
    if (taxEvidence === 'missing') return stop({ status: 'attention', reason: 'cash_effective_time_missing' });
    return {
      status: 'qualified',
      sourceClaimId: claim.id,
      sourceGeneration: claim.generation,
      projectionDigest: result.digest,
      principalLossMinor: BigInt(result.evidence.principalLossMinor),
      taxLossMinor: BigInt(result.evidence.taxLossMinor),
      grossLossMinor: BigInt(result.evidence.grossLossMinor),
      evidence: result.evidence,
      taxCorrectionEvidence: taxEvidence,
    };
  }

  private async claimCanonicalSource(input: {
    readonly environment: FinancialEnvironment;
    readonly accountId: string;
    readonly reversalCaseId: string;
  }): Promise<{ id: string; generation: bigint }> {
    const [reversal] = await this.databaseService.database
      .select()
      .from(billingReversalCase)
      .where(and(eq(billingReversalCase.id, input.reversalCaseId), eq(billingReversalCase.accountId, input.accountId)));
    if (
      reversal?.chargeId === null ||
      reversal?.chargeId === undefined ||
      reversal.environment !== input.environment ||
      input.environment !== this.config.environment ||
      reversal.stripeAccountId !== this.config.stripeAccountId ||
      reversal.livemode !== this.config.livemode
    )
      throw new ConflictException('cash_source_scope');
    return this.claimCharge(input.environment, reversal.chargeId);
  }

  private async claimCharge(
    environment: FinancialEnvironment,
    chargeId: string,
  ): Promise<{ id: string; generation: bigint }> {
    const id = createHash('sha256')
      .update(JSON.stringify([environment, this.config.stripeAccountId, this.config.livemode, chargeId]))
      .digest('hex');
    await this.databaseService.database
      .insert(billingStripeSource)
      .values({
        id,
        environment,
        stripeAccountId: this.config.stripeAccountId,
        livemode: this.config.livemode,
        sourceType: 'cash_charge',
        sourceId: chargeId,
      })
      .onConflictDoNothing();
    const [claim] = await this.databaseService.database
      .update(billingStripeSource)
      .set({
        state: 'processing',
        generation: sql`${billingStripeSource.generation} + 1`,
        leaseUntil: sql`date_trunc('milliseconds', clock_timestamp()) + interval '30 seconds'`,
      })
      .where(
        and(
          eq(billingStripeSource.id, id),
          eq(billingStripeSource.environment, environment),
          eq(billingStripeSource.stripeAccountId, this.config.stripeAccountId),
          eq(billingStripeSource.livemode, this.config.livemode),
          eq(billingStripeSource.sourceType, 'cash_charge'),
          eq(billingStripeSource.sourceId, chargeId),
          sql`${billingStripeSource.leaseUntil} IS NULL OR ${billingStripeSource.leaseUntil} <= clock_timestamp()`,
        ),
      )
      .returning();
    if (claim === undefined) throw new ServiceUnavailableException('cash_source_claimed');
    return { id: claim.id, generation: claim.generation };
  }

  private async releaseClaim(
    claim: { readonly id: string; readonly generation: bigint },
    errorCode: string,
  ): Promise<void> {
    const [released] = await this.databaseService.database
      .update(billingStripeSource)
      .set({ state: 'pending', leaseUntil: null, errorCode })
      .where(
        and(
          eq(billingStripeSource.id, claim.id),
          eq(billingStripeSource.generation, claim.generation),
          eq(billingStripeSource.state, 'processing'),
          sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
        ),
      )
      .returning({ id: billingStripeSource.id });
    if (released === undefined) throw new ServiceUnavailableException('cash_source_claim_lost');
  }
}

async function collectRefunds(
  stripe: Stripe,
  chargeId: string,
  maximumPages: number,
): Promise<{ refunds: Stripe.Refund[]; complete: boolean }> {
  if (!Number.isSafeInteger(maximumPages) || maximumPages < 1 || maximumPages > 100)
    throw new Error('Invalid refund page ceiling');
  const refunds: Stripe.Refund[] = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < maximumPages; pageIndex += 1) {
    const page = await listStripeRefundPage(stripe, {
      chargeId,
      created: { gte: 0, lt: 8_640_000_000_000 },
      startingAfter: cursor,
    });
    refunds.push(...page.data);
    if (!page.hasMore) return { refunds, complete: true };
    cursor = page.nextCursor;
  }
  return { refunds, complete: false };
}

async function collectDisputes(
  stripe: Stripe,
  chargeId: string,
  maximumPages: number,
): Promise<{ disputes: Stripe.Dispute[]; complete: boolean }> {
  if (!Number.isSafeInteger(maximumPages) || maximumPages < 1 || maximumPages > 100)
    throw new Error('Invalid dispute page ceiling');
  const disputes: Stripe.Dispute[] = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < maximumPages; pageIndex += 1) {
    const page = await listStripeDisputePage(stripe, {
      chargeId,
      created: { gte: 0, lt: 8_640_000_000_000 },
      startingAfter: cursor,
    });
    disputes.push(...page.data);
    if (!page.hasMore) return { disputes, complete: true };
    cursor = page.nextCursor;
  }
  return { disputes, complete: false };
}

async function addSourceHold(
  tx: Transaction,
  accountId: string,
  source: 'plan' | 'purchased',
  hold: bigint,
): Promise<void> {
  await tx
    .update(creditAccount)
    .set(
      source === 'plan'
        ? { planHeldAtoms: sql`${creditAccount.planHeldAtoms} + ${hold}` }
        : { purchasedHeldAtoms: sql`${creditAccount.purchasedHeldAtoms} + ${hold}` },
    )
    .where(eq(creditAccount.id, accountId));
}

// oxlint-disable-next-line typescript/no-restricted-types -- Stripe explicitly uses null for absent expanded identities.
function idOf(value: string | { id: string } | null): string {
  return typeof value === 'string' ? value : (value?.id ?? '');
}

function parseUnsigned(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) throw new Error(`Invalid refund ${label}`);
  return BigInt(value);
}

function isSafeMinor(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function qualifiedFrom(
  claim: { readonly id: string; readonly generation: bigint },
  result: Extract<CashProjectionResult, { readonly status: 'qualified' }>,
  taxEvidence: CashTaxCorrectionEvidence | undefined,
): QualifiedCashSource {
  return {
    status: 'qualified',
    sourceClaimId: claim.id,
    sourceGeneration: claim.generation,
    projectionDigest: result.digest,
    principalLossMinor: BigInt(result.evidence.principalLossMinor),
    taxLossMinor: BigInt(result.evidence.taxLossMinor),
    grossLossMinor: BigInt(result.evidence.grossLossMinor),
    evidence: result.evidence,
    taxCorrectionEvidence: taxEvidence,
  };
}

function qualifiedCashOccurredAt(qualified: QualifiedCashSource, fallback: Date): Date {
  const effectiveAt = qualified.taxCorrectionEvidence?.effectiveAt;
  if (effectiveAt === undefined) {
    if (qualified.grossLossMinor !== 0n) throw new Error('cash_effective_time_missing');
    return fallback;
  }
  const occurredAt = new Date(effectiveAt);
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('cash_effective_time_invalid');
  return occurredAt;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
