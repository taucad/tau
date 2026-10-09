import { MessageChannel } from 'node:worker_threads';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentLauncher, serveAgentChannel } from '@taucad/agent-host/launcher';
import type { AgentLauncher } from '@taucad/agent-host/launcher';
import { createNodeChatStore } from '@taucad/agent-host/node';
import { createTauCloudGatewayModelTransport } from '@taucad/agent-host';
import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectionFact, KnownProjectionEvent, AgentChannelClient } from '@taucad/agent-host';
import type { AgentWireProtocol, CatchUpFrame, ReadAnswer } from '@taucad/agent-host/wire';
import { catchUpFrameSchema, agentWireVersion, agentWireProtocolSchemas } from '@taucad/agent-host/wire';
import { createAgentChannelClient, serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import { createAgentHostClient } from '#services/agent-host-client.js';
import { createDaemonAgentHostTransport } from '#services/daemon-agent-host-client.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { chunksOf, chatProjectionLogic } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import { hostAttachment } from '#chat-clients/_internal/host-attachment.js';

const healthy = { historyIntact: true, newerHistory: false, quarantined: false };
const lifecycleFact = (
  sequence: number,
  state: Extract<KnownProjectionEvent, { type: 'run.lifecycle' }>['state'],
): Extract<ProjectionFact, { classification: 'known' }> => ({
  classification: 'known',
  row: { version: 1, leaderEpoch: 'g1', sequence, recordedAt: '2026-09-28T00:00:00.000Z', runId: 'run_1', attempt: 1 },
  effect: { type: 'run.lifecycle', state },
});

const writerOwnedCatchUp = async function* ({ chatId }: { chatId: string }): AsyncIterable<CatchUpFrame> {
  yield { type: 'refused', answer: { status: 'refused', chatId, reason: 'writer-owned' } };
};

describe('hostAttachment', () => {
  it('should recapture a followed generation reset over the real channel without ordinary page replay', async () => {
    const chatId = 'recaptured';
    const root = await mkdtemp(join(tmpdir(), 'tau-attachment-recapture-'));
    const directory = join(root, '.tau', 'chats', chatId);
    const path = join(directory, 'events.jsonl');
    await mkdir(directory, { recursive: true });
    const oldRows = [lifecycleRow(0, 'admitted', 'old-run'), lifecycleRow(1, 'completed', 'old-run')];
    const replacement = [
      lifecycleRow(0, 'admitted', 'new-run'),
      ...Array.from({ length: 255 }, (_, index) =>
        logRow(index + 1, {
          runId: 'new-run',
          type: 'message.appended',
          message: { id: `reply-${index}`, role: 'assistant', content: `Replacement ${index}` },
        }),
      ),
      lifecycleRow(256, 'completed', 'new-run'),
    ];
    await writeFile(path, oldRows.map((row) => JSON.stringify(row)).join('\n') + '\n');
    const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;
    const launcher = createAgentLauncher({
      chats: createNodeChatStore({ workspaceRoot: root }),
      model,
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'unused',
        fetch: async () => {
          throw new Error('Read-only reset must not invoke a model.');
        },
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'Read-only fixture',
      toolRegistry: { list: () => [], invoke: async () => ({ content: 'unused', isError: true }) },
    });
    const firstRead = Promise.withResolvers<void>();
    const replace = Promise.withResolvers<void>();
    let activeReads = 0;
    let maximumReads = 0;
    const read = vi.fn<AgentLauncher['read']>(async (input) => {
      activeReads += 1;
      maximumReads = Math.max(maximumReads, activeReads);
      try {
        if (read.mock.calls.length === 1) {
          firstRead.resolve();
          await replace.promise;
        }
        return await launcher.read(input);
      } finally {
        activeReads -= 1;
      }
    });
    const pageSizes: number[] = [];
    const catchUp = vi.fn<AgentLauncher['catchUp']>(async function* (input) {
      for await (const frame of launcher.catchUp(input)) {
        if (frame.type === 'page') {
          pageSizes.push(frame.answer.facts.length);
        }
        yield frame;
      }
    });
    const liveEvents = vi.fn<AgentLauncher['liveEvents']>((input) => launcher.liveEvents(input));
    const channel = new MessageChannel();
    const server = serveAgentChannel(
      channel.port1,
      { ...launcher, read, catchUp, liveEvents },
      { build: 'reset-count' },
    );
    const wire = createAgentChannelClient({ connect: () => channel.port2 });
    const client = createAgentHostClient(createDaemonAgentHostTransport(wire));
    const projection = createActor(chatProjectionLogic).start();
    const actor = createActor(hostAttachment, { input: { chatId, projection, connect: async () => client } }).start();
    try {
      await firstRead.promise;
      expect(projection.getSnapshot().context.ledger.runs['old-run']?.lifecycle).toBe('completed');
      await writeFile(path, replacement.map((row) => JSON.stringify(row)).join('\n') + '\n');
      replace.resolve();
      await vi.waitFor(() => {
        expect(projection.getSnapshot().context.ledger.position.cursor).toBe(257);
        expect(projection.getSnapshot().context.ledger.runs['new-run']?.lifecycle).toBe('completed');
        expect(activeReads).toBe(1);
      });
      expect.soft(catchUp).toHaveBeenCalledTimes(2);
      expect.soft(read.mock.calls.map(([input]) => input.cursor)).toEqual([2, 257]);
      expect.soft(pageSizes).toEqual([2, ...Array.from({ length: 16 }, () => 16), 1]);
      expect(maximumReads).toBe(1);
      expect(liveEvents).toHaveBeenCalledOnce();
      expect(projection.getSnapshot().context.ledger.runs['old-run']).toBeUndefined();
    } finally {
      replace.resolve();
      actor.stop();
      projection.stop();
      await client.close();
      wire.close();
      server.dispose('reset-count complete');
      channel.port1.close();
      channel.port2.close();
      await launcher.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('should recapture a retired writer without replacing live ownership or admitting old reader callbacks', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const catchUp = vi.fn<AgentHostClient['catchUp']>(async function* ({ chatId }) {
      if (catchUp.mock.calls.length < 3) {
        yield { type: 'refused', answer: { status: 'refused', chatId, reason: 'writer-owned' } };
        return;
      }
      yield {
        type: 'page',
        answer: {
          status: 'batch',
          chatId,
          sourceGeneration: 'retired-writer-bytes',
          cursor: 0,
          nextCursor: 3,
          endCursor: 3,
          facts: [lifecycleFact(0, 'admitted'), lifecycleFact(1, 'running'), lifecycleFact(2, 'completed')],
        },
      };
      yield {
        type: 'validated',
        health: healthy,
        position: { cursor: 3, sourceGeneration: 'retired-writer-bytes', last: { leaderEpoch: 'g1', sequence: 2 } },
        observedEndCursor: 3,
      };
    });
    const stoppedReaders: Array<ReturnType<typeof vi.fn>> = [];
    const subscribe = vi.fn<AgentHostClient['subscribe']>(() => {
      const stop = vi.fn();
      stoppedReaders.push(stop);
      return stop;
    });
    let deliverLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const stopLive = vi.fn();
    const subscribeLive = vi.fn<AgentHostClient['subscribeLive']>((_chatId, listener) => {
      deliverLive = listener;
      return stopLive;
    });
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        onStatus,
        connect: async () => ({ catchUp, read: vi.fn(), subscribe, subscribeLive, close: async () => undefined }),
      },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledOnce();
      });
      const oldReader = subscribe.mock.calls[0]![3]!;
      oldReader({
        status: 'batch',
        chatId: 'chat_1',
        sourceGeneration: 'first-writer',
        sourceHealth: healthy,
        cursor: 0,
        nextCursor: 1,
        endCursor: 1,
        events: [lifecycleRow(0, 'completed', 'old-run')],
      });
      deliverLive?.('chat_1', {
        type: 'text-delta',
        chatId: 'chat_1',
        sourceGeneration: 'new-writer',
        runId: 'run_1',
        messageId: 'new-reply',
        contentIndex: 0,
        delta: 'first live prefix',
      });
      oldReader({ status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' });
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledTimes(2);
      });
      expect(subscribe.mock.calls[1]![0]).toEqual({ chatId: 'chat_1', cursor: 0 });
      expect(stoppedReaders[0]).toHaveBeenCalledOnce();
      const freshBase = projection.getSnapshot().context;
      // A callback retained by the retired consumer cannot publish or initiate another capture.
      oldReader({
        status: 'batch',
        chatId: 'chat_1',
        sourceGeneration: 'first-writer',
        sourceHealth: healthy,
        cursor: 0,
        nextCursor: 1,
        endCursor: 1,
        events: [lifecycleRow(0, 'running', 'old-run')],
      });
      expect(projection.getSnapshot().context).toBe(freshBase);
      const writerReader = subscribe.mock.calls[1]![3]!;
      writerReader({
        status: 'batch',
        chatId: 'chat_1',
        sourceGeneration: 'new-writer',
        sourceHealth: healthy,
        cursor: 0,
        nextCursor: 2,
        endCursor: 17,
        events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
      });
      expect(chunksOf(projection.getSnapshot().context.live?.chunks)).toContainEqual(
        expect.objectContaining({ type: 'text-delta', delta: 'first live prefix' }),
      );
      // The writer can finish while the reader is paging its in-memory history.
      writerReader({ status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' });
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledTimes(3);
      });
      expect(catchUp).toHaveBeenCalledTimes(3);
      expect(subscribe.mock.calls[2]![0]).toMatchObject({ cursor: 3, sourceGeneration: 'retired-writer-bytes' });
      expect(projection.getSnapshot().context.ledger.runs['run_1']?.lifecycle).toBe('completed');
      expect(projection.getSnapshot().context.ledger.runs['old-run']).toBeUndefined();
      expect(subscribeLive).toHaveBeenCalledOnce();
      expect(stopLive).not.toHaveBeenCalled();
      expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'attachment.lost' }));
    } finally {
      actor.stop();
      projection.stop();
    }
  });

  for (const cause of ['identity-mismatch', 'cursor-ahead', 'generation-at-zero'] as const) {
    it(`should recapture an empty followed source after ${cause} without early currentness`, async () => {
      const projection = createActor(chatProjectionLogic).start();
      const validate = Promise.withResolvers<void>();
      const catchUp = vi.fn<AgentHostClient['catchUp']>(async function* (): AsyncIterable<CatchUpFrame> {
        const sourceGeneration = catchUp.mock.calls.length === 1 ? 'original-empty' : 'replacement-empty';
        if (sourceGeneration === 'replacement-empty') {
          await validate.promise;
        }
        yield {
          type: 'validated',
          health: healthy,
          position: { cursor: 0, sourceGeneration },
          observedEndCursor: 0,
        };
      });
      const subscribe = vi.fn<AgentHostClient['subscribe']>(() => vi.fn());
      const onStatus = vi.fn();
      const actor = createActor(hostAttachment, {
        input: {
          chatId: 'chat_1',
          projection,
          onStatus,
          connect: async () => ({ catchUp, read: vi.fn(), subscribe, close: async () => undefined }),
        },
      }).start();
      try {
        await vi.waitFor(() => {
          expect(subscribe).toHaveBeenCalledOnce();
        });
        const originalVersion = projection.getSnapshot().context.resetVersion;
        onStatus.mockClear();
        const answer: ReadAnswer =
          cause === 'generation-at-zero'
            ? {
                status: 'batch',
                chatId: 'chat_1',
                sourceGeneration: 'replacement-empty',
                sourceHealth: healthy,
                cursor: 0,
                nextCursor: 0,
                endCursor: 0,
                events: [],
              }
            : { status: 'refused', chatId: 'chat_1', reason: cause };
        subscribe.mock.calls[0]![3]!(answer);
        await vi.waitFor(() => {
          expect(catchUp).toHaveBeenCalledTimes(2);
        });
        expect(projection.getSnapshot().context.resetVersion).toBe(originalVersion + 1);
        expect(projection.getSnapshot().context.ledger.position.sourceGeneration).toBeUndefined();
        expect(subscribe).toHaveBeenCalledOnce();
        expect(onStatus).not.toHaveBeenCalledWith({ type: 'attachment.attached' });
        validate.resolve();
        await vi.waitFor(() => {
          expect(subscribe).toHaveBeenCalledTimes(2);
        });
        expect(subscribe.mock.calls[1]![0]).toMatchObject({ cursor: 0, sourceGeneration: 'replacement-empty' });
        expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.attached' });
      } finally {
        validate.resolve();
        actor.stop();
        projection.stop();
      }
    });
  }

  it('dispatches the real live listen before capture and read after delayed transport readiness', async () => {
    const channel = new MessageChannel();
    const ready = Promise.withResolvers<AgentChannelClient>();
    const dispatches: string[] = [];
    let liveSignal: AbortSignal | undefined;
    const server = serveAgentWorkerChannel<AgentWireProtocol>(channel.port1, {
      protocolSchemas: agentWireProtocolSchemas,
      sessionKey: 'tau-agent',
      hello: { wire: agentWireVersion, build: 'attachment-order' },
      impl: {
        // oxlint-disable-next-line eslint/max-params -- existing channel-server callback contract.
        call: async (_context, name, _args, signal) => {
          dispatches.push(name);
          if (name !== 'read') {
            throw new Error(`Unexpected attachment call: ${name}`);
          }
          await new Promise<void>((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
          });
          throw new Error('Attachment read stopped.');
        },
        // oxlint-disable-next-line eslint/max-params -- existing channel-server callback contract.
        listen: (_context, name, _args, signal) => {
          dispatches.push(name);
          if (name === 'liveEvents') {
            liveSignal = signal;
            return (async function* () {
              dispatches.push('liveEvents.consumed');
              await new Promise<void>((resolve) => {
                signal.addEventListener(
                  'abort',
                  () => {
                    resolve();
                  },
                  { once: true },
                );
              });
              yield* [];
            })();
          }
          if (name !== 'catchUp') {
            throw new Error(`Unexpected attachment listen: ${name}`);
          }
          // The channel's generic listen signature correlates each name with its event type.
          // This branch emits only the schema-validated catchUp frame, like the production channel adapter.
          return (async function* () {
            yield catchUpFrameSchema.parse({
              type: 'validated',
              health: healthy,
              position: { cursor: 0, sourceGeneration: 'attachment-order' },
              observedEndCursor: 0,
            });
          })() as AsyncIterable<never>;
        },
      },
    });
    const wire = createAgentChannelClient({ connect: () => channel.port2 });
    const client = createAgentHostClient(createDaemonAgentHostTransport(async () => ready.promise));
    const projection = createActor(chatProjectionLogic).start();
    const connect = vi.fn(async () => client);
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: { chatId: 'chat_1', projection, connect, onStatus },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(connect).toHaveBeenCalledOnce();
      });
      expect(dispatches).toEqual([]);
      expect(onStatus).not.toHaveBeenCalled();
      ready.resolve(wire);
      await vi.waitFor(() => {
        expect(dispatches).toContain('read');
      });
      expect(dispatches).toEqual(['liveEvents', 'liveEvents.consumed', 'catchUp', 'read']);
      expect(liveSignal?.aborted).toBe(false);
      expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.attached' });
      expect(projection.getSnapshot().context.ledger.position).toEqual({
        cursor: 0,
        sourceGeneration: 'attachment-order',
      });
      actor.stop();
      await vi.waitFor(() => {
        expect(liveSignal?.aborted).toBe(true);
      });
    } finally {
      ready.resolve(wire);
      actor.stop();
      projection.stop();
      await client.close();
      wire.close();
      server.dispose('attachment test complete');
      channel.port1.close();
      channel.port2.close();
    }
  });

  for (const cursor of [0, 1]) {
    it(`freshly validates a retained cursor ${cursor} without full capture or a parked first read`, async () => {
      const projection = createActor(chatProjectionLogic).start();
      projection.send({
        type: 'batch',
        answer: {
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'retained',
          cursor: 0,
          nextCursor: cursor,
          endCursor: cursor,
          events: cursor === 0 ? [] : [lifecycleRow(0, 'admitted')],
        },
      });
      const original = projection.getSnapshot().context;
      const observation = Promise.withResolvers<ReadAnswer>();
      const read = vi.fn(async () => observation.promise);
      const catchUp = vi.fn(writerOwnedCatchUp);
      const subscribe = vi.fn(() => vi.fn());
      const onStatus = vi.fn();
      const actor = createActor(hostAttachment, {
        input: {
          chatId: 'chat_1',
          projection,
          onStatus,
          connect: async () => ({ read, catchUp, subscribe, close: async () => undefined }),
        },
      }).start();
      try {
        await vi.waitFor(() => {
          expect(read).toHaveBeenCalledOnce();
        });
        expect(read).toHaveBeenCalledWith({ chatId: 'chat_1', ...original.ledger.position });
        expect(onStatus).not.toHaveBeenCalledWith({ type: 'attachment.attached' });
        expect(subscribe).not.toHaveBeenCalled();
        const damaged = { historyIntact: false, newerHistory: false, quarantined: true };
        observation.resolve({
          status: 'batch',
          chatId: 'chat_1',
          sourceGeneration: 'retained',
          sourceHealth: damaged,
          cursor,
          nextCursor: cursor,
          endCursor: cursor,
          events: [],
        });
        await vi.waitFor(() => {
          expect(subscribe).toHaveBeenCalledOnce();
        });
        expect(catchUp).not.toHaveBeenCalled();
        expect(projection.getSnapshot().context.sourceHealth).toEqual(damaged);
        expect(projection.getSnapshot().context.ledger.historyIntact).toBe(false);
        expect(subscribe).toHaveBeenCalledWith(
          { chatId: 'chat_1', ...original.ledger.position, sourceHealth: damaged },
          expect.any(Function),
          expect.any(Function),
          expect.any(Function),
        );
        expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.attached' });
      } finally {
        actor.stop();
        projection.stop();
      }
    });
  }

  for (const mismatch of ['generation', 'cursor', 'chat', 'identity-mismatch', 'cursor-ahead'] as const) {
    it(`recaptures a retained empty history after a fresh ${mismatch} mismatch without early attachment`, async () => {
      const projection = createActor(chatProjectionLogic).start();
      projection.send({
        type: 'batch',
        answer: {
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'retained',
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
        },
      });
      const original = projection.getSnapshot().context;
      const read = vi.fn(
        async (): Promise<ReadAnswer> =>
          mismatch === 'identity-mismatch' || mismatch === 'cursor-ahead'
            ? { status: 'refused', chatId: 'chat_1', reason: mismatch }
            : {
                status: 'batch',
                chatId: mismatch === 'chat' ? 'other-chat' : 'chat_1',
                sourceGeneration: mismatch === 'generation' ? 'replacement' : 'retained',
                sourceHealth: healthy,
                cursor: mismatch === 'cursor' ? 1 : 0,
                nextCursor: mismatch === 'cursor' ? 1 : 0,
                endCursor: mismatch === 'cursor' ? 1 : 0,
                events: [],
              },
      );
      const release = Promise.withResolvers<void>();
      const catchUp = vi.fn(async function* (): AsyncIterable<CatchUpFrame> {
        await release.promise;
        yield {
          type: 'validated',
          position: { cursor: 0, sourceGeneration: 'replacement' },
          observedEndCursor: 0,
          health: healthy,
        };
      });
      const subscribe = vi.fn(() => vi.fn());
      const onStatus = vi.fn();
      const actor = createActor(hostAttachment, {
        input: {
          chatId: 'chat_1',
          projection,
          onStatus,
          connect: async () => ({ read, catchUp, subscribe, close: async () => undefined }),
        },
      }).start();
      try {
        await vi.waitFor(() => {
          expect(catchUp).toHaveBeenCalledOnce();
        });
        expect(read).toHaveBeenCalledOnce();
        expect(projection.getSnapshot().context).toBe(original);
        expect(onStatus).not.toHaveBeenCalledWith({ type: 'attachment.attached' });
        release.resolve();
        await vi.waitFor(() => {
          expect(subscribe).toHaveBeenCalledOnce();
        });
        expect(projection.getSnapshot().context.ledger.position.sourceGeneration).toBe('replacement');
        expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.attached' });
      } finally {
        release.resolve();
        actor.stop();
        projection.stop();
      }
    });
  }

  for (const reason of ['owner-fenced', 'unreadable'] as const) {
    it(`preserves retained probe ${reason} handling and retry ownership`, async () => {
      const projection = createActor(chatProjectionLogic).start();
      projection.send({
        type: 'batch',
        answer: {
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'retained',
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
        },
      });
      const read = vi
        .fn<AgentHostClient['read']>()
        .mockResolvedValueOnce({ status: 'refused', chatId: 'chat_1', reason })
        .mockResolvedValue({
          status: 'batch',
          chatId: 'chat_1',
          sourceGeneration: 'retained',
          sourceHealth: healthy,
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
        });
      const catchUp = vi.fn(writerOwnedCatchUp);
      const subscribe = vi.fn(() => vi.fn());
      const subscribeLive = vi.fn(() => vi.fn());
      const onStatus = vi.fn();
      const actor = createActor(hostAttachment, {
        input: {
          chatId: 'chat_1',
          projection,
          onStatus,
          connect: async () => ({ read, catchUp, subscribe, subscribeLive, close: async () => undefined }),
        },
      }).start();
      try {
        await vi.waitFor(() => {
          expect(onStatus).toHaveBeenCalledWith({
            type: reason === 'owner-fenced' ? 'attachment.lost' : 'attachment.refused',
            reason,
          });
        });
        expect(subscribe).not.toHaveBeenCalled();
        expect(catchUp).not.toHaveBeenCalled();
        actor.send({ type: 'retry-read' });
        if (reason === 'owner-fenced') {
          await vi.waitFor(() => {
            expect(subscribe).toHaveBeenCalledOnce();
          });
          expect(read).toHaveBeenCalledTimes(2);
          expect(subscribeLive).toHaveBeenCalledOnce();
          expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.attached' });
        } else {
          expect(read).toHaveBeenCalledOnce();
          expect(projection.getSnapshot().context.fault).toBe('unreadable');
          expect(onStatus).not.toHaveBeenCalledWith({ type: 'attachment.attached' });
        }
      } finally {
        actor.stop();
        projection.stop();
      }
    });
  }

  it('follows a retained suffix beyond the first page before reporting attached', async () => {
    const projection = createActor(chatProjectionLogic).start();
    projection.send({
      type: 'batch',
      answer: {
        status: 'batch',
        sourceHealth: healthy,
        sourceGeneration: 'retained',
        cursor: 0,
        nextCursor: 1,
        endCursor: 1,
        events: [lifecycleRow(0, 'admitted')],
      },
    });
    const read = vi.fn(
      async (): Promise<ReadAnswer> => ({
        status: 'batch',
        chatId: 'chat_1',
        sourceGeneration: 'retained',
        sourceHealth: healthy,
        cursor: 1,
        nextCursor: 17,
        endCursor: 18,
        events: Array.from({ length: 16 }, (_, index) => lifecycleRow(index + 1, 'running')),
      }),
    );
    const catchUp = vi.fn(writerOwnedCatchUp);
    const subscribe = vi.fn<AgentHostClient['subscribe']>(() => vi.fn());
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        onStatus,
        connect: async () => ({ read, catchUp, subscribe, close: async () => undefined }),
      },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledOnce();
      });
      expect(read).toHaveBeenCalledOnce();
      expect(catchUp).not.toHaveBeenCalled();
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(17);
      expect(onStatus).not.toHaveBeenCalledWith({ type: 'attachment.attached' });
      subscribe.mock.calls[0]?.[3]?.({
        status: 'batch',
        chatId: 'chat_1',
        sourceGeneration: 'retained',
        sourceHealth: healthy,
        cursor: 17,
        nextCursor: 18,
        endCursor: 18,
        events: [lifecycleRow(17, 'completed')],
      });
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(18);
      expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.attached' });
    } finally {
      actor.stop();
      projection.stop();
    }
  });

  for (const retirement of ['reset', 'detach'] as const) {
    it(`discards a retained probe after ${retirement}`, async () => {
      const projection = createActor(chatProjectionLogic).start();
      projection.send({
        type: 'batch',
        answer: {
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'retained',
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
        },
      });
      const observation = Promise.withResolvers<ReadAnswer>();
      const read = vi.fn(async () => observation.promise);
      const subscribe = vi.fn(() => vi.fn());
      const onStatus = vi.fn();
      const actor = createActor(hostAttachment, {
        input: {
          chatId: 'chat_1',
          projection,
          onStatus,
          connect: async () => ({ read, catchUp: writerOwnedCatchUp, subscribe, close: async () => undefined }),
        },
      }).start();
      try {
        await vi.waitFor(() => {
          expect(read).toHaveBeenCalledOnce();
        });
        if (retirement === 'reset') {
          projection.send({ type: 'reset' });
        } else {
          actor.stop();
        }
        const retired = projection.getSnapshot().context;
        observation.resolve({
          status: 'batch',
          chatId: 'chat_1',
          sourceGeneration: 'retained',
          sourceHealth: healthy,
          cursor: 0,
          nextCursor: 1,
          endCursor: 1,
          events: [lifecycleRow(0, 'admitted')],
        });
        await observation.promise;
        await new Promise<void>((resolve) => {
          queueMicrotask(resolve);
        });
        expect(projection.getSnapshot().context).toBe(retired);
        expect(subscribe).not.toHaveBeenCalled();
        expect(onStatus).not.toHaveBeenCalledWith({ type: 'attachment.attached' });
      } finally {
        actor.stop();
        projection.stop();
      }
    });
  }

  it('accepts an authoritative empty marker without provisional pages and follows its source', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const subscribe = vi.fn(() => vi.fn());
    const onStatus = vi.fn();
    const catchUp = async function* (): AsyncIterable<CatchUpFrame> {
      yield {
        type: 'validated',
        health: healthy,
        position: { cursor: 0, sourceGeneration: 'empty-source' },
        observedEndCursor: 0,
      };
    };
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_empty',
        projection,
        onStatus,
        connect: async () => ({ catchUp, read: vi.fn(), subscribe, close: async () => undefined }),
      },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledOnce();
      });
      expect(subscribe).toHaveBeenCalledWith(
        { chatId: 'chat_empty', cursor: 0, sourceGeneration: 'empty-source', sourceHealth: healthy },
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
      );
      expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.attached' });
    } finally {
      actor.stop();
      projection.stop();
    }
  });

  for (const ending of ['refused', 'partial', 'wrong-source', 'writer-after-page'] as const) {
    it(`retains prior presentation when a provisional catch-up is ${ending}`, async () => {
      const projection = createActor(chatProjectionLogic).start();
      projection.send({
        type: 'batch',
        answer: {
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'old-source',
          cursor: 0,
          nextCursor: 1,
          endCursor: 1,
          events: [lifecycleRow(0, 'admitted', 'old-run')],
        },
      });
      const original = projection.getSnapshot().context;
      const subscribe = vi.fn(() => vi.fn());
      const onStatus = vi.fn();
      const catchUp = async function* (): AsyncIterable<CatchUpFrame> {
        yield {
          type: 'page',
          answer: {
            status: 'batch',
            chatId: 'chat_1',
            sourceGeneration: 'new-source',
            cursor: 0,
            nextCursor: 1,
            endCursor: 1,
            facts: [lifecycleFact(0, 'admitted')],
          },
        };
        switch (ending) {
          case 'refused': {
            yield { type: 'refused', answer: { status: 'refused', chatId: 'chat_1', reason: 'unreadable' } };
            break;
          }
          case 'writer-after-page': {
            yield { type: 'refused', answer: { status: 'refused', chatId: 'chat_1', reason: 'writer-owned' } };
            break;
          }
          case 'wrong-source': {
            yield {
              type: 'validated',
              health: healthy,
              position: {
                cursor: 1,
                sourceGeneration: 'other-source',
                last: { leaderEpoch: 'g1', sequence: 0 },
              },
              observedEndCursor: 1,
            };
            break;
          }
          case 'partial': {
            break;
          }
        }
      };
      const actor = createActor(hostAttachment, {
        input: {
          chatId: 'chat_1',
          projection,
          onStatus,
          connect: async () => ({
            catchUp,
            read: vi.fn(
              async (): Promise<ReadAnswer> => ({ status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' }),
            ),
            subscribe,
            close: async () => undefined,
          }),
        },
      }).start();
      try {
        await vi.waitFor(() => {
          expect(onStatus).toHaveBeenCalled();
        });
        expect(projection.getSnapshot().context).toBe(original);
        expect(subscribe).not.toHaveBeenCalled();
        expect(onStatus).toHaveBeenCalledWith(
          expect.objectContaining({
            type: ending === 'refused' ? 'attachment.refused' : 'attachment.lost',
          }),
        );
      } finally {
        actor.stop();
        projection.stop();
      }
    });
  }

  for (const retirement of ['reset', 'detach'] as const) {
    it(`rejects a held catch-up marker after attachment ${retirement}`, async () => {
      const projection = createActor(chatProjectionLogic).start();
      const release = Promise.withResolvers<void>();
      const finished = Promise.withResolvers<void>();
      let signal: AbortSignal | undefined;
      const catchUp = vi.fn(async function* (input: { signal?: AbortSignal }): AsyncIterable<CatchUpFrame> {
        signal = input.signal;
        try {
          yield {
            type: 'page',
            answer: {
              status: 'batch',
              chatId: 'chat_1',
              sourceGeneration: 'held-source',
              cursor: 0,
              nextCursor: 1,
              endCursor: 1,
              facts: [lifecycleFact(0, 'admitted')],
            },
          };
          await release.promise;
          yield {
            type: 'validated',
            health: healthy,
            position: {
              cursor: 1,
              sourceGeneration: 'held-source',
              last: { leaderEpoch: 'g1', sequence: 0 },
            },
            observedEndCursor: 1,
          };
        } finally {
          finished.resolve();
        }
      });
      const subscribe = vi.fn(() => vi.fn());
      const onStatus = vi.fn();
      const actor = createActor(hostAttachment, {
        input: {
          chatId: 'chat_1',
          projection,
          onStatus,
          connect: async () => ({ catchUp, read: vi.fn(), subscribe, close: async () => undefined }),
        },
      }).start();
      try {
        await vi.waitFor(() => {
          expect(catchUp).toHaveBeenCalledOnce();
        });
        if (retirement === 'reset') {
          projection.send({ type: 'reset' });
        } else {
          actor.stop();
          expect(signal?.aborted).toBe(true);
        }
        release.resolve();
        await finished.promise;
        expect(projection.getSnapshot().context.ledger.position.cursor).toBe(0);
        expect(subscribe).not.toHaveBeenCalled();
        if (retirement === 'reset') {
          await vi.waitFor(() => {
            expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ type: 'attachment.lost' }));
          });
        } else {
          expect(onStatus).not.toHaveBeenCalled();
        }
      } finally {
        release.resolve();
        actor.stop();
        projection.stop();
      }
    });
  }

  it('bounds repeated capture replacement without arming ordinary follow', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const original = projection.getSnapshot().context;
    const catchUp = vi.fn(async function* (): AsyncIterable<CatchUpFrame> {
      yield { type: 'refused', answer: { status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' } };
    });
    const subscribe = vi.fn(() => vi.fn());
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        onStatus,
        connect: async () => ({ catchUp, read: vi.fn(), subscribe, close: async () => undefined }),
      },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ type: 'attachment.lost' }));
      });
      expect(catchUp).toHaveBeenCalledTimes(2);
      expect(subscribe).not.toHaveBeenCalled();
      expect(projection.getSnapshot().context).toBe(original);
    } finally {
      actor.stop();
      projection.stop();
    }
  });

  it('recaptures a nonwriter replacement without publishing its provisional rows', async () => {
    const projection = createActor(chatProjectionLogic).start();
    projection.send({
      type: 'batch',
      answer: {
        status: 'batch',
        sourceHealth: healthy,
        sourceGeneration: 'old-source',
        cursor: 0,
        nextCursor: 1,
        endCursor: 1,
        events: [lifecycleRow(0, 'admitted', 'old-run')],
      },
    });
    const original = projection.getSnapshot().context;
    const release = Promise.withResolvers<void>();
    let attempt = 0;
    const catchUp = vi.fn(async function* (): AsyncIterable<CatchUpFrame> {
      attempt += 1;
      if (attempt === 1) {
        yield { type: 'refused', answer: { status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' } };
        return;
      }
      yield {
        type: 'page',
        answer: {
          status: 'batch',
          chatId: 'chat_1',
          sourceGeneration: 'replacement',
          cursor: 0,
          nextCursor: 1,
          endCursor: 1,
          facts: [lifecycleFact(0, 'admitted')],
        },
      };
      await release.promise;
      yield {
        type: 'validated',
        health: healthy,
        position: { cursor: 1, sourceGeneration: 'replacement', last: { leaderEpoch: 'g1', sequence: 0 } },
        observedEndCursor: 1,
      };
    });
    const subscribe = vi.fn(() => vi.fn());
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        connect: async () => ({
          catchUp,
          read: vi.fn(
            async (): Promise<ReadAnswer> => ({ status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' }),
          ),
          subscribe,
          close: async () => undefined,
        }),
      },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(catchUp).toHaveBeenCalledTimes(2);
      });
      expect(projection.getSnapshot().context).toBe(original);
      expect(subscribe).not.toHaveBeenCalled();
      release.resolve();
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledOnce();
      });
      expect(projection.getSnapshot().context.ledger.position.sourceGeneration).toBe('replacement');
    } finally {
      release.resolve();
      actor.stop();
      projection.stop();
    }
  });

  it('retains a source-qualified first writer prefix when writer opening refuses an empty catch-up', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const release = Promise.withResolvers<void>();
    const catchUp = vi.fn(async function* (): AsyncIterable<CatchUpFrame> {
      if (catchUp.mock.calls.length > 1) {
        yield { type: 'refused', answer: { status: 'refused', chatId: 'chat_1', reason: 'writer-owned' } };
        return;
      }
      await release.promise;
      yield { type: 'refused', answer: { status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' } };
    });
    let deliverLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      parameters[3]?.({
        status: 'batch',
        sourceHealth: healthy,
        chatId: 'chat_1',
        sourceGeneration: 'writer-source',
        cursor: 0,
        nextCursor: 2,
        endCursor: 2,
        events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
      });
      return vi.fn();
    });
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        onStatus,
        connect: async () => ({
          catchUp,
          read: vi.fn(),
          subscribe,
          subscribeLive: (_chatId: string, listener: Parameters<AgentHostClient['subscribeLive']>[1]) => {
            deliverLive = listener;
            return vi.fn();
          },
          close: async () => undefined,
        }),
      },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(catchUp).toHaveBeenCalledOnce();
      });
      deliverLive?.('chat_1', {
        type: 'text-delta',
        chatId: 'chat_1',
        sourceGeneration: 'writer-source',
        runId: 'run_1',
        messageId: 'assistant-1',
        contentIndex: 0,
        delta: 'only first prefix',
      });
      expect(projection.getSnapshot().context.live).toBeUndefined();
      release.resolve();
      await vi.waitFor(() => {
        expect(chunksOf(projection.getSnapshot().context.live?.chunks)).toContainEqual(
          expect.objectContaining({ type: 'text-delta', delta: 'only first prefix' }),
        );
      });
      expect(subscribe).toHaveBeenCalledOnce();
      expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'attachment.lost' }));
    } finally {
      release.resolve();
      actor.stop();
      projection.stop();
    }
  });

  it('keeps the current projection until matching catch-up validation then follows its exact captured end', async () => {
    const projection = createActor(chatProjectionLogic).start();
    projection.send({
      type: 'batch',
      answer: {
        status: 'batch',
        sourceHealth: healthy,
        sourceGeneration: 'old-source',
        cursor: 0,
        nextCursor: 1,
        endCursor: 1,
        events: [lifecycleRow(0, 'admitted', 'old-run')],
      },
    });
    const original = projection.getSnapshot().context;
    const release = Promise.withResolvers<void>();
    const catchUp = vi.fn(async function* (): AsyncIterable<CatchUpFrame> {
      yield {
        type: 'page',
        answer: {
          status: 'batch',
          chatId: 'chat_1',
          sourceGeneration: 'new-source',
          cursor: 0,
          nextCursor: 2,
          endCursor: 2,
          facts: [lifecycleFact(0, 'admitted'), lifecycleFact(1, 'running')],
        },
      };
      await release.promise;
      yield {
        type: 'validated',
        health: healthy,
        position: {
          cursor: 2,
          sourceGeneration: 'new-source',
          last: { leaderEpoch: 'g1', sequence: 1 },
        },
        observedEndCursor: 2,
      };
    });
    let deliverLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const subscribe = vi.fn(() => vi.fn());
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        onStatus,
        connect: async () => ({
          catchUp,
          read: vi.fn(
            async (): Promise<ReadAnswer> => ({ status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' }),
          ),
          subscribe,
          subscribeLive: (_chatId: string, listener: Parameters<AgentHostClient['subscribeLive']>[1]) => {
            deliverLive = listener;
            return vi.fn();
          },
          close: async () => undefined,
        }),
      },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(catchUp).toHaveBeenCalledOnce();
      });
      expect(projection.getSnapshot().context).toBe(original);
      expect(subscribe).not.toHaveBeenCalled();
      projection.send({
        type: 'remote',
        segments: [
          {
            deviceId: 'foreign-device',
            bytes: new TextEncoder().encode(JSON.stringify(lifecycleRow(0, 'admitted', 'foreign-run')) + '\n'),
          },
        ],
      });
      const latestRemote = projection.getSnapshot().context.remote;
      deliverLive?.('chat_1', {
        type: 'text-delta',
        chatId: 'chat_1',
        sourceGeneration: 'new-source',
        runId: 'run_1',
        messageId: 'assistant-1',
        contentIndex: 0,
        delta: 'held live prefix',
      });
      expect(projection.getSnapshot().context.live).toBeUndefined();
      release.resolve();
      await vi.waitFor(() => {
        expect(projection.getSnapshot().context.ledger.position.sourceGeneration).toBe('new-source');
      });
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
      expect(projection.getSnapshot().context.remote).toBe(latestRemote);
      expect(chunksOf(projection.getSnapshot().context.live?.chunks)).toContainEqual(
        expect.objectContaining({ type: 'text-delta', delta: 'held live prefix' }),
      );
      expect(subscribe).toHaveBeenCalledWith(
        {
          chatId: 'chat_1',
          cursor: 2,
          sourceGeneration: 'new-source',
          sourceHealth: healthy,
          last: { leaderEpoch: 'g1', sequence: 1 },
        },
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
      );
    } finally {
      release.resolve();
      actor.stop();
      projection.stop();
    }
  });

  for (const refusal of ['identity-mismatch', 'owner-fenced', 'cursor-ahead'] as const) {
    it(`retains a new writer prefix across ${refusal} from the previous read source`, async () => {
      const fixture = await stagedAttachment();
      try {
        fixture.answer({
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'old-writer',
          chatId: 'chat_1',
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
        });
        fixture.live('new-writer', 'run_1', 'early prefix');
        expect(fixture.projection.getSnapshot().context.live).toBeUndefined();
        fixture.answer({ status: 'refused', chatId: 'chat_1', reason: refusal });
        if (refusal !== 'owner-fenced') {
          await fixture.waitForReader(2);
        }
        fixture.admit('new-writer');
        if (refusal === 'owner-fenced') {
          // A new generation at cursor zero first resets the previous empty health owner, then rereads.
          expect(fixture.projection.getSnapshot().context.ledger.position.cursor).toBe(0);
          await fixture.waitForReader(2);
          fixture.admit('new-writer');
        }
        expect(chunksOf(fixture.projection.getSnapshot().context.live?.chunks)).toContainEqual(
          expect.objectContaining({ type: 'text-delta', delta: 'early prefix' }),
        );
      } finally {
        fixture.stop();
      }
    });
  }

  for (const conflict of ['source', 'run'] as const) {
    it(`reports recovery instead of replacing an unknown ${conflict} prefix`, async () => {
      const fixture = await stagedAttachment();
      try {
        fixture.live('writer-1', 'run_1', 'first unknown');
        fixture.live(
          conflict === 'source' ? 'writer-2' : 'writer-1',
          conflict === 'run' ? 'run_2' : 'run_1',
          'conflicting unknown',
        );
        expect(fixture.onStatus).toHaveBeenCalledWith({
          type: 'attachment.lost',
          reason: 'early live staging identity changed',
        });
        fixture.admit('writer-1');
        expect(fixture.projection.getSnapshot().context.live).toBeUndefined();
      } finally {
        fixture.stop();
      }
    });
  }

  it('stages a new writer even when the old source already admitted the same run id', async () => {
    const fixture = await stagedAttachment();
    try {
      fixture.admit('writer-1');
      fixture.live('writer-2', 'run_1', 'new writer');
      expect(fixture.projection.getSnapshot().context.live).toBeUndefined();
      fixture.answer({ status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' });
      await fixture.waitForReader(2);
      fixture.admit('writer-2');
      expect(chunksOf(fixture.projection.getSnapshot().context.live?.chunks)).toContainEqual(
        expect.objectContaining({ delta: 'new writer' }),
      );
    } finally {
      fixture.stop();
    }
  });

  it('ignores a detached read subscriber ending after replacement live publication', async () => {
    const fixture = await stagedAttachment();
    try {
      fixture.admit('writer-1');
      fixture.actor.stop();
      fixture.projection.send({ type: 'reset' });
      fixture.projection.send({
        type: 'batch',
        answer: {
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'writer-2',
          cursor: 0,
          nextCursor: 2,
          endCursor: 2,
          events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
        },
      });
      fixture.projection.send({
        type: 'live',
        event: {
          type: 'text-delta',
          chatId: 'chat_1',
          runId: 'run_1',
          messageId: 'assistant-1',
          contentIndex: 0,
          delta: 'replacement',
        },
      });
      fixture.endRead();
      expect(chunksOf(fixture.projection.getSnapshot().context.live?.chunks)).toContainEqual(
        expect.objectContaining({ delta: 'replacement' }),
      );
    } finally {
      fixture.stop();
    }
  });

  it('drops staged output when the owning projection resets independently', async () => {
    const fixture = await stagedAttachment();
    try {
      fixture.answer({
        status: 'batch',
        sourceHealth: healthy,
        sourceGeneration: 'writer-1',
        chatId: 'chat_1',
        cursor: 0,
        nextCursor: 0,
        endCursor: 0,
        events: [],
      });
      fixture.live('writer-1', 'run_1', 'before reset');
      fixture.projection.send({ type: 'reset' });
      fixture.admit('writer-1');
      expect(fixture.projection.getSnapshot().context.live).toBeUndefined();
    } finally {
      fixture.stop();
    }
  });

  it('does not clear replacement live output from a retired terminal microtask', async () => {
    const fixture = await stagedAttachment();
    try {
      fixture.admit('writer-1');
      fixture.live('writer-1', 'run_1', 'first');
      fixture.answer({
        status: 'batch',
        sourceHealth: healthy,
        sourceGeneration: 'writer-1',
        chatId: 'chat_1',
        cursor: 2,
        nextCursor: 3,
        endCursor: 3,
        events: [lifecycleRow(2, 'completed')],
      });
      fixture.answer({ status: 'refused', chatId: 'chat_1', reason: 'identity-mismatch' });
      await fixture.waitForReader(2);
      fixture.admit('writer-2');
      fixture.live('writer-2', 'run_1', 'replacement');
      await Promise.resolve();
      expect(chunksOf(fixture.projection.getSnapshot().context.live?.chunks)).toContainEqual(
        expect.objectContaining({ delta: 'replacement' }),
      );
    } finally {
      fixture.stop();
    }
  });

  for (const boundary of [
    'replacement',
    'different-run',
    'terminal',
    'unreadable',
    'detach',
    'live-ended',
    'overflow',
  ] as const) {
    it(`never publishes a staged prefix after ${boundary}`, async () => {
      const fixture = await stagedAttachment();
      try {
        fixture.live('writer-1', 'run_1', 'unpublished');
        expect(fixture.projection.getSnapshot().context.live).toBeUndefined();
        switch (boundary) {
          case 'unreadable': {
            fixture.answer({ status: 'refused', chatId: 'chat_1', reason: 'unreadable' });
            break;
          }
          case 'detach': {
            fixture.actor.stop();
            break;
          }
          case 'live-ended': {
            fixture.endLive();
            break;
          }
          case 'overflow': {
            fixture.live('writer-1', 'run_1', 'é'.repeat(32_768));
            expect(fixture.onStatus).toHaveBeenCalledWith(
              expect.objectContaining({
                type: 'attachment.lost',
                reason: 'early live staging exceeded 65536 bytes',
              }),
            );
            break;
          }
          default: {
            break;
          }
        }
        fixture.admit(
          boundary === 'replacement' ? 'writer-2' : 'writer-1',
          boundary === 'different-run' ? 'run_2' : 'run_1',
          boundary === 'terminal',
        );
        expect(fixture.projection.getSnapshot().context.live).toBeUndefined();
        if (
          boundary === 'detach' ||
          boundary === 'unreadable' ||
          boundary === 'live-ended' ||
          boundary === 'overflow'
        ) {
          fixture.live('writer-1', 'run_1', 'late callback');
          expect(fixture.projection.getSnapshot().context.live).toBeUndefined();
        }
      } finally {
        fixture.stop();
      }
    });
  }

  it('retains live output arriving before its durable admission until that admission is read', async () => {
    const projection = createActor(chatProjectionLogic).start();
    let onAnswer: Parameters<AgentHostClient['subscribe']>[3];
    let onLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        connect: async () => ({
          catchUp: writerOwnedCatchUp,
          read: vi.fn(),
          subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
            onAnswer = parameters[3];
            return vi.fn();
          },
          subscribeLive: (_chatId: string, listener: Parameters<AgentHostClient['subscribeLive']>[1]) => {
            onLive = listener;
            return vi.fn();
          },
          close: async () => undefined,
        }),
      },
    }).start();
    try {
      await vi.waitFor(() => {
        expect(onLive).toBeDefined();
      });
      onLive?.('chat_1', {
        type: 'thinking-delta',
        sourceGeneration: 'writer-1',
        chatId: 'chat_1',
        runId: 'run_1',
        messageId: 'assistant-1',
        contentIndex: 0,
        delta: 'Projection reasoning alpha.',
      });
      expect(projection.getSnapshot().context.live).toBeUndefined();
      onAnswer?.({
        status: 'batch',
        sourceHealth: healthy,
        sourceGeneration: 'writer-1',
        chatId: 'chat_1',
        cursor: 0,
        nextCursor: 2,
        endCursor: 2,
        events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
      });
      expect(chunksOf(projection.getSnapshot().context.live?.chunks)).toContainEqual(
        expect.objectContaining({ type: 'reasoning-delta', delta: 'Projection reasoning alpha.' }),
      );
    } finally {
      actor.stop();
      projection.stop();
    }
  });

  it('feeds live preview through the owned read-only connection and fences it after detach', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const stopLive = vi.fn();
    let onLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const subscribeLive = vi.fn((_chatId: string, listener: Parameters<AgentHostClient['subscribeLive']>[1]) => {
      onLive = listener;
      return stopLive;
    });
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      queueMicrotask(() =>
        parameters[3]?.({
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'writer-1',
          chatId: 'chat_1',
          cursor: 0,
          nextCursor: 2,
          endCursor: 2,
          events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
        }),
      );
      return vi.fn();
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({
          catchUp: writerOwnedCatchUp,
          read: vi.fn(),
          subscribe,
          subscribeLive,
          close: async () => undefined,
        }),
        projection,
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
    });
    const delta = {
      type: 'text-delta',
      sourceGeneration: 'writer-1',
      chatId: 'chat_1',
      runId: 'run_1',
      messageId: 'assistant-1',
      contentIndex: 0,
      delta: 'Partial',
    } as const;
    onLive?.('chat_1', delta);
    expect(chunksOf(projection.getSnapshot().context.live?.chunks)).toContainEqual(
      expect.objectContaining({
        type: 'text-delta',
        delta: 'Partial',
      }),
    );
    actor.stop();
    expect(stopLive).toHaveBeenCalledOnce();
    onLive?.('chat_1', { ...delta, delta: ' after stop' });
    expect(projection.getSnapshot().context.live).toBeUndefined();
    projection.stop();
  });

  it('retires live preview after terminal delivery while preserving the durable transcript', async () => {
    const projection = createActor(chatProjectionLogic).start();
    let onAnswer: Parameters<AgentHostClient['subscribe']>[3];
    let onLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      onAnswer = parameters[3];
      queueMicrotask(() =>
        onAnswer?.({
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'writer-1',
          chatId: 'chat_1',
          cursor: 0,
          nextCursor: 2,
          endCursor: 2,
          events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
        }),
      );
      return vi.fn();
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        connect: async () => ({
          catchUp: writerOwnedCatchUp,
          read: vi.fn(),
          subscribe,
          subscribeLive: (_chatId: string, listener: Parameters<AgentHostClient['subscribeLive']>[1]) => {
            onLive = listener;
            return vi.fn();
          },
          close: async () => undefined,
        }),
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
    });
    onLive?.('chat_1', {
      type: 'text-delta',
      sourceGeneration: 'writer-1',
      chatId: 'chat_1',
      runId: 'run_1',
      messageId: 'assistant-1',
      contentIndex: 0,
      delta: 'Partial',
    });
    expect(projection.getSnapshot().context.live).toBeDefined();
    onAnswer?.({
      status: 'batch',
      sourceHealth: healthy,
      sourceGeneration: 'writer-1',
      chatId: 'chat_1',
      cursor: 2,
      nextCursor: 4,
      endCursor: 4,
      events: [
        {
          version: 1,
          leaderEpoch: 'g1',
          sequence: 2,
          recordedAt: '2026-09-28T00:00:00.000Z',
          runId: 'run_1',
          type: 'message.appended',
          message: {
            id: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text', text: 'Partial' }],
          },
        },
        lifecycleRow(3, 'completed'),
      ],
    });
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.live).toBeUndefined();
    });
    expect(chunksOf(projection.getSnapshot().context.views['run_1']?.chunks)).toContainEqual(
      expect.objectContaining({
        type: 'text-delta',
        delta: 'Partial',
      }),
    );
    actor.stop();
    projection.stop();
  });

  it('drops an overlay when live delivery fails even while durable reads remain open', async () => {
    const projection = createActor(chatProjectionLogic).start();
    let onLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    let onLiveEnded: (() => void) | undefined;
    const stopRead = vi.fn();
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        onStatus,
        connect: async () => ({
          catchUp: writerOwnedCatchUp,
          read: vi.fn(),
          subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
            queueMicrotask(() =>
              parameters[3]?.({
                status: 'batch',
                sourceHealth: healthy,
                sourceGeneration: 'writer-1',
                chatId: 'chat_1',
                cursor: 0,
                nextCursor: 2,
                endCursor: 2,
                events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
              }),
            );
            return stopRead;
          },
          subscribeLive: (
            _chatId: string,
            listener: Parameters<AgentHostClient['subscribeLive']>[1],
            ended?: () => void,
          ) => {
            onLive = listener;
            onLiveEnded = ended;
            return vi.fn();
          },
          close: async () => undefined,
        }),
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
    });
    onLive?.('chat_1', {
      type: 'text-delta',
      sourceGeneration: 'writer-1',
      chatId: 'chat_1',
      runId: 'run_1',
      messageId: 'assistant-1',
      contentIndex: 0,
      delta: 'Partial',
    });
    onLiveEnded?.();
    expect(projection.getSnapshot().context.live).toBeUndefined();
    expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.lost', reason: 'live subscriber ended' });
    expect(stopRead).not.toHaveBeenCalled();
    actor.stop();
    projection.stop();
  });
  it('reports an unreadable log once without reporting a lost follower', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const onStatus = vi.fn();
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      queueMicrotask(() => {
        parameters[3]?.({ status: 'refused', chatId: 'chat_1', reason: 'unreadable' });
        parameters[2]?.();
      });
      return vi.fn();
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({ catchUp: writerOwnedCatchUp, read: vi.fn(), subscribe, close: async () => undefined }),
        projection,
        onStatus,
      },
    }).start();

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.refused', reason: 'unreadable' });
    });
    expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'attachment.lost' }));
    actor.stop();
    projection.stop();
  });
  it('attaches an idle chat without parking on an empty long-poll read', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const read = vi.fn(
      async (): Promise<ReadAnswer> =>
        new Promise<ReadAnswer>(() => {
          /* An empty long poll must never be opened by the attachment. */
        }),
    );
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      queueMicrotask(() =>
        parameters[3]?.({
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'writer-1',
          chatId: 'chat_idle',
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
        }),
      );
      return vi.fn();
    });
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_idle',
        connect: async () => ({ catchUp: writerOwnedCatchUp, read, subscribe, close: async () => undefined }),
        projection,
        onStatus,
      },
    }).start();

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.attached' });
    });
    expect(subscribe).toHaveBeenCalledWith(
      { chatId: 'chat_idle', cursor: 0 },
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    expect(read).not.toHaveBeenCalled();
    actor.stop();
    projection.stop();
  });
  it('does not call a connected socket caught up before its first answer', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const onStatus = vi.fn();
    const subscribe = vi.fn(() => vi.fn());
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_idle',
        connect: async () => ({ catchUp: writerOwnedCatchUp, read: vi.fn(), subscribe, close: async () => undefined }),
        projection,
        onStatus,
      },
    }).start();
    await vi.waitFor(() => {
      expect(subscribe).toHaveBeenCalledOnce();
    });
    expect(onStatus).not.toHaveBeenCalledWith({ type: 'attachment.attached' });
    actor.stop();
    projection.stop();
  });
  it('folds a host read into the projection and detaches without cancelling', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const unsubscribe = vi.fn();
    const close = vi.fn(async () => undefined);
    const read = vi.fn(
      async (): Promise<ReadAnswer> => ({
        status: 'batch',
        sourceHealth: healthy,
        sourceGeneration: 'writer-1',
        chatId: 'chat_1',
        cursor: 0,
        nextCursor: 2,
        endCursor: 2,
        events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
      }),
    );
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      const onAnswer = parameters[3];
      queueMicrotask(() => {
        onAnswer?.({
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'writer-1',
          chatId: 'chat_1',
          cursor: 0,
          nextCursor: 2,
          endCursor: 2,
          events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
        });
      });
      return unsubscribe;
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({ catchUp: writerOwnedCatchUp, read, subscribe, close }),
        projection,
      },
    }).start();

    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
    });
    expect(read).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith(
      { chatId: 'chat_1', cursor: 0 },
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    actor.stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    projection.stop();
  });

  it('rereads from zero after a cursor-ahead refusal', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const read = vi.fn(
      async (): Promise<ReadAnswer> =>
        new Promise<ReadAnswer>(() => {
          /* A refused follow restarts without a second long poll. */
        }),
    );
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      const onAnswer = parameters[3];
      queueMicrotask(() => {
        if (subscribe.mock.calls.length === 1) {
          onAnswer?.({ status: 'refused', chatId: 'chat_1', reason: 'cursor-ahead' });
          return;
        }
        onAnswer?.({
          status: 'batch',
          sourceHealth: healthy,
          sourceGeneration: 'writer-1',
          chatId: 'chat_1',
          cursor: 0,
          nextCursor: 1,
          endCursor: 1,
          events: [lifecycleRow(0, 'admitted')],
        });
      });
      return vi.fn();
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({ catchUp: writerOwnedCatchUp, read, subscribe, close: vi.fn(async () => undefined) }),
        projection,
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(1);
    });
    expect(read).not.toHaveBeenCalled();
    actor.stop();
    projection.stop();
  });

  it('opens a new owned connection at the folded cursor after the previous follow ends', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const ended: Array<() => void> = [];
    const close = vi.fn(async () => undefined);
    const read = vi.fn(
      async ({ cursor }: { cursor: number }): Promise<ReadAnswer> => ({
        status: 'batch',
        sourceHealth: healthy,
        sourceGeneration: 'writer-1',
        chatId: 'chat_1',
        cursor,
        nextCursor: cursor === 0 ? 1 : cursor,
        endCursor: 1,
        events: cursor === 0 ? [lifecycleRow(0, 'admitted')] : [],
      }),
    );
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      const onEnded = parameters[2];
      const onAnswer = parameters[3];
      if (onEnded) {
        ended.push(onEnded);
      }
      if (ended.length === 1) {
        queueMicrotask(() => {
          onAnswer?.({
            status: 'batch',
            sourceHealth: healthy,
            sourceGeneration: 'writer-1',
            chatId: 'chat_1',
            cursor: 0,
            nextCursor: 1,
            endCursor: 1,
            events: [lifecycleRow(0, 'admitted')],
          });
        });
      }
      return vi.fn();
    });
    const connect = vi.fn(async () => ({
      catchUp: writerOwnedCatchUp,
      read,
      subscribe,
      close,
    }));
    const first = createActor(hostAttachment, { input: { chatId: 'chat_1', connect, projection } }).start();
    await vi.waitFor(() => {
      expect(ended).toHaveLength(1);
    });
    ended[0]!();
    first.stop();
    const second = createActor(hostAttachment, { input: { chatId: 'chat_1', connect, projection } }).start();
    await vi.waitFor(() => {
      expect(ended).toHaveLength(2);
    });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenNthCalledWith(
      2,
      {
        chatId: 'chat_1',
        sourceGeneration: 'writer-1',
        sourceHealth: healthy,
        cursor: 1,
        last: { leaderEpoch: 'g1', sequence: 0 },
      },
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    expect(read).toHaveBeenCalledExactlyOnceWith({
      chatId: 'chat_1',
      sourceGeneration: 'writer-1',
      cursor: 1,
      last: { leaderEpoch: 'g1', sequence: 0 },
    });
    second.stop();
    expect(close).toHaveBeenCalledTimes(2);
    projection.stop();
  });

  it('ignores a retired attachment’s late success and loss after its replacement observed a newer failure', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const oldStatus = vi.fn();
    let oldAnswer: Parameters<AgentHostClient['subscribe']>[3];
    let oldEnded: Parameters<AgentHostClient['subscribe']>[2];
    const old = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({
          catchUp: writerOwnedCatchUp,
          read: vi.fn(),
          subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
            oldEnded = parameters[2];
            oldAnswer = parameters[3];
            return vi.fn();
          },
          close: async () => undefined,
        }),
        projection,
        onStatus: oldStatus,
      },
    }).start();
    await vi.waitFor(() => {
      expect(oldAnswer).toBeDefined();
    });
    old.stop();
    const replacement = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({
          catchUp: writerOwnedCatchUp,
          read: vi.fn(),
          subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
            queueMicrotask(() => {
              parameters[3]?.({
                status: 'batch',
                sourceHealth: healthy,
                sourceGeneration: 'writer-1',
                chatId: 'chat_1',
                cursor: 0,
                nextCursor: 1,
                endCursor: 1,
                events: [{ ...lifecycleRow(0, 'failed'), detail: { message: 'Current failure' } }],
              });
            });
            return vi.fn();
          },
          close: async () => undefined,
        }),
        projection,
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(1);
    });
    oldAnswer?.({
      status: 'batch',
      sourceHealth: healthy,
      sourceGeneration: 'writer-1',
      chatId: 'chat_1',
      cursor: 1,
      nextCursor: 2,
      endCursor: 2,
      events: [lifecycleRow(1, 'completed')],
    });
    oldEnded?.();
    expect(projection.getSnapshot().context.ledger.position.cursor).toBe(1);
    expect(projection.getSnapshot().context.failure?.text).toBe('Current failure');
    expect(oldStatus).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'attachment.lost' }));
    replacement.stop();
    projection.stop();
  });
});

