/**
 * The seam conformance rows (S3 C1–C5, N1, N2) on the daemon leg: a real launcher over a real workspace, served over
 * a real WebSocket, dialled by the real client. An owner "dies" by losing its socket and its memory: the next owner is
 * a fresh launcher over the same directory, so only the durable log can answer a re-send.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChannelClosedError, createChannelClient, createChannelServer, wrapWebSocket } from '@taucad/rpc';
import type { ChannelServer, CloseInfo, Port } from '@taucad/rpc';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';

import { createAgentChannelClient } from '#channel/agent-channel-client.js';
import { agentChannelPort } from '#channel/endpoint.js';
import type { AgentWireCompatProtocol, V1Addressed, V1Request, V1Response } from '#channel/wire-v1.js';
import type { AgentChannelClient } from '#channel/agent-channel-client.js';
import { serveAgentChannel } from '#launchers/agent-channel.js';
import { createNodeLauncher } from '#launchers/node-launcher.fixture.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';
import { followChat } from '#log/follow-chat.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { HostCommand } from '#wire/commands.schema.js';
import type { ToolRegistry } from '#waist/ports.js';

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;
const emptyTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: 'no tools', isError: true }) };
const chatId = 'chat-seam';

const sseResponse = (): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (const chunk of authoritativeGatewayWireFixtures.browserTurn) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'operation-seam' } },
  );
};

const startCommand = (commandId: string, runId = 'run-1'): HostCommand => ({
  type: 'start',
  commandId,
  payload: { chatId, runId, trigger: 'submit', message: { id: `user-${runId}`, role: 'user', content: 'hello' } },
});

/** Which fault the owner suffers on its next command. */
type Fault = 'none' | 'die-before-effect' | 'die-after-effect' | 'hang' | 'slow';

type Harness = {
  readonly root: string;
  /** The daemon's `/agent` socket. */
  readonly url: string;
  fault: Fault;
  /** Commands the current owner's effect ran, across owners. */
  readonly effects: HostCommand[];
  readonly closes: CloseInfo[];
  /** Completed scalar read observations, for explicit legacy reader/writer handoff controls. */
  readonly reads: Array<{ cursor: number; following: boolean; status: string; sourceGeneration: string | undefined }>;
  holdNextFollowingRead(): { readonly held: Promise<void>; release(): void };
  dial(options?: { readonly livenessTimeout?: number }): AgentChannelClient;
  rows(): Promise<readonly AgentLogEvent[]>;
};

const disposers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered.
    await dispose();
  }
});

const keepaliveInterval = 50;
const livenessTimeout = 400;

/** A dead or hung owner answers nothing, ever. */
const forever = async (): Promise<never> =>
  new Promise<never>(() => {
    // Never settles.
  });

