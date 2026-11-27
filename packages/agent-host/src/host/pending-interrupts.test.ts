/**
 * `pendingInterrupts` answers from the chat's state after every write already begun on it.
 *
 * A batch is written, then flushed, and the ledger folds it only once the flush returns (WP-10 step A). A reader of
 * the log file sees the rows in between, so a caller that saw a resolution in the log and then asked the host what is
 * still pending was told the resolved interrupt was outstanding (#2285's merge-group run, `settles the interrupt an
 * external run left outstanding when it died`).
 */

import { describe, expect, it } from 'vitest';

import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogStorage } from '#log/event-log-appender.js';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import { ScriptedParityModelTransport } from '#host/scripted-model.fixture.js';
import { hostOptions, tools } from '#host/tau-agent-host.fixture.js';

/** A log whose flush can be held, as an fsync in flight holds it: the written bytes are readable meanwhile. */
const flushableLogFile = () => {
  let bytes = new Uint8Array(new ArrayBuffer(0));
  let gate: PromiseWithResolvers<void> | undefined;
  let holding = false;
  const flushing = Promise.withResolvers<void>();
  const storage = (): EventLogStorage => ({
    read: async () => bytes,
    append: async (next) => {
      const combined = new Uint8Array(bytes.byteLength + next.byteLength);
      combined.set(bytes);
      combined.set(next, bytes.byteLength);
      bytes = combined;
    },
    write: async (next) => {
      const combined = new Uint8Array(bytes.byteLength + next.byteLength);
      combined.set(bytes);
      combined.set(next, bytes.byteLength);
      bytes = combined;
    },
    sync: async () => {
      if (holding) {
        gate = Promise.withResolvers<void>();
        flushing.resolve();
        await gate.promise;
      }
    },
    truncate: async (size) => {
      bytes = bytes.slice(0, size);
    },
    close: async () => undefined,
    size: async () => bytes.byteLength,
    exclusive: async (section) => section(),
  });
  return {
    open: async () => createEventLogAppender(storage()),
    text: () => new TextDecoder().decode(bytes),
    holdNextFlush: () => {
      holding = true;
    },
    flushing: flushing.promise,
    release: () => {
      holding = false;
      gate?.resolve();
    },
  };
};

const usage = { inputTokens: 1, outputTokens: 1 };

describe('pendingInterrupts', () => {
  it('answers after a resolution that is written but not yet flushed, never with the resolved interrupt', async () => {
    const file = flushableLogFile();
    const asked = Promise.withResolvers<void>();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport([
          {
            id: 'a1',
            toolCalls: [{ id: 'c1', name: 'read_file', input: { targetFile: 'a.ts' } }],
            usage,
          },
        ]),
        toolRegistry: tools(async (invocation) => {
          asked.resolve();
          await invocation.approve!({
            key: 'shell:digest-a',
            prompt: 'Run a?',
            payload: { kind: 'shell' },
          });
          return { content: {}, isError: false };
        }),
        idPrefix: 'pending',
      }),
    );
    const chatId = 'chat-pending';
    const runId = 'run-pending';
    await host.admit({
      chatId,
      runId,
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Run it.' },
    });
    await asked.promise;
    const [request] = await host.pendingInterrupts(runId);
    expect(request).toBeDefined();

    file.holdNextFlush();
    const resolving = host.resolveInterrupt({
      runId,
      interruptId: request!.interruptId,
      outcome: 'denied',
    });
    await file.flushing;
    expect(file.text()).toContain('"phase":"resolved"');

    let answered: readonly unknown[] | undefined;
    const pending = (async () => {
      answered = await host.pendingInterrupts(runId);
      return answered;
    })();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    /* The resolution is not acknowledged yet, so the answer waits for it rather than reading the ledger before it. */
    expect(answered).toBeUndefined();
    file.release();
    await resolving;
    await expect(pending).resolves.toEqual([]);
    await host.close();
  });
});
