/* oxlint-disable new-cap, typescript/consistent-type-imports -- NestJS decorators are factories and constructor injection needs the runtime class */
/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors; git-lfs wire fields are snake_case */
import { spawn } from 'node:child_process';
import { createHash, randomFillSync } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Injectable, Module, UnauthorizedException, VersioningType } from '@nestjs/common';
import type { CanActivate, ExecutionContext, MiddlewareConsumer, NestModule, OnModuleInit } from '@nestjs/common';
import { APP_FILTER, APP_PIPE, HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '#auth/auth.guard.js';
import { corsBaseConfiguration } from '#constants/cors.constant.js';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import { GitBasicAuthMiddleware, registerGitContentTypeParsers } from '#api/git/git-transport.js';
import { GitController } from '#api/git/git.controller.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { GitProxyController } from '#api/git/git-proxy.controller.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import { project, projectGit } from '#database/schema.js';

const projectId = 'proj_w11a';
const ownerId = 'user-owner';
const ownerToken = 'owner-token';

/**
 * This harness's stand-in for the deployed `TAU_API_URL`.
 *
 * Reserved before the application is built, because `GitController` reads the
 * value in its constructor (the point of C24 is that the LFS endpoint is a
 * configured fact rather than a per-request one) and stock `git-lfs` then has
 * to reach it. Assigned in `beforeAll`.
 */
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

/**
 * A forwarding shim that hides *smart* HTTP and passes everything else through
 * to the API unchanged.
 *
 * Git has no client-side switch for the dumb protocol: it asks for
 * `info/refs?service=git-upload-pack` and walks the dumb layout only when the
 * answer is not a smart advertisement. A 404 is not that — git dies with
 * "repository not found" — so the shim drops the `service` parameter and lets
 * the API answer with the plain `info/refs` file `update-server-info` wrote,
 * which is exactly what a deployment without smart HTTP returns. Every other
 * byte of the clone — `HEAD`, `info/refs`,
 * `objects/info/packs`, each loose object and pack, and git-lfs's batch POST —
 * is served by the API's own routes, which is what W18/V8 name as an
 * acceptance path and what no suite had ever actually performed.
 *
 * @param target - The API origin to forward to.
 * @returns The shim server and its origin.
 */
const createDumbOnlyProxy = async (target: string): Promise<{ server: Server; origin: string }> =>
  new Promise((resolve) => {
    const upstream = new URL(target);
    const server = createServer((incoming, response) => {
      const requested = incoming.url ?? '/';
      const url = requested.includes('?service=') ? requested.slice(0, requested.indexOf('?')) : requested;
      const forwarded = httpRequest(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: url,
          method: incoming.method,
          headers: incoming.headers,
        },
        (answer) => {
          response.writeHead(answer.statusCode ?? 502, answer.headers);
          answer.pipe(response);
        },
      );
      forwarded.on('error', () => {
        response.statusCode = 502;
        response.end();
      });
      incoming.pipe(forwarded);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'string' || address === null ? 0 : address.port;
      resolve({ server, origin: `http://127.0.0.1:${String(port)}` });
    });
  });

/** Mutable fixture state the stubs read. */
const state = {
  ownerId: ownerId as string | undefined,
  tier: 'pro' as 'free' | 'pro' | 'enterprise',
  storageBytes: 0,
  lfsBytes: 0,
};

/**
 * What one request cost the database, so the read path's cost is a fact rather
 * than a reading of the source (review C28).
 */
const queries = { project: 0, entitlements: 0, usage: 0 };

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

@Injectable()
class GitTestAuthGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();
    const { authorization } = request.headers;
    if (authorization === `Bearer ${ownerToken}`) {
      request.user = { id: ownerId, name: 'Owner', email: 'owner@test.com' };
      return true;
    }
    /* The deployed `AuthGuard` raises rather than returning `false`, and the
       difference is 401 versus Nest's default 403 — which is what a browser
       client has to tell apart (review C8). */
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
}

