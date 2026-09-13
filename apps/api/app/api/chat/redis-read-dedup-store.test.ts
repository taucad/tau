import IORedisMock from 'ioredis-mock';
import { describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { RedisReadDedupStore, RedisReadDedupStoreUnsupportedOperationError } from '#api/chat/redis-read-dedup-store.js';

const createStore = (ttlSeconds = 60) => {
  const redis = new IORedisMock() as unknown as Redis;
  const store = new RedisReadDedupStore({ redis, ttlSeconds });
  return { redis, store } as const;
};

describe('RedisReadDedupStore', () => {
  it('returns null when no entry exists for the namespace/key', async () => {
    const { store } = createStore();
    const result = await store.get(['recent_reads', 'chat-1'], 'fingerprint-1');
    expect(result).toBeNull();
  });

  it('round-trips put and get preserving value, namespace, key, createdAt, updatedAt', async () => {
    const { store } = createStore();
    const namespace = ['recent_reads', 'chat-1'];
    const before = Date.now();
    await store.put(namespace, 'fp-1', { priorToolCallId: 'tc-1', modifiedAt: 1000 });
    const item = await store.get(namespace, 'fp-1');
    const after = Date.now();

    expect(item).not.toBeNull();
    expect(item?.namespace).toEqual(namespace);
    expect(item?.key).toBe('fp-1');
    expect(item?.value).toEqual({ priorToolCallId: 'tc-1', modifiedAt: 1000 });
    expect(item?.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(item?.createdAt.getTime()).toBeLessThanOrEqual(after);
    expect(item?.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('overwrites the value while preserving the original createdAt on a second put', async () => {
    const { store } = createStore();
    const namespace = ['recent_reads', 'chat-1'];
    await store.put(namespace, 'fp-1', { priorToolCallId: 'tc-1', modifiedAt: 1000 });
    const initial = await store.get(namespace, 'fp-1');
    const firstCreatedAt = initial?.createdAt.toISOString();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    await store.put(namespace, 'fp-1', { priorToolCallId: 'tc-2', modifiedAt: 2000 });
    const updated = await store.get(namespace, 'fp-1');

    expect(updated?.value).toEqual({ priorToolCallId: 'tc-2', modifiedAt: 2000 });
    expect(updated?.createdAt.toISOString()).toBe(firstCreatedAt);
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(initial?.updatedAt.getTime() ?? 0);
  });

  it('applies the TTL via EX so the key reports a positive expiry', async () => {
    const { redis, store } = createStore(120);
    await store.put(['recent_reads', 'chat-1'], 'fp-1', { priorToolCallId: 'tc-1', modifiedAt: 1000 });
    const entryTtl = await redis.ttl('recent_reads:chat-1:fp-1');
    expect(entryTtl).toBeGreaterThan(0);
    expect(entryTtl).toBeLessThanOrEqual(120);
  });

  it('deletes via delete()', async () => {
    const { store } = createStore();
    const namespace = ['recent_reads', 'chat-1'];

    await store.put(namespace, 'fp-2', { priorToolCallId: 'tc-2', modifiedAt: 2000 });
    await store.delete(namespace, 'fp-2');
    expect(await store.get(namespace, 'fp-2')).toBeNull();
  });

  it('clearChat removes every dedup pointer for the chat in one pass', async () => {
    const { redis, store } = createStore();
    await store.put(['recent_reads', 'chat-1'], 'fp-1', { priorToolCallId: 'tc-1', modifiedAt: 1000 });
    await store.put(['recent_reads', 'chat-1'], 'fp-2', { priorToolCallId: 'tc-2', modifiedAt: 2000 });
    await store.put(['recent_reads', 'chat-2'], 'fp-3', { priorToolCallId: 'tc-3', modifiedAt: 3000 });

    const deleted = await store.clearChat('chat-1');

    expect(deleted).toBe(2);
    expect(await store.get(['recent_reads', 'chat-1'], 'fp-1')).toBeNull();
    expect(await store.get(['recent_reads', 'chat-1'], 'fp-2')).toBeNull();
    expect(await store.get(['recent_reads', 'chat-2'], 'fp-3')).not.toBeNull();
    expect(await redis.exists('recent_reads:chat-2:fp-3')).toBe(1);
  });

  it('returns null on a get for a corrupt entry instead of throwing', async () => {
    const { redis, store } = createStore();
    await redis.set('recent_reads:chat-1:fp-1', 'not-json{');
    const item = await store.get(['recent_reads', 'chat-1'], 'fp-1');
    expect(item).toBeNull();
  });

  it('throws RedisReadDedupStoreUnsupportedOperationError for search', async () => {
    const { store } = createStore();
    await expect(store.search(['recent_reads', 'chat-1'])).rejects.toBeInstanceOf(
      RedisReadDedupStoreUnsupportedOperationError,
    );
  });

  it('throws RedisReadDedupStoreUnsupportedOperationError for listNamespaces', async () => {
    const { store } = createStore();
    await expect(store.listNamespaces()).rejects.toBeInstanceOf(RedisReadDedupStoreUnsupportedOperationError);
  });

  it('runs multiple operations in parallel in a single batch() call', async () => {
    const { store } = createStore();
    const namespace = ['recent_reads', 'chat-1'];

    await store.put(namespace, 'fp-existing', { priorToolCallId: 'tc-existing', modifiedAt: 1000 });

    const [putResult, getExisting, getMissing] = await store.batch([
      { namespace, key: 'fp-batch', value: { priorToolCallId: 'tc-batch', modifiedAt: 4000 } },
      { namespace, key: 'fp-existing' },
      { namespace, key: 'fp-not-present' },
    ]);

    expect(putResult).toBeUndefined();
    expect(getExisting).not.toBeNull();
    if (getExisting && !Array.isArray(getExisting)) {
      expect(getExisting.value['priorToolCallId']).toBe('tc-existing');
    }
    expect(getMissing).toBeNull();

    const persisted = await store.get(namespace, 'fp-batch');
    expect(persisted?.value).toEqual({ priorToolCallId: 'tc-batch', modifiedAt: 4000 });
  });
});
