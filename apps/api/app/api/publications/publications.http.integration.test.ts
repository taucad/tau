/* oxlint-disable new-cap -- NestJS test harness `@Injectable()` / `@Module()` decorators */
/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, Module, VersioningType } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { idPrefix, publicationApiCode, publicationViewCookieName } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { ProjectShareController } from '#api/publications/project-share.controller.js';
import { PublicationsController } from '#api/publications/publications.controller.js';
import { PublicationsService } from '#api/publications/publications.service.js';
import { ViewerIdentityInterceptor } from '#api/publications/viewer-identity.interceptor.js';
import { ViewerIdentityService } from '#api/publications/viewer-identity.service.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { isOptionalAuth } from '#constants/auth.constant.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
class PublicationsHttpTestAuthGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();
    const authorizationRaw = request.headers['authorization'] ?? request.headers['Authorization'];
    const authorization = Array.isArray(authorizationRaw) ? authorizationRaw[0] : authorizationRaw;

    request.user =
      authorization === 'Bearer owner-token' ? { id: 'user-owner', name: 'Owner', email: 'owner@test.com' } : null;

    const optionalAuth = this.reflector.getAllAndOverride<boolean>(isOptionalAuth, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (optionalAuth) {
      return true;
    }

    return request.user !== null;
  }
}

