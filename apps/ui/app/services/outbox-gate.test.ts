import { describe, expect, it } from 'vitest';
import type { QueuedChatMessage } from '@taucad/chat-ui/db/chat-message-queue-store';
import { isAfterRunUnseen, selectDepartingSend, selectOutboxGate, selectQueueStrip } from '#services/outbox-gate.js';
import type { OutboxGateFacts, OutboxReadiness } from '#services/outbox-gate.js';

const entry = (id: string, extra: Partial<QueuedChatMessage> = {}): QueuedChatMessage => ({
  id,
  requestId: `req_${id}`,
  message: { id, role: 'user', parts: [{ type: 'text', text: id }] },
  ...extra,
});

const prepared = (id: string): QueuedChatMessage =>
  entry(id, {
    command: {
      type: 'start',
      commandId: `req_${id}`,
      payload: { chatId: 'chat', runId: `req_${id}`, trigger: 'submit', message: { id, role: 'user', parts: [] } },
    } as unknown as QueuedChatMessage['command'],
  });

const steering = (id: string, runId: string): QueuedChatMessage =>
  entry(id, { steer: { type: 'cancel', commandId: `steer_${id}`, payload: { chatId: 'chat', runId } } });

const ready: OutboxReadiness = {
  deliverable: true,
  host: true,
  turnHost: true,
  commandInFlight: false,
  admitting: false,
  chatLoading: false,
  hostWaiting: false,
};

const facts = (overrides: Partial<OutboxGateFacts> = {}): OutboxGateFacts => ({
  items: [entry('a')],
  caughtUp: true,
  readiness: ready,
  live: false,
  run: { runId: 'old', phase: 'completed' },
  afterRunUnseen: false,
  withdrawing: undefined,
  ...overrides,
});

describe('selectOutboxGate', () => {
  it.each([
    { name: 'nothing queued', overrides: { items: [] }, expected: { kind: 'empty' } },
    { name: 'an ended run', overrides: {}, expected: { kind: 'deliver', id: 'a' } },
    { name: 'no run yet', overrides: { run: undefined }, expected: { kind: 'deliver', id: 'a' } },
    {
      name: 'a log not read to its end',
      overrides: { caughtUp: false },
      expected: { kind: 'hold', reason: 'log-not-caught-up' },
    },
    {
      name: 'another page delivering',
      overrides: { readiness: { ...ready, deliverable: false } },
      expected: { kind: 'hold', reason: 'not-deliverable-here' },
    },
    {
      name: 'no host',
      overrides: { readiness: { ...ready, host: false } },
      expected: { kind: 'hold', reason: 'no-host' },
    },
    {
      name: 'no turn admission',
      overrides: { readiness: { ...ready, turnHost: false } },
      expected: { kind: 'hold', reason: 'no-turn-host' },
    },
    {
      name: 'a command in flight',
      overrides: { readiness: { ...ready, commandInFlight: true } },
      expected: { kind: 'hold', reason: 'command-in-flight' },
    },
    {
      name: 'a refused send whose backoff has not run out',
      overrides: { readiness: { ...ready, hostWaiting: true } },
      expected: { kind: 'hold', reason: 'host-wait' },
    },
    {
      name: 'an admission',
      overrides: { readiness: { ...ready, admitting: true } },
      expected: { kind: 'hold', reason: 'admitting' },
    },
    {
      name: 'a loading chat',
      overrides: { readiness: { ...ready, chatLoading: true } },
      expected: { kind: 'hold', reason: 'chat-loading' },
    },
    {
      name: 'a live run',
      overrides: { run: { runId: 'live', phase: 'running' } },
      expected: { kind: 'hold', reason: 'run-not-ended' },
    },
    {
      name: 'a paused run',
      overrides: { run: { runId: 'live', phase: 'paused' } },
      expected: { kind: 'hold', reason: 'run-not-ended' },
    },
    {
      name: 'a live machine with no live run',
      overrides: { live: true },
      expected: { kind: 'hold', reason: 'machine-live' },
    },
    {
      name: 'a handed-over run not in the log',
      overrides: { afterRunUnseen: true },
      expected: { kind: 'hold', reason: 'after-run-unseen' },
    },
    {
      name: 'a stopped run',
      overrides: { run: { runId: 'old', phase: 'cancelled' } },
      expected: { kind: 'hold', reason: 'run-not-ended' },
    },
    {
      name: 'a send made after the stopped run',
      overrides: { items: [entry('a', { afterTerminalRunId: 'old' })], run: { runId: 'old', phase: 'cancelled' } },
      expected: { kind: 'deliver', id: 'a' },
    },
    {
      name: 'a send being taken back',
      overrides: { withdrawing: 'a' },
      expected: { kind: 'hold', reason: 'withdrawing' },
    },
    {
      name: 'a send being taken back while the log catches up',
      overrides: { withdrawing: 'a', caughtUp: false, readiness: { ...ready, host: false } },
      expected: { kind: 'hold', reason: 'withdrawing' },
    },
    {
      name: 'a send held behind a taken-back one',
      overrides: { items: [entry('a', { held: true })] },
      expected: { kind: 'hold', reason: 'held' },
    },
    {
      name: 'a later send behind a held one',
      overrides: { items: [entry('a', { held: true }), entry('b')] },
      expected: { kind: 'deliver', id: 'b' },
    },
    {
      name: 'a held send sent now',
      overrides: { items: [{ ...steering('a', 'old'), held: true }] },
      expected: { kind: 'deliver', id: 'a' },
    },
    {
      name: 'a prepared command',
      overrides: { items: [entry('a'), prepared('b')] },
      expected: { kind: 'replay', id: 'b' },
    },
    {
      name: 'a prepared command behind its own run',
      overrides: { items: [prepared('b')], run: { runId: 'req_b', phase: 'running' } },
      expected: { kind: 'replay', id: 'b' },
    },
    {
      name: 'a prepared command behind another live run',
      overrides: { items: [prepared('b')], run: { runId: 'live', phase: 'running' } },
      expected: { kind: 'hold', reason: 'unrelated-live-run' },
    },
    {
      name: 'a steer of the live run',
      overrides: { items: [steering('a', 'live')], run: { runId: 'live', phase: 'running' } },
      expected: { kind: 'steer', id: 'a' },
    },
  ] satisfies ReadonlyArray<{
    name: string;
    overrides: Partial<OutboxGateFacts>;
    expected: { kind: string; id?: string; reason?: string };
  }>)('should answer $expected.kind for $name', ({ overrides, expected }) => {
    const gate = selectOutboxGate(facts(overrides));
    expect({
      kind: gate.kind,
      ...('item' in gate && expected.id !== undefined ? { id: gate.item.id } : {}),
      ...(gate.kind === 'hold' ? { reason: gate.reason } : {}),
    }).toEqual(expected);
  });
});

