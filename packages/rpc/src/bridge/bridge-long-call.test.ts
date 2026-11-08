import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Port } from '#port.js';
import { createBridgeCall, createBridgeServer } from '#bridge/index.js';
import type { BridgeProgress, BridgeServerLongCall } from '#bridge/index.js';

type LinkedPorts = {
  readonly client: Port<unknown>;
  readonly server: Port<unknown>;
  /** The server hangs: it keeps its port open and sends nothing more. */
  readonly freezeServer: () => void;
};

/** Two in-memory ports delivering on microtasks, so fake timers drive only the bridge's own clocks. */
const createLinkedPorts = (): LinkedPorts => {
  const toClient = new Set<(data: unknown) => void>();
  const toServer = new Set<(data: unknown) => void>();
  let serverFrozen = false;
  const portFor = (
    own: Set<(data: unknown) => void>,
    peer: Set<(data: unknown) => void>,
    deliverable: () => boolean,
  ): Port<unknown> => ({
    postMessage(data) {
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
    client: portFor(toClient, toServer, () => true),
    server: portFor(toServer, toClient, () => !serverFrozen),
    freezeServer() {
      serverFrozen = true;
    },
  };
};

/** Bind the long-call controls as the trailing argument of every call named `bulk`. */
const bindTrailing = (method: string, args: unknown[], longCall: BridgeServerLongCall): unknown[] =>
  method === 'bulk' ? [...args, longCall] : args;

describe('bridge long calls: liveness, progress and abort (W10, I10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should let a progress-bearing call outlive 30 s and deliver its validated progress', async () => {
    const wire = createLinkedPorts();
    const server = createBridgeServer(
      {
        async bulk(count: number, longCall: BridgeServerLongCall): Promise<number> {
          for (let done = 1; done <= count; done++) {
            // oxlint-disable-next-line no-await-in-loop -- one unit of slow work per step, in order
            await new Promise((resolve) => {
              setTimeout(resolve, 20_000);
            });
            longCall.onProgress({ done, total: count, bytes: done * 100 });
          }
          return count;
        },
      },
      wire.server,
      { bindLongCall: bindTrailing },
    );
    const client = createBridgeCall(wire.client, { resolveCallTimeout: () => 'liveness' });
    await client.ready;

    const seen: BridgeProgress[] = [];
    const result = client.call('bulk', [4], {
      onProgress(progress) {
        seen.push(progress);
      },
    });
    await vi.advanceTimersByTimeAsync(80_000);
    await expect(result).resolves.toBe(4);
    expect(seen).toEqual([
      { done: 1, total: 4, bytes: 100 },
      { done: 2, total: 4, bytes: 200 },
      { done: 3, total: 4, bytes: 300 },
      { done: 4, total: 4, bytes: 400 },
    ]);
    client.dispose();
    server.dispose();
  });

  it('should keep a silent but heartbeating handler alive under the liveness policy', async () => {
    const wire = createLinkedPorts();
    const server = createBridgeServer(
      {
        async bulk(): Promise<string> {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve('late');
            }, 120_000);
          });
        },
      },
      wire.server,
    );
    const client = createBridgeCall(wire.client, { resolveCallTimeout: () => 'liveness' });
    await client.ready;
    const result = client.call('bulk', []);
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(result).resolves.toBe('late');
    client.dispose();
    server.dispose();
  });

  it('should keep the ordinary 30 s deadline for calls without the liveness policy (Rule 32)', async () => {
    const wire = createLinkedPorts();
    const server = createBridgeServer(
      {
        async small(): Promise<string> {
          return new Promise(() => {
            void 0;
          });
        },
      },
      wire.server,
    );
    const client = createBridgeCall(wire.client);
    await client.ready;
    const result = client.call('small', []);
    const failure = expect(result).rejects.toMatchObject({ code: 'BRIDGE_CALL_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(30_000);
    await failure;
    client.dispose();
    server.dispose();
  });

  it('should reject a liveness call with PEER_UNRESPONSIVE once the authority stops answering', async () => {
    const wire = createLinkedPorts();
    const server = createBridgeServer(
      {
        async bulk(): Promise<never> {
          return new Promise(() => {
            void 0;
          });
        },
      },
      wire.server,
    );
    const client = createBridgeCall(wire.client, { resolveCallTimeout: () => 'liveness' });
    await client.ready;
    let settled = false;
    const result = client.call('bulk', []);
    const observe = async (): Promise<void> => {
      try {
        await result;
      } catch {
        // Asserted below.
      } finally {
        settled = true;
      }
    };
    void observe();
    const failure = expect(result).rejects.toMatchObject({ code: 'PEER_UNRESPONSIVE' });
    // Alive for a minute, then the authority hangs right after its 60 s heartbeat.
    await vi.advanceTimersByTimeAsync(60_000);
    wire.freezeServer();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    client.dispose();
    server.dispose();
  });

  it("should carry the caller's abort to the handler's signal and reject with AbortError", async () => {
    const wire = createLinkedPorts();
    let handlerSignal: AbortSignal | undefined;
    const server = createBridgeServer(
      {
        async bulk(longCall: BridgeServerLongCall): Promise<never> {
          handlerSignal = longCall.signal;
          return new Promise(() => {
            void 0;
          });
        },
      },
      wire.server,
      { bindLongCall: bindTrailing },
    );
    const client = createBridgeCall(wire.client, { resolveCallTimeout: () => 'liveness' });
    await client.ready;
    const ac = new AbortController();
    const result = client.call('bulk', [], { signal: ac.signal });
    const failure = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    expect(handlerSignal?.aborted).toBe(false);
    ac.abort();
    await failure;
    await vi.advanceTimersByTimeAsync(0);
    expect(handlerSignal?.aborted).toBe(true);
    await expect(client.call('bulk', [], { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
    server.dispose();
  });

  it('should drop a malformed progress report without failing the call', async () => {
    const wire = createLinkedPorts();
    const server = createBridgeServer(
      {
        async bulk(longCall: BridgeServerLongCall): Promise<string> {
          longCall.onProgress({ done: -1, bytes: 0 });
          longCall.onProgress({ done: 1, bytes: 5 });
          return 'ok';
        },
      },
      wire.server,
      { bindLongCall: bindTrailing },
    );
    const client = createBridgeCall(wire.client, { resolveCallTimeout: () => 'liveness' });
    await client.ready;
    const seen: BridgeProgress[] = [];
    await expect(
      client.call('bulk', [], {
        onProgress(progress) {
          seen.push(progress);
        },
      }),
    ).resolves.toBe('ok');
    expect(seen).toEqual([{ done: 1, bytes: 5 }]);
    client.dispose();
    server.dispose();
  });
});
