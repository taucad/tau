import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeedObjectArgs, SeedObjectOutcome } from '#object-storage.service.js';
import { StorageSeeder, readStorageSeedObjects, storageSeedRetryMilliseconds } from '#storage-seed.js';
import type { StorageSeedObject } from '#storage-seed.js';
import { storageSeedKeys } from '#storage.constants.js';

/** Tau's own `infra/seed/`, which the API image carries as `dist/seed/`. */
const repositorySeedDirectory = resolve(import.meta.dirname, '../../../../infra/seed');

const objects: readonly StorageSeedObject[] = [
  { key: storageSeedKeys.ogImage, body: new Uint8Array([1]), contentType: 'image/png', cacheControl: 'x' },
  { key: storageSeedKeys.healthProbe, body: new Uint8Array([2]), contentType: 'text/plain', cacheControl: 'no-store' },
];

const seeders: StorageSeeder[] = [];
afterEach(async () => {
  await Promise.all(seeders.splice(0).map(async (seeder) => seeder.onModuleDestroy()));
});

const seederWith = (
  seedObject: (args: SeedObjectArgs) => Promise<SeedObjectOutcome>,
  load: () => Promise<readonly StorageSeedObject[]> = async () => objects,
): StorageSeeder => {
  const seeder = new StorageSeeder({ storage: { seedObject }, objects: load, retryMilliseconds: [1, 2] });
  seeders.push(seeder);
  return seeder;
};

describe('StorageSeeder', () => {
  it('should not wait for the store at boot, then create every object once with an abort signal', async () => {
    const written: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seeder = seederWith(async (args) => {
      await gate;
      expect(args.signal).toBeInstanceOf(AbortSignal);
      written.push(args.key);
      return args.key === storageSeedKeys.ogImage ? 'created' : 'present';
    });

    seeder.onApplicationBootstrap();
    expect(written).toEqual([]);
    release?.();
    await seeder.done;

    expect(written).toEqual([storageSeedKeys.ogImage, storageSeedKeys.healthProbe]);
  });

  it('should retry a pass that fails, whether the objects cannot be read or the store refuses', async () => {
    const load = vi
      .fn<() => Promise<readonly StorageSeedObject[]>>()
      .mockRejectedValueOnce(new Error('ENOENT: default-og.png'))
      .mockResolvedValue(objects);
    const seedObject = vi
      .fn<(args: SeedObjectArgs) => Promise<SeedObjectOutcome>>()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValue('present');
    const seeder = seederWith(seedObject, load);

    seeder.onApplicationBootstrap();
    await seeder.done;

    expect(load).toHaveBeenCalledTimes(3);
    /* The refused first write, then both objects on the third pass. */
    expect(seedObject).toHaveBeenCalledTimes(3);
  });

  it('should stop retrying and abort the pass once destroyed', async () => {
    let signal: AbortSignal | undefined;
    const seeder = seederWith(async (args) => {
      signal = args.signal;
      throw new Error('store down');
    });

    seeder.onApplicationBootstrap();
    await vi.waitFor(() => {
      expect(signal).toBeDefined();
    });
    await seeder.onModuleDestroy();

    expect(signal?.aborted).toBe(true);
    await expect(seeder.done).resolves.toBeUndefined();
  });

  it('should back off to five minutes between failed passes', () => {
    expect(storageSeedRetryMilliseconds.at(-1)).toBe(300_000);
  });
});

describe('readStorageSeedObjects', () => {
  it("should read Tau's default images and add an uncached probe, the probe last", async () => {
    const seeded = await readStorageSeedObjects(repositorySeedDirectory);

    expect(seeded.map(({ key, contentType, cacheControl }) => ({ key, contentType, cacheControl }))).toEqual([
      { key: 'defaults/og.png', contentType: 'image/png', cacheControl: 'public, max-age=86400' },
      { key: 'defaults/thumb.webp', contentType: 'image/webp', cacheControl: 'public, max-age=86400' },
      { key: '__health/probe.txt', contentType: 'text/plain', cacheControl: 'no-store' },
    ]);
    expect(seeded[0]?.body.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(seeded[2]?.body)).toBe('ok\n');
  });

  it('should refuse a directory without the images', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'tau-seed-'));
    try {
      await expect(readStorageSeedObjects(empty)).rejects.toThrow(/default-og\.png|default-thumb\.webp/u);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
