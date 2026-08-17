import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import type { Port } from '#port.js';
import type { WithTransferables } from '#index.js';
import { createChannelClient, createChannelServer, wrapMessagePort } from '#index.js';

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

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 4; index += 1) {
    /* Sequential awaits are required: each setImmediate must drain before
     * the next is scheduled so queued microtasks run between ticks. */
    // oxlint-disable-next-line no-await-in-loop -- sequencing setImmediate ticks; Promise.all would batch them.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

describe('@taucad/rpc Channel notify / onNotify (R1)', () => {
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

  it('should round-trip a fire-and-forget notify from client to server', async () => {
    const { server, client } = startPair(channel);
    const received: Array<{ name: string; args: unknown }> = [];

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'notify',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
        notify: (_context, name, args) => {
          received.push({ name, args });
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'notify' });
    await channelClient.ready;

    channelClient.notify('openFile', { path: '/foo.scad' });
    await flushMicrotasks();

    expect(received).toEqual([{ name: 'openFile', args: { path: '/foo.scad' } }]);
  });

  it('should emit a wire frame with kind "nt" and no correlation id slot', async () => {
    const observed: ObservedFrame[] = [];
    const { server, client: rawClient } = startPair(channel);
    const recordingClient = wrapRecording(rawClient, observed);

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'notify',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
        notify: () => undefined,
      },
    });
    const channelClient = createChannelClient({ port: recordingClient, sessionKey: 'notify' });
    await channelClient.ready;

    channelClient.notify('ping', { v: 1 });
    await flushMicrotasks();

    const ntFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'nt');
    expect(ntFrame).toBeDefined();
    const data = ntFrame!.data as { v: number; k: string; n: string; a: unknown; i?: unknown };
    expect(data.v).toBe(1);
    expect(data.k).toBe('nt');
    expect(data.n).toBe('ping');
    expect(data.a).toEqual({ v: 1 });
    expect('i' in data).toBe(false);
  });

  it('should hoist transferables out of notify args onto port.postMessage', async () => {
    const observed: ObservedFrame[] = [];
    const { server, client: rawClient } = startPair(channel);
    const recordingClient = wrapRecording(rawClient, observed);
    const captured: Array<{ name: string; args: unknown }> = [];

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'notify',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
        notify: (_context, name, args) => {
          captured.push({ name, args });
        },
      },
    });
    const channelClient = createChannelClient({ port: recordingClient, sessionKey: 'notify' });
    await channelClient.ready;

    const bytes = new Uint8Array(8);
    bytes.set([1, 2, 3, 4, 5, 6, 7, 8]);
    const payload: WithTransferables<{ bytes: Uint8Array<ArrayBuffer> }> = {
      value: { bytes },
      transferables: [bytes.buffer],
    };

    channelClient.notify('upload', payload);
    await flushMicrotasks();

    const ntFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'nt');
    expect(ntFrame).toBeDefined();
    expect(ntFrame!.transferables?.length).toBe(1);
    expect(bytes.buffer.byteLength).toBe(0);
    expect(captured.length).toBe(1);
    expect(captured[0]!.name).toBe('upload');
  });

  it('should fan out a server-emitted notify to multiple client handlers in registration order', async () => {
    const { server, client } = startPair(channel);

    let serverNotify: ((name: string, args: unknown) => void) | undefined;
    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'notify',
      impl: {
        call: async (_context, _name, args) => {
          serverNotify = args as (name: string, args: unknown) => void;
          return null;
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'notify' });
    await channelClient.ready;

    const order: string[] = [];
    channelClient.onNotify('progress', (args) => {
      order.push(`a:${(args as { p: number }).p}`);
    });
    channelClient.onNotify('progress', (args) => {
      order.push(`b:${(args as { p: number }).p}`);
    });

    channel.port1.postMessage({ v: 1, k: 'nt', n: 'progress', a: { p: 50 } });
    await flushMicrotasks();

    expect(order).toEqual(['a:50', 'b:50']);
    void serverNotify;
  });

  it('should let a single unsubscribe stop only that handler', async () => {
    const { server, client } = startPair(channel);

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'notify',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'notify' });
    await channelClient.ready;

    const fired: string[] = [];
    const offA = channelClient.onNotify('tick', () => {
      fired.push('a');
    });
    channelClient.onNotify('tick', () => {
      fired.push('b');
    });

    channel.port1.postMessage({ v: 1, k: 'nt', n: 'tick', a: null });
    await flushMicrotasks();
    expect(fired).toEqual(['a', 'b']);

    offA();
    channel.port1.postMessage({ v: 1, k: 'nt', n: 'tick', a: null });
    await flushMicrotasks();
    expect(fired).toEqual(['a', 'b', 'b']);
  });

  it('should not allocate a correlation id slot for notify (subsequent call still resolves)', async () => {
    const { server, client } = startPair(channel);

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'notify',
      impl: {
        call: async (_context, name) => {
          if (name === 'echo') {
            return 'echoed';
          }
          throw new Error(`unknown: ${name}`);
        },
        async *listen() {
          yield 0;
        },
        notify: () => undefined,
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'notify' });
    await channelClient.ready;

    for (let index = 0; index < 5; index += 1) {
      channelClient.notify('many', { index });
    }
    const result = await channelClient.call('echo');
    expect(result).toBe('echoed');
  });

  it('should swallow handler errors so other handlers still run', async () => {
    const { server, client } = startPair(channel);

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'notify',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'notify' });
    await channelClient.ready;

    let secondFired = false;
    channelClient.onNotify('boom', () => {
      throw new Error('first handler');
    });
    channelClient.onNotify('boom', () => {
      secondFired = true;
    });

    channel.port1.postMessage({ v: 1, k: 'nt', n: 'boom', a: null });
    await flushMicrotasks();
    expect(secondFired).toBe(true);
  });

  it('should round-trip a server-emitted notify to the client onNotify handler (Phase 6a)', async () => {
    const { server, client } = startPair(channel);

    const serverApi = createChannelServer({
      port: server,
      sessionKey: 'notify',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    serverHandle = serverApi;
    const channelClient = createChannelClient({ port: client, sessionKey: 'notify' });
    await channelClient.ready;

    const seen: Array<{ phase: string; pct: number }> = [];
    channelClient.onNotify('progress', (args) => {
      seen.push(args as { phase: string; pct: number });
    });

    serverApi.notify('progress', { phase: 'render', pct: 25 });
    serverApi.notify('progress', { phase: 'render', pct: 100 });
    await flushMicrotasks();

    expect(seen).toEqual([
      { phase: 'render', pct: 25 },
      { phase: 'render', pct: 100 },
    ]);
  });

  it('should hoist transferables out of server-emitted notify args (Phase 6a)', async () => {
    const observed: ObservedFrame[] = [];
    const { server: rawServer, client } = startPair(channel);
    const recordingServer = wrapRecording(rawServer, observed);

    const serverApi = createChannelServer({
      port: recordingServer,
      sessionKey: 'notify',
      impl: {
        call: async () => 0,
        async *listen() {
          yield 0;
        },
      },
    });
    serverHandle = serverApi;
    const channelClient = createChannelClient({ port: client, sessionKey: 'notify' });
    await channelClient.ready;

    const bytes = new Uint8Array(8);
    bytes.set([9, 8, 7, 6, 5, 4, 3, 2]);
    const payload: WithTransferables<{ bytes: Uint8Array<ArrayBuffer> }> = {
      value: { bytes },
      transferables: [bytes.buffer],
    };

    serverApi.notify('geometry', payload);
    await flushMicrotasks();

    const ntFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'nt');
    expect(ntFrame).toBeDefined();
    expect(ntFrame!.transferables?.length).toBe(1);
    expect(bytes.buffer.byteLength).toBe(0);
  });

  it('should drop server-side notify errors to keep the channel alive', async () => {
    const { server, client } = startPair(channel);

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'notify',
      impl: {
        call: async (_context, name) => {
          if (name === 'ping') {
            return 'pong';
          }
          throw new Error(`unknown: ${name}`);
        },
        async *listen() {
          yield 0;
        },
        notify: () => {
          throw new Error('server notify boom');
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'notify' });
    await channelClient.ready;

    channelClient.notify('any', null);
    await flushMicrotasks();
    const result = await channelClient.call('ping');
    expect(result).toBe('pong');
  });
});
