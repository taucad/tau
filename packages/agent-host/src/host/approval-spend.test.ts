/**
 * Durable spend before spawn (desktop shell blueprint D23, I13, A21).
 *
 * A recalled approval is spent by an `approval.spent` row the host persists inside `recall`, before the tool is told
 * the answer. The host is then "killed" at each point the acceptance names: after the spend and before the effect,
 * after the effect started and before the output row, and while the output row is being persisted. In every case the
 * next incarnation records the call `interrupted`, never runs it again, and a re-issued call under the same key finds
 * nothing to recall, so the person is asked again.
 */
import { describe, expect, it } from 'vitest';

import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogStorage } from '#log/event-log-appender.js';
import { reduceEventLog } from '#log/reducer.js';
import type { AgentLogEvent } from '#log/event-types.js';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import type { TauAgentHost } from '#host/tau-agent-host.js';
import { ScriptedParityModelTransport } from '#host/scripted-model.fixture.js';
import type { ScriptedParityResponse } from '#host/scripted-model.fixture.js';
import { hostOptions, tools } from '#host/tau-agent-host.fixture.js';
import type { HostToolInvocation, HostToolResult } from '#waist/ports.js';

/** An in-memory log whose appends can be held, so a test can stop a host while a row is being persisted. */
const holdableLogFile = () => {
  let bytes = new Uint8Array(new ArrayBuffer(0));
  let hold: ((text: string) => boolean) | undefined;
  const held = Promise.withResolvers<void>();
  return {
    holdWhen: (predicate: (text: string) => boolean) => {
      hold = predicate;
    },
    held: held.promise,
    release: () => {
      hold = undefined;
    },
    rows: async (): Promise<readonly AgentLogEvent[]> => {
      const reader = await createEventLogAppender(storage());
      return reader.read();
    },
    open: async () => createEventLogAppender(storage()),
  };
  function storage(): EventLogStorage {
    return {
      read: async () => bytes,
      append: async (next) => {
        if (hold?.(new TextDecoder().decode(next))) {
          held.resolve();
          /* The host dies with this write outstanding: it never lands. */
          return never();
        }
        const combined = new Uint8Array(bytes.byteLength + next.byteLength);
        combined.set(bytes);
        combined.set(next, bytes.byteLength);
        bytes = combined;
      },
      truncate: async (size) => {
        bytes = bytes.slice(0, size);
      },
      close: async () => undefined,
      size: async () => bytes.byteLength,
      exclusive: async (section) => section(),
    };
  }
};

/** A promise that never settles: the host dies with it outstanding. */
const never = async (): Promise<never> =>
  new Promise<never>(() => {
    /* Never settles. */
  });

const usage = { inputTokens: 1, outputTokens: 1 };
const call = (id: string) => ({ id, name: 'read_file', input: { targetFile: 'a.ts' } });
const key = 'shell:digest-a';

type Fault = 'after-spend' | 'after-spawn' | 'during-output';

/**
 * A tool that asks once under {@link key}, then runs a counted effect. `fault` decides where it stops the host.
 *
 * @param state - What the tool saw, shared with the test.
 * @param file - The log it reads to see what was durable when it ran.
 * @param fault - Where this incarnation dies, if anywhere.
 * @returns The registry.
 */
const spendingTool = (
  state: {
    ran: number;
    spentBeforeAnswer: boolean[];
    inputBeforeInvoke: boolean[];
    reached: PromiseWithResolvers<void>;
  },
  file: ReturnType<typeof holdableLogFile>,
  fault: Fault | undefined,
) =>
  tools(async (invocation: HostToolInvocation): Promise<HostToolResult> => {
    const before = await file.rows();
    state.inputBeforeInvoke.push(
      before.some(
        (row) =>
          row.type === 'message.appended' &&
          row.message.role === 'tool-input' &&
          row.message.toolCallId === invocation.toolCallId,
      ),
    );
    const resolution = await invocation.approve!({ key, prompt: 'Run a?', payload: { kind: 'shell' } });
    const after = await file.rows();
    state.spentBeforeAnswer.push(
      after.some(
        (row) =>
          row.type === 'approval.spent' &&
          row.phase === 'spent' &&
          row.toolCallId === invocation.toolCallId &&
          row.interruptId === resolution.interruptId,
      ),
    );
    if (fault === 'after-spend') {
      state.reached.resolve();
      return never();
    }
    state.ran += 1;
    if (fault === 'after-spawn') {
      state.reached.resolve();
      return never();
    }
    if (fault === 'during-output') {
      file.holdWhen((text) => text.includes('"role":"tool-output"') && text.includes(invocation.toolCallId));
    }
    return { content: { ran: state.ran }, isError: false };
  });

