/**
 * One client, three endpoints.
 *
 * The daemon answers the same keyed commands over a WebSocket (`tau serve`), a
 * WHATWG message port (a browser worker or a `node:worker_threads` channel) and
 * an emitter-shaped port (Electron's `MessagePortMain`, or the same
 * `worker_threads` port driven through `on/off/start/close`). If the three ever
 * answer differently, the client projection starts having to know which host it
 * is talking to — which is the thing this package exists to prevent.
 */

import { MessageChannel } from 'node:worker_threads';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChannelClosedError, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import type { ChannelServer, CloseInfo, MessagePortLike, Port } from '@taucad/rpc';

import type { AgentWireCompatProtocol } from '#channel/wire-v1.js';
import { createAgentChannelClient } from '#channel/agent-channel-client.js';
import { serveAgentChannel } from '#launchers/agent-channel.js';
import type { AgentLiveEvent } from '#waist/ports.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';

type RecordingLauncher = AgentLauncher & {
  readonly seen: HostCommand[];
  /** Set to hold `execute` open so a socket can die mid-call. */
  hold?: Promise<void> | undefined;
};

const answerFor = (command: HostCommand): CommandAnswer => ({
  commandId: command.commandId,
  generation: 0,
  status: 'applied',
  effect: 'not-applied',
  details: { state: 'none' },
});

const recordingLauncher = (): RecordingLauncher => {
  const seen: HostCommand[] = [];
  const launcher = {
    seen,
    hold: undefined as Promise<void> | undefined,
    execute: async (command: HostCommand): Promise<CommandAnswer> => {
      seen.push(command);
      await launcher.hold;
      return answerFor(command);
    },
    liveEvents: () => ({
      // oxlint-disable-next-line no-empty-function -- an idle stream is the point.
      async *[Symbol.asyncIterator]() {},
    }),
    pendingInterrupts: async () => [],
    close: async () => undefined,
  };
  return launcher as unknown as RecordingLauncher;
};

const build = 'test-build';
const disposers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered.
    await dispose();
  }
});

/** A `worker_threads` port with its emitter API hidden, so only the WHATWG branch can match. */
const whatwgOnly = (port: MessagePortLike): MessagePortLike => ({
  postMessage: (data: unknown, transfer?: unknown) => {
    port.postMessage(data, transfer);
  },
  addEventListener: (type: 'close' | 'message', listener: unknown, options?: unknown) => {
    port.addEventListener(type, listener, options);
  },
  removeEventListener: (type: 'close' | 'message', listener: unknown, options?: unknown) => {
    port.removeEventListener(type, listener, options);
  },
  start: () => port.start?.(),
  close: () => {
    port.close();
  },
});

/** A connection that opens far enough to own an RPC wire, then loses its peer before hello. */
const deadPort = (): Port<unknown> => ({
  postMessage: () => undefined,
  onMessage: () => () => undefined,
  onClose: (handler) => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        handler();
      }
    });
    return () => {
      active = false;
    };
  },
  close: () => undefined,
});

type ServedSocket = { readonly origin: string; kill: () => void };

/** `tau serve`'s own accept path: one WebSocket per client on `/agent`. */
const serveOverWebSocket = async (launcher: AgentLauncher): Promise<ServedSocket> => {
  const httpServer: HttpServer = createServer();
  const sockets = new WebSocketServer({ noServer: true });
  let accepted: WebSocket | undefined;
  httpServer.on('upgrade', (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (next) => {
      accepted = next;
      serveAgentChannel(next, launcher, { build });
    });
  });
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a TCP address.');
  }
  disposers.push(
    async () =>
      new Promise<void>((resolve) => {
        sockets.close();
        httpServer.close(() => {
          resolve();
        });
      }),
  );
  return {
    origin: `ws://127.0.0.1:${String(address.port)}`,
    kill: () => {
      accepted?.terminate();
    },
  };
};

const cancel: HostCommand = { type: 'cancel', commandId: 'cmd-1', payload: { chatId: 'chat-1', runId: 'run-1' } };

