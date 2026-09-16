/* oxlint-disable no-await-in-loop, max-lines, complexity -- financial mutations execute sequentially in one lock order */
import { cashBlockingFinancialCaseKinds } from '#api/billing/billing-cash-reconciliation.service.js';
import {
  paymentOfferSnapshotSchema,
  paidPaymentEvidenceSchema,
  cashProjectionCoversRetained,
  cashProjectionEvidenceSchema,
  cashProjectionDigest,
} from '#api/billing/billing-payment-contract.js';
import { maximumMeterCharge } from '#api/billing/billable-model-bound.js';
import { calculatePreliminarySupplierCost } from '#api/billing/billable-model-cost.js';
import { routeSkuFamily } from '#api/billing/billable-model-qualification.js';
import { resolvePolicyRoute, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, lt, ne, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  financialIdentitySchema,
  rationalUnsignedIntegerStringSchema,
  financialActivityKindSchema,
  billingExecutionStatusSchema,
} from '@taucad/billing';
import type { FinancialActivityKind } from '@taucad/billing';
import { DatabaseService } from '#database/database.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import {
  billingFinancialCase,
  billingBudget,
  billingBudgetFunding,
  billingBudgetHold,
  billingInvocationEvidence,
  billingOperationException,
  billingOwnerBinding,
  billingPeriod,
  billingPolicy,
  billingPromotionIssuance,
  billingPurchase,
  billingReloadWork,
  billingStripeCustomer,
  billingStripeSource,
  subscription,
  billingRoutePause,
  billingReversalCase,
  creditAccount,
  creditOperation,
  creditTransaction,
  supplierCostEvidence,
  user,
} from '#database/schema.js';
import type {
  AccountSnapshot,
  AdmissionResult,
  AdmissionDenial,
  BillingEnvironment,
  CompensationInput,
  CashDispositionInput,
  FundedLlmCapacityPool,
  LlmRecoveryResult,
  OperationClaim,
  OwnerLlmRecoveryResult,
  PaidCauseInput,
  PaidCauseReceipt,
  PromotionIssuanceInput,
  QualifiedAdmissionInput,
  ReversalMutationInput,
  SourceAmounts,
  SupplierEvidenceInput,
  SupplierFinalityInput,
  TerminalEvidence,
  TerminalizeInput,
  TerminalReceipt,
} from '#api/billing/credit-ledger.types.js';

type Tx = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];
type Account = typeof creditAccount.$inferSelect;

const helperActivityKinds = ['title', 'commit'];
export const fundedLlmCapacityLimits: Readonly<Record<FundedLlmCapacityPool, number>> = {
  primary: 64,
  helper: 64,
};
export const classifyFundedLlmCapacity = (
  activity: string,
): { activity: FinancialActivityKind; pool: FundedLlmCapacityPool; limit: number } => {
  const parsedActivity = financialActivityKindSchema.safeParse(activity);
  const trustedActivity = parsedActivity.success ? parsedActivity.data : 'other';
  const pool = helperActivityKinds.includes(trustedActivity) ? 'helper' : 'primary';
  return { activity: trustedActivity, pool, limit: fundedLlmCapacityLimits[pool] };
};
const llmCapacityPoolActivity = (pool: FundedLlmCapacityPool) =>
  pool === 'helper'
    ? inArray(creditOperation.activity, helperActivityKinds)
    : notInArray(creditOperation.activity, helperActivityKinds);
const pendingLlmCapacityPool = (accountId: string, pool: FundedLlmCapacityPool) =>
  and(
    eq(creditOperation.accountId, accountId),
    eq(creditOperation.category, 'llm'),
    eq(creditOperation.customerState, 'pending'),
    llmCapacityPoolActivity(pool),
  );

const admissionHistorySchema = z.object({
  modelId: financialIdentitySchema,
  modelDisplayName: z.string().min(1).max(128).optional(),
  providerId: financialIdentitySchema.optional(),
  projectHint: financialIdentitySchema.optional(),
  chatHint: financialIdentitySchema.optional(),
});
const terminalHistorySchema = z.object({
  executionStatus: billingExecutionStatusSchema.optional(),
  normalizationEvidence: z
    .object({
      version: financialIdentitySchema,
      providerRequestId: z.string().min(1).max(256).optional(),
      terminalReason: financialIdentitySchema.optional(),
      fields: z
        .record(
          financialIdentitySchema,
          z
            .string()
            .max(160)
            .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/u),
        )
        .refine((fields) => Object.keys(fields).length <= 64),
    })
    .optional(),
});
const supplierRateSchema = z
  .object({
    dimension: financialIdentitySchema,
    tier: financialIdentitySchema.nullable(),
    numeratorPicoUsd: rationalUnsignedIntegerStringSchema,
    denominatorUnits: rationalUnsignedIntegerStringSchema.refine((value) => BigInt(value) > 0n),
  })
  .strict();
const supplierRatesSchema = z.array(supplierRateSchema).min(1).max(128);
const invocationSchema = z
  .object({
    contractVersion: financialIdentitySchema,
    credentialAccount: financialIdentitySchema,
    supplierRatesValidUntil: z.iso.datetime({ precision: 3 }).nullable(),
    supplierRates: supplierRatesSchema,
    supplierValuation: z
      .object({
        version: z.literal('supplier-valuation-v1'),
        sourceRevision: financialIdentitySchema,
        longContextMinimumInputTokens: rationalUnsignedIntegerStringSchema.nullable(),
        baseRates: supplierRatesSchema,
        longContextRates: supplierRatesSchema.nullable(),
      })
      .strict()
      .optional(),
    jointInputMaximum: z
      .object({
        version: z.literal('joint-input-v1'),
        quantity: rationalUnsignedIntegerStringSchema,
      })
      .strict()
      .optional(),
    inputCount: z
      .object({
        version: z.literal('openai-input-count-v1'),
        sourceRevision: financialIdentitySchema,
        environment: z.enum(['development', 'staging', 'prod-us', 'prod-eu']),
        credentialAccount: financialIdentitySchema,
        modelId: financialIdentitySchema,
        createRequestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        countRequestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        inputTokens: rationalUnsignedIntegerStringSchema,
        liability: z.enum(['controlled-local-zero', 'openai-input-tokens-v1']),
      })
      .strict()
      .optional(),
    executionTimeout: z.number().int().min(1).max(300_000),
  })
  .strict();
const persistedInvocationEvidenceSchema = terminalHistorySchema
  .extend({
    kind: z.enum(['final_usage', 'provider_rejected', 'absorbed_unknown', 'authorized_exhausted']),
    usageOccurredAt: z.iso.datetime().optional(),
    reasoningTokens: rationalUnsignedIntegerStringSchema.optional(),
    meterItems: z
      .array(
        z
          .object({
            dimension: financialIdentitySchema,
            tier: financialIdentitySchema.nullable(),
            quantity: rationalUnsignedIntegerStringSchema,
          })
          .strict(),
      )
      .max(128)
      .optional(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      evidence.kind === 'final_usage' &&
      (evidence.usageOccurredAt === undefined || evidence.meterItems === undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'Complete usage requires event time and meters' });
    }
    if (
      evidence.kind === 'provider_rejected' &&
      (evidence.usageOccurredAt !== undefined || evidence.meterItems !== undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'Rejected evidence cannot carry usage' });
    }
    const meters = evidence.meterItems ?? [];
    if (new Set(meters.map(({ dimension, tier }) => `${dimension}:${tier ?? ''}`)).size !== meters.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate meter dimension' });
    }
    const output = meters.find(({ dimension }) => dimension === 'output');
    if (
      evidence.reasoningTokens !== undefined &&
      (!output || BigInt(evidence.reasoningTokens) > BigInt(output.quantity))
    ) {
      context.addIssue({ code: 'custom', message: 'Reasoning must be a subset of output' });
    }
  });
export const serializeInvocationEvidence = (
  input: TerminalEvidence,
): z.infer<typeof persistedInvocationEvidenceSchema> =>
  persistedInvocationEvidenceSchema.parse({
    ...input,
    usageOccurredAt: input.usageOccurredAt?.toISOString(),
    reasoningTokens: input.reasoningTokens?.toString(),
    meterItems:
      input.kind === 'provider_rejected'
        ? undefined
        : input.meterItems?.map((item) => ({
            ...item,
            quantity: item.quantity.toString(),
          })),
  });
export const invocationEvidenceDigest = (evidence: z.infer<typeof persistedInvocationEvidenceSchema>): string => {
  const payload = JSON.stringify(evidence);
  if (Buffer.byteLength(payload) > 32_768) {
    throw new RangeError('Invocation evidence exceeds retained byte bound');
  }
  return createHash('sha256').update(payload).digest('hex');
};

/** Allocates eligible credit in the frozen promotional, plan, purchased order. */
export const allocateSources = (account: AccountSnapshot, amount: bigint): SourceAmounts | undefined => {
  if (amount < 0n) {
    throw new RangeError('Authorized credit atoms must be nonnegative');
  }
  if (account.debtAtoms !== 0n) {
    return undefined;
  }
  let remaining = amount;
  const promoAtoms =
    remaining < account.promoAtoms - account.promoHeldAtoms ? remaining : account.promoAtoms - account.promoHeldAtoms;
  remaining -= promoAtoms;
  const planAtoms =
    remaining < account.planAtoms - account.planHeldAtoms ? remaining : account.planAtoms - account.planHeldAtoms;
  remaining -= planAtoms;
  const purchasedAtoms =
    remaining < account.purchasedAtoms - account.purchasedHeldAtoms
      ? remaining
      : account.purchasedAtoms - account.purchasedHeldAtoms;
  return remaining - purchasedAtoms === 0n ? { promoAtoms, planAtoms, purchasedAtoms } : undefined;
};

/** Spendable credit left after holds and debt: a credit denial's `availableCreditAtoms`. */
export const availableAtoms = (account: AccountSnapshot): bigint =>
  account.promoAtoms +
  account.planAtoms +
  account.purchasedAtoms -
  account.debtAtoms -
  account.promoHeldAtoms -
  account.planHeldAtoms -
  account.purchasedHeldAtoms;

/**
 * A refused admission, with the shortfall a credit denial must carry.
 *
 * The blueprint's UI contract needs the amounts alongside the reason so the
 * client can say how much is missing (`billing-admission-hold-redesign.md`,
 * Architecture C). Declared here rather than widening `AdmissionResult` because
 * only the admission path produces them.
 */
export type AdmissionDenied = {
  status: 'denied';
  reason: AdmissionDenial;
  /** Credit the refused call would have authorized. */
  requiredCreditAtoms?: bigint;
  /** Spendable credit the account had when it was refused. */
  availableCreditAtoms?: bigint;
};

/** Applies incoming credit to explicit debt before creating a spendable asset. */
export const creditDebtFirst = (debtAtoms: bigint, atoms: bigint): { debtDeltaAtoms: bigint; assetAtoms: bigint } => {
  if (debtAtoms < 0n || atoms < 0n) {
    throw new RangeError('Credit atoms must be nonnegative');
  }
  const repaid = debtAtoms < atoms ? debtAtoms : atoms;
  return { debtDeltaAtoms: -repaid, assetAtoms: atoms - repaid };
};

const snapshot = (row: Account): AccountSnapshot => ({
  accountId: row.id,
  promoAtoms: row.promoAtoms,
  planAtoms: row.planAtoms,
  purchasedAtoms: row.purchasedAtoms,
  debtAtoms: row.debtAtoms,
  promoHeldAtoms: row.promoHeldAtoms,
  planHeldAtoms: row.planHeldAtoms,
  purchasedHeldAtoms: row.purchasedHeldAtoms,
  revision: row.revision,
});
/** Rejects altered use of a durable attempt identity consistently across admission and replay. */
export const assertMatchingRequestDigest = (stored: string, supplied: string): void => {
  if (stored !== supplied) {
    throw new ConflictException('Attempt key replayed with a different request digest');
  }
};
const customerState = (value: string): 'pending' | 'settled' | 'released' | 'absorbed' => {
  if (value === 'pending' || value === 'settled' || value === 'released' || value === 'absorbed') {
    return value;
  }
  throw new Error(`Invalid stored customer state: ${value}`);
};
const greatestCommonDivisor = (left: bigint, right: bigint): bigint => {
  let a = left;
  let b = right;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
};

const roundHalfUpUnbounded = (parts: ReadonlyArray<{ numerator: bigint; denominator: bigint }>): bigint => {
  let numerator = 0n;
  let denominator = 1n;
  for (const part of parts) {
    if (part.denominator <= 0n || part.numerator < 0n) {
      throw new RangeError('Pricing rationals must be nonnegative with positive denominators');
    }
    const divisor = greatestCommonDivisor(denominator, part.denominator);
    const nextDenominator = (denominator / divisor) * part.denominator;
    numerator = numerator * (nextDenominator / denominator) + part.numerator * (nextDenominator / part.denominator);
    denominator = nextDenominator;
  }
  return (numerator * 2n + denominator) / (denominator * 2n);
};
const terminalCustomerState = (value: string): 'settled' | 'released' | 'absorbed' => {
  const state = customerState(value);
  if (state === 'pending') {
    throw new Error('Pending operation has no receipt');
  }
  return state;
};
const hasConstraint = (error: unknown, constraint: string): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint_name' in current &&
      current.constraint_name === constraint
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
};

@Injectable()
export class CreditLedgerService {
  public constructor(
    @Inject(DatabaseService)
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly policyService: BillingPolicyService,
  ) {}

  /** Creates stable financial identity before a financial transaction takes budget locks. */
  public async ensureAccountBinding(input: { environment: string; authUserId: string }): Promise<string> {
    try {
      return await this.databaseService.database.transaction(async (tx) => {
        const [found] = await tx
          .select({
            accountId: billingOwnerBinding.accountId,
            revokedAt: billingOwnerBinding.revokedAt,
            status: creditAccount.status,
          })
          .from(billingOwnerBinding)
          .innerJoin(creditAccount, eq(creditAccount.id, billingOwnerBinding.accountId))
          .where(
            and(
              eq(billingOwnerBinding.environment, input.environment),
              eq(billingOwnerBinding.authUserId, input.authUserId),
            ),
          );
        if (found) {
          if (found.revokedAt !== null || found.status !== 'open') {
            throw new Error('Financial owner is revoked or closed');
          }
          return found.accountId;
        }
        const accountId = randomUUID();
        await tx.insert(creditAccount).values({ id: accountId, environment: input.environment });
        await tx.insert(billingOwnerBinding).values({
          id: randomUUID(),
          accountId,
          environment: input.environment,
          authUserId: input.authUserId,
        });
        return accountId;
      });
    } catch (error) {
      if (!hasConstraint(error, 'billing_owner_active_user')) {
        throw error;
      }
      const [winner] = await this.databaseService.database
        .select({
          accountId: billingOwnerBinding.accountId,
          revokedAt: billingOwnerBinding.revokedAt,
          status: creditAccount.status,
        })
        .from(billingOwnerBinding)
        .innerJoin(creditAccount, eq(creditAccount.id, billingOwnerBinding.accountId))
        .where(
          and(
            eq(billingOwnerBinding.environment, input.environment),
            eq(billingOwnerBinding.authUserId, input.authUserId),
            sql`${billingOwnerBinding.revokedAt} is null`,
          ),
        );
      if (winner?.revokedAt !== null || winner.status !== 'open') {
        throw error;
      }
      return winner.accountId;
    }
  }

