import type { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { ProjectPreviewController } from '#api/projects/project-preview.controller.js';
import { inspectProjectPreview, ProjectPreviewService } from '#api/projects/project-preview.service.js';
import { projectPreviewSchema } from '#api/projects/project-preview.dto.js';

// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Node Buffer fixture encodes WebP integer headers.
const image = (width = 768, height = 576): Buffer<ArrayBuffer> => {
  // VP8 keyframe header fixture: validates envelope limits without decoding image content on the server.
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8);
  bytes.write('VP8 ', 12);
  bytes.writeUInt32LE(10, 16);
  bytes.set([0x9d, 0x01, 0x2a], 23);
  bytes.writeUInt16LE(width, 26);
  bytes.writeUInt16LE(height, 28);
  return bytes;
};

describe('authenticated project previews', () => {
  const access = mock<ProjectAccessService>();
  const storage = mock<ObjectStorageService>();
  const budget = mock<PublicationRateLimiterService>();
  const service = new ProjectPreviewService(storage);
  const controller = new ProjectPreviewController(access, service, budget);
  const reply = mock<FastifyReply>();
  const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
  beforeEach(() => {
    vi.resetAllMocks();
    access.authorize.mockResolvedValue({ projectId, ownerId: 'owner', role: 'write' });
    budget.consumeDailyBudget.mockResolvedValue({ allowed: true, count: 1 });
    storage.putBlob.mockResolvedValue({ lost: false, alreadyExisted: false, etag: 'etag' });
  });

  it('should write one bounded private image under the authorized owner, never caller-selected storage', async () => {
    const result = await controller.put(projectId, 'collaborator', { image: image().toString('base64') });
    expect(access.authorize).toHaveBeenCalledWith(projectId, 'collaborator', 'write');
    const stored = storage.putBlob.mock.calls[0]?.[0];
    expect(stored).toMatchObject({
      namespace: 'tenants',
      key: `owner/repos/${projectId}/catalog-preview.webp`,
      tier: 'private',
      contentType: 'image/webp',
    });
    expect(result.version).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('should atomically preserve an existing image during cached backfill', async () => {
    storage.putBlob.mockResolvedValue({ lost: true, alreadyExisted: true });
    await expect(controller.put(projectId, 'owner', { image: image().toString('base64') }, '*')).rejects.toMatchObject({
      status: 412,
    });
    expect(storage.putBlob).toHaveBeenCalledWith(expect.objectContaining({ ifNoneMatch: '*' }));
  });

  it('should authorize every image read before probing private storage and distinguish absence', async () => {
    storage.headBlob.mockResolvedValue(undefined);
    await expect(controller.get(projectId, 'reader', reply)).resolves.toBeUndefined();
    expect(access.authorize).toHaveBeenCalledWith(projectId, 'reader', 'read');
    access.authorize.mockRejectedValue(new NotFoundException());
    storage.headBlob.mockClear();
    await expect(controller.get(projectId, 'stranger', reply)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.headBlob).not.toHaveBeenCalled();
  });

  it('should deny read-only writers and malformed project ids without spending budget or storing', async () => {
    access.authorize.mockRejectedValue(new ForbiddenException());
    await expect(controller.put(projectId, 'reader', { image: image().toString('base64') })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.put('../other', 'reader', { image: image().toString('base64') })).rejects.toThrow();
    expect(storage.putBlob).not.toHaveBeenCalled();
    expect(budget.consumeDailyBudget).not.toHaveBeenCalled();
  });

  it('should refuse oversized, animated, malformed and mismatched image envelopes', () => {
    expect(() => inspectProjectPreview(image(769))).toThrow();
    expect(() => inspectProjectPreview(image(768, 577))).toThrow();
    expect(() => inspectProjectPreview(new Uint8Array(262_145))).toThrow();
    const animated = image();
    animated.write('ANIM', 12);
    expect(() => inspectProjectPreview(animated)).toThrow();
    const truncated = image();
    truncated.writeUInt32LE(32, 16);
    expect(() => inspectProjectPreview(truncated)).toThrow();
    expect(projectPreviewSchema.safeParse({ image: 'x'.repeat(400_000) }).success).toBe(false);
  });

  it('should bound a streamed object even if its reported length is wrong', async () => {
    storage.headBlob.mockResolvedValue({ size: 30, contentType: 'image/webp', etag: 'one', cacheControl: '' });
    storage.getBlob.mockResolvedValue({
      body: Readable.from([Buffer.alloc(262_145)]),
      contentType: 'image/webp',
      etag: 'one',
    });
    await expect(controller.get(projectId, 'reader', reply)).rejects.toThrow('size limit');
  });

  it('should return the saved image without opening any repository or CAD data', async () => {
    storage.headBlob.mockResolvedValue({ size: 30, contentType: 'image/webp', etag: 'one', cacheControl: '' });
    storage.getBlob.mockResolvedValue({ body: Readable.from([image()]), contentType: 'image/webp', etag: 'one' });
    const result = await controller.get(projectId, 'reader', reply);
    expect(result?.getHeaders()).toMatchObject({ type: 'image/webp', length: 30 });
    expect(storage.getBlob).toHaveBeenCalledTimes(1);
  });
});
