import { addAbortSignal } from 'node:stream';
import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { DatabaseType } from '#database/database.service.js';
import { lockProjectLifecycle, readProjectDeletion } from '#database/project-lifecycle.js';
import { blobRef, projectDeletionManifest, publication } from '#database/schema.js';
import type { StoredPublicationManifest } from '#api/publications/publications.dto.js';
import { storedPublicationManifestSchema } from '#api/publications/publications.dto.js';
import type { ObjectStorageServiceContract } from '#storage/object-storage.service.js';

/** Milliseconds allowed for fetching and reading one immutable manifest. */
export const publicationManifestReadTimeout = 10_000;

/** Read exactly the provider-declared object length with a bounded storage deadline.
 * Publication paths have no byte-length ceiling, so a fixed 1 MiB limit would
 * strand valid publications. The private store's Content-Length is the bound;
 * reject a missing length or a truncated/overlong stream rather than guessing.
 */
const readRetiredManifest = async (
  storage: Pick<ObjectStorageServiceContract, 'getBlob'>,
  manifestKey: string,
): Promise<StoredPublicationManifest> => {
  const signal = AbortSignal.timeout(publicationManifestReadTimeout);
  const stored = await storage.getBlob({ namespace: 'derivatives', key: manifestKey, tier: 'private', signal });
  try {
    addAbortSignal(signal, stored.body);
    const expectedLength = stored.contentLength;
    if (expectedLength === undefined || !Number.isSafeInteger(expectedLength) || expectedLength < 0) {
      throw new Error('Captured publication manifest has no trustworthy content length');
    }
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let length = 0;
    for await (const chunk of stored.body) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Captured publication manifest contains a non-byte chunk');
      }
      length += chunk.byteLength;
      if (length > expectedLength) {
        throw new Error('Captured publication manifest exceeds its declared content length');
      }
      chunks.push(new Uint8Array(chunk));
    }
    if (length !== expectedLength) {
      throw new Error('Captured publication manifest is truncated');
    }
    return storedPublicationManifestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } finally {
    stored.body.destroy();
  }
};

/** Release captured publication references without deleting shared bytes or provenance.
 *
 * The work row and decrements commit together. A crash before commit releases
 * nothing; a retry after commit sees releasedAt and never decrements again.
 * Missing manifests or counts are corruption, not evidence of completed work.
 * Only the existing zero-count collector may remove content-addressed blobs.
 *
 * @param args - Database, private manifest reader and the deleted project identity.
 * @returns Number of manifests newly released by this invocation.
 */
export const releaseDeletedProjectPublicationReferences = async (args: {
  database: DatabaseType;
  storage: Pick<ObjectStorageServiceContract, 'getBlob'>;
  projectId: string;
  at?: Date;
}): Promise<number> => {
  const at = args.at ?? new Date();
  let released = 0;
  // Page work rather than keeping every manifest in memory for a large project.
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- bounded pages, processed and released before reading another.
    const candidates = await args.database
      .select()
      .from(projectDeletionManifest)
      .where(and(eq(projectDeletionManifest.projectId, args.projectId), isNull(projectDeletionManifest.releasedAt)))
      .orderBy(asc(projectDeletionManifest.publicationId), asc(projectDeletionManifest.manifestKey))
      .limit(100);
    if (candidates.length === 0) {
      return released;
    }
    for (const candidate of candidates) {
      const identity = and(
        eq(projectDeletionManifest.projectId, args.projectId),
        eq(projectDeletionManifest.publicationId, candidate.publicationId),
        eq(projectDeletionManifest.manifestKey, candidate.manifestKey),
      );
      let failureStage = 'lifecycle-check';
      try {
        // oxlint-disable-next-line no-await-in-loop -- one manifest transaction at a time bounds memory and lock occupancy.
        released += await args.database.transaction(async (transaction) => {
          await lockProjectLifecycle(transaction, args.projectId);
          const deletion = await readProjectDeletion(transaction, args.projectId);
          if (
            !deletion?.deletedAt ||
            !deletion.fencedAt ||
            !deletion.purgeAfter ||
            deletion.purgeAfter > at ||
            !Number.isFinite(at.getTime())
          ) {
            throw new Error(
              'Publication reference retirement requires a completed deletion past its retention deadline',
            );
          }
          const [work] = await transaction.select().from(projectDeletionManifest).where(identity).for('update');
          if (work === undefined || work.releasedAt !== null) {
            return 0;
          }
          failureStage = 'manifest-read-or-validation';
          const prefix = `publications/${work.publicationId}/`;
          if (
            !work.manifestKey.startsWith(prefix) ||
            !/^(?:[\da-f]{40}|[\da-f]{64})\.json$/u.test(work.manifestKey.slice(prefix.length))
          ) {
            throw new Error('Captured publication manifest key is invalid');
          }
          const manifest = await readRetiredManifest(args.storage, work.manifestKey);
          if (manifest.projectId !== args.projectId) {
            throw new Error('Captured publication manifest belongs to another project');
          }
          const multiplicities = new Map<string, number>();
          for (const reference of Object.values(manifest.files)) {
            const digest = /^sha256:([\da-f]{64})$/u.exec(reference)?.[1];
            if (digest === undefined) {
              throw new Error('Captured publication manifest contains an invalid blob digest');
            }
            multiplicities.set(digest, (multiplicities.get(digest) ?? 0) + 1);
          }
          failureStage = 'reference-count-release';
          for (const [digest, count] of [...multiplicities].sort(([left], [right]) => (left < right ? -1 : 1))) {
            // oxlint-disable-next-line no-await-in-loop -- acquire shared blob locks in the publisher's sorted digest order.
            const decremented = await transaction
              .update(blobRef)
              .set({ refcount: sql`${blobRef.refcount} - ${count}` })
              .where(and(eq(blobRef.sha256, digest), gte(blobRef.refcount, count)))
              .returning({ sha256: blobRef.sha256 });
            if (decremented.length !== 1) {
              throw new Error(`Captured publication manifest has missing or insufficient references for ${digest}`);
            }
          }
          failureStage = 'retirement-commit';
          await transaction
            .update(publication)
            .set({ manifestKey: '' })
            .where(
              and(
                eq(publication.id, work.publicationId),
                eq(publication.projectId, args.projectId),
                eq(publication.manifestKey, work.manifestKey),
              ),
            );
          await transaction.update(projectDeletionManifest).set({ releasedAt: at, lastError: null }).where(identity);
          return 1;
        });
      } catch (error) {
        // No provider/SQL message or content enters the durable diagnostic. A
        // concurrent successful retry wins over this failed attempt's receipt.
        // oxlint-disable-next-line no-await-in-loop -- persist this work item's diagnostic after its transaction rolled back.
        await args.database
          .update(projectDeletionManifest)
          .set({ lastError: failureStage })
          .where(and(identity, isNull(projectDeletionManifest.releasedAt)));
        throw error;
      }
    }
  }
};
