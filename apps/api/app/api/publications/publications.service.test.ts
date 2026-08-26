import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { publicationApiCode } from '@taucad/types/constants';
import type { PublicationApiCode } from '@taucad/types/constants';
import { publicationRowSchema } from '#api/publications/publications.dto.js';
import { PublicationsService } from '#api/publications/publications.service.js';
import type { ObjectStorageServiceContract } from '#storage/object-storage.service.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';
import * as schema from '#database/schema.js';

type PublicationsServiceDeps = ConstructorParameters<typeof PublicationsService>;

/**
 * Billing stub defaulting to a Pro projection so pre-existing private-flow
 * tests exercise the storage/DB behaviour, not the entitlement gate; gate
 * tests pass `canCreatePrivateShares: false` explicitly.
 */
function createBillingStub(args?: { canCreatePrivateShares?: boolean }): PublicationsServiceDeps[7] {
  return {
    getEntitlements: vi.fn().mockResolvedValue({
      canCreatePrivateShares: args?.canCreatePrivateShares ?? true,
    }),
  } as unknown as PublicationsServiceDeps[7];
}

function createStubService(): PublicationsService {
  return new PublicationsService(
    {} as unknown as PublicationsServiceDeps[0],
    {} as unknown as PublicationsServiceDeps[1],
    {} as unknown as PublicationsServiceDeps[2],
    {} as unknown as PublicationsServiceDeps[3],
    {} as unknown as PublicationsServiceDeps[4],
    {} as unknown as PublicationsServiceDeps[5],
    {} as unknown as PublicationsServiceDeps[6],
    createBillingStub(),
  );
}

function createMetricsStub(): PublicationsServiceDeps[5] {
  return {
    publicationViewsTotal: { add: vi.fn() },
    publicationViewsRejectedTotal: { add: vi.fn() },
    publicationInviteEmailsTotal: { add: vi.fn() },
    publicationInviteEmailsSuppressedTotal: { add: vi.fn() },
  } as unknown as PublicationsServiceDeps[5];
}

function createEmailStub(): PublicationsServiceDeps[6] {
  return {
    sendPublicationInvite: vi.fn().mockResolvedValue(undefined),
  } as unknown as PublicationsServiceDeps[6];
}

function createRedisStub(args?: { pfaddReturns?: number }): PublicationsServiceDeps[3] {
  return {
    client: {
      pfadd: vi.fn().mockResolvedValue(args?.pfaddReturns ?? 1),
      expire: vi.fn().mockResolvedValue(1),
    },
  } as unknown as PublicationsServiceDeps[3];
}

function createRateLimiterStub(args?: {
  allowed?: boolean;
  inviteAllowed?: boolean;
  inviteThrows?: boolean;
}): PublicationsServiceDeps[4] {
  return {
    consumePublicationViewSlot: vi.fn().mockResolvedValue({
      allowed: args?.allowed ?? true,
      count: 1,
    }),
    consumeInviteEmailSlots: args?.inviteThrows
      ? vi.fn().mockRejectedValue(new Error('redis unavailable'))
      : vi.fn().mockResolvedValue({ allowed: args?.inviteAllowed ?? true, count: 1 }),
  } as unknown as PublicationsServiceDeps[4];
}

function createDatabaseChainReturning(rows: unknown[]): PublicationsServiceDeps[0] {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  return {
    database: { select },
  } as unknown as PublicationsServiceDeps[0];
}

function createSelectReturningRows(rows: unknown[]): { from: ReturnType<typeof vi.fn> } {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit, orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from };
}

function createProjectShareService(args: { readonly selectRows: unknown[][] }): PublicationsService {
  const select = vi.fn();
  for (const rows of args.selectRows) {
    select.mockReturnValueOnce(createSelectReturningRows(rows));
  }

  return new PublicationsService(
    { database: { select } } as unknown as PublicationsServiceDeps[0],
    createStorageStub(),
    createConfigStub(),
    createRedisStub(),
    createRateLimiterStub(),
    createMetricsStub(),
    createEmailStub(),
    createBillingStub(),
  );
}

function createStorageStub(): PublicationsServiceDeps[1] {
  const storage: ObjectStorageServiceContract = {
    putBlob: vi.fn(async () => ({ etag: 'etag', alreadyExisted: false })),
    getBlob: vi.fn(async () => ({
      body: Readable.from([]),
      contentType: 'application/octet-stream',
      etag: 'etag',
    })),
    headBlob: vi.fn(async () => undefined),
    deleteBlob: vi.fn(async () => undefined),
    presignGet: vi.fn(async () => 'https://example.invalid/get'),
    presignPut: vi.fn(async () => 'https://example.invalid/put'),
    publicUrl: vi.fn(() => 'https://example.invalid/public'),
    headProbeObject: vi.fn(async () => undefined),
    headPrivateBucket: vi.fn(async () => true),
  };

  return storage as PublicationsServiceDeps[1];
}

function createConfigStub(): PublicationsServiceDeps[2] {
  return {
    get: vi.fn((key: string) => {
      if (key === 'TAU_FRONTEND_URL') {
        return 'http://app/';
      }

      if (key === 'TAU_API_URL') {
        return 'http://api.test/';
      }

      return '';
    }),
  } as unknown as PublicationsServiceDeps[2];
}

const testManifestSha = 'a'.repeat(64);

const testManifestDocument = {
  version: 1,
  projectId: 'proj_x',
  entryPath: 'main.ts',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- file-path keys can't be camelCase
  files: { 'main.ts': `sha256:${testManifestSha}` },
  kernels: [],
  runtime: '@taucad/runtime@x',
  parameters: {},
  createdAt: '2020-01-01T00:00:00.000Z',
} as const;

/** Storage stub whose getBlob yields a fresh valid manifest stream per call. */
function createManifestStorageStub(): PublicationsServiceDeps[1] {
  const storage = createStorageStub();
  vi.mocked(storage.getBlob).mockImplementation(async () => ({
    body: Readable.from([Buffer.from(JSON.stringify(testManifestDocument))]),
    contentType: 'application/json',
    etag: 'etag',
  }));
  return storage;
}

function isBadRequestWithCode(error: unknown, code: PublicationApiCode): boolean {
  if (!(error instanceof BadRequestException)) {
    return false;
  }

  const body: unknown = error.getResponse();
  if (body === null || typeof body !== 'object') {
    return false;
  }

  return 'code' in body && body.code === code;
}

function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

function allocZeros(byteLength: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(byteLength);
}

function validWebpSignature(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
}

