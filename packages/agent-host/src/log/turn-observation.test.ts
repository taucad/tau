import { describe, expect, it } from 'vitest';
import type { AgentLogEvent, UserProviderMessage } from '#log/event-types.js';
import { observeTurns } from '#log/turn-observation.js';

const chatId = 'chat-1';
const start = Date.parse('2026-10-29T00:00:00.000Z');

type Body = AgentLogEvent extends infer Event
  ? Event extends AgentLogEvent
    ? Omit<Event, 'version' | 'leaderEpoch' | 'sequence' | 'recordedAt' | 'runId'> & { runId?: string }
    : never
  : never;

/** A term's rows, one second apart, so intervals are readable in the assertions. */
const term = (leaderEpoch: string, bodies: readonly Body[], offset = 0): AgentLogEvent[] =>
  bodies.map((body, index) => {
    const row: unknown = {
      version: 1,
      leaderEpoch,
      sequence: index + offset,
      recordedAt: new Date(start + (index + offset) * 1000).toISOString(),
      runId: 'run-1',
      ...body,
    };
    return row as AgentLogEvent;
  });

const user = (id: string, kind?: string): UserProviderMessage => ({
  id,
  role: 'user',
  content: 'SYNTHETIC_PERSON_TEXT',
  ...(kind === undefined ? {} : { metadata: { tauInternal: { kind } } }),
});

const toolTurn: Body[] = [
  { type: 'run.lifecycle', state: 'admitted' },
  {
    type: 'turn.history-projection-committed',
    retainedMessageIds: [],
    message: user('turn-1'),
    context: { version: 1, systemPrompt: 'SYNTHETIC_SYSTEM', initialMessages: [], postCompactionMessages: [] },
  },
  { type: 'run.lifecycle', state: 'running', attempt: 1 },
  { type: 'model.invocation-prepared', attemptId: 'inv-1', purpose: 'generation', modelId: 'fixture-model' },
  { type: 'model.invocation-bound', attemptId: 'inv-1', operationId: 'op-1', status: 'pending' },
  {
    type: 'message.appended',
    message: {
      id: 'in-1',
      role: 'tool-input',
      toolCallId: 'call-1',
      toolName: 'read_file',
      content: { targetFile: 'SYNTHETIC_PATH' },
    },
  },
  {
    type: 'message.appended',
    message: {
      id: 'out-1',
      role: 'tool-output',
      toolCallId: 'call-1',
      toolName: 'read_file',
      isError: false,
      content: 'SYNTHETIC_TOOL_RESULT',
    },
  },
  {
    type: 'model.invocation-settled',
    attemptId: 'inv-1',
    outcome: 'settled',
    operationId: 'op-1',
    chargedCreditAtoms: '10',
  },
  { type: 'run.lifecycle', state: 'completed', attempt: 1 },
  {
    type: 'turn.finalized',
    turnId: 'turn-1',
    runId: 'run-1',
    chatId,
    projectId: 'project-1',
    revisionId: 'rev-1',
    changedPaths: ['SYNTHETIC_CHANGED_PATH'],
    trigger: 'turn',
    runIds: ['run-1'],
  },
];