/** The bytes a presigned PUT stored, keyed by object-store key. */
const objectStore = new Map<string, Uint8Array<ArrayBuffer>>();
const lfsRows = new Map<string, { size: number; finalized: boolean }>();

const createObjectStoreServer = async (): Promise<{
  server: Server;
  origin: string;
}> =>
  new Promise((resolve) => {
    const server = createServer((request, response) => {
      const key = decodeURIComponent((request.url ?? '/').slice(1).split('?')[0] ?? '');
      if (request.method === 'PUT') {
        const chunks: Array<Uint8Array<ArrayBuffer>> = [];
        request.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
        request.on('end', () => {
          objectStore.set(key, Buffer.concat(chunks));
          response.statusCode = 200;
          response.end();
        });
        return;
      }
      const stored = objectStore.get(key);
      if (stored === undefined) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.statusCode = 200;
      response.setHeader('content-length', String(stored.byteLength));
      response.end(stored);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'string' || address === null ? 0 : address.port;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });

describe('Tau Hosted Remote (git server) over HTTP', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  let remoteUrl: string;
  let gitRoot: string;
  let workspace: string;
  let storeOrigin: string;
  let storeServer: Server;

  beforeAll(async () => {
    gitRoot = await mkdtemp(path.join(tmpdir(), 'tau-git-root-'));
    workspace = await mkdtemp(path.join(tmpdir(), 'tau-git-work-'));
    const port = await reservePort();
    configuredApiUrl = `http://127.0.0.1:${String(port)}`;
    ({ server: storeServer, origin: storeOrigin } = await createObjectStoreServer());

    const databaseStub = {
      database: {
        select: () => ({
          from: (table: unknown) => ({
            where: () => ({
              limit: async (): Promise<unknown[]> => {
                if (table === project) {
                  queries.project += 1;
                  return state.ownerId === undefined ? [] : [{ ownerId: state.ownerId }];
                }
                if (table === projectGit) {
                  return [
                    {
                      storageBytes: state.storageBytes,
                      lfsBytes: state.lfsBytes,
                    },
                  ];
                }
                return [];
              },
            }),
          }),
        }),
        insert: () => ({
          values: (values: { storageBytes?: number; lfsBytes?: number }) => ({
            onConflictDoUpdate: async (update: { set: Record<string, unknown> }): Promise<void> => {
              if (typeof update.set['storageBytes'] === 'number') {
                state.storageBytes = update.set['storageBytes'];
              } else if (typeof values.storageBytes === 'number' && values.storageBytes > 0) {
                state.storageBytes = values.storageBytes;
              }
              if (update.set['lfsBytes'] !== undefined) {
                state.lfsBytes += values.lfsBytes ?? 0;
              }
            },
          }),
        }),
      },
    };

    const objectStorageStub = {
      headBlob: async (args: { key: string }) => {
        const stored = objectStore.get(args.key);
        return stored === undefined
          ? undefined
          : {
              contentType: 'application/octet-stream',
              size: stored.byteLength,
              etag: '"x"',
              cacheControl: '',
            };
      },
      getBlob: async (args: { key: string }) => {
        const stored = objectStore.get(args.key);
        if (stored === undefined) {
          throw new Error('Object missing');
        }
        return {
          body: Readable.from([stored]),
          contentType: 'application/octet-stream',
          etag: 'x',
          contentLength: stored.byteLength,
        };
      },
      presignPut: async (args: { key: string }) => `${storeOrigin}/${encodeURIComponent(args.key)}`,
      presignGet: async (args: { key: string }) => `${storeOrigin}/${encodeURIComponent(args.key)}`,
      putBlob: async (args: { key: string; body: Uint8Array<ArrayBuffer> }) => {
        objectStore.set(args.key, Buffer.from(args.body));
        return { etag: '"x"', alreadyExisted: false };
      },
    };

    @Module({
      controllers: [GitController, GitProxyController],
      providers: [
        GitRepositoryService,
        GitLfsService,
        {
          provide: RedisService,
          useValue: { client: { get: async () => undefined, set: async () => 'OK' } },
        },
        { provide: DatabaseService, useValue: databaseStub },
        { provide: ObjectStorageService, useValue: objectStorageStub },
        {
          provide: commercialEntitlementsKey,
          useValue: {
            getEntitlements: async () => {
              queries.entitlements += 1;
              return {
                tier: state.tier,
                canSyncFiles: state.tier !== 'free',
              };
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string): unknown => {
              if (key === 'TAU_GIT_ROOT') {
                return gitRoot;
              }
              return key === 'TAU_API_URL' ? configuredApiUrl : '';
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

    const moduleRef = await Test.createTestingModule({
      imports: [GitTestModule],
    })
      .overrideGuard(AuthGuard)
      .useClass(GitTestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ bodyLimit: 256 * 1024 * 1024 }));
    /* The deployed allow-list, so a browser preflight is answered here exactly
       as `main.ts` answers it (W18 DEF-5). Only the origin predicate differs. */
    app.enableCors({ ...corsBaseConfiguration, origin: true });
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(new URL(configuredApiUrl).port, '127.0.0.1');

    const repositories = app.get(GitRepositoryService);
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
        return {
          status: 'quota',
          shortfallBytes: incoming - remainingBytes,
          remainingBytes,
          files: novel,
        };
      }
      for (const object of novel) {
        lfsRows.set(object.oid, { size: object.size, finalized: false });
        state.lfsBytes += object.size;
      }
      return {
        status: 'reserved',
        objects: objects.map((object) => ({
          ...object,
          finalized: lfsRows.get(object.oid)?.finalized ?? false,
        })),
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
    remoteUrl = `http://tau:${ownerToken}@${new URL(configuredApiUrl).host}/v1/git/${projectId}.git`;
  });

  afterAll(async () => {
    await app.close();
    storeServer.close();
    await rm(gitRoot, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  });

  it('serves a stock `git clone`, `git push` and `git fetch` for a project', async () => {
    const clone = path.join(workspace, 'clone');
    const cloned = await runGit(['clone', remoteUrl, clone], workspace);
    expect(cloned.code, cloned.stderr).toBe(0);

    await writeFile(path.join(clone, 'part.ts'), 'export const width = 10;\n', 'utf8');
    {
      const outcome = await runGit(['add', '.'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['commit', '-m', 'first revision'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    state.storageBytes = 0;
    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(pushed.code, pushed.stderr).toBe(0);
    await expect
      .poll(() => state.storageBytes, {
        message: 'a completed receive-pack response must retain its post-push accounting work',
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    const second = path.join(workspace, 'second');
    const secondClone = await runGit(['clone', remoteUrl, second], workspace);
    expect(secondClone.code, secondClone.stderr).toBe(0);
    const log = await runGit(['log', '--oneline'], second);
    expect(log.stdout).toContain('first revision');
  });

  // Red pin (a).
  it('advertises refs/heads/main on info/refs?service=git-upload-pack', async () => {
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-git-upload-pack-advertisement');
    const body = await response.text();
    expect(body.startsWith('001e# service=git-upload-pack\n0000')).toBe(true);
    expect(body).toContain('refs/heads/main');
  });

  it.each(['git-upload-pack', 'git-receive-pack'] as const)(
    'should answer a %s POST with the smart-HTTP result status and media type',
    async (service) => {
      const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/${service}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'content-type': `application/x-${service}-request`,
        },
        body: '0000',
      });
      await response.arrayBuffer();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')?.split(';', 1)[0]).toBe(`application/x-${service}-result`);
    },
  );

  /**
   * W18 DEF-5, pinned on the wire rather than on the constant: a real preflight
   * for the header `isomorphic-git` sends. Until `git-protocol` was allowed, the
   * `204` below carried every other name and Chromium dropped the `GET` that
   * follows without surfacing anything to the page.
   */
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

  it('challenges an unauthenticated git client with Basic so stock git asks for credentials', async () => {
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Basic realm="Tau"');
  });

  // Red pin (b) — and the A39 two-set rule: the rejected record ref does not
  // stop the history set, because they are two pushes.
  it('refuses a host-local ref and keeps the chat ref and the branch push', async () => {
    const clone = path.join(workspace, 'clone');
    {
      const outcome = await runGit(['update-ref', 'refs/tau/chats/chat_1', 'HEAD'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['update-ref', 'refs/tau/owners/owner_1', 'HEAD'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }

    const refusedOwners = await runGit(['push', 'origin', 'refs/tau/owners/owner_1'], clone);
    expect(refusedOwners.code).not.toBe(0);
    expect(refusedOwners.stderr).toContain('refs/tau/owners/owner_1');
    expect(refusedOwners.stderr).toContain('host-local');

    const chatPush = await runGit(['push', 'origin', 'refs/tau/chats/chat_1'], clone);
    expect(chatPush.code, chatPush.stderr).toBe(0);

    await writeFile(path.join(clone, 'part.ts'), 'export const width = 12;\n', 'utf8');
    {
      const outcome = await runGit(['commit', '-am', 'second revision'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    const branchPush = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(branchPush.code, branchPush.stderr).toBe(0);

    const advertised = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(async (response) => response.text());
    expect(advertised).toContain('refs/tau/chats/chat_1');
    expect(advertised).not.toContain('refs/tau/owners/owner_1');
  });

  it('rejects a mixed stock push without accepting its ordinary branch', async () => {
    const clone = path.join(workspace, 'clone');
    await writeFile(path.join(clone, 'part.ts'), 'export const width = 13;\n', 'utf8');
    {
      const outcome = await runGit(['commit', '-am', 'mixed push probe'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['update-ref', 'refs/heads/sync/tau/main', 'HEAD'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/atomic-probe', 'refs/heads/sync/tau/main'], clone);
    expect(pushed.code).not.toBe(0);
    expect(pushed.stderr).toContain('refs/heads/sync/tau/main');

    const advertised = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(async (response) => response.text());
    expect(advertised).not.toContain('refs/heads/atomic-probe');
  });

  it('serves the read-only dumb-HTTP layout kept current by update-server-info', async () => {
    const head = await fetch(`${baseUrl}/v1/git/${projectId}.git/HEAD`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(head.status).toBe(200);
    const headBody = await head.text();
    expect(headBody).toContain('refs/heads/main');

    const references = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(references.status).toBe(200);
    const referencesBody = await references.text();
    expect(referencesBody).toContain('refs/heads/main');

    const refused = await fetch(`${baseUrl}/v1/git/${projectId}.git/config`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(refused.status).toBe(404);
  });

  it('answers a project the caller does not own with 404', async () => {
    state.ownerId = 'user-someone-else';
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    state.ownerId = ownerId;
    expect(response.status).toBe(404);
  });

  it('refuses a push from an account without the sync entitlement', async () => {
    state.tier = 'free';
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    state.tier = 'pro';
    expect(response.status).toBe(403);
  });

  // Red pin (d).
  it('hands out an LFS upload action at the git-lfs oid path and verifies the stored object', async () => {
    const bytes = Buffer.from('hello world\n');
    const oid = createHash('sha256').update(bytes).digest('hex');
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/lfs/objects/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'content-type': 'application/vnd.git-lfs+json',
      },
      body: JSON.stringify({
        operation: 'upload',
        transfers: ['basic'],
        objects: [{ oid, size: 12 }],
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      transfer: string;
      objects: Array<{
        oid: string;
        actions?: { upload?: { href: string }; verify?: { href: string } };
      }>;
    };
    expect(body.transfer).toBe('basic');
    const action = body.objects[0]?.actions?.upload;
    expect(action?.href).toContain(encodeURIComponent(gitLfsObjectKey(projectId, oid)));
    expect(gitLfsObjectKey(projectId, oid)).toBe(
      `git-lfs/${projectId}/lfs/objects/${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`,
    );
    expect(body.objects[0]?.actions?.verify?.href).toContain('/info/lfs/objects/verify');

    await fetch(action?.href ?? '', { method: 'PUT', body: bytes });
    const verified = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/lfs/objects/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'content-type': 'application/vnd.git-lfs+json',
      },
      body: JSON.stringify({ oid, size: 12 }),
    });
    expect(verified.status).toBe(200);
    expect(state.lfsBytes).toBe(12);
    const verifiedAgain = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/lfs/objects/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'content-type': 'application/vnd.git-lfs+json',
      },
      body: JSON.stringify({ oid, size: 12 }),
    });
    expect(verifiedAgain.status).toBe(200);
    expect(state.lfsBytes).toBe(12);
    state.lfsBytes = 0;
    lfsRows.delete(oid);
    objectStore.delete(gitLfsObjectKey(projectId, oid));
  });

  // Red pin (c).
  it('refuses an over-quota LFS batch with 413 and the file list', async () => {
    state.storageBytes = 10 * 1024 ** 3 - 1024;
    const objects = [
      { oid: 'b'.repeat(64), size: 4096 },
      { oid: 'c'.repeat(64), size: 8192 },
    ];
    const response = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/lfs/objects/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'content-type': 'application/vnd.git-lfs+json',
      },
      body: JSON.stringify({
        operation: 'upload',
        transfers: ['basic'],
        objects,
      }),
    });
    state.storageBytes = 0;
    expect(response.status).toBe(413);
    const body = (await response.json()) as {
      files?: Array<{ oid: string; size: number }>;
      message?: string;
    };
    expect(body.files?.map((file) => file.oid)).toEqual(objects.map((object) => object.oid));
    expect(body.message).toContain('quota');
  });

  it('refuses an over-quota push in pre-receive without writing a ref', async () => {
    const clone = path.join(workspace, 'clone');
    await writeFile(path.join(clone, 'part.ts'), 'export const width = 14;\n', 'utf8');
    {
      const outcome = await runGit(['commit', '-am', 'third revision'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }

    state.storageBytes = 10 * 1024 ** 3 - 1;
    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/quota-probe'], clone);
    state.storageBytes = 0;

    expect(pushed.code).not.toBe(0);
    expect(pushed.stderr).toContain('quota');
    const advertised = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(async (response) => response.text());
    expect(advertised).not.toContain('quota-probe');
  });

  /**
   * W18 DEF-4, root-caused here rather than at `receive.maxInputSize`.
   *
   * The pack is larger than the plan headroom but smaller than
   * `quotaOverrunSlackBytes`, so git's own input ceiling deliberately does not
   * fire and the `pre-receive` backstop is what has to refuse it — over a
   * *chunked* push, which is the shape DEF-4 was reported against: git
   * authenticates such a push with an empty `git-receive-pack` POST first, and
   * this row runs the whole two-request exchange.
   *
   * The spent allowance is seeded as **LFS** bytes on purpose. `storage_bytes`
   * is the repository as the server last measured it, so the accounting that
   * follows the empty probe POST overwrites any figure a fixture puts there —
   * which is the whole of what DEF-4 observed (see the lane report).
   */
  it('refuses a chunked push that does not fit in what is left of the plan', async () => {
    const clone = path.join(workspace, 'over-plan');
    {
      const outcome = await runGit(['clone', remoteUrl, clone], workspace);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    const noise = Buffer.alloc(8 * 1024 * 1024);
    randomFillSync(noise);
    await writeFile(path.join(clone, 'noise.bin'), noise);
    {
      const outcome = await runGit(['add', '.'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['commit', '-m', 'over plan'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }

    state.lfsBytes = 10 * 1024 ** 3 - 4 * 1024 * 1024;
    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/over-plan'], clone);
    state.lfsBytes = 0;

    expect(pushed.code, `push stderr: ${pushed.stderr}`).not.toBe(0);
    /* The hook's own sentence, not a family of refusals (review R3): git's
       `pack exceeds maximum allowed size` and `authorize`'s `Storage quota
       reached` would both satisfy a looser match, and either would mean the
       backstop had rotted behind a green row. */
    expect(pushed.stderr).toContain('Tau: storage quota exceeded');
    const advertised = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(async (response) => response.text());
    expect(advertised).not.toContain('over-plan');
  }, 120_000);

  it('round-trips a large object through stock git-lfs', async () => {
    const clone = path.join(workspace, 'lfs-clone');
    {
      const outcome = await runGit(['clone', remoteUrl, clone], workspace);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['lfs', 'install', '--local'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    await writeFile(path.join(clone, '.gitattributes'), '*.bin filter=lfs diff=lfs merge=lfs -text\n', 'utf8');
    await writeFile(path.join(clone, 'scan.bin'), Buffer.alloc(2 * 1024 * 1024, 7));
    {
      const outcome = await runGit(['add', '.'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['commit', '-m', 'large object'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }

    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(pushed.code, pushed.stderr).toBe(0);
    expect([...objectStore.keys()].some((key) => key.startsWith(`git-lfs/${projectId}/lfs/objects/`))).toBe(true);
    expect(state.lfsBytes).toBe(2 * 1024 * 1024);

    // A clone whose git-lfs filter is configured smudges the pointer back into
    // the real bytes through the batch API's `download` actions. (The harness
    // pins `GIT_CONFIG_GLOBAL=/dev/null`, so the filter is installed per clone
    // rather than inherited from the developer's own git configuration.)
    const reader = path.join(workspace, 'lfs-reader');
    const cloned = await runGit(['clone', remoteUrl, reader], workspace);
    expect(cloned.code, cloned.stderr).toBe(0);
    {
      const outcome = await runGit(['lfs', 'install', '--local'], reader);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    const pulled = await runGit(['lfs', 'pull'], reader);
    expect(pulled.code, pulled.stderr).toBe(0);
    const { size } = await stat(path.join(reader, 'scan.bin'));
    expect(size).toBe(2 * 1024 * 1024);
  });

  /**
   * V8 / W18's acceptance path, performed rather than reasoned about: a stock
   * `git clone` over the **dumb** protocol of a repository that holds an LFS
   * object, followed by `git lfs pull`.
   *
   * The repository is the one the row above pushed `scan.bin` to, so the clone
   * walks `info/refs`, `objects/info/packs` and every loose object through
   * `GitController.dumbHttp`, and git-lfs then smudges the pointer through the
   * batch API. It also happens to prove C24 from the other side: the shim's own
   * `Host` is what the API sees, and the `verify` href is still the configured
   * one.
   */
  it('clones over the dumb protocol with stock git and pulls its LFS object', async () => {
    const { server: shim, origin: shimOrigin } = await createDumbOnlyProxy(baseUrl);
    try {
      const smart = await fetch(`${shimOrigin}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(smart.status).toBe(200);
      expect(
        smart.headers.get('content-type'),
        'the shim must hide smart HTTP for git to walk the dumb layout',
      ).toContain('text/plain');

      const into = path.join(workspace, 'dumb-clone');
      const dumbUrl = `http://tau:${ownerToken}@${new URL(shimOrigin).host}/v1/git/${projectId}.git`;
      const cloned = await runGit(['clone', '-q', dumbUrl, into], workspace);
      expect(cloned.code, cloned.stderr).toBe(0);

      const expected = await runGit(['rev-parse', 'refs/heads/main'], path.join(gitRoot, `${projectId}.git`));
      const actual = await runGit(['rev-parse', 'HEAD'], into);
      expect(actual.stdout.trim()).toBe(expected.stdout.trim());

      {
        const outcome = await runGit(['lfs', 'install', '--local'], into);
        expect(outcome.code, outcome.stderr).toBe(0);
      }
      const pulled = await runGit(['lfs', 'pull'], into);
      expect(pulled.code, pulled.stderr).toBe(0);
      const { size } = await stat(path.join(into, 'scan.bin'));
      expect(size).toBe(2 * 1024 * 1024);
    } finally {
      shim.close();
    }
  }, 120_000);

  /**
   * C24 (P0, charter I8): the `verify` action carries the caller's own Tau
   * bearer, so its href decides where that credential is sent.
   *
   * It used to be built from `request.protocol`/`request.host`: behind Fly
   * `trustProxy` is unset and TLS terminates at the proxy, so `protocol` was
   * `http` and the credential crossed the public internet in cleartext — and
   * `Host` is the client's own header, so the same line let a caller point its
   * credential at any origin it liked. Built from the validated `TAU_API_URL`
   * instead, exactly as `git-proxy.controller.ts` already builds the LFS relay.
   */
  it('builds the LFS verify href from the configured API URL, not from the request', async () => {
    /* `fetch` refuses to set `Host` (it is a forbidden header name), and `Host`
       is half of what C24 is about — so this one request is written with the
       raw client, exactly as a hostile caller would. */
    const spoofed = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const upstream = new URL(baseUrl);
      const call = httpRequest(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: `/v1/git/${projectId}.git/info/lfs/objects/batch`,
          method: 'POST',
          headers: {
            authorization: `Bearer ${ownerToken}`,
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
        JSON.stringify({
          operation: 'upload',
          transfers: ['basic'],
          objects: [{ oid: 'd'.repeat(64), size: 7 }],
        }),
      );
    });

    expect(spoofed.status).toBe(200);
    const body = JSON.parse(spoofed.body) as {
      objects: Array<{ actions?: { verify?: { href: string; header?: Record<string, string> } } }>;
    };
    const verify = body.objects[0]?.actions?.verify;
    expect(verify?.href).not.toContain('evil.example');
    expect(verify?.href).toBe(`${configuredApiUrl}/v1/git/${projectId}.git/info/lfs/objects/verify`);
    /* The credential is still attached — that is git-lfs's contract — which is
       exactly why the href above may not be the caller's to choose. */
    expect(verify?.header?.['Authorization']).toBe(`Bearer ${ownerToken}`);

    state.lfsBytes = 0;
    lfsRows.delete('d'.repeat(64));
  });

  /**
   * C25 / ruling OQ4: compare-and-swap, enforced where it can be.
   *
   * `pre-receive` matches ref *names* only, so until `receive.denyDeletes` and
   * `receive.denyNonFastForwards` joined the spawn a client could delete a
   * published tag, delete a chat record ref and force-rewind `main` — all three
   * reproduced against the real hook. `--force-with-lease` is client
   * discipline; this is the server's, and it covers every ref family because
   * retention is server-local (D17) and never needs a client delete.
   */
  it('refuses a ref deletion and a non-fast-forward push, and keeps what they aimed at', async () => {
    const clone = path.join(workspace, 'cas');
    {
      const outcome = await runGit(['clone', remoteUrl, clone], workspace);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['tag', 'v-cas'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['push', 'origin', 'refs/tags/v-cas'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['update-ref', 'refs/tau/chats/chat_cas', 'HEAD'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    {
      const outcome = await runGit(['push', 'origin', 'refs/tau/chats/chat_cas'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }

    const deletedTag = await runGit(['push', 'origin', ':refs/tags/v-cas'], clone);
    expect(deletedTag.code, `tag deletion was accepted: ${deletedTag.stderr}`).not.toBe(0);

    const deletedRecord = await runGit(['push', 'origin', ':refs/tau/chats/chat_cas'], clone);
    expect(deletedRecord.code, `record deletion was accepted: ${deletedRecord.stderr}`).not.toBe(0);

    const head = await runGit(['rev-parse', 'HEAD'], clone);
    {
      const outcome = await runGit(['reset', '--hard', 'HEAD~1'], clone);
      expect(outcome.code, outcome.stderr).toBe(0);
    }
    const rewound = await runGit(['push', '--force', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(rewound.code, `a force push was accepted: ${rewound.stderr}`).not.toBe(0);

    const advertised = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(async (response) => response.text());
    expect(advertised).toContain('refs/tags/v-cas');
    expect(advertised).toContain('refs/tau/chats/chat_cas');
    expect(advertised).toContain(head.stdout.trim());
  }, 120_000);

  /**
   * C7 / N6: git prints the body of a failed request only when it is
   * `text/plain` (`show_http_message`, measured against git 2.55) — under
   * `application/json` the identical bytes are discarded and a free account
   * sees `error: 403` and nothing else. A browser is told apart by `Origin`,
   * which stock git never sends, and keeps the JSON envelope.
   */
  it('answers a git-protocol refusal as text/plain for a client that is not a browser', async () => {
    state.tier = 'free';
    const forGit = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const forBrowser = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}`, origin: 'https://tau.new' },
    });
    state.tier = 'pro';

    expect(forGit.status).toBe(403);
    expect(forGit.headers.get('content-type')).toMatch(/text\/plain/u);
    expect(await forGit.text()).toContain('paid plan');

    expect(forBrowser.status).toBe(403);
    expect(forBrowser.headers.get('content-type')).toMatch(/application\/json/u);
    expect(await forBrowser.json()).toEqual(expect.objectContaining({ code: 'GIT_SYNC_NOT_ENTITLED' }));
  });

  /**
   * C8: the Basic challenge is written straight to the raw `ServerResponse`, so
   * neither `@fastify/cors` nor `@fastify/helmet` runs on it — a signed-out
   * browser `fetch` saw an opaque network failure and could not tell "sign in
   * again" from "the API is down". Stock git never sends `Origin`, and it is
   * the only client that needs the challenge, so a request that carries one
   * goes to the guard and is answered through the whole chain.
   */
  it('answers an unauthenticated browser request through CORS instead of the raw challenge', async () => {
    const browser = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { origin: 'https://tau.new' },
    });
    expect(browser.status).toBe(401);
    expect(browser.headers.get('access-control-allow-origin')).toBe('https://tau.new');
    expect(await browser.json()).toEqual(expect.objectContaining({ code: 'UNAUTHORIZED' }));

    // Stock git still gets the challenge that makes it ask its credential helper.
    const git = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`);
    expect(git.status).toBe(401);
    expect(git.headers.get('www-authenticate')).toBe('Basic realm="Tau"');
  });

  /**
   * C28: a read consults neither `canSyncFiles` nor the plan headroom, and it
   * used to pay for both anyway — `getEntitlements` is three uncached queries
   * by design and `readOwnerUsage` is a `sum()` across every project the owner
   * has. A dumb-HTTP clone pays `authorize` once per *object*, which is what
   * made five round-trips per read worth removing.
   */
  it('costs a read exactly one database query', async () => {
    queries.project = 0;
    queries.entitlements = 0;
    queries.usage = 0;

    const advertisement = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-upload-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(advertisement.status).toBe(200);
    expect(queries).toEqual({ project: 1, entitlements: 0, usage: 0 });

    // And a write still pays for the plan — once, not twice (`admitGitPush`).
    const write = await fetch(`${baseUrl}/v1/git/${projectId}.git/info/refs?service=git-receive-pack`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(write.status).toBe(200);
    expect(queries).toEqual({ project: 2, entitlements: 1, usage: 1 });
  });

  it('refuses a proxy target with a credential in the URL, a private host, or a non-git path', async () => {
    const refusedQueryToken = await fetch(
      `${baseUrl}/v1/git/proxy?url=${encodeURIComponent('https://github.com/tau/x.git/info/refs?access_token=secret')}`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    expect(refusedQueryToken.status).toBe(400);

    const refusedHost = await fetch(
      `${baseUrl}/v1/git/proxy?url=${encodeURIComponent('https://127.0.0.1:9000/x.git/info/refs')}`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    expect(refusedHost.status).toBe(400);

    const refusedPath = await fetch(
      `${baseUrl}/v1/git/proxy?url=${encodeURIComponent('https://github.com/tau/x.git/secrets')}`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    expect(refusedPath.status).toBe(400);

    const refusedScheme = await fetch(
      `${baseUrl}/v1/git/proxy?url=${encodeURIComponent('http://github.com/tau/x.git/info/refs')}`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    expect(refusedScheme.status).toBe(400);
  });
});
