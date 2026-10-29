import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { finished } from 'node:stream/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  GoneException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  VersioningType,
} from '@nestjs/common';
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
import { MemoryOwnerInFlightCap, OwnerInFlightGate } from '#api/git/admission/owner-in-flight.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { StorageGitService } from '#api/git/worker/storage-git.service.js';
import type { LeaseRequest } from '#api/git/lease-host.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import { loopbackExecutor, loopbackReceiptChannel } from '#testing/loopback-executor.js';
import { developmentPublicKeysJson, developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { parsePublicKeys, parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import { signReceipt } from '#api/git/forwarding/contract/receipt.js';
import {
  DeriveScheduler,
  deriveLagGraceSeconds,
  deriveScanIntervalMilliseconds,
} from '#api/git/forwarding/derive-scheduler.js';
import type { StorageReceiptFacts } from '#api/git/forwarding/contract/receipt.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import type { GitAccess, ReceiptVerification } from '#api/git/git.service.js';
import { commitLease } from '#api/git/store/commit.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { hydrateLease } from '#api/git/store/lease.js';
import type * as LeaseModule from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import {
  compactionCommitter,
  decodeManifest,
  encodeManifest,
  succeedManifest,
  tombstoneManifest,
} from '#api/git/store/manifest.js';
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
import { project, projectDeletion, projectGit, user } from '#database/schema.js';

/* Every lease is still a real one; the spy is how DB1 shows an advertisement builds none. */
vi.mock('#api/git/store/lease.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LeaseModule>();
  return { ...actual, hydrateLease: vi.fn(actual.hydrateLease) };
});

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
      // The committer streams lease files (DA4); a memory store keeps their bytes.
      objects.set(
        `${prefix(locator)}${key}`,
        typeof body === 'function' ? new Uint8Array(await buffer(await body())) : body,
      );
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
    deleting?: boolean;
    storageAccountId?: string;
    beforeTransaction?: () => void;
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
    from: (table: unknown) => ({
      /* Two readers, two shapes: the generation read ends in `.limit(1)`,
         and the materializer's publication lookup awaits the builder
         itself. Both are answered here so a derivation that throws is a
         real failure rather than a stub that ran out of methods. */
      where: () =>
        Object.assign(Promise.resolve([...publications]), {
          limit: async (): Promise<unknown[]> =>
            table === projectDeletion
              ? control.deleting
                ? [{ projectId, ownerId }]
                : []
              : table === project
                ? [{ storageAccountId: control.storageAccountId ?? null, ownerId }]
                : [{ generation: row.generation, derivedGeneration: row.derivedGeneration }],
        }),
    }),
  });
  const insert = () => ({
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
  });
  return {
    database: {
      select,
      update,
      insert,
      transaction: async (run: (transaction: unknown) => Promise<unknown>): Promise<unknown> => {
        control.beforeTransaction?.();
        if (control.failTransaction) {
          throw new Error('the worker died inside the derivation');
        }
        return run({ execute: async (): Promise<void> => undefined, select, update, insert });
      },
    },
  } as unknown as DatabaseService;
  /* oxlint-enable typescript/promise-function-async -- end of the builder stub */
};

/** A hydrate budget that always has room, unless a row says otherwise. */
const roomyBudget = {
  consumeWindowBudget: async () => ({ allowed: true, count: 1, retryAfterSeconds: 1 }),
} as unknown as PublicationRateLimiterService;

/**
 * Each API service's tau-storage worker (DC1): the suites drive the API
 * through an in-process loopback executor, and the lease, admission and commit
 * knobs live on the worker now.
 */
const workers = new WeakMap<GitRepositoryService, StorageGitService>();

const workerOf = (service: GitRepositoryService): StorageGitService => {
  const worker = workers.get(service);
  if (worker === undefined) {
    throw new Error('This service has no loopback worker');
  }
  return worker;
};

/** Holds a lease on the service's worker for `work`, as the API's own `withLease` did before DC1. */
// oxlint-disable-next-line max-params -- the lease host's own (operation, request, work) plus the service it runs on
const holdLease = async <T>(
  service: GitRepositoryService,
  who: Pick<GitAccess, 'ownerId' | 'projectId' | 'remainingBytes'> & Partial<GitAccess>,
  work: (lease: RepositoryLease) => Promise<T>,
  operation = 'derive',
): Promise<T> =>
  (
    workerOf(service) as unknown as {
      runLease: (operation: string, request: LeaseRequest, work: (lease: RepositoryLease) => Promise<T>) => Promise<T>;
    }
  ).runLease(
    operation,
    {
      locator: async () => repositoryLocator({ ownerId: who.ownerId, projectId: who.projectId }),
      ownerId: who.ownerId,
      remainingBytes: who.remainingBytes,
    },
    work,
  );

/** Waits for both sides' post-reply work: the API's announcements, the worker's disposals and sweeps. */
const settledBoth = async (service: GitRepositoryService): Promise<void> => {
  await workerOf(service).settled();
  await service.settled();
  await workerOf(service).settled();
};

const createService = (
  store: RepositoryStore,
  database: DatabaseService,
  {
    rateLimiter = roomyBudget,
    durableEvents = mock<DurableEventsService>(),
    shutdown = new ShutdownService(),
    metrics,
    owners,
    receipts,
  }: {
    rateLimiter?: PublicationRateLimiterService;
    durableEvents?: DurableEventsService;
    shutdown?: ShutdownService;
    metrics?: MetricsService;
    owners?: OwnerInFlightGate;
    receipts?: ReceiptVerification;
  } = {},
): GitRepositoryService => {
  // oxlint-disable-next-line prefer-const -- assigned after the worker whose receipt channel closes over it
  let api: GitRepositoryService | undefined;
  const worker = new StorageGitService({
    store,
    shutdown,
    ...(metrics === undefined ? {} : { metrics }),
    receipts: loopbackReceiptChannel(async (receipt) => api?.applyReceipt(receipt)),
  });
  api = new GitRepositoryService(
    database,
    { getEntitlements: async () => ({ tier: 'pro', canSyncFiles: true }) } as unknown as CommercialEntitlementsService,
    mock<ObjectStorageService>({
      account: {
        id: 'tau-default',
        endpoint: 'http://localhost',
        region: 'test',
        bucket: 'test',
        forcePathStyle: true,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      },
    }),
    {
      authorize: async () => ({ projectId, ownerId, role: 'owner' }),
      invalidate: () => undefined,
    } as unknown as ProjectAccessService,
    store,
    rateLimiter,
    durableEvents,
    shutdown,
    metrics,
    undefined,
    loopbackExecutor(worker),
    receipts,
    owners,
  );
  workers.set(api, worker);
  return api;
};

const access: GitAccess = {
  projectId,
  ownerId,
  role: 'owner',
  callerId: ownerId,
  remainingBytes: 10 * 1024 ** 3,
  storageLimitBytes: 10 * 1024 ** 3,
};

/** One pkt-line flush: a request body that names no `want` and pushes no command. */
const flushBody = (): Readable => Readable.from([Buffer.from('0000')]);

/** The post-reply step a fetch's lease ends with: disposal, then its admission given back. */
type FetchDisposal = { disposeAfterFetch: (...args: never[]) => Promise<void> };

/**
 * One `git-upload-pack` RPC that wants nothing, read to its end: the request
 * that takes a lease and hydrates it now that `info/refs` takes none (DB1).
 * Resolves once the lease is disposed and its admission is back, which happens
 * after the child closes rather than when its output ends; never waits on the
 * rest of the post-reply work, which a row may be holding open.
 */
const fetchOnce = async (service: GitRepositoryService, who: GitAccess): Promise<void> => {
  const disposal = vi.spyOn(workerOf(service) as unknown as FetchDisposal, 'disposeAfterFetch');
  try {
    const output = await service.uploadPack({
      access: who,
      body: flushBody(),
      gzipped: false,
    });
    output.resume();
    await finished(output);
    await vi.waitFor(() => {
      expect(disposal).toHaveBeenCalledOnce();
    });
    await disposal.mock.results[0]?.value;
  } finally {
    disposal.mockRestore();
  }
};

/** The flush-only `git-receive-pack` RPC `git push` authenticates with: a lease, and no commit. */
const pushProbe = async (service: GitRepositoryService, who: GitAccess): Promise<Uint8Array<ArrayBuffer>> =>
  service.receivePack({
    access: who,
    committedBy: who.callerId,
    body: flushBody(),
    gzipped: false,
  });

