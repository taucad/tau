import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import type { Port } from '#port.js';
import { createChannelClient, createChannelServer, wrapMessagePort, __resetFlowControlWarnings } from '#index.js';

type ObservedFrame = { data: unknown; transferables: readonly Transferable[] | undefined };

const startPair = (channel: MessageChannel): { server: Port<unknown>; client: Port<unknown> } => {
  const server = wrapMessagePort<unknown>(channel.port1, { label: 'server' });
  const client = wrapMessagePort<unknown>(channel.port2, { label: 'client' });
  if (server.start) {
    server.start();
  }
  if (client.start) {
    client.start();
  }
  return { server, client };
};

const wrapRecording = (port: Port<unknown>, observed: ObservedFrame[]): Port<unknown> => ({
  postMessage(data, transfer) {
    observed.push({ data, transferables: transfer });
    port.postMessage(data, transfer);
  },
  onMessage: (handler) => port.onMessage(handler),
  start: () => {
    port.start?.();
  },
  close: () => {
    port.close();
  },
});

const flushTicks = async (count = 4): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- serial by design: drives microtask queue forward one tick at a time
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

describe('@taucad/rpc Channel request cancel (R14, F8)', () => {
  let channel: MessageChannel;
  let serverHandle: { dispose: () => void } | undefined;

  beforeEach(() => {
    channel = new MessageChannel();
  });

  afterEach(() => {
    if (serverHandle) {
      serverHandle.dispose();
    }
    channel.port1.close();
    channel.port2.close();
  });

  it('should emit a wire frame with kind "rc" when an in-flight call is aborted', async () => {
    const observed: ObservedFrame[] = [];
    const { server, client: rawClient } = startPair(channel);
    const recordingClient = wrapRecording(rawClient, observed);

    let releaseSlow: ((value: unknown) => void) | undefined;
    const slow = new Promise<unknown>((resolve) => {
      releaseSlow = resolve;
    });
    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'cancel',
      impl: {
        // oxlint-disable-next-line max-params -- ChannelServer.call signature has 4 params
        call: async (_context, _name, _args, signal) => {
          const aborted = new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(new DOMException('aborted', 'AbortError'));
              },
              { once: true },
            );
          });
          return Promise.race([slow, aborted]);
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const channelClient = createChannelClient({ port: recordingClient, sessionKey: 'cancel' });
    await channelClient.ready;

    const ac = new AbortController();
    const pending = channelClient.call('slow', null, ac.signal);
    await flushTicks();
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    const cancelFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'rc');
    expect(cancelFrame).toBeDefined();
    const data = cancelFrame!.data as { v: number; k: string; i: string };
    expect(data.v).toBe(1);
    expect(data.k).toBe('rc');
    expect(typeof data.i).toBe('string');

    releaseSlow?.(0);
  });

  it('should propagate the abort to the server-side AbortSignal', async () => {
    const { server, client } = startPair(channel);

    let observedAborted = false;
    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'cancel',
      impl: {
        // oxlint-disable-next-line max-params -- ChannelServer.call signature has 4 params
        call: async (_context, _name, _args, signal) => {
          await new Promise<void>((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                observedAborted = signal.aborted;
                resolve();
              },
              { once: true },
            );
          });
          throw new DOMException('aborted', 'AbortError');
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'cancel' });
    await channelClient.ready;

    const ac = new AbortController();
    const pending = channelClient.call('slow', null, ac.signal);
    await flushTicks();
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await flushTicks();
    expect(observedAborted).toBe(true);
  });
});

