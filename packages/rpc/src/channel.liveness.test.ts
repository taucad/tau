import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Port } from '#port.js';
import type { CloseInfo } from '#index.js';
import { ChannelClosedError, createChannelClient, createChannelServer } from '#index.js';

type ManualPort = { port: Port<unknown>; sent: unknown[]; deliver: (data: unknown) => void };

const createManualPort = (): ManualPort => {
  const sent: unknown[] = [];
  const handlers = new Set<(data: unknown) => void>();
  return {
    sent,
    deliver: (data) => {
      for (const handler of handlers) {
        handler(data);
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
      close: () => undefined,
    },
  };
};

const livenessTimeout = 3500;
const keepaliveInterval = 1000;
const keepalive = { v: 1, k: 'lk' };
const unresponsive: CloseInfo = { origin: 'timeout', code: 'PEER_UNRESPONSIVE', reason: 'liveness-timeout' };

/** Time the page spent frozen, in milliseconds: `performance.now()` counts it, timers do not. */
let frozenFor = 0;

const openClient = async (): Promise<{
  wire: ManualPort;
  client: ReturnType<typeof createChannelClient>;
  closes: CloseInfo[];
}> => {
  const wire = createManualPort();
  const client = createChannelClient({ port: wire.port, sessionKey: 's', livenessTimeout });
  const closes: CloseInfo[] = [];
  client.onClose((info) => closes.push(info));
  wire.deliver({ v: 1, k: 'lh', o: 1 });
  await client.ready;
  return { wire, client, closes };
};

describe('@taucad/rpc liveness bound', () => {
  beforeEach(() => {
    frozenFor = 0;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now() + frozenFor);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should reject a silent server with PEER_UNRESPONSIVE', async () => {
    const { wire, client, closes } = await openClient();
    wire.deliver(keepalive);
    await vi.advanceTimersByTimeAsync(keepaliveInterval);
    wire.deliver(keepalive);
    const pending = client.call('slow');
    const next = client.listen('ticks')[Symbol.asyncIterator]().next();
    const pendingFailure = expect(pending).rejects.toBeInstanceOf(ChannelClosedError);
    const listenFailure = expect(next).rejects.toMatchObject({ code: 'PEER_UNRESPONSIVE', info: unresponsive });

    await vi.advanceTimersByTimeAsync(livenessTimeout - 1);
    expect(closes).toEqual([]);
    await vi.advanceTimersByTimeAsync(keepaliveInterval);

    expect(closes).toEqual([unresponsive]);
    await pendingFailure;
    await expect(pending).rejects.toMatchObject({ message: 'Channel closed', code: 'PEER_UNRESPONSIVE' });
    await listenFailure;
  });

  it('should leave an old peer unbounded', async () => {
    const { client, closes } = await openClient();
    const pending = client.call('slow');

    await vi.advanceTimersByTimeAsync(livenessTimeout * 10);

    expect(closes).toEqual([]);
    await expect(Promise.race([pending, Promise.resolve('pending')])).resolves.toBe('pending');
    client.close();
    await expect(pending).rejects.toBeInstanceOf(ChannelClosedError);
  });

  it('should keep a slow but alive server open while keepalives flow', async () => {
    const serverWire = createManualPort();
    const clientWire = createManualPort();
    // Cross-wire the two manual ports so each side's posts reach the other.
    clientWire.port.postMessage = (data): void => {
      serverWire.deliver(data);
    };
    const client = createChannelClient({ port: clientWire.port, sessionKey: 's', livenessTimeout });
    const closes: CloseInfo[] = [];
    client.onClose((info) => closes.push(info));
    const server = createChannelServer({
      port: {
        ...serverWire.port,
        postMessage: (data) => {
          clientWire.deliver(data);
        },
      },
      sessionKey: 's',
      keepaliveInterval,
      impl: {
        call: async () =>
          new Promise<never>(() => {
            // A slow server: this call never answers.
          }),
        async *listen() {
          yield 0;
        },
      },
    });
    await client.ready;
    const pending = client.call('slow');

    await vi.advanceTimersByTimeAsync(livenessTimeout * 3);

    expect(closes).toEqual([]);
    await expect(Promise.race([pending, Promise.resolve('pending')])).resolves.toBe('pending');
    server.dispose();
    await expect(pending).rejects.toMatchObject({ code: 'PEER_CLOSED' });
  });

  it('should re-arm once for a full window when the timer fires late after a freeze', async () => {
    const { wire, closes } = await openClient();
    wire.deliver(keepalive);
    await vi.advanceTimersByTimeAsync(keepaliveInterval);
    wire.deliver(keepalive);

    // The page freezes for a minute: the monotonic clock runs, the timers do not.
    frozenFor = 60_000;
    // The bound armed by the first lk comes due now, a minute late on the monotonic clock.
    await vi.advanceTimersByTimeAsync(livenessTimeout - keepaliveInterval);
    expect(closes).toEqual([]);

    await vi.advanceTimersByTimeAsync(livenessTimeout - 1);
    expect(closes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(closes).toEqual([unresponsive]);
  });

  it('should send lk on hello and at every keepalive interval until disposed', async () => {
    const wire = createManualPort();
    const server = createChannelServer({
      port: wire.port,
      sessionKey: 's',
      keepaliveInterval,
      impl: {
        call: async () => 'ok',
        async *listen() {
          yield 0;
        },
      },
    });
    expect(wire.sent).toEqual([{ v: 1, k: 'lh', o: 1 }, keepalive]);

    await vi.advanceTimersByTimeAsync(keepaliveInterval * 3);
    expect(wire.sent.filter((frame) => (frame as { k: string }).k === 'lk')).toHaveLength(4);

    server.dispose();
    const sentAtDispose = wire.sent.length;
    await vi.advanceTimersByTimeAsync(keepaliveInterval * 3);
    expect(wire.sent).toHaveLength(sentAtDispose);
  });
});
