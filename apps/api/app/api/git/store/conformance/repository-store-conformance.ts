import { createHash, randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { concatUint8Arrays } from '#storage/concat-uint8-arrays.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import type { ObjectStorageService, StorageAccount } from '#storage/object-storage.service.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import type { RepositoryLocator } from '#api/git/store/port.js';

/**
 * Builds the env-gated conformance target from `TAU_S3_CONFORMANCE_*`.
 * Returns `undefined` when the family is unset so the R2 leg skips cleanly
 * in CI and on a developer machine.
 */
export const conformanceAccountFromEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
): StorageAccount | undefined => {
  const endpoint = environment['TAU_S3_CONFORMANCE_ENDPOINT'];
  const bucket = environment['TAU_S3_CONFORMANCE_BUCKET'];
  const accessKeyId = environment['TAU_S3_CONFORMANCE_ACCESS_KEY_ID'];
  const secretAccessKey = environment['TAU_S3_CONFORMANCE_SECRET_ACCESS_KEY'];

  if (
    endpoint === undefined ||
    bucket === undefined ||
    accessKeyId === undefined ||
    secretAccessKey === undefined ||
    endpoint === '' ||
    bucket === ''
  ) {
    return undefined;
  }

  assertDestructiveTestBucketAllowed(bucket, 'the repository-store conformance suite');

  return {
    id: 'conformance',
    endpoint,
    region: environment['TAU_S3_CONFORMANCE_REGION'] ?? 'auto',
    bucket,
    forcePathStyle: environment['TAU_S3_CONFORMANCE_FORCE_PATH_STYLE'] !== 'false',
    credentials: { accessKeyId, secretAccessKey },
  };
};

/**
 * Single-part ceiling used by the suite. It sits at one part because S3 and
 * MinIO refuse a non-final part below 5 MiB, so a smaller ceiling could not
 * produce a real multi-part upload.
 */
const conformanceMaxObjectBytes = 8 * 1024 * 1024;

/** Listing page size used by the suite, small enough to force continuation tokens cheaply. */
const conformanceListPageSize = 2;

const scaleIt = process.env['TAU_SCALE_TESTS'] === '1' ? it : it.skip;

const collect = async (body: Readable): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('unexpected readable chunk');
    }

    chunks.push(new Uint8Array(chunk));
  }

  return concatUint8Arrays(chunks);
};

const manifestBytes = (generation: number): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify({ format: 1, generation, incarnation: randomBytes(4).toString('hex') }));

const sha256Base64 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('base64');

/**
 * Runs every `RepositoryStore` scenario the charter requires against one
 * endpoint. Called once per provider (MinIO always; R2 when
 * `TAU_S3_CONFORMANCE_*` is set) so both legs prove the identical contract.
 *
 * `getDriver` is deferred because the driver is only available after the
 * enclosing suite's `beforeAll` has booted the Nest module.
 */
