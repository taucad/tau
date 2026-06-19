import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ZodValidationException, ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '#auth/auth.guard.js';
import { ProjectShareController } from '#api/publications/project-share.controller.js';
import { PublicationsController } from '#api/publications/publications.controller.js';
import { PublicationsService } from '#api/publications/publications.service.js';
import { ViewerIdentityInterceptor } from '#api/publications/viewer-identity.interceptor.js';
import { ViewerIdentityService } from '#api/publications/viewer-identity.service.js';
import type { MultipartRequest } from '#api/publications/publish-multipart.decorator.js';
import { collectPublishMultipart } from '#api/publications/publish-multipart.decorator.js';
import type { PublicationWireRow } from '#api/publications/publications.dto.js';
import { PublishUploadDto } from '#api/publications/publications.dto.js';

const validationPipe = new ZodValidationPipe();

async function validatePublishUpload(request: FastifyRequest): Promise<PublishUploadDto> {
  const raw = await collectPublishMultipart(request as MultipartRequest);
  return validationPipe.transform(raw, { type: 'custom', metatype: PublishUploadDto }) as PublishUploadDto;
}

describe('PublicationsController', () => {
  let controller: PublicationsController;
  let projectShareController: ProjectShareController;
  let service: PublicationsService;
  let module: TestingModule;

  beforeEach(async () => {
    const mockService = {
      publishFromUpload: vi.fn(),
      getPublicationForViewer: vi.fn(),
      getProjectShareEnvelope: vi.fn(),
      listAccessGrants: vi.fn(),
      inviteAccess: vi.fn(),
      revokeAccess: vi.fn(),
      updateVisibility: vi.fn(),
      recordView: vi.fn(),
    };

    module = await Test.createTestingModule({
      controllers: [PublicationsController, ProjectShareController],
      providers: [
        {
          provide: PublicationsService,
          useValue: mockService,
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
    service = module.get(PublicationsService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should delegate publishFromUpload to PublicationsService', async () => {
    const entryPath = 'main.ts';
    const manifest = {
      projectId: 'proj',
      projectName: 'Demo',
      entryFile: entryPath,
      visibility: 'private',
      title: 'Hello',
    };

    vi.mocked(service.publishFromUpload).mockResolvedValue({
      id: 'pub_test',
      urls: {
        view: 'https://example/v/pub_test',
        share: 'https://example/v/pub_test',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
        manifest: 'https://cdn.example/manifest.json',
      },
    });

    const multipartRequest = {
      parts: async function* parts() {
        yield { type: 'field', fieldname: 'manifest', value: JSON.stringify(manifest) };
        yield {
          type: 'file',
          fieldname: entryPath,
          filename: entryPath,
          encoding: 'utf8',
          mimetype: 'text/plain',
          file: (async function* file() {
            yield new TextEncoder().encode('export default () => {}');
          })(),
        };
      },
    } as unknown as FastifyRequest;

    const upload = await validatePublishUpload(multipartRequest);
    const payload = await controller.publish('owner-1', upload);

    expect(service.publishFromUpload).toHaveBeenCalledTimes(1);
    expect(payload.id).toBe('pub_test');
  });

  it('should delegate viewer lookups to PublicationsService with viewer id', async () => {
    const entryPath = 'main.ts';
    const publicationWire: PublicationWireRow = {
      id: 'pub_x',
      projectId: 'proj',
      ownerId: 'owner-1',
      parentPublicationId: null,
      visibility: 'public',
      manifestKey: 'm.json',
      ogImageKey: null,
      thumbnailKey: null,
      runtimePin: 'x',
      kernels: ['replicad'],
      entryFile: entryPath,
      title: 'T',
      description: null,
      forkCount: 0,
      viewCount: 0,
      ownerSnapshot: null,
      createdAt: new Date().toISOString(),
      unpublishedAt: null,
    };

    vi.mocked(service.getPublicationForViewer).mockResolvedValue({
      publication: publicationWire,
      viewerRole: 'owner',
      urls: {
        view: 'https://example/v/pub_x',
        share: 'https://example/v/pub_x',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
        manifest: 'https://cdn.example/manifest.json',
      },
      manifest: {
        version: 1,
        projectId: 'proj',
        entryFile: entryPath,
        files: { [entryPath]: 'sha256:' + 'a'.repeat(64) },
        kernels: [],
        runtime: '@taucad/runtime@pin',
        parameters: {},
        createdAt: new Date().toISOString(),
      },
      files: { [entryPath]: 'https://cdn.example/blobs/abc' },
    });

    const response = await controller.getPublication('pub_x', 'owner-1');

    expect(service.getPublicationForViewer).toHaveBeenCalledWith({
      publicationId: 'pub_x',
      viewerUserId: 'owner-1',
    });
    expect(response.publication.id).toBe('pub_x');
  });

  it('should pass undefined viewerUserId when OptionalUser resolves undefined', async () => {
    const entryPath = 'main.ts';
    vi.mocked(service.getPublicationForViewer).mockResolvedValue({
      publication: {
        id: 'pub_x',
        projectId: 'proj',
        ownerId: 'owner-1',
        parentPublicationId: null,
        visibility: 'public',
        manifestKey: 'm.json',
        ogImageKey: null,
        thumbnailKey: null,
        runtimePin: 'x',
        kernels: [],
        entryFile: entryPath,
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
        view: 'https://example/v/pub_x',
        share: 'https://example/v/pub_x',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/thumb.webp',
        manifest: 'https://cdn.example/manifest.json',
      },
      manifest: {
        version: 1,
        projectId: 'proj',
        entryFile: entryPath,
        files: { [entryPath]: 'sha256:' + 'a'.repeat(64) },
        kernels: [],
        runtime: '@taucad/runtime@pin',
        parameters: {},
        createdAt: new Date().toISOString(),
      },
      files: { [entryPath]: 'https://cdn.example/blobs/abc' },
    });

    await controller.getPublication('pub_x', undefined);

    expect(service.getPublicationForViewer).toHaveBeenCalledWith({
      publicationId: 'pub_x',
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

  it('should delegate publication access invite to PublicationsService', async () => {
    vi.mocked(service.inviteAccess).mockResolvedValue({
      id: 'pva_1',
      publicationId: 'pub_x',
      recipientEmail: 'friend@example.com',
      status: 'active',
      createdAt: new Date().toISOString(),
      revokedAt: null,
    });

    const response = await controller.inviteAccess('pub_x', 'owner-1', {
      email: 'friend@example.com',
      notifyRecipient: true,
    });

    expect(service.inviteAccess).toHaveBeenCalledWith({
      publicationId: 'pub_x',
      ownerId: 'owner-1',
      recipientEmail: 'friend@example.com',
      notifyRecipient: true,
    });
    expect(response.recipientEmail).toBe('friend@example.com');
  });

  it('should delegate access listing to PublicationsService', async () => {
    vi.mocked(service.listAccessGrants).mockResolvedValue({
      grants: [
        {
          id: 'pva_1',
          publicationId: 'pub_x',
          recipientEmail: 'friend@example.com',
          status: 'active',
          createdAt: new Date().toISOString(),
          revokedAt: null,
        },
      ],
    });

    const response = await controller.listAccess('pub_x', 'owner-1');

    expect(service.listAccessGrants).toHaveBeenCalledWith({ publicationId: 'pub_x', ownerId: 'owner-1' });
    expect(response.grants).toHaveLength(1);
  });

  it('should delegate access revocation to PublicationsService', async () => {
    vi.mocked(service.revokeAccess).mockResolvedValue({
      id: 'pva_1',
      publicationId: 'pub_x',
      recipientEmail: 'friend@example.com',
      status: 'revoked',
      createdAt: new Date().toISOString(),
      revokedAt: new Date().toISOString(),
    });

    const response = await controller.revokeAccess('pub_x', 'pva_1', 'owner-1');

    expect(service.revokeAccess).toHaveBeenCalledWith({
      publicationId: 'pub_x',
      ownerId: 'owner-1',
      accessId: 'pva_1',
    });
    expect(response.status).toBe('revoked');
  });

  it('should delegate visibility updates to PublicationsService', async () => {
    vi.mocked(service.updateVisibility).mockResolvedValue({
      id: 'pub_x',
      visibility: 'public',
    });

    const response = await controller.updateVisibility('pub_x', 'owner-1', {
      visibility: 'public',
    });

    expect(service.updateVisibility).toHaveBeenCalledWith({
      publicationId: 'pub_x',
      ownerId: 'owner-1',
      visibility: 'public',
    });
    expect(response).toEqual({ id: 'pub_x', visibility: 'public' });
  });

  it('should delegate project share envelope lookup to PublicationsService', async () => {
    vi.mocked(service.getProjectShareEnvelope).mockResolvedValue({
      project: { id: 'proj_x', name: 'Tray', description: null },
      currentPublication: null,
      snapshot: { state: 'unpublished' },
    });

    const response = await projectShareController.getProjectShare('proj_x', 'owner-1');

    expect(service.getProjectShareEnvelope).toHaveBeenCalledWith({ projectId: 'proj_x', ownerId: 'owner-1' });
    expect(response.project.id).toBe('proj_x');
  });
});

describe('PublishUploadDto validation (ZodValidationPipe)', () => {
  const pipe = new ZodValidationPipe();

  it('rejects missing manifest', () => {
    expect(() => {
      pipe.transform({ files: new Map() }, { type: 'custom', metatype: PublishUploadDto });
    }).toThrow(ZodValidationException);
  });

  it('rejects invalid JSON manifest', () => {
    expect(() => {
      pipe.transform({ manifest: '{', files: new Map() }, { type: 'custom', metatype: PublishUploadDto });
    }).toThrow(ZodValidationException);
  });

  it('rejects manifest missing entryFile', () => {
    const manifestJson = JSON.stringify({
      projectId: 'proj',
      projectName: 'Demo',
      visibility: 'private',
      title: 'T',
    });
    expect(() => {
      pipe.transform({ manifest: manifestJson, files: new Map() }, { type: 'custom', metatype: PublishUploadDto });
    }).toThrow(ZodValidationException);
  });
});
