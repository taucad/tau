import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
import {
  isPublishableTreePath,
  parseLfsPointer,
  readPublishedTree,
} from '#api/publications/publication-materializer.js';
import type { MaterializerDependencies } from '#api/publications/publication-materializer.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import type { ObjectStorageServiceContract } from '#storage/object-storage.service.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';
import * as schema from '#database/schema.js';

type PublicationsServiceDeps = ConstructorParameters<typeof PublicationsService>;

/**
 * A real repository holding one named version of the given files.
 *
 * Publishing reads the tagged tree out of git now, so the fixture is a git
 * repository rather than an upload map — every path rule, size rule and LFS
 * pointer this suite exercises is exercised against the bytes git hands back.
 * Written under `mktemp`, never inside this workspace.
 */
function seedRepository(files: Map<string, Uint8Array<ArrayBuffer>>, tag = 'v1'): string {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'tau-publication-'));
  const git = (...args: readonly string[]): void => {
    const result = spawnSync('git', ['-c', 'user.name=Tau', '-c', 'user.email=tau@test.invalid', ...args], {
      cwd: repositoryPath,
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr)}`);
    }
  };
  git('init', '--initial-branch=main', '.');
  for (const [relativePath, bytes] of files) {
    mkdirSync(dirname(join(repositoryPath, relativePath)), { recursive: true });
    writeFileSync(join(repositoryPath, relativePath), bytes);
  }
  git('add', '-A');
  git('commit', '-m', 'seed');
  git('tag', '-a', tag, '-m', 'named');
  return repositoryPath;
}

/** The revision a seeded name points at, as the server resolves it (R6). */
function seededRevision(repositoryPath: string, tag = 'v1'): string {
  const result = spawnSync('git', ['rev-parse', `refs/tags/${tag}^{commit}`], { cwd: repositoryPath });
  if (result.status !== 0) {
    throw new Error(`git rev-parse ${tag} failed: ${String(result.stderr)}`);
  }
  return result.stdout.toString('utf8').trim();
}

/** The git side of publishing: where this project's pushes landed. */
function createGitStub(repositoryPath: string): PublicationsServiceDeps[8] {
  return {
    ensureRepository: vi.fn(async () => repositoryPath),
    /* The publish path reads the tagged tree through the git service's runner,
       so the stub runs real `git` in the seeded repository rather than faking
       what `ls-tree` would have said (review R8 moved the runner here). */
    run: vi.fn(async (args: readonly string[], cwd: string, stdin?: string) => realGit(cwd, args, stdin)),
  } as unknown as PublicationsServiceDeps[8];
}

/**
 * The database a publish writes through, with the statements it makes recorded.
 *
 * Two selects (the project, then any publication already on this name), then
 * one transaction that upserts the project, the publication, its reference
 * counts and any access grants.
 */
function createPublishDatabase(args?: {
  readonly transactionRejects?: boolean;
  readonly projectRows?: unknown[];
  readonly existingRows?: unknown[];
}): {
  readonly databaseService: PublicationsServiceDeps[0];
  readonly txInserts: Array<{ table: unknown; payload: Record<string, unknown> }>;
  readonly outerInsert: ReturnType<typeof vi.fn>;
} {
  const txInserts: Array<{ table: unknown; payload: Record<string, unknown> }> = [];
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
    }),
    insert: vi.fn().mockImplementation((table: unknown) => ({
      values: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        txInserts.push({ table, payload });
        return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
  };

  const outerInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }),
  });

  const databaseService = {
    database: {
      /* Three reads, in order: the owner snapshot, the project mirror, then any
         publication already on this name. Sequenced rather than shared, because
         the last read is what decides create-versus-re-point. */
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(args?.projectRows ?? []) }),
          }),
        })
        .mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(args?.existingRows ?? []) }),
          }),
        }),
      insert: outerInsert,
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<void>) => {
        if (args?.transactionRejects === true) {
          throw new Error('transaction failed');
        }
        await callback(tx);
      }),
    },
  } as unknown as PublicationsServiceDeps[0];

  return { databaseService, txInserts, outerInsert };
}

/** The pointer a publish request carries, with the fixture's own defaults. */
/**
 * The pointer a dialog sends, for a repository this suite seeded.
 *
 * `revisionId` is read from the repository rather than invented, because the
 * service now refuses a claim that does not match the name's target (R6).
 *
 * @param repositoryPath - The seeded repository, when the row publishes one.
 * @param overrides - Fields this row cares about.
 * @returns The request body.
 */
function publishRequest(
  repositoryPath?: string,
  overrides: Partial<Parameters<PublicationsService['publishFromRevision']>[0]['request']> = {},
): Parameters<PublicationsService['publishFromRevision']>[0]['request'] {
  const tag = overrides.tag ?? 'v1';
  return {
    projectId: 'proj_1',
    projectName: 'Demo',
    tag,
    revisionId: repositoryPath === undefined ? 'b'.repeat(40) : seededRevision(repositoryPath, tag),
    entryPath: 'main.ts',
    visibility: 'private',
    title: 'Hello',
    ...overrides,
  };
}

/**
 * Billing stub defaulting to a Pro projection so pre-existing private-flow
 * tests exercise the storage/DB behaviour, not the entitlement gate; gate
 * tests pass `canCreatePrivateShares: false` explicitly.
 */
function createBillingStub(args?: {
  canCreatePrivateShares?: boolean;
  canSyncFiles?: boolean;
}): PublicationsServiceDeps[7] {
  return {
    getEntitlements: vi.fn().mockResolvedValue({
      canCreatePrivateShares: args?.canCreatePrivateShares ?? true,
      /* Publishing a named version presupposes the push that created it, so
         `publishFromRevision` refuses without the sync entitlement before it
         reaches `ensureRepository` (N5's second route, review C11). */
      canSyncFiles: args?.canSyncFiles ?? true,
    }),
  } as unknown as PublicationsServiceDeps[7];
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
    createGitStub(''),
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
    createMultipartUpload: vi.fn(async () => 'upload-id'),
    presignUploadPart: vi.fn(async () => 'https://example.invalid/part'),
    completeMultipartUpload: vi.fn(async () => undefined),
    abortMultipartUpload: vi.fn(async () => undefined),
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

/**
 * The runner the API passes in, as a plain `spawnSync` so the suite exercises
 * real `git` output rather than a stub of it.
 *
 * @param repositoryPath - Where the child runs.
 * @param args - Arguments after `git`.
 * @param stdin - Written to the child, when given.
 * @returns The child's stdout.
 */
const realGit: MaterializerDependencies['git'] = async (repositoryPath, args, stdin) => {
  const result = spawnSync('git', [...args], { cwd: repositoryPath, ...(stdin === undefined ? {} : { input: stdin }) });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${String(result.status)}`);
  }
  return new Uint8Array(result.stdout);
};