describe('selectDepartingSend', () => {
  const queue = (items: readonly QueuedChatMessage[], sendingId?: string, error?: string) => ({
    items,
    sendingId,
    error,
  });

  it('should show a send nothing runs ahead of, whatever this page still waits for', () => {
    const items = [entry('a')];
    const gate = selectOutboxGate(facts({ items, readiness: undefined }));
    expect(selectDepartingSend(queue(items), gate)?.id).toBe('a');
  });

  it.each([
    { name: 'behind a live run', overrides: { run: { runId: 'live', phase: 'running' } } },
    { name: 'behind an unseen handover', overrides: { afterRunUnseen: true } },
    { name: 'held behind a taken-back send', overrides: { items: [entry('a', { held: true })] } },
    { name: 'before the log is read', overrides: { caughtUp: false } },
  ] satisfies ReadonlyArray<{ name: string; overrides: Partial<OutboxGateFacts> }>)(
    'should leave a send $name in the strip',
    ({ overrides }) => {
      const gate = selectOutboxGate(facts({ readiness: undefined, ...overrides }));
      expect(selectDepartingSend(queue(overrides.items ?? [entry('a')]), gate)).toBeUndefined();
    },
  );

  it('should show the entry being delivered, and never a failed one', () => {
    const items = [entry('a')];
    const behind = selectOutboxGate(facts({ items, live: true, readiness: undefined }));
    expect(selectDepartingSend(queue(items, 'a'), behind)?.id).toBe('a');
    expect(selectDepartingSend(queue(items, undefined, 'failed'), selectOutboxGate(facts({ items })))).toBeUndefined();
  });

  it('should never show a send being taken back, even while it is still being delivered', () => {
    const items = [entry('a')];
    const gate = selectOutboxGate(facts({ items, caughtUp: false, withdrawing: 'a', readiness: undefined }));
    expect(selectDepartingSend(queue(items, 'a'), gate)).toBeUndefined();
  });
});

describe('selectQueueStrip', () => {
  it('should leave the departing send out and keep a prepared one as sending', () => {
    expect(selectQueueStrip({ items: [entry('a'), entry('b')] }, 'a')).toEqual({
      items: [entry('b')],
      sendingId: undefined,
    });
    expect(selectQueueStrip({ items: [prepared('a'), entry('b')] }, 'a')).toEqual({
      items: [entry('b')],
      sendingId: 'a',
    });
  });
});

describe('isAfterRunUnseen', () => {
  const ledger = (runs: string[]) => ({ runs: Object.fromEntries(runs.map((runId) => [runId, {}])) });

  it.each([
    { record: {}, runs: [], observed: undefined, unseen: false },
    { record: { afterRunId: 'r' }, runs: ['r'], observed: undefined, unseen: false },
    { record: { afterRunId: 'r' }, runs: [], observed: undefined, unseen: true },
    { record: { afterRunId: 'r', afterPlacement: 'host-a' }, runs: [], observed: 'host-b', unseen: false },
    { record: { afterRunId: 'r', afterPlacement: 'host-a' }, runs: [], observed: 'host-a', unseen: true },
    { record: { afterRunId: 'r', rebasedPlacement: 'host-b' }, runs: [], observed: 'host-b', unseen: false },
  ])('should hold behind an unseen handover: $unseen', ({ record, runs, observed, unseen }) => {
    expect(isAfterRunUnseen(record, ledger(runs), observed)).toBe(unseen);
  });
});
