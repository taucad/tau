import { repositoryLocator } from '#api/git/store/locator.js';
import { indexKeyFor } from '#api/git/store/manifest.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { indexVersions, retentionClock } from '#api/git/mirror/copier.js';
import type { CopierContext, VersionIndex } from '#api/git/mirror/copier.js';
import type { DestinationVersion } from '#api/git/mirror/destination.js';
import { failAt, reasonOf } from '#api/git/mirror/failure.js';
import { lfsPrefix, repositoryKey, repositoryPrefix } from '#api/git/mirror/keys.js';
import type { MirrorObjectKind } from '#api/git/mirror/metrics.js';
import { packNameHash, transferObject } from '#api/git/mirror/transfer.js';
import type { CopyCandidate } from '#api/git/mirror/watermark.js';

/**
 * The reconciler (W13 B4, B6, B12; Finding 2 "Lag, precisely"): the backstop
 * that does not trust the poll path.
 *
 * - **Lost receipts.** It reads R2's manifest generation for every repository
 *   written in the last 48 hours (`active`, daily) or every repository (`full`,
 *   weekly), and starts the lag clock wherever the store is ahead of the copy.
 * - **Retired packs.** It copies `retired/` markers and the packs they name while
 *   the primary still holds them (30 days), so logical-corruption recovery has
 *   them in the copy too. They are locked from upload and never extended.
 * - **Missing objects.** It counts, by kind, what a copied snapshot names (or a
 *   retired marker records) that R2 holds and the copy does not.
 * - **Security.** It counts hide markers, which the copier never writes, and
 *   reports the furthest lock it sees: above 30 days ahead something other than
 *   the copier extended a lock (W13 Risks), and `storage-b2-lock-overlong` pages.
 *
 * It never deletes and never hides. Everything it learns about the copy comes
 * from version listing.
 */

const hours = (count: number): number => count * 60 * 60 * 1000;

const retiredPattern = /^retired\/\d+-(pack-[\w.-]+\.pack)$/u;

export type ReconcileScope = 'active' | 'full';

export type ReconcileResult = {
  readonly repositories: number;
  /** Repositories the pass could not reconcile; each is counted and reported, and the pass goes on. */
  readonly failed: number;
  readonly storeAhead: number;
  readonly retiredCopied: number;
  readonly missing: Readonly<Partial<Record<MirrorObjectKind, number>>>;
  readonly hidden: number;
  readonly maxRetainUntil: Date | undefined;
  readonly storedBytes?: number;
  readonly objectVersions?: number;
};

type Tally = {
  repositories: number;
  failed: number;
  storeAhead: number;
  retiredCopied: number;
  missing: Partial<Record<MirrorObjectKind, number>>;
  hidden: number;
  maxRetainUntil: Date | undefined;
};

const countMissing = (tally: Tally, kind: MirrorObjectKind): void => {
  tally.missing[kind] = (tally.missing[kind] ?? 0) + 1;
};

const holds = (index: VersionIndex, key: string): boolean => (index.versions.get(key)?.length ?? 0) > 0;

/** Bounded concurrency for the `HEAD`s that read each version's lock. */
const eachLimited = async <T>(items: readonly T[], limit: number, run: (item: T) => Promise<void>): Promise<void> => {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next]!;
        next += 1;
        // oxlint-disable-next-line no-await-in-loop -- a worker of a bounded pool
        await run(item);
      }
    }),
  );
};

/** The furthest retain-until among `versions`, read one `HEAD` per version. */
const furthestLock = async (
  context: CopierContext,
  versions: readonly DestinationVersion[],
): Promise<Date | undefined> => {
  let furthest: Date | undefined;
  await eachLimited(versions, 8, async (version) => {
    const head = await context.destination.head(version.key, version.versionId, context.signal);
    if (head?.retainUntil !== undefined && (furthest === undefined || head.retainUntil > furthest)) {
      furthest = head.retainUntil;
    }
  });
  return furthest;
};

const later = (left: Date | undefined, right: Date | undefined): Date | undefined =>
  left === undefined ? right : right === undefined || left > right ? left : right;

/** Copies the retired markers and packs the copy lacks; counts what it could not copy. */
// oxlint-disable-next-line max-params -- one repository's step of the pass, over the pass's tally
const reconcileRetired = async (
  context: CopierContext,
  locator: RepositoryLocator,
  repository: VersionIndex,
  tally: Tally,
): Promise<void> => {
  const { until } = retentionClock(context);
  for await (const object of context.source.list(locator, 'retired/')) {
    const packName = retiredPattern.exec(object.key)?.[1];
    if (packName === undefined) {
      continue;
    }
    const entries: Array<{
      key: string;
      kind: MirrorObjectKind;
      sha1?: string;
      optional: boolean;
    }> = [
      { key: object.key, kind: 'retired_marker', optional: false },
      {
        key: `packs/${packName}`,
        kind: 'pack',
        sha1: packNameHash(`packs/${packName}`) ?? '',
        optional: true,
      },
      { key: indexKeyFor(`packs/${packName}`), kind: 'idx', optional: true },
    ];
    for (const entry of entries) {
      const key = repositoryKey(locator, entry.key);
      if (holds(repository, key)) {
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- one object at a time per repository
        const copied = await transferObject({
          destination: context.destination,
          key,
          open: async () => context.source.open(locator, entry.key),
          verification: entry.sha1 === undefined ? { kind: 'none' } : { kind: 'pack', sha1: entry.sha1 },
          retainUntil: until,
          ...(context.bufferLimit === undefined ? {} : { bufferLimit: context.bufferLimit }),
        });
        context.metrics.copied(entry.kind, copied.bytes);
        tally.retiredCopied += 1;
      } catch (error) {
        const failure = failAt('source_read', error);
        // A retired pack the primary has already swept, or one never given a stored index, is not missing.
        if (entry.optional && failure.reason === 'source_missing') {
          continue;
        }
        context.metrics.failure(failure.stage, failure.reason);
        countMissing(tally, entry.kind);
      }
    }
  }
};