  /** Called only after invocation qualification; a count denial wakes reload without provider I/O. */
  public async recordFundedWorkDenial(input: {
    environment: BillingEnvironment;
    authUserId: string;
    attemptKey: string;
    requestDigest: string;
  }): Promise<void> {
    financialIdentitySchema.parse(input.attemptKey);
    if (!/^[a-f0-9]{64}$/u.test(input.requestDigest)) {
      throw new Error('Invalid funded request digest');
    }
    const [binding] = await this.databaseService.database
      .select()
      .from(billingOwnerBinding)
      .where(
        and(
          eq(billingOwnerBinding.environment, input.environment),
          eq(billingOwnerBinding.authUserId, input.authUserId),
          sql`${billingOwnerBinding.revokedAt} IS NULL`,
        ),
      );
    if (!binding) {
      return;
    }
    await this.databaseService.database.transaction(async (tx) => {
      const account = await this.lockAccount(tx, binding.accountId);
      const [owned] = await tx
        .select()
        .from(billingOwnerBinding)
        .where(
          and(
            eq(billingOwnerBinding.id, binding.id),
            eq(billingOwnerBinding.accountId, account.id),
            eq(billingOwnerBinding.authUserId, input.authUserId),
            eq(billingOwnerBinding.environment, input.environment),
            sql`${billingOwnerBinding.revokedAt} IS NULL`,
          ),
        )
        .for('update');
      if (
        !owned ||
        account.environment !== input.environment ||
        account.status !== 'open' ||
        account.debtAtoms !== 0n
      ) {
        return;
      }
      await this.queueReloadWork(tx, account, {
        reasonKind: 'insufficient_funds',
        reasonAttemptKey: input.attemptKey,
        reasonRequestDigest: input.requestDigest,
      });
    });
  }

  /** Advisory count-resource check only; no locks or holds span network I/O. Admission rechecks money atomically. */
  public async inputCountEligibility(input: {
    environment: BillingEnvironment;
    authUserId: string;
    activity: string;
    sku: string;
    replica: QualifiedAdmissionInput['replica'];
    /** Milliseconds. */
    executionTimeout: number;
    minimumOutput: bigint;
    minimumSupplierPicoUsd: bigint;
  }): Promise<{ status: 'eligible'; executionDeadline: Date; remaining: number } | AdmissionDenied> {
    const effective = await this.policyService.selectEffectivePolicyRoute(input);
    const [bound] = await this.databaseService.database
      .select({ account: creditAccount })
      .from(billingOwnerBinding)
      .innerJoin(creditAccount, eq(creditAccount.id, billingOwnerBinding.accountId))
      .where(
        and(
          eq(billingOwnerBinding.environment, input.environment),
          eq(billingOwnerBinding.authUserId, input.authUserId),
          sql`${billingOwnerBinding.revokedAt} is null`,
        ),
      );
    if (!bound || bound.account.environment !== input.environment || bound.account.status !== 'open') {
      return { status: 'denied', reason: 'account_restricted' };
    }
    const minimumAtoms = maximumMeterCharge(
      effective.rates.map((rate) => ({
        dimension: rate.dimension,
        quantity: rate.dimension === 'output' ? input.minimumOutput : 0n,
        numerator: BigInt(rate.numeratorCreditAtoms),
        denominator: BigInt(rate.publicDenominatorUnits),
      })),
    );
    // Both refusals are a shortfall the client has to be able to name, so the
    // minimum this call would authorize is computed before either is returned.
    const shortfall = {
      requiredCreditAtoms: minimumAtoms,
      availableCreditAtoms: availableAtoms(snapshot(bound.account)),
    };
    if (bound.account.debtAtoms !== 0n) {
      return { status: 'denied', reason: 'debt', ...shortfall };
    }
    if (!allocateSources(snapshot(bound.account), minimumAtoms)) {
      return { status: 'denied', reason: 'insufficient_credit', ...shortfall };
    }
    const capacity = classifyFundedLlmCapacity(input.activity);
    const pending = await this.databaseService.database
      .select({ id: creditOperation.id })
      .from(creditOperation)
      .where(pendingLlmCapacityPool(bound.account.id, capacity.pool))
      .limit(capacity.limit);
    if (pending.length >= capacity.limit) {
      return { status: 'denied', reason: 'concurrency_unavailable' };
    }
    const [paused] = await this.databaseService.database
      .select({ sku: billingRoutePause.sku })
      .from(billingRoutePause)
      .where(
        and(
          eq(billingRoutePause.environment, input.environment),
          eq(billingRoutePause.sku, routeSkuFamily(input.sku)[0]),
        ),
      );
    if (paused) {
      return { status: 'denied', reason: 'policy_unavailable' };
    }
    const budgets = await this.databaseService.database
      .select({ budget: billingBudget, funding: billingBudgetFunding })
      .from(billingBudget)
      .innerJoin(billingBudgetFunding, eq(billingBudgetFunding.id, billingBudget.fundingId))
      .where(inArray(billingBudget.id, [effective.route.spendBudgetId, effective.route.riskBudgetId]));
    if (
      budgets.length !== 2 ||
      budgets.some(
        ({ budget, funding }) =>
          budget.environment !== input.environment ||
          funding.environment !== input.environment ||
          budget.quantum !== 'pico_usd' ||
          budget.kind !== (budget.id === effective.route.spendBudgetId ? 'spend' : 'risk') ||
          budget.consumed + budget.held + input.minimumSupplierPicoUsd > budget.approvedCap ||
          funding.consumed + funding.held + input.minimumSupplierPicoUsd > funding.fundedLifetime,
      )
    ) {
      return { status: 'denied', reason: 'budget_unavailable' };
    }
    const executionDeadline = new Date(effective.selectedAt.getTime() + input.executionTimeout);
    const [clock] = await this.databaseService.database
      .select({
        remaining: sql<number>`extract(epoch from (${executionDeadline.toISOString()}::timestamptz - clock_timestamp())) * 1000`,
      })
      .from(creditAccount)
      .where(eq(creditAccount.id, bound.account.id));
    const remaining = Math.floor(Number(clock?.remaining ?? 0));
    if (remaining <= 0) {
      return { status: 'denied', reason: 'policy_unavailable' };
    }
    return { status: 'eligible', executionDeadline, remaining };
  }

  /** Places source and budget holds transactionally before any external dispatch. */
  public async admitOperation(
    input: QualifiedAdmissionInput,
  ): Promise<Exclude<AdmissionResult, { status: 'denied' }> | AdmissionDenied> {
    const history = admissionHistorySchema.parse(input);
    const invocation = input.invocation === undefined ? undefined : invocationSchema.parse(input.invocation);
    const capacity = classifyFundedLlmCapacity(input.activity);
    if (
      invocation?.inputCount &&
      /* Counting is qualified in every environment (R11). The binding below, not the environment,
       * is what makes counted evidence admissible: it must be this operation's own count. */
      (invocation.inputCount.environment !== input.environment ||
        invocation.inputCount.credentialAccount !== invocation.credentialAccount ||
        invocation.inputCount.modelId !== input.modelId ||
        input.providerId !== 'openai' ||
        invocation.inputCount.inputTokens !== invocation.jointInputMaximum?.quantity ||
        input.executionDeadline === undefined)
    ) {
      throw new Error('Counted invocation binding is invalid');
    }
    if (input.maximumQuantities.length > 128) {
      throw new RangeError('Too many maximum meter quantities');
    }
    for (const item of input.maximumQuantities) {
      rationalUnsignedIntegerStringSchema.parse(item.quantity.toString());
    }
    const accountId = await this.ensureAccountBinding(input);
    const [existing] = await this.databaseService.database
      .select()
      .from(creditOperation)
      .where(
        and(
          eq(creditOperation.accountId, accountId),
          eq(creditOperation.surface, input.surface),
          eq(creditOperation.attemptKey, input.attemptKey),
        ),
      );
    if (existing) {
      return this.replayAdmission(existing.id, input.requestDigest);
    }
    try {
      return await this.databaseService.database.transaction(async (tx) => {
        const effective = await this.policyService.selectEffectivePolicyRoute(
          {
            environment: input.environment,
            sku: input.sku,
            replica: input.replica,
          },
          tx,
        );
        if (input.executionDeadline !== undefined && input.executionDeadline <= effective.selectedAt) {
          return { status: 'denied', reason: 'policy_unavailable' };
        }
        if (
          invocation === undefined &&
          (input.executionDeadline === undefined || input.executionDeadline <= effective.selectedAt)
        ) {
          return { status: 'denied', reason: 'policy_unavailable' };
        }
        if (
          invocation !== undefined &&
          invocation.supplierRatesValidUntil !== null &&
          new Date(invocation.supplierRatesValidUntil) <= effective.selectedAt
        ) {
          return { status: 'denied', reason: 'policy_unavailable' };
        }
        const quantities = new Map(
          input.maximumQuantities.map((item) => [`${item.dimension}:${item.tier ?? ''}`, item.quantity]),
        );
        if (
          quantities.size !== input.maximumQuantities.length ||
          quantities.size !== effective.requiredDimensions.size ||
          [...quantities.keys()].some((key) => !effective.requiredDimensions.has(key)) ||
          [...quantities.values()].some((quantity) => quantity < 0n)
        ) {
          throw new Error('Maximum meter quantities do not match the qualified contract');
        }
        const pinnedTariff = effective.rates.map((rate) => ({
          rateId: rate.rateId,
          dimension: rate.dimension,
          tier: rate.tier,
          unit: rate.unit,
          numeratorCreditAtoms: rate.numeratorCreditAtoms,
          denominatorUnits: rate.publicDenominatorUnits,
        }));
        const maximumQuantities = input.maximumQuantities.map((item) => ({
          dimension: item.dimension,
          tier: item.tier,
          quantity: item.quantity.toString(),
        }));
        const authorizedAtoms = maximumMeterCharge(
          effective.rates.map((rate) => ({
            dimension: rate.dimension,
            quantity: quantities.get(`${rate.dimension}:${rate.tier ?? ''}`) ?? 0n,
            numerator: BigInt(rate.numeratorCreditAtoms),
            denominator: BigInt(rate.publicDenominatorUnits),
          })),
          invocation?.jointInputMaximum,
        );
        const supplierMaximum = input.supplierMaximumPicoUsd;
        if (supplierMaximum < 0n || supplierMaximum.toString().length > 78) {
          throw new RangeError('Supplier maximum is outside numeric(78,0)');
        }
        if (invocation !== undefined) {
          const supplierDimensions = new Set(
            invocation.supplierRates.map((rate) => `${rate.dimension}:${rate.tier ?? ''}`),
          );
          if (
            input.category !== 'llm' ||
            supplierDimensions.size !== invocation.supplierRates.length ||
            supplierDimensions.size !== quantities.size ||
            [...supplierDimensions].some((key) => !quantities.has(key))
          ) {
            throw new Error('Supplier tariff does not cover the invocation meter contract');
          }
          const valuation = invocation.supplierValuation;
          if (valuation !== undefined) {
            if ((valuation.longContextMinimumInputTokens === null) !== (valuation.longContextRates === null)) {
              throw new Error('Supplier valuation context selector is incomplete');
            }
            for (const schedule of [
              valuation.baseRates,
              ...(valuation.longContextRates === null ? [] : [valuation.longContextRates]),
            ]) {
              const keys = new Set(schedule.map((rate) => `${rate.dimension}:${rate.tier ?? ''}`));
              if (keys.size !== schedule.length || keys.size !== supplierDimensions.size) {
                throw new Error('Supplier valuation does not match the pinned maximum tariff');
              }
              for (const rate of schedule) {
                const maximum = invocation.supplierRates.find(
                  (candidate) => candidate.dimension === rate.dimension && candidate.tier === rate.tier,
                );
                if (
                  maximum === undefined ||
                  BigInt(rate.numeratorPicoUsd) * BigInt(maximum.denominatorUnits) >
                    BigInt(maximum.numeratorPicoUsd) * BigInt(rate.denominatorUnits)
                ) {
                  throw new Error('Supplier valuation exceeds the pinned maximum tariff');
                }
              }
            }
          }
          const requiredSupplierMaximum = maximumMeterCharge(
            invocation.supplierRates.map((rate) => ({
              dimension: rate.dimension,
              quantity: quantities.get(`${rate.dimension}:${rate.tier ?? ''}`)!,
              numerator: BigInt(rate.numeratorPicoUsd),
              denominator: BigInt(rate.denominatorUnits),
            })),
            invocation.jointInputMaximum,
          );
          if (
            supplierMaximum < requiredSupplierMaximum ||
            (invocation.jointInputMaximum !== undefined && supplierMaximum !== requiredSupplierMaximum)
          ) {
            throw new Error('Supplier hold does not cover the independently pinned tariff');
          }
        }
        await this.lockRoute(tx, input.environment, input.sku);
        const [paused] = await tx
          .select()
          .from(billingRoutePause)
          .where(
            and(
              eq(billingRoutePause.environment, input.environment),
              eq(billingRoutePause.sku, routeSkuFamily(input.sku)[0]),
            ),
          );
        if (paused) {
          return { status: 'denied', reason: 'policy_unavailable' };
        }
        const requirements = [
          {
            budgetId: effective.route.spendBudgetId,
            maximum: supplierMaximum,
            kind: 'spend',
          },
          {
            budgetId: effective.route.riskBudgetId,
            maximum: supplierMaximum,
            kind: 'risk',
          },
        ].sort((a, b) => a.budgetId.localeCompare(b.budgetId));
        const discovered = await tx
          .select()
          .from(billingBudget)
          .where(
            inArray(
              billingBudget.id,
              requirements.map(({ budgetId }) => budgetId),
            ),
          );
        const funding = await tx
          .select()
          .from(billingBudgetFunding)
          .where(
            inArray(
              billingBudgetFunding.id,
              discovered.map(({ fundingId }) => fundingId),
            ),
          )
          .orderBy(asc(billingBudgetFunding.id))
          .for('update');
        const budgets = await tx
          .select()
          .from(billingBudget)
          .where(
            inArray(
              billingBudget.id,
              requirements.map(({ budgetId }) => budgetId),
            ),
          )
          .orderBy(asc(billingBudget.id))
          .for('update');
        if (
          budgets.length !== requirements.length ||
          funding.length !== new Set(budgets.map(({ fundingId }) => fundingId)).size
        ) {
          return { status: 'denied', reason: 'budget_unavailable' };
        }
        const account = await this.lockAccount(tx, accountId);
        const [replay] = await tx
          .select()
          .from(creditOperation)
          .where(
            and(
              eq(creditOperation.accountId, accountId),
              eq(creditOperation.surface, input.surface),
              eq(creditOperation.attemptKey, input.attemptKey),
            ),
          )
          .for('update');
        if (replay) {
          assertMatchingRequestDigest(replay.requestDigest, input.requestDigest);
          return {
            status: 'replay',
            operationId: replay.id,
            generation: replay.generation,
            customerState: customerState(replay.customerState),
          };
        }
        for (const requirement of requirements) {
          const budget = budgets.find(({ id }) => id === requirement.budgetId);
          const fundingRow = funding.find(({ id }) => id === budget?.fundingId);
          if (
            !budget ||
            !fundingRow ||
            budget.quantum !== 'pico_usd' ||
            budget.kind !== requirement.kind ||
            budget.environment !== input.environment ||
            budget.consumed + budget.held + requirement.maximum > budget.approvedCap ||
            fundingRow.consumed + fundingRow.held + requirement.maximum > fundingRow.fundedLifetime
          ) {
            return { status: 'denied', reason: 'budget_unavailable' };
          }
        }
        const [cashAttention] = await tx
          .select({ id: billingFinancialCase.id })
          .from(billingFinancialCase)
          .where(
            and(
              eq(billingFinancialCase.environment, input.environment),
              inArray(billingFinancialCase.kind, cashBlockingFinancialCaseKinds),
              inArray(billingFinancialCase.state, ['open', 'attention']),
              sql`(${billingFinancialCase.accountId} = ${accountId} OR (
              ${billingFinancialCase.accountId} IS NULL AND EXISTS (
                SELECT 1 FROM billing.billing_stripe_customer c
                WHERE c.account_id = ${accountId} AND c.environment = ${input.environment}
                  AND c.stripe_account_id = ${billingFinancialCase.stripeAccountId}
                  AND c.livemode = ${billingFinancialCase.livemode}
              )))`,
            ),
          )
          .limit(1);
        if (cashAttention) {
          return { status: 'denied', reason: 'account_restricted' };
        }
        if (account.status === 'restricted') {
          return { status: 'denied', reason: 'account_restricted' };
        }
        if (account.status !== 'open') {
          return { status: 'denied', reason: 'account_closed' };
        }
        // The shortfall the 402 carries: what this call would have authorized,
        // against what the account can still spend.
        const shortfall = {
          requiredCreditAtoms: authorizedAtoms,
          availableCreditAtoms: availableAtoms(snapshot(account)),
        };
        if (account.debtAtoms !== 0n) {
          return { status: 'denied', reason: 'debt', ...shortfall };
        }
        if (input.category === 'llm' && invocation !== undefined) {
          const pending = await tx
            .select({ id: creditOperation.id })
            .from(creditOperation)
            .where(pendingLlmCapacityPool(accountId, capacity.pool))
            .limit(capacity.limit);
          if (pending.length >= capacity.limit) {
            return { status: 'denied', reason: 'concurrency_unavailable' };
          }
        }
        const authorized = allocateSources(snapshot(account), authorizedAtoms);
        if (!authorized) {
          await this.queueReloadWork(tx, account, {
            reasonKind: 'insufficient_funds',
            reasonAttemptKey: input.attemptKey,
            reasonRequestDigest: input.requestDigest,
          });
          return { status: 'denied', reason: 'insufficient_credit', ...shortfall };
        }
        const operationId = randomUUID();
        const spendHoldId = randomUUID();
        const riskHoldId = randomUUID();
        await tx
          .update(creditAccount)
          .set({
            promoHeldAtoms: account.promoHeldAtoms + authorized.promoAtoms,
            planHeldAtoms: account.planHeldAtoms + authorized.planAtoms,
            purchasedHeldAtoms: account.purchasedHeldAtoms + authorized.purchasedAtoms,
            revision: account.revision + 1n,
          })
          .where(eq(creditAccount.id, accountId));
        const dueAt =
          invocation === undefined
            ? input.executionDeadline
            : input.executionDeadline === undefined
              ? sql`clock_timestamp() + ${invocation.executionTimeout} * interval '1 millisecond'`
              : sql`least(${input.executionDeadline.toISOString()}::timestamptz, clock_timestamp() + ${invocation.executionTimeout} * interval '1 millisecond')`;
        if (dueAt === undefined) {
          throw new Error('Qualified invocation deadline is required');
        }
        await tx.insert(creditOperation).values({
          id: operationId,
          accountId,
          environment: input.environment,
          surface: input.surface,
          attemptKey: input.attemptKey,
          requestDigest: input.requestDigest,
          requestKeyVersion: input.requestKeyVersion,
          category: input.category,
          modelId: input.modelId,
          invocation,
          historyVersion: 1,
          modelDisplayName: history.modelDisplayName,
          providerId: history.providerId,
          projectHint: history.projectHint,
          chatHint: history.chatHint,
          admittedAt: sql`clock_timestamp()`,
          activity: capacity.activity,
          sku: input.sku,
          policyId: effective.policyId,
          activationId: effective.activationId,
          meterContractId: effective.route.meterContractId,
          pinnedTariff,
          maximumQuantities,
          authorizedAtoms,
          promoHeldAtoms: authorized.promoAtoms,
          planHeldAtoms: authorized.planAtoms,
          purchasedHeldAtoms: authorized.purchasedAtoms,
          spendBudgetHoldId: spendHoldId,
          riskBudgetHoldId: riskHoldId,
          dispatchState: 'admitted',
          customerState: 'pending',
          supplierState: 'reserved',
          generation: 1n,
          dueAt,
        });
        for (const requirement of requirements) {
          const budget = budgets.find(({ id }) => id === requirement.budgetId);
          if (!budget) {
            throw new Error('Locked budget disappeared');
          }
          await tx
            .update(billingBudget)
            .set({ held: sql`${billingBudget.held} + ${requirement.maximum}` })
            .where(eq(billingBudget.id, requirement.budgetId));
          await tx
            .update(billingBudgetFunding)
            .set({
              held: sql`${billingBudgetFunding.held} + ${requirement.maximum}`,
            })
            .where(eq(billingBudgetFunding.id, budget.fundingId));
          await tx.insert(billingBudgetHold).values({
            id: requirement.kind === 'risk' ? riskHoldId : spendHoldId,
            budgetId: requirement.budgetId,
            operationId,
            initialBound: requirement.maximum,
            remainingHeld: requirement.maximum,
            consumed: 0n,
            finalityState: 'reserved',
          });
        }
        await this.queueReloadWork(
          tx,
          { ...account, revision: account.revision + 1n },
          {
            reasonKind: 'admission',
            reasonOperationId: operationId,
            reasonAttemptKey: input.attemptKey,
            reasonRequestDigest: input.requestDigest,
          },
        );
        return { status: 'admitted', operationId, generation: 1n, authorized };
      });
    } catch (error) {
      if (!hasConstraint(error, 'credit_operation_attempt')) {
        throw error;
      }
      const [winner] = await this.databaseService.database
        .select({ id: creditOperation.id })
        .from(creditOperation)
        .where(
          and(
            eq(creditOperation.accountId, accountId),
            eq(creditOperation.surface, input.surface),
            eq(creditOperation.attemptKey, input.attemptKey),
          ),
        );
      if (!winner) {
        throw error;
      }
      return this.replayAdmission(winner.id, input.requestDigest);
    }
  }

