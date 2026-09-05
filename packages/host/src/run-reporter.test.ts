import { describe, expect, it } from 'vitest';
import type { AgentChannelEvent } from '@taucad/agent-host';

import { startRunReporter } from '#run-reporter.js';
import type { HostControlOutbound } from '#host.schemas.js';

const lifecycle = (input: {
  readonly chatId: string;
  readonly runId: string;
  readonly state: 'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  readonly sequence: number;
}): AgentChannelEvent => ({
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

const message = (chatId: string, runId: string, sequence: number): AgentChannelEvent => ({
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

/** A launcher event stream the test drives one event at a time. */
const streamOf = (queue: AgentChannelEvent[], done: { value: boolean }) =>
  async function* (signal: AbortSignal): AsyncIterable<AgentChannelEvent> {
    while (!signal.aborted) {
      const next = queue.shift();
      if (next) {
        yield next;
        continue;
      }
      if (done.value) {
        return;
      }
      // oxlint-disable-next-line no-await-in-loop -- an event stream is sequential by definition.
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
    }
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
    const queue: AgentChannelEvent[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      message('chat-1', 'run-1', 2),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'running', sequence: 3 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'paused', sequence: 4 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'running', sequence: 5 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 6 }),
    ];
    const done = { value: true };
    const sent: HostControlOutbound[] = [];
    const reporter = startRunReporter({ events: streamOf(queue, done), send: (frame) => sent.push(frame) });

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
    const queue: AgentChannelEvent[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-2', runId: 'run-2', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 2 }),
    ];
    const done = { value: true };
    const sent: HostControlOutbound[] = [];
    const reporter = startRunReporter({ events: streamOf(queue, done), send: (frame) => sent.push(frame) });

    await drain(sent, 3);
    reporter.close();

    expect(sent).toHaveLength(3);
    expect(sent.map((frame) => (frame.type === 'run' ? `${frame.runId}:${frame.state}` : frame.type))).toEqual([
      'run-1:admitted',
      'run-2:admitted',
      'run-1:completed',
    ]);
  });

  it('survives a send that throws, so a dropped control socket never stops a run', async () => {
    const queue: AgentChannelEvent[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 2 }),
    ];
    const done = { value: true };
    const sent: HostControlOutbound[] = [];
    let first = true;
    const reporter = startRunReporter({
      events: streamOf(queue, done),
      send: (frame) => {
        if (first) {
          first = false;
          throw new Error('control socket closed');
        }
        sent.push(frame);
      },
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
    const queue: AgentChannelEvent[] = [
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'admitted', sequence: 1 }),
      lifecycle({ chatId: 'chat-1', runId: 'run-1', state: 'completed', sequence: 2 }),
    ];
    const done = { value: true };
    const sent: HostControlOutbound[] = [];
    let connected = false;
    const reporter = startRunReporter({
      events: streamOf(queue, done),
      send: (frame) => {
        if (!connected) {
          throw new Error('control socket is not connected');
        }
        sent.push(frame);
      },
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
});