describe('@taucad/rpc Channel stream unsubscribe (F8 row 3)', () => {
  let channel: MessageChannel;
  let serverHandle: { dispose: () => void } | undefined;

  beforeEach(() => {
    channel = new MessageChannel();
  });

  afterEach(() => {
    if (serverHandle) {
      serverHandle.dispose();
    }
    channel.port1.close();
    channel.port2.close();
  });

  it('should emit a wire frame with kind "su" when the client aborts the listen iterator', async () => {
    const observed: ObservedFrame[] = [];
    const { server, client: rawClient } = startPair(channel);
    const recordingClient = wrapRecording(rawClient, observed);

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'unsub',
      impl: {
        call: async () => 0,
        // oxlint-disable-next-line max-params -- ChannelServer.listen signature has 4 params
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
    const channelClient = createChannelClient({
      port: rawClient.start ? recordingClient : recordingClient,
      sessionKey: 'unsub',
    });
    await channelClient.ready;

    const ac = new AbortController();
    const collected: unknown[] = [];
    const drain = (async () => {
      for await (const value of channelClient.listen('e', undefined, ac.signal)) {
        collected.push(value);
        if (collected.length === 1) {
          ac.abort();
        }
      }
    })();
    await expect(drain).rejects.toMatchObject({ name: 'AbortError' });

    const suFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'su');
    expect(suFrame).toBeDefined();
    const data = suFrame!.data as { v: number; k: string; i: string };
    expect(data.v).toBe(1);
    expect(data.k).toBe('su');
    expect(typeof data.i).toBe('string');
  });

  it('should stop emitting "sn" frames after a "su" is observed by the server', async () => {
    const observed: ObservedFrame[] = [];
    const { server: rawServer, client } = startPair(channel);
    const recordingServer = wrapRecording(rawServer, observed);

    serverHandle = createChannelServer({
      port: recordingServer,
      sessionKey: 'unsub',
      impl: {
        call: async () => 0,
        // oxlint-disable-next-line max-params -- ChannelServer.listen signature has 4 params
        // oxlint-disable-next-line max-params -- ChannelServer.listen signature has 4 params
        async *listen(_context, _event, _args, signal) {
          for (let index = 0; index < 100; index += 1) {
            if (signal.aborted) {
              break;
            }
            yield index;
            // oxlint-disable-next-line no-await-in-loop -- serial by design: cooperative yield between each emitted stream value
            await new Promise<void>((resolve) => {
              setImmediate(resolve);
            });
          }
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'unsub' });
    await channelClient.ready;

    const ac = new AbortController();
    const collected: unknown[] = [];
    const drain = (async () => {
      for await (const value of channelClient.listen('e', undefined, ac.signal)) {
        collected.push(value);
        if (collected.length === 3) {
          ac.abort();
        }
      }
    })();
    await expect(drain).rejects.toMatchObject({ name: 'AbortError' });
    await flushTicks(8);

    const snFramesAfterAbort = observed.filter((frame) => (frame.data as { k?: unknown }).k === 'sn').length;
    expect(snFramesAfterAbort).toBeLessThan(100);
    expect(collected.length).toBeLessThanOrEqual(10);
  });
});

describe('@taucad/rpc Channel server hello handshake (R14, F10)', () => {
  let channel: MessageChannel;
  let serverHandle: { dispose: () => void } | undefined;

  beforeEach(() => {
    channel = new MessageChannel();
  });

  afterEach(() => {
    if (serverHandle) {
      serverHandle.dispose();
    }
    channel.port1.close();
    channel.port2.close();
  });

  it('should emit a wire frame with kind "lh" and o:1 from the server', async () => {
    const observed: ObservedFrame[] = [];
    const { server: rawServer, client } = startPair(channel);
    const recordingServer = wrapRecording(rawServer, observed);

    serverHandle = createChannelServer({
      port: recordingServer,
      sessionKey: 'hello',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'hello' });
    await channelClient.ready;

    const helloFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'lh');
    expect(helloFrame).toBeDefined();
    const data = helloFrame!.data as { v: number; k: string; o: number };
    expect(data.v).toBe(1);
    expect(data.k).toBe('lh');
    expect(data.o).toBe(1);
  });

  it('should resolve channel.ready only after the hello frame arrives', async () => {
    const handlers: Array<(value: unknown) => void> = [];
    let lateDeliver: ((value: unknown) => void) | undefined;
    const queuedPort: Port<unknown> = {
      postMessage(): void {
        // Drop everything; the test only needs to verify that `ready` doesn't resolve until
        // the late-delivered hello frame arrives.
      },
      onMessage(handler) {
        handlers.push(handler);
        lateDeliver = handler;
        return () => undefined;
      },
      close: () => undefined,
    };

    const channelClient = createChannelClient({ port: queuedPort, sessionKey: 'hello' });
    let readyResolved = false;
    const readyPromise = (async (): Promise<void> => {
      await channelClient.ready;
      readyResolved = true;
    })();
    await flushTicks(2);
    expect(readyResolved).toBe(false);

    lateDeliver?.({ v: 1, k: 'lh', o: 1 });
    await readyPromise;
    expect(readyResolved).toBe(true);
    void handlers;
    channelClient.close();
  });

  it('should queue calls made before ready and dispatch them after the hello arrives', async () => {
    const sent: unknown[] = [];
    let deliver: ((value: unknown) => void) | undefined;
    const queuedPort: Port<unknown> = {
      postMessage(data: unknown): void {
        sent.push(data);
      },
      onMessage(handler) {
        deliver = handler;
        return () => undefined;
      },
      close: () => undefined,
    };

    const channelClient = createChannelClient({ port: queuedPort, sessionKey: 'hello' });
    const swallow = async (call: Promise<unknown>): Promise<void> => {
      try {
        await call;
      } catch {
        // Discard; calls are torn down when the test closes the channel below.
      }
    };
    const queued1 = swallow(channelClient.call('queued-1'));
    const queued2 = swallow(channelClient.call('queued-2'));
    await flushTicks(2);

    expect(sent.find((data) => (data as { k?: unknown }).k === 'rq')).toBeUndefined();

    deliver?.({ v: 1, k: 'lh', o: 1 });
    await flushTicks(2);

    const requestFrames = sent.filter((data) => (data as { k?: unknown }).k === 'rq');
    expect(requestFrames.length).toBe(2);
    expect((requestFrames[0] as { n?: unknown }).n).toBe('queued-1');
    expect((requestFrames[1] as { n?: unknown }).n).toBe('queued-2');

    channelClient.close();
    await Promise.all([queued1, queued2]);
  });

  it('should reject ready with the structured error when the hello reports failure', async () => {
    let deliver: ((value: unknown) => void) | undefined;
    const port: Port<unknown> = {
      postMessage(): void {
        // No-op
      },
      onMessage(handler) {
        deliver = handler;
        return () => undefined;
      },
      close: () => undefined,
    };

    const channelClient = createChannelClient({ port, sessionKey: 'hello-error' });
    deliver?.({ v: 1, k: 'lh', o: 0, e: { m: 'kernel boot failed', c: 'BOOT_FAIL' } });
    await expect(channelClient.ready).rejects.toThrow('kernel boot failed');
    channelClient.close();
  });

  it('should expose the hello payload via the optional `hello` server option', async () => {
    const observed: ObservedFrame[] = [];
    const { server: rawServer, client } = startPair(channel);
    const recordingServer = wrapRecording(rawServer, observed);

    serverHandle = createChannelServer({
      port: recordingServer,
      sessionKey: 'hello',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
      hello: { capabilities: ['render', 'export'] },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'hello' });
    await channelClient.ready;

    const helloFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'lh');
    const data = helloFrame!.data as { d?: unknown };
    expect(data.d).toEqual({ capabilities: ['render', 'export'] });
  });
});

