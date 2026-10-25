import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { PassThrough, Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { VersioningType } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '#auth/auth.guard.js';
import type { DatabaseService } from '#database/database.service.js';
import { project, projectDeletion } from '#database/schema.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import type { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import {
  MemoryOwnerInFlightCap,
  OwnerInFlightGate,
  ownerInFlightPushCap,
  ownerInFlightRequestCap,
} from '#api/git/admission/owner-in-flight.js';
import { GitController, syncRefusalOf } from '#api/git/git.controller.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import type { GitAccess } from '#api/git/git.service.js';
import { registerGitContentTypeParsers } from '#api/git/git-transport.js';
import { RepositoryRouteGuard } from '#api/git/routing/route-guard.js';
import { StorageGitService } from '#api/git/worker/storage-git.service.js';
import { commitLease } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { loopbackExecutor, loopbackReceiptChannel } from '#testing/loopback-executor.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

/*
 * DA6 (north star Q16, charter D8): the per-owner in-flight cap at the API's git
 * admission, inside the service and over HTTP. Ten git requests per owner, five
 * of them pushes; over the cap the API answers 429 with a jittered Retry-After,
 * before the request costs a manifest read, a lease or a git child. Every slot
 * comes back when its request ends: completed, aborted by the client, or failed.
 */

const ownerId = 'user_da6';
const otherOwnerId = 'user_da6_other';
const projectId = 'proj_da6';

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const gitEnvironment = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  TAU_GIT_PUSH_ADMITTED: '1',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const accessOf = (owner: string): GitAccess => ({
  projectId,
  ownerId: owner,
  role: 'owner',
  callerId: owner,
  remainingBytes: 10 * 1024 ** 3,
  storageLimitBytes: 10 * 1024 ** 3,
});
const access = accessOf(ownerId);

const roomyBudget = {
  consumeWindowBudget: async () => ({
    allowed: true,
    count: 1,
    retryAfterSeconds: 1,
  }),
} as unknown as PublicationRateLimiterService;

const databaseStub = (): DatabaseService => {
  /* oxlint-disable typescript/promise-function-async -- a Drizzle builder is awaitable and chainable */
  const select = (): unknown => ({
    from: (table: unknown) => ({
      where: () =>
        Object.assign(Promise.resolve([]), {
          limit: async (): Promise<unknown[]> =>
            table === projectDeletion
              ? []
              : table === project
                ? [{ storageAccountId: null }]
                : [{ generation: 1000, derivedGeneration: 1000 }],
        }),
    }),
  });
  /* oxlint-enable typescript/promise-function-async -- end of the builder stub */
  return {
    database: {
      select,
      transaction: async (run: (transaction: unknown) => Promise<unknown>): Promise<unknown> =>
        run({ execute: async (): Promise<void> => undefined, select }),
    },
  } as unknown as DatabaseService;
};

const quietMetrics = (): MetricsService =>
  new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, name) => {
      target[name] ??= { add: vi.fn(), record: vi.fn(), addCallback: vi.fn() };
      return target[name];
    },
  }) as unknown as MetricsService;

/*
 * DC1: the API forwards each RPC to tau-storage. Here the worker runs in
 * process behind the loopback executor and shares the store, so a manifest
 * read held below is held whether the API (an advertisement) or the worker
 * (a push's or fetch's hydrate) makes it.
 */
const createService = (store: RepositoryStore, owners: OwnerInFlightGate): GitRepositoryService => {
  // oxlint-disable-next-line prefer-const -- assigned after the worker whose receipt channel closes over it
  let api: GitRepositoryService | undefined;
  const worker = new StorageGitService({
    store,
    receipts: loopbackReceiptChannel(async (receipt) => api?.applyReceipt(receipt)),
  });
  worker.leaseReservationFloorBytes = 1024;
  worker.readLeaseDiskFreeBytes = async () => 1024 ** 4;
  api = new GitRepositoryService(
    databaseStub(),
    {
      getEntitlements: async () => ({ tier: 'pro', canSyncFiles: true }),
    } as unknown as CommercialEntitlementsService,
    mock<ObjectStorageService>({
      account: { id: 'tau-default' },
    } as unknown as ObjectStorageService),
    {
      authorize: async () => ({ projectId, ownerId, role: 'owner' }),
    } as unknown as ProjectAccessService,
    store,
    roomyBudget,
    mock<DurableEventsService>(),
    new ShutdownService(),
    quietMetrics(),
    RepositoryRouteGuard.open(),
    loopbackExecutor(worker),
    undefined,
    owners,
  );
  return api;
};

/** The seeded store, with every manifest read of `ownerId`'s repository held until `open`. */
const heldStore = (): {
  store: RepositoryStore;
  reads: () => number;
  open: () => void;
  started: (count: number) => Promise<void>;
} => {
  const held: RepositoryStore = { ...seeded };
  const { promise: gate, resolve } = Promise.withResolvers<undefined>();
  let reads = 0;
  held.readManifest = async (locator) => {
    if (locator.ownerId === ownerId) {
      reads += 1;
      await gate;
    }
    return seeded.readManifest(locator);
  };
  return {
    store: held,
    reads: () => reads,
    open: () => {
      resolve(undefined);
    },
    started: async (count) => {
      await vi.waitFor(() => {
        expect(reads).toBeGreaterThanOrEqual(count);
      });
    },
  };
};

