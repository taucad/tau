import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { ObjectStorageService, SeedObjectArgs, SeedObjectOutcome } from '#object-storage.service.js';
import { storageSeedKeys } from '#storage.constants.js';

/** One seed object without its abort signal: what a {@link StorageSeeder} loads before it writes. */
export type StorageSeedObject = Omit<SeedObjectArgs, 'signal'>;

/** The default images' file names in a seed directory: Tau's `infra/seed/`, copied into the API image. */
export const storageSeedFiles = { ogImage: 'default-og.png', thumbnail: 'default-thumb.webp' } as const;

/**
 * Reads the seed objects from a seed directory: the two default images, cached by browsers and the CDN for a
 * day, and the readiness probe, which is never cached (the zone's `/__health/*` rule says the same).
 *
 * @param directory - A directory holding {@link storageSeedFiles}.
 * @returns The three objects, the probe last so readiness turns up only once the defaults exist.
 */
export const readStorageSeedObjects = async (directory: string): Promise<readonly StorageSeedObject[]> => {
  const [ogImage, thumbnail] = await Promise.all([
    readFile(join(directory, storageSeedFiles.ogImage)),
    readFile(join(directory, storageSeedFiles.thumbnail)),
  ]);
  const defaults = 'public, max-age=86400';
  return [
    { key: storageSeedKeys.ogImage, body: new Uint8Array(ogImage), contentType: 'image/png', cacheControl: defaults },
    {
      key: storageSeedKeys.thumbnail,
      body: new Uint8Array(thumbnail),
      contentType: 'image/webp',
      cacheControl: defaults,
    },
    {
      key: storageSeedKeys.healthProbe,
      body: new TextEncoder().encode('ok\n'),
      contentType: 'text/plain',
      cacheControl: 'no-store',
    },
  ];
};

/**
 * Waits between failed seed passes: quick at first, for a store that is still starting, then every five
 * minutes until a pass succeeds. The last entry repeats.
 */
export const storageSeedRetryMilliseconds: readonly number[] = [5000, 15_000, 60_000, 300_000];

/**
 * Seeds the public bucket at boot: the default images and the readiness probe, each created only when absent
 * (R2 storage blast-radius blueprint D5, phase 6). It replaces the Terraform `r2-seed` module, so no
 * Terraform run holds an object credential; the API writes with the credential it already has.
 *
 * Boot never waits for it: {@link onApplicationBootstrap} starts the first pass and returns. Every Machine
 * seeds, and `If-None-Match: *` makes all but the first write a `412` that counts as seeded, so no object is
 * ever replaced. A pass that fails (the objects cannot be read, or the store refuses or is down) is logged
 * and retried after {@link storageSeedRetryMilliseconds}, until one pass seeds every object or the module is
 * destroyed. Until the probe exists, `/health/ready` reports the public store down, which is the signal.
 */
export class StorageSeeder implements OnApplicationBootstrap, OnModuleDestroy {
  /** Resolves once a pass has seeded every object, or the seeder was destroyed first. */
  public readonly done: Promise<void>;

  readonly #logger = new Logger(StorageSeeder.name);
  readonly #shutdown = new AbortController();
  readonly #storage: Pick<ObjectStorageService, 'seedObject'>;
  readonly #objects: () => Promise<readonly StorageSeedObject[]>;
  readonly #retryMilliseconds: readonly number[];
  #timer: NodeJS.Timeout | undefined;
  #pass: Promise<void> | undefined;
  #settled: (() => void) | undefined;

  /**
   * @param args - The public-bucket driver, a loader for the objects to seed, and for tests the retry waits.
   */
  public constructor(args: {
    readonly storage: Pick<ObjectStorageService, 'seedObject'>;
    readonly objects: () => Promise<readonly StorageSeedObject[]>;
    readonly retryMilliseconds?: readonly number[];
  }) {
    this.#storage = args.storage;
    this.#objects = args.objects;
    this.#retryMilliseconds = args.retryMilliseconds ?? storageSeedRetryMilliseconds;
    this.done = new Promise<void>((resolve) => {
      this.#settled = resolve;
    });
  }

  /** Starts the first pass without waiting for it, so a slow or failing store never delays boot. */
  public onApplicationBootstrap(): void {
    this.#schedule(0, 0);
  }

  /** Stops retrying and aborts a pass in flight. */
  public async onModuleDestroy(): Promise<void> {
    clearTimeout(this.#timer);
    this.#shutdown.abort();
    await this.#pass;
    this.#settled?.();
  }

  #schedule(milliseconds: number, attempt: number): void {
    if (this.#shutdown.signal.aborted) {
      return;
    }
    this.#timer = setTimeout(() => {
      this.#pass = this.#run(attempt);
    }, milliseconds);
    this.#timer.unref();
  }

  async #run(attempt: number): Promise<void> {
    try {
      const outcomes = await this.#seed();
      this.#logger.log(
        `Seeded the public bucket: ${outcomes.map(({ key, outcome }) => `${key} ${outcome}`).join(', ')}.`,
      );
      this.#settled?.();
    } catch (error) {
      if (this.#shutdown.signal.aborted) {
        return;
      }
      const wait = this.#retryMilliseconds[Math.min(attempt, this.#retryMilliseconds.length - 1)] ?? 0;
      this.#logger.warn(
        `Seeding the public bucket failed (attempt ${String(attempt + 1)}); retrying in ${String(wait / 1000)} s: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.#schedule(wait, attempt + 1);
    }
  }

  async #seed(): Promise<ReadonlyArray<{ key: string; outcome: SeedObjectOutcome }>> {
    const objects = await this.#objects();
    const outcomes: Array<{ key: string; outcome: SeedObjectOutcome }> = [];
    for (const object of objects) {
      // oxlint-disable-next-line no-await-in-loop -- three small writes, one at a time, so a failure names its key
      const outcome = await this.#storage.seedObject({ ...object, signal: this.#shutdown.signal });
      outcomes.push({ key: object.key, outcome });
    }
    return outcomes;
  }
}