/**
 * W10 defect 2: a worker killed mid-push leaves its lease directory behind, and
 * admission counts the free bytes of the disk those directories sit on — so a
 * crash used to cost this machine that lease's headroom for good. Leases now live
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
      await settledBoth(service);

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
    await settledBoth(service);

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

  it('should refuse stale cached owner and collaborator admission before reading remote bytes', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 0, storageBytes: 0 };
    const control = { failTransaction: false, deleting: false };
    const service = createService(store, databaseStub(row, control));
    const cached = await service.authorize({ projectId, userId: ownerId, mode: 'read' });
    control.deleting = true;
    await expect(service.authorize({ projectId, userId: ownerId, mode: 'read' })).rejects.toBeInstanceOf(GoneException);
    await expect(service.authorize({ projectId, userId: 'collaborator', mode: 'read' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const read = vi.spyOn(store, 'readManifest');
    try {
      await expect(service.advertiseRefs(cached, 'git-upload-pack')).rejects.toThrow('deleted');
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      await settledBoth(service);
    }
  });

  it('should refuse a foreign storage account without reading the default store', async () => {
    const service = createService(
      store,
      databaseStub(
        { generation: 1, derivedGeneration: 0, storageBytes: 0 },
        { failTransaction: false, storageAccountId: 'foreign' },
      ),
    );
    const read = vi.spyOn(store, 'readManifest');
    try {
      await expect(service.advertiseRefs(access, 'git-upload-pack')).rejects.toThrow('storage account is unavailable');
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      await settledBoth(service);
    }
  });

  it('should leave accounting unchanged when deletion wins before the derive transaction', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 0, storageBytes: 0 };
    const control = {
      failTransaction: false,
      deleting: false,
      beforeTransaction: () => {
        control.deleting = true;
      },
    };
    const service = createService(store, databaseStub(row, control));
    await fetchOnce(service, access);
    await settledBoth(service);
    expect(row).toEqual({ generation: 1, derivedGeneration: 0, storageBytes: 0 });
  });

  it('leaves derived_generation behind when the derivation cannot finish, and still serves', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 0, storageBytes: 0 };
    const control = { failTransaction: true };
    const durableEvents = mock<DurableEventsService>();
    const service = createService(store, databaseStub(row, control), { durableEvents });

    await fetchOnce(service, access);

    /* The push is durable, so the request is answered: a derivation that cannot
       finish is never allowed to turn a committed push into a refusal. */
    await expect(service.advertiseRefs(access, 'git-upload-pack')).resolves.toBeDefined();
    expect(row.derivedGeneration).toBe(0);
    expect(row.storageBytes).toBe(0);
    /* D13 (review finding 4): the manifest is durable, so it is announced even
       though the rebuild failed; a parked reader makes no request that repairs it. */
    await settledBoth(service);
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

    await fetchOnce(service, access);

    expect(row.derivedGeneration).toBe(1);
    expect(durableEvents.appendRevision).toHaveBeenCalledOnce();
    appended.resolve({ appended: false, reason: 'not-found' });
    await settledBoth(service);
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
    await fetchOnce(service, access);
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

    await fetchOnce(service, access);
    await settledBoth(service);

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

    await fetchOnce(service, access);

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

    await fetchOnce(service, access);

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
    workerOf(service).leaseReservationFloorBytes = Math.floor(bavail * bsize * 0.6);

    await expect(
      holdLease(service, access, async (lease) => {
        (lease as { dispose: () => Promise<void> }).dispose = async () => {
          throw new Error('EBUSY: resource busy or locked');
        };
        throw new ServiceUnavailableException({ code: 'GIT_PUSH_RACE_LOST', message: 'retry' });
      }),
      // The refusal the request earned, not the disposal's.
    ).rejects.toMatchObject({ response: { code: 'GIT_PUSH_RACE_LOST' } });

    let admitted = false;
    await holdLease(service, access, async () => {
      admitted = true;
    });
    expect(admitted, 'the failed disposal leaked this worker’s lease admission').toBe(true);
  }, 60_000);

  it('refuses another lease when the reservation exceeds this worker’s free disk', async () => {
    const service = createService(
      store,
      databaseStub({ generation: 1, derivedGeneration: 1, storageBytes: 0 }, { failTransaction: false }),
    );
    workerOf(service).leaseReservationFloorBytes = Number.MAX_SAFE_INTEGER;
    workerOf(service).admissionWaitMilliseconds = 0;

    await expect(fetchOnce(service, access)).rejects.toMatchObject({
      response: { code: 'GIT_LEASE_DISK_FULL' },
    });
  });
});

/**
 * DC1's receipt rules and the repair after a lost receipt (W9 Finding 2). The
 * API changes a row only for a receipt that is signed, names this repository,
 * and matches the manifest it re-reads with its own credential; a replay of an
 * applied receipt changes nothing. A worker that died between its commit and
 * its receipt leaves only "a committed manifest the row has not heard of",
 * which the next request repairs in full: generation, publications and LFS
 * marks.
 */
describe('storage receipts and the repair after a lost one (DC1)', () => {
  const store = memoryStore();
  const locator = repositoryLocator({ ownerId, projectId });
  const receiptKey = parseSigningKey(developmentSigningKeyJson('receipt'), 'receipt');
  let manifestBytes: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    const client = scratch('dc1-client');
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'DC1');
    git(client, 'config', 'user.email', 'dc1@tau.test');
    writeFileSync(path.join(client, 'main.scad'), 'cube(12);\n');
    git(client, 'add', '.');
    git(client, 'commit', '--quiet', '-m', 'the revision whose receipt was lost');
    git(client, 'tag', '-a', 'v1', '-m', 'v1');
    /* The commit-and-swap with no receipt after it: exactly what a worker killed between the two leaves. */
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('dc1-lease') });
    try {
      execFileSync('git', ['push', lease.directory, 'main', 'refs/tags/v1'], {
        cwd: client,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment,
      });
      const committed = await commitLease({ store, lease, committedBy: ownerId });
      expect(committed.committed).toBe(true);
    } finally {
      await lease.dispose();
    }
    const read = await store.readManifest(locator);
    manifestBytes = read?.manifest ?? new Uint8Array();
  }, 60_000);

  const receiptFor = (overrides: Partial<StorageReceiptFacts> = {}): string => {
    const manifest = decodeManifest(manifestBytes as ManifestBytes);
    return signReceipt(
      {
        rid: randomBytes(16).toString('hex'),
        kind: 'commit',
        owner: ownerId,
        project: projectId,
        generation: manifest.generation,
        incarnation: manifest.incarnation,
        manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
        movedRefs: [{ ref: 'refs/heads/main', after: manifest.refs['refs/heads/main']?.oid }],
        materializedTags: [],
        reachableLfsOids: [],
        ...overrides,
      },
      { key: receiptKey },
    );
  };

  it('should change no row for a receipt whose manifest digest differs from the stored manifest', async () => {
    const row: GitRow = { generation: 0, derivedGeneration: 0, storageBytes: 0 };
    const updates: Array<Record<string, unknown>> = [];
    const opened = vi.fn();
    const durableEvents = mock<DurableEventsService>();
    const service = createService(
      store,
      databaseStub(row, { failTransaction: false, updates, beforeTransaction: opened }),
      { durableEvents },
    );

    const outcome = await service.applyReceipt(receiptFor({ manifestSha256: 'f'.repeat(64) }), access);
    await settledBoth(service);

    expect(outcome).toBe('manifest_mismatch');
    expect(row).toEqual({ generation: 0, derivedGeneration: 0, storageBytes: 0 });
    expect(updates).toEqual([]);
    expect(opened).not.toHaveBeenCalled();
    expect(durableEvents.appendRevision).not.toHaveBeenCalled();
  });

  it('should change no row for a receipt whose rid was already applied', async () => {
    const row: GitRow = { generation: 0, derivedGeneration: 0, storageBytes: 0 };
    const durableEvents = mock<DurableEventsService>();
    const service = createService(store, databaseStub(row, { failTransaction: false }), { durableEvents });
    const receipt = receiptFor();

    expect(await service.applyReceipt(receipt, access)).toBe('applied');
    await settledBoth(service);
    expect(row.derivedGeneration).toBe(1);

    /* Put the row back, so a second application would be visible. */
    Object.assign(row, { generation: 0, derivedGeneration: 0, storageBytes: 0 });
    durableEvents.appendRevision.mockClear();
    expect(await service.applyReceipt(receipt, access)).toBe('duplicate');
    await settledBoth(service);
    expect(row).toEqual({ generation: 0, derivedGeneration: 0, storageBytes: 0 });
    expect(durableEvents.appendRevision).not.toHaveBeenCalled();
  });

  it('should count a receipt whose ledger is unreachable as ledger_unavailable and change no row (review S4)', async () => {
    const row: GitRow = { generation: 0, derivedGeneration: 0, storageBytes: 0 };
    const durableEvents = mock<DurableEventsService>();
    const metrics = new MetricsService();
    const counted = vi.spyOn(metrics.gitReceipts, 'add');
    const service = createService(store, databaseStub(row, { failTransaction: false }), {
      durableEvents,
      metrics,
      receipts: {
        keys: parsePublicKeys(developmentPublicKeysJson('receipt'), 'TAU_STORAGE_RECEIPT_PUBLIC_KEYS'),
        ledger: {
          claim: async () => {
            throw new Error('Redis is down');
          },
          release: async () => undefined,
        },
      },
    });

    expect(await service.applyReceipt(receiptFor(), access)).toBe('ledger_unavailable');
    await settledBoth(service);

    expect(counted).toHaveBeenCalledWith(1, { outcome: 'ledger_unavailable' });
    expect(row).toEqual({ generation: 0, derivedGeneration: 0, storageBytes: 0 });
    expect(durableEvents.appendRevision).not.toHaveBeenCalled();
  });

  it('should refuse a receipt for another repository, and one signed with a key it does not hold', async () => {
    const row: GitRow = { generation: 0, derivedGeneration: 0, storageBytes: 0 };
    const service = createService(store, databaseStub(row, { failTransaction: false }));
    expect(await service.applyReceipt(receiptFor({ project: 'proj-another' }), access)).toBe('rejected');
    const forged = signReceipt(
      {
        rid: randomBytes(16).toString('hex'),
        kind: 'commit',
        owner: ownerId,
        project: projectId,
        generation: 1,
        incarnation: decodeManifest(manifestBytes as ManifestBytes).incarnation,
        manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
        movedRefs: [],
        materializedTags: [],
        reachableLfsOids: [],
      },
      { key: parseSigningKey(developmentSigningKeyJson('grant'), 'grant') },
    );
    expect(await service.applyReceipt(forged, access)).toBe('rejected');
    expect(row).toEqual({ generation: 0, derivedGeneration: 0, storageBytes: 0 });
  });

  it('should repair generation, publications and LFS marks on the next fetch after a worker died between its commit and its receipt', async () => {
    const row: GitRow = { generation: 0, derivedGeneration: 0, storageBytes: 0 };
    const updates: Array<Record<string, unknown>> = [];
    const durableEvents = mock<DurableEventsService>();
    /* A live publication of v1 that the lost receipt never materialized. */
    const publications = [{ tag: 'v1', revisionId: '0'.repeat(40), manifestKey: '', unpublishedAt: null }];
    const service = createService(store, databaseStub(row, { failTransaction: false, updates, publications }), {
      durableEvents,
    });
    const reads = vi.spyOn(workerOf(service), 'gitRead');

    await fetchOnce(service, access);
    await settledBoth(service);

    expect(row.generation).toBe(1);
    expect(row.derivedGeneration).toBe(1);
    expect(durableEvents.appendRevision).toHaveBeenCalledOnce();
    /* The stale publication was materialized over a read lease of the committed generation. */
    expect(reads.mock.calls.map(([, request]) => request.args[0])).toContain('rev-parse');
    /* The LFS reachability pass ran inside the derivation: every pointer this
       walk did not reach is marked with the moment it was first unreachable. */
    expect(updates.some((update) => 'unreachableAt' in update)).toBe(true);
  }, 60_000);
});