const harness = async (): Promise<Harness> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-seam-daemon-'));
  const fetch = vi.fn(async () => sseResponse()) as unknown as typeof globalThis.fetch;
  const launch = (): AgentLauncher =>
    createNodeLauncher({
      workspaceRoot: root,
      gatewayBaseUrl: 'https://gateway.example',
      model,
      systemPrompt: 'You are Tau.',
      toolRegistry: emptyTools,
      fetch,
      modelTransport: createTauCloudGatewayModelTransport({ baseUrl: 'https://gateway.example', model, fetch }),
    });
  let owner = launch();
  /** Settles once a dead owner's successor is serving; a process's locks die with it. */
  let succession: Promise<void> = Promise.resolve();
  const sockets = new Set<WebSocket>();
  const hung = new Set<Port<unknown>>();
  let followingGate: { hold(): Promise<void> } | undefined;

  /** An owner death: its socket and its memory go; the next owner reopens the same directory. */
  const die = async (): Promise<void> => {
    for (const socket of sockets) {
      socket.terminate();
    }
    sockets.clear();
    const dead = owner;
    succession = (async () => {
      await dead.close();
      owner = launch();
    })();
    await succession;
  };

  const state: Harness = {
    get url() {
      return url;
    },
    root,
    fault: 'none',
    effects: [],
    closes: [],
    reads: [],
    holdNextFollowingRead: () => {
      const held = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      followingGate = {
        hold: async () => {
          held.resolve();
          await released.promise;
        },
      };
      return {
        held: held.promise,
        release: () => {
          released.resolve();
        },
      };
    },
    dial: (options = {}) => {
      const client = createAgentChannelClient({
        connect: () => new WebSocket(url),
        livenessTimeout: options.livenessTimeout ?? livenessTimeout,
      });
      client.onClose((info) => {
        state.closes.push(info);
      });
      disposers.push(() => {
        client.close();
      });
      return client;
    },
    rows: async () => {
      const text = await readFile(join(root, '.tau', 'chats', chatId, 'events.jsonl'), 'utf8');
      return text
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AgentLogEvent);
    },
  };

  /** Serves whichever owner is current, with the fault the case armed. */
  const proxy = (port: Port<unknown>): AgentLauncher => {
    const served: Pick<AgentLauncher, 'execute' | 'read' | 'liveEvents'> & {
      readonly host: AgentLauncher['host'];
    } = {
      get host() {
        return owner.host;
      },
      execute: async (command: HostCommand) => {
        await succession;
        const { fault } = state;
        state.fault = 'none';
        if (fault === 'die-before-effect') {
          await die();
          return forever();
        }
        if (fault === 'hang') {
          // A hung process: nothing leaves it, not even keepalives, and it never answers.
          hung.add(port);
          return forever();
        }
        if (fault === 'slow') {
          await new Promise((resolve) => {
            setTimeout(resolve, livenessTimeout * 3);
          });
        }
        state.effects.push(command);
        const answer = await owner.execute(command);
        if (fault === 'die-after-effect') {
          await die();
          return forever();
        }
        return answer;
      },
      read: async (input) => {
        await succession;
        const gate = input.signal === undefined ? undefined : followingGate;
        if (gate !== undefined) {
          followingGate = undefined;
        }
        const answer = await owner.read(input);
        state.reads.push({
          cursor: input.cursor,
          following: input.signal !== undefined,
          status: answer.status,
          sourceGeneration: input.sourceGeneration,
        });
        await gate?.hold();
        return answer;
      },
      liveEvents: (input) => owner.liveEvents(input),
    };
    // The seam serves only these three; the rest of a launcher is not the channel's.
    return served as AgentLauncher;
  };

  const httpServer: HttpServer = createServer();
  const server = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request, socket, head) => {
    server.handleUpgrade(request, socket, head, (accepted) => {
      sockets.add(accepted);
      const wrapped = wrapWebSocket<unknown>(accepted, msgpackCodec);
      const port: Port<unknown> = {
        ...wrapped,
        postMessage: (data, transfer) => {
          if (!hung.has(port)) {
            wrapped.postMessage(data, transfer);
          }
        },
      };
      serveAgentChannel(port, proxy(port), { build: 'seam-build', keepaliveInterval });
    });
  });
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a TCP address.');
  }
  const url = `ws://127.0.0.1:${String(address.port)}/agent`;
  disposers.push(async () => {
    for (const socket of sockets) {
      socket.terminate();
    }
    server.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
    await owner.close();
    await rm(root, { recursive: true, force: true });
  });
  return state;
};

/** Follow the chat with long-poll reads until its run ends; returns every row read. */
const followToEnd = async (client: AgentChannelClient): Promise<readonly unknown[]> => {
  const rows: unknown[] = [];
  let sourceGeneration: string | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each read starts at the last one's end.
    const page = await client.read({ chatId, cursor: rows.length, sourceGeneration, limit: 16, maxBytes: 65_536 });
    if (page.status !== 'batch') {
      if (page.reason === 'identity-mismatch') {
        rows.length = 0;
        sourceGeneration = undefined;
        continue;
      }
      throw new Error(`Unexpected refusal: ${page.reason}`);
    }
    sourceGeneration = page.sourceGeneration;
    rows.push(...page.events);
    /* A run ends at its attempt's settlement row, which M1 appends after the terminal one (W8 TS-S6). */
    const ended = page.events.some((row) => (row as AgentLogEvent).type === 'turn.finalized');
    if (ended) {
      return rows;
    }
  }
};

const admittedRows = (rows: readonly AgentLogEvent[], runId = 'run-1'): readonly AgentLogEvent[] =>
  rows.filter((row) => row.type === 'run.lifecycle' && row.state === 'admitted' && row.runId === runId);

