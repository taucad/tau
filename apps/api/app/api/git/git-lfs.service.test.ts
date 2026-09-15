import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { GitAccess, GitRepositoryService } from '#api/git/git.service.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';

const access: GitAccess = {
  projectId: 'proj_1',
  ownerId: 'user_1',
  repositoryPath: '/tmp/proj_1.git',
  remainingBytes: 1024,
  storageLimitBytes: 1024,
};

describe('GitLfsService finalized-object boundary', () => {
  const bytes = new TextEncoder().encode('verified lfs bytes');
  const oid = createHash('sha256').update(bytes).digest('hex');
  const stored: { current: Uint8Array<ArrayBuffer> } = { current: bytes };
  const objectStorage = {
    headBlob: vi.fn(async () => ({
      contentType: 'application/octet-stream',
      size: stored.current.byteLength,
      etag: 'etag',
      cacheControl: '',
    })),
    getBlob: vi.fn(async () => ({
      body: Readable.from([stored.current]),
      contentType: 'application/octet-stream',
      etag: 'etag',
      contentLength: stored.current.byteLength,
    })),
    presignPut: vi.fn(async () => 'https://store.test/upload'),
    presignGet: vi.fn(async () => 'https://store.test/download'),
  };
  const repositories = {
    reserveLfsObjects: vi.fn(
      async () =>
        ({
          status: 'reserved',
          objects: [{ oid, size: bytes.byteLength, finalized: false }],
        }) as const,
    ),
    readLfsObjects: vi.fn(async () => [{ oid, size: bytes.byteLength, finalized: true }]),
    finalizeLfsObject: vi
      .fn<GitRepositoryService['finalizeLfsObject']>()
      .mockResolvedValueOnce('finalized')
      .mockResolvedValue('already-finalized'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stored.current = bytes;
    repositories.finalizeLfsObject
      .mockReset()
      .mockResolvedValueOnce('finalized')
      .mockResolvedValue('already-finalized');
  });

  const service = (): GitLfsService =>
    new GitLfsService(
      objectStorage as unknown as ObjectStorageService,
      repositories as unknown as GitRepositoryService,
    );

  it('signs an exact length and SHA-256 and finalizes valid bytes idempotently', async () => {
    const batch = await service().batch({
      access,
      operation: 'upload',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: 'Bearer token',
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    expect(batch.status).toBe(200);
    expect(objectStorage.presignPut).toHaveBeenCalledWith(
      expect.objectContaining({
        contentLength: bytes.byteLength,
        checksumSha256: Buffer.from(oid, 'hex').toString('base64'),
      }),
    );
    if (batch.status === 200) {
      expect(batch.body.objects[0]?.actions?.['upload']?.header).toMatchObject({
        'Content-Length': String(bytes.byteLength),
        'x-amz-checksum-sha256': Buffer.from(oid, 'hex').toString('base64'),
      });
    }
    await expect(service().verify({ access, oid, size: bytes.byteLength })).resolves.toBe(true);
    await expect(service().verify({ access, oid, size: bytes.byteLength })).resolves.toBe(true);
    expect(repositories.finalizeLfsObject).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: 'wrong hash',
      body: new TextEncoder().encode('wrong but same bytes'),
      requestedOid: oid,
      size: bytes.byteLength,
    },
    { label: 'wrong size', body: bytes, requestedOid: oid, size: bytes.byteLength + 1 },
    { label: 'truncated', body: bytes.slice(0, -1), requestedOid: oid, size: bytes.byteLength },
  ])('refuses $label before finalization', async ({ body, requestedOid, size }) => {
    stored.current = body;
    await expect(service().verify({ access, oid: requestedOid, size })).resolves.toBe(false);
    expect(repositories.finalizeLfsObject).not.toHaveBeenCalled();
  });

  it('fails closed when a formerly valid object is overwritten with corrupt same-length bytes', async () => {
    await expect(service().verify({ access, oid, size: bytes.byteLength })).resolves.toBe(true);
    stored.current = new Uint8Array(bytes.byteLength).fill(9);
    await expect(service().verify({ access, oid, size: bytes.byteLength })).resolves.toBe(false);
    expect(repositories.finalizeLfsObject).toHaveBeenCalledOnce();
  });

  it('advertises a download only for a finalized row with matching stored length', async () => {
    const result = await service().batch({
      access,
      operation: 'download',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: undefined,
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.objects[0]?.actions?.['download']?.href).toBe('https://store.test/download');
    }

    repositories.readLfsObjects.mockResolvedValueOnce([]);
    const missing = await service().batch({
      access,
      operation: 'download',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: undefined,
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });
    if (missing.status === 200) {
      expect(missing.body.objects[0]?.error?.code).toBe(404);
    }
  });
});
