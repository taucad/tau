/**
 * One client, three endpoints.
 *
 * The daemon answers the same T0 vocabulary over a WebSocket (`tau serve`), a
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
import { afterEach, describe, expect, it } from 'vitest';

import type { MessagePortLike } from '@taucad/rpc';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createAgentChannelClient } from '#channel/agent-channel-client.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentChannelCloseReason } from '#channel/agent-channel-client.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { serveAgentChannel } from '#launchers/node/agent-channel.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentChannelCommand, AgentChannelResponse } from '#launchers/node/agent-wire.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { NodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';

const emptyBatch = { cursor: 0, nextCursor: 0, endCursor: 0, events: [] } as const;

type RecordingLauncher = NodeAgentLauncher & {
  readonly seen: AgentChannelCommand[];
  /** Set to hold `execute` open so a socket can die mid-call. */
  hold?: Promise<void> | undefined;
};

const recordingLauncher = (): RecordingLauncher => {
  const seen: AgentChannelCommand[] = [];
  const launcher = {
    seen,
    hold: undefined as Promise<void> | undefined,
    execute: async (command: AgentChannelCommand): Promise<AgentChannelResponse> => {
      seen.push(command);
      await launcher.hold;
      return { type: 'tail', chatId: command.chatId, batch: emptyBatch };
    },
    events: () => ({
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- an idle stream is the point.
      async *[Symbol.asyncIterator]() {},
    }),
    liveEvents: () => ({
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- an idle stream is the point.
      async *[Symbol.asyncIterator]() {},
    }),
    pendingInterrupts: async () => [],
    close: async () => undefined,
  };
  return launcher as unknown as RecordingLauncher;
};

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

type ServedSocket = { readonly origin: string; kill: () => void };

/** `tau serve`'s own accept path: one WebSocket per client on `/agent`. */
const serveOverWebSocket = async (launcher: NodeAgentLauncher): Promise<ServedSocket> => {
  const httpServer: HttpServer = createServer();
  const sockets = new WebSocketServer({ noServer: true });
  let accepted: WebSocket | undefined;
  httpServer.on('upgrade', (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (next) => {
      accepted = next;
      serveAgentChannel(next, launcher);
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

describe('createAgentChannelClient', () => {
  it('answers one command identically over a socket, a WHATWG port and an emitter port', async () => {
    const launcher = recordingLauncher();
    const command: AgentChannelCommand = { type: 'tail', chatId: 'chat-1', cursor: 0, limit: 4 };

    const served = await serveOverWebSocket(launcher);
    const socketClient = createAgentChannelClient(new WebSocket(`${served.origin}/agent`));
    disposers.push(() => {
      socketClient.close();
    });
    const overSocket = await socketClient.execute(command);

    const whatwg = new MessageChannel();
    serveAgentChannel(whatwg.port1 as unknown as MessagePortLike, launcher);
    const whatwgClient = createAgentChannelClient(whatwgOnly(whatwg.port2 as unknown as MessagePortLike));
    disposers.push(() => {
      whatwgClient.close();
      whatwg.port1.close();
    });
    const overWhatwg = await whatwgClient.execute(command);

    const emitter = new MessageChannel();
    serveAgentChannel(emitter.port1 as unknown as MessagePortLike, launcher);
    // Driven through `on/off/start/close` — the Electron `MessagePortMain` shape.
    const emitterClient = createAgentChannelClient(emitter.port2);
    disposers.push(() => {
      emitterClient.close();
      emitter.port1.close();
    });
    const overEmitter = await emitterClient.execute(command);

    expect(overSocket).toEqual({ type: 'tail', chatId: 'chat-1', batch: emptyBatch });
    expect(overWhatwg).toEqual(overSocket);
    expect(overEmitter).toEqual(overSocket);
    expect(launcher.seen).toEqual([command, command, command]);
  });

  it('surfaces a killed socket as a remote close and rejects the in-flight command', async () => {
    const launcher = recordingLauncher();
    const held = Promise.withResolvers<void>();
    launcher.hold = held.promise;
    const served = await serveOverWebSocket(launcher);
    const client = createAgentChannelClient(new WebSocket(`${served.origin}/agent`));
    disposers.push(() => {
      client.close();
      held.resolve();
    });

    const closes: AgentChannelCloseReason[] = [];
    client.onClose((reason) => {
      closes.push(reason);
    });

    const inFlight = client.execute({ type: 'resume', chatId: 'chat-1' });
    // Let the command reach the launcher before the wire dies under it.
    await expect.poll(() => launcher.seen.length).toBe(1);
    served.kill();

    await expect(inFlight).rejects.toMatchObject({ code: 'CHANNEL_CLOSED' });
    // The rpc layer reports a dead port as `port-closed`; that reason rides
    // through verbatim rather than being re-coded here.
    /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `expect.any` is typed `any` by vitest. */
    expect(closes).toEqual([{ origin: 'remote', reason: 'port-closed', message: expect.any(String) }]);
  });
});
