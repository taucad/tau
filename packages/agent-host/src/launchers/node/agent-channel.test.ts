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
import { afterEach, describe, expect, it } from 'vitest';

import { createChannelClient, wrapMessagePort, wrapWebSocket } from '@taucad/rpc';
import type { Channel, MessagePortLike, MessagePortMainLike, WireProtocolSchemas } from '@taucad/rpc';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { serveAgentChannel } from '#launchers/node/agent-channel.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { agentChannelLiveEventSchema, agentChannelProtocolSchemas } from '#launchers/node/agent-wire.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentChannelEndpoint } from '#channel/endpoint.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentChannelCommand, AgentChannelProtocol, AgentChannelResponse } from '#launchers/node/agent-wire.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { NodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';

const emptyBatch = {
  cursor: 0,
  nextCursor: 0,
  endCursor: 0,
  events: [],
} as const;

/** Records what the transport delivered, so both legs can be compared. */
const recordingLauncher = (): NodeAgentLauncher & {
  readonly seen: AgentChannelCommand[];
} => {
  const seen: AgentChannelCommand[] = [];
  return {
    seen,
    execute: async (command: AgentChannelCommand): Promise<AgentChannelResponse> => {
      seen.push(command);
      return { type: 'tail', chatId: command.chatId, batch: emptyBatch };
    },
    events: () => ({
      async *[Symbol.asyncIterator]() {
        yield { chatId: 'chat-1', event: undefined };
      },
    }),
    liveEvents: () => ({
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- an idle stream is the point.
      async *[Symbol.asyncIterator]() {},
    }),
    pendingInterrupts: async () => [],
    close: async () => undefined,
  } as unknown as NodeAgentLauncher & { readonly seen: AgentChannelCommand[] };
};

const disposers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered.
    await dispose();
  }
});

const client = (port: Parameters<typeof createChannelClient>[0]['port']): Channel<AgentChannelProtocol> =>
  createChannelClient<AgentChannelProtocol>({
    port,
    sessionKey: 'tau-agent',
    protocolSchemas: agentChannelProtocolSchemas as WireProtocolSchemas<AgentChannelProtocol>,
  });

