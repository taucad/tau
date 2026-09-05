import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { WebSocket, WebSocketServer } from 'ws';

import { relayHostFrames, relayHostFramesThroughRedis } from '#api/hosts/host-frame-relay.js';

type SocketPair = { readonly client: WebSocket; readonly accepted: WebSocket; readonly server: WebSocketServer };
const resources: Array<{ close(): void }> = [];

afterEach(() => {
  for (const resource of resources.splice(0)) {
    resource.close();
  }
});

const createSocketPair = async (): Promise<SocketPair> => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  resources.push(server);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP WebSocket address.');
  }
  const accepted = once(server, 'connection');
  const client = new WebSocket(`ws://127.0.0.1:${String(address.port)}`);
  resources.push(client);
  await once(client, 'open');
  const [serverSocket] = (await accepted) as [WebSocket];
  resources.push(serverSocket);
  return { client, accepted: serverSocket, server };
};

describe('relayHostFrames', () => {
  it('preserves binary frames, order, and close semantics', async () => {
    const browser = await createSocketPair();
    const host = await createSocketPair();
    relayHostFrames(browser.accepted, host.accepted);
    const frames: Array<Uint8Array<ArrayBuffer>> = [];
    const complete = Promise.withResolvers<void>();
    host.client.on('message', (data) => {
      frames.push(Buffer.from(data as Uint8Array<ArrayBuffer>));
      if (frames.length === 3) {
        complete.resolve();
      }
    });
    const closed = once(host.client, 'close');

    browser.client.send(Buffer.from([1, 2]));
    browser.client.send(Buffer.from([3]));
    browser.client.send(Buffer.from([4, 5, 6]));
    await complete.promise;
    browser.client.close(4000, 'browser closed');

    expect(frames).toEqual([Buffer.from([1, 2]), Buffer.from([3]), Buffer.from([4, 5, 6])]);
    const [code, reason] = (await closed) as [number, Uint8Array<ArrayBuffer>];
    expect(code).toBe(4000);
    expect(Buffer.from(reason).toString()).toBe('browser closed');
  });
});

/**
 * The distributed relay is the one place a close code crosses a process
 * boundary as *data*: `ws` hands the departing side a code, the API publishes it
 * on a Redis stream, and another replica feeds it straight back into
 * `socket.close()`. Redis semantics are not where that goes wrong, so the
 * streams below are a map in this process and both sockets are real `ws`.
 */
const createRelayKeyspace = (): Redis => {
  const streams = new Map<string, Array<{ id: string; payload: string }>>();
  const counters = new Map<string, number>();
  const waiters = new Set<() => void>();
  let sequence = 0;
  const wake = (): void => {
    for (const waiter of waiters) {
      waiter();
    }
    waiters.clear();
  };
  const entriesAfter = (stream: string, lastId: string): Array<{ id: string; payload: string }> => {
    const after = Number(lastId.split('-')[0]);
    return (streams.get(stream) ?? []).filter((entry) => Number(entry.id.split('-')[0]) > after);
  };
  const client = {
    status: 'ready',
    connect: async () => undefined,
    disconnect: () => undefined,
    /* The publish script's arguments: a byte gate, an XADD and two lifetimes. */
    eval: async (...command: readonly unknown[]) => {
      const [stream, bytesKey, bytes, limit, payload] = command.slice(2) as [string, string, number, number, string];
      const current = counters.get(bytesKey) ?? 0;
      if (current + Number(bytes) > Number(limit)) {
        return 0;
      }
      counters.set(bytesKey, current + Number(bytes));
      sequence += 1;
      const entries = streams.get(stream) ?? [];
      entries.push({ id: `${String(sequence)}-0`, payload });
      streams.set(stream, entries);
      wake();
      return 1;
    },
    decrby: async (key: string, amount: number) => {
      const next = (counters.get(key) ?? 0) - amount;
      counters.set(key, next);
      return next;
    },
    xdel: async (stream: string, id: string) => {
      const entries = streams.get(stream) ?? [];
      const index = entries.findIndex((entry) => entry.id === id);
      if (index !== -1) {
        entries.splice(index, 1);
      }
      return index === -1 ? 0 : 1;
    },
    /** `XREAD BLOCK <milliseconds> STREAMS <stream> <lastId>`. */
    xread: async (...command: readonly unknown[]) => {
      const [, block, , stream, lastId] = command as [string, number, string, string, string];
      if (entriesAfter(stream, lastId).length === 0) {
        await Promise.race([
          new Promise<void>((resolve) => {
            waiters.add(resolve);
          }),
          delay(block, undefined, { ref: false }),
        ]);
      }
      const found = entriesAfter(stream, lastId);
      return found.length === 0 ? null : [[stream, found.map((entry) => [entry.id, ['payload', entry.payload]])]];
    },
  };
  return client as unknown as Redis;
};

