import { createHash, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { Readable } from 'node:stream';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { materializePublishedTags } from '#api/publications/publication-materializer.js';
import type { MaterializerDependencies } from '#api/publications/publication-materializer.js';
import { databaseReachable } from '#testing/database-reachable.js';
import { createMemoryRepositoryStore, seedLease } from '#testing/publication-lease.fixture.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import * as schema from '#database/schema.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * One release per superseded manifest, against a real PostgreSQL (review F2,
 * F5), because this is a property of row locks and an advisory lock and no stub
 * can exhibit it.
 *
 * Two repairs of the same stale publication is the ordinary case, not a rare
 * race: a page load issues one file request per file and each one repairs. Both
 * read the row at the manifest a previous version wrote, so without the lock
 * and the compare-and-swap both would give that manifest's references back, and
 * a blob another publication still names would reach zero.
 *
 * The publisher's half of the same fence — a blob a collection pass is removing
 * — lives in `blob-collector.test.ts`, because charter D21's singleton guard
 * allows no module outside `api/git/maintenance/` to import the collector.
 *
 * The object store here is a `Map`: what is under test is the interleaving of
 * two database transactions. The lease, the materializer and the publication
 * rows are the real ones.
 */

/* The integration config loads `apps/api/.env` before `.env.test`, so this is
   the workspace's own PostgreSQL — the same value the W6 collector suite reads,
   and overridable on the command line. */
const databaseUrl = process.env.DATABASE_URL;

const reachable = typeof databaseUrl === 'string' && databaseUrl.length > 0 && (await databaseReachable(databaseUrl));

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/**
 * A one-shot meeting point: nobody past it until `parties` callers have arrived.
 *
 * @param parties - How many callers must arrive before any of them continues.
 * @returns The arrival, to await at the point that must be reached together.
 */
const meetingPoint = (parties: number): (() => Promise<void>) => {
  let arrived = 0;
  let open: (() => void) | undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived === parties) {
      open?.();
    }
    if (arrived <= parties) {
      await opened;
    }
  };
};

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', ['-c', 'user.name=Tau', '-c', 'user.email=tau@test.invalid', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