describe('the seam on the daemon leg', () => {
  it('C1/N1: should answer a re-send replayed, with one row, when the owner died after the append', async () => {
    const seam = await harness();
    const client = seam.dial();
    seam.fault = 'die-after-effect';

    const answer = await client.execute(startCommand('cmd-c1'));

    expect(answer).toMatchObject({ commandId: 'cmd-c1', status: 'replayed', effect: 'durable' });
    expect(seam.closes.map((close) => close.code)).toContain('PEER_GONE');
    const admitted = admittedRows(await seam.rows());
    expect(admitted).toHaveLength(1);
    expect(admitted[0]).toMatchObject({ commandId: 'cmd-c1' });
  });

  it('C2/N2: should apply the re-send once when the owner died before the append', async () => {
    const seam = await harness();
    const client = seam.dial();
    seam.fault = 'die-before-effect';

    const answer = await client.execute(startCommand('cmd-c2'));

    expect(answer).toMatchObject({ commandId: 'cmd-c2', status: 'applied', effect: 'durable' });
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  });

  it('C3: should observe a hung owner as silence within the bound, and apply the re-send on the next one', async () => {
    const seam = await harness();
    const client = seam.dial();
    seam.fault = 'hang';
    const began = performance.now();

    const answer = await client.execute(startCommand('cmd-c3'));

    expect(answer).toMatchObject({ status: 'applied', effect: 'durable' });
    expect(seam.closes.map((close) => close.code)).toContain('PEER_UNRESPONSIVE');
    expect(performance.now() - began).toBeLessThan(livenessTimeout * 4);
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  });

  it('C4: should keep waiting on a slow owner whose keepalives flow, with no re-send', async () => {
    const seam = await harness();
    const client = seam.dial();
    seam.fault = 'slow';

    const answer = await client.execute(startCommand('cmd-c4'));

    expect(answer).toMatchObject({ status: 'applied', effect: 'durable' });
    expect(seam.closes).toEqual([]);
    expect(seam.effects).toHaveLength(1);
    expect(admittedRows(await seam.rows())).toHaveLength(1);
  });

  it('C5: should refuse an unreadable command, a cursor ahead and a wrong identity, and page one row at maxBytes 1', async () => {
    const seam = await harness();
    const client = seam.dial();

    const unreadable = await client.execute({
      type: 'start',
      commandId: 'cmd-bad',
      payload: { chatId, runId: 'run-1', mode: 'direct' },
    } as unknown as HostCommand);
    expect(unreadable).toMatchObject({ status: 'refused', effect: 'not-applied', code: 'COMMAND_UNREADABLE' });

    await client.execute(startCommand('cmd-c5'));
    await followToEnd(client);
    const rows = await seam.rows();

    const first = await client.read({ chatId, cursor: 0, limit: 16, maxBytes: 65_536 });
    if (first.status !== 'batch') {
      throw new Error('Expected current source.');
    }
    const ahead = await client.read({
      chatId,
      cursor: rows.length + 5,
      sourceGeneration: first.sourceGeneration,
      limit: 16,
      maxBytes: 65_536,
    });
    expect(ahead).toEqual({ status: 'refused', chatId, reason: 'cursor-ahead', expected: { endCursor: rows.length } });

    const wrong = await client.read({
      chatId,
      cursor: 1,
      last: { leaderEpoch: 'not-this-term', sequence: 0 },
      sourceGeneration: first.sourceGeneration,
      limit: 16,
      maxBytes: 65_536,
    });
    expect(wrong).toMatchObject({ status: 'refused', reason: 'identity-mismatch' });

    let cursor = 0;
    let sourceGeneration: string | undefined;
    const paged: unknown[] = [];
    while (cursor < rows.length) {
      // oxlint-disable-next-line no-await-in-loop -- each page starts at the last one's end.
      const page = await client.read({ chatId, cursor, sourceGeneration, limit: 16, maxBytes: 1 });
      expect(page).toMatchObject({ status: 'batch', cursor, nextCursor: cursor + 1 });
      if (page.status !== 'batch') {
        throw new Error('expected a batch');
      }
      paged.push(...page.events);
      cursor = page.nextCursor;
      sourceGeneration = page.sourceGeneration;
    }
    expect(paged).toEqual(rows);
  });

  it('should answer a read at the end once the next row lands, never with an empty clamp', async () => {
    const seam = await harness();
    const client = seam.dial();

    const waiting = (async () => {
      for await (const page of followChat(async (input) => client.read(input), chatId, {
        signal: AbortSignal.timeout(2000),
      })) {
        if (page.events.length > 0) {
          return page;
        }
      }
      throw new Error('The follower ended before a durable row');
    })();
    await client.execute(startCommand('cmd-follow'));

    const page = await waiting;
    expect(page.ledger.position.cursor).toBeGreaterThan(0);
    expect(page.events[0]).toMatchObject({ type: 'run.lifecycle', state: 'admitted' });
  });

  it('control: a re-send under a fresh key is not recognized as the same command (keys off)', async () => {
    const seam = await harness();
    const client = seam.dial();
    await client.execute(startCommand('cmd-first'));
    await followToEnd(client);

    /* The settled attempt is acknowledged after its row; a start in between waits (`CHAT_RUN_LIVE`), as a client re-sends. */
    let again = await client.execute(startCommand('cmd-second'));
    while (again.status === 'refused' && again.code === 'CHAT_RUN_LIVE') {
      // oxlint-disable-next-line no-await-in-loop -- a wait refusal is re-sent.
      again = await client.execute(startCommand('cmd-second'));
    }

    expect(again).not.toMatchObject({ status: 'replayed' });
    expect(again).toMatchObject({ status: 'refused', code: 'RUN_ID_TAKEN' });
  });
});

