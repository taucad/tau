import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
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
import { GitController } from '#api/git/git.controller.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import type { GitAccess } from '#api/git/git.service.js';
import { registerGitContentTypeParsers } from '#api/git/git-transport.js';
import { MemoryInFlightRegistry } from '#api/git/routing/in-flight.js';
import { RepositoryRouteGuard } from '#api/git/routing/route-guard.js';
import { defaultRoute } from '#api/git/routing/route.js';
import type { RepositoryRoute } from '#api/git/routing/route.js';
import { commitLease } from '#api/git/store/commit.js';
import { commitFence } from '#api/git/store/fence.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

const ownerId = 'user_dw2';
const projectId = 'proj_dw2';

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

const access: GitAccess = {
  projectId,
  ownerId,
  role: 'owner',
  callerId: ownerId,
  remainingBytes: 10 * 1024 ** 3,
  storageLimitBytes: 10 * 1024 ** 3,
};

const roomyBudget = {
  consumeWindowBudget: async () => ({
    allowed: true,
    count: 1,
    retryAfterSeconds: 1,
  }),
} as unknown as PublicationRateLimiterService;

/**
 * The three reads the request path makes before a commit: the deletion check,
 * the storage account and the derived generation, which is always caught up
 * here so no derivation runs.
 */
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

const recordingMetrics = (): {
  metrics: MetricsService;
  admissions: ReturnType<typeof vi.fn>;
} => {
  const admissions = vi.fn();
  const instrument = (): Record<string, ReturnType<typeof vi.fn>> => ({
    add: vi.fn(),
    record: vi.fn(),
    addCallback: vi.fn(),
  });
  const metrics = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, name) => {
      if (name === 'gitAdmissions') {
        return { add: admissions };
      }
      target[name] ??= instrument();
      return target[name];
    },
  }) as unknown as MetricsService;
  return { metrics, admissions };
};

/** A guard over a route this suite sets, with the cache in the way exactly as deployed. */
const guardOver = (
  route: () => RepositoryRoute,
  options: {
    holdMilliseconds?: number;
    authoritative?: () => RepositoryRoute;
  } = {},
): RepositoryRouteGuard =>
  new RepositoryRouteGuard({
    routes: {
      lookup: async () => route(),
      lookupAuthoritative: async () => (options.authoritative ?? route)(),
    },
    registry: new MemoryInFlightRegistry(),
    ...(options.holdMilliseconds === undefined ? {} : { options: { holdMilliseconds: options.holdMilliseconds } }),
  });

const createService = (
  store: RepositoryStore,
  routes: RepositoryRouteGuard,
  metrics: MetricsService = recordingMetrics().metrics,
): GitRepositoryService => {
  const service = new GitRepositoryService(
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
    metrics,
    routes,
  );
  service.leaseDiskBytesPerLease = 1024;
  return service;
};

const frozen: RepositoryRoute = {
  store: 'r2',
  frozenAt: new Date(),
  frozenUntil: new Date(Date.now() + 10 * 60_000),
  migrationId: 'mig_dw2',
};

const scratch: string[] = [];
const store = createMemoryRepositoryStore();
const locator = repositoryLocator({ ownerId, projectId });

