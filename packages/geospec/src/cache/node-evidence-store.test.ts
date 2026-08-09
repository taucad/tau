import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeEvidenceStore } from '#cache/node-evidence-store.js';

const family = 'test-family';
const keyDigest = 'a'.repeat(64);

describe('node evidence store write-behind (R9)', () => {
  let cacheBase: string;
  let projectPath: string;
  const savedCacheDirectory = process.env['GEOSPEC_CACHE_DIR'];

  beforeEach(() => {
    cacheBase = mkdtempSync(join(tmpdir(), 'geospec-evidence-store-'));
    projectPath = join(cacheBase, 'project');
    process.env['GEOSPEC_CACHE_DIR'] = cacheBase;
  });

  afterEach(() => {
    if (savedCacheDirectory === undefined) {
      delete process.env['GEOSPEC_CACHE_DIR'];
    } else {
      process.env['GEOSPEC_CACHE_DIR'] = savedCacheDirectory;
    }
    rmSync(cacheBase, { recursive: true, force: true });
  });

  const findEntryPath = (): string | undefined => {
    try {
      const familyDirectory = join(cacheBase, ...readdirSync(cacheBase).filter((name) => name !== 'secret'));
      const evidenceDirectory = join(familyDirectory, 'evidence', family);
      const prefix = readdirSync(evidenceDirectory)[0];
      if (!prefix) {
        return undefined;
      }
      const file = readdirSync(join(evidenceDirectory, prefix))[0];
      return file ? join(evidenceDirectory, prefix, file) : undefined;
    } catch {
      return undefined;
    }
  };

  it('should serve a pending write from the overlay before the drain lands it', async () => {
    const store = createNodeEvidenceStore(projectPath);
    const value = new Uint8Array([1, 2, 3, 4]);

    store.put(family, keyDigest, value);

    // Synchronous read-after-write: the drain has not run a single microtask
    // yet, so this must come from the pending overlay.
    expect(store.get(family, keyDigest)).toBe(value);

    await store.flush?.();
    // Post-flush the overlay is empty; the read now authenticates from disk.
    expect(store.get(family, keyDigest)).not.toBe(value);
    expect(store.get(family, keyDigest)).toEqual(value);
  });

  it('should land an authenticated entry readable by a fresh store instance after flush', async () => {
    const store = createNodeEvidenceStore(projectPath);
    const value = new Uint8Array([9, 8, 7]);

    store.put(family, keyDigest, value);
    await store.flush?.();

    const reopened = createNodeEvidenceStore(projectPath);
    expect(reopened.get(family, keyDigest)).toEqual(value);
  });

  it('should round-trip a compressed entry above the zstd threshold through the drain', async () => {
    const store = createNodeEvidenceStore(projectPath);
    const value = new Uint8Array(64 * 1024);
    for (let index = 0; index < value.length; index += 1) {
      value[index] = index % 251;
    }

    store.put(family, keyDigest, value);
    await store.flush?.();

    const entryPath = findEntryPath();
    expect(entryPath).toBeDefined();
    // Hmac(32) | algorithm(1) | zstd payload — compressed on disk, restored on read.
    expect(readFileSync(entryPath!).byteLength).toBeLessThan(value.byteLength);
    expect(createNodeEvidenceStore(projectPath).get(family, keyDigest)).toEqual(value);
  });

  it('should keep the newest value when a put supersedes a pending write for the same key', async () => {
    const store = createNodeEvidenceStore(projectPath);
    const first = new Uint8Array([1, 1, 1]);
    const second = new Uint8Array([2, 2, 2]);

    store.put(family, keyDigest, first);
    store.put(family, keyDigest, second);

    expect(store.get(family, keyDigest)).toBe(second);
    await store.flush?.();
    expect(createNodeEvidenceStore(projectPath).get(family, keyDigest)).toEqual(second);
  });

  it('should land oversized puts synchronously under backpressure', () => {
    const store = createNodeEvidenceStore(projectPath, { maxPendingWriteBytes: 8 });
    // A value above the pending cap must take the synchronous path: durable
    // immediately, readable by a fresh instance with no flush and no overlay.
    const value = new Uint8Array([42, 0, 0, 0, 0, 0, 0, 0, 7]);

    store.put(family, keyDigest, value);

    expect(createNodeEvidenceStore(projectPath).get(family, keyDigest)).toEqual(value);
  });

  it('should treat a tampered entry as a miss instead of returning corrupted evidence', async () => {
    const store = createNodeEvidenceStore(projectPath);
    const value = new Uint8Array([5, 5, 5, 5]);
    store.put(family, keyDigest, value);
    await store.flush?.();

    const entryPath = findEntryPath();
    expect(entryPath).toBeDefined();
    const bytes = readFileSync(entryPath!);
    bytes[bytes.byteLength - 1] = (bytes[bytes.byteLength - 1]! + 1) % 256;
    writeFileSync(entryPath!, bytes);

    expect(createNodeEvidenceStore(projectPath).get(family, keyDigest)).toBeUndefined();
  });
});