  public async markDispatchIntent(operationId: string, generation: bigint): Promise<boolean> {
    const rows = await this.databaseService.database
      .update(creditOperation)
      .set({
        dispatchState: 'intent_recorded',
        dispatchIntentAt: sql`clock_timestamp()`,
        usageOccurredAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(creditOperation.id, operationId),
          eq(creditOperation.generation, generation),
          eq(creditOperation.customerState, 'pending'),
          eq(creditOperation.dispatchState, 'admitted'),
          sql`${creditOperation.cancellationRequestedAt} is null`,
          sql`${creditOperation.dueAt} > clock_timestamp()`,
        ),
      )
      .returning({ id: creditOperation.id });
    return rows.length === 1;
  }

  /** Fences a resumed foreground before provider I/O using the authoritative database clock. */
  public async getDispatchTimeRemaining(operationId: string, generation: bigint): Promise<number> {
    const [eligible] = await this.databaseService.database
      .select({
        remaining: sql<number>`greatest(0, floor(extract(epoch from (${creditOperation.dueAt} - clock_timestamp())) * 1000))::integer`,
      })
      .from(creditOperation)
      .where(
        and(
          eq(creditOperation.id, operationId),
          eq(creditOperation.generation, generation),
          eq(creditOperation.customerState, 'pending'),
          eq(creditOperation.dispatchState, 'intent_recorded'),
          sql`${creditOperation.cancellationRequestedAt} is null`,
          sql`${creditOperation.invocation} is not null`,
          sql`${creditOperation.dueAt} > clock_timestamp()`,
        ),
      );
    return eligible?.remaining ?? 0;
  }

  /**
   * Records that the supplier answered, separating work in flight from work abandoned.
   *
   * Observability only: the caller has a provider response in hand and must not
   * abandon it when the transition loses to recovery, so the boolean says
   * whether the row was still live, not whether the stream may continue.
   */
  public async markDispatchAccepted(operationId: string, generation: bigint): Promise<boolean> {
    const rows = await this.databaseService.database
      .update(creditOperation)
      .set({ dispatchState: 'accepted' })
      .where(
        and(
          eq(creditOperation.id, operationId),
          eq(creditOperation.generation, generation),
          eq(creditOperation.customerState, 'pending'),
          eq(creditOperation.dispatchState, 'intent_recorded'),
          sql`${creditOperation.dueAt} > transaction_timestamp()`,
        ),
      )
      .returning({ id: creditOperation.id });
    return rows.length === 1;
  }