/**
 * A push's receipt against tau-storage's deferred compaction of it (review of
 * push latency F2, finding 3): whichever order the two receipts reach the API
 * in, and when the compaction's never arrives, the push is announced once and
 * its derived state lands at the compacted generation.
 */
describe('a push receipt and the deferred compaction after it', () => {
  const receiptKey = parseSigningKey(developmentSigningKeyJson('receipt'), 'receipt');

  /** A repository at the push's generation 2, and the compaction that may follow it at 3. */
  const pushedRepository = async (): Promise<{
    store: RepositoryStore;
    pushed: Uint8Array<ArrayBuffer>;
    head: string;
    /** Commits generation 3 over the push, as `committedBy`: a compaction unless told otherwise. */
    follow: (committedBy?: string) => Promise<Uint8Array<ArrayBuffer>>;
  }> => {
    const store = memoryStore();
    const locator = repositoryLocator({ ownerId, projectId });
    const client = scratch('compaction-receipt-client');
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'F2');
    git(client, 'config', 'user.email', 'f2@tau.test');
    for (const revision of [1, 2]) {
      writeFileSync(path.join(client, 'main.scad'), `cube(${String(revision)});\n`);
      git(client, 'add', '.');
      git(client, 'commit', '--quiet', '-m', `revision ${String(revision)}`);
      // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('compaction-receipt-lease') });
      try {
        execFileSync('git', ['push', lease.directory, 'main'], {
          cwd: client,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment,
        });
        // oxlint-disable-next-line no-await-in-loop -- as above
        await commitLease({ store, lease, committedBy: ownerId });
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await lease.dispose();
      }
    }
    const read = await store.readManifest(locator);
    if (read === undefined) {
      throw new Error('nothing committed');
    }
    const pushed = read.manifest;
    return {
      store,
      pushed,
      head: git(client, 'rev-parse', 'main').trim(),
      follow: async (committedBy = compactionCommitter) => {
        const base = decodeManifest(pushed);
        const bytes = encodeManifest(succeedManifest(base, { refs: base.refs, packs: base.packs, committedBy }));
        await store.commitManifest(locator, bytes, read.token);
        return bytes;
      },
    };
  };

  const receiptOf = (bytes: Uint8Array<ArrayBuffer>, moved: StorageReceiptFacts['movedRefs']): string => {
    const manifest = decodeManifest(bytes as ManifestBytes);
    return signReceipt(
      {
        rid: randomBytes(16).toString('hex'),
        kind: 'commit',
        owner: ownerId,
        project: projectId,
        generation: manifest.generation,
        incarnation: manifest.incarnation,
        manifestSha256: createHash('sha256').update(bytes).digest('hex'),
        movedRefs: moved,
        materializedTags: [],
        reachableLfsOids: [],
      },
      { key: receiptKey },
    );
  };

  it('should apply the push receipt in the usual order, and the compaction receipt after it without a second announcement', async () => {
    const repository = await pushedRepository();
    const row: GitRow = { generation: 1, derivedGeneration: 1, storageBytes: 0 };
    const durableEvents = mock<DurableEventsService>();
    const service = createService(repository.store, databaseStub(row, { failTransaction: false }), { durableEvents });
    const moved = [{ ref: 'refs/heads/main', after: repository.head }];

    expect(await service.applyReceipt(receiptOf(repository.pushed, moved), access)).toBe('applied');
    const compacted = await repository.follow();
    expect(await service.applyReceipt(receiptOf(compacted, []))).toBe('applied');
    await settledBoth(service);

    expect(row).toMatchObject({ generation: 3, derivedGeneration: 3 });
    expect(durableEvents.appendRevision.mock.calls).toEqual([
      [
        expect.objectContaining({
          generation: 2,
          refs: ['refs/heads/main'],
          heads: { 'refs/heads/main': repository.head },
        }),
      ],
    ]);
  }, 60_000);

  it('should apply a push receipt the compaction overtook, at the compacted generation, and announce the push once', async () => {
    const repository = await pushedRepository();
    const row: GitRow = { generation: 1, derivedGeneration: 1, storageBytes: 0 };
    const durableEvents = mock<DurableEventsService>();
    const service = createService(repository.store, databaseStub(row, { failTransaction: false }), { durableEvents });
    const moved = [{ ref: 'refs/heads/main', after: repository.head }];
    const compacted = await repository.follow();

    /* The compaction's receipt first, then the push's, which its manifest no longer matches. */
    expect(await service.applyReceipt(receiptOf(compacted, []))).toBe('applied');
    expect(await service.applyReceipt(receiptOf(repository.pushed, moved), access)).toBe('applied');
    await settledBoth(service);

    expect(row).toMatchObject({ generation: 3, derivedGeneration: 3 });
    expect(durableEvents.appendRevision.mock.calls).toEqual([
      [
        expect.objectContaining({
          generation: 3,
          refs: ['refs/heads/main'],
          heads: { 'refs/heads/main': repository.head },
        }),
      ],
    ]);
  }, 60_000);

  it('should apply a push receipt the compaction overtook when the compaction receipt never arrives', async () => {
    const repository = await pushedRepository();
    const row: GitRow = { generation: 1, derivedGeneration: 1, storageBytes: 0 };
    const durableEvents = mock<DurableEventsService>();
    const service = createService(repository.store, databaseStub(row, { failTransaction: false }), { durableEvents });
    await repository.follow();

    const outcome = await service.applyReceipt(
      receiptOf(repository.pushed, [{ ref: 'refs/heads/main', after: repository.head }]),
      access,
    );
    await settledBoth(service);

    expect(outcome).toBe('applied');
    expect(row).toMatchObject({ generation: 3, derivedGeneration: 3 });
    expect(durableEvents.appendRevision).toHaveBeenCalledOnce();
  }, 60_000);

  it('should still find a push receipt stale when a later generation is not a compaction', async () => {
    const repository = await pushedRepository();
    const row: GitRow = { generation: 1, derivedGeneration: 1, storageBytes: 0 };
    const durableEvents = mock<DurableEventsService>();
    const service = createService(repository.store, databaseStub(row, { failTransaction: false }), { durableEvents });
    await repository.follow(ownerId);

    const outcome = await service.applyReceipt(
      receiptOf(repository.pushed, [{ ref: 'refs/heads/main', after: repository.head }]),
      access,
    );
    await settledBoth(service);

    expect(outcome).toBe('stale');
    expect(row).toMatchObject({ generation: 1, derivedGeneration: 1 });
    expect(durableEvents.appendRevision).not.toHaveBeenCalled();
  }, 60_000);

  it('should find a push receipt stale when its moved ref no longer holds the head it names', async () => {
    const repository = await pushedRepository();
    const row: GitRow = { generation: 1, derivedGeneration: 1, storageBytes: 0 };
    const service = createService(repository.store, databaseStub(row, { failTransaction: false }));
    await repository.follow();

    expect(
      await service.applyReceipt(
        receiptOf(repository.pushed, [{ ref: 'refs/heads/main', after: 'a'.repeat(40) }]),
        access,
      ),
    ).toBe('stale');
  }, 60_000);
});

/**
 * DC1 review S1: the publication materializer's reads share one lease. One
 * hydrate per materialization, as before DC1, and a push that lands between
 * two of its commands moves nothing they read.
 */
