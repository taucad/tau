/**
 * One binding, two transports.
 *
 * `tau serve` serves the channel over a WebSocket; the Electron services
 * utility serves the *same launcher* over a `MessagePortMain`. This proves the
 * two are the same code path answering the same vocabulary — if they ever fork,
 * a client projection starts having to know which host it is talking to.
 */

import { MessageChannel } from 'node:worker_threads';
import type { Transferable } from 'node:worker_threads';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';

import { createChannelClient, wrapMessagePort, wrapWebSocket } from '@taucad/rpc';
import type { Channel, MessagePortLike, MessagePortMainLike, WireProtocolSchemas } from '@taucad/rpc';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';

import { parseLeadershipFrame } from '#launchers/leadership/frames.js';
import { serveAgentChannel } from '#launchers/agent-channel.js';
import type { AgentChannelEndpoint } from '#channel/endpoint.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import { agentLiveEventSchema, agentWireProtocolSchemas } from '#wire/frames.schema.js';
import type { AgentWireProtocol } from '#wire/frames.schema.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';

const answerFor = (command: HostCommand): CommandAnswer => ({
  commandId: command.commandId,
  generation: 0,
  status: 'applied',
  effect: 'not-applied',
  details: { state: 'none' },
});

/** Records what the transport delivered, so both legs can be compared. */
const recordingLauncher = (): AgentLauncher & { readonly seen: HostCommand[] } => {
  const seen: HostCommand[] = [];
  return {
    seen,
    execute: async (command: HostCommand) => {
      seen.push(command);
      return answerFor(command);
    },
    read: async ({ chatId }: { readonly chatId: string }) => ({
      status: 'batch',
      chatId,
      cursor: 0,
      nextCursor: 0,
      endCursor: 0,
      events: [],
    }),
    liveEvents: () => ({
      // oxlint-disable-next-line no-empty-function -- an idle stream is the point.
      async *[Symbol.asyncIterator]() {},
    }),
    pendingInterrupts: async () => [],
    close: async () => undefined,
  } as unknown as AgentLauncher & { readonly seen: HostCommand[] };
};

const build = 'test-build';
const disposers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered.
    await dispose();
  }
});

const client = (port: Parameters<typeof createChannelClient>[0]['port']): Channel<AgentWireProtocol> =>
  createChannelClient<AgentWireProtocol>({
    port,
    sessionKey: 'tau-agent',
    protocolSchemas: agentWireProtocolSchemas as WireProtocolSchemas<AgentWireProtocol>,
  });

const cancel = { commandId: 'cmd-1', payload: { chatId: 'chat-1', runId: 'run-1' } } as const;

