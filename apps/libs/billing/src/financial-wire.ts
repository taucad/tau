import { z } from 'zod';
import { maxCreditAtoms } from '#credit-atoms.js';

const maxAtomDigits = maxCreditAtoms.toString().length;
const minCreditAtoms = -9_223_372_036_854_775_808n;
const signedPattern = /^(0|-?[1-9][0-9]*)$/u;
const unsignedPattern = /^(0|[1-9][0-9]*)$/u;
const boundedInteger = (signed: boolean, digits: number) =>
  z
    .string()
    .regex(signed ? signedPattern : unsignedPattern)
    .max(digits + (signed ? 1 : 0));

/** Bounded opaque identity shared by policy, ledger, and public financial wires. @public */
export const financialIdentitySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/u);
/** Canonical signed 64-bit integer string used by credit-atom wires. @public */
export const signedIntegerStringSchema = boundedInteger(true, maxAtomDigits).refine((value) => {
  if (value.length > maxAtomDigits + 1 || !signedPattern.test(value)) {
    return false;
  }
  const parsed = BigInt(value);
  return parsed >= minCreditAtoms && parsed <= maxCreditAtoms;
});
/** Canonical nonnegative signed-64-bit integer string used by financial wires. @public */
export const unsignedIntegerStringSchema = boundedInteger(false, maxAtomDigits).refine((value) => {
  if (value.length > maxAtomDigits || !unsignedPattern.test(value)) {
    return false;
  }
  return BigInt(value) <= maxCreditAtoms;
});
/** Canonical integer string accepted for signed financial quantities. @public */
export const integerStringSchema = signedIntegerStringSchema;
/** Canonical signed numeric(78,0) string used by whole-history aggregates. @public */
export const aggregateSignedIntegerStringSchema = boundedInteger(true, 78).refine(
  (value) => (value.startsWith('-') ? value.length - 1 : value.length) <= 78,
);
/** Canonical nonnegative numeric(78,0) string used by whole-history aggregates. @public */
export const aggregateUnsignedIntegerStringSchema = boundedInteger(false, 78);
/** Canonical nonnegative integer with at most 78 digits for exact rates and meter quantities. @public */
export const rationalUnsignedIntegerStringSchema = aggregateUnsignedIntegerStringSchema;
/** Canonical nonnegative integer with at most 156 digits for exact contribution numerators. @public */
export const contributionUnsignedIntegerStringSchema = boundedInteger(false, 156);
const positiveRationalIntegerStringSchema = z.string().regex(/^[1-9][0-9]{0,77}$/u);
const positiveAtomIntegerStringSchema = unsignedIntegerStringSchema.refine((value) => value !== '0');
// At most 128 numeric78 meter items can sum to at most 81 decimal digits.
const tokenAggregateIntegerStringSchema = boundedInteger(false, 81);
const parseBoundedInteger = (value: string, signed: boolean, digits: number): bigint | undefined => {
  const pattern = signed ? signedPattern : unsignedPattern;
  const magnitudeLength = value.startsWith('-') ? value.length - 1 : value.length;
  return magnitudeLength <= digits && pattern.test(value) ? BigInt(value) : undefined;
};