// oxlint-disable-next-line max-params -- one repository's step of the pass, over the pass's tally
const reconcileRepository = async (
  context: CopierContext,
  candidate: CopyCandidate,
  scope: ReconcileScope,
  tally: Tally,
): Promise<void> => {
  const locator = repositoryLocator({
    ownerId: candidate.ownerId,
    projectId: candidate.projectId,
  });
  const read = await context.source.readManifest(locator);
  const repository = await indexVersions(context.destination, repositoryPrefix(locator), context.signal);
  tally.repositories += 1;
  if (scope === 'active') {
    // The full scope counts hide markers and locks once, over the whole bucket.
    const lfsIndex = await indexVersions(context.destination, lfsPrefix(locator), context.signal);
    tally.hidden += repository.hidden + lfsIndex.hidden;
    const versions = [...repository.versions.values(), ...lfsIndex.versions.values()].flat();
    tally.maxRetainUntil = later(tally.maxRetainUntil, await furthestLock(context, versions));
  }
  if (read === undefined) {
    return;
  }
  const { manifest } = read;
  if (manifest.generation > candidate.copiedGeneration) {
    tally.storeAhead += 1;
    await context.ledger.markStoreAhead(candidate.projectId, manifest.generation);
  }
  await reconcileRetired(context, locator, repository, tally);
  if (manifest.generation !== candidate.copiedGeneration || manifest.tombstone !== null) {
    return;
  }
  for (const pack of manifest.packs) {
    if (!holds(repository, repositoryKey(locator, pack.key))) {
      countMissing(tally, 'pack');
    }
    if (pack.indexStored && !holds(repository, repositoryKey(locator, indexKeyFor(pack.key)))) {
      countMissing(tally, 'idx');
    }
  }
  if (manifest.earlierPushes !== null && !holds(repository, repositoryKey(locator, manifest.earlierPushes))) {
    countMissing(tally, 'segment');
  }
};

/** The whole bucket's versions, hide markers and furthest lock: the full scope's security pass. */
const scanBucket = async (
  context: CopierContext,
  tally: Tally,
): Promise<{ storedBytes: number; objectVersions: number }> => {
  let storedBytes = 0;
  let objectVersions = 0;
  let batch: DestinationVersion[] = [];
  const flush = async (): Promise<void> => {
    tally.maxRetainUntil = later(tally.maxRetainUntil, await furthestLock(context, batch));
    batch = [];
  };
  for await (const version of context.destination.listVersions('tenants/', context.signal)) {
    if (version.isHideMarker) {
      tally.hidden += 1;
      continue;
    }
    storedBytes += version.bytes;
    objectVersions += 1;
    batch.push(version);
    if (batch.length >= 1000) {
      // oxlint-disable-next-line no-await-in-loop -- bounded batches keep memory flat over the whole bucket
      await flush();
    }
  }
  await flush();
  return { storedBytes, objectVersions };
};

/** One reconcile pass. Its gauges are recorded only when it completes. */
export const reconcile = async (
  context: CopierContext,
  scope: ReconcileScope,
  pageSize = 200,
): Promise<ReconcileResult> => {
  const { at } = retentionClock(context);
  const tally: Tally = {
    repositories: 0,
    failed: 0,
    storeAhead: 0,
    retiredCopied: 0,
    missing: {},
    hidden: 0,
    maxRetainUntil: undefined,
  };
  const since = scope === 'active' ? new Date(at.getTime() - hours(48)) : undefined;
  let after: string | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- keyset pages
    const page = await context.ledger.reconcileCandidates(since, pageSize, after);
    if (page.length === 0) {
      break;
    }
    for (const candidate of page) {
      context.signal?.throwIfAborted();
      try {
        // oxlint-disable-next-line no-await-in-loop -- one repository at a time
        await reconcileRepository(context, candidate, scope, tally);
      } catch (error) {
        context.signal?.throwIfAborted();
        tally.failed += 1;
        const reason = reasonOf(error);
        context.metrics.failure('reconcile', reason);
        context.report?.({
          event: 'tau_mirror.reconcile_repository_failed',
          scope,
          projectId: candidate.projectId,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    after = page.at(-1)?.projectId;
  }
  const totals = scope === 'full' ? await scanBucket(context, tally) : undefined;
  const result: ReconcileResult = { ...tally, ...totals };
  context.metrics.reconciled(scope, {
    at,
    missing: result.missing,
    hidden: result.hidden,
    maxAheadSeconds:
      result.maxRetainUntil === undefined
        ? undefined
        : Math.max(0, (result.maxRetainUntil.getTime() - at.getTime()) / 1000),
    ...totals,
  });
  if (result.hidden > 0) {
    context.report?.({
      event: 'tau_mirror.hidden_versions',
      scope,
      count: result.hidden,
    });
  }
  context.report?.({
    event: 'tau_mirror.reconcile',
    scope,
    repositories: result.repositories,
    failed: result.failed,
    storeAhead: result.storeAhead,
    retiredCopied: result.retiredCopied,
    missing: result.missing,
    hidden: result.hidden,
  });
  return result;
};
