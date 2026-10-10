import { describe, expect, it } from 'vitest';
import type { AgentLogEvent } from '@taucad/agent-host';
import type { ReadAnswer, ReadInput } from '@taucad/agent-host/wire';

import { chatToReport, startRunReporter } from '#run-reporter.js';
import type { RunReporter } from '#run-reporter.js';
import type { HostControlOutbound } from '#host.schemas.js';

type Row = Readonly<{ chatId: string; event: AgentLogEvent }>;

const lifecycle = (input: {
  readonly chatId: string;
  readonly runId: string;
  readonly state: 'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  readonly sequence: number;
}): Row => ({
  chatId: input.chatId,
  event: {
    version: 1,
    leaderEpoch: 'epoch-1',
    sequence: input.sequence,
    recordedAt: new Date(input.sequence * 1000).toISOString(),
    runId: input.runId,
    type: 'run.lifecycle',
    state: input.state,
  },
});

const message = (chatId: string, runId: string, sequence: number): Row => ({
  chatId,
  event: {
    version: 1,
    leaderEpoch: 'epoch-1',
    sequence,
    recordedAt: new Date(sequence * 1000).toISOString(),
    runId,
    type: 'message.appended',
    message: { id: 'msg-1', role: 'assistant', content: 'the whole transcript' },
  },
});

/** A launcher `read` over fixed chat logs: every row after the cursor at once, then an abortable long poll. */
const readOf =
  (rows: readonly Row[]) =>
  async ({ chatId, cursor, sourceHealth, signal }: ReadInput): Promise<ReadAnswer> => {
    const events = rows.filter((row) => row.chatId === chatId).map((row) => row.event);
    const batch = events.slice(cursor);
    signal?.throwIfAborted();
    if (batch.length === 0 && sourceHealth !== undefined) {
      await new Promise<void>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
    }
    return {
      status: 'batch',
      sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
      chatId,
      cursor,
      nextCursor: cursor + batch.length,
      endCursor: events.length,
      events: batch,
    };
  };

/** Start a reporter over fixed logs, following every chat they name. */
const reportOn = (rows: readonly Row[], send: (frame: HostControlOutbound) => void): RunReporter => {
  const reporter = startRunReporter({ read: readOf(rows), send });
  for (const chatId of new Set(rows.map((row) => row.chatId))) {
    reporter.watch(chatId);
  }
  return reporter;
};

const drain = async (sent: HostControlOutbound[], expected: number): Promise<void> => {
  const deadline = Date.now() + 2000;
  while (sent.length < expected && Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polling a delivery is sequential by nature.
    await new Promise((resolve) => {
      setTimeout(resolve, 2);
    });
  }
};

