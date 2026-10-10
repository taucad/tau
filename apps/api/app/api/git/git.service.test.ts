import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { Logger, ServiceUnavailableException, VersioningType } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '#auth/auth.guard.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import type { RedisService } from '#redis/redis.service.js';
import { GitController } from '#api/git/git.controller.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import {
  hydratesFromOthersPerOwnerPerDay,
  hydratesPerCallerPerDay,
  incompleteRepositoryMarker,
} from '#api/git/git.constants.js';
import type { DatabaseService } from '#database/database.service.js';
import type { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import type { GitAccess } from '#api/git/git.service.js';
import { commitLease } from '#api/git/store/commit.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type {
  CommitToken,
  ManifestBytes,
  PutObjectOptions,
  RepositoryLocator,
  RepositoryStore,
  StoredObject,
} from '#api/git/store/port.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { databaseReachable } from '#testing/database-reachable.js';
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
        throw new RepositoryStoreError('missing-pack', `the store holds no '${key}'`);
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
const databaseStub = (
  row: GitRow,
  control: {
    failTransaction: boolean;
    /** What the publication lookup answers: the ref-removal verb's check (D24). */
    publications?: readonly unknown[];
    /** Every `update().set(...)` payload, in order: how a retirement is seen. */
    updates?: Array<Record<string, unknown>>;
  },
): DatabaseService => {
  const { publications = [], updates = [] } = control;
  const update = (): unknown => ({
    set: (payload: Record<string, unknown>) => {
      updates.push(payload);
      return { where: () => ({ returning: async (): Promise<unknown[]> => [] }) };
    },
  });
  /* oxlint-disable typescript/promise-function-async -- a Drizzle builder is
     both awaitable and chainable; an `async` member would return a promise of
     the builder rather than being one. */
  const select = (): unknown => ({
    from: () => ({
      /* Two readers, two shapes: the generation read ends in `.limit(1)`,
         and the materializer's publication lookup awaits the builder
         itself. Both are answered here so a derivation that throws is a
         real failure rather than a stub that ran out of methods. */
      where: () =>
        Object.assign(Promise.resolve([...publications]), {
          limit: async (): Promise<unknown[]> => [
            { generation: row.generation, derivedGeneration: row.derivedGeneration },
          ],
        }),
    }),
  });
  return {
    database: {
      select,
      update,
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
        return run({ execute: async (): Promise<void> => undefined, select, update });
      },
    },
  } as unknown as DatabaseService;
  /* oxlint-enable typescript/promise-function-async -- end of the builder stub */
};

/** A hydrate budget that always has room, unless a row says otherwise. */
const roomyBudget = {
  consumeWindowBudget: async () => ({ allowed: true, count: 1, retryAfterSeconds: 1 }),
} as unknown as PublicationRateLimiterService;

const createService = (
  store: RepositoryStore,
  database: DatabaseService,
  {
    rateLimiter = roomyBudget,
    durableEvents = mock<DurableEventsService>(),
    shutdown = new ShutdownService(),
  }: {
    rateLimiter?: PublicationRateLimiterService;
    durableEvents?: DurableEventsService;
    shutdown?: ShutdownService;
  } = {},
): GitRepositoryService =>
  new GitRepositoryService(
    database,
    { getEntitlements: async () => ({ tier: 'pro', canSyncFiles: true }) } as unknown as CommercialEntitlementsService,
    {} as unknown as ObjectStorageService,
    {
      authorize: async () => ({ projectId, ownerId, role: 'owner' }),
      invalidate: () => undefined,
    } as unknown as ProjectAccessService,
    store,
    rateLimiter,
    durableEvents,
    shutdown,
  );

const access: GitAccess = {
  projectId,
  ownerId,
  role: 'owner',
  callerId: ownerId,
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

  it('reclaims its own pid’s directory at boot, which a run restarted in place under the same pid left behind', async () => {
    const ownDirectory = path.join(leaseRoot, String(process.pid));
    mkdirSync(ownDirectory, { recursive: true });
    writeFileSync(path.join(ownDirectory, 'pack'), Buffer.alloc(4096, 1));

    const service = createService(
      memoryStore(),
      databaseStub({ storageBytes: 0, generation: 0, derivedGeneration: 0 }, { failTransaction: false }),
    );
    await service.settled();

    expect(existsSync(path.join(ownDirectory, 'pack')), 'a previous run’s lease must be reclaimed at boot').toBe(false);
  });
});

