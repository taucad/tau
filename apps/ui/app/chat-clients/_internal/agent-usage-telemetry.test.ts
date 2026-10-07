import { describe, expect, it, vi } from 'vitest';
import type { ClientMetricEntry } from '@taucad/telemetry';
import { initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import {
  agentIdentityOf,
  createAgentSessionTracker,
  reportRefusedAgentTurn,
  trackAgentTurn,
} from '#chat-clients/_internal/agent-usage-telemetry.js';

const external = { tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex' } };

const harness = (runId: string, prior: ReadonlyArray<Record<string, unknown>> = [], onAccepted?: () => void) => {
  let projection: ChatProjection = initialChatProjection;
  let cursor = 0;
  const listeners = new Set<() => void>();
  let clock = 1000;
  const report = vi.fn<(entry: ClientMetricEntry) => void>();
  const publish = (rows: ReadonlyArray<Record<string, unknown>>, at: number): void => {
    clock = at;
    const events = rows.map((row, index) => ({ ...row, runId, sequence: cursor + index }));
    projection = reduceChatProjection(projection, {
      type: 'batch',
      answer: { status: 'batch', cursor, nextCursor: cursor + rows.length, endCursor: cursor + rows.length, events },
    }).state;
    cursor += rows.length;
    for (const listener of listeners) {
      listener();
    }
  };
  publish(prior, clock);
  trackAgentTurn({
    runId,
    identity: { agentId: 'codex', placement: 'daemon' },
    admittedAt: clock,
    now: () => clock,
    report,
    ...(onAccepted === undefined ? {} : { onAccepted }),
    source: {
      getProjection: () => projection,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  });
  return { publish, report, listeners };
};

const toolRows = (callId: string, kind: string, isError: boolean) => [
  logRow(0, {
    type: 'message.appended',
    message: {
      id: `${callId}-in`,
      role: 'tool-input',
      toolCallId: callId,
      toolName: 'shell',
      content: {},
      call: { toolCallId: callId, kind, status: 'pending' },
      metadata: external,
    },
  }),
  logRow(0, {
    type: 'message.appended',
    message: {
      id: `${callId}-out`,
      role: 'tool-output',
      toolCallId: callId,
      toolName: 'shell',
      content: 'ok',
      isError,
      call: { toolCallId: callId, kind, status: isError ? 'failed' : 'completed' },
      metadata: external,
    },
  }),
];

const usageRow = (id: string, input: number) =>
  logRow(0, {
    type: 'message.appended',
    message: {
      id,
      role: 'assistant',
      content: 'Done.',
      metadata: {
        model: 'gpt-5',
        usage: {
          input,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: input + 1,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        ...external,
      },
    },
  });

describe('trackAgentTurn', () => {
  it('reports one completed turn with time to first update, tool kinds and reported tokens', () => {
    const { publish, report, listeners } = harness('run_ok');
    publish([lifecycleRow(0, 'admitted', 'run_ok'), lifecycleRow(0, 'running', 'run_ok')], 1200);
    expect(report).not.toHaveBeenCalled();
    publish([...toolRows('c1', 'execute', false), ...toolRows('c2', 'read', true)], 1500);
    publish(
      [
        logRow(0, {
          type: 'message.appended',
          message: {
            id: 'final',
            role: 'assistant',
            content: 'Done.',
            metadata: {
              model: 'gpt-5',
              usage: {
                input: 100,
                output: 20,
                cacheRead: 50,
                cacheWrite: 0,
                totalTokens: 170,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
              ...external,
            },
          },
        }),
        lifecycleRow(0, 'completed', 'run_ok'),
      ],
      4000,
    );

    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toEqual({
      name: 'agent.turn',
      duration: 3000,
      detail: {
        agentId: 'codex',
        placement: 'daemon',
        outcome: 'completed',
        timeToFirstUpdate: 500,
        toolCalls: [
          { kind: 'execute', status: 'completed', count: 1 },
          { kind: 'read', status: 'failed', count: 1 },
        ],
        tokens: { input: 100, output: 20, cacheRead: 50, cacheWrite: 0 },
      },
    });
    expect(listeners.size).toBe(0);
  });

  it('omits tokens an agent never reported and carries the failure code', () => {
    const { publish, report } = harness('run_fail');
    publish(
      [
        lifecycleRow(0, 'admitted', 'run_fail'),
        logRow(0, {
          type: 'run.lifecycle',
          state: 'failed',
          attempt: 1,
          detail: { message: 'stalled', code: 'MODEL_STREAM_STALLED' },
        }),
      ],
      2000,
    );
    const { detail } = report.mock.calls[0]![0] as Extract<ClientMetricEntry, { name: 'agent.turn' }>;
    expect(detail).toEqual({
      agentId: 'codex',
      placement: 'daemon',
      outcome: 'error',
      errorCode: 'MODEL_STREAM_STALLED',
    });
  });

  it('reports a resumed run at its next terminal row, counting only what the new attempt did', () => {
    const failed = {
      type: 'run.lifecycle',
      state: 'failed',
      attempt: 1,
      detail: { message: 'stalled', code: 'MODEL_STREAM_STALLED', resumable: true },
    };
    const attemptOne = [
      lifecycleRow(0, 'admitted', 'run_resume'),
      lifecycleRow(0, 'running', 'run_resume'),
      ...toolRows('old', 'edit', false),
      usageRow('old-usage', 1000),
      logRow(0, failed),
    ];
    const onAccepted = vi.fn();
    const { publish, report } = harness('run_resume', attemptOne, onAccepted);
    expect(report).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
    publish([logRow(0, { type: 'run.lifecycle', state: 'running', attempt: 2 })], 1300);
    expect(onAccepted).toHaveBeenCalledOnce();
    publish(
      [
        ...toolRows('new', 'read', false),
        usageRow('new-usage', 10),
        logRow(0, { type: 'run.lifecycle', state: 'completed', attempt: 2 }),
      ],
      1800,
    );
    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0]![0]).toEqual({
      name: 'agent.turn',
      duration: 800,
      detail: {
        agentId: 'codex',
        placement: 'daemon',
        outcome: 'completed',
        timeToFirstUpdate: 800,
        toolCalls: [{ kind: 'read', status: 'completed', count: 1 }],
        tokens: { input: 10, output: 1, cacheRead: 0, cacheWrite: 0 },
      },
    });
  });

  it('counts a cancelled run as cancelled', () => {
    const { publish, report } = harness('run_stop');
    publish([lifecycleRow(0, 'admitted', 'run_stop'), lifecycleRow(0, 'cancelled', 'run_stop')], 1100);
    expect(report.mock.calls[0]![0]).toMatchObject({ detail: { outcome: 'cancelled' } });
  });
});

describe('agentIdentityOf', () => {
  it('names Tau and external agents with their placement', () => {
    expect(agentIdentityOf({ kind: 'tau', model: 'm' })).toEqual({ agentId: 'tau', placement: 'browser' });
    expect(agentIdentityOf({ kind: 'acp', agentId: 'codex', hostId: 'origin' })).toEqual({
      agentId: 'codex',
      placement: 'daemon',
    });
    expect(agentIdentityOf({ kind: 'acp', agentId: 'Not Valid!', hostId: 'desktop' })).toEqual({
      agentId: 'other',
      placement: 'desktop',
    });
  });
});

describe('agent sessions and refusals', () => {
  it('starts once per agent, ends on switch and refuses only when no session is open', () => {
    const report = vi.fn<(entry: ClientMetricEntry) => void>();
    const session = createAgentSessionTracker(report);
    const codex = { agentId: 'codex', placement: 'daemon' } as const;
    const tau = { agentId: 'tau', placement: 'browser' } as const;
    session.refused(codex);
    session.admitted(codex);
    session.admitted(codex);
    session.refused(codex);
    session.admitted(tau);
    session.end();
    expect(report.mock.calls.map(([entry]) => [entry.detail, entry.name])).toEqual([
      [{ ...codex, outcome: 'refused' }, 'agent.session'],
      [{ ...codex, outcome: 'started' }, 'agent.session'],
      [{ ...codex, outcome: 'ended' }, 'agent.session'],
      [{ ...tau, outcome: 'started' }, 'agent.session'],
      [{ ...tau, outcome: 'ended' }, 'agent.session'],
    ]);
  });

  it('reports a refused turn with a bounded code', () => {
    const report = vi.fn<(entry: ClientMetricEntry) => void>();
    const codex = { agentId: 'codex', placement: 'daemon' } as const;
    reportRefusedAgentTurn({
      identity: codex,
      error: Object.assign(new Error('x'), { code: 'CHAT_PLACEMENT_UNAVAILABLE' }),
      duration: 12,
      report,
    });
    reportRefusedAgentTurn({ identity: codex, error: new Error('free text'), duration: 3, report });
    /* The credit preflight throws the gateway's structured 402 payload as its message. */
    const credits = JSON.stringify({
      category: 'credits',
      title: 'Credits',
      message: 'Add credits',
      code: 'INSUFFICIENT_CREDIT',
    });
    reportRefusedAgentTurn({ identity: codex, error: new Error(credits), duration: 4, report });
    expect(report.mock.calls.map(([entry]) => entry.detail)).toEqual([
      { ...codex, outcome: 'refused', errorCode: 'CHAT_PLACEMENT_UNAVAILABLE' },
      { ...codex, outcome: 'refused', errorCode: 'ADMISSION_FAILED' },
      { ...codex, outcome: 'refused', errorCode: 'INSUFFICIENT_CREDIT' },
    ]);
  });
});