function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

function allocZeros(byteLength: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(byteLength);
}

function validWebpSignature(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
}

describe('publication tree rules', () => {
  it('publishes nothing the project keeps to itself', () => {
    expect(isPublishableTreePath('main.ts')).toBe(true);
    expect(isPublishableTreePath('.tau/parameters/main.ts.json')).toBe(true);
    expect(isPublishableTreePath('node_modules/evil/index.js')).toBe(false);
    expect(isPublishableTreePath('src/node_modules/evil.js')).toBe(false);
    expect(isPublishableTreePath('.tau/artifacts/cache.glb')).toBe(false);
    expect(isPublishableTreePath('.tau/transcripts/chat_x.json')).toBe(false);
    expect(isPublishableTreePath('../escape.ts')).toBe(false);
    expect(isPublishableTreePath('')).toBe(false);
  });

  it('reads a named version out of git, skipping what a viewer never sees', async () => {
    const repositoryPath = seedRepository(
      new Map([
        ['main.ts', encodeUtf8('export default () => {}')],
        ['.tau/parameters/main.ts.json', encodeUtf8('{}')],
        ['.tau/artifacts/cache.glb', allocZeros(4)],
        ['node_modules/evil/index.js', encodeUtf8('//')],
      ]),
    );

    const files = await readPublishedTree(
      { databaseService: {} as unknown as PublicationsServiceDeps[0], storage: createStorageStub(), git: realGit },
      { repositoryPath, projectId: 'proj_1', tag: 'v1' },
    );

    expect([...files.keys()].sort()).toEqual(['.tau/parameters/main.ts.json', 'main.ts']);
    expect(files.get('main.ts')).toStrictEqual(encodeUtf8('export default () => {}'));
  });

  it('refuses a named version with more user files than a publication may hold', async () => {
    const files = new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', encodeUtf8('code')]]);
    for (let index = 0; index < 201; index++) {
      files.set(`f${String(index)}.ts`, encodeUtf8(`// ${String(index)}`));
    }
    const repositoryPath = seedRepository(files);

    await expect(
      readPublishedTree(
        { databaseService: {} as unknown as PublicationsServiceDeps[0], storage: createStorageStub(), git: realGit },
        { repositoryPath, projectId: 'proj_1', tag: 'v1' },
      ),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.TOO_MANY_FILES));
  });

  it('refuses a name the project does not have', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));

    await expect(
      readPublishedTree(
        { databaseService: {} as unknown as PublicationsServiceDeps[0], storage: createStorageStub(), git: realGit },
        { repositoryPath, projectId: 'proj_1', tag: 'v9' },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('resolves a large file from the object store the push uploaded it to', async () => {
    const stepBytes = encodeUtf8('ISO-10303-21;\nHEADER;\n');
    const oid = sha256HexFromBytes(stepBytes);
    const pointer = encodeUtf8(
      `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(stepBytes.byteLength)}\n`,
    );
    expect(parseLfsPointer(pointer)).toStrictEqual({ oid, size: stepBytes.byteLength });

    const repositoryPath = seedRepository(
      new Map([
        ['main.ts', encodeUtf8('code')],
        ['part.step', pointer],
      ]),
    );
    const storage = createStorageStub();
    vi.mocked(storage.getBlob).mockImplementation(async () => ({
      body: Readable.from([Buffer.from(stepBytes)]),
      contentType: 'application/octet-stream',
      etag: 'etag',
    }));

    const files = await readPublishedTree(
      { databaseService: {} as unknown as PublicationsServiceDeps[0], storage, git: realGit },
      { repositoryPath, projectId: 'proj_1', tag: 'v1' },
    );

    expect(files.get('part.step')).toStrictEqual(stepBytes);
    expect(vi.mocked(storage.getBlob).mock.calls[0]?.[0]).toMatchObject({
      namespace: 'blobs',
      key: gitLfsObjectKey('proj_1', oid),
      tier: 'private',
    });
  });

  it('treats a blob that merely looks like text as bytes', () => {
    expect(parseLfsPointer(encodeUtf8('version https://git-lfs.github.com/spec/v1\n'))).toBeUndefined();
    expect(parseLfsPointer(allocZeros(2048))).toBeUndefined();
  });
});