describe('createAgentChannelClient', () => {
  it('answers one command identically over a socket, a WHATWG port and an emitter port', async () => {
    const launcher = recordingLauncher();

    const served = await serveOverWebSocket(launcher);
    const socketClient = createAgentChannelClient({ connect: () => new WebSocket(`${served.origin}/agent`) });
    disposers.push(() => {
      socketClient.close();
    });
    const overSocket = await socketClient.execute(cancel);

    const whatwg = new MessageChannel();
    serveAgentChannel(whatwg.port1 as unknown as MessagePortLike, launcher, { build });
    const whatwgClient = createAgentChannelClient({
      connect: () => whatwgOnly(whatwg.port2 as unknown as MessagePortLike),
    });
    disposers.push(() => {
      whatwgClient.close();
      whatwg.port1.close();
    });
    const overWhatwg = await whatwgClient.execute(cancel);

    const emitter = new MessageChannel();
    serveAgentChannel(emitter.port1 as unknown as MessagePortLike, launcher, { build });
    // Driven through `on/off/start/close` — the Electron `MessagePortMain` shape.
    const emitterClient = createAgentChannelClient({ connect: () => emitter.port2 });
    disposers.push(() => {
      emitterClient.close();
      emitter.port1.close();
    });
    const overEmitter = await emitterClient.execute(cancel);

    expect(overSocket).toEqual(answerFor(cancel));
    expect(overWhatwg).toEqual(overSocket);
    expect(overEmitter).toEqual(overSocket);
    expect(launcher.seen).toEqual([cancel, cancel, cancel]);
  });

  it('should re-send an in-flight command with its key after the socket dies, and report the close code', async () => {
    const launcher = recordingLauncher();
    const held = Promise.withResolvers<void>();
    launcher.hold = held.promise;
    const served = await serveOverWebSocket(launcher);
    const client = createAgentChannelClient({ connect: () => new WebSocket(`${served.origin}/agent`) });
    disposers.push(() => {
      client.close();
      held.resolve();
    });

    const closes: CloseInfo[] = [];
    client.onClose((info) => {
      closes.push(info);
    });

    const inFlight = client.execute(cancel);
    // Let the command reach the launcher before the wire dies under it.
    await expect.poll(() => launcher.seen.length).toBe(1);
    served.kill();
    await expect.poll(() => closes.length).toBe(1);
    held.resolve();

    await expect(inFlight).resolves.toEqual(answerFor(cancel));
    expect(launcher.seen).toEqual([cancel, cancel]);
    expect(closes).toMatchObject([{ origin: 'remote', code: 'PEER_GONE' }]);
  });

  it('should reject unanswered commands with the close error once the redial budget is spent', async () => {
    vi.useFakeTimers();
    try {
      let dials = 0;
      const client = createAgentChannelClient({
        connect: () => {
          dials += 1;
          return deadPort();
        },
      });
      disposers.push(() => {
        client.close();
      });

      const failed = client.execute(cancel);
      const failure = (async (): Promise<unknown> => {
        try {
          await failed;
          return undefined;
        } catch (error) {
          return error;
        }
      })();
      await vi.advanceTimersByTimeAsync(0);
      expect(dials).toBe(2);
      await vi.advanceTimersByTimeAsync(250);
      expect(dials).toBe(3);
      await vi.advanceTimersByTimeAsync(500);
      expect(dials).toBe(4);
      await vi.advanceTimersByTimeAsync(1000);
      expect(dials).toBe(5);
      await vi.advanceTimersByTimeAsync(1999);
      expect(dials).toBe(5);
      await vi.advanceTimersByTimeAsync(1);
      expect(dials).toBe(6);
      expect(await failure).toBeInstanceOf(ChannelClosedError);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([true, false])('decodes actual wire 3 live events only with writer generation: %s', async (tagged) => {
    const channel = new MessageChannel();
    const events = [
      {
        type: 'thinking-start',
        chatId: 'chat-current',
        runId: 'run-current',
        messageId: 'assistant-current',
        contentIndex: 0,
      },
      {
        type: 'thinking-delta',
        chatId: 'chat-current',
        runId: 'run-current',
        messageId: 'assistant-current',
        contentIndex: 0,
        delta: 'held reasoning',
      },
    ].map((event) => (tagged ? { ...event, sourceGeneration: 'writer-current' } : event));
    createChannelServer({
      port: wrapMessagePort<unknown>(channel.port1 as unknown as MessagePortLike),
      sessionKey: 'tau-agent',
      hello: { wire: 3, build },
      impl: {
        call: async () => {
          throw new Error('This regression only subscribes.');
        },
        listen: () =>
          new ReadableStream<unknown>({
            start(controller) {
              for (const event of events) {
                controller.enqueue(event);
              }
              controller.close();
            },
          }),
      },
    });
    const client = createAgentChannelClient({ connect: () => channel.port2 as unknown as MessagePortLike });
    disposers.push(() => {
      client.close();
      channel.port1.close();
    });
    const received = async () => {
      const values = [];
      for await (const event of client.liveEvents({ chatId: 'chat-current' })) {
        values.push(event);
      }
      return values;
    };
    await (tagged ? expect(received()).resolves.toEqual(events) : expect(received()).rejects.toThrow());
  });

  it.each([true, false])('strictly decodes actual wire 3 catch-up pages and validation: %s', async (tagged) => {
    const channel = new MessageChannel();
    const frames = [
      {
        type: 'page',
        answer: {
          status: 'batch',
          chatId: 'chat-catch-up',
          cursor: 0,
          nextCursor: 1,
          endCursor: 1,
          facts: [
            {
              classification: 'opaque',
              row: { version: 1, leaderEpoch: 'wire', sequence: 0, recordedAt: '2026-10-09T00:00:00.000Z', runId: 'r' },
              eventType: 'future.row',
              affectsHistory: false,
            },
          ],
          ...(tagged ? { sourceGeneration: 'source-catch-up' } : {}),
        },
      },
      {
        type: 'validated',
        position: { cursor: 1, sourceGeneration: 'source-catch-up' },
        observedEndCursor: 1,
        health: { historyIntact: true, newerHistory: false, quarantined: false },
      },
    ];
    createChannelServer({
      port: wrapMessagePort<unknown>(channel.port1 as unknown as MessagePortLike),
      sessionKey: 'tau-agent',
      hello: { wire: 3, build },
      impl: {
        call: async () => {
          throw new Error('Catch-up only subscribes.');
        },
        listen: () =>
          new ReadableStream<unknown>({
            start(controller) {
              for (const frame of frames) {
                controller.enqueue(frame);
              }
              controller.close();
            },
          }),
      },
    });
    const client = createAgentChannelClient({ connect: () => channel.port2 });
    disposers.push(() => {
      client.close();
      channel.port1.close();
    });
    const received = async () => {
      const values = [];
      for await (const frame of client.catchUp({ chatId: 'chat-catch-up', limit: 1, maxBytes: 1024 })) {
        values.push(frame);
      }
      return values;
    };
    await (tagged ? expect(received()).resolves.toEqual(frames) : expect(received()).rejects.toThrow());
  });

  it('refuses legacy v1 authoritative reads and streams instead of inventing source facts', async () => {
    const channel = new MessageChannel();
    let subscriptions = 0;
    createChannelServer<{
      calls: Record<string, never>;
      notifies: Record<string, never>;
      listens: {
        liveEvents: {
          args: AgentWireCompatProtocol['listens']['liveEvents']['args'];
          event: { chatId: string; event: AgentLiveEvent };
        };
      };
    }>({
      port: wrapMessagePort<unknown>(channel.port1 as unknown as MessagePortLike),
      sessionKey: 'tau-agent',
      impl: {
        call: async () => {
          throw new Error('No legacy command is needed for a live subscription.');
        },
        listen: () => {
          subscriptions += 1;
          return new ReadableStream<{ chatId: string; event: AgentLiveEvent }>({
            start(controller) {
              controller.enqueue({
                chatId: 'chat-legacy',
                event: {
                  type: 'text-delta',
                  chatId: 'chat-legacy',
                  runId: 'run-legacy',
                  messageId: 'assistant-legacy',
                  contentIndex: 0,
                  delta: 'untagged legacy content',
                },
              });
              controller.close();
            },
          });
        },
      },
    });
    const client = createAgentChannelClient({ connect: () => channel.port2 as unknown as MessagePortLike });
    disposers.push(() => {
      client.close();
      channel.port1.close();
    });
    const live = client.liveEvents({ chatId: 'chat-legacy' })[Symbol.asyncIterator]();
    await expect(live.next()).rejects.toMatchObject({ code: 'WIRE_VERSION_UNSUPPORTED' });
    await expect(
      client.catchUp({ chatId: 'chat-legacy', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]().next(),
    ).rejects.toMatchObject({ code: 'WIRE_VERSION_UNSUPPORTED' });
    const legacyRead = client.read({ chatId: 'chat-legacy', cursor: 0, limit: 1, maxBytes: 1024 });
    await expect(legacyRead).rejects.toMatchObject({ code: 'WIRE_VERSION_UNSUPPORTED' });
    await expect(legacyRead).rejects.toThrow('Update the agent host');
    expect(subscriptions).toBe(0);
  });

  it.each([2, 99])('should refuse an owner that speaks wire %i, without redialling', async (wire) => {
    const channel = new MessageChannel();
    let dials = 0;
    // An owner from after the compatibility window: its hello names a wire this client does not speak (I32).
    const newer: ChannelServer = {
      call: async () => {
        throw new Error('An owner of another version is never asked anything.');
      },
      listen: async () => {
        throw new Error('An owner of another version is never subscribed to.');
      },
    };
    createChannelServer({
      port: wrapMessagePort<unknown>(channel.port1 as unknown as MessagePortLike),
      sessionKey: 'tau-agent',
      hello: { wire, build: 'unsupported' },
      impl: newer,
    });
    const client = createAgentChannelClient({
      connect: () => {
        dials += 1;
        return channel.port2 as unknown as MessagePortLike;
      },
    });
    disposers.push(() => {
      client.close();
      channel.port1.close();
    });

    await expect(client.execute(cancel)).rejects.toMatchObject({ code: 'WIRE_VERSION_UNSUPPORTED' });
    expect(dials).toBe(1);
  });
});
