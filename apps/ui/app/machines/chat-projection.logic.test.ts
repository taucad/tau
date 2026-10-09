/**
 * The chat projection (W9 PV-S7): parity with the page's scans on recorded logs,
 * O(1) work per row, discarded non-contiguous batches and a JSON-safe context.
 */

import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentLauncher } from '@taucad/agent-host/launcher';
import { createNodeChatStore } from '@taucad/agent-host/node';
import { createTauCloudGatewayModelTransport } from '@taucad/agent-host';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { foreignEventChanges } from '@taucad/xstate-testing/paths';
import type { AgentLogEvent } from '@taucad/agent-host';
import { projectAgentHostEvent, runFailureText } from '#services/agent-host-event-projection.js';
import {
  chatProjectionLogic,
  chunksOf,
  digestLogSegments,
  initialChatProjection,
  materializeTranscript,
  reduceChatProjection,
  selectAttentionRow,
  selectCaughtUp,
  selectOpenInterrupts,
  selectRunFailure,
  selectPosition,
  selectRunPhase,
  selectTranscriptSource,
  selectToolsInFlight,
  selectTurnRevision,
} from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionReadAnswer } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';

/* Three recorded runs, and two seeded logs whose runs pause on an interrupt. */
const logs = [
  'recorded/in-project-ping-pong-turn',
  'recorded/daemon-reattach-hexnut',
  'recorded/daemon-reattach-hexnut-4runs',
  'seeded/legal-attempts',
  'seeded/cancel-after-settled-pause',
  'recorded/kinetic-regenerate-resume',
] as const;

const terminalChunk = new Set(['finish', 'error', 'abort']);
const durable = (chunks: ReadonlyArray<{ type: string }>) => chunks.filter((chunk) => !terminalChunk.has(chunk.type));

const readLog = (name: string): AgentLogEvent[] =>
  readFileSync(
    new URL(`../../../../packages/agent-host/specs/ChatLog/${name}.jsonl`, pathToFileURL(import.meta.filename)),
    'utf8',
  )
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as AgentLogEvent);

const batch = (rows: readonly unknown[], cursor: number, endCursor: number): ChatProjectionReadAnswer => ({
  status: 'batch',
  cursor,
  nextCursor: cursor + rows.length,
  endCursor,
  events: rows,
});

/** Feed a log in batches of `size`, as a reader at the projection's cursor would. */
const project = (rows: readonly unknown[], size: number, start: ChatProjection = initialChatProjection) => {
  let state = start;
  for (let at = 0; at < rows.length; at += size) {
    state = reduceChatProjection(state, {
      type: 'batch',
      answer: batch(rows.slice(at, at + size), at, rows.length),
    }).state;
  }
  return state;
};

/**
 * Today's page, as the parity oracle: the tool parts the AI SDK holds after each row's chunks, counted the way
 * `countToolParts` counts them (in flight: `input-*`; approvals: `approval-requested`).
 */
const pageScan = () => {
  const parts = new Map<string, 'input' | 'output' | 'approval'>();
  const names = new Map<string, string>();
  return (event: AgentLogEvent) => {
    for (const chunk of projectAgentHostEvent(event)) {
      switch (chunk.type) {
        case 'tool-input-available':
        case 'tool-input-start': {
          parts.set(chunk.toolCallId, 'input');
          names.set(chunk.toolCallId, chunk.toolName);
          break;
        }
        case 'tool-output-available':
        case 'tool-output-error': {
          parts.set(chunk.toolCallId, 'output');
          break;
        }
        case 'tool-approval-request': {
          parts.set(chunk.toolCallId, 'approval');
          break;
        }
        default: {
          break;
        }
      }
    }
    const inFlight = [...parts].filter(([, state]) => state === 'input').map(([id]) => id);
    return {
      inFlight: inFlight.length,
      approvals: [...parts.values()].filter((state) => state === 'approval').length,
      toolName: inFlight.length === 0 ? undefined : names.get(inFlight.at(-1)!),
    };
  };
};

