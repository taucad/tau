/* eslint-disable @typescript-eslint/naming-convention -- environment variable names and git-lfs wire fields are spelled by their owners */
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoneException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import type { DatabaseService } from '#database/database.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { GitAccess, GitRepositoryService } from '#api/git/git.service.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import type { ConfigService } from '@nestjs/config';
import { verifyFileLink, decodeBase64, importFileLinkVerifyKey } from '@taucad/file-links';
import { fileLinkVectors } from '@taucad/file-links/vectors';
import { FileLinksService } from '#storage/file-links.service.js';
import type { FileLinksEnvironment } from '#storage/file-links.service.js';
import { TAU_DEFAULT_STORAGE_ACCOUNT_ID } from '#storage/object-storage.service.js';

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
    resolveActiveLocator: vi.fn(async () => ({ ownerId: access.ownerId, projectId: access.projectId })),
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
  let deleting = false;

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
    deleting = false;
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
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: async () => (deleting ? [{ projectId: access.projectId, ownerId: access.ownerId }] : []),
                }),
              }),
            }),
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

  it.each(['upload', 'download'] as const)(
    'should refuse fresh %s URLs if deletion wins after object lookup',
    async (operation) => {
      reservedFinalized = true;
      objectStorage.headBlob.mockImplementationOnce(async () => {
        deleting = true;
        return { contentType: 'application/octet-stream', size: bytes.byteLength, etag: 'etag', cacheControl: '' };
      });
      await expect(
        service().batch({
          access,
          operation,
          objects: [{ oid, size: bytes.byteLength }],
          authorization: undefined,
          endpoint: 'https://api.test/lfs',
        }),
      ).rejects.toBeInstanceOf(GoneException);
      expect(objectStorage.presignPut).not.toHaveBeenCalled();
      expect(objectStorage.presignGet).not.toHaveBeenCalled();
      expect(updates).toEqual([]);
    },
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

    expect(lockedOwners()).toStrictEqual([access.ownerId, access.projectId, access.projectId]);
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
    expect(lockedOwners()).toStrictEqual([access.ownerId, access.projectId, access.projectId]);
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
    expect(lockedOwners()).toStrictEqual([access.ownerId, access.projectId, access.projectId]);
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

    expect(lockedOwners()).toStrictEqual([access.projectId]);
    expect(updates).toStrictEqual([]);
  });
  // === Files service: downloads as `files.<zone>` links (files service blueprint §1, §10) ===

  describe('files links', () => {
    const [signingKey] = fileLinkVectors.keys;
    const fileLinks = (values: Partial<FileLinksEnvironment>): FileLinksService =>
      new FileLinksService({
        get: (name: keyof FileLinksEnvironment) => values[name],
      } as unknown as ConfigService<FileLinksEnvironment, true>);
    const configured = (): FileLinksService =>
      fileLinks({
        TAU_FILES_BASE_URL: 'https://files.taucad.dev',
        TAU_FILES_LINK_SIGNING_KEY: JSON.stringify({
          kid: signingKey?.kid,
          alg: 'HS256',
          keyBase64: signingKey?.keyBase64,
        }),
      });
    const linkedService = (links: FileLinksService, accountId = TAU_DEFAULT_STORAGE_ACCOUNT_ID): GitLfsService =>
      new GitLfsService(
        { ...objectStorage, account: { id: accountId } } as unknown as ObjectStorageService,
        repositories as unknown as GitRepositoryService,
        databaseStub(),
        links,
      );
    const download = async (lfs: GitLfsService) =>
      lfs.batch({
        access,
        operation: 'download',
        objects: [{ oid, size: bytes.byteLength }],
        authorization: undefined,
        endpoint: 'https://api.test/repo/info/lfs/objects',
      });
    const downloadAction = async (lfs: GitLfsService) => {
      const result = await download(lfs);
      expect(result.status).toBe(200);
      return result.status === 200 ? result.body.objects[0]?.actions?.['download'] : undefined;
    };
    const verified = async (href: string | undefined) => {
      const url = new URL(href ?? '');
      const key = await importFileLinkVerifyKey(decodeBase64(signingKey?.keyBase64 ?? '') ?? new Uint8Array());
      return verifyFileLink({
        path: url.pathname,
        search: url.search,
        audience: 'files.taucad.dev',
        now: Math.floor(Date.now() / 1000),
        keyFor: (kid) => (kid === signingKey?.kid ? key : undefined),
      });
    };

    it('should answer a download with a files link the Worker verifies, keeping expires_in at 900', async () => {
      const action = await downloadAction(linkedService(configured()));
      expect(action?.expires_in).toBe(900);
      expect(action?.header).toBeUndefined();
      expect(
        action?.href.startsWith(`https://files.taucad.dev/v1/lfs/${access.ownerId}/${access.projectId}/${oid}?`),
      ).toBe(true);
      expect(await verified(action?.href)).toMatchObject({
        ok: true,
        link: { location: { layout: 'tenant', oid }, size: bytes.byteLength },
      });
      expect(objectStorage.presignGet).not.toHaveBeenCalled();
    });

    it('should sign the legacy path for an object still at its pre-D24 key', async () => {
      storedNamespace = 'blobs';
      const action = await downloadAction(linkedService(configured()));
      expect(action?.href.startsWith(`https://files.taucad.dev/v1/lfs-legacy/${access.projectId}/${oid}?`)).toBe(true);
      expect(await verified(action?.href)).toMatchObject({ ok: true, link: { location: { layout: 'legacy' } } });
    });

    it('should keep presigned downloads when the files service is not configured', async () => {
      const action = await downloadAction(linkedService(fileLinks({})));
      expect(action).toEqual({ href: 'https://store.test/download', expires_in: 900 });
    });

    it('should keep presigned downloads for a project on a scoped storage account', async () => {
      const action = await downloadAction(linkedService(configured(), 'account_1'));
      expect(action?.href).toBe('https://store.test/download');
    });

    it('should keep uploads presigned with the files service on', async () => {
      const result = await linkedService(configured()).batch({
        access,
        operation: 'upload',
        objects: [{ oid, size: bytes.byteLength }],
        authorization: 'Bearer token',
        endpoint: 'https://api.test/repo/info/lfs/objects',
      });
      expect(result.status === 200 ? result.body.objects[0]?.actions?.['upload']?.href : undefined).toBe(
        'https://store.test/upload',
      );
    });

    it('should still refuse an object retirement removed, with no link', async () => {
      rowSurvivesClear = false;
      const result = await download(linkedService(configured()));
      expect(result.status === 200 ? result.body.objects[0] : undefined).toMatchObject({
        error: { code: 404 },
      });
    });
  });
});
