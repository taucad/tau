/* oxlint-disable new-cap, typescript/consistent-type-imports -- NestJS decorators are factories and constructor injection needs the runtime class */
/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors; git-lfs wire fields are snake_case */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  Injectable,
  Module,
  NotFoundException,
  UnauthorizedException,
  VersioningType,
} from '@nestjs/common';
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
import { corsBaseConfiguration } from '#constants/cors.constant.js';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { ProjectRole } from '#api/collaboration/project-access.service.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import { repositoryStoreKey } from '#api/git/git.constants.js';
import { GitBasicAuthMiddleware, registerGitContentTypeParsers } from '#api/git/git-transport.js';
import { GitController } from '#api/git/git.controller.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import { GitProxyController } from '#api/git/git-proxy.controller.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import type { RepositoryStore } from '#api/git/store/port.js';

/**
 * The Tau Hosted Remote end to end over the repository store (W4).
 *
 * Stock `git` talks to a real Nest application, which hydrates a real lease
 * from real object storage (local MinIO) on every request and commits the
 * manifest before it answers. Nothing here is a filesystem repository: between
 * two requests the only state that exists is in the store.
 */

const suffix = randomBytes(5).toString('hex');
const projectId = `proj-w4-${suffix}`;
const ownerId = `user-owner-${suffix}`;

/** The four callers D27's roles are proved with. */
const callers = {
  owner: { id: ownerId, token: 'owner-token', role: 'owner' as ProjectRole | undefined },
  writer: { id: `user-writer-${suffix}`, token: 'writer-token', role: 'write' as ProjectRole | undefined },
  reader: { id: `user-reader-${suffix}`, token: 'reader-token', role: 'read' as ProjectRole | undefined },
  stranger: { id: `user-stranger-${suffix}`, token: 'stranger-token', role: undefined },
};

const roleRank: Record<ProjectRole, number> = { read: 0, write: 1, owner: 2 };

let configuredApiUrl = '';

/** A port nothing is listening on yet, so the API can be configured for it. */
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

/** Mutable fixture state the stubs read. */
const state = {
  tier: 'pro' as 'free' | 'pro' | 'enterprise',
  storageBytes: 0,
  lfsBytes: 0,
  generation: 0,
  derivedGeneration: 0,
};

/** What one request cost the plan lookups, so the read path's cost is a fact. */
const queries = { entitlements: 0, usage: 0 };

const runGit = async (
  args: readonly string[],
  cwd: string,
  environment: Readonly<Record<string, string>> = {},
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
        ...environment,
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

/** Runs one git command and fails the test with git's own stderr if it refused. */
const gitOk = async (
  args: readonly string[],
  cwd: string,
): Promise<{ code: number | undefined; stdout: string; stderr: string }> => {
  const outcome = await runGit(args, cwd);
  expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
  return outcome;
};

@Injectable()
class GitTestAuthGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();
    const { authorization } = request.headers;
    const caller = Object.values(callers).find((candidate) => authorization === `Bearer ${candidate.token}`);
    if (caller !== undefined) {
      request.user = { id: caller.id, name: caller.id, email: `${caller.id}@test.com` };
      return true;
    }
    /* The deployed `AuthGuard` raises rather than returning `false`, and the
       difference is 401 versus Nest's default 403 (review C8). */
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
}

/**
 * Delegates every port member to `inner` and lets one test replace
 * `commitManifest`, which is how a rate-limited or lost conditional write is
 * reproduced against the real adapter rather than a fake one.
 */
const storeControl: { commitManifest: RepositoryStore['commitManifest'] | undefined } = {
  commitManifest: undefined,
};

