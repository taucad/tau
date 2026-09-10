import { describe, expect, it } from 'vitest';
import {
  aggregateSignedIntegerStringSchema,
  aggregateUnsignedIntegerStringSchema,
  billingExecutionStatusSchema,
  billingMeteringStatusSchema,
  contributionUnsignedIntegerStringSchema,
  financialActivityKindSchema,
  financialEnvironmentSchema,
  parseSignedIntegerString,
  signedIntegerStringSchema,
  unsignedIntegerStringSchema,
  wireBalanceExplanationSchema,
  wireBaseReceiptSchema,
  wireCorrectionReceiptSchema,
  wireCreditBalanceSchema,
  wireMeterItemSchema,
  wireOperationReceiptSchema,
  wireTokenSummarySchema,
  wireUsageQuerySchema,
  wireUsageSnapshotSchema,
} from '#financial-wire.js';

const identity = { schemaVersion: 1, environment: 'development', ownerId: 'owner-1', subjectId: 'subject-1' };
const activity = { kind: 'agent', projectHint: null, chatHint: null, parentAttemptKey: null };
const model = { id: 'model-1', displayName: null, providerId: null };
const tokens = {
  status: 'complete',
  uncachedInput: '1',
  cacheRead: '0',
  cacheWrite: '0',
  inputTotal: '1',
  output: '2',
  reasoning: '1',
};
const baseReceipt = {
  ...identity,
  kind: 'base',
  operationId: 'operation-1',
  baseTransactionId: 'transaction-1',
  terminalRevision: '2',
  policyVersion: 'policy-1',
  activationId: 'activation-1',
  meterContractId: 'meter-1',
  category: 'llm',
  model,
  activity,
  historyVersion: 1,
  admittedAt: '2026-09-05T00:00:00.000Z',
  dispatchIntentAt: '2026-09-05T00:00:01.000Z',
  usageOccurredAt: '2026-09-05T00:00:01.000Z',
  evidenceOccurredAt: '2026-09-05T00:00:02.000Z',
  timingStatus: 'dispatch_intent',
  resolvedAt: '2026-09-05T00:00:03.000Z',
  executionStatus: 'succeeded',
  customerState: 'settled',
  authorizedMaxCreditAtoms: '1',
  chargedCreditAtoms: '1',
  accountDeltaCreditAtoms: '-1',
  meteringStatus: 'complete',
  meterItems: [
    {
      dimension: 'uncached_input',
      kind: 'tokens',
      tier: undefined,
      quantity: '10000000000000000000',
      unit: 'token',
      rate: { rateId: 'rate-1', numeratorCreditAtoms: '1', denominatorUnits: '10000000000000000000' },
      exactContribution: { numeratorCreditAtoms: '10000000000000000000', denominator: '10000000000000000000' },
    },
  ],
  tokens,
};
const query = {
  preset: 'last_30_days',
  fromDate: '2026-08-07',
  toDate: '2026-09-06',
  timeZone: 'Pacific/Auckland',
  models: [],
  activities: [],
  projects: [],
};
const totals = { accountDeltaCreditAtoms: '-1', netUsedCreditAtoms: '1', eventCount: '1' };

const balance = {
  schemaVersion: 1,
  environment: 'development',
  subjectId: 'subject-1',
  revision: '1',
  asOf: '2026-09-05T00:00:00.000Z',
  promoGrantCreditAtoms: '10',
  planGrantCreditAtoms: '20',
  purchasedCreditAtoms: '30',
  debtCreditAtoms: '0',
  promoHeldCreditAtoms: '1',
  planHeldCreditAtoms: '2',
  purchasedHeldCreditAtoms: '3',
  pendingIssuanceCreditAtoms: '0',
  eligibleAvailableCreditAtoms: '54',
  netBalanceCreditAtoms: '60',
};

