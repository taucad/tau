import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import type { DatabaseService } from '#database/database.service.js';
import type { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import type { GitAccess } from '#api/git/git.service.js';
import { commitLease } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type {
  CommitToken,
  ManifestBytes,
  PutObjectOptions,
  RepositoryLocator,
  RepositoryStore,
  StoredObject,
} from '#api/git/store/port.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { project, projectGit, user } from '#database/schema.js';

/**
 * D19's one mechanism, on its own: the generation a push commits is recorded
 * separately from everything derived from it, so a worker killed between the
 * two leaves `derived_generation` behind `generation` — and the next request
 * that touches the project repairs it, with no queue, no retry table and no
 * reconcile job.
 *
 * The kill is simulated by its residue rather than by a signal. What a kill
 * actually leaves is exactly "a committed manifest in the store and a row whose
 * derived generation is behind it"; W2's `commit.integration.test.ts` proves
 * that a worker dying at any named fault point leaves that and nothing worse,
 * so this suite starts from it and proves the repair.
 */

const ownerId = 'user-w4a';
const projectId = 'proj-w4a';
const scratchDirectories: string[] = [];

const scratch = (label: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), `tau-w4a-${label}-`));
  scratchDirectories.push(directory);
  return directory;
};

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
/**
 * The developer's own git configuration never reaches this suite: a global
 * `commit.gpgsign` would make every fixture commit depend on a working agent,
 * which is not what any of these rows is about.
 */
const gitEnvironment = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: tmpdir(),
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  TAU_GIT_PUSH_ADMITTED: '1',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment });

/**
 * Everything the store port promises, in one process's memory. Enough for the
 * commit protocol — which is all this suite drives — and deliberately not a
 * second adapter: `commit.integration.test.ts` and the two-process suite own
 * the real one.
 */
const memoryStore = (): RepositoryStore => {
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  const manifests = new Map<string, { manifest: ManifestBytes; token: CommitToken }>();
  let version = 0;
  const prefix = (locator: RepositoryLocator): string => `${locator.ownerId}/${locator.projectId}/`;

  return {
    capabilities: { conditionalWrite: true, delete: true, list: true, maxObjectBytes: 5 * 1024 ** 3 },
    readManifest: async (locator) => manifests.get(prefix(locator)),
    commitManifest: async (locator, next, expected) => {
      const current = manifests.get(prefix(locator));
      const matches = expected === 'absent' ? current === undefined : current?.token.token === expected.token;
      if (!matches) {
        return 'lost';
      }
      version += 1;
      const token = { token: `v${String(version)}` };
      manifests.set(prefix(locator), { manifest: next, token });
      return token;
    },
    // oxlint-disable-next-line max-params -- the port's own signature
    putObject: async (locator, key, body, _options: PutObjectOptions) => {
      objects.set(`${prefix(locator)}${key}`, body);
    },
    getObject: async (locator, key) => {
      const body = objects.get(`${prefix(locator)}${key}`);
      if (body === undefined) {
        throw new Error(`no such object: ${key}`);
      }
      return Readable.from([Buffer.from(body)]);
    },
    listObjects: (locator, keyPrefix) => {
      const base = prefix(locator);
      const matching: StoredObject[] = [...objects.entries()]
        .filter(([key]) => key.startsWith(`${base}${keyPrefix}`))
        .map(([key, body]) => ({ key: key.slice(base.length), bytes: body.byteLength, modifiedAt: new Date() }));
      return (async function* () {
        yield* matching;
      })();
    },
    deleteObjects: async (locator, keys) => {
      for (const key of keys) {
        objects.delete(`${prefix(locator)}${key}`);
      }
    },
  };
};

/** The one `project_git` row this suite has, as the service reads and writes it. */
type GitRow = { generation: number; derivedGeneration: number; storageBytes: number };

/**
 * A database stub shaped to the three statements the derivation path makes: the
 * generation read, the accounting write, and the transaction the LFS
 * reachability pass opens. `failTransaction` is how a broken derivation is
 * expressed — that is what a worker that dies inside one looks like from here.
 */
