import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import type { DatabaseService } from '#database/database.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { GitAccess, GitRepositoryService } from '#api/git/git.service.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { tenantLfsObjectKey } from '#api/git/lfs-keys.js';

const access: GitAccess = {
  projectId: 'proj_1',
  ownerId: 'user_1',
  role: 'owner',
  callerId: 'user_1',
  remainingBytes: 1024,
  storageLimitBytes: 1024,
};

describe('GitLfsService finalized-object boundary', () => {
  const bytes = new TextEncoder().encode('verified lfs bytes');
  const oid = createHash('sha256').update(bytes).digest('hex');
  const stored: { current: Uint8Array<ArrayBuffer> } = { current: bytes };
  /* Which key actually holds the bytes: `tenants` since D24, `blobs` for a
     project whose objects were written before the move. */
  let storedNamespace: 'tenants' | 'blobs' = 'tenants';
  /** Whether the reservation the repository answers with is already finalized. */
  let reservedFinalized = false;
  const objectStorage = {
    headBlob: vi.fn(async (args: { namespace: string }) =>
      args.namespace === storedNamespace
        ? {
            contentType: 'application/octet-stream',
            size: stored.current.byteLength,
            etag: 'etag',
            cacheControl: '',
          }
        : undefined,
    ),
    getBlob: vi.fn(async () => ({
      body: Readable.from([stored.current]),
      contentType: 'application/octet-stream',
      etag: 'etag',
      contentLength: stored.current.byteLength,
    })),
    presignPut: vi.fn<ObjectStorageService['presignPut']>().mockResolvedValue('https://store.test/upload'),
    presignGet: vi.fn(async () => 'https://store.test/download'),
  };
  const repositories = {
    reserveLfsObjects: vi.fn(async (_args: { objects: ReadonlyArray<{ oid: string; size: number }> }) => ({
      status: 'reserved',
      /* Whether the reservation already holds finalized bytes, which is what
         makes an upload batch answer "present" (D18). */
      objects: [{ oid, size: bytes.byteLength, finalized: reservedFinalized }],
    })),
    readLfsObjects: vi.fn(async () => [{ oid, size: bytes.byteLength, finalized: true }]),
    finalizeLfsObject: vi
      .fn<GitRepositoryService['finalizeLfsObject']>()
      .mockImplementation(async ({ verifyContent }) => ((await verifyContent()) ? 'finalized' : 'invalid')),
  };

  /* Whether the reservation row still exists when the locked clear runs; false
     is the retirement that slipped in after the unlocked `headBlob`. */
  let rowSurvivesClear = true;

  /** Every statement the service ran outside a query builder, in order. */
  let executed: SQL[];
  /** Every `set(...)` a locked update applied, in order. */
  let updates: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    stored.current = bytes;
    storedNamespace = 'tenants';
    reservedFinalized = false;
    rowSurvivesClear = true;
    executed = [];
    updates = [];
    repositories.finalizeLfsObject
      .mockReset()
      .mockImplementation(async ({ verifyContent }) => ((await verifyContent()) ? 'finalized' : 'invalid'));
  });

  /** The strings a `select pg_advisory_xact_lock(hashtextextended($1, 0))` carries. */
  const lockedOwners = (): string[] =>
    executed.flatMap((statement) =>
      /* A `sql` template interpolates a bare value as the chunk itself, so the
         lock key is a plain string between the two static fragments. */
      statement.queryChunks.filter((chunk): chunk is string => typeof chunk === 'string'),
    );

  const databaseStub = (): DatabaseService =>
    ({
      database: {
        transaction: async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
          run({
            execute: async (statement: SQL): Promise<void> => {
              executed.push(statement);
            },
            update: () => ({
              set: (values: Record<string, unknown>) => ({
                where: () => {
                  updates.push(values);
                  return {
                    /* `update … returning` yields a row only for a reservation
                       that still exists, which is what the answer turns on. */
                    returning: async (): Promise<Array<{ oid: string }>> => (rowSurvivesClear ? [{ oid }] : []),
                  };
                },
              }),
            }),
          }),
      },
    }) as unknown as DatabaseService;

  const service = (): GitLfsService =>
    new GitLfsService(
      objectStorage as unknown as ObjectStorageService,
      repositories as unknown as GitRepositoryService,
      databaseStub(),
    );

  it('should refuse a whole upload batch before reserving when one file exceeds 100 MiB', async () => {
    const result = await service().batch({
      access,
      operation: 'upload',
      objects: [
        { oid, size: bytes.byteLength },
        { oid: 'a'.repeat(64), size: 104_857_601 },
      ],
      authorization: undefined,
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.objects.map((object) => object.error?.code)).toEqual([422, 413]);
      expect(result.body.objects[1]?.error?.message).toContain('100 MiB');
    }
    expect(repositories.reserveLfsObjects).not.toHaveBeenCalled();
    expect(objectStorage.presignPut).not.toHaveBeenCalled();
  });

  it('should admit a file of exactly 100 MiB for reservation and signing', async () => {
    const result = await service().batch({
      access,
      operation: 'upload',
      objects: [{ oid, size: 104_857_600 }],
      authorization: undefined,
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });
    expect(result.status).toBe(200);
    expect(repositories.reserveLfsObjects).toHaveBeenCalledOnce();
    expect(objectStorage.presignPut.mock.calls[0]?.[0]).toMatchObject({ contentLength: 104_857_600 });
  });

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

  it('finishes streaming before entering the finalization transaction', async () => {
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const body = Readable.from(
      (async function* () {
        entered.resolve();
        await resume.promise;
        yield bytes;
      })(),
    );
    objectStorage.getBlob.mockResolvedValueOnce({
      body,
      contentType: 'application/octet-stream',
      etag: 'etag',
      contentLength: bytes.byteLength,
    });
    const verification = service().verify({ access, oid, size: bytes.byteLength });
    await entered.promise;
    expect(repositories.finalizeLfsObject).not.toHaveBeenCalled();
    resume.resolve();
    await expect(verification).resolves.toBe(true);
    expect(body.destroyed).toBe(true);
  });

  it.each(['deleted', 'replaced', 'resized'] as const)('refuses an object %s after hashing', async (change) => {
    repositories.finalizeLfsObject.mockImplementationOnce(async ({ verifyContent }) => {
      objectStorage.headBlob.mockResolvedValueOnce(
        change === 'deleted'
          ? undefined
          : {
              contentType: 'application/octet-stream',
              size: change === 'resized' ? bytes.byteLength + 1 : bytes.byteLength,
              etag: change === 'replaced' ? 'different' : 'etag',
              cacheControl: '',
            },
      );
      return (await verifyContent()) ? 'finalized' : 'invalid';
    });
    await expect(service().verify({ access, oid, size: bytes.byteLength })).resolves.toBe(false);
  });

  it('refuses a new tenant object shadowing the hashed legacy location even with the same ETag', async () => {
    storedNamespace = 'blobs';
    repositories.finalizeLfsObject.mockImplementationOnce(async ({ verifyContent }) => {
      storedNamespace = 'tenants';
      return (await verifyContent()) ? 'finalized' : 'invalid';
    });
    await expect(service().verify({ access, oid, size: bytes.byteLength })).resolves.toBe(false);
  });

  it('requires the GET response identity and destroys a body without one', async () => {
    const body = Readable.from([bytes]);
    objectStorage.getBlob.mockResolvedValueOnce({
      body,
      contentType: 'application/octet-stream',
      etag: '',
      contentLength: bytes.byteLength,
    });
    await expect(service().verify({ access, oid, size: bytes.byteLength })).resolves.toBe(false);
    expect(body.destroyed).toBe(true);
    expect(repositories.finalizeLfsObject).not.toHaveBeenCalled();
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

  // === D18/ND17: a batch answer of "present" restarts the retirement clock ===

  it('should clear the unreachable mark under the owner lock when a download finds the object present', async () => {
    await service().batch({
      access,
      operation: 'download',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: undefined,
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    expect(lockedOwners()).toStrictEqual([access.ownerId]);
    expect(updates).toStrictEqual([{ unreachableAt: null }]);
  });

  it('should clear the unreachable mark when an upload batch finds the object already stored', async () => {
    reservedFinalized = true;

    const batch = await service().batch({
      access,
      operation: 'upload',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: 'Bearer token',
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    /* A present object is answered with no actions, which is how git-lfs skips it. */
    if (batch.status === 200) {
      expect(batch.body.objects[0]?.actions).toBeUndefined();
    }
    expect(lockedOwners()).toStrictEqual([access.ownerId]);
    expect(updates).toStrictEqual([{ unreachableAt: null }]);
  });

  // === P0-1: the locked clear decides, not the unlocked head ===============

  it('should hand out an upload action when retirement removed the row between the head and the clear', async () => {
    reservedFinalized = true;
    rowSurvivesClear = false;

    const batch = await service().batch({
      access,
      operation: 'upload',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: 'Bearer token',
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    /* An answer with no actions would tell git-lfs to skip the upload for bytes
       that are gone; the client must be told to upload instead. */
    expect(batch.status).toBe(200);
    if (batch.status === 200) {
      expect(batch.body.objects[0]?.actions?.['upload']?.href).toBe('https://store.test/upload');
    }
    expect(lockedOwners()).toStrictEqual([access.ownerId]);
  });

  it('should reserve the unconfirmed object again so the upload it just authorized can finalize', async () => {
    reservedFinalized = true;
    rowSurvivesClear = false;

    await service().batch({
      access,
      operation: 'upload',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: 'Bearer token',
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    /* Exactly the objects the clear could not confirm, and nothing else: the
       row retirement deleted has to exist again before `verify` runs. */
    expect(repositories.reserveLfsObjects).toHaveBeenCalledTimes(2);
    expect(repositories.reserveLfsObjects.mock.calls[1]?.[0]).toMatchObject({
      objects: [{ oid, size: bytes.byteLength }],
    });
  });

  it('should reserve nothing again when the clear confirmed every present object', async () => {
    reservedFinalized = true;

    await service().batch({
      access,
      operation: 'upload',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: 'Bearer token',
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    expect(repositories.reserveLfsObjects).toHaveBeenCalledOnce();
  });

  it('should answer a download 404 when retirement removed the row between the head and the clear', async () => {
    rowSurvivesClear = false;

    const batch = await service().batch({
      access,
      operation: 'download',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: undefined,
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    if (batch.status === 200) {
      expect(batch.body.objects[0]?.error?.code).toBe(404);
      expect(batch.body.objects[0]?.actions).toBeUndefined();
    }
    expect(objectStorage.presignGet).not.toHaveBeenCalled();
  });

  // === D24: uploads land under the tenant prefix, reads fall back ===========

  it('should sign an upload into the owner tenant prefix', async () => {
    await service().batch({
      access,
      operation: 'upload',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: 'Bearer token',
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    expect(objectStorage.presignPut).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'tenants',
        key: tenantLfsObjectKey(access.ownerId, access.projectId, oid),
      }),
    );
  });

  it('should refuse to form a tenant key from an unstorable identifier', () => {
    expect(() => tenantLfsObjectKey('../escape', access.projectId, oid)).toThrow(RangeError);
    expect(() => tenantLfsObjectKey(access.ownerId, 'proj/../other', oid)).toThrow(RangeError);
  });

  it('should serve a download from the legacy key while a project is not relocated', async () => {
    storedNamespace = 'blobs';

    const batch = await service().batch({
      access,
      operation: 'download',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: undefined,
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    expect(batch.status).toBe(200);
    expect(objectStorage.presignGet).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'blobs', key: gitLfsObjectKey(access.projectId, oid) }),
    );
  });

  it('should verify the bytes at whichever key holds them', async () => {
    storedNamespace = 'blobs';

    await expect(service().verify({ access, oid, size: bytes.byteLength })).resolves.toBe(true);

    expect(objectStorage.getBlob).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'blobs', key: gitLfsObjectKey(access.projectId, oid) }),
    );
  });

  it('should take no lock and clear nothing when the object is absent', async () => {
    await service().batch({
      access,
      operation: 'upload',
      objects: [{ oid, size: bytes.byteLength }],
      authorization: 'Bearer token',
      endpoint: 'https://api.test/repo/info/lfs/objects',
    });

    expect(lockedOwners()).toStrictEqual([]);
    expect(updates).toStrictEqual([]);
  });
});
