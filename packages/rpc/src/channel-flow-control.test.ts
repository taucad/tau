import { MessageChannel } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Port } from '#port.js';
import { createChannelClient, createChannelServer, wrapMessagePort } from '#index.js';

type ObservedFrame = { readonly data: unknown; readonly transferables: readonly Transferable[] | undefined };

const startPair = (channel: MessageChannel): { server: Port<unknown>; client: Port<unknown> } => {
  const server = wrapMessagePort<unknown>(channel.port1, { label: 'flow-server' });
  const client = wrapMessagePort<unknown>(channel.port2, { label: 'flow-client' });
  server.start?.();
  client.start?.();
  return { server, client };
};

const record = (port: Port<unknown>, frames: ObservedFrame[]): Port<unknown> => ({
  postMessage(data, transferables) {
    frames.push({ data, transferables });
    port.postMessage(data, transferables);
  },
  onMessage(handler) {
    return port.onMessage(handler);
  },
  ...(port.onClose
    ? {
        onClose(handler: () => void) {
          return port.onClose!(handler);
        },
      }
    : {}),
  ...(port.start
    ? {
        start() {
          port.start!();
        },
      }
    : {}),
  close() {
    port.close();
  },
});

const flushTicks = async (count = 4): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each tick deliberately advances the channel independently.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