describe('startRunReporter', () => {
  it('reports one frame per lifecycle transition and nothing else', async () => {
    const queue: Row[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      message('chat-1', 'run-1', 2),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'running', sequence: 3 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'paused', sequence: 4 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'running', sequence: 5 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 6 }),
    ];
    const sent: HostControlOutbound[] = [];
    const reporter = reportOn(queue, (frame) => sent.push(frame));

    await drain(sent, 5);
    reporter.close();

    expect(sent).toEqual([
      { v: 1, type: 'run', runId: 'run-1', chatId: 'chat-1', state: 'admitted', updatedAt: '1970-01-01T00:00:01.000Z' },
      { v: 1, type: 'run', runId: 'run-1', chatId: 'chat-1', state: 'running', updatedAt: '1970-01-01T00:00:03.000Z' },
      {
        v: 1,
        type: 'run',
        runId: 'run-1',
        chatId: 'chat-1',
        state: 'awaiting-approval',
        updatedAt: '1970-01-01T00:00:04.000Z',
      },
      { v: 1, type: 'run', runId: 'run-1', chatId: 'chat-1', state: 'running', updatedAt: '1970-01-01T00:00:05.000Z' },
      {
        v: 1,
        type: 'run',
        runId: 'run-1',
        chatId: 'chat-1',
        state: 'completed',
        updatedAt: '1970-01-01T00:00:06.000Z',
      },
    ]);
    /* The whole point of the directory: identity and state, never content. */
    expect(JSON.stringify(sent)).not.toContain('the whole transcript');
  });

  it('reports nothing for a replayed prefix, and keeps runs apart', async () => {
    const queue: Row[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-2', runId: 'run-2', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 2 }),
    ];
    const sent: HostControlOutbound[] = [];
    const reporter = reportOn(queue, (frame) => sent.push(frame));

    await drain(sent, 3);
    reporter.close();

    expect(sent).toHaveLength(3);
    // Each chat is pulled on its own, so only the order within a run is fixed.
    expect(sent.map((frame) => (frame.type === 'run' ? `${frame.runId}:${frame.state}` : frame.type))).toEqual(
      expect.arrayContaining(['run-1:admitted', 'run-2:admitted', 'run-1:completed']),
    );
  });

  it('survives a send that throws, so a dropped control socket never stops a run', async () => {
    const queue: Row[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 2 }),
    ];
    const sent: HostControlOutbound[] = [];
    let first = true;
    const reporter = reportOn(queue, (frame) => {
      if (first) {
        first = false;
        throw new Error('control socket closed');
      }
      sent.push(frame);
    });

    await drain(sent, 1);
    reporter.close();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ state: 'completed' });
  });

  /**
   * The always-on case: the relay is down for the whole run, the client is gone,
   * and the run finishes anyway. Nothing is ever going to re-report it, so the
   * reconnect has to.
   */
  it('re-sends the last state of a run that finished while the relay was down', async () => {
    const queue: Row[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 2 }),
    ];
    const sent: HostControlOutbound[] = [];
    let connected = false;
    const reporter = reportOn(queue, (frame) => {
      if (!connected) {
        throw new Error('control socket is not connected');
      }
      sent.push(frame);
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(sent).toHaveLength(0);

    connected = true;
    reporter.flush();
    reporter.close();

    /* One frame, not two: the directory needs where the run *ended up*, and a
     * replay of every state it passed through would be noise. */
    expect(sent).toEqual([
      {
        v: 1,
        type: 'run',
        runId: 'run-1',
        chatId: 'chat-1',
        state: 'completed',
        updatedAt: '1970-01-01T00:00:02.000Z',
      },
    ]);
  });

  // W4.r1: a pull ends with its run, and the next command that names the chat follows it again.
  it('follows a chat again after its run ended', async () => {
    const rows: Row[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 2 }),
    ];
    const sent: HostControlOutbound[] = [];
    const reporter = startRunReporter({ read: readOf(rows), send: (frame) => sent.push(frame) });
    reporter.watch('chat-1');
    await drain(sent, 2);

    rows.push(
      lifecycle({ chatId: 'chat-1', runId: 'run-2', state: 'admitted', sequence: 3 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-2', state: 'completed', sequence: 4 }),
    );
    reporter.watch('chat-1');
    await drain(sent, 4);
    reporter.close();

    expect(sent.map((frame) => (frame.type === 'run' ? `${frame.runId}:${frame.state}` : frame.type))).toEqual([
      'run-1:admitted',
      'run-1:completed',
      'run-2:admitted',
      'run-2:completed',
    ]);
  });

  // W4.r2: a follow of a chat with no run ends once caught up, instead of parking until the daemon closes.
  it('ends a follow once caught up on a chat with no run', async () => {
    const rows: Row[] = [message('chat-1', 'run-1', 1)];
    const answered = readOf(rows);
    let parked = 0;
    const reporter = startRunReporter({
      read: async (input) => {
        const answer = await answered(input);
        if (answer.status === 'batch' && answer.events.length > 0) {
          return answer;
        }
        // A long poll: nothing new parks the read until its signal ends.
        parked += 1;
        await new Promise((resolve) => {
          input.signal?.addEventListener('abort', resolve, { once: true });
        });
        parked -= 1;
        return answer;
      },
      send: () => undefined,
    });
    reporter.watch('chat-1');
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    const parkedBeforeClose = parked;
    reporter.close();

    expect(parkedBeforeClose).toBe(0);
  });

  // W4.r2: a run admitted while the last run's follow is in its final read is followed, not dropped.
  it("follows a run whose watch landed during the previous follow's final read", async () => {
    const rows: Row[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 2 }),
    ];
    const finalRead = Promise.withResolvers<void>();
    const inFinalRead = Promise.withResolvers<void>();
    const sent: HostControlOutbound[] = [];
    const reporter = startRunReporter({
      read: async ({ chatId, cursor }) => {
        // One row per batch, answered from the log as it was when the read was asked.
        const events = rows.filter((row) => row.chatId === chatId).map((row) => row.event);
        const batch = events.slice(cursor, cursor + 1);
        const answer: ReadAnswer = {
          status: 'batch',
          sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
          chatId,
          cursor,
          nextCursor: cursor + batch.length,
          endCursor: events.length,
          events: batch,
        };
        if (cursor === 1) {
          inFinalRead.resolve();
          await finalRead.promise;
        }
        return answer;
      },
      send: (frame) => sent.push(frame),
    });
    reporter.watch('chat-1');
    await inFinalRead.promise;
    rows.push(
      lifecycle({ chatId: 'chat-1', runId: 'run-2', state: 'admitted', sequence: 3 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-2', state: 'completed', sequence: 4 }),
    );
    reporter.watch('chat-1');
    finalRead.resolve();
    await drain(sent, 4);
    reporter.close();

    expect(sent.map((frame) => (frame.type === 'run' ? `${frame.runId}:${frame.state}` : frame.type))).toEqual([
      'run-1:admitted',
      'run-1:completed',
      'run-2:admitted',
      'run-2:completed',
    ]);
  });

  it('names the chat of an answered command, and none for a refusal, a plain attach or an unreadable payload', () => {
    const key = { commandId: 'cmd-1', generation: 1 } as const;
    const applied = { ...key, status: 'applied', effect: 'durable', cursor: 0 } as const;
    const refused = {
      ...key,
      status: 'refused',
      effect: 'not-applied',
      code: 'RUN_ID_TAKEN',
      message: 'taken',
    } as const;
    const read = { ...key, status: 'applied', effect: 'not-applied', details: { takeover: false } } as const;
    expect([
      chatToReport({ type: 'cancel', payload: { chatId: 'chat-1', runId: 'run-1' } }, applied),
      chatToReport({ type: 'cancel', payload: { chatId: 'chat-1', runId: 'run-1' } }, refused),
      chatToReport({ type: 'attach', payload: { chatId: 'chat-1' } }, read),
      chatToReport({ type: 'start' }, applied),
      chatToReport({ type: 'no-such-verb', payload: { chatId: 'chat-1' } }, applied),
    ]).toEqual(['chat-1', undefined, undefined, undefined, undefined]);
  });

  // W4.r2: the attach that records a restart's abandoned run wrote `failed`, and the directory must hear it.
  it('names the chat of an attach that took over an abandoned run', () => {
    expect(
      chatToReport(
        { type: 'attach', payload: { chatId: 'chat-1' } },
        { commandId: 'cmd-1', generation: 1, status: 'applied', effect: 'not-applied', details: { takeover: true } },
      ),
    ).toBe('chat-1');
  });
});
