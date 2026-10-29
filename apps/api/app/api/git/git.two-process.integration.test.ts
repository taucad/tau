/* oxlint-disable new-cap, typescript/consistent-type-imports -- NestJS decorators are factories and constructor injection needs the runtime class */
/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Injectable, Module, NotFoundException, UnauthorizedException, VersioningType } from '@nestjs/common';
import type { CanActivate, ExecutionContext, MiddlewareConsumer, NestModule, OnModuleInit } from '@nestjs/common';
import { APP_FILTER, APP_PIPE, HttpAdapterHost } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '#auth/auth.guard.js';
import { getEnvironment } from '#config/environment.config.js';
import { DatabaseService } from '#database/database.service.js';
import { project, projectDeletion } from '#database/schema.js';
import { RedisService } from '#redis/redis.service.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import { repositoryStoreKey } from '#api/git/git.constants.js';
import { GitBasicAuthMiddleware, registerGitContentTypeParsers } from '#api/git/git-transport.js';
import { GitController } from '#api/git/git.controller.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { getStorageEnvironment } from '#config/storage-environment.config.js';
import { MetricsService } from '#telemetry/metrics.js';
import { developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import { gitExecutorKey } from '#api/git/forwarding/git-executor.js';
import { StorageReceiptsController } from '#api/git/forwarding/receipts.controller.js';
import { StorageForwarder } from '#api/git/forwarding/storage-forwarder.js';
import { startStorageApp } from '#api/git/worker/storage-app.js';
import type { StorageApp } from '#api/git/worker/storage-app.js';
import { createGitTestListener } from '#api/git/git-test-listener.js';
import type { GitTestListener } from '#api/git/git-test-listener.js';

/**
 * Success criterion S2: two or more API processes serve the same repository
 * concurrently, with **no shared disk and no cross-process lock**.
 *
 * Two complete Nest applications on two ports share exactly one thing — the
 * object store — and each builds its leases in a temporary directory of its
 * own. What is proved here is the part a single-process suite cannot: that a
 * push through one worker is immediately readable through the other, and that
 * two workers racing on one repository produce exactly one winner and a `503`
 * the loser's client retries into success (D4, NI2, NI3).
 *
 * "Two processes" is two applications rather than two OS processes on purpose.
 * The state that would make a single process cheat is process-local — a lease
 * directory, an in-memory lock, a cached manifest — and two applications in one
 * process share all of it, so an implementation that leaned on any of it fails
 * here exactly as it would across machines.
 *
 * DC1: the topology is two API applications and two tau-storage workers over
 * one object store. The APIs hold no lease and run no git; each forwards over
 * the real hop to the workers (preferring a different one), and a worker
 * posts its out-of-band receipts to the first API's receipt route.
 */

const suffix = randomBytes(5).toString('hex');
const projectId = `proj-w4x-${suffix}`;
const ownerId = `user-w4x-${suffix}`;
const token = 'two-process-token';

const cleanup: Array<() => Promise<void>> = [];

@Injectable()
class TwoProcessAuthGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();
    if (request.headers['authorization'] === `Bearer ${token}`) {
      request.user = { id: ownerId, name: ownerId, email: `${ownerId}@test.com` };
      return true;
    }
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
}

/** Runs one git command and fails the test with git's own stderr if it refused. */
const gitOk = async (
  args: readonly string[],
  cwd: string,
): Promise<{ code: number | undefined; stdout: string; stderr: string }> => {
  const outcome = await runGit(args, cwd);
  expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
  return outcome;
};

