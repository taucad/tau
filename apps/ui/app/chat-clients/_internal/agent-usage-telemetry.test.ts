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

type TrackOptions = Parameters<typeof trackAgentTurn>[0];

const harness = (
  runId: string,
  options: Partial<Pick<TrackOptions, 'identity' | 'usageMetrics' | 'onAccepted'>> & {
    prior?: ReadonlyArray<Record<string, unknown>>;
  } = {},
) => {
  const { prior = [], ...extra } = options;
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
    ...extra,
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

/** One of Tau's own tool calls: no `external` origin, so the chunk keeps its Tau name and input. */
const tauToolRows = (callId: string, toolName: string, io: { input: unknown; output: unknown }) => [
  logRow(0, {
    type: 'message.appended',
    message: { id: `${callId}-in`, role: 'tool-input', toolCallId: callId, toolName, content: io.input },
  }),
  logRow(0, {
    type: 'message.appended',
    message: {
      id: `${callId}-out`,
      role: 'tool-output',
      toolCallId: callId,
      toolName,
      content: io.output,
      isError: false,
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
    const { publish, report } = harness('run_resume', { prior: attemptOne, onAccepted });
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

  it('names Tau tools and folds the turn context only with usage-metrics consent, never its paths or messages', () => {
    const { publish, report } = harness('run_ctx', {
      identity: { agentId: 'tau', placement: 'browser' },
      usageMetrics: { kernelId: 'replicad' },
    });
    publish([lifecycleRow(0, 'admitted', 'run_ctx'), lifecycleRow(0, 'running', 'run_ctx')], 1200);
    publish(
      [
        ...tauToolRows('r1', 'read_file', {
          input: { path: '.agents/skills/cad-replicad/reference/sketching.md' },
          output: 'ten bytes!',
        }),
        ...tauToolRows('s1', 'use_skill', { input: { skillName: 'cad-replicad' }, output: { ok: true } }),
        ...tauToolRows('e1', 'evaluate_model', {
          input: { path: 'model.ts' },
          output: {
            status: 'error',
            kernelIssues: [{ severity: 'error', type: 'runtime', message: 'draw is not a function' }],
          },
        }),
        ...tauToolRows('w1', 'edit_file', {
          input: { targetFile: 'model.ts', content: 'export default 1;' },
          output: { ok: true },
        }),
      ],
      1500,
    );
    publish([lifecycleRow(0, 'completed', 'run_ctx')], 2000);
    const entry = report.mock.calls[0]![0] as Extract<ClientMetricEntry, { name: 'agent.turn' }>;
    expect(entry.detail.toolCalls?.map((call) => call.tool)).toEqual([
      'read_file',
      'use_skill',
      'evaluate_model',
      'edit_file',
    ]);
    expect(entry.detail.context).toEqual({
      kernelId: 'replicad',
      skillsActivated: ['cad-replicad'],
      callsBeforeFirstModelWrite: 3,
      timeToFirstModelWrite: 500,
      referenceLookups: [{ outcome: 'ok', count: 1 }],
      referenceBytesRead: 10,
      evaluations: [{ class: 'api_misuse', count: 1 }],
      correctionsAfterError: 1,
    });
    const serialised = JSON.stringify(entry);
    for (const secret of ['/', '.agents', 'sketching', '.md', '.ts', 'is not a function', 'export default']) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('omits tool names and context without consent', () => {
    const { publish, report } = harness('run_quiet');
    publish([lifecycleRow(0, 'admitted', 'run_quiet'), lifecycleRow(0, 'running', 'run_quiet')], 1200);
    publish(
      [
        ...tauToolRows('w1', 'edit_file', { input: { targetFile: 'model.ts' }, output: { ok: true } }),
        lifecycleRow(0, 'completed', 'run_quiet'),
      ],
      1500,
    );
    const { detail } = report.mock.calls[0]![0] as Extract<ClientMetricEntry, { name: 'agent.turn' }>;
    expect(detail.context).toBeUndefined();
    expect(detail.toolCalls).toEqual([{ kind: 'edit', status: 'completed', count: 1 }]);
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