describe('GitRepositoryService derived state (D19)', () => {
  const store = memoryStore();
  const locator = repositoryLocator({ ownerId, projectId });
  let committedBytes = 0;
  /* The heads a repair re-announces (W13e): every ref of the manifest, as it now stands. */
  let heads: Record<string, string> = {};

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
    heads = {
      'refs/heads/main': git(client, 'rev-parse', 'refs/heads/main').trim(),
      'refs/tags/v1': git(client, 'rev-parse', 'refs/tags/v1').trim(),
    };

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
    const durableEvents = mock<DurableEventsService>();
    const service = createService(store, databaseStub(row, control), { durableEvents });

    const advertisement = await service.advertiseRefs(access, 'git-upload-pack');

    /* The push is durable, so the request is answered: a derivation that cannot
       finish is never allowed to turn a committed push into a refusal. */
    expect(Buffer.from(advertisement).toString('utf8')).toContain('refs/heads/main');
    expect(row.derivedGeneration).toBe(0);
    expect(row.storageBytes).toBe(0);
    /* D13 (review finding 4): the manifest is durable, so it is announced even
       though the rebuild failed; a parked reader makes no request that repairs it. */
    await service.settled();
    expect(durableEvents.appendRevision.mock.calls).toEqual([
      [{ projectId, ownerId, generation: 1, refs: ['refs/heads/main', 'refs/tags/v1'], heads }],
    ]);
  }, 60_000);

  it('answers without waiting for a slow announcement, which never holds the lease', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 0, storageBytes: 0 };
    const durableEvents = mock<DurableEventsService>();
    const appended = Promise.withResolvers<{ appended: false; reason: 'not-found' }>();
    durableEvents.appendRevision.mockReturnValue(appended.promise);
    const service = createService(store, databaseStub(row, { failTransaction: false }), { durableEvents });

    const advertisement = await service.advertiseRefs(access, 'git-upload-pack');

    expect(Buffer.from(advertisement).toString('utf8')).toContain('refs/heads/main');
    expect(row.derivedGeneration).toBe(1);
    expect(durableEvents.appendRevision).toHaveBeenCalledOnce();
    appended.resolve({ appended: false, reason: 'not-found' });
    await service.settled();
  }, 60_000);

  /* One stop mechanism: the post-reply announcement is held open by the API's
     shutdown registry, which `closeGracefully` waits on before Postgres and
     Redis close and abandons at its own deadline. */
  it('registers an announcement still in flight with the shutdown registry', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 0, storageBytes: 0 };
    const durableEvents = mock<DurableEventsService>();
    const appended = Promise.withResolvers<{ appended: false; reason: 'not-found' }>();
    durableEvents.appendRevision.mockReturnValue(appended.promise);
    const shutdown = new ShutdownService();
    const service = createService(store, databaseStub(row, { failTransaction: false }), { durableEvents, shutdown });
    await service.advertiseRefs(access, 'git-upload-pack');
    expect(durableEvents.appendRevision).toHaveBeenCalledOnce();

    expect(await shutdown.settled(Date.now() + 50), 'the registry must hold the announcement').toBeGreaterThan(0);

    appended.resolve({ appended: false, reason: 'not-found' });
    expect(await shutdown.settled(Date.now() + 5000)).toBe(0);
  }, 60_000);

  it('repairs the mismatch on the next request, with no job in between', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 0, storageBytes: 0 };
    const control = { failTransaction: false };
    const durableEvents = mock<DurableEventsService>();
    const service = createService(store, databaseStub(row, control), { durableEvents });

    await service.advertiseRefs(access, 'git-upload-pack');
    await service.settled();

    expect(row.derivedGeneration).toBe(1);
    /* D13: one `revision` entry for the committed manifest: its refs and their heads (W13e). */
    expect(durableEvents.appendRevision.mock.calls).toEqual([
      [{ projectId, ownerId, generation: 1, refs: ['refs/heads/main', 'refs/tags/v1'], heads }],
    ]);
    /* Accounting is the manifest's own live pack bytes — nothing walks a
       directory to find out how large a repository is any more. */
    expect(row.storageBytes).toBe(committedBytes);
  }, 60_000);

  it('does nothing when the row is already caught up', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 1, storageBytes: 7 };
    const durableEvents = mock<DurableEventsService>();
    const service = createService(store, databaseStub(row, { failTransaction: true }), { durableEvents });

    await service.advertiseRefs(access, 'git-upload-pack');

    // The failing transaction is never opened, which is how "no work" is visible.
    expect(row.storageBytes).toBe(7);
    expect(durableEvents.appendRevision).not.toHaveBeenCalled();
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
 * D22, D24, EQ11 and the terminal `GIT_REPOSITORY_INCOMPLETE`, over a store of
 * their own: the removal verb moves this store's refs, which the D19 rows above
 * must not see.
 */