describe('read sessions (DC1 review S1)', () => {
  it('should run every read of one withLease over one lease that a push in between does not move', async () => {
    const store = memoryStore();
    const locator = repositoryLocator({ ownerId, projectId });
    const client = scratch('s1-client');
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'S1');
    git(client, 'config', 'user.email', 's1@tau.test');
    const pushCommit = async (file: string): Promise<void> => {
      writeFileSync(path.join(client, file), `${file}\n`);
      git(client, 'add', '.');
      git(client, 'commit', '--quiet', '-m', file);
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('s1-lease') });
      try {
        execFileSync('git', ['push', lease.directory, 'main'], {
          cwd: client,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment,
        });
        const committed = await commitLease({ store, lease, committedBy: ownerId });
        expect(committed.committed).toBe(true);
      } finally {
        await lease.dispose();
      }
    };
    await pushCommit('a.scad');
    const service = createService(
      store,
      databaseStub({ generation: 1, derivedGeneration: 1, storageBytes: 0 }, { failTransaction: false }),
    );
    const worker = workerOf(service);
    const hydrates = vi.spyOn(worker as unknown as { hydrate: (...args: never[]) => Promise<unknown> }, 'hydrate');
    const head = async (directory: string): Promise<string> =>
      Buffer.from(await service.leaseGit(directory, ['rev-parse', 'refs/heads/main']))
        .toString('utf8')
        .trim();

    const [before, after] = await service.withLease(access, async (lease) => {
      const first = await head(lease.directory);
      await pushCommit('b.scad');
      return [first, await head(lease.directory)];
    });
    await settledBoth(service);

    expect(after, 'a push between two reads must not move what the second one reads').toBe(before);
    expect(hydrates, 'one lease per withLease, however many commands it runs').toHaveBeenCalledOnce();
    expect(worker.reservedLeaseBytes, 'the session ends with the work').toBe(0);
  }, 60_000);
});

/**
 * DC1's two back-pressure rows. The owner step (DA6's seam, called by the API
 * before a grant is minted): an owner at its in-flight cap is refused `429`
 * with a jittered `Retry-After` while another owner is served, and tau-storage
 * never sees the refused request. The slow-body floor (on tau-storage, after
 * the hydrate): a body moving fewer than 8 KiB in a 30 s window is aborted and
 * its lease slot comes back.
 */
