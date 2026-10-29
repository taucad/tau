import { setTimeout as waitForRetry } from 'node:timers/promises';
import { repositoryLocator } from '#api/git/store/locator.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { lockProjectLifecycle, readProjectDeletion } from '#database/project-lifecycle.js';
import { withOwnerLock } from '#database/owner-lock.js';
import { admitEvidenceErasure } from '#api/agent-observability/evidence-erasure.js';
import type { Database } from '#database/owner-lock.js';
import {
  project,
  projectCollaborator,
  projectDeletion,
  projectDeletionManifest,
  projectGit,
  projectInvitation,
  publication,
  publicationAccess,
  user,
} from '#database/schema.js';
import type { RepositoryLocator } from '#api/git/store/port.js';

export type ProjectDeletionStatus = { projectId: string; state: 'active' | 'deleting' | 'deleted'; deletedAt?: string };

/** Authorize from durable rows, including retries after memberships were removed. */
export async function readOwnedProjectDeletion(
  database: Database,
  projectId: string,
  userId: string,
): Promise<ProjectDeletionStatus> {
  const deletion = await readProjectDeletion(database, projectId);
  if (deletion) {
    if (deletion.ownerId !== userId) {
      throw new NotFoundException('Project not found');
    }
    return deletion.deletedAt
      ? { projectId, state: 'deleted', deletedAt: deletion.deletedAt.toISOString() }
      : { projectId, state: 'deleting' };
  }
  const [row] = await database
    .select({ ownerId: project.ownerId })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (row?.ownerId === userId) {
    return { projectId, state: 'active' };
  }
  const [member] = await database
    .select({ userId: projectCollaborator.userId })
    .from(projectCollaborator)
    .where(and(eq(projectCollaborator.projectId, projectId), eq(projectCollaborator.userId, userId)))
    .limit(1);
  if (member) {
    throw new ForbiddenException('Only the owner can delete this cloud project');
  }
  throw new NotFoundException('Project not found');
}

/** Commit intent and all database retirements atomically, before touching object storage. */
export async function requestProjectDeletion(input: {
  database: Database;
  projectId: string;
  userId: string;
  enabled: boolean;
}): Promise<void> {
  await withOwnerLock(input.database, input.userId, async (transaction) => {
    await lockProjectLifecycle(transaction, input.projectId);
    const existing = await readProjectDeletion(transaction, input.projectId);
    if (existing) {
      if (existing.ownerId !== input.userId) {
        throw new NotFoundException('Project not found');
      }
      return;
    }
    // Account deletion uses a SQL cascade, not our advisory locks. Hold its
    // parent row until every publication cleanup reference has been captured.
    const [owner] = await transaction
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, input.userId))
      .for('key share');
    if (!owner) {
      throw new NotFoundException('Project not found');
    }
    const [row] = await transaction.select().from(project).where(eq(project.id, input.projectId)).limit(1);
    if (row?.ownerId !== input.userId) {
      const [member] = await transaction
        .select()
        .from(projectCollaborator)
        .where(and(eq(projectCollaborator.projectId, input.projectId), eq(projectCollaborator.userId, input.userId)))
        .limit(1);
      if (member) {
        throw new ForbiddenException('Only the owner can delete this cloud project');
      }
      throw new NotFoundException('Project not found');
    }
    if (!input.enabled) {
      throw new ForbiddenException({
        code: 'PROJECT_DELETION_DISABLED',
        message: 'Cloud project deletion is not available yet.',
      });
    }
    const at = new Date();
    const [usage] = await transaction.select().from(projectGit).where(eq(projectGit.projectId, row.id)).limit(1);
    await transaction.insert(projectDeletion).values({
      projectId: row.id,
      ownerId: row.ownerId,
      storageAccountId: row.storageAccountId,
      requestedBy: input.userId,
      requestedAt: at,
      retainedBytes: (usage?.storageBytes ?? 0) + (usage?.lfsBytes ?? 0) + (usage?.retainedBytes ?? 0),
    });
    const manifests = await transaction
      .select({ publicationId: publication.id, manifestKey: publication.manifestKey })
      .from(publication)
      .where(and(eq(publication.projectId, row.id), ne(publication.manifestKey, '')));
    if (manifests.length > 0) {
      await transaction
        .insert(projectDeletionManifest)
        .values(manifests.map((manifest) => ({ ...manifest, projectId: row.id })));
    }
    await transaction.delete(projectCollaborator).where(eq(projectCollaborator.projectId, row.id));
    await transaction
      .update(projectInvitation)
      .set({ revokedAt: at })
      .where(and(eq(projectInvitation.projectId, row.id), isNull(projectInvitation.revokedAt)));
    await transaction
      .update(publicationAccess)
      .set({ status: 'revoked', revokedAt: at })
      .where(
        inArray(
          publicationAccess.publicationId,
          transaction.select({ id: publication.id }).from(publication).where(eq(publication.projectId, row.id)),
        ),
      );
    await transaction
      .update(publication)
      .set({ unpublishedAt: at })
      .where(and(eq(publication.projectId, row.id), isNull(publication.unpublishedAt)));
    await transaction.update(project).set({ currentPublicationId: null }).where(eq(project.id, row.id));
    /* In the same transaction as the fence, so no agent evidence is sent after it and every trace sent before is named for deletion (T13). */
    await admitEvidenceErasure(transaction, { scope: 'project', subjectId: row.id });
  });
}

