import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { entitlementsFromTier, storageLimitBytesByTier } from '@taucad/billing';
import type { BillingTier } from '@taucad/billing';
import type { DatabaseService } from '#database/database.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { ProjectAccessService, ProjectRole } from '#api/collaboration/project-access.service.js';
import type { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import type {
  CommercialEntitlements,
  CommercialEntitlementsService,
} from '#api/entitlements/commercial-entitlements.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { UsageController } from '#api/git/usage.controller.js';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';

/**
 * Charter W8 (D16–D18): the free tier backs up to a 1 GiB account allowance
 * once D23's gate opens, and every refusal and meter quotes that one figure.
 * Each row starts from the entitlement the billing projection would answer, so
 * the gate is part of what is tested rather than stubbed around.
 */

const gib = 1024 ** 3;
const projectId = 'proj_w8';
const ownerId = 'user_owner';

/**
 * One Hosted Remote whose owner is on `tier` with `usedBytes` stored, seen by
 * a caller with `role`.
 */
const hostedRemote = ({
  entitlements,
  role = 'owner',
  usedBytes = 0,
}: {
  entitlements: CommercialEntitlements;
  role?: ProjectRole;
  usedBytes?: number;
}) => {
  const access = mock<ProjectAccessService>({
    authorize: vi.fn(async () => ({ projectId, ownerId, role })),
  });
  const repositories = new GitRepositoryService(
    mock<DatabaseService>(),
    mock<CommercialEntitlementsService>({ getEntitlements: vi.fn(async () => entitlements) }),
    mock<ObjectStorageService>(),
    access,
    mock<RepositoryStore>(),
    mock<PublicationRateLimiterService>(),
    mock<DurableEventsService>(),
  );
  vi.spyOn(repositories, 'readOwnerUsage').mockResolvedValue({
    storageBytes: usedBytes,
    lfsBytes: 0,
    retainedBytes: 0,
  });
  return { access, repositories };
};

/** The billing projection with free sync open, as the go-live checklist leaves it. */
const openTier = (tier: BillingTier): CommercialEntitlements => entitlementsFromTier(tier, { freeTierSync: true });

/**
 * An LFS upload batch the reservation refuses: `files` did not fit into what
 * the owner's plan had left.
 */
const refusedBatch = async (
  repositories: GitRepositoryService,
  userId: string,
  files: ReadonlyArray<{ oid: string; size: number }>,
) => {
  const access = await repositories.authorize({ projectId, userId, mode: 'write' });
  vi.spyOn(repositories, 'reserveLfsObjects').mockResolvedValue({
    status: 'quota',
    shortfallBytes: files.reduce((total, file) => total + file.size, 0) - access.remainingBytes,
    remainingBytes: access.remainingBytes,
    files,
  });
  const lfs = new GitLfsService(mock<ObjectStorageService>(), repositories, mock<DatabaseService>());
  return lfs.batch({
    access,
    operation: 'upload',
    objects: files,
    authorization: 'Bearer token',
    endpoint: 'https://api.test/v1/git/proj_w8.git/info/lfs/objects',
  });
};

const oid = (fill: string): string => fill.repeat(64);

describe('free tier on the Hosted Remote (D16)', () => {
  it('should admit a free owner’s push under 1 GiB with the 1 GiB allowance as its bound', async () => {
    const { repositories } = hostedRemote({ entitlements: openTier('free'), usedBytes: 200 * 1024 ** 2 });

    const access = await repositories.authorize({ projectId, userId: ownerId, mode: 'write' });

    expect(access.storageLimitBytes).toBe(gib);
    expect(access.remainingBytes).toBe(gib - 200 * 1024 ** 2);
    expect(access.quotaAudience).toBe('owner');
  });

  it('should refuse a free owner’s push while D23’s gate is closed, whatever the allowance', async () => {
    const { repositories } = hostedRemote({ entitlements: entitlementsFromTier('free') });

    await expect(repositories.authorize({ projectId, userId: ownerId, mode: 'write' })).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'GIT_SYNC_NOT_ENTITLED' }) as unknown,
    });
  });

  it('should leave a self-hosted server at its own allowance with no plan to sell', async () => {
    const { repositories } = hostedRemote({
      entitlements: {
        canSyncFiles: true,
        canCreatePrivateShares: true,
        canUseProKernels: true,
        storageLimitBytes: 5 * gib,
      },
    });

    const access = await repositories.authorize({ projectId, userId: ownerId, mode: 'write' });

    expect(access.storageLimitBytes).toBe(5 * gib);
    expect(access.quotaAudience).toBe('ownerAtTopTier');
  });
});