describe('financial integer wires', () => {
  it.each(['0', '1', '-1', '9223372036854775807', '-9223372036854775808'])('accepts signed64 %s', (value) => {
    expect(signedIntegerStringSchema.parse(value)).toBe(value);
  });

  it.each(['', ' 1', '01', '-0', '+1', '1.0', '1e3', '9223372036854775808', '-9223372036854775809'])(
    'rejects malformed or overflowing signed64 %s',
    (value) => {
      expect(signedIntegerStringSchema.safeParse(value).success).toBe(false);
    },
  );

  it('separates row widths from bounded history aggregates', () => {
    const max78 = '9'.repeat(78);
    expect(aggregateSignedIntegerStringSchema.parse(`-${max78}`)).toBe(`-${max78}`);
    expect(aggregateUnsignedIntegerStringSchema.parse(max78)).toBe(max78);
    expect(contributionUnsignedIntegerStringSchema.parse('9'.repeat(156))).toHaveLength(156);
    expect(aggregateSignedIntegerStringSchema.safeParse('9'.repeat(79)).success).toBe(false);
    expect(aggregateUnsignedIntegerStringSchema.safeParse('-1').success).toBe(false);
    expect(() => aggregateUnsignedIntegerStringSchema.safeParse('9'.repeat(100_000))).not.toThrow();
    expect(parseSignedIntegerString('9007199254740993')).toBe(9_007_199_254_740_993n);
    expect(unsignedIntegerStringSchema.safeParse('-1').success).toBe(false);
  });

  it('exports the closed environment, activity, execution, and metering vocabularies', () => {
    expect(financialEnvironmentSchema.options).toEqual(['development', 'staging', 'prod-us', 'prod-eu']);
    expect(financialActivityKindSchema.options).toEqual([
      'agent',
      'compaction',
      'summary',
      'title',
      'commit',
      'completion',
      'other',
    ]);
    expect(billingExecutionStatusSchema.options).toEqual(['succeeded', 'cancelled', 'failed', 'rejected', 'unknown']);
    expect(billingMeteringStatusSchema.options).toEqual(['complete', 'partial', 'unavailable']);
  });
});