describe('PublicationsService.publishFromUpload validation', () => {
  it('should reject when entry path is missing from upload map', async () => {
    const service = createStubService();

    await expect(
      service.publishFromUpload({
        ownerId: 'user_1',
        manifest: {
          projectId: 'proj_1',
          projectName: 'Demo',
          entryPath: 'main.ts',
          visibility: 'private',
          title: 'Hello',
        },
        files: new Map([['other.ts', encodeUtf8('// noop')]]),
      }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.MISSING_ENTRY_PATH));
  });

  it('should reject when file count exceeds limit', async () => {
    const service = createStubService();
    const files = new Map<string, Uint8Array<ArrayBuffer>>();
    for (let index = 0; index < 201; index++) {
      files.set(`f${index}.ts`, encodeUtf8('// x'));
    }

    files.set('main.ts', encodeUtf8('export default () => {}'));

    await expect(
      service.publishFromUpload({
        ownerId: 'user_1',
        manifest: {
          projectId: 'proj_1',
          projectName: 'Demo',
          entryPath: 'main.ts',
          visibility: 'private',
          title: 'Hello',
        },
        files,
      }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.TOO_MANY_FILES));
  });

  it('should reject a canonical thumbnail whose bytes are not WebP', async () => {
    const service = createStubService();

    await expect(
      service.publishFromUpload({
        ownerId: 'user_1',
        manifest: {
          projectId: 'proj_1',
          projectName: 'Demo',
          entryPath: 'main.ts',
          visibility: 'private',
          title: 'Hello',
        },
        files: new Map([
          ['main.ts', encodeUtf8('export default () => {}')],
          ['thumbnail.webp', encodeUtf8('not-webp')],
        ]),
      }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.INVALID_THUMBNAIL_WEBP));
  });

  it('should reject paths under node_modules', async () => {
    const service = createStubService();

    await expect(
      service.publishFromUpload({
        ownerId: 'user_1',
        manifest: {
          projectId: 'proj_1',
          projectName: 'Demo',
          entryPath: 'main.ts',
          visibility: 'private',
          title: 'Hello',
        },
        files: new Map([
          ['main.ts', encodeUtf8('export default () => {}')],
          ['node_modules/evil/index.js', allocZeros(0)],
        ]),
      }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.FORBIDDEN_PATH));
  });

  it('should reject paths under .tau/artifacts', async () => {
    const service = createStubService();

    await expect(
      service.publishFromUpload({
        ownerId: 'user_1',
        manifest: {
          projectId: 'proj_1',
          projectName: 'Demo',
          entryPath: 'main.ts',
          visibility: 'private',
          title: 'Hello',
        },
        files: new Map([
          ['main.ts', encodeUtf8('export default () => {}')],
          ['.tau/artifacts/cache.glb', allocZeros(1)],
        ]),
      }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.FORBIDDEN_PATH));
  });

  it('should reject paths under .tau/transcripts', async () => {
    const service = createStubService();

    await expect(
      service.publishFromUpload({
        ownerId: 'user_1',
        manifest: {
          projectId: 'proj_1',
          projectName: 'Demo',
          entryPath: 'main.ts',
          visibility: 'private',
          title: 'Hello',
        },
        files: new Map([
          ['main.ts', encodeUtf8('export default () => {}')],
          ['.tau/transcripts/chat_x.json', encodeUtf8('[]')],
        ]),
      }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.FORBIDDEN_PATH));
  });

  it('should allow .tau/parameters overrides and include them in manifest files map', async () => {
    let capturedManifest: Record<string, unknown> | undefined;

    const storage = createStorageStub();
    vi.mocked(storage.putBlob).mockImplementation(async (args) => {
      if (args.key.endsWith('manifest.json')) {
        capturedManifest = JSON.parse(new TextDecoder().decode(args.body)) as Record<string, unknown>;
      }
      return { etag: 'etag', alreadyExisted: false };
    });

    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          if ('manifestKey' in payload) {
            return undefined;
          }

          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          };
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    const databaseService = {
      database: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<void>) => {
          await callback(tx);
        }),
      },
    } as unknown as PublicationsServiceDeps[0];

    const service = new PublicationsService(
      databaseService,
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    await service.publishFromUpload({
      ownerId: 'user_1',
      manifest: {
        projectId: 'proj_1',
        projectName: 'Demo',
        entryPath: 'main.ts',
        visibility: 'private',
        title: 'Hello',
      },
      files: new Map([
        ['main.ts', encodeUtf8('export default () => {}')],
        ['.tau/parameters/main.ts.json', encodeUtf8('{}')],
      ]),
    });

    expect(capturedManifest).toBeDefined();
    const filesField = capturedManifest?.['files'] as Record<string, string> | undefined;
    expect(filesField).toBeDefined();
    expect(filesField?.['main.ts']).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(filesField?.['.tau/parameters/main.ts.json']).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('should create initial private access grants and notify recipients with frontend links', async () => {
    const accessPayloads: Array<Record<string, unknown>> = [];
    const email = createEmailStub();

    const storage = createStorageStub();
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn().mockImplementation((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
          if (table === schema.publicationAccess) {
            accessPayloads.push(...(Array.isArray(payload) ? payload : [payload]));
            return {
              onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            };
          }

          if (!Array.isArray(payload) && 'manifestKey' in payload) {
            return undefined;
          }

          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          };
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    const databaseService = {
      database: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<void>) => {
          await callback(tx);
        }),
      },
    } as unknown as PublicationsServiceDeps[0];

    const rateLimiter = createRateLimiterStub();
    const metrics = createMetricsStub();
    const service = new PublicationsService(
      databaseService,
      storage,
      createConfigStub(),
      createRedisStub(),
      rateLimiter,
      metrics,
      email,
      createBillingStub(),
    );

    const result = await service.publishFromUpload({
      ownerId: 'user_1',
      manifest: {
        projectId: 'proj_1',
        projectName: 'Demo',
        entryPath: 'main.ts',
        visibility: 'private',
        title: 'Hello',
        sharedEmails: ['friend@example.com', 'team@example.com'],
        notifyRecipients: true,
      },
      files: new Map([['main.ts', encodeUtf8('export default () => {}')]]),
    });

    expect(accessPayloads.map((payload) => payload['recipientEmail'])).toEqual([
      'friend@example.com',
      'team@example.com',
    ]);
    expect(accessPayloads.every((payload) => payload['status'] === 'active')).toBe(true);
    expect(result.urls.view).toBe(`http://app/v/${result.id}`);
    expect(result.urls.share).toBe(result.urls.view);
    expect(email.sendPublicationInvite).toHaveBeenCalledTimes(2);
    expect(email.sendPublicationInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'friend@example.com',
        publicationTitle: 'Hello',
        url: result.urls.view,
      }),
    );
    // The whole recipient batch is debited from the owner's daily budget in one call.
    expect(rateLimiter.consumeInviteEmailSlots).toHaveBeenCalledWith({ ownerId: 'user_1', count: 2 });
    expect(metrics.publicationInviteEmailsTotal.add).toHaveBeenCalledTimes(2);
    expect(metrics.publicationInviteEmailsTotal.add).toHaveBeenCalledWith(1, { trigger: 'publish', outcome: 'sent' });
  });

  it('should still publish successfully when the owner is over the invite-email cap', async () => {
    const email = createEmailStub();
    const metrics = createMetricsStub();
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    const databaseService = {
      database: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<void>) => {
          await callback(tx);
        }),
      },
    } as unknown as PublicationsServiceDeps[0];

    const service = new PublicationsService(
      databaseService,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub({ inviteAllowed: false }),
      metrics,
      email,
      createBillingStub(),
    );

    const result = await service.publishFromUpload({
      ownerId: 'user_1',
      manifest: {
        projectId: 'proj_1',
        projectName: 'Demo',
        entryPath: 'main.ts',
        visibility: 'private',
        title: 'Hello',
        sharedEmails: ['friend@example.com', 'team@example.com'],
        notifyRecipients: true,
      },
      files: new Map([['main.ts', encodeUtf8('export default () => {}')]]),
    });

    // Publish completes and returns a coherent result; only the over-cap emails are dropped.
    expect(result.urls.view).toBe(`http://app/v/${result.id}`);
    expect(email.sendPublicationInvite).not.toHaveBeenCalled();
    expect(metrics.publicationInviteEmailsSuppressedTotal.add).toHaveBeenCalledWith(2, {
      trigger: 'publish',
      reason: 'cap_exceeded',
    });
  });

  it('should reject when total payload exceeds limit', async () => {
    const service = createStubService();
    /** Three chunks under per-file max but combined exceed total upload cap (50 MiB). */
    const chunkBytes = 17 * 1024 * 1024;

    await expect(
      service.publishFromUpload({
        ownerId: 'user_1',
        manifest: {
          projectId: 'proj_1',
          projectName: 'Demo',
          entryPath: 'main.ts',
          visibility: 'private',
          title: 'Hello',
        },
        files: new Map([
          ['main.ts', encodeUtf8('export default () => {}')],
          ['a.bin', allocZeros(chunkBytes)],
          ['b.bin', allocZeros(chunkBytes)],
          ['c.bin', allocZeros(chunkBytes)],
        ]),
      }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.PAYLOAD_TOO_LARGE));
  });
});