const runGit = async (
  args: readonly string[],
  cwd: string,
): Promise<{ code: number | undefined; stdout: string; stderr: string }> =>
  new Promise((resolve) => {
    const child = spawn('git', [...args], {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_AUTHOR_NAME: 'Tau Test',
        GIT_AUTHOR_EMAIL: 'test@tau.new',
        GIT_COMMITTER_NAME: 'Tau Test',
        GIT_COMMITTER_EMAIL: 'test@tau.new',
      } as unknown as NodeJS.ProcessEnv,
    });
    const stdout: Array<Uint8Array<ArrayBuffer>> = [];
    const stderr: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
    child.on('close', (code) => {
      resolve({
        code: code ?? undefined,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });

/**
 * One worker: a complete application with its own container, its own service
 * instance and its own `project_git` row. Nothing is shared but the store.
 */
const startWorker = async (
  storageUrls: readonly string[],
  boundListener?: GitTestListener,
): Promise<{ app: NestFastifyApplication; origin: string; remote: string }> => {
  const listener = boundListener ?? (await createGitTestListener());
  if (!boundListener) {
    cleanup.push(listener.close);
  }
  const { origin } = listener;
  process.env.TAU_API_URL = origin;
  const row = { storageBytes: 0, generation: 0, derivedGeneration: 0 };
  const rows = (): unknown[] => [row];

  /* oxlint-disable typescript/promise-function-async -- a Drizzle builder is
     both awaitable and chainable; an `async` member would return a promise of
     the builder rather than being one. */
  const joined = {
    leftJoin: () => joined,
    where: () => Object.assign(Promise.resolve(rows()), { limit: async () => rows() }),
  };
  const select = () => ({
    from: (table: unknown) => ({
      leftJoin: () => joined,
      where: () =>
        Object.assign(Promise.resolve([] as unknown[]), {
          limit: async () =>
            table === projectDeletion ? [] : table === project ? [{ storageAccountId: null }] : rows(),
        }),
    }),
  });
  const insert = () => ({
    values: (values: Record<string, unknown>) => ({
      onConflictDoUpdate: async (change: { set: Record<string, unknown> }): Promise<void> => {
        Object.assign(row, values, change.set);
      },
    }),
  });
  const databaseStub = {
    database: {
      select,
      insert,
      transaction: async (run: (transaction: unknown) => Promise<unknown>): Promise<unknown> =>
        run({
          select,
          insert,
          execute: async (): Promise<void> => undefined,
          update: () => ({ set: () => ({ where: () => ({ returning: async (): Promise<unknown[]> => [] }) }) }),
        }),
    },
  };
  /* oxlint-enable typescript/promise-function-async -- end of the builder stub */

  @Module({
    imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    controllers: [GitController, StorageReceiptsController],
    providers: [
      GitRepositoryService,
      {
        provide: gitExecutorKey,
        useFactory: () =>
          new StorageForwarder({
            urls: storageUrls,
            key: parseSigningKey(developmentSigningKeyJson('grant'), 'grant'),
            metrics: new MetricsService(),
          }),
      },
      GitLfsService,
      PublicationRateLimiterService,
      S3RepositoryStore,
      { provide: repositoryStoreKey, useExisting: S3RepositoryStore },
      { provide: DatabaseService, useValue: databaseStub },
      {
        provide: RedisService,
        useValue: { client: { get: async () => undefined, set: async () => 'OK', eval: async () => 1 } },
      },
      {
        provide: ProjectAccessService,
        useValue: {
          authorize: async (project: string, userId: string) => {
            if (userId !== ownerId) {
              throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
            }
            return { projectId: project, ownerId, role: 'owner' };
          },
          invalidate: () => undefined,
        },
      },
      { provide: DurableEventsService, useValue: { appendRevision: async () => undefined } },
      {
        provide: commercialEntitlementsKey,
        useValue: { getEntitlements: async () => ({ tier: 'pro', canSyncFiles: true }) },
      },
      { provide: APP_PIPE, useClass: ZodValidationPipe },
      { provide: APP_FILTER, useClass: HttpExceptionFilter },
    ],
  })
  class WorkerModule implements NestModule, OnModuleInit {
    public constructor(private readonly adapterHost: HttpAdapterHost) {}

    public onModuleInit(): void {
      registerGitContentTypeParsers(this.adapterHost.httpAdapter.getInstance<FastifyInstance>());
    }

    public configure(consumer: MiddlewareConsumer): void {
      consumer.apply(GitBasicAuthMiddleware).forRoutes(GitController);
    }
  }

  const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
    .overrideGuard(AuthGuard)
    .useClass(TwoProcessAuthGuard)
    .compile();

  let closeApplication = async (): Promise<void> => moduleRef.close();
  cleanup.push(async () => closeApplication());
  const app = moduleRef.createNestApplication<NestFastifyApplication>(listener.adapter);
  closeApplication = async () => app.close();
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app, origin, remote: `http://tau:${token}@${new URL(origin).host}/v1/git/${projectId}.git` };
};

/**
 * One tau-storage worker, in process, posting receipts to `receiptUrl`.
 *
 * S2 exercises cross-worker store and manifest races, not the lease-disk
 * admission (DA3). A 1 TiB stand-in disk keeps admission real without depending
 * on the test runner's free space, which a push's quarantine bound (about 1 GiB)
 * would otherwise have to fit in.
 */
const startStorage = async (receiptUrl: string): Promise<StorageApp> => {
  const storage = await startStorageApp({
    environment: { ...getStorageEnvironment(), PORT: 0, TAU_STORAGE_RECEIPT_URL: receiptUrl },
    host: '127.0.0.1',
  });
  storage.service.readLeaseDiskFreeBytes = async () => 1024 ** 4;
  return storage;
};

/** Kills a worker outright: every connection dropped, nothing drained. */
const kill = async (storage: StorageApp): Promise<void> => {
  storage.shutdown.stop();
  storage.server.closeAllConnections();
  await new Promise<void>((resolve) => {
    storage.server.close(() => {
      resolve();
    });
  });
};

describe('two API processes and two storage workers over one object store (S2, DC1)', () => {
  let first: Awaited<ReturnType<typeof startWorker>>;
  let second: Awaited<ReturnType<typeof startWorker>>;
  let storageA: StorageApp;
  let storageB: StorageApp;
  let workspace: string;

  beforeAll(async () => {
    process.env.TAU_API_URL = 'http://127.0.0.1:1';
    workspace = await mkdtemp(path.join(tmpdir(), 'tau-git-2p-'));
    cleanup.push(async () => rm(workspace, { recursive: true, force: true }));
    const listener = await createGitTestListener();
    cleanup.push(listener.close);
    storageA = await startStorage(listener.origin);
    cleanup.push(async () => storageA.close(1000));
    storageB = await startStorage(listener.origin);
    cleanup.push(async () => storageB.close(1000));
    first = await startWorker([storageA.url, storageB.url], listener);
    second = await startWorker([storageB.url, storageA.url]);
    assertDestructiveTestBucketAllowed(
      first.app.get(ObjectStorageService).bucketFor('private'),
      'the two-worker git suite',
    );
    cleanup.push(async () => {
      await first.app.get(ObjectStorageService).deleteEntirePrefixForPurgeJob({
        namespace: 'tenants',
        keyPrefix: `${ownerId}/`,
        tier: 'private',
      });
    });
  }, 120_000);

  afterAll(async () => {
    const errors: unknown[] = [];
    for (const close of cleanup.reverse()) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- release dependent fixtures in reverse acquisition order, even after a failure.
        await close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to clean up the two-worker git suite');
    }
  }, 60_000);

  it('serves through the second worker what was pushed through the first', async () => {
    const author = path.join(workspace, 'author');
    await gitOk(['clone', first.remote, author], workspace);
    await writeFile(path.join(author, 'part.ts'), 'export const width = 10;\n', 'utf8');
    await gitOk(['add', '.'], author);
    await gitOk(['commit', '-m', 'pushed through the first worker'], author);
    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], author);
    expect(pushed.code, pushed.stderr).toBe(0);

    /* No warm-up, no cache invalidation, no sticky routing: the second worker
       has never seen this project and hydrates it from the manifest alone. */
    const reader = path.join(workspace, 'reader');
    const cloned = await gitOk(['clone', second.remote, reader], workspace);
    expect(cloned.code).toBe(0);
    const readerLog = await gitOk(['log', '--oneline'], reader);
    expect(readerLog.stdout).toContain('pushed through the first worker');

    // And back the other way, so neither worker is the privileged one.
    await writeFile(path.join(reader, 'part.ts'), 'export const width = 11;\n', 'utf8');
    await gitOk(['commit', '-am', 'pushed through the second worker'], reader);
    const pushedBack = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], reader);
    expect(pushedBack.code, pushedBack.stderr).toBe(0);

    /* A plain fetch, not a pull: the first clone was of an empty repository,
       so this working copy has no upstream configured — and the fetch is the
       half that has to cross the store anyway. */
    await gitOk(['fetch', 'origin', 'refs/heads/main'], author);
    const fetchedLog = await gitOk(['log', '--oneline', 'FETCH_HEAD'], author);
    expect(fetchedLog.stdout).toContain('pushed through the second worker');
  }, 180_000);

  /**
   * NI3: the repository's correctness needs no lock. Two workers push
   * divergent histories at the same instant over one manifest key; the
   * conditional write decides, and the loser is told to try again rather than
   * being silently dropped or silently accepted.
   */
  it('lets exactly one of two concurrent pushes win, and the loser retries into success', async () => {
    const left = path.join(workspace, 'left');
    const right = path.join(workspace, 'right');
    await gitOk(['clone', first.remote, left], workspace);
    await gitOk(['clone', second.remote, right], workspace);

    await writeFile(path.join(left, 'left.ts'), 'export const side = "left";\n', 'utf8');
    await gitOk(['add', '.'], left);
    await gitOk(['commit', '-m', 'left revision'], left);
    await writeFile(path.join(right, 'right.ts'), 'export const side = "right";\n', 'utf8');
    await gitOk(['add', '.'], right);
    await gitOk(['commit', '-m', 'right revision'], right);

    const [leftPush, rightPush] = await Promise.all([
      runGit(['push', 'origin', 'HEAD:refs/heads/main'], left),
      runGit(['push', 'origin', 'HEAD:refs/heads/main'], right),
    ]);

    const outcomes = [leftPush, rightPush];
    const winners = outcomes.filter((outcome) => outcome.code === 0);
    expect(winners.length, `left: ${leftPush.stderr}\nright: ${rightPush.stderr}`).toBe(1);

    /* The loser is refused, never accepted-and-lost. It is refused either by
       the manifest race (503) or by git's own fast-forward rule once the
       winner's commit is the tip — both are "fetch and push again", which is
       what the loser then does. */
    const loserDirectory = leftPush.code === 0 ? right : left;
    await gitOk(['pull', '--rebase'], loserDirectory);
    const retried = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], loserDirectory);
    expect(retried.code, retried.stderr).toBe(0);

    /* Both revisions survive: the winner's, and the loser's rebased retry. */
    const verify = path.join(workspace, 'verify');
    await gitOk(['clone', second.remote, verify], workspace);
    const log = await gitOk(['log', '--oneline'], verify);
    expect(log.stdout).toContain('left revision');
    expect(log.stdout).toContain('right revision');
  }, 180_000);
  /**
   * DC1: a push over 1 MB crosses the hop as a stream (the API buffers no
   * pack), and a worker killed in the middle of a push loses no push a client
   * was told succeeded. The first push is held inside worker A's commit and A
   * is killed there; its client is refused. The retry reaches worker B (A now
   * refuses the connection), succeeds, and is readable through the other API.
   */
  it('streams a push over 1 MB and loses no acknowledged push when a worker is killed mid-push', async () => {
    const author = path.join(workspace, 'killed');
    await gitOk(['clone', first.remote, author], workspace);
    await writeFile(path.join(author, 'large.bin'), randomBytes(3 * 1024 * 1024));
    await gitOk(['add', '.'], author);
    await gitOk(['commit', '-m', 'a large revision across a killed worker'], author);

    let reached!: () => void;
    const atCommit = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let die!: (error: Error) => void;
    storageA.service.faults = async (point) => {
      if (point === 'before-manifest-commit') {
        reached();
        await new Promise<void>((_resolve, reject) => {
          die = reject;
        });
      }
    };
    const pushing = runGit(['push', 'origin', 'HEAD:refs/heads/large'], author);
    await atCommit;
    await kill(storageA);
    die(new Error('the worker was killed here'));
    const killed = await pushing;
    storageA.service.faults = undefined;

    expect(killed.code, 'a push whose worker died before its commit must not be acknowledged').not.toBe(0);

    const retried = await runGit(['push', 'origin', 'HEAD:refs/heads/large'], author);
    expect(retried.code, retried.stderr).toBe(0);

    const verify = path.join(workspace, 'verify-large');
    await gitOk(['clone', '--branch', 'large', second.remote, verify], workspace);
    const log = await gitOk(['log', '--oneline'], verify);
    expect(log.stdout).toContain('a large revision across a killed worker');
  }, 180_000);
});
