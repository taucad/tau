// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AgentChannelClient, AgentLogEvent, HostRunSnapshot } from '@taucad/agent-host';
import type { CatchUpFrame, CommandAnswer, HostCommand, ReadRequest } from '@taucad/agent-host/wire';
import { createAgentHostClient } from '#services/agent-host-client.js';
import { createDaemonAgentHostTransport } from '#services/daemon-agent-host-client.js';

type FakeChannel = AgentChannelClient & {
  readonly commands: HostCommand[];
  readonly reads: ReadRequest[];
  append(row: AgentLogEvent): void;
  /** Reads parked on the log's end right now. */
  parked(): number;
};

const snapshotFor = (chatId: string, runId: string, state: HostRunSnapshot['state']): HostRunSnapshot => ({
  chatId,
  runId,
  turnId: `turn-${runId}`,
  state,
  messages: [],
});

const fakeChannel = (answer?: (command: HostCommand) => CommandAnswer | undefined): FakeChannel => {
  const commands: HostCommand[] = [];
  const reads: ReadRequest[] = [];
  const rows: AgentLogEvent[] = [];
  const waiters = new Set<() => void>();
  const empty = async function* (): AsyncGenerator<never> {
    yield* [];
  };
  return {
    commands,
    reads,
    append: (row) => {
      rows.push(row);
      for (const wake of waiters) {
        wake();
      }
    },
    parked: () => waiters.size,
    execute: async ({ signal: _signal, ...command }) => {
      commands.push(command);
      const scripted = answer?.(command);
      if (scripted) {
        return scripted;
      }
      if (command.type === 'attach') {
        return {
          commandId: command.commandId,
          generation: 1,
          status: 'applied',
          effect: 'not-applied',
          details: {
            snapshot: snapshotFor(command.payload.chatId, 'run-1', 'completed'),
            takeover: false,
            endCursor: 0,
          },
        };
      }
      return { commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 0 };
    },
    read: async ({ signal, ...request }) => {
      reads.push(request);
      // A long poll: parked until a row exists past the cursor, or the reader lets go (SC-R14).
      const released = (): boolean => signal?.aborted === true;
      while (rows.length <= request.cursor && !released()) {
        // oxlint-disable-next-line no-await-in-loop -- one park per append.
        await new Promise<void>((resolve) => {
          const wake = (): void => {
            waiters.delete(wake);
            resolve();
          };
          waiters.add(wake);
          signal?.addEventListener('abort', wake, { once: true });
        });
      }
      const events = rows.slice(request.cursor, request.cursor + request.limit);
      return {
        status: 'batch',
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
        chatId: request.chatId,
        cursor: request.cursor,
        nextCursor: request.cursor + events.length,
        endCursor: rows.length,
        events,
      };
    },
    catchUp: async function* catchUp() {
      yield {
        type: 'validated',
        health: { historyIntact: true, newerHistory: false, quarantined: false },
        position: { cursor: 0, sourceGeneration: 'daemon-source' },
        observedEndCursor: 0,
      };
    },
    liveEvents: () => empty(),
    revision: async () => ({ result: null, status: null }),
    revisionEvents: () => empty(),
    onClose: () => () => undefined,
    close: () => undefined,
  };
};

