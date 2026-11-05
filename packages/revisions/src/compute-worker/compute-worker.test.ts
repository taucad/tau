import { inflateSync } from 'node:zlib';
import { MessageChannel } from 'node:worker_threads';
import type { Transferable as NodeTransferable } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { connectComputeWorker, createInlineCompute, serveComputeWorker } from '#compute-worker/compute-worker.js';
import type { ComputePort } from '#compute-worker/compute-worker.js';
import { readPackIndex } from '#pack-reader/pack-index.js';
import { buildPack } from '#object-store/pack-writer.js';
import { digestHex } from '#object-hash.js';

const encoder = new TextEncoder();
const channels: MessageChannel[] = [];

afterEach(() => {
  for (const channel of channels.splice(0)) {
    channel.port1.close();
    channel.port2.close();
  }
});

/* Node's ports speak `on('message')`; the seam takes the DOM shape. */
const domPort = (port: MessageChannel['port1']): ComputePort => ({
  postMessage: (message, transfer) => {
    port.postMessage(message, transfer as unknown as readonly NodeTransferable[]);
  },
  addEventListener: (_type, listener) => {
    port.on('message', (data: unknown) => {
      listener({ data } as MessageEvent);
    });
  },
});

describe('the compute worker seam', () => {
  it('answers inflate, deflate, SHA-1 and pack indexing across a port, as it does inline', async () => {
    const channel = new MessageChannel();
    channels.push(channel);
    serveComputeWorker(domPort(channel.port2));
    const remote = connectComputeWorker(domPort(channel.port1));
    const inline = createInlineCompute();
    const body = encoder.encode('cube(1);\n'.repeat(64));

    /* Each call hands its buffer over, so each gets its own copy. */
    const deflated = await remote.deflate(new Uint8Array(body));
    expect(new Uint8Array(inflateSync(deflated))).toStrictEqual(body);
    expect(await remote.inflate(new Uint8Array(deflated))).toStrictEqual(body);
    expect(await remote.sha1(new Uint8Array(body))).toBe(digestHex('sha1', body));
    expect(await inline.sha1(body)).toBe(digestHex('sha1', body));

    const oid = digestHex('sha1', new Uint8Array([...encoder.encode(`blob ${String(body.byteLength)}\0`), ...body]));
    const built = await buildPack([{ oid, type: 'blob', data: body }], inline);
    const packIndex = readPackIndex(await remote.indexPack(new Uint8Array(built.pack)));
    expect(packIndex.packChecksum).toBe(built.checksum);
    expect(packIndex.offsetOf(built.entries[0]!.oid)).toBe(12);
  });

  it('carries a failure back as a rejection', async () => {
    const channel = new MessageChannel();
    channels.push(channel);
    serveComputeWorker(domPort(channel.port2));
    const remote = connectComputeWorker(domPort(channel.port1));

    await expect(remote.inflate(encoder.encode('not zlib'))).rejects.toThrow();
  });
});