describe('PublicationsService.publishFromRevision', () => {
  it('should include .tau/parameters overrides in the manifest files map', async () => {
    let capturedManifest: Record<string, unknown> | undefined;

    const storage = createStorageStub();
    vi.mocked(storage.putBlob).mockImplementation(async (args) => {
      if (args.namespace === 'derivatives') {
        capturedManifest = JSON.parse(new TextDecoder().decode(args.body)) as Record<string, unknown>;
      }
      return { etag: 'etag', alreadyExisted: false };
    });

    const repositoryPath = seedRepository(
      new Map([
        ['main.ts', encodeUtf8('export default () => {}')],
        ['.tau/parameters/main.ts.json', encodeUtf8('{}')],
      ]),
    );

    const service = new PublicationsService(
      createPublishDatabase().databaseService,
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      createGitStub(repositoryPath),
    );

    await service.publishFromRevision({ ownerId: 'user_1', request: publishRequest(repositoryPath) });

    expect(capturedManifest).toBeDefined();
    const filesField = capturedManifest?.['files'] as Record<string, string> | undefined;
    expect(filesField?.['main.ts']).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(filesField?.['.tau/parameters/main.ts.json']).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('should create initial private access grants and notify recipients with frontend links', async () => {
    const email = createEmailStub();
    const { databaseService, txInserts } = createPublishDatabase();
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));

    const service = new PublicationsService(
      databaseService,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      email,
      createBillingStub(),
      createGitStub(repositoryPath),
    );

    const result = await service.publishFromRevision({
      ownerId: 'user_1',
      request: publishRequest(repositoryPath, {
        sharedEmails: ['friend@example.com'],
        notifyRecipients: true,
      }),
    });

    const accessPayloads = txInserts
      .filter((entry) => entry.table === schema.publicationAccess)
      .flatMap((entry) => (Array.isArray(entry.payload) ? entry.payload : [entry.payload]));
    expect(accessPayloads).toHaveLength(1);
    expect(accessPayloads[0]).toMatchObject({ recipientEmail: 'friend@example.com', status: 'active' });
    expect(vi.mocked(email.sendPublicationInvite)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(email.sendPublicationInvite).mock.calls[0]?.[0]).toMatchObject({ url: result.urls.share });
  });

  it('should still publish successfully when the owner is over the invite-email cap', async () => {
    const email = createEmailStub();
    const { databaseService } = createPublishDatabase();
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));

    const service = new PublicationsService(
      databaseService,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub({ inviteAllowed: false }),
      createMetricsStub(),
      email,
      createBillingStub(),
      createGitStub(repositoryPath),
    );

    const result = await service.publishFromRevision({
      ownerId: 'user_1',
      request: publishRequest(repositoryPath, { sharedEmails: ['friend@example.com'], notifyRecipients: true }),
    });

    expect(result.id).toMatch(/^pub_/u);
    expect(vi.mocked(email.sendPublicationInvite)).not.toHaveBeenCalled();
  });

  it('should refuse a named version larger than a publication may be', async () => {
    const repositoryPath = seedRepository(
      new Map([
        ['main.ts', encodeUtf8('code')],
        ['big-a.bin', allocZeros(20 * 1024 * 1024)],
        ['big-b.bin', allocZeros(20 * 1024 * 1024)],
        ['big-c.bin', allocZeros(20 * 1024 * 1024)],
      ]),
    );
    const { databaseService } = createPublishDatabase();

    const service = new PublicationsService(
      databaseService,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      createGitStub(repositoryPath),
    );

    await expect(
      service.publishFromRevision({
        ownerId: 'user_1',
        request: publishRequest(repositoryPath, { visibility: 'public' }),
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
            tag: 'v1',
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
        tag: 'v1',
        title: 'Shared tray',
        description: 'Shared description',
        visibility: 'private',
        createdAt: createdAt.toISOString(),
        urls: { share: 'http://app/s/tau~pub_current' },
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
    tag: 'v1',
    revisionId: 'a'.repeat(40),
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
      createGitStub(''),
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
      createGitStub(''),
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
      createGitStub(''),
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
      createGitStub(''),
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
      createGitStub(''),
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
      createGitStub(''),
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
      createGitStub(''),
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
    tag: 'v1',
    revisionId: 'a'.repeat(40),
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
      createGitStub(''),
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

    it('should dual-home blobs into the private tier on public → private', async () => {
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

      /* A manifest is written to the private tier whatever the visibility, so
         there is no anonymous-origin copy to delete any more (review R9). */
      expect(vi.mocked(storage.deleteBlob)).not.toHaveBeenCalled();
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
    tag: 'v1',
    revisionId: 'a'.repeat(40),
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
      createGitStub(''),
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
      createBillingStub(),
      createGitStub(''),
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
      createBillingStub(),
      createGitStub(''),
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
      url: 'http://app/s/tau~pub_access',
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
      createBillingStub(),
      createGitStub(''),
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
      createBillingStub(),
      createGitStub(''),
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
    tag: 'v1',
    revisionId: 'a'.repeat(40),
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
      createGitStub(''),
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

describe('PublicationsService.publishFromRevision storage tiers (R2/R8)', () => {
  function createPublishHarness(args?: {
    readonly transactionRejects?: boolean;
    readonly files?: Map<string, Uint8Array<ArrayBuffer>>;
    readonly storage?: PublicationsServiceDeps[1];
  }): {
    readonly storage: PublicationsServiceDeps[1];
    readonly txInserts: Array<{ table: unknown; payload: Record<string, unknown> }>;
    readonly outerInsert: ReturnType<typeof vi.fn>;
    readonly service: PublicationsService;
    readonly repositoryPath: string;
  } {
    const { databaseService, txInserts, outerInsert } = createPublishDatabase(
      args?.transactionRejects === true ? { transactionRejects: true } : {},
    );
    const storage = args?.storage ?? createStorageStub();
    const repositoryPath = seedRepository(args?.files ?? new Map([['main.ts', encodeUtf8('code')]]));
    const service = new PublicationsService(
      databaseService,
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      createGitStub(repositoryPath),
    );

    return { storage, txInserts, outerInsert, service, repositoryPath };
  }

  /* R6: the row a viewer reads must say which revision it is being served, so
     the server's own resolution wins and a stale claim is refused. */
  it('R6: records the revision the server resolved, not the one the client claimed', async () => {
    const { txInserts, service, repositoryPath } = createPublishHarness();

    await service.publishFromRevision({ ownerId: 'user_1', request: publishRequest(repositoryPath) });

    const publicationInsert = txInserts.find((insert) => 'tag' in insert.payload);
    expect(publicationInsert?.payload['revisionId']).toBe(seededRevision(repositoryPath));
  });

  it('R6: refuses a publish whose claimed revision is not what the name points at', async () => {
    const { service, repositoryPath } = createPublishHarness();

    await expect(
      service.publishFromRevision({
        ownerId: 'user_1',
        request: publishRequest(repositoryPath, { revisionId: 'c'.repeat(40) }),
      }),
    ).rejects.toMatchObject({ response: { code: publicationApiCode.REVISION_MOVED } });
  });

  it('should write private publication blobs and the manifest to the fail-closed private tier', async () => {
    const { storage, service, repositoryPath } = createPublishHarness();

    await service.publishFromRevision({
      ownerId: 'user_1',
      request: publishRequest(repositoryPath, { visibility: 'private' }),
    });

    const putCalls = vi.mocked(storage.putBlob).mock.calls.map(([callArgs]) => callArgs);
    expect(putCalls.filter((callArgs) => callArgs.namespace === 'blobs')).toEqual([
      expect.objectContaining({ tier: 'private', cacheControl: 'private, no-cache', ifNoneMatch: '*' }),
    ]);
    expect(putCalls.filter((callArgs) => callArgs.namespace === 'derivatives')).toEqual([
      expect.objectContaining({ tier: 'private', cacheControl: 'private, no-cache' }),
    ]);
  });

  it('should keep public publication blobs on the CDN tier while the manifest stays private', async () => {
    const { storage, service, repositoryPath } = createPublishHarness();

    await service.publishFromRevision({
      ownerId: 'user_1',
      request: publishRequest(repositoryPath, { visibility: 'public' }),
    });

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
    const thumbnail = validWebpSignature();
    const tauManifest = encodeUtf8('{"schemaVersion":1}');
    const files = new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', encodeUtf8('code')]]);
    for (let index = 0; index < 199; index++) {
      files.set(`user-${String(index)}.ts`, encodeUtf8(`file-${String(index)}`));
    }
    files.set('tau.json', tauManifest);
    files.set('thumbnail.webp', thumbnail);
    const { storage, service, repositoryPath } = createPublishHarness({ files });

    await service.publishFromRevision({ ownerId: 'user_1', request: publishRequest(repositoryPath) });

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
    const thumbnail = validWebpSignature();
    const storage = createStorageStub();
    vi.mocked(storage.headBlob).mockResolvedValue({
      contentType: 'application/octet-stream',
      size: thumbnail.byteLength,
      etag: 'etag',
      cacheControl: 'private, no-cache',
    });
    const { service, repositoryPath } = createPublishHarness({
      storage,
      files: new Map([
        ['main.ts', encodeUtf8('code')],
        ['thumbnail.webp', thumbnail],
      ]),
    });

    await service.publishFromRevision({ ownerId: 'user_1', request: publishRequest(repositoryPath) });

    const thumbnailWrites = vi
      .mocked(storage.putBlob)
      .mock.calls.map(([callArgs]) => callArgs)
      .filter((callArgs) => callArgs.namespace === 'blobs' && callArgs.contentType === 'image/webp');
    expect(thumbnailWrites).toHaveLength(1);
    expect(thumbnailWrites[0]?.body).toStrictEqual(thumbnail);
    // The object is already there under this digest, so the write repairs the
    // content type rather than claiming the key.
    expect(thumbnailWrites[0]).not.toHaveProperty('ifNoneMatch');
  });

  it('should upsert blob refcounts inside the publish transaction, aggregated per sha', async () => {
    const { txInserts, outerInsert, service, repositoryPath } = createPublishHarness({
      files: new Map([
        ['main.ts', encodeUtf8('same-bytes')],
        ['copy.ts', encodeUtf8('same-bytes')],
        ['other.ts', encodeUtf8('different-bytes')],
      ]),
    });

    await service.publishFromRevision({
      ownerId: 'user_1',
      request: publishRequest(repositoryPath, { visibility: 'public' }),
    });

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
    const { outerInsert, service, repositoryPath } = createPublishHarness({ transactionRejects: true });

    await expect(
      service.publishFromRevision({
        ownerId: 'user_1',
        request: publishRequest(repositoryPath, { visibility: 'public' }),
      }),
    ).rejects.toThrow('transaction failed');

    expect(outerInsert).not.toHaveBeenCalled();
  });

  it('should re-point an existing publication rather than creating a second one (AC13)', async () => {
    const existing = {
      id: 'pub_existing',
      projectId: 'proj_1',
      tag: 'v1',
      manifestKey: 'publications/pub_existing/old.json',
      visibility: 'public',
      entryPath: 'main.ts',
    };
    const { databaseService, txInserts } = createPublishDatabase({ existingRows: [existing] });
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));
    const storage = createManifestStorageStub();
    const service = new PublicationsService(
      databaseService,
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      createGitStub(repositoryPath),
    );

    const result = await service.publishFromRevision({
      ownerId: 'user_1',
      request: publishRequest(repositoryPath, { visibility: 'public' }),
    });

    expect(result.id).toBe('pub_existing');
    const publicationInsert = txInserts.find((entry) => entry.table === schema.publication);
    expect(publicationInsert?.payload).toMatchObject({ id: 'pub_existing', tag: 'v1' });
    expect(publicationInsert?.payload['manifestKey']).not.toBe(existing.manifestKey);
  });
});

// === Publication file proxy resolution ===

describe('PublicationsService.resolvePublicationFile (R3)', () => {
  const privateRow = {
    id: 'pub_test',
    projectId: 'proj_x',
    tag: 'v1',
    revisionId: 'a'.repeat(40),
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
      createGitStub(''),
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
      createGitStub(''),
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
      createGitStub(''),
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
      createGitStub(''),
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
    tag: 'v1',
    revisionId: 'a'.repeat(40),
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
      createGitStub(''),
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
  /* The gate refuses before anything is materialized, so this row needs no
     repository and no real revision. */
  const privateRequest = publishRequest(undefined, {
    projectId: 'proj_gate',
    title: 'Gate test',
    visibility: 'private',
  });

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
      createGitStub(seedRepository(new Map([['main.ts', new Uint8Array([1])]]))),
    );
  }

  it('rejects a private publish from a free-tier user with ENTITLEMENT_REQUIRED', async () => {
    const service = createGateService({ entitled: false, parentRows: [] });

    const publishAttempt = service.publishFromRevision({ ownerId: 'user_free', request: privateRequest });

    await expect(publishAttempt).rejects.toThrow(ForbiddenException);
    await expect(publishAttempt).rejects.toMatchObject({
      response: { code: publicationApiCode.ENTITLEMENT_REQUIRED },
    });
  });

  it('allows a grandfathered content-only republish when the current publication is already private (T16)', async () => {
    const service = createGateService({ entitled: false, parentRows: [{ visibility: 'private' }] });

    // The gate passes and the publish proceeds until it needs the real config
    // plumbing — anything other than ENTITLEMENT_REQUIRED proves the gate opened.
    await expect(
      service.publishFromRevision({ ownerId: 'user_free', request: privateRequest }),
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
      createGitStub(seedRepository(new Map([['main.ts', new Uint8Array([1])]]))),
    );

    await expect(
      service.publishFromRevision({ ownerId: 'user_pro', request: privateRequest }),
    ).rejects.not.toMatchObject({ response: { code: publicationApiCode.ENTITLEMENT_REQUIRED } });
  });
});