describe('createDaemonAgentHostTransport', () => {
  it('recaptures history on the same client after read ownership refusal without declaring transport death', async () => {
    const channel = fakeChannel();
    channel.read = async ({ chatId }) => ({ status: 'refused', chatId, reason: 'owner-fenced' });
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));
    const ended = Promise.withResolvers<void>();
    client.subscribe({ chatId: 'chat-owner-recovery', cursor: 0 }, () => undefined, ended.resolve);
    try {
      await ended.promise;
      const frames: CatchUpFrame[] = [];
      for await (const frame of client.catchUp({ chatId: 'chat-owner-recovery', limit: 2, maxBytes: 1024 })) {
        frames.push(frame);
      }
      expect(frames).toEqual([
        {
          type: 'validated',
          health: { historyIntact: true, newerHistory: false, quarantined: false },
          position: { cursor: 0, sourceGeneration: 'daemon-source' },
          observedEndCursor: 0,
        },
      ]);
    } finally {
      await client.close();
    }
  });

  it('forwards the required catch-up stream from its authoritative daemon channel', async () => {
    const client = createAgentHostClient(createDaemonAgentHostTransport(fakeChannel()));
    try {
      const frames: CatchUpFrame[] = [];
      for await (const frame of client.catchUp({ chatId: 'chat-catch-up', limit: 2, maxBytes: 1024 })) {
        frames.push(frame);
      }
      expect(frames).toEqual([
        {
          type: 'validated',
          health: { historyIntact: true, newerHistory: false, quarantined: false },
          position: {
            cursor: 0,
            sourceGeneration: 'daemon-source',
          },
          observedEndCursor: 0,
        },
      ]);
    } finally {
      await client.close();
    }
  });

  it('should send a browser admission as one keyed start without the daemon-owned fields', async () => {
    const channel = fakeChannel();
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));

    await expect(
      client.hostCommand({
        type: 'start',
        commandId: 'gesture-start-1',
        payload: {
          chatId: 'chat-1',
          runId: 'run-1',
          trigger: 'submit',
          message: { id: 'user-1', role: 'user', content: 'Build it.' },
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
        },
      }),
    ).resolves.toMatchObject({ commandId: 'gesture-start-1', status: 'applied' });

    expect(channel.commands.at(0)).toEqual({
      type: 'start',
      commandId: 'gesture-start-1',
      payload: {
        trigger: 'submit',
        chatId: 'chat-1',
        runId: 'run-1',
        message: { id: 'user-1', role: 'user', content: 'Build it.' },
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
      },
    });
    expect(channel.commands.map((command) => command.type)).toEqual(['start']);
    await client.close();
  });

  it('should carry the external agent selector in config.agent (drift 2)', async () => {
    const channel = fakeChannel();
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));

    await client.hostCommand({
      type: 'start',
      commandId: 'gesture-agent-1',
      payload: {
        chatId: 'chat-1',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'user-1', role: 'user', content: 'Build it.' },
        config: { agent: { kind: 'acp', id: 'claude-code' }, systemPrompt: 'CAD prompt', toolChoice: 'auto' },
      },
    });

    expect(channel.commands.at(0)?.payload).toMatchObject({
      config: { agent: { kind: 'acp', id: 'claude-code' }, systemPrompt: 'CAD prompt', toolChoice: 'auto' },
    });
    expect(channel.commands.at(0)?.payload).not.toHaveProperty('agent');
    await client.close();
  });

  /* W0.3 (L3 D3). A reattached page knows its run only from `attach`, and
   * `cancel` found no chat for it: `RUN_NOT_FOUND`, which the transport
   * swallowed, so Stop never reached the host. */
  it('should cancel a run it only attached to', async () => {
    const channel = fakeChannel();
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));

    await client.hostCommand({
      type: 'attach',
      commandId: 'attach-1',
      payload: { chatId: 'chat-attached' },
    });
    await expect(
      client.hostCommand({
        type: 'cancel',
        commandId: 'stop-1',
        payload: { chatId: 'chat-attached', runId: 'run-1' },
      }),
    ).resolves.toMatchObject({ status: 'applied' });

    expect(channel.commands.find((command) => command.type === 'cancel')).toEqual({
      type: 'cancel',
      commandId: 'stop-1',
      payload: { chatId: 'chat-attached', runId: 'run-1' },
    });
    await client.close();
  });

  it('should mint a new key for every gesture', async () => {
    const channel = fakeChannel();
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));

    await client.hostCommand({
      type: 'resolve-interrupt',
      commandId: 'approval-click-1',
      payload: {
        chatId: 'chat-1',
        runId: 'run-1',
        interruptId: 'approval-1',
        outcome: 'approved',
      },
    });
    await client.hostCommand({
      type: 'resolve-interrupt',
      commandId: 'approval-click-2',
      payload: {
        chatId: 'chat-1',
        runId: 'run-1',
        interruptId: 'approval-2',
        outcome: 'denied',
      },
    });

    const resolutions = channel.commands.filter((command) => command.type === 'resolve-interrupt');
    expect(resolutions.map((command) => command.payload)).toEqual([
      { chatId: 'chat-1', runId: 'run-1', interruptId: 'approval-1', outcome: 'approved' },
      { chatId: 'chat-1', runId: 'run-1', interruptId: 'approval-2', outcome: 'denied' },
    ]);
    expect(new Set(resolutions.map((command) => command.commandId)).size).toBe(2);
    await client.close();
  });

  it('should pull durable rows with one outstanding bounded read per chat', async () => {
    const channel = fakeChannel();
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));
    const seen: number[] = [];
    const unsubscribe = client.subscribe({ chatId: 'chat-1', cursor: 0 }, (_chatId, event) => {
      seen.push(event.sequence);
    });

    await expect.poll(() => channel.parked()).toBe(1);
    const row = (sequence: number): AgentLogEvent => ({
      version: 1,
      type: 'run.lifecycle',
      leaderEpoch: 'daemon-1',
      sequence,
      recordedAt: '2026-09-03T00:00:00.000Z',
      runId: 'run-1',
      state: 'running',
    });
    channel.append(row(1));
    channel.append(row(2));
    await expect.poll(() => seen).toEqual([1, 2]);
    await expect.poll(() => channel.parked()).toBe(1);

    expect(channel.reads.map((read) => read.cursor)).toEqual([0, 2]);
    expect(channel.reads.every((read) => read.limit === 16 && read.maxBytes === 1_048_576)).toBe(true);
    unsubscribe();
    await client.close();
  });

  it('should throw a refusal with its code and details', async () => {
    const channel = fakeChannel((command) =>
      command.type === 'resume'
        ? {
            commandId: command.commandId,
            generation: 1,
            status: 'refused',
            effect: 'not-applied',
            code: 'RESUME_UNAVAILABLE',
            message: 'Run run-9 is not this chat’s current run.',
            details: { currentRunId: 'run-1' },
          }
        : undefined,
    );
    const client = createAgentHostClient(createDaemonAgentHostTransport(channel));

    await expect(
      client.hostCommand({
        type: 'resume',
        commandId: 'resume-9',
        payload: { chatId: 'chat-1', runId: 'run-9' },
      }),
    ).resolves.toMatchObject({
      status: 'refused',
      code: 'RESUME_UNAVAILABLE',
      details: { currentRunId: 'run-1' },
    });
    await client.close();
  });

  it('should hand the placement’s first-dial refusal to the caller verbatim', async () => {
    const refusal = Object.assign(new Error('This computer is no longer paired with your account.'), {
      code: 'HOST_NOT_PAIRED',
    });
    const client = createAgentHostClient(
      createDaemonAgentHostTransport(async () => {
        throw refusal;
      }),
    );

    await expect(
      client.hostCommand({
        type: 'attach',
        commandId: 'attach-rejected',
        payload: { chatId: 'chat-1' },
      }),
    ).rejects.toMatchObject({
      code: 'HOST_NOT_PAIRED',
      message: 'This computer is no longer paired with your account.',
    });
    await client.close();
  });
});