/*
 * D18 / L6-F5: packs a compaction retires stay in the store for the retention
 * window. They are real storage the plan does not charge, so the sweep that
 * already lists `packs/` records their bytes on the accounting row for the
 * usage route's second figure.
 */
describe('retained packs after a compacting sweep (D18)', () => {
  it('should record the bytes of the retired packs the sweep keeps', async () => {
    const store = memoryStore();
    const retainedProject = 'proj-w8-retained';
    const locator = repositoryLocator({ ownerId, projectId: retainedProject });
    const client = scratch('retained-client');
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'W8');
    git(client, 'config', 'user.email', 'w8@tau.test');
    /* One more live pack than the bound, committed without compacting, so the
       service's next commit compacts. */
    for (let push = 0; push < 9; push += 1) {
      writeFileSync(path.join(client, `part-${String(push)}.scad`), `cube(${String(push)});\n`);
      git(client, 'add', '.');
      git(client, 'commit', '--quiet', '-m', `revision ${String(push)}`);
      if (push === 0) {
        git(client, 'tag', 'v1');
      }
      // oxlint-disable-next-line no-await-in-loop -- each push is its own generation, in order.
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('retained-lease') });
      try {
        execFileSync('git', ['push', lease.directory, 'main', 'refs/tags/v1'], {
          cwd: client,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment,
        });
        // oxlint-disable-next-line no-await-in-loop -- see above.
        const outcome = await commitLease({ store, lease, committedBy: ownerId, packBound: 100 });
        expect(outcome.committed).toBe(true);
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await lease.dispose();
      }
    }
    const updates: Array<Record<string, unknown>> = [];
    const shutdown = new ShutdownService();
    const service = createService(
      store,
      databaseStub({ generation: 9, derivedGeneration: 9, storageBytes: 0 }, { failTransaction: false, updates }),
      { shutdown },
    );

    await service.removeRef({
      access: { ...access, projectId: retainedProject },
      ref: 'refs/tags/v1',
      committedBy: ownerId,
    });
    /* The shutdown registry alone, not `settled()`: the post-reply sweep is held open by it. */
    expect(await shutdown.settled(Date.now() + 60_000)).toBe(0);

    const read = await store.readManifest(locator);
    const live = new Set(decodeManifest(read?.manifest ?? new Uint8Array()).packs.map((pack) => pack.key));
    let retired = 0;
    for await (const object of store.listObjects(locator, 'packs/')) {
      const pack = object.key.endsWith('.idx') ? `${object.key.slice(0, -'.idx'.length)}.pack` : object.key;
      retired += live.has(pack) ? 0 : object.bytes;
    }
    expect(live.size).toBeLessThan(9);
    expect(retired).toBeGreaterThan(0);
    expect(updates).toContainEqual({ retainedBytes: retired });
  }, 120_000);
});

