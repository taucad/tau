/* oxlint-disable max-lines -- comprehensive R1/R2/R3/R6 conformance suite for the typed channel
 * spans every wire kind plus close/lifecycle and consumer-error paths; splitting forces brittle
 * cross-file MessageChannel sharing harnesses. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import type { Port } from '#port.js';
import {
  createChannelClient,
  createChannelClientOptions,
  createChannelServer,
  createChannelServerOptions,
  wrapMessagePort,
} from '#index.js';

describe('createChannelClient / createChannelServer', () => {
  let channel: MessageChannel;
  let dispose: { dispose: () => void } | undefined;

  beforeEach(() => {
    channel = new MessageChannel();
  });

  afterEach(() => {
    if (dispose) {
      dispose.dispose();
    }
    channel.port1.close();
    channel.port2.close();
  });

  it('round-trips call results', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1, { label: 'server' });
    const portClient = wrapMessagePort<unknown>(channel.port2, { label: 'client' });
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async (_context, name, args) => {
          if (name === 'add') {
            return (args as { a: number; b: number }).a + (args as { a: number; b: number }).b;
          }
          throw new Error(`unknown: ${name}`);
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const ac = new AbortController();
    const result = await client.call('add', { a: 2, b: 3 }, ac.signal);
    expect(result).toBe(5);
  });

  it('propagates call errors to the client', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => {
          throw new Error('boom');
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    await expect(client.call('x')).rejects.toThrow('boom');
  });

  it('streams listen payloads', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen(_context, event) {
          if (event === 'ticks') {
            yield 1;
            yield 2;
            yield 3;
          }
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const out: unknown[] = [];
    for await (const v of client.listen('ticks')) {
      out.push(v);
    }
    expect(out).toEqual([1, 2, 3]);
  });

  it('exposes createChannelClientOptions as identity for intellisense', () => {
    const o = createChannelClientOptions({ port: wrapMessagePort(new MessageChannel().port1), sessionKey: 'k' });
    expect(o.sessionKey).toBe('k');
  });

  it('exposes createChannelServerOptions as identity for intellisense', () => {
    const o = createChannelServerOptions({
      port: wrapMessagePort(new MessageChannel().port1),
      sessionKey: 'k',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    expect(o.sessionKey).toBe('k');
  });

  it('rejects call after the channel is closed', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    client.close();
    await expect(client.call('a')).rejects.toThrow('Channel is closed');
  });

  it('aborts a pending call when the AbortSignal is aborted', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    let releaseSlow: ((v: number) => void) | undefined;
    const slow = new Promise<number>((resolve) => {
      releaseSlow = resolve;
    });
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async (_context, name) => {
          if (name === 'slow') {
            return slow;
          }
          return 0;
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const ac = new AbortController();
    const pending = client.call('slow', null, ac.signal);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    releaseSlow?.(1);
  });

  it('rejects in-flight call when client closes', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    let resolveSlow: ((v: number) => void) | undefined;
    const slow = new Promise<number>((resolve) => {
      resolveSlow = resolve;
    });
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async (_context, name) => {
          if (name === 'slow') {
            return slow;
          }
          return 0;
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const pending = client.call('slow');
    client.close();
    await expect(pending).rejects.toThrow('Channel closed');
    resolveSlow?.(1);
  });

  it('propagates listen stream errors to the client', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
          throw new Error('stream boom');
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    await expect(
      (async () => {
        for await (const _ of client.listen('e')) {
          // Drain
        }
      })(),
    ).rejects.toThrow('stream boom');
  });

  it('stops the server on dispose and drops handlers', () => {
    const c = new MessageChannel();
    const portServer = wrapMessagePort<unknown>(c.port1);
    if (portServer.start) {
      portServer.start();
    }
    const d = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    d.dispose();
  });

  it('server accepts asyncIterable from listen returning a thenable of iterable', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        listen: async () => {
          return (async function* () {
            yield 42;
          })();
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const n = await (async () => {
      for await (const v of client.listen('x')) {
        return v;
      }
      return undefined;
    })();
    expect(n).toBe(42);
  });

  it('server listen rejects if impl.listen promise rejects before iteration', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async listen() {
          await Promise.resolve();
          throw new Error('pre-iter');
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    await expect(
      (async () => {
        for await (const _ of client.listen('a')) {
          // Empty
        }
      })(),
    ).rejects.toThrow('pre-iter');
  });

  it('aborts in-flight server listen via client close and clears controllers', async () => {
    const c = new MessageChannel();
    c.port1.start();
    c.port2.start();
    const serverPort = wrapMessagePort<unknown>(c.port1);
    const portClient = wrapMessagePort<unknown>(c.port2);
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: serverPort,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          // Never completes — inFlight has an AbortController until 'x' or dispose

          await new Promise<never>(() => {
            void 0;
          });
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const pendingListen = (async () => {
      for await (const _ of client.listen('q')) {
        // Never completes
      }
    })();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    client.close();
    await expect(pendingListen).rejects.toThrow('Channel closed');
  });

  it('server works when port has no start method', () => {
    const mockPort: {
      postMessage: ReturnType<typeof vi.fn>;
      onMessage: (handler: (d: unknown) => void) => () => void;
      close: () => void;
      _h?: (d: unknown) => void;
    } = {
      postMessage: vi.fn(),
      onMessage: (handler: (d: unknown) => void) => {
        mockPort._h = handler;
        return () => undefined;
      },
      close: () => undefined,
      _h: undefined as undefined | ((d: unknown) => void),
    };
    const d = createChannelServer({
      port: mockPort as Port<unknown>,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    d.dispose();
  });

  it('close is idempotent', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    client.close();
    client.close();
  });

  it('fails active listen with Channel closed when the client is closed', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 1;

          await new Promise<never>(() => {
            void 0;
          });
          yield 2;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const p = (async () => {
      for await (const v of client.listen('e')) {
        if (v === 1) {
          client.close();
        }
      }
    })();
    await expect(p).rejects.toThrow('Channel closed');
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  it('ignores non-wire payloads on the server', () => {
    const c = new MessageChannel();
    c.port1.start();
    c.port2.start();
    const serverPort = wrapMessagePort<unknown>(c.port1);
    dispose = createChannelServer({
      port: serverPort,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    c.port2.postMessage({ not: 'wire' as unknown } as { not: string });
    c.port2.postMessage(null);
    c.port2.postMessage({ v: 1 } as unknown);
  });

  it('rejects listen with AbortError when signal is already aborted', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    const ac = new AbortController();
    ac.abort();
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    await expect(
      (async () => {
        for await (const _ of client.listen('e', undefined, ac.signal)) {
          // Empty
        }
      })(),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects call with AbortError when signal is already aborted', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    const ac = new AbortController();
    ac.abort();
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 1,
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    await expect(client.call('a', null, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('uses time-based id when randomUUID is unavailable', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    const originalCrypto = globalThis.crypto;
    const stubCrypto = { getRandomValues: (a: Int8Array) => a } as unknown as Crypto;
    Object.defineProperty(globalThis, 'crypto', { value: stubCrypto, configurable: true });
    try {
      dispose = createChannelServer({
        port: portServer,
        sessionKey: 's1',
        impl: {
          call: async () => 7,
          async *listen() {
            yield 0;
          },
        },
      });
      const client = createChannelClient({ port: portClient, sessionKey: 's1' });
      await expect(client.call('n')).resolves.toBe(7);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    }
  });

  it('ignores return wire for unknown call id', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    channel.port1.postMessage({ v: 1, k: 'rs', i: 'not-a-pending-id', o: 1, d: 9 });
    await expect(client.call('c')).resolves.toBe(0);
  });

  it('ignores listen push and end and fail for unknown subscription ids on the client', () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    createChannelClient({ port: portClient, sessionKey: 's1' });
    channel.port1.postMessage({ v: 1, k: 'sn', i: 'nope', d: 1 });
    channel.port1.postMessage({ v: 1, k: 'sc', i: 'nope' });
    channel.port1.postMessage({ v: 1, k: 'se', i: 'nope', e: { m: 'e' } });
  });

  it('ignores non-v1 client wire noise', () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    channel.port1.postMessage({ v: 0, k: 'rs', i: 'x', o: 1, d: 0 } as {
      v: number;
      k: string;
      i: string;
      o: number;
      d: number;
    });
    channel.port1.postMessage(null);
    channel.port1.postMessage({ v: 1 } as unknown);
    void client;
  });

  it('stringifies non-Error throws from the server call handler', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => {
          // oxlint-disable-next-line typescript/only-throw-error -- exercise String(error) branch
          throw 'plain';
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    await expect(client.call('a')).rejects.toThrow('plain');
  });

  it('stringifies non-Error errors during server listen iteration', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 1;
          // oxlint-disable-next-line typescript/only-throw-error -- exercise String(error) branch in for-await catch
          throw 'mid';
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    await expect(
      (async () => {
        for await (const _ of client.listen('a')) {
          // Drain
        }
      })(),
    ).rejects.toThrow('mid');
  });

  it('aborts in-flight server listen and clears controllers on dispose', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        // oxlint-disable-next-line max-params -- ChannelServer.listen signature has 4 params
        async *listen(_context, _event, _args, signal) {
          await new Promise<void>((resolve) => {
            const onAb = (): void => {
              resolve();
            };
            signal.addEventListener('abort', onAb, { once: true });
          });
          if (signal.aborted) {
            return;
          }
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const drain = (async () => {
      for await (const _ of client.listen('e')) {
        // Empty
      }
    })();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    dispose.dispose();
    await drain;
  });

  it('aborts the listen iterator when the listen AbortSignal is aborted', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          await new Promise<never>(() => {
            void 0;
          });
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const ac = new AbortController();
    const p = (async () => {
      for await (const _ of client.listen('e', undefined, ac.signal)) {
        // Never
      }
    })();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    ac.abort();
    await expect(p).rejects.toThrow('aborted');
  });

  it('emits symmetric close: server.dispose() resolves both ends and gracefully ends client listens', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    const handle = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        // oxlint-disable-next-line max-params -- ChannelServer.listen signature has 4 params
        async *listen(_context, _event, _args, signal) {
          yield 1;
          await new Promise<void>((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
          });
        },
      },
    });
    dispose = handle;

    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const clientCloseEvents: Array<{ origin: string }> = [];
    const serverCloseEvents: Array<{ origin: string }> = [];
    client.onClose((info) => clientCloseEvents.push(info));
    handle.onClose((info) => serverCloseEvents.push(info));

    const collected: unknown[] = [];
    const drain = (async () => {
      for await (const v of client.listen('e')) {
        collected.push(v);
      }
    })();

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    handle.dispose();

    await Promise.all([handle.closed, client.closed, drain]);

    expect(collected).toEqual([1]);
    expect(serverCloseEvents).toEqual([{ origin: 'local' }]);
    expect(clientCloseEvents).toEqual([{ origin: 'remote' }]);
  });

  it('emits symmetric close: client.close() resolves both ends', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    const handle = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    dispose = handle;

    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const clientEvents: Array<{ origin: string }> = [];
    const serverEvents: Array<{ origin: string }> = [];
    client.onClose((info) => clientEvents.push(info));
    handle.onClose((info) => serverEvents.push(info));

    client.close();

    await Promise.all([client.closed, handle.closed]);

    expect(clientEvents).toEqual([{ origin: 'local' }]);
    expect(serverEvents).toEqual([{ origin: 'remote' }]);
  });

  it('falls back to timeout when the remote port is dropped (no ack)', async () => {
    const handlers: Array<(value: unknown) => void> = [];
    const droppedPort: Port<unknown> = {
      postMessage(_data: unknown): void {
        // Drop everything; remote never sees the close, never acks.
      },
      onMessage(handler) {
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        };
      },
      close: () => undefined,
    };

    const client = createChannelClient({
      port: droppedPort,
      sessionKey: 's1',
      closeTimeout: 25,
    });
    const events: Array<{ origin: string }> = [];
    client.onClose((info) => events.push(info));

    const start = Date.now();
    client.close();
    await client.closed;
    const elapsed = Date.now() - start;

    expect(events).toEqual([{ origin: 'timeout' }]);
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });

  it('treats a postClose throw as immediate timeout disposal', async () => {
    const brokenPort: Port<unknown> = {
      postMessage(): void {
        throw new Error('port detached');
      },
      onMessage() {
        return () => undefined;
      },
      close: () => undefined,
    };

    const client = createChannelClient({
      port: brokenPort,
      sessionKey: 's1',
      closeTimeout: 50,
    });
    const events: Array<{ origin: string }> = [];
    client.onClose((info) => events.push(info));

    client.close();
    await client.closed;

    expect(events).toEqual([{ origin: 'timeout' }]);
  });

  it('onClose fires synchronously for handlers registered after close completes', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    const handle = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    dispose = handle;
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    client.close();
    await client.closed;
    const lateEvents: Array<{ origin: string }> = [];
    client.onClose((info) => lateEvents.push(info));
    expect(lateEvents).toEqual([{ origin: 'local' }]);
  });

  it('close() and dispose() are idempotent and onClose does not refire', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    const handle = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    dispose = handle;
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    const events: Array<{ origin: string }> = [];
    client.onClose((info) => events.push(info));
    client.close();
    client.close();
    handle.dispose();
    handle.dispose();
    await Promise.all([client.closed, handle.closed]);
    expect(events).toHaveLength(1);
  });

  it('unsubscribing onClose before close prevents the handler from firing', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    const handle = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    dispose = handle;
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    let fired = false;
    const off = client.onClose(() => {
      fired = true;
    });
    off();
    client.close();
    await client.closed;
    expect(fired).toBe(false);
  });

  it('onClose listener errors do not block other listeners or teardown', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    if (portServer.start) {
      portServer.start();
    }
    if (portClient.start) {
      portClient.start();
    }
    const handle = createChannelServer({
      port: portServer,
      sessionKey: 's1',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    dispose = handle;
    const client = createChannelClient({ port: portClient, sessionKey: 's1' });
    let secondFired = false;
    client.onClose(() => {
      throw new Error('listener boom');
    });
    client.onClose(() => {
      secondFired = true;
    });
    client.close();
    await client.closed;
    expect(secondFired).toBe(true);
  });

  it('late onClose registration after timeout-completed close still fires synchronously', async () => {
    const droppedPort: Port<unknown> = {
      postMessage(): void {
        // Drop.
      },
      onMessage() {
        return () => undefined;
      },
      close: () => undefined,
    };
    const client = createChannelClient({
      port: droppedPort,
      sessionKey: 's1',
      closeTimeout: 5,
    });
    client.close();
    await client.closed;
    let captured: { origin: string } | undefined;
    client.onClose((info) => {
      captured = info;
    });
    expect(captured).toEqual({ origin: 'local' });
  });

  it('late onClose handler errors are swallowed', async () => {
    const droppedPort: Port<unknown> = {
      postMessage(): void {
        // Drop.
      },
      onMessage() {
        return () => undefined;
      },
      close: () => undefined,
    };
    const client = createChannelClient({
      port: droppedPort,
      sessionKey: 's1',
      closeTimeout: 5,
    });
    client.close();
    await client.closed;
    expect(() =>
      client.onClose(() => {
        throw new Error('late boom');
      }),
    ).not.toThrow();
  });

  it('uses the configured closeTimeout as the upper-bound for the dropped-port fallback', async () => {
    const droppedPort: Port<unknown> = {
      postMessage(): void {
        // Drop.
      },
      onMessage() {
        return () => undefined;
      },
      close: () => undefined,
    };
    const client = createChannelClient({
      port: droppedPort,
      sessionKey: 's1',
      closeTimeout: 10,
    });
    const start = Date.now();
    client.close();
    await client.closed;
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('exposes createChannelServerOptions identity for closeTimeout', () => {
    const config = createChannelServerOptions({
      port: wrapMessagePort<unknown>(channel.port1),
      sessionKey: 's',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
      closeTimeout: 1000,
    });
    expect(config.closeTimeout).toBe(1000);
  });

  it('finalises with local when postClose synchronously triggers a remote ack', async () => {
    const handlers: Array<(value: unknown) => void> = [];
    const port: Port<unknown> = {
      postMessage(data: unknown): void {
        // Synchronous loopback: pretend the remote acked immediately.
        if (data && typeof data === 'object' && (data as { k?: string }).k === 'lb') {
          for (const handler of handlers) {
            handler({ v: 1, k: 'lb' });
          }
        }
      },
      onMessage(handler) {
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        };
      },
      close: () => undefined,
    };
    const client = createChannelClient({ port, sessionKey: 's1', closeTimeout: 50 });
    const events: Array<{ origin: string }> = [];
    client.onClose((info) => events.push(info));
    client.close();
    await client.closed;
    expect(events).toEqual([{ origin: 'local' }]);
  });

  it('handles remote close arriving before local initiation (race) and finalises with origin local', async () => {
    const handlers: Array<(value: unknown) => void> = [];
    const sent: unknown[] = [];
    const port: Port<unknown> = {
      postMessage(data: unknown): void {
        sent.push(data);
      },
      onMessage(handler) {
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        };
      },
      close: () => undefined,
    };
    const client = createChannelClient({ port, sessionKey: 's1', closeTimeout: 50 });
    const events: Array<{ origin: string }> = [];
    client.onClose((info) => events.push(info));

    for (const handler of handlers) {
      handler({ v: 1, k: 'lb' });
    }
    expect(events).toEqual([{ origin: 'remote' }]);
    expect(sent).toEqual([{ v: 1, k: 'lb' }]);

    client.close();
    await client.closed;
    expect(events).toEqual([{ origin: 'remote' }]);
    expect(sent).toEqual([{ v: 1, k: 'lb' }]);
  });

  it('ignores duplicate remote close frames (acceptRemote is idempotent)', async () => {
    const handlers: Array<(value: unknown) => void> = [];
    const sent: unknown[] = [];
    const port: Port<unknown> = {
      postMessage(data: unknown): void {
        sent.push(data);
      },
      onMessage(handler) {
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        };
      },
      close: () => undefined,
    };
    const client = createChannelClient({ port, sessionKey: 's1', closeTimeout: 50 });
    const events: Array<{ origin: string }> = [];
    client.onClose((info) => events.push(info));

    const handler = handlers[0]!;
    handler({ v: 1, k: 'lb' });
    handler({ v: 1, k: 'lb' });
    handler({ v: 1, k: 'lb' });

    await client.closed;
    expect(events).toEqual([{ origin: 'remote' }]);
    expect(sent).toEqual([{ v: 1, k: 'lb' }]);
  });

  it('exposes createChannelClientOptions identity for closeTimeout', () => {
    const config = createChannelClientOptions({
      port: wrapMessagePort<unknown>(channel.port2),
      sessionKey: 's',
      closeTimeout: 2000,
    });
    expect(config.closeTimeout).toBe(2000);
  });

  // R1 / Finding 4 — notify primitive: fire-and-forget round-trip
  it('round-trips notify payloads to the registered server handler exactly once', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();
    const received: Array<{ name: string; args: unknown }> = [];
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 'notify',
      impl: {
        call: async () => {
          throw new Error('not implemented');
        },
        notify: (_context, name, args) => {
          received.push({ name, args });
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: portClient, sessionKey: 'notify' });
    await client.ready;
    client.notify('openFile', { path: '/tmp/a' });
    client.notify('openFile', { path: '/tmp/b' });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(received).toEqual([
      { name: 'openFile', args: { path: '/tmp/a' } },
      { name: 'openFile', args: { path: '/tmp/b' } },
    ]);
  });

  // R1 — onNotify multi-handler fan-out + per-handler unsubscribe
  it('fans notify out to all onNotify handlers and stops only the unsubscribed handler', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();
    let lastNotify: unknown = undefined;
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 'fanout',
      impl: {
        call: async (_c, _n, args) => args,
        notify: (_c, _n, args) => {
          lastNotify = args;
        },
        async *listen() {
          yield 0;
        },
      },
    });
    // Fan-out happens on the receiver side; build a scenario where the SERVER notifies the CLIENT.
    // Use a typed protocol via the client's onNotify; emit from server using a low-level wire frame.
    const fanout: Array<{ id: string; args: unknown }> = [];
    const client = createChannelClient({ port: portClient, sessionKey: 'fanout' });
    await client.ready;
    const offA = client.onNotify('progress', (args) => {
      fanout.push({ id: 'A', args });
    });
    client.onNotify('progress', (args) => {
      fanout.push({ id: 'B', args });
    });
    portServer.postMessage({ v: 1, k: 'nt', n: 'progress', a: 1 });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    offA();
    portServer.postMessage({ v: 1, k: 'nt', n: 'progress', a: 2 });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(fanout).toEqual([
      { id: 'A', args: 1 },
      { id: 'B', args: 1 },
      { id: 'B', args: 2 },
    ]);
    expect(lastNotify).toBeUndefined();
  });

  // R1 — notify is fire-and-forget: no `i` correlation slot is allocated
  it('emits a notify wire frame with no correlation id slot', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();
    const sent: unknown[] = [];
    const recordingClient: Port<unknown> = {
      postMessage(data, transfer) {
        sent.push(data);
        portClient.postMessage(data, transfer);
      },
      onMessage: (handler) => portClient.onMessage(handler),
      start: () => {
        portClient.start?.();
      },
      close: () => {
        portClient.close();
      },
    };
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's',
      impl: {
        call: async () => 0,
        notify: () => undefined,
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: recordingClient, sessionKey: 's' });
    await client.ready;
    client.notify('ping', { x: 1 });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    const ntFrames = sent.filter((d): d is { v: 1; k: 'nt'; n: string; a: unknown; i?: unknown } => {
      return typeof d === 'object' && (d as { k?: unknown } | undefined)?.k === 'nt';
    });
    expect(ntFrames).toHaveLength(1);
    expect(ntFrames[0]).not.toHaveProperty('i');
    expect(ntFrames[0]).toMatchObject({ v: 1, k: 'nt', n: 'ping', a: { x: 1 } });
  });

  // R14 / F10 — server hello handshake: ready resolves only after `lh` frame
  it('resolves channel.ready only after the server hello frame', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();

    let helloReceived = false;
    let readyResolvedAt: number | undefined;

    // Wrap the client port so we can detect when `lh` arrives.
    const interceptedClient: Port<unknown> = {
      postMessage: (data, transfer) => {
        portClient.postMessage(data, transfer);
      },
      onMessage: (handler) =>
        portClient.onMessage((d) => {
          if (typeof d === 'object' && (d as { k?: unknown } | undefined)?.k === 'lh') {
            helloReceived = true;
          }
          handler(d);
        }),
      start: () => {
        portClient.start?.();
      },
      close: () => {
        portClient.close();
      },
    };

    // Client created first; no server yet → ready must not resolve.
    const client = createChannelClient({ port: interceptedClient, sessionKey: 'hello' });
    let resolved = false;
    const trackReady = (async (): Promise<void> => {
      await client.ready;
      resolved = true;
      readyResolvedAt = Date.now();
    })();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(resolved).toBe(false);
    expect(helloReceived).toBe(false);

    // Server attaches → emits `lh` → client.ready resolves.
    const serverStartedAt = Date.now();
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 'hello',
      impl: {
        call: async () => 'ok',
        async *listen() {
          yield 0;
        },
      },
    });
    await client.ready;
    await trackReady;
    expect(resolved).toBe(true);
    expect(helloReceived).toBe(true);
    expect(readyResolvedAt).toBeGreaterThanOrEqual(serverStartedAt);
  });

  // F10 — pre-ready calls queue and flush after hello arrives
  it('queues pre-ready calls until the server hello frame is received', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();
    const sentByClient: Array<{ frame: unknown; tFromStart: number }> = [];
    const start = Date.now();
    const recordingClient: Port<unknown> = {
      postMessage: (data, transfer) => {
        sentByClient.push({ frame: data, tFromStart: Date.now() - start });
        portClient.postMessage(data, transfer);
      },
      onMessage: (handler) => portClient.onMessage(handler),
      start: () => {
        portClient.start?.();
      },
      close: () => {
        portClient.close();
      },
    };

    const client = createChannelClient({ port: recordingClient, sessionKey: 'queue' });
    const callPromise = client.call('add', { a: 1, b: 2 });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    const rqBeforeServer = sentByClient.filter(
      (entry) => typeof entry.frame === 'object' && (entry.frame as { k?: unknown } | undefined)?.k === 'rq',
    );
    expect(rqBeforeServer).toHaveLength(0);

    dispose = createChannelServer({
      port: portServer,
      sessionKey: 'queue',
      impl: {
        call: async (_c, name, args) => {
          if (name === 'add') {
            const { a, b } = args as { a: number; b: number };
            return a + b;
          }
          throw new Error('unknown');
        },
        async *listen() {
          yield 0;
        },
      },
    });

    await expect(callPromise).resolves.toBe(3);
    const rqAfterServer = sentByClient.filter(
      (entry) => typeof entry.frame === 'object' && (entry.frame as { k?: unknown } | undefined)?.k === 'rq',
    );
    expect(rqAfterServer).toHaveLength(1);
  });

  // F10 — server hello payload is exposed via the client (round-trip via `o:1` discriminator)
  it('emits a single hello frame with o:1 discriminator', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();
    const fromServer: unknown[] = [];
    portClient.onMessage((d) => fromServer.push(d));

    dispose = createChannelServer({
      port: portServer,
      sessionKey: 'h',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    const lhFrames = fromServer.filter((d) => typeof d === 'object' && (d as { k?: unknown } | undefined)?.k === 'lh');
    expect(lhFrames).toHaveLength(1);
    expect(lhFrames[0]).toMatchObject({ v: 1, k: 'lh', o: 1 });
  });

  // F8 row 3 — listen abort emits WireStreamUnsubscribe and server stops yielding
  it('emits stream-unsubscribe and stops server emissions when the listen iterator is aborted', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();
    const sentByClient: unknown[] = [];
    const recordingClient: Port<unknown> = {
      postMessage(data, transfer) {
        sentByClient.push(data);
        portClient.postMessage(data, transfer);
      },
      onMessage: (handler) => portClient.onMessage(handler),
      start: () => {
        portClient.start?.();
      },
      close: () => {
        portClient.close();
      },
    };

    let serverIterAborted = false;
    let serverIterations = 0;
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 'unsub',
      impl: {
        call: async () => 0,
        // oxlint-disable-next-line max-params -- ChannelServer.listen signature has 4 params
        async *listen(_c, _name, _args, signal) {
          let i = 0;
          while (!signal.aborted) {
            i += 1;
            serverIterations += 1;
            yield i;
            // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- aborted may flip during yield resume
            if (signal.aborted) {
              break;
            }
            // oxlint-disable-next-line no-await-in-loop -- intentional cooperative tick
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 5);
            });
          }
          serverIterAborted = signal.aborted;
        },
      },
    });

    const client = createChannelClient({ port: recordingClient, sessionKey: 'unsub' });
    await client.ready;
    const ac = new AbortController();
    const seen: number[] = [];
    const consume = (async () => {
      try {
        for await (const v of client.listen('ticks', null, ac.signal)) {
          seen.push(v as number);
          if (seen.length >= 2) {
            ac.abort();
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          throw error;
        }
      }
    })();

    await consume;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });

    const suFrames = sentByClient.filter(
      (d) => typeof d === 'object' && (d as { k?: unknown } | undefined)?.k === 'su',
    );
    expect(suFrames.length).toBeGreaterThanOrEqual(1);
    expect(suFrames[0]).toMatchObject({ v: 1, k: 'su' });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(serverIterAborted).toBe(true);
    const iterationsAfterAbort = serverIterations - seen.length;
    expect(iterationsAfterAbort).toBeLessThanOrEqual(1);
  });

  // R14 / F8 row 4 — request-cancel emits an `rc` wire frame and propagates server-side abort
  it('emits a request-cancel frame on AbortController.abort and surfaces signal.aborted on the server', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();
    const sentByClient: unknown[] = [];
    const recordingClient: Port<unknown> = {
      postMessage(data, transfer) {
        sentByClient.push(data);
        portClient.postMessage(data, transfer);
      },
      onMessage: (handler) => portClient.onMessage(handler),
      start: () => {
        portClient.start?.();
      },
      close: () => {
        portClient.close();
      },
    };

    let serverAborted = false;
    let serverSeenAtAbortTime: AbortSignal | undefined;
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 'cancel',
      impl: {
        // oxlint-disable-next-line max-params -- ChannelServer.call signature has 4 params
        call: async (_c, _n, _args, signal) => {
          serverSeenAtAbortTime = signal;
          await new Promise<void>((resolve, reject) => {
            const onAbort = (): void => {
              serverAborted = true;
              reject(new DOMException('aborted on server', 'AbortError'));
            };
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
            const t = setTimeout(() => {
              signal.removeEventListener('abort', onAbort);
              resolve();
            }, 5000);
            signal.addEventListener(
              'abort',
              () => {
                clearTimeout(t);
              },
              { once: true },
            );
          });
          return 'never';
        },
        async *listen() {
          yield 0;
        },
      },
    });

    const client = createChannelClient({ port: recordingClient, sessionKey: 'cancel' });
    await client.ready;
    const ac = new AbortController();
    const pending = client.call('slow', { x: 1 }, ac.signal);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    ac.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });

    const rcFrames = sentByClient.filter(
      (d): d is { v: 1; k: 'rc'; i: string; e?: { m?: string } } =>
        typeof d === 'object' && (d as { k?: unknown } | undefined)?.k === 'rc',
    );
    expect(rcFrames).toHaveLength(1);
    expect(rcFrames[0]).toMatchObject({ v: 1, k: 'rc', e: { m: 'aborted' } });
    expect(typeof rcFrames[0]?.i).toBe('string');

    expect(serverAborted).toBe(true);
    expect(serverSeenAtAbortTime?.aborted).toBe(true);
  });

  // R14 — pre-aborted signal short-circuits without emitting an rq frame
  it('rejects pre-aborted call signals without emitting any wire frame', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();
    const sent: unknown[] = [];
    const recordingClient: Port<unknown> = {
      postMessage(data, transfer) {
        sent.push(data);
        portClient.postMessage(data, transfer);
      },
      onMessage: (handler) => portClient.onMessage(handler),
      start: () => {
        portClient.start?.();
      },
      close: () => {
        portClient.close();
      },
    };
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's',
      impl: {
        call: async () => 'ok',
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: recordingClient, sessionKey: 's' });
    await client.ready;
    const ac = new AbortController();
    ac.abort();
    await expect(client.call('echo', null, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    const rqFrames = sent.filter((d) => typeof d === 'object' && (d as { k?: unknown } | undefined)?.k === 'rq');
    expect(rqFrames).toHaveLength(0);
  });

  // R1 / R7 — transferables in notify args are hoisted onto port.postMessage
  it('hoists transferables out of notify args onto port.postMessage', async () => {
    const portServer = wrapMessagePort<unknown>(channel.port1);
    const portClient = wrapMessagePort<unknown>(channel.port2);
    portServer.start?.();
    portClient.start?.();
    const observed: Array<{ data: unknown; transfer?: readonly Transferable[] }> = [];
    const recordingClient: Port<unknown> = {
      postMessage(data, transfer) {
        observed.push({ data, transfer });
        portClient.postMessage(data, transfer);
      },
      onMessage: (handler) => portClient.onMessage(handler),
      start: () => {
        portClient.start?.();
      },
      close: () => {
        portClient.close();
      },
    };
    dispose = createChannelServer({
      port: portServer,
      sessionKey: 's',
      impl: {
        call: async () => 0,
        notify: () => undefined,
        async *listen() {
          yield 0;
        },
      },
    });
    const client = createChannelClient({ port: recordingClient, sessionKey: 's' });
    await client.ready;
    const bytes = new Uint8Array(8);
    bytes.set([1, 2, 3, 4, 5, 6, 7, 8]);
    client.notify('blob', { value: { bytes }, transferables: [bytes.buffer] });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    const ntFrame = observed.find((f) => (f.data as { k?: unknown }).k === 'nt');
    expect(ntFrame).toBeDefined();
    expect(ntFrame!.transfer).toEqual([bytes.buffer]);
    expect(ntFrame!.data).toMatchObject({ v: 1, k: 'nt', n: 'blob', a: { bytes: expect.any(Uint8Array) as unknown } });
    expect(bytes.buffer.byteLength).toBe(0);
  });
});
