/**
 * The chat projection (W9 PV-S7): parity with the page's scans on recorded logs,
 * O(1) work per row, discarded non-contiguous batches and a JSON-safe context.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { foreignEventChanges } from '@taucad/xstate-testing/paths';
import type { AgentLogEvent } from '@taucad/agent-host';
import { projectAgentHostEvent, runFailureText } from '#services/agent-host-event-projection.js';
import {
  chatProjectionLogic,
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
] as const;

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
    expect(preview.live?.chunks.filter((chunk) => chunk.type === 'text-delta')).toEqual([
      expect.objectContaining({ delta: 'Partial reply' }),
    ]);
    expect(preview.views['run_1']?.chunks.some((chunk) => chunk.type === 'text-delta')).toBe(false);

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
    expect(completed.live?.chunks.filter((chunk) => chunk.type === 'text-delta')).toHaveLength(1);
    expect(completed.views['run_1']?.chunks.filter((chunk) => chunk.type === 'text-delta')).toHaveLength(1);
    expect(reduceChatProjection(completed, { type: 'clear-live', runId: 'another-run' }).state.live).toBeDefined();
    const retired = reduceChatProjection(completed, { type: 'clear-live', runId: 'run_1' }).state;
    expect(retired.live).toBeUndefined();
    expect(retired.views['run_1']?.chunks.filter((chunk) => chunk.type === 'text-delta')).toHaveLength(1);
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
    const chunks = state.views[runId]?.chunks ?? [];

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

  it('should replay only the new attempt after a failed run reopens, while retaining a paused continuation', async () => {
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
    expect(failed.chunks.some((chunk) => chunk.type === 'error')).toBe(true);

    const reopened = project(rows.slice(0, reopenedAt + 1), 1).views[runId]!;
    expect(reopened.chunks.map((chunk) => chunk.type)).toEqual(['start', 'start-step']);
    const paused = project(rows.slice(0, pausedAt + 1), 1).views[runId]!;
    const continued = project(rows.slice(0, continuedAt + 1), 1).views[runId]!;
    expect(continued.chunks.slice(0, paused.chunks.length)).toEqual(paused.chunks);

    const completed = project(rows.slice(0, rows.findIndex((row) => row.type === 'turn.finalized') + 1), 1);
    expect(completed.views[runId]?.chunks.some((chunk) => chunk.type === 'error')).toBe(false);
    const messages = await materializeTranscript(completed);
    expect(messages.some((message) => message.role === 'assistant')).toBe(true);
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
      isWaiting: false,
    });
    /* The terminal row is folded and the settlement row is not: the save is on its way. */
    expect(selectTurnRevision(project(rows.slice(0, settledAt), 1), first.turnId)).toEqual({
      attempt: 1,
      terminal: 'completed',
      isWaiting: false,
    });
    expect(selectTurnRevision(project(rows, 7), first.turnId)).toEqual({
      attempt: 1,
      terminal: 'completed',
      isWaiting: false,
      settlement: { type: 'turn.finalized', revisionId: first.revisionId },
    });
    const last = rows.findLast((row) => row.type === 'turn.finalized')!;
    expect(selectTurnRevision(project(rows, 7), last.turnId)?.settlement).toEqual({ type: 'turn.finalized' });
    expect(selectTurnRevision(project(rows, 7), 'another-turn')).toBeUndefined();
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
    expect(refused.state).toBe(initialChatProjection);
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
