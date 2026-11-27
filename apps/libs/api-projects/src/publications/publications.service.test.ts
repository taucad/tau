import { describe, it, expect, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
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
import { publicationRowSchema } from '#publications/publications.dto.js';
import { PublicationsService } from '#publications/publications.service.js';
import { createMemoryRepositoryStore, seedLease } from '@taucad/api-git-core/testing/publication-lease.fixture';
import type { RepositoryStore } from '@taucad/api-git-core/store/port';
import { hydrateLease } from '@taucad/api-git-core/store/lease';
import { decodeManifest, encodeManifest } from '@taucad/api-git-core/store/manifest';
import type { RepositoryLease } from '@taucad/api-git-core/store/lease';
import { repositoryLocator } from '@taucad/api-git-core/store/locator';
import {
  isPublishableTreePath,
  materializePublishedTags,
  parseLfsPointer,
  readPublishedTree,
} from '#publications/publication-materializer.js';
import { leaseGitRunner } from '#testing/lease-git-runner.fixture.js';
import { createTableDatabase } from '#testing/table-database.fixture.js';
import type { TableDatabase } from '#testing/table-database.fixture.js';
import type { Table } from 'drizzle-orm';
import type { MaterializerDependencies } from '#publications/publication-materializer.js';
import { resolveLfsObjectLocation, tenantLfsObjectKey } from '@taucad/api-git-core/lfs-keys';
import type { ObjectStorageServiceContract, PutBlobResult } from '@taucad/api-object-storage';
import { blobKeyFromSha256Hex, servedBlobKey, sha256HexFromBytes } from '@taucad/api-object-storage/sha256';
import * as schema from '@taucad/api-database/schema';

type PublicationsServiceDeps = ConstructorParameters<typeof PublicationsService>;

// Lifecycle interleavings use real PostgreSQL in publication-deletion.integration.test.ts.
// These unit fixtures retain their existing statement-level data stubs.
vi.mock('@taucad/api-database/project-lifecycle', () => ({
  assertProjectActive: vi.fn(),
  assertActiveProjectLocked: vi.fn(),
}));

const createTestService = (...dependencies: PublicationsServiceDeps): PublicationsService => {
  const { database } = dependencies[0];
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- legacy partial database stubs intentionally omit unused members.
  if (database !== undefined && database.transaction === undefined) {
    type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
    database.transaction = async <T>(body: (transaction: Transaction) => Promise<T>): Promise<T> =>
      body(
        mock<Transaction>({
          select: database.select,
          insert: database.insert,
          update: database.update,
        }),
      );
  }
  return new PublicationsService(...dependencies);
};

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
      env: isolatedGit,
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

/**
 * The store side of publishing: the repository this project pushed to.
 *
 * Publishing hydrates a lease of its own now, so the stub is a real store with
 * the seeded repository committed into it — one repository, whatever locator it
 * is asked for, because these suites have one project at a time.
 *
 * @param repositoryPath - The seeded repository, or `''` when the test never publishes.
 * @returns The store the service is constructed with.
 */
function createStoreStub(repositoryPath: string): PublicationsServiceDeps[8] {
  const store = createMemoryRepositoryStore();
  const only = { ownerId: 'seeded', projectId: 'seeded' };
  let seeding: Promise<void> | undefined;
  const ready = async (): Promise<void> => {
    seeding ??= (async () => {
      if (repositoryPath !== '') {
        const lease = await seedLease({
          store,
          ownerId: only.ownerId,
          projectId: only.projectId,
          source: repositoryPath,
        });
        await lease.dispose();
      }
    })();
    await seeding;
  };

  const seeded: RepositoryStore = {
    capabilities: store.capabilities,
    readManifest: async () => {
      await ready();
      return store.readManifest(only);
    },
    commitManifest: async (_locator, next, expected) => store.commitManifest(only, next, expected),
    // oxlint-disable-next-line max-params -- the port's own signature
    putObject: async (_locator, key, body, options) => store.putObject(only, key, body, options),
    getObject: async (_locator, key, range) => store.getObject(only, key, range),
    listObjects: async function* listObjects(_locator, prefix) {
      yield* store.listObjects(only, prefix);
    },
    deleteObjects: async (_locator, keys) => store.deleteObjects(only, keys),
  };
  return seeded as unknown as PublicationsServiceDeps[8];
}

/**
 * The repository store and the lease runner over it, as the service's last two
 * dependencies. The runner hydrates straight from the store: admission (disk,
 * owner fairness, hydrate budgets) is `GitRepositoryService`'s and is proved in
 * `git.service.test.ts`.
 *
 * @param repositoryPath - The repository to seed, or `''` for none.
 * @returns The store and the runner, in constructor order.
 */
function leaseDependencies(repositoryPath: string): readonly [PublicationsServiceDeps[8], PublicationsServiceDeps[9]] {
  const store = createStoreStub(repositoryPath);
  const repositories = {
    /* The lease here is a real directory, so its git is a local child (DC1 sends it to tau-storage). */
    leaseGit: leaseGitRunner,
    withLease: async <T>(
      access: { ownerId: string; projectId: string },
      work: (lease: RepositoryLease) => Promise<T>,
    ): Promise<T> => {
      const lease = await hydrateLease({ store, locator: repositoryLocator(access) });
      try {
        return await work(lease);
      } finally {
        await lease.dispose();
      }
    },
  } as unknown as PublicationsServiceDeps[9];
  return [store, repositories] as const;
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
  /* The project's cloud link: none, so every publish here is a first publish. */
  const noLink = {
    where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
  };
  const tx = {
    /* The project advisory lock the publish path takes (review F2). */
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnValue({
      from: vi.fn((table: unknown) =>
        table === schema.projectShare
          ? noLink
          : { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(args?.existingRows ?? []) }) },
      ),
    }),
    insert: vi.fn().mockImplementation((table: unknown) => ({
      values: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        txInserts.push({ table, payload });
        /* Awaited bare by most writes, and with `returning()` by the cloud link's upsert. */
        const settled = Object.assign(Promise.resolve(), { returning: vi.fn().mockResolvedValue([{ ...payload }]) });
        return { onConflictDoUpdate: vi.fn().mockReturnValue(settled) };
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
  };

  const outerInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }),
  });

  /* Three reads, in order: the owner snapshot, the project mirror, then any
     publication already on this name. Sequenced rather than shared, because
     the last read is what decides create-versus-re-point. The link is read by
     table, outside the sequence. */
  const sequenced = vi
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
    });

  const databaseService = {
    database: {
      select: vi.fn(() => ({
        from: (table: unknown) =>
          table === schema.projectShare ? noLink : (sequenced() as { from: (from: unknown) => unknown }).from(table),
      })),
      insert: outerInsert,
      /* The superseded manifest's decrement, which reports whether it fired. */
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ sha256: 'decremented' }]) }),
        }),
      }),
      transaction: vi.fn(async <T>(callback: (innerTx: typeof tx) => Promise<T>): Promise<T> => {
        if (args?.transactionRejects === true) {
          throw new Error('transaction failed');
        }
        return callback(tx);
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

function createEmailStub(args?: { readonly deliveryEnabled?: boolean }): PublicationsServiceDeps[6] {
  return {
    isDeliveryEnabled: args?.deliveryEnabled ?? true,
    sendPublicationInvite: vi.fn().mockResolvedValue('sent'),
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

const fixtureTime = new Date('2026-01-02T03:04:05.000Z');

/** A version row of `proj_x`, private by default. */
function publicationFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    createdAt: fixtureTime,
    runtimePin: '~0.1.0',
    ...overrides,
  };
}

/** `proj_x`, owned by `user_owner`, pointing at `pub_test`. */
function projectFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'proj_x',
    ownerId: 'user_owner',
    name: 'Tray',
    description: 'A tray',
    currentPublicationId: 'pub_test',
    ...overrides,
  };
}

/** The cloud link of `proj_x`. */
function linkRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'shr_test',
    projectId: 'proj_x',
    ownerId: 'user_owner',
    visibility: 'private',
    disabledAt: null,
    publishedAt: fixtureTime,
    createdAt: fixtureTime,
    updatedAt: fixtureTime,
    ...overrides,
  };
}

/** An active invitation to `shr_test`. */
function grantRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sga_1',
    shareId: 'shr_test',
    ownerId: 'user_owner',
    recipientEmail: 'friend@example.com',
    status: 'active',
    createdAt: fixtureTime,
    revokedAt: null,
    ...overrides,
  };
}

/**
 * The rows one cloud link needs: its project, the version it shows, the link,
 * its invited people and the accounts that may open it.
 */
function seedLink(
  args: {
    readonly link?: Record<string, unknown> | false;
    readonly publication?: Record<string, unknown>;
    readonly project?: Record<string, unknown>;
    readonly grants?: ReadonlyArray<Record<string, unknown>>;
    readonly users?: ReadonlyArray<Record<string, unknown>>;
  } = {},
): TableDatabase {
  return createTableDatabase([
    [schema.project, [projectFixture(args.project)]],
    [schema.publication, [publicationFixture(args.publication)]],
    [schema.projectShare, args.link === false ? [] : [linkRow(args.link)]],
    [schema.projectShareAccess, [...(args.grants ?? [])]],
    [
      schema.user,
      [
        { id: 'user_owner', name: 'Owner', image: null, email: 'owner@example.com', emailVerified: true },
        ...(args.users ?? []),
      ],
    ],
  ]);
}