describe('quota refusal (D17)', () => {
  const overflowing = [
    { oid: oid('a'), size: 4096 },
    { oid: oid('b'), size: 600 * 1024 ** 2 },
    { oid: oid('c'), size: 90 * 1024 ** 2 },
  ];

  it('should refuse a free owner past 1 GiB with 413, the 1 GB plan and the largest files first', async () => {
    const { repositories } = hostedRemote({ entitlements: openTier('free'), usedBytes: 900 * 1024 ** 2 });

    const refused = await refusedBatch(repositories, ownerId, overflowing);

    expect(refused.status).toBe(413);
    if (refused.status !== 413) {
      return;
    }
    expect(refused.body.code).toBe('GIT_LFS_QUOTA_EXCEEDED');
    expect(refused.body.message).toBe(
      'This push needs more room than your 1 GB storage plan has left, so it was not backed up.',
    );
    expect(refused.body.files.map((file) => file.oid)).toStrictEqual([oid('b'), oid('c'), oid('a')]);
  });

  it('should direct a write collaborator to the owner and quote no plan', async () => {
    const { repositories } = hostedRemote({
      entitlements: openTier('free'),
      role: 'write',
      usedBytes: 900 * 1024 ** 2,
    });

    const refused = await refusedBatch(repositories, 'user_collaborator', overflowing);

    expect(refused.status).toBe(413);
    if (refused.status !== 413) {
      return;
    }
    expect(refused.body.message).toBe(
      "This push needs more room than the project owner's storage plan has left, so it was not backed up. Ask the owner to make room.",
    );
    expect(refused.body.files).toHaveLength(3);
  });

  it('should tell an owner on the top tier to remove files rather than upgrade', async () => {
    const { repositories } = hostedRemote({
      entitlements: openTier('enterprise'),
      usedBytes: storageLimitBytesByTier.enterprise - 1024,
    });

    const refused = await refusedBatch(repositories, ownerId, overflowing);

    expect(refused.status).toBe(413);
    expect(refused.status === 413 ? refused.body.message : '').toBe(
      'This push needs more room than your 100 GB storage plan has left, so it was not backed up. Remove or stop tracking the largest files to make room.',
    );
  });

  it('should answer a push to a full allowance with 413 in the caller’s sentence', async () => {
    const { repositories } = hostedRemote({ entitlements: openTier('free'), usedBytes: gib });

    await expect(repositories.authorize({ projectId, userId: ownerId, mode: 'write' })).rejects.toMatchObject({
      status: 413,
      response: expect.objectContaining({
        code: 'GIT_QUOTA_EXCEEDED',
        message: 'This push needs more room than your 1 GB storage plan has left, so it was not backed up.',
      }) as unknown,
    });
  });
});

describe('usage route (D18)', () => {
  it('should answer the owner the figures a later 413 quotes', async () => {
    const { access, repositories } = hostedRemote({ entitlements: openTier('free'), usedBytes: 340 * 1024 ** 2 });
    vi.spyOn(repositories, 'readOwnerUsage').mockResolvedValue({
      storageBytes: 300 * 1024 ** 2,
      lfsBytes: 40 * 1024 ** 2,
      retainedBytes: 12 * 1024 ** 2,
    });

    const usage = await new UsageController(access, repositories).usage(projectId, ownerId);

    expect(usage).toStrictEqual({
      storageBytes: 300 * 1024 ** 2,
      lfsBytes: 40 * 1024 ** 2,
      retainedBytes: 12 * 1024 ** 2,
      storageLimitBytes: gib,
    });
    expect(access.authorize).toHaveBeenCalledWith(projectId, ownerId, 'owner');
  });

  it('should never charge retained packs against the allowance', async () => {
    const { repositories } = hostedRemote({ entitlements: openTier('free') });
    vi.spyOn(repositories, 'readOwnerUsage').mockResolvedValue({
      storageBytes: 100 * 1024 ** 2,
      lfsBytes: 0,
      retainedBytes: 5 * gib,
    });

    const access = await repositories.authorize({ projectId, userId: ownerId, mode: 'write' });

    expect(access.remainingBytes).toBe(gib - 100 * 1024 ** 2);
  });

  it('should answer an allowance of 0 while the plan cannot sync', async () => {
    const { access, repositories } = hostedRemote({ entitlements: entitlementsFromTier('free') });

    const usage = await new UsageController(access, repositories).usage(projectId, ownerId);

    expect(usage.storageLimitBytes).toBe(0);
  });
});
