import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalJson,
  flushGeoSpecEvidenceStore,
  getGeoSpecEvidenceCache,
  setGeoSpecEvidenceStore,
  uint32ArrayCodec,
} from '#cache/evidence-cache.js';
import type { GeoSpecEvidenceCache } from '#cache/evidence-cache.js';
import { createNodeEvidenceStore, installNodeEvidenceCache } from '#cache/node-evidence-store.js';

const temporaryDirectories: string[] = [];

const createIsolatedCache = async (): Promise<GeoSpecEvidenceCache> => {
  const directory = await mkdtemp(join(tmpdir(), 'geospec-evidence-'));
  temporaryDirectories.push(directory);
  process.env['GEOSPEC_CACHE_DIR'] = directory;
  setGeoSpecEvidenceStore(createNodeEvidenceStore('/project'));
  const cache = getGeoSpecEvidenceCache();
  if (!cache) {
    throw new Error('evidence cache failed to install');
  }
  return cache;
};

/** Every entry path under the isolated cache directory. */
const listEntryPaths = async (): Promise<string[]> => {
  const root = process.env['GEOSPEC_CACHE_DIR']!;
  const found: string[] = [];
  const walk = async (path: string): Promise<void> => {
    const entries = await readdir(path, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const child = join(path, entry.name);
        if (entry.isDirectory()) {
          await walk(child);
        } else if (entry.name.endsWith('.bin')) {
          found.push(child);
        }
      }),
    );
  };
  await walk(root);
  return found;
};

afterEach(async () => {
  // R9: settle the write-behind drain before deleting the directory it
  // writes into — an in-flight drain racing the rm is the crash shape.
  await flushGeoSpecEvidenceStore();
  setGeoSpecEvidenceStore(undefined);
  delete process.env['GEOSPEC_CACHE_DIR'];
  delete process.env['GEOSPEC_EVIDENCE_CACHE'];
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('persistent evidence cache (R5)', () => {
  it('computes once and replays across store instances (cross-process shape)', async () => {
    const cache = await createIsolatedCache();
    let computes = 0;
    const options = {
      family: 'contact-patch',
      version: 1,
      key: { subjectHash: 'abc', face: 3 },
      compute: () => {
        computes += 1;
        return { patchArea: 260.2, band: 6.5 };
      },
    };
    expect(cache.getOrCompute(options)).toEqual({ patchArea: 260.2, band: 6.5 });
    // A fresh store over the same root (a different worker/process) replays
    // once the write-behind drain lands the entry (R9 run/shard boundary).
    await flushGeoSpecEvidenceStore();
    setGeoSpecEvidenceStore(createNodeEvidenceStore('/project'));
    const second = getGeoSpecEvidenceCache()!;
    expect(second.getOrCompute(options)).toEqual({ patchArea: 260.2, band: 6.5 });
    expect(computes).toBe(1);
  });

  it('rejects and recomputes a tampered entry (reward-hacking channel closed, A3)', async () => {
    const cache = await createIsolatedCache();
    let computes = 0;
    const options = {
      family: 'void-closed-cells',
      version: 1,
      key: { subjectHash: 'abc', occurrence: 1 },
      compute: (): number[] => {
        computes += 1;
        return [1, 2, 3];
      },
      codec: uint32ArrayCodec,
    };
    expect(cache.getOrCompute(options)).toEqual([1, 2, 3]);
    // The SUT plants a forged value in the entry path (post-drain, R9).
    await flushGeoSpecEvidenceStore();
    const [entryPath] = await listEntryPaths();
    expect(entryPath).toBeDefined();
    const entry = await readFile(entryPath!);
    const forged = Buffer.from(entry);
    forged[forged.byteLength - 1] = (forged[forged.byteLength - 1]! + 1) % 256;
    await writeFile(entryPath!, forged);
    // Authentication fails → the value is recomputed, never trusted.
    expect(cache.getOrCompute(options)).toEqual([1, 2, 3]);
    expect(computes).toBe(2);
  });

  it('never stores undefined outcomes (failures re-evaluate every run)', async () => {
    const cache = await createIsolatedCache();
    let computes = 0;
    const options = {
      family: 'contact-patch',
      version: 1,
      key: { subjectHash: 'unsupported' },
      compute: (): number[] | undefined => {
        computes += 1;
        return undefined;
      },
    };
    expect(cache.getOrCompute(options)).toBeUndefined();
    expect(cache.getOrCompute(options)).toBeUndefined();
    expect(computes).toBe(2);
  });

  it('round-trips large values through zstd compression (B7)', async () => {
    const cache = await createIsolatedCache();
    const large = Array.from({ length: 100_000 }, (_value, index) => index % 7);
    const options = {
      family: 'void-closed-cells',
      version: 1,
      key: { subjectHash: 'big' },
      compute: () => large,
      codec: uint32ArrayCodec,
    };
    expect(cache.getOrCompute(options)).toEqual(large);
    // Fresh store: decode the compressed entry once the drain lands it (R9).
    await flushGeoSpecEvidenceStore();
    setGeoSpecEvidenceStore(createNodeEvidenceStore('/project'));
    expect(getGeoSpecEvidenceCache()!.getOrCompute({ ...options, compute: () => [] as number[] })).toEqual(large);
    // The stored entry is materially smaller than the raw 400 KB payload.
    const [entryPath] = await listEntryPaths();
    const entry = await readFile(entryPath!);
    expect(entry.byteLength).toBeLessThan(100_000 * 4);
  });

  it('keys are canonical: property order does not split entries', async () => {
    const cache = await createIsolatedCache();
    let computes = 0;
    const compute = (): string => {
      computes += 1;
      return 'value';
    };
    cache.getOrCompute({ family: 'f', version: 1, key: { a: 1, b: 2 }, compute });
    cache.getOrCompute({ family: 'f', version: 1, key: { b: 2, a: 1 }, compute });
    expect(computes).toBe(1);
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });

  it('separates entries by family, version, and key', async () => {
    const cache = await createIsolatedCache();
    let computes = 0;
    const compute = (): number => {
      computes += 1;
      return computes;
    };
    expect(cache.getOrCompute({ family: 'f', version: 1, key: { k: 1 }, compute })).toBe(1);
    expect(cache.getOrCompute({ family: 'f', version: 2, key: { k: 1 }, compute })).toBe(2);
    expect(cache.getOrCompute({ family: 'g', version: 1, key: { k: 1 }, compute })).toBe(3);
    expect(cache.getOrCompute({ family: 'f', version: 1, key: { k: 2 }, compute })).toBe(4);
    expect(cache.getOrCompute({ family: 'f', version: 1, key: { k: 1 }, compute })).toBe(1);
  });

  it('installs nothing when GEOSPEC_EVIDENCE_CACHE=0', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geospec-evidence-'));
    temporaryDirectories.push(directory);
    process.env['GEOSPEC_CACHE_DIR'] = directory;
    process.env['GEOSPEC_EVIDENCE_CACHE'] = '0';
    installNodeEvidenceCache('/project');
    expect(getGeoSpecEvidenceCache()).toBeUndefined();
  });
});
