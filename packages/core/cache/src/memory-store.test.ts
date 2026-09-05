import { describe, expect, it } from 'vitest';

import { digestContent } from '#digest.js';
import { createMemoryActionStore, createMemoryContentStore } from '#memory-store.js';
import type { ComputeActionRecord } from '#store.js';

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(values);

describe('memory content store', () => {
  it('defensively copies writes and reads', async () => {
    const store = createMemoryContentStore({ maxBytes: 32 });
    const source = bytes(1, 2, 3);
    const digest = await digestContent({ bytes: source });
    await store.write({ digest, bytes: source });
    source[0] = 9;

    const first = await store.read({ digest });
    expect(first).toEqual({ status: 'hit', bytes: bytes(1, 2, 3) });
    if (first.status === 'hit') {
      first.bytes[1] = 9;
    }

    await expect(store.read({ digest })).resolves.toEqual({
      status: 'hit',
      bytes: bytes(1, 2, 3),
    });
  });

  it('evicts least-recently-used bytes without exceeding the byte budget', async () => {
    const store = createMemoryContentStore({ maxBytes: 4 });
    const firstBytes = bytes(1, 2);
    const secondBytes = bytes(3, 4);
    const thirdBytes = bytes(5, 6);
    const firstDigest = await digestContent({ bytes: firstBytes });
    const secondDigest = await digestContent({ bytes: secondBytes });
    const thirdDigest = await digestContent({ bytes: thirdBytes });
    await store.write({ digest: firstDigest, bytes: firstBytes });
    await store.write({ digest: secondDigest, bytes: secondBytes });
    await store.read({ digest: firstDigest });
    await store.write({ digest: thirdDigest, bytes: thirdBytes });

    await expect(store.read({ digest: secondDigest })).resolves.toEqual({ status: 'miss' });
    await expect(store.read({ digest: firstDigest })).resolves.toMatchObject({ status: 'hit' });
    await expect(store.maintenance.inspect({})).resolves.toMatchObject({
      status: 'supported',
      statistics: { entries: 2, bytes: 4, evictions: 1 },
    });
  });

  it('rejects entries larger than its byte budget', async () => {
    const store = createMemoryContentStore({ maxBytes: 2 });
    const value = bytes(1, 2, 3);
    const digest = await digestContent({ bytes: value });

    await expect(store.write({ digest, bytes: value })).resolves.toEqual({
      status: 'rejected',
      reason: 'entry-too-large',
    });
  });
});

describe('memory action store', () => {
  it('defensively copies records and rejects conflicting publication', async () => {
    const store = createMemoryActionStore({ maxBytes: 4096 });
    const digest = `sha256:${'1'.repeat(64)}` as ComputeActionRecord['actionDigest'];
    const content = `sha256:${'2'.repeat(64)}` as ComputeActionRecord['output']['digest'];
    const record: ComputeActionRecord = {
      schemaVersion: 1,
      actionDigest: digest,
      codec: { id: 'test', version: '1' },
      output: { digest: content, size: 3, mediaType: 'application/test' },
      dependencies: [],
    };
    await store.publish({ record });
    (record.output as { mediaType: string }).mediaType = 'mutated';

    const stored = await store.read({ digest });
    expect(stored.status).toBe('hit');
    if (stored.status === 'hit') {
      expect(stored.record.output.mediaType).toBe('application/test');
    }

    await expect(store.publish({ record: { ...record, output: { ...record.output, size: 4 } } })).rejects.toThrow(
      'conflicting',
    );
  });

  it('bounds individual records independently from the total LRU budget', async () => {
    const store = createMemoryActionStore({ maxBytes: 4096, maxEntryBytes: 256 });
    const digest = `sha256:${'3'.repeat(64)}` as ComputeActionRecord['actionDigest'];
    const content = `sha256:${'4'.repeat(64)}` as ComputeActionRecord['output']['digest'];
    const record: ComputeActionRecord = {
      schemaVersion: 1,
      actionDigest: digest,
      codec: { id: 'x'.repeat(512), version: '1' },
      output: { digest: content, size: 3, mediaType: 'application/test' },
      dependencies: [],
    };

    await expect(store.publish({ record })).resolves.toEqual({
      status: 'rejected',
      reason: 'entry-too-large',
    });
    await expect(store.read({ digest })).resolves.toEqual({ status: 'miss' });
  });
});
