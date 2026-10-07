import { describe, expect, it, vi } from 'vitest';
import {
  CacheCorruptionError,
  contentDigest,
  createComputeReuseService,
  createMemoryActionStore,
  createMemoryContentStore,
  digestAction,
  digestContent,
} from '@taucad/cache-core';
import type { CacheCodec, ComputeAction, ContentStore, EncodedContent } from '@taucad/cache-core';
import { runCacheCodecConformance } from '@taucad/cache-core/testing';
import { ownEncodedContent } from '#encoded-content.js';

const codec: CacheCodec<Uint8Array<ArrayBuffer>> = {
  id: 'shared-test',
  version: '1',
  mediaType: 'application/json',
  encode: async ({ value }) => ({
    bytes: new TextEncoder().encode(await digestContent({ bytes: value })),
    content: [value, value, new Uint8Array(value)],
  }),
  decode: async ({ bytes, readContent }) => {
    const digest = contentDigest({ value: new TextDecoder().decode(bytes) });
    const leaf = await readContent?.({ digest });
    if (leaf === undefined || (await digestContent({ bytes: leaf })) !== digest) {
      throw new Error('Missing or mismatched leaf.');
    }
    return leaf;
  },
};
const action: ComputeAction = {
  schemaVersion: 1,
  namespace: 'shared-test',
  producer: { id: 'test', version: '1', implementationAssets: [] },
  operation: 'encode',
  inputs: [],
  arguments: null,
  environment: null,
  codec: { id: codec.id, version: codec.version },
};
const value = (): Uint8Array<ArrayBuffer> => new Uint8Array([1, 2, 3]);

