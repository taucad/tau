import { describe, expect, it } from 'vitest';

import { classifyLogRow } from '#log/event-schema.js';
import { commandPayloads, turnPlacementSchema, turnSettlementSchema } from '#wire/index.js';

const envelope = { version: 1, leaderEpoch: 'epoch-1', sequence: 3, recordedAt: '2026-09-26T00:00:00.000Z' } as const;
const finalized = {
  type: 'turn.finalized',
  turnId: 'turn-1',
  runId: 'run-1',
  chatId: 'chat-1',
  projectId: 'project-1',
  checkoutId: 'checkout-1',
  revisionId: 'rev-1',
  changedPaths: ['main.ts'],
  trigger: 'turn',
  runIds: ['run-1'],
} as const;

describe('the settlement rows (TS-S9, D11, D16)', () => {
  it('should read a turn.finalized row without an attempt', () => {
    expect(classifyLogRow({ ...envelope, ...finalized })).toMatchObject({ class: 'known' });
  });

  it('should require the attempt on a written settlement row', () => {
    expect(turnSettlementSchema.safeParse(finalized).success).toBe(false);
    expect(turnSettlementSchema.safeParse({ ...finalized, attempt: 2 }).success).toBe(true);
  });

  it('should require a code on turn.failed and accept the base it names', () => {
    const failed = { type: 'turn.failed', turnId: 'turn-1', runId: 'run-1', chatId: 'chat-1', attempt: 1, reason: 'x' };
    expect(turnSettlementSchema.safeParse(failed).success).toBe(false);
    expect(turnSettlementSchema.safeParse({ ...failed, code: 'TURN_RELEASED', revisionId: 'rev-base' }).success).toBe(
      true,
    );
  });

  it('should take the placement mode from placement, never from the client', () => {
    expect(turnPlacementSchema.safeParse({ checkoutId: 'checkout-1', mode: 'direct' }).success).toBe(true);
    expect(turnPlacementSchema.safeParse({ checkoutId: 'checkout-1' }).success).toBe(false);
  });

  it('should refuse a start that carries baseRevisionId', () => {
    const start = {
      chatId: 'chat-1',
      runId: 'run-1',
      message: { id: 'm', role: 'user', content: 'hi' },
      trigger: 'submit',
      checkoutId: 'checkout-1',
    };
    expect(commandPayloads.start.safeParse(start).success).toBe(true);
    expect(commandPayloads.start.safeParse({ ...start, baseRevisionId: 'rev-1' }).success).toBe(false);
    expect(commandPayloads.start.safeParse({ ...start, mode: 'direct' }).success).toBe(false);
  });
});
