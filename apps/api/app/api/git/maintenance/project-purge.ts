import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { and, asc, eq, gt, isNotNull, lte, sql } from 'drizzle-orm';
import { withOwnerLock } from '#database/owner-lock.js';
import type { Database } from '#database/owner-lock.js';
import { lockProjectLifecycle, readProjectDeletion } from '#database/project-lifecycle.js';
import {
  projectDeletion,
  projectDeletionManifest,
  projectGit,
  projectGitLfsObject,
  publication,
} from '#database/schema.js';
import { releaseDeletedProjectPublicationReferences } from '#api/publications/publication-deletion.js';
import { gitLfsObjectKey, isProjectRepositoryId } from '#api/git/git.constants.js';
import { tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest, encodeManifest, isTombstoned, succeedManifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { StorageNamespace } from '#storage/storage.constants.js';
import { assertSingletonProcessGroup } from '#api/git/maintenance/singleton.js';

/** Objects above this bound require approval of this exact owner, project and inventory. */
export const projectPurgeObjectBound = 10_000;
const batchSize = 500;

type Deletion = typeof projectDeletion.$inferSelect;
type PlannedObject = {
  namespace: StorageNamespace | 'repository';
  key: string;
  bytes: number;
  modifiedAt: string | undefined;
};
export type ProjectPurgePlan = {
  ownerId: string;
  projectId: string;
  objects: number;
  bytes: number;
  fingerprint: string;
};
export type ProjectPurgeOutcome = {
  projectId: string;
  status: 'planned' | 'refused' | 'purged' | 'pending';
  plan?: ProjectPurgePlan;
};
type Dependencies = { database: Database; driver: ObjectStorageService; store: RepositoryStore };

/** The captured locator is immutable and must never fall back to another account. */
const locatorFor = (deletion: Deletion, driver: ObjectStorageService): RepositoryLocator => {
  if (deletion.storageAccountId !== null && deletion.storageAccountId !== driver.account.id) {
    throw new Error('Project purge storage account unavailable');
  }
  return repositoryLocator({
    ownerId: deletion.ownerId,
    projectId: deletion.projectId,
    ...(deletion.storageAccountId === null ? {} : { accountId: deletion.storageAccountId }),
  });
};

/** Stream a confined inventory; only the manifest sentinel and global shared blobs are excluded. */
const inventory = async function* (args: Dependencies, deletion: Deletion): AsyncGenerator<PlannedObject> {
  const locator = locatorFor(deletion, args.driver);
  for await (const object of args.store.listObjects(locator, '')) {
    if (object.key === 'manifest.json') {
      continue;
    }
    if (object.key.startsWith('/') || object.key.split('/').some((segment) => segment === '..' || segment === '.')) {
      throw new Error('Repository listing escaped its prefix');
    }
    yield {
      namespace: 'repository',
      key: object.key,
      bytes: object.bytes,
      modifiedAt: object.modifiedAt?.toISOString(),
    };
  }
  const prefixes: Array<{ namespace: StorageNamespace; keyPrefix: string }> = [
    { namespace: 'tenants', keyPrefix: tenantLfsObjectKey(locator.ownerId, locator.projectId, '') },
    { namespace: 'blobs', keyPrefix: gitLfsObjectKey(locator.projectId, '').replace(/\/+$/u, '/') },
  ];
  for (const prefix of prefixes) {
    // oxlint-disable-next-line no-await-in-loop -- each prefix is streamed before advancing.
    for await (const object of args.driver.listObjects({ ...prefix, tier: 'private' })) {
      if (!object.key.startsWith(prefix.keyPrefix)) {
        throw new Error('LFS listing escaped its prefix');
      }
      yield {
        namespace: prefix.namespace,
        key: object.key,
        bytes: object.bytes,
        modifiedAt: object.modifiedAt?.toISOString(),
      };
    }
  }
  // Captured work survives account cascades; metadata also covers versions without a current pointer.
  const publicationIds = sql`select ${publication.id} as id from ${publication} where ${publication.projectId} = ${locator.projectId}
    union select ${projectDeletionManifest.publicationId} as id from ${projectDeletionManifest} where ${projectDeletionManifest.projectId} = ${locator.projectId}`;
  let cursor = '';
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- keyset pages bound the retained publication identities.
    const rows = await args.database.execute<{ id: string }>(
      sql`select id from (${publicationIds}) as ids where id > ${cursor} order by id limit ${batchSize}`,
    );
    if (rows.length === 0) {
      break;
    }
    cursor = rows.at(-1)!.id;
    for (const row of rows) {
      if (!isProjectRepositoryId(row.id)) {
        throw new Error('Invalid publication identity in project purge');
      }
      const prefix = `publications/${row.id}/`;
      // oxlint-disable-next-line no-await-in-loop -- derivative objects are streamed per publication.
      for await (const object of args.driver.listObjects({
        namespace: 'derivatives',
        keyPrefix: prefix,
        tier: 'private',
      })) {
        if (!object.key.startsWith(prefix)) {
          throw new Error('Publication listing escaped its prefix');
        }
        yield {
          namespace: 'derivatives',
          key: object.key,
          bytes: object.bytes,
          modifiedAt: object.modifiedAt?.toISOString(),
        };
      }
    }
  }
};

