// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentChannelClient,
  AgentChannelCommand,
  AgentChannelEvent,
  AgentChannelLiveEvent,
  AgentChannelResponse,
  HostRunSnapshot,
} from '@taucad/agent-host';
import { createAgentHostClient } from '#services/agent-host-client.js';
import { createDaemonAgentHostTransport } from '#services/daemon-agent-host-client.js';

type FakeChannel = AgentChannelClient & {
  readonly seen: AgentChannelCommand[];
  emit(event: AgentChannelEvent): void;
  /** Durable-event listeners currently attached; `emit` before one reaches nobody. */
  listeners(): number;
  kill(): void;
};

const snapshotFor = (chatId: string, runId: string, state: HostRunSnapshot['state']): HostRunSnapshot => ({
  chatId,
  runId,
  turnId: `turn-${runId}`,
  state,
  messages: [],
});

const fakeChannel = (options: { readonly hold?: Promise<void> } = {}): FakeChannel => {
  const seen: AgentChannelCommand[] = [];
  const closeHandlers = new Set<(reason: { origin: 'local' | 'remote' | 'timeout'; message: string }) => void>();
  const eventSinks = new Set<(event: AgentChannelEvent) => void>();
  const wakers = new Set<() => void>();
  let dead = false;
  const refuseIfDead = (): void => {
    if (dead) {
      throw Object.assign(new Error('closed'), { code: 'CHANNEL_CLOSED' });
    }
  };

  const stream = <Event>(sinks: Set<(event: Event) => void>, signal?: AbortSignal): AsyncIterable<Event> => {
    const pending: Event[] = [];
    let wake = Promise.withResolvers<void>();
    const sink = (event: Event): void => {
      pending.push(event);
      wake.resolve();
    };
    sinks.add(sink);
    /* A dead channel ends its listens, exactly as `@taucad/rpc` does: a *remote*
     * close pushes the end sentinel into every sink rather than failing it. */
    const waker = (): void => {
      wake.resolve();
    };
    wakers.add(waker);
    signal?.addEventListener(
      'abort',
      () => {
        sinks.delete(sink);
        wakers.delete(waker);
        wake.resolve();
      },
      { once: true },
    );
    return {
      async *[Symbol.asyncIterator]() {
        // oxlint-disable-next-line no-unmodified-loop-condition -- the abort listener and `kill` above flip these.
        while ((signal === undefined || !signal.aborted) && !dead) {
          // oxlint-disable-next-line no-await-in-loop -- one wake per delivered batch.
          await wake.promise;
          wake = Promise.withResolvers<void>();
          yield* pending.splice(0);
        }
      },
    };
  };

  return {
    seen,
    emit: (event) => {
      for (const sink of eventSinks) {
        sink(event);
      }
    },
    listeners: () => eventSinks.size,
    kill: () => {
      dead = true;
      for (const waker of wakers) {
        waker();
      }
      wakers.clear();
      for (const handler of closeHandlers) {
        handler({ origin: 'remote', message: 'The agent host closed this connection.' });
      }
      closeHandlers.clear();
    },
    execute: async (command: AgentChannelCommand): Promise<AgentChannelResponse> => {
      seen.push(command);
      /* Checked on both sides of the hold: a wire that dies with a command in
       * flight is the window a re-dial has to cover. */
      refuseIfDead();
      await options.hold;
      refuseIfDead();
      if (command.type === 'tail' || command.type === 'attach') {
        const batch = { cursor: command.cursor, nextCursor: command.cursor, endCursor: command.cursor, events: [] };
        return command.type === 'attach'
          ? {
              type: 'attach',
              chatId: command.chatId,
              batch,
              leadership: { role: 'leader', generation: 'daemon-1' },
              snapshot: snapshotFor(command.chatId, 'run-1', 'completed'),
              takeover: false,
            }
          : { type: 'tail', chatId: command.chatId, batch };
      }
      if (command.type === 'mint-mcp-capability') {
        // The Paseo runner asks a daemon for this directly; the transport never does.
        throw new Error('unexpected mint command on the transport');
      }
      const runId = command.type === 'resume' ? 'resumed-run' : command.runId;
      return { type: 'result', operation: command.type, snapshot: snapshotFor(command.chatId, runId, 'completed') };
    },
    events: (signal) => stream<AgentChannelEvent>(eventSinks, signal),
    liveEvents: (signal) => stream<AgentChannelLiveEvent>(new Set(), signal),
    onClose: (handler) => {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    close: () => {
      dead = true;
    },
  };
};

describe('createDaemonAgentHostTransport', () => {
  it('projects a browser admission onto the T0 vocabulary without the daemon-owned fields', async () => {
    const channel = fakeChannel();
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));

    await expect(
      client.start({
        chatId: 'chat-1',
        runId: 'run-1',
        trigger: 'submit',
        message: 'Build it.',
        config: {
          systemPrompt: 'admission prompt',
          systemPromptBlocks: [
            { type: 'text', text: 'static' },
            { type: 'text', text: 'dynamic' },
          ],
          model: { id: 'fixture-model', providerKind: 'anthropic', contextWindow: 200_000 },
          toolChoice: 'auto',
          allowedTools: ['create_file'],
          // The daemon assembles its own tool registry; this must not travel.
          testingEnabled: true,
        },
      }),
    ).resolves.toMatchObject({ runId: 'run-1', state: 'completed' });

    const start = channel.seen.at(0);
    expect(start).toEqual({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-1',
      runId: 'run-1',
      /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `expect.any` is typed `any` by vitest. */
      message: { id: expect.any(String), role: 'user', content: 'Build it.' },
      config: {
        systemPrompt: 'admission prompt',
        systemPromptBlocks: [
          { type: 'text', text: 'static' },
          { type: 'text', text: 'dynamic' },
        ],
        model: { id: 'fixture-model', providerKind: 'anthropic', contextWindow: 200_000 },
        toolChoice: 'auto',
        allowedTools: ['create_file'],
      },
    });
    await client.close();
    // Teardown is local: a daemon outlives every page that attached to it.
    expect(channel.seen.some((command) => (command as { type: string }).type === 'close')).toBe(false);
  });

  it('carries the approval round trip and the durable stream unchanged', async () => {
    const channel = fakeChannel();
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));
    const events: unknown[] = [];
    const unsubscribe = client.subscribe((chatId, event) => {
      events.push({ chatId, type: event.type });
    });

    await client.resolveInterrupt('chat-1', 'run-1', { interruptId: 'approval-1', outcome: 'approved' });
    expect(channel.seen.at(-1)).toEqual({
      type: 'resolve-interrupt',
      chatId: 'chat-1',
      runId: 'run-1',
      interruptId: 'approval-1',
      outcome: 'approved',
    });

    channel.emit({
      chatId: 'chat-1',
      event: {
        version: 1,
        type: 'interrupt.recorded',
        leaderEpoch: 'daemon-1',
        sequence: 3,
        recordedAt: '2026-09-02T00:00:00.000Z',
        runId: 'run-1',
        interruptId: 'approval-1',
        phase: 'requested',
        reason: 'Write main.scad?',
      },
    });
    await expect.poll(() => events).toEqual([{ chatId: 'chat-1', type: 'interrupt.recorded' }]);

    unsubscribe();
    await client.close();
  });

  it('refuses a command on a dead channel with a typed reason instead of hanging', async () => {
    const channel = fakeChannel();
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));
    channel.kill();

    await expect(client.resume('chat-1')).rejects.toMatchObject({ code: 'HOST_DISCONNECTED' });
    await client.close();
  });
});