/** A v1 daemon, as `@taucad/cli@0.1.0-beta.0` and the v1 page know it: no hello payload, one `request` call. */
const v1Daemon = async (answer: (request: V1Request) => Promise<V1Response>) => {
  const received: V1Request[] = [];
  const sockets = new Set<WebSocket>();
  const httpServer: HttpServer = createServer();
  const server = new WebSocketServer({ noServer: true });
  const rows: Array<(frame: V1Addressed<AgentLogEvent>) => void> = [];
  httpServer.on('upgrade', (request, socket, head) => {
    server.handleUpgrade(request, socket, head, (accepted) => {
      sockets.add(accepted);
      createChannelServer({
        port: agentChannelPort(accepted),
        sessionKey: 'tau-agent',
        impl: {
          call: async (_context, _name, args) => {
            received.push(args as V1Request);
            return answer(args as V1Request);
          },
          // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
          listen: (_context, name, _args, signal) =>
            new ReadableStream<V1Addressed<AgentLogEvent>>({
              start(controller) {
                if (name === 'events') {
                  rows.push((frame) => {
                    controller.enqueue(frame);
                  });
                }
                signal.addEventListener('abort', () => {
                  controller.close();
                });
              },
            }) as AsyncIterable<never>,
        } satisfies ChannelServer,
      });
    });
  });
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a TCP address.');
  }
  disposers.push(async () => {
    for (const socket of sockets) {
      socket.terminate();
    }
    server.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
  });
  return {
    url: `ws://127.0.0.1:${String(address.port)}/agent`,
    received,
    push: (frame: V1Addressed<AgentLogEvent>) => {
      for (const listener of rows) {
        listener(frame);
      }
    },
    drop: () => {
      for (const socket of sockets) {
        socket.terminate();
      }
    },
  };
};

