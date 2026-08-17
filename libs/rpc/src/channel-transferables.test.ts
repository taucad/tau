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

const expectAnyUint8Array = (): unknown => expect.any(Uint8Array);
const expectAnything = (): unknown => expect.anything();

describe('@taucad/rpc Channel transferables', () => {
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

  it('hoists transferables out of call args onto port.postMessage', async () => {
    const observed: ObservedFrame[] = [];
    const { server, client: rawClient } = startPair(channel);
    const recordingClient = wrapRecording(rawClient, observed);

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'transferables',
      impl: {
        call: async (_context, name, args) => {
          if (name === 'echo-bytes') {
            return (args as { bytes: Uint8Array<ArrayBuffer> }).bytes.byteLength;
          }
          throw new Error(`unknown: ${name}`);
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const channelClient = createChannelClient({ port: recordingClient, sessionKey: 'transferables' });

    const bytes = new Uint8Array(8);
    bytes.set([1, 2, 3, 4, 5, 6, 7, 8]);
    const payload: WithTransferables<{ bytes: Uint8Array<ArrayBuffer> }> = {
      value: { bytes },
      transferables: [bytes.buffer],
    };

    const length = await channelClient.call('echo-bytes', payload);
    expect(length).toBe(8);

    const callFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'rq');
    expect(callFrame).toBeDefined();
    expect(callFrame!.transferables).toEqual([bytes.buffer]);
    expect(callFrame!.data).toMatchObject({ v: 1, k: 'rq', n: 'echo-bytes', a: { bytes: expectAnyUint8Array() } });
    expect((callFrame!.data as { a: unknown }).a).not.toMatchObject({ transferables: expectAnything() });

    expect(bytes.buffer.byteLength).toBe(0);
  });

  it('hoists transferables out of server call return onto port.postMessage', async () => {
    const observed: ObservedFrame[] = [];
    const { server: rawServer, client } = startPair(channel);
    const recordingServer = wrapRecording(rawServer, observed);

    serverHandle = createChannelServer({
      port: recordingServer,
      sessionKey: 'transferables',
      impl: {
        call: async (_context, name) => {
          if (name === 'make-bytes') {
            const bytes = new Uint8Array(16);
            bytes.set([10, 20, 30, 40]);
            const result: WithTransferables<{ bytes: Uint8Array<ArrayBuffer> }> = {
              value: { bytes },
              transferables: [bytes.buffer],
            };
            return result;
          }
          throw new Error(`unknown: ${name}`);
        },
        async *listen() {
          yield 0;
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'transferables' });

    const result = (await channelClient.call('make-bytes')) as { bytes: Uint8Array<ArrayBuffer> };
    expect(result.bytes.byteLength).toBe(16);
    expect(result.bytes[0]).toBe(10);

    const returnFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'rs');
    expect(returnFrame).toBeDefined();
    expect(returnFrame!.transferables?.length).toBe(1);
    expect(returnFrame!.data).toMatchObject({ v: 1, k: 'rs', o: 1, d: { bytes: expectAnyUint8Array() } });
    expect((returnFrame!.data as { d: unknown }).d).not.toMatchObject({ transferables: expectAnything() });
  });

  it('hoists transferables out of listen-push items onto port.postMessage', async () => {
    const observed: ObservedFrame[] = [];
    const { server: rawServer, client } = startPair(channel);
    const recordingServer = wrapRecording(rawServer, observed);

    serverHandle = createChannelServer({
      port: recordingServer,
      sessionKey: 'transferables',
      impl: {
        call: async () => {
          throw new Error('not implemented');
        },
        async *listen(_context, event) {
          if (event === 'binary-stream') {
            for (let index = 0; index < 2; index += 1) {
              const bytes = new Uint8Array(4);
              bytes[0] = index;
              const item: WithTransferables<{ bytes: Uint8Array<ArrayBuffer>; index: number }> = {
                value: { bytes, index },
                transferables: [bytes.buffer],
              };
              yield item;
            }
            return;
          }
          throw new Error(`unknown: ${event}`);
        },
      },
    });
    const channelClient = createChannelClient({ port: client, sessionKey: 'transferables' });

    const collected: Array<{ bytes: Uint8Array<ArrayBuffer>; index: number }> = [];
    for await (const value of channelClient.listen('binary-stream')) {
      collected.push(value as { bytes: Uint8Array<ArrayBuffer>; index: number });
      if (collected.length === 2) {
        break;
      }
    }
    expect(collected.length).toBe(2);
    expect(collected[0]!.index).toBe(0);
    expect(collected[1]!.index).toBe(1);
    expect(collected[0]!.bytes).toBeInstanceOf(Uint8Array);

    const pushFrames = observed.filter((frame) => (frame.data as { k?: unknown }).k === 'sn');
    expect(pushFrames.length).toBe(2);
    for (const frame of pushFrames) {
      expect(frame.transferables?.length).toBe(1);
      expect((frame.data as { d: unknown }).d).not.toMatchObject({ transferables: expectAnything() });
    }
  });

  it('does not pass a transfer list when the payload has no transferables envelope', async () => {
    const observed: ObservedFrame[] = [];
    const { server, client: rawClient } = startPair(channel);
    const recordingClient = wrapRecording(rawClient, observed);

    serverHandle = createChannelServer({
      port: server,
      sessionKey: 'plain',
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
    const channelClient = createChannelClient({ port: recordingClient, sessionKey: 'plain' });

    const sum = await channelClient.call('add', { a: 2, b: 3 });
    expect(sum).toBe(5);

    const callFrame = observed.find((frame) => (frame.data as { k?: unknown }).k === 'rq');
    expect(callFrame).toBeDefined();
    expect(callFrame!.transferables).toBeUndefined();
  });
});