describe.skipIf(!reachable)('publication reference counting on a real PostgreSQL', () => {
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const shas: string[] = [];
  const leases: RepositoryLease[] = [];
  const suffix = randomUUID().slice(0, 8);
  const userId = `user_fence_${suffix}`;
  const projectId = `proj_fence_${suffix}`;
  const publicationId = `pub_fence_${suffix}`;

  /** The bucket, as a map of key to bytes. */
  const bucket = new Map<string, Uint8Array<ArrayBuffer>>();

  /** Everything these suites ask of the object store, over that map. */
  const driver = {
    putBlob: vi.fn(async (args: { namespace: string; key: string; body: Uint8Array<ArrayBuffer> }) => {
      bucket.set(`${args.namespace}/${args.key}`, args.body);
      return { lost: false, etag: 'etag', alreadyExisted: false };
    }),
    headBlob: vi.fn(async (args: { namespace: string; key: string }) =>
      bucket.has(`${args.namespace}/${args.key}`)
        ? { contentType: 'application/octet-stream', size: 0, etag: 'etag', cacheControl: '' }
        : undefined,
    ),
    getBlob: vi.fn(async (args: { namespace: string; key: string }) => {
      const stored = bucket.get(`${args.namespace}/${args.key}`);
      if (stored === undefined) {
        throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      }
      return { body: Readable.from([Buffer.from(stored)]), contentType: 'application/octet-stream', etag: 'etag' };
    }),
    deleteBlobs: vi.fn(async (args: { namespace: string; keys: readonly string[] }) => {
      for (const key of args.keys) {
        bucket.delete(`${args.namespace}/${key}`);
      }
      return { deleted: args.keys.length };
    }),
  } as unknown as ObjectStorageService;

  /** The refcount a digest currently holds, or `undefined` when the row is gone. */
  const refcountOf = async (sha256: string): Promise<number | undefined> => {
    const [row] = await database
      .select({ refcount: schema.blobRef.refcount })
      .from(schema.blobRef)
      .where(eq(schema.blobRef.sha256, sha256))
      .limit(1);
    return row?.refcount;
  };

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 8, prepare: false });
    database = drizzle(client, { schema });
  }, 60_000);

  afterAll(async () => {
    await database.delete(schema.publication).where(eq(schema.publication.projectId, projectId));
    await database.delete(schema.project).where(eq(schema.project.id, projectId));
    await database.delete(schema.user).where(eq(schema.user.id, userId));
    if (shas.length > 0) {
      await database.delete(schema.blobRef).where(inArray(schema.blobRef.sha256, shas));
    }
    await Promise.all(leases.map(async (lease) => lease.dispose()));
    await client.end();
  }, 60_000);

  /**
   * One blob already in the bucket, with its row at the given count.
   *
   * @param refcount - What the row starts at.
   * @returns The digest, and the bytes the bucket holds.
   */
  const seedBlob = async (refcount: number): Promise<{ sha256: string; bytes: Uint8Array<ArrayBuffer> }> => {
    const bytes = new Uint8Array(randomBytes(48));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    shas.push(sha256);
    bucket.set(`blobs/${blobKeyFromSha256Hex(sha256)}`, bytes);
    await database.insert(schema.blobRef).values({ sha256, sizeBytes: BigInt(bytes.byteLength), refcount });
    return { sha256, bytes };
  };

  it('should release a superseded manifest once when two repairs run at the same time', async () => {
    /* A project whose publication is stale: the row still names the manifest a
       previous version wrote, and the push that replaced it was never
       materialized (D19). */
    const shared = await seedBlob(2);
    const supersededKey = `publications/${publicationId}/old.json`;
    bucket.set(
      `derivatives/${supersededKey}`,
      utf8(
        JSON.stringify({
          version: 1,
          projectId,
          entryPath: 'main.ts',
          files: { 'main.ts': `sha256:${shared.sha256}` },
          kernels: [],
          runtime: '@taucad/runtime@0.0.0',
          parameters: {},
          createdAt: new Date().toISOString(),
        }),
      ),
    );

    const source = mkdtempSync(join(tmpdir(), 'tau-fence-'));
    mkdirSync(dirname(join(source, 'main.ts')), { recursive: true });
    writeFileSync(join(source, 'main.ts'), utf8(`// ${suffix}\n`));
    git(source, 'init', '--initial-branch=main', '.');
    git(source, 'add', '-A');
    git(source, 'commit', '-m', 'seed');
    git(source, 'tag', '-a', 'v1', '-m', 'named');
    const store = createMemoryRepositoryStore();
    const lease = await seedLease({ store, ownerId: userId, projectId, source });
    leases.push(lease);
    const newDigest = sha256HexFromBytes(utf8(`// ${suffix}\n`));
    shas.push(newDigest);

    await database.insert(schema.user).values({ id: userId, name: 'Fence', email: `${userId}@example.invalid` });
    await database.insert(schema.project).values({ id: projectId, ownerId: userId, name: 'Fence' });
    await database.insert(schema.publication).values({
      id: publicationId,
      projectId,
      ownerId: userId,
      tag: 'v1',
      revisionId: '',
      visibility: 'public',
      manifestKey: supersededKey,
      runtimePin: '~0.1.0',
      kernels: [],
      entryPath: 'main.ts',
      title: 'Fence',
    });

    const bothRead = meetingPoint(2);
    const dependencies = {
      databaseService: { database },
      storage: driver,
      /* No pointer in this fixture; the LFS path has its own coverage (W4b). */
      resolveLfsObject: async () => undefined,
      git: async (directory: string, args: readonly string[], stdin?: string) => {
        const output = new Uint8Array(
          execFileSync('git', [...args], { cwd: directory, ...(stdin === undefined ? {} : { input: stdin }) }),
        );
        /* Both repairs must have read the publication row before either opens
           its transaction, or the scheduler decides the test: `execFileSync`
           blocks the event loop, so one caller's whole transaction can commit
           before the other's read resolves, and the other then skips on the
           idempotence guard rather than on the fence — the assertion passes
           against a materializer with no fence at all (review N1). The row read
           is followed by `peelToCommits`, so holding its `rev-parse` until both
           callers arrive is the interleaving this test is about. */
        if (args[0] === 'rev-parse') {
          await bothRead();
        }
        return output;
      },
    } as unknown as MaterializerDependencies;

    const tags = [{ ref: 'refs/tags/v1', oid: git(lease.directory, 'rev-parse', 'refs/tags/v1').trim() }];
    const both = await Promise.all([
      materializePublishedTags(dependencies, { projectId, ownerId: userId, directory: lease.directory, tags }),
      materializePublishedTags(dependencies, { projectId, ownerId: userId, directory: lease.directory, tags }),
    ]);

    /* Exactly one caller moved the row, so the superseded manifest's shared
       blob was given back once — it is still referenced by whatever else names
       it, and W6's collector will not touch it. */
    expect(both.flat()).toHaveLength(1);
    expect(await refcountOf(shared.sha256)).toBe(1);
    /* And the version that is now served holds exactly one reference. */
    expect(await refcountOf(newDigest)).toBe(1);
  }, 180_000);
});