export const describeRepositoryStoreConformance = (name: string, getDriver: () => ObjectStorageService): void => {
  describe(`RepositoryStore conformance (${name})`, () => {
    const purgedPrefixes: string[] = [];

    const newLocator = (): RepositoryLocator => {
      const locator = {
        ownerId: `conformance-${randomBytes(6).toString('hex')}`,
        projectId: `project-${randomBytes(4).toString('hex')}`,
      };
      purgedPrefixes.push(`${locator.ownerId}/`);
      return locator;
    };

    const newStore = (): S3RepositoryStore =>
      new S3RepositoryStore(getDriver(), {
        maxObjectBytes: conformanceMaxObjectBytes,
        listPageSize: conformanceListPageSize,
      });

    beforeAll(() => {
      // D32: the bucket this leg will really write to and prefix-delete. For
      // the Tau default account the private tier is a different bucket from
      // `account.bucket`, so the tier-resolved name is the one that matters.
      assertDestructiveTestBucketAllowed(
        getDriver().bucketFor('private'),
        `the repository-store conformance suite (${name})`,
      );
    });

    afterAll(async () => {
      const driver = getDriver();
      for (const prefix of purgedPrefixes) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- teardown of one tenant prefix at a time.
        await driver.deleteEntirePrefixForPurgeJob({ namespace: 'tenants', keyPrefix: prefix, tier: 'private' });
      }
    });

    it('should declare the capabilities the commit protocol consults', () => {
      expect(newStore().capabilities).toStrictEqual({
        conditionalWrite: true,
        delete: true,
        list: true,
        maxObjectBytes: conformanceMaxObjectBytes,
      });
    });

    it('should refuse a locator naming an account that does not exist (D26)', async () => {
      const store = newStore();
      const locator = { ...newLocator(), accountId: 'not-a-real-account' };

      await expect(store.readManifest(locator)).rejects.toThrow(/Unknown storage account/u);
    });

    it('should refuse a putObject whose declared contentLength disagrees with the body', async () => {
      const store = newStore();
      const locator = newLocator();
      const body = new Uint8Array(randomBytes(32));

      await expect(
        store.putObject(locator, 'packs/mislabelled.pack', body, {
          contentLength: body.byteLength + 1,
          sha256: sha256Base64(body),
        }),
      ).rejects.toThrow(RangeError);

      const listed: string[] = [];
      for await (const object of store.listObjects(locator, 'packs/')) {
        listed.push(object.key);
      }

      expect(listed).toStrictEqual([]);
    });

    it('should create the manifest when none exists and read the same bytes back', async () => {
      const store = newStore();
      const locator = newLocator();
      const first = manifestBytes(1);

      const token = await store.commitManifest(locator, first, 'absent');

      expect(token).not.toBe('lost');

      const read = await store.readManifest(locator);

      expect(read?.manifest).toStrictEqual(first);
      expect(read?.token).toStrictEqual(token);
    });

    it('should report an absent-expectation commit as lost when the manifest already exists', async () => {
      const store = newStore();
      const locator = newLocator();
      await store.commitManifest(locator, manifestBytes(1), 'absent');

      const second = await store.commitManifest(locator, manifestBytes(2), 'absent');

      expect(second).toBe('lost');
    });

    it('should return undefined for a repository that has never committed', async () => {
      const store = newStore();

      await expect(store.readManifest(newLocator())).resolves.toBeUndefined();
    });

    it('should accept a compare-and-swap that carries the current token', async () => {
      const store = newStore();
      const locator = newLocator();
      const created = await store.commitManifest(locator, manifestBytes(1), 'absent');
      if (created === 'lost') {
        throw new Error('fixture commit was refused');
      }

      const next = manifestBytes(2);
      const committed = await store.commitManifest(locator, next, created);

      expect(committed).not.toBe('lost');
      expect(committed).not.toStrictEqual(created);
      await expect(store.readManifest(locator)).resolves.toStrictEqual({ manifest: next, token: committed });
    });

    it('should report a compare-and-swap that carries a stale token as lost', async () => {
      const store = newStore();
      const locator = newLocator();
      const stale = await store.commitManifest(locator, manifestBytes(1), 'absent');
      if (stale === 'lost') {
        throw new Error('fixture commit was refused');
      }
      await store.commitManifest(locator, manifestBytes(2), stale);

      const refused = await store.commitManifest(locator, manifestBytes(3), stale);

      expect(refused).toBe('lost');
    });

    it('should report a compare-and-swap against an absent manifest as lost, not as a create (AR-A E7)', async () => {
      const store = newStore();
      const locator = newLocator();
      const created = await store.commitManifest(locator, manifestBytes(1), 'absent');
      if (created === 'lost') {
        throw new Error('fixture commit was refused');
      }
      await store.deleteObjects(locator, ['manifest.json']);

      const refused = await store.commitManifest(locator, manifestBytes(2), created);

      expect(refused).toBe('lost');
      await expect(store.readManifest(locator)).resolves.toBeUndefined();
    });

    it('should resolve two byte-identical racers to exactly one winner', async () => {
      const store = newStore();
      const locator = newLocator();
      const created = await store.commitManifest(locator, manifestBytes(1), 'absent');
      if (created === 'lost') {
        throw new Error('fixture commit was refused');
      }

      const next = manifestBytes(2);
      const outcomes = await Promise.all([
        store.commitManifest(locator, next, created),
        store.commitManifest(locator, next, created),
      ]);

      expect(outcomes.filter((outcome) => outcome === 'lost')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome !== 'lost')).toHaveLength(1);
      await expect(store.readManifest(locator)).resolves.toMatchObject({ manifest: next });
    });

    it('should round-trip an object below the single-part ceiling, including a byte range', async () => {
      const store = newStore();
      const locator = newLocator();
      const body = new Uint8Array(randomBytes(1024));

      await store.putObject(locator, 'packs/small.pack', body, {
        contentLength: body.byteLength,
        sha256: sha256Base64(body),
      });

      await expect(collect(await store.getObject(locator, 'packs/small.pack'))).resolves.toStrictEqual(body);
      await expect(
        collect(await store.getObject(locator, 'packs/small.pack', { start: 8, end: 23 })),
      ).resolves.toStrictEqual(body.slice(8, 24));
    });

    it('should round-trip an object above the single-part ceiling through multipart', async () => {
      const store = newStore();
      const locator = newLocator();
      const body = new Uint8Array(randomBytes(conformanceMaxObjectBytes + 1024));

      await store.putObject(locator, 'packs/large.pack', body, {
        contentLength: body.byteLength,
        sha256: sha256Base64(body),
      });

      const stored = await collect(await store.getObject(locator, 'packs/large.pack'));

      expect(stored.byteLength).toBe(body.byteLength);
      expect(createHash('sha256').update(stored).digest('hex')).toBe(createHash('sha256').update(body).digest('hex'));
    });

    it('should list every object under a prefix across several response pages', async () => {
      const store = newStore();
      const locator = newLocator();
      const keys = Array.from({ length: 5 }, (_unused, index) => `packs/${String(index)}.pack`);
      for (const key of keys) {
        const body = new Uint8Array(randomBytes(16));
        // oxlint-disable-next-line eslint/no-await-in-loop -- five fixture writes, sequential is clearer than a pool.
        await store.putObject(locator, key, body, { contentLength: body.byteLength, sha256: sha256Base64(body) });
      }

      const listed: string[] = [];
      for await (const object of store.listObjects(locator, 'packs/')) {
        listed.push(object.key);
        expect(object.bytes).toBe(16);
        expect(object.modifiedAt).toBeInstanceOf(Date);
      }

      expect([...listed].sort()).toStrictEqual([...keys].sort());
    });

    scaleIt('should list past the thousand-key response bound', async () => {
      const store = newStore();
      const locator = newLocator();
      const body = new Uint8Array(randomBytes(1));
      const total = 1001;
      const writes: Array<Promise<void>> = [];
      for (let index = 0; index < total; index += 1) {
        writes.push(
          store.putObject(locator, `packs/${String(index).padStart(5, '0')}.pack`, body, {
            contentLength: body.byteLength,
            sha256: sha256Base64(body),
          }),
        );
      }
      await Promise.all(writes);

      let listed = 0;
      for await (const _object of store.listObjects(locator, 'packs/')) {
        listed += 1;
      }

      expect(listed).toBe(total);
    });

    it('should delete a listed key and ignore a key that was never written', async () => {
      const store = newStore();
      const locator = newLocator();
      const body = new Uint8Array(randomBytes(8));
      await store.putObject(locator, 'packs/listed.pack', body, {
        contentLength: body.byteLength,
        sha256: sha256Base64(body),
      });

      await store.deleteObjects(locator, ['packs/listed.pack', 'packs/never-written.pack']);

      const listed: string[] = [];
      for await (const object of store.listObjects(locator, 'packs/')) {
        listed.push(object.key);
      }

      expect(listed).toStrictEqual([]);
    });

    it('should leave nothing under the tenant prefix after the purge-job prefix delete', async () => {
      const store = newStore();
      const locator = newLocator();
      const body = new Uint8Array(randomBytes(8));
      for (const key of ['packs/a.pack', 'packs/b.pack']) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- two fixture writes, sequential is clearer than a pool.
        await store.putObject(locator, key, body, { contentLength: body.byteLength, sha256: sha256Base64(body) });
      }
      await store.commitManifest(locator, manifestBytes(1), 'absent');

      // D32 sanctions the conformance suite as a caller of the purge primitive,
      // because it runs against a dedicated scratch bucket under a prefix it
      // created itself.
      const removed = await getDriver().deleteEntirePrefixForPurgeJob({
        namespace: 'tenants',
        keyPrefix: `${locator.ownerId}/`,
        tier: 'private',
      });

      expect(removed.deleted).toBe(3);
      await expect(store.readManifest(locator)).resolves.toBeUndefined();

      const listed: string[] = [];
      for await (const object of store.listObjects(locator, '')) {
        listed.push(object.key);
      }

      expect(listed).toStrictEqual([]);
    });
  });
};