/** `seedLink` with `pub_newer` as the version the link shows and `pub_test` an earlier one. */
function seedNewerVersion(args: Parameters<typeof seedLink>[0] = {}): TableDatabase {
  const database = seedLink({ ...args, project: { currentPublicationId: 'pub_newer' } });
  database.rows(schema.publication).push(publicationFixture({ id: 'pub_newer', tag: 'v2', manifestKey: 'm2.json' }));
  return database;
}

/**
 * Runs `commit` once the first read of `table` has answered: what another
 * request committing between two reads looks like.
 */
function afterFirstRead(database: TableDatabase, table: Table, commit: () => void): void {
  type Builder = PromiseLike<unknown> & Record<string, unknown>;
  type Select = (...args: never[]) => { from: (from: Table) => Builder };
  const handle = (database.databaseService as { database: { select: Select } }).database;
  const select = handle.select.bind(handle);
  let reads = 0;
  handle.select = (...args) => {
    const query = select(...args);
    return {
      from: (from) => {
        const builder = query.from(from);
        reads += from === table ? 1 : 0;
        if (from === table && reads === 1) {
          const then = builder.then.bind(builder);
          Reflect.set(
            builder,
            'then',
            async (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
              then((value) => {
                commit();
                return onFulfilled === undefined ? value : onFulfilled(value);
              }, onRejected),
          );
        }
        return builder;
      },
    };
  };
}

/** A service over a table database; every other dependency is a stub unless given. */
function createLinkService(
  database: TableDatabase,
  overrides: {
    readonly storage?: PublicationsServiceDeps[1];
    readonly redis?: PublicationsServiceDeps[3];
    readonly rateLimiter?: PublicationsServiceDeps[4];
    readonly metrics?: PublicationsServiceDeps[5];
    readonly email?: PublicationsServiceDeps[6];
    readonly billing?: PublicationsServiceDeps[7];
    readonly repositoryPath?: string;
    readonly deliverability?: NonNullable<PublicationsServiceDeps[10]>;
  } = {},
): PublicationsService {
  return new PublicationsService(
    database.databaseService as PublicationsServiceDeps[0],
    overrides.storage ?? createManifestStorageStub(),
    createConfigStub(),
    overrides.redis ?? createRedisStub(),
    overrides.rateLimiter ?? createRateLimiterStub(),
    overrides.metrics ?? createMetricsStub(),
    overrides.email ?? createEmailStub(),
    overrides.billing ?? createBillingStub(),
    ...leaseDependencies(overrides.repositoryPath ?? ''),
    overrides.deliverability,
  );
}

function createStorageStub(): PublicationsServiceDeps[1] {
  const storage: ObjectStorageServiceContract = {
    putBlob: vi.fn(async (): Promise<PutBlobResult> => ({ lost: false, etag: 'etag', alreadyExisted: false })),
    deleteBlobs: vi.fn(async () => ({ deleted: 0 })),
    listObjects: vi.fn(async function* listObjectsStub() {
      yield* [];
    }),
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

/**
 * The LFS endpoint's own resolver, bound to a stub (W4b): tenant key first, the
 * pre-D24 key second, `undefined` when neither is there.
 *
 * @param storage - The storage stub whose `headBlob` answers for the fixture.
 * @returns What the materializer's dependencies carry.
 */
function lfsResolver(storage: PublicationsServiceDeps[1]): MaterializerDependencies['resolveLfsObject'] {
  return async (object) => {
    const held = await resolveLfsObjectLocation(storage, object);
    return held?.location;
  };
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

// A developer's global git config (e.g. `commit.gpgsign`) must not reach fixture commits: signing
// through a busy gpg-agent fails intermittently under parallel test load.
/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const isolatedGit = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

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
      {
        databaseService: {} as unknown as PublicationsServiceDeps[0],
        storage: createStorageStub(),
        git: realGit,
        resolveLfsObject: lfsResolver(createStorageStub()),
      },
      { directory: repositoryPath, projectId: 'proj_1', ownerId: 'user_1', tag: 'v1' },
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
        {
          databaseService: {} as unknown as PublicationsServiceDeps[0],
          storage: createStorageStub(),
          git: realGit,
          resolveLfsObject: lfsResolver(createStorageStub()),
        },
        { directory: repositoryPath, projectId: 'proj_1', ownerId: 'user_1', tag: 'v1' },
      ),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.TOO_MANY_FILES));
  });

  it('refuses a name the project does not have', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));

    await expect(
      readPublishedTree(
        {
          databaseService: {} as unknown as PublicationsServiceDeps[0],
          storage: createStorageStub(),
          git: realGit,
          resolveLfsObject: lfsResolver(createStorageStub()),
        },
        { directory: repositoryPath, projectId: 'proj_1', ownerId: 'user_1', tag: 'v9' },
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
    /* The push uploaded it under the owner's tenant prefix (D24), which is
       where the shared resolver looks first. */
    const held = { namespace: 'tenants', key: tenantLfsObjectKey('user_1', 'proj_1', oid), tier: 'private' };
    vi.mocked(storage.headBlob).mockImplementation(async (args) =>
      args.namespace === held.namespace && args.key === held.key
        ? { contentType: 'application/octet-stream', size: stepBytes.byteLength, etag: 'etag', cacheControl: '' }
        : undefined,
    );
    vi.mocked(storage.getBlob).mockImplementation(async () => ({
      body: Readable.from([Buffer.from(stepBytes)]),
      contentType: 'application/octet-stream',
      etag: 'etag',
    }));

    const files = await readPublishedTree(
      {
        databaseService: {} as unknown as PublicationsServiceDeps[0],
        storage,
        git: realGit,
        resolveLfsObject: lfsResolver(storage),
      },
      { directory: repositoryPath, projectId: 'proj_1', ownerId: 'user_1', tag: 'v1' },
    );

    expect(files.get('part.step')).toStrictEqual(stepBytes);
    expect(vi.mocked(storage.getBlob).mock.calls[0]?.[0]).toMatchObject({
      namespace: 'tenants',
      key: tenantLfsObjectKey('user_1', 'proj_1', oid),
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
      return { lost: false, etag: 'etag', alreadyExisted: false };
    });

    const repositoryPath = seedRepository(
      new Map([
        ['main.ts', encodeUtf8('export default () => {}')],
        ['.tau/parameters/main.ts.json', encodeUtf8('{}')],
      ]),
    );

    const service = createTestService(
      createPublishDatabase().databaseService,
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      ...leaseDependencies(repositoryPath),
    );

    await service.publishFromRevision({ ownerId: 'user_1', request: publishRequest(repositoryPath) });

    expect(capturedManifest).toBeDefined();
    const filesField = capturedManifest?.['files'] as Record<string, string> | undefined;
    expect(filesField?.['main.ts']).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(filesField?.['.tau/parameters/main.ts.json']).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('should create a private cloud link at the first publish and point the project at the version', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));
    const database = createTableDatabase([[schema.user, [{ id: 'user_1', name: 'Ada', image: null }]]]);
    const email = createEmailStub();
    const service = createLinkService(database, { repositoryPath, email });

    const { visibility: _visibility, ...withoutVisibility } = publishRequest(repositoryPath);
    const result = await service.publishFromRevision({ ownerId: 'user_1', request: withoutVisibility });

    const [link] = database.rows(schema.projectShare);
    expect(link).toMatchObject({ projectId: 'proj_1', ownerId: 'user_1', visibility: 'private', disabledAt: null });
    expect(link?.['publishedAt']).toBeInstanceOf(Date);
    expect(result.share).toEqual({
      id: link?.['id'],
      url: `http://app/s/tau~${String(link?.['id'])}`,
      visibility: 'private',
    });
    expect(result.share.id).toMatch(/^shr_/u);
    expect(result.urls.share).toBe(result.share.url);
    expect(result.urls.view).toBe(result.share.url);
    expect(result.version).toEqual({ tag: 'v1' });
    expect(database.rows(schema.project)[0]?.['currentPublicationId']).toBe(result.id);
    /* The version carries the project's name and description (D3). */
    expect(database.rows(schema.publication)[0]).toMatchObject({ title: 'Demo', visibility: 'private' });
    expect(vi.mocked(email.sendPublicationInvite)).not.toHaveBeenCalled();
  });

  it('should keep the link id, its setting and its invited people on a later publish, and turn a stopped link back on', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));
    const stoppedAt = new Date('2026-11-01T00:00:00.000Z');
    const database = createTableDatabase([
      [schema.user, [{ id: 'user_1', name: 'Ada', image: null }]],
      [
        schema.project,
        [{ id: 'proj_1', ownerId: 'user_1', name: 'Demo', description: null, currentPublicationId: null }],
      ],
      [
        schema.projectShare,
        [
          linkRow({
            id: 'shr_keep',
            projectId: 'proj_1',
            ownerId: 'user_1',
            visibility: 'public',
            disabledAt: stoppedAt,
          }),
        ],
      ],
      [schema.projectShareAccess, [grantRow({ shareId: 'shr_keep' })]],
    ]);
    const email = createEmailStub();
    const service = createLinkService(database, { repositoryPath, email });

    const { visibility: _visibility, ...withoutVisibility } = publishRequest(repositoryPath);
    const result = await service.publishFromRevision({ ownerId: 'user_1', request: withoutVisibility });

    expect(result.share).toEqual({ id: 'shr_keep', url: 'http://app/s/tau~shr_keep', visibility: 'public' });
    expect(database.rows(schema.projectShare)).toHaveLength(1);
    expect(database.rows(schema.projectShare)[0]).toMatchObject({
      id: 'shr_keep',
      visibility: 'public',
      disabledAt: null,
    });
    expect(database.rows(schema.projectShareAccess)).toEqual([expect.objectContaining({ status: 'active' })]);
    /* Publishing an update emails nobody (D4). */
    expect(vi.mocked(email.sendPublicationInvite)).not.toHaveBeenCalled();
  });

  it('should set the link to the visibility a publish asks for', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));
    const database = createTableDatabase([
      [
        schema.project,
        [{ id: 'proj_1', ownerId: 'user_1', name: 'Demo', description: null, currentPublicationId: null }],
      ],
      [
        schema.projectShare,
        [linkRow({ id: 'shr_keep', projectId: 'proj_1', ownerId: 'user_1', visibility: 'private' })],
      ],
    ]);
    const service = createLinkService(database, { repositoryPath });

    const result = await service.publishFromRevision({
      ownerId: 'user_1',
      request: publishRequest(repositoryPath, { visibility: 'public' }),
    });

    expect(result.share.visibility).toBe('public');
    expect(database.rows(schema.projectShare)[0]?.['visibility']).toBe('public');
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

    const service = createTestService(
      databaseService,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      ...leaseDependencies(repositoryPath),
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
  it('answers no link when the backend project mirror does not exist', async () => {
    const service = createLinkService(createTableDatabase([]));

    await expect(
      service.getProjectShareEnvelope({ projectId: 'proj_missing', ownerId: 'user_owner' }),
    ).resolves.toEqual({
      project: { id: 'proj_missing', name: null, description: null },
      share: null,
    });
  });

  it('answers no link for a project that has never been published', async () => {
    const service = createLinkService(seedLink({ link: false, project: { currentPublicationId: null } }));

    await expect(service.getProjectShareEnvelope({ projectId: 'proj_x', ownerId: 'user_owner' })).resolves.toEqual({
      project: { id: 'proj_x', name: 'Tray', description: 'A tray' },
      share: null,
    });
  });

  it('rejects a project owned by another user', async () => {
    const service = createLinkService(seedLink({ project: { ownerId: 'user_other' } }));

    await expect(
      service.getProjectShareEnvelope({ projectId: 'proj_x', ownerId: 'user_owner' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers the link, the version it shows and its active invited people', async () => {
    const service = createLinkService(
      seedLink({
        grants: [grantRow(), grantRow({ id: 'sga_2', recipientEmail: 'gone@example.com', status: 'revoked' })],
      }),
    );

    await expect(service.getProjectShareEnvelope({ projectId: 'proj_x', ownerId: 'user_owner' })).resolves.toEqual({
      project: { id: 'proj_x', name: 'Tray', description: 'A tray' },
      share: {
        id: 'shr_test',
        url: 'http://app/s/tau~shr_test',
        visibility: 'private',
        status: 'active',
        stoppedAt: null,
        publishedAt: fixtureTime.toISOString(),
        currentVersion: { publicationId: 'pub_test', tag: 'v1', revisionId: 'a'.repeat(40) },
        access: {
          grants: [
            {
              id: 'sga_1',
              recipientEmail: 'friend@example.com',
              status: 'active',
              createdAt: fixtureTime.toISOString(),
              revokedAt: null,
              notDelivered: false,
            },
          ],
        },
      },
    });
  });

  it('lists invited people newest first', async () => {
    const service = createLinkService(
      seedLink({
        grants: [
          grantRow({ id: 'sga_old', recipientEmail: 'old@example.com', createdAt: new Date('2026-01-01T00:00:00Z') }),
          grantRow({ id: 'sga_new', recipientEmail: 'new@example.com', createdAt: new Date('2026-03-01T00:00:00Z') }),
        ],
      }),
    );

    const envelope = await service.getProjectShareEnvelope({ projectId: 'proj_x', ownerId: 'user_owner' });

    expect(envelope.share?.access.grants.map((grant) => grant.id)).toEqual(['sga_new', 'sga_old']);
  });

  it('answers a stopped link with when it stopped', async () => {
    const stoppedAt = new Date('2026-02-01T00:00:00.000Z');
    const service = createLinkService(seedLink({ link: { disabledAt: stoppedAt } }));

    const envelope = await service.getProjectShareEnvelope({ projectId: 'proj_x', ownerId: 'user_owner' });

    expect(envelope.share).toMatchObject({ status: 'stopped', stoppedAt: stoppedAt.toISOString() });
  });

  it('marks a grant whose recipient is undeliverable as not delivered, and only that', async () => {
    const deliverability = mock<NonNullable<PublicationsServiceDeps[10]>>({
      undeliverableAmong: vi.fn(async () => new Set(['gone@example.com'])),
    });
    const service = createLinkService(
      seedLink({ grants: [grantRow(), grantRow({ id: 'sga_2', recipientEmail: 'gone@example.com' })] }),
      { deliverability },
    );

    const envelope = await service.getProjectShareEnvelope({ projectId: 'proj_x', ownerId: 'user_owner' });

    expect(envelope.share?.access.grants.map((grant) => [grant.recipientEmail, grant.notDelivered]).toSorted()).toEqual(
      [
        ['friend@example.com', false],
        ['gone@example.com', true],
      ],
    );
  });
});

describe('PublicationsService.getShareForViewer', () => {
  const createStorageForManifest = (): PublicationsServiceDeps[1] => {
    const storage = createManifestStorageStub();
    vi.mocked(storage.publicUrl).mockImplementation(() => 'https://cdn.example/blob');
    return storage;
  };

  it('answers the version the link shows, with ISO timestamps and the link as its address', async () => {
    const service = createLinkService(seedLink({ link: { visibility: 'public' } }), {
      storage: createStorageForManifest(),
    });

    const result = await service.getShareForViewer({ shareId: 'shr_test' });

    expect(publicationRowSchema.safeParse(result.publication).success).toBe(true);
    expect(result.viewerRole).toBe('public');
    expect(result.publication.id).toBe('pub_test');
    expect(result.publication.createdAt).toBe(fixtureTime.toISOString());
    expect(result.publication.unpublishedAt).toBeNull();
    expect(result.urls.share).toBe('http://app/s/tau~shr_test');
    expect(result.urls.view).toBe('http://app/s/tau~shr_test');
  });

  it('serves the version the link showed when it authorized the viewer, even if a publish lands in between', async () => {
    const database = seedLink({ link: { visibility: 'public' } });
    database.rows(schema.publication).push(publicationFixture({ id: 'pub_newer', tag: 'v2' }));
    /* A publish to people you invite commits right after the first read. */
    afterFirstRead(database, schema.projectShare, () => {
      Object.assign(database.rows(schema.project)[0] ?? {}, { currentPublicationId: 'pub_newer' });
      Object.assign(database.rows(schema.projectShare)[0] ?? {}, { visibility: 'private' });
    });
    const service = createLinkService(database, { storage: createStorageForManifest() });

    const result = await service.getShareForViewer({ shareId: 'shr_test' });

    expect(result.publication.id).toBe('pub_test');
  });

  /**
   * A link service whose version is behind the push (D19), so the read repairs it from a lease; `during` commits when
   * the repair starts, as a write that lands while it runs would.
   */
  const repairingService = (database: TableDatabase, during: () => void): PublicationsService => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('export default () => {}')]]));
    Object.assign(database.rows(schema.publication)[0] ?? {}, { revisionId: '', manifestKey: '', kernels: [] });
    database.rows(schema.projectGit).push({ projectId: 'proj_x', generation: 4, derivedGeneration: 2 });
    afterFirstRead(database, schema.projectGit, during);
    return createLinkService(database, { repositoryPath, storage: createStorageForManifest() });
  };

  it('authorizes the viewer again when a repair re-reads a version a same-name private publish replaced', async () => {
    const database = seedLink({ link: { visibility: 'public' } });
    /* The repair runs; meanwhile a publish under the same name to people you invite reuses the version's id. */
    const service = repairingService(database, () => {
      Object.assign(database.rows(schema.publication)[0] ?? {}, { title: 'Invited only' });
      Object.assign(database.rows(schema.projectShare)[0] ?? {}, { visibility: 'private' });
    });

    await expect(service.getShareForViewer({ shareId: 'shr_test' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('serves the repaired version, as the re-read link shows it, to a viewer that link still lets in', async () => {
    const database = seedLink({ link: { visibility: 'public' } });
    const service = repairingService(database, () => {
      Object.assign(database.rows(schema.publication)[0] ?? {}, { title: 'Repaired' });
    });

    const result = await service.getShareForViewer({ shareId: 'shr_test' });

    expect(result.publication).toMatchObject({ id: 'pub_test', title: 'Repaired', visibility: 'public' });
  });

  it('serves nothing when a publish moves the link to another version while the repair runs', async () => {
    const database = seedLink({ link: { visibility: 'public' } });
    database.rows(schema.publication).push(publicationFixture({ id: 'pub_newer', tag: 'v2' }));
    const service = repairingService(database, () => {
      Object.assign(database.rows(schema.project)[0] ?? {}, { currentPublicationId: 'pub_newer' });
    });

    await expect(service.getShareForViewer({ shareId: 'shr_test' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('takes who can open it from the link, not from the version', async () => {
    const service = createLinkService(
      seedLink({ link: { visibility: 'public' }, publication: { visibility: 'private' } }),
      { storage: createStorageForManifest() },
    );

    const result = await service.getShareForViewer({ shareId: 'shr_test' });

    expect(result.publication.visibility).toBe('public');
  });

  it('answers 404 for an unknown link and for a publication id', async () => {
    const service = createLinkService(seedLink());

    await expect(service.getShareForViewer({ shareId: 'shr_unknown' })).rejects.toBeInstanceOf(NotFoundException);
    /* An old per-version address is not a link (C1). */
    await expect(service.getShareForViewer({ shareId: 'pub_test', viewerUserId: 'user_owner' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('answers 410 for a stopped link, even for its owner', async () => {
    const service = createLinkService(seedLink({ link: { disabledAt: new Date() } }));

    await expect(service.getShareForViewer({ shareId: 'shr_test', viewerUserId: 'user_owner' })).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('answers 404 when the project no longer points at a live version', async () => {
    const service = createLinkService(seedLink({ publication: { unpublishedAt: new Date() } }));

    await expect(service.getShareForViewer({ shareId: 'shr_test', viewerUserId: 'user_owner' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resolves default thumbnail/og URLs without double-prefixing the namespace', async () => {
    const storage = createStorageForManifest();
    const service = createLinkService(seedLink({ link: { visibility: 'public' } }), { storage });

    await service.getShareForViewer({ shareId: 'shr_test' });

    expect(storage.publicUrl).toHaveBeenCalledWith({ namespace: 'defaults', key: 'thumb.webp' });
    expect(storage.publicUrl).toHaveBeenCalledWith({ namespace: 'defaults', key: 'og.png' });
  });

  it('resolves an uploaded thumbnail from the blobs namespace', async () => {
    const storage = createStorageForManifest();
    const service = createLinkService(
      seedLink({ link: { visibility: 'public' }, publication: { thumbnailKey: 'blobs/ab/cdef' } }),
      { storage },
    );

    await service.getShareForViewer({ shareId: 'shr_test' });

    expect(storage.publicUrl).toHaveBeenCalledWith({ namespace: 'blobs', key: 'ab/cdef' });
  });

  it('marks the link owner with viewerRole owner', async () => {
    const service = createLinkService(seedLink(), { storage: createStorageForManifest() });

    const result = await service.getShareForViewer({ shareId: 'shr_test', viewerUserId: 'user_owner' });

    expect(result.viewerRole).toBe('owner');
  });

  it('requires authentication before opening a link for invited people', async () => {
    const service = createLinkService(seedLink());

    await expect(service.getShareForViewer({ shareId: 'shr_test' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('marks an invited, verified address with viewerRole grantee', async () => {
    const service = createLinkService(
      seedLink({
        grants: [grantRow()],
        users: [{ id: 'user_friend', name: 'Friend', email: 'Friend@Example.com', emailVerified: true }],
      }),
      { storage: createStorageForManifest() },
    );

    const result = await service.getShareForViewer({ shareId: 'shr_test', viewerUserId: 'user_friend' });

    expect(result.viewerRole).toBe('grantee');
  });

  it.each([
    ['an address that was never invited', { email: 'stranger@example.com', emailVerified: true }, 'active'],
    ['an address whose access was removed', { email: 'friend@example.com', emailVerified: true }, 'revoked'],
    ['an unverified address', { email: 'friend@example.com', emailVerified: false }, 'active'],
  ])('rejects %s with 403', async (_case, account, status) => {
    const service = createLinkService(
      seedLink({
        grants: [grantRow({ status })],
        users: [{ id: 'user_friend', name: 'Friend', ...account }],
      }),
    );

    await expect(
      service.getShareForViewer({ shareId: 'shr_test', viewerUserId: 'user_friend' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PublicationsService.updateProjectShare', () => {
  const blobPutsOf = (storage: PublicationsServiceDeps[1]): Array<Record<string, unknown>> =>
    vi
      .mocked(storage.putBlob)
      .mock.calls.map(([callArgs]) => callArgs as unknown as Record<string, unknown>)
      .filter((callArgs) => callArgs['namespace'] === 'blobs');

  it('switches a link to anyone with it, copying the version it shows to the CDN tier first', async () => {
    const database = seedLink({ grants: [grantRow()] });
    const storage = createManifestStorageStub();
    /* Storage first, row second: the link still says private while the bytes move. */
    const visibilityDuringCopy: unknown[] = [];
    vi.mocked(storage.putBlob).mockImplementation(async () => {
      visibilityDuringCopy.push(database.rows(schema.projectShare)[0]?.['visibility']);
      return { lost: false, etag: 'etag', alreadyExisted: false };
    });
    const service = createLinkService(database, { storage });

    const share = await service.updateProjectShare({
      projectId: 'proj_x',
      ownerId: 'user_owner',
      visibility: 'public',
    });

    expect(share).toMatchObject({ id: 'shr_test', visibility: 'public', status: 'active' });
    expect(blobPutsOf(storage)).toEqual([
      expect.objectContaining({
        tier: 'public',
        cacheControl: 'public, max-age=31536000, immutable',
        ifNoneMatch: '*',
      }),
    ]);
    expect(database.rows(schema.projectShare)[0]?.['visibility']).toBe('public');
    expect(database.rows(schema.publication)[0]?.['visibility']).toBe('public');
    /* Invited people stay on the link. */
    expect(database.rows(schema.projectShareAccess)).toEqual([expect.objectContaining({ status: 'active' })]);
    expect(visibilityDuringCopy).toEqual(['private']);
  });

  it('dual-homes the version into the private tier when the link becomes invite-only', async () => {
    const storage = createManifestStorageStub();
    const service = createLinkService(seedLink({ link: { visibility: 'public' } }), { storage });

    await service.updateProjectShare({ projectId: 'proj_x', ownerId: 'user_owner', visibility: 'private' });

    expect(blobPutsOf(storage)).toEqual([
      expect.objectContaining({ tier: 'private', cacheControl: 'private, no-cache' }),
    ]);
    expect(vi.mocked(storage.deleteBlob)).not.toHaveBeenCalled();
  });

  it('skips blob copies that already exist in the target tier', async () => {
    const storage = createManifestStorageStub();
    vi.mocked(storage.headBlob).mockResolvedValue({
      contentType: 'application/octet-stream',
      size: 1,
      etag: 'e',
      cacheControl: '',
    });
    const service = createLinkService(seedLink(), { storage });

    await service.updateProjectShare({ projectId: 'proj_x', ownerId: 'user_owner', visibility: 'public' });

    expect(vi.mocked(storage.putBlob)).not.toHaveBeenCalled();
  });

  it('keeps the setting when storage reconciliation fails', async () => {
    const database = seedLink();
    const storage = createManifestStorageStub();
    vi.mocked(storage.putBlob).mockRejectedValue(new Error('bucket unavailable'));
    const service = createLinkService(database, { storage });

    await expect(
      service.updateProjectShare({ projectId: 'proj_x', ownerId: 'user_owner', visibility: 'public' }),
    ).rejects.toThrow('bucket unavailable');

    expect(database.rows(schema.projectShare)[0]?.['visibility']).toBe('private');
  });

  it('writes nothing for a same-value request', async () => {
    const database = seedLink();
    const storage = createManifestStorageStub();
    const service = createLinkService(database, { storage });

    await expect(
      service.updateProjectShare({ projectId: 'proj_x', ownerId: 'user_owner', visibility: 'private' }),
    ).resolves.toMatchObject({ visibility: 'private' });

    expect(database.writes).toEqual([]);
    expect(vi.mocked(storage.putBlob)).not.toHaveBeenCalled();
  });

  it('writes nothing when the link already has the setting by the time it holds the project lock', async () => {
    const database = seedLink();
    const storage = createManifestStorageStub();
    /* Another request made the link public after this one first read it. */
    afterFirstRead(database, schema.projectShare, () => {
      Object.assign(database.rows(schema.projectShare)[0] ?? {}, { visibility: 'public' });
    });
    const service = createLinkService(database, { storage });

    await expect(
      service.updateProjectShare({ projectId: 'proj_x', ownerId: 'user_owner', visibility: 'public' }),
    ).resolves.toMatchObject({ visibility: 'public' });

    expect(database.writes).toEqual([]);
    expect(vi.mocked(storage.putBlob)).not.toHaveBeenCalled();
  });

  it('needs the entitlement to make a link invite-only, and only then (T4/T16)', async () => {
    const billing = createBillingStub({ canCreatePrivateShares: false });

    await expect(
      createLinkService(seedLink({ link: { visibility: 'public' } }), { billing }).updateProjectShare({
        projectId: 'proj_x',
        ownerId: 'user_owner',
        visibility: 'private',
      }),
    ).rejects.toMatchObject({ response: { code: publicationApiCode.ENTITLEMENT_REQUIRED } });

    await expect(
      createLinkService(seedLink(), { billing }).updateProjectShare({
        projectId: 'proj_x',
        ownerId: 'user_owner',
        visibility: 'public',
      }),
    ).resolves.toMatchObject({ visibility: 'public' });
  });

  it('rejects a project without a link, a stopped link and another owner', async () => {
    await expect(
      createLinkService(seedLink({ link: false })).updateProjectShare({
        projectId: 'proj_x',
        ownerId: 'user_owner',
        visibility: 'public',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      createLinkService(seedLink({ link: { disabledAt: new Date() } })).updateProjectShare({
        projectId: 'proj_x',
        ownerId: 'user_owner',
        visibility: 'public',
      }),
    ).rejects.toBeInstanceOf(GoneException);
    await expect(
      createLinkService(seedLink({ project: { ownerId: 'user_other' } })).updateProjectShare({
        projectId: 'proj_x',
        ownerId: 'user_owner',
        visibility: 'public',
      }),
    ).rejects.toMatchObject({ response: { code: publicationApiCode.PROJECT_FORBIDDEN } });
  });
});

describe('PublicationsService.stopProjectShare', () => {
  it('stops the link on a free plan, keeping its id and invited people', async () => {
    const database = seedLink({ link: { visibility: 'public' }, grants: [grantRow()] });
    const billing = createBillingStub({ canCreatePrivateShares: false });
    const service = createLinkService(database, { billing });

    await service.stopProjectShare({ projectId: 'proj_x', ownerId: 'user_owner' });

    const [stopped] = database.rows(schema.projectShare);
    expect(stopped?.['id']).toBe('shr_test');
    expect(stopped?.['disabledAt']).toBeInstanceOf(Date);
    expect(database.rows(schema.projectShareAccess)).toEqual([expect.objectContaining({ status: 'active' })]);
    await expect(service.getShareForViewer({ shareId: 'shr_test' })).rejects.toBeInstanceOf(GoneException);
  });

  it('is idempotent and keeps the first stop time', async () => {
    const stoppedAt = new Date('2026-02-01T00:00:00.000Z');
    const database = seedLink({ link: { disabledAt: stoppedAt } });
    const service = createLinkService(database);

    await service.stopProjectShare({ projectId: 'proj_x', ownerId: 'user_owner' });

    expect(database.rows(schema.projectShare)[0]?.['disabledAt']).toBe(stoppedAt);
  });

  it('has nothing to stop for a project with no link', async () => {
    await expect(
      createLinkService(seedLink({ link: false })).stopProjectShare({ projectId: 'proj_x', ownerId: 'user_owner' }),
    ).resolves.toBeUndefined();
  });

  it('rejects another owner', async () => {
    await expect(
      createLinkService(seedLink({ project: { ownerId: 'user_other' } })).stopProjectShare({
        projectId: 'proj_x',
        ownerId: 'user_owner',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PublicationsService link invitations', () => {
  const invite = async (
    service: PublicationsService,
    overrides: { readonly recipientEmail?: string; readonly notifyRecipient?: boolean } = {},
  ): ReturnType<PublicationsService['inviteProjectShareAccess']> =>
    service.inviteProjectShareAccess({
      projectId: 'proj_x',
      ownerId: 'user_owner',
      recipientEmail: overrides.recipientEmail ?? ' New@Example.com ',
      ...(overrides.notifyRecipient === undefined ? {} : { notifyRecipient: overrides.notifyRecipient }),
    });

  it('emails a new invited address the stable link and says it was sent', async () => {
    const database = seedLink();
    const email = createEmailStub();
    const service = createLinkService(database, { email });

    const result = await invite(service);

    expect(result).toMatchObject({
      recipientEmail: 'new@example.com',
      status: 'active',
      notDelivered: false,
      email: { status: 'sent' },
    });
    expect(result.id).toMatch(/^sga_/u);
    expect(vi.mocked(email.sendPublicationInvite)).toHaveBeenCalledExactlyOnceWith({
      recipientEmail: 'new@example.com',
      ownerName: 'Owner',
      publicationTitle: 'Tray',
      url: 'http://app/s/tau~shr_test',
    });
    expect(database.rows(schema.projectShareAccess)).toEqual([
      expect.objectContaining({ shareId: 'shr_test', recipientEmail: 'new@example.com', status: 'active' }),
    ]);
  });

  it('does not email an address that already has access', async () => {
    const email = createEmailStub();
    const service = createLinkService(seedLink({ grants: [grantRow()] }), { email });

    const result = await invite(service, { recipientEmail: 'friend@example.com' });

    expect(result.email).toEqual({ status: 'not_requested' });
    expect(vi.mocked(email.sendPublicationInvite)).not.toHaveBeenCalled();
  });

  it('emails a removed address that is invited again', async () => {
    const database = seedLink({ grants: [grantRow({ status: 'revoked', revokedAt: new Date() })] });
    const email = createEmailStub();
    const service = createLinkService(database, { email });

    const result = await invite(service, { recipientEmail: 'friend@example.com' });

    expect(result.email).toEqual({ status: 'sent' });
    expect(database.rows(schema.projectShareAccess)).toEqual([
      expect.objectContaining({ id: 'sga_1', status: 'active', revokedAt: null }),
    ]);
  });

  it('answers the committed grant with a skipped email when the email cannot be prepared', async () => {
    const database = seedLink();
    const email = createEmailStub();
    const service = createLinkService(database, { email });
    vi.spyOn(service, 'loadOwnerSnapshot').mockRejectedValue(new Error('database unavailable'));

    const result = await invite(service);

    expect(result).toMatchObject({
      recipientEmail: 'new@example.com',
      status: 'active',
      email: { status: 'skipped', reason: 'send_failed' },
    });
    expect(vi.mocked(email.sendPublicationInvite)).not.toHaveBeenCalled();
    expect(database.rows(schema.projectShareAccess)).toEqual([expect.objectContaining({ status: 'active' })]);
  });

  it('sends nothing when the caller asks for no email', async () => {
    const email = createEmailStub();
    const service = createLinkService(seedLink(), { email });

    const result = await invite(service, { notifyRecipient: false });

    expect(result.email).toEqual({ status: 'not_requested' });
    expect(vi.mocked(email.sendPublicationInvite)).not.toHaveBeenCalled();
  });

  it('reports an undeliverable address without consuming the daily cap', async () => {
    const limiter = createRateLimiterStub();
    const metrics = createMetricsStub();
    const deliverability = mock<NonNullable<PublicationsServiceDeps[10]>>({
      undeliverableAmong: vi.fn(async () => new Set(['new@example.com'])),
    });
    const service = createLinkService(seedLink(), { rateLimiter: limiter, metrics, deliverability });

    const result = await invite(service);

    expect(result).toMatchObject({ notDelivered: true, email: { status: 'skipped', reason: 'undeliverable' } });
    expect(vi.mocked(limiter.consumeInviteEmailSlots)).not.toHaveBeenCalled();
    expect(vi.mocked(metrics.publicationInviteEmailsSuppressedTotal.add)).toHaveBeenCalledExactlyOnceWith(1, {
      trigger: 'invite',
      reason: 'recipient_undeliverable',
    });
  });

  it('reports email_disabled when the deployment has no email provider', async () => {
    const limiter = createRateLimiterStub();
    const metrics = createMetricsStub();
    const email = createEmailStub({ deliveryEnabled: false });
    const service = createLinkService(seedLink(), { rateLimiter: limiter, metrics, email });

    const result = await invite(service);

    expect(result.email).toEqual({ status: 'skipped', reason: 'email_disabled' });
    expect(vi.mocked(limiter.consumeInviteEmailSlots)).not.toHaveBeenCalled();
    expect(vi.mocked(email.sendPublicationInvite)).not.toHaveBeenCalled();
    expect(vi.mocked(metrics.publicationInviteEmailsSuppressedTotal.add)).toHaveBeenCalledExactlyOnceWith(1, {
      trigger: 'invite',
      reason: 'email_disabled',
    });
  });

  it('reports daily_cap and still grants access when the owner is over the cap', async () => {
    const database = seedLink();
    const email = createEmailStub();
    const service = createLinkService(database, {
      email,
      rateLimiter: createRateLimiterStub({ inviteAllowed: false }),
    });

    const result = await invite(service);

    expect(result.email).toEqual({ status: 'skipped', reason: 'daily_cap' });
    expect(vi.mocked(email.sendPublicationInvite)).not.toHaveBeenCalled();
    expect(database.rows(schema.projectShareAccess)).toHaveLength(1);
  });

  it('fails closed and reports limiter_unavailable when the rate limiter is down', async () => {
    const email = createEmailStub();
    const service = createLinkService(seedLink(), {
      email,
      rateLimiter: createRateLimiterStub({ inviteThrows: true }),
    });

    const result = await invite(service);

    expect(result.email).toEqual({ status: 'skipped', reason: 'limiter_unavailable' });
    expect(vi.mocked(email.sendPublicationInvite)).not.toHaveBeenCalled();
  });

  it('reports send_failed when the provider refuses the email', async () => {
    const email = createEmailStub();
    vi.mocked(email.sendPublicationInvite).mockRejectedValue(new Error('resend down'));
    const metrics = createMetricsStub();
    const service = createLinkService(seedLink(), { email, metrics });

    const result = await invite(service);

    expect(result.email).toEqual({ status: 'skipped', reason: 'send_failed' });
    expect(vi.mocked(metrics.publicationInviteEmailsTotal.add)).toHaveBeenCalledWith(1, {
      trigger: 'invite',
      outcome: 'failed',
    });
  });

  it('reports email_disabled when the send itself finds no provider', async () => {
    const email = createEmailStub();
    vi.mocked(email.sendPublicationInvite).mockResolvedValue('disabled');
    const service = createLinkService(seedLink(), { email });

    await expect(invite(service)).resolves.toMatchObject({ email: { status: 'skipped', reason: 'email_disabled' } });
  });

  it('refuses invites on a link anyone can open, a stopped link and a project with no link', async () => {
    await expect(invite(createLinkService(seedLink({ link: { visibility: 'public' } })))).rejects.toSatisfy(
      (error: unknown) => isBadRequestWithCode(error, publicationApiCode.FORBIDDEN),
    );
    await expect(invite(createLinkService(seedLink({ link: { disabledAt: new Date() } })))).rejects.toBeInstanceOf(
      GoneException,
    );
    await expect(invite(createLinkService(seedLink({ link: false })))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes an invited address, on a stopped link too', async () => {
    const database = seedLink({ link: { disabledAt: new Date() }, grants: [grantRow()] });
    const service = createLinkService(database);

    const grant = await service.revokeProjectShareAccess({
      projectId: 'proj_x',
      ownerId: 'user_owner',
      accessId: 'sga_1',
    });

    expect(grant).toMatchObject({ id: 'sga_1', status: 'revoked' });
    expect(typeof grant.revokedAt).toBe('string');
    expect(database.rows(schema.projectShareAccess)[0]?.['status']).toBe('revoked');
  });

  it('answers 404 for a grant of another link', async () => {
    const service = createLinkService(seedLink({ grants: [grantRow({ shareId: 'shr_other' })] }));

    await expect(
      service.revokeProjectShareAccess({ projectId: 'proj_x', ownerId: 'user_owner', accessId: 'sga_1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PublicationsService.recordView', () => {
  function createViewService(
    database: TableDatabase,
    args: {
      readonly redis?: PublicationsServiceDeps[3];
      readonly rateLimiter?: PublicationsServiceDeps[4];
      readonly metrics?: PublicationsServiceDeps[5];
    } = {},
  ): PublicationsService {
    return createLinkService(database, {
      ...(args.redis === undefined ? {} : { redis: args.redis }),
      ...(args.rateLimiter === undefined ? {} : { rateLimiter: args.rateLimiter }),
      ...(args.metrics === undefined ? {} : { metrics: args.metrics }),
    });
  }

  const view = async (service: PublicationsService, identity: { viewerHash: string; sessionUserId?: string }) =>
    service.recordView({ publicationId: 'pub_test', identity });

  it('throws NotFoundException when the publication or its link is missing', async () => {
    await expect(
      createViewService(createTableDatabase([])).recordView({
        publicationId: 'pub_missing',
        identity: { viewerHash: 'h1' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(view(createViewService(seedLink({ link: false })), { viewerHash: 'h1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws GoneException when the publication is unpublished or the link is stopped', async () => {
    await expect(
      view(createViewService(seedLink({ publication: { unpublishedAt: new Date() } })), { viewerHash: 'h1' }),
    ).rejects.toBeInstanceOf(GoneException);
    await expect(
      view(createViewService(seedLink({ link: { disabledAt: new Date() } })), { viewerHash: 'h1' }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('throws NotFoundException for a version the link no longer shows', async () => {
    const database = seedNewerVersion({ link: { visibility: 'public' } });

    await expect(view(createViewService(database), { viewerHash: 'h1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(database.writes).toEqual([]);
  });

  it('counts a view of a link for invited people only from someone it lets in', async () => {
    const database = seedLink({
      grants: [grantRow()],
      users: [
        { id: 'user_friend', name: 'Friend', image: null, email: 'friend@example.com', emailVerified: true },
        { id: 'user_stranger', name: 'Stranger', image: null, email: 'stranger@example.com', emailVerified: true },
      ],
    });
    const redis = createRedisStub({ pfaddReturns: 1 });
    const metrics = createMetricsStub();
    const service = createViewService(database, { redis, metrics });

    await expect(view(service, { viewerHash: 'anonymous' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(view(service, { viewerHash: 'stranger', sessionUserId: 'user_stranger' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(redis.client.pfadd).not.toHaveBeenCalled();
    expect(database.writes).toEqual([]);
    expect(metrics.publicationViewsRejectedTotal.add).toHaveBeenCalledWith(1, { reason: 'invalid_publication' });

    await view(service, { viewerHash: 'friend', sessionUserId: 'user_friend' });

    expect(database.writes.filter((write) => write.table === schema.publication)).toHaveLength(1);
  });

  it('short-circuits owner self-view without invoking PFADD or rate limiter', async () => {
    const redis = createRedisStub();
    const rateLimiter = createRateLimiterStub();
    const metrics = createMetricsStub();
    const service = createViewService(seedLink(), { redis, rateLimiter, metrics });

    await view(service, { viewerHash: 'h1', sessionUserId: 'user_owner' });

    expect(rateLimiter.consumePublicationViewSlot).not.toHaveBeenCalled();
    expect(redis.client.pfadd).not.toHaveBeenCalled();
    expect(metrics.publicationViewsRejectedTotal.add).toHaveBeenCalledWith(1, { reason: 'owner_self_view' });
  });

  it('throws 429 RATE_LIMITED when the per-identity cap is exceeded', async () => {
    const service = createViewService(seedLink({ link: { visibility: 'public' } }), {
      rateLimiter: createRateLimiterStub({ allowed: false }),
    });

    await expect(view(service, { viewerHash: 'h1' })).rejects.toSatisfy((error: unknown) => {
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
    const database = seedLink({ link: { visibility: 'public' } });
    const redis = createRedisStub({ pfaddReturns: 1 });
    const metrics = createMetricsStub();
    const service = createViewService(database, { redis, metrics });

    await view(service, { viewerHash: 'fresh-viewer' });

    expect(redis.client.pfadd).toHaveBeenCalledTimes(1);
    expect(database.writes.filter((write) => write.table === schema.publication)).toHaveLength(1);
    expect(metrics.publicationViewsTotal.add).toHaveBeenCalledWith(1, { deduped: 'unique' });
  });

  it('records duplicate when PFADD returns 0 and skips UPDATE', async () => {
    const database = seedLink({ link: { visibility: 'public' } });
    const redis = createRedisStub({ pfaddReturns: 0 });
    const metrics = createMetricsStub();
    const service = createViewService(database, { redis, metrics });

    await view(service, { viewerHash: 'returning-viewer' });

    expect(database.writes).toEqual([]);
    expect(metrics.publicationViewsTotal.add).toHaveBeenCalledWith(1, { deduped: 'duplicate' });
  });
});

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
    const service = createTestService(
      databaseService,
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      ...leaseDependencies(repositoryPath),
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

  /* D24 / RV-W9 M5: a lease hydrated before the ref-removal verb committed
     still holds the removed name. Under the publication lock the name is read
     from the store again, so the publish is refused rather than bringing back a
     name the owner just removed. */
  it('refuses a publish whose name the store no longer holds once it has the lock', async () => {
    const { databaseService } = createPublishDatabase();
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));
    const [store, repositories] = leaseDependencies(repositoryPath);
    const removed = {
      ...store,
      readManifest: async (locator: Parameters<RepositoryStore['readManifest']>[0]) => {
        const read = await store.readManifest(locator);
        if (read === undefined) {
          return read;
        }
        const manifest = decodeManifest(read.manifest);
        const references = Object.fromEntries(Object.entries(manifest.refs).filter(([ref]) => ref !== 'refs/tags/v1'));
        return { ...read, manifest: encodeManifest({ ...manifest, refs: references }) };
      },
    } as unknown as PublicationsServiceDeps[8];
    const service = createTestService(
      databaseService,
      createStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      removed,
      repositories,
    );

    await expect(
      service.publishFromRevision({ ownerId: 'user_1', request: publishRequest(repositoryPath) }),
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

  /* #2008: the bare digest key may be another publication's plain file, so a
     thumbnail never repairs it; it goes to its own served key. */
  it('should write a thumbnail to its own served key rather than rewrite the shared digest key', async () => {
    const thumbnail = validWebpSignature();
    const sha = sha256HexFromBytes(thumbnail);
    const storage = createStorageStub();
    vi.mocked(storage.headBlob).mockImplementation(async (args) =>
      args.key === blobKeyFromSha256Hex(sha)
        ? {
            contentType: 'application/octet-stream',
            size: thumbnail.byteLength,
            etag: 'etag',
            cacheControl: '',
          }
        : undefined,
    );
    const { service, repositoryPath } = createPublishHarness({
      storage,
      files: new Map([
        ['main.ts', encodeUtf8('code')],
        ['thumbnail.webp', thumbnail],
      ]),
    });

    await service.publishFromRevision({ ownerId: 'user_1', request: publishRequest(repositoryPath) });

    const blobWrites = vi
      .mocked(storage.putBlob)
      .mock.calls.map(([callArgs]) => callArgs)
      .filter((callArgs) => callArgs.namespace === 'blobs');
    expect(blobWrites.map((callArgs) => callArgs.key)).not.toContain(blobKeyFromSha256Hex(sha));
    expect(blobWrites).toContainEqual(
      expect.objectContaining({
        key: servedBlobKey(sha, 'image/webp'),
        body: thumbnail,
        contentType: 'image/webp',
        ifNoneMatch: '*',
      }),
    );
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

  it('should retain held blob references when republishing the same revision', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));
    const manifestKey = `publications/pub_existing/${seededRevision(repositoryPath)}.json`;
    const { databaseService, txInserts } = createPublishDatabase({
      existingRows: [
        {
          id: 'pub_existing',
          projectId: 'proj_1',
          tag: 'v1',
          manifestKey,
          visibility: 'public',
          entryPath: 'main.ts',
        },
      ],
    });
    const service = createTestService(
      databaseService,
      createManifestStorageStub(),
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      ...leaseDependencies(repositoryPath),
    );
    await service.publishFromRevision({
      ownerId: 'user_1',
      request: publishRequest(repositoryPath, { visibility: 'public' }),
    });
    expect(txInserts.filter((entry) => entry.table === schema.blobRef)).toEqual([]);
    expect(txInserts.find((entry) => entry.table === schema.publication)?.payload['manifestKey']).toBe(manifestKey);
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
    const service = createTestService(
      databaseService,
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      ...leaseDependencies(repositoryPath),
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

// === Materialization as derived state (D19) ===

describe('PublicationsService derived-state repair', () => {
  /**
   * A public link on `proj_1` whose version is the given row, with the two
   * generations on `project_git` that decide whether a read repairs it (D19).
   */
  function seedDerived(args: {
    readonly publication: Record<string, unknown>;
    readonly generation: number;
    readonly derivedGeneration: number;
    readonly link?: Record<string, unknown>;
  }): TableDatabase {
    return createTableDatabase([
      [
        schema.project,
        [projectFixture({ id: 'proj_1', ownerId: 'user_1', currentPublicationId: args.publication['id'] })],
      ],
      [schema.publication, [args.publication]],
      [schema.projectShare, [linkRow({ projectId: 'proj_1', ownerId: 'user_1', visibility: 'public', ...args.link })]],
      [
        schema.projectGit,
        [{ projectId: 'proj_1', generation: args.generation, derivedGeneration: args.derivedGeneration }],
      ],
    ]);
  }

  it('should re-materialize from a lease at the link tier and serve the repaired row when the derived generation is behind', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('export default () => {}')]]));
    /* A push that committed its manifest and was killed before it materialized:
       the row still points at nothing (D19). Its tier column is stale on purpose:
       the repair reads the tier from the link. */
    const database = seedDerived({
      publication: publicationFixture({
        id: 'pub_derived',
        projectId: 'proj_1',
        ownerId: 'user_1',
        revisionId: '',
        manifestKey: '',
        visibility: 'private',
        kernels: [],
      }),
      generation: 4,
      derivedGeneration: 2,
    });
    const storage = createManifestStorageStub();
    const service = createLinkService(database, { repositoryPath, storage });

    const result = await service.getShareForViewer({ shareId: 'shr_test' });

    /* The viewer is served the version the push actually published. */
    expect(result.publication.revisionId).toBe(seededRevision(repositoryPath));
    const [row] = database.rows(schema.publication);
    expect(row?.['manifestKey']).toBe(`publications/pub_derived/${seededRevision(repositoryPath)}.json`);
    expect(row?.['visibility']).toBe('public');
    const blobPuts = vi
      .mocked(storage.putBlob)
      .mock.calls.map(([callArgs]) => callArgs)
      .filter((callArgs) => callArgs.namespace === 'blobs');
    expect(blobPuts.length).toBeGreaterThan(0);
    expect(blobPuts.every((callArgs) => callArgs.tier !== 'private')).toBe(true);
    /* The marker is the git service's to advance, because its repair also
       rebuilds accounting and the LFS marks (D19). */
    expect(database.writes.filter((write) => write.table === schema.projectGit)).toEqual([]);
  });

  it('should serve the row another request repaired while this one waited, rather than the one it first read', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('export default () => {}')]]));
    const database = seedDerived({
      publication: publicationFixture({
        id: 'pub_derived',
        projectId: 'proj_1',
        ownerId: 'user_1',
        revisionId: '',
        manifestKey: '',
        visibility: 'public',
        kernels: [],
      }),
      generation: 4,
      derivedGeneration: 2,
    });
    const repairedKey = `publications/pub_derived/${seededRevision(repositoryPath)}.json`;
    /* Another viewer's repair commits right after this one read the link, so this one finds nothing left to do. */
    afterFirstRead(database, schema.projectShare, () => {
      Object.assign(database.rows(schema.publication)[0] ?? {}, {
        revisionId: seededRevision(repositoryPath),
        manifestKey: repairedKey,
      });
    });
    const service = createLinkService(database, { repositoryPath, storage: createManifestStorageStub() });

    const result = await service.getShareForViewer({ shareId: 'shr_test' });

    expect(result.publication.revisionId).toBe(seededRevision(repositoryPath));
    expect(database.rows(schema.publication)[0]?.['manifestKey']).toBe(repairedKey);
  });

  it('should repair to the private tier when the project has no link', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('export default () => {}')]]));
    const database = seedDerived({
      publication: publicationFixture({
        id: 'pub_derived',
        projectId: 'proj_1',
        ownerId: 'user_1',
        revisionId: '',
        manifestKey: '',
        visibility: 'public',
        kernels: [],
      }),
      generation: 4,
      derivedGeneration: 2,
    });
    database.rows(schema.projectShare).length = 0;
    const storage = createManifestStorageStub();

    /* The file proxy answers 404 without a link, but the repair is reachable
       from the git side; drive it through the materializer directly. */
    await materializePublishedTags(
      {
        databaseService: database.databaseService as MaterializerDependencies['databaseService'],
        storage,
        git: leaseGitRunner,
        resolveLfsObject: lfsResolver(storage),
      },
      {
        projectId: 'proj_1',
        ownerId: 'user_1',
        directory: repositoryPath,
        tags: [{ ref: 'refs/tags/v1', oid: seededRevision(repositoryPath) }],
      },
    );

    expect(database.rows(schema.publication)[0]?.['visibility']).toBe('private');
    const blobPuts = vi
      .mocked(storage.putBlob)
      .mock.calls.map(([callArgs]) => callArgs)
      .filter((callArgs) => callArgs.namespace === 'blobs');
    expect(blobPuts.length).toBeGreaterThan(0);
    expect(blobPuts.every((callArgs) => callArgs.tier === 'private')).toBe(true);
  });

  it('should serve without a lease when the marker is behind for work that is not this publication', async () => {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('export default () => {}')]]));
    /* The row already records the commit the manifest's tag names: the marker
       is behind for the accounting or an LFS mark, neither of which is this
       read's business, so nothing is hydrated. */
    const database = seedDerived({
      publication: publicationFixture({
        id: 'pub_current_tag',
        projectId: 'proj_1',
        ownerId: 'user_1',
        revisionId: seededRevision(repositoryPath),
      }),
      generation: 4,
      derivedGeneration: 2,
    });
    const service = createLinkService(database, { repositoryPath });

    const result = await service.getShareForViewer({ shareId: 'shr_test' });

    expect(result.publication.revisionId).toBe(seededRevision(repositoryPath));
    expect(database.rows(schema.publication)[0]?.['manifestKey']).toBe('m.json');
  });

  it('should serve without a lease when the derived generation is current', async () => {
    const database = seedDerived({
      publication: publicationFixture({ id: 'pub_current', projectId: 'proj_1', ownerId: 'user_1' }),
      generation: 4,
      derivedGeneration: 4,
    });
    /* No repository at all: a current publication must never hydrate one. */
    const service = createLinkService(database);

    const result = await service.getShareForViewer({ shareId: 'shr_test' });

    expect(result.publication.revisionId).toBe('a'.repeat(40));
    expect(database.rows(schema.publication)[0]?.['manifestKey']).toBe('m.json');
    expect(database.writes).toEqual([]);
  });
});

// === Publication file proxy resolution ===

describe('PublicationsService.resolvePublicationFile (R3)', () => {
  const resolved = {
    sha256Hex: testManifestSha,
    etag: `"${testManifestSha}"`,
    path: 'main.ts',
    key: blobKeyFromSha256Hex(testManifestSha),
  };

  function createFileService(database: TableDatabase): {
    readonly service: PublicationsService;
    readonly storage: PublicationsServiceDeps[1];
  } {
    const storage = createManifestStorageStub();
    return { service: createLinkService(database, { storage }), storage };
  }

  const friend = { id: 'user_friend', name: 'Friend', email: 'friend@example.com', emailVerified: true };

  it('should resolve the manifest sha as a strong quoted ETag for the owner', async () => {
    const { service } = createFileService(seedLink());

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: 'main.ts' }),
    ).resolves.toEqual(resolved);
  });

  it('should resolve for an invited address', async () => {
    const { service } = createFileService(seedLink({ grants: [grantRow()], users: [friend] }));

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_friend', path: 'main.ts' }),
    ).resolves.toEqual(resolved);
  });

  it('should reject anonymous requests for an invite-only link with 401 before touching storage', async () => {
    const { service, storage } = createFileService(seedLink());

    await expect(service.resolvePublicationFile({ publicationId: 'pub_test', path: 'main.ts' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(vi.mocked(storage.getBlob)).not.toHaveBeenCalled();
  });

  it('should reject a removed address with 403 (removal is immediate)', async () => {
    const { service } = createFileService(seedLink({ grants: [grantRow({ status: 'revoked' })], users: [friend] }));

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_friend', path: 'main.ts' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should return 410 once the link is stopped, and 404 for a project with no link', async () => {
    await expect(
      createFileService(seedLink({ link: { disabledAt: new Date() } })).service.resolvePublicationFile({
        publicationId: 'pub_test',
        viewerUserId: 'user_owner',
        path: 'main.ts',
      }),
    ).rejects.toBeInstanceOf(GoneException);
    await expect(
      createFileService(seedLink({ link: false })).service.resolvePublicationFile({
        publicationId: 'pub_test',
        viewerUserId: 'user_owner',
        path: 'main.ts',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should return 404 for a path outside the publication manifest (no cross-publication re-scoping)', async () => {
    const { service } = createFileService(seedLink());

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: 'stolen.ts' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject an empty path with INVALID_PATH', async () => {
    const { service } = createFileService(seedLink());

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: '' }),
    ).rejects.toSatisfy((error: unknown) => isBadRequestWithCode(error, publicationApiCode.INVALID_PATH));
  });

  it('should return 410 for unpublished publications', async () => {
    const { service } = createFileService(seedLink({ publication: { unpublishedAt: new Date() } }));

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: 'main.ts' }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('should serve a link anyone can open to anonymous viewers through the proxy too', async () => {
    const { service } = createFileService(seedLink({ link: { visibility: 'public' } }));

    await expect(service.resolvePublicationFile({ publicationId: 'pub_test', path: 'main.ts' })).resolves.toEqual(
      resolved,
    );
  });

  it('should answer 404 for an earlier version, even under a link anyone can open', async () => {
    const { service, storage } = createFileService(seedNewerVersion({ link: { visibility: 'public' } }));

    await expect(service.resolvePublicationFile({ publicationId: 'pub_test', path: 'main.ts' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: 'main.ts' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(vi.mocked(storage.getBlob)).not.toHaveBeenCalled();
  });

  it('should normalize ./-prefixed request paths against manifest keys', async () => {
    const { service } = createFileService(seedLink());

    await expect(
      service.resolvePublicationFile({ publicationId: 'pub_test', viewerUserId: 'user_owner', path: './main.ts' }),
    ).resolves.toEqual(resolved);
  });

  it('should serve repeat resolutions from the manifest cache without re-reading storage', async () => {
    const { service, storage } = createFileService(seedLink());

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

    const service = createTestService(
      {} as unknown as PublicationsServiceDeps[0],
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      ...leaseDependencies(''),
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

    const service = createTestService(
      {} as unknown as PublicationsServiceDeps[0],
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      ...leaseDependencies(''),
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
    const service = createTestService(
      {} as unknown as PublicationsServiceDeps[0],
      storage,
      createConfigStub(),
      createRedisStub(),
      createRateLimiterStub(),
      createMetricsStub(),
      createEmailStub(),
      createBillingStub(),
      ...leaseDependencies(''),
    );

    const opened = await service.openPublicationFile('f'.repeat(64), 'thumbnail.webp');

    expect(opened.contentType).toBe('image/webp');
    expect(opened.contentLength).toBe(thumbnail.byteLength);
  });
});

// === Tier-aware viewer URLs and wire hardening ===

describe('PublicationsService.getShareForViewer tiered file URLs (R4/R6)', () => {
  function createViewerService(args: {
    readonly link?: Record<string, unknown>;
    readonly publication?: Record<string, unknown>;
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

    const service = createLinkService(
      seedLink({
        ...(args.link === undefined ? {} : { link: args.link }),
        ...(args.publication === undefined ? {} : { publication: args.publication }),
      }),
      { storage },
    );

    return { service, storage };
  }

  it('should emit authenticated proxy URLs with encoded paths for an invite-only link', async () => {
    const { service, storage } = createViewerService({
      manifestFiles: {
        'main.ts': `sha256:${testManifestSha}`,
        'src/deep file.ts': `sha256:${'b'.repeat(64)}`,
      },
    });

    const result = await service.getShareForViewer({ shareId: 'shr_test', viewerUserId: 'user_owner' });

    expect(result.files['main.ts']).toBe('http://api.test/v1/publications/pub_test/files?path=main.ts');
    expect(result.files['src/deep file.ts']).toBe(
      'http://api.test/v1/publications/pub_test/files?path=src%2Fdeep%20file.ts',
    );
    // No unsigned blob URL is ever emitted for private bytes.
    expect(vi.mocked(storage.publicUrl)).not.toHaveBeenCalledWith(expect.objectContaining({ namespace: 'blobs' }));
  });

  it('should keep direct CDN URLs for a link anyone can open', async () => {
    const { service, storage } = createViewerService({ link: { visibility: 'public' } });

    const result = await service.getShareForViewer({ shareId: 'shr_test' });

    expect(result.files['main.ts']).toBe('https://example.invalid/public');
    expect(vi.mocked(storage.publicUrl)).toHaveBeenCalledWith({
      namespace: 'blobs',
      key: blobKeyFromSha256Hex(testManifestSha),
    });
  });

  /* #2008: the thumbnail is served from its own key; a version materialized
     before that holds it at the bare digest, which its row recorded. */
  it.each([
    ['a version materialized with served keys', `blobs/${servedBlobKey('c'.repeat(64), 'image/webp')}`],
    ['a version materialized before them', `blobs/${blobKeyFromSha256Hex('c'.repeat(64))}`],
  ])('should serve the public thumbnail from the key its row recorded, for %s', async (_case, thumbnailKey) => {
    const { service, storage } = createViewerService({
      link: { visibility: 'public' },
      publication: { thumbnailKey },
      manifestFiles: {
        'main.ts': `sha256:${testManifestSha}`,
        'thumbnail.webp': `sha256:${'c'.repeat(64)}`,
      },
    });

    await service.getShareForViewer({ shareId: 'shr_test' });

    expect(vi.mocked(storage.publicUrl)).toHaveBeenCalledWith({
      namespace: 'blobs',
      key: thumbnailKey.slice('blobs/'.length),
    });
    expect(vi.mocked(storage.publicUrl)).toHaveBeenCalledWith({
      namespace: 'blobs',
      key: blobKeyFromSha256Hex(testManifestSha),
    });
  });

  it('should expose neither raw storage keys nor a manifest URL on the wire', async () => {
    const { service } = createViewerService({});

    const result = await service.getShareForViewer({ shareId: 'shr_test', viewerUserId: 'user_owner' });

    expect(result.publication).not.toHaveProperty('manifestKey');
    expect(result.publication).not.toHaveProperty('ogImageKey');
    expect(result.publication).not.toHaveProperty('thumbnailKey');
    expect(result.urls).not.toHaveProperty('manifest');
  });

  it('should read the manifest from the private tier before falling back to the public bucket', async () => {
    const { service, storage } = createViewerService({});

    await service.getShareForViewer({ shareId: 'shr_test', viewerUserId: 'user_owner' });

    expect(vi.mocked(storage.getBlob)).toHaveBeenCalledWith({
      namespace: 'derivatives',
      key: 'm.json',
      tier: 'private',
    });
  });
});

describe('PublicationsService invite-only entitlement gate on publish (T4/T16)', () => {
  /* The gate refuses before anything is materialized. */
  function createGateService(args: { readonly entitled: boolean; readonly link?: Record<string, unknown> }): {
    readonly service: PublicationsService;
    readonly repositoryPath: string;
    readonly database: TableDatabase;
  } {
    const repositoryPath = seedRepository(new Map([['main.ts', encodeUtf8('code')]]));
    const database = createTableDatabase([
      [
        schema.project,
        [{ id: 'proj_1', ownerId: 'user_free', name: 'Demo', description: null, currentPublicationId: null }],
      ],
      [
        schema.projectShare,
        args.link === undefined ? [] : [linkRow({ projectId: 'proj_1', ownerId: 'user_free', ...args.link })],
      ],
    ]);
    const service = createLinkService(database, {
      repositoryPath,
      billing: createBillingStub({ canCreatePrivateShares: args.entitled }),
    });
    return { service, repositoryPath, database };
  }

  const withoutVisibility = (repositoryPath: string): ReturnType<typeof publishRequest> => {
    const { visibility: _visibility, ...rest } = publishRequest(repositoryPath);
    return rest;
  };

  it('refuses a first publish from a free-tier user, which would be invite-only, with ENTITLEMENT_REQUIRED', async () => {
    const { service, repositoryPath } = createGateService({ entitled: false });

    const publishAttempt = service.publishFromRevision({
      ownerId: 'user_free',
      request: withoutVisibility(repositoryPath),
    });

    await expect(publishAttempt).rejects.toThrow(ForbiddenException);
    await expect(publishAttempt).rejects.toMatchObject({ response: { code: publicationApiCode.ENTITLEMENT_REQUIRED } });
  });

  it('lets a free-tier user publish a link anyone can open', async () => {
    const { service, repositoryPath } = createGateService({ entitled: false });

    await expect(
      service.publishFromRevision({
        ownerId: 'user_free',
        request: publishRequest(repositoryPath, { visibility: 'public' }),
      }),
    ).resolves.toMatchObject({ share: { visibility: 'public' } });
  });

  it('lets a free-tier user keep publishing to a link that is already invite-only (T16)', async () => {
    const { service, repositoryPath } = createGateService({ entitled: false, link: { visibility: 'private' } });

    await expect(
      service.publishFromRevision({ ownerId: 'user_free', request: withoutVisibility(repositoryPath) }),
    ).resolves.toMatchObject({ share: { visibility: 'private' } });
  });

  it('makes a first publish at the default it names, when it names no setting', async () => {
    const { service, repositoryPath } = createGateService({ entitled: false });

    await expect(
      service.publishFromRevision({
        ownerId: 'user_free',
        request: { ...withoutVisibility(repositoryPath), defaultVisibility: 'public' },
      }),
    ).resolves.toMatchObject({ share: { visibility: 'public' } });
  });

  it('keeps a link made since the client looked at its own setting, whatever default the publish names', async () => {
    const { service, repositoryPath } = createGateService({ entitled: false, link: { visibility: 'private' } });

    await expect(
      service.publishFromRevision({
        ownerId: 'user_free',
        request: { ...withoutVisibility(repositoryPath), defaultVisibility: 'public' },
      }),
    ).resolves.toMatchObject({ share: { visibility: 'private' } });
  });

  it('clears the description the link showed when the project no longer has one', async () => {
    const { service, repositoryPath, database } = createGateService({ entitled: true, link: { visibility: 'public' } });
    Object.assign(database.rows(schema.project)[0] ?? {}, { description: 'An old description' });

    await service.publishFromRevision({ ownerId: 'user_free', request: withoutVisibility(repositoryPath) });

    expect(database.rows(schema.project)[0]?.['description']).toBeNull();
    expect(database.rows(schema.publication).at(-1)?.['description']).toBeNull();
  });

  it('refuses switching a public link to invite-only on publish without the entitlement', async () => {
    const { service, repositoryPath } = createGateService({ entitled: false, link: { visibility: 'public' } });

    await expect(
      service.publishFromRevision({
        ownerId: 'user_free',
        request: publishRequest(repositoryPath, { visibility: 'private' }),
      }),
    ).rejects.toMatchObject({ response: { code: publicationApiCode.ENTITLEMENT_REQUIRED } });
  });
});