describe('financial receipt and account wires', () => {
  it('enforces the account equations and pending issuance bound', () => {
    expect(wireCreditBalanceSchema.parse(balance)).toEqual(balance);
    expect(wireCreditBalanceSchema.safeParse({ ...balance, revision: '0' }).success).toBe(true);
    expect(wireCreditBalanceSchema.safeParse({ ...balance, promoHeldCreditAtoms: '11' }).success).toBe(false);
    expect(wireCreditBalanceSchema.safeParse({ ...balance, eligibleAvailableCreditAtoms: '55' }).success).toBe(false);
    expect(
      wireCreditBalanceSchema.safeParse({
        ...balance,
        debtCreditAtoms: '5',
        eligibleAvailableCreditAtoms: '1',
        netBalanceCreditAtoms: '55',
      }).success,
    ).toBe(false);
    expect(() => wireCreditBalanceSchema.safeParse({ ...balance, promoGrantCreditAtoms: 'abc' })).not.toThrow();
  });

  it('keeps huge meter quantities exact and unknown distinct from measured zero', () => {
    expect(wireMeterItemSchema.parse(baseReceipt.meterItems[0])).toEqual(baseReceipt.meterItems[0]);
    expect(
      wireMeterItemSchema.safeParse({
        ...baseReceipt.meterItems[0],
        exactContribution: { numeratorCreditAtoms: '1', denominator: '1' },
      }).success,
    ).toBe(true);
    expect(
      wireMeterItemSchema.safeParse({
        ...baseReceipt.meterItems[0],
        exactContribution: { numeratorCreditAtoms: '2', denominator: '1' },
      }).success,
    ).toBe(false);
    expect(() => wireMeterItemSchema.safeParse({ ...baseReceipt.meterItems[0], quantity: 'abc' })).not.toThrow();
    const unknown = { ...baseReceipt.meterItems[0], quantity: null, exactContribution: null };
    expect(wireMeterItemSchema.parse(unknown)).toEqual(unknown);
    expect(
      wireMeterItemSchema.safeParse({ ...unknown, exactContribution: { numeratorCreditAtoms: '0', denominator: '1' } })
        .success,
    ).toBe(false);
    expect(
      wireTokenSummarySchema.parse({
        status: 'unavailable',
        uncachedInput: null,
        cacheRead: null,
        cacheWrite: null,
        inputTotal: null,
        output: null,
      }),
    ).toBeTruthy();
    expect(wireTokenSummarySchema.safeParse({ ...tokens, status: 'unavailable' }).success).toBe(false);
    expect(
      wireTokenSummarySchema.safeParse({
        status: 'partial',
        uncachedInput: null,
        cacheRead: null,
        cacheWrite: null,
        inputTotal: null,
        output: null,
      }).success,
    ).toBe(false);
    expect(wireTokenSummarySchema.safeParse({ ...tokens, inputTotal: '2' }).success).toBe(false);
    expect(() => wireTokenSummarySchema.safeParse({ ...tokens, inputTotal: 'abc' })).not.toThrow();
    const quantity78 = '9'.repeat(78);
    const sum79 = (BigInt(quantity78) * 2n).toString();
    expect(
      wireTokenSummarySchema.safeParse({
        ...tokens,
        uncachedInput: quantity78,
        cacheRead: quantity78,
        cacheWrite: '0',
        inputTotal: sum79,
      }).success,
    ).toBe(true);
    expect(
      wireTokenSummarySchema.safeParse({
        ...tokens,
        uncachedInput: '9'.repeat(81),
        cacheRead: '0',
        cacheWrite: '0',
        inputTotal: '9'.repeat(81),
      }).success,
    ).toBe(true);
    expect(wireTokenSummarySchema.safeParse({ ...tokens, output: '9'.repeat(82) }).success).toBe(false);
    expect(wireTokenSummarySchema.safeParse({ ...tokens, reasoning: '3' }).success).toBe(false);
    expect(
      wireTokenSummarySchema.safeParse({ ...tokens, status: 'partial', output: null, reasoning: null }).success,
    ).toBe(true);
  });

  it('serializes a multi-rate-ready base without a singular rateId', () => {
    expect(wireBaseReceiptSchema.parse(baseReceipt)).toEqual(baseReceipt);
    expect('rateId' in wireBaseReceiptSchema.parse(baseReceipt)).toBe(false);
    expect(
      wireBaseReceiptSchema.safeParse({ ...baseReceipt, chargedCreditAtoms: '2', accountDeltaCreditAtoms: '-2' })
        .success,
    ).toBe(false);
    expect(
      wireBaseReceiptSchema.safeParse({
        ...baseReceipt,
        customerState: 'absorbed',
        chargedCreditAtoms: '0',
        accountDeltaCreditAtoms: '0',
        meteringStatus: 'partial',
        tokens: { ...tokens, status: 'partial', output: null, reasoning: null },
      }).success,
    ).toBe(true);
    expect(wireBaseReceiptSchema.safeParse({ ...baseReceipt, usageOccurredAt: null }).success).toBe(false);
  });

  it('keeps corrections as independently pageable immutable events', () => {
    const correction = {
      ...identity,
      kind: 'correction',
      transactionId: 'correction-1',
      revision: '3',
      operationId: baseReceipt.operationId,
      baseTransactionId: baseReceipt.baseTransactionId,
      model,
      activity,
      usageOccurredAt: baseReceipt.usageOccurredAt,
      timingStatus: baseReceipt.timingStatus,
      correctedAt: '2026-09-05T00:00:04.000Z',
      accountDeltaCreditAtoms: '1',
      reason: 'compensation',
    };
    expect(wireCorrectionReceiptSchema.parse(correction)).toEqual(correction);
    expect(wireCorrectionReceiptSchema.safeParse({ ...correction, accountDeltaCreditAtoms: '0' }).success).toBe(false);
    expect(wireCorrectionReceiptSchema.safeParse({ ...correction, accountDeltaCreditAtoms: '-1' }).success).toBe(false);
    expect(
      wireOperationReceiptSchema.parse({
        ...identity,
        state: 'terminal',
        snapshotRevision: '3',
        asOf: correction.correctedAt,
        operationId: baseReceipt.operationId,
        receipt: baseReceipt,
        correctionTotalCreditAtoms: '1',
        corrections: { items: [correction], nextCursor: null, complete: true },
      }),
    ).toBeTruthy();
    expect(
      wireOperationReceiptSchema.safeParse({
        ...identity,
        state: 'terminal',
        snapshotRevision: '3',
        asOf: correction.correctedAt,
        operationId: baseReceipt.operationId,
        receipt: baseReceipt,
        correctionTotalCreditAtoms: '-1',
        corrections: { items: [correction], nextCursor: null, complete: true },
      }).success,
    ).toBe(false);
    expect(
      wireOperationReceiptSchema.safeParse({
        ...identity,
        state: 'terminal',
        snapshotRevision: '3',
        asOf: correction.correctedAt,
        operationId: 'another-operation',
        receipt: baseReceipt,
        correctionTotalCreditAtoms: '1',
        corrections: { items: [correction], nextCursor: null, complete: true },
      }).success,
    ).toBe(false);
    expect(
      wireOperationReceiptSchema.safeParse({
        ...identity,
        state: 'terminal',
        snapshotRevision: '1',
        asOf: correction.correctedAt,
        operationId: baseReceipt.operationId,
        receipt: baseReceipt,
        correctionTotalCreditAtoms: '1',
        corrections: { items: [correction], nextCursor: null, complete: true },
      }).success,
    ).toBe(false);
    expect(
      wireOperationReceiptSchema.parse({
        ...identity,
        state: 'unavailable',
        snapshotRevision: '3',
        asOf: correction.correctedAt,
        operationId: baseReceipt.operationId,
        reason: 'not_found',
      }),
    ).toBeTruthy();
  });
});

