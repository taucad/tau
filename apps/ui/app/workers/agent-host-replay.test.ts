import { describe, expect, it } from 'vitest';
import type { AgentLogEvent } from '@taucad/agent-host';
import { replayedStartOutcome } from './agent-host-replay.js';

/** One scripted durable record, with the log's own base fields left to {@link scriptedLog}. */
type ScriptedRow = AgentLogEvent extends infer Event
  ? Event extends AgentLogEvent
    ? Omit<Event, 'version' | 'leaderEpoch' | 'sequence' | 'recordedAt'>
    : never
  : never;

const scriptedLog = (rows: readonly ScriptedRow[]): readonly AgentLogEvent[] =>
  rows.map(
    (row, index): AgentLogEvent => ({
      version: 1,
      leaderEpoch: 'epoch-0',
      recordedAt: '2026-09-17T00:00:00.000Z',
      sequence: index,
      ...row,
    }),
  );

const committedTurn = (runId: string, turnId: string): ScriptedRow => ({
  type: 'turn.history-projection-committed',
  runId,
  retainedMessageIds: [],
  message: { id: turnId, role: 'user', content: 'Hello.' },
  context: {
    version: 1,
    systemPrompt: 'fixture',
    initialMessages: [],
    postCompactionMessages: [],
  },
});

const settlementOnly = (runId: string, turnId: string): ScriptedRow => ({
  type: 'turn.failed',
  runId,
  chatId: 'chat-1',
  turnId,
  reason: 'The turn ended before it recorded a revision.',
});

describe('replayedStartOutcome', () => {
  it('should admit a run whose only record is a settlement written under its id', () => {
    const events = scriptedLog([
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      committedTurn('run-1', 'turn-1'),
      { type: 'run.lifecycle', runId: 'run-1', state: 'completed' },
      settlementOnly('run-2', 'turn-2'),
    ]);

    expect(replayedStartOutcome({ events, runId: 'run-2' })).toBe('admit');
  });

  it('should admit a run admitted without its turn ever being committed', () => {
    const events = scriptedLog([{ type: 'run.lifecycle', runId: 'run-1', state: 'admitted' }]);

    expect(replayedStartOutcome({ events, runId: 'run-1' })).toBe('admit');
  });

  it('should resume a run whose committed turn has not ended', () => {
    const events = scriptedLog([
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      committedTurn('run-1', 'turn-1'),
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
    ]);

    expect(replayedStartOutcome({ events, runId: 'run-1' })).toBe('resume');
  });

  it('should answer a committed run that already ended as settled', () => {
    const events = scriptedLog([
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      committedTurn('run-1', 'turn-1'),
      { type: 'run.lifecycle', runId: 'run-1', state: 'completed' },
    ]);

    expect(replayedStartOutcome({ events, runId: 'run-1' })).toBe('settled');
  });

  it('should admit a command against an empty log', () => {
    expect(replayedStartOutcome({ events: [], runId: 'run-1' })).toBe('admit');
  });
});
