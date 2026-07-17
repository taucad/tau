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
import * as schema from '#database/schema.js';

type PublicationsServiceDeps = ConstructorParameters<typeof PublicationsService>;

function createStubService(): PublicationsService {
  return new PublicationsService(
    {} as unknown as PublicationsServiceDeps[0],
    {} as unknown as PublicationsServiceDeps[1],
    {} as unknown as PublicationsServiceDeps[2],
    {} as unknown as PublicationsServiceDeps[3],
    {} as unknown as PublicationsServiceDeps[4],
    {} as unknown as PublicationsServiceDeps[5],
    {} as unknown as PublicationsServiceDeps[6],
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
  };

  return storage as PublicationsServiceDeps[1];
}

function createConfigStub(): PublicationsServiceDeps[2] {
  return {
    get: vi.fn((key: string) => {
      if (key === 'TAU_FRONTEND_URL') {
        return 'http://app/';
      }

      return '';
    }),
  } as unknown as PublicationsServiceDeps[2];
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

describe('PublicationsService.publishFromUpload validation', () => {
  it('should reject when entry file is missing from upload map', async () => {
    const service = createStubService();

    await expect(
      service.publishFromUpload({
        ownerId: 'user_1',
        manifest: {
          projectId: 'proj_1',
          projectName: 'Demo',
          entryFile: 'main.ts',
          visibility: 'private',
          title: 'Hello',
        },
        files: new Map([['other.ts', encodeUtf8('// noop')]]),
      }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.MISSING_ENTRY_FILE));
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
          entryFile: 'main.ts',
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
          entryFile: 'main.ts',
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
          entryFile: 'main.ts',
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
          entryFile: 'main.ts',
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
          entryFile: 'main.ts',
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
    );

    await service.publishFromUpload({
      ownerId: 'user_1',
      manifest: {
        projectId: 'proj_1',
        projectName: 'Demo',
        entryFile: 'main.ts',
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
        values: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          if (table === schema.publicationAccess) {
            accessPayloads.push(payload);
            return {
              onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            };
          }

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
    );

    const result = await service.publishFromUpload({
      ownerId: 'user_1',
      manifest: {
        projectId: 'proj_1',
        projectName: 'Demo',
        entryFile: 'main.ts',
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
    );

    const result = await service.publishFromUpload({
      ownerId: 'user_1',
      manifest: {
        projectId: 'proj_1',
        projectName: 'Demo',
        entryFile: 'main.ts',
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
          entryFile: 'main.ts',
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
    entryFile: 'main.ts',
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
      entryFile: entryRelativePath,
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
      entryFile: entryRelativePath,
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
    );

    const result = await service.getPublicationForViewer({ publicationId: 'pub_test' });

    expect(publicationRowSchema.safeParse(result.publication).success).toBe(true);
    expect(result.viewerRole).toBe('public');
    expect(typeof result.publication.createdAt).toBe('string');
    expect(result.publication.unpublishedAt).toBeNull();
  });

  it('marks the publication owner with viewerRole owner', async () => {
    const entryRelativePath = 'main.ts';
    const manifestDocument = {
      version: 1,
      projectId: 'proj_x',
      entryFile: entryRelativePath,
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
    entryFile: 'main.ts',
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
  }): {
    readonly service: PublicationsService;
    readonly update: ReturnType<typeof vi.fn>;
    readonly set: ReturnType<typeof vi.fn>;
  } {
    const ownerLimit = vi.fn().mockResolvedValue(args.ownerRows);
    const ownerWhere = vi.fn().mockReturnValue({ limit: ownerLimit });
    const ownerFrom = vi.fn().mockReturnValue({ where: ownerWhere });
    const select = vi.fn().mockReturnValue({ from: ownerFrom });

    const returning = vi.fn().mockResolvedValue(args.updatedRows ?? [{ id: 'pub_access', visibility: 'public' }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    const service = new PublicationsService(
      { database: { select, update } } as unknown as PublicationsServiceDeps[0],
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
    );

    return { service, update, set };
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
    entryFile: 'main.ts',
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
    entryFile: 'main.ts',
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