/** Exact-key plans spill to process scratch, so even operator-approved inventories keep bounded memory. */
const planInventory = async (args: Dependencies, deletion: Deletion, file?: string): Promise<ProjectPurgePlan> => {
  const hash = createHash('sha256').update(
    JSON.stringify([deletion.ownerId, deletion.projectId, deletion.storageAccountId]),
  );
  let objects = 0;
  let bytes = 0;
  let lines: string[] = [];
  for await (const object of inventory(args, deletion)) {
    const line = `${JSON.stringify(object)}\n`;
    hash.update(line);
    objects += 1;
    bytes += object.bytes;
    if (file !== undefined) {
      lines.push(line);
      if (lines.length >= batchSize) {
        // oxlint-disable-next-line no-await-in-loop -- backpressure keeps the disk plan bounded in memory.
        await appendFile(file, lines.join(''));
        lines = [];
      }
    }
  }
  if (file !== undefined) {
    await appendFile(file, lines.join(''));
  }
  return { ownerId: deletion.ownerId, projectId: deletion.projectId, objects, bytes, fingerprint: hash.digest('hex') };
};

/** Keep the existing incarnation and deadline while removing every pointer to purged content. */
const scrubManifest = async (args: Dependencies, deletion: Deletion): Promise<void> => {
  const locator = locatorFor(deletion, args.driver);
  const read = await args.store.readManifest(locator);
  const current = read === undefined ? undefined : decodeManifest(read.manifest);
  if (deletion.fencedAt === null || deletion.purgeAfter === null) {
    throw new Error('Project purge requires a recorded manifest fence');
  }
  if (
    current !== undefined &&
    (!isTombstoned(current) || current.tombstone?.purgeAfter !== deletion.purgeAfter.toISOString())
  ) {
    throw new Error('Project purge manifest does not match the durable fence');
  }
  if (
    current?.packs.length === 0 &&
    Object.keys(current.refs).length === 0 &&
    current.pushes.length === 0 &&
    current.earlierPushes === null
  ) {
    return;
  }
  const base =
    current ??
    succeedManifest(undefined, {
      refs: {},
      packs: [],
      committedBy: 'purge',
      tombstone: {
        tombstonedAt: deletion.fencedAt.toISOString(),
        purgeAfter: deletion.purgeAfter.toISOString(),
      },
    });
  const next = { ...base, generation: base.generation + 1, refs: {}, packs: [], pushes: [], earlierPushes: null };
  const result = await args.store.commitManifest(locator, encodeManifest(next), read?.token ?? 'absent');
  if (result === 'lost') {
    throw new Error('Project purge manifest changed concurrently');
  }
};

/** Consume only exact keys from the reviewed snapshot, never a newly enlarged prefix. */
const deletePlan = async (args: Dependencies, deletion: Deletion, file: string): Promise<void> => {
  const locator = locatorFor(deletion, args.driver);
  const input = createReadStream(file);
  const lines = createInterface({ input, crlfDelay: Infinity });
  const batch: PlannedObject[] = [];
  const flush = async (): Promise<void> => {
    for (const namespace of ['repository', 'tenants', 'blobs', 'derivatives'] as const) {
      const keys = batch.filter((object) => object.namespace === namespace).map((object) => object.key);
      if (keys.length === 0) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one bounded exact-key delete per namespace.
      await (namespace === 'repository'
        ? args.store.deleteObjects(locator, keys)
        : args.driver.deleteBlobs({ namespace, keys, tier: 'private' }));
    }
    batch.length = 0;
  };
  try {
    for await (const line of lines) {
      batch.push(JSON.parse(line) as PlannedObject);
      if (batch.length === batchSize) {
        // oxlint-disable-next-line no-await-in-loop -- bounded memory and deletion backpressure.
        await flush();
      }
    }
    await flush();
  } finally {
    lines.close();
    input.destroy();
  }
};

