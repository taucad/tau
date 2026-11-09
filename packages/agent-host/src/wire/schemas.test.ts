import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as wire from '#wire/index.js';

const schemas = Object.entries(wire as Record<string, unknown>).filter(
  (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
);

describe('the wire module (SC-R1, SC-R2)', () => {
  it('should export at least the command, read and answer schemas', () => {
    expect(schemas.map(([name]) => name)).toEqual(
      expect.arrayContaining(['commandAnswerSchema', 'readRequestSchema', 'readAnswerSchema', 'agentWireHelloSchema']),
    );
  });

  it.each(schemas)('should convert %s to JSON Schema with unrepresentable throw', (_name, schema) => {
    expect(() => z.toJSONSchema(schema, { unrepresentable: 'throw' })).not.toThrow();
  });

  it.each(schemas)('should not reshape %s: its input and output JSON Schemas are equal', (_name, schema) => {
    // A `.default`, `.prefault`, `.catch` or transform makes what is accepted differ from what is produced.
    expect(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'throw' })).toEqual(
      z.toJSONSchema(schema, { io: 'output', unrepresentable: 'throw' }),
    );
  });

  it.each(Object.entries(wire.commandPayloads))('should give the %s payload no type field', (_verb, schema) => {
    expect(Object.keys(z.toJSONSchema(schema).properties ?? {})).not.toContain('type');
  });

  it('should refuse a rewinding start without its retained prefix, and a submit with one', () => {
    const base = { chatId: 'c', runId: 'r', message: { id: 'm', role: 'user', content: 'hi' } };
    expect(wire.commandPayloads.start.safeParse({ ...base, trigger: 'edit' }).success).toBe(false);
    expect(wire.commandPayloads.start.safeParse({ ...base, trigger: 'submit', retainedMessageIds: [] }).success).toBe(
      false,
    );
    expect(wire.commandPayloads.start.safeParse({ ...base, trigger: 'retry', retainedMessageIds: [] }).success).toBe(
      true,
    );
  });

  /* W6.r1 round 5: a chat's log lives under its id, so the wire refuses an id a launcher could not store. */
  it('should refuse a chat id that is not one storage path segment', () => {
    for (const chatId of ['a/b', String.raw`a\b`, '.', '..', '']) {
      expect(wire.commandPayloads.attach.safeParse({ chatId }).success).toBe(false);
    }
    for (const chatId of ['chat-1', '.chat', 'a..b']) {
      expect(wire.commandPayloads.attach.safeParse({ chatId }).success).toBe(true);
    }
  });

  it('should refuse the dead start fields and a run id past the attempt-key budget (drift item 4; RA-R11)', () => {
    const base = { chatId: 'c', runId: 'r', message: { id: 'm', role: 'user', content: 'hi' }, trigger: 'submit' };
    expect(wire.commandPayloads.start.safeParse({ ...base, mode: 'direct' }).success).toBe(false);
    expect(wire.commandPayloads.start.safeParse({ ...base, baseRevisionId: 'rev' }).success).toBe(false);
    expect(wire.commandPayloads.start.safeParse({ ...base, runId: 'r'.repeat(95) }).success).toBe(false);
    expect(wire.commandPayloads.start.safeParse({ ...base, runId: 'r'.repeat(94) }).success).toBe(true);
  });

  it('should name only a positive generation in a fenced read (generation 0 is no leader yet)', () => {
    const fenced = (generation: number) =>
      wire.readAnswerSchema.safeParse({
        status: 'refused',
        chatId: 'c',
        reason: 'owner-fenced',
        expected: { generation },
      }).success;

    expect({ zero: fenced(0), one: fenced(1) }).toEqual({ zero: false, one: true });
  });

  it('should refuse a read without maxBytes and a batch whose cursors do not add up', () => {
    expect(wire.readRequestSchema.safeParse({ chatId: 'c', cursor: 0, limit: 16 }).success).toBe(false);
    expect(
      wire.readAnswerSchema.safeParse({
        status: 'batch',
        chatId: 'c',
        cursor: 2,
        nextCursor: 4,
        endCursor: 4,
        events: [{}],
      }).success,
    ).toBe(false);
  });
});

it('should carry explicit commentary and reasoning summaries across the live wire', () => {
  const identity = { chatId: 'chat', runId: 'run', messageId: 'message', contentIndex: 0 };
  for (const event of [
    { ...identity, type: 'text-start', phase: 'commentary' },
    { ...identity, type: 'text-delta', delta: 'Checking', phase: 'commentary' },
    { ...identity, type: 'text-end', content: 'Checking', phase: 'commentary' },
    { ...identity, type: 'thinking-start', reasoningSummary: 'Checking plot quality' },
    { ...identity, type: 'thinking-delta', delta: 'Checking', reasoningSummary: 'Checking plot quality' },
    { ...identity, type: 'thinking-end', content: 'Checking', reasoningSummary: 'Checking plot quality' },
  ]) {
    expect(wire.agentLiveEventSchema.parse(event)).toEqual(event);
  }
});

describe('the attempt receipt (W2)', () => {
  const pending = { state: 'pending', operationId: 'operation-1', dispatchState: 'accepted' } as const;
  /* The API's default invocation deadline and recovery grace (apps/api), which this package cannot import. */
  const invocationDeadline = 300_000;
  const recoveryGrace = 5 * 60_000;
  const settlesBy = new Date(Date.UTC(2026, 10, 6) + invocationDeadline + recoveryGrace).toISOString();

  it('should read a pending answer from an API older than settlesBy unchanged', () => {
    expect(wire.attemptReceiptSchema.parse(pending)).toEqual(pending);
  });

  it('should read the settlement instant a newer API states on a pending answer', () => {
    expect(wire.attemptReceiptSchema.parse({ ...pending, settlesBy })).toEqual({ ...pending, settlesBy });
  });

  it('should refuse a settlement instant that is not an ISO timestamp', () => {
    expect(wire.attemptReceiptSchema.safeParse({ ...pending, settlesBy: 'soon' }).success).toBe(false);
  });

  it('should leave settlesBy to an older host as a field it keeps without reading', () => {
    // The pre-W2 pending reader, as an older host still parses the answer.
    const older = z.looseObject({ state: z.literal('pending'), operationId: z.string().min(1) });
    expect(older.parse({ ...pending, settlesBy })).toEqual({ ...pending, settlesBy });
  });
});