/** Drive the actual attachment and projection while retaining transport callbacks across disposal. */
const stagedAttachment = async () => {
  const projection = createActor(chatProjectionLogic).start();
  let readers = 0;
  let onAnswer: Parameters<AgentHostClient['subscribe']>[3];
  let onLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
  let onLiveEnded: (() => void) | undefined;
  let onReadEnded: (() => void) | undefined;
  const onStatus = vi.fn();
  const actor = createActor(hostAttachment, {
    input: {
      chatId: 'chat_1',
      projection,
      onStatus,
      connect: async () => ({
        catchUp: writerOwnedCatchUp,
        read: vi.fn(),
        close: vi.fn(async () => undefined),
        subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
          readers += 1;
          onAnswer = parameters[3];
          onReadEnded = parameters[2];
          return vi.fn();
        },
        subscribeLive: (
          _chatId: string,
          listener: Parameters<AgentHostClient['subscribeLive']>[1],
          ended?: () => void,
        ) => {
          onLive = listener;
          onLiveEnded = ended;
          return vi.fn();
        },
      }),
    },
  }).start();
  await vi.waitFor(() => {
    expect(onLive).toBeDefined();
  });
  const answer = (value: ReadAnswer): void => {
    onAnswer?.(value);
  };
  return {
    actor,
    projection,
    onStatus,
    answer,
    waitForReader: async (count: number): Promise<void> => {
      await vi.waitFor(() => {
        expect(readers).toBe(count);
      });
    },
    live: (sourceGeneration: string, runId: string, delta: string): void => {
      onLive?.('chat_1', {
        sourceGeneration,
        runId,
        delta,
        type: 'text-delta',
        chatId: 'chat_1',
        messageId: 'assistant-1',
        contentIndex: 0,
      });
    },
    admit: (sourceGeneration: string, runId = 'run_1', terminal = false): void => {
      answer({
        status: 'batch',
        sourceHealth: healthy,
        chatId: 'chat_1',
        sourceGeneration,
        cursor: 0,
        nextCursor: terminal ? 3 : 2,
        endCursor: terminal ? 3 : 2,
        events: [
          lifecycleRow(0, 'admitted', runId),
          lifecycleRow(1, 'running', runId),
          ...(terminal ? [lifecycleRow(2, 'completed', runId)] : []),
        ],
      });
    },
    endRead: (): void => {
      onReadEnded?.();
    },
    endLive: (): void => {
      onLiveEnded?.();
    },
    stop: (): void => {
      actor.stop();
      projection.stop();
    },
  };
};