describe('owner in-flight cap and slow bodies (DC1)', () => {
  const store = memoryStore();

  /** DA6's gate with its in-process count, the request cap shrunk to one so the suite can fill it. */
  const cappedGate = (cap: number): { readonly gate: OwnerInFlightGate; readonly held: (owner: string) => number } => {
    const counts = new MemoryOwnerInFlightCap({ requests: cap });
    return { gate: new OwnerInFlightGate({ cap: counts }), held: (owner) => counts.inFlight(owner).requests };
  };

  it('should refuse the next RPC from an owner at its cap with 429 while another owner is served', async () => {
    const { gate, held } = cappedGate(1);
    const service = createService(
      store,
      databaseStub({ generation: 0, derivedGeneration: 0, storageBytes: 0 }, { failTransaction: false }),
      { owners: gate },
    );
    const worker = workerOf(service);
    const served = vi.spyOn(worker, 'uploadPack');
    /* Owner A's first RPC stays in flight: its body has not ended. */
    const pending = new PassThrough();
    const first = service.uploadPack({ access, body: pending, gzipped: false });
    await vi.waitFor(() => {
      expect(held(ownerId)).toBe(1);
    });

    const refused = await service
      .uploadPack({ access, body: flushBody(), gzipped: false })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(429);
    const answer = (refused as HttpException).getResponse() as { code: string; retryAfterSeconds: number };
    expect(answer.code).toBe('GIT_OWNER_IN_FLIGHT_LIMIT');
    expect(answer.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    /* Refused before a grant: tau-storage saw only owner A's first request. */
    expect(served).toHaveBeenCalledTimes(1);

    const other: GitAccess = { ...access, ownerId: 'user-dc1-other', callerId: 'user-dc1-other' };
    const output = await service.uploadPack({ access: other, body: flushBody(), gzipped: false });
    output.resume();
    await finished(output);
    expect(served).toHaveBeenCalledTimes(2);

    pending.end(Buffer.from('0000'));
    const firstOutput = await first;
    firstOutput.resume();
    await finished(firstOutput);
    await settledBoth(service);
    expect(held(ownerId)).toBe(0);
    expect(held('user-dc1-other')).toBe(0);
  }, 60_000);

  it('should hold the slow-body floor at 8 KiB per 30 s window', () => {
    const worker = new StorageGitService({ store, receipts: loopbackReceiptChannel() });
    expect(worker.slowBodyMinimumBytes).toBe(8 * 1024);
    expect(worker.slowBodyWindowMilliseconds).toBe(30_000);
  });

  it('should abort a push body moving less than the floor and give its lease slot back', async () => {
    const { metrics, on } = recordingMetrics();
    const service = createService(
      store,
      databaseStub({ generation: 0, derivedGeneration: 0, storageBytes: 0 }, { failTransaction: false }),
      { metrics },
    );
    const worker = workerOf(service);
    worker.slowBodyWindowMilliseconds = 200;
    /* A pkt-line command trickled a few bytes at a time: well under 8 KiB in any window. */
    const trickle = new PassThrough();
    trickle.write(Buffer.from('0094'));
    const pushing = (async (): Promise<unknown> => {
      try {
        return await service.receivePack({ access, committedBy: ownerId, body: trickle, gzipped: false });
      } catch (error) {
        return error;
      }
    })();
    await vi.waitFor(() => {
      expect(worker.reservedLeaseBytes).toBeGreaterThan(0);
    });

    const refused = await pushing;
    await settledBoth(service);

    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(408);
    expect(((refused as HttpException).getResponse() as { code: string }).code).toBe('GIT_REQUEST_BODY_TOO_SLOW');
    expect(on('gitSlowBodyAborts').add).toHaveBeenCalledWith(1, { 'tau.git.operation': 'receive_pack' });
    expect(worker.reservedLeaseBytes).toBe(0);
    expect(trickle.destroyed).toBe(true);
  }, 60_000);
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

/**
 * Hosted Remote Storage DB1: `info/refs` is answered from the manifest. It
 * takes no lease, so it never reaches admission, the lease disk or the hydrate
 * budget: the route that raised TAU-API-5 (`GIT_LEASE_OWNER_BUSY` on an
 * advertisement) can no longer be refused for capacity. One manifest read is
 * its whole object-store cost (one Class B), and its bytes are stock git's over
 * the lease the same manifest hydrates.
 *
 * W6 G8 / review FR5: the derived-state repair that rode the advertisement's
 * lease stays on the RPC leases until DC1 takes it over, so a repository whose
 * row trails its manifest is still repaired by the request that follows.
 */
describe('GitRepositoryService advertisement from the manifest (DB1)', () => {
  const store = memoryStore();
  const advertisedProject = 'proj-db1';
  const advertisedAccess: GitAccess = { ...access, projectId: advertisedProject };
  const locator = repositoryLocator({ ownerId, projectId: advertisedProject });
  const directories: string[] = [];
  let heads: Record<string, string> = {};

  /** Every store call an advertisement makes, by port member. */
  const counted = (): { store: RepositoryStore; calls: Map<string, number> } => {
    const calls = new Map<string, number>();
    const count = (member: string): void => {
      calls.set(member, (calls.get(member) ?? 0) + 1);
    };
    return {
      calls,
      store: {
        ...store,
        readManifest: async (at) => {
          count('readManifest');
          return store.readManifest(at);
        },
        getObject: async (at, key, range) => {
          count('getObject');
          return store.getObject(at, key, range);
        },
        listObjects: (at, prefix) => {
          count('listObjects');
          return store.listObjects(at, prefix);
        },
      },
    };
  };

  /** A budget that refuses, and says when it was asked: an advertisement must never ask. */
  const refusingBudget = (): { limiter: PublicationRateLimiterService; asked: Mock } => {
    const asked = vi.fn(async () => ({ allowed: false, count: hydratesPerCallerPerDay + 1, retryAfterSeconds: 60 }));
    return { limiter: { consumeWindowBudget: asked } as unknown as PublicationRateLimiterService, asked };
  };

  beforeAll(async () => {
    const client = mkdtempSync(path.join(tmpdir(), 'tau-db1-client-'));
    directories.push(client);
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'DB1');
    git(client, 'config', 'user.email', 'db1@tau.test');
    writeFileSync(path.join(client, 'main.scad'), 'cube(10);\n');
    git(client, 'add', '.');
    git(client, 'commit', '--quiet', '-m', 'first revision');
    git(client, 'tag', '-a', 'v1', '-m', 'v1');
    git(client, 'tag', 'v2');
    git(client, 'branch', 'conflicts/main/device-b');
    heads = Object.fromEntries(
      ['refs/heads/conflicts/main/device-b', 'refs/heads/main', 'refs/tags/v1', 'refs/tags/v2'].map((ref) => [
        ref,
        git(client, 'rev-parse', ref).trim(),
      ]),
    );
    const parent = mkdtempSync(path.join(tmpdir(), 'tau-db1-lease-'));
    directories.push(parent);
    const lease = await hydrateLease({ store, locator, parentDirectory: parent });
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
    vi.mocked(hydrateLease).mockClear();
  }, 60_000);

  afterAll(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('takes no lease, no disk and no hydrate budget, and reads the store once', async () => {
    const { metrics, on } = recordingMetrics();
    const { store: watched, calls } = counted();
    const { limiter, asked } = refusingBudget();
    const service = createService(
      watched,
      databaseStub({ generation: 1, derivedGeneration: 1, storageBytes: 0 }, { failTransaction: false }),
      { metrics, rateLimiter: limiter },
    );
    await settledBoth(service);
    /* No lease fits on this disk, so any lease would be refused `GIT_LEASE_DISK_FULL`. */
    workerOf(service).leaseReservationFloorBytes = Number.MAX_SAFE_INTEGER;
    workerOf(service).admissionWaitMilliseconds = 0;
    vi.mocked(hydrateLease).mockClear();

    for (const service_ of ['git-upload-pack', 'git-receive-pack'] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one advertisement at a time, so each read is counted against it
      const advertised = await service.advertiseRefs(advertisedAccess, service_);
      expect(Buffer.from(advertised).toString('latin1')).toContain('refs/heads/main');
    }

    expect(Object.fromEntries(calls), 'one manifest GET per advertisement, and nothing else').toStrictEqual({
      readManifest: 2,
    });
    expect(hydrateLease, 'an advertisement must not build a lease').not.toHaveBeenCalled();
    expect(asked, 'an advertisement must not spend a hydrate budget').not.toHaveBeenCalled();
    expect(on('gitAdmissions').add).not.toHaveBeenCalled();
    expect(on('gitLeasesActive').add).not.toHaveBeenCalled();
    expect(on('gitDiskFreeBytes').record, 'an advertisement must not read the lease disk').not.toHaveBeenCalled();
    expect(on('gitHydrateBytes').record).not.toHaveBeenCalled();
    expect(on('syncLeaseDuration').record).not.toHaveBeenCalled();

    /* The fetch that follows still spends the budget, which the API does before it forwards (DC1). */
    await expect(fetchOnce(service, advertisedAccess)).rejects.toMatchObject({
      response: { code: 'GIT_HYDRATE_BUDGET_EXHAUSTED' },
    });
  });

  it('answers byte-identically to stock git over the lease the same manifest hydrates', async () => {
    const service = createService(
      store,
      databaseStub({ generation: 1, derivedGeneration: 1, storageBytes: 0 }, { failTransaction: false }),
    );
    const parent = mkdtempSync(path.join(tmpdir(), 'tau-db1-identity-'));
    directories.push(parent);
    const lease = await hydrateLease({ store, locator, parentDirectory: parent });
    try {
      for (const service_ of ['git-upload-pack', 'git-receive-pack'] as const) {
        const stock = execFileSync(
          'git',
          [service_.replace('git-', ''), '--stateless-rpc', '--advertise-refs', lease.directory],
          { stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment },
        );
        // oxlint-disable-next-line no-await-in-loop -- two services, compared one at a time
        const served = Buffer.from(await service.advertiseRefs(advertisedAccess, service_));
        expect(served.toString('latin1'), service_).toStrictEqual(stock.toString('latin1'));
      }
    } finally {
      await lease.dispose();
    }
  });

  it('answers a project with no manifest as stock git answers an empty repository', async () => {
    const service = createService(
      memoryStore(),
      databaseStub({ generation: 0, derivedGeneration: 0, storageBytes: 0 }, { failTransaction: false }),
    );
    const empty = mkdtempSync(path.join(tmpdir(), 'tau-db1-empty-'));
    directories.push(empty);
    git(empty, 'init', '--bare', '--quiet', '--template=', '--initial-branch=main', '.');
    for (const service_ of ['git-upload-pack', 'git-receive-pack'] as const) {
      const stock = execFileSync('git', [service_.replace('git-', ''), '--stateless-rpc', '--advertise-refs', empty], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment,
      });
      // oxlint-disable-next-line no-await-in-loop -- two services, compared one at a time
      const served = Buffer.from(await service.advertiseRefs(advertisedAccess, service_));
      expect(served.toString('latin1'), service_).toStrictEqual(stock.toString('latin1'));
    }
  });

  it('answers a tombstoned repository 410, as the lease did', async () => {
    const tombstoned = memoryStore();
    const read = await store.readManifest(locator);
    const live = decodeManifest(read?.manifest ?? new Uint8Array());
    expect(await tombstoned.commitManifest(locator, encodeManifest(live), 'absent')).not.toBe('lost');
    const current = await tombstoned.readManifest(locator);
    if (current === undefined) {
      throw new Error('the copied manifest is missing');
    }
    expect(
      await tombstoned.commitManifest(
        locator,
        encodeManifest(tombstoneManifest(live, { committedBy: ownerId, at: new Date() })),
        current.token,
      ),
    ).not.toBe('lost');
    const service = createService(
      tombstoned,
      databaseStub({ generation: 2, derivedGeneration: 2, storageBytes: 0 }, { failTransaction: false }),
    );

    await expect(service.advertiseRefs(advertisedAccess, 'git-upload-pack')).rejects.toBeInstanceOf(GoneException);
  });

  /* W6 G8, review FR5: removing the advertisement's lease must not lose the repair it carried. */
  it('leaves the repair to the next RPC lease: an advertisement repairs nothing, the fetch after it does', async () => {
    const row: GitRow = { generation: 1, derivedGeneration: 0, storageBytes: 0 };
    const durableEvents = mock<DurableEventsService>();
    const service = createService(store, databaseStub(row, { failTransaction: false }), { durableEvents });

    await service.advertiseRefs(advertisedAccess, 'git-upload-pack');
    await settledBoth(service);
    expect(row, 'an advertisement holds no lease to derive over').toStrictEqual({
      generation: 1,
      derivedGeneration: 0,
      storageBytes: 0,
    });
    expect(durableEvents.appendRevision).not.toHaveBeenCalled();

    await fetchOnce(service, advertisedAccess);
    await settledBoth(service);
    expect(row.derivedGeneration, 'the fetch after the advertisement repairs the trailing row').toBe(1);
    expect(row.storageBytes).toBeGreaterThan(0);
    expect(durableEvents.appendRevision.mock.calls).toEqual([
      [
        {
          projectId: advertisedProject,
          ownerId,
          generation: 1,
          refs: ['refs/heads/conflicts/main/device-b', 'refs/heads/main', 'refs/tags/v1', 'refs/tags/v2'],
          heads,
        },
      ],
    ]);
  }, 60_000);

  it('leaves the repair to the next RPC lease on a push too: the authenticating probe repairs the trailing row', async () => {
    const row: GitRow = { generation: 0, derivedGeneration: 0, storageBytes: 0 };
    const service = createService(store, databaseStub(row, { failTransaction: false }));

    await service.advertiseRefs(advertisedAccess, 'git-receive-pack');
    expect(row.derivedGeneration).toBe(0);

    await pushProbe(service, advertisedAccess);
    await settledBoth(service);
    expect(row).toMatchObject({ generation: 1, derivedGeneration: 1 });
  }, 60_000);
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

  /* D22 / L6-F3 / RV-W9 M3, in bytes since DA3: an owner that holds a lease
     holds at most half the worker's lease disk, so with room for eight a second
     owner's second request and a third owner are still admitted while the
     first owner is saturating the worker. */
  it('keeps one owner to half the lease disk, so two other owners are still admitted', async () => {
    const service = createService(store, caughtUp());
    const { bavail, bsize } = await statfs(tmpdir());
    /* Room for eight leases on this disk, whatever its size. */
    workerOf(service).leaseReservationFloorBytes = Math.floor((bavail * bsize) / 8.5);
    workerOf(service).admissionWaitMilliseconds = 0;
    const ownerB: GitAccess = { ...access, ownerId: 'user-w9-b', callerId: 'user-w9-b' };
    const ownerC: GitAccess = { ...access, ownerId: 'user-w9-c', callerId: 'user-w9-c' };
    const gate = Promise.withResolvers<void>();
    const held: Array<Promise<unknown>> = [];
    /** Starts one lease that stays open until the gate opens, and waits until it is admitted. */
    const hold = async (who: GitAccess): Promise<void> => {
      const admitted = Promise.withResolvers<void>();
      held.push(
        holdLease(service, who, async () => {
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
      await expect(holdLease(service, access, async () => undefined)).rejects.toMatchObject({
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
    await expect(holdLease(service, access, async () => 'admitted')).resolves.toBe('admitted');
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

    await expect(fetchOnce(service, reader)).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_HYDRATE_BUDGET_EXHAUSTED' },
    });
    await expect(fetchOnce(service, access)).resolves.toBeUndefined();

    /* The aggregate every non-owner shares: spent, it refuses a second reader
       too, and still never the owner. */
    counters.set(`git:hydrate:${ownerId}:others:w86400:${String(day)}`, hydratesFromOthersPerOwnerPerDay);
    await expect(fetchOnce(service, { ...reader, callerId: 'user-w9-other-reader' })).rejects.toMatchObject({
      status: 429,
    });
    await expect(fetchOnce(service, access)).resolves.toBeUndefined();
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

    await expect(fetchOnce(service, host)).resolves.toBeUndefined();
    expect(host.callerId).toBe('device:agent_cloud');
    expect([...counters.keys()]).toEqual([`git:hydrate:${ownerId}:caller:device:agent_cloud:w86400:${String(day)}`]);

    counters.set(`git:hydrate:${ownerId}:caller:device:agent_cloud:w86400:${String(day)}`, hydratesPerCallerPerDay);
    await expect(fetchOnce(service, host)).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_HYDRATE_BUDGET_EXHAUSTED' },
    });
    await expect(fetchOnce(service, access)).resolves.toBeUndefined();
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
    /* The manifest is read before admission, to size the reservation (DA3); no pack is. */
    let hydrated = false;
    const watched: RepositoryStore = {
      ...store,
      getObject: async (at, key, range) => {
        hydrated = true;
        return store.getObject(at, key, range);
      },
    };
    vi.mocked(hydrateLease).mockClear();
    const spent = {
      consumeWindowBudget: async (args: { key: string }) => {
        expect(args.key).toBe(`git:hydrate:${ownerId}:owner`);
        return { allowed: false, count: hydratesPerCallerPerDay + 1, retryAfterSeconds: 3600 };
      },
    } as unknown as PublicationRateLimiterService;

    await expect(fetchOnce(createService(watched, caughtUp(), { rateLimiter: spent }), access)).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_HYDRATE_BUDGET_EXHAUSTED', retryAfterSeconds: 3600 },
    });
    expect(hydrated).toBe(false);
    expect(hydrateLease).not.toHaveBeenCalled();
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

    const refusal = fetchOnce(createService(damaged, caughtUp()), access);
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
      await settledBoth(service);

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
          expect.stringContaining('A committed manifest could not record its generation'),
        );
        expect(await manifestReferences()).not.toHaveProperty(['refs/tags/v2']);
        await settledBoth(service);
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
          from: (table: unknown) =>
            table === projectDeletion || table === project
              ? database.select().from(table as typeof project | typeof projectDeletion)
              : {
                  leftJoin: () => ({ where: async () => [frozenRead] }),
                  where: () => Object.assign(Promise.resolve([] as unknown[]), { limit: async () => [frozenRead] }),
                },
        }),
        insert: (table: unknown) => database.insert(table as typeof projectGit),
        transaction: async (run: (transaction: unknown) => Promise<unknown>) => database.transaction(run),
      },
    } as unknown as DatabaseService;
    /* oxlint-enable typescript/promise-function-async -- end of the builder stub */

    const fresh = createService(casStore, { database } as unknown as DatabaseService);
    const stale = createService(staleStore, staleDatabase);

    await fetchOnce(fresh, casAccess);
    const afterFresh = await database.query.projectGit.findFirst({
      where: eq(projectGit.projectId, casProjectId),
    });
    expect(afterFresh?.derivedGeneration).toBe(2);
    expect(Number(afterFresh?.storageBytes)).toBe(generationTwoBytes);

    /* Now the slow one lands, still believing the marker is 0. */
    await fetchOnce(stale, casAccess);
    const afterStale = await database.query.projectGit.findFirst({
      where: eq(projectGit.projectId, casProjectId),
    });
    expect(afterStale?.derivedGeneration, 'a slower deriver rewound the marker').toBe(2);
    expect(Number(afterStale?.storageBytes), 'a slower deriver rewound the byte accounting').toBe(generationTwoBytes);
  }, 120_000);

  /**
   * DC1: an idle repository whose receipt was lost has no next request to
   * repair it, so the scheduler does. One scan a minute, for rows that have
   * trailed for over a minute: a seeded lagging row is repaired by the first
   * scan that sees it, inside the ten minutes DC1 allows.
   */
  it('repairs an idle repository whose derived generation trails, from the scheduler alone', async () => {
    expect(deriveScanIntervalMilliseconds + deriveLagGraceSeconds * 1000).toBeLessThanOrEqual(10 * 60_000);
    const idleProjectId = `proj-dc1-idle-${randomBytes(5).toString('hex')}`;
    const freshProjectId = `proj-dc1-fresh-${randomBytes(5).toString('hex')}`;
    await database.insert(project).values([
      { id: idleProjectId, ownerId: casOwnerId, name: 'idle' },
      { id: freshProjectId, ownerId: casOwnerId, name: 'fresh' },
    ]);
    const idleStore = memoryStore();
    const client2 = scratch('dc1-idle-client');
    git(client2, 'init', '--quiet', '--initial-branch=main', '.');
    git(client2, 'config', 'user.name', 'DC1');
    git(client2, 'config', 'user.email', 'dc1@tau.test');
    writeFileSync(path.join(client2, 'main.scad'), 'cube(3);\n');
    git(client2, 'add', '.');
    git(client2, 'commit', '--quiet', '-m', 'committed, receipt lost, never touched again');
    for (const target of [idleProjectId, freshProjectId]) {
      // oxlint-disable-next-line no-await-in-loop -- two seeded repositories, one after the other
      const lease = await hydrateLease({
        store: idleStore,
        locator: repositoryLocator({ ownerId: casOwnerId, projectId: target }),
        parentDirectory: scratch('dc1-idle-lease'),
      });
      try {
        execFileSync('git', ['push', lease.directory, 'main'], {
          cwd: client2,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment,
        });
        // oxlint-disable-next-line no-await-in-loop -- as above
        const committed = await commitLease({ store: idleStore, lease, committedBy: casOwnerId });
        expect(committed.committed).toBe(true);
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await lease.dispose();
      }
    }
    /* The idle row has trailed for two minutes; the fresh one only now, so its own receipt still goes first. */
    await database.insert(projectGit).values([
      {
        projectId: idleProjectId,
        generation: 1,
        derivedGeneration: 0,
        storageBytes: 0,
        updatedAt: new Date(Date.now() - 120_000),
      },
      { projectId: freshProjectId, generation: 1, derivedGeneration: 0, storageBytes: 0 },
    ]);

    const service = createService(idleStore, { database } as unknown as DatabaseService);
    const scheduler = new DeriveScheduler({ database } as unknown as DatabaseService, service);
    const applied = await scheduler.scan();
    await settledBoth(service);

    const idle = await database.query.projectGit.findFirst({ where: eq(projectGit.projectId, idleProjectId) });
    const fresh = await database.query.projectGit.findFirst({ where: eq(projectGit.projectId, freshProjectId) });
    expect(applied).toBe(1);
    expect(idle?.derivedGeneration).toBe(1);
    expect(Number(idle?.storageBytes)).toBeGreaterThan(0);
    expect(fresh?.derivedGeneration, 'the scan took a row inside its grace').toBe(0);

    /* Past its grace, the next scan takes the other one too. */
    expect(await scheduler.scan({ graceSeconds: 0 })).toBe(1);
    const later = await database.query.projectGit.findFirst({ where: eq(projectGit.projectId, freshProjectId) });
    expect(later?.derivedGeneration).toBe(1);
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

/**
 * Every instrument the service touches, as one recorder per name, so a row reads exactly what was
 * emitted; `on` returns the same recorder, untouched when the service never reached it.
 */
type Recorder = { add: Mock; record: Mock; addCallback: Mock };
const recordingMetrics = (): { metrics: MetricsService; on: (name: string) => Recorder } => {
  const emitted = new Map<string, Recorder>();
  const on = (name: string): Recorder => {
    const recorder = emitted.get(name) ?? { add: vi.fn(), record: vi.fn(), addCallback: vi.fn() };
    emitted.set(name, recorder);
    return recorder;
  };
  const metrics = new Proxy({}, { get: (_target, name: string): Recorder => on(name) });
  return { metrics: metrics as MetricsService, on };
};

/**
 * Hosted Remote Storage DA2 (W14 N2-N5, N7-N9, N11, N12, N14): lease admission, the lease's
 * life, its hydrate and the manifest commit each say what happened, so TAU-API-5's refusals and
 * the stage-1 triggers are read off series rather than inferred.
 */
describe('GitRepositoryService admission and commit telemetry (DA2)', () => {
  const store = memoryStore();
  const telemetryProjectId = 'proj-da2';
  const telemetryAccess: GitAccess = { ...access, projectId: telemetryProjectId };
  const locator = repositoryLocator({ ownerId, projectId: telemetryProjectId });
  let committedBytes = 0;
  const caughtUp = (): DatabaseService =>
    databaseStub({ generation: 1, derivedGeneration: 1, storageBytes: 0 }, { failTransaction: false });

  beforeAll(async () => {
    const client = scratch('da2-client');
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'DA2');
    git(client, 'config', 'user.email', 'da2@tau.test');
    writeFileSync(path.join(client, 'main.scad'), 'cube(10);\n');
    git(client, 'add', '.');
    git(client, 'commit', '--quiet', '-m', 'first revision');
    for (const line of ['a', 'b', 'c']) {
      git(client, 'branch', `conflicts/main/device-${line}`);
    }
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('da2-lease') });
    try {
      execFileSync(
        'git',
        [
          'push',
          lease.directory,
          'main',
          'refs/heads/conflicts/main/device-a',
          'refs/heads/conflicts/main/device-b',
          'refs/heads/conflicts/main/device-c',
        ],
        { cwd: client, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment },
      );
      const result = await commitLease({ store, lease, committedBy: ownerId });
      expect(result.committed).toBe(true);
      if (result.committed) {
        committedBytes = result.manifest.packs.reduce((total, pack) => total + pack.bytes, 0);
      }
    } finally {
      await lease.dispose();
    }
    expect(committedBytes).toBeGreaterThan(0);
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts an admitted lease, holds it active for its work, reserves its disk and measures its hydrate', async () => {
    const { metrics, on } = recordingMetrics();
    const service = createService(store, caughtUp(), { metrics });
    workerOf(service).leaseReservationFloorBytes = 1024;

    await fetchOnce(service, telemetryAccess);

    expect(on('gitAdmissions').add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.git.operation': 'upload_pack',
      outcome: 'admitted',
    });
    expect(on('gitLeasesActive').add.mock.calls).toEqual([
      [1, { 'tau.git.operation': 'upload_pack' }],
      [-1, { 'tau.git.operation': 'upload_pack' }],
    ]);
    /* DA3: the floor plus the packs and their index allowance, not a flat figure. */
    expect(on('gitLeaseReservedBytes').record.mock.calls).toEqual([
      [1024 + committedBytes + Math.ceil(committedBytes / 512)],
      [0],
    ]);
    expect(on('gitDiskFreeBytes').record).toHaveBeenCalledOnce();
    expect(on('gitDiskFreeBytes').record.mock.calls[0]?.[0]).toBeGreaterThan(0);
    expect(on('gitHydrateBytes').record).toHaveBeenCalledExactlyOnceWith(committedBytes, {
      'tau.git.hydrate.source': 'object_store',
    });
  }, 60_000);

  it('counts a lease refused for disk as disk_full and never holds it', async () => {
    const { metrics, on } = recordingMetrics();
    const service = createService(store, caughtUp(), { metrics });
    workerOf(service).leaseReservationFloorBytes = Number.MAX_SAFE_INTEGER;
    workerOf(service).admissionWaitMilliseconds = 0;

    await expect(pushProbe(service, telemetryAccess)).rejects.toMatchObject({
      response: { code: 'GIT_LEASE_DISK_FULL' },
    });

    expect(on('gitAdmissions').add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.git.operation': 'receive_pack',
      outcome: 'disk_full',
    });
    expect(on('gitLeasesActive').add).not.toHaveBeenCalled();
    expect(on('gitHydrateBytes').record).not.toHaveBeenCalled();
  });

  it('counts an owner at its share as owner_busy, and a lease taken for publication work as derive', async () => {
    const { metrics, on } = recordingMetrics();
    const service = createService(store, caughtUp(), { metrics });
    const { bavail, bsize } = await statfs(tmpdir());
    /* Room for two leases on this disk, so a second would take the owner past half of it. */
    workerOf(service).leaseReservationFloorBytes = Math.floor((bavail * bsize) / 2.5);
    workerOf(service).admissionWaitMilliseconds = 0;
    const gate = Promise.withResolvers<void>();
    const admitted = Promise.withResolvers<void>();
    const held = holdLease(service, telemetryAccess, async () => {
      admitted.resolve();
      await gate.promise;
    });
    await admitted.promise;

    try {
      await expect(holdLease(service, telemetryAccess, async () => undefined)).rejects.toMatchObject({
        response: { code: 'GIT_LEASE_OWNER_BUSY' },
      });
    } finally {
      gate.resolve();
      await held;
    }

    expect(on('gitAdmissions').add.mock.calls).toEqual([
      [1, { 'tau.git.operation': 'derive', outcome: 'admitted' }],
      [1, { 'tau.git.operation': 'derive', outcome: 'owner_busy' }],
    ]);
  }, 60_000);

  it('counts a spent hydrate budget as budget_exhausted before tau-storage reserves anything', async () => {
    const { metrics, on } = recordingMetrics();
    const service = createService(store, caughtUp(), {
      metrics,
      rateLimiter: {
        consumeWindowBudget: async () => ({ allowed: false, count: 1, retryAfterSeconds: 60 }),
      } as unknown as PublicationRateLimiterService,
    });
    workerOf(service).leaseReservationFloorBytes = 1024;

    await expect(fetchOnce(service, telemetryAccess)).rejects.toMatchObject({
      response: { code: 'GIT_HYDRATE_BUDGET_EXHAUSTED' },
    });

    expect(on('gitAdmissions').add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.git.operation': 'upload_pack',
      outcome: 'budget_exhausted',
    });
    expect(on('gitLeasesActive').add).not.toHaveBeenCalled();
    /* DC1: the API spends the budget before it forwards, so no lease disk was ever reserved. */
    expect(on('gitLeaseReservedBytes').record).not.toHaveBeenCalled();
  });

  it('counts a committed write, its duration and the repository size, and ranks the project by rank alone', async () => {
    /* Pin the clock first: a real minute boundary between the commit and the read would retire the
     * bucket the gauges report, so the whole sequence runs on one controlled clock. */
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const { metrics, on } = recordingMetrics();
    const service = createService(store, caughtUp(), { metrics });
    workerOf(service).leaseReservationFloorBytes = 1024;

    await service.removeRef({
      access: telemetryAccess,
      ref: 'refs/heads/conflicts/main/device-a',
      committedBy: ownerId,
    });
    await settledBoth(service);

    expect(on('gitAdmissions').add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.git.operation': 'remove_ref',
      outcome: 'admitted',
    });
    expect(on('gitCommitAttempts').add).toHaveBeenCalledExactlyOnceWith(1, {
      outcome: 'committed',
      'tau.git.commit.kind': 'push',
    });
    /* Each commitLease phase as it ends, then the whole commit. A ref removal stores no pack, so it never compacts. */
    const phases = ['prepare', 'hash', 'object_puts', 'manifest_write', 'total'];
    /* A commit that moves no ref is no attempt, so it records no phase either: phase counts track `total`. */
    const unchanged = await hydrateLease({ store, locator });
    try {
      const commit = Reflect.get(workerOf(service), 'commit') as (
        grant: unknown,
        args: { store: RepositoryStore; lease: typeof unchanged; committedBy: string },
      ) => Promise<{ committed: boolean }>;
      await expect(
        commit.call(workerOf(service), mock(), { store, lease: unchanged, committedBy: ownerId }),
      ).resolves.toMatchObject({ committed: false });
    } finally {
      await unchanged.dispose();
    }
    expect(on('gitCommitAttempts').add).toHaveBeenCalledOnce();
    expect(on('gitCommitDuration').record).toHaveBeenCalledTimes(phases.length);
    for (const [index, phase] of phases.entries()) {
      expect(on('gitCommitDuration').record).toHaveBeenNthCalledWith(index + 1, expect.any(Number), {
        'tau.git.commit.phase': phase,
        'tau.git.commit.kind': 'push',
      });
    }
    const read = await store.readManifest(locator);
    const stored = decodeManifest(read?.manifest ?? new Uint8Array()).packs.reduce(
      (total, pack) => total + pack.bytes,
      0,
    );
    expect(on('gitRepositorySize').record).toHaveBeenCalledExactlyOnceWith(stored);

    /* The gauges read the last full minute: one commit, one writer, at rank 1 only. */
    vi.setSystemTime(Date.now() + 60_000);
    const observe = (instrument: string): Array<[number, Record<string, unknown>]> => {
      const observed: Array<[number, Record<string, unknown>]> = [];
      const callback = on(instrument).addCallback.mock.calls[0]?.[0] as
        | ((result: { observe: (value: number, attributes: Record<string, unknown>) => void }) => void)
        | undefined;
      callback?.({ observe: (value, attributes) => observed.push([value, attributes]) });
      return observed;
    };
    const rates = observe('gitHotProjectCommitRate');
    const writers = observe('gitHotProjectWriters');
    expect(rates[0]).toEqual([1 / 60, { rank: '1' }]);
    expect(writers[0]).toEqual([1, { rank: '1' }]);
    for (const series of [rates, writers]) {
      expect(series.map(([, attributes]) => attributes)).toEqual(
        Array.from({ length: 10 }, (_, rank) => ({ rank: String(rank + 1) })),
      );
      expect(series.slice(1).every(([value]) => value === 0)).toBe(true);
    }
  }, 60_000);

  it('counts a lost conditional manifest write as lost_race, with no repository size', async () => {
    const { metrics, on } = recordingMetrics();
    const losing: RepositoryStore = { ...store, commitManifest: async () => 'lost' };
    const service = createService(losing, caughtUp(), { metrics });
    workerOf(service).leaseReservationFloorBytes = 1024;

    await expect(
      service.removeRef({ access: telemetryAccess, ref: 'refs/heads/conflicts/main/device-b', committedBy: ownerId }),
    ).rejects.toMatchObject({ response: { code: 'GIT_PUSH_RACE_LOST' } });

    expect(on('gitCommitAttempts').add).toHaveBeenCalledExactlyOnceWith(1, {
      outcome: 'lost_race',
      'tau.git.commit.kind': 'push',
    });
    expect(on('gitRepositorySize').record).not.toHaveBeenCalled();
  }, 60_000);
});