/**
 * Writes a project's tombstone manifest and reports its moments (D10, NI12).
 * tau-api's is `executorTombstoneFence`, which has tau-storage commit it, so no
 * repository write is reachable from the API image (DC1); the maintenance
 * worker and the suites use `storeTombstoneFence` over a store they hold.
 */
export type TombstoneFence = (
  target: { readonly locator: RepositoryLocator; readonly committedBy: string; readonly at: Date },
  signal: AbortSignal,
) => Promise<{ readonly tombstonedAt: string; readonly purgeAfter: string }>;

/** Recoverable storage fence. The request and maintenance worker share this implementation. */
export async function completeProjectDeletion(input: {
  database: Database;
  fence: TombstoneFence;
  projectId: string;
  at?: Date;
}): Promise<ProjectDeletionStatus> {
  const deletion = await readProjectDeletion(input.database, input.projectId);
  if (!deletion) {
    throw new NotFoundException('No project deletion requested');
  }
  if (deletion.deletedAt) {
    return { projectId: input.projectId, state: 'deleted', deletedAt: deletion.deletedAt.toISOString() };
  }
  const at = input.at ?? new Date();
  await input.database
    .update(projectDeletion)
    .set({ lastAttemptAt: at, attempts: sql`${projectDeletion.attempts} + 1` })
    .where(and(eq(projectDeletion.projectId, input.projectId), isNull(projectDeletion.deletedAt)));
  try {
    // Cancellation reaches the SDK and is awaited; no abandoned request can commit later.
    const tombstone = await fenceWithRetry(
      input.fence,
      {
        locator: repositoryLocator({
          ownerId: deletion.ownerId,
          projectId: input.projectId,
          ...(deletion.storageAccountId === null ? {} : { accountId: deletion.storageAccountId }),
        }),
        committedBy: deletion.requestedBy,
        at,
      },
      AbortSignal.timeout(5000),
    );
    const fencedAt = new Date(tombstone.tombstonedAt);
    const purgeAfter = new Date(tombstone.purgeAfter);
    await withOwnerLock(input.database, deletion.ownerId, async (transaction) => {
      await lockProjectLifecycle(transaction, input.projectId);
      const [usage] = await transaction
        .select()
        .from(projectGit)
        .where(eq(projectGit.projectId, input.projectId))
        .limit(1);
      await transaction
        .update(projectDeletion)
        .set({
          fencedAt,
          deletedAt: fencedAt,
          purgeAfter,
          lastError: null,
          retainedBytes:
            usage === undefined ? deletion.retainedBytes : usage.storageBytes + usage.lfsBytes + usage.retainedBytes,
        })
        .where(and(eq(projectDeletion.projectId, input.projectId), isNull(projectDeletion.deletedAt)));
    });
    return { projectId: input.projectId, state: 'deleted', deletedAt: fencedAt.toISOString() };
  } catch (error) {
    // Error category only: storage errors may contain signed URLs or credentials.
    await input.database
      .update(projectDeletion)
      .set({
        lastError: error instanceof Error ? error.name : 'DeletionError',
        nextAttemptAt: new Date(at.getTime() + Math.min(300_000, 1000 * 2 ** Math.min(deletion.attempts, 8))),
      })
      .where(and(eq(projectDeletion.projectId, input.projectId), isNull(projectDeletion.deletedAt)));
    return readOwnedProjectDeletion(input.database, input.projectId, deletion.ownerId);
  }
}

/** A short CAS race can settle in this request; longer failures belong to durable recovery. */
async function fenceWithRetry(
  fence: TombstoneFence,
  input: Parameters<TombstoneFence>[0],
  signal: AbortSignal,
): ReturnType<TombstoneFence> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded retry of the same conditional commit.
      return await fence(input, signal);
    } catch (error) {
      if (!(error instanceof RepositoryStoreError) || error.code !== 'lost' || attempt >= 2) {
        throw error;
      }
      // oxlint-disable-next-line no-await-in-loop -- cancellation applies to backoff and storage I/O.
      await waitForRetry(25 * 2 ** attempt, undefined, { signal });
    }
  }
}
