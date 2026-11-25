/**
 * An approval's chunks stay a valid UI message stream at every point of a recorded ACP log: the transcript fold of each
 * prefix, replayed from any sequence, through a pause or a resume, never meets an answer whose request the stream lost
 * (T4: the fold replaced the SDK reader and the run watch, so a lost request is a skipped chunk, D1).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AgentLogEvent } from '@taucad/agent-host';
import { agentApprovalToolName } from '@taucad/chat-ui/services/agent-host-event-projection';
import { reduceChunks } from '@taucad/chat-ui/services/ui-message-reducer';
import {
  chunksOf,
  initialChatProjection,
  reduceChatProjection,
  selectTranscript,
  selectTranscriptSource,
} from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';

/**
 * Two Claude-shaped turns through the host's real ACP path, recorded from the fixture agent's `update-while-asking`
 * prompt: each refines its write call while the permission request is outstanding, says a line once it is answered,
 * then completes the call.
 */
const rows: readonly AgentLogEvent[] = readFileSync(
  new URL('__fixtures__/acp-approval-refined-while-paused.jsonl', pathToFileURL(import.meta.filename)),
  'utf8',
)
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line) as AgentLogEvent);

const interrupts = rows.flatMap((row) =>
  row.type === 'interrupt.recorded' && row.phase === 'requested' ? [row.interruptId] : [],
);

/** Fold `rows[from, to)` as one read answer, as a reader replaying from `from` would. */
const fold = (state: ChatProjection, from: number, to: number): ChatProjection =>
  reduceChatProjection(state, {
    type: 'batch',
    answer: {
      status: 'batch',
      cursor: from,
      nextCursor: to,
      endCursor: rows.length,
      events: rows.slice(from, to),
    },
  }).state;

/** Chunks of the transcript the fold could not place: an answer whose request the stream lost. */
const skippedOf = (projection: ChatProjection): number =>
  selectTranscriptSource(projection).reduce(
    (total, run) =>
      total +
      reduceChunks(chunksOf(run.chunks)).skipped +
      (run.segments ?? []).reduce((sum, segment) => sum + reduceChunks(chunksOf(segment.chunks)).skipped, 0),
    0,
  );

describe('approval chunks over a recorded ACP log', () => {
  it('records a request refined while paused and answered before its call completes', () => {
    expect(interrupts).toHaveLength(2);
    for (const interruptId of interrupts) {
      const requested = rows.findIndex((row) => row.type === 'interrupt.recorded' && row.interruptId === interruptId);
      const resolved = rows.findLastIndex(
        (row) => row.type === 'interrupt.recorded' && row.interruptId === interruptId,
      );
      expect(resolved).toBeGreaterThan(requested);
      expect(rows.slice(requested, resolved).map((row) => row.type)).toContain('message.envelope-replaced');
    }
  });

  it('should fold every prefix, replayed from every sequence, through each pause and resume, skipping no chunk', () => {
    for (let start = 0; start <= rows.length; start++) {
      let state = start === 0 ? initialChatProjection : fold(initialChatProjection, 0, start);
      for (let at = start; at < rows.length; at++) {
        state = fold(state, at, at + 1);
        expect(skippedOf(state), `replay from ${start}, row ${at}`).toBe(0);
      }
    }
  });

  it('should keep every answered approval as its own settled part in the full transcript', () => {
    const messages = selectTranscript(fold(initialChatProjection, 0, rows.length));
    const approvals = messages.flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'dynamic-tool' && part.toolName === agentApprovalToolName
          ? [{ id: part.toolCallId, state: part.state }]
          : [],
      ),
    );
    expect(approvals).toEqual(interrupts.map((id) => ({ id, state: 'output-available' })));
  });
});
