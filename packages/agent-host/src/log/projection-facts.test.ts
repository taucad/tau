import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { classifyLogRow, parseLogEvent, projectionEffectSchemas } from '#log/event-schema.js';
import { projectLogRow, projectionBatchSchema, projectionFactSchema } from '#log/projection-facts.js';
import { parseEventLogBytes } from '#log/serialization.js';

const envelope = { version: 1, leaderEpoch: 'e', sequence: 0, recordedAt: 'now', runId: 'r' };
const message = { id: 'm', role: 'user', content: 'hello' };
const context = { version: 1, systemPrompt: 'system', initialMessages: [], postCompactionMessages: [] };
const bodies = [
  { type: 'message.appended', message },
  { type: 'message.envelope-replaced', messageId: 'm', replacement: message },
  { type: 'history.compacted', evictedMessageIds: ['old'], summary: message },
  { type: 'history.rewound', trigger: 'retry', retainedMessageIds: ['old'] },
  { type: 'snapshot-context.refreshed', messageId: 'm', content: { heavy: ['omitted'] } },
  { type: 'safeguard.recorded', safeguardId: 's', action: 'nudge', reason: 'why', message },
  { type: 'safeguard.recorded', safeguardId: 's', action: 'terminate', reason: 'why' },
  { type: 'interrupt.recorded', interruptId: 'i', phase: 'requested', reason: 'why', payload: { x: 1 } },
  { type: 'turn.changed', turnId: 't', chatId: 'c', attempt: 1, checkoutId: 'co' },
  {
    type: 'turn.finalized',
    turnId: 't',
    chatId: 'c',
    projectId: 'p',
    changedPaths: [],
    trigger: 'turn',
    runIds: ['r'],
  },
  { type: 'turn.conflicted', turnId: 't', chatId: 'c' },
  { type: 'turn.failed', turnId: 't', chatId: 'c', reason: 'why' },
  { type: 'model.invocation-prepared', attemptId: 'a', purpose: 'generation', modelId: 'm' },
  { type: 'model.invocation-bound', attemptId: 'a', operationId: 'o', status: 'pending' },
  { type: 'model.invocation-settled', attemptId: 'a', outcome: 'settled', operationId: 'o', chargedCreditAtoms: '0' },
  { type: 'model.invocation-settled', attemptId: 'a', outcome: 'voided' },
  { type: 'run.lifecycle', state: 'running' },
  { type: 'turn.history-projection-committed', retainedMessageIds: ['old'], message, context },
];
const previousEffectUnion = z.union(projectionEffectSchemas);

