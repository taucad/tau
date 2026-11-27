import { Readable } from 'node:stream';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { mockDeep } from 'vitest-mock-extended';
import { ForbiddenException, GoneException, HttpException, NotFoundException, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ZodValidationException, ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '@taucad/api-auth';
import { ProjectShareController, SharesController } from '#publications/project-share.controller.js';
import {
  PublicationsController,
  fileRequestFailureOutcome,
  ifNoneMatchSatisfied,
} from '#publications/publications.controller.js';
import { PublicationsService } from '#publications/publications.service.js';
import { ViewerIdentityInterceptor } from '#publications/viewer-identity.interceptor.js';
import { ViewerIdentityService } from '#publications/viewer-identity.service.js';
import type { PublicationWireRow } from '#publications/publications.dto.js';
import { PublishRequestDto } from '#publications/publications.dto.js';
import { MetricsService } from '@taucad/api-observability/metrics';

const validationPipe = new ZodValidationPipe();

/** The JSON body as the route's pipe validates it (no multipart anywhere). */
function validatePublishRequest(body: unknown): PublishRequestDto {
  return validationPipe.transform(body, { type: 'body', metatype: PublishRequestDto }) as PublishRequestDto;
}

describe('PublicationsController', () => {
  let controller: PublicationsController;
  let projectShareController: ProjectShareController;
  let sharesController: SharesController;
  let service: PublicationsService;
  let fileRequestMetricAdd: ReturnType<typeof vi.fn>;
  let module: TestingModule;

  beforeEach(async () => {
    const mockService = {
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
    };

    fileRequestMetricAdd = vi.fn();

    module = await Test.createTestingModule({
      controllers: [PublicationsController, ProjectShareController, SharesController],
      providers: [
        {
          provide: PublicationsService,
          useValue: mockService,
        },
        {
          provide: MetricsService,
          useValue: { publicationFileRequestsTotal: { add: fileRequestMetricAdd } },
        },
        {
          provide: ViewerIdentityService,
          useValue: { resolveForRequest: vi.fn(() => ({ viewerHash: 'h-mock' })) },
        },
        ViewerIdentityInterceptor,
        Reflector,
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PublicationsController);
    projectShareController = module.get(ProjectShareController);
    sharesController = module.get(SharesController);
    service = module.get(PublicationsService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should delegate a publish to PublicationsService as a graph pointer', async () => {
    const request = {
      projectId: 'proj',
      projectName: 'Demo',
      tag: 'v1',
      revisionId: 'a'.repeat(40),
      entryPath: 'main.ts',
      visibility: 'private',
    };

    vi.mocked(service.publishFromRevision).mockResolvedValue({
      id: 'pub_test',
      urls: {
        view: 'https://example/s/tau~shr_test',
        share: 'https://example/s/tau~shr_test',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
      },
      share: { id: 'shr_test', url: 'https://example/s/tau~shr_test', visibility: 'private' },
      version: { tag: 'v1' },
    });

    const payload = await controller.publish('owner-1', validatePublishRequest(request));

    expect(service.publishFromRevision).toHaveBeenCalledWith({ ownerId: 'owner-1', request });
    expect(payload.id).toBe('pub_test');
  });

  it('should strip the fields a publish no longer takes', () => {
    const body = validatePublishRequest({
      projectId: 'proj',
      projectName: 'Demo',
      tag: 'v1',
      revisionId: 'a'.repeat(40),
      entryPath: 'main.ts',
      title: 'Old title',
      sharedEmails: ['a@b.test'],
      notifyRecipients: true,
    });

    expect(body).toEqual({
      projectId: 'proj',
      projectName: 'Demo',
      tag: 'v1',
      revisionId: 'a'.repeat(40),
      entryPath: 'main.ts',
    });
  });

  it('should refuse a publish body that carries no named version', () => {
    expect(() =>
      validatePublishRequest({
        projectId: 'proj',
        projectName: 'Demo',
        entryPath: 'main.ts',
        visibility: 'public',
      }),
    ).toThrow(ZodValidationException);
  });

  it('should delegate cloud link viewer lookups to PublicationsService with viewer id', async () => {
    const entryPath = 'main.ts';
    const publicationWire: PublicationWireRow = {
      id: 'pub_x',
      projectId: 'proj',
      tag: 'v1',
      revisionId: 'a'.repeat(40),
      ownerId: 'owner-1',
      parentPublicationId: null,
      visibility: 'public',
      runtimePin: 'x',
      kernels: ['replicad'],
      entryPath,
      title: 'T',
      description: null,
      forkCount: 0,
      viewCount: 0,
      ownerSnapshot: null,
      createdAt: new Date().toISOString(),
      unpublishedAt: null,
    };

    vi.mocked(service.getShareForViewer).mockResolvedValue({
      publication: publicationWire,
      viewerRole: 'owner',
      urls: {
        view: 'https://example/s/tau~shr_x',
        share: 'https://example/s/tau~shr_x',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
      },
      manifest: {
        version: 1,
        projectId: 'proj',
        entryPath,
        files: { [entryPath]: 'sha256:' + 'a'.repeat(64) },
        kernels: [],
        runtime: '@taucad/runtime@pin',
        parameters: {},
        createdAt: new Date().toISOString(),
      },
      files: { [entryPath]: 'https://cdn.example/blobs/abc' },
    });

    const response = await sharesController.getShare('shr_x', 'owner-1');

    expect(service.getShareForViewer).toHaveBeenCalledWith({
      shareId: 'shr_x',
      viewerUserId: 'owner-1',
    });
    expect(response.publication.id).toBe('pub_x');
  });

  it('should pass undefined viewerUserId when OptionalUser resolves undefined', async () => {
    const entryPath = 'main.ts';
    vi.mocked(service.getShareForViewer).mockResolvedValue({
      publication: {
        id: 'pub_x',
        projectId: 'proj',
        tag: 'v1',
        revisionId: 'a'.repeat(40),
        ownerId: 'owner-1',
        parentPublicationId: null,
        visibility: 'public',
        runtimePin: 'x',
        kernels: [],
        entryPath,
        title: 'T',
        description: null,
        forkCount: 0,
        viewCount: 0,
        ownerSnapshot: null,
        createdAt: new Date().toISOString(),
        unpublishedAt: null,
      },
      viewerRole: 'public',
      urls: {
        view: 'https://example/s/tau~shr_x',
        share: 'https://example/s/tau~shr_x',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
      },
      manifest: {
        version: 1,
        projectId: 'proj',
        entryPath,
        files: { [entryPath]: 'sha256:' + 'a'.repeat(64) },
        kernels: [],
        runtime: '@taucad/runtime@pin',
        parameters: {},
        createdAt: new Date().toISOString(),
      },
      files: { [entryPath]: 'https://cdn.example/blobs/abc' },
    });

    await sharesController.getShare('shr_x', undefined);

    expect(service.getShareForViewer).toHaveBeenCalledWith({
      shareId: 'shr_x',
      viewerUserId: undefined,
    });
  });

  it('should delegate recordView to PublicationsService with viewer identity', async () => {
    vi.mocked(service.recordView).mockResolvedValue(undefined);

    await controller.recordView('pub_x', { viewerHash: 'h-anon' });

    expect(service.recordView).toHaveBeenCalledTimes(1);
    expect(service.recordView).toHaveBeenCalledWith({
      publicationId: 'pub_x',
      identity: { viewerHash: 'h-anon' },
    });
  });

  it('should delegate a link invite to PublicationsService and answer its email outcome', async () => {
    vi.mocked(service.inviteProjectShareAccess).mockResolvedValue({
      id: 'sga_1',
      recipientEmail: 'friend@example.com',
      status: 'active',
      createdAt: new Date().toISOString(),
      revokedAt: null,
      email: { status: 'skipped', reason: 'daily_cap' },
    });

    const response = await projectShareController.inviteAccess('proj_x', 'owner-1', {
      email: 'friend@example.com',
      notifyRecipient: true,
    });

    expect(service.inviteProjectShareAccess).toHaveBeenCalledWith({
      projectId: 'proj_x',
      ownerId: 'owner-1',
      recipientEmail: 'friend@example.com',
      notifyRecipient: true,
    });
    expect(response.email).toEqual({ status: 'skipped', reason: 'daily_cap' });
  });

  it('should delegate removing an invited address to PublicationsService', async () => {
    vi.mocked(service.revokeProjectShareAccess).mockResolvedValue({
      id: 'sga_1',
      recipientEmail: 'friend@example.com',
      status: 'revoked',
      createdAt: new Date().toISOString(),
      revokedAt: new Date().toISOString(),
    });

    const response = await projectShareController.revokeAccess('proj_x', 'sga_1', 'owner-1');

    expect(service.revokeProjectShareAccess).toHaveBeenCalledWith({
      projectId: 'proj_x',
      ownerId: 'owner-1',
      accessId: 'sga_1',
    });
    expect(response.status).toBe('revoked');
  });

  it('should delegate who can open the link to PublicationsService', async () => {
    const share: Awaited<ReturnType<PublicationsService['updateProjectShare']>> = {
      id: 'shr_x',
      url: 'https://example/s/tau~shr_x',
      visibility: 'public',
      status: 'active',
      stoppedAt: null,
      publishedAt: new Date().toISOString(),
      currentVersion: { publicationId: 'pub_x', tag: 'v1', revisionId: 'a'.repeat(40) },
      access: { grants: [] },
    };
    vi.mocked(service.updateProjectShare).mockResolvedValue(share);

    const response = await projectShareController.updateProjectShare('proj_x', 'owner-1', { visibility: 'public' });

    expect(service.updateProjectShare).toHaveBeenCalledWith({
      projectId: 'proj_x',
      ownerId: 'owner-1',
      visibility: 'public',
    });
    expect(response).toEqual(share);
  });

  it('should delegate stop sharing to PublicationsService', async () => {
    vi.mocked(service.stopProjectShare).mockResolvedValue(undefined);

    await projectShareController.stopProjectShare('proj_x', 'owner-1');

    expect(service.stopProjectShare).toHaveBeenCalledWith({ projectId: 'proj_x', ownerId: 'owner-1' });
  });

  it('should delegate project share envelope lookup to PublicationsService', async () => {
    vi.mocked(service.getProjectShareEnvelope).mockResolvedValue({
      project: { id: 'proj_x', name: 'Tray', description: null },
      share: null,
    });

    const response = await projectShareController.getProjectShare('proj_x', 'owner-1');

    expect(service.getProjectShareEnvelope).toHaveBeenCalledWith({ projectId: 'proj_x', ownerId: 'owner-1' });
    expect(response.project.id).toBe('proj_x');
  });

  describe('getPublicationFile (authenticated file proxy)', () => {
    const sha = 'a'.repeat(64);

    it('should stream the resolved blob with strong ETag and revalidation Cache-Control headers', async () => {
      vi.mocked(service.resolvePublicationFile).mockResolvedValue({
        sha256Hex: sha,
        etag: `"${sha}"`,
        path: 'main.ts',
        key: `${sha.slice(0, 2)}/${sha.slice(2)}`,
      });
      vi.mocked(service.openPublicationFile).mockResolvedValue({
        body: Readable.from([new TextEncoder().encode('bytes')]),
        contentType: 'application/octet-stream',
        contentLength: 5,
      });
      const reply = mockDeep<FastifyReply>();

      const result = await controller.getPublicationFile('pub_x', 'main.ts', 'viewer-1', undefined, reply);

      expect(service.resolvePublicationFile).toHaveBeenCalledWith({
        publicationId: 'pub_x',
        viewerUserId: 'viewer-1',
        path: 'main.ts',
      });
      expect(reply.header).toHaveBeenCalledWith('etag', `"${sha}"`);
      expect(reply.header).toHaveBeenCalledWith('cache-control', 'private, no-cache');
      // The key the resolve answered, which carries how the blob is served (#2008).
      expect(service.openPublicationFile).toHaveBeenCalledWith(sha, 'main.ts', `${sha.slice(0, 2)}/${sha.slice(2)}`);
      expect(result).toBeInstanceOf(StreamableFile);
      expect(result?.options).toEqual({ type: 'application/octet-stream', length: 5 });
      expect(fileRequestMetricAdd).toHaveBeenCalledWith(1, { outcome: 'served' });
    });

    it('should return 304 without opening the blob when If-None-Match matches the manifest sha', async () => {
      vi.mocked(service.resolvePublicationFile).mockResolvedValue({
        sha256Hex: sha,
        etag: `"${sha}"`,
        path: 'main.ts',
        key: `${sha.slice(0, 2)}/${sha.slice(2)}`,
      });
      const reply = mockDeep<FastifyReply>();

      const result = await controller.getPublicationFile('pub_x', 'main.ts', 'viewer-1', `"${sha}"`, reply);

      expect(result).toBeUndefined();
      expect(reply.status).toHaveBeenCalledWith(304);
      expect(service.openPublicationFile).not.toHaveBeenCalled();
      expect(fileRequestMetricAdd).toHaveBeenCalledWith(1, { outcome: 'revalidated' });
    });

    it('should re-check authorization before revalidating and record denied when the grant is revoked', async () => {
      vi.mocked(service.resolvePublicationFile).mockRejectedValue(
        new ForbiddenException({ code: 'FORBIDDEN', message: 'Publication is private' }),
      );
      const reply = mockDeep<FastifyReply>();

      await expect(controller.getPublicationFile('pub_x', 'main.ts', 'revoked-1', `"${sha}"`, reply)).rejects.toThrow(
        'Publication is private',
      );
      expect(service.openPublicationFile).not.toHaveBeenCalled();
      expect(fileRequestMetricAdd).toHaveBeenCalledWith(1, { outcome: 'denied' });
    });

    it('should record not_found when the path is not in the publication manifest', async () => {
      vi.mocked(service.resolvePublicationFile).mockRejectedValue(
        new NotFoundException({ code: 'NOT_FOUND', message: 'File not found in publication' }),
      );
      const reply = mockDeep<FastifyReply>();

      await expect(controller.getPublicationFile('pub_x', 'nope.ts', 'viewer-1', undefined, reply)).rejects.toThrow(
        'File not found in publication',
      );
      expect(fileRequestMetricAdd).toHaveBeenCalledWith(1, { outcome: 'not_found' });
    });
  });
});

describe('ifNoneMatchSatisfied', () => {
  const etag = `"${'b'.repeat(64)}"`;

  it('should match the exact strong ETag, a weak variant, a list member, and the wildcard', () => {
    expect(ifNoneMatchSatisfied(etag, etag)).toBe(true);
    expect(ifNoneMatchSatisfied(`W/${etag}`, etag)).toBe(true);
    expect(ifNoneMatchSatisfied(`"other", ${etag}`, etag)).toBe(true);
    expect(ifNoneMatchSatisfied('*', etag)).toBe(true);
  });

  it('should not match a different ETag', () => {
    expect(ifNoneMatchSatisfied('"nope"', etag)).toBe(false);
    expect(ifNoneMatchSatisfied('"a", "b"', etag)).toBe(false);
  });
});

describe('fileRequestFailureOutcome', () => {
  it('should map authorization failures to denied and missing/gone content to not_found', () => {
    expect(fileRequestFailureOutcome(new ForbiddenException())).toBe('denied');
    expect(fileRequestFailureOutcome(new NotFoundException())).toBe('not_found');
    expect(fileRequestFailureOutcome(new GoneException())).toBe('not_found');
  });

  it('should map unexpected failures to error', () => {
    expect(fileRequestFailureOutcome(new HttpException('boom', 500))).toBe('error');
    expect(fileRequestFailureOutcome(new Error('io'))).toBe('error');
  });
});

describe('PublishRequestDto validation (ZodValidationPipe)', () => {
  const pipe = new ZodValidationPipe();
  const valid = {
    projectId: 'proj',
    projectName: 'Demo',
    tag: 'v1',
    revisionId: 'a'.repeat(40),
    entryPath: 'main.ts',
    visibility: 'private',
  } as const;

  it('accepts a pointer into the graph', () => {
    expect(pipe.transform(valid, { type: 'body', metatype: PublishRequestDto })).toMatchObject({ tag: 'v1' });
  });

  it('rejects a body with no named version', () => {
    const { tag: _tag, ...withoutTag } = valid;
    expect(() => {
      pipe.transform(withoutTag, { type: 'body', metatype: PublishRequestDto });
    }).toThrow(ZodValidationException);
  });

  it('rejects a body with no revision', () => {
    const { revisionId: _revisionId, ...withoutRevision } = valid;
    expect(() => {
      pipe.transform(withoutRevision, { type: 'body', metatype: PublishRequestDto });
    }).toThrow(ZodValidationException);
  });

  it('rejects a body missing entryPath', () => {
    const { entryPath: _entryPath, ...withoutEntry } = valid;
    expect(() => {
      pipe.transform(withoutEntry, { type: 'body', metatype: PublishRequestDto });
    }).toThrow(ZodValidationException);
  });

  it('accepts a body without visibility, which keeps the link setting', () => {
    const { visibility: _visibility, ...withoutVisibility } = valid;
    expect(pipe.transform(withoutVisibility, { type: 'body', metatype: PublishRequestDto })).not.toHaveProperty(
      'visibility',
    );
  });
});