const promptsOf = async (host: TauAgentHost, runId: string): Promise<string[]> => {
  const pending = await host.pendingInterrupts(runId);
  return pending.map((request) => request.prompt);
};

describe('durable approval spend before the effect (D23, A21)', () => {
  it.each<Fault>(['after-spend', 'after-spawn', 'during-output'])(
    'records a host killed %s as interrupted, never reruns it, and never recalls its approval again',
    async (fault) => {
      const file = holdableLogFile();
      const state = {
        ran: 0,
        spentBeforeAnswer: [] as boolean[],
        inputBeforeInvoke: [] as boolean[],
        reached: Promise.withResolvers<void>(),
      };
      const hostOver = (label: string, responses: readonly ScriptedParityResponse[], fail: Fault | undefined) =>
        createTauAgentHost(
          hostOptions({
            openEventLog: file.open,
            transport: new ScriptedParityModelTransport(responses),
            toolRegistry: spendingTool(state, file, fail),
            idPrefix: `${label}-${fault}`,
          }),
        );
      const chatId = `chat-${fault}`;
      const runId = `run-${fault}`;
      /* Leader epochs order by label: the next incarnation's must sort after the first's. */
      const first = hostOver(
        'first',
        [
          { id: 'a1', toolCalls: [call('c1')], usage },
          { id: 'a2', toolCalls: [call('c2')], usage },
        ],
        fault,
      );
      await first.admit({
        chatId,
        runId,
        trigger: 'submit',
        message: { id: `turn-${fault}`, role: 'user', content: 'Run it.' },
      });
      const [asked] = await first.pendingInterrupts(runId);
      await first.resolveInterrupt({ runId, interruptId: asked!.interruptId, outcome: 'approved' });
      void first.resume(chatId);
      await (fault === 'during-output' ? file.held : state.reached.promise);
      /* The dying host's in-flight rows (its stream's last envelopes) land before the next one opens the chat. */
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
      file.release();

      /* The answer was spent durably before the tool learned it, and the call's input row preceded the call. */
      expect(state.spentBeforeAnswer.at(-1)).toBe(true);
      expect(state.inputBeforeInvoke.every(Boolean)).toBe(true);

      const next = hostOver(
        'second',
        [
          { id: 'a3', toolCalls: [call('c3')], usage },
          { id: 'a4', text: 'done', usage },
        ],
        undefined,
      );
      await expect(next.markAbandoned(chatId)).resolves.toMatchObject({ state: 'failed' });
      await next.resume(chatId);

      const messages = reduceEventLog(await file.rows());
      expect(messages.find((message) => message.role === 'tool-output' && message.toolCallId === 'c2')).toMatchObject({
        isError: true,
        content: { status: 'interrupted' },
      });
      /* The re-issued call found nothing to recall: the person is asked again, and the effect ran at most once. */
      expect(await promptsOf(next, runId)).toEqual(['Run a?']);
      expect(state.ran).toBe(fault === 'after-spend' ? 0 : 1);
      await next.close();
    },
  );

  it('releases the spend of a call that threw, so the retry recalls the same answer', async () => {
    const file = holdableLogFile();
    let thrown = false;
    const outcomes: string[] = [];
    const registry = tools(async (invocation) => {
      const resolution = await invocation.approve!({ key, prompt: 'Run a?' });
      if (!thrown) {
        thrown = true;
        throw new Error('The launch failed before anything ran.');
      }
      outcomes.push(resolution.outcome);
      return { content: { approval: resolution.outcome }, isError: false };
    });
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport([
          { id: 'a1', toolCalls: [call('c1')], usage },
          { id: 'a2', toolCalls: [call('c2')], usage },
          { id: 'a3', toolCalls: [call('c3')], usage },
          { id: 'a4', text: 'done', usage },
        ]),
        toolRegistry: registry,
        idPrefix: 'released',
      }),
    );
    await host.admit({
      chatId: 'chat-released',
      runId: 'run-released',
      trigger: 'submit',
      message: { id: 'turn-released', role: 'user', content: 'Run it.' },
    });
    const [asked] = await host.pendingInterrupts('run-released');
    await host.resolveInterrupt({ runId: 'run-released', interruptId: asked!.interruptId, outcome: 'approved' });
    await host.resume('chat-released');

    expect(outcomes).toEqual(['approved']);
    const rows = await file.rows();
    const phases = rows.flatMap((row) => (row.type === 'approval.spent' ? [row.phase] : []));
    expect(phases).toEqual(['spent', 'released', 'spent']);
    await host.close();
  });
});