describe('PublicationsService.getProjectShareEnvelope', () => {
  it('returns an unpublished envelope when the backend project mirror does not exist', async () => {
    const service = createProjectShareService({ selectRows: [[]] });

    await expect(service.getProjectShareEnvelope({ projectId: 'proj_missing', ownerId: 'owner-1' })).resolves.toEqual({
      project: { id: 'proj_missing', name: null, description: null },
      currentPublication: null,
      snapshot: { state: 'unpublished' },
    });
  });

  it('returns an unpublished envelope for an owned project without a current publication', async () => {
    const service = createProjectShareService({
      selectRows: [
        [
          {
            id: 'proj_1',
            ownerId: 'owner-1',
            name: 'Tray',
            description: 'A tray',
            currentPublicationId: null,
          },
        ],
      ],
    });

    await expect(service.getProjectShareEnvelope({ projectId: 'proj_1', ownerId: 'owner-1' })).resolves.toEqual({
      project: { id: 'proj_1', name: 'Tray', description: 'A tray' },
      currentPublication: null,
      snapshot: { state: 'unpublished' },
    });
  });

  it('rejects a project owned by another user', async () => {
    const service = createProjectShareService({
      selectRows: [
        [
          {
            id: 'proj_1',
            ownerId: 'owner-2',
            name: 'Tray',
            description: null,
            currentPublicationId: null,
          },
        ],
      ],
    });

    await expect(service.getProjectShareEnvelope({ projectId: 'proj_1', ownerId: 'owner-1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns active grants for the current publication', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    const grantCreatedAt = new Date('2026-01-03T03:04:05.000Z');
    const service = createProjectShareService({
      selectRows: [
        [
          {
            id: 'proj_1',
            ownerId: 'owner-1',
            name: 'Tray',
            description: 'A tray',
            currentPublicationId: 'pub_current',
          },
        ],
        [
          {
            id: 'pub_current',
            title: 'Shared tray',
            description: 'Shared description',
            visibility: 'private',
            createdAt,
            unpublishedAt: null,
          },
        ],
        [
          {
            id: 'pva_1',
            publicationId: 'pub_current',
            recipientEmail: 'friend@example.com',
            status: 'active',
            createdAt: grantCreatedAt,
            revokedAt: null,
          },
        ],
      ],
    });

    const envelope = await service.getProjectShareEnvelope({ projectId: 'proj_1', ownerId: 'owner-1' });

    expect(envelope).toMatchObject({
      project: { id: 'proj_1', name: 'Tray', description: 'A tray' },
      currentPublication: {
        id: 'pub_current',
        title: 'Shared tray',
        description: 'Shared description',
        visibility: 'private',
        createdAt: createdAt.toISOString(),
        urls: { share: 'http://app/v/pub_current' },
        access: {
          grants: [
            {
              id: 'pva_1',
              publicationId: 'pub_current',
              recipientEmail: 'friend@example.com',
              status: 'active',
              createdAt: grantCreatedAt.toISOString(),
              revokedAt: null,
            },
          ],
        },
      },
      snapshot: { state: 'published-current', lastPublishedAt: createdAt.toISOString() },
    });
  });

  it('returns unpublished when the current publication pointer is stale', async () => {
    const service = createProjectShareService({
      selectRows: [
        [
          {
            id: 'proj_1',
            ownerId: 'owner-1',
            name: 'Tray',
            description: null,
            currentPublicationId: 'pub_missing',
          },
        ],
        [],
      ],
    });

    await expect(service.getProjectShareEnvelope({ projectId: 'proj_1', ownerId: 'owner-1' })).resolves.toEqual({
      project: { id: 'proj_1', name: 'Tray', description: null },
      currentPublication: null,
      snapshot: { state: 'unpublished' },
    });
  });
});

describe('PublicationsService.getPublicationForViewer', () => {
  const publicationRow = {
    id: 'pub_test',
    projectId: 'proj_x',
    ownerId: 'user_owner',
    visibility: 'public',
    manifestKey: 'm.json',
    ogImageKey: null,
    thumbnailKey: null,
    unpublishedAt: null,
    parentPublicationId: null,
    kernels: ['replicad'],
    entryPath: 'main.ts',
    title: 'T',
    description: null,
    forkCount: 0,
    viewCount: 0,
    ownerSnapshot: null,
    createdAt: new Date(),
    runtimePin: '~0.1.0',
  };

  const createStorageForManifest = (): Pick<PublicationsServiceDeps[1], 'getBlob' | 'publicUrl'> => {
    const entryRelativePath = 'main.ts';
    const manifestDocument = {
      version: 1,
      projectId: 'proj_x',
      entryPath: entryRelativePath,
      files: { [entryRelativePath]: `sha256:${'a'.repeat(64)}` },
      kernels: [],
      runtime: '@taucad/runtime@x',
      parameters: {},
      createdAt: '2020-01-01T00:00:00.000Z',
    };

    return {
      getBlob: vi.fn().mockResolvedValue({
        body: Readable.from([Buffer.from(JSON.stringify(manifestDocument))]),
      }),
      publicUrl: vi.fn(() => 'https://cdn.example/blob'),
    };
  };

  it('returns publication timestamps as ISO strings on the wire', async () => {
    const publicRow = {
      ...publicationRow,
      visibility: 'public',
      ownerSnapshot: { id: 'user_owner', name: 'Owner' },
    };

    const entryRelativePath = 'main.ts';
    const manifestDocument = {
      version: 1,
      projectId: 'proj_x',
      entryPath: entryRelativePath,
      files: { [entryRelativePath]: `sha256:${'a'.repeat(64)}` },
      kernels: [],
      runtime: '@taucad/runtime@x',
      parameters: {},
      createdAt: '2020-01-01T00:00:00.000Z',
    };

    const storage = {
      getBlob: vi.fn().mockResolvedValue({
        body: Readable.from([Buffer.from(JSON.stringify(manifestDocument))]),
      }),
      publicUrl: vi.fn(() => 'https://cdn.example/blob'),
    };

    const service = new PublicationsService(
      createDatabaseChainReturning([publicRow]),
      storage as unknown as PublicationsServiceDeps[1],
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    const result = await service.getPublicationForViewer({ publicationId: 'pub_test' });

    expect(publicationRowSchema.safeParse(result.publication).success).toBe(true);
    expect(result.viewerRole).toBe('public');
    expect(typeof result.publication.createdAt).toBe('string');
    expect(result.publication.unpublishedAt).toBeNull();
  });

  it('resolves default thumbnail/og URLs without double-prefixing the namespace', async () => {
    const storage = createStorageForManifest();
    const service = new PublicationsService(
      createDatabaseChainReturning([{ ...publicationRow, ownerSnapshot: { id: 'user_owner', name: 'Owner' } }]),
      storage as unknown as PublicationsServiceDeps[1],
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    await service.getPublicationForViewer({ publicationId: 'pub_test' });

    // Null keys fall back to the default namespace with a bare key — not the
    // previously double-prefixed `defaults/defaults/thumb.webp`.
    expect(storage.publicUrl).toHaveBeenCalledWith({ namespace: 'defaults', key: 'thumb.webp' });
    expect(storage.publicUrl).toHaveBeenCalledWith({ namespace: 'defaults', key: 'og.png' });
  });

  it('resolves an uploaded thumbnail from the blobs namespace', async () => {
    const storage = createStorageForManifest();
    const service = new PublicationsService(
      createDatabaseChainReturning([
        { ...publicationRow, thumbnailKey: 'blobs/ab/cdef', ownerSnapshot: { id: 'user_owner', name: 'Owner' } },
      ]),
      storage as unknown as PublicationsServiceDeps[1],
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    await service.getPublicationForViewer({ publicationId: 'pub_test' });

    expect(storage.publicUrl).toHaveBeenCalledWith({ namespace: 'blobs', key: 'ab/cdef' });
  });

  it('marks the publication owner with viewerRole owner', async () => {
    const entryRelativePath = 'main.ts';
    const manifestDocument = {
      version: 1,
      projectId: 'proj_x',
      entryPath: entryRelativePath,
      files: { [entryRelativePath]: `sha256:${'a'.repeat(64)}` },
      kernels: [],
      runtime: '@taucad/runtime@x',
      parameters: {},
      createdAt: '2020-01-01T00:00:00.000Z',
    };

    const storage = {
      getBlob: vi.fn().mockResolvedValue({
        body: Readable.from([Buffer.from(JSON.stringify(manifestDocument))]),
      }),
      publicUrl: vi.fn(() => 'https://cdn.example/blob'),
    };

    const service = new PublicationsService(
      createDatabaseChainReturning([
        { ...publicationRow, visibility: 'public', ownerSnapshot: { id: 'user_owner', name: 'Owner' } },
      ]),
      storage as unknown as PublicationsServiceDeps[1],
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    const result = await service.getPublicationForViewer({
      publicationId: 'pub_test',
      viewerUserId: publicationRow.ownerId,
    });

    expect(result.viewerRole).toBe('owner');
  });

  it('requires authentication before opening private publications', async () => {
    const service = new PublicationsService(
      createDatabaseChainReturning([
        { ...publicationRow, visibility: 'private', ownerSnapshot: { id: 'user_owner', name: 'Owner' } },
      ]),
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    await expect(service.getPublicationForViewer({ publicationId: 'pub_test' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('marks active email grant viewers with viewerRole grantee', async () => {
    const privatePublication = {
      ...publicationRow,
      visibility: 'private',
      ownerSnapshot: { id: 'user_owner', name: 'Owner' },
    };

    const publicationLimit = vi.fn().mockResolvedValue([privatePublication]);
    const publicationWhere = vi.fn().mockReturnValue({ limit: publicationLimit });
    const publicationFrom = vi.fn().mockReturnValue({ where: publicationWhere });

    const userLimit = vi.fn().mockResolvedValue([{ email: 'Friend@Example.com', emailVerified: true }]);
    const userWhere = vi.fn().mockReturnValue({ limit: userLimit });
    const userFrom = vi.fn().mockReturnValue({ where: userWhere });

    const accessLimit = vi.fn().mockResolvedValue([{ id: 'pva_1' }]);
    const accessWhere = vi.fn().mockReturnValue({ limit: accessLimit });
    const accessFrom = vi.fn().mockReturnValue({ where: accessWhere });

    const select = vi
      .fn()
      .mockReturnValueOnce({ from: publicationFrom })
      .mockReturnValueOnce({ from: userFrom })
      .mockReturnValueOnce({ from: accessFrom });
    const database = { database: { select } } as unknown as PublicationsServiceDeps[0];

    const service = new PublicationsService(
      database,
      createStorageForManifest() as unknown as PublicationsServiceDeps[1],
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    const result = await service.getPublicationForViewer({ publicationId: 'pub_test', viewerUserId: 'user_friend' });

    expect(result.viewerRole).toBe('grantee');
  });

  it('rejects private viewers without an active verified email grant', async () => {
    const privatePublication = {
      ...publicationRow,
      visibility: 'private',
      ownerSnapshot: { id: 'user_owner', name: 'Owner' },
    };

    const publicationLimit = vi.fn().mockResolvedValue([privatePublication]);
    const publicationWhere = vi.fn().mockReturnValue({ limit: publicationLimit });
    const publicationFrom = vi.fn().mockReturnValue({ where: publicationWhere });

    const userLimit = vi.fn().mockResolvedValue([{ email: 'stranger@example.com', emailVerified: true }]);
    const userWhere = vi.fn().mockReturnValue({ limit: userLimit });
    const userFrom = vi.fn().mockReturnValue({ where: userWhere });

    const accessLimit = vi.fn().mockResolvedValue([]);
    const accessWhere = vi.fn().mockReturnValue({ limit: accessLimit });
    const accessFrom = vi.fn().mockReturnValue({ where: accessWhere });

    const select = vi
      .fn()
      .mockReturnValueOnce({ from: publicationFrom })
      .mockReturnValueOnce({ from: userFrom })
      .mockReturnValueOnce({ from: accessFrom });
    const database = { database: { select } } as unknown as PublicationsServiceDeps[0];

    const service = new PublicationsService(
      database,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    await expect(
      service.getPublicationForViewer({ publicationId: 'pub_test', viewerUserId: 'user_stranger' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PublicationsService.updateVisibility', () => {
  const publicationRow = {
    id: 'pub_access',
    projectId: 'proj_x',
    ownerId: 'user_owner',
    visibility: 'private',
    manifestKey: 'm.json',
    ogImageKey: null,
    thumbnailKey: null,
    unpublishedAt: null,
    parentPublicationId: null,
    kernels: ['replicad'],
    entryPath: 'main.ts',
    title: 'T',
    description: null,
    forkCount: 0,
    viewCount: 0,
    ownerSnapshot: { id: 'user_owner', name: 'Owner' },
    createdAt: new Date(),
    runtimePin: '~0.1.0',
  };

  function createServiceWithVisibilityUpdate(args: {
    readonly ownerRows: unknown[];
    readonly updatedRows?: unknown[];
    readonly storage?: PublicationsServiceDeps[1];
  }): {
    readonly service: PublicationsService;
    readonly update: ReturnType<typeof vi.fn>;
    readonly set: ReturnType<typeof vi.fn>;
    readonly storage: PublicationsServiceDeps[1];
  } {
    const ownerLimit = vi.fn().mockResolvedValue(args.ownerRows);
    const ownerWhere = vi.fn().mockReturnValue({ limit: ownerLimit });
    const ownerFrom = vi.fn().mockReturnValue({ where: ownerWhere });
    const select = vi.fn().mockReturnValue({ from: ownerFrom });

    const returning = vi.fn().mockResolvedValue(args.updatedRows ?? [{ id: 'pub_access', visibility: 'public' }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    const storage = args.storage ?? createManifestStorageStub();

    const service = new PublicationsService(
      { database: { select, update } } as unknown as PublicationsServiceDeps[0],
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    return { service, update, set, storage };
  }

  it('switches private publications to public without mutating access grants', async () => {
    const { service, update, set } = createServiceWithVisibilityUpdate({
      ownerRows: [publicationRow],
      updatedRows: [{ id: 'pub_access', visibility: 'public' }],
    });

    const result = await service.updateVisibility({
      publicationId: 'pub_access',
      ownerId: 'user_owner',
      visibility: 'public',
    });

    expect(result).toEqual({ id: 'pub_access', visibility: 'public' });
    expect(update).toHaveBeenCalledWith(schema.publication);
    expect(update).not.toHaveBeenCalledWith(schema.publicationAccess);
    expect(set).toHaveBeenCalledWith({ visibility: 'public' });
  });

  it('switches public publications back to private', async () => {
    const { service } = createServiceWithVisibilityUpdate({
      ownerRows: [{ ...publicationRow, visibility: 'public' }],
      updatedRows: [{ id: 'pub_access', visibility: 'private' }],
    });

    await expect(
      service.updateVisibility({
        publicationId: 'pub_access',
        ownerId: 'user_owner',
        visibility: 'private',
      }),
    ).resolves.toEqual({ id: 'pub_access', visibility: 'private' });
  });

  it('returns the current visibility without updating for same-value requests', async () => {
    const { service, update } = createServiceWithVisibilityUpdate({
      ownerRows: [publicationRow],
    });

    await expect(
      service.updateVisibility({
        publicationId: 'pub_access',
        ownerId: 'user_owner',
        visibility: 'private',
      }),
    ).resolves.toEqual({ id: 'pub_access', visibility: 'private' });

    expect(update).not.toHaveBeenCalled();
  });

  it('rejects missing, forbidden, and unpublished publications', async () => {
    await expect(
      createServiceWithVisibilityUpdate({ ownerRows: [] }).service.updateVisibility({
        publicationId: 'pub_missing',
        ownerId: 'user_owner',
        visibility: 'public',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      createServiceWithVisibilityUpdate({
        ownerRows: [{ ...publicationRow, ownerId: 'other_user' }],
      }).service.updateVisibility({
        publicationId: 'pub_access',
        ownerId: 'user_owner',
        visibility: 'public',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      createServiceWithVisibilityUpdate({
        ownerRows: [{ ...publicationRow, unpublishedAt: new Date() }],
      }).service.updateVisibility({
        publicationId: 'pub_access',
        ownerId: 'user_owner',
        visibility: 'public',
      }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  describe('storage tier reconciliation (R7)', () => {
    it('should copy manifest blobs to the public tier with immutable caching before flipping private → public', async () => {
      const { service, update, storage } = createServiceWithVisibilityUpdate({
        ownerRows: [publicationRow],
        updatedRows: [{ id: 'pub_access', visibility: 'public' }],
      });

      await service.updateVisibility({ publicationId: 'pub_access', ownerId: 'user_owner', visibility: 'public' });

      const blobPuts = vi
        .mocked(storage.putBlob)
        .mock.calls.map(([callArgs]) => callArgs)
        .filter((callArgs) => callArgs.namespace === 'blobs');
      expect(blobPuts).toEqual([
        expect.objectContaining({
          tier: 'public',
          cacheControl: 'public, max-age=31536000, immutable',
          ifNoneMatch: '*',
        }),
      ]);
      // Storage reconciliation completes before the DB visibility flip.
      const firstUpdateOrder = update.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY;
      const lastPutOrder = vi.mocked(storage.putBlob).mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY;
      expect(lastPutOrder).toBeLessThan(firstUpdateOrder);
    });

    it('should dual-home blobs into the private tier and delete the public manifest object on public → private', async () => {
      const { service, storage } = createServiceWithVisibilityUpdate({
        ownerRows: [{ ...publicationRow, visibility: 'public' }],
        updatedRows: [{ id: 'pub_access', visibility: 'private' }],
      });

      await service.updateVisibility({ publicationId: 'pub_access', ownerId: 'user_owner', visibility: 'private' });

      const blobPuts = vi
        .mocked(storage.putBlob)
        .mock.calls.map(([callArgs]) => callArgs)
        .filter((callArgs) => callArgs.namespace === 'blobs');
      expect(blobPuts).toEqual([expect.objectContaining({ tier: 'private', cacheControl: 'private, no-cache' })]);

      // The share-link-derivable public manifest key is removed from the anonymous origin.
      expect(vi.mocked(storage.deleteBlob)).toHaveBeenCalledWith({
        namespace: 'derivatives',
        key: 'm.json',
      });
    });

    it('should skip blob copies that already exist in the target tier', async () => {
      const storage = createManifestStorageStub();
      vi.mocked(storage.headBlob).mockImplementation(async (callArgs) =>
        callArgs.namespace === 'blobs' || callArgs.tier === 'private'
          ? { contentType: 'application/octet-stream', size: 1, etag: 'e', cacheControl: '' }
          : undefined,
      );
      const { service } = createServiceWithVisibilityUpdate({
        ownerRows: [publicationRow],
        updatedRows: [{ id: 'pub_access', visibility: 'public' }],
        storage,
      });

      await service.updateVisibility({ publicationId: 'pub_access', ownerId: 'user_owner', visibility: 'public' });

      expect(vi.mocked(storage.putBlob)).not.toHaveBeenCalled();
    });

    it('should keep the current visibility when storage reconciliation fails', async () => {
      const storage = createManifestStorageStub();
      vi.mocked(storage.putBlob).mockRejectedValue(new Error('bucket unavailable'));
      const { service, update } = createServiceWithVisibilityUpdate({
        ownerRows: [publicationRow],
        storage,
      });

      await expect(
        service.updateVisibility({ publicationId: 'pub_access', ownerId: 'user_owner', visibility: 'public' }),
      ).rejects.toThrow('bucket unavailable');

      expect(update).not.toHaveBeenCalled();
    });
  });
});

describe('PublicationsService access grants', () => {
  const publicationRow = {
    id: 'pub_access',
    projectId: 'proj_x',
    ownerId: 'user_owner',
    visibility: 'private',
    manifestKey: 'm.json',
    ogImageKey: null,
    thumbnailKey: null,
    unpublishedAt: null,
    parentPublicationId: null,
    kernels: ['replicad'],
    entryPath: 'main.ts',
    title: 'T',
    description: null,
    forkCount: 0,
    viewCount: 0,
    ownerSnapshot: { id: 'user_owner', name: 'Owner' },
    createdAt: new Date(),
    runtimePin: '~0.1.0',
  };

  const accessRow = {
    id: 'pva_1',
    publicationId: 'pub_access',
    ownerId: 'user_owner',
    recipientEmail: 'friend@example.com',
    status: 'active',
    createdAt: new Date(),
    revokedAt: null,
  };

  it('should list only active access grants', async () => {
    const ownerLimit = vi.fn().mockResolvedValue([publicationRow]);
    const ownerWhere = vi.fn().mockReturnValue({ limit: ownerLimit });
    const ownerFrom = vi.fn().mockReturnValue({ where: ownerWhere });

    const orderBy = vi.fn().mockResolvedValue([accessRow]);
    const accessWhere = vi.fn().mockReturnValue({ orderBy });
    const accessFrom = vi.fn().mockReturnValue({ where: accessWhere });

    const select = vi.fn().mockReturnValueOnce({ from: ownerFrom }).mockReturnValueOnce({ from: accessFrom });
    const database = { database: { select } } as unknown as PublicationsServiceDeps[0];
    const service = new PublicationsService(
      database,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    const result = await service.listAccessGrants({ publicationId: 'pub_access', ownerId: 'user_owner' });

    expect(result.grants).toHaveLength(1);
    expect(result.grants[0]?.recipientEmail).toBe('friend@example.com');
    expect(accessWhere).toHaveBeenCalledTimes(1);
  });

  it('should not send notification when re-adding an already active grant', async () => {
    const ownerLimit = vi.fn().mockResolvedValue([publicationRow]);
    const ownerWhere = vi.fn().mockReturnValue({ limit: ownerLimit });
    const ownerFrom = vi.fn().mockReturnValue({ where: ownerWhere });

    const existingLimit = vi.fn().mockResolvedValue([accessRow]);
    const existingWhere = vi.fn().mockReturnValue({ limit: existingLimit });
    const existingFrom = vi.fn().mockReturnValue({ where: existingWhere });

    const select = vi.fn().mockReturnValueOnce({ from: ownerFrom }).mockReturnValueOnce({ from: existingFrom });
    const returning = vi.fn().mockResolvedValue([accessRow]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const database = { database: { select, insert } } as unknown as PublicationsServiceDeps[0];
    const email = createEmailStub();
    const service = new PublicationsService(
      database,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      email,
    );

    const result = await service.inviteAccess({
      publicationId: 'pub_access',
      ownerId: 'user_owner',
      recipientEmail: ' Friend@Example.com ',
      notifyRecipient: true,
    });

    expect(result.recipientEmail).toBe('friend@example.com');
    expect(email.sendPublicationInvite).not.toHaveBeenCalled();
  });

  it('should send notification with a frontend publication URL when inviting a new grant', async () => {
    const ownerLimit = vi.fn().mockResolvedValue([publicationRow]);
    const ownerWhere = vi.fn().mockReturnValue({ limit: ownerLimit });
    const ownerFrom = vi.fn().mockReturnValue({ where: ownerWhere });

    const existingLimit = vi.fn().mockResolvedValue([]);
    const existingWhere = vi.fn().mockReturnValue({ limit: existingLimit });
    const existingFrom = vi.fn().mockReturnValue({ where: existingWhere });

    const select = vi.fn().mockReturnValueOnce({ from: ownerFrom }).mockReturnValueOnce({ from: existingFrom });
    const returning = vi.fn().mockResolvedValue([accessRow]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const database = { database: { select, insert } } as unknown as PublicationsServiceDeps[0];
    const email = createEmailStub();
    const service = new PublicationsService(
      database,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      email,
    );

    const result = await service.inviteAccess({
      publicationId: 'pub_access',
      ownerId: 'user_owner',
      recipientEmail: ' Friend@Example.com ',
      notifyRecipient: true,
    });

    expect(result.recipientEmail).toBe('friend@example.com');
    expect(email.sendPublicationInvite).toHaveBeenCalledWith({
      recipientEmail: 'friend@example.com',
      ownerName: 'Owner',
      publicationTitle: 'T',
      url: 'http://app/v/pub_access',
    });
  });

  it('should suppress the invite notification and record it when the owner is over the daily cap', async () => {
    const ownerLimit = vi.fn().mockResolvedValue([publicationRow]);
    const ownerWhere = vi.fn().mockReturnValue({ limit: ownerLimit });
    const ownerFrom = vi.fn().mockReturnValue({ where: ownerWhere });

    const existingLimit = vi.fn().mockResolvedValue([]);
    const existingWhere = vi.fn().mockReturnValue({ limit: existingLimit });
    const existingFrom = vi.fn().mockReturnValue({ where: existingWhere });

    const select = vi.fn().mockReturnValueOnce({ from: ownerFrom }).mockReturnValueOnce({ from: existingFrom });
    const returning = vi.fn().mockResolvedValue([accessRow]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const database = { database: { select, insert } } as unknown as PublicationsServiceDeps[0];
    const email = createEmailStub();
    const metrics = createMetricsStub();
    const service = new PublicationsService(
      database,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub({ inviteAllowed: false }),
      metrics,
      email,
    );

    const result = await service.inviteAccess({
      publicationId: 'pub_access',
      ownerId: 'user_owner',
      recipientEmail: 'friend@example.com',
      notifyRecipient: true,
    });

    // The access grant is still created — only the notification is withheld.
    expect(result.recipientEmail).toBe('friend@example.com');
    expect(email.sendPublicationInvite).not.toHaveBeenCalled();
    expect(metrics.publicationInviteEmailsSuppressedTotal.add).toHaveBeenCalledWith(1, {
      trigger: 'invite',
      reason: 'cap_exceeded',
    });
  });

  it('should fail closed and still grant access when the rate limiter is unavailable', async () => {
    const ownerLimit = vi.fn().mockResolvedValue([publicationRow]);
    const ownerWhere = vi.fn().mockReturnValue({ limit: ownerLimit });
    const ownerFrom = vi.fn().mockReturnValue({ where: ownerWhere });

    const existingLimit = vi.fn().mockResolvedValue([]);
    const existingWhere = vi.fn().mockReturnValue({ limit: existingLimit });
    const existingFrom = vi.fn().mockReturnValue({ where: existingWhere });

    const select = vi.fn().mockReturnValueOnce({ from: ownerFrom }).mockReturnValueOnce({ from: existingFrom });
    const returning = vi.fn().mockResolvedValue([accessRow]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const database = { database: { select, insert } } as unknown as PublicationsServiceDeps[0];
    const email = createEmailStub();
    const metrics = createMetricsStub();
    const service = new PublicationsService(
      database,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub({ inviteThrows: true }),
      metrics,
      email,
    );

    const result = await service.inviteAccess({
      publicationId: 'pub_access',
      ownerId: 'user_owner',
      recipientEmail: 'friend@example.com',
      notifyRecipient: true,
    });

    expect(result.recipientEmail).toBe('friend@example.com');
    expect(email.sendPublicationInvite).not.toHaveBeenCalled();
    expect(metrics.publicationInviteEmailsSuppressedTotal.add).toHaveBeenCalledWith(1, {
      trigger: 'invite',
      reason: 'limiter_unavailable',
    });
  });
});

describe('PublicationsService.recordView', () => {
  const basePublicationRow = {
    id: 'pub_view',
    projectId: 'proj_x',
    ownerId: 'user_owner',
    visibility: 'public',
    manifestKey: 'm.json',
    ogImageKey: null,
    thumbnailKey: null,
    unpublishedAt: null,
    parentPublicationId: null,
    kernels: ['replicad'],
    entryPath: 'main.ts',
    title: 'T',
    description: null,
    forkCount: 0,
    viewCount: 0,
    ownerSnapshot: null,
    createdAt: new Date(),
    runtimePin: '~0.1.0',
  };

  function createServiceWith(args: {
    database: PublicationsServiceDeps[0];
    redis?: PublicationsServiceDeps[3];
    rateLimiter?: PublicationsServiceDeps[4];
    metrics?: PublicationsServiceDeps[5];
  }): PublicationsService {
    return new PublicationsService(
      args.database,
      createStorageStub(),
      createConfigStub(),
      args.redis ?? createRedisStub(),
      args.rateLimiter ?? createRateLimiterStub(),
      args.metrics ?? createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );
  }

  it('throws NotFoundException when publication is missing', async () => {
    const service = createServiceWith({ database: createDatabaseChainReturning([]) });

    await expect(
      service.recordView({
        publicationId: 'pub_missing',
        identity: { viewerHash: 'h1' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws GoneException when publication is unpublished', async () => {
    const service = createServiceWith({
      database: createDatabaseChainReturning([{ ...basePublicationRow, unpublishedAt: new Date() }]),
    });

    await expect(
      service.recordView({
        publicationId: 'pub_view',
        identity: { viewerHash: 'h1' },
      }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('short-circuits owner self-view without invoking PFADD or rate limiter', async () => {
    const redis = createRedisStub();
    const rateLimiter = createRateLimiterStub();
    const metrics = createMetricsStub();
    const service = createServiceWith({
      database: createDatabaseChainReturning([basePublicationRow]),
      redis,
      rateLimiter,
      metrics,
    });

    await service.recordView({
      publicationId: 'pub_view',
      identity: { viewerHash: 'h1', sessionUserId: basePublicationRow.ownerId },
    });

    expect(rateLimiter.consumePublicationViewSlot).not.toHaveBeenCalled();
    expect(redis.client.pfadd).not.toHaveBeenCalled();
    expect(metrics.publicationViewsRejectedTotal.add).toHaveBeenCalledWith(1, { reason: 'owner_self_view' });
  });

  it('throws 429 RATE_LIMITED when the per-identity cap is exceeded', async () => {
    const service = createServiceWith({
      database: createDatabaseChainReturning([basePublicationRow]),
      rateLimiter: createRateLimiterStub({ allowed: false }),
    });

    await expect(
      service.recordView({
        publicationId: 'pub_view',
        identity: { viewerHash: 'h1' },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof HttpException)) {
        return false;
      }

      const body: unknown = error.getResponse();
      if (body === null || typeof body !== 'object') {
        return false;
      }

      return error.getStatus() === 429 && 'code' in body && body.code === publicationApiCode.RATE_LIMITED;
    });
  });

  it('increments viewCount only when PFADD reports a new viewer', async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const limit = vi.fn().mockResolvedValue([basePublicationRow]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const database = {
      database: { select, update },
    } as unknown as PublicationsServiceDeps[0];

    const redis = createRedisStub({ pfaddReturns: 1 });
    const metrics = createMetricsStub();

    const service = createServiceWith({ database, redis, metrics });

    await service.recordView({
      publicationId: 'pub_view',
      identity: { viewerHash: 'fresh-viewer' },
    });

    expect(redis.client.pfadd).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(metrics.publicationViewsTotal.add).toHaveBeenCalledWith(1, { deduped: 'unique' });
  });

  it('records duplicate when PFADD returns 0 and skips UPDATE', async () => {
    const update = vi.fn();
    const limit = vi.fn().mockResolvedValue([basePublicationRow]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const database = {
      database: { select, update },
    } as unknown as PublicationsServiceDeps[0];

    const redis = createRedisStub({ pfaddReturns: 0 });
    const metrics = createMetricsStub();

    const service = createServiceWith({ database, redis, metrics });

    await service.recordView({
      publicationId: 'pub_view',
      identity: { viewerHash: 'returning-viewer' },
    });

    expect(update).not.toHaveBeenCalled();
    expect(metrics.publicationViewsTotal.add).toHaveBeenCalledWith(1, { deduped: 'duplicate' });
  });
});

// === Private publication storage tiers ===

describe('PublicationsService.publishFromUpload storage tiers (R2/R8)', () => {
  function createPublishHarness(args?: { readonly transactionRejects?: boolean }): {
    readonly storage: PublicationsServiceDeps[1];
    readonly databaseService: PublicationsServiceDeps[0];
    readonly txInserts: Array<{ table: unknown; payload: Record<string, unknown> }>;
    readonly outerInsert: ReturnType<typeof vi.fn>;
    readonly service: PublicationsService;
  } {
    const txInserts: Array<{ table: unknown; payload: Record<string, unknown> }> = [];

    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          txInserts.push({ table, payload });
          return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    const outerInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const databaseService = {
      database: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: outerInsert,
        transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<void>) => {
          if (args?.transactionRejects === true) {
            throw new Error('transaction failed');
          }

          await callback(tx);
        }),
      },
    } as unknown as PublicationsServiceDeps[0];

    const storage = createStorageStub();
    const service = new PublicationsService(
      databaseService,
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    return { storage, databaseService, txInserts, outerInsert, service };
  }

  const publishArgs = (visibility: 'private' | 'public', files: Map<string, Uint8Array<ArrayBuffer>>) =>
    ({
      ownerId: 'user_1',
      manifest: {
        projectId: 'proj_1',
        projectName: 'Demo',
        entryPath: 'main.ts',
        visibility,
        title: 'Hello',
      },
      files,
    }) as const;

  it('should write private publication blobs and the manifest to the fail-closed private tier', async () => {
    const { storage, service } = createPublishHarness();

    await service.publishFromUpload(publishArgs('private', new Map([['main.ts', encodeUtf8('code')]])));

    const putCalls = vi.mocked(storage.putBlob).mock.calls.map(([callArgs]) => callArgs);
    expect(putCalls.filter((callArgs) => callArgs.namespace === 'blobs')).toEqual([
      expect.objectContaining({ tier: 'private', cacheControl: 'private, no-cache', ifNoneMatch: '*' }),
    ]);
    expect(putCalls.filter((callArgs) => callArgs.namespace === 'derivatives')).toEqual([
      expect.objectContaining({ tier: 'private', cacheControl: 'private, no-cache' }),
    ]);
  });

  it('should keep public publication blobs on the CDN tier while the manifest stays private', async () => {
    const { storage, service } = createPublishHarness();

    await service.publishFromUpload(publishArgs('public', new Map([['main.ts', encodeUtf8('code')]])));

    const putCalls = vi.mocked(storage.putBlob).mock.calls.map(([callArgs]) => callArgs);
    expect(putCalls.filter((callArgs) => callArgs.namespace === 'blobs')).toEqual([
      expect.objectContaining({ tier: 'public', cacheControl: 'public, max-age=31536000, immutable' }),
    ]);
    // The manifest is the path→sha keyring at a share-link-derivable key; it
    // never lands on the anonymous origin regardless of visibility.
    expect(putCalls.filter((callArgs) => callArgs.namespace === 'derivatives')).toEqual([
      expect.objectContaining({ tier: 'private' }),
    ]);
  });

  it('should exclude tau.json and thumbnail.webp from the 200-user-file limit and preserve their bytes', async () => {
    const { storage, service } = createPublishHarness();
    const thumbnail = validWebpSignature();
    const tauManifest = encodeUtf8('{"schemaVersion":1}');
    const files = new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', encodeUtf8('code')]]);
    for (let index = 0; index < 199; index++) {
      files.set(`user-${index}.ts`, encodeUtf8(`file-${index}`));
    }
    files.set('tau.json', tauManifest);
    files.set('thumbnail.webp', thumbnail);

    await service.publishFromUpload(publishArgs('private', files));

    const blobCalls = vi
      .mocked(storage.putBlob)
      .mock.calls.map(([callArgs]) => callArgs)
      .filter((callArgs) => callArgs.namespace === 'blobs');
    expect(blobCalls).toHaveLength(202);
    expect(blobCalls).toContainEqual(
      expect.objectContaining({ body: tauManifest, contentType: 'application/octet-stream' }),
    );
    expect(blobCalls).toContainEqual(expect.objectContaining({ body: thumbnail, contentType: 'image/webp' }));
  });

  it('should repair stale same-key thumbnail metadata without changing bytes', async () => {
    const { storage, service } = createPublishHarness();
    const thumbnail = validWebpSignature();
    vi.mocked(storage.putBlob).mockImplementation(async (args) => ({
      etag: 'etag',
      alreadyExisted: args.contentType === 'image/webp' && args.ifNoneMatch === '*',
    }));
    vi.mocked(storage.headBlob).mockResolvedValue({
      contentType: 'application/octet-stream',
      size: thumbnail.byteLength,
      etag: 'etag',
      cacheControl: 'private, no-cache',
    });

    await service.publishFromUpload(
      publishArgs(
        'private',
        new Map([
          ['main.ts', encodeUtf8('code')],
          ['thumbnail.webp', thumbnail],
        ]),
      ),
    );

    const thumbnailWrites = vi
      .mocked(storage.putBlob)
      .mock.calls.map(([callArgs]) => callArgs)
      .filter((callArgs) => callArgs.namespace === 'blobs' && callArgs.contentType === 'image/webp');
    expect(thumbnailWrites).toHaveLength(2);
    expect(thumbnailWrites[0]?.body).toBe(thumbnail);
    expect(thumbnailWrites[1]?.body).toBe(thumbnail);
    expect(thumbnailWrites[1]).not.toHaveProperty('ifNoneMatch');
  });

  it('should upsert blob refcounts inside the publish transaction, aggregated per sha', async () => {
    const { txInserts, outerInsert, service } = createPublishHarness();

    await service.publishFromUpload(
      publishArgs(
        'public',
        new Map([
          ['main.ts', encodeUtf8('same-bytes')],
          ['copy.ts', encodeUtf8('same-bytes')],
          ['other.ts', encodeUtf8('different-bytes')],
        ]),
      ),
    );

    const refInserts = txInserts.filter((entry) => entry.table === schema.blobRef);
    expect(refInserts).toHaveLength(2);

    const sameSha = sha256HexFromBytes(encodeUtf8('same-bytes'));
    const duplicated = refInserts.find((entry) => entry.payload['sha256'] === sameSha);
    expect(duplicated?.payload).toEqual(
      expect.objectContaining({ refcount: 2, sizeBytes: BigInt(encodeUtf8('same-bytes').byteLength) }),
    );

    const otherSha = sha256HexFromBytes(encodeUtf8('different-bytes'));
    const single = refInserts.find((entry) => entry.payload['sha256'] === otherSha);
    expect(single?.payload).toEqual(expect.objectContaining({ refcount: 1 }));

    // No refcount writes bypass the transaction.
    expect(outerInsert).not.toHaveBeenCalled();
  });

  it('should reject the publish and issue no out-of-transaction refcount writes when the transaction fails', async () => {
    const { outerInsert, service } = createPublishHarness({ transactionRejects: true });

    await expect(
      service.publishFromUpload(publishArgs('public', new Map([['main.ts', encodeUtf8('code')]]))),
    ).rejects.toThrow('transaction failed');

    expect(outerInsert).not.toHaveBeenCalled();
  });
});

// === Publication file proxy resolution ===

describe('PublicationsService.resolvePublicationFile (R3)', () => {
  const privateRow = {
    id: 'pub_test',
    projectId: 'proj_x',
    ownerId: 'user_owner',
    visibility: 'private',
    manifestKey: 'm.json',
    ogImageKey: null,
    thumbnailKey: null,
    unpublishedAt: null,
    parentPublicationId: null,
    kernels: ['replicad'],
    entryPath: 'main.ts',
    title: 'T',
    description: null,
    forkCount: 0,
    viewCount: 0,
    ownerSnapshot: { id: 'user_owner', name: 'Owner' },
    createdAt: new Date(),
    runtimePin: '~0.1.0',
  };

  function createFileService(args: {
    readonly database: PublicationsServiceDeps[0];
    readonly storage?: PublicationsServiceDeps[1];
  }): { readonly service: PublicationsService; readonly storage: PublicationsServiceDeps[1] } {
    const storage = args.storage ?? createManifestStorageStub();
    const service = new PublicationsService(
      args.database,
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );
    return { service, storage };
  }

  function createGranteeDatabase(args: { readonly accessRows: unknown[] }): PublicationsServiceDeps[0] {
    const publicationLimit = vi.fn().mockResolvedValue([privateRow]);
    const publicationFrom = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: publicationLimit }) });

    const userLimit = vi.fn().mockResolvedValue([{ email: 'friend@example.com', emailVerified: true }]);
    const userFrom = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: userLimit }) });

    const accessLimit = vi.fn().mockResolvedValue(args.accessRows);
    const accessFrom = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: accessLimit }) });

    const select = vi
      .fn()
      .mockReturnValueOnce({ from: publicationFrom })
      .mockReturnValueOnce({ from: userFrom })
      .mockReturnValueOnce({ from: accessFrom });

    return { database: { select } } as unknown as PublicationsServiceDeps[0];
  }

  it('should resolve the manifest sha as a strong quoted ETag for the owner', async () => {
    const { service } = createFileService({ database: createDatabaseChainReturning([privateRow]) });

    const resolved = await service.resolvePublicationFile({
      publicationId: 'pub_test',
      viewerUserId: 'user_owner',
      path: 'main.ts',
    });

    expect(resolved).toEqual({ sha256Hex: testManifestSha, etag: `"${testManifestSha}"`, path: 'main.ts' });
  });

  it('should resolve for an active email grantee', async () => {
    const { service } = createFileService({ database: createGranteeDatabase({ accessRows: [{ id: 'pva_1' }] }) });

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_friend', path: 'main.ts' }),
    ).resolves.toEqual({ sha256Hex: testManifestSha, etag: `"${testManifestSha}"`, path: 'main.ts' });
  });

  it('should reject anonymous private requests with 401 before touching storage', async () => {
    const { service, storage } = createFileService({ database: createDatabaseChainReturning([privateRow]) });

    await expect(service.resolvePublicationFile({ publicationId: 'pub_test', path: 'main.ts' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(vi.mocked(storage.getBlob)).not.toHaveBeenCalled();
  });

  it('should reject viewers without an active grant with 403 (revocation is immediate)', async () => {
    const { service } = createFileService({ database: createGranteeDatabase({ accessRows: [] }) });

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_revoked', path: 'main.ts' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should return 404 for a path outside the publication manifest (no cross-publication re-scoping)', async () => {
    const { service } = createFileService({ database: createDatabaseChainReturning([privateRow]) });

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: 'stolen.ts' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject an empty path with INVALID_PATH', async () => {
    const { service } = createFileService({ database: createDatabaseChainReturning([privateRow]) });

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: '' }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.INVALID_PATH));
  });

  it('should return 410 for unpublished publications', async () => {
    const { service } = createFileService({
      database: createDatabaseChainReturning([{ ...privateRow, unpublishedAt: new Date() }]),
    });

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: 'main.ts' }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('should serve public publications to anonymous viewers through the proxy too', async () => {
    const { service } = createFileService({
      database: createDatabaseChainReturning([{ ...privateRow, visibility: 'public' }]),
    });

    await expect(service.resolvePublicationFile({ publicationId: 'pub_test', path: 'main.ts' })).resolves.toEqual({
      sha256Hex: testManifestSha,
      etag: `"${testManifestSha}"`,
      path: 'main.ts',
    });
  });

  it('should normalize ./-prefixed request paths against manifest keys', async () => {
    const { service } = createFileService({ database: createDatabaseChainReturning([privateRow]) });

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: './main.ts' }),
    ).resolves.toEqual({ sha256Hex: testManifestSha, etag: `"${testManifestSha}"`, path: 'main.ts' });
  });

  it('should serve repeat resolutions from the manifest cache without re-reading storage', async () => {
    const { service, storage } = createFileService({ database: createDatabaseChainReturning([privateRow]) });

    await service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: 'main.ts' });
    await service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: 'main.ts' });

    expect(vi.mocked(storage.getBlob)).toHaveBeenCalledTimes(1);
  });
});

describe('PublicationsService.openPublicationFile (R3)', () => {
  it('should stream from the private tier first and fall back to the public bucket for legacy blobs', async () => {
    const storage = createStorageStub();
    vi.mocked(storage.getBlob)
      .mockRejectedValueOnce({ name: 'NoSuchKey' })
      .mockResolvedValueOnce({
        body: Readable.from([Buffer.from('legacy-bytes')]),
        contentType: 'application/octet-stream',
        etag: 'e',
        contentLength: 12,
      });

    const service = new PublicationsService(
      {} as unknown as PublicationsServiceDeps[0],
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    const sha = 'f'.repeat(64);
    const opened = await service.openPublicationFile(sha, 'main.ts');

    expect(opened.contentLength).toBe(12);
    expect(vi.mocked(storage.getBlob)).toHaveBeenNthCalledWith(1, {
      namespace: 'blobs',
      key: blobKeyFromSha256Hex(sha),
      tier: 'private',
    });
    expect(vi.mocked(storage.getBlob)).toHaveBeenNthCalledWith(2, {
      namespace: 'blobs',
      key: blobKeyFromSha256Hex(sha),
    });
  });

  it('should propagate non-missing storage errors without falling back', async () => {
    const storage = createStorageStub();
    vi.mocked(storage.getBlob).mockRejectedValue(Object.assign(new Error('denied'), { name: 'AccessDenied' }));

    const service = new PublicationsService(
      {} as unknown as PublicationsServiceDeps[0],
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    await expect(service.openPublicationFile('f'.repeat(64), 'main.ts')).rejects.toThrow('denied');
    expect(vi.mocked(storage.getBlob)).toHaveBeenCalledTimes(1);
  });

  it('should sniff legacy canonical thumbnails with stale object metadata', async () => {
    const storage = createStorageStub();
    const thumbnail = validWebpSignature();
    vi.mocked(storage.getBlob).mockResolvedValue({
      body: Readable.from([thumbnail]),
      contentType: 'application/octet-stream',
      etag: 'e',
      contentLength: thumbnail.byteLength,
    });
    const service = new PublicationsService(
      {} as unknown as PublicationsServiceDeps[0],
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    const opened = await service.openPublicationFile('f'.repeat(64), 'thumbnail.webp');

    expect(opened.contentType).toBe('image/webp');
    expect(opened.contentLength).toBe(thumbnail.byteLength);
  });
});

// === Tier-aware viewer URLs and wire hardening ===

describe('PublicationsService.getPublicationForViewer tiered file URLs (R4/R6)', () => {
  const baseRow = {
    id: 'pub_test',
    projectId: 'proj_x',
    ownerId: 'user_owner',
    visibility: 'private',
    manifestKey: 'm.json',
    ogImageKey: null,
    thumbnailKey: null,
    unpublishedAt: null,
    parentPublicationId: null,
    kernels: ['replicad'],
    entryPath: 'main.ts',
    title: 'T',
    description: null,
    forkCount: 0,
    viewCount: 0,
    ownerSnapshot: { id: 'user_owner', name: 'Owner' },
    createdAt: new Date(),
    runtimePin: '~0.1.0',
  };

  function createViewerService(args: {
    readonly row: Record<string, unknown>;
    readonly manifestFiles?: Record<string, string>;
  }): { readonly service: PublicationsService; readonly storage: PublicationsServiceDeps[1] } {
    const storage = createStorageStub();
    const manifestDocument = {
      ...testManifestDocument,
      files: args.manifestFiles ?? testManifestDocument.files,
    };
    vi.mocked(storage.getBlob).mockImplementation(async () => ({
      body: Readable.from([Buffer.from(JSON.stringify(manifestDocument))]),
      contentType: 'application/json',
      etag: 'etag',
    }));

    const service = new PublicationsService(
      createDatabaseChainReturning([args.row]),
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
    );

    return { service, storage };
  }

  it('should emit authenticated proxy URLs with encoded paths for private publication files', async () => {
    const { service, storage } = createViewerService({
      row: baseRow,
      /* eslint-disable @typescript-eslint/naming-convention -- file-path keys can't be camelCase */
      manifestFiles: {
        'main.ts': `sha256:${testManifestSha}`,
        'src/deep file.ts': `sha256:${'b'.repeat(64)}`,
      },
      /* eslint-enable @typescript-eslint/naming-convention -- end file-path window */
    });

    const result = await service.getPublicationForViewer({ publicationId: 'pub_test', viewerUserId: 'user_owner' });

    expect(result.files['main.ts']).toBe('http://api.test/v1/publications/pub_test/files?path=main.ts');
    expect(result.files['src/deep file.ts']).toBe(
      'http://api.test/v1/publications/pub_test/files?path=src%2Fdeep%20file.ts',
    );
    // No unsigned blob URL is ever emitted for private bytes.
    expect(vi.mocked(storage.publicUrl)).not.toHaveBeenCalledWith(expect.objectContaining({ namespace: 'blobs' }));
  });

  it('should keep direct CDN URLs for public publication files', async () => {
    const { service, storage } = createViewerService({ row: { ...baseRow, visibility: 'public' } });

    const result = await service.getPublicationForViewer({ publicationId: 'pub_test' });

    expect(result.files['main.ts']).toBe('https://example.invalid/public');
    expect(vi.mocked(storage.publicUrl)).toHaveBeenCalledWith({
      namespace: 'blobs',
      key: blobKeyFromSha256Hex(testManifestSha),
    });
  });

  it('should expose neither raw storage keys nor a manifest URL on the wire', async () => {
    const { service } = createViewerService({ row: baseRow });

    const result = await service.getPublicationForViewer({ publicationId: 'pub_test', viewerUserId: 'user_owner' });

    expect(result.publication).not.toHaveProperty('manifestKey');
    expect(result.publication).not.toHaveProperty('ogImageKey');
    expect(result.publication).not.toHaveProperty('thumbnailKey');
    expect(result.urls).not.toHaveProperty('manifest');
  });

  it('should read the manifest from the private tier before falling back to the public bucket', async () => {
    const { service, storage } = createViewerService({ row: baseRow });

    await service.getPublicationForViewer({ publicationId: 'pub_test', viewerUserId: 'user_owner' });

    expect(vi.mocked(storage.getBlob)).toHaveBeenCalledWith({
      namespace: 'derivatives',
      key: 'm.json',
      tier: 'private',
    });
  });
});

describe('PublicationsService private-visibility entitlement gate (T4/T16)', () => {
  const privateManifest = {
    projectId: 'proj_gate',
    entryPath: 'main.ts',
    title: 'Gate test',
    visibility: 'private',
  } as unknown as Parameters<PublicationsService['publishFromUpload']>[0]['manifest'];

  const files = new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', new Uint8Array([1])]]);

  function createGateDatabase(parentRows: unknown[]): PublicationsServiceDeps[0] {
    const limit = vi.fn().mockResolvedValue(parentRows);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin, where });
    const select = vi.fn().mockReturnValue({ from });
    return { database: { select } } as unknown as PublicationsServiceDeps[0];
  }

  function createGateService(args: { entitled: boolean; parentRows: unknown[] }): PublicationsService {
    return new PublicationsService(
      createGateDatabase(args.parentRows),
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub({ canCreatePrivateShares: args.entitled }),
    );
  }

  it('rejects a private publish from a free-tier user with ENTITLEMENT_REQUIRED', async () => {
    const service = createGateService({ entitled: false, parentRows: [] });

    const publishAttempt = service.publishFromUpload({ ownerId: 'user_free', manifest: privateManifest, files });

    await expect(publishAttempt).rejects.toThrowError(ForbiddenException);
    await expect(publishAttempt).rejects.toMatchObject({
      response: { code: publicationApiCode.ENTITLEMENT_REQUIRED },
    });
  });

  it('allows a grandfathered content-only republish when the current publication is already private (T16)', async () => {
    const service = createGateService({ entitled: false, parentRows: [{ visibility: 'private' }] });

    // The gate passes and the publish proceeds until it needs the real config
    // plumbing — anything other than ENTITLEMENT_REQUIRED proves the gate opened.
    await expect(
      service.publishFromUpload({ ownerId: 'user_free', manifest: privateManifest, files }),
    ).rejects.not.toMatchObject({ response: { code: publicationApiCode.ENTITLEMENT_REQUIRED } });
  });

  it('allows private publishes for entitled users without consulting grandfather state', async () => {
    const database = createGateDatabase([]);
    const service = new PublicationsService(
      database,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub({ canCreatePrivateShares: true }),
    );

    await expect(
      service.publishFromUpload({ ownerId: 'user_pro', manifest: privateManifest, files }),
    ).rejects.not.toMatchObject({ response: { code: publicationApiCode.ENTITLEMENT_REQUIRED } });
  });
});