describe('GitRepositoryService security floor (W9)', () => {
  const store = memoryStore();
  const locator = repositoryLocator({ ownerId, projectId });
  const caughtUp = (): DatabaseService =>
    databaseStub({ generation: 1, derivedGeneration: 1, storageBytes: 0 }, { failTransaction: false });

  beforeAll(async () => {
    const client = scratch('floor-client');
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'W9');
    git(client, 'config', 'user.email', 'w9@tau.test');
    writeFileSync(path.join(client, 'main.scad'), 'cube(10);\n');
    git(client, 'add', '.');
    git(client, 'commit', '--quiet', '-m', 'first revision');
    git(client, 'tag', '-a', 'v1', '-m', 'v1');
    git(client, 'tag', 'v2');
    git(client, 'branch', 'conflicts/main/device-b');

    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('floor-lease') });
    try {
      execFileSync(
        'git',
        ['push', lease.directory, 'main', 'refs/tags/v1', 'refs/tags/v2', 'refs/heads/conflicts/main/device-b'],
        { cwd: client, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment },
      );
      const result = await commitLease({ store, lease, committedBy: ownerId });
      expect(result.committed).toBe(true);
    } finally {
      await lease.dispose();
    }
  }, 60_000);

  const manifestReferences = async (): Promise<Record<string, unknown>> => {
    const read = await store.readManifest(locator);
    return read === undefined ? {} : decodeManifest(read.manifest).refs;
  };

  /* D22 / L6-F3 / RV-W9 M3: one owner holds at most half a worker's slots and
     never its last, so with a realistic eight slots a second owner's second
     request and a third owner are still admitted while the first owner is
     saturating the worker. */
  it('keeps one owner to half of eight slots, so two other owners are still admitted', async () => {
    const service = createService(store, caughtUp());
    const { bavail, bsize } = await statfs(tmpdir());
    /* Eight slots on this disk, whatever its size. */
    service.leaseDiskBytesPerLease = Math.floor((bavail * bsize) / 8.5);
    const ownerB: GitAccess = { ...access, ownerId: 'user-w9-b', callerId: 'user-w9-b' };
    const ownerC: GitAccess = { ...access, ownerId: 'user-w9-c', callerId: 'user-w9-c' };
    const gate = Promise.withResolvers<void>();
    const held: Array<Promise<unknown>> = [];
    /** Starts one lease that stays open until the gate opens, and waits until it is admitted. */
    const hold = async (who: GitAccess): Promise<void> => {
      const admitted = Promise.withResolvers<void>();
      held.push(
        service.withLease(who, async () => {
          admitted.resolve();
          await gate.promise;
        }),
      );
      await admitted.promise;
    };

    try {
      for (let lease = 0; lease < 4; lease += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each lease is admitted before the next is asked for
        await hold(access);
      }
      await expect(service.withLease(access, async () => undefined)).rejects.toMatchObject({
        response: { code: 'GIT_LEASE_OWNER_BUSY' },
      });
      await hold(ownerB);
      await hold(ownerB);
      await hold(ownerC);
    } finally {
      gate.resolve();
      await Promise.all(held);
    }
    /* Every admission came back: the first owner is admitted again. */
    await expect(service.withLease(access, async () => 'admitted')).resolves.toBe('admitted');
  }, 60_000);

  /* D22 ruling: a caller's daily bucket is its own per owner, and everybody
     who is not the owner also shares one aggregate; neither is ever the
     owner's, so a read collaborator that spends everything it can does not
     lock the owner out of their own repository. */
  it('refuses a collaborator that spent its hydrate budget and still admits the owner', async () => {
    const counters = new Map<string, number>();
    const limiter = new PublicationRateLimiterService({
      client: {
        // oxlint-disable-next-line max-params -- `eval(script, numberOfKeys, key, expiry, count)` is Redis's own signature
        eval: async (_script: string, _keys: number, key: string, _expiry: string, count: string): Promise<number> => {
          const next = (counters.get(key) ?? 0) + Number(count);
          counters.set(key, next);
          return next;
        },
      },
    } as unknown as RedisService);
    const day = Math.floor(Date.now() / 86_400_000);
    counters.set(`git:hydrate:${ownerId}:caller:user-w9-reader:w86400:${String(day)}`, hydratesPerCallerPerDay);
    const service = createService(store, caughtUp(), { rateLimiter: limiter });
    const reader: GitAccess = { ...access, role: 'read', callerId: 'user-w9-reader' };

    await expect(service.advertiseRefs(reader, 'git-upload-pack')).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_HYDRATE_BUDGET_EXHAUSTED' },
    });
    await expect(service.advertiseRefs(access, 'git-upload-pack')).resolves.toBeDefined();

    /* The aggregate every non-owner shares: spent, it refuses a second reader
       too, and still never the owner. */
    counters.set(`git:hydrate:${ownerId}:others:w86400:${String(day)}`, hydratesFromOthersPerOwnerPerDay);
    await expect(
      service.advertiseRefs({ ...reader, callerId: 'user-w9-other-reader' }, 'git-upload-pack'),
    ).rejects.toMatchObject({ status: 429 });
    await expect(service.advertiseRefs(access, 'git-upload-pack')).resolves.toBeDefined();
  }, 60_000);

  /* RV-W10 F1: a cloud host acts for its owner but reads on its own bucket,
     outside the owner's and outside the aggregate, so a host looping on one
     project can deny neither the owner's sync nor a collaborator's. */
  it('should give a cloud host its own hydrate bucket, so a host at its budget leaves the owner unaffected', async () => {
    const counters = new Map<string, number>();
    const limiter = new PublicationRateLimiterService({
      client: {
        // oxlint-disable-next-line max-params -- `eval(script, numberOfKeys, key, expiry, count)` is Redis's own signature
        eval: async (_script: string, _keys: number, key: string, _expiry: string, count: string): Promise<number> => {
          const next = (counters.get(key) ?? 0) + Number(count);
          counters.set(key, next);
          return next;
        },
      },
    } as unknown as RedisService);
    const day = Math.floor(Date.now() / 86_400_000);
    const service = createService(store, caughtUp(), { rateLimiter: limiter });
    const host = await service.authorize({ projectId, userId: ownerId, mode: 'read', viaDevice: 'agent_cloud' });

    await expect(service.advertiseRefs(host, 'git-upload-pack')).resolves.toBeDefined();
    expect(host.callerId).toBe('device:agent_cloud');
    expect([...counters.keys()]).toEqual([`git:hydrate:${ownerId}:caller:device:agent_cloud:w86400:${String(day)}`]);

    counters.set(`git:hydrate:${ownerId}:caller:device:agent_cloud:w86400:${String(day)}`, hydratesPerCallerPerDay);
    await expect(service.advertiseRefs(host, 'git-upload-pack')).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_HYDRATE_BUDGET_EXHAUSTED' },
    });
    await expect(service.advertiseRefs(access, 'git-upload-pack')).resolves.toBeDefined();
  }, 60_000);

  /* RV-W10 F2: `write` in every mode, so the owner-only removal verb refuses a
     host even if the transport's allowlist ever admitted the route. */
  it('should hold a cloud host at write in every mode, and refuse it the removal verb', async () => {
    const service = createService(store, caughtUp());
    vi.spyOn(service, 'readOwnerUsage').mockResolvedValue({ storageBytes: 0, lfsBytes: 0, retainedBytes: 0 });

    const accesses = await Promise.all(
      (['read', 'write', 'finalize'] as const).map(async (mode) =>
        service.authorize({ projectId, userId: ownerId, mode, viaDevice: 'agent_cloud' }),
      ),
    );

    expect(accesses.map((granted) => granted.role)).toEqual(['write', 'write', 'write']);
    await expect(
      service.removeRef({ access: accesses[2]!, ref: 'refs/tags/v2', committedBy: ownerId }),
    ).rejects.toMatchObject({ response: { code: 'GIT_REF_REMOVAL_OWNER_ONLY' } });
    expect(await manifestReferences()).toHaveProperty(['refs/tags/v2']);
  });

  it('answers 429 with the wait when a hydrate budget is spent, before hydrating', async () => {
    let hydrated = false;
    const watched: RepositoryStore = {
      ...store,
      readManifest: async (at) => {
        hydrated = true;
        return store.readManifest(at);
      },
    };
    const spent = {
      consumeWindowBudget: async (args: { key: string }) => {
        expect(args.key).toBe(`git:hydrate:${ownerId}:owner`);
        return { allowed: false, count: hydratesPerCallerPerDay + 1, retryAfterSeconds: 3600 };
      },
    } as unknown as PublicationRateLimiterService;

    await expect(
      createService(watched, caughtUp(), { rateLimiter: spent }).advertiseRefs(access, 'git-upload-pack'),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_HYDRATE_BUDGET_EXHAUSTED', retryAfterSeconds: 3600 },
    });
    expect(hydrated).toBe(false);
  });

  /* L6-F8: a 500 that says so in words the client can classify, never a 503. */
  it('answers a manifest naming a missing pack with a terminal 500 that opens with the marker', async () => {
    const damaged: RepositoryStore = {
      ...store,
      /* The store holds none of the packs the manifest names. */
      getObject: async (_locator, key) => {
        throw new RepositoryStoreError('missing-pack', `the store holds no '${key}'`);
      },
    };

    const refusal = createService(damaged, caughtUp()).advertiseRefs(access, 'git-upload-pack');
    await expect(refusal).rejects.toMatchObject({ status: 500, response: { code: 'GIT_REPOSITORY_INCOMPLETE' } });
    await expect(refusal).rejects.not.toBeInstanceOf(ServiceUnavailableException);
    let message = '';
    try {
      await refusal;
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.startsWith(incompleteRepositoryMarker)).toBe(true);
    expect(message).not.toContain('packs/');
  });

  /**
   * I9 through the real receive path (RV-W9 M2): a lease's `receive-pack`,
   * its configuration and its hook, fed crafted commits by a stock `git push`.
   * A tree with two `events` entries is refused by `receive.fsckObjects`
   * before the hook, and a segment whose mode changes under the same bytes is
   * refused by the hook; an ordinary two-device append still lands.
   */
  describe('chat segments through receive-pack (I9)', () => {
    const chatRef = 'refs/tau/chats/chat_w9';
    let client: string;
    let leaseDirectory: string;
    let dispose: () => Promise<void>;
    let base: string;

    const push = (commit: string): { ok: boolean; output: string } => {
      try {
        execFileSync('git', ['push', '--quiet', leaseDirectory, `${commit}:${chatRef}`], {
          cwd: client,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment,
        });
        return { ok: true, output: '' };
      } catch (error) {
        return { ok: false, output: String((error as { stderr?: unknown }).stderr) };
      }
    };
    /** A commit on `parent` whose tree is `tree`. */
    const commitTree = (tree: string, parent: string): string =>
      git(client, 'commit-tree', tree, '-p', parent, '-m', 'chat').trim();

    beforeAll(async () => {
      client = scratch('chat-client');
      git(client, 'init', '--quiet', '--initial-branch=main', '.');
      git(client, 'config', 'user.name', 'W9');
      git(client, 'config', 'user.email', 'w9@tau.test');
      mkdirSync(path.join(client, 'events'));
      writeFileSync(path.join(client, 'events', 'device-a.jsonl'), '{"n":1}\n');
      writeFileSync(path.join(client, 'events', 'device-b.jsonl'), '{"n":1}\n');
      git(client, 'add', '.');
      git(client, 'commit', '--quiet', '-m', 'chat');
      base = git(client, 'rev-parse', 'HEAD').trim();

      const lease = await hydrateLease({
        store: memoryStore(),
        locator: repositoryLocator({ ownerId, projectId: 'proj-w9-chat' }),
        parentDirectory: scratch('chat-lease'),
      });
      leaseDirectory = lease.directory;
      dispose = async () => lease.dispose();
      expect(push(base).ok).toBe(true);
    }, 60_000);

    afterAll(async () => {
      await dispose();
    });

    it('refuses a tree with two events entries, which readers resolve differently', () => {
      const original = git(client, 'rev-parse', `${base}:events`).trim();
      writeFileSync(path.join(client, 'events', 'device-b.jsonl'), '{"forged":true}\n');
      git(client, 'add', '.');
      const forged = git(client, 'write-tree').trim();
      const forgedEvents = git(client, 'rev-parse', `${forged}:events`).trim();
      git(client, 'checkout', '--quiet', '--', '.');
      git(client, 'reset', '--quiet', '--hard', base);
      /* Raw tree bytes, because no porcelain writes a duplicate entry. */
      const entry = (oid: string): Uint8Array<ArrayBuffer> =>
        Buffer.concat([Buffer.from('40000 events\0'), Buffer.from(oid, 'hex')]);
      const duplicate = execFileSync('git', ['hash-object', '-t', 'tree', '-w', '--literally', '--stdin'], {
        cwd: client,
        input: Buffer.concat([entry(original), entry(forgedEvents)]),
        env: gitEnvironment,
        encoding: 'utf8',
      }).trim();

      const pushed = push(commitTree(duplicate, base));
      expect(pushed.ok, 'a duplicate-entry tree reached the ref').toBe(false);
      expect(pushed.output).toMatch(/duplicateEntries|duplicate entries/iu);
    });

    it('refuses a segment whose mode changes under the same bytes', () => {
      git(client, 'reset', '--quiet', '--hard', base);
      git(client, 'update-index', '--chmod=+x', 'events/device-a.jsonl');
      const tree = git(client, 'write-tree').trim();
      git(client, 'reset', '--quiet', '--hard', base);

      const pushed = push(commitTree(tree, base));
      expect(pushed.ok, 'a mode change reached the ref').toBe(false);
      expect(pushed.output).toContain('chat log only grows');
    });

    it('lands an ordinary two-device append', () => {
      git(client, 'reset', '--quiet', '--hard', base);
      writeFileSync(path.join(client, 'events', 'device-a.jsonl'), '{"n":1}\n{"n":2}\n');
      writeFileSync(path.join(client, 'events', 'device-b.jsonl'), '{"n":1}\n{"n":3}\n');
      writeFileSync(path.join(client, 'events', 'device-c.jsonl'), '{"n":1}\n');
      git(client, 'add', '.');
      git(client, 'commit', '--quiet', '-m', 'append');

      const pushed = push(git(client, 'rev-parse', 'HEAD').trim());
      expect(pushed.ok, pushed.output).toBe(true);
    });
  });

  describe('the audited ref-removal verb (D24)', () => {
    const published = { id: 'pub_w9', title: 'Bracket v1', visibility: 'public' };

    it('refuses a collaborator, and any ref that is not a named version or a conflict line', async () => {
      const service = createService(store, caughtUp());

      await expect(
        service.removeRef({ access: { ...access, role: 'write' }, ref: 'refs/tags/v2', committedBy: 'user-w9-writer' }),
      ).rejects.toMatchObject({ status: 403 });
      for (const ref of ['refs/heads/main', 'refs/tau/chats/chat_1', 'refs/tags/../heads/main']) {
        // oxlint-disable-next-line no-await-in-loop -- one refusal per ref
        await expect(service.removeRef({ access, ref, committedBy: ownerId })).rejects.toMatchObject({
          status: 400,
          response: { code: 'GIT_REF_NOT_REMOVABLE' },
        });
      }
      expect(await manifestReferences()).toHaveProperty(['refs/tags/v2']);
    });

    /* RV-W9 M1: the publication has to reach the client, or it can never be
       confirmed. Driven over HTTP through the controller and the global
       exception filter, with the real service deciding. */
    it('answers DELETE on a published name with 409 whose body carries the publication', async () => {
      const service = createService(
        store,
        databaseStub(
          { generation: 1, derivedGeneration: 1, storageBytes: 0 },
          { failTransaction: false, publications: [published] },
        ),
      );
      vi.spyOn(service, 'readOwnerUsage').mockResolvedValue({ storageBytes: 0, lfsBytes: 0, retainedBytes: 0 });
      const moduleRef = await Test.createTestingModule({
        controllers: [GitController],
        providers: [
          { provide: GitRepositoryService, useValue: service },
          { provide: GitLfsService, useValue: {} },
          { provide: PublicationRateLimiterService, useValue: roomyBudget },
          { provide: ConfigService, useValue: { get: () => 'https://api.tau.test' } },
          { provide: APP_FILTER, useClass: HttpExceptionFilter },
        ],
      })
        .overrideGuard(AuthGuard)
        .useValue({
          canActivate: (context: ExecutionContext): boolean => {
            context.switchToHttp().getRequest<{ user?: unknown }>().user = { id: ownerId };
            return true;
          },
        })
        .compile();
      const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
      app.enableVersioning({ type: VersioningType.URI });
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      try {
        const answer = await app.inject({
          method: 'DELETE',
          url: `/v1/git/${projectId}.git/refs?name=${encodeURIComponent('refs/tags/v1')}`,
        });

        expect(answer.statusCode).toBe(409);
        expect(answer.json()).toMatchObject({ code: 'GIT_REF_PUBLISHED', publication: published });
        expect(await manifestReferences()).toHaveProperty(['refs/tags/v1']);
      } finally {
        await app.close();
      }
    }, 60_000);

    it('retires the publication with the name once confirmed, in the same step (D24, RV-W9 M5)', async () => {
      const updates: Array<Record<string, unknown>> = [];
      const service = createService(
        store,
        databaseStub(
          { generation: 1, derivedGeneration: 1, storageBytes: 0 },
          { failTransaction: false, publications: [published], updates },
        ),
      );

      await expect(service.removeRef({ access, ref: 'refs/tags/v1', committedBy: ownerId })).resolves.toStrictEqual({
        outcome: 'confirm',
        publication: published,
      });
      expect(updates).toStrictEqual([]);

      const removed = await service.removeRef({
        access,
        ref: 'refs/tags/v1',
        committedBy: ownerId,
        confirmPublicationId: published.id,
      });
      expect(removed).toMatchObject({ outcome: 'removed', ref: 'refs/tags/v1', publication: published });
      expect(updates[0]).toMatchObject({ unpublishedAt: expect.any(Date) as unknown });
      expect(await manifestReferences()).not.toHaveProperty(['refs/tags/v1']);
    }, 60_000);

    it('removes an abandoned conflict line at the owner’s request and records it without a tip (EQ11)', async () => {
      const durableEvents = mock<DurableEventsService>();
      const service = createService(store, caughtUp(), { durableEvents });

      await service.removeRef({ access, ref: 'refs/heads/conflicts/main/device-b', committedBy: ownerId });
      await service.settled();

      const read = await store.readManifest(locator);
      const manifest = decodeManifest(read?.manifest ?? new Uint8Array());
      /* A removal is a committed manifest like a push, so open clients hear of it (D13).
         Last, because `caughtUp()` pins the row at generation 1 and the request's
         own repair announces the earlier removal's generation first. */
      expect(durableEvents.appendRevision.mock.lastCall).toEqual([
        /* A removal names no head, so every reader pulls it (W13e). */
        {
          projectId,
          ownerId,
          generation: manifest.generation,
          refs: ['refs/heads/conflicts/main/device-b'],
          heads: {},
        },
      ]);
      expect(manifest.refs).not.toHaveProperty(['refs/heads/conflicts/main/device-b']);
      expect(manifest.refs).toHaveProperty(['refs/heads/main']);
      expect(manifest.pushes.at(-1)).toMatchObject({
        committedBy: ownerId,
        refs: [{ ref: 'refs/heads/conflicts/main/device-b' }],
      });
      expect(manifest.pushes.at(-1)?.refs[0]).not.toHaveProperty('tip');

      await expect(
        service.removeRef({ access, ref: 'refs/heads/conflicts/main/device-b', committedBy: ownerId }),
      ).rejects.toMatchObject({ status: 404, response: { code: 'GIT_REF_NOT_FOUND' } });
    }, 60_000);

    it('refuses a removal once the process begins to stop, before it commits', async () => {
      const shutdown = new ShutdownService();
      const service = createService(store, caughtUp(), { shutdown });
      shutdown.stop();

      await expect(service.removeRef({ access, ref: 'refs/tags/v2', committedBy: ownerId })).rejects.toMatchObject({
        status: 503,
        response: { code: 'GIT_SERVICE_RESTARTING' },
      });
      expect(await manifestReferences()).toHaveProperty(['refs/tags/v2']);
    }, 60_000);

    it('answers a committed removal as removed when its generation write fails, and says so', async () => {
      const service = createService(store, caughtUp());
      const recordGeneration = vi
        .spyOn(
          GitRepositoryService.prototype as unknown as { recordGeneration: () => Promise<void> },
          'recordGeneration',
        )
        .mockRejectedValue(new Error('the database is down'));
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      try {
        await expect(service.removeRef({ access, ref: 'refs/tags/v2', committedBy: ownerId })).resolves.toMatchObject({
          outcome: 'removed',
          ref: 'refs/tags/v2',
        });
        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({ projectId }),
          expect.stringContaining('A committed ref removal could not record its generation'),
        );
        expect(await manifestReferences()).not.toHaveProperty(['refs/tags/v2']);
        await service.settled();
      } finally {
        recordGeneration.mockRestore();
        warn.mockRestore();
      }
    }, 60_000);
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
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!(await databaseReachable(databaseUrl)))('derived_generation is a compare-and-swap (F4)', () => {
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

/*
 * W10 (D21, EQ11): a cloud host acts for its owner, and the server's own
 * record says so — the push log names the device the push came through, and
 * the host is held at `write` whatever the owner's role is (I10).
 */
describe('GitRepositoryService cloud host attribution (W10)', () => {
  it('should hold a host at write and record its device on the push it commits, and none on the owner own', async () => {
    const store = memoryStore();
    const locator = repositoryLocator({ ownerId, projectId });
    const service = createService(
      store,
      databaseStub({ generation: 0, derivedGeneration: 0, storageBytes: 0 }, { failTransaction: false }),
    );
    const client = scratch('host-client');
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'W10');
    git(client, 'config', 'user.email', 'w10@tau.test');
    const pushOnce = async (file: string, viaDevice?: string): Promise<void> => {
      writeFileSync(path.join(client, file), `${file}\n`);
      git(client, 'add', '.');
      git(client, 'commit', '--quiet', '-m', file);
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('host-lease') });
      try {
        execFileSync('git', ['push', '--quiet', lease.directory, 'main'], {
          cwd: client,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment,
        });
        const result = await commitLease({
          store,
          lease,
          committedBy: ownerId,
          ...(viaDevice === undefined ? {} : { viaDevice }),
        });
        expect(result.committed).toBe(true);
      } finally {
        await lease.dispose();
      }
    };

    const hosted = await service.authorize({ projectId, userId: ownerId, mode: 'read', viaDevice: 'agent_cloud' });
    await pushOnce('agent-turn.scad', hosted.viaDevice);
    await pushOnce('owner-edit.scad');

    expect(hosted).toMatchObject({ ownerId, role: 'write', viaDevice: 'agent_cloud' });
    const read = await store.readManifest(locator);
    const [hostPush, ownerPush] = read === undefined ? [] : decodeManifest(read.manifest).pushes;
    expect(hostPush).toMatchObject({ committedBy: ownerId, viaDevice: 'agent_cloud' });
    expect(ownerPush).toMatchObject({ committedBy: ownerId });
    expect(ownerPush).not.toHaveProperty('viaDevice');
  }, 60_000);
});