const parseUnsignedAtom = (value: string): bigint | undefined => {
  if (value.length > maxAtomDigits || !unsignedPattern.test(value)) {
    return undefined;
  }
  const parsed = BigInt(value);
  return parsed <= maxCreditAtoms ? parsed : undefined;
};
const parseSignedAtom = (value: string): bigint | undefined => {
  if (value.length > maxAtomDigits + 1 || !signedPattern.test(value)) {
    return undefined;
  }
  const parsed = BigInt(value);
  return parsed >= minCreditAtoms && parsed <= maxCreditAtoms ? parsed : undefined;
};
/** Parses a bounded canonical signed wire integer. @public */
export const parseSignedIntegerString = (value: unknown): bigint => BigInt(signedIntegerStringSchema.parse(value));
/** Parses a bounded canonical unsigned wire integer. @public */
export const parseUnsignedIntegerString = (value: unknown): bigint => BigInt(unsignedIntegerStringSchema.parse(value));
/** Financial deployment environment identity. @public */
export const financialEnvironmentSchema = z.enum(['development', 'staging', 'prod-us', 'prod-eu']);
/** Public normalized LLM activity identity. @public */
export const financialActivityKindSchema = z.enum([
  'agent',
  'compaction',
  'summary',
  'title',
  'commit',
  'completion',
  'other',
]);
/** Public terminal execution outcome. @public */
export const billingExecutionStatusSchema = z.enum(['succeeded', 'cancelled', 'failed', 'rejected', 'unknown']);
/** Completeness of normalized public metering evidence. @public */
export const billingMeteringStatusSchema = z.enum(['complete', 'partial', 'unavailable']);
export type FinancialActivityKind = z.infer<typeof financialActivityKindSchema>;
export type BillingExecutionStatus = z.infer<typeof billingExecutionStatusSchema>;
export type BillingMeteringStatus = z.infer<typeof billingMeteringStatusSchema>;

const hintSchema = z.string().min(1).max(256);
export const wireUsageActivitySchema = z
  .object({
    kind: financialActivityKindSchema,
    projectHint: hintSchema.nullable(),
    chatHint: hintSchema.nullable(),
    parentAttemptKey: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._~-]+$/u)
      .nullable(),
  })
  .strict();
const identityEnvelope = {
  schemaVersion: z.literal(1),
  environment: financialEnvironmentSchema,
  ownerId: financialIdentitySchema,
  subjectId: financialIdentitySchema,
};
const historicalModelSchema = z
  .object({
    id: financialIdentitySchema,
    displayName: z.string().min(1).max(128).nullable(),
    providerId: financialIdentitySchema.nullable(),
  })
  .strict();
const timingStatusSchema = z.enum(['dispatch_intent', 'admitted_release', 'legacy', 'unavailable']);
const timestampSchema = z.iso.datetime();

/** Three-source public credit-account balance. @public */
export const wireCreditBalanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: financialEnvironmentSchema,
    subjectId: financialIdentitySchema,
    revision: unsignedIntegerStringSchema,
    asOf: timestampSchema,
    promoGrantCreditAtoms: unsignedIntegerStringSchema,
    planGrantCreditAtoms: unsignedIntegerStringSchema,
    purchasedCreditAtoms: unsignedIntegerStringSchema,
    debtCreditAtoms: unsignedIntegerStringSchema,
    promoHeldCreditAtoms: unsignedIntegerStringSchema,
    planHeldCreditAtoms: unsignedIntegerStringSchema,
    purchasedHeldCreditAtoms: unsignedIntegerStringSchema,
    pendingIssuanceCreditAtoms: unsignedIntegerStringSchema,
    eligibleAvailableCreditAtoms: unsignedIntegerStringSchema,
    netBalanceCreditAtoms: signedIntegerStringSchema,
  })
  .strict()
  .superRefine((balance, context) => {
    const values = [
      balance.promoGrantCreditAtoms,
      balance.planGrantCreditAtoms,
      balance.purchasedCreditAtoms,
      balance.debtCreditAtoms,
      balance.promoHeldCreditAtoms,
      balance.planHeldCreditAtoms,
      balance.purchasedHeldCreditAtoms,
      balance.pendingIssuanceCreditAtoms,
      balance.eligibleAvailableCreditAtoms,
    ].map((value) => parseUnsignedAtom(value));
    const net = parseSignedAtom(balance.netBalanceCreditAtoms);
    if (values.some((value) => value === undefined) || net === undefined) {
      return;
    }
    const [promo, plan, purchased, debt, promoHeld, planHeld, purchasedHeld, pending, eligible] = values as bigint[];
    if (promoHeld! > promo! || planHeld! > plan! || purchasedHeld! > purchased!) {
      context.addIssue({ code: 'custom', message: 'Each source hold must remain within its asset' });
    }
    const assets = promo! + plan! + purchased!;
    if (assets + pending! > maxCreditAtoms) {
      context.addIssue({ code: 'custom', message: 'Combined source assets and pending issuance exceed storage' });
    }
    const unheld = promo! - promoHeld! + plan! - planHeld! + purchased! - purchasedHeld!;
    if (eligible! > unheld || (debt! > 0n && eligible !== 0n)) {
      context.addIssue({ code: 'custom', message: 'Eligible atoms exceed available source funds or bypass debt' });
    }
    if (assets - debt! !== net) {
      context.addIssue({ code: 'custom', message: 'Net balance atoms do not match source assets and debt' });
    }
  });