// Keep the pre-dispatch union as a differential oracle: selected validators must produce identical compact data.
describe('owned compact fact mapping', () => {
  it.each(bodies)('classifies parser-owned JSON identically to the generic reader for $type', (body) => {
    const value = { ...envelope, ...body, extra: { retained: true } };
    const classified = classifyLogRow(value);
    expect(classified.class).toBe('known');
    if (classified.class !== 'known') {
      throw new Error('Expected a known vocabulary fixture');
    }
    const parsed = parseEventLogBytes(new TextEncoder().encode(JSON.stringify(value) + '\n'));
    expect(parsed.rows).toEqual([{ event: classified.event, opaque: false }]);
    expect(parsed.quarantined).toEqual([]);
  });

  it.each(bodies)('preserves the previous union result for $type', (body) => {
    const classified = classifyLogRow({ ...envelope, ...body });
    expect(classified.class).toBe('known');
    if (classified.class !== 'known') {
      throw new Error('Expected a known vocabulary fixture');
    }
    const fact = projectLogRow({ event: classified.event, opaque: false });
    expect(fact.classification).toBe('known');
    if (fact.classification !== 'known') {
      throw new Error('Expected a known projection');
    }
    // Lifecycle normalization explicitly adds optional keys before the old union too.
    const input =
      body.type === 'run.lifecycle'
        ? { ...classified.event, admission: undefined, rewind: undefined, stopReason: undefined }
        : classified.event;
    expect(fact.effect).toEqual(previousEffectUnion.parse(input));
    expect(projectionFactSchema.parse(fact)).toEqual(fact);
    expect(
      projectionFactSchema.safeParse({ ...fact, effect: { ...fact.effect, unexpected: 'execution data' } }).success,
    ).toBe(false);
  });

  it.each([
    { type: 'message.envelope-replaced', messageId: 'm', replacement: message },
    { type: 'history.compacted', evictedMessageIds: ['old'], summary: message },
  ])('keeps canonical anchor normalization and refuses reshaping a compact $type anchor', (body) => {
    const details = {
      lane: 'start_of_turn',
      tier: 'summarization',
      tokensBefore: 10,
      tokensAfter: 5,
      cleared: 0,
      evicted: 1,
      summarizerAttempts: 1,
      summarizerUsage: null,
      futureDetail: 'carried',
      anchor: { messageId: 'm', tokens: 1, futureAnchor: 'stripped by canonical reader' },
    };
    const classified = classifyLogRow({ ...envelope, ...body, details });
    expect(classified.class).toBe('known');
    if (classified.class !== 'known') {
      throw new Error('Expected a known compaction row');
    }
    const fact = projectLogRow({ event: classified.event, opaque: false });
    expect(fact).toMatchObject({
      effect: { details: { futureDetail: 'carried', anchor: { messageId: 'm', tokens: 1 } } },
    });
    expect(projectionFactSchema.parse(fact)).toEqual(fact);
    if (fact.classification !== 'known') {
      throw new Error('Expected a known compaction fact');
    }
    expect(projectionFactSchema.safeParse({ ...fact, effect: { ...fact.effect, details } }).success).toBe(false);
  });

  it('covers every declared effect variant, including repeated type variants', () => {
    expect(bodies.map((body) => body.type)).toEqual(projectionEffectSchemas.map((schema) => schema.shape.type.value));
  });

  it.each([
    {
      admission: { kind: 'tau', turnId: 'm', message, rewind: { retainedMessageIds: ['old'] } },
      user: true,
      rewind: true,
    },
    {
      admission: { kind: 'future', turnId: 'm', message, rewind: { retainedMessageIds: ['old'] } },
      user: false,
      rewind: true,
    },
    {
      admission: { kind: 'external', turnId: 'wrong', message, rewind: { retainedMessageIds: ['old'] } },
      user: false,
      rewind: true,
    },
    {
      admission: { kind: 'external', turnId: 'm', message, rewind: { retainedMessageIds: [42] } },
      user: true,
      rewind: false,
    },
  ])('keeps user and rewind independently for $admission', ({ admission, user, rewind }) => {
    const event = parseLogEvent({ ...envelope, type: 'run.lifecycle', state: 'admitted', admission });
    const fact = projectLogRow({ event, opaque: false });
    const expected = previousEffectUnion.parse({
      ...event,
      admission: user ? { kind: admission.kind, turnId: 'm', message } : undefined,
      rewind: rewind ? { retainedMessageIds: ['old'] } : undefined,
      stopReason: undefined,
    });
    expect(fact.classification).toBe('known');
    if (fact.classification !== 'known') {
      throw new Error('Expected a known admitted projection');
    }
    expect(fact.effect).toEqual(expected);
    expect(projectionFactSchema.parse(fact)).toEqual(fact);
  });

  it.each([
    { type: 'model.invocation-settled', outcome: 'future', attemptId: 'a' },
    { type: 'safeguard.recorded', action: 'future', safeguardId: 's', reason: 'why' },
    { type: 'message.appended', message: { ...message, content: Number.POSITIVE_INFINITY } },
    { type: 'future.event', payload: 'untouched' },
  ])('preserves opaque classification and rejects a falsely known $type', (body) => {
    const classified = classifyLogRow({ ...envelope, ...body });
    expect(classified.class).toBe('opaque');
    if (classified.class !== 'opaque') {
      throw new Error('Expected an opaque misuse fixture');
    }
    const fact = projectLogRow({ event: classified.event, opaque: true });
    expect(fact).toMatchObject({ classification: 'opaque', eventType: body.type });
    expect(previousEffectUnion.safeParse(classified.event).success).toBe(false);
    expect(() => projectLogRow({ event: classified.event, opaque: false })).toThrow(z.ZodError);
  });
});

// The transport contract is strict ordinary-data equivalence, not identical Zod issue trees.
const previousStrictEffectUnion = z.union(projectionEffectSchemas.map((schema) => schema.strict()));
const strictEffects = [
  ...bodies.map((body) => previousEffectUnion.parse(body)),
  ...['released', 'absorbed'].map((outcome) => ({
    type: 'model.invocation-settled',
    attemptId: 'a',
    outcome,
    operationId: 'o',
    chargedCreditAtoms: '0',
  })),
  ...['admitted', 'paused', 'completed', 'failed', 'cancelled'].map((state) => ({ type: 'run.lifecycle', state })),
  { type: 'interrupt.recorded', interruptId: 'i', phase: 'resolved', reason: 'why' },
  ...['edit', 'regenerate'].map((trigger) => ({ type: 'history.rewound', trigger, retainedMessageIds: ['m'] })),
];
const strictFact = (effect: unknown) => ({ classification: 'known', row: { ...envelope, attempt: 1 }, effect });
const expectStrictParity = (effect: unknown): void => {
  const expected = previousStrictEffectUnion.safeParse(effect);
  const actual = projectionFactSchema.safeParse(strictFact(effect));
  expect(actual.success).toBe(expected.success);
  if (expected.success && actual.success) {
    expect(actual.data).toEqual(strictFact(expected.data));
  }
};