describe('usage snapshot wires', () => {
  it('requires canonical filters and complete scalar totals independent of pages', () => {
    expect(wireUsageQuerySchema.parse(query)).toEqual(query);
    expect(wireUsageQuerySchema.safeParse({ ...query, models: ['z', 'a'] }).success).toBe(false);
    const snapshot = {
      ...identity,
      snapshotRevision: '2',
      asOf: '2026-09-05T00:00:04.000Z',
      query,
      coverage: {
        historyStart: baseReceipt.usageOccurredAt,
        legacyBefore: null,
        complete: true,
        detailComplete: true,
        excludedUnknownTimeCount: '0',
      },
      availability: { state: 'available', reason: null },
      totals,
      rows: { items: [baseReceipt], nextCursor: 'rows_cursor', complete: false },
      days: { items: [{ day: '2026-09-05', ...totals }], nextCursor: null, complete: true },
      models: { items: [{ modelId: model.id, modelDisplayName: null, ...totals }], nextCursor: null, complete: true },
      activities: { items: [{ activity: 'agent', ...totals }], nextCursor: null, complete: true },
    };
    expect(wireUsageSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    const continuation = {
      ...snapshot,
      rows: undefined,
      days: undefined,
      models: { items: [], nextCursor: null, complete: true },
      activities: undefined,
    };
    expect(wireUsageSnapshotSchema.parse(continuation)).toEqual(continuation);
    expect(
      wireUsageSnapshotSchema.safeParse({ ...snapshot, rows: { ...snapshot.rows, nextCursor: null, complete: false } })
        .success,
    ).toBe(false);
    expect(
      wireUsageSnapshotSchema.safeParse({ ...snapshot, totals: { ...totals, netUsedCreditAtoms: '-1' } }).success,
    ).toBe(false);
    expect(
      wireUsageSnapshotSchema.safeParse({
        ...snapshot,
        days: { items: [{ day: '2026-09-05', ...totals, netUsedCreditAtoms: '-1' }], nextCursor: null, complete: true },
      }).success,
    ).toBe(false);
    expect(
      wireUsageSnapshotSchema.safeParse({
        ...snapshot,
        availability: { state: 'unavailable', reason: 'revision_unavailable' },
        totals,
      }).success,
    ).toBe(false);
    expect(
      wireUsageSnapshotSchema.parse({
        ...snapshot,
        availability: { state: 'unavailable', reason: 'revision_unavailable' },
        totals: null,
        rows: undefined,
        days: undefined,
        models: undefined,
        activities: undefined,
      }),
    ).toBeTruthy();
    expect(
      wireUsageSnapshotSchema.parse({ ...snapshot, availability: { state: 'partial', reason: 'source_incomplete' } }),
    ).toBeTruthy();
  });

  it('supports an exact revision-zero unfunded balance explanation', () => {
    const empty = {
      ...balance,
      subjectId: 'unfunded:abc',
      revision: '0',
      promoGrantCreditAtoms: '0',
      planGrantCreditAtoms: '0',
      purchasedCreditAtoms: '0',
      promoHeldCreditAtoms: '0',
      planHeldCreditAtoms: '0',
      purchasedHeldCreditAtoms: '0',
      eligibleAvailableCreditAtoms: '0',
      netBalanceCreditAtoms: '0',
    };
    expect(
      wireBalanceExplanationSchema.parse({
        ...identity,
        subjectId: empty.subjectId,
        snapshotRevision: '0',
        asOf: empty.asOf,
        availability: { state: 'available', reason: null },
        balance: empty,
        journalTotals: { accountDeltaCreditAtoms: '0', byKind: [] },
        history: { items: [], nextCursor: null, complete: true },
      }),
    ).toBeTruthy();
    expect(
      wireBalanceExplanationSchema.safeParse({
        ...identity,
        subjectId: empty.subjectId,
        snapshotRevision: '0',
        asOf: empty.asOf,
        availability: { state: 'available', reason: null },
        balance: empty,
        journalTotals: { accountDeltaCreditAtoms: '1', byKind: [] },
        history: { items: [], nextCursor: null, complete: true },
      }).success,
    ).toBe(false);
    expect(() =>
      wireBalanceExplanationSchema.safeParse({
        ...identity,
        subjectId: empty.subjectId,
        snapshotRevision: '0',
        asOf: empty.asOf,
        availability: { state: 'available', reason: null },
        balance: empty,
        journalTotals: {
          accountDeltaCreditAtoms: 'abc',
          byKind: [
            { kind: 'compensation', accountDeltaCreditAtoms: 'abc', netUsedCreditAtoms: 'abc', eventCount: '1' },
          ],
        },
        history: { items: [], nextCursor: null, complete: true },
      }),
    ).not.toThrow();
    expect(
      wireBalanceExplanationSchema.safeParse({
        ...identity,
        subjectId: empty.subjectId,
        snapshotRevision: '1',
        asOf: empty.asOf,
        availability: { state: 'available', reason: null },
        balance: empty,
        journalTotals: { accountDeltaCreditAtoms: '0', byKind: [] },
        history: { items: [], nextCursor: null, complete: true },
      }).success,
    ).toBe(false);
    expect(
      wireBalanceExplanationSchema.parse({
        ...identity,
        subjectId: empty.subjectId,
        snapshotRevision: '0',
        asOf: empty.asOf,
        availability: { state: 'unavailable', reason: 'authority_unavailable' },
        balance: null,
        journalTotals: null,
        history: null,
      }),
    ).toBeTruthy();
  });
});