describe('channel stream flow control', () => {
  let channel: MessageChannel;
  let serverHandle: ReturnType<typeof createChannelServer> | undefined;

  beforeEach(() => {
    channel = new MessageChannel();
  });

  afterEach(() => {
    serverHandle?.dispose();
    channel.port1.close();
    channel.port2.close();
  });

  it('pulls only within the initial window and replenishes after consumer handoff', async () => {
    const clientFrames: ObservedFrame[] = [];
    const { server, client } = startPair(channel);
    let produced = 0;
    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'credits',
      streamFlowControl: { initialCredits: 2, maxFrameBytes: 64, maxOwnedBytes: 128 },
      impl: {
        call: async () => null,
        async *listen() {
          for (let index = 0; index < 4; index += 1) {
            produced += 1;
            yield index;
          }
        },
      },
    });
    const clientChannel = createChannelClient({
      port: record(client, clientFrames),
      sessionKey: 'credits',
      streamFlowControl: { initialCredits: 2, maxFrameBytes: 64, maxOwnedBytes: 128 },
    });
    await clientChannel.ready;

    const iterator = clientChannel.listen('values')[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 0 });
    await flushTicks();
    expect(produced).toBe(2);

    await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
    await flushTicks();
    expect(produced).toBe(3);
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 3 });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });

    const kinds = clientFrames.map(({ data }) => (data as { k?: unknown }).k);
    expect(kinds).toContain('fw');
    expect(kinds).toContain('fa');
  });

  it('reserves owned-byte capacity before pulling another producer value', async () => {
    const { server, client } = startPair(channel);
    let produced = 0;
    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'bytes',
      streamFlowControl: { initialCredits: 3, maxFrameBytes: 6, maxOwnedBytes: 10 },
      impl: {
        call: async () => null,
        async *listen() {
          for (let index = 0; index < 3; index += 1) {
            produced += 1;
            yield new Uint8Array(6).fill(index);
          }
        },
      },
    });
    const clientChannel = createChannelClient({
      port: client,
      sessionKey: 'bytes',
      streamFlowControl: { initialCredits: 3, maxFrameBytes: 6, maxOwnedBytes: 10 },
    });
    await clientChannel.ready;

    const iterator = clientChannel.listen('values')[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await flushTicks();
    expect(produced).toBe(1);
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await flushTicks();
    expect(produced).toBe(2);
    await iterator.return?.();
  });

  const unicodeFrames = [
    { label: 'ascii', value: 'abcde', bytes: 5 },
    { label: 'BMP', value: 'éΩ漢', bytes: 7 },
    { label: 'astral pair', value: '😀', bytes: 4 },
    { label: 'lone high surrogate', value: '\uD800', bytes: 3 },
    { label: 'lone low surrogate', value: '\uDFFF', bytes: 3 },
    { label: 'reversed surrogate pair', value: '\uDFFF\uD800', bytes: 6 },
    { label: 'valid pair between stray surrogates', value: '\uD800\uD800\uDFFF\uDFFF', bytes: 10 },
    { label: 'mixed', value: 'Aé😀\uD800Z', bytes: 11 },
  ];

  it.each(unicodeFrames)(
    'preserves exact UTF-8 ownership and slow-consumer release for $label',
    async ({ value, bytes }) => {
      const { server, client } = startPair(channel);
      let produced = 0;
      const streamFlowControl = { initialCredits: 2, maxFrameBytes: bytes, maxOwnedBytes: bytes };
      serverHandle = createChannelServer({
        port: server,
        sessionKey: 'unicode-owned',
        streamFlowControl,
        impl: {
          call: async () => null,
          async *listen() {
            for (let index = 0; index < 3; index += 1) {
              produced++;
              yield value;
            }
          },
        },
      });
      const clientChannel = createChannelClient({ port: client, sessionKey: 'unicode-owned', streamFlowControl });
      await clientChannel.ready;
      const iterator = clientChannel.listen('values')[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toEqual({ done: false, value });
      await flushTicks();
      expect(produced).toBe(1);
      // Requesting the next item relinquishes the first value's exact owned-byte charge.
      await expect(iterator.next()).resolves.toEqual({ done: false, value });
      await flushTicks();
      expect(produced).toBe(2);
      await expect(iterator.next()).resolves.toEqual({ done: false, value });
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    },
  );

  it.each(unicodeFrames)('refuses one UTF-8 byte beyond the exact $label frame boundary', async ({ value, bytes }) => {
    const { server, client } = startPair(channel);
    const streamFlowControl = { initialCredits: 1, maxFrameBytes: bytes, maxOwnedBytes: bytes * 2 };
    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'unicode-refusal',
      streamFlowControl,
      impl: {
        call: async () => null,
        async *listen() {
          yield value + 'x';
        },
      },
    });
    const clientChannel = createChannelClient({ port: client, sessionKey: 'unicode-refusal', streamFlowControl });
    await clientChannel.ready;
    const iterator = clientChannel.listen('values')[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow(`stream frame exceeds ${String(bytes)} bytes`);
  });

  it('accounts for Unicode strings, object keys and RegExp without allocating encoded payload copies', async () => {
    const { server, client } = startPair(channel);
    const key = 'rpc-Ω😀';
    const mixed = 'Aé😀\uD800Z';
    const pattern = new RegExp('Ω😀', 'u');
    const value = { [key]: mixed, pattern };
    // 10 key +11 value +7 pattern key +7 RegExp source/flags =35 owned bytes.
    const streamFlowControl = { initialCredits: 1, maxFrameBytes: 35, maxOwnedBytes: 35 };
    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'unicode-allocation',
      streamFlowControl,
      impl: {
        call: async () => null,
        async *listen() {
          yield value;
          yield { ...value, pattern: new RegExp('Ω😀', 'gu') };
        },
      },
    });
    const clientChannel = createChannelClient({ port: client, sessionKey: 'unicode-allocation', streamFlowControl });
    await clientChannel.ready;
    const payloadStrings = new Set([key, mixed, 'pattern', pattern.source + pattern.flags]);
    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    try {
      const iterator = clientChannel.listen('values')[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toEqual({ done: false, value });
      // The extra ASCII RegExp flag is exactly one owned byte beyond the same boundary.
      await expect(iterator.next()).rejects.toThrow('stream frame exceeds 35 bytes');
      const encodedCopies = encode.mock.calls.filter(([input]) => input !== undefined && payloadStrings.has(input));
      expect(encodedCopies).toHaveLength(0);
    } finally {
      encode.mockRestore();
    }
  });

  it('rejects a producer frame larger than the configured frame maximum', async () => {
    const { server, client } = startPair(channel);
    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'oversized',
      streamFlowControl: { initialCredits: 1, maxFrameBytes: 8, maxOwnedBytes: 16 },
      impl: {
        call: async () => null,
        async *listen() {
          yield new Uint8Array(9);
        },
      },
    });
    const clientChannel = createChannelClient({
      port: client,
      sessionKey: 'oversized',
      streamFlowControl: { initialCredits: 1, maxFrameBytes: 8, maxOwnedBytes: 16 },
    });
    await clientChannel.ready;

    const iterator = clientChannel.listen('values')[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow(/stream frame exceeds 8 bytes/);
  });

  it('bounds a malicious peer that emits beyond the granted owned-byte budget', async () => {
    const clientFrames: ObservedFrame[] = [];
    const { server, client } = startPair(channel);
    server.onMessage((raw) => {
      const frame = raw as { readonly k?: string; readonly i?: string };
      if (frame.k !== 'ss' || !frame.i) {
        return;
      }
      server.postMessage({ v: 1, k: 'sn', i: frame.i, d: new Uint8Array(6) });
      server.postMessage({ v: 1, k: 'sn', i: frame.i, d: new Uint8Array(6) });
    });
    server.postMessage({ v: 1, k: 'lh', o: 1 });
    const clientChannel = createChannelClient({
      port: record(client, clientFrames),
      sessionKey: 'malicious',
      streamFlowControl: { initialCredits: 2, maxFrameBytes: 6, maxOwnedBytes: 10 },
    });
    await clientChannel.ready;

    const iterator = clientChannel.listen('values')[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    await flushTicks();
    await expect(iterator.next()).rejects.toThrow(/owned-byte budget/);
    expect(clientFrames.some(({ data }) => (data as { k?: unknown }).k === 'su')).toBe(true);
  });

  it('rejects a peer that emits more frames than the explicit window grants', async () => {
    const { server, client } = startPair(channel);
    server.onMessage((raw) => {
      const frame = raw as { readonly k?: string; readonly i?: string };
      if (frame.k !== 'ss' || !frame.i) {
        return;
      }
      server.postMessage({ v: 1, k: 'sn', i: frame.i, d: 1 });
      server.postMessage({ v: 1, k: 'sn', i: frame.i, d: 2 });
    });
    server.postMessage({ v: 1, k: 'lh', o: 1 });
    const clientChannel = createChannelClient({
      port: client,
      sessionKey: 'credit-overrun',
      streamFlowControl: { initialCredits: 1, maxFrameBytes: 8, maxOwnedBytes: 16 },
    });
    await clientChannel.ready;

    const iterator = clientChannel.listen('values')[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
    await flushTicks();
    await expect(iterator.next()).rejects.toThrow(/granted frame window/);
  });

  it('accounts for binary payloads nested in structured-clone collections', async () => {
    const { server, client } = startPair(channel);
    server.onMessage((raw) => {
      const frame = raw as { readonly k?: string; readonly i?: string };
      if (frame.k === 'ss' && frame.i) {
        server.postMessage({ v: 1, k: 'sn', i: frame.i, d: new Map([['mesh', new Uint8Array(9)]]) });
      }
    });
    server.postMessage({ v: 1, k: 'lh', o: 1 });
    const clientChannel = createChannelClient({
      port: client,
      sessionKey: 'structured-clone-bytes',
      streamFlowControl: { initialCredits: 1, maxFrameBytes: 8, maxOwnedBytes: 16 },
    });
    await clientChannel.ready;

    const iterator = clientChannel.listen('values')[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow(/stream frame exceeds 8 bytes/);
  });

  it.each([
    { initialCredits: 0 },
    { initialCredits: 1.5 },
    { maxFrameBytes: 0 },
    { maxOwnedBytes: 0 },
    { maxFrameBytes: 9, maxOwnedBytes: 8 },
  ])('rejects invalid stream bounds at channel construction: %o', (streamFlowControl) => {
    const { client } = startPair(channel);
    expect(() => createChannelClient({ port: client, sessionKey: 'invalid', streamFlowControl })).toThrow(
      /streamFlowControl/,
    );
  });
});