/**
 * Hosted Remote Storage DA3 (blueprint OD2, Finding 3): a lease reserves the bytes its kind can
 * write, read from the manifest before admission, and an owner's share is half the lease disk in
 * bytes rather than half a slot count that collapsed to one on a 7.3 GiB Machine.
 */
describe('GitRepositoryService admission by kind and real bytes (DA3)', () => {
  const store = memoryStore();
  const bytesProjectId = 'proj-da3';
  const bytesAccess: GitAccess = { ...access, projectId: bytesProjectId };
  const locator = repositoryLocator({ ownerId, projectId: bytesProjectId });
  const mebibyte = 1024 ** 2;
  const gibibyte = 1024 ** 3;
  /** Free root disk on a staging `app` Machine (capacity report 2026-10-22; BP Finding 3). */
  const stagingFreeBytes = Math.round(7.3 * gibibyte);
  /** `reservationFloorBytes` and `quotaOverrunSlackBytes`, spelled out so a changed figure fails here. */
  const floorBytes = 64 * mebibyte;
  const slackBytes = 64 * mebibyte;
  let committedBytes = 0;
  const caughtUp = (): DatabaseService =>
    databaseStub({ generation: 1, derivedGeneration: 1, storageBytes: 0 }, { failTransaction: false });
  /** What a hydrate of this repository writes: its packs plus the 1/512 index allowance. */
  const hydrated = (bytes: number): number => bytes + Math.ceil(bytes / 512);

  /** A service whose lease filesystem reports `freeBytes`, refusing at once instead of waiting. */
  const onDisk = (freeBytes: number, options: Parameters<typeof createService>[2] = {}): GitRepositoryService => {
    const service = createService(store, caughtUp(), options);
    vi.spyOn(workerOf(service), 'readLeaseDiskFreeBytes').mockResolvedValue(freeBytes);
    workerOf(service).admissionWaitMilliseconds = 0;
    return service;
  };

  /** Holds `count` leases for `who` open until the returned close is called. */
  const holdLeases = async (
    service: GitRepositoryService,
    who: GitAccess,
    count: number,
  ): Promise<() => Promise<void>> => {
    const gate = Promise.withResolvers<void>();
    const held: Array<Promise<unknown>> = [];
    for (let lease = 0; lease < count; lease += 1) {
      const admitted = Promise.withResolvers<void>();
      held.push(
        holdLease(service, who, async () => {
          admitted.resolve();
          await gate.promise;
        }),
      );
      // oxlint-disable-next-line no-await-in-loop -- each lease is admitted before the next is asked for
      await Promise.race([admitted.promise, held.at(-1)]);
    }
    return async () => {
      gate.resolve();
      await Promise.all(held);
    };
  };

  beforeAll(async () => {
    const client = scratch('da3-client');
    git(client, 'init', '--quiet', '--initial-branch=main', '.');
    git(client, 'config', 'user.name', 'DA3');
    git(client, 'config', 'user.email', 'da3@tau.test');
    writeFileSync(path.join(client, 'main.scad'), 'cube(10);\n');
    git(client, 'add', '.');
    git(client, 'commit', '--quiet', '-m', 'first revision');
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('da3-lease') });
    try {
      execFileSync('git', ['push', lease.directory, 'main'], {
        cwd: client,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment,
      });
      const result = await commitLease({ store, lease, committedBy: ownerId });
      expect(result.committed).toBe(true);
      if (result.committed) {
        committedBytes = result.manifest.packs.reduce((total, pack) => total + pack.bytes, 0);
      }
    } finally {
      await lease.dispose();
    }
    /* A KiB repository, as L4's median and the capacity test's are. */
    expect(committedBytes).toBeGreaterThan(0);
    expect(committedBytes).toBeLessThan(64 * 1024);
  }, 60_000);

  it('admits at least sixteen concurrent leases of a KiB repository for one owner on 7.3 GiB', async () => {
    const service = onDisk(stagingFreeBytes);

    const close = await holdLeases(service, bytesAccess, 16);
    try {
      await expect(holdLease(service, bytesAccess, async () => 'seventeenth')).resolves.toBe('seventeenth');
    } finally {
      await close();
    }
  }, 60_000);

  it('gives an owner holding one lease a second when the disk is plentiful', async () => {
    const { metrics, on } = recordingMetrics();
    const service = onDisk(stagingFreeBytes, { metrics });

    const close = await holdLeases(service, bytesAccess, 1);
    try {
      await expect(holdLease(service, bytesAccess, async () => 'second')).resolves.toBe('second');
    } finally {
      await close();
    }
    expect(on('gitAdmissions').add.mock.calls).toEqual([
      [1, { 'tau.git.operation': 'derive', outcome: 'admitted' }],
      [1, { 'tau.git.operation': 'derive', outcome: 'admitted' }],
    ]);
  }, 60_000);

  it('reserves a fetch at the repository’s real bytes, read from the manifest once, and gives them back', async () => {
    const { metrics, on } = recordingMetrics();
    let reads = 0;
    const counting: RepositoryStore = {
      ...store,
      readManifest: async (at, signal) => {
        reads += 1;
        return store.readManifest(at, signal);
      },
    };
    const service = createService(counting, caughtUp(), { metrics });
    vi.spyOn(workerOf(service), 'readLeaseDiskFreeBytes').mockResolvedValue(stagingFreeBytes);

    await fetchOnce(service, bytesAccess);

    expect(reads, 'admission and hydrate share one manifest read').toBe(1);
    expect(on('gitLeaseReservedBytes').record.mock.calls).toEqual([[hydrated(committedBytes) + floorBytes], [0]]);
  }, 60_000);

  it('reserves a 1 GiB repository at its real bytes, so 7.3 GiB holds six such fetches and refuses the seventh', async () => {
    const read = await store.readManifest(locator);
    const manifest = decodeManifest(read?.manifest ?? new Uint8Array());
    const [pack] = manifest.packs;
    expect(pack).toBeDefined();
    const large: RepositoryStore = {
      ...store,
      readManifest: async () =>
        read === undefined
          ? undefined
          : { ...read, manifest: encodeManifest({ ...manifest, packs: [{ ...pack!, bytes: gibibyte }] }) },
    };
    /* No gigabyte is downloaded: the hydrate is a stand-in that writes nothing, so nothing lands
       and the fake disk's free bytes stay true while each reservation is held in full. */
    vi.mocked(hydrateLease).mockImplementation(async (args) => ({
      directory: scratch('da3-large'),
      locator: args.locator,
      manifest: undefined,
      token: args.preread?.token ?? 'absent',
      hydratedPackFiles: new Set(),
      drawnBytes: { cache: 0, objectStore: 0 },
      dispose: async () => undefined,
    }));
    const { metrics, on } = recordingMetrics();
    const service = createService(large, caughtUp(), { metrics });
    vi.spyOn(workerOf(service), 'readLeaseDiskFreeBytes').mockResolvedValue(stagingFreeBytes);
    workerOf(service).admissionWaitMilliseconds = 0;
    const reservation = hydrated(gibibyte) + floorBytes;

    try {
      const owners = ['a', 'b', 'c', 'd', 'e', 'f'].map(
        (name): GitAccess => ({
          ...bytesAccess,
          ownerId: `user-da3-${name}`,
          callerId: `user-da3-${name}`,
        }),
      );
      const closes: Array<() => Promise<void>> = [];
      for (const owner of owners) {
        // oxlint-disable-next-line no-await-in-loop -- in order, so each admission sees the ones before it
        closes.push(await holdLeases(service, owner, 1));
      }
      expect(on('gitLeaseReservedBytes').record.mock.calls.at(-1)).toEqual([6 * reservation]);
      await expect(
        holdLease(service, { ...bytesAccess, ownerId: 'user-da3-g', callerId: 'user-da3-g' }, async () => undefined),
      ).rejects.toMatchObject({ response: { code: 'GIT_LEASE_DISK_FULL' } });
      await Promise.all(closes.map(async (close) => close()));
    } finally {
      vi.mocked(hydrateLease).mockRestore();
      const actual = await vi.importActual<typeof LeaseModule>('#api/git/store/lease.js');
      vi.mocked(hydrateLease).mockImplementation(actual.hydrateLease);
    }
    expect(on('gitLeaseReservedBytes').record.mock.calls.at(-1)).toEqual([0]);
  }, 60_000);

  it('refuses a push at the D20 ceiling with GIT_LEASE_DISK_FULL when its bytes do not fit, while a fetch still does', async () => {
    /* Room for the hydrate and the floor, and half the quarantine bound a push at the ceiling still needs. */
    const service = onDisk(hydrated(committedBytes) + floorBytes + slackBytes / 2);
    workerOf(service).repositoryByteCeiling = committedBytes;

    await expect(pushProbe(service, bytesAccess)).rejects.toMatchObject({
      response: { code: 'GIT_LEASE_DISK_FULL' },
    });
    await expect(fetchOnce(service, bytesAccess)).resolves.toBeUndefined();
  }, 60_000);

  it('runs receive-pack with the quarantine bound it reserved as receive.maxInputSize', async () => {
    const service = onDisk(stagingFreeBytes);
    const ceiling = committedBytes + 10 * mebibyte;
    workerOf(service).repositoryByteCeiling = ceiling;
    const spawned = vi.spyOn(
      workerOf(service) as unknown as { spawnService: (args: { maximumInputBytes: number }) => unknown },
      'spawnService',
    );

    await service.receivePack({
      access: bytesAccess,
      committedBy: ownerId,
      body: flushBody(),
      gzipped: false,
    });

    /* The plan has 10 GiB left and the ceiling 10 MiB: git stops reading at the ceiling plus the slack. */
    expect(spawned.mock.calls[0]?.[0].maximumInputBytes).toBe(10 * mebibyte + slackBytes);
  }, 60_000);

  it('waits a short, bounded time for a release before answering GIT_LEASE_OWNER_BUSY', async () => {
    let reads = 0;
    const counting: RepositoryStore = {
      ...store,
      readManifest: async (at, signal) => {
        reads += 1;
        return store.readManifest(at, signal);
      },
    };
    const service = createService(counting, caughtUp());
    /* The first lease takes more than half the lease disk, so the owner's second waits for it. */
    vi.spyOn(workerOf(service), 'readLeaseDiskFreeBytes').mockResolvedValue(
      2 * (hydrated(committedBytes) + floorBytes) + 1,
    );
    workerOf(service).admissionWaitMilliseconds = 2000;

    const close = await holdLeases(service, bytesAccess, 1);
    const second = holdLease(service, bytesAccess, async () => 'after the wait');
    setTimeout(() => {
      void close();
    }, 50);

    await expect(second).resolves.toBe('after the wait');
    /* One read each, and one more for the lease that waited: a push may have committed meanwhile. */
    expect(reads).toBe(3);

    workerOf(service).admissionWaitMilliseconds = 50;
    const again = await holdLeases(service, bytesAccess, 1);
    try {
      await expect(holdLease(service, bytesAccess, async () => undefined)).rejects.toMatchObject({
        response: { code: 'GIT_LEASE_OWNER_BUSY' },
      });
    } finally {
      await again();
    }
  }, 60_000);
});