describe('@taucad/rpc Channel reserved flow control kinds (R15, F13)', () => {
  beforeEach(() => {
    __resetFlowControlWarnings();
  });

  afterEach(() => {
    __resetFlowControlWarnings();
  });

  it('should drop "fa" frames with a single warn-level log', async () => {
    const channel = new MessageChannel();
    try {
      const portServer = wrapMessagePort<unknown>(channel.port1);
      const portClient = wrapMessagePort<unknown>(channel.port2);
      portServer.start?.();
      portClient.start?.();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const handle = createChannelServer({
        port: portServer,
        sessionKey: 'fa',
        impl: {
          call: async () => 0,
          async *listen() {
            yield 0;
          },
        },
      });
      const client = createChannelClient({ port: portClient, sessionKey: 'fa' });
      await client.ready;

      channel.port2.postMessage({ v: 1, k: 'fa', i: 'frame-99' });
      channel.port2.postMessage({ v: 1, k: 'fa', i: 'frame-100' });
      channel.port1.postMessage({ v: 1, k: 'fa', i: 'frame-101' });
      await flushTicks(2);

      const flowAckCalls = warnSpy.mock.calls.filter(
        ([message]) => typeof message === 'string' && message.includes('flow-ack'),
      );
      expect(flowAckCalls.length).toBe(1);

      handle.dispose();
      client.close();
      warnSpy.mockRestore();
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });

  it('should drop "fw" frames with a single warn-level log', async () => {
    const channel = new MessageChannel();
    try {
      const portServer = wrapMessagePort<unknown>(channel.port1);
      const portClient = wrapMessagePort<unknown>(channel.port2);
      portServer.start?.();
      portClient.start?.();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const handle = createChannelServer({
        port: portServer,
        sessionKey: 'fw',
        impl: {
          call: async () => 0,
          async *listen() {
            yield 0;
          },
        },
      });
      const client = createChannelClient({ port: portClient, sessionKey: 'fw' });
      await client.ready;

      channel.port2.postMessage({ v: 1, k: 'fw', i: 'sub-1', s: 10 });
      channel.port2.postMessage({ v: 1, k: 'fw', i: 'sub-2', s: 20 });
      channel.port1.postMessage({ v: 1, k: 'fw', i: 'sub-3', s: 30 });
      await flushTicks(2);

      const flowWindowCalls = warnSpy.mock.calls.filter(
        ([message]) => typeof message === 'string' && message.includes('flow-window'),
      );
      expect(flowWindowCalls.length).toBe(1);

      handle.dispose();
      client.close();
      warnSpy.mockRestore();
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });
});

describe('@taucad/rpc Channel wire-version diagnostics', () => {
  it('should warn once per channel for known-kind frames with the wrong wire version', async () => {
    const channel = new MessageChannel();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const portServer = wrapMessagePort<unknown>(channel.port1);
      const portClient = wrapMessagePort<unknown>(channel.port2);
      portServer.start?.();
      portClient.start?.();
      const handle = createChannelServer({
        port: portServer,
        sessionKey: 'wrong-version',
        impl: {
          call: async () => 0,
          async *listen() {
            yield 0;
          },
        },
      });
      const client = createChannelClient({ port: portClient, sessionKey: 'wrong-version' });
      await client.ready;

      channel.port1.postMessage({ v: 2, k: 'nt', n: 'progress', a: null });
      channel.port1.postMessage({ v: 3, k: 'nt', n: 'progress', a: null });
      channel.port2.postMessage({ v: 2, k: 'rq', i: 'one', n: 'call', a: null });
      channel.port2.postMessage({ v: 3, k: 'rq', i: 'two', n: 'call', a: null });
      await flushTicks(2);

      const mismatchCalls = warnSpy.mock.calls.filter(
        ([message]) => typeof message === 'string' && message.includes('wire version mismatch'),
      );
      expect(mismatchCalls).toHaveLength(2);

      handle.dispose();
      client.close();
    } finally {
      warnSpy.mockRestore();
      channel.port1.close();
      channel.port2.close();
    }
  });
});

describe('@taucad/rpc Channel lifecycle bye (R8, F8)', () => {
  let channel: MessageChannel;
  let serverHandle: { dispose: () => void } | undefined;

  beforeEach(() => {
    channel = new MessageChannel();
  });

  afterEach(() => {
    if (serverHandle) {
      serverHandle.dispose();
    }
    channel.port1.close();
    channel.port2.close();
  });

  it('should send a wire frame with kind "lb" on close', async () => {
    const observed: ObservedFrame[] = [];
    const { server, client: rawClient } = startPair(channel);
    const recordingClient = wrapRecording(rawClient, observed);

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'bye',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    const channelClient = createChannelClient({ port: recordingClient, sessionKey: 'bye' });
    await channelClient.ready;

    channelClient.close();
    await channelClient.closed;

    const byeFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'lb');
    expect(byeFrame).toBeDefined();
    const data = byeFrame!.data as { v: number; k: string };
    expect(data.v).toBe(1);
    expect(data.k).toBe('lb');
  });

  it('should propagate the close reason via onClose', async () => {
    const { server, client } = startPair(channel);
    const handle = createChannelServer({
      port: server,
      sessionKey: 'bye',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    serverHandle = handle;
    const channelClient = createChannelClient({ port: client, sessionKey: 'bye' });
    await channelClient.ready;

    const events: Array<{ origin: string; reason?: string }> = [];
    channelClient.onClose((info) => events.push(info));

    handle.dispose('shutdown-requested');
    await channelClient.closed;

    const remoteEvent = events.find((event) => event.origin === 'remote');
    expect(remoteEvent?.reason).toBe('shutdown-requested');
  });

  it('should accept a "lb" frame with no reason and emit origin remote', async () => {
    const handlers: Array<(value: unknown) => void> = [];
    const port: Port<unknown> = {
      postMessage(): void {
        // No-op.
      },
      onMessage(handler) {
        handlers.push(handler);
        return () => undefined;
      },
      close: () => undefined,
    };
    const client = createChannelClient({ port, sessionKey: 'bye' });
    const events: Array<{ origin: string; reason?: string }> = [];
    client.onClose((info) => events.push(info));

    handlers[0]?.({ v: 1, k: 'lb' });
    await client.closed;
    expect(events).toEqual([{ origin: 'remote' }]);
  });
});