describe('mixed builds during the compatibility window (I32)', () => {
  it('should replay a v1 keyless start after its empty reader becomes a completed writer source', async () => {
    const seam = await harness();
    const v1 = createChannelClient<AgentWireCompatProtocol>({
      port: agentChannelPort(new WebSocket(seam.url)),
      sessionKey: 'tau-agent',
    });
    disposers.push(() => {
      v1.close();
    });
    const gate = seam.holdNextFollowingRead();
    try {
      const empty = await v1.call('request', { type: 'tail', chatId, cursor: 0, limit: 1 });
      expect(empty).toMatchObject({ type: 'tail', batch: { cursor: 0, endCursor: 0, events: [] } });
      // Hold the old-generation response through writer handoff and replay, so this background follow cannot update the session map.
      await gate.held;
      expect(seam.reads.some((read) => read.following && read.cursor === 0 && read.status === 'batch')).toBe(true);
      const current = seam.dial();
      await current.execute(startCommand('writer-start'));
      await followToEnd(current);
      const replay = await v1.call('request', {
        type: 'start',
        chatId,
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'user-run-1', role: 'user', content: 'hello' },
      });
      expect(replay).toMatchObject({
        type: 'result',
        operation: 'start',
        snapshot: { runId: 'run-1', state: 'completed' },
      });
      expect(admittedRows(await seam.rows())).toHaveLength(1);
      expect(seam.effects.filter((command) => command.type === 'start')).toHaveLength(1);
      const suffix = await v1.call('request', { type: 'tail', chatId, cursor: 1, limit: 1 });
      expect(suffix).toMatchObject({ type: 'tail', batch: { cursor: 1, nextCursor: 2 } });
      expect(seam.reads.at(-1)).toMatchObject({ cursor: 1, status: 'batch' });
      expect(typeof seam.reads.at(-1)?.sourceGeneration).toBe('string');
    } finally {
      gate.release();
    }
  });

  it('v1 client, v2 daemon: should serve the v1 request call, and replay a keyless start by its run id', async () => {
    const seam = await harness();
    const socket = new WebSocket(seam.url);
    const v1 = createChannelClient<AgentWireCompatProtocol>({
      port: agentChannelPort(socket),
      sessionKey: 'tau-agent',
    });
    disposers.push(() => {
      v1.close();
    });
    const start: V1Request = {
      type: 'start',
      chatId,
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'user-run-1', role: 'user', content: 'hello' },
    };

    const first = await v1.call('request', start);
    await followToEnd(seam.dial());
    const again = await v1.call('request', start);
    const tail = await v1.call('request', { type: 'tail', chatId, cursor: 0, limit: 16 });

    expect({
      first: first.type === 'result' && first.snapshot.runId,
      again: again.type === 'result' && again.snapshot.state,
      admitted: admittedRows(await seam.rows()).length,
      tailed: tail.type === 'tail' && tail.batch.events.length > 0,
    }).toEqual({ first: 'run-1', again: 'completed', admitted: 1, tailed: true });
  });

  it('v2 client, v1 daemon: refuses authoritative reads while preserving execute and lost-command behavior', async () => {
    const daemon = await v1Daemon(async (request) => {
      if (request.type === 'tail') {
        return { type: 'tail', chatId, batch: { cursor: 0, nextCursor: 0, endCursor: 0, events: [] } };
      }
      if (request.type === 'steer') {
        return forever();
      }
      return {
        type: 'result',
        operation: 'cancel',
        snapshot: { chatId, runId: 'run-1', turnId: 'turn-1', state: 'cancelled', messages: [] },
      };
    });
    const client = createAgentChannelClient({ connect: () => new WebSocket(daemon.url) });
    disposers.push(() => {
      client.close();
    });

    const cancel = await client.execute({ type: 'cancel', commandId: 'cmd-v1', payload: { chatId, runId: 'run-1' } });
    await expect(client.read({ chatId, cursor: 0, limit: 16, maxBytes: 65_536 })).rejects.toMatchObject({
      code: 'WIRE_VERSION_UNSUPPORTED',
    });
    const steer = client.execute({
      type: 'steer',
      commandId: 'cmd-steer',
      payload: { chatId, runId: 'run-1', message: 'more' },
    });
    await vi.waitFor(() => {
      expect(daemon.received.some((request) => request.type === 'steer')).toBe(true);
    });
    daemon.drop();
    const lost = await steer.then(
      () => 'answered',
      (error: unknown) => (error instanceof ChannelClosedError ? 'lost' : String(error)),
    );
    await expect(client.read({ chatId, cursor: 0, limit: 16, maxBytes: 65_536 })).rejects.toMatchObject({
      code: 'WIRE_VERSION_UNSUPPORTED',
    });

    expect({
      cancel: { status: cancel.status, effect: cancel.effect },
      sentCancel: daemon.received.find((request) => request.type === 'cancel'),
      lost,
      steers: daemon.received.filter((request) => request.type === 'steer').length,
    }).toEqual({
      cancel: { status: 'applied', effect: 'durable' },
      sentCancel: { type: 'cancel', chatId, runId: 'run-1' },
      lost: 'lost',
      steers: 1,
    });
  });
});
