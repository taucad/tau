/**
 * R1 (prompt cache rollout): every gateway generation step carries the turn labels the gateway's turn-step series
 * reads — `x-tau-turn-step` (`first`, then `continuation` for the rest of the run) and `x-tau-turn-gap` (the pause
 * from the chat's previous model step to this turn's first step). The labels come from the durable log, so a run
 * resumed on this device or another labels its steps the way the run that started them did. A compaction carries
 * none: it is not a step of the person's turn, and the gateway then records no turn labels for it.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryEventLog, createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';
import type { CreateAgentSessionOptions } from '#harness/session.js';
import { turnGapOf, turnLabelsOf } from '#harness/turn-labels.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import { memoryEventLogStorage } from '#log/event-log-storage.fixture.js';
import type { AgentLogEvent } from '#log/event-types.js';
import { serializeLogEvent } from '#log/serialization.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';

const minute = 60_000;
const origin = Date.parse('2026-11-01T09:00:00.000Z');

const toolRegistry: ToolRegistry = {
  list: () => [
    {
      name: 'read_file',
      description: 'Read one project file.',
      inputSchema: {
        type: 'object',
        properties: { targetFile: { type: 'string' } },
        additionalProperties: false,
      },
    },
  ],
  invoke: async () => ({
    content: { content: 'module nut() {}' },
    isError: false,
  }),
};

/** A scripted transport: `toolSteps` tool calls, then a text answer; every request is recorded. */
const scriptedTransport = (requests: ModelStreamRequest[], toolSteps = 1): ModelTransport => {
  let generations = 0;
  return {
    funding: { type: 'unfunded' },
    async *stream(request): AsyncGenerator<ModelStreamEvent> {
      requests.push(request);
      if (request.invocationPurpose === 'compaction') {
        yield { type: 'text-delta', text: 'Earlier work.' };
        yield { type: 'completed', stopReason: 'stop' };
        return;
      }
      generations += 1;
      if (generations <= toolSteps) {
        yield {
          type: 'tool-input',
          toolCallId: `call-${String(generations)}`,
          toolName: 'read_file',
          input: { targetFile: 'main.scad' },
        };
        yield { type: 'completed', stopReason: 'toolUse' };
        return;
      }
      yield { type: 'text-delta', text: 'Done.' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };
};

/** A session on `log` whose clock reads `clock.now`. */
const sessionOn = async (
  log: EventLogAppender,
  input: {
    readonly runId: string;
    readonly requests: ModelStreamRequest[];
    readonly clock: { now: number };
    readonly toolSteps?: number;
    readonly overrides?: Partial<CreateAgentSessionOptions>;
  },
) =>
  createAgentSession({
    chatId: 'chat-r1',
    runId: input.runId,
    leaderEpoch: `epoch-${input.runId}`,
    systemPrompt: 'system',
    model: { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' },
    modelTransport: scriptedTransport(input.requests, input.toolSteps),
    toolRegistry,
    eventLog: log,
    now: () => new Date(input.clock.now),
    ...input.overrides,
  });

const rowOf = (
  runId: string,
  sequence: number,
  at: number,
): Pick<AgentLogEvent, 'version' | 'leaderEpoch' | 'sequence' | 'recordedAt' | 'runId'> => ({
  version: 1,
  leaderEpoch: `epoch-seed-${runId}`,
  sequence,
  recordedAt: new Date(at).toISOString(),
  runId,
});

const userRow = (runId: string, sequence: number, at: number): AgentLogEvent => ({
  ...rowOf(runId, sequence, at),
  type: 'message.appended',
  message: { id: `u-${runId}`, role: 'user', content: 'make a nut' },
});

const assistantRow = (runId: string, sequence: number, at: number): AgentLogEvent => ({
  ...rowOf(runId, sequence, at),
  type: 'message.appended',
  message: {
    id: `a-${runId}`,
    role: 'assistant',
    content: [{ type: 'text', text: 'answered' }],
    metadata: {
      stopReason: 'stop',
      model: 'stub',
      provider: 'anthropic',
      api: 'anthropic-messages',
      timestamp: at,
    },
  },
});

/** A run's tool step recorded at `at`: its assistant call, the call's input and its output. */
const toolStepRows = (runId: string, sequence: number, at: number): AgentLogEvent[] => [
  {
    ...rowOf(runId, sequence, at),
    type: 'message.appended',
    message: {
      id: `a-${runId}-step-1`,
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: `call-${runId}`,
          name: 'read_file',
          arguments: { targetFile: 'main.scad' },
        },
      ],
      metadata: {
        stopReason: 'toolUse',
        model: 'stub',
        provider: 'anthropic',
        api: 'anthropic-messages',
      },
    },
  },
  {
    ...rowOf(runId, sequence + 1, at),
    type: 'message.appended',
    message: {
      id: `in-${runId}`,
      role: 'tool-input',
      toolCallId: `call-${runId}`,
      toolName: 'read_file',
      content: { targetFile: 'main.scad' },
    },
  },
  {
    ...rowOf(runId, sequence + 2, at + 1000),
    type: 'message.appended',
    message: {
      id: `out-${runId}`,
      role: 'tool-output',
      toolCallId: `call-${runId}`,
      toolName: 'read_file',
      content: 'module nut() {}',
      isError: false,
    },
  },
];

/** The chat's last model step answered at `origin`: a finished earlier turn. */
const answeredTurn = (): AgentLogEvent[] => [userRow('run-0', 0, origin - 1000), assistantRow('run-0', 1, origin)];

const labelsOf = (requests: readonly ModelStreamRequest[]) =>
  requests.map((request) => [request.invocationPurpose, request.turn]);

describe('R1 turn labels on every generation step', () => {
  it('should send first then continuation across a multi-step run, with first_turn for a new chat', async () => {
    const requests: ModelStreamRequest[] = [];
    const clock = { now: origin };
    const session = await sessionOn(await createMemoryEventLog(), {
      runId: 'run-1',
      requests,
      clock,
      toolSteps: 2,
    });
    const outcome = await session.prompt({
      id: 'u-1',
      role: 'user',
      content: 'make a nut',
    });
    await session.close();

    expect(outcome.outcome).toBe('completed');
    expect(labelsOf(requests)).toEqual([
      ['generation', { step: 'first', gap: 'first_turn' }],
      ['generation', { step: 'continuation', gap: 'first_turn' }],
      ['generation', { step: 'continuation', gap: 'first_turn' }],
    ]);
  });

  it('should label the next turn of the chat from the previous turn’s last model step', async () => {
    const file = createMemoryEventLogFile();
    const clock = { now: origin };
    const first: ModelStreamRequest[] = [];
    const turnOne = await sessionOn(await file.open(), {
      runId: 'run-1',
      requests: first,
      clock,
    });
    await turnOne.prompt({ id: 'u-1', role: 'user', content: 'make a nut' });
    await turnOne.close();

    /* Ten minutes after turn one's last step was recorded, the person asks again. */
    clock.now = origin + 10 * minute;
    const second: ModelStreamRequest[] = [];
    const turnTwo = await sessionOn(await file.open(), {
      runId: 'run-2',
      requests: second,
      clock,
    });
    await turnTwo.prompt({ id: 'u-2', role: 'user', content: 'now a bolt' });
    await turnTwo.close();

    expect(labelsOf(second)).toEqual([
      ['generation', { step: 'first', gap: '5m_60m' }],
      ['generation', { step: 'continuation', gap: '5m_60m' }],
    ]);
  });

  /* The 5 and 60 minute edges are the provider cache lifetimes: an entry is gone at its lifetime, so each edge
   * belongs to the bucket above it. */
  it.each([
    [5 * minute - 1, 'lt_5m'],
    [5 * minute, '5m_60m'],
    [60 * minute - 1, '5m_60m'],
    [60 * minute, 'gt_60m'],
  ] as const)('should bucket a %d ms pause as %s on the injected clock', async (pause, gap) => {
    const requests: ModelStreamRequest[] = [];
    const clock = { now: origin + pause };
    const session = await sessionOn(await createMemoryEventLog(answeredTurn()), {
      runId: 'run-1',
      requests,
      clock,
    });
    await session.prompt({ id: 'u-1', role: 'user', content: 'again' });
    await session.close();

    expect(labelsOf(requests)).toEqual([
      ['generation', { step: 'first', gap }],
      ['generation', { step: 'continuation', gap }],
    ]);
  });

  it('should keep a run’s gap on its later steps even when they cross a bucket edge', async () => {
    /* The first step leaves 1 ms before the edge; its tool step and answer land after it. */
    const requests: ModelStreamRequest[] = [];
    const clock = { now: origin + 5 * minute - 1 };
    const transport = scriptedTransport(requests);
    const session = await sessionOn(await createMemoryEventLog(answeredTurn()), {
      runId: 'run-1',
      requests,
      clock,
      overrides: {
        modelTransport: {
          funding: transport.funding,
          stream: (request) => {
            clock.now += minute;
            return transport.stream(request);
          },
        },
      },
    });
    await session.prompt({ id: 'u-1', role: 'user', content: 'again' });
    await session.close();

    expect(labelsOf(requests)).toEqual([
      ['generation', { step: 'first', gap: 'lt_5m' }],
      ['generation', { step: 'continuation', gap: 'lt_5m' }],
    ]);
  });

  it('should send no turn labels on a compaction, and keep the step after it first', async () => {
    const history: AgentLogEvent[] = Array.from({ length: 8 }, (_, sequence) => ({
      ...rowOf('run-0', sequence, origin - minute),
      type: 'message.appended',
      message: {
        id: `history-${String(sequence)}`,
        role: 'user',
        content: String(sequence).repeat(4000),
      },
    }));
    const requests: ModelStreamRequest[] = [];
    const clock = { now: origin + 2 * minute };
    const session = await sessionOn(await createMemoryEventLog([...history, assistantRow('run-0', 8, origin)]), {
      runId: 'run-1',
      requests,
      clock,
      toolSteps: 0,
      overrides: {
        model: { id: 'stub', contextWindow: 8192, providerKind: 'anthropic' },
      },
    });
    await session.prompt({
      id: 'u-1',
      role: 'user',
      content: 'continue after summary',
    });
    await session.close();

    expect(labelsOf(requests)).toEqual([
      ['compaction', undefined],
      ['generation', { step: 'first', gap: 'lt_5m' }],
    ]);
  });
});

describe('R1 turn labels come from the log, not from a session’s memory', () => {
  it('should resume a run as continuation with the gap its first step had', async () => {
    /* Run 1 started 3 minutes after run 0's answer, made one tool step, and its tab closed. It resumes 2 hours on. */
    const log = await createMemoryEventLog([
      ...answeredTurn(),
      userRow('run-1', 0, origin + 3 * minute - 1000),
      ...toolStepRows('run-1', 1, origin + 3 * minute),
    ]);
    const requests: ModelStreamRequest[] = [];
    const session = await sessionOn(log, {
      runId: 'run-1',
      requests,
      clock: { now: origin + 120 * minute },
      toolSteps: 1,
    });
    const outcome = await session.continue();
    await session.close();

    expect(outcome.outcome, JSON.stringify(outcome.failure)).toBe('completed');
    expect(labelsOf(requests)).toEqual([
      ['generation', { step: 'continuation', gap: 'lt_5m' }],
      ['generation', { step: 'continuation', gap: 'lt_5m' }],
    ]);
  });

  it('should resume a run that never reached the model as its first step, gapped from now', async () => {
    const log = await createMemoryEventLog([...answeredTurn(), userRow('run-1', 0, origin + minute)]);
    const requests: ModelStreamRequest[] = [];
    const session = await sessionOn(log, {
      runId: 'run-1',
      requests,
      clock: { now: origin + 70 * minute },
    });
    await session.continue();
    await session.close();

    expect(labelsOf(requests)[0]).toEqual(['generation', { step: 'first', gap: 'gt_60m' }]);
  });

  describe('across devices', () => {
    const encoder = new TextEncoder();
    /** This device opens the chat with the desktop's segment beside its own empty log. */
    const openOnPhone = async (desktop: readonly AgentLogEvent[], now: number) => {
      const { storage } = memoryEventLogStorage(encoder.encode(''));
      const bytes = encoder.encode(desktop.map((event) => serializeLogEvent(event)).join(''));
      return createEventLogAppender(
        {
          ...storage,
          segments: async () => [{ deviceId: 'device-desktop', bytes }],
        },
        { now: () => now },
      );
    };

    it('should gap a new turn from the model step another device recorded', async () => {
      const requests: ModelStreamRequest[] = [];
      const clock = { now: origin + 30 * minute };
      const session = await sessionOn(await openOnPhone(answeredTurn(), clock.now), {
        runId: 'run-phone',
        requests,
        clock,
      });
      await session.prompt({
        id: 'u-phone',
        role: 'user',
        content: 'from the phone',
      });
      await session.close();

      expect(labelsOf(requests)).toEqual([
        ['generation', { step: 'first', gap: '5m_60m' }],
        ['generation', { step: 'continuation', gap: '5m_60m' }],
      ]);
    });

    it('should continue a run another device started with that run’s gap', async () => {
      const requests: ModelStreamRequest[] = [];
      const clock = { now: origin + 91 * minute };
      const session = await sessionOn(
        await openOnPhone(
          [
            ...answeredTurn(),
            userRow('run-desktop', 0, origin + 3 * minute - 1000),
            ...toolStepRows('run-desktop', 1, origin + 3 * minute),
          ],
          clock.now,
        ),
        { runId: 'run-desktop', requests, clock },
      );
      const outcome = await session.continue();
      expect(outcome.outcome, JSON.stringify(outcome.failure)).toBe('completed');
      await session.close();

      /* The desktop's first step came 3 minutes after the chat's previous one; the phone resumes 91 minutes on. */
      expect(labelsOf(requests)[0]).toEqual(['generation', { step: 'continuation', gap: 'lt_5m' }]);
    });
  });
});

describe('turnLabelsOf', () => {
  it.each([
    [-minute, 'lt_5m'],
    [0, 'lt_5m'],
    [5 * minute - 1, 'lt_5m'],
    [5 * minute, '5m_60m'],
    [60 * minute - 1, '5m_60m'],
    [60 * minute, 'gt_60m'],
  ] as const)('should bucket a %d ms pause as %s', (pause, gap) => {
    expect(turnGapOf(pause)).toBe(gap);
  });

  it('should ignore the run’s own rows when finding the previous model step', () => {
    const rows = [...answeredTurn(), assistantRow('run-1', 0, origin + 61 * minute)];
    expect(turnLabelsOf({ rows, runId: 'run-1', now: origin + 62 * minute })).toEqual({
      step: 'continuation',
      gap: 'gt_60m',
    });
    /* A user row is not a model step: a chat with no assistant row has no previous step. */
    expect(
      turnLabelsOf({
        rows: [userRow('run-0', 0, origin)],
        runId: 'run-1',
        now: origin,
      }),
    ).toEqual({
      step: 'first',
      gap: 'first_turn',
    });
  });

  it('should leave the gap to the gateway when a row’s time cannot be read', () => {
    const unreadable = {
      ...assistantRow('run-0', 1, origin),
      recordedAt: 'not a time',
    };
    expect(turnLabelsOf({ rows: [unreadable], runId: 'run-1', now: origin })).toEqual({ step: 'first' });
  });
});

/*
 * LW17 (LU6): every generation and compaction of a run names the kernel it targets, read from the snapshot frozen with
 * the turn (D2): the chat's chosen kernel, else under `auto` the kernel bound to the project's main entry. An entry-less
 * `auto` project and a caller that sends no snapshot name none, and the gateway then records no kernel label.
 */
describe('LW17 kernel label on every model call', () => {
  const kernelsOf = async (snapshot: CreateAgentSessionOptions['snapshot']): Promise<Array<string | undefined>> => {
    const requests: ModelStreamRequest[] = [];
    const session = await sessionOn(await createMemoryEventLog(), {
      runId: 'run-1',
      requests,
      clock: { now: origin },
      overrides: snapshot === undefined ? {} : { snapshot },
    });
    await session.prompt({ id: 'u-1', role: 'user', content: 'make a nut' });
    await session.close();
    return requests.map((request) => request.kernel);
  };
  const owner = { kernel: 'openscad', entryPath: 'main.scad' };

  it.each([
    ['a chosen kernel', { kernel: { preference: 'replicad', owner, available: [] } }, 'replicad'],
    ['auto with a bound entry', { kernel: { preference: 'auto', owner, available: [] } }, 'openscad'],
    ['auto with no entry', { kernel: { preference: 'auto', available: [] } }, undefined],
    ['no kernel object', { other: true }, undefined],
    ['no snapshot', undefined, undefined],
  ] as const)('should name the kernel for %s', async (_case, snapshot, kernel) => {
    const kernels = await kernelsOf(snapshot);

    expect(kernels.length).toBeGreaterThan(0);
    expect(new Set(kernels)).toEqual(new Set([kernel]));
  });
});
