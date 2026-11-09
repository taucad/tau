import { describe, expect, it } from 'vitest';
import { checkNotification, createdRecordKey, isDependencyKey, parseNotification } from '#notifications.js';
import type { R2Notification } from '#notifications.js';
import { createFakeKv } from '#testing/fake-kv.js';

const digest = 'a'.repeat(64);
const key = `blobs/sha256/${digest}`;
const bucket = 'tau-staging-au-dependencies';

const create = (overrides: Partial<R2Notification> = {}): R2Notification => ({
  account: 'account',
  action: 'PutObject',
  bucket,
  object: { key, size: 10, eTag: 'etag-1' },
  eventTime: '2026-11-09T18:00:00.000Z',
  ...overrides,
});

describe('isDependencyKey', () => {
  it('should admit only blobs/sha256/<64 lowercase hex>', () => {
    expect(isDependencyKey(key)).toBe(true);
    expect(isDependencyKey(`blobs/sha256/${'A'.repeat(64)}`)).toBe(false);
    expect(isDependencyKey(`blobs/sha256/${'a'.repeat(63)}`)).toBe(false);
    expect(isDependencyKey(`${key}.tmp`)).toBe(false);
    expect(isDependencyKey(`payloads/${digest}`)).toBe(false);
    expect(isDependencyKey(`/${key}`)).toBe(false);
  });
});

describe('parseNotification', () => {
  it('should read an object body and a JSON string body', () => {
    expect(parseNotification(create())?.object.key).toBe(key);
    expect(parseNotification(JSON.stringify(create()))?.action).toBe('PutObject');
  });

  it('should refuse a body without an action, a bucket or a key', () => {
    expect(parseNotification({ bucket, object: { key } })).toBeUndefined();
    expect(parseNotification({ action: 'PutObject', object: { key } })).toBeUndefined();
    expect(parseNotification({ action: 'PutObject', bucket, object: {} })).toBeUndefined();
    expect(parseNotification('not json')).toBeUndefined();
  });
});

describe('checkNotification', () => {
  it('should record a first create and report it', async () => {
    const kv = createFakeKv();
    const lines = await checkNotification(create(), kv, 'staging');
    expect(lines).toEqual([
      {
        event: 'r2_audit.dependency_created',
        environment: 'staging',
        source: 'notification',
        bucket,
        action: 'PutObject',
        key,
        eTag: 'etag-1',
        eventTime: '2026-11-09T18:00:00.000Z',
      },
    ]);
    expect(JSON.parse(kv.values.get(`object:${key}`) ?? '{}')).toEqual({
      eTag: 'etag-1',
      eventTime: '2026-11-09T18:00:00.000Z',
    });
  });

  it('should alarm on a second create for a recorded key, naming the first eTag', async () => {
    const kv = createFakeKv();
    await checkNotification(create(), kv, 'staging');
    const lines = await checkNotification(
      create({
        action: 'CopyObject',
        object: { key, eTag: 'etag-2' },
        eventTime: '2026-11-09T18:05:00.000Z',
      }),
      kv,
      'staging',
    );
    expect(lines).toEqual([
      expect.objectContaining({
        event: 'r2_audit.dependency_overwritten',
        action: 'CopyObject',
        key,
        eTag: 'etag-2',
        previousEtag: 'etag-1',
      }),
    ]);
    // The first record stays, so every later overwrite is still compared with the original.
    expect(JSON.parse(kv.values.get(`object:${key}`) ?? '{}')).toMatchObject({
      eTag: 'etag-1',
    });
  });

  it('should alarm on a rewrite of identical bytes at a later time', async () => {
    const kv = createFakeKv();
    await checkNotification(create(), kv, 'staging');
    const lines = await checkNotification(create({ eventTime: '2026-11-09T18:09:00.000Z' }), kv, 'staging');
    expect(lines.map((line) => line.event)).toEqual(['r2_audit.dependency_overwritten']);
  });

  it('should write nothing for a redelivered create', async () => {
    const kv = createFakeKv();
    await checkNotification(create(), kv, 'staging');
    expect(await checkNotification(create(), kv, 'staging')).toEqual([]);
    expect(kv.puts).toHaveLength(1);
  });

  it('should alarm on a key outside the layout and still record it', async () => {
    const kv = createFakeKv();
    const lines = await checkNotification(create({ object: { key: 'payloads/x.tar', eTag: 'e' } }), kv, 'staging');
    expect(lines.map((line) => line.event)).toEqual([
      'r2_audit.dependency_layout_breach',
      'r2_audit.dependency_created',
    ]);
    expect(kv.values.has('object:payloads/x.tar')).toBe(true);
  });

  it('should alarm on every delete, lifecycle deletion included, without reading KV', async () => {
    const kv = createFakeKv();
    kv.fail(true);
    const actions = ['DeleteObject', 'LifecycleDeletion'];
    const results = await Promise.all(
      actions.map(async (action) => checkNotification(create({ action, object: { key } }), kv, 'staging')),
    );
    expect(results.map((lines) => lines.map(({ event, action }) => ({ event, action })))).toEqual([
      [{ event: 'r2_audit.dependency_deleted', action: 'DeleteObject' }],
      [{ event: 'r2_audit.dependency_deleted', action: 'LifecycleDeletion' }],
    ]);
  });

  it('should propagate a KV failure on a create so the message is retried', async () => {
    const kv = createFakeKv();
    kv.fail(true);
    await expect(checkNotification(create(), kv, 'staging')).rejects.toThrow('KV unavailable');
  });
});

describe('createdRecordKey', () => {
  it('should hash a key too long for KV', async () => {
    expect(await createdRecordKey(key)).toBe(`object:${key}`);
    expect(await createdRecordKey('k'.repeat(1000))).toMatch(/^object-sha256:[0-9a-f]{64}$/u);
  });
});