describe('observeTurns', () => {
  it('reads a tool turn into its invocation, tool outcome, phases and ending', () => {
    const [observation, ...rest] = observeTurns(chatId, term('t1', toolTurn));

    expect(rest).toEqual([]);
    expect(observation).toMatchObject({
      chatId,
      runId: 'run-1',
      turnId: 'turn-1',
      termination: 'completed',
      revision: 'written',
      invocations: [
        {
          attemptId: 'inv-1',
          purpose: 'generation',
          modelId: 'fixture-model',
          binding: 'pending',
          settlement: 'settled',
        },
      ],
      tools: [
        {
          call: 'call-1',
          toolName: 'read_file',
          outcome: 'completed',
          input: { chatId, leaderEpoch: 't1', sequence: 5 },
          output: { chatId, leaderEpoch: 't1', sequence: 6 },
        },
      ],
      intervals: [
        { phase: 'admission', start, end: start + 2000 },
        { phase: 'tool', start: start + 5000, end: start + 6000 },
      ],
      lastFactAt: start + 9000,
    });
    expect(observation?.sources).toHaveLength(toolTurn.length);
  });

  it('carries identities, names and counts, never the person, system, tool or path text', () => {
    const written = JSON.stringify(observeTurns(chatId, term('t1', toolTurn)));

    for (const content of ['SYNTHETIC_PERSON_TEXT', 'SYNTHETIC_SYSTEM', 'SYNTHETIC_PATH', 'SYNTHETIC_TOOL_RESULT']) {
      expect(written).not.toContain(content);
    }
    expect(written).not.toContain('SYNTHETIC_CHANGED_PATH');
  });

  it('reads a replicated row once, however many segments carry it', () => {
    const rows = term('t1', toolTurn);
    const replicated = [...rows.slice(0, 7), ...rows.slice(3, 7), ...rows.slice(7), rows.at(-2)!];

    expect(observeTurns(chatId, replicated)).toEqual(observeTurns(chatId, rows));
  });

  it('ignores heartbeats: they add no source and move no clock', () => {
    const rows = term('t1', toolTurn);
    const withHeartbeats = [
      ...rows,
      ...term('t1', [{ type: 'run.heartbeat' }, { type: 'run.heartbeat' }], toolTurn.length),
    ];

    expect(observeTurns(chatId, withHeartbeats)).toEqual(observeTurns(chatId, rows));
  });

  it('keeps a tool call with no committed output, and a run with no ending, unknown rather than failed', () => {
    const [observation] = observeTurns(chatId, term('t1', toolTurn.slice(0, 6)));

    expect(observation?.termination).toBe('unknown');
    expect(observation?.revision).toBeUndefined();
    expect(observation?.tools.map((tool) => [tool.call, tool.outcome, tool.output])).toEqual([
      ['call-1', 'unknown', undefined],
    ]);
    expect(observation?.invocations[0]?.settlement).toBeUndefined();
  });

  it('records a tool that returned an error as failed', () => {
    const errored = toolTurn.map((body) =>
      body.type === 'message.appended' && body.message.role === 'tool-output'
        ? { ...body, message: { ...body.message, isError: true } }
        : body,
    );

    expect(observeTurns(chatId, term('t1', errored))[0]?.tools[0]?.outcome).toBe('failed');
  });

  it('takes the ending of the latest attempt, and a final failure once however often it is replicated', () => {
    const resumed = [
      ...term('t1', [
        { type: 'run.lifecycle', state: 'running', attempt: 1 },
        { type: 'run.lifecycle', state: 'failed', attempt: 1 },
      ]),
      ...term('t2', [
        { type: 'run.lifecycle', state: 'running', attempt: 2 },
        { type: 'run.lifecycle', state: 'completed', attempt: 2 },
      ]),
    ];
    const failed = term('t1', [
      { type: 'run.lifecycle', state: 'running', attempt: 1 },
      { type: 'run.lifecycle', state: 'failed', attempt: 1, detail: { message: 'SYNTHETIC_FAILURE' } },
    ]);

    expect(observeTurns(chatId, resumed)[0]?.termination).toBe('completed');
    const [observation] = observeTurns(chatId, [...failed, ...failed, failed[1]!]);
    expect(observation?.termination).toBe('failed');
    expect(observation?.sources).toHaveLength(2);
    expect(JSON.stringify(observation)).not.toContain('SYNTHETIC_FAILURE');
  });

  it('measures an approval pause, and leaves an unanswered one open', () => {
    const answered = term('t1', [
      { type: 'run.lifecycle', state: 'running', attempt: 1 },
      { type: 'interrupt.recorded', interruptId: 'ask-1', phase: 'requested', reason: 'approval' },
      { type: 'run.lifecycle', state: 'paused', attempt: 1 },
      { type: 'interrupt.recorded', interruptId: 'ask-1', phase: 'resolved', reason: 'approval' },
      { type: 'interrupt.recorded', interruptId: 'ask-2', phase: 'requested', reason: 'approval' },
    ]);

    expect(observeTurns(chatId, answered)[0]?.intervals).toEqual([
      { phase: 'approval', start: start + 1000, end: start + 3000 },
      { phase: 'approval', start: start + 4000, end: undefined },
    ]);
  });

  it('records compaction as a transformation with its measurements', () => {
    const details = {
      lane: 'overflow',
      tier: 'summarization',
      tokensBefore: 180_000,
      tokensAfter: 40_000,
      cleared: 0,
      evicted: 3,
      summarizerAttempts: 1,
      summarizerUsage: null,
    } as const;
    const rows = term('t1', [
      { type: 'model.invocation-prepared', attemptId: 'inv-c', purpose: 'compaction', modelId: 'fixture-model' },
      {
        type: 'history.compacted',
        evictedMessageIds: ['m1', 'm2', 'm3'],
        summary: user('summary-1', 'compaction-summary'),
        details,
      },
    ]);

    const [observation] = observeTurns(chatId, rows);

    expect(observation?.invocations.map((invocation) => invocation.purpose)).toEqual(['compaction']);
    expect(observation?.transformations).toEqual([
      {
        operation: 'compact',
        lane: 'overflow',
        tier: 'summarization',
        tokensBefore: 180_000,
        tokensAfter: 40_000,
        omitted: 3,
        source: { chatId, leaderEpoch: 't1', sequence: 1 },
      },
    ]);
  });

  it('leaves an external agent’s run out entirely', () => {
    const external = term('t1', [
      { type: 'run.lifecycle', state: 'admitted', runId: 'run-acp' },
      { type: 'message.appended', message: user('turn-acp', 'external-agent'), runId: 'run-acp' },
      { type: 'run.lifecycle', state: 'completed', runId: 'run-acp' },
    ]);
    const tau = term('t1', toolTurn, external.length);

    expect(observeTurns(chatId, [...external, ...tau]).map((observation) => observation.runId)).toEqual(['run-1']);
  });
});
