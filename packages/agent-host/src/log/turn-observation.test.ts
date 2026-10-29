import { describe, expect, it, vi } from 'vitest';
import type { AgentLogEvent, UserProviderMessage } from '#log/event-types.js';
import { observeOwnTurns, observeTurns } from '#log/turn-observation.js';

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
          modelCall: 'inv-1',
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
    expect(observation?.ending).toBeUndefined();
    expect(observation?.revision).toBeUndefined();
    expect(observation?.tools.map((tool) => [tool.call, tool.outcome, tool.output])).toEqual([
      ['call-1', 'unknown', undefined],
    ]);
    expect(observation?.invocations[0]?.settlement).toBeUndefined();
  });

  describe('test_model checks', () => {
    const checked = (content: unknown, isError = false): Body[] =>
      toolTurn.map((body) =>
        body.type === 'message.appended' && 'toolName' in body.message
          ? {
              ...body,
              message: {
                ...body.message,
                toolName: 'test_model',
                ...(body.message.role === 'tool-output' ? { content, isError } : {}),
              },
            }
          : body,
      ) as Body[];
    const revision = { entry: 'main.ts', files: { 'main.ts': `sha256:${'a'.repeat(64)}` } };

    it('reads a qualified run status, its requirements and its revision', () => {
      const [observation] = observeTurns(
        chatId,
        term(
          't1',
          checked({
            runStatus: 'passed',
            tests: [
              { id: 'spec.ts:2', targetFile: 'spec.ts', ordinal: 2, requirement: 'SYNTHETIC_REQ', status: 'passed' },
              { id: 'spec.ts:1', targetFile: 'spec.ts', ordinal: 1, requirement: 'SYNTHETIC_REQ', status: 'passed' },
            ],
            sourceRevisions: [revision],
            omittedTests: 3,
            failures: [],
            passes: [],
            passed: 2,
            total: 2,
          }),
        ),
      );

      expect(observation?.tools[0]?.check).toEqual({
        result: 'passed',
        revision: [`main.ts\u0000main.ts=sha256:${'a'.repeat(64)}`],
        requirements: ['#omitted:3', 'spec.ts#1', 'spec.ts#2'],
      });
      expect(JSON.stringify(observation)).not.toContain('SYNTHETIC_REQ');
    });

    it.each([
      [['passed', 'failed', 'inconclusive'], undefined, 'failed'],
      [['passed', 'passed'], undefined, 'passed'],
      [['passed', 'skipped'], undefined, 'not-run'],
      [['passed', 'unsupported'], undefined, 'unsupported'],
      [['passed', 'inconclusive'], undefined, 'inconclusive'],
      [['passed'], { code: 'GEOSPEC_RUN_TIMEOUT' }, 'inconclusive'],
      [[], undefined, 'not-run'],
    ])(
      'decides an unqualified run %j (timeout %j) as %s, never passing an undecided test',
      (statuses, runTimeout, result) => {
        const tests = statuses.map((status, ordinal) => ({ id: `s:${ordinal}`, targetFile: 's', ordinal, status }));
        const [observation] = observeTurns(
          chatId,
          term(
            't1',
            checked({ tests, ...(runTimeout === undefined ? {} : { timeout: runTimeout }), total: tests.length }),
          ),
        );

        expect(observation?.tools[0]?.check?.result).toBe(result);
      },
    );

    it('reads no check from an errored call, an unreadable output or another tool', () => {
      const tests = [{ id: 's:1', targetFile: 's', ordinal: 1, status: 'passed' }];

      expect(observeTurns(chatId, term('t1', checked({ tests }, true)))[0]?.tools[0]?.check).toBeUndefined();
      expect(observeTurns(chatId, term('t1', checked('SYNTHETIC_TOOL_RESULT')))[0]?.tools[0]?.check).toBeUndefined();
      expect(observeTurns(chatId, term('t1', toolTurn))[0]?.tools[0]).not.toHaveProperty('check');
    });
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
    expect(observeTurns(chatId, resumed)[0]?.ending).toEqual({
      source: { chatId, leaderEpoch: 't2', sequence: 1 },
      at: start + 1000,
    });
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

  it('names each tool call by the generation prepared last before it, never a compaction', () => {
    const input = (call: string): Body => ({
      type: 'message.appended',
      message: { id: `in-${call}`, role: 'tool-input', toolCallId: call, toolName: 'read_file', content: {} },
    });
    const rows = term('t1', [
      input('call-0'),
      { type: 'model.invocation-prepared', attemptId: 'inv-1', purpose: 'generation', modelId: 'fixture-model' },
      input('call-1'),
      { type: 'model.invocation-prepared', attemptId: 'inv-c', purpose: 'compaction', modelId: 'fixture-model' },
      input('call-2'),
      { type: 'model.invocation-prepared', attemptId: 'inv-2', purpose: 'generation', modelId: 'fixture-model' },
      input('call-3'),
    ]);

    const [observation] = observeTurns(chatId, rows);

    expect(observation?.tools.map((tool) => [tool.call, tool.modelCall])).toEqual([
      ['call-0', undefined],
      ['call-1', 'inv-1'],
      ['call-2', 'inv-1'],
      ['call-3', 'inv-2'],
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

describe('observeOwnTurns', () => {
  it('should read every page of a chat’s own rows and own every term they name', async () => {
    const rows = term('t1', toolTurn);
    const read = vi.fn(async ({ cursor }: Readonly<{ cursor: number }>) => ({
      cursor,
      nextCursor: Math.min(cursor + 3, rows.length),
      endCursor: rows.length,
      events: rows.slice(cursor, cursor + 3),
    }));

    const { runs, ownsEpoch } = await observeOwnTurns(read, chatId);

    expect(read.mock.calls.length).toBe(Math.ceil(rows.length / 3));
    expect(runs).toEqual(observeTurns(chatId, rows));
    expect(ownsEpoch('t1')).toBe(true);
    expect(ownsEpoch('t2')).toBe(false);
  });
});
