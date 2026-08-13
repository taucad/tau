import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createNodeEvidenceStore,
  ensureNodeEvidenceStoreInstalled,
  readEngineDigest,
  resetEngineDigest,
} from '#cache/node-evidence-store.js';
import { getGeoSpecEvidenceStore, resetGeoSpecEvidenceStore } from '#cache/evidence-cache.js';

/** Every persistent-cache test gets its own root, never inside the project tree. */
const roots: string[] = [];
const freshRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'geospec-evidence-'));
  roots.push(root);
  return root;
};

afterAll(async () => {
  await Promise.all(
    roots.map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

const digest = (): string => 'engine-digest-test';
const entryPath = (root: string, family: string, key: string): string =>
  join(root, family, key.slice(0, 2), `${key}.bin`);
const payload = (size: number): Uint8Array<ArrayBuffer> =>
  Uint8Array.from({ length: size }, (_unused, index) => index % 251);

describe('node evidence store', () => {
  it('should install its lazy process default exactly once', () => {
    resetGeoSpecEvidenceStore();
    ensureNodeEvidenceStoreInstalled();
    ensureNodeEvidenceStoreInstalled();

    expect(getGeoSpecEvidenceStore()).toBeDefined();
  });

  it('should round-trip a small payload through a second store instance', async () => {
    const root = freshRoot();
    const store = createNodeEvidenceStore({ root, engineDigest: digest });
    expect(store.root).toBe(root);

    store.put('xde-read', 'a'.repeat(64), payload(16));
    await store.flush();

    const reader = createNodeEvidenceStore({ root, engineDigest: digest });
    expect([...reader.get('xde-read', 'a'.repeat(64))!]).toEqual([...payload(16)]);
    expect(reader.get('xde-read', 'b'.repeat(64))).toBeUndefined();
  });

  it('should serve its own writes from the overlay before they reach disk', () => {
    const root = freshRoot();
    const store = createNodeEvidenceStore({ root, engineDigest: digest });
    store.put('mesh-record', 'c'.repeat(64), payload(8));
    // No flush: the value is only in the overlay.
    expect(store.get('mesh-record', 'c'.repeat(64))).toEqual(payload(8));
  });

  it('should keep the newest value when a put supersedes an in-flight write', async () => {
    const root = freshRoot();
    const store = createNodeEvidenceStore({ root, engineDigest: digest });
    const key = 'd'.repeat(64);
    store.put('mesh-record', key, payload(8));
    store.put('mesh-record', key, payload(24));
    expect(store.get('mesh-record', key)).toEqual(payload(24));
    await store.flush();
    expect([...createNodeEvidenceStore({ root, engineDigest: digest }).get('mesh-record', key)!]).toEqual([
      ...payload(24),
    ]);
  });

  it('should compress payloads above 4 KiB and still round-trip them', async () => {
    const root = freshRoot();
    const store = createNodeEvidenceStore({ root, engineDigest: digest });
    const key = 'e'.repeat(64);
    const large = payload(64_000);
    store.put('occurrence-mesh', key, large);
    await store.flush();

    const frame = readFileSync(entryPath(root, 'occurrence-mesh', key));
    expect(frame[32]).toBe(1);
    expect(frame.byteLength).toBeLessThan(large.byteLength);
    expect([...createNodeEvidenceStore({ root, engineDigest: digest }).get('occurrence-mesh', key)!]).toEqual([
      ...large,
    ]);
  });

  it('should write the per-install secret at mode 0600', () => {
    const root = freshRoot();
    createNodeEvidenceStore({ root, engineDigest: digest }).put('xde-read', 'f'.repeat(64), payload(4));
    expect(statSync(join(root, 'install-secret')).mode.toString(8).slice(-3)).toBe('600');
  });

  it('should treat a tampered payload as a miss — tamper can force work, never a wrong verdict', async () => {
    const root = freshRoot();
    const store = createNodeEvidenceStore({ root, engineDigest: digest });
    const key = '0'.repeat(64);
    store.put('relationship-verdict', key, payload(16));
    await store.flush();

    const path = entryPath(root, 'relationship-verdict', key);
    const frame = readFileSync(path);
    frame[frame.byteLength - 1] = 255 - frame[frame.byteLength - 1]!;
    writeFileSync(path, frame);

    expect(createNodeEvidenceStore({ root, engineDigest: digest }).get('relationship-verdict', key)).toBeUndefined();
  });

  it('should treat a truncated frame as a miss', async () => {
    const root = freshRoot();
    const store = createNodeEvidenceStore({ root, engineDigest: digest });
    const key = '1'.repeat(64);
    store.put('face-facts', key, payload(16));
    await store.flush();

    const path = entryPath(root, 'face-facts', key);
    writeFileSync(path, readFileSync(path).subarray(0, 8));
    expect(createNodeEvidenceStore({ root, engineDigest: digest }).get('face-facts', key)).toBeUndefined();
  });

  it('should treat an authentic frame whose body is not decompressible as a miss', () => {
    const root = freshRoot();
    const store = createNodeEvidenceStore({ root, engineDigest: digest });
    const key = '2'.repeat(64);
    // Force the secret into existence, then forge a correctly signed frame that
    // claims zstd and carries garbage.
    store.put('brep-facet', 'seed'.padEnd(64, '0'), payload(4));
    const secret = readFileSync(join(root, 'install-secret'));
    const body = Uint8Array.from([9, 9, 9, 9]);
    const frame = new Uint8Array(33 + body.byteLength);
    frame.set(createHmac('sha256', secret).update(`brep-facet|${key}|`).update(body).digest(), 0);
    frame[32] = 1;
    frame.set(body, 33);
    const path = entryPath(root, 'brep-facet', key);
    mkdirSync(join(root, 'brep-facet', key.slice(0, 2)), { recursive: true });
    writeFileSync(path, frame);

    expect(createNodeEvidenceStore({ root, engineDigest: digest }).get('brep-facet', key)).toBeUndefined();
  });

  it('should behave as no cache at all when the root cannot hold a secret', () => {
    const file = join(freshRoot(), 'not-a-directory');
    writeFileSync(file, 'x');
    const store = createNodeEvidenceStore({ root: join(file, 'nested'), engineDigest: digest });

    expect(store.get('xde-read', '3'.repeat(64))).toBeUndefined();
    store.put('xde-read', '3'.repeat(64), payload(4));
    expect(store.get('xde-read', '3'.repeat(64))).toBeUndefined();
  });

  it('should drop an entry whose disk write fails, leaving a future miss and no error', async () => {
    const root = freshRoot();
    const store = createNodeEvidenceStore({ root, engineDigest: digest });
    // Seed the secret, then block the family directory with a plain file.
    store.put('face-facts', '4'.repeat(64), payload(4));
    await store.flush();
    await rm(join(root, 'face-facts'), { recursive: true, force: true });
    writeFileSync(join(root, 'face-facts'), 'blocked');

    const key = '5'.repeat(64);
    store.put('face-facts', key, payload(4));
    await expect(store.flush()).resolves.toBeUndefined();
    expect(store.get('face-facts', key)).toBeUndefined();
  });

  it('should read a real engine digest from the shipped wasm and memoize it', () => {
    resetEngineDigest();
    const first = readEngineDigest();
    expect(first).toMatch(/^[\da-f]{64}$/u);

    const store = createNodeEvidenceStore({ root: freshRoot() });
    expect(store.engineDigest()).toBe(first);
    expect(store.engineDigest()).toBe(first);
  });

  it('should disable itself when the shipped wasm cannot be read', () => {
    expect(readEngineDigest(['./no-such-artifact.wasm'])).toBeUndefined();
  });

  it('should hash bytes and canonical keys with sha-256', () => {
    const store = createNodeEvidenceStore({ root: freshRoot(), engineDigest: digest });
    expect(store.hashBytes(Uint8Array.from(randomBytes(8)))).toMatch(/^[\da-f]{64}$/u);
    expect(store.digestKey('a')).toBe(store.digestKey('a'));
    expect(store.digestKey('a')).not.toBe(store.digestKey('b'));
  });
});