const databaseStub = (row: GitRow, control: { failTransaction: boolean }): DatabaseService => {
  const update = (): unknown => ({
    set: () => ({ where: () => ({ returning: async (): Promise<unknown[]> => [] }) }),
  });
  /* oxlint-disable typescript/promise-function-async -- a Drizzle builder is
     both awaitable and chainable; an `async` member would return a promise of
     the builder rather than being one. */
  return {
    database: {
      select: () => ({
        from: () => ({
          /* Two readers, two shapes: the generation read ends in `.limit(1)`,
             and the materializer's publication lookup awaits the builder
             itself. Both are answered here so a derivation that throws is a
             real failure rather than a stub that ran out of methods. */
          where: () =>
            Object.assign(Promise.resolve([] as unknown[]), {
              limit: async (): Promise<unknown[]> => [
                { generation: row.generation, derivedGeneration: row.derivedGeneration },
              ],
            }),
        }),
      }),
      insert: () => ({
        values: (values: Partial<GitRow>) => ({
          onConflictDoUpdate: async (change: { set: Record<string, unknown> }): Promise<void> => {
            if (typeof change.set['generation'] === 'number') {
              row.generation = change.set['generation'];
            }
            if (typeof change.set['derivedGeneration'] === 'number') {
              row.derivedGeneration = change.set['derivedGeneration'];
            }
            if (typeof change.set['storageBytes'] === 'number') {
              row.storageBytes = change.set['storageBytes'];
            } else if (typeof values.storageBytes === 'number') {
              row.storageBytes = values.storageBytes;
            }
          },
        }),
      }),
      transaction: async (run: (transaction: unknown) => Promise<unknown>): Promise<unknown> => {
        if (control.failTransaction) {
          throw new Error('the worker died inside the derivation');
        }
        return run({ execute: async (): Promise<void> => undefined, update });
      },
    },
  } as unknown as DatabaseService;
  /* oxlint-enable typescript/promise-function-async -- end of the builder stub */
};

const createService = (store: RepositoryStore, database: DatabaseService): GitRepositoryService =>
  new GitRepositoryService(
    database,
    { getEntitlements: async () => ({ tier: 'pro', canSyncFiles: true }) } as unknown as CommercialEntitlementsService,
    {} as unknown as ObjectStorageService,
    {
      authorize: async () => ({ projectId, ownerId, role: 'owner' }),
      invalidate: () => undefined,
    } as unknown as ProjectAccessService,
    store,
  );

const access: GitAccess = {
  projectId,
  ownerId,
  role: 'owner',
  remainingBytes: 10 * 1024 ** 3,
  storageLimitBytes: 10 * 1024 ** 3,
};

/**
 * W10 defect 2: a worker killed mid-push leaves its lease directory behind, and
 * admission counts the free bytes of the disk those directories sit on — so a
 * crash used to cost this machine 2.5 GiB of headroom for good. Leases now live
 * under `tau-git-leases/<pid>/`, and a sibling is reclaimed only when its
 * process is gone: two API processes share one `tmpdir` here and must never
 * sweep each other.
 */
describe('abandoned lease directories', () => {
  const leaseRoot = path.join(tmpdir(), 'tau-git-leases');

  it('reclaims a dead worker’s directory on init and leaves a living worker’s alone', async () => {
    /* A pid that is certainly gone: a child of this process, waited for. */
    const corpse = spawn('sh', ['-c', 'exit 0']);
    await new Promise<void>((resolve) => {
      corpse.on('close', () => {
        resolve();
      });
    });
    /* And one that is certainly not: a second process, still running. */
    const living = spawn('sh', ['-c', 'sleep 30']);
    const deadDirectory = path.join(leaseRoot, String(corpse.pid));
    const livingDirectory = path.join(leaseRoot, String(living.pid));
    mkdirSync(deadDirectory, { recursive: true });
    mkdirSync(livingDirectory, { recursive: true });
    writeFileSync(path.join(deadDirectory, 'pack'), Buffer.alloc(4096, 1));

    try {
      const service = createService(
        memoryStore(),
        databaseStub({ storageBytes: 0, generation: 0, derivedGeneration: 0 }, { failTransaction: false }),
      );
      await service.settled();

      expect(existsSync(deadDirectory), 'a dead worker’s lease directory must be reclaimed').toBe(false);
      expect(existsSync(livingDirectory), 'a living worker’s lease directory is not this worker’s to remove').toBe(
        true,
      );
    } finally {
      living.kill('SIGKILL');
      rmSync(livingDirectory, { recursive: true, force: true });
    }
  });
});