  /** Claims due recovery work in a short DB-only transaction. */
  public async claimDueOperations(input: {
    limit: number;
    environment?: BillingEnvironment;
    category?: 'llm' | 'zoo_engine';
    accountId?: string;
    pool?: FundedLlmCapacityPool;
  }): Promise<OperationClaim[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new RangeError('Claim limit must be an integer from 1 to 100');
    }
    if (input.pool !== undefined && input.category !== 'llm') {
      throw new RangeError('A capacity pool can filter only LLM recovery');
    }
    return this.databaseService.database.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(creditOperation)
        .where(
          and(
            eq(creditOperation.customerState, 'pending'),
            input.environment === undefined ? undefined : eq(creditOperation.environment, input.environment),
            input.category === undefined ? undefined : eq(creditOperation.category, input.category),
            input.accountId === undefined ? undefined : eq(creditOperation.accountId, input.accountId),
            input.pool === undefined ? undefined : llmCapacityPoolActivity(input.pool),
            sql`${creditOperation.dueAt} <= transaction_timestamp()`,
            sql`(${creditOperation.leaseUntil} is null or ${creditOperation.leaseUntil} <= transaction_timestamp())`,
          ),
        )
        .orderBy(asc(creditOperation.dueAt), asc(creditOperation.id))
        .limit(input.limit)
        .for('update', { skipLocked: true });
      const claims: OperationClaim[] = [];
      for (const operation of due) {
        const generation = operation.generation + 1n;
        await tx
          .update(creditOperation)
          .set({
            generation,
            dispatchState: 'recovery_required',
            leaseUntil: sql`transaction_timestamp() + interval '1 minute'`,
          })
          .where(eq(creditOperation.id, operation.id));
        claims.push({
          operationId: operation.id,
          accountId: operation.accountId,
          requestDigest: operation.requestDigest,
          generation,
        });
      }
      return claims;
    });
  }

  /** Finds the authenticated attempt without creating a financial account. */
  public async getOperationForAttempt(input: {
    environment: BillingEnvironment;
    authUserId: string;
    surface: string;
    attemptKey: string;
  }): Promise<typeof creditOperation.$inferSelect | undefined> {
    const [row] = await this.databaseService.database
      .select({ operation: creditOperation })
      .from(creditOperation)
      .innerJoin(
        billingOwnerBinding,
        and(
          eq(billingOwnerBinding.accountId, creditOperation.accountId),
          eq(billingOwnerBinding.environment, creditOperation.environment),
        ),
      )
      .where(
        and(
          eq(billingOwnerBinding.environment, input.environment),
          eq(billingOwnerBinding.authUserId, input.authUserId),
          sql`${billingOwnerBinding.revokedAt} is null`,
          eq(creditOperation.surface, input.surface),
          eq(creditOperation.attemptKey, input.attemptKey),
        ),
      );
    return row?.operation;
  }

  /** Calls the typed, deduplicated current-period issuer only from admission. */
  public async issueCurrentPromotion(input: {
    environment: BillingEnvironment;
    authUserId: string;
    replica: QualifiedAdmissionInput['replica'];
  }): Promise<boolean> {
    const effective = await this.policyService.selectEffectivePolicy(input);
    const promotion = effective.policy.promotionalIssuance;
    if (!promotion.enabled || promotion.offer === null) {
      return false;
    }
    const accountId = await this.ensureAccountBinding(input);
    const { offer } = promotion;
    return this.applyPromotionIssuance({
      ...input,
      accountId,
      promotionProgramId: offer.promotionProgramId,
      periodStart: new Date(Date.UTC(effective.selectedAt.getUTCFullYear(), effective.selectedAt.getUTCMonth(), 1)),
      periodEnd: new Date(Date.UTC(effective.selectedAt.getUTCFullYear(), effective.selectedAt.getUTCMonth() + 1, 1)),
      entitlementAtoms: BigInt(offer.grantCreditAtoms),
      accountCeilingAtoms: BigInt(offer.accountCeilingCreditAtoms),
      budgetId: offer.budgetId,
      occurredAt: effective.selectedAt,
      enabled: true,
    });
  }

  /** Records a prompt cancellation request without resolving any money or proving finality. */
  public async recordCancellation(input: {
    operationId: string;
    accountId: string;
    requestDigest: string;
  }): Promise<void> {
    await this.databaseService.database
      .update(creditOperation)
      .set({ cancellationRequestedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(creditOperation.id, input.operationId),
          eq(creditOperation.accountId, input.accountId),
          eq(creditOperation.requestDigest, input.requestDigest),
          eq(creditOperation.customerState, 'pending'),
          sql`${creditOperation.cancellationRequestedAt} is null`,
        ),
      );
  }

  /** Persists a bounded, content-free observation; duplicate delivery is money-inert. */
  public async recordInvocationEvidence(input: {
    operationId: string;
    accountId: string;
    requestDigest: string;
    evidence: TerminalEvidence;
  }): Promise<void> {
    const evidence = serializeInvocationEvidence(input.evidence);
    const payloadDigest = invocationEvidenceDigest(evidence);
    await this.databaseService.database.transaction(async (tx) => {
      const [operation] = await tx
        .select()
        .from(creditOperation)
        .where(and(eq(creditOperation.id, input.operationId), eq(creditOperation.accountId, input.accountId)))
        .for('update');
      if (!operation) {
        throw new Error('Credit operation not found for account');
      }
      assertMatchingRequestDigest(operation.requestDigest, input.requestDigest);
      await tx
        .insert(billingInvocationEvidence)
        .values({ id: randomUUID(), operationId: operation.id, payloadDigest, evidence })
        .onConflictDoNothing({
          target: [billingInvocationEvidence.operationId, billingInvocationEvidence.payloadDigest],
        });
    });
  }

  /** Resolves due LLM work only for the authenticated financial owner and trusted activity pool. */
  public async recoverDueLlmOperationsForOwner(input: {
    environment: BillingEnvironment;
    authUserId: string;
    activity: string;
  }): Promise<OwnerLlmRecoveryResult> {
    const capacity = classifyFundedLlmCapacity(input.activity);
    const [binding] = await this.databaseService.database
      .select({ accountId: creditAccount.id })
      .from(billingOwnerBinding)
      .innerJoin(creditAccount, eq(creditAccount.id, billingOwnerBinding.accountId))
      .where(
        and(
          eq(billingOwnerBinding.environment, input.environment),
          eq(billingOwnerBinding.authUserId, input.authUserId),
          eq(creditAccount.environment, input.environment),
          sql`${billingOwnerBinding.revokedAt} is null`,
        ),
      );
    if (!binding) {
      return {
        pool: capacity.pool,
        claimed: 0,
        resolved: 0,
        pending: 0,
        remainingDue: 0,
        leasedDue: 0,
        failedOperationIds: [],
      };
    }
    return {
      pool: capacity.pool,
      ...(await this.recoverDueLlmOperations({
        environment: input.environment,
        limit: capacity.limit,
        accountId: binding.accountId,
        pool: capacity.pool,
      })),
    };
  }

  /** Resolves a bounded LLM claim batch without provider execution or application services. */
  public async recoverDueLlmOperations(input: {
    environment: BillingEnvironment;
    limit: number;
    accountId?: string;
    pool?: FundedLlmCapacityPool;
  }): Promise<LlmRecoveryResult> {
    const claims = await this.claimDueOperations({ ...input, category: 'llm' });
    const failedOperationIds: string[] = [];
    let resolved = 0;
    for (const claim of claims) {
      try {
        const [claimed] = await this.databaseService.database
          .select({
            operation: creditOperation,
            graceExpired: sql<boolean>`transaction_timestamp() >= ${creditOperation.dueAt} + make_interval(mins => ${recoveryGraceMinutes})`,
          })
          .from(creditOperation)
          .where(
            and(
              eq(creditOperation.id, claim.operationId),
              eq(creditOperation.generation, claim.generation),
              eq(creditOperation.customerState, 'pending'),
            ),
          );
        if (!claimed) {
          continue;
        }
        const { operation } = claimed;
        const [observation] = await this.databaseService.database
          .select()
          .from(billingInvocationEvidence)
          .where(eq(billingInvocationEvidence.operationId, operation.id))
          .orderBy(
            sql`case when ${billingInvocationEvidence.evidence}->>'kind' = 'final_usage' then 0 else 1 end`,
            desc(billingInvocationEvidence.receivedAt),
            desc(billingInvocationEvidence.id),
          )
          .limit(1);
        if (!observation && operation.dispatchIntentAt !== null && !claimed.graceExpired) {
          // A dispatched turn with no retained evidence keeps its holds until the
          // grace expires, so a stream that outlived `due_at` can still settle.
          await this.deferRecovery(operation.id, claim.generation);
          continue;
        }
        let evidence: TerminalEvidence;
        if (operation.dispatchIntentAt === null) {
          evidence = { kind: 'provider_rejected', executionStatus: 'rejected' };
        } else if (observation) {
          const stored = persistedInvocationEvidenceSchema.parse(observation.evidence);
          const retained = {
            ...stored,
            usageOccurredAt: stored.usageOccurredAt === undefined ? undefined : new Date(stored.usageOccurredAt),
            meterItems: stored.meterItems?.map((item) => ({ ...item, quantity: BigInt(item.quantity) })),
            reasoningTokens: stored.reasoningTokens === undefined ? undefined : BigInt(stored.reasoningTokens),
          };
          if (stored.kind === 'final_usage') {
            if (retained.usageOccurredAt === undefined || retained.meterItems === undefined) {
              throw new Error('Stored complete usage lacks required evidence');
            }
            evidence = {
              ...retained,
              kind: 'final_usage',
              usageOccurredAt: retained.usageOccurredAt,
              meterItems: retained.meterItems,
            };
          } else {
            evidence = {
              ...retained,
              kind: 'absorbed_unknown',
              executionStatus:
                operation.cancellationRequestedAt === null ? (stored.executionStatus ?? 'unknown') : 'cancelled',
            };
          }
        } else {
          evidence = {
            kind: 'absorbed_unknown',
            executionStatus: operation.cancellationRequestedAt === null ? 'unknown' : 'cancelled',
            // Distinguishes an expired deadline from a client abort after the fact.
            normalizationEvidence: {
              version: 'recovery-terminal-v1',
              terminalReason: operation.cancellationRequestedAt === null ? 'recovery_expired' : 'client_abort',
              fields: {},
            },
          };
        }
        await this.recordInvocationEvidence({ ...claim, evidence });
        if (operation.dispatchIntentAt === null) {
          const outcome = await this.appendSupplierEvidence({
            operationId: operation.id,
            environment: input.environment,
            provider: operation.providerId ?? 'undispatched',
            credentialAccount: operation.invocation?.credentialAccount ?? 'undispatched',
            sourceObjectId: operation.id,
            sourceRevision: 'proved_no_dispatch_v1',
            payloadDigest: createHash('sha256').update(`no-dispatch:${operation.id}`).digest('hex'),
            currency: 'usd',
            numerator: 0n,
            denominator: 1n,
            completeness: 'complete',
            finality: 'final',
            receivedAt: new Date(),
          });
          if (outcome === 'conflict') {
            throw new Error('Conflicting no-dispatch proof');
          }
          const [supplierEvidence] = await this.databaseService.database
            .select({ id: supplierCostEvidence.id })
            .from(supplierCostEvidence)
            .where(
              and(
                eq(supplierCostEvidence.operationId, operation.id),
                eq(supplierCostEvidence.sourceRevision, 'proved_no_dispatch_v1'),
              ),
            );
          if (!supplierEvidence) {
            throw new Error('No-dispatch proof was not retained');
          }
          await this.finalizeSupplier({
            ...claim,
            evidenceId: supplierEvidence.id,
            expectedGeneration: claim.generation,
          });
        } else {
          if (operation.invocation !== null && evidence.kind === 'final_usage') {
            const cost = calculatePreliminarySupplierCost({
              invocation: operation.invocation,
              evidence,
              payloadDigest: invocationEvidenceDigest(serializeInvocationEvidence(evidence)),
            });
            if (cost !== undefined) {
              const delivery = await this.appendSupplierEvidence({
                ...cost,
                numerator: BigInt(cost.numerator),
                denominator: BigInt(cost.denominator),
                operationId: operation.id,
                environment: input.environment,
                provider: operation.providerId ?? 'unknown',
                credentialAccount: operation.invocation.credentialAccount,
                sourceObjectId: operation.id,
                finality: 'preliminary',
                receivedAt: new Date(),
              });
              if (delivery === 'conflict') {
                throw new Error('Conflicting recovered supplier evidence');
              }
            }
          }
          const [finalSupplierEvidence] = await this.databaseService.database
            .select({ id: supplierCostEvidence.id })
            .from(supplierCostEvidence)
            .where(
              and(
                eq(supplierCostEvidence.operationId, operation.id),
                eq(supplierCostEvidence.completeness, 'complete'),
                eq(supplierCostEvidence.finality, 'final'),
              ),
            )
            .orderBy(asc(supplierCostEvidence.receivedAt), asc(supplierCostEvidence.id))
            .limit(1);
          if (finalSupplierEvidence) {
            await this.finalizeSupplier({
              ...claim,
              evidenceId: finalSupplierEvidence.id,
              expectedGeneration: claim.generation,
            });
          }
        }
        // Time to live: the turn reported nothing at all, so it writes off revenue and
        // no supplier cost can ever be attributed. The spend hold is finalized in the
        // terminalizer's own transaction and an operator owns the row. An absorbed turn
        // that did retain evidence keeps its spend hold for supplier reconciliation.
        const expired = !observation && operation.dispatchIntentAt !== null;
        // The live path may have terminalized this operation since the claim was read; opening a
        // case for a turn that settled normally would leave an operator chasing nothing.
        const [stillPending] = expired
          ? await this.databaseService.database
              .select({ id: creditOperation.id })
              .from(creditOperation)
              .where(and(eq(creditOperation.id, operation.id), eq(creditOperation.customerState, 'pending')))
          : [];
        if (stillPending) {
          await this.openRecoveryCase(operation, {
            reason: 'time_to_live',
            detail: `Expired ${recoveryGraceMinutes} minutes after due_at with no retained evidence`,
          });
        }
        await this.terminalizeOperation({
          ...claim,
          expectedGeneration: claim.generation,
          evidence,
          resolvedAt: new Date(),
          expireSpendHold: expired,
        });
        resolved += 1;
      } catch (error) {
        // Never retry provider execution: classify, then either back off or absorb this claim.
        failedOperationIds.push(claim.operationId);
        await this.resolveRecoveryFailure(claim, error);
      }
    }
    return {
      claimed: claims.length,
      resolved,
      ...(await this.dueLlmRecoveryState(input)),
      failedOperationIds,
    };
  }

  /** Resolves each operation once, including zero, release, and absorption receipts. */
  public async terminalizeOperation(input: TerminalizeInput): Promise<TerminalReceipt> {
    const history = terminalHistorySchema.parse(input.evidence);
    const meterItems = input.evidence.kind === 'provider_rejected' ? [] : (input.evidence.meterItems ?? []);
    if (meterItems.length > 128) {
      throw new RangeError('Too many terminal meter quantities');
    }
    for (const item of meterItems) {
      rationalUnsignedIntegerStringSchema.parse(item.quantity.toString());
    }
    if (input.evidence.reasoningTokens !== undefined) {
      rationalUnsignedIntegerStringSchema.parse(input.evidence.reasoningTokens.toString());
      const output = meterItems.find(({ dimension }) => dimension === 'output');
      if (!output || input.evidence.reasoningTokens > output.quantity) {
        throw new RangeError('Reasoning tokens must be a reported subset of output');
      }
    }
    const context = await this.discoverOperationContext(input.operationId);
    return this.databaseService.database.transaction(async (tx) => {
      await this.lockRoute(tx, context.environment, context.sku);
      await this.lockBudgetContext(tx, context.budgetIds, context.fundingIds);
      const account = await this.lockAccount(tx, context.accountId);
      const [operation] = await tx
        .select()
        .from(creditOperation)
        .where(eq(creditOperation.id, input.operationId))
        .for('update');
      if (!operation || operation.accountId !== input.accountId) {
        throw new Error('Credit operation not found for account');
      }
      assertMatchingRequestDigest(operation.requestDigest, input.requestDigest);
      if (operation.generation !== input.expectedGeneration) {
        throw new Error('Stale credit operation generation');
      }
      if (operation.customerState !== 'pending') {
        return this.receipt(tx, operation);
      }
      if (operation.invocation !== null) {
        const [retained] = await tx
          .select({ id: billingInvocationEvidence.id })
          .from(billingInvocationEvidence)
          .where(
            and(
              eq(billingInvocationEvidence.operationId, operation.id),
              eq(
                billingInvocationEvidence.payloadDigest,
                invocationEvidenceDigest(serializeInvocationEvidence(input.evidence)),
              ),
            ),
          );
        if (!retained) {
          throw new Error('Invocation evidence must be durably recorded before resolution');
        }
      }
      const settlementTariff = await this.settlementTariff(tx, operation, input.evidence);
      const priced = this.charge(operation, input.evidence, settlementTariff);
      if (new Set(meterItems.map(({ dimension, tier }) => `${dimension}:${tier ?? ''}`)).size !== meterItems.length) {
        throw new Error('Terminal meter quantities contain duplicate dimensions');
      }
      const charge = priced.chargedAtoms;
      const consumed = this.consume(operation, charge);
      const remainingHolds = {
        promoAtoms: account.promoHeldAtoms - operation.promoHeldAtoms,
        planAtoms: account.planHeldAtoms - operation.planHeldAtoms,
        purchasedAtoms: account.purchasedHeldAtoms - operation.purchasedHeldAtoms,
      };
      const afterCharge = {
        promoAtoms: account.promoAtoms - consumed.promoAtoms,
        planAtoms: account.planAtoms - consumed.planAtoms,
        purchasedAtoms: account.purchasedAtoms - consumed.purchasedAtoms,
      };
      const normalized = this.normalizeDebt(afterCharge, remainingHolds, account.debtAtoms);
      const revision = account.revision + 1n;
      const transactionId = randomUUID();
      const customerState =
        input.evidence.kind === 'provider_rejected'
          ? 'released'
          : input.evidence.kind === 'absorbed_unknown'
            ? 'absorbed'
            : 'settled';
      if (customerState === 'absorbed') {
        await this.absorbHold(tx, operation.riskBudgetHoldId, 'absorbed');
      }
      /* No supplier evidence will arrive: the reserved spend is charged to the budget rather than
       * left held, and later evidence still corrects it through finalizeSupplier. A ceiling cut is
       * its own such proof — the stream was severed, so nothing further can ever price it — which is
       * why it expires the hold on the settled side too rather than reserving it forever (R7/P6). */
      if (input.expireSpendHold === true || input.evidence.kind === 'authorized_exhausted') {
        await this.absorbHold(tx, operation.spendBudgetHoldId, 'unresolved');
      }
      await tx
        .update(creditAccount)
        .set({
          promoAtoms: normalized.assets.promoAtoms,
          planAtoms: normalized.assets.planAtoms,
          purchasedAtoms: normalized.assets.purchasedAtoms,
          debtAtoms: normalized.debtAtoms,
          promoHeldAtoms: remainingHolds.promoAtoms,
          planHeldAtoms: remainingHolds.planAtoms,
          purchasedHeldAtoms: remainingHolds.purchasedAtoms,
          revision,
        })
        .where(eq(creditAccount.id, account.id));
      await tx.insert(creditTransaction).values({
        id: transactionId,
        accountId: account.id,
        revision,
        kind: 'operation_resolution',
        operationId: operation.id,
        promoDeltaAtoms: normalized.assets.promoAtoms - account.promoAtoms,
        planDeltaAtoms: normalized.assets.planAtoms - account.planAtoms,
        purchasedDeltaAtoms: normalized.assets.purchasedAtoms - account.purchasedAtoms,
        debtDeltaAtoms: normalized.debtAtoms - account.debtAtoms,
        accountDeltaAtoms: -charge,
        balanceAfterAtoms: account.promoAtoms + account.planAtoms + account.purchasedAtoms - account.debtAtoms - charge,
        occurredAt: input.resolvedAt,
      });
      await tx
        .update(creditOperation)
        .set({
          customerState,
          terminalRevision: revision,
          baseTransactionId: transactionId,
          chargedAtoms: charge,
          resolvedAt: input.resolvedAt,
          // Keep PostgreSQL microseconds; a Date round trip would alter immutable range membership.
          usageOccurredAt:
            input.evidence.kind === 'provider_rejected'
              ? sql`coalesce(${creditOperation.usageOccurredAt}, ${creditOperation.admittedAt})`
              : sql`${creditOperation.usageOccurredAt}`,
          evidenceOccurredAt: input.evidence.usageOccurredAt,
          executionStatus:
            history.executionStatus ?? (input.evidence.kind === 'provider_rejected' ? 'rejected' : 'unknown'),
          meteringStatus:
            input.evidence.kind === 'final_usage' ? 'complete' : meterItems.length > 0 ? 'partial' : 'unavailable',
          reasoningTokens: input.evidence.reasoningTokens,
          // Retains `terminalReason`: `execution_status` alone cannot separate a
          // client abort from an expired deadline once the turn is over.
          normalizationEvidence: history.normalizationEvidence,
          supplierState:
            priced.overrun ||
            (customerState === 'absorbed' &&
              operation.supplierState !== 'final' &&
              operation.supplierState !== 'funded_exception')
              ? 'unresolved'
              : operation.supplierState,
          actualRetailAtoms: priced.actualRetailAtoms,
          meterItems:
            meterItems.length > 0
              ? meterItems.map((item) => {
                  // The rate the item was actually charged at, which is the pin unless the observed
                  // input settled the operation back at its base tier.
                  const rate = settlementTariff.find(
                    ({ dimension, tier }) => dimension === item.dimension && tier === item.tier,
                  );
                  if (!rate) {
                    throw new Error('Terminal meter dimension is not pinned');
                  }
                  return {
                    dimension: item.dimension,
                    tier: item.tier,
                    quantity: item.quantity.toString(),
                    numeratorCreditAtoms: rate.numeratorCreditAtoms,
                    denominatorUnits: rate.denominatorUnits,
                  };
                })
              : null,
          inputTokens:
            input.evidence.kind === 'final_usage' ? this.boundedTokenTotal(input.evidence.meterItems, false) : null,
          outputTokens:
            input.evidence.kind === 'final_usage' ? this.boundedTokenTotal(input.evidence.meterItems, true) : null,
        })
        .where(eq(creditOperation.id, operation.id));
      if (customerState === 'settled') {
        await this.queueReloadWork(
          tx,
          { ...account, revision },
          {
            reasonKind: 'settlement',
            reasonOperationId: operation.id,
            reasonAttemptKey: operation.attemptKey,
            reasonRequestDigest: operation.requestDigest,
          },
        );
      }
      if (priced.reportedRetailAtoms > operation.authorizedAtoms) {
        await tx
          .insert(billingOperationException)
          .values({
            id: randomUUID(),
            operationId: operation.id,
            kind: 'customer_bound',
            sourceIdentity: operation.id,
            quantum: 'credit_atoms',
            observedNumerator: priced.reportedRetailAtoms.toString(),
            observedDenominator: 1n,
            maximum: operation.authorizedAtoms,
          })
          .onConflictDoNothing();
        await tx
          .insert(billingRoutePause)
          .values({
            environment: operation.environment,
            sku: routeSkuFamily(operation.sku)[0],
            operationId: operation.id,
            reason: 'retail_overrun',
          })
          .onConflictDoNothing();
      }
      if (priced.inputOverflow !== undefined) {
        await tx
          .insert(billingOperationException)
          .values({
            id: randomUUID(),
            operationId: operation.id,
            kind: 'input_bound',
            sourceIdentity: operation.id,
            quantum: 'input_tokens',
            observedNumerator: priced.inputOverflow.observed.toString(),
            observedDenominator: 1n,
            maximum: priced.inputOverflow.maximum,
          })
          .onConflictDoNothing();
        await tx
          .insert(billingRoutePause)
          .values({
            environment: operation.environment,
            sku: routeSkuFamily(operation.sku)[0],
            operationId: operation.id,
            reason: 'input_bound_exceeded',
          })
          .onConflictDoNothing();
      }
      if (input.evidence.kind === 'authorized_exhausted') {
        /* The byte ceiling is sized from an unmeasured bytes-per-output-token constant, and its
         * failure mode is a truncated answer. The operator gets the two numbers that measure the
         * constant, on a case kind that blocks neither cash nor the route. */
        const authorizedOutput =
          operation.maximumQuantities.find(({ dimension }) => dimension === 'output')?.quantity ?? 'unknown';
        const responseBytes = history.normalizationEvidence?.fields['responseBytes'] ?? 'unknown';
        await this.openRecoveryCase(
          operation,
          {
            reason: 'authorized_exhausted',
            detail: `Response reached its authorized byte ceiling after ${responseBytes} bytes with ${authorizedOutput} authorized output tokens`,
          },
          tx,
        );
      }
      return {
        operationId: operation.id,
        baseTransactionId: transactionId,
        terminalRevision: revision,
        customerState,
        authorizedAtoms: operation.authorizedAtoms,
        chargedAtoms: charge,
        accountDeltaAtoms: -charge,
        sourceDeltas: {
          promoAtoms: normalized.assets.promoAtoms - account.promoAtoms,
          planAtoms: normalized.assets.planAtoms - account.planAtoms,
          purchasedAtoms: normalized.assets.purchasedAtoms - account.purchasedAtoms,
        },
        resolvedAt: input.resolvedAt,
      };
    });
  }

  public async appendSupplierEvidence(input: SupplierEvidenceInput): Promise<'inserted' | 'replay' | 'conflict'> {
    rationalUnsignedIntegerStringSchema.parse(input.numerator.toString());
    rationalUnsignedIntegerStringSchema.parse(input.denominator.toString());
    if (input.currency !== 'usd') {
      throw new RangeError('Supplier evidence currency must be usd');
    }
    if (input.denominator === 0n) {
      throw new RangeError('Supplier evidence denominator must be positive');
    }
    const context =
      input.operationId === undefined ? undefined : await this.discoverOperationContext(input.operationId);
    return this.databaseService.database.transaction(async (tx) => {
      if (context !== undefined) {
        await this.lockRoute(tx, context.environment, context.sku);
      }
      const [inserted] = await tx
        .insert(supplierCostEvidence)
        .values({ id: randomUUID(), ...input })
        .onConflictDoNothing()
        .returning();
      const [found] = inserted
        ? [inserted]
        : await tx
            .select()
            .from(supplierCostEvidence)
            .where(
              and(
                eq(supplierCostEvidence.environment, input.environment),
                eq(supplierCostEvidence.provider, input.provider),
                eq(supplierCostEvidence.credentialAccount, input.credentialAccount),
                eq(supplierCostEvidence.sourceObjectId, input.sourceObjectId),
                eq(supplierCostEvidence.sourceRevision, input.sourceRevision),
              ),
            );
      if (!found) {
        throw new Error('Supplier evidence delivery was not retained');
      }
      if (found.payloadDigest !== input.payloadDigest) {
        return 'conflict';
      }
      if (found.operationId !== null) {
        await tx
          .update(creditOperation)
          .set({ supplierState: 'preliminary' })
          .where(and(eq(creditOperation.id, found.operationId), eq(creditOperation.supplierState, 'reserved')));
        const [context] = await tx
          .select({ operation: creditOperation, maximum: billingBudgetHold.initialBound })
          .from(creditOperation)
          .innerJoin(billingBudgetHold, eq(billingBudgetHold.id, creditOperation.spendBudgetHoldId))
          .where(and(eq(creditOperation.id, found.operationId), eq(creditOperation.environment, found.environment)));
        if (context && found.numerator * 1_000_000_000_000n > context.maximum * found.denominator) {
          await tx
            .insert(billingOperationException)
            .values({
              id: randomUUID(),
              operationId: context.operation.id,
              kind: 'supplier_bound',
              sourceIdentity: found.id,
              quantum: 'pico_usd',
              observedNumerator: (found.numerator * 1_000_000_000_000n).toString(),
              observedDenominator: found.denominator,
              maximum: context.maximum,
            })
            .onConflictDoNothing();
          await tx
            .insert(billingRoutePause)
            .values({
              environment: context.operation.environment,
              sku: routeSkuFamily(context.operation.sku)[0],
              operationId: context.operation.id,
              reason: 'supplier_bound_exceeded',
            })
            .onConflictDoNothing();
        }
      }
      return inserted ? 'inserted' : 'replay';
    });
  }

  /** Resolves a retained final observation through the existing supplier terminalizer. */
  public async finalizeRecordedSupplierEvidence(
    input: Omit<SupplierFinalityInput, 'evidenceId'> & {
      payloadDigest: string;
      sourceRevision: string;
    },
  ): Promise<'final' | 'unresolved' | 'replay'> {
    const [evidence] = await this.databaseService.database
      .select({ id: supplierCostEvidence.id })
      .from(supplierCostEvidence)
      .where(
        and(
          eq(supplierCostEvidence.operationId, input.operationId),
          eq(supplierCostEvidence.payloadDigest, input.payloadDigest),
          eq(supplierCostEvidence.sourceRevision, input.sourceRevision),
          eq(supplierCostEvidence.completeness, 'complete'),
          eq(supplierCostEvidence.finality, 'final'),
        ),
      );
    if (!evidence) {
      throw new Error('Qualified final supplier evidence not found');
    }
    return this.finalizeSupplier({ ...input, evidenceId: evidence.id });
  }

  /** Applies qualified supplier finality independently of the customer receipt. */
  public async finalizeSupplier(input: SupplierFinalityInput): Promise<'final' | 'unresolved' | 'replay'> {
    const context = await this.discoverOperationContext(input.operationId);
    return this.databaseService.database.transaction(async (tx) => {
      await this.lockRoute(tx, context.environment, context.sku);
      await this.lockBudgetContext(tx, context.budgetIds, context.fundingIds);
      await this.lockAccount(tx, context.accountId);
      const [operation] = await tx
        .select()
        .from(creditOperation)
        .where(eq(creditOperation.id, input.operationId))
        .for('update');
      if (!operation || operation.accountId !== input.accountId) {
        throw new Error('Credit operation not found for account');
      }
      assertMatchingRequestDigest(operation.requestDigest, input.requestDigest);
      if (operation.generation !== input.expectedGeneration) {
        throw new Error('Stale credit operation generation');
      }
      if (operation.supplierState === 'final' || operation.supplierState === 'funded_exception') {
        return 'replay';
      }
      const [evidence] = await tx
        .select()
        .from(supplierCostEvidence)
        .where(and(eq(supplierCostEvidence.id, input.evidenceId), eq(supplierCostEvidence.operationId, operation.id)));
      if (evidence?.completeness !== 'complete' || evidence.finality !== 'final') {
        throw new Error('Qualified final supplier evidence not found');
      }
      const holds = await tx
        .select()
        .from(billingBudgetHold)
        .where(eq(billingBudgetHold.operationId, operation.id))
        .orderBy(asc(billingBudgetHold.budgetId))
        .for('update');
      if (evidence.currency !== 'usd') {
        throw new Error('Supplier evidence currency must be usd');
      }
      const exactConsumed =
        (evidence.numerator * 1_000_000_000_000n + evidence.denominator - 1n) / evidence.denominator;
      const amounts = new Map([
        [operation.spendBudgetHoldId, exactConsumed],
        [operation.riskBudgetHoldId, exactConsumed],
      ]);
      if (
        holds.length !== 2 ||
        new Set(holds.map(({ id }) => id)).size !== 2 ||
        holds.some(({ id }) => !amounts.has(id))
      ) {
        throw new Error('Supplier holds do not match the operation pointers');
      }
      if (
        holds.some((hold) => {
          const amount = amounts.get(hold.id);
          if (amount === undefined) {
            throw new Error('Supplier hold amount is missing');
          }
          return amount > hold.initialBound;
        })
      ) {
        await tx
          .update(creditOperation)
          .set({ supplierState: 'unresolved' })
          .where(eq(creditOperation.id, operation.id));
        await tx
          .insert(billingRoutePause)
          .values({
            environment: operation.environment,
            sku: routeSkuFamily(operation.sku)[0],
            operationId: operation.id,
            reason: 'supplier_bound_exceeded',
          })
          .onConflictDoNothing();
        return 'unresolved';
      }
      for (const hold of holds) {
        const consumed = amounts.get(hold.id);
        if (consumed === undefined) {
          throw new Error('Supplier hold amount is missing');
        }
        const consumedDelta = consumed - hold.consumed;
        const [budget] = await tx.select().from(billingBudget).where(eq(billingBudget.id, hold.budgetId));
        if (!budget) {
          throw new Error('Supplier budget disappeared');
        }
        await tx
          .update(billingBudget)
          .set({
            held: sql`${billingBudget.held} - ${hold.remainingHeld}`,
            consumed: sql`${billingBudget.consumed} + ${consumedDelta}`,
          })
          .where(eq(billingBudget.id, hold.budgetId));
        await tx
          .update(billingBudgetFunding)
          .set({
            held: sql`${billingBudgetFunding.held} - ${hold.remainingHeld}`,
            consumed: sql`${billingBudgetFunding.consumed} + ${consumedDelta}`,
          })
          .where(eq(billingBudgetFunding.id, budget.fundingId));
        await tx
          .update(billingBudgetHold)
          .set({ remainingHeld: 0n, consumed, finalityState: 'final' })
          .where(eq(billingBudgetHold.id, hold.id));
      }
      await tx.update(creditOperation).set({ supplierState: 'final' }).where(eq(creditOperation.id, operation.id));
      return 'final';
    });
  }

  /** Derives issuance from the locked, verified purchase and links its journal atomically. */
  public async fulfillPaidPurchase(input: PaidCauseInput, transaction?: Tx): Promise<PaidCauseReceipt> {
    return this.fulfillPaidCause(input, 'purchased', transaction);
  }

  /** A ceiling-limited zero grant still permanently fulfills the historical period. */
  public async fulfillPaidPeriod(input: PaidCauseInput, transaction?: Tx): Promise<PaidCauseReceipt> {
    return this.fulfillPaidCause(input, 'plan', transaction);
  }
  public async applyCompensation(input: CompensationInput): Promise<boolean> {
    if (input.atoms < 0n) {
      throw new RangeError('Compensation must be nonnegative');
    }
    return this.databaseService.database.transaction(async (tx) => {
      const account = await this.lockAccount(tx, input.accountId);
      const [duplicate] = await tx
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.id, input.compensationId));
      if (duplicate) {
        if (
          duplicate.accountId !== input.accountId ||
          duplicate.correctionOf !== input.originalTransactionId ||
          duplicate.accountDeltaAtoms !== input.atoms
        ) {
          throw new Error('Compensation replay owner or payload mismatch');
        }
        return false;
      }
      const [original] = await tx
        .select()
        .from(creditTransaction)
        .where(
          and(eq(creditTransaction.id, input.originalTransactionId), eq(creditTransaction.accountId, input.accountId)),
        )
        .for('update');
      if (original?.kind !== 'operation_resolution') {
        throw new Error('Original operation charge not found for account');
      }
      const [sum] = await tx
        .select({
          total: sql`coalesce(sum(${creditTransaction.accountDeltaAtoms}), 0)`.mapWith(BigInt),
        })
        .from(creditTransaction)
        .where(and(eq(creditTransaction.kind, 'compensation'), eq(creditTransaction.correctionOf, original.id)));
      const charged = -original.accountDeltaAtoms;
      if ((sum?.total ?? 0n) + input.atoms > charged) {
        throw new RangeError('Cumulative compensation exceeds original charge');
      }
      const value = creditDebtFirst(account.debtAtoms, input.atoms);
      const revision = account.revision + 1n;
      await tx
        .update(creditAccount)
        .set({
          purchasedAtoms: account.purchasedAtoms + value.assetAtoms,
          debtAtoms: account.debtAtoms + value.debtDeltaAtoms,
          revision,
        })
        .where(eq(creditAccount.id, account.id));
      await tx.insert(creditTransaction).values({
        id: input.compensationId,
        accountId: account.id,
        revision,
        kind: 'compensation',
        correctionOf: original.id,
        promoDeltaAtoms: 0n,
        planDeltaAtoms: 0n,
        purchasedDeltaAtoms: value.assetAtoms,
        debtDeltaAtoms: value.debtDeltaAtoms,
        accountDeltaAtoms: input.atoms,
        balanceAfterAtoms:
          account.promoAtoms + account.planAtoms + account.purchasedAtoms - account.debtAtoms + input.atoms,
        occurredAt: input.occurredAt,
      });
      return true;
    });
  }

  /** Converges complete original-payment cash state without manufacturing an initial grant. */
  public async applyCashDisposition(input: CashDispositionInput, transaction?: Tx): Promise<PaidCauseReceipt> {
    if (transaction === undefined) {
      return this.databaseService.database.transaction(async (tx) => this.applyCashDisposition(input, tx));
    }
    const tx = transaction;
    const account = await this.lockAccount(tx, input.accountId);
    const [cause] =
      input.source === 'plan'
        ? await tx.select().from(billingPeriod).where(eq(billingPeriod.id, input.causeId)).for('update')
        : await tx.select().from(billingPurchase).where(eq(billingPurchase.id, input.causeId)).for('update');
    if (!cause || cause.accountId !== account.id) {
      throw new Error('Cash cause owner mismatch');
    }
    const offer = paymentOfferSnapshotSchema.parse(cause.offerSnapshot);
    const paid = paidPaymentEvidenceSchema.parse(cause.paidEvidence);
    const causeColumn = input.source === 'plan' ? billingReversalCase.periodId : billingReversalCase.purchaseId;
    let [cashCase] = await tx.select().from(billingReversalCase).where(eq(causeColumn, cause.id)).for('update');
    const [claim] = await tx
      .select()
      .from(billingStripeSource)
      .where(
        and(
          eq(billingStripeSource.id, input.sourceClaimId),
          eq(billingStripeSource.generation, input.sourceGeneration),
          eq(billingStripeSource.sourceType, 'cash_charge'),
          eq(billingStripeSource.sourceId, paid.chargeIds[0] ?? ''),
          eq(billingStripeSource.environment, account.environment),
          eq(billingStripeSource.stripeAccountId, paid.stripeAccountId),
          eq(billingStripeSource.livemode, paid.livemode),
          eq(billingStripeSource.state, 'processing'),
          sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
        ),
      )
      .for('update');
    if (!claim || !/^[a-f0-9]{64}$/u.test(input.projectionDigest) || !Number.isFinite(input.occurredAt.getTime())) {
      throw new Error('Cash source claim is stale or invalid');
    }
    const projection = cashProjectionEvidenceSchema.parse(input.evidence);
    if (
      cashProjectionDigest(projection) !== input.projectionDigest ||
      projection.stripeAccountId !== paid.stripeAccountId ||
      projection.livemode !== paid.livemode ||
      projection.customerId !== paid.customerId ||
      paid.paymentIntentIds.length !== 1 ||
      paid.chargeIds.length !== 1 ||
      projection.paymentIntentId !== paid.paymentIntentIds[0] ||
      projection.chargeId !== paid.chargeIds[0] ||
      projection.originalPrincipalMinor !== paid.principalMinor ||
      projection.originalTaxMinor !== paid.taxMinor ||
      projection.originalGrossMinor !== paid.grossMinor ||
      BigInt(projection.principalLossMinor) !== input.principalLossMinor ||
      BigInt(projection.taxLossMinor) !== input.taxLossMinor ||
      BigInt(projection.grossLossMinor) !== input.grossLossMinor ||
      (cashCase?.projectionSourceGeneration === claim.generation &&
        cashCase.projectionDigest !== input.projectionDigest)
    ) {
      throw new Error('Cash projection does not match its canonical source evidence');
    }
    if (
      cashCase?.projectionEvidence !== null &&
      cashCase?.projectionEvidence !== undefined &&
      !cashProjectionCoversRetained(cashCase.projectionEvidence, projection)
    ) {
      throw new Error('Cash projection omits retained source identities');
    }
    const principal = BigInt(paid.principalMinor);
    const tax = BigInt(paid.taxMinor);
    const gross = BigInt(paid.grossMinor);
    if (
      principal <= 0n ||
      input.principalLossMinor < 0n ||
      input.principalLossMinor > principal ||
      input.taxLossMinor < 0n ||
      input.taxLossMinor > tax ||
      input.grossLossMinor < 0n ||
      input.grossLossMinor > gross ||
      input.principalLossMinor + input.taxLossMinor !== input.grossLossMinor
    ) {
      throw new RangeError('Unsupported cumulative cash allocation');
    }
    const [ownedSubscription] =
      'subscriptionId' in cause && cause.subscriptionId !== null
        ? await tx
            .select()
            .from(subscription)
            .where(and(eq(subscription.id, cause.subscriptionId), eq(subscription.accountId, account.id)))
        : [];
    const customerBindingId =
      'customerBindingId' in cause ? cause.customerBindingId : ownedSubscription?.customerBindingId;
    if (!customerBindingId) {
      throw new Error('Cash cause Customer binding is missing');
    }
    const priorIssuance = cause.state === 'fulfilled' ? cause.grantedAtoms : null;
    const ceiling = offer.ceilingCreditAtoms === null ? null : BigInt(offer.ceilingCreditAtoms);
    const headroom =
      ceiling === null ? cause.creditAtoms : ceiling > account.planAtoms ? ceiling - account.planAtoms : 0n;
    const basis =
      cashCase?.originalAtoms ?? priorIssuance ?? (headroom < cause.creditAtoms ? headroom : cause.creditAtoms);
    const entitlement = basis - (basis * input.principalLossMinor) / principal;
    const receipt = await this.fulfillPaidCause(
      { accountId: account.id, causeId: cause.id },
      input.source,
      tx,
      priorIssuance === null && cashCase === undefined ? entitlement : undefined,
    );
    if (cashCase === undefined) {
      const [inserted] = await tx
        .insert(billingReversalCase)
        .values({
          id: randomUUID(),
          accountId: account.id,
          purchaseId: input.source === 'purchased' ? cause.id : null,
          periodId: input.source === 'plan' ? cause.id : null,
          source: input.source,
          originalAtoms: basis,
          initialIssuedAtoms: receipt.grantedAtoms,
          withheldAtoms: basis - receipt.grantedAtoms,
          deferredIssuedAtoms: 0n,
          netAppliedAtoms: 0n,
          environment: account.environment,
          stripeAccountId: paid.stripeAccountId,
          livemode: paid.livemode,
          currency: paid.currency,
          customerBindingId,
          paymentIntentId: paid.paymentIntentIds[0],
          chargeId: paid.chargeIds[0],
          canonicalReceiptId: receipt.receiptId,
          originalPrincipalMinor: principal,
          originalTaxMinor: tax,
          originalGrossMinor: gross,
          cumulativePrincipalLossMinor: input.principalLossMinor,
          cumulativeTaxLossMinor: input.taxLossMinor,
          cumulativeGrossLossMinor: input.grossLossMinor,
          projectionDigest: input.projectionDigest,
          projectionSourceId: claim.id,
          projectionSourceGeneration: claim.generation,
          projectionObservedAt: input.occurredAt,
          projectionEvidence: input.evidence,
        })
        .returning();
      if (!inserted) {
        throw new Error('Cash case insertion failed');
      }
      cashCase = inserted;
    }
    if (
      cashCase.accountId !== account.id ||
      cashCase.canonicalReceiptId !== receipt.receiptId ||
      cashCase.initialIssuedAtoms === null ||
      cashCase.withheldAtoms === null ||
      cashCase.originalPrincipalMinor !== principal ||
      cashCase.originalTaxMinor !== tax ||
      cashCase.chargeId !== paid.chargeIds[0] ||
      cashCase.paymentIntentId !== paid.paymentIntentIds[0] ||
      cashCase.stripeAccountId !== paid.stripeAccountId ||
      cashCase.livemode !== paid.livemode ||
      (cashCase.projectionSourceGeneration !== null && cashCase.projectionSourceGeneration > claim.generation)
    ) {
      throw new Error('Cash disposition does not match its immutable receipt');
    }
    const issued = cashCase.initialIssuedAtoms + cashCase.deferredIssuedAtoms;
    const release = entitlement > issued ? entitlement - issued : 0n;
    if (release > cashCase.withheldAtoms - cashCase.deferredIssuedAtoms) {
      throw new RangeError('Deferred release exceeds originally withheld entitlement');
    }
    if (release > 0n) {
      const current = await this.lockAccount(tx, account.id);
      const value = creditDebtFirst(current.debtAtoms, release);
      const revision = current.revision + 1n;
      const plan = input.source === 'plan' ? value.assetAtoms : 0n;
      const purchased = input.source === 'purchased' ? value.assetAtoms : 0n;
      await tx
        .update(creditAccount)
        .set({
          planAtoms: current.planAtoms + plan,
          purchasedAtoms: current.purchasedAtoms + purchased,
          debtAtoms: current.debtAtoms + value.debtDeltaAtoms,
          revision,
        })
        .where(eq(creditAccount.id, account.id));
      await tx.insert(creditTransaction).values({
        id: `${cashCase.id}:deferred:${cashCase.deferredIssuedAtoms + release}`,
        accountId: account.id,
        revision,
        kind: 'deferred_grant',
        reversalCaseId: cashCase.id,
        correctionOf: receipt.receiptId,
        promoDeltaAtoms: 0n,
        planDeltaAtoms: plan,
        purchasedDeltaAtoms: purchased,
        debtDeltaAtoms: value.debtDeltaAtoms,
        accountDeltaAtoms: release,
        balanceAfterAtoms:
          current.promoAtoms + current.planAtoms + current.purchasedAtoms - current.debtAtoms + release,
        occurredAt: input.occurredAt,
        cashEvidence: {
          version: 'cash-deferred-release-v1',
          sourceClaimId: claim.id,
          sourceGeneration: claim.generation.toString(),
          projectionDigest: input.projectionDigest,
          basisAtoms: basis.toString(),
          initialIssuedAtoms: cashCase.initialIssuedAtoms.toString(),
          priorDeferredAtoms: cashCase.deferredIssuedAtoms.toString(),
          deltaAtoms: release.toString(),
          principalMinor: principal.toString(),
          principalLossMinor: input.principalLossMinor.toString(),
          remainder: ((basis * input.principalLossMinor) % principal).toString(),
          evidence: input.evidence,
        },
      });
    }
    const deferred = cashCase.deferredIssuedAtoms + release;
    await tx
      .update(billingReversalCase)
      .set({
        deferredIssuedAtoms: deferred,
        cumulativePrincipalLossMinor: input.principalLossMinor,
        cumulativeTaxLossMinor: input.taxLossMinor,
        cumulativeGrossLossMinor: input.grossLossMinor,
        projectionDigest: input.projectionDigest,
        projectionSourceId: claim.id,
        projectionSourceGeneration: claim.generation,
        projectionObservedAt: input.occurredAt,
        projectionEvidence: input.evidence,
        updatedAt: new Date(),
      })
      .where(eq(billingReversalCase.id, cashCase.id));
    await this.applyReversalMutation(
      {
        accountId: account.id,
        caseId: cashCase.id,
        source: input.source,
        targetReversedAtoms: cashCase.initialIssuedAtoms + deferred - entitlement,
        occurredAt: input.occurredAt,
      },
      tx,
    );
    return receipt;
  }

  /** Moves a verified cumulative reversal target while preserving every existing hold. */
  public async applyReversalMutation(input: ReversalMutationInput, transaction?: Tx): Promise<boolean> {
    if (input.targetReversedAtoms < 0n) {
      throw new RangeError('Reversal target must be nonnegative');
    }
    if (transaction === undefined) {
      return this.databaseService.database.transaction(async (tx) => this.applyReversalMutation(input, tx));
    }
    const tx = transaction;
    const account = await this.lockAccount(tx, input.accountId);
    const [reversal] = await tx
      .select()
      .from(billingReversalCase)
      .where(and(eq(billingReversalCase.id, input.caseId), eq(billingReversalCase.accountId, input.accountId)))
      .for('update');
    if (!reversal) {
      throw new Error('Reversal case not found for account');
    }
    if (reversal.source !== input.source) {
      throw new Error('Reversal source mismatch');
    }
    if (
      input.targetReversedAtoms >
      (reversal.initialIssuedAtoms ?? reversal.originalAtoms) + reversal.deferredIssuedAtoms
    ) {
      throw new RangeError('Reversal exceeds original credit');
    }
    if (input.targetReversedAtoms === reversal.netAppliedAtoms) {
      return false;
    }
    const increase = input.targetReversedAtoms > reversal.netAppliedAtoms;
    const amount = increase
      ? input.targetReversedAtoms - reversal.netAppliedAtoms
      : reversal.netAppliedAtoms - input.targetReversedAtoms;
    const asset = input.source === 'plan' ? account.planAtoms : account.purchasedAtoms;
    const held = input.source === 'plan' ? account.planHeldAtoms : account.purchasedHeldAtoms;
    const available = asset - held;
    const assetDelta = increase
      ? -(available < amount ? available : amount)
      : creditDebtFirst(account.debtAtoms, amount).assetAtoms;
    const debtDelta = increase ? amount + assetDelta : creditDebtFirst(account.debtAtoms, amount).debtDeltaAtoms;
    const normalized = this.normalizeDebt(
      {
        promoAtoms: account.promoAtoms,
        planAtoms: account.planAtoms + (input.source === 'plan' ? assetDelta : 0n),
        purchasedAtoms: account.purchasedAtoms + (input.source === 'purchased' ? assetDelta : 0n),
      },
      {
        promoAtoms: account.promoHeldAtoms,
        planAtoms: account.planHeldAtoms,
        purchasedAtoms: account.purchasedHeldAtoms,
      },
      account.debtAtoms + debtDelta,
    );
    const revision = account.revision + 1n;
    const promoDeltaAtoms = normalized.assets.promoAtoms - account.promoAtoms;
    const planDeltaAtoms = normalized.assets.planAtoms - account.planAtoms;
    const purchasedDeltaAtoms = normalized.assets.purchasedAtoms - account.purchasedAtoms;
    const normalizedDebtDelta = normalized.debtAtoms - account.debtAtoms;
    await tx
      .update(creditAccount)
      .set({
        promoAtoms: normalized.assets.promoAtoms,
        planAtoms: normalized.assets.planAtoms,
        purchasedAtoms: normalized.assets.purchasedAtoms,
        debtAtoms: normalized.debtAtoms,
        revision,
      })
      .where(eq(creditAccount.id, account.id));
    await tx
      .update(billingReversalCase)
      .set({ netAppliedAtoms: input.targetReversedAtoms })
      .where(eq(billingReversalCase.id, reversal.id));
    await tx.insert(creditTransaction).values({
      id: randomUUID(),
      accountId: account.id,
      revision,
      kind: 'reversal',
      reversalCaseId: reversal.id,
      promoDeltaAtoms,
      planDeltaAtoms,
      purchasedDeltaAtoms,
      debtDeltaAtoms: normalizedDebtDelta,
      accountDeltaAtoms: increase ? -amount : amount,
      balanceAfterAtoms:
        account.promoAtoms +
        account.planAtoms +
        account.purchasedAtoms -
        account.debtAtoms +
        (increase ? -amount : amount),
      occurredAt: input.occurredAt,
    });
    return true;
  }

  /** Issues the current-period promotion once; disabled periods never backfill. */
  public async applyPromotionIssuance(input: PromotionIssuanceInput): Promise<boolean> {
    if (input.entitlementAtoms < 0n || input.accountCeilingAtoms < 0n) {
      throw new RangeError('Promotion amounts must be nonnegative');
    }
    return this.databaseService.database.transaction(async (tx) => {
      const effective = await this.policyService.selectEffectivePolicy(
        { environment: input.environment, replica: input.replica },
        tx,
      );
      const { promotionalIssuance: promotion } = effective.policy;
      const { offer } = promotion;
      const periodStart = new Date(
        Date.UTC(effective.selectedAt.getUTCFullYear(), effective.selectedAt.getUTCMonth(), 1),
      );
      const periodEnd = new Date(
        Date.UTC(effective.selectedAt.getUTCFullYear(), effective.selectedAt.getUTCMonth() + 1, 1),
      );
      if (!promotion.enabled || offer === null) {
        return false;
      }
      if (
        !input.enabled ||
        input.promotionProgramId !== offer.promotionProgramId ||
        input.entitlementAtoms !== BigInt(offer.grantCreditAtoms) ||
        input.accountCeilingAtoms !== BigInt(offer.accountCeilingCreditAtoms) ||
        input.budgetId !== offer.budgetId ||
        input.periodStart.getTime() !== periodStart.getTime() ||
        input.periodEnd.getTime() !== periodEnd.getTime()
      ) {
        throw new Error('Promotion input does not match the current policy');
      }
      const [discovered] = await tx.select().from(billingBudget).where(eq(billingBudget.id, offer.budgetId));
      if (
        !discovered ||
        discovered.environment !== input.environment ||
        discovered.kind !== 'promotion_issuance' ||
        discovered.scope !== offer.promotionProgramId ||
        discovered.periodStart.getTime() !== periodStart.getTime() ||
        discovered.periodEnd.getTime() !== periodEnd.getTime()
      ) {
        throw new Error('Qualified promotion budget unavailable');
      }
      await this.lockBudgetContext(tx, [discovered.id], [discovered.fundingId]);
      const account = await this.lockAccount(tx, input.accountId);
      if (account.environment !== input.environment || account.status !== 'open') {
        throw new Error('Promotion account is not eligible');
      }
      const [eligibleOwner] = await tx
        .select({ id: billingOwnerBinding.id })
        .from(billingOwnerBinding)
        .innerJoin(user, eq(user.id, billingOwnerBinding.authUserId))
        .where(
          and(
            eq(billingOwnerBinding.accountId, account.id),
            eq(billingOwnerBinding.environment, input.environment),
            sql`${billingOwnerBinding.authUserId} is not null`,
            sql`${billingOwnerBinding.revokedAt} is null`,
            eq(user.emailVerified, true),
          ),
        );
      if (!eligibleOwner) {
        throw new Error('Promotion requires a verified active account owner');
      }
      const [duplicate] = await tx
        .select({ id: billingPromotionIssuance.id })
        .from(billingPromotionIssuance)
        .where(
          and(
            eq(billingPromotionIssuance.accountId, account.id),
            eq(billingPromotionIssuance.promotionProgramId, input.promotionProgramId),
            eq(billingPromotionIssuance.periodStart, input.periodStart),
            eq(billingPromotionIssuance.periodEnd, input.periodEnd),
          ),
        )
        .for('update');
      if (duplicate) {
        return false;
      }
      const [budget] = await tx.select().from(billingBudget).where(eq(billingBudget.id, input.budgetId));
      const [funding] = await tx
        .select()
        .from(billingBudgetFunding)
        .where(eq(billingBudgetFunding.id, discovered.fundingId));
      if (!budget || !funding) {
        throw new Error('Promotion funding unavailable');
      }
      const ceilingRemaining =
        input.accountCeilingAtoms > account.promoAtoms ? input.accountCeilingAtoms - account.promoAtoms : 0n;
      const issued = ceilingRemaining < input.entitlementAtoms ? ceilingRemaining : input.entitlementAtoms;
      if (
        issued === 0n ||
        budget.consumed + budget.held + issued > budget.approvedCap ||
        funding.consumed + funding.held + issued > funding.fundedLifetime
      ) {
        return false;
      }
      const normalized = creditDebtFirst(account.debtAtoms, issued);
      const revision = account.revision + 1n;
      const issuanceId = randomUUID();
      await tx.insert(billingPromotionIssuance).values({
        id: issuanceId,
        environment: input.environment,
        accountId: account.id,
        promotionProgramId: input.promotionProgramId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        budgetId: budget.id,
        atoms: issued,
      });
      await tx
        .update(billingBudget)
        .set({ consumed: budget.consumed + issued })
        .where(eq(billingBudget.id, budget.id));
      await tx
        .update(billingBudgetFunding)
        .set({ consumed: funding.consumed + issued })
        .where(eq(billingBudgetFunding.id, funding.id));
      await tx
        .update(creditAccount)
        .set({
          promoAtoms: account.promoAtoms + normalized.assetAtoms,
          debtAtoms: account.debtAtoms + normalized.debtDeltaAtoms,
          revision,
        })
        .where(eq(creditAccount.id, account.id));
      await tx.insert(creditTransaction).values({
        id: randomUUID(),
        accountId: account.id,
        revision,
        kind: 'promotion_grant',
        promotionIssuanceId: issuanceId,
        promoDeltaAtoms: normalized.assetAtoms,
        planDeltaAtoms: 0n,
        purchasedDeltaAtoms: 0n,
        debtDeltaAtoms: normalized.debtDeltaAtoms,
        accountDeltaAtoms: issued,
        balanceAfterAtoms: account.promoAtoms + account.planAtoms + account.purchasedAtoms - account.debtAtoms + issued,
        occurredAt: effective.selectedAt,
      });
      return true;
    });
  }

  /**
   * Decides what a failed recovery claim does next, and never throws.
   *
   * Retained evidence is immutable, so the failures of Finding 6 recur on every
   * attempt: they absorb immediately. Anything else retries on an exponential
   * lease from one minute and absorbs once the attempt budget is spent, so no
   * operation can hold credit forever behind a silent loop.
   */
  private async resolveRecoveryFailure(claim: OperationClaim, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const unresolvable = unresolvableRecoveryFailures.has(message);
    // The claim bumped `generation`, which counts every attempt this operation has had.
    const attempt = Number(claim.generation - 1n);
    try {
      if (!unresolvable && attempt < maximumRecoveryAttempts) {
        await this.databaseService.database
          .update(creditOperation)
          .set({
            leaseUntil: sql`transaction_timestamp() + make_interval(mins => ${2 ** Math.max(0, attempt - 1)})`,
          })
          .where(
            and(
              eq(creditOperation.id, claim.operationId),
              eq(creditOperation.generation, claim.generation),
              eq(creditOperation.customerState, 'pending'),
            ),
          );
        return;
      }
      await this.absorbUnresolvableOperation(claim, {
        reason: unresolvable ? 'unresolvable_failure' : 'retries_exhausted',
        detail: `${message} (attempt ${attempt})`,
      });
    } catch {
      // The one-minute claim lease expires and the next pass re-classifies the same failure.
    }
  }

  /**
   * Fences an operation recovery cannot price into a terminal absorbed state.
   *
   * The retained evidence stays exactly as recorded; a content-free terminal
   * marker is what the transactional terminalizer prices at zero, so the
   * customer keeps their credit, the risk hold is absorbed and the unproved
   * supplier spend is finalized under an operator case.
   */
  private async absorbUnresolvableOperation(
    claim: OperationClaim,
    cause: { reason: RecoveryCaseReason; detail: string },
  ): Promise<void> {
    const [operation] = await this.databaseService.database
      .select()
      .from(creditOperation)
      .where(
        and(
          eq(creditOperation.id, claim.operationId),
          eq(creditOperation.generation, claim.generation),
          eq(creditOperation.customerState, 'pending'),
        ),
      );
    if (!operation) {
      return;
    }
    await this.openRecoveryCase(operation, cause);
    const evidence: TerminalEvidence = {
      kind: 'absorbed_unknown',
      executionStatus: operation.cancellationRequestedAt === null ? 'failed' : 'cancelled',
      normalizationEvidence: { version: 'recovery-terminal-v1', terminalReason: 'recovery_unresolvable', fields: {} },
    };
    await this.recordInvocationEvidence({ ...claim, evidence });
    await this.terminalizeOperation({
      ...claim,
      expectedGeneration: claim.generation,
      evidence,
      resolvedAt: new Date(),
      expireSpendHold: true,
    });
  }

  /** Holds the claim for a bounded grace so late supplier evidence can still settle it. */
  private async deferRecovery(operationId: string, generation: bigint): Promise<void> {
    await this.databaseService.database
      .update(creditOperation)
      .set({ leaseUntil: sql`${creditOperation.dueAt} + make_interval(mins => ${recoveryGraceMinutes})` })
      .where(
        and(
          eq(creditOperation.id, operationId),
          eq(creditOperation.generation, generation),
          eq(creditOperation.customerState, 'pending'),
        ),
      );
  }

  /**
   * Opens the operator's case for one recovered operation, idempotently.
   *
   * The kind is deliberately outside the cash- and supplier-blocking sets: an
   * absorbed turn is Tau's loss to reconcile, not a reason to restrict the
   * account or pause the route for every other caller.
   *
   * @param operation - The operation the case is about; its id is the dedupe key.
   * @param cause - Why the case exists, in the operator's own words.
   * @param transaction - Commits the case with the settlement that caused it; a
   *   recovery pass opens its case before the terminalizer instead.
   */
  private async openRecoveryCase(
    operation: typeof creditOperation.$inferSelect,
    cause: { reason: RecoveryCaseReason; detail: string },
    transaction?: Tx,
  ): Promise<void> {
    const database = transaction ?? this.databaseService.database;
    const [customer] = await database
      .select({ stripeAccountId: billingStripeCustomer.stripeAccountId, livemode: billingStripeCustomer.livemode })
      .from(billingStripeCustomer)
      .where(
        and(
          eq(billingStripeCustomer.accountId, operation.accountId),
          eq(billingStripeCustomer.environment, operation.environment),
        ),
      )
      .limit(1);
    const evidence = {
      version: 'llm-recovery-v1',
      reason: cause.reason,
      detail: cause.detail,
      attempts: (operation.generation - 1n).toString(),
      dispatchIntentAt: operation.dispatchIntentAt?.toISOString() ?? null,
      dueAt: operation.dueAt.toISOString(),
      authorizedAtoms: operation.authorizedAtoms.toString(),
      modelId: operation.modelId,
      sku: operation.sku,
    };
    await database
      .insert(billingFinancialCase)
      .values({
        id: randomUUID(),
        environment: operation.environment,
        stripeAccountId: customer?.stripeAccountId ?? '',
        livemode: customer?.livemode ?? false,
        kind: recoveryFinancialCaseKind,
        dedupeKey: operation.id,
        accountId: operation.accountId,
        sourceType: 'credit_operation',
        sourceId: operation.id,
        evidence,
        owner: 'billing-operations',
        nextStep: 'price_the_retained_evidence_or_write_off_the_supplier_cost',
        firstEffectiveAt: operation.dueAt,
      })
      .onConflictDoUpdate({
        target: [
          billingFinancialCase.environment,
          billingFinancialCase.stripeAccountId,
          billingFinancialCase.livemode,
          billingFinancialCase.kind,
          billingFinancialCase.dedupeKey,
        ],
        // `firstEffectiveAt` stays where the case first landed; the protected trigger refuses to postpone it.
        set: {
          state: 'open',
          lastSeenAt: sql`clock_timestamp()`,
          resolvedAt: null,
          resolutionEvidence: null,
          evidence,
        },
      });
  }

  private async dueLlmRecoveryState(input: {
    environment: BillingEnvironment;
    accountId?: string;
    pool?: FundedLlmCapacityPool;
  }): Promise<{
    pending: number;
    remainingDue: number;
    leasedDue: number;
    oldestDueAgeMilliseconds?: number;
  }> {
    const [state] = await this.databaseService.database
      .select({
        pending: sql<number>`count(*)::integer`,
        remainingDue: sql<number>`count(*) filter (where ${creditOperation.dueAt} <= transaction_timestamp())::integer`,
        leasedDue: sql<number>`count(*) filter (where ${creditOperation.dueAt} <= transaction_timestamp() and ${creditOperation.leaseUntil} > transaction_timestamp())::integer`,
        oldestDueAgeMilliseconds: sql<
          number | undefined
        >`case when count(*) filter (where ${creditOperation.dueAt} <= transaction_timestamp()) = 0 then null else greatest(0, floor(extract(epoch from (transaction_timestamp() - min(${creditOperation.dueAt}) filter (where ${creditOperation.dueAt} <= transaction_timestamp()))) * 1000))::double precision end`,
      })
      .from(creditOperation)
      .where(
        and(
          eq(creditOperation.environment, input.environment),
          eq(creditOperation.category, 'llm'),
          eq(creditOperation.customerState, 'pending'),
          input.accountId === undefined ? undefined : eq(creditOperation.accountId, input.accountId),
          input.pool === undefined ? undefined : llmCapacityPoolActivity(input.pool),
        ),
      );
    return {
      pending: state?.pending ?? 0,
      remainingDue: state?.remainingDue ?? 0,
      leasedDue: state?.leasedDue ?? 0,
      oldestDueAgeMilliseconds: state?.oldestDueAgeMilliseconds ?? undefined,
    };
  }

  /** Persists a funded-work wake in the admitting/resolving transaction, including denials. */
  private async queueReloadWork(
    tx: Tx,
    account: Account,
    work: {
      reasonKind: 'admission' | 'settlement' | 'insufficient_funds';
      reasonOperationId?: string;
      reasonAttemptKey: string;
      reasonRequestDigest: string;
    },
  ): Promise<void> {
    const { reasonKind, reasonOperationId, reasonAttemptKey, reasonRequestDigest } = work;
    await tx
      .insert(billingReloadWork)
      .values({
        accountId: account.id,
        environment: account.environment,
        reasonKind,
        reasonOperationId: reasonOperationId ?? null,
        reasonAttemptKey,
        reasonRequestDigest,
        observedAccountRevision: account.revision,
      })
      .onConflictDoUpdate({
        target: billingReloadWork.accountId,
        set: {
          reasonKind,
          reasonOperationId: reasonOperationId ?? null,
          reasonAttemptKey,
          reasonRequestDigest,
          observedAccountRevision: account.revision,
          state: 'pending',
          generation: sql`${billingReloadWork.generation} + 1`,
          leaseUntil: null,
          nextAttemptAt: sql`clock_timestamp()`,
          updatedAt: sql`clock_timestamp()`,
          errorCode: null,
        },
      });
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- caller-owned transaction and qualified cash amount are separate financial boundaries.
  private async fulfillPaidCause(
    input: PaidCauseInput,
    source: 'plan' | 'purchased',
    transaction?: Tx,
    cashIssuanceAtoms?: bigint,
  ): Promise<PaidCauseReceipt> {
    if (transaction === undefined) {
      return this.databaseService.database.transaction(async (tx) =>
        this.fulfillPaidCause(input, source, tx, cashIssuanceAtoms),
      );
    }
    const tx = transaction;
    const account = await this.lockAccount(tx, input.accountId);
    const [cause] =
      source === 'plan'
        ? await tx.select().from(billingPeriod).where(eq(billingPeriod.id, input.causeId)).for('update')
        : await tx.select().from(billingPurchase).where(eq(billingPurchase.id, input.causeId)).for('update');
    if (!cause || cause.accountId !== input.accountId) {
      throw new Error('Paid grant cause owner mismatch');
    }
    if (!['verified', 'paid_unfulfilled', 'fulfilled'].includes(cause.state) || cause.paidAt === null) {
      throw new Error('Paid grant cause is not paid');
    }
    if (cause.state !== 'fulfilled' && cashIssuanceAtoms === undefined) {
      throw new Error('Initial paid issuance requires complete cash disposition');
    }
    const offer = paymentOfferSnapshotSchema.parse(cause.offerSnapshot);
    const evidence = paidPaymentEvidenceSchema.parse(cause.paidEvidence);
    if (
      offer.accountId !== account.id ||
      offer.environment !== account.environment ||
      BigInt(offer.creditAtoms) !== cause.creditAtoms ||
      offer.stripeAccountId !== evidence.stripeAccountId ||
      offer.livemode !== evidence.livemode ||
      offer.principalMinor !== evidence.principalMinor ||
      (offer.taxBasis === 'stripe_checkout'
        ? offer.taxMinor !== null || offer.grossMinor !== null
        : offer.taxMinor !== evidence.taxMinor || offer.grossMinor !== evidence.grossMinor) ||
      new Date(evidence.paidAt).getTime() !== cause.paidAt.getTime() ||
      (source === 'plan') !== (offer.term === 'month')
    ) {
      throw new Error('Paid grant evidence does not match frozen cause');
    }
    let customerBindingId: string | undefined;
    if (evidence.paymentIntentIds.length !== 1 || evidence.chargeIds.length !== 1) {
      throw new Error('Paid cause requires one collected source');
    }
    if ('customerBindingId' in cause) {
      if (cause.stripeAccountId !== offer.stripeAccountId || cause.livemode !== offer.livemode) {
        throw new Error('Paid purchase scope does not match its evidence');
      }
      customerBindingId = cause.customerBindingId ?? undefined;
      if (cause.paymentIntentId !== evidence.paymentIntentIds[0] || cause.chargeId !== evidence.chargeIds[0]) {
        throw new Error('Purchase must bind one successful collection');
      }
    } else {
      const [slot] = await tx
        .select()
        .from(subscription)
        .where(and(eq(subscription.id, cause.subscriptionId ?? ''), eq(subscription.accountId, account.id)));
      if (
        slot === undefined ||
        slot.stripeSubscriptionId !== evidence.subscriptionId ||
        cause.invoiceId !== evidence.invoiceId
      ) {
        throw new Error('Period must bind its owned subscription and invoice');
      }
      customerBindingId = slot.customerBindingId ?? undefined;
    }
    const [customer] = await tx
      .select()
      .from(billingStripeCustomer)
      .where(
        and(eq(billingStripeCustomer.id, customerBindingId ?? ''), eq(billingStripeCustomer.accountId, account.id)),
      );
    if (
      customer === undefined ||
      customer.environment !== account.environment ||
      customer.stripeCustomerId !== evidence.customerId ||
      customer.stripeAccountId !== evidence.stripeAccountId ||
      customer.livemode !== evidence.livemode
    ) {
      throw new Error('Paid cause requires its stable owned Customer');
    }
    const kind = source === 'plan' ? 'period_grant' : 'purchase_grant';
    const causeColumn = source === 'plan' ? creditTransaction.periodId : creditTransaction.purchaseId;
    const [prior] = await tx
      .select()
      .from(creditTransaction)
      .where(and(eq(creditTransaction.kind, kind), eq(causeColumn, input.causeId)));
    if (prior !== undefined) {
      if (
        prior.accountId !== account.id ||
        prior.stripeAccountId !== evidence.stripeAccountId ||
        prior.livemode !== evidence.livemode ||
        prior.paymentIntentId !== evidence.paymentIntentIds[0] ||
        prior.chargeId !== evidence.chargeIds[0] ||
        cause.state !== 'fulfilled' ||
        cause.receiptId !== prior.id ||
        cause.fulfilledRevision !== prior.revision ||
        cause.grantedAtoms !== prior.accountDeltaAtoms
      ) {
        throw new Error('Paid grant receipt does not match its cause');
      }
      return { receiptId: prior.id, grantedAtoms: prior.accountDeltaAtoms, revision: prior.revision };
    }
    if (cause.state === 'fulfilled') {
      throw new Error('Fulfilled paid cause has no journal');
    }
    if ('periodStart' in cause) {
      const [overlap] = await tx
        .select({ id: billingPeriod.id })
        .from(billingPeriod)
        .where(
          and(
            eq(billingPeriod.accountId, account.id),
            eq(billingPeriod.subscriptionId, cause.subscriptionId ?? ''),
            ne(billingPeriod.id, cause.id),
            lt(billingPeriod.periodStart, cause.periodEnd),
            gt(billingPeriod.periodEnd, cause.periodStart),
            inArray(billingPeriod.state, ['verified', 'fulfilled']),
          ),
        )
        .limit(1);
      if (overlap !== undefined) {
        throw new ConflictException({ code: 'overlapping_paid_period' });
      }
    }
    const ceiling = offer.ceilingCreditAtoms === null ? null : BigInt(offer.ceilingCreditAtoms);
    const headroom =
      ceiling === null ? cause.creditAtoms : ceiling > account.planAtoms ? ceiling - account.planAtoms : 0n;
    const eligible = source === 'plan' && cause.creditAtoms > headroom ? headroom : cause.creditAtoms;
    const atoms = cashIssuanceAtoms ?? eligible;
    if (atoms < 0n || atoms > eligible) {
      throw new RangeError('Cash disposition exceeds eligible frozen issuance');
    }
    const value = creditDebtFirst(account.debtAtoms, atoms);
    const revision = account.revision + 1n;
    const plan = source === 'plan' ? value.assetAtoms : 0n;
    const purchased = source === 'purchased' ? value.assetAtoms : 0n;
    const receiptId = randomUUID();
    await tx
      .update(creditAccount)
      .set({
        planAtoms: account.planAtoms + plan,
        purchasedAtoms: account.purchasedAtoms + purchased,
        debtAtoms: account.debtAtoms + value.debtDeltaAtoms,
        revision,
      })
      .where(eq(creditAccount.id, account.id));
    await tx.insert(creditTransaction).values({
      id: receiptId,
      accountId: account.id,
      revision,
      kind,
      purchaseId: source === 'purchased' ? cause.id : null,
      periodId: source === 'plan' ? cause.id : null,
      stripeAccountId: evidence.stripeAccountId,
      livemode: evidence.livemode,
      paymentIntentId: evidence.paymentIntentIds[0],
      chargeId: evidence.chargeIds[0],
      promoDeltaAtoms: 0n,
      planDeltaAtoms: plan,
      purchasedDeltaAtoms: purchased,
      debtDeltaAtoms: value.debtDeltaAtoms,
      accountDeltaAtoms: atoms,
      balanceAfterAtoms: account.promoAtoms + account.planAtoms + account.purchasedAtoms - account.debtAtoms + atoms,
      occurredAt: cause.paidAt,
    });
    const fulfilled = { state: 'fulfilled', receiptId, grantedAtoms: atoms, fulfilledRevision: revision };
    if (source === 'plan') {
      await tx.update(billingPeriod).set(fulfilled).where(eq(billingPeriod.id, cause.id));
    } else {
      await tx
        .update(billingPurchase)
        .set({ ...fulfilled, fulfilledAt: new Date(), updatedAt: new Date() })
        .where(eq(billingPurchase.id, cause.id));
    }
    return { receiptId, grantedAtoms: atoms, revision };
  }

  /**
   * The tariff a settlement prices at.
   *
   * A long-context pin is taken on an upper bound, so it can be premium for a turn
   * whose real input never reaches the threshold. The hold stays where the proof
   * put it; the charge follows the tier the observed input actually reached, priced
   * from the base sku of the operation's own policy, which is never dearer than the
   * pin and so is still covered by the authorization.
   *
   * @param tx - The terminalizing transaction.
   * @param operation - The locked operation row.
   * @param evidence - Its terminal evidence.
   * @returns The pinned tariff, or the base sku's retail rates when the pin was never reached.
   */
  private async settlementTariff(
    tx: Tx,
    operation: typeof creditOperation.$inferSelect,
    evidence: TerminalEvidence,
  ): Promise<typeof operation.pinnedTariff> {
    const minimum = operation.invocation?.supplierValuation?.longContextMinimumInputTokens;
    const [baseSku, longContextSku] = routeSkuFamily(operation.sku);
    const meterItems = evidence.kind === 'provider_rejected' ? [] : (evidence.meterItems ?? []);
    if (minimum === undefined || minimum === null || operation.sku !== longContextSku || meterItems.length === 0) {
      return operation.pinnedTariff;
    }
    const observedInput = meterItems
      .filter((item) => item.dimension !== 'output')
      .reduce((total, item) => total + item.quantity, 0n);
    if (observedInput >= BigInt(minimum)) {
      return operation.pinnedTariff;
    }
    const [row] = await tx
      .select({ canonicalContent: billingPolicy.canonicalContent })
      .from(billingPolicy)
      .where(eq(billingPolicy.id, operation.policyId));
    const base =
      row === undefined
        ? undefined
        : resolvePolicyRoute(validateCommercialPolicy(row.canonicalContent).policy, baseSku);
    if (base === undefined) {
      return operation.pinnedTariff;
    }
    const downgraded = operation.pinnedTariff.map((pinned) => {
      const rate = base.rates.find(({ dimension, tier }) => dimension === pinned.dimension && tier === pinned.tier);
      return rate === undefined ||
        /* The base schedule must cover every pinned dimension and may never exceed the pin, or the
         * settlement could charge above what the authorization proved; then the pin stands. */
        BigInt(rate.numeratorCreditAtoms) * BigInt(pinned.denominatorUnits) >
          BigInt(pinned.numeratorCreditAtoms) * BigInt(rate.publicDenominatorUnits)
        ? undefined
        : {
            ...pinned,
            rateId: rate.rateId,
            numeratorCreditAtoms: rate.numeratorCreditAtoms,
            denominatorUnits: rate.publicDenominatorUnits,
          };
    });
    return downgraded.every((rate) => rate !== undefined) ? downgraded : operation.pinnedTariff;
  }

  private charge(
    operation: typeof creditOperation.$inferSelect,
    evidence: TerminalEvidence,
    tariff: typeof operation.pinnedTariff,
  ): {
    chargedAtoms: bigint;
    // oxlint-disable-next-line typescript/no-restricted-types -- a non-usage terminal has no retail observation
    actualRetailAtoms: bigint | null;
    reportedRetailAtoms: bigint;
    overrun: boolean;
    inputOverflow?: { observed: bigint; maximum: bigint };
  } {
    if (evidence.kind !== 'final_usage' && evidence.kind !== 'authorized_exhausted') {
      return { chargedAtoms: 0n, actualRetailAtoms: null, reportedRetailAtoms: 0n, overrun: false };
    }
    const meterItems = evidence.meterItems ?? [];
    const quantities = new Map(meterItems.map((item) => [`${item.dimension}:${item.tier ?? ''}`, item.quantity]));
    const sized =
      quantities.size === meterItems.length &&
      quantities.size === tariff.length &&
      [...quantities.values()].every((quantity) => quantity >= 0n);
    const priceable = sized && tariff.every((rate) => quantities.has(`${rate.dimension}:${rate.tier ?? ''}`));
    if (evidence.kind === 'authorized_exhausted' && !priceable) {
      /* The cut stops the supplier spend; it proves nothing about what was delivered. Charging the
       * authorization here would bill the maximum for a truncated answer on the wires that report
       * usage only in their final event, so the customer pays what the stream proved: nothing.
       * The operator's case (opened by the terminalizer) is where a mis-sized ceiling surfaces. */
      return { chargedAtoms: 0n, actualRetailAtoms: null, reportedRetailAtoms: 0n, overrun: false };
    }
    if (!sized) {
      throw new Error('Terminal meter quantities do not match the pinned tariff');
    }
    const computedRetailAtoms = roundHalfUpUnbounded(
      tariff.map((rate) => {
        const quantity = quantities.get(`${rate.dimension}:${rate.tier ?? ''}`);
        if (quantity === undefined) {
          throw new Error('Terminal meter dimension is not pinned');
        }
        return {
          numerator: BigInt(rate.numeratorCreditAtoms) * quantity,
          denominator: BigInt(rate.denominatorUnits),
        };
      }),
    );
    const inputMaximum = operation.invocation?.jointInputMaximum;
    const observedInput = meterItems
      .filter((item) => item.dimension !== 'output')
      .reduce((total, item) => total + item.quantity, 0n);
    const inputOverflow =
      inputMaximum !== undefined && observedInput > BigInt(inputMaximum.quantity)
        ? { observed: observedInput, maximum: BigInt(inputMaximum.quantity) }
        : undefined;
    const chargedAtoms =
      computedRetailAtoms < operation.authorizedAtoms ? computedRetailAtoms : operation.authorizedAtoms;
    if (evidence.kind === 'authorized_exhausted') {
      // Usage the provider reported before the cut only ever lowers the charge; the cut itself is
      // the authorization being spent, so it raises no exception and pauses no route.
      return {
        chargedAtoms,
        actualRetailAtoms: computedRetailAtoms.toString().length <= 78 ? computedRetailAtoms : null,
        reportedRetailAtoms: chargedAtoms,
        overrun: false,
      };
    }
    return {
      chargedAtoms,
      actualRetailAtoms: computedRetailAtoms.toString().length <= 78 ? computedRetailAtoms : null,
      reportedRetailAtoms: computedRetailAtoms,
      overrun: computedRetailAtoms > operation.authorizedAtoms || inputOverflow !== undefined,
      inputOverflow,
    };
  }

  private boundedTokenTotal(
    items: Extract<TerminalEvidence, { kind: 'final_usage' }>['meterItems'],
    output: boolean,
    // oxlint-disable-next-line typescript/no-restricted-types -- oversized aggregate is intentionally absent while exact JSON quantities remain persisted
  ): bigint | null {
    const total = items
      .filter(({ dimension }) => (dimension === 'output') === output)
      .reduce((sum, { quantity }) => sum + quantity, 0n);
    return total <= 9_223_372_036_854_775_807n ? total : null;
  }
  private consume(operation: typeof creditOperation.$inferSelect, amount: bigint): SourceAmounts {
    let left = amount;
    const promoAtoms = left < operation.promoHeldAtoms ? left : operation.promoHeldAtoms;
    left -= promoAtoms;
    const planAtoms = left < operation.planHeldAtoms ? left : operation.planHeldAtoms;
    left -= planAtoms;
    if (left > operation.purchasedHeldAtoms) {
      throw new Error('Operation source holds do not cover charge');
    }
    return { promoAtoms, planAtoms, purchasedAtoms: left };
  }

  private normalizeDebt(
    assets: SourceAmounts,
    holds: SourceAmounts,
    debtAtoms: bigint,
  ): { assets: SourceAmounts; debtAtoms: bigint } {
    const next = { ...assets };
    let debt = debtAtoms;
    for (const source of ['promoAtoms', 'planAtoms', 'purchasedAtoms'] as const) {
      const available = next[source] - holds[source];
      const repayment = available < debt ? available : debt;
      next[source] -= repayment;
      debt -= repayment;
    }
    return { assets: next, debtAtoms: debt };
  }

  /** Charges what a hold still reserves to its budget; capacity is never handed back on absorption. */
  private async absorbHold(tx: Tx, holdId: string, finalityState: 'absorbed' | 'unresolved'): Promise<void> {
    const [hold] = await tx.select().from(billingBudgetHold).where(eq(billingBudgetHold.id, holdId)).for('update');
    if (!hold || hold.remainingHeld === 0n) {
      return;
    }
    const [budget] = await tx.select().from(billingBudget).where(eq(billingBudget.id, hold.budgetId));
    if (!budget) {
      throw new Error('Risk budget disappeared');
    }
    await tx
      .update(billingBudget)
      .set({
        held: sql`${billingBudget.held} - ${hold.remainingHeld}`,
        consumed: sql`${billingBudget.consumed} + ${hold.remainingHeld}`,
      })
      .where(eq(billingBudget.id, budget.id));
    await tx
      .update(billingBudgetFunding)
      .set({
        held: sql`${billingBudgetFunding.held} - ${hold.remainingHeld}`,
        consumed: sql`${billingBudgetFunding.consumed} + ${hold.remainingHeld}`,
      })
      .where(eq(billingBudgetFunding.id, budget.fundingId));
    await tx
      .update(billingBudgetHold)
      .set({
        remainingHeld: 0n,
        consumed: hold.consumed + hold.remainingHeld,
        finalityState,
      })
      .where(eq(billingBudgetHold.id, hold.id));
  }

  private async discoverOperationContext(
    operationId: string,
  ): Promise<{ accountId: string; environment: string; sku: string; budgetIds: string[]; fundingIds: string[] }> {
    const [operation] = await this.databaseService.database
      .select({
        accountId: creditOperation.accountId,
        environment: creditOperation.environment,
        sku: creditOperation.sku,
      })
      .from(creditOperation)
      .where(eq(creditOperation.id, operationId));
    if (!operation) {
      throw new Error('Credit operation not found');
    }
    const holds = await this.databaseService.database
      .select({ budgetId: billingBudgetHold.budgetId })
      .from(billingBudgetHold)
      .where(eq(billingBudgetHold.operationId, operationId));
    const budgetIds = holds.map(({ budgetId }) => budgetId).sort();
    const budgets =
      budgetIds.length === 0
        ? []
        : await this.databaseService.database
            .select({ fundingId: billingBudget.fundingId })
            .from(billingBudget)
            .where(inArray(billingBudget.id, budgetIds));
    return {
      accountId: operation.accountId,
      environment: operation.environment,
      sku: operation.sku,
      budgetIds,
      fundingIds: [...new Set(budgets.map(({ fundingId }) => fundingId))].sort(),
    };
  }

  /** Serializes SKU closure before the existing funding/budget/account/operation lock order. */
  private async lockRoute(tx: Tx, environment: string, sku: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([environment, sku])}, 0))`);
  }

  private async replayAdmission(operationId: string, requestDigest: string): Promise<AdmissionResult> {
    const context = await this.discoverOperationContext(operationId);
    return this.databaseService.database.transaction(async (tx) => {
      await this.lockBudgetContext(tx, context.budgetIds, context.fundingIds);
      await this.lockAccount(tx, context.accountId);
      const [operation] = await tx
        .select()
        .from(creditOperation)
        .where(eq(creditOperation.id, operationId))
        .for('update');
      if (!operation) {
        throw new Error('Credit operation disappeared during replay');
      }
      assertMatchingRequestDigest(operation.requestDigest, requestDigest);
      return {
        status: 'replay',
        operationId: operation.id,
        generation: operation.generation,
        customerState: customerState(operation.customerState),
      };
    });
  }

  private async lockBudgetContext(tx: Tx, budgetIds: string[], fundingIds: string[]): Promise<void> {
    if (fundingIds.length > 0) {
      await tx
        .select()
        .from(billingBudgetFunding)
        .where(inArray(billingBudgetFunding.id, fundingIds))
        .orderBy(asc(billingBudgetFunding.id))
        .for('update');
    }
    if (budgetIds.length > 0) {
      await tx
        .select()
        .from(billingBudget)
        .where(inArray(billingBudget.id, budgetIds))
        .orderBy(asc(billingBudget.id))
        .for('update');
    }
  }
  private async lockAccount(tx: Tx, accountId: string): Promise<Account> {
    const [row] = await tx.select().from(creditAccount).where(eq(creditAccount.id, accountId)).for('update');
    if (!row) {
      throw new Error('Credit account not found');
    }
    return row;
  }
  private async receipt(tx: Tx, operation: typeof creditOperation.$inferSelect): Promise<TerminalReceipt> {
    if (
      !operation.baseTransactionId ||
      operation.terminalRevision === null ||
      operation.resolvedAt === null ||
      operation.customerState === 'pending'
    ) {
      throw new Error('Terminal operation is missing its receipt');
    }
    const charged = operation.chargedAtoms ?? 0n;
    const [transaction] = await tx
      .select()
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.accountId, operation.accountId),
          eq(creditTransaction.id, operation.baseTransactionId),
        ),
      );
    if (!transaction) {
      throw new Error('Terminal receipt journal is missing');
    }
    return {
      operationId: operation.id,
      baseTransactionId: operation.baseTransactionId,
      terminalRevision: operation.terminalRevision,
      customerState: terminalCustomerState(operation.customerState),
      authorizedAtoms: operation.authorizedAtoms,
      chargedAtoms: charged,
      accountDeltaAtoms: -charged,
      sourceDeltas: {
        promoAtoms: transaction.promoDeltaAtoms,
        planAtoms: transaction.planDeltaAtoms,
        purchasedAtoms: transaction.purchasedDeltaAtoms,
      },
      resolvedAt: operation.resolvedAt,
    };
  }
}

/** Minutes after `due_at` that a dispatched turn keeps its holds while late evidence may arrive (Q4). */
export const recoveryGraceMinutes = 5;

/** Transient recovery attempts before the operation is absorbed, counted by `generation` (Q5). */
export const maximumRecoveryAttempts = 5;

/** The operator case one absorbed recovery opens; deliberately neither cash- nor supplier-blocking. */
export const recoveryFinancialCaseKind = 'llm_recovery_absorbed';

type RecoveryCaseReason = 'time_to_live' | 'unresolvable_failure' | 'retries_exhausted' | 'authorized_exhausted';

/**
 * Recovery failures that recur on every attempt.
 *
 * Retained evidence is immutable and supplier evidence is append-only, so each
 * of these is a property of the stored row rather than of the attempt: retrying
 * holds the customer's credit forever (Finding 6).
 */
const unresolvableRecoveryFailures = new Set([
  'Terminal meter quantities do not match the pinned tariff',
  'Terminal meter dimension is not pinned',
  'Terminal meter quantities contain duplicate dimensions',
  'Reasoning tokens must be a reported subset of output',
  'Too many terminal meter quantities',
  'Conflicting recovered supplier evidence',
  'Conflicting no-dispatch proof',
  'Conflicting supplier evidence',
  'Stored complete usage lacks required evidence',
]);
/* eslint-enable no-await-in-loop, max-lines, complexity -- financial mutations execute sequentially in one lock order */