describe('serveAgentChannel', () => {
  it('should type the wire validators against the protocol', () => {
    expectTypeOf(agentWireProtocolSchemas).toExtend<WireProtocolSchemas<AgentWireProtocol>>();
  });

  it('preserves live writer generation in the actual leader decoder and refuses missing or foreign generations', () => {
    const self = { chatId: 'chat-source', sender: 'reader', wire: 3, build: 'candidate' };
    const event = {
      type: 'text-delta',
      chatId: self.chatId,
      runId: 'run-source',
      messageId: 'message-source',
      contentIndex: 0,
      delta: 'current',
      sourceGeneration: 'writer-current',
    };
    const frame = {
      chatId: self.chatId,
      sender: 'writer',
      wire: 3,
      build: self.build,
      kind: 'live',
      epoch: 1,
      body: { event },
    };
    expect(parseLeadershipFrame(frame, self)).toMatchObject({ kind: 'live', event });
    const { sourceGeneration: _sourceGeneration, ...untagged } = event;
    expect(parseLeadershipFrame({ ...frame, body: { event: untagged } }, self)).toBeUndefined();
    expect(parseLeadershipFrame({ ...frame, wire: 2 }, self)).toBeUndefined();
    expect(parseLeadershipFrame({ ...frame, wire: 4 }, self)).toBeUndefined();
  });

  it('refuses untagged live events on candidate wire 3', () => {
    const schema = agentWireProtocolSchemas.listens.liveEvents.event;
    const event = {
      type: 'text-delta',
      chatId: 'chat-source',
      runId: 'run-source',
      messageId: 'message-source',
      contentIndex: 0,
      delta: 'current',
    } as const;
    expect(schema.safeParse(event).success).toBe(false);
    expect(schema.safeParse({ ...event, sourceGeneration: '' }).success).toBe(false);
    expect(schema.parse({ ...event, sourceGeneration: 'writer-current' })).toEqual({
      ...event,
      sourceGeneration: 'writer-current',
    });
  });

  it('should preserve live text offsets and reject invalid checkpoint coordinates', () => {
    const event = {
      type: 'text-delta',
      chatId: 'chat-1',
      runId: 'run-1',
      messageId: 'message-1',
      contentIndex: 0,
      delta: 'tail',
      offset: 5,
    } as const;
    expect(agentLiveEventSchema.parse(event)).toEqual(event);
    for (const offset of [-1, 0.5, '5']) {
      expect(agentLiveEventSchema.safeParse({ ...event, offset }).success).toBe(false);
    }
  });

  it('validates the complete live tool-input lifecycle for every channel transport', () => {
    const base = {
      chatId: 'chat-1',
      runId: 'run-1',
      messageId: 'assistant-1',
      contentIndex: 0,
      toolCallId: 'call-1',
      toolName: 'read_file',
    } as const;

    expect(
      [
        { type: 'tool-input-start', ...base },
        { type: 'tool-input-delta', ...base, delta: '{"target' },
        { type: 'tool-input-end', ...base, input: { targetFile: 'main.ts' } },
        { type: 'tool-output-update', ...base, output: { progress: 0.5 }, isError: false },
      ].map((event) => agentLiveEventSchema.safeParse(event).success),
    ).toEqual([true, true, true, true]);
  });

  it('answers the same command over a WebSocket and over a plain MessagePort, after a versioned hello', async () => {
    const launcher = recordingLauncher();

    // Leg 1: a socket, exactly as `tau serve` accepts one on `/agent`.
    const httpServer: HttpServer = createServer();
    const sockets = new WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (request, socket, head) => {
      sockets.handleUpgrade(request, socket, head, (accepted) => {
        serveAgentChannel(accepted, launcher, { build });
      });
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (address === null || typeof address === 'string') {
      throw new TypeError('Expected a TCP address.');
    }
    const socket = new WebSocket(`ws://127.0.0.1:${String(address.port)}/agent`);
    /* Wrapped before `open`, deliberately: the server posts its hello the
     * instant the upgrade completes, and `ws` drops a message that arrives with
     * no listener attached. `wrapWebSocket` buffers in both directions from the
     * moment it is called, so wrapping first closes that window. */
    const socketPort = wrapWebSocket<unknown>(socket, msgpackCodec);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const socketChannel = client(socketPort);
    disposers.push(async () => {
      socketChannel.close();
      socket.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          resolve();
        });
      });
    });
    const overSocket = await socketChannel.call('cancel', cancel);
    expect(socketChannel.hello.payload).toEqual({ wire: 3, build });

    // Leg 2: a MessagePort, exactly as the Electron services utility is handed one.
    const channel = new MessageChannel();
    serveAgentChannel(channel.port1 as unknown as MessagePortLike, launcher, { build });
    const portChannel = client(wrapMessagePort<unknown>(channel.port2 as unknown as MessagePortLike));
    disposers.push(() => {
      portChannel.close();
      channel.port1.close();
      channel.port2.close();
    });
    const overPort = await portChannel.call('cancel', cancel);

    expect(overSocket).toEqual(overPort);
    const expected: HostCommand = { type: 'cancel', ...cancel };
    expect(overSocket).toEqual(answerFor(expected));
    expect(launcher.seen).toEqual([expected, expected]);
  });

  it('serves an emitter-shaped port that has no addEventListener at all', async () => {
    const launcher = recordingLauncher();
    const channel = new MessageChannel();
    /* Electron's `MessagePortMain` speaks `on/off/start/close` and nothing
     * else. Hiding `addEventListener` here is what makes this leg a real
     * assertion: routed to the WHATWG adapter it would call a member that does
     * not exist, exactly as it did in the renderer. */
    const emitterOnly: MessagePortMainLike = {
      postMessage: (value: unknown, transfer?: unknown) => {
        channel.port1.postMessage(value, transfer as readonly Transferable[]);
      },
      on: (event: 'close' | 'message', listener: (payload: unknown) => void) => channel.port1.on(event, listener),
      off: (event: 'close' | 'message', listener: (payload: unknown) => void) => channel.port1.off(event, listener),
      start: () => {
        channel.port1.start();
      },
      close: () => {
        channel.port1.close();
      },
    };
    serveAgentChannel(emitterOnly, launcher, { build });
    const portChannel = client(wrapMessagePort<unknown>(channel.port2 as unknown as MessagePortLike));
    disposers.push(() => {
      portChannel.close();
      channel.port1.close();
      channel.port2.close();
    });

    await expect(
      portChannel.call('read', { chatId: 'chat-emitter', cursor: 0, limit: 4, maxBytes: 1024 }),
    ).resolves.toEqual({ status: 'batch', chatId: 'chat-emitter', cursor: 0, nextCursor: 0, endCursor: 0, events: [] });
  });

  it('serves the host revision root over the same authenticated connection', async () => {
    const launcher = recordingLauncher();
    const channel = new MessageChannel();
    const seen: unknown[] = [];
    const status = { projectId: 'project-1', branch: 'main', headRevisionId: 'revision-1' };
    serveAgentChannel(channel.port1 as unknown as MessagePortLike, launcher, {
      build,
      revisions: {
        async request(request) {
          seen.push(request);
          return { result: [{ id: 'revision-1', revisionNumber: 1 }], status };
        },
        async *events() {
          yield { kind: 'status', value: status };
        },
      },
    });
    const portChannel = client(wrapMessagePort<unknown>(channel.port2 as unknown as MessagePortLike));
    disposers.push(() => {
      portChannel.close();
      channel.port1.close();
      channel.port2.close();
    });

    await expect(portChannel.call('revision', { request: { command: 'log', limit: 8 } })).resolves.toEqual({
      result: [{ id: 'revision-1', revisionNumber: 1 }],
      status,
    });
    const abort = new AbortController();
    const iterator = portChannel.listen('revisionEvents', undefined, abort.signal)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: { kind: 'status', value: status } });
    abort.abort();
    expect(seen).toEqual([{ command: 'log', limit: 8 }]);
    expect(launcher.seen).toEqual([]);
  });

  it('refuses revision requests when this host exposes no revision root', async () => {
    const channel = new MessageChannel();
    serveAgentChannel(channel.port1 as unknown as MessagePortLike, recordingLauncher(), { build });
    const portChannel = client(wrapMessagePort<unknown>(channel.port2 as unknown as MessagePortLike));
    disposers.push(() => {
      portChannel.close();
      channel.port1.close();
      channel.port2.close();
    });

    await expect(portChannel.call('revision', { request: { command: 'status' } })).rejects.toMatchObject({
      code: 'REVISIONS_UNAVAILABLE',
    });
  });

  it('refuses an endpoint that is neither a port nor a socket', () => {
    expect(() => serveAgentChannel({} as unknown as AgentChannelEndpoint, recordingLauncher(), { build })).toThrow(
      /neither a Port/u,
    );
  });
});