describe('GitRepositoryService derived state (D19)', () => {
  const store = memoryStore();
  const locator = repositoryLocator({ ownerId, projectId });
  let committedBytes = 0;

  beforeAll(async () => {
    // One real push, committed through the real protocol, so the manifest this
    // suite repairs against is a manifest a push actually wrote.
    const client = scratch('client');
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'W4a');
    git(client, 'config', 'user.email', 'w4a@tau.test');
    writeFileSync(path.join(client, 'main.scad'), 'cube(10);\n');
    git(client, 'add', '.');
    git(client, 'commit', '--quiet', '-m', 'first revision');
    git(client, 'tag', '-a', 'v1', '-m', 'v1');

    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
    try {
      execFileSync('git', ['push', lease.directory, 'main', 'refs/tags/v1'], {
        cwd: client,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment,
      });
      const result = await commitLease({ store, lease, committedBy: ownerId });
      expect(result.committed).toBe(true);
      if (result.committed) {
        expect(result.manifest.generation).toBe(1);
        committedBytes = result.manifest.packs.reduce((total, pack) => total + pack.bytes, 0);
      }
    } finally {
      await lease.dispose();
    }
    expect(committedBytes).toBeGreaterThan(0);
  }, 60_000);

  afterAll(() => {
    for (const directory of scratchDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('leaves derived_generation behind when the derivation cannot finish, and still serves', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 0, storageBytes: 0 };
    const control = { failTransaction: true };
    const service = createService(store, databaseStub(row, control));

    const advertisement = await service.advertiseRefs(access, 'git-upload-pack');

    /* The push is durable, so the request is answered: a derivation that cannot
       finish is never allowed to turn a committed push into a refusal. */
    expect(Buffer.from(advertisement).toString('utf8')).toContain('refs/heads/main');
    expect(row.derivedGeneration).toBe(0);
    expect(row.storageBytes).toBe(0);
  }, 60_000);

  it('repairs the mismatch on the next request, with no job in between', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 0, storageBytes: 0 };
    const control = { failTransaction: false };
    const service = createService(store, databaseStub(row, control));

    await service.advertiseRefs(access, 'git-upload-pack');

    expect(row.derivedGeneration).toBe(1);
    /* Accounting is the manifest's own live pack bytes — nothing walks a
       directory to find out how large a repository is any more. */
    expect(row.storageBytes).toBe(committedBytes);
  }, 60_000);

  it('does nothing when the row is already caught up', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 1, storageBytes: 7 };
    const service = createService(store, databaseStub(row, { failTransaction: true }));

    await service.advertiseRefs(access, 'git-upload-pack');

    // The failing transaction is never opened, which is how "no work" is visible.
    expect(row.storageBytes).toBe(7);
  }, 60_000);

  /**
   * Review F1, the window the a1 suite had no row for.
   *
   * A worker killed between `commitLease` and `recordGeneration` leaves the
   * store at generation 1 and the row still at `0/0` — which the old gate
   * (`derived_generation >= generation`) read as "caught up", so the repair
   * never fired on any later request. The tag stayed durable and unpublished
   * and the LFS objects the push made reachable kept their `unreachable_at`.
   *
   * The manifest is the authority, so the row's own `generation` is not part of
   * the question any more.
   */
  it('repairs a generation the row never heard about, because the manifest decides', async () => {
    const row: GitRow = { generation: 0, derivedGeneration: 0, storageBytes: 0 };
    const service = createService(store, databaseStub(row, { failTransaction: false }));

    await service.advertiseRefs(access, 'git-upload-pack');

    expect(row.derivedGeneration).toBe(1);
    /* The row converges on the store rather than staying behind it, so a later
       request does not derive the same generation a second time. */
    expect(row.generation).toBe(1);
    expect(row.storageBytes).toBe(committedBytes);
  }, 60_000);

  /**
   * Review F2. `dispose` is `rm -rf`, which suppresses ENOENT and nothing else;
   * a throw used to skip the `release()` on the line after it, so the admission
   * counter never came back and every later request on this worker answered
   * `GIT_LEASE_DISK_FULL` forever. The disposal error also replaced the refusal
   * the request had actually earned.
   */
  it('gives the admission back when a lease cannot be disposed, and keeps the original refusal', async () => {
    const service = createService(
      store,
      databaseStub({ generation: 1, derivedGeneration: 1, storageBytes: 0 }, { failTransaction: false }),
    );
    /* One lease fits and a second does not, so a leaked admission is visible as
       the next request being refused. */
    const { bavail, bsize } = await statfs(tmpdir());
    service.leaseDiskBytesPerLease = Math.floor(bavail * bsize * 0.6);

    await expect(
      service.withLease(access, async (lease) => {
        (lease as { dispose: () => Promise<void> }).dispose = async () => {
          throw new Error('EBUSY: resource busy or locked');
        };
        throw new ServiceUnavailableException({ code: 'GIT_PUSH_RACE_LOST', message: 'retry' });
      }),
      // The refusal the request earned, not the disposal's.
    ).rejects.toMatchObject({ response: { code: 'GIT_PUSH_RACE_LOST' } });

    let admitted = false;
    await service.withLease(access, async () => {
      admitted = true;
    });
    expect(admitted, 'the failed disposal leaked this worker’s lease admission').toBe(true);
  }, 60_000);

  it('refuses another lease when the reservation exceeds this worker’s free disk', async () => {
    const service = createService(
      store,
      databaseStub({ generation: 1, derivedGeneration: 1, storageBytes: 0 }, { failTransaction: false }),
    );
    service.leaseDiskBytesPerLease = Number.MAX_SAFE_INTEGER;

    await expect(service.advertiseRefs(access, 'git-upload-pack')).rejects.toMatchObject({
      response: { code: 'GIT_LEASE_DISK_FULL' },
    });
  });
});