const seeded = createMemoryRepositoryStore();
const scratch: string[] = [];
let mainHead = '';

beforeAll(async () => {
  const client = mkdtempSync(path.join(tmpdir(), 'tau-da6-client-'));
  scratch.push(client);
  const run = (...args: readonly string[]): void => {
    execFileSync('git', ['-c', 'user.name=DA6', '-c', 'user.email=da6@tau.test', ...args], {
      cwd: client,
      env: gitEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  };
  run('init', '--quiet', '--initial-branch=main', '.');
  writeFileSync(path.join(client, 'main.scad'), 'cube(10);\n');
  run('add', '.');
  run('commit', '--quiet', '-m', 'first revision');
  const locator = repositoryLocator({ ownerId, projectId });
  const lease = await hydrateLease({ store: seeded, locator });
  try {
    run('push', lease.directory, 'main');
    await commitLease({ store: seeded, lease, committedBy: ownerId });
  } finally {
    await lease.dispose();
  }
  const read = await seeded.readManifest(locator);
  mainHead = decodeManifest(read!.manifest).refs['refs/heads/main']!.oid;
}, 60_000);

afterAll(() => {
  for (const directory of scratch) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const ownerCapRefusal = {
  status: 429,
  response: {
    code: 'GIT_OWNER_IN_FLIGHT_LIMIT',
    retryAfterSeconds: expect.any(Number) as unknown,
  },
};

/** The pkt-line framing of a hand-written upload-pack request. */
const pktLine = (text: string): string => `${(text.length + 4).toString(16).padStart(4, '0')}${text}`;

describe('the owner cap inside the git service (DA6)', () => {
  it('refuses an owner’s eleventh request while ten are in flight, before its manifest is read', async () => {
    const cap = new MemoryOwnerInFlightCap();
    const held = heldStore();
    const service = createService(held.store, new OwnerInFlightGate({ cap }));

    const inFlight = Array.from({ length: ownerInFlightRequestCap }, async () =>
      service.advertiseRefs(access, 'git-upload-pack'),
    );
    await held.started(ownerInFlightRequestCap);

    const refused = await service.advertiseRefs(access, 'git-upload-pack').catch((error: unknown) => error);
    expect(refused).toMatchObject(ownerCapRefusal);
    const { retryAfterSeconds } = (refused as { getResponse: () => { retryAfterSeconds: number } }).getResponse();
    expect(retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(retryAfterSeconds).toBeLessThanOrEqual(3);
    expect(held.reads()).toBe(ownerInFlightRequestCap);

    /* Another owner is served while this one is at its cap. */
    await expect(service.advertiseRefs(accessOf(otherOwnerId), 'git-upload-pack')).resolves.toBeDefined();

    held.open();
    await Promise.all(inFlight);
    expect(cap.inFlight(ownerId)).toEqual({ requests: 0, pushes: 0 });
    /* Completed requests gave their slots back. */
    await expect(service.advertiseRefs(access, 'git-upload-pack')).resolves.toBeDefined();
  }, 60_000);

  it('refuses an owner’s sixth push while five are in flight, and still admits that owner’s fetch', async () => {
    const cap = new MemoryOwnerInFlightCap();
    const held = heldStore();
    const service = createService(held.store, new OwnerInFlightGate({ cap }));
    const push = async (): Promise<unknown> => {
      try {
        return await service.receivePack({
          access,
          committedBy: ownerId,
          body: Readable.from([Buffer.from('0000')]),
          gzipped: false,
        });
      } catch (error) {
        return error;
      }
    };

    const pushes = Array.from({ length: ownerInFlightPushCap }, push);
    await held.started(ownerInFlightPushCap);
    expect(cap.inFlight(ownerId)).toEqual({ requests: 5, pushes: 5 });

    expect(await push()).toMatchObject(ownerCapRefusal);
    expect(held.reads()).toBe(ownerInFlightPushCap);

    const fetch = service.advertiseRefs(access, 'git-upload-pack');
    await held.started(ownerInFlightPushCap + 1);
    expect(cap.inFlight(ownerId)).toEqual({ requests: 6, pushes: 5 });

    held.open();
    await Promise.all([...pushes, fetch]);
    expect(cap.inFlight(ownerId)).toEqual({ requests: 0, pushes: 0 });
  }, 60_000);

  it('gives the slot back when a push fails', async () => {
    const cap = new MemoryOwnerInFlightCap();
    /* The hydrate cannot read the repository's pack: the push fails inside its lease. */
    const failing: RepositoryStore = {
      ...seeded,
      getObject: async () => {
        throw new Error('store down');
      },
    };
    const service = createService(failing, new OwnerInFlightGate({ cap }));

    await expect(
      service.receivePack({
        access,
        committedBy: ownerId,
        body: Readable.from([Buffer.from('0000')]),
        gzipped: false,
      }),
    ).rejects.toBeDefined();
    expect(cap.inFlight(ownerId)).toEqual({ requests: 0, pushes: 0 });
  }, 60_000);

  it('gives the slot back when a manifest read fails before the lease', async () => {
    const cap = new MemoryOwnerInFlightCap();
    const failing: RepositoryStore = {
      ...seeded,
      readManifest: async () => {
        throw new Error('store down');
      },
    };
    const service = createService(failing, new OwnerInFlightGate({ cap }));

    await expect(service.advertiseRefs(access, 'git-upload-pack')).rejects.toBeDefined();
    await expect(
      service.uploadPack({
        access,
        body: Readable.from([]),
        gzipped: false,
      }),
    ).rejects.toBeDefined();
    expect(cap.inFlight(ownerId)).toEqual({ requests: 0, pushes: 0 });
  }, 60_000);

  it('holds a fetch’s slot until its pack has streamed out, then gives it back', async () => {
    const cap = new MemoryOwnerInFlightCap();
    const service = createService(seeded, new OwnerInFlightGate({ cap }));

    const output = await service.uploadPack({
      access,
      body: Readable.from([Buffer.from(`${pktLine(`want ${mainHead}\n`)}0000${pktLine('done\n')}`)]),
      gzipped: false,
    });
    expect(cap.inFlight(ownerId)).toEqual({ requests: 1, pushes: 0 });
    const pack = await buffer(output);
    expect(pack.toString('latin1')).toContain('PACK');
    await vi.waitFor(() => {
      expect(cap.inFlight(ownerId)).toEqual({ requests: 0, pushes: 0 });
    });
  }, 60_000);

  it('gives a fetch’s slot back when the client walks away mid-request', async () => {
    const cap = new MemoryOwnerInFlightCap();
    const service = createService(seeded, new OwnerInFlightGate({ cap }));
    const abort = new AbortController();
    /* A body that never ends: upload-pack waits on it until the abort. */
    const body = new PassThrough();
    body.write(pktLine(`want ${mainHead}\n`));

    const output = await service.uploadPack({
      access,
      body,
      gzipped: false,
      abort: abort.signal,
    });
    output.resume();
    expect(cap.inFlight(ownerId)).toEqual({ requests: 1, pushes: 0 });
    abort.abort();
    await vi.waitFor(() => {
      expect(cap.inFlight(ownerId)).toEqual({ requests: 0, pushes: 0 });
    });
  }, 60_000);
});

describe('the owner cap over HTTP (DA6)', () => {
  it('answers 429 with a Retry-After of one to three seconds and a sentence stock git prints', async () => {
    const cap = new MemoryOwnerInFlightCap();
    const service = createService(seeded, new OwnerInFlightGate({ cap }));
    vi.spyOn(service, 'authorize').mockResolvedValue(access);
    /* The owner already has ten requests in flight, on this Machine or any other. */
    const slots = await Promise.all(
      Array.from({ length: ownerInFlightRequestCap }, async () => cap.acquire(ownerId, 'request')),
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [GitController],
      providers: [
        { provide: GitRepositoryService, useValue: service },
        { provide: GitLfsService, useValue: {} },
        { provide: PublicationRateLimiterService, useValue: roomyBudget },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://api.tau.test' },
        },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext): boolean => {
          context.switchToHttp().getRequest<{ user?: unknown }>().user = {
            id: ownerId,
          };
          return true;
        },
      })
      .compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.enableVersioning({ type: VersioningType.URI });
    registerGitContentTypeParsers(app.getHttpAdapter().getInstance());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      const answers = await Promise.all([
        app.inject({
          method: 'GET',
          url: `/v1/git/${projectId}.git/info/refs?service=git-upload-pack`,
        }),
        app.inject({
          method: 'POST',
          url: `/v1/git/${projectId}.git/git-upload-pack`,
          headers: { 'content-type': 'application/x-git-upload-pack-request' },
          payload: Buffer.from('0000'),
        }),
        app.inject({
          method: 'POST',
          url: `/v1/git/${projectId}.git/git-receive-pack`,
          headers: { 'content-type': 'application/x-git-receive-pack-request' },
          payload: Buffer.from('0000'),
        }),
      ]);
      for (const answer of answers) {
        expect(answer.statusCode).toBe(429);
        expect(['1', '2', '3']).toContain(answer.headers['retry-after']);
        expect(answer.headers['content-type']).toMatch(/^text\/plain/u);
        expect(answer.body).toMatch(/too many git requests/iu);
      }
    } finally {
      await app.close();
      for (const slot of slots) {
        if (slot.admitted) {
          slot.release();
        }
      }
    }
  }, 30_000);

  it('counts the refusal under its own sync refusal code, not as other', () => {
    const refusal = new OwnerInFlightGate({
      cap: new MemoryOwnerInFlightCap(),
    }).refusal(2);
    expect(syncRefusalOf(refusal)).toEqual({
      'tau.sync.refusal.code': 'GIT_OWNER_IN_FLIGHT_LIMIT',
      'http.response.status_code': 429,
    });
  });
});
