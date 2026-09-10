/**
 * The durable tool-call vocabulary, against facts captured from a real ACP
 * turn.
 *
 * N11 rules out a second tool namespace: an external agent's call is recorded
 * as the *same* `tool-input`/`tool-output` pair Tau records for its own
 * dispatch, with the emitter's own facts in the typed `call` field. This
 * asserts the log can carry those facts losslessly, that a fact the vocabulary
 * has no field for survives anyway, and that neither one reaches the reducer
 * as an instruction.
 *
 * The ACP payloads below are verbatim `session/update` notifications; the
 * projection that turns them into messages lives in `@taucad/host`, which this
 * package must not depend on, so the mapping is restated here in the shape the
 * daemon writes.
 */

import { describe, expect, it } from 'vitest';

import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogStorage } from '#log/event-log-appender.js';
import { reduceEventLog } from '#log/reducer.js';
import { serializeLogEvent } from '#log/serialization.js';
import { tauToolKinds } from '#harness/tools.js';
import { toolInputToProvider } from '#harness/session-record.js';
import type { AgentLogEvent, LogEventBase, ProviderMessage } from '#log/event-types.js';

/** One captured `tool_call` notification, exactly as the adapter sent it. */
const capturedToolCall = {
  sessionUpdate: 'tool_call',
  toolCallId: 'call_a7f3',
  title: 'Edit main.scad',
  kind: 'edit',
  status: 'in_progress',
  locations: [{ path: 'main.scad', line: 12 }],
  content: [{ type: 'diff', path: 'main.scad', oldText: 'cube(10);', newText: 'cube(12);' }],
  rawInput: { path: 'main.scad', replacement: 'cube(12);' },
  /* Neither shipping adapter sets ACP's experimental `name`; Claude puts the
   * programmatic identity here instead, so this is where it has to survive. */
  _meta: { claudeCode: { toolName: 'Edit' } },
} as const;

/** Its `tool_call_update`, carrying a field this vocabulary has no name for. */
const capturedToolCallUpdate = {
  sessionUpdate: 'tool_call_update',
  toolCallId: 'call_a7f3',
  status: 'completed',
  kind: 'edit',
  locations: [{ path: 'main.scad', line: 12 }],
  content: [{ type: 'content', content: { type: 'text', text: 'Applied.' } }],
  rawOutput: { bytesWritten: 9 },
  futureFact: { reviewedBy: 'nobody' },
} as const;

const base = (sequence: number): LogEventBase => ({
  version: 1,
  leaderEpoch: 'acp-epoch',
  sequence,
  recordedAt: '2026-09-07T00:00:00.000Z',
  runId: 'run-acp',
});