/**
 * Review F4, against a real PostgreSQL: the `derived_generation` write is a
 * compare-and-swap, so a slower deriver can never take the marker — or
 * `storage_bytes` with it — backwards.
 *
 * The interleaving is reached by giving the stale worker a *stale row read*
 * and the real database for its write, which is exactly the race two workers
 * are in: both read `derived_generation = 0`, both derive, and the one that
 * writes last is the one carrying the older generation. The manifest gate
 * (F1) stops this from being reachable through one worker's own row read; the
 * `setWhere` is what holds when two workers read the same stale row.
 *
 * Needs `pnpm infra:up` and a migrated database:
 * `DATABASE_URL=postgresql://dev_user:dev_password@localhost:5432/tau_dev`.
 */
/*
 * The workspace's own gate for a suite that needs a real database
 * (`app/testing/git-storage-migration.integration.test.ts`): probe the
 * configured URL rather than the presence of an environment variable, because
 * the tracked `.env.test` pins a placeholder that answers nothing.
 */
const databaseUrl = process.env.DATABASE_URL;

const databaseReachable = async (): Promise<boolean> => {
  try {
    const probe = postgres(databaseUrl, {
      max: 1,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- postgres.js option name
      connect_timeout: 5,
      onnotice() {
        /* Probe only; a notice is not a diagnostic. */
      },
    });
    try {
      await probe`SELECT 1`;
      return true;
    } finally {
      await probe.end();
    }
  } catch {
    return false;
  }
};

