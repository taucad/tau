import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { classifyLogRow, parseLogEvent, projectionEffectSchemas } from '#log/event-schema.js';
import { projectLogRow, projectionFactSchema } from '#log/projection-facts.js';
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
