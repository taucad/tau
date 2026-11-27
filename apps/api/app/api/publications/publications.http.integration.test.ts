/* oxlint-disable new-cap -- NestJS test harness `@Injectable()` / `@Module()` decorators */
/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Module,
  UnauthorizedException,
  VersioningType,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { idPrefix, publicationApiCode } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { ProjectShareController, SharesController } from '@taucad/api-projects/publications/project-share.controller';
import { PublicationsController } from '@taucad/api-projects/publications/publications.controller';
import { PublicationsService } from '@taucad/api-projects/publications/publications.service';
import { ViewerIdentityInterceptor } from '@taucad/api-projects/publications/viewer-identity.interceptor';
import { ViewerIdentityService } from '@taucad/api-projects/publications/viewer-identity.service';
import { AuthGuard, isOptionalAuth } from '@taucad/api-auth';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { MetricsService } from '@taucad/api-observability/metrics';
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
  controllers: [PublicationsController, ProjectShareController, SharesController],
  providers: [
    Reflector,
    {
      provide: PublicationsService,
      useValue: {
        publishFromRevision: vi.fn(),
        getShareForViewer: vi.fn(),
        getProjectShareEnvelope: vi.fn(),
        updateProjectShare: vi.fn(),
        stopProjectShare: vi.fn(),
        inviteProjectShareAccess: vi.fn(),
        revokeProjectShareAccess: vi.fn(),
        recordView: vi.fn(),
        resolvePublicationFile: vi.fn(),
        openPublicationFile: vi.fn(),
      },
    },
    {
      provide: MetricsService,
      useValue: { publicationFileRequestsTotal: { add: vi.fn() } },
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
    publishFromRevision: ReturnType<typeof vi.fn>;
    getShareForViewer: ReturnType<typeof vi.fn>;
    getProjectShareEnvelope: ReturnType<typeof vi.fn>;
    updateProjectShare: ReturnType<typeof vi.fn>;
    stopProjectShare: ReturnType<typeof vi.fn>;
    inviteProjectShareAccess: ReturnType<typeof vi.fn>;
    revokeProjectShareAccess: ReturnType<typeof vi.fn>;
    recordView: ReturnType<typeof vi.fn>;
    resolvePublicationFile: ReturnType<typeof vi.fn>;
    openPublicationFile: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    publicationService.publishFromRevision.mockClear();
    publicationService.getShareForViewer.mockClear();
    publicationService.getProjectShareEnvelope.mockClear();
    publicationService.updateProjectShare.mockClear();
    publicationService.stopProjectShare.mockClear();
    publicationService.inviteProjectShareAccess.mockClear();
    publicationService.revokeProjectShareAccess.mockClear();
    publicationService.recordView.mockClear();
    publicationService.resolvePublicationFile.mockReset();
    publicationService.openPublicationFile.mockReset();
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
    publicationService.publishFromRevision.mockResolvedValue({
      id: 'pub_integration',
      urls: {
        view: 'https://app.example/s/tau~shr_integration',
        share: 'https://app.example/s/tau~shr_integration',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
      },
      share: { id: 'shr_integration', url: 'https://app.example/s/tau~shr_integration', visibility: 'public' },
      version: { tag: 'v1' },
      extraLeak: 'must-not-serialize',
    });

    const response = await fetch(`${baseUrl}/v1/publications`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj_integration',
        projectName: 'Integration',
        tag: 'v1',
        revisionId: 'a'.repeat(40),
        entryPath: 'main.ts',
        visibility: 'public',
        title: 'Hello',
        sharedEmails: ['friend@example.com'],
        notifyRecipients: true,
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body['id']).toBe('pub_integration');
    expect(body['share']).toEqual({
      id: 'shr_integration',
      url: 'https://app.example/s/tau~shr_integration',
      visibility: 'public',
    });
    expect(body['version']).toEqual({ tag: 'v1' });
    expect(body['extraLeak']).toBeUndefined();
    /* The title and the old invite fields are stripped at the boundary. */
    expect(publicationService.publishFromRevision).toHaveBeenCalledWith({
      ownerId: 'user-owner',
      request: {
        projectId: 'proj_integration',
        projectName: 'Integration',
        tag: 'v1',
        revisionId: 'a'.repeat(40),
        entryPath: 'main.ts',
        visibility: 'public',
      },
    });
  });

  /*
   * Red pin (a): the JSON pointer is the only shape this route accepts.
   *
   * A multipart publish is not "the old path, refused politely" — there is no
   * multipart parser, no `files` field and no decorator left, so Fastify
   * answers the content type itself and the service is never reached (AC19).
   */
  it('POST /v1/publications refuses a multipart upload and never reaches the service', async () => {
    const form = new FormData();
    form.append(
      'manifest',
      JSON.stringify({
        projectId: 'proj_integration',
        projectName: 'Integration',
        entryPath: 'main.ts',
        visibility: 'public',
      }),
    );
    form.append('main.ts', new Blob(['export default () => {}']), 'main.ts');

    const response = await fetch(`${baseUrl}/v1/publications`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token' },
      body: form,
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(publicationService.publishFromRevision).not.toHaveBeenCalled();
  });

  /*
   * R1: a traversal `projectId` is refused at the boundary, so nothing composes
   * a storage key from it. The service-side guard lives in `repositoryLocator`,
   * which every lease this project ever gets is hydrated through (NI15).
   */
  it.each([['../../tmp/evil'], ['proj_1/../../escape'], ['']])(
    'POST /v1/publications refuses projectId %j without reaching the service',
    async (projectId) => {
      const response = await fetch(`${baseUrl}/v1/publications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner-token' },
        body: JSON.stringify({
          projectId,
          projectName: 'Integration',
          tag: 'v1',
          revisionId: 'a'.repeat(40),
          entryPath: 'main.ts',
          visibility: 'public',
        }),
      });

      expect(response.status).toBe(400);
      expect(publicationService.publishFromRevision).not.toHaveBeenCalled();
    },
  );

  it('POST /v1/publications returns VALIDATION_ERROR when the named version is missing', async () => {
    const response = await fetch(`${baseUrl}/v1/publications`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj_integration',
        projectName: 'Integration',
        entryPath: 'main.ts',
        visibility: 'public',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; message: string[]; requestId?: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.message)).toBe(true);
    expect(body.message.some((line) => line.includes('tag'))).toBe(true);
    expect(body.requestId).toBeDefined();
    expect(publicationService.publishFromRevision).not.toHaveBeenCalled();
  });

  it('POST /v1/publications returns VALIDATION_ERROR when the body is not JSON', async () => {
    const response = await fetch(`${baseUrl}/v1/publications`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token', 'content-type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(publicationService.publishFromRevision).not.toHaveBeenCalled();
  });

  it('GET /v1/shares/:shareId passes undefined viewer without Authorization', async () => {
    publicationService.getShareForViewer.mockResolvedValue({
      publication: {
        id: 'pub_view',
        projectId: 'proj',
        tag: 'v1',
        revisionId: 'a'.repeat(40),
        ownerId: 'owner',
        parentPublicationId: null,
        visibility: 'public',
        manifestKey: 'm.json',
        ogImageKey: null,
        thumbnailKey: null,
        runtimePin: 'x',
        kernels: [],
        entryPath: 'main.ts',
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
        view: 'https://app.example/s/tau~shr_view',
        share: 'https://app.example/s/tau~shr_view',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
        manifest: 'https://cdn.example/manifest.json',
      },
      manifest: {
        version: 1,
        projectId: 'proj',
        entryPath: 'main.ts',
        files: { 'main.ts': `sha256:${'b'.repeat(64)}` },
        kernels: [],
        runtime: '@taucad/runtime@x',
        parameters: {},
        createdAt: new Date().toISOString(),
      },
      files: { 'main.ts': 'https://blobs.example/o' },
      extraLeak: 'strip-me',
    });

    const response = await fetch(`${baseUrl}/v1/shares/shr_view`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      publication: {
        id: string;
        // oxlint-disable-next-line typescript-eslint/no-restricted-types -- DTO mirrors API wire shape which uses null
        ownerSnapshot?: { id: string; name: string; image: string | null } | null;
      } & Record<string, unknown>;
      urls: Record<string, unknown>;
      extraLeak?: string;
    };
    expect(body.publication.id).toBe('pub_view');
    expect(body.publication.ownerSnapshot).toEqual({
      id: 'owner',
      name: 'Ada',
      image: 'https://cdn.example/ada.png',
    });
    expect(body.extraLeak).toBeUndefined();
    // Raw storage layout must never reach the wire, even if the service leaks it.
    expect(body.publication['manifestKey']).toBeUndefined();
    expect(body.publication['ogImageKey']).toBeUndefined();
    expect(body.publication['thumbnailKey']).toBeUndefined();
    expect(body.urls['manifest']).toBeUndefined();

    expect(publicationService.getShareForViewer).toHaveBeenCalledWith({
      shareId: 'shr_view',
      viewerUserId: undefined,
    });
  });

  it('GET /v1/shares/:shareId passes viewer id when Authorization is present', async () => {
    publicationService.getShareForViewer.mockResolvedValue({
      publication: {
        id: 'pub_auth',
        projectId: 'proj',
        tag: 'v1',
        revisionId: 'a'.repeat(40),
        ownerId: 'owner',
        parentPublicationId: null,
        visibility: 'public',
        runtimePin: 'x',
        kernels: [],
        entryPath: 'main.ts',
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
        view: 'https://app.example/s/tau~shr_auth',
        share: 'https://app.example/s/tau~shr_auth',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
      },
      manifest: {
        version: 1,
        projectId: 'proj',
        entryPath: 'main.ts',
        files: { 'main.ts': `sha256:${'c'.repeat(64)}` },
        kernels: [],
        runtime: '@taucad/runtime@x',
        parameters: {},
        createdAt: new Date().toISOString(),
      },
      files: { 'main.ts': 'https://blobs.example/o' },
    });

    const response = await fetch(`${baseUrl}/v1/shares/shr_auth`, {
      headers: { Authorization: 'Bearer owner-token' },
    });
    expect(response.status).toBe(200);

    expect(publicationService.getShareForViewer).toHaveBeenCalledWith({
      shareId: 'shr_auth',
      viewerUserId: 'user-owner',
    });
  });

  it('GET /v1/publications/:id is gone: a cloud link is read at /v1/shares/:shareId', async () => {
    const response = await fetch(`${baseUrl}/v1/publications/pub_view`);

    expect(response.status).toBe(404);
    expect(publicationService.getShareForViewer).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/v1/publications/pub_auth/access'],
    ['POST', '/v1/publications/pub_auth/access'],
    ['DELETE', '/v1/publications/pub_auth/access/sga_1'],
    ['PATCH', '/v1/publications/pub_auth/visibility'],
  ])('%s %s no longer exists', async (method, path) => {
    const hasBody = method === 'POST' || method === 'PATCH';
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: 'Bearer owner-token',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: JSON.stringify({ visibility: 'public' }) } : {}),
    });

    expect(response.status).toBe(404);
  });

  it('GET /v1/projects/:projectId/share returns the owner cloud link envelope', async () => {
    publicationService.getProjectShareEnvelope.mockResolvedValue({
      project: { id: 'proj_share', name: 'Tray', description: null },
      share: {
        id: 'shr_share',
        url: 'https://app.example/s/tau~shr_share',
        visibility: 'private',
        status: 'active',
        stoppedAt: null,
        publishedAt: '2026-01-02T00:00:00.000Z',
        currentVersion: { publicationId: 'pub_share', tag: 'v1', revisionId: 'a'.repeat(40), extraLeak: 'strip-me' },
        access: {
          grants: [
            {
              id: 'sga_1',
              recipientEmail: 'friend@example.com',
              status: 'active',
              createdAt: '2026-01-03T00:00:00.000Z',
              revokedAt: null,
              extraLeak: 'strip-me',
            },
          ],
        },
      },
      currentPublication: null,
      extraLeak: 'strip-me',
    });

    const response = await fetch(`${baseUrl}/v1/projects/proj_share/share`, {
      headers: { Authorization: 'Bearer owner-token' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      share: {
        id: string;
        currentVersion: Record<string, unknown>;
        access: { grants: Array<{ id: string; extraLeak?: string }> };
      };
      currentPublication?: unknown;
      extraLeak?: string;
    };
    expect(body.share.id).toBe('shr_share');
    expect(body.share.currentVersion).toEqual({ publicationId: 'pub_share', tag: 'v1', revisionId: 'a'.repeat(40) });
    expect(body.share.access.grants).toHaveLength(1);
    expect(body.share.access.grants[0]?.extraLeak).toBeUndefined();
    /* No compatibility fields: the old envelope's keys are not on the wire. */
    expect(body.currentPublication).toBeUndefined();
    expect(body.extraLeak).toBeUndefined();
    expect(publicationService.getProjectShareEnvelope).toHaveBeenCalledWith({
      projectId: 'proj_share',
      ownerId: 'user-owner',
    });
  });

  it('PATCH /v1/projects/:projectId/share validates and forwards who can open the link', async () => {
    publicationService.updateProjectShare.mockResolvedValue({
      id: 'shr_share',
      url: 'https://app.example/s/tau~shr_share',
      visibility: 'public',
      status: 'active',
      stoppedAt: null,
      publishedAt: '2026-01-02T00:00:00.000Z',
      currentVersion: null,
      access: { grants: [] },
    });

    const response = await fetch(`${baseUrl}/v1/projects/proj_share/share`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'public' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: 'shr_share', visibility: 'public' });
    expect(publicationService.updateProjectShare).toHaveBeenCalledWith({
      projectId: 'proj_share',
      ownerId: 'user-owner',
      visibility: 'public',
    });
  });

  it('PATCH /v1/projects/:projectId/share rejects invalid visibility literals', async () => {
    const response = await fetch(`${baseUrl}/v1/projects/proj_share/share`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'secret' }),
    });

    expect(response.status).toBe(400);
    expect(publicationService.updateProjectShare).not.toHaveBeenCalled();
  });

  it('DELETE /v1/projects/:projectId/share stops sharing with 204', async () => {
    publicationService.stopProjectShare.mockResolvedValue(undefined);

    const response = await fetch(`${baseUrl}/v1/projects/proj_share/share`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner-token' },
    });

    expect(response.status).toBe(204);
    expect(publicationService.stopProjectShare).toHaveBeenCalledWith({
      projectId: 'proj_share',
      ownerId: 'user-owner',
    });
  });

  it('DELETE /v1/projects/:projectId/share needs a signed-in owner', async () => {
    const response = await fetch(`${baseUrl}/v1/projects/proj_share/share`, { method: 'DELETE' });

    expect(response.status).toBe(403);
    expect(publicationService.stopProjectShare).not.toHaveBeenCalled();
  });

  it('POST /v1/projects/:projectId/share/access forwards a normalized address and answers the email outcome', async () => {
    publicationService.inviteProjectShareAccess.mockResolvedValue({
      id: 'sga_2',
      recipientEmail: 'team@example.com',
      status: 'active',
      createdAt: new Date().toISOString(),
      revokedAt: null,
      email: { status: 'skipped', reason: 'email_disabled' },
    });

    const response = await fetch(`${baseUrl}/v1/projects/proj_share/share/access`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ' Team@Example.com ', notifyRecipient: true }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { recipientEmail: string; email: unknown };
    expect(body.recipientEmail).toBe('team@example.com');
    expect(body.email).toEqual({ status: 'skipped', reason: 'email_disabled' });
    expect(publicationService.inviteProjectShareAccess).toHaveBeenCalledWith({
      projectId: 'proj_share',
      ownerId: 'user-owner',
      recipientEmail: 'team@example.com',
      notifyRecipient: true,
    });
  });

  it('DELETE /v1/projects/:projectId/share/access/:accessId removes an invited address', async () => {
    publicationService.revokeProjectShareAccess.mockResolvedValue({
      id: 'sga_2',
      recipientEmail: 'team@example.com',
      status: 'revoked',
      createdAt: new Date().toISOString(),
      revokedAt: new Date().toISOString(),
    });

    const response = await fetch(`${baseUrl}/v1/projects/proj_share/share/access/sga_2`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner-token' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('revoked');
    expect(publicationService.revokeProjectShareAccess).toHaveBeenCalledWith({
      projectId: 'proj_share',
      ownerId: 'user-owner',
      accessId: 'sga_2',
    });
  });

  it('PATCH /v1/publications/:id/views records an anonymous view without issuing a cookie', async () => {
    publicationService.recordView.mockResolvedValue(undefined);

    const response = await fetch(`${baseUrl}/v1/publications/pub_view/views`, {
      method: 'PATCH',
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();
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

  it('GET /v1/publications/:id/files streams bytes with strong ETag and private revalidation Cache-Control', async () => {
    const sha = 'd'.repeat(64);
    publicationService.resolvePublicationFile.mockResolvedValue({ sha256Hex: sha, etag: `"${sha}"` });
    publicationService.openPublicationFile.mockImplementation(async () => {
      const { Readable } = await import('node:stream');
      return { body: Readable.from([new TextEncoder().encode('blob-bytes')]), contentLength: 10 };
    });

    const response = await fetch(
      `${baseUrl}/v1/publications/pub_files/files?path=${encodeURIComponent('src/main.ts')}`,
      {
        headers: { Authorization: 'Bearer owner-token' },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(`"${sha}"`);
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    await expect(response.text()).resolves.toBe('blob-bytes');

    expect(publicationService.resolvePublicationFile).toHaveBeenCalledWith({
      publicationId: 'pub_files',
      viewerUserId: 'user-owner',
      path: 'src/main.ts',
    });
  });

  it('GET /v1/publications/:id/files returns 304 without a body when If-None-Match matches', async () => {
    const sha = 'e'.repeat(64);
    publicationService.resolvePublicationFile.mockResolvedValue({ sha256Hex: sha, etag: `"${sha}"` });

    const response = await fetch(`${baseUrl}/v1/publications/pub_files/files?path=main.ts`, {
      headers: { Authorization: 'Bearer owner-token', 'If-None-Match': `"${sha}"` },
    });

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe(`"${sha}"`);
    await expect(response.text()).resolves.toBe('');
    expect(publicationService.openPublicationFile).not.toHaveBeenCalled();
  });

  it('GET /v1/publications/:id/files surfaces UNAUTHORIZED 401 for anonymous private access', async () => {
    publicationService.resolvePublicationFile.mockRejectedValue(
      new UnauthorizedException({ code: publicationApiCode.UNAUTHORIZED, message: 'Authentication required' }),
    );

    const response = await fetch(`${baseUrl}/v1/publications/pub_files/files?path=main.ts`);

    expect(response.status).toBe(401);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(publicationApiCode.UNAUTHORIZED);
  });

  it('GET /v1/publications/:id/files surfaces FORBIDDEN 403 for revoked grantees', async () => {
    publicationService.resolvePublicationFile.mockRejectedValue(
      new ForbiddenException({ code: publicationApiCode.FORBIDDEN, message: 'This link is for invited people only' }),
    );

    const response = await fetch(`${baseUrl}/v1/publications/pub_files/files?path=main.ts`, {
      headers: { Authorization: 'Bearer owner-token' },
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(publicationApiCode.FORBIDDEN);
  });

  it('GET /v1/publications/:id/files surfaces INVALID_PATH 400 when the path query is missing', async () => {
    publicationService.resolvePublicationFile.mockRejectedValue(
      new BadRequestException({ code: publicationApiCode.INVALID_PATH, message: 'Missing path query' }),
    );

    const response = await fetch(`${baseUrl}/v1/publications/pub_files/files`, {
      headers: { Authorization: 'Bearer owner-token' },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(publicationApiCode.INVALID_PATH);
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