const wrapStore = (inner: RepositoryStore): RepositoryStore => ({
  capabilities: inner.capabilities,
  readManifest: async (locator) => inner.readManifest(locator),
  commitManifest: async (locator, next, expected) =>
    (storeControl.commitManifest ?? inner.commitManifest.bind(inner))(locator, next, expected),
  // oxlint-disable-next-line max-params -- the port's own signature
  putObject: async (locator, key, body, options) => inner.putObject(locator, key, body, options),
  getObject: async (locator, key, range) => inner.getObject(locator, key, range),
  listObjects: (locator, prefix) => inner.listObjects(locator, prefix),
  deleteObjects: async (locator, keys) => inner.deleteObjects(locator, keys),
});

const lfsRows = new Map<string, { size: number; finalized: boolean }>();

describe('Tau Hosted Remote (git server) over the repository store', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  let remoteUrl: string;
  let workspace: string;
  let repositories: GitRepositoryService;
  let storage: ObjectStorageService;

  const remoteFor = (token: string): string =>
    `http://tau:${token}@${new URL(configuredApiUrl).host}/v1/git/${projectId}.git`;

  const advertised = async (token = callers.owner.token): Promise<string> => {
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.text();
  };

  beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'tau-git-work-'));
    const port = await reservePort();
    configuredApiUrl = `http://127.0.0.1:${String(port)}`;
    process.env.TAU_API_URL = configuredApiUrl;

    /* One statement shape per reader, because the derivation path and the plan
       lookups ask different questions of the same two tables. */
    const rows = (): unknown[] => [
      {
        storageBytes: state.storageBytes,
        lfsBytes: state.lfsBytes,
        generation: state.generation,
        derivedGeneration: state.derivedGeneration,
      },
    ];
    /* oxlint-disable typescript/promise-function-async -- a Drizzle builder is
       both awaitable and chainable; an `async` member would return a promise of
       the builder rather than being one. */
    const selectBuilder = (): unknown => ({
      from: () => ({
        leftJoin: () => ({ where: () => Object.assign(Promise.resolve(rows()), { limit: async () => rows() }) }),
        where: () => Object.assign(Promise.resolve([] as unknown[]), { limit: async () => rows() }),
      }),
    });
    /* oxlint-enable typescript/promise-function-async -- end of the builder stub */
    const databaseStub = {
      database: {
        select: selectBuilder,
        insert: () => ({
          values: (values: Record<string, unknown>) => ({
            onConflictDoUpdate: async (change: { set: Record<string, unknown> }): Promise<void> => {
              const merged = { ...values, ...change.set };
              if (typeof merged['storageBytes'] === 'number') {
                state.storageBytes = merged['storageBytes'];
              }
              if (typeof merged['generation'] === 'number') {
                state.generation = merged['generation'];
              }
              if (typeof merged['derivedGeneration'] === 'number') {
                state.derivedGeneration = merged['derivedGeneration'];
              }
            },
          }),
        }),
        transaction: async (run: (transaction: unknown) => Promise<unknown>): Promise<unknown> =>
          run({
            execute: async (): Promise<void> => undefined,
            update: () => ({
              set: () => ({ where: () => ({ returning: async (): Promise<unknown[]> => [] }) }),
            }),
          }),
      },
    };

    const projectAccessStub = {
      authorize: async (project: string, userId: string, need: ProjectRole) => {
        const caller = Object.values(callers).find((candidate) => candidate.id === userId);
        if (caller?.role === undefined) {
          throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
        }
        if (roleRank[caller.role] < roleRank[need]) {
          throw new ForbiddenException({
            code: 'PROJECT_ROLE_INSUFFICIENT',
            message: `This project needs ${need} access.`,
          });
        }
        /* Every collaborator's bytes land in the *owner's* tenant prefix (D27),
           which is why one locator answers for all four callers. */
        return { projectId: project, ownerId, role: caller.role };
      },
      invalidate: () => undefined,
    };

    @Module({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
      controllers: [GitController, GitProxyController],
      providers: [
        GitRepositoryService,
        GitLfsService,
        S3RepositoryStore,
        {
          provide: repositoryStoreKey,
          useFactory: (inner: S3RepositoryStore) => wrapStore(inner),
          inject: [S3RepositoryStore],
        },
        { provide: DatabaseService, useValue: databaseStub },
        {
          provide: RedisService,
          useValue: { client: { get: async () => undefined, set: async () => 'OK' } },
        },
        { provide: ProjectAccessService, useValue: projectAccessStub },
        {
          provide: commercialEntitlementsKey,
          useValue: {
            getEntitlements: async () => {
              queries.entitlements += 1;
              return { tier: state.tier, canSyncFiles: state.tier !== 'free' };
            },
          },
        },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    })
    class GitTestModule implements NestModule, OnModuleInit {
      public constructor(private readonly adapterHost: HttpAdapterHost) {}

      public onModuleInit(): void {
        registerGitContentTypeParsers(this.adapterHost.httpAdapter.getInstance<FastifyInstance>());
      }

      public configure(consumer: MiddlewareConsumer): void {
        consumer.apply(GitBasicAuthMiddleware).forRoutes(GitController);
      }
    }

    const moduleRef = await Test.createTestingModule({ imports: [GitTestModule] })
      .overrideGuard(AuthGuard)
      .useClass(GitTestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ bodyLimit: 256 * 1024 * 1024 }));
    app.enableCors({ ...corsBaseConfiguration, origin: true });
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(new URL(configuredApiUrl).port, '127.0.0.1');

    storage = app.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(storage.bucketFor('private'), 'the Tau Hosted Remote HTTP suite');

    repositories = app.get(GitRepositoryService);
    vi.spyOn(repositories, 'readOwnerUsage').mockImplementation(async () => {
      queries.usage += 1;
      return { storageBytes: state.storageBytes, lfsBytes: state.lfsBytes };
    });
    vi.spyOn(repositories, 'readLfsObjects').mockImplementation(async (_project, oids) =>
      oids.flatMap((oid) => {
        const row = lfsRows.get(oid);
        return row === undefined ? [] : [{ oid, size: row.size, finalized: row.finalized }];
      }),
    );
    vi.spyOn(repositories, 'reserveLfsObjects').mockImplementation(async ({ access, objects }) => {
      const novel = objects.filter((object) => !lfsRows.has(object.oid));
      const incoming = novel.reduce((total, object) => total + object.size, 0);
      const remainingBytes = Math.max(0, access.storageLimitBytes - state.storageBytes - state.lfsBytes);
      if (incoming > remainingBytes) {
        return { status: 'quota', shortfallBytes: incoming - remainingBytes, remainingBytes, files: novel };
      }
      for (const object of novel) {
        lfsRows.set(object.oid, { size: object.size, finalized: false });
        state.lfsBytes += object.size;
      }
      return {
        status: 'reserved',
        objects: objects.map((object) => ({ ...object, finalized: lfsRows.get(object.oid)?.finalized ?? false })),
      };
    });
    vi.spyOn(repositories, 'finalizeLfsObject').mockImplementation(async ({ oid, size }) => {
      const row = lfsRows.get(oid);
      if (row === undefined || row.size !== size) {
        return 'unreserved';
      }
      if (row.finalized) {
        return 'already-finalized';
      }
      row.finalized = true;
      return 'finalized';
    });

    baseUrl = configuredApiUrl;
    remoteUrl = remoteFor(callers.owner.token);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await storage.deleteEntirePrefixForPurgeJob({
      namespace: 'tenants',
      keyPrefix: `${ownerId}/`,
      tier: 'private',
    });
    await rm(workspace, { recursive: true, force: true });
  }, 60_000);

  it('serves a stock `git clone`, `git push` and `git fetch` with nothing on disk between them', async () => {
    const clone = path.join(workspace, 'clone');
    await gitOk(['clone', remoteUrl, clone], workspace);

    await writeFile(path.join(clone, 'part.ts'), 'export const width = 10;\n', 'utf8');
    await gitOk(['add', '.'], clone);
    await gitOk(['commit', '-m', 'first revision'], clone);

    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(pushed.code, pushed.stderr).toBe(0);

    /* D19: the generation is recorded and everything derived from it caught up
       *before* the response — no background work, no poll. Accounting is the
       manifest's live pack bytes, so a push that stored bytes is a row above
       zero. */
    expect(state.generation).toBe(1);
    expect(state.derivedGeneration).toBe(1);
    expect(state.storageBytes).toBeGreaterThan(0);

    const second = path.join(workspace, 'second');
    await gitOk(['clone', remoteUrl, second], workspace);
    const log = await gitOk(['log', '--oneline'], second);
    expect(log.stdout).toContain('first revision');
  }, 120_000);

  it('advertises refs/heads/main on info/refs?service=git-upload-pack', async () => {
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${callers.owner.token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-git-upload-pack-advertisement');
    const body = await response.text();
    expect(body.startsWith('001e# service=git-upload-pack\n0000')).toBe(true);
    expect(body).toContain('refs/heads/main');
  });

  /** D12: the dumb layout is gone, and an unnamed service is now a refusal. */
  it('refuses info/refs without a service instead of answering a dumb-HTTP layout', async () => {
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs`, {
      headers: { Authorization: `Bearer ${callers.owner.token}` },
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('smart HTTP');

    const objects = await fetch(`${baseUrl}/v1/git/${projectId}.git/objects/info/packs`, {
      headers: { Authorization: `Bearer ${callers.owner.token}` },
    });
    expect(objects.status).toBe(404);
  });

  /**
   * NI13: the hook's own sentence reaches the client, byte for byte, and the
   * A39 two-set rule holds — the refused record ref does not stop the branch,
   * because they are two pushes.
   */
  it('relays the pre-receive refusal verbatim and keeps the pushes that were allowed', async () => {
    const clone = path.join(workspace, 'clone');
    await gitOk(['update-ref', 'refs/tau/chats/chat_1', 'HEAD'], clone);
    await gitOk(['update-ref', 'refs/tau/owners/owner_1', 'HEAD'], clone);

    const refusedOwners = await runGit(['push', 'origin', 'refs/tau/owners/owner_1'], clone);
    expect(refusedOwners.code).not.toBe(0);
    expect(refusedOwners.stderr).toContain(
      'Tau: refused refs/tau/owners/owner_1 — host-local refs never leave a host.',
    );

    const chatPush = await runGit(['push', 'origin', 'refs/tau/chats/chat_1'], clone);
    expect(chatPush.code, chatPush.stderr).toBe(0);

    await writeFile(path.join(clone, 'part.ts'), 'export const width = 12;\n', 'utf8');
    await gitOk(['commit', '-am', 'second revision'], clone);
    const branchPush = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(branchPush.code, branchPush.stderr).toBe(0);

    const references = await advertised();
    expect(references).toContain('refs/tau/chats/chat_1');
    expect(references).not.toContain('refs/tau/owners/owner_1');
  }, 120_000);

  it('rejects a mixed stock push atomically, without accepting its ordinary branch', async () => {
    const clone = path.join(workspace, 'clone');
    await writeFile(path.join(clone, 'part.ts'), 'export const width = 13;\n', 'utf8');
    await gitOk(['commit', '-am', 'mixed push probe'], clone);
    await gitOk(['update-ref', 'refs/heads/sync/tau/main', 'HEAD'], clone);

    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/atomic-probe', 'refs/heads/sync/tau/main'], clone);
    expect(pushed.code).not.toBe(0);
    expect(pushed.stderr).toContain('refs/heads/sync/tau/main');

    expect(await advertised()).not.toContain('atomic-probe');
  }, 120_000);

  /**
   * D4: a manifest race the committer lost is a 503 the client retries, never a
   * refusal and never a silent success. The race is injected at W2's own
   * `before-manifest-commit` fault point, which is the instant a second writer
   * would have won.
   */
  it('answers a lost manifest race with 503 and succeeds on the retry', async () => {
    const clone = path.join(workspace, 'clone');
    await writeFile(path.join(clone, 'part.ts'), 'export const width = 14;\n', 'utf8');
    await gitOk(['commit', '-am', 'raced revision'], clone);

    repositories.faults = (point) => {
      if (point === 'before-manifest-commit') {
        throw new RepositoryStoreError('lost', 'another writer committed first');
      }
    };
    const raced = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    repositories.faults = undefined;

    expect(raced.code, `the lost race was accepted: ${raced.stderr}`).not.toBe(0);
    expect(raced.stderr).toMatch(/503|committed first/u);
    expect(await advertised()).not.toContain('raced revision');

    const retried = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(retried.code, retried.stderr).toBe(0);
  }, 120_000);

  /**
   * W0b: R2 answers a same-key burst with `429` and `retry-after: 5`, which the
   * AWS SDK surfaces under an unrelated error *name* — so the classification is
   * the HTTP status alone. W2 retries the conditional write twice; a caller that
   * exhausts them is a lost race for the client's purposes, which is 503 and a
   * retry rather than a 500.
   */
  it('retries a rate-limited manifest write and answers 503 once the retries are spent', async () => {
    const clone = path.join(workspace, 'clone');
    await writeFile(path.join(clone, 'part.ts'), 'export const width = 15;\n', 'utf8');
    await gitOk(['commit', '-am', 'rate limited revision'], clone);

    const attempts = { count: 0 };
    storeControl.commitManifest = async () => {
      attempts.count += 1;
      throw Object.assign(new Error('Reduce your concurrent request rate for the same object'), {
        name: 'ServiceUnavailable',
        $metadata: { httpStatusCode: 429 },
      });
    };
    const refused = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    storeControl.commitManifest = undefined;

    expect(attempts.count, 'the conditional write must be retried, not abandoned on the first 429').toBe(3);
    expect(refused.code).not.toBe(0);
    expect(refused.stderr).toMatch(/503|committed first/u);

    const retried = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(retried.code, retried.stderr).toBe(0);
  }, 120_000);

  /**
   * D19, end to end: a worker killed *after* its manifest commit leaves a
   * durable ref and a row that never heard about it. Nothing sweeps that up in
   * the background — the next request through the repository notices
   * `derived_generation` trails the manifest it is holding and re-derives. A
   * read is enough, because the repair keys off the lease's own manifest rather
   * than off anything the row claims (review F1).
   */
  it('repairs the derived row on the next request after a worker dies past its commit', async () => {
    const clone = path.join(workspace, 'clone');
    await writeFile(path.join(clone, 'part.ts'), 'export const width = 16;\n', 'utf8');
    await gitOk(['commit', '-am', 'the revision that outlived its worker'], clone);

    const before = { generation: state.generation, derivedGeneration: state.derivedGeneration };
    repositories.faults = (point) => {
      if (point === 'after-manifest-commit') {
        throw new Error('the worker died here');
      }
    };
    const killed = await runGit(['push', 'origin', 'HEAD:refs/heads/outlived'], clone);
    repositories.faults = undefined;
    await repositories.settled();

    expect(killed.code, 'the client must not be told a push succeeded when its worker died').not.toBe(0);
    expect(state.generation, 'a killed worker must not have recorded its generation').toBe(before.generation);
    expect(state.derivedGeneration).toBe(before.derivedGeneration);

    /* The commit is durable all the same, and the plain read that proves it is
       also the request that repairs the row: both columns agree afterwards. */
    expect(await advertised()).toContain('refs/heads/outlived');
    expect(state.derivedGeneration).toBeGreaterThan(before.derivedGeneration);
    expect(state.generation).toBe(state.derivedGeneration);
  }, 120_000);

  /**
   * D20, over the wire: the ceiling is enforced in `pre-receive`, so the client
   * sees the hook's sentence *and the files it brings*. The figure is lowered
   * for the suite rather than pushing a gigabyte; the mechanism under test is
   * the refusal, not the number.
   */
  it('refuses a push past the repository ceiling with the file list, and writes no ref', async () => {
    const clone = path.join(workspace, 'ceiling');
    await gitOk(['clone', remoteUrl, clone], workspace);
    await writeFile(path.join(clone, 'huge.bin'), Buffer.alloc(96 * 1024, 3));
    await gitOk(['add', '.'], clone);
    await gitOk(['commit', '-m', 'over the ceiling'], clone);

    const ceiling = repositories.repositoryByteCeiling;
    repositories.repositoryByteCeiling = 1024;
    const refused = await runGit(['push', 'origin', 'HEAD:refs/heads/ceiling-probe'], clone);
    repositories.repositoryByteCeiling = ceiling;

    expect(refused.code, refused.stderr).not.toBe(0);
    expect(refused.stderr).toContain('Tau: repository size limit exceeded');
    expect(refused.stderr).toContain('huge.bin');
    expect(refused.stderr).toContain('nothing was written');
    expect(await advertised()).not.toContain('ceiling-probe');
  }, 120_000);

  /** D27: a collaborator pushes into the owner's storage, under the owner's plan. */
  it('lets a write collaborator push, and refuses a read collaborator', async () => {
    const clone = path.join(workspace, 'collaborator');
    await gitOk(['clone', remoteFor(callers.writer.token), clone], workspace);
    await writeFile(path.join(clone, 'collaborator.ts'), 'export const shared = true;\n', 'utf8');
    await gitOk(['add', '.'], clone);
    await gitOk(['commit', '-m', 'collaborator revision'], clone);
    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(pushed.code, pushed.stderr).toBe(0);

    /* A reader clones and fetches, and is refused the moment it asks for the
       push service — which is where git asks, before it sends a byte. */
    const readOnly = path.join(workspace, 'read-only');
    await gitOk(['clone', remoteFor(callers.reader.token), readOnly], workspace);
    const refused = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { Authorization: `Bearer ${callers.reader.token}` },
    });
    expect(refused.status).toBe(403);
    expect(await refused.text()).toContain('write access');
  }, 120_000);

  /** Ruling P55: an account with no relation to the project is told it does not exist. */
  it('answers a stranger with 404 rather than 403', async () => {
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${callers.stranger.token}` },
    });
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('not found');
  });

  /**
   * D33: admission is concurrent leases × the per-lease reservation against the
   * worker's free disk. A worker that cannot hold another lease says so with a
   * `Retry-After` rather than filling its own disk and failing halfway.
   */
  it('answers 503 with Retry-After when this worker has no room for another lease', async () => {
    const reservation = repositories.leaseDiskBytesPerLease;
    repositories.leaseDiskBytesPerLease = Number.MAX_SAFE_INTEGER;
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${callers.owner.token}` },
    });
    repositories.leaseDiskBytesPerLease = reservation;

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    expect(await response.text()).toContain('retry shortly');
  });

  it('challenges an unauthenticated git client with Basic so stock git asks for credentials', async () => {
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Basic realm="Tau"');
  });

  it('answers a browser git client’s preflight with every header it sends', async () => {
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://tau.new',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'git-protocol',
      },
    });
    expect(response.status).toBeLessThan(300);
    const allowed = (response.headers.get('access-control-allow-headers') ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase());
    expect(allowed).toEqual(
      expect.arrayContaining(['git-protocol', 'content-type', 'authorization', 'x-tau-proxy-authorization']),
    );
  });

  /**
   * C7 / N6: git prints the body of a failed request only when it is
   * `text/plain`; a browser is told apart by `Origin` and keeps the JSON
   * envelope.
   */
  it('answers a git-protocol refusal as text/plain for a client that is not a browser', async () => {
    state.tier = 'free';
    const forGit = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { Authorization: `Bearer ${callers.owner.token}` },
    });
    const forBrowser = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { Authorization: `Bearer ${callers.owner.token}`, origin: 'https://tau.new' },
    });
    state.tier = 'pro';

    expect(forGit.status).toBe(403);
    expect(forGit.headers.get('content-type')).toMatch(/text\/plain/u);
    expect(await forGit.text()).toContain('paid plan');

    expect(forBrowser.status).toBe(403);
    expect(forBrowser.headers.get('content-type')).toMatch(/application\/json/u);
    expect(await forBrowser.json()).toEqual(expect.objectContaining({ code: 'GIT_SYNC_NOT_ENTITLED' }));
  });

  it('answers an unauthenticated browser request through CORS instead of the raw challenge', async () => {
    const browser = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { origin: 'https://tau.new' },
    });
    expect(browser.status).toBe(401);
    expect(browser.headers.get('access-control-allow-origin')).toBe('https://tau.new');
    expect(await browser.json()).toEqual(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  /**
   * C28, restated for W3's cache: a read consults neither `canSyncFiles` nor the
   * plan headroom, and a write pays for the plan once rather than twice.
   */
  it('costs a read no plan lookup at all', async () => {
    queries.entitlements = 0;
    queries.usage = 0;

    const read = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${callers.owner.token}` },
    });
    expect(read.status).toBe(200);
    expect(queries).toEqual({ entitlements: 0, usage: 0 });

    const write = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { Authorization: `Bearer ${callers.owner.token}` },
    });
    expect(write.status).toBe(200);
    expect(queries).toEqual({ entitlements: 1, usage: 1 });
  });

  it('hands out an LFS upload action under the owner’s tenant prefix and verifies the stored object', async () => {
    const bytes = Buffer.from('hello world\n');
    const oid = createHash('sha256').update(bytes).digest('hex');
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/lfs/objects/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${callers.owner.token}`,
        'content-type': 'application/vnd.git-lfs+json',
      },
      body: JSON.stringify({ operation: 'upload', transfers: ['basic'], objects: [{ oid, size: 12 }] }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      transfer: string;
      objects: Array<{ oid: string; actions?: { upload?: { href: string }; verify?: { href: string } } }>;
    };
    expect(body.transfer).toBe('basic');
    const action = body.objects[0]?.actions?.upload;
    /* D24: the bytes land under the owner's tenant prefix, whichever
       collaborator uploaded them. */
    expect(action?.href).toContain(`/tenants/${tenantLfsObjectKey(ownerId, projectId, oid)}?`);
    expect(body.objects[0]?.actions?.verify?.href).toContain('/info/lfs/objects/verify');

    const stored = await fetch(action?.href ?? '', { method: 'PUT', body: bytes });
    expect(stored.ok, `presigned PUT failed: ${String(stored.status)}`).toBe(true);
    const verified = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/lfs/objects/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${callers.owner.token}`,
        'content-type': 'application/vnd.git-lfs+json',
      },
      body: JSON.stringify({ oid, size: 12 }),
    });
    expect(verified.status).toBe(200);
    expect(state.lfsBytes).toBe(12);

    state.lfsBytes = 0;
    lfsRows.delete(oid);
  }, 60_000);

  it('refuses an over-quota LFS batch with 413 and the file list', async () => {
    state.storageBytes = 10 * 1024 ** 3 - 1024;
    const objects = [
      { oid: 'b'.repeat(64), size: 4096 },
      { oid: 'c'.repeat(64), size: 8192 },
    ];
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/lfs/objects/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${callers.owner.token}`,
        'content-type': 'application/vnd.git-lfs+json',
      },
      body: JSON.stringify({ operation: 'upload', transfers: ['basic'], objects }),
    });
    state.storageBytes = 0;

    expect(response.status).toBe(413);
    const body = (await response.json()) as { files?: Array<{ oid: string }>; message?: string };
    expect(body.files?.map((file) => file.oid)).toEqual(objects.map((object) => object.oid));
    expect(body.message).toContain('quota');
  });

  /**
   * C24 (charter I8): the `verify` action carries the caller's own Tau bearer,
   * so its href is built from the validated `TAU_API_URL` and never from the
   * client's own `Host`.
   */
  it('builds the LFS verify href from the configured API URL, not from the request', async () => {
    const spoofed = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const upstream = new URL(baseUrl);
      const call = httpRequest(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: `/v1/git/${projectId}.git/info/lfs/objects/batch`,
          method: 'POST',
          headers: {
            authorization: `Bearer ${callers.owner.token}`,
            'content-type': 'application/vnd.git-lfs+json',
            host: 'evil.example',
          },
        },
        (answer) => {
          const chunks: Array<Uint8Array<ArrayBuffer>> = [];
          answer.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
          answer.on('end', () => {
            resolve({ status: answer.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
          });
        },
      );
      call.on('error', reject);
      call.end(
        JSON.stringify({ operation: 'upload', transfers: ['basic'], objects: [{ oid: 'd'.repeat(64), size: 7 }] }),
      );
    });

    expect(spoofed.status).toBe(200);
    const body = JSON.parse(spoofed.body) as {
      objects: Array<{ actions?: { verify?: { href: string; header?: Record<string, string> } } }>;
    };
    const verify = body.objects[0]?.actions?.verify;
    expect(verify?.href).not.toContain('evil.example');
    expect(verify?.href).toBe(`${configuredApiUrl}/v1/git/${projectId}.git/info/lfs/objects/verify`);
    expect(verify?.header?.['Authorization']).toBe(`Bearer ${callers.owner.token}`);

    state.lfsBytes = 0;
    lfsRows.delete('d'.repeat(64));
  });

  /**
   * C25 / ruling OQ4: compare-and-swap for every ref family. `--force-with-lease`
   * is client discipline; this is the server's.
   */
  it('refuses a ref deletion and a non-fast-forward push, and keeps what they aimed at', async () => {
    const clone = path.join(workspace, 'cas');
    await gitOk(['clone', remoteUrl, clone], workspace);
    await gitOk(['tag', 'v-cas'], clone);
    await gitOk(['push', 'origin', 'refs/tags/v-cas'], clone);
    await gitOk(['update-ref', 'refs/tau/chats/chat_cas', 'HEAD'], clone);
    await gitOk(['push', 'origin', 'refs/tau/chats/chat_cas'], clone);

    const deletedTag = await runGit(['push', 'origin', ':refs/tags/v-cas'], clone);
    expect(deletedTag.code, `tag deletion was accepted: ${deletedTag.stderr}`).not.toBe(0);

    const deletedRecord = await runGit(['push', 'origin', ':refs/tau/chats/chat_cas'], clone);
    expect(deletedRecord.code, `record deletion was accepted: ${deletedRecord.stderr}`).not.toBe(0);

    const head = await gitOk(['rev-parse', 'HEAD'], clone);
    await gitOk(['reset', '--hard', 'HEAD~1'], clone);
    const rewound = await runGit(['push', '--force', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(rewound.code, `a force push was accepted: ${rewound.stderr}`).not.toBe(0);

    const references = await advertised();
    expect(references).toContain('refs/tags/v-cas');
    expect(references).toContain('refs/tau/chats/chat_cas');
    expect(references).toContain(head.stdout.trim());
  }, 120_000);

  it('refuses a proxy target with a credential in the URL, a private host, or a non-git path', async () => {
    for (const target of [
      'https://github.com/tau/x.git/info/refs?access_token=secret',
      'https://127.0.0.1:9000/x.git/info/refs',
      'https://github.com/tau/x.git/secrets',
      'http://github.com/tau/x.git/info/refs',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time, by design
      const refused = await fetch(`${baseUrl}/v1/git/proxy?url=${encodeURIComponent(target)}`, {
        headers: { Authorization: `Bearer ${callers.owner.token}` },
      });
      expect(refused.status, target).toBe(400);
    }
  });
});
