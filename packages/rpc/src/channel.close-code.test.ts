import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Port } from '#port.js';
import type { CloseInfo } from '#index.js';
import { ChannelClosedError, createChannelClient, createChannelServer } from '#index.js';

type ManualPort = {
  port: Port<unknown>;
  sent: unknown[];
  deliver: (data: unknown) => void;
  die: () => void;
};

const createManualPort = (): ManualPort => {
  const sent: unknown[] = [];
  const handlers = new Set<(data: unknown) => void>();
  const closeHandlers = new Set<() => void>();
  return {
    sent,
    deliver: (data) => {
      for (const handler of handlers) {
        handler(data);
      }
    },
    die: () => {
      for (const handler of closeHandlers) {
        handler();
      }
    },
    port: {
      postMessage: (data) => {
        sent.push(data);
      },
      onMessage: (handler) => {
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      },
      onClose: (handler) => {
        closeHandlers.add(handler);
        return () => {
          closeHandlers.delete(handler);
        };
      },
      close: () => undefined,
    },
  };
};

const openClient = async (): Promise<{
  wire: ManualPort;
  client: ReturnType<typeof createChannelClient>;
  closes: CloseInfo[];
}> => {
  const wire = createManualPort();
  const client = createChannelClient({ port: wire.port, sessionKey: 's', closeTimeout: 50 });
  const closes: CloseInfo[] = [];
  client.onClose((info) => closes.push(info));
  wire.deliver({ v: 1, k: 'lh', o: 1 });
  await client.ready;
  return { wire, client, closes };
};

const expectClosedError = async (promise: Promise<unknown>, info: CloseInfo): Promise<void> => {
  try {
    await promise;
    expect.fail('should have rejected');
  } catch (error) {
    expect(error).toBeInstanceOf(ChannelClosedError);
    expect((error as ChannelClosedError).message).toBe('Channel closed');
    expect((error as ChannelClosedError).code).toBe(info.code);
    expect((error as ChannelClosedError).info).toEqual(info);
  }
};

describe('@taucad/rpc coded close', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should reject a pending call with CHANNEL_CLOSED on a local close', async () => {
    const { wire, client, closes } = await openClient();
    const pending = client.call('slow');

    client.close();
    wire.deliver({ v: 1, k: 'lb' });

    await expectClosedError(pending, { origin: 'local', code: 'CHANNEL_CLOSED' });
    expect(closes).toEqual([{ origin: 'local', code: 'CHANNEL_CLOSED' }]);
  });

  it('should throw a ChannelClosedError for a call made after close', async () => {
    const { client } = await openClient();
    client.close('done');

    await expectClosedError(client.call('late'), { origin: 'local', code: 'CHANNEL_CLOSED', reason: 'done' });
  });

  it('should reject a pending call with PEER_CLOSED and end in-flight listens when the peer says bye', async () => {
    const { wire, client, closes } = await openClient();
    const pending = client.call('slow');
    const next = client.listen('ticks')[Symbol.asyncIterator]().next();

    wire.deliver({ v: 1, k: 'lb', r: 'shutdown' });

    await expectClosedError(pending, { origin: 'remote', code: 'PEER_CLOSED', reason: 'shutdown' });
    await expect(next).resolves.toEqual({ done: true, value: undefined });
    expect(closes).toEqual([{ origin: 'remote', code: 'PEER_CLOSED', reason: 'shutdown' }]);
  });

  it('should reject pending calls and fail listens with PEER_GONE when the port dies', async () => {
    const { wire, client, closes } = await openClient();
    const pending = client.call('slow');
    const next = client.listen('ticks')[Symbol.asyncIterator]().next();
    await Promise.resolve();

    wire.die();

    const info: CloseInfo = { origin: 'remote', code: 'PEER_GONE', reason: 'port-closed' };
    await expectClosedError(pending, info);
    await expectClosedError(next, info);
    expect(closes).toEqual([info]);
  });

  it('should reject queued calls with PEER_UNRESPONSIVE when the hello bound expires', async () => {
    vi.useFakeTimers();
    const wire = createManualPort();
    const client = createChannelClient({ port: wire.port, sessionKey: 's' });
    const readyFailure = expect(client.ready).rejects.toThrow('sent no hello');
    const queued = client.call('early');
    const queuedFailure = expectClosedError(queued, {
      origin: 'timeout',
      code: 'PEER_UNRESPONSIVE',
      reason: 'hello-timeout',
    });

    await vi.advanceTimersByTimeAsync(30_000);

    await readyFailure;
    await queuedFailure;
  });

  it('should report PEER_UNRESPONSIVE when the close handshake bound expires', async () => {
    const { client, closes } = await openClient();

    client.close();
    await client.closed;

    expect(closes).toEqual([{ origin: 'timeout', code: 'PEER_UNRESPONSIVE' }]);
  });

  it('should report PEER_CLOSED on the server when the client says bye', async () => {
    const wire = createManualPort();
    const server = createChannelServer({
      port: wire.port,
      sessionKey: 's',
      impl: {
        call: async () => 'ok',
        async *listen() {
          yield 0;
        },
      },
    });
    const closes: CloseInfo[] = [];
    server.onClose((info) => closes.push(info));

    wire.deliver({ v: 1, k: 'lb' });
    await server.closed;

    expect(closes).toEqual([{ origin: 'remote', code: 'PEER_CLOSED' }]);
  });
});
