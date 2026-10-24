import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { dependencyKeys, extendDependencies, indexVersions, retentionClock } from '#api/git/mirror/copier.js';
import type { CopierContext, VersionIndex } from '#api/git/mirror/copier.js';
import { MirrorFailure, failAt } from '#api/git/mirror/failure.js';
import { lfsPrefix, parseSnapshotKey, repositoryPrefix } from '#api/git/mirror/keys.js';
import type { CopyCandidate } from '#api/git/mirror/watermark.js';

/**
 * The daily retention sweep (W13 B6, Finding 2): a repository nobody writes gets
 * no copy round, so without this its locks would lapse 30 days after its last
 * push. Every live repository whose earliest lock has fewer than 20 days left has
 * its newest snapshot and every dependency extended to now + 30 days.
 *
 * "Live" excludes every owner with a `storage_tombstone` row, so erasure is never
 * postponed (B6), and rows whose project is gone are simply absent. The snapshot
 * extended is the one whose SHA-256 the copier recorded, read from the copy
 * itself, so a forged newer snapshot (a stolen copy key) is never what keeps a
 * repository locked.
 */

export type SweepResult = { readonly swept: number; readonly failed: number };

/** The recorded snapshot among the copy's versions: the one whose bytes hash to `sha256Hex`. */
// oxlint-disable-next-line max-params -- one repository's sweep step, over its listing
export const trustedSnapshot = async (
  context: CopierContext,
  locator: RepositoryLocator,
  candidate: CopyCandidate,
  repository: VersionIndex,
): Promise<Manifest> => {
  const prefix = repositoryPrefix(locator);
  for (const [key, versions] of repository.versions) {
    const parsed = parseSnapshotKey(key.slice(prefix.length));
    if (parsed?.generation !== candidate.copiedGeneration) {
      continue;
    }
    for (const version of versions) {
      // oxlint-disable-next-line no-await-in-loop -- one or two versions of one key
      const bytes = new Uint8Array(await buffer(await context.destination.get(key, version.versionId, context.signal)));
      if (createHash('sha256').update(bytes).digest('hex') === candidate.copiedManifestSha256) {
        return decodeManifest(bytes);
      }
    }
  }
  throw new MirrorFailure(
    'retention',
    'checksum',
    `no snapshot of generation ${String(candidate.copiedGeneration)} in the copy matches the recorded SHA-256`,
  );
};

/** Extends one idle repository; returns the lock it now holds. */
export const sweepRepository = async (context: CopierContext, candidate: CopyCandidate): Promise<Date> => {
  const locator = repositoryLocator({
    ownerId: candidate.ownerId,
    projectId: candidate.projectId,
  });
  const clock = retentionClock(context);
  const repository = await indexVersions(context.destination, repositoryPrefix(locator), context.signal);
  let manifest: Manifest;
  try {
    manifest = await trustedSnapshot(context, locator, candidate, repository);
  } catch (error) {
    throw failAt('retention', error);
  }
  const lfsIndex = await indexVersions(context.destination, lfsPrefix(locator), context.signal);
  const lfs = await context.ledger.copiedLfs(candidate.projectId);
  const lockedUntil = await extendDependencies(context, {
    keys: dependencyKeys(locator, manifest, repository, lfs),
    indexes: [repository, lfsIndex],
    written: new Map(),
    clock,
  });
  try {
    await context.ledger.advanceLock(candidate.projectId, candidate.copiedGeneration, lockedUntil);
  } catch (error) {
    throw failAt('watermark', error);
  }
  return lockedUntil;
};

/** One sweep over every live repository below the floor, in project order. */
export const runRetentionSweep = async (context: CopierContext, pageSize = 200): Promise<SweepResult> => {
  const { floor } = retentionClock(context);
  let swept = 0;
  let failed = 0;
  let after: string | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- keyset pages
    const page = await context.ledger.sweepCandidates(floor, pageSize, after);
    if (page.length === 0) {
      break;
    }
    for (const candidate of page) {
      context.signal?.throwIfAborted();
      try {
        // oxlint-disable-next-line no-await-in-loop -- one repository at a time; the calls are free and bounded
        await sweepRepository(context, candidate);
        swept += 1;
      } catch (error) {
        const failure = failAt('retention', error);
        failed += 1;
        context.metrics.failure(failure.stage, failure.reason);
        context.report?.({
          event: 'tau_mirror.sweep_failed',
          projectId: candidate.projectId,
          stage: failure.stage,
          reason: failure.reason,
          error: failure.message,
        });
      }
    }
    after = page.at(-1)?.projectId;
  }
  context.report?.({ event: 'tau_mirror.retention_sweep', swept, failed });
  return { swept, failed };
};
