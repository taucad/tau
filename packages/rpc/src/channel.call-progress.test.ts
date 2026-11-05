import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Port } from '#port.js';
import { createChannelClient, createChannelServer } from '#index.js';
import type { ChannelCallContext, ChannelServer } from '#index.js';

type LinkedPorts = {
  readonly client: Port<unknown>;
  readonly server: Port<unknown>;
  /** Every frame the server sent, in order. */
  readonly fromServer: unknown[];
  /** Every frame the client sent, in order. */
  readonly fromClient: unknown[];
  /** Stop delivering server frames: the server process hangs without closing its port. */
  readonly freezeServer: () => void;
};

/** Two in-memory ports delivering on microtasks, so fake timers drive only the channel's own clocks. */
const createLinkedPorts = (): LinkedPorts => {
  const clientHandlers = new Set<(data: unknown) => void>();
  const serverHandlers = new Set<(data: unknown) => void>();
  const fromServer: unknown[] = [];
  const fromClient: unknown[] = [];
  let serverFrozen = false;
  const portFor = ({
    own,
    peer,
    log,
    deliverable,
  }: {
    own: Set<(data: unknown) => void>;
    peer: Set<(data: unknown) => void>;
    log: unknown[];
    deliverable: () => boolean;
  }): Port<unknown> => ({
    postMessage(data) {
      log.push(data);
      if (!deliverable()) {
        return;
      }
      queueMicrotask(() => {
        for (const handler of peer) {
          handler(data);
        }
      });
    },
    onMessage(handler) {
      own.add(handler);
      return () => {
        own.delete(handler);
      };
    },
    close: () => undefined,
  });
  return {
    client: portFor({ own: clientHandlers, peer: serverHandlers, log: fromClient, deliverable: () => true }),
    server: portFor({
      own: serverHandlers,
      peer: clientHandlers,
      log: fromServer,
      deliverable: () => !serverFrozen,
    }),
    fromServer,
    fromClient,
    freezeServer() {
      serverFrozen = true;
    },
  };
};

const heartbeatInterval = 10_000;
const livenessTimeout = 30_000;

const frameKinds = (frames: readonly unknown[]): string[] => frames.map((frame) => (frame as { k: string }).k);

/** Watch a call settle without awaiting it, so fake time can move underneath. */
const track = (pending: Promise<unknown>): { readonly settled: () => boolean } => {
  let settled = false;
  const observe = async (): Promise<void> => {
    try {
      await pending;
    } catch {
      // The test asserts the rejection itself.
    } finally {
      settled = true;
    }
  };
  void observe();
  return { settled: () => settled };
};

const unused = (): never => {
  throw new Error('unused');
};

/** A server whose only call is `call`, answering untyped. */
const serve = (
  port: Port<unknown>,
  call: ChannelServer['call'],
  heartbeats = true,
): ReturnType<typeof createChannelServer> =>
  createChannelServer({
    port,
    sessionKey: 's',
    ...(heartbeats ? { callHeartbeatInterval: heartbeatInterval } : {}),
    impl: { call, listen: unused },
  });

describe('@taucad/rpc call progress and per-call liveness (W10, I10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should keep a heartbeating call alive past the ordinary 30 s deadline and resolve it', async () => {
    const wire = createLinkedPorts();
    const server = serve(
      wire.server,
      async () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve('done');
          }, 95_000);
        }),
    );
    const client = createChannelClient({ port: wire.client, sessionKey: 's' });
    await client.ready;

    const result = client.call('bulk', null, undefined, { livenessTimeout });
    const outcome = track(result);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(outcome.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBe('done');
    expect(frameKinds(wire.fromServer).filter((kind) => kind === 'rp')).toHaveLength(9);
    // The heartbeat stopped with the call.
    expect(vi.getTimerCount()).toBe(0);
    client.close();
    server.dispose();
  });

  it('should reject a call whose server stops answering with PEER_UNRESPONSIVE and cancel it', async () => {
    const wire = createLinkedPorts();
    const server = serve(
      wire.server,
      async () =>
        new Promise(() => {
          void 0;
        }),
    );
    const client = createChannelClient({ port: wire.client, sessionKey: 's' });
    await client.ready;

    const result = client.call('bulk', null, undefined, { livenessTimeout });
    const outcome = track(result);
    const failure = expect(result).rejects.toMatchObject({ code: 'PEER_UNRESPONSIVE' });
    await vi.advanceTimersByTimeAsync(25_000);
    wire.freezeServer();
    // The last heartbeat landed at 20 s, so the bound runs to 50 s.
    await vi.advanceTimersByTimeAsync(24_999);
    expect(outcome.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    expect(frameKinds(wire.fromClient)).toContain('rc');
    client.close();
    server.dispose();
  });

  it('should deliver progress reports in order and never a heartbeat as progress', async () => {
    const wire = createLinkedPorts();
    let report: ((data: unknown) => void) | undefined;
    let finish: (() => void) | undefined;
    const server = serve(
      wire.server,
      async (context: ChannelCallContext) =>
        new Promise((resolve) => {
          report = context.progress;
          finish = () => {
            resolve('ok');
          };
        }),
    );
    const client = createChannelClient({ port: wire.client, sessionKey: 's' });
    await client.ready;

    const seen: unknown[] = [];
    const result = client.call('bulk', null, undefined, {
      onProgress(data) {
        seen.push(data);
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    report!({ done: 1, bytes: 10 });
    await vi.advanceTimersByTimeAsync(heartbeatInterval);
    report!({ done: 2, bytes: 20 });
    await vi.advanceTimersByTimeAsync(0);
    finish!();
    await expect(result).resolves.toBe('ok');
    // A report after settlement goes nowhere.
    report!({ done: 3, bytes: 30 });
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([
      { done: 1, bytes: 10 },
      { done: 2, bytes: 20 },
    ]);
    expect(frameKinds(wire.fromServer).filter((kind) => kind === 'rp')).toHaveLength(3);
    client.close();
    server.dispose();
  });

  it('should stop the heartbeat when the caller aborts a call whose handler never settles', async () => {
    const wire = createLinkedPorts();
    let serverSignal: AbortSignal | undefined;
    // oxlint-disable-next-line max-params -- ChannelServer.call impl signature is fixed at 4 params
    const server = serve(wire.server, async (_context, _name, _args, signal) => {
      serverSignal = signal;
      return new Promise(() => {
        void 0;
      });
    });
    const client = createChannelClient({ port: wire.client, sessionKey: 's' });
    await client.ready;

    const ac = new AbortController();
    const result = client.call('bulk', null, ac.signal, { livenessTimeout });
    const failure = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(heartbeatInterval);
    ac.abort();
    await failure;
    await vi.advanceTimersByTimeAsync(0);
    expect(serverSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    client.close();
    server.dispose();
  });

  it('should leave an ordinary call without heartbeats or a per-call bound', async () => {
    const wire = createLinkedPorts();
    const server = serve(wire.server, async () => 'quick', false);
    const client = createChannelClient({ port: wire.client, sessionKey: 's' });
    await client.ready;
    await expect(client.call('small')).resolves.toBe('quick');
    expect(frameKinds(wire.fromServer)).not.toContain('rp');
    expect(vi.getTimerCount()).toBe(0);
    client.close();
    server.dispose();
  });
});