describe('chatProjectionLogic (PV-S7)', () => {
  it('publishes validated catch-up once while retaining the latest foreign projection', () => {
    const actor = createActor(chatProjectionLogic).start();
    try {
      const base = actor.getSnapshot().context;
      const staged = project([lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')], 1);
      expect(actor.getSnapshot().context.ledger.position.cursor).toBe(0);
      actor.send({
        type: 'remote',
        segments: [
          {
            deviceId: 'other-device',
            bytes: new TextEncoder().encode(JSON.stringify(lifecycleRow(0, 'admitted', 'foreign-run')) + '\n'),
          },
        ],
      });
      const currentRemote = actor.getSnapshot().context.remote;
      const commit = { type: 'catch-up', base, projection: staged } as const;
      actor.send(commit);
      expect(actor.getSnapshot().context.ledger.position.cursor).toBe(2);
      expect(actor.getSnapshot().context.remote).toBe(currentRemote);
    } finally {
      actor.stop();
    }
  });

  it('retains a nonzero reset version when validated catch-up installs its private initial fold', () => {
    const actor = createActor(chatProjectionLogic).start();
    try {
      actor.send({ type: 'reset' });
      const base = actor.getSnapshot().context;
      const staged = project([lifecycleRow(0, 'admitted')], 1);
      const commit = { type: 'catch-up', base, projection: staged } as const;
      actor.send(commit);
      expect(actor.getSnapshot().context.ledger.position.cursor).toBe(1);
      expect(actor.getSnapshot().context.resetVersion).toBe(base.resetVersion);
    } finally {
      actor.stop();
    }
  });

  it('rejects held catch-up after empty reset even when the empty ledger identity is reused', () => {
    const actor = createActor(chatProjectionLogic).start();
    try {
      const base = actor.getSnapshot().context;
      const staged = project([lifecycleRow(0, 'admitted')], 1);
      actor.send({ type: 'reset' });
      const commit = { type: 'catch-up', base, projection: staged } as const;
      actor.send(commit);
      expect(actor.getSnapshot().context.ledger.position.cursor).toBe(0);
    } finally {
      actor.stop();
    }
  });

  it('should preserve external admission before its canonical user arrives', async () => {
    const user = {
      id: 'external-user',
      role: 'user',
      content: 'Which other printer?',
    } as const;
    const rows = [
      {
        ...lifecycleRow(0, 'admitted'),
        admission: { kind: 'external', turnId: user.id, message: user },
      },
    ];
    expect(await materializeTranscript(project(rows, 1), 'run_1')).toEqual([
      expect.objectContaining({
        id: user.id,
        role: 'user',
        parts: [{ type: 'text', text: user.content }],
      }),
    ]);
  });

  it('should keep original input and authentic steering between their assistant segments for every read chunking', async () => {
    const user = {
      id: 'original-user',
      role: 'user',
      content: 'Original prompt',
    } as const;
    const rows = [
      {
        ...lifecycleRow(0, 'admitted'),
        admission: { kind: 'tau', turnId: user.id, message: user },
      },
      lifecycleRow(1, 'running'),
      logRow(2, { type: 'message.appended', message: user }),
      logRow(3, {
        type: 'message.appended',
        message: {
          id: 'answer-before',
          role: 'assistant',
          content: 'Before steering',
        },
      }),
      logRow(4, {
        type: 'message.appended',
        message: {
          id: 'tau:approval-answer:1',
          role: 'user',
          content: 'Internal reminder',
          metadata: { tauInternal: { kind: 'approval-answer' } },
        },
      }),
      logRow(5, {
        type: 'message.appended',
        message: {
          id: 'steer:command-1',
          role: 'user',
          content: 'Real steering',
        },
      }),
      logRow(6, {
        type: 'message.appended',
        message: {
          id: 'answer-after',
          role: 'assistant',
          content: 'After steering',
        },
      }),
      lifecycleRow(7, 'completed'),
    ];
    await Promise.all(
      Array.from({ length: rows.length }, async (_unused, index) => {
        const result = await materializeTranscript(project(rows, index + 1));
        expect(result.map((message) => message.id)).toEqual([
          'original-user',
          'run_1',
          'steer:command-1',
          'run_1:steer:command-1',
        ]);
        expect(
          result.map((message) =>
            message.parts
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join(''),
          ),
        ).toEqual(['Original prompt', 'Before steering', 'Real steering', 'After steering']);
      }),
    );
    const replacement = {
      id: 'steer:command-1',
      role: 'user',
      content: 'Edited steering',
    } as const;
    const rewindRows = [
      ...rows,
      {
        ...lifecycleRow(8, 'admitted', 'run_2'),
        admission: {
          kind: 'tau',
          turnId: replacement.id,
          message: replacement,
          rewind: {
            trigger: 'edit',
            retainedMessageIds: ['original-user', 'answer-before', 'tau:approval-answer:1'],
          },
        },
      },
      logRow(9, {
        runId: 'run_2',
        type: 'history.rewound',
        trigger: 'edit',
        retainedMessageIds: ['original-user', 'answer-before', 'tau:approval-answer:1'],
      }),
      lifecycleRow(10, 'running', 'run_2'),
      logRow(11, {
        runId: 'run_2',
        type: 'message.appended',
        message: replacement,
      }),
      logRow(12, {
        runId: 'run_2',
        type: 'message.appended',
        message: {
          id: 'replacement-answer',
          role: 'assistant',
          content: 'Replacement output',
        },
      }),
      lifecycleRow(13, 'completed', 'run_2'),
    ];
    await Promise.all(
      Array.from({ length: rewindRows.length }, async (_unused, index) => {
        const result = await materializeTranscript(project(rewindRows, index + 1));
        expect(result.map((message) => message.id)).toEqual(['original-user', 'run_1', 'steer:command-1', 'run_2']);
        expect(
          result.map((message) =>
            message.parts
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join(''),
          ),
        ).toEqual(['Original prompt', 'Before steering', 'Edited steering', 'Replacement output']);
      }),
    );
  });

  it('keeps the admitted Tau user until canonical history replaces it once', async () => {
    const message = { id: 'u-seed', role: 'user', content: 'Make a cube' } as const;
    const admitted = {
      ...lifecycleRow(0, 'admitted'),
      admission: { kind: 'tau', trigger: 'submit', turnId: message.id, message },
    };
    const pending = project([admitted], 1);
    const pendingMessages = await materializeTranscript(pending);
    expect(pendingMessages.filter((entry) => entry.role === 'user').map((entry) => entry.id)).toEqual([message.id]);

    const appended = project(
      [admitted, logRow(1, { type: 'message.appended', message: { ...message, content: 'Make a cylinder' } })],
      1,
    );
    const appendedMessages = await materializeTranscript(appended);
    expect(appendedMessages.filter((entry) => entry.role === 'user')).toEqual([
      expect.objectContaining({ id: message.id, parts: [{ type: 'text', text: 'Make a cylinder' }] }),
    ]);

    const committed = project(
      [
        admitted,
        logRow(1, {
          type: 'turn.history-projection-committed',
          retainedMessageIds: [],
          message: { ...message, content: 'Make a sphere' },
          context: { version: 1, systemPrompt: 'system', initialMessages: [], postCompactionMessages: [] },
        }),
      ],
      1,
    );
    const committedMessages = await materializeTranscript(committed);
    expect(committedMessages.filter((entry) => entry.role === 'user')).toEqual([
      expect.objectContaining({ id: message.id, parts: [{ type: 'text', text: 'Make a sphere' }] }),
    ]);
    expect(
      project([{ ...admitted, admission: { ...admitted.admission, message: { ...message, role: 'assistant' } } }], 1)
        .views['run_1']?.user,
    ).toBeUndefined();
    expect(
      project([{ ...admitted, admission: { ...admitted.admission, kind: 'other' } }], 1).views['run_1']?.user,
    ).toBeUndefined();
  });

  it('keeps live text in an ephemeral watched overlay and reconciles durable output without doubling it', () => {
    const running = project([lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')], 2);
    const preview = reduceChatProjection(running, {
      type: 'live',
      event: {
        type: 'text-delta',
        chatId: 'chat_1',
        runId: 'run_1',
        messageId: 'assistant-1',
        contentIndex: 0,
        delta: 'Partial reply',
      },
    }).state;
    expect(chunksOf(preview.live?.chunks).filter((chunk) => chunk.type === 'text-delta')).toEqual([
      expect.objectContaining({ delta: 'Partial reply' }),
    ]);
    expect(chunksOf(preview.views['run_1']?.chunks).some((chunk) => chunk.type === 'text-delta')).toBe(false);

    const completed = reduceChatProjection(preview, {
      type: 'batch',
      answer: batch(
        [
          logRow(2, {
            type: 'message.appended',
            message: { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'Partial reply' }] },
          }),
          lifecycleRow(3, 'completed'),
        ],
        2,
        4,
      ),
    }).state;
    expect(chunksOf(completed.live?.chunks).filter((chunk) => chunk.type === 'text-delta')).toHaveLength(1);
    expect(chunksOf(completed.views['run_1']?.chunks).filter((chunk) => chunk.type === 'text-delta')).toHaveLength(1);
    expect(
      reduceChatProjection(completed, {
        type: 'clear-live',
        runId: 'another-run',
      }).state.live,
    ).toBeDefined();
    const retired = reduceChatProjection(completed, {
      type: 'clear-live',
      runId: 'run_1',
    }).state;
    expect(retired.live).toBeUndefined();
    expect(chunksOf(retired.views['run_1']?.chunks).filter((chunk) => chunk.type === 'text-delta')).toHaveLength(1);
  });
  it.each(logs)('agrees with the page’s run phase and tool scans at every row of %s', (name) => {
    const rows = readLog(name);
    const scan = pageScan();
    let state = initialChatProjection;
    let lifecycle = 'none';
    for (const [index, row] of rows.entries()) {
      state = reduceChatProjection(state, { type: 'batch', answer: batch([row], index, rows.length) }).state;
      const page = scan(row);
      lifecycle = row.type === 'run.lifecycle' ? row.state : lifecycle;
      expect(selectRunPhase(state), `row ${String(index)}`).toBe(lifecycle);
      expect(Object.keys(selectOpenInterrupts(state)).length, `row ${String(index)}`).toBe(page.approvals);
      /* The chat machine clears its tool facts when a run ends (`clearRunDetail`); the page scan never does. */
      if (lifecycle === 'admitted' || lifecycle === 'running') {
        const tools = selectToolsInFlight(state);
        expect({ count: tools.count, toolName: tools.toolName }, `row ${String(index)}`).toEqual({
          count: page.inFlight,
          toolName: page.toolName,
        });
      }
    }
    expect(selectPosition(state).cursor).toBe(rows.length);
  });

  it('is invariant to how the log is chunked', () => {
    const rows = readLog('recorded/daemon-reattach-hexnut-4runs');
    const one = project(rows, 1);
    for (const size of [2, 7, 16, rows.length]) {
      expect(project(rows, size)).toEqual(one);
    }
  });

  it('keeps each run’s durable UI chunks for a watch without a second log reader', () => {
    const rows = readLog('recorded/in-project-ping-pong-turn');
    const state = project(rows, 7);
    const { runId } = rows.find((row) => row.type === 'run.lifecycle' && row.state === 'admitted')!;
    const chunks = chunksOf(state.views[runId]?.chunks);

    expect(chunks[0]).toMatchObject({ type: 'start', messageId: runId });
    expect(chunks.some((chunk) => chunk.type === 'finish')).toBe(true);
    expect(chunks.some((chunk) => chunk.type === 'text-delta')).toBe(true);
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- the JSON round trip proves watch state is serializable.
    expect(JSON.parse(JSON.stringify(state.views))).toEqual(state.views);
  });

  it('materializes the live transcript from the same terminal log', async () => {
    const rows = readLog('recorded/in-project-ping-pong-turn');
    const projected = project(rows, 7);
    expect(await materializeTranscript(projected)).toEqual(await materializeTranscript(project(rows, 1)));
    expect(await materializeTranscript(projected)).toEqual(await materializeTranscript(projected));
    const watched = projected.ledger.currentRunId!;
    const withoutWatchedRun = await materializeTranscript(projected, watched);
    expect(withoutWatchedRun.some((message) => message.id === watched)).toBe(false);
  });

  it('refolds another device’s run when its segment digest changes', async () => {
    const own = readLog('recorded/in-project-ping-pong-turn');
    const remote = readLog('recorded/daemon-reattach-hexnut');
    const segment = (rows: readonly AgentLogEvent[]) => [
      {
        deviceId: 'other-device',
        bytes: new TextEncoder().encode(rows.map((row) => JSON.stringify(row)).join('\n') + '\n'),
      },
    ];
    const before = segment(remote.slice(0, 3));
    const after = segment(remote);
    const ownProjection = project(own.slice(0, 10), 7);
    const first = reduceChatProjection(ownProjection, { type: 'remote', segments: before }).state;
    const second = reduceChatProjection(first, { type: 'remote', segments: after }).state;
    const completed = project(own, 7, second);

    expect(digestLogSegments(after)).not.toBe(digestLogSegments(before));
    expect(second.remote?.digest).toBe(digestLogSegments(after));
    expect(await materializeTranscript(completed)).toEqual([
      ...(await materializeTranscript(project(remote, 1))),
      ...(await materializeTranscript(project(own, 1))),
    ]);
    expect(reduceChatProjection(second, { type: 'remote', segments: after }).state).toBe(second);
    expect(completed.remote).toBe(second.remote);
  });

  it('keeps a device’s run order when its clock moves backwards', () => {
    const rows = [
      { ...lifecycleRow(0, 'admitted', 'run_z'), leaderEpoch: 'earlier', recordedAt: '2026-09-28T00:00:02.000Z' },
      { ...lifecycleRow(0, 'admitted', 'run_a'), leaderEpoch: 'later', recordedAt: '2026-09-28T00:00:01.000Z' },
    ];
    const segment = {
      deviceId: 'other-device',
      bytes: new TextEncoder().encode(rows.map((row) => JSON.stringify(row)).join('\n')),
    };
    const remote = reduceChatProjection(initialChatProjection, { type: 'remote', segments: [segment] }).state;

    expect(selectTranscriptSource(remote).map((view) => view.runId)).toEqual(['run_z', 'run_a']);
  });

  it('refolds same-length remote bytes when an earlier row changes but the tail key does not', async () => {
    const remote = readLog('recorded/daemon-reattach-hexnut').slice(0, 3);
    const segment = (rows: readonly AgentLogEvent[]) => [
      { deviceId: 'other-device', bytes: new TextEncoder().encode(rows.map((row) => JSON.stringify(row)).join('\n')) },
    ];
    const before = segment(remote);
    const after = [
      {
        deviceId: 'other-device',
        bytes: new TextEncoder().encode(new TextDecoder().decode(before[0]!.bytes).replace('30mm', '40mm')),
      },
    ];
    expect(after[0]?.bytes.byteLength).toBe(before[0]?.bytes.byteLength);
    expect(new TextDecoder().decode(after[0]!.bytes).split('\n').at(-1)).toBe(
      new TextDecoder().decode(before[0]!.bytes).split('\n').at(-1),
    );
    expect(digestLogSegments(after)).not.toBe(digestLogSegments(before));

    const first = reduceChatProjection(initialChatProjection, { type: 'remote', segments: before }).state;
    const second = reduceChatProjection(first, { type: 'remote', segments: after }).state;
    expect(second.remote?.views).not.toEqual(first.remote?.views);
    expect(await materializeTranscript(second)).not.toEqual(await materializeTranscript(first));
    expect(JSON.stringify(await materializeTranscript(second))).toContain('40mm');
  });

  it('never revisits a row it already folded: O(1) work per row (L3 D19)', () => {
    const rows = readLog('recorded/daemon-reattach-hexnut-4runs');
    const reads = rows.map(() => 0);
    const watched = rows.map(
      (row, index) =>
        new Proxy(row, {
          get: (target, key, receiver) => {
            reads[index]! += 1;
            return Reflect.get(target, key, receiver) as unknown;
          },
        }),
    );
    let state = initialChatProjection;
    for (const [index, row] of watched.entries()) {
      const before = reads.slice(0, index);
      state = reduceChatProjection(state, { type: 'batch', answer: batch([row], index, rows.length) }).state;
      expect(reads.slice(0, index)).toEqual(before);
    }
    expect(selectPosition(state).cursor).toBe(rows.length);
  });

  it('drops the rows it already holds when a stream replays the log from row 0 (SC-R12)', () => {
    const rows = readLog('recorded/daemon-reattach-hexnut-4runs');
    const held = project(rows.slice(0, 10), 10);
    expect(project(rows, 16, held)).toEqual(project(rows, 1));
    const replayed = reduceChatProjection(held, { type: 'batch', answer: batch(rows.slice(0, 4), 0, rows.length) });
    expect(replayed.state.ledger).toBe(held.ledger);
    expect(replayed.state.openTools).toBe(held.openTools);
    expect(replayed.state.views).toBe(held.views);
    expect(replayed.state.blocks).toBe(held.blocks);
    /* It still learns where the log ends, so it knows it no longer holds all of it. */
    expect(replayed.state.endCursor).toBe(rows.length);
  });

  it('holds the log only once its cursor reaches the end the last answer stated', () => {
    const rows = readLog('recorded/in-project-ping-pong-turn');
    const first = reduceChatProjection(initialChatProjection, {
      type: 'batch',
      answer: batch(rows.slice(0, 16), 0, rows.length),
    }).state;
    expect(selectCaughtUp(first)).toBe(false);
    expect(selectCaughtUp(project(rows, 16))).toBe(true);
  });

  it('keeps what a failed row said until its run’s next lifecycle row', () => {
    const rows = readLog('seeded/legal-attempts');
    const failedAt = rows.findIndex((row) => row.type === 'run.lifecycle' && row.state === 'failed');
    const failed = rows[failedAt]!;
    const detail = failed.type === 'run.lifecycle' ? failed.detail : undefined;
    const atFailure = project(rows.slice(0, failedAt + 1), 1);
    expect(selectRunFailure(atFailure, failed.runId)).toBe(runFailureText(detail));
    expect(selectRunFailure(atFailure, 'another-run')).toBeUndefined();
    const reopened = rows.findIndex((row, index) => index > failedAt && row.type === 'run.lifecycle');
    expect(selectRunFailure(project(rows.slice(0, reopened + 1), 1), failed.runId)).toBeUndefined();
  });

  it('should keep the committed attempt and drop only its terminal marker when a failed run reopens', async () => {
    const rows = readLog('seeded/legal-attempts');
    const failedAt = rows.findIndex((row) => row.type === 'run.lifecycle' && row.state === 'failed');
    const reopenedAt = rows.findIndex(
      (row, index) => index > failedAt && row.type === 'run.lifecycle' && row.state === 'running',
    );
    const pausedAt = rows.findIndex(
      (row, index) => index > reopenedAt && row.type === 'run.lifecycle' && row.state === 'paused',
    );
    const continuedAt = rows.findIndex(
      (row, index) => index > pausedAt && row.type === 'run.lifecycle' && row.state === 'running',
    );
    const { runId } = rows[failedAt]!;
    const failed = project(rows.slice(0, failedAt + 1), 1).views[runId]!;
    expect(chunksOf(failed.chunks).at(-1)?.type).toBe('error');

    const reopened = project(rows.slice(0, reopenedAt + 1), 1).views[runId]!;
    expect(chunksOf(reopened.chunks)).toEqual([...durable(chunksOf(failed.chunks)), { type: 'start-step' }]);
    const paused = project(rows.slice(0, pausedAt + 1), 1).views[runId]!;
    const continued = project(rows.slice(0, continuedAt + 1), 1).views[runId]!;
    expect(chunksOf(continued.chunks).slice(0, chunksOf(paused.chunks).length)).toEqual(chunksOf(paused.chunks));

    const completed = project(rows.slice(0, rows.findIndex((row) => row.type === 'turn.finalized') + 1), 1);
    expect(chunksOf(completed.views[runId]?.chunks).some((chunk) => chunk.type === 'error')).toBe(false);
    const messages = await materializeTranscript(completed);
    expect(messages.some((message) => message.role === 'assistant')).toBe(true);
  });

  /* The kinetic-desk-toy chat (sanitized): a failed first turn, two regenerates of it — the first stopped by the
   * person, resumed and failed again, the second completed — then a turn orphaned while waiting for approval. */
  it('should keep a stopped turn whole when it resumes, and show a regenerated turn once', async () => {
    const rows = readLog('recorded/kinetic-regenerate-resume');
    const stoppedAt = rows.findIndex((row) => row.type === 'run.lifecycle' && row.state === 'cancelled');
    const { runId } = rows[stoppedAt]!;
    const resumedAt = rows.findIndex(
      (row, index) => index > stoppedAt && row.type === 'run.lifecycle' && row.state === 'running',
    );
    const before = project(rows.slice(0, stoppedAt + 1), 7).views[runId]!;
    const after = project(rows.slice(0, resumedAt + 1), 7).views[runId]!;
    expect(durable(chunksOf(before.chunks)).length).toBeGreaterThan(20);
    expect(chunksOf(after.chunks).slice(0, durable(chunksOf(before.chunks)).length)).toEqual(
      durable(chunksOf(before.chunks)),
    );

    const transcript = await materializeTranscript(project(rows, 7));
    const users = transcript.filter((message) => message.role === 'user').map((message) => message.id);
    expect(users).toEqual(['msg_1JskO6ClYBK41k3UxSBc9', 'msg_qhR4h2Hntr2ECEKBa5LFy']);
    expect(transcript.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  /* Resume everywhere, over every corpus: a reopen never removes durable content, and a rewind leaves each user turn
   * in the transcript at most once. */
  it.each(logs)('should never lose durable chunks to a reopen, nor repeat a user turn, in %s', async (name) => {
    const rows = readLog(name);
    for (const [index, row] of rows.entries()) {
      const before =
        row.type === 'run.lifecycle' && row.state === 'running' ? project(rows.slice(0, index), 1) : undefined;
      const view = before?.views[row.runId];
      if (view?.terminal !== undefined) {
        const after = project(rows.slice(0, index + 1), 1).views[row.runId]!;
        expect(chunksOf(after.chunks).slice(0, durable(chunksOf(view.chunks)).length)).toEqual(
          durable(chunksOf(view.chunks)),
        );
      }
    }
    const transcript = await materializeTranscript(project(rows, 3));
    const users = transcript.filter((message) => message.role === 'user').map((message) => message.id);
    expect(new Set(users).size).toBe(users.length);
  });

  it('should hide a run whose user turn a regenerate dropped, but keep a turn a compaction evicted', async () => {
    const user = (id: string) => ({ id, role: 'user', content: 'x' });
    const assistant = (id: string) => ({ id, role: 'assistant', content: [{ type: 'text', text: id }] });
    const rows = [
      lifecycleRow(0, 'admitted', 'r1'),
      logRow(1, { runId: 'r1', type: 'message.appended', message: user('u1') }),
      lifecycleRow(2, 'running', 'r1'),
      logRow(3, { runId: 'r1', type: 'message.appended', message: assistant('a1') }),
      lifecycleRow(4, 'completed', 'r1'),
      lifecycleRow(5, 'admitted', 'r2'),
      logRow(6, { runId: 'r2', type: 'message.appended', message: user('u2') }),
      lifecycleRow(7, 'running', 'r2'),
      logRow(8, {
        runId: 'r2',
        type: 'history.compacted',
        evictedMessageIds: ['u1', 'a1'],
        summary: { id: 's1', role: 'user', content: 'summary' },
      }),
      logRow(9, { runId: 'r2', type: 'message.appended', message: assistant('a2') }),
      logRow(10, {
        runId: 'r2',
        type: 'run.lifecycle',
        state: 'failed',
        attempt: 1,
        detail: { message: 'no', code: 'FATAL_TEST' },
      }),
      lifecycleRow(11, 'admitted', 'r3'),
      logRow(12, { runId: 'r3', type: 'history.rewound', trigger: 'regenerate', retainedMessageIds: ['s1'] }),
      logRow(13, { runId: 'r3', type: 'message.appended', message: user('u2') }),
    ];
    const projection = project(rows, 2);
    expect(selectTranscriptSource(projection).map((run) => run.runId)).toEqual(['r1', 'r3']);
    const transcript = await materializeTranscript(projection);
    expect(transcript.filter((message) => message.role === 'user')).toHaveLength(2);
  });

  it('should trim only the messages a rewind dropped from a run that keeps its user turn', async () => {
    const user = (id: string) => ({ id, role: 'user', content: 'x' });
    const assistant = (id: string) => ({ id, role: 'assistant', content: [{ type: 'text', text: id }] });
    const rows = [
      lifecycleRow(0, 'admitted', 'r1'),
      logRow(1, { runId: 'r1', type: 'message.appended', message: user('u1') }),
      lifecycleRow(2, 'running', 'r1'),
      logRow(3, { runId: 'r1', type: 'message.appended', message: assistant('a1') }),
      logRow(4, { runId: 'r1', type: 'message.appended', message: assistant('a2') }),
      logRow(5, { runId: 'r1', type: 'run.lifecycle', state: 'failed', attempt: 1, detail: { message: 'no' } }),
      logRow(6, { runId: 'r1', type: 'history.rewound', trigger: 'retry', retainedMessageIds: ['u1', 'a1'] }),
    ];
    const projection = project(rows, 1);
    const texts = chunksOf(projection.views['r1']?.chunks)
      .filter((chunk) => chunk.type === 'text-delta')
      .map((chunk) => chunk.delta);
    expect(texts).toEqual(['a1']);
    expect(selectTranscriptSource(projection).map((run) => run.runId)).toEqual(['r1']);
  });

  it('should retain an earlier corrected envelope without keeping a later rewound message', async () => {
    const assistant = (id: string, text: string, checkpoint = false) => ({
      id,
      role: 'assistant',
      content: [{ type: 'text', text }],
      ...(checkpoint ? { metadata: { tauInternal: { kind: 'stream', streamState: 'checkpoint' } } } : {}),
    });
    const rows = [
      lifecycleRow(0, 'admitted', 'r1'),
      logRow(1, { runId: 'r1', type: 'message.appended', message: { id: 'u1', role: 'user', content: 'x' } }),
      lifecycleRow(2, 'running', 'r1'),
      logRow(3, { runId: 'r1', type: 'message.appended', message: assistant('a1', 'first', true) }),
      ...['first extended', 'first extended again', 'first extended again finally'].map((text, index) =>
        logRow(index + 4, {
          runId: 'r1',
          type: 'message.envelope-replaced',
          messageId: 'a1',
          replacement: assistant('a1', text, true),
        }),
      ),
      logRow(7, { runId: 'r1', type: 'message.appended', message: assistant('a2', 'later must disappear') }),
      logRow(8, {
        runId: 'r1',
        type: 'message.envelope-replaced',
        messageId: 'a1',
        replacement: assistant('a1', 'corrected first'),
      }),
      logRow(9, { runId: 'r1', type: 'history.rewound', trigger: 'retry', retainedMessageIds: ['u1', 'a1'] }),
    ];
    const transcript = await materializeTranscript(project(rows, 1));
    const reply = transcript.find((message) => message.role === 'assistant');
    expect(reply?.parts.filter((part) => part.type === 'text').map((part) => part.text)).toEqual(['corrected first']);
  });

  it('should remove deleted blocks from an earlier envelope before rewinding its successor', async () => {
    const assistant = (id: string, texts: readonly string[]) => ({
      id,
      role: 'assistant',
      content: texts.map((text) => ({ type: 'text', text })),
    });
    const rows = [
      lifecycleRow(0, 'admitted', 'r1'),
      logRow(1, { runId: 'r1', type: 'message.appended', message: { id: 'u1', role: 'user', content: 'x' } }),
      lifecycleRow(2, 'running', 'r1'),
      logRow(3, { runId: 'r1', type: 'message.appended', message: assistant('a1', ['retained', 'removed']) }),
      logRow(4, { runId: 'r1', type: 'message.appended', message: assistant('a2', ['rewound']) }),
      logRow(5, {
        runId: 'r1',
        type: 'message.envelope-replaced',
        messageId: 'a1',
        replacement: assistant('a1', ['retained']),
      }),
      logRow(6, { runId: 'r1', type: 'history.rewound', trigger: 'retry', retainedMessageIds: ['u1', 'a1'] }),
    ];
    const transcript = await materializeTranscript(project(rows, 1));
    const reply = transcript.find((message) => message.role === 'assistant');
    expect(reply?.parts.filter((part) => part.type === 'text').map((part) => part.text)).toEqual(['retained']);
  });

  it.each([
    {
      name: 'array text to a shorter string',
      before: [
        { type: 'text', text: 'long original' },
        { type: 'text', text: 'removed' },
      ],
      after: 'short',
      expected: [{ type: 'text', text: 'short' }],
    },
    {
      name: 'text to thinking at the same index and prefix',
      before: [{ type: 'text', text: 'same prefix' }],
      after: [{ type: 'thinking', thinking: 'same prefix' }],
      expected: [{ type: 'reasoning', text: 'same prefix' }],
    },
  ])('should replace a checkpoint changing $name', async ({ before, after, expected }) => {
    const assistant = (content: unknown) => ({
      id: 'a1',
      role: 'assistant',
      content,
      metadata: { tauInternal: { kind: 'stream', streamState: 'checkpoint' } },
    });
    const rows = [
      lifecycleRow(0, 'admitted'),
      logRow(1, { type: 'message.appended', message: { id: 'u1', role: 'user', content: 'x' } }),
      lifecycleRow(2, 'running'),
      logRow(3, { type: 'message.appended', message: assistant(before) }),
      logRow(4, { type: 'message.envelope-replaced', messageId: 'a1', replacement: assistant(after) }),
    ];
    const transcript = await materializeTranscript(project(rows, 1));
    const reply = transcript.find((message) => message.role === 'assistant');
    expect(
      reply?.parts
        .filter((part) => part.type === 'text' || part.type === 'reasoning')
        .map(({ type, text }) => ({ type, text })),
    ).toEqual(expected);
  });

  it('should correct an envelope in a sealed steering segment without moving it to the active segment', async () => {
    const assistant = (id: string, text: string) => ({ id, role: 'assistant', content: text });
    const rows = [
      lifecycleRow(0, 'admitted'),
      logRow(1, { type: 'message.appended', message: { id: 'u1', role: 'user', content: 'Original prompt' } }),
      lifecycleRow(2, 'running'),
      logRow(3, { type: 'message.appended', message: assistant('a1', 'Original answer') }),
      logRow(4, { type: 'message.appended', message: { id: 'steer:1', role: 'user', content: 'Steering' } }),
      logRow(5, { type: 'message.appended', message: assistant('a2', 'Active answer') }),
      logRow(6, {
        type: 'message.envelope-replaced',
        messageId: 'a1',
        replacement: assistant('a1', 'Corrected answer'),
      }),
    ];
    const transcript = await materializeTranscript(project(rows, 1));
    expect(
      transcript.map((message) =>
        message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join(''),
      ),
    ).toEqual(['Original prompt', 'Corrected answer', 'Steering', 'Active answer']);
  });

  it('should trim a rewind prefix ending inside a sealed steering segment', async () => {
    const assistant = (id: string, text: string) => ({ id, role: 'assistant', content: text });
    const rows = [
      lifecycleRow(0, 'admitted'),
      logRow(1, { type: 'message.appended', message: { id: 'u1', role: 'user', content: 'Original prompt' } }),
      lifecycleRow(2, 'running'),
      logRow(3, { type: 'message.appended', message: assistant('a1', 'Retained answer') }),
      logRow(4, { type: 'message.appended', message: assistant('a2', 'Dropped answer') }),
      logRow(5, { type: 'message.appended', message: { id: 'steer:1', role: 'user', content: 'Dropped steering' } }),
      logRow(6, { type: 'message.appended', message: assistant('a3', 'Dropped active answer') }),
      lifecycleRow(7, 'admitted', 'run_2'),
      logRow(8, { runId: 'run_2', type: 'history.rewound', trigger: 'retry', retainedMessageIds: ['u1', 'a1'] }),
    ];
    const transcript = await materializeTranscript(project(rows, 1));
    expect(
      transcript
        .filter((message) => message.role === 'assistant')
        .flatMap((message) => message.parts.filter((part) => part.type === 'text').map((part) => part.text)),
    ).toEqual(['Retained answer']);
  });

  it('should retain visible compaction-evicted messages inside a sealed steering segment', async () => {
    const rows = [
      lifecycleRow(0, 'admitted'),
      logRow(1, { type: 'message.appended', message: { id: 'u1', role: 'user', content: 'Original prompt' } }),
      lifecycleRow(2, 'running'),
      logRow(3, {
        type: 'message.appended',
        message: { id: 'a1', role: 'assistant', content: 'Visible original answer' },
      }),
      logRow(4, { type: 'message.appended', message: { id: 'steer:1', role: 'user', content: 'Dropped steering' } }),
      logRow(5, {
        type: 'history.compacted',
        evictedMessageIds: ['u1', 'a1'],
        summary: { id: 'summary', role: 'user', content: 'Provider-only summary' },
      }),
      lifecycleRow(6, 'admitted', 'run_2'),
      logRow(7, { runId: 'run_2', type: 'history.rewound', trigger: 'retry', retainedMessageIds: ['summary'] }),
    ];
    const transcript = await materializeTranscript(project(rows, 1));
    expect(
      transcript.flatMap((message) => message.parts.filter((part) => part.type === 'text').map((part) => part.text)),
    ).toEqual(['Original prompt', 'Visible original answer']);
  });

  it('should keep a turn a compaction evicted even when a rewind drops its summary', () => {
    const user = (id: string) => ({ id, role: 'user', content: 'x' });
    const assistant = (id: string) => ({ id, role: 'assistant', content: [{ type: 'text', text: id }] });
    const rows = [
      lifecycleRow(0, 'admitted', 'r1'),
      logRow(1, { runId: 'r1', type: 'message.appended', message: user('u1') }),
      lifecycleRow(2, 'running', 'r1'),
      logRow(3, { runId: 'r1', type: 'message.appended', message: assistant('a1') }),
      lifecycleRow(4, 'completed', 'r1'),
      lifecycleRow(5, 'admitted', 'r2'),
      logRow(6, {
        runId: 'r2',
        type: 'history.compacted',
        evictedMessageIds: ['u1', 'a1'],
        summary: { id: 's1', role: 'user', content: 'summary' },
      }),
      logRow(7, { runId: 'r2', type: 'history.rewound', trigger: 'edit', retainedMessageIds: [] }),
    ];
    expect(selectTranscriptSource(project(rows, 1)).map((run) => run.runId)).toEqual(['r1', 'r2']);
  });

  it('should not repeat streamed text when a resumed run replays an earlier envelope', async () => {
    const assistant = (text: string) => ({ id: 'a1', role: 'assistant', content: [{ type: 'text', text }] });
    const rows = [
      lifecycleRow(0, 'admitted', 'r1'),
      logRow(1, { runId: 'r1', type: 'message.appended', message: { id: 'u1', role: 'user', content: 'x' } }),
      lifecycleRow(2, 'running', 'r1'),
      logRow(3, { runId: 'r1', type: 'message.appended', message: assistant('hello') }),
      logRow(4, { runId: 'r1', type: 'run.lifecycle', state: 'cancelled', attempt: 1, detail: { message: 'stop' } }),
      lifecycleRow(5, 'running', 'r1'),
      logRow(6, {
        runId: 'r1',
        type: 'message.envelope-replaced',
        messageId: 'a1',
        replacement: assistant('hello'),
      }),
    ];
    const transcript = await materializeTranscript(project(rows, 1));
    const message = transcript.find((entry) => entry.role === 'assistant');
    expect(message?.parts.filter((part) => part.type === 'text').map((part) => part.text)).toEqual(['hello']);
  });

  it('keeps the newest row that asks for the person, and never a cancelled run (PV-S8)', () => {
    const rows = readLog('seeded/cancel-after-settled-pause');
    const requested = rows.findIndex((row) => row.type === 'interrupt.recorded' && row.phase === 'requested');
    const key = (index: number) => ({ leaderEpoch: rows[index]!.leaderEpoch, sequence: rows[index]!.sequence });
    expect(selectAttentionRow(project(rows.slice(0, requested), 1))).toBeUndefined();
    expect(selectAttentionRow(project(rows.slice(0, requested + 1), 1))).toEqual(key(requested));
    /* The run is cancelled after its pause: the interrupt it opened is still the newest attention row. */
    expect(selectAttentionRow(project(rows, 1))).toEqual(key(requested));
    const completed = readLog('recorded/in-project-ping-pong-turn');
    const last = completed.findLastIndex((row) => row.type === 'run.lifecycle' && row.state === 'completed');
    expect(selectAttentionRow(project(completed, 7))).toEqual({
      leaderEpoch: completed[last]!.leaderEpoch,
      sequence: completed[last]!.sequence,
    });
  });

  it('reads a turn’s revision facts from its newest attempt: terminal row, then settlement (PV-S9)', () => {
    const rows = readLog('recorded/in-project-ping-pong-turn');
    const first = rows.find((row) => row.type === 'turn.finalized')!;
    const settledAt = rows.indexOf(first);
    expect(selectTurnRevision(project(rows.slice(0, 1), 1), first.turnId)).toBeUndefined();
    expect(selectTurnRevision(project(rows.slice(0, settledAt - 1), 1), first.turnId)).toEqual({
      attempt: 1,
      hasChanges: false,
      isWaiting: false,
    });
    /* The terminal row is folded and the settlement row is not: the save is on its way. */
    expect(selectTurnRevision(project(rows.slice(0, settledAt), 1), first.turnId)).toEqual({
      attempt: 1,
      hasChanges: false,
      terminal: 'completed',
      isWaiting: false,
    });
    expect(selectTurnRevision(project(rows, 7), first.turnId)).toEqual({
      attempt: 1,
      hasChanges: false,
      terminal: 'completed',
      isWaiting: false,
      settlement: { type: 'turn.finalized', revisionId: first.revisionId },
    });
    const last = rows.findLast((row) => row.type === 'turn.finalized')!;
    expect(selectTurnRevision(project(rows, 7), last.turnId)?.settlement).toEqual({ type: 'turn.finalized' });
    expect(selectTurnRevision(project(rows, 7), 'another-turn')).toBeUndefined();
  });

  it.each([true, false])('retains only a verified earlier result across run IDs (proof=%s)', (verified) => {
    const rows = [
      lifecycleRow(0, 'admitted'),
      logRow(1, { type: 'message.appended', message: { id: 'u1', role: 'user', content: 'Edit' } }),
      lifecycleRow(2, 'running'),
      logRow(
        3,
        verified
          ? { type: 'turn.changed', chatId: 'chat-1', turnId: 'u1', attempt: 1, checkoutId: 'live' }
          : { type: 'message.appended', message: { id: 'a1', role: 'assistant', content: 'Done' } },
      ),
      lifecycleRow(4, 'completed'),
      logRow(5, {
        type: 'turn.finalized',
        chatId: 'chat-1',
        projectId: 'p',
        turnId: 'u1',
        attempt: 1,
        revisionId: 'rev-5',
        changedPaths: [],
        runIds: ['run_1'],
        trigger: 'turn',
      }),
      lifecycleRow(6, 'admitted', 'run_2'),
      logRow(7, { type: 'message.appended', runId: 'run_2', message: { id: 'u1', role: 'user', content: 'Edit' } }),
      lifecycleRow(8, 'running', 'run_2'),
    ];
    const selected = selectTurnRevision(project(rows, 1), 'u1');
    expect(selected?.hasChanges).toBe(false);
    expect(selected?.previousRevisionId).toBe(verified ? 'rev-5' : undefined);
  });

  it('keeps a turn waiting while its attempt is paused on an interrupt (PV-S9)', () => {
    const rows = [
      lifecycleRow(0, 'admitted'),
      logRow(1, { type: 'message.appended', message: { id: 'u1', role: 'user', content: 'Add holes' } }),
      lifecycleRow(2, 'running'),
    ];
    expect(selectTurnRevision(project(rows, 1), 'u1')?.isWaiting).toBe(false);
    const asked = [
      ...rows,
      logRow(3, { type: 'interrupt.recorded', interruptId: 'i1', phase: 'requested', reason: 'approval' }),
    ];
    expect(selectTurnRevision(project(asked, 1), 'u1')?.isWaiting).toBe(true);
    expect(selectTurnRevision(project([...asked, lifecycleRow(4, 'paused')], 1), 'u1')?.isWaiting).toBe(true);
  });

  it('discards a batch that does not start at its cursor, and asks for it again', () => {
    const rows = readLog('recorded/in-project-ping-pong-turn');
    const state = project(rows.slice(0, 5), 5);
    const skipped = reduceChatProjection(state, { type: 'batch', answer: batch(rows.slice(6, 9), 6, rows.length) });
    expect(skipped.state.ledger).toBe(state.ledger);
    expect(skipped.emit).toEqual({ type: 'stale' });
  });

  it('resets and asks for a reread when the host refuses the reader’s identity', () => {
    const state = project(readLog('recorded/in-project-ping-pong-turn'), 44);
    const refused = reduceChatProjection(state, {
      type: 'batch',
      answer: { status: 'refused', reason: 'identity-mismatch' },
    });
    expect(refused.state).toEqual({ ...initialChatProjection, resetVersion: state.resetVersion + 1 });
    expect(refused.emit).toEqual({ type: 'reread' });
    const unreadable = reduceChatProjection(state, {
      type: 'batch',
      answer: { status: 'refused', reason: 'unreadable' },
    });
    expect(unreadable.state.fault).toBe('unreadable');
  });

  it('keeps a context that survives a JSON round trip', () => {
    const state = project(readLog('recorded/daemon-reattach-hexnut-4runs'), 16);
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- the JSON round trip is what this row proves.
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('ignores @xstate.init and every foreign event (MC-R20)', () => {
    expect(foreignEventChanges(chatProjectionLogic)).toEqual([]);
  });

  it('emits a reread as an actor', () => {
    const actor = createActor(chatProjectionLogic).start();
    const emitted: string[] = [];
    actor.on('reread', (event) => emitted.push(event.type));
    actor.send({ type: 'batch', answer: { status: 'refused', reason: 'cursor-ahead' } });
    expect(emitted).toEqual(['reread']);
    actor.stop();
  });
});

it('should reject malformed SDK reconstruction instead of accepting its partial prefix', async () => {
  const projection = project(
    [
      lifecycleRow(0, 'admitted'),
      logRow(1, {
        type: 'message.appended',
        message: { id: 'prefix', role: 'assistant', content: 'Before malformed tool' },
      }),
      logRow(2, {
        type: 'message.appended',
        message: {
          id: 'orphan',
          role: 'tool-output',
          toolCallId: 'missing-input',
          toolName: 'read',
          content: 'result',
          isError: false,
        },
      }),
      lifecycleRow(3, 'completed'),
    ],
    1,
  );
  await expect(materializeTranscript(projection)).rejects.toThrow('No tool invocation found');
});

it('should retain failed-run history and finalize its interrupted tool tail', async () => {
  const projection = project(
    [
      lifecycleRow(0, 'admitted'),
      logRow(1, {
        type: 'message.appended',
        message: {
          id: 'input',
          role: 'tool-input',
          toolCallId: 'interrupted',
          toolName: 'read',
          content: { file: 'main.ts' },
        },
      }),
      lifecycleRow(2, 'failed'),
    ],
    1,
  );
  const messages = await materializeTranscript(projection);
  expect(messages).toHaveLength(1);
  expect(messages[0]?.parts).toContainEqual(
    expect.objectContaining({
      type: 'tool-read',
      toolCallId: 'interrupted',
      state: 'output-error',
      input: { file: 'main.ts' },
    }),
  );
});

describe('compact captured projection parity', () => {
  const compactCases = [
    ...logs.map((name) => ({ name, rows: readLog(name) })),
    {
      name: 'sealed correction, compaction and partial rewind',
      rows: [
        lifecycleRow(0, 'admitted'),
        logRow(1, { type: 'message.appended', message: { id: 'u1', role: 'user', content: 'Original prompt' } }),
        lifecycleRow(2, 'running'),
        logRow(3, {
          type: 'message.appended',
          message: {
            id: 'a1',
            role: 'assistant',
            content: [
              { type: 'text', text: 'original' },
              { type: 'text', text: 'remove' },
            ],
          },
        }),
        logRow(4, { type: 'message.appended', message: { id: 'a2', role: 'assistant', content: 'later answer' } }),
        logRow(5, { type: 'message.appended', message: { id: 'steer:1', role: 'user', content: 'Steer' } }),
        logRow(6, {
          type: 'message.envelope-replaced',
          messageId: 'a1',
          replacement: { id: 'a1', role: 'assistant', content: 'corrected' },
        }),
        logRow(7, {
          type: 'history.compacted',
          evictedMessageIds: ['u1', 'a1'],
          summary: { id: 'summary', role: 'user', content: 'summary' },
        }),
        logRow(8, { type: 'history.rewound', retainedMessageIds: ['summary'], trigger: 'regenerate' }),
      ],
    },
    {
      name: 'independent rewind and opaque history rows',
      rows: [
        lifecycleRow(0, 'admitted'),
        logRow(1, { type: 'message.appended', message: { id: 'u1', role: 'user', content: 'Original prompt' } }),
        logRow(2, { type: 'message.appended', message: { id: 'a1', role: 'assistant', content: 'Original answer' } }),
        logRow(3, { type: 'run.lifecycle', state: 'admitted', admission: { rewind: { retainedMessageIds: ['u1'] } } }),
        logRow(4, { type: 'future.presentation', content: 'opaque' }),
        logRow(5, {
          type: 'message.appended',
          message: { id: 'future', role: 'future-role', content: 'opaque history' },
        }),
      ],
    },
    {
      name: 'physical duplicate known and opaque rows',
      rows: [
        lifecycleRow(0, 'admitted'),
        lifecycleRow(0, 'admitted'),
        logRow(1, { type: 'future.presentation' }),
        logRow(1, { type: 'future.presentation' }),
        { ...lifecycleRow(2, 'running'), commandId: 'after-physical-duplicates' },
      ],
    },
  ];
  it.each(compactCases)(
    'should preserve all visible and ledger facts from the actual host for $name',
    async ({ rows }) => {
      const root = await mkdtemp(join(tmpdir(), 'tau-render-compact-'));
      const directory = join(root, '.tau/chats/parity');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'events.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
      const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;
      const launcher = createAgentLauncher({
        chats: createNodeChatStore({ workspaceRoot: root }),
        model,
        modelTransport: createTauCloudGatewayModelTransport({
          baseUrl: 'https://gateway.example',
          model,
          auth: () => 'unused',
          fetch: async () => {
            throw new Error('Projection parity must not invoke a model.');
          },
        }),
        credential: () => ({ mode: 'session' }),
        systemPrompt: 'You are Tau.',
        toolRegistry: { list: () => [], invoke: async () => ({ content: 'unused', isError: true }) },
      });
      const actor = createActor(chatProjectionLogic).start();
      try {
        let raw = project(rows, 7);
        let validated = false;
        for await (const frame of launcher.catchUp({ chatId: 'parity', limit: 1, maxBytes: 1024 * 1024 })) {
          if (frame.type === 'page') {
            const event = { type: 'facts', answer: frame.answer };
            actor.send(event);
          } else if (frame.type === 'validated') {
            expect(frame.position.cursor).toBe(rows.length);
            expect(frame.observedEndCursor).toBe(rows.length);
            const last = rows.at(-1);
            expect(frame.position.last).toEqual({ leaderEpoch: last?.leaderEpoch, sequence: last?.sequence });
            const answer: Extract<ChatProjectionReadAnswer, { status: 'batch' }> = {
              status: 'batch',
              cursor: rows.length,
              nextCursor: rows.length,
              endCursor: rows.length,
              events: [],
              sourceGeneration: frame.position.sourceGeneration,
              sourceHealth: frame.health,
            };
            actor.send({ type: 'batch', answer });
            raw = reduceChatProjection(raw, { type: 'batch', answer }).state;
            validated = true;
          } else {
            throw new Error(`Unexpected catch-up refusal: ${frame.answer.reason}`);
          }
        }
        expect(validated).toBe(true);
        const compact = actor.getSnapshot().context;
        expect(compact.ledger.position.cursor).toBe(rows.length);
        expect(compact.ledger).toEqual(raw.ledger);
        expect(compact.openTools).toEqual(raw.openTools);
        expect(compact.failure).toEqual(raw.failure);
        expect(compact.attentionRow).toEqual(raw.attentionRow);
        expect(await materializeTranscript(compact)).toEqual(await materializeTranscript(raw));
      } finally {
        actor.stop();
        await launcher.close();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

it('should retain uncommitted live output when a different historical run is corrected', () => {
  const message = (content: string) => ({
    id: 'a1',
    role: 'assistant',
    content,
    metadata: { tauInternal: { kind: 'stream', streamState: 'checkpoint' } },
  });
  const base = project(
    [
      lifecycleRow(0, 'admitted'),
      logRow(1, { type: 'message.appended', message: message('old answer') }),
      lifecycleRow(2, 'admitted', 'active-run'),
      lifecycleRow(3, 'running', 'active-run'),
    ],
    1,
  );
  const live = reduceChatProjection(base, {
    type: 'live',
    event: {
      type: 'text-delta',
      chatId: 'chat_1',
      runId: 'active-run',
      messageId: 'new-message',
      contentIndex: 0,
      delta: 'Uncommitted',
      offset: 0,
    },
  }).state;
  const next = reduceChatProjection(live, {
    type: 'batch',
    answer: batch(
      [logRow(4, { type: 'message.envelope-replaced', messageId: 'a1', replacement: message('corrected') })],
      4,
      5,
    ),
  }).state;
  expect(next.live).toBe(live.live);
});
