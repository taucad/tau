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
import { afterEach, describe, expect, it } from 'vitest';

import { ChannelClosedError, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import type { ChannelServer, CloseInfo, MessagePortLike } from '@taucad/rpc';

import { createAgentChannelClient } from '#channel/agent-channel-client.js';
import { serveAgentChannel } from '#launchers/node/agent-channel.js';
import type { NodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';

type RecordingLauncher = NodeAgentLauncher & {
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

type ServedSocket = { readonly origin: string; kill: () => void };

/** `tau serve`'s own accept path: one WebSocket per client on `/agent`. */
const serveOverWebSocket = async (launcher: NodeAgentLauncher): Promise<ServedSocket> => {
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
    let dials = 0;
    const client = createAgentChannelClient({
      connect: () => {
        dials += 1;
        const socket = new WebSocket('ws://127.0.0.1:1/agent');
        // `ws` throws an unobserved connection error; the close that follows is what the client reads.
        socket.on('error', () => undefined);
        return socket;
      },
    });
    disposers.push(() => {
      client.close();
    });

    await expect(client.execute(cancel)).rejects.toBeInstanceOf(ChannelClosedError);
    // The first dial and three redials (T9 E7).
    expect(dials).toBe(4);
  });

  it('should refuse an owner that speaks another wire version, without redialling', async () => {
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
      hello: { wire: 3, build: 'future' },
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