@Module({
  controllers: [PublicationsController, ProjectShareController],
  providers: [
    Reflector,
    {
      provide: PublicationsService,
      useValue: {
        publishFromUpload: vi.fn(),
        getPublicationForViewer: vi.fn(),
        getProjectShareEnvelope: vi.fn(),
        listAccessGrants: vi.fn(),
        inviteAccess: vi.fn(),
        revokeAccess: vi.fn(),
        updateVisibility: vi.fn(),
        recordView: vi.fn(),
      },
    },
    {
      provide: ConfigService,
      useValue: {
        get: (key: string): string => {
          if (key === 'TAU_VIEW_COOKIE_SECRET') {
            return 'integration-test-cookie-secret-32-chars';
          }

          if (key === 'NODE_ENV') {
            return 'test';
          }

          return '';
        },
      },
    },
    ViewerIdentityService,
    ViewerIdentityInterceptor,
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
class PublicationsHttpTestModule {}

describe('Publications HTTP integration', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  let publicationService: {
    publishFromUpload: ReturnType<typeof vi.fn>;
    getPublicationForViewer: ReturnType<typeof vi.fn>;
    getProjectShareEnvelope: ReturnType<typeof vi.fn>;
    listAccessGrants: ReturnType<typeof vi.fn>;
    inviteAccess: ReturnType<typeof vi.fn>;
    revokeAccess: ReturnType<typeof vi.fn>;
    updateVisibility: ReturnType<typeof vi.fn>;
    recordView: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    publicationService.publishFromUpload.mockClear();
    publicationService.getPublicationForViewer.mockClear();
    publicationService.getProjectShareEnvelope.mockClear();
    publicationService.listAccessGrants.mockClear();
    publicationService.inviteAccess.mockClear();
    publicationService.revokeAccess.mockClear();
    publicationService.updateVisibility.mockClear();
    publicationService.recordView.mockClear();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PublicationsHttpTestModule],
    })
      .overrideGuard(AuthGuard)
      .useClass(PublicationsHttpTestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        genReqId: () => generatePrefixedId(idPrefix.request),
      }),
    );

    app.enableVersioning({
      type: VersioningType.URI,
    });

    await app.register(cookie, {
      secret: 'integration-test-cookie-secret-32-chars',
      hook: 'onRequest',
    });

    await app.register(multipart, {
      limits: {
        fieldSize: 1024 * 1024,
        fileSize: 25 * 1024 * 1024,
        files: 200,
      },
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0);

    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? 0 : address?.port;
    baseUrl = `http://127.0.0.1:${port}`;

    publicationService = moduleRef.get(PublicationsService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /v1/publications returns 201 and strips extra keys from serialized body', async () => {
    publicationService.publishFromUpload.mockResolvedValue({
      id: 'pub_integration',
      urls: {
        view: 'https://app.example/v/pub_integration',
        share: 'https://app.example/v/pub_integration',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
        manifest: 'https://cdn.example/manifest.json',
      },
      extraLeak: 'must-not-serialize',
    });

    const manifest = {
      projectId: 'proj_integration',
      projectName: 'Integration',
      entryFile: 'main.ts',
      visibility: 'public',
      title: 'Hello',
    };

    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest));
    form.append('main.ts', new Blob(['export default () => {}']), 'main.ts');

    const response = await fetch(`${baseUrl}/v1/publications`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token' },
      body: form,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body['id']).toBe('pub_integration');
    expect(body['extraLeak']).toBeUndefined();
    expect(publicationService.publishFromUpload).toHaveBeenCalled();
  });

  it('POST /v1/publications returns VALIDATION_ERROR when manifest field is missing', async () => {
    const form = new FormData();
    form.append('main.ts', new Blob(['//']), 'main.ts');

    const response = await fetch(`${baseUrl}/v1/publications`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token' },
      body: form,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      code: string;
      message: string[];
      requestId?: string;
    };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.message)).toBe(true);
    expect(body.message.some((line) => line.includes('manifest'))).toBe(true);
    expect(body.requestId).toBeDefined();
    expect(publicationService.publishFromUpload).not.toHaveBeenCalled();
  });

  it('POST /v1/publications returns VALIDATION_ERROR when manifest JSON is invalid', async () => {
    const form = new FormData();
    form.append('manifest', '{');
    form.append('main.ts', new Blob(['//']), 'main.ts');

    const response = await fetch(`${baseUrl}/v1/publications`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token' },
      body: form,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; message: string[] };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message.some((line) => line.includes('Manifest is not valid JSON'))).toBe(true);
    expect(publicationService.publishFromUpload).not.toHaveBeenCalled();
  });

  it('GET /v1/publications/:id passes undefined viewer without Authorization', async () => {
    publicationService.getPublicationForViewer.mockResolvedValue({
      publication: {
        id: 'pub_view',
        projectId: 'proj',
        ownerId: 'owner',
        parentPublicationId: null,
        visibility: 'public',
        manifestKey: 'm.json',
        ogImageKey: null,
        thumbnailKey: null,
        runtimePin: 'x',
        kernels: [],
        entryFile: 'main.ts',
        title: 'T',
        description: null,
        forkCount: 0,
        viewCount: 0,
        ownerSnapshot: { id: 'owner', name: 'Ada', image: 'https://cdn.example/ada.png' },
        createdAt: new Date().toISOString(),
        unpublishedAt: null,
      },
      viewerRole: 'public',
      urls: {
        view: 'https://app.example/v/pub_view',
        share: 'https://app.example/v/pub_view',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
        manifest: 'https://cdn.example/manifest.json',
      },
      manifest: {
        version: 1,
        projectId: 'proj',
        entryFile: 'main.ts',
        files: { 'main.ts': `sha256:${'b'.repeat(64)}` },
        kernels: [],
        runtime: '@taucad/runtime@x',
        parameters: {},
        createdAt: new Date().toISOString(),
      },
      files: { 'main.ts': 'https://blobs.example/o' },
      extraLeak: 'strip-me',
    });

    const response = await fetch(`${baseUrl}/v1/publications/pub_view`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      publication: {
        id: string;
        // oxlint-disable-next-line typescript-eslint/no-restricted-types -- DTO mirrors API wire shape which uses null
        ownerSnapshot?: { id: string; name: string; image: string | null } | null;
      };
      extraLeak?: string;
    };
    expect(body.publication.id).toBe('pub_view');
    expect(body.publication.ownerSnapshot).toEqual({
      id: 'owner',
      name: 'Ada',
      image: 'https://cdn.example/ada.png',
    });
    expect(body.extraLeak).toBeUndefined();

    expect(publicationService.getPublicationForViewer).toHaveBeenCalledWith({
      publicationId: 'pub_view',
      viewerUserId: undefined,
    });
  });

  it('GET /v1/publications/:id passes viewer id when Authorization is present', async () => {
    publicationService.getPublicationForViewer.mockResolvedValue({
      publication: {
        id: 'pub_auth',
        projectId: 'proj',
        ownerId: 'owner',
        parentPublicationId: null,
        visibility: 'public',
        manifestKey: 'm.json',
        ogImageKey: null,
        thumbnailKey: null,
        runtimePin: 'x',
        kernels: [],
        entryFile: 'main.ts',
        title: 'T',
        description: null,
        forkCount: 0,
        viewCount: 0,
        ownerSnapshot: null,
        createdAt: new Date().toISOString(),
        unpublishedAt: null,
      },
      viewerRole: 'owner',
      urls: {
        view: 'https://app.example/v/pub_auth',
        share: 'https://app.example/v/pub_auth',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
        manifest: 'https://cdn.example/manifest.json',
      },
      manifest: {
        version: 1,
        projectId: 'proj',
        entryFile: 'main.ts',
        files: { 'main.ts': `sha256:${'c'.repeat(64)}` },
        kernels: [],
        runtime: '@taucad/runtime@x',
        parameters: {},
        createdAt: new Date().toISOString(),
      },
      files: { 'main.ts': 'https://blobs.example/o' },
    });

    const response = await fetch(`${baseUrl}/v1/publications/pub_auth`, {
      headers: { Authorization: 'Bearer owner-token' },
    });
    expect(response.status).toBe(200);

    expect(publicationService.getPublicationForViewer).toHaveBeenCalledWith({
      publicationId: 'pub_auth',
      viewerUserId: 'user-owner',
    });
  });

  it('GET /v1/publications/:id/access lists owner grants', async () => {
    publicationService.listAccessGrants.mockResolvedValue({
      grants: [
        {
          id: 'pva_1',
          publicationId: 'pub_auth',
          recipientEmail: 'friend@example.com',
          status: 'active',
          createdAt: new Date().toISOString(),
          revokedAt: null,
          extraLeak: 'strip-me',
        },
      ],
    });

    const response = await fetch(`${baseUrl}/v1/publications/pub_auth/access`, {
      headers: { Authorization: 'Bearer owner-token' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { grants: Array<{ id: string; extraLeak?: string }> };
    expect(body.grants).toHaveLength(1);
    expect(body.grants[0]?.id).toBe('pva_1');
    expect(body.grants[0]?.extraLeak).toBeUndefined();
    expect(publicationService.listAccessGrants).toHaveBeenCalledWith({
      publicationId: 'pub_auth',
      ownerId: 'user-owner',
    });
  });

  it('GET /v1/projects/:projectId/share returns the owner share envelope', async () => {
    publicationService.getProjectShareEnvelope.mockResolvedValue({
      project: { id: 'proj_share', name: 'Tray', description: null },
      currentPublication: {
        id: 'pub_share',
        title: 'Shared tray',
        description: null,
        visibility: 'private',
        createdAt: '2026-01-02T00:00:00.000Z',
        urls: { share: 'https://app.example/v/pub_share' },
        access: {
          grants: [
            {
              id: 'pva_1',
              publicationId: 'pub_share',
              recipientEmail: 'friend@example.com',
              status: 'active',
              createdAt: '2026-01-03T00:00:00.000Z',
              revokedAt: null,
              extraLeak: 'strip-me',
            },
          ],
        },
      },
      snapshot: { state: 'published-current', lastPublishedAt: '2026-01-02T00:00:00.000Z' },
      extraLeak: 'strip-me',
    });

    const response = await fetch(`${baseUrl}/v1/projects/proj_share/share`, {
      headers: { Authorization: 'Bearer owner-token' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      currentPublication: { access: { grants: Array<{ id: string; extraLeak?: string }> } };
      extraLeak?: string;
    };
    expect(body.currentPublication.access.grants).toHaveLength(1);
    expect(body.currentPublication.access.grants[0]?.extraLeak).toBeUndefined();
    expect(body.extraLeak).toBeUndefined();
    expect(publicationService.getProjectShareEnvelope).toHaveBeenCalledWith({
      projectId: 'proj_share',
      ownerId: 'user-owner',
    });
  });

  it('POST /v1/publications/:id/access validates and forwards normalized email grants', async () => {
    publicationService.inviteAccess.mockResolvedValue({
      id: 'pva_2',
      publicationId: 'pub_auth',
      recipientEmail: 'team@example.com',
      status: 'active',
      createdAt: new Date().toISOString(),
      revokedAt: null,
    });

    const response = await fetch(`${baseUrl}/v1/publications/pub_auth/access`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ' Team@Example.com ', notifyRecipient: true }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { recipientEmail: string };
    expect(body.recipientEmail).toBe('team@example.com');
    expect(publicationService.inviteAccess).toHaveBeenCalledWith({
      publicationId: 'pub_auth',
      ownerId: 'user-owner',
      recipientEmail: 'team@example.com',
      notifyRecipient: true,
    });
  });

  it('DELETE /v1/publications/:id/access/:accessId revokes owner grants', async () => {
    publicationService.revokeAccess.mockResolvedValue({
      id: 'pva_2',
      publicationId: 'pub_auth',
      recipientEmail: 'team@example.com',
      status: 'revoked',
      createdAt: new Date().toISOString(),
      revokedAt: new Date().toISOString(),
    });

    const response = await fetch(`${baseUrl}/v1/publications/pub_auth/access/pva_2`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner-token' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('revoked');
    expect(publicationService.revokeAccess).toHaveBeenCalledWith({
      publicationId: 'pub_auth',
      ownerId: 'user-owner',
      accessId: 'pva_2',
    });
  });

  it('PATCH /v1/publications/:id/visibility validates and forwards owner visibility updates', async () => {
    publicationService.updateVisibility.mockResolvedValue({
      id: 'pub_auth',
      visibility: 'public',
    });

    const response = await fetch(`${baseUrl}/v1/publications/pub_auth/visibility`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'public' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; visibility: string };
    expect(body).toEqual({ id: 'pub_auth', visibility: 'public' });
    expect(publicationService.updateVisibility).toHaveBeenCalledWith({
      publicationId: 'pub_auth',
      ownerId: 'user-owner',
      visibility: 'public',
    });
  });

  it('PATCH /v1/publications/:id/visibility rejects invalid visibility literals', async () => {
    const response = await fetch(`${baseUrl}/v1/publications/pub_auth/visibility`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'secret' }),
    });

    expect(response.status).toBe(400);
    expect(publicationService.updateVisibility).not.toHaveBeenCalled();
  });

  it('PATCH /v1/publications/:id/views issues anonymous tau_view_id cookie and returns 204', async () => {
    publicationService.recordView.mockResolvedValue(undefined);

    const response = await fetch(`${baseUrl}/v1/publications/pub_view/views`, {
      method: 'PATCH',
    });

    expect(response.status).toBe(204);
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain(`${publicationViewCookieName}=`);
    expect(publicationService.recordView).toHaveBeenCalledTimes(1);

    const recordViewCall = publicationService.recordView.mock.calls[0]?.[0] as {
      publicationId: string;
      identity: { viewerHash: string; sessionUserId?: string };
    };
    expect(recordViewCall.publicationId).toBe('pub_view');
    expect(typeof recordViewCall.identity.viewerHash).toBe('string');
    expect(recordViewCall.identity.viewerHash.length).toBeGreaterThan(0);
    expect(recordViewCall.identity.sessionUserId).toBeUndefined();
  });

  it('PATCH /v1/publications/:id/views does not issue cookie for authenticated session', async () => {
    publicationService.recordView.mockResolvedValue(undefined);

    const response = await fetch(`${baseUrl}/v1/publications/pub_view/views`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner-token' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();

    const recordViewCall = publicationService.recordView.mock.calls[0]?.[0] as {
      identity: { viewerHash: string; sessionUserId?: string };
    };
    expect(recordViewCall.identity.sessionUserId).toBe('user-owner');
  });

  it('PATCH /v1/publications/:id/views surfaces RATE_LIMITED 429 when service throws', async () => {
    const { HttpException, HttpStatus } = await import('@nestjs/common');
    publicationService.recordView.mockRejectedValue(
      new HttpException(
        { code: publicationApiCode.RATE_LIMITED, message: 'rate limited' },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );

    const response = await fetch(`${baseUrl}/v1/publications/pub_view/views`, {
      method: 'PATCH',
    });

    expect(response.status).toBe(429);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(publicationApiCode.RATE_LIMITED);
  });
});

type BarePublicationsServiceDeps = ConstructorParameters<typeof PublicationsService>;

@Module({
  controllers: [PublicationsController],
  providers: [
    Reflector,
    {
      provide: PublicationsService,
      useFactory: (): PublicationsService =>
        new PublicationsService(
          {} as BarePublicationsServiceDeps[0],
          {} as BarePublicationsServiceDeps[1],
          {} as BarePublicationsServiceDeps[2],
          {} as BarePublicationsServiceDeps[3],
          {} as BarePublicationsServiceDeps[4],
          {} as BarePublicationsServiceDeps[5],
          {} as BarePublicationsServiceDeps[6],
        ),
    },
    {
      provide: ConfigService,
      useValue: {
        get: (key: string): string => {
          if (key === 'TAU_VIEW_COOKIE_SECRET') {
            return 'integration-test-cookie-secret-32-chars';
          }

          if (key === 'NODE_ENV') {
            return 'test';
          }

          return '';
        },
      },
    },
    ViewerIdentityService,
    ViewerIdentityInterceptor,
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
class PublicationsHttpPublishForbiddenPathTestModule {}

describe('Publications HTTP integration publish multipart path rules', () => {
  let app: NestFastifyApplication;
  let publishForbiddenPathsBaseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PublicationsHttpPublishForbiddenPathTestModule],
    })
      .overrideGuard(AuthGuard)
      .useClass(PublicationsHttpTestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        genReqId: () => generatePrefixedId(idPrefix.request),
      }),
    );

    app.enableVersioning({
      type: VersioningType.URI,
    });

    await app.register(cookie, {
      secret: 'integration-test-cookie-secret-32-chars',
      hook: 'onRequest',
    });

    await app.register(multipart, {
      limits: {
        fieldSize: 1024 * 1024,
        fileSize: 25 * 1024 * 1024,
        files: 200,
      },
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0);

    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? 0 : address?.port;
    publishForbiddenPathsBaseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /v1/publications rejects multipart payloads that include `.tau/artifacts` paths', async () => {
    const manifest = {
      projectId: 'proj_path_rules',
      projectName: 'PathRules',
      entryFile: 'main.ts',
      visibility: 'private',
      title: 'Hello',
    };

    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest));
    form.append('main.ts', new Blob(['export default () => {}']), 'main.ts');
    form.append('.tau/artifacts/cache.glb', new Blob([Uint8Array.from([1])]), '.tau/artifacts/cache.glb');

    const response = await fetch(`${publishForbiddenPathsBaseUrl}/v1/publications`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token' },
      body: form,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(publicationApiCode.FORBIDDEN_PATH);
  });
});