/** Purge one due receipt, or audit a completed one for late transfers. */
export const purgeDeletedProject = async (
  args: Dependencies & {
    projectId: string;
    at?: Date;
    dryRun?: boolean;
    objectBound?: number;
    confirmation?: { ownerId: string; projectId: string; fingerprint: string };
  },
): Promise<ProjectPurgeOutcome> => {
  assertSingletonProcessGroup();
  const at = args.at ?? new Date();
  const deletion = await readProjectDeletion(args.database, args.projectId);
  if (!deletion?.deletedAt || !deletion.purgeAfter || deletion.purgeAfter > at) {
    return { projectId: args.projectId, status: 'pending' };
  }
  locatorFor(deletion, args.driver);
  const directory = await mkdtemp(path.join(tmpdir(), 'tau-project-purge-'));
  try {
    const file = path.join(directory, 'keys.jsonl');
    const plan = await planInventory(args, deletion, file);
    if (args.dryRun) {
      return { projectId: args.projectId, status: 'planned', plan };
    }
    if (plan.objects > 0) {
      await args.database
        .update(projectDeletion)
        .set({ purgedAt: null })
        .where(eq(projectDeletion.projectId, args.projectId));
    }
    const { confirmation } = args;
    if (
      plan.objects > (args.objectBound ?? projectPurgeObjectBound) &&
      (confirmation?.ownerId !== deletion.ownerId ||
        confirmation.projectId !== args.projectId ||
        confirmation.fingerprint !== plan.fingerprint)
    ) {
      return { projectId: args.projectId, status: 'refused', plan };
    }
    // A second inventory refuses changed approval before any shared reference or object is removed.
    const verified = await planInventory(args, deletion);
    if (verified.fingerprint !== plan.fingerprint) {
      throw new Error('Project purge inventory changed; review a fresh plan');
    }
    await releaseDeletedProjectPublicationReferences({
      database: args.database,
      storage: args.driver,
      projectId: args.projectId,
      at,
    });
    await scrubManifest(args, deletion);
    await deletePlan(args, deletion, file);
    const remaining = await planInventory(args, deletion);
    if (remaining.objects !== 0) {
      throw new Error('Project purge has residual objects; retry required');
    }
    await withOwnerLock(args.database, deletion.ownerId, async (transaction) => {
      await lockProjectLifecycle(transaction, args.projectId);
      await transaction.delete(projectGitLfsObject).where(eq(projectGitLfsObject.projectId, args.projectId));
      await transaction.delete(projectGit).where(eq(projectGit.projectId, args.projectId));
      await transaction
        .update(projectDeletion)
        .set({
          purgedAt: at,
          retainedBytes: 0,
          lastError: null,
          purgedObjects: sql`coalesce(${projectDeletion.purgedObjects}, 0) + ${plan.objects}`,
          purgedBytes: sql`coalesce(${projectDeletion.purgedBytes}, 0) + ${plan.bytes}`,
        })
        .where(eq(projectDeletion.projectId, args.projectId));
    });
    return { projectId: args.projectId, status: 'purged', plan };
  } catch (error) {
    await args.database
      .update(projectDeletion)
      .set({ purgedAt: null, lastError: error instanceof Error ? error.name : 'ProjectPurgeError' })
      .where(eq(projectDeletion.projectId, args.projectId));
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

/** Keyset pages include completed receipts: an expired upload must not leave a permanent orphan. */
export const purgeDeletedProjects = async function* (
  args: Dependencies & { at?: Date },
): AsyncGenerator<ProjectPurgeOutcome> {
  assertSingletonProcessGroup();
  const at = args.at ?? new Date();
  let cursor = '';
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each page advances beyond failures and previously completed receipts.
    const rows = await args.database
      .select({ projectId: projectDeletion.projectId })
      .from(projectDeletion)
      .where(
        and(
          isNotNull(projectDeletion.deletedAt),
          lte(projectDeletion.purgeAfter, at),
          gt(projectDeletion.projectId, cursor),
        ),
      )
      .orderBy(asc(projectDeletion.projectId))
      .limit(100);
    if (rows.length === 0) {
      return;
    }
    cursor = rows.at(-1)!.projectId;
    for (const row of rows) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one project in memory, and one shared-reference release at a time.
        yield await purgeDeletedProject({ ...args, projectId: row.projectId, at });
      } catch {
        yield { projectId: row.projectId, status: 'pending' };
      }
    }
  }
};