describe('strict compact effect transport', () => {
  it.each(strictEffects)('should preserve strict accepted data for $type', (effect) => {
    expect(previousStrictEffectUnion.safeParse(effect).success).toBe(true);
    expectStrictParity(effect);
    // Exercise JSON transport normalization (including omitted undefined), not an in-memory clone.
    const serialized = JSON.stringify(effect);
    const wireEffect: unknown = JSON.parse(serialized);
    expectStrictParity(wireEffect);
  });

  it.each(strictEffects)('should preserve field omission and strict extra rejection for $type', (effect) => {
    for (const key of Object.keys(effect)) {
      const omitted = Object.fromEntries(Object.entries(effect).filter(([name]) => name !== key));
      expectStrictParity(omitted);
    }
    const extra = { ...effect, futureField: { value: true } };
    expect(previousStrictEffectUnion.safeParse(extra).success).toBe(false);
    expectStrictParity(extra);
  });

  it.each([
    null,
    [],
    'message.appended',
    {},
    { type: null },
    { type: 42 },
    { type: 'future.event' },
    { type: 'safeguard.recorded', safeguardId: 's', reason: 'why' },
    { type: 'safeguard.recorded', safeguardId: 's', reason: 'why', action: 'future' },
    { type: 'safeguard.recorded', safeguardId: 's', reason: 'why', action: 'terminate', message },
    { type: 'model.invocation-settled', attemptId: 'a' },
    { type: 'model.invocation-settled', attemptId: 'a', outcome: 'future' },
    { type: 'model.invocation-settled', attemptId: 'a', outcome: 'voided', operationId: 'o', chargedCreditAtoms: '0' },
    {
      type: 'model.invocation-settled',
      attemptId: 'a',
      outcome: 'settled',
      operationId: 'o',
      chargedCreditAtoms: '-1',
    },
    { type: 'message.appended', message: { ...message, content: { nested: Number.POSITIVE_INFINITY } } },
    { type: 'message.appended', message: { ...message, role: 'future' } },
    { type: 'run.lifecycle', state: 'admitted', admission: { kind: 'tau', turnId: 'wrong', message } },
    { type: 'run.lifecycle', state: 'admitted', rewind: { retainedMessageIds: [1] } },
    { type: 'run.lifecycle', state: 'future' },
    { type: 'interrupt.recorded', interruptId: 'i', phase: 'future', reason: 'why' },
  ])('should preserve rejection of malformed ordinary effect %j', (effect) => {
    expect(previousStrictEffectUnion.safeParse(effect).success).toBe(false);
    expectStrictParity(effect);
  });

  it('should preserve physical attempt and opaque history refinements', () => {
    const effect = { type: 'turn.changed', turnId: 't', chatId: 'c', attempt: 2, checkoutId: 'co' };
    expect(previousStrictEffectUnion.safeParse(effect).success).toBe(true);
    expect(projectionFactSchema.safeParse(strictFact(effect)).success).toBe(false);
    expect(projectionFactSchema.safeParse({ ...strictFact(effect), row: { ...envelope, attempt: 2 } }).success).toBe(
      true,
    );
    expect(
      projectionFactSchema.safeParse({
        classification: 'opaque',
        row: envelope,
        eventType: 'message.appended',
        affectsHistory: false,
      }).success,
    ).toBe(false);
  });

  it('should reject a whole page with a malformed fact and retain strict page boundaries', () => {
    const fact = strictFact({ type: 'message.appended', message });
    const page = {
      status: 'batch',
      chatId: 'c',
      cursor: 0,
      nextCursor: 16,
      endCursor: 16,
      sourceGeneration: 'g',
      facts: Array.from({ length: 16 }, () => fact),
    };
    expect(projectionBatchSchema.parse(page)).toEqual(page);
    const malformed = { ...page, facts: [...page.facts.slice(0, 15), strictFact({ type: 'future.event' })] };
    const before = structuredClone(malformed);
    expect(projectionBatchSchema.safeParse(malformed).success).toBe(false);
    expect(malformed).toEqual(before);
    expect(projectionBatchSchema.safeParse({ ...page, nextCursor: 15 }).success).toBe(false);
    expect(projectionBatchSchema.safeParse({ ...page, endCursor: 15 }).success).toBe(false);
    expect(
      projectionBatchSchema.safeParse({ ...page, nextCursor: 17, endCursor: 17, facts: [...page.facts, fact] }).success,
    ).toBe(false);
    expect(projectionBatchSchema.safeParse({ ...page, futureField: true }).success).toBe(false);
    expect(projectionFactSchema.safeParse({ ...fact, futureField: true }).success).toBe(false);
    expect(projectionFactSchema.safeParse({ ...fact, row: { ...fact.row, futureField: true } }).success).toBe(false);
  });
});