describe('shared content codec publication', () => {
  it('keeps verified root bytes when a store mutates its returned buffer during a leaf read', async () => {
    const contentStore = createMemoryContentStore({ maxBytes: 4096 });
    const actionStore = createMemoryActionStore({ maxBytes: 4096 });
    const compute = vi.fn(async () => value());
    await createComputeReuseService({ contentStore, actionStore }).evaluate({
      action,
      codec,
      compute,
      policy: 'best-effort',
    });
    const leafDigest = await digestContent({ bytes: value() });
    let returnedRoot: Uint8Array<ArrayBuffer> | undefined;
    const retainingStore: ContentStore = {
      ...contentStore,
      read: async (input) => {
        const result = await contentStore.read(input);
        if (result.status === 'hit') {
          if (input.digest === leafDigest) {
            returnedRoot?.fill(0);
          } else {
            returnedRoot = result.bytes;
          }
        }
        return result;
      },
    };
    const restored = await createComputeReuseService({ contentStore: retainingStore, actionStore }).evaluate({
      action,
      codec,
      compute,
      policy: 'best-effort',
    });
    expect(restored).toMatchObject({ source: 'cache', value: value() });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(returnedRoot).toEqual(new Uint8Array(71));
  });

  it('stops hashing the closure after cancellation', async () => {
    const controller = new AbortController();
    const actualDigest = crypto.subtle.digest.bind(crypto.subtle);
    const hash = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
      const digest = await actualDigest(algorithm, data);
      controller.abort(new Error('cancelled hashing'));
      return digest;
    });
    try {
      await expect(
        ownEncodedContent({ bytes: new Uint8Array([9]), content: [value(), new Uint8Array([4])] }, controller.signal),
      ).rejects.toThrow('cancelled hashing');
      expect(hash).toHaveBeenCalledTimes(1);
    } finally {
      hash.mockRestore();
    }
  });

  it('refuses excessive transient ownership before hashing or cloning the parts', async () => {
    const hash = vi.spyOn(crypto.subtle, 'digest');
    try {
      await expect(
        ownEncodedContent(
          { bytes: new Uint8Array([9]), content: [new Uint8Array(32 * 1024 * 1024), new Uint8Array(32 * 1024 * 1024)] },
          new AbortController().signal,
        ),
      ).rejects.toThrow('transient ownership budget');
      expect(hash).not.toHaveBeenCalled();
    } finally {
      hash.mockRestore();
    }
  });

  it('owns aliased ranges once and hashes each unique range once', async () => {
    const source = value();
    const hash = vi.spyOn(crypto.subtle, 'digest');
    try {
      const owned = await ownEncodedContent(
        {
          bytes: new Uint8Array([9]),
          content: Array.from(
            { length: 100 },
            () => new Uint8Array(source.buffer, source.byteOffset, source.byteLength),
          ),
        },
        new AbortController().signal,
      );
      expect(hash).toHaveBeenCalledTimes(2);
      source.fill(0);
      expect([...owned.content.values()]).toEqual([value()]);
    } finally {
      hash.mockRestore();
    }
  });

  it('restores an explicitly supplied leaf identical to the root without a storage cycle', async () => {
    const contentStore = createMemoryContentStore({ maxBytes: 4096 });
    const actionStore = createMemoryActionStore({ maxBytes: 4096 });
    const selfCodec: CacheCodec<Uint8Array<ArrayBuffer>> = {
      ...codec,
      encode: ({ value: bytes }) => ({ bytes, content: [bytes] }),
      decode: async ({ bytes, readContent }) => {
        const leaf = await readContent?.({ digest: await digestContent({ bytes }) });
        if (leaf === undefined) {
          throw new Error('Missing root leaf.');
        }
        return leaf;
      },
    };
    const service = createComputeReuseService({ contentStore, actionStore });
    await service.evaluate({ action, codec: selfCodec, compute: async () => value(), policy: 'best-effort' });
    expect(
      await service.evaluate({ action, codec: selfCodec, compute: async () => value(), policy: 'best-effort' }),
    ).toMatchObject({ source: 'cache', value: value() });
    expect(await contentStore.maintenance.inspect({})).toMatchObject({ statistics: { entries: 1, bytes: 3 } });
    const stored = await actionStore.read({ digest: await digestAction({ action }) });
    expect(stored.status === 'hit' && stored.record.requiredContent).toBeUndefined();
    await runCacheCodecConformance({
      codec: selfCodec,
      samples: [value()],
      equal: ({ actual, expected }) => actual.every((byte, index) => byte === expected[index]),
    });
  });

  it.each(['malformed', 'oversized'] as const)('rejects %s parts before writing any content', async (fault) => {
    const contentStore = createMemoryContentStore({ maxBytes: 4096 });
    const actionStore = createMemoryActionStore({ maxBytes: 4096 });
    const write = vi.spyOn(contentStore, 'write');
    const parts: EncodedContent = { bytes: new Uint8Array([0]), content: [] };
    if (fault === 'malformed') {
      Reflect.set(parts, 'content', ['not bytes']);
    } else {
      Reflect.set(parts, 'content', [new Uint8Array(64 * 1024 * 1024 + 1)]);
    }
    const usedCodec: CacheCodec<Uint8Array<ArrayBuffer>> = { ...codec, encode: () => parts };
    const service = createComputeReuseService({ contentStore, actionStore });
    expect(
      await service.evaluate({ action, codec: usedCodec, compute: async () => value(), policy: 'best-effort' }),
    ).toMatchObject({ publication: { status: 'skipped', reason: 'encode-failed' } });
    expect(write).not.toHaveBeenCalled();
  });

  it('cancels leaf publication before committing the action', async () => {
    const controller = new AbortController();
    const contentStore = createMemoryContentStore({ maxBytes: 4096 });
    const actionStore = createMemoryActionStore({ maxBytes: 4096 });
    const publish = vi.spyOn(actionStore, 'publish');
    const interrupted: ContentStore = {
      ...contentStore,
      write: async (input) => {
        const written = await contentStore.write(input);
        controller.abort(new Error('cancelled publication'));
        return written;
      },
    };
    const service = createComputeReuseService({ contentStore: interrupted, actionStore });
    await expect(
      service.evaluate({
        action,
        codec,
        compute: async () => value(),
        policy: 'best-effort',
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled publication');
    expect(publish).not.toHaveBeenCalled();
  });

  it('deduplicates leaves, owns bytes, and restores through a fresh service', async () => {
    const contentStore = createMemoryContentStore({ maxBytes: 4096 });
    const actionStore = createMemoryActionStore({ maxBytes: 4096 });
    const compute = vi.fn(async () => value());
    const service = createComputeReuseService({ contentStore, actionStore });
    const cold = await service.evaluate({ action, codec, compute, policy: 'best-effort' });
    const stored = await actionStore.read({ digest: await digestAction({ action }) });
    expect(stored.status).toBe('hit');
    if (stored.status !== 'hit') {
      expect.fail('Missing action record.');
    }
    expect(stored.record.requiredContent).toEqual([await digestContent({ bytes: value() })]);
    expect(stored.record.dependencies).toEqual([]);
    expect(await contentStore.maintenance.inspect({})).toMatchObject({ statistics: { entries: 2, bytes: 74 } });
    cold.value.fill(99);
    const fresh = createComputeReuseService({ contentStore, actionStore });
    const restored = await fresh.evaluate({ action, codec, compute, policy: 'best-effort' });
    expect(restored).toMatchObject({ source: 'cache', value: value() });
    restored.value.fill(88);
    const repeated = await fresh.evaluate({ action, codec, compute, policy: 'best-effort' });
    expect(repeated.value).toEqual(value());
    expect(compute).toHaveBeenCalledTimes(1);
    await runCacheCodecConformance({
      codec,
      samples: [value()],
      equal: ({ actual, expected }) =>
        actual.length === expected.length && actual.every((byte, index) => byte === expected[index]),
    });
  });

  it.each(['missing', 'corrupt', 'undeclared'] as const)(
    'refuses a %s leaf without publishing a cache hit',
    async (fault) => {
      const contentStore = createMemoryContentStore({ maxBytes: 4096 });
      const actionStore = createMemoryActionStore({ maxBytes: 4096 });
      const service = createComputeReuseService({ contentStore, actionStore });
      await service.evaluate({ action, codec, compute: async () => value(), policy: 'best-effort' });
      const leafDigest = await digestContent({ bytes: value() });
      const faultStore: ContentStore = {
        ...contentStore,
        read: async (input) =>
          input.digest === leafDigest
            ? fault === 'missing'
              ? { status: 'miss' }
              : { status: 'hit', bytes: new Uint8Array([99]) }
            : contentStore.read(input),
      };
      const usedCodec: CacheCodec<Uint8Array<ArrayBuffer>> =
        fault === 'undeclared'
          ? {
              ...codec,
              decode: async ({ readContent }) => {
                const absent = await digestContent({ bytes: new Uint8Array([9]) });
                return (await readContent?.({ digest: absent })) ?? value();
              },
            }
          : codec;
      const fresh = createComputeReuseService({
        contentStore: fault === 'undeclared' ? contentStore : faultStore,
        actionStore,
        promote: async () => ({ status: 'no-durable-storage' }),
      });
      await expect(
        fresh.evaluate({ action, codec: usedCodec, compute: async () => value(), policy: 'best-effort' }),
      ).resolves.toMatchObject({ source: 'computed' });
    },
  );

  it('never commits an incomplete closure when a bounded store evicts an earlier leaf', async () => {
    const contentStore = createMemoryContentStore({ maxBytes: 72 });
    const actionStore = createMemoryActionStore({ maxBytes: 4096 });
    const publish = vi.spyOn(actionStore, 'publish');
    const service = createComputeReuseService({ contentStore, actionStore });
    expect(
      await service.evaluate({ action, codec, compute: async () => value(), policy: 'best-effort' }),
    ).toMatchObject({ publication: { status: 'skipped', reason: 'content-store-failed' } });
    expect(publish).not.toHaveBeenCalled();
  });

  it('canonicalizes closure ordering and rejects a conflicting storage closure', async () => {
    const store = createMemoryActionStore({ maxBytes: 4096 });
    const first = await digestContent({ bytes: value() });
    const second = await digestContent({ bytes: new Uint8Array([4]) });
    const record = {
      schemaVersion: 1,
      actionDigest: await digestAction({ action }),
      codec: action.codec,
      output: { digest: first, size: 3, mediaType: codec.mediaType },
      dependencies: [],
      requiredContent: [second, first, second],
    } as const;
    await store.publish({ record });
    expect(await store.publish({ record: { ...record, requiredContent: [first, second] } })).toEqual({
      status: 'existing',
    });
    await expect(store.publish({ record: { ...record, requiredContent: [first] } })).rejects.toBeInstanceOf(
      CacheCorruptionError,
    );
  });
});
