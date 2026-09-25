/* oxlint-disable new-cap -- NestJS decorators are factories */
import { Controller, Delete, Get, HttpCode, Module, Param, Post, Req, VersioningType } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hostDeviceOf } from '#auth/auth.guard.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { DatabaseService } from '#database/database.service.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { GitBasicAuthMiddleware } from '#api/git/git-transport.js';
import { mintHostGitCredential } from '#api/hosts/host-git-credential.js';

/*
 * The third credential kind end to end through the real middleware and the
 * real `AuthGuard` (D21, I10): stub handlers stand in for the git and project
 * controllers, so what is proved is who gets past authentication, and as whom.
 */

const ownerId = 'user-owner';
const ownerSession = 'owner-session-token';
const hostDeviceId = 'agent_cloud';
const boundProject = 'proj-bound';
const siblingProject = 'proj-sibling';
const pushCredential = mintHostGitCredential();

/** The row the database answers for the presented push credential; empty once the device is revoked. */
let deviceRows: Array<{ id: string; ownerId: string; cloudProjectId: string }> = [];
/** Set to make the credential lookup itself fail, as a database outage does. */
let databaseFailure: Error | undefined;

const whoAmI = (userId: string, request: FastifyRequest) => ({
  userId,
  viaDevice: hostDeviceOf(request.raw)?.deviceId,
});

@Controller({ path: 'git', version: '1' })
@UseAuth()
class StubGitController {
  @Get(':repo/info/refs')
  public infoRefs(@Param('repo') _repository: string, @User('id') userId: string, @Req() request: FastifyRequest) {
    return whoAmI(userId, request);
  }

  @Post(':repo/git-receive-pack')
  @HttpCode(200)
  public receivePack(@Param('repo') _repository: string, @User('id') userId: string, @Req() request: FastifyRequest) {
    return whoAmI(userId, request);
  }

  @Delete(':repo/refs')
  public removeRef(@Param('repo') _repository: string, @User('id') userId: string, @Req() request: FastifyRequest) {
    return whoAmI(userId, request);
  }
}

@Controller({ path: 'projects', version: '1' })
@UseAuth()
class StubProjectsController {
  @Get()
  public list(@User('id') userId: string) {
    return { userId };
  }
}

@Module({
  controllers: [StubGitController, StubProjectsController],
  providers: [
    {
      provide: authInstanceKey,
      useValue: {
        api: {
          /* Sessions only: a push credential is nobody to better-auth. */
          getSession: async ({ headers }: { headers: Headers }) =>
            headers.get('authorization') === `Bearer ${ownerSession}` ? { user: { id: ownerId }, session: {} } : null,
        },
      },
    },
    {
      provide: DatabaseService,
      useValue: {
        database: {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => {
                  if (databaseFailure !== undefined) {
                    throw databaseFailure;
                  }
                  return deviceRows;
                },
              }),
            }),
          }),
        },
      },
    },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
class TransportTestModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(GitBasicAuthMiddleware).forRoutes(StubGitController);
  }
}

let app: NestFastifyApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [TransportTestModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  deviceRows = [{ id: hostDeviceId, ownerId, cloudProjectId: boundProject }];
  databaseFailure = undefined;
});

/** Stock git's own spelling: HTTP Basic, the credential as the password. */
const basic = (password: string): string => `Basic ${Buffer.from(`x-access-token:${password}`).toString('base64')}`;

describe('GitBasicAuthMiddleware — a cloud host push credential (D21)', () => {
  it('should admit the credential on its own project as the owner via its device', async () => {
    const advertisement = await app.inject({
      method: 'GET',
      url: `/v1/git/${boundProject}.git/info/refs?service=git-receive-pack`,
      headers: { authorization: basic(pushCredential) },
    });
    /* The bearer form is what the host's native port sends (`http.extraHeader`). */
    const push = await app.inject({
      method: 'POST',
      url: `/v1/git/${boundProject}.git/git-receive-pack`,
      headers: { authorization: `Bearer ${pushCredential}` },
    });

    expect(advertisement.statusCode).toBe(200);
    expect(advertisement.json()).toEqual({ userId: ownerId, viaDevice: hostDeviceId });
    expect(push.statusCode).toBe(200);
    expect(push.json()).toEqual({ userId: ownerId, viaDevice: hostDeviceId });
  });

  it('should answer 404 on a sibling project of the same owner', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/git/${siblingProject}.git/info/refs?service=git-upload-pack`,
      headers: { authorization: basic(pushCredential) },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('should refuse the owner-only ref removal, since the credential yields write and never owner', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/git/${boundProject}.git/refs?name=refs/tags/v1`,
      headers: { authorization: `Bearer ${pushCredential}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'PROJECT_ROLE_INSUFFICIENT' });
  });

  it('should be refused by a route the git transport does not front', async () => {
    const bearer = await app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${pushCredential}` },
    });
    const apiKey = await app.inject({ method: 'GET', url: '/v1/projects', headers: { 'x-api-key': pushCredential } });

    expect(bearer.statusCode).toBe(401);
    expect(apiKey.statusCode).toBe(401);
  });

  it('should fail the next push once deprovisioning revoked the device', async () => {
    deviceRows = [];

    const response = await app.inject({
      method: 'POST',
      url: `/v1/git/${boundProject}.git/git-receive-pack`,
      headers: { authorization: `Bearer ${pushCredential}` },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should answer a retryable 503 when the credential lookup fails, rather than hang', async () => {
    databaseFailure = new Error('connection terminated');

    const response = await app.inject({
      method: 'POST',
      url: `/v1/git/${boundProject}.git/git-receive-pack`,
      headers: { authorization: `Bearer ${pushCredential}` },
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('should keep the owner own session a plain push with no device', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/git/${siblingProject}.git/git-receive-pack`,
      headers: { authorization: basic(ownerSession) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: ownerId });
  });
});