const attachRelay = async (input: {
  readonly keyspace: Redis;
  readonly sessionId: string;
  readonly side: 'browser' | 'host';
  readonly socket: WebSocket;
}): Promise<void> => {
  resources.push(
    await relayHostFramesThroughRedis({
      socket: input.socket,
      writer: input.keyspace,
      reader: input.keyspace,
      sessionId: input.sessionId,
      route: 'agent',
      side: input.side,
    }),
  );
};

const attachRelayPair = async (sessionId: string): Promise<{ browser: SocketPair; host: SocketPair }> => {
  const keyspace = createRelayKeyspace();
  const browser = await createSocketPair();
  const host = await createSocketPair();
  await attachRelay({ keyspace, sessionId, side: 'browser', socket: browser.accepted });
  await attachRelay({ keyspace, sessionId, side: 'host', socket: host.accepted });
  /* Both `ready` envelopes land before anything departs, so neither side is
   * still inside its peerless window. */
  await delay(100);
  return { browser, host };
};

const closeWithin = async (
  socket: WebSocket,
  milliseconds: number,
): Promise<{ readonly code: number; readonly reason: string } | 'never closed'> => {
  const closed = async (): Promise<{ code: number; reason: string }> => {
    const [code, reason] = (await once(socket, 'close')) as [number, Uint8Array<ArrayBuffer>];
    return { code, reason: Buffer.from(reason).toString() };
  };
  const never = async (): Promise<'never closed'> => {
    await delay(milliseconds, undefined, { ref: false });
    return 'never closed';
  };
  return Promise.race([closed(), never()]);
};

describe('relayHostFramesThroughRedis', () => {
  /** The envelopes are parsed now, not cast, so frames must still cross intact. */
  it('carries binary frames both ways, in order', async () => {
    const { browser, host } = await attachRelayPair('session-frames');
    const received: string[] = [];
    const complete = Promise.withResolvers<void>();
    host.client.on('message', (data, binary) => {
      received.push(`${binary ? 'bin' : 'txt'}:${Buffer.from(data as Uint8Array<ArrayBuffer>).toString('hex')}`);
      if (received.length === 3) {
        complete.resolve();
      }
    });
    const back = once(browser.client, 'message');

    browser.client.send(Buffer.from([1, 2]));
    browser.client.send(Buffer.from([3]));
    browser.client.send(Buffer.from([4, 5, 6]));
    await complete.promise;
    expect(received).toEqual(['bin:0102', 'bin:03', 'bin:040506']);

    host.client.send(Buffer.from([9]));
    const [reply] = (await back) as [Uint8Array<ArrayBuffer>];
    expect(Buffer.from(reply).toString('hex')).toBe('09');
  });

  /**
   * A page navigating away sends no close frame, so `ws` reports 1006 — a code
   * it refuses to put back on the wire. Feeding it to `socket.close()` throws
   * *after* the socket has moved to CLOSING and *before* its close timer is
   * armed, wedging the host peer open for ever: the daemon keeps the session,
   * the parked socket never leaves the session's set, and the API's keepalive
   * immortalises the Redis record.
   */
  it('mirrors a peer departure onto the other side, clean or abrupt', async () => {
    const clean = await attachRelayPair('session-clean');
    clean.browser.client.close(4000, 'browser closed');
    await expect(closeWithin(clean.host.client, 2000)).resolves.toMatchObject({
      code: 4000,
      reason: 'browser closed',
    });

    const abrupt = await attachRelayPair('session-abrupt');
    abrupt.browser.client.terminate();
    await expect(closeWithin(abrupt.host.client, 2000)).resolves.toMatchObject({ code: 1001 });
  });

  it('tells the peer when its own socket fails instead of closing', async () => {
    const { browser, host } = await attachRelayPair('session-error');
    browser.accepted.emit('error', new Error('wire failed'));
    await expect(closeWithin(host.client, 2000)).resolves.toMatchObject({ code: 1011 });
  });

  /**
   * Every listener is attached after an await — the reader's connect here, a
   * grant read and the session keepalive in `parkRoute` — so a socket that dies
   * during admission emits its `close` to nobody at all.
   */
  it('publishes the departure of a socket that died before it was wired up', async () => {
    const keyspace = createRelayKeyspace();
    const browser = await createSocketPair();
    const host = await createSocketPair();
    await attachRelay({ keyspace, sessionId: 'session-late', side: 'host', socket: host.accepted });

    browser.accepted.close(1000, 'gone before admission');
    await once(browser.accepted, 'close');
    await attachRelay({ keyspace, sessionId: 'session-late', side: 'browser', socket: browser.accepted });

    await expect(closeWithin(host.client, 2000)).resolves.toMatchObject({ code: 1001 });
  });
});