export type WireCreditBalance = z.infer<typeof wireCreditBalanceSchema>;

/** Exact public meter item. Quantities may exceed account atom widths. @public */
export const wireMeterItemSchema = z
  .object({
    dimension: z.enum(['uncached_input', 'cache_read', 'cache_write', 'output']),
    kind: financialIdentitySchema,
    tier: financialIdentitySchema.optional(),
    quantity: aggregateUnsignedIntegerStringSchema.nullable(),
    unit: z.literal('token'),
    rate: z
      .object({
        rateId: financialIdentitySchema,
        numeratorCreditAtoms: rationalUnsignedIntegerStringSchema,
        denominatorUnits: positiveRationalIntegerStringSchema,
      })
      .strict(),
    exactContribution: z
      .object({
        numeratorCreditAtoms: contributionUnsignedIntegerStringSchema,
        denominator: positiveRationalIntegerStringSchema,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((item, context) => {
    if ((item.quantity === null) !== (item.exactContribution === null)) {
      context.addIssue({ code: 'custom', message: 'Unknown quantities require unknown exact contributions' });
    }
    if (item.quantity !== null && item.exactContribution !== null) {
      const quantity = parseBoundedInteger(item.quantity, false, 78);
      const rateNumerator = parseBoundedInteger(item.rate.numeratorCreditAtoms, false, 78);
      const rateDenominator = parseBoundedInteger(item.rate.denominatorUnits, false, 78);
      const contributionNumerator = parseBoundedInteger(item.exactContribution.numeratorCreditAtoms, false, 156);
      const contributionDenominator = parseBoundedInteger(item.exactContribution.denominator, false, 78);
      if (
        quantity === undefined ||
        rateNumerator === undefined ||
        rateDenominator === undefined ||
        contributionNumerator === undefined ||
        contributionDenominator === undefined ||
        rateDenominator === 0n ||
        contributionDenominator === 0n
      ) {
        return;
      }
      const supplied = contributionNumerator * rateDenominator;
      const expected = quantity * rateNumerator * contributionDenominator;
      if (supplied !== expected) {
        context.addIssue({ code: 'custom', message: 'Exact contribution must equal quantity multiplied by rate' });
      }
    }
  });
export type WireMeterItem = z.infer<typeof wireMeterItemSchema>;

/** Token convenience totals with explicit evidence completeness. @public */
export const wireTokenSummarySchema = z
  .object({
    status: billingMeteringStatusSchema,
    uncachedInput: tokenAggregateIntegerStringSchema.nullable(),
    cacheRead: tokenAggregateIntegerStringSchema.nullable(),
    cacheWrite: tokenAggregateIntegerStringSchema.nullable(),
    inputTotal: tokenAggregateIntegerStringSchema.nullable(),
    output: tokenAggregateIntegerStringSchema.nullable(),
    reasoning: aggregateUnsignedIntegerStringSchema.nullable().optional(),
  })
  .strict()
  .superRefine((tokens, context) => {
    const core = [tokens.uncachedInput, tokens.cacheRead, tokens.cacheWrite, tokens.inputTotal, tokens.output];
    if (tokens.status === 'complete' && core.some((value) => value === null)) {
      context.addIssue({ code: 'custom', message: 'Complete metering requires every core token total' });
    }
    if (tokens.status === 'partial' && core.every((value) => value === null)) {
      context.addIssue({ code: 'custom', message: 'Partial metering requires at least one known token total' });
    }
    if (
      tokens.status === 'unavailable' &&
      [...core, tokens.reasoning].some((value) => value !== null && value !== undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'Unavailable metering cannot contain measured token totals' });
    }
    const reasoning =
      tokens.reasoning === null || tokens.reasoning === undefined
        ? undefined
        : parseBoundedInteger(tokens.reasoning, false, 78);
    const output = tokens.output === null ? undefined : parseBoundedInteger(tokens.output, false, 81);
    if (reasoning !== undefined && output !== undefined && reasoning > output) {
      context.addIssue({ code: 'custom', message: 'Reasoning tokens must be a subset of output tokens' });
    }
    if (
      tokens.uncachedInput !== null &&
      tokens.cacheRead !== null &&
      tokens.cacheWrite !== null &&
      tokens.inputTotal !== null &&
      [tokens.uncachedInput, tokens.cacheRead, tokens.cacheWrite, tokens.inputTotal].every(
        (value) => parseBoundedInteger(value, false, 81) !== undefined,
      ) &&
      parseBoundedInteger(tokens.inputTotal, false, 81) !==
        parseBoundedInteger(tokens.uncachedInput, false, 81)! +
          parseBoundedInteger(tokens.cacheRead, false, 81)! +
          parseBoundedInteger(tokens.cacheWrite, false, 81)!
    ) {
      context.addIssue({ code: 'custom', message: 'Input total must equal its token components' });
    }
  });
export type WireTokenSummary = z.infer<typeof wireTokenSummarySchema>;

const receiptCore = {
  ...identityEnvelope,
  operationId: financialIdentitySchema,
  baseTransactionId: financialIdentitySchema,
  terminalRevision: positiveAtomIntegerStringSchema,
  policyVersion: financialIdentitySchema,
  activationId: financialIdentitySchema,
  meterContractId: financialIdentitySchema,
  category: z.literal('llm'),
  model: historicalModelSchema,
  activity: wireUsageActivitySchema,
  historyVersion: z.literal(1).nullable(),
  admittedAt: timestampSchema.nullable(),
  dispatchIntentAt: timestampSchema.nullable(),
  usageOccurredAt: timestampSchema.nullable(),
  evidenceOccurredAt: timestampSchema.nullable(),
  timingStatus: timingStatusSchema,
};
/** Immutable terminal customer receipt with pinned public rates. @public */
export const wireBaseReceiptSchema = z
  .object({
    ...receiptCore,
    kind: z.literal('base'),
    resolvedAt: timestampSchema,
    executionStatus: billingExecutionStatusSchema,
    customerState: z.enum(['settled', 'released', 'absorbed']),
    authorizedMaxCreditAtoms: unsignedIntegerStringSchema,
    chargedCreditAtoms: unsignedIntegerStringSchema,
    accountDeltaCreditAtoms: signedIntegerStringSchema,
    meteringStatus: billingMeteringStatusSchema,
    meterItems: z.array(wireMeterItemSchema).max(128),
    tokens: wireTokenSummarySchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    const charged = parseUnsignedAtom(receipt.chargedCreditAtoms);
    const authorized = parseUnsignedAtom(receipt.authorizedMaxCreditAtoms);
    const delta = parseSignedAtom(receipt.accountDeltaCreditAtoms);
    if (charged === undefined || authorized === undefined || delta === undefined) {
      return;
    }
    if (charged > authorized) {
      context.addIssue({ code: 'custom', message: 'Charged atoms exceed authorized maximum' });
    }
    const expected = receipt.customerState === 'settled' ? -charged : 0n;
    if (delta !== expected) {
      context.addIssue({ code: 'custom', message: 'Account delta does not match terminal state' });
    }
    if (receipt.customerState !== 'settled' && charged !== 0n) {
      context.addIssue({ code: 'custom', message: 'Release and absorption receipts must charge zero atoms' });
    }
    if ((receipt.usageOccurredAt === null) !== (receipt.timingStatus === 'unavailable')) {
      context.addIssue({ code: 'custom', message: 'Unavailable range timing must remain null' });
    }
    if (receipt.meteringStatus !== receipt.tokens.status) {
      context.addIssue({ code: 'custom', message: 'Receipt and token metering status must match' });
    }
  });
export type WireBaseReceipt = z.infer<typeof wireBaseReceiptSchema>;

/** Immutable linked customer correction event. @public */
export const wireCorrectionReceiptSchema = z
  .object({
    ...identityEnvelope,
    kind: z.literal('correction'),
    transactionId: financialIdentitySchema,
    revision: positiveAtomIntegerStringSchema,
    operationId: financialIdentitySchema,
    baseTransactionId: financialIdentitySchema,
    model: historicalModelSchema,
    activity: wireUsageActivitySchema,
    usageOccurredAt: timestampSchema.nullable(),
    timingStatus: timingStatusSchema,
    correctedAt: timestampSchema,
    accountDeltaCreditAtoms: positiveAtomIntegerStringSchema,
    reason: z.literal('compensation'),
  })
  .strict()
  .superRefine((receipt, context) => {
    if ((receipt.usageOccurredAt === null) !== (receipt.timingStatus === 'unavailable')) {
      context.addIssue({ code: 'custom', message: 'Correction must inherit truthful base range timing' });
    }
  });
export type WireCorrectionReceipt = z.infer<typeof wireCorrectionReceiptSchema>;
export const wireUsageEventSchema = z.discriminatedUnion('kind', [wireBaseReceiptSchema, wireCorrectionReceiptSchema]);
export type WireUsageEvent = z.infer<typeof wireUsageEventSchema>;

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const sortedUnique = <T extends string>(values: readonly T[]): boolean =>
  values.every((value, i) => i === 0 || values[i - 1]! < value);
/** Canonical applied usage query echoed in every page. @public */
export const wireUsageQuerySchema = z
  .object({
    preset: z.enum(['last_30_days', 'custom', 'all_time']),
    fromDate: calendarDateSchema.nullable(),
    toDate: calendarDateSchema.nullable(),
    timeZone: z.string().min(1).max(128),
    models: z.array(financialIdentitySchema).max(32),
    activities: z.array(financialActivityKindSchema).max(32),
    projects: z.array(hintSchema).max(32),
  })
  .strict()
  .superRefine((query, context) => {
    if ((query.preset === 'all_time') !== (query.fromDate === null && query.toDate === null)) {
      context.addIssue({ code: 'custom', message: 'Only all-time queries omit calendar bounds' });
    }
    if (!sortedUnique(query.models) || !sortedUnique(query.activities) || !sortedUnique(query.projects)) {
      context.addIssue({ code: 'custom', message: 'Canonical filters must be sorted and unique' });
    }
  });
export type WireUsageQuery = z.infer<typeof wireUsageQuerySchema>;

export const wireUsageCoverageSchema = z
  .object({
    historyStart: timestampSchema.nullable(),
    legacyBefore: timestampSchema.nullable(),
    complete: z.boolean(),
    detailComplete: z.boolean(),
    excludedUnknownTimeCount: aggregateUnsignedIntegerStringSchema,
  })
  .strict();
export type WireUsageCoverage = z.infer<typeof wireUsageCoverageSchema>;
export const wireUsageAvailabilitySchema = z
  .object({
    state: z.enum(['available', 'partial', 'unavailable']),
    reason: z
      .enum([
        'legacy_coverage',
        'source_pending',
        'source_incomplete',
        'query_limit',
        'authority_unavailable',
        'revision_unavailable',
      ])
      .nullable(),
  })
  .strict()
  .superRefine((availability, context) => {
    if ((availability.state === 'available') !== (availability.reason === null)) {
      context.addIssue({ code: 'custom', message: 'Only available responses omit an availability reason' });
    }
  });
export type WireUsageAvailability = z.infer<typeof wireUsageAvailabilitySchema>;
const totalsShape = {
  accountDeltaCreditAtoms: aggregateSignedIntegerStringSchema,
  netUsedCreditAtoms: aggregateSignedIntegerStringSchema,
  eventCount: aggregateUnsignedIntegerStringSchema,
};
const validateTotals = (
  totals: { accountDeltaCreditAtoms: string; netUsedCreditAtoms: string },
  context: z.RefinementCtx,
): void => {
  const netUsed = parseBoundedInteger(totals.netUsedCreditAtoms, true, 78);
  const accountDelta = parseBoundedInteger(totals.accountDeltaCreditAtoms, true, 78);
  if (netUsed !== undefined && accountDelta !== undefined && netUsed !== -accountDelta) {
    context.addIssue({ code: 'custom', message: 'Net used atoms must negate the journal delta' });
  }
};
export const wireUsageTotalsSchema = z.object(totalsShape).strict().superRefine(validateTotals);
export type WireUsageTotals = z.infer<typeof wireUsageTotalsSchema>;
const cursorSchema = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+$/u)
  .nullable();
const page = <T extends z.ZodType>(item: T) =>
  z
    .object({ items: z.array(item).max(200), nextCursor: cursorSchema, complete: z.boolean() })
    .strict()
    .superRefine((value, context) => {
      if (value.complete !== (value.nextCursor === null)) {
        context.addIssue({ code: 'custom', message: 'Complete pages must have no continuation cursor' });
      }
    });
export const wireUsageRowsPageSchema = page(wireUsageEventSchema);
const groupedTotals = { ...totalsShape };
export const wireUsageDayPageSchema = page(
  z
    .object({ day: z.union([calendarDateSchema, z.literal('unknown')]), ...groupedTotals })
    .strict()
    .superRefine(validateTotals),
);
export const wireUsageModelPageSchema = page(
  z
    .object({
      modelId: financialIdentitySchema,
      modelDisplayName: z.string().min(1).max(128).nullable(),
      ...groupedTotals,
    })
    .strict()
    .superRefine(validateTotals),
);
export const wireUsageActivityPageSchema = page(
  z
    .object({ activity: financialActivityKindSchema, ...groupedTotals })
    .strict()
    .superRefine(validateTotals),
);
export type WireUsageRowsPage = z.infer<typeof wireUsageRowsPageSchema>;
export type WireUsageDayPage = z.infer<typeof wireUsageDayPageSchema>;
export type WireUsageModelPage = z.infer<typeof wireUsageModelPageSchema>;
export type WireUsageActivityPage = z.infer<typeof wireUsageActivityPageSchema>;

/** Snapshot envelope with independently pageable immutable collections. @public */
export const wireUsageSnapshotSchema = z
  .object({
    ...identityEnvelope,
    snapshotRevision: unsignedIntegerStringSchema,
    asOf: timestampSchema,
    query: wireUsageQuerySchema,
    coverage: wireUsageCoverageSchema,
    availability: wireUsageAvailabilitySchema,
    totals: wireUsageTotalsSchema.nullable(),
    rows: wireUsageRowsPageSchema.optional(),
    days: wireUsageDayPageSchema.optional(),
    models: wireUsageModelPageSchema.optional(),
    activities: wireUsageActivityPageSchema.optional(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if ((snapshot.availability.state === 'unavailable') !== (snapshot.totals === null)) {
      context.addIssue({ code: 'custom', message: 'Unavailable snapshots alone omit whole-range totals' });
    }
  });
export type WireUsageSnapshot = z.infer<typeof wireUsageSnapshotSchema>;

const operationEnvelope = {
  ...identityEnvelope,
  snapshotRevision: unsignedIntegerStringSchema,
  asOf: timestampSchema,
  operationId: financialIdentitySchema,
};
const correctionPageSchema = page(wireCorrectionReceiptSchema);
const terminalOperationReceiptSchema = z
  .object({
    ...operationEnvelope,
    state: z.literal('terminal'),
    receipt: wireBaseReceiptSchema,
    correctionTotalCreditAtoms: aggregateUnsignedIntegerStringSchema,
    corrections: correctionPageSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const identityMatches =
      value.environment === value.receipt.environment &&
      value.ownerId === value.receipt.ownerId &&
      value.subjectId === value.receipt.subjectId &&
      value.operationId === value.receipt.operationId;
    const correctionsMatch = value.corrections.items.every(
      (item) =>
        item.environment === value.environment &&
        item.ownerId === value.ownerId &&
        item.subjectId === value.subjectId &&
        item.operationId === value.operationId &&
        item.baseTransactionId === value.receipt.baseTransactionId &&
        BigInt(item.revision) <= BigInt(value.snapshotRevision),
    );
    if (
      !identityMatches ||
      !correctionsMatch ||
      BigInt(value.receipt.terminalRevision) > BigInt(value.snapshotRevision)
    ) {
      context.addIssue({ code: 'custom', message: 'Receipt events must match their operation snapshot identity' });
    }
  });
/** Owner-scoped operation status or immutable terminal receipt. @public */
export const wireOperationReceiptSchema = z.union([
  z
    .object({
      ...operationEnvelope,
      state: z.literal('pending'),
      admittedAt: timestampSchema,
      dispatchState: z.enum(['admitted', 'intent_recorded', 'accepted', 'recovery_required']),
      authorizedMaxCreditAtoms: unsignedIntegerStringSchema,
    })
    .strict(),
  terminalOperationReceiptSchema,
  z
    .object({
      ...operationEnvelope,
      state: z.literal('unavailable'),
      reason: z.enum(['authority_unavailable', 'revision_unavailable', 'not_found']),
    })
    .strict(),
]);
export type WireOperationReceipt = z.infer<typeof wireOperationReceiptSchema>;

const journalKindSchema = z.enum([
  'deferred_grant',
  'operation_resolution',
  'purchase_grant',
  'period_grant',
  'promotion_grant',
  'reversal',
  'compensation',
]);
const journalTotalSchema = z
  .object({ kind: journalKindSchema, ...totalsShape })
  .strict()
  .superRefine(validateTotals);
const historyItemSchema = z
  .object({
    transactionId: financialIdentitySchema,
    revision: positiveAtomIntegerStringSchema,
    kind: journalKindSchema,
    accountDeltaCreditAtoms: signedIntegerStringSchema,
    occurredAt: timestampSchema,
  })
  .strict();
/** Current all-category balance plus finite journal explanation. @public */
const availableBalanceExplanationSchema = z
  .object({
    ...identityEnvelope,
    snapshotRevision: unsignedIntegerStringSchema,
    asOf: timestampSchema,
    availability: z.object({ state: z.literal('available'), reason: z.null() }).strict(),
    balance: wireCreditBalanceSchema,
    journalTotals: z
      .object({
        accountDeltaCreditAtoms: aggregateSignedIntegerStringSchema,
        byKind: z.array(journalTotalSchema).max(16),
      })
      .strict(),
    history: page(historyItemSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.environment !== value.balance.environment ||
      value.subjectId !== value.balance.subjectId ||
      value.snapshotRevision !== value.balance.revision ||
      value.asOf !== value.balance.asOf
    ) {
      context.addIssue({ code: 'custom', message: 'Balance must match its explanation snapshot identity' });
    }
    const kinds = value.journalTotals.byKind.map(({ kind }) => kind);
    if (new Set(kinds).size !== kinds.length) {
      context.addIssue({ code: 'custom', message: 'Balance journal categories must be unique' });
    }
    const declared = parseBoundedInteger(value.journalTotals.accountDeltaCreditAtoms, true, 78);
    const parts = value.journalTotals.byKind.map(({ accountDeltaCreditAtoms }) =>
      parseBoundedInteger(accountDeltaCreditAtoms, true, 78),
    );
    if (
      declared !== undefined &&
      parts.every((part) => part !== undefined) &&
      parts.reduce<bigint>((sum, part) => sum + part, 0n) !== declared
    ) {
      context.addIssue({ code: 'custom', message: 'Balance journal categories must sum to the declared total' });
    }
  });
const unavailableBalanceExplanationSchema = z
  .object({
    ...identityEnvelope,
    snapshotRevision: unsignedIntegerStringSchema,
    asOf: timestampSchema,
    availability: z
      .object({ state: z.literal('unavailable'), reason: z.enum(['authority_unavailable', 'revision_unavailable']) })
      .strict(),
    balance: z.null(),
    journalTotals: z.null(),
    history: z.null(),
  })
  .strict();
export const wireBalanceExplanationSchema = z.union([
  availableBalanceExplanationSchema,
  unavailableBalanceExplanationSchema,
]);
export type WireBalanceExplanation = z.infer<typeof wireBalanceExplanationSchema>;