const logEvent = (sequence: number): AgentChannelEvent => ({
  chatId: 'chat-1',
  event: {
    version: 1,
    type: 'run.lifecycle',
    leaderEpoch: 'daemon-1',
    sequence,
    recordedAt: '2026-09-03T00:00:00.000Z',
    runId: 'run-1',
    state: sequence === 1 ? 'running' : 'completed',
  },
});

/**
 * A relayed channel does not outlive its relay session, and the run does not
 * end when it dies: the daemon keeps going (always-on semantics) and the page
 * must rejoin rather than render a card. The transport owns the wire, so the
 * transport heals it — one client, N channels (W4 ruling 6), and no consumer
 * above here learns that the socket was replaced.
 */
describe('createDaemonAgentHostTransport re-dial', () => {
  it('re-dials a dead channel and keeps the one projection running', async () => {
    const channels: FakeChannel[] = [];
    const client = createAgentHostClient(
      createDaemonAgentHostTransport(
        async () => {
          const next = fakeChannel();
          channels.push(next);
          return next;
        },
        { redialBackoff: 0 },
      ),
    );
    const seen: number[] = [];
    const unsubscribe = client.subscribe((_chatId, event) => {
      seen.push(event.sequence);
    });

    await expect.poll(() => channels[0]?.listeners()).toBe(1);
    channels[0]?.emit(logEvent(1));
    await expect.poll(() => seen).toEqual([1]);

    channels[0]?.kill();

    // The live stream is the eager trigger: the dead wire is replaced under it.
    await expect.poll(() => channels[1]?.listeners()).toBe(1);
    channels[1]?.emit(logEvent(2));
    await expect.poll(() => seen).toEqual([1, 2]);

    // And the projection's own cursor read runs on the healed wire, once.
    await expect(client.attach({ chatId: 'chat-1', cursor: 7, limit: 16 })).resolves.toMatchObject({ cursor: 7 });
    expect(channels[1]?.seen.filter((command) => command.type === 'attach')).toHaveLength(1);

    unsubscribe();
    await client.close();
  });

  it('replays a read that the wire died under, on the channel that replaced it', async () => {
    const hold = Promise.withResolvers<void>();
    const channels: FakeChannel[] = [];
    const client = createAgentHostClient(
      createDaemonAgentHostTransport(
        async () => {
          const next = fakeChannel(channels.length === 0 ? { hold: hold.promise } : {});
          channels.push(next);
          return next;
        },
        { redialBackoff: 0 },
      ),
    );

    const attached = client.attach({ chatId: 'chat-1', cursor: 4, limit: 16 });
    await expect.poll(() => channels[0]?.seen.length).toBe(1);
    channels[0]?.kill();
    hold.resolve();

    await expect(attached).resolves.toMatchObject({ cursor: 4 });
    expect(channels).toHaveLength(2);
    expect(channels[1]?.seen).toEqual([{ type: 'attach', chatId: 'chat-1', cursor: 4, limit: 16 }]);
    await client.close();
  });

  it('reports the death once the bounded re-dials are spent', async () => {
    let dials = 0;
    const first = fakeChannel();
    const client = createAgentHostClient(
      createDaemonAgentHostTransport(
        async () => {
          dials += 1;
          if (dials === 1) {
            return first;
          }
          throw new Error('The relay refused a new session.');
        },
        { redialAttempts: 2, redialBackoff: 0 },
      ),
    );

    await expect(client.attach({ chatId: 'chat-1', cursor: 0, limit: 16 })).resolves.toMatchObject({ cursor: 0 });
    first.kill();

    await expect(client.resume('chat-1')).rejects.toMatchObject({ code: 'HOST_DISCONNECTED' });
    // One dial for the placement, then exactly the bounded re-dials — no more.
    expect(dials).toBe(3);
    await expect(client.resume('chat-1')).rejects.toMatchObject({ code: 'HOST_DISCONNECTED' });
    expect(dials).toBe(3);
    await client.close();
  });

  /**
   * Every other test here passes `redialBackoff: 0`, so the ladder the page
   * actually ships with was never exercised. On the shipped defaults a page
   * whose relay session expired must rejoin inside the DS-3 budget, and one
   * backoff step (250 ms) is larger than the whole budget — so the first
   * re-dial waits for nothing, and only a re-dial that already failed backs off.
   */
  it('re-dials immediately on the shipped defaults, and only then backs off', async () => {
    vi.useFakeTimers();
    try {
      const first = fakeChannel();
      let dials = 0;
      // No options: the ladder every page gets.
      const transport = createDaemonAgentHostTransport(async () => {
        dials += 1;
        if (dials === 1) {
          return first;
        }
        throw new Error('The relay refused a new session.');
      });

      await transport.ready;
      expect(dials).toBe(1);
      first.kill();

      const failed = expect(
        transport.call({ type: 'attach', chatId: 'chat-1', cursor: 0, limit: 16 }),
      ).rejects.toMatchObject({ code: 'HOST_DISCONNECTED' });

      // The first re-dial is immediate: no clock advance buys it.
      await vi.advanceTimersByTimeAsync(0);
      expect(dials).toBe(2);

      // The second waits one backoff...
      await vi.advanceTimersByTimeAsync(249);
      expect(dials).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(dials).toBe(3);

      // ...and the third waits double it.
      await vi.advanceTimersByTimeAsync(499);
      expect(dials).toBe(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(dials).toBe(4);

      // Three re-dials, then the same typed death — the bound did not change.
      await failed;
      transport.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
