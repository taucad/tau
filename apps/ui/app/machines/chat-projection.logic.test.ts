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
  initialChatProjection,
  reduceChatProjection,
  selectCaughtUp,
  selectOpenInterrupts,
  selectRunFailure,
  selectPosition,
  selectRunPhase,
  selectToolsInFlight,
} from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionReadAnswer } from '#machines/chat-projection.logic.js';

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
