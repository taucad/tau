/* oxlint-disable new-cap, typescript/consistent-type-imports -- NestJS decorators are factories and constructor injection needs the runtime class */
/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors; git-lfs wire fields are snake_case */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Injectable, Module, VersioningType } from '@nestjs/common';
import type { CanActivate, ExecutionContext, MiddlewareConsumer, NestModule, OnModuleInit } from '@nestjs/common';
import { APP_FILTER, APP_PIPE, HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '#auth/auth.guard.js';
import { DatabaseService } from '#database/database.service.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { BillingService } from '#api/billing/billing.service.js';
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

/** Mutable fixture state the stubs read. */
const state = {
  ownerId: ownerId as string | undefined,
  tier: 'pro' as 'free' | 'pro' | 'enterprise',
  storageBytes: 0,
  lfsBytes: 0,
};

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
    return false;
  }
}

/** The bytes a presigned PUT stored, keyed by object-store key. */
const objectStore = new Map<string, Uint8Array<ArrayBuffer>>();

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
    ({ server: storeServer, origin: storeOrigin } = await createObjectStoreServer());

    const databaseStub = {
      database: {
        select: () => ({
          from: (table: unknown) => ({
            where: () => ({
              limit: async (): Promise<unknown[]> => {
                if (table === project) {
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
        { provide: DatabaseService, useValue: databaseStub },
        { provide: ObjectStorageService, useValue: objectStorageStub },
        {
          provide: BillingService,
          useValue: {
            getEntitlements: async () => ({
              tier: state.tier,
              canSyncFiles: state.tier !== 'free',
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string): unknown => (key === 'TAU_GIT_ROOT' ? gitRoot : ''),
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
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0);

    const address = app.getHttpServer().address();
    const port = typeof address === 'string' || address === null ? 0 : address.port;
    baseUrl = `http://127.0.0.1:${port}`;
    remoteUrl = `http://tau:${ownerToken}@127.0.0.1:${port}/v1/git/${projectId}.git`;
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
    const pushed = await runGit(['push', 'origin', 'HEAD:refs/heads/main'], clone);
    expect(pushed.code, pushed.stderr).toBe(0);

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
    const oid = 'a'.repeat(64);
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
    expect(gitLfsObjectKey(projectId, oid)).toBe(`git-lfs/${projectId}/lfs/objects/aa/aa/${oid}`);
    expect(body.objects[0]?.actions?.verify?.href).toContain('/info/lfs/objects/verify');

    await fetch(action?.href ?? '', { method: 'PUT', body: 'hello world\n' });
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
    state.lfsBytes = 0;
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