const externalMetadata = { tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex' } } as const;

const memoryStorage = (): EventLogStorage & { bytes: () => Uint8Array<ArrayBuffer> } => {
  let bytes = new Uint8Array(new ArrayBuffer(0));
  return {
    bytes: () => bytes,
    read: async () => bytes,
    append: async (next) => {
      const combined = new Uint8Array(bytes.byteLength + next.byteLength);
      combined.set(bytes);
      combined.set(next, bytes.byteLength);
      bytes = combined;
    },
    truncate: async (size) => {
      bytes = bytes.slice(0, size);
    },
    close: async () => undefined,
  };
};

describe('the durable tool-call vocabulary', () => {
  it('round-trips captured ACP tool-call facts through one append and reopen', async () => {
    const storage = memoryStorage();
    const input: ProviderMessage = {
      id: 'message-tool-input',
      role: 'tool-input',
      toolCallId: 'tau-call-1',
      toolName: 'Edit main.scad',
      call: {
        toolCallId: capturedToolCall.toolCallId,
        kind: capturedToolCall.kind,
        title: capturedToolCall.title,
        status: capturedToolCall.status,
        locations: capturedToolCall.locations,
        content: capturedToolCall.content,
        nativeName: 'Edit',
        meta: capturedToolCall._meta,
      },
      content: capturedToolCall.rawInput,
      metadata: externalMetadata,
    };
    const output: ProviderMessage = {
      id: 'message-tool-output',
      role: 'tool-output',
      toolCallId: 'tau-call-1',
      toolName: 'Edit main.scad',
      /* The update as received: ACP's own field names are the vocabulary's, so
       * this both maps the named facts and carries the ones it has no field
       * for (`sessionUpdate`, `futureFact`) rather than stripping them. */
      call: { ...capturedToolCallUpdate },
      content: capturedToolCallUpdate.rawOutput,
      isError: false,
      metadata: externalMetadata,
    };
    const events: AgentLogEvent[] = [
      { ...base(0), type: 'message.appended', message: input },
      { ...base(1), type: 'message.appended', message: output },
    ];

    const writer = await createEventLogAppender(storage);
    for (const event of events) {
      // oxlint-disable-next-line no-await-in-loop -- one physical append order is the contract.
      await writer.append(event);
    }
    await writer.close();

    const reader = await createEventLogAppender(storage);
    const replayed = await reader.read();
    expect(replayed).toEqual(events);
    expect(replayed.map((event) => serializeLogEvent(event)).join('')).toBe(new TextDecoder().decode(storage.bytes()));

    const [replayedInput, replayedOutput] = reduceEventLog(replayed);
    expect(replayedInput).toMatchObject({
      role: 'tool-input',
      toolCallId: 'tau-call-1',
      call: { toolCallId: 'call_a7f3', kind: 'edit', status: 'in_progress', title: 'Edit main.scad' },
    });
    expect(replayedInput).toHaveProperty('call.locations.0.path', 'main.scad');
    expect(replayedInput).toMatchObject({ call: { nativeName: 'Edit' } });
    expect(replayedInput).toHaveProperty('call.meta.claudeCode.toolName', 'Edit');
    expect(replayedOutput).toMatchObject({ role: 'tool-output', call: { status: 'completed' } });
    // The unnamed fact survived the round trip rather than being stripped.
    expect(replayedOutput).toHaveProperty('call.futureFact.reviewedBy', 'nobody');
    expect(replayedOutput).toHaveProperty('call.sessionUpdate', 'tool_call_update');
    await reader.close();
  });

  it("records Tau's own dispatch in the same vocabulary, from the tool-kind table", () => {
    const input = toolInputToProvider({
      id: 'message-tau-input',
      toolCallId: 'tau-call-2',
      toolName: 'list_directory',
      input: { path: '.' },
    });

    expect(input.call).toEqual({ toolCallId: 'tau-call-2', kind: 'read', nativeName: 'list_directory' });
    /* Every tool Tau dispatches has a kind, so a client never has to special-case
     * "Tau's own calls are the ones with no vocabulary" (N11). */
    expect(tauToolKinds.size).toBe(14);
  });

  it('preserves an ACP fact this vocabulary has no event for without acting on it', async () => {
    const storage = memoryStorage();
    const writer = await createEventLogAppender(storage);
    /* `plan`, `current_mode_update` and friends are dropped by the projection
     * today. A daemon that starts recording one must not make an older reader
     * unable to open the chat, and must not make this reader replay it. */
    const plan = {
      ...base(0),
      type: 'acp.plan',
      entries: [{ content: 'Measure the part', status: 'pending' }],
    } as unknown as AgentLogEvent;

    await expect(writer.append(plan)).resolves.toEqual({ appended: true });
    await writer.append({
      ...base(1),
      type: 'message.appended',
      message: { id: 'after-plan', role: 'assistant', content: 'done' },
    });
    await writer.close();

    const reader = await createEventLogAppender(storage);
    const replayed = await reader.read();
    expect(replayed[0]).toMatchObject({ type: 'acp.plan', entries: [{ content: 'Measure the part' }] });
    expect(reduceEventLog(replayed).map((message) => message.id)).toEqual(['after-plan']);
    await reader.close();
  });
});
