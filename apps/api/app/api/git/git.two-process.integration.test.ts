/* oxlint-disable new-cap, typescript/consistent-type-imports -- NestJS decorators are factories and constructor injection needs the runtime class */
/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
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
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '#auth/auth.guard.js';
import { getEnvironment } from '#config/environment.config.js';
import { DatabaseService } from '#database/database.service.js';
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
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';

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
 */

const suffix = randomBytes(5).toString('hex');
const projectId = `proj-w4x-${suffix}`;
const ownerId = `user-w4x-${suffix}`;
const token = 'two-process-token';

const reservePort = async (): Promise<number> =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'string' || address === null ? 0 : address.port;
      probe.close(() => {
        resolve(port);
      });
    });
  });

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
const startWorker = async (): Promise<{ app: NestFastifyApplication; origin: string; remote: string }> => {
  const port = await reservePort();
  const origin = `http://127.0.0.1:${String(port)}`;
  const row = { storageBytes: 0, generation: 0, derivedGeneration: 0 };
  const rows = (): unknown[] => [row];

  /* oxlint-disable typescript/promise-function-async -- a Drizzle builder is
     both awaitable and chainable; an `async` member would return a promise of
     the builder rather than being one. */
  const databaseStub = {
    database: {
      select: () => ({
        from: () => ({
          leftJoin: () => ({ where: () => Object.assign(Promise.resolve(rows()), { limit: async () => rows() }) }),
          where: () => Object.assign(Promise.resolve([] as unknown[]), { limit: async () => rows() }),
        }),
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async (change: { set: Record<string, unknown> }): Promise<void> => {
            Object.assign(row, values, change.set);
          },
        }),
      }),
      transaction: async (run: (transaction: unknown) => Promise<unknown>): Promise<unknown> =>
        run({
          execute: async (): Promise<void> => undefined,
          update: () => ({ set: () => ({ where: () => ({ returning: async (): Promise<unknown[]> => [] }) }) }),
        }),
    },
  };
  /* oxlint-enable typescript/promise-function-async -- end of the builder stub */

  @Module({
    imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    controllers: [GitController],
    providers: [
      GitRepositoryService,
      GitLfsService,
      S3RepositoryStore,
      { provide: repositoryStoreKey, useExisting: S3RepositoryStore },
      { provide: DatabaseService, useValue: databaseStub },
      { provide: RedisService, useValue: { client: { get: async () => undefined, set: async () => 'OK' } } },
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

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ bodyLimit: 256 * 1024 * 1024 }),
  );
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await app.listen(String(port), '127.0.0.1');

  return { app, origin, remote: `http://tau:${token}@127.0.0.1:${String(port)}/v1/git/${projectId}.git` };
};

describe('two API workers over one object store (S2)', () => {
  let first: Awaited<ReturnType<typeof startWorker>>;
  let second: Awaited<ReturnType<typeof startWorker>>;
  let workspace: string;

  beforeAll(async () => {
    process.env.TAU_API_URL = 'http://127.0.0.1:1';
    workspace = await mkdtemp(path.join(tmpdir(), 'tau-git-2p-'));
    first = await startWorker();
    second = await startWorker();
    assertDestructiveTestBucketAllowed(
      first.app.get(ObjectStorageService).bucketFor('private'),
      'the two-worker git suite',
    );
  }, 120_000);

  afterAll(async () => {
    await first.app.get(ObjectStorageService).deleteEntirePrefixForPurgeJob({
      namespace: 'tenants',
      keyPrefix: `${ownerId}/`,
      tier: 'private',
    });
    await first.app.close();
    await second.app.close();
    await rm(workspace, { recursive: true, force: true });
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
});
