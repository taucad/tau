/**
 * An approval's chunks stay a valid AI SDK stream at every point of a recorded ACP log: the transcript read, and the
 * run watch opened on each prefix, a pause or a resume, never meet an answer whose request the stream lost.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readUIMessageStream } from 'ai';
import type { AgentLogEvent } from '@taucad/agent-host';
import type { MyUIMessage } from '@taucad/chat';
import { agentApprovalToolName } from '@taucad/chat-ui/services/agent-host-event-projection';
import { openRunWatch } from '#chat-clients/_internal/run-watch.js';
import {
  initialChatProjection,
  materializeTranscript,
  reduceChatProjection,
  selectCurrentRun,
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

/** Read the current run's watch, as the SDK chat reads it on resume, through the pinned SDK's own reader. */
const watchCurrentRun = async (
  projection: ChatProjection,
  message: MyUIMessage | undefined,
): Promise<MyUIMessage | undefined> => {
  const run = selectCurrentRun(projection);
  if (run === undefined || projection.views[run.runId] === undefined) {
    return message;
  }
  const watch = openRunWatch({
    runId: run.runId,
    getProjection: () => projection,
    subscribe: () => () => undefined,
  });
  // The projection never moves here: what the watch replayed is all it will send.
  watch.detach();
  let last = message;
  for await (const next of readUIMessageStream<MyUIMessage>({
    stream: watch.stream,
    terminateOnError: true,
    ...(message === undefined ? {} : { message }),
  })) {
    last = next;
  }
  return last;
};

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

  it('should materialize every prefix, replayed from every sequence, without a stream error', async () => {
    for (let start = 0; start <= rows.length; start++) {
      let state = start === 0 ? initialChatProjection : fold(initialChatProjection, 0, start);
      for (let at = start; at < rows.length; at++) {
        state = fold(state, at, at + 1);
        // oxlint-disable-next-line no-await-in-loop -- each prefix is read in log order.
        await expect(materializeTranscript(state), `replay from ${start}, row ${at}`).resolves.toBeDefined();
      }
    }
  });

  it('should keep every answered approval as its own settled part in the full transcript', async () => {
    const messages = await materializeTranscript(fold(initialChatProjection, 0, rows.length));
    const approvals = messages.flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'dynamic-tool' && part.toolName === agentApprovalToolName
          ? [{ id: part.toolCallId, state: part.state }]
          : [],
      ),
    );
    expect(approvals).toEqual(interrupts.map((id) => ({ id, state: 'output-available' })));
  });

  it('should watch the run at every row, through each pause and resume, without a stream error', async () => {
    let state = initialChatProjection;
    let held: MyUIMessage | undefined;
    for (let at = 0; at < rows.length; at++) {
      state = fold(state, at, at + 1);
      // A fresh watch replays the run's whole segment, as a reattach does.
      // oxlint-disable-next-line no-await-in-loop -- each prefix is read in log order.
      await expect(
        watchCurrentRun(state, undefined).then(() => 'read'),
        `fresh watch at row ${at}`,
      ).resolves.toBe('read');
      const run = selectCurrentRun(state);
      if (run?.lifecycle === 'paused') {
        // oxlint-disable-next-line no-await-in-loop -- the pause's message is what the resume continues.
        held = await watchCurrentRun(state, undefined);
      } else if (run?.lifecycle === 'running' && held !== undefined) {
        // The SDK chat continues the message it held at the pause.
        // oxlint-disable-next-line no-await-in-loop -- each prefix is read in log order.
        await expect(
          watchCurrentRun(state, structuredClone(held)).then(() => 'read'),
          `resumed watch at row ${at}`,
        ).resolves.toBe('read');
      }
    }
  });
});