describe('serveAgentChannel', () => {
  it('should preserve live text offsets and reject invalid checkpoint coordinates', () => {
    const frame = {
      chatId: 'chat-1',
      event: {
        type: 'text-delta',
        chatId: 'chat-1',
        runId: 'run-1',
        messageId: 'message-1',
        contentIndex: 0,
        delta: 'tail',
        offset: 5,
      },
    } as const;
    expect(agentChannelLiveEventSchema.parse(frame)).toEqual(frame);
    for (const offset of [-1, 0.5, '5']) {
      expect(agentChannelLiveEventSchema.safeParse({ ...frame, event: { ...frame.event, offset } }).success).toBe(
        false,
      );
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
        {
          type: 'tool-output-update',
          ...base,
          output: { progress: 0.5 },
          isError: false,
        },
      ].map((event) => agentChannelLiveEventSchema.safeParse({ chatId: 'chat-1', event }).success),
    ).toEqual([true, true, true, true]);
  });

  it('answers the same command over a WebSocket and over a plain MessagePort', async () => {
    const launcher = recordingLauncher();
    const command: AgentChannelCommand = {
      type: 'tail',
      chatId: 'chat-1',
      cursor: 0,
      limit: 4,
    };

    // Leg 1: a socket, exactly as `tau serve` accepts one on `/agent`.
    const httpServer: HttpServer = createServer();
    const sockets = new WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (request, socket, head) => {
      sockets.handleUpgrade(request, socket, head, (accepted) => {
        serveAgentChannel(accepted, launcher);
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
    const overSocket = await socketChannel.call('request', command);

    // Leg 2: a MessagePort, exactly as the Electron services utility is handed one.
    const channel = new MessageChannel();
    serveAgentChannel(channel.port1 as unknown as MessagePortLike, launcher);
    const portChannel = client(wrapMessagePort<unknown>(channel.port2 as unknown as MessagePortLike));
    disposers.push(() => {
      portChannel.close();
      channel.port1.close();
      channel.port2.close();
    });
    const overPort = await portChannel.call('request', command);

    expect(overSocket).toEqual(overPort);
    expect(overSocket).toEqual({
      type: 'tail',
      chatId: 'chat-1',
      batch: emptyBatch,
    });
    expect(launcher.seen).toEqual([command, command]);
  });

  it('serves an emitter-shaped port that has no addEventListener at all', async () => {
    const launcher = recordingLauncher();
    const command: AgentChannelCommand = {
      type: 'tail',
      chatId: 'chat-emitter',
      cursor: 0,
      limit: 4,
    };
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
    serveAgentChannel(emitterOnly, launcher);
    const client = createChannelClient<AgentChannelProtocol>({
      port: wrapMessagePort<unknown>(channel.port2 as unknown as MessagePortLike),
      sessionKey: 'tau-agent',
      protocolSchemas: agentChannelProtocolSchemas as WireProtocolSchemas<AgentChannelProtocol>,
    });
    disposers.push(() => {
      client.close();
      channel.port1.close();
      channel.port2.close();
    });

    await expect(client.call('request', command)).resolves.toEqual({
      type: 'tail',
      chatId: 'chat-emitter',
      batch: emptyBatch,
    });
  });

  it('serves the host revision root over the same authenticated connection', async () => {
    const launcher = recordingLauncher();
    const channel = new MessageChannel();
    const seen: unknown[] = [];
    serveAgentChannel(channel.port1 as unknown as MessagePortLike, launcher, {
      revisions: {
        async request(request) {
          seen.push(request);
          return {
            result: [{ id: 'revision-1', revisionNumber: 1 }],
            status: {
              projectId: 'project-1',
              branch: 'main',
              headRevisionId: 'revision-1',
            },
          };
        },
        async *events() {
          yield {
            kind: 'status',
            value: {
              projectId: 'project-1',
              branch: 'main',
              headRevisionId: 'revision-1',
            },
          };
        },
      },
    });
    const portChannel = client(wrapMessagePort<unknown>(channel.port2 as unknown as MessagePortLike));
    disposers.push(() => {
      portChannel.close();
      channel.port1.close();
      channel.port2.close();
    });

    await expect(
      portChannel.call('request', {
        type: 'revision',
        request: { command: 'log', limit: 8 },
      }),
    ).resolves.toEqual({
      type: 'revision',
      result: [{ id: 'revision-1', revisionNumber: 1 }],
      status: {
        projectId: 'project-1',
        branch: 'main',
        headRevisionId: 'revision-1',
      },
    });
    const abort = new AbortController();
    const iterator = portChannel.listen('revisionEvents', undefined, abort.signal)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        kind: 'status',
        value: {
          projectId: 'project-1',
          branch: 'main',
          headRevisionId: 'revision-1',
        },
      },
    });
    abort.abort();
    expect(seen).toEqual([{ command: 'log', limit: 8 }]);
    expect(launcher.seen).toEqual([]);
  });

  it('refuses revision requests when this host exposes no revision root', async () => {
    const channel = new MessageChannel();
    serveAgentChannel(channel.port1 as unknown as MessagePortLike, recordingLauncher());
    const portChannel = client(wrapMessagePort<unknown>(channel.port2 as unknown as MessagePortLike));
    disposers.push(() => {
      portChannel.close();
      channel.port1.close();
      channel.port2.close();
    });

    await expect(
      portChannel.call('request', {
        type: 'revision',
        request: { command: 'status' },
      }),
    ).rejects.toMatchObject({ code: 'REVISIONS_UNAVAILABLE' });
  });

  it('refuses an endpoint that is neither a port nor a socket', () => {
    expect(() => serveAgentChannel({} as unknown as AgentChannelEndpoint, recordingLauncher())).toThrow(
      /neither a Port/u,
    );
  });
});
