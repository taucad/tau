import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalJson,
  flushEvidenceStore,
  geoSpecEvidenceFamilyVersions,
  getGeoSpecEvidenceStore,
  readEvidenceBytes,
  readEvidenceJson,
  resetGeoSpecEvidenceStore,
  resolveEvidenceAddress,
  setGeoSpecDefaultEvidenceStoreFactory,
  setGeoSpecEvidenceStore,
  writeEvidenceBytes,
  writeEvidenceJson,
} from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';

afterEach(() => {
  setGeoSpecEvidenceStore(undefined);
});

describe('canonicalJson', () => {
  it('should sort object keys recursively so property order cannot key an entry', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } })).toBe(
      canonicalJson({ a: { c: [{ e: 4, f: 3 }], d: 2 }, b: 1 }),
    );
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('should pass scalars and nulls through unchanged', () => {
    expect(canonicalJson([1, 'two', null, true])).toBe('[1,"two",null,true]');
  });
});

describe('evidence store installation', () => {
  afterEach(() => {
    setGeoSpecDefaultEvidenceStoreFactory(undefined);
    resetGeoSpecEvidenceStore();
  });

  it('should treat an explicit undefined as "no persistence", never as "use the default"', () => {
    const factory = vi.fn(() => createMemoryEvidenceStore());
    setGeoSpecDefaultEvidenceStoreFactory(factory);
    setGeoSpecEvidenceStore(undefined);

    expect(getGeoSpecEvidenceStore()).toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
  });

  it('should build the host default exactly once, on first use', () => {
    const store = createMemoryEvidenceStore();
    const factory = vi.fn(() => store);
    setGeoSpecDefaultEvidenceStoreFactory(factory);
    resetGeoSpecEvidenceStore();

    expect(getGeoSpecEvidenceStore()).toBe(store);
    expect(getGeoSpecEvidenceStore()).toBe(store);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should report no store when the host has no default', () => {
    setGeoSpecDefaultEvidenceStoreFactory(undefined);
    resetGeoSpecEvidenceStore();
    expect(getGeoSpecEvidenceStore()).toBeUndefined();
  });
});

describe('evidence addressing', () => {
  it('should fold the engine digest, family and family version into the key', () => {
    const store = createMemoryEvidenceStore('digest-a');
    setGeoSpecEvidenceStore(store);
    const first = resolveEvidenceAddress('xde-read', { contentHash: 'abc' })!;

    setGeoSpecEvidenceStore(createMemoryEvidenceStore('digest-b'));
    const rotated = resolveEvidenceAddress('xde-read', { contentHash: 'abc' })!;
    expect(rotated.keyDigest).not.toBe(first.keyDigest);

    setGeoSpecEvidenceStore(store);
    const otherFamily = resolveEvidenceAddress('mesh-record', { contentHash: 'abc' })!;
    expect(otherFamily.keyDigest).not.toBe(first.keyDigest);

    // The version is in the key, so a bump can never replay old bytes.
    const bumped = geoSpecEvidenceFamilyVersions['void-topology-shells'];
    expect(bumped).toBeGreaterThan(1);
  });

  it('should be insensitive to key property order', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    expect(resolveEvidenceAddress('xde-read', { a: 1, b: 2 })!.keyDigest).toBe(
      resolveEvidenceAddress('xde-read', { b: 2, a: 1 })!.keyDigest,
    );
  });

  it('should disable the cache when the engine digest is unreadable', () => {
    setGeoSpecEvidenceStore({ ...createMemoryEvidenceStore(), engineDigest: () => undefined });
    expect(resolveEvidenceAddress('xde-read', { contentHash: 'abc' })).toBeUndefined();
    expect(readEvidenceBytes('xde-read', { contentHash: 'abc' })).toBeUndefined();
    writeEvidenceBytes('xde-read', { contentHash: 'abc' }, Uint8Array.from([1]));
    expect(readEvidenceBytes('xde-read', { contentHash: 'abc' })).toBeUndefined();
  });

  it('should miss on every read with no store installed', () => {
    setGeoSpecEvidenceStore(undefined);
    expect(resolveEvidenceAddress('xde-read', {})).toBeUndefined();
    expect(readEvidenceJson('xde-read', {})).toBeUndefined();
    // A write without a store is a no-op, never a throw.
    writeEvidenceJson('xde-read', {}, { value: 1 });
  });
});

describe('evidence payloads', () => {
  it('should round-trip bytes and JSON', () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);

    writeEvidenceBytes('mesh-record', { id: 1 }, Uint8Array.from([7, 8, 9]));
    expect([...readEvidenceBytes('mesh-record', { id: 1 })!]).toEqual([7, 8, 9]);

    writeEvidenceJson('xde-read', { id: 2 }, { occurrences: 3 });
    expect(readEvidenceJson('xde-read', { id: 2 })).toEqual({ occurrences: 3 });
    expect(store.entries.size).toBe(2);
  });

  it('should treat an unparseable JSON entry as a miss', () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    writeEvidenceBytes('xde-read', { id: 3 }, Uint8Array.from([0xff, 0xfe]));
    expect(readEvidenceJson('xde-read', { id: 3 })).toBeUndefined();
  });
});

describe('flushEvidenceStore', () => {
  it('should drain a store that flushes and tolerate one that does not', async () => {
    const flush = vi.fn(async () => undefined);
    setGeoSpecEvidenceStore({ ...createMemoryEvidenceStore(), flush });
    await flushEvidenceStore();
    expect(flush).toHaveBeenCalledTimes(1);

    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    await expect(flushEvidenceStore()).resolves.toBeUndefined();
  });
});