describe.skipIf(!(await databaseReachable()))('derived_generation is a compare-and-swap (F4)', () => {
  const casOwnerId = `user-w4a-cas-${randomBytes(5).toString('hex')}`;
  const casProjectId = `proj-w4a-cas-${randomBytes(5).toString('hex')}`;
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 1, prepare: false });
    database = drizzle(client, { schema });
    await database.insert(user).values({
      id: casOwnerId,
      name: 'W4a CAS',
      email: `${casOwnerId}@tau.test`,
      emailVerified: false,
    });
    await database.insert(project).values({ id: casProjectId, ownerId: casOwnerId, name: 'cas' });
  }, 60_000);

  afterAll(async () => {
    await database.delete(user).where(eq(user.id, casOwnerId));
    await client.end();
  }, 60_000);

  it('refuses a stale deriver’s write and keeps the newer marker and its bytes', async () => {
    const casStore = memoryStore();
    const casLocator = repositoryLocator({ ownerId: casOwnerId, projectId: casProjectId });
    const casAccess: GitAccess = { ...access, projectId: casProjectId, ownerId: casOwnerId };

    const client2 = scratch('cas-client');
    git(client2, 'init', '--quiet', '--initial-branch=main', '.');
    git(client2, 'config', 'user.name', 'W4a');
    git(client2, 'config', 'user.email', 'w4a@tau.test');

    /* Two commits, so the store reaches generation 2 and the two derivers carry
       different generations and different byte totals. */
    const commitAndPush = async (n: number): Promise<number> => {
      writeFileSync(path.join(client2, 'main.scad'), `cube(${String(n)});\n`);
      git(client2, 'add', '.');
      git(client2, 'commit', '--quiet', '-m', `rev ${String(n)}`);
      const lease = await hydrateLease({ store: casStore, locator: casLocator, parentDirectory: scratch('cas-lease') });
      try {
        execFileSync('git', ['push', lease.directory, 'main'], {
          cwd: client2,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment,
        });
        const result = await commitLease({ store: casStore, lease, committedBy: casOwnerId });
        expect(result.committed).toBe(true);
        return result.committed ? result.manifest.packs.reduce((total, pack) => total + pack.bytes, 0) : 0;
      } finally {
        await lease.dispose();
      }
    };
    await commitAndPush(1);
    /* The generation-1 manifest, captured before the store moves on: it is what
       the stale worker's lease is still hydrated from. Its packs stay live
       (the bound is eight), so the lease builds. */
    const generationOne = await casStore.readManifest(casLocator);
    const generationTwoBytes = await commitAndPush(2);

    await database
      .insert(projectGit)
      .values({ projectId: casProjectId, generation: 2, derivedGeneration: 0, storageBytes: 0 })
      .onConflictDoUpdate({
        target: projectGit.projectId,
        set: { generation: 2, derivedGeneration: 0, storageBytes: 0 },
      });

    /* The stale worker: its store still answers with the generation-1 manifest,
       and its row read is frozen at the moment both workers saw
       `derived_generation = 0`. Everything it *writes* goes to the real row,
       which is the race: two workers read the same stale marker, and the one
       carrying the older generation writes last. */
    const staleStore: RepositoryStore = { ...casStore, readManifest: async () => generationOne };
    const frozenRead = { generation: 2, derivedGeneration: 0 };
    /* oxlint-disable typescript/promise-function-async -- a Drizzle builder is
       both awaitable and chainable; an `async` member would return a promise of
       the builder rather than being one. */
    const staleDatabase = {
      database: {
        select: () => ({
          from: () => ({
            leftJoin: () => ({ where: async () => [frozenRead] }),
            where: () => Object.assign(Promise.resolve([] as unknown[]), { limit: async () => [frozenRead] }),
          }),
        }),
        insert: (table: unknown) => database.insert(table as typeof projectGit),
        transaction: async (run: (transaction: unknown) => Promise<unknown>) => database.transaction(run),
      },
    } as unknown as DatabaseService;
    /* oxlint-enable typescript/promise-function-async -- end of the builder stub */

    const fresh = createService(casStore, { database } as unknown as DatabaseService);
    const stale = createService(staleStore, staleDatabase);

    await fresh.advertiseRefs(casAccess, 'git-upload-pack');
    const afterFresh = await database.query.projectGit.findFirst({
      where: eq(projectGit.projectId, casProjectId),
    });
    expect(afterFresh?.derivedGeneration).toBe(2);
    expect(Number(afterFresh?.storageBytes)).toBe(generationTwoBytes);

    /* Now the slow one lands, still believing the marker is 0. */
    await stale.advertiseRefs(casAccess, 'git-upload-pack');
    const afterStale = await database.query.projectGit.findFirst({
      where: eq(projectGit.projectId, casProjectId),
    });
    expect(afterStale?.derivedGeneration, 'a slower deriver rewound the marker').toBe(2);
    expect(Number(afterStale?.storageBytes), 'a slower deriver rewound the byte accounting').toBe(generationTwoBytes);
  }, 120_000);
});