beforeAll(async () => {
  const client = mkdtempSync(path.join(tmpdir(), 'tau-dw2-client-'));
  scratch.push(client);
  const run = (...args: readonly string[]): void => {
    execFileSync('git', ['-c', 'user.name=DW2', '-c', 'user.email=dw2@tau.test', ...args], {
      cwd: client,
      env: gitEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  };
  run('init', '--quiet', '--initial-branch=main', '.');
  writeFileSync(path.join(client, 'main.scad'), 'cube(10);\n');
  run('add', '.');
  run('commit', '--quiet', '-m', 'first revision');
  for (const line of ['a', 'b', 'c']) {
    run('branch', `conflicts/main/device-${line}`);
  }
  const lease = await hydrateLease({ store, locator });
  try {
    run(
      'push',
      lease.directory,
      'main',
      'refs/heads/conflicts/main/device-a',
      'refs/heads/conflicts/main/device-b',
      'refs/heads/conflicts/main/device-c',
    );
    await commitLease({ store, lease, committedBy: ownerId });
  } finally {
    await lease.dispose();
  }
}, 60_000);

afterAll(() => {
  for (const directory of scratch) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('the freeze answer over HTTP (DW2)', () => {
  it('holds a fetch and a push to a frozen repository for about 5 s, then answers 429 with Retry-After: 1', async () => {
    const service = createService(
      store,
      guardOver(() => frozen),
    );
    vi.spyOn(service, 'authorize').mockResolvedValue(access);
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
      const startedAt = performance.now();
      const [fetch, push] = await Promise.all([
        app.inject({
          method: 'GET',
          url: `/v1/git/${projectId}.git/info/refs?service=git-upload-pack`,
        }),
        app.inject({
          method: 'POST',
          url: `/v1/git/${projectId}.git/git-receive-pack`,
          headers: { 'content-type': 'application/x-git-receive-pack-request' },
          payload: Buffer.from('0000'),
        }),
      ]);
      const elapsed = performance.now() - startedAt;

      for (const answer of [fetch, push]) {
        expect(answer.statusCode).toBe(429);
        expect(answer.headers['retry-after']).toBe('1');
        /* Stock git prints a text/plain body (N6), so the sentence reaches a CLI user. */
        expect(answer.headers['content-type']).toMatch(/^text\/plain/u);
        expect(answer.body).toMatch(/being moved/u);
      }
      expect(elapsed).toBeGreaterThanOrEqual(4900);
      expect(elapsed).toBeLessThan(7000);
    } finally {
      await app.close();
    }
  }, 30_000);
});

describe('the route guard inside the git service (DW1, DW2)', () => {
  it('holds before a lease is admitted, so a frozen repository costs no disk slot or hydrate', async () => {
    const { metrics, admissions } = recordingMetrics();
    const service = createService(
      store,
      guardOver(() => frozen, { holdMilliseconds: 200 }),
      metrics,
    );

    await expect(service.advertiseRefs(access, 'git-upload-pack')).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_REPOSITORY_FROZEN', retryAfterSeconds: 1 },
    });
    expect(admissions).not.toHaveBeenCalled();
  });

  it('serves a repository with no route exactly as before', async () => {
    const service = createService(
      store,
      guardOver(() => defaultRoute),
    );
    const advertisement = Buffer.from(await service.advertiseRefs(access, 'git-upload-pack')).toString('latin1');
    expect(advertisement).toContain('refs/heads/main');
  }, 60_000);

  it('refuses a commit on a fenced manifest while the route is frozen, though this Machine’s cache is stale', async () => {
    const fenced = createMemoryRepositoryStore();
    const fencedLocator = repositoryLocator({ ownerId, projectId });
    /* Copy the seeded repository, then fence it: the migrator's step 3. */
    const read = await store.readManifest(locator);
    for await (const object of store.listObjects(locator, '')) {
      const bytes = new Uint8Array(await buffer(await store.getObject(locator, object.key)));
      await fenced.putObject(fencedLocator, object.key, bytes, {
        contentLength: bytes.byteLength,
        sha256: '',
      });
    }
    await fenced.commitManifest(fencedLocator, read!.manifest, 'absent');
    const fence = await commitFence({ store: fenced, locator: fencedLocator });

    /* The cache says unfrozen (stale); Postgres says frozen. */
    const service = createService(
      fenced,
      guardOver(() => defaultRoute, { authoritative: () => frozen }),
    );
    await expect(
      service.removeRef({
        access,
        ref: 'refs/heads/conflicts/main/device-a',
        committedBy: ownerId,
      }),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_REPOSITORY_FROZEN' },
    });

    const after = await fenced.readManifest(fencedLocator);
    expect(decodeManifest(after!.manifest).generation).toBe(fence.manifest.generation);
  }, 60_000);

  it('answers a race lost while the repository is frozen with the freeze answer, not a 503', async () => {
    const losing: RepositoryStore = {
      ...store,
      commitManifest: async () => 'lost',
    };
    const service = createService(
      losing,
      guardOver(() => defaultRoute, { authoritative: () => frozen }),
    );

    await expect(
      service.removeRef({
        access,
        ref: 'refs/heads/conflicts/main/device-b',
        committedBy: ownerId,
      }),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_REPOSITORY_FROZEN', retryAfterSeconds: 1 },
    });
  }, 60_000);

  it('still answers a race lost to another push as the retryable 503 it was', async () => {
    const losing: RepositoryStore = {
      ...store,
      commitManifest: async () => 'lost',
    };
    const service = createService(
      losing,
      guardOver(() => defaultRoute),
    );

    await expect(
      service.removeRef({
        access,
        ref: 'refs/heads/conflicts/main/device-c',
        committedBy: ownerId,
      }),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'GIT_PUSH_RACE_LOST' },
    });
  }, 60_000);
});
