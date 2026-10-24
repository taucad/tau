import { describe, expect, it } from 'vitest';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { copyRepository, markTombstonedOwners } from '#api/git/mirror/copier.js';
import type { CopierContext } from '#api/git/mirror/copier.js';
import { lfsKey, ownerMarkerKey, repositoryKey, repositoryPrefix, snapshotKey } from '#api/git/mirror/keys.js';
import { day, harness, last, sha256Hex, total } from '#api/git/mirror/mirror.fixture.js';
import type { FakeSource, Harness } from '#api/git/mirror/mirror.fixture.js';
import { runRetentionSweep } from '#api/git/mirror/retention.js';
import { exportBacklog } from '#api/git/mirror/worker.js';

const alice = repositoryLocator({
  ownerId: 'user_alice',
  projectId: 'proj_one',
});

/** One push to the primary, recorded in Postgres the way `recordGeneration` does. */
const push = (h: Harness, locator: RepositoryLocator = alice, options: { compact?: boolean } = {}) => {
  const manifest = h.source.push(locator, h.time.now(), options);
  h.ledger.recordGeneration(locator, manifest.generation);
  return manifest;
};

const round = async (h: Harness, locator: RepositoryLocator = alice, context: CopierContext = h.context) => {
  const candidate = await h.ledger.candidate(locator.projectId);
  if (candidate === undefined) {
    throw new Error('no candidate');
  }
  return copyRepository(context, candidate);
};

const snapshotsOf = (h: Harness, locator: RepositoryLocator = alice): string[] =>
  h.destination.keys(`${repositoryPrefix(locator)}manifests/`);

/** The furthest compliance lock anywhere in the copy, against the harness clock. */
const furthestLockAhead = (h: Harness): number =>
  Math.max(
    0,
    ...[...h.destination.objects.values()]
      .flat()
      .map((version) => version.retainUntil.getTime() - h.time.now().getTime()),
  );

const sourceManifestBytes = (h: Harness, locator: RepositoryLocator = alice): Uint8Array<ArrayBuffer> =>
  h.source.manifests.get(`${locator.ownerId}/${locator.projectId}/`)!;

describe('copyRepository', () => {
  it('should write the snapshot only after every pack and index it names is copied and verified', async () => {
    const h = harness();
    push(h);
    const manifest = push(h);

    const result = await round(h);

    expect(result).toStrictEqual({
      outcome: 'copied',
      generation: 2,
      objects: 5,
    });
    const snapshot = snapshotKey(alice, 2, manifest.incarnation);
    expect(h.destination.putKeys.at(-1)).toBe(snapshot);
    expect(h.destination.putKeys.slice(0, -1).sort()).toStrictEqual(
      manifest.packs
        .flatMap((pack) => [repositoryKey(alice, pack.key), repositoryKey(alice, `${pack.key.slice(0, -5)}.idx`)])
        .sort(),
    );
    expect(snapshot).toMatch(/manifests\/00000000000000000002-[\da-f]{32}\.json$/u);
    expect(h.destination.keys().some((key) => key.endsWith('/manifest.json'))).toBe(false);
  });

  it('should record the SHA-256 of exactly the snapshot it wrote, which is byte for byte the primary manifest', async () => {
    const h = harness();
    const manifest = push(h);

    await round(h);

    const written = h.destination.latest(snapshotKey(alice, 1, manifest.incarnation))!;
    expect(h.ledger.row('proj_one').copiedManifestSha256).toBe(sha256Hex(written.bytes));
    expect(sha256Hex(written.bytes)).toBe(sha256Hex(sourceManifestBytes(h)));
    expect(h.ledger.row('proj_one')).toMatchObject({
      copiedGeneration: 1,
      copyPendingSince: undefined,
    });
  });

  it('should refuse a pack that does not hash to its name and leave the watermark where it was', async () => {
    const h = harness();
    const manifest = push(h);
    const key = `${alice.ownerId}/${alice.projectId}/${manifest.packs[0]!.key}`;
    const bytes = h.source.objects.get(key)!;
    bytes[5] = 255 - (bytes[5] ?? 0);

    const result = await round(h);

    expect(result).toMatchObject({
      outcome: 'failed',
      failure: { stage: 'verify', reason: 'checksum' },
    });
    expect(snapshotsOf(h)).toStrictEqual([]);
    expect(h.ledger.row('proj_one').copiedGeneration).toBe(0);
  });

  // Three pushes: three packs, three indexes, then the snapshot: seven puts.
  it.each([1, 2, 3, 4, 5, 6, 7])(
    'should leave the watermark unchanged when the copy crashes at put %i, and finish on the next round',
    async (failAt) => {
      const h = harness();
      push(h);
      push(h);
      const manifest = push(h);
      h.destination.failPutAt = failAt;

      const crashed = await round(h);

      expect(crashed).toMatchObject({
        outcome: 'failed',
        failure: { stage: 'dest_write', reason: 'http_5xx' },
      });
      expect(h.ledger.row('proj_one')).toMatchObject({
        copiedGeneration: 0,
        copiedManifestSha256: undefined,
      });
      expect(h.ledger.row('proj_one').copyPendingSince).toBeDefined();
      expect(snapshotsOf(h)).toStrictEqual([]);

      const finished = await round(h);

      expect(finished).toMatchObject({ outcome: 'copied', generation: 3 });
      expect(h.ledger.row('proj_one')).toMatchObject({
        copiedGeneration: 3,
        copyPendingSince: undefined,
      });
      expect(snapshotsOf(h)).toStrictEqual([snapshotKey(alice, 3, manifest.incarnation)]);
      // What landed before the crash is found by version listing, not written twice.
      for (const key of h.destination.keys()) {
        expect(h.destination.objects.get(key)).toHaveLength(1);
      }
    },
  );

  it('should copy a burst of ten generations as one snapshot of the newest', async () => {
    const h = harness();
    for (let index = 0; index < 10; index += 1) {
      push(h);
    }

    const result = await round(h);

    expect(result).toMatchObject({ outcome: 'copied', generation: 10 });
    expect(snapshotsOf(h)).toHaveLength(1);
    expect(snapshotsOf(h)[0]).toContain('manifests/00000000000000000010-');
    expect(total(h.recorded, 'tau.mirror.objects_copied', { kind: 'manifest' })).toBe(1);
  });

  it('should count source_missing and not advance when Postgres records a generation the primary lacks', async () => {
    const h = harness();
    h.ledger.recordGeneration(alice, 4);

    const result = await round(h);

    expect(result).toMatchObject({
      outcome: 'failed',
      failure: { stage: 'source_read', reason: 'source_missing' },
    });
    expect(h.ledger.row('proj_one').copiedGeneration).toBe(0);
    expect(
      total(h.recorded, 'tau.mirror.copy_failures', {
        stage: 'source_read',
        reason: 'source_missing',
      }),
    ).toBe(1);
    expect(
      total(h.recorded, 'tau.mirror.rounds', {
        outcome: 'failed',
        destination: 'b2',
      }),
    ).toBe(1);
  });

  it('should count source_missing and write no snapshot when a pack the manifest names is gone from the primary', async () => {
    const h = harness();
    const manifest = push(h);
    h.source.objects.delete(`${alice.ownerId}/${alice.projectId}/${manifest.packs[0]!.key}`);

    const result = await round(h);

    expect(result).toMatchObject({
      outcome: 'failed',
      failure: { stage: 'source_read', reason: 'source_missing' },
    });
    expect(snapshotsOf(h)).toStrictEqual([]);
    expect(h.ledger.row('proj_one').copiedGeneration).toBe(0);
  });

  it('should copy the push-log segments a long history spills, back to the first the copy holds', async () => {
    const h = harness();
    let manifest = push(h);
    while (manifest.earlierPushes === null) {
      manifest = push(h, alice, { compact: true });
    }
    await round(h);
    const firstSegment = manifest.earlierPushes;
    do {
      manifest = push(h, alice, { compact: true });
    } while (manifest.earlierPushes === firstSegment);

    await round(h);

    expect(h.destination.keys(`${repositoryPrefix(alice)}pushes/`)).toStrictEqual(
      [repositoryKey(alice, firstSegment), repositoryKey(alice, manifest.earlierPushes!)].sort(),
    );
    expect(total(h.recorded, 'tau.mirror.objects_copied', { kind: 'segment' })).toBe(2);
  });

  it('should copy LFS finalized by the commit and not wait for LFS finalized after it', async () => {
    const h = harness();
    const before = h.source.addLfs(alice, 'finalized before the push');
    h.ledger.addLfsRow(alice, before, new Date(h.time.now().getTime() - 1000));
    const after = h.source.addLfs(alice, 'finalized after the push');
    h.ledger.addLfsRow(alice, after, new Date(h.time.now().getTime() + 1000));
    h.ledger.addLfsRow(alice, { oid: 'f'.repeat(64), sizeBytes: 3 });
    push(h);

    const result = await round(h);

    expect(result).toMatchObject({ outcome: 'copied', generation: 1 });
    expect(h.destination.keys(`tenants/${alice.ownerId}/lfs/`)).toStrictEqual([lfsKey(alice, before.oid)]);
    expect([...(await h.ledger.copiedLfs('proj_one'))]).toStrictEqual([before.oid]);

    h.time.advance(2000);
    push(h);
    await round(h);

    expect(h.destination.keys(`tenants/${alice.ownerId}/lfs/`)).toStrictEqual(
      [lfsKey(alice, before.oid), lfsKey(alice, after.oid)].sort(),
    );
  });

  it('should not advance past an LFS object finalized by the commit that the primary does not hold', async () => {
    const h = harness();
    h.ledger.addLfsRow(alice, { oid: 'a'.repeat(64), sizeBytes: 10 }, new Date(h.time.now().getTime() - 1000));
    push(h);

    const result = await round(h);

    expect(result).toMatchObject({
      outcome: 'failed',
      failure: { stage: 'source_read', reason: 'source_missing' },
    });
    expect(snapshotsOf(h)).toStrictEqual([]);
    expect(h.ledger.row('proj_one').copiedGeneration).toBe(0);
  });

  it('should never let a copier holding an older generation regress the watermark', async () => {
    const h = harness();
    push(h);
    push(h);
    push(h);
    const staleBytes = sourceManifestBytes(h);
    const stale = await h.ledger.candidate('proj_one');
    push(h);

    // Copier B copies generation 4; copier A, which read generation 3 before B started, finishes after it.
    await round(h);
    const recorded = { ...h.ledger.row('proj_one') };
    const staleSource = Object.assign(Object.create(h.source) as FakeSource, {
      readManifest: async () => ({
        bytes: staleBytes,
        manifest: decodeManifest(staleBytes),
      }),
    });
    const late = await copyRepository({ ...h.context, source: staleSource }, stale!);

    expect(late).toMatchObject({ outcome: 'copied', generation: 3 });
    expect(h.ledger.row('proj_one')).toMatchObject({
      copiedGeneration: 4,
      copiedManifestSha256: recorded.copiedManifestSha256,
      copyLockedUntil: recorded.copyLockedUntil,
    });
  });

  it('should converge on the newest generation when two copiers race the same repository', async () => {
    const h = harness();
    push(h);
    push(h);
    const candidate = await h.ledger.candidate('proj_one');

    const results = await Promise.all([copyRepository(h.context, candidate!), copyRepository(h.context, candidate!)]);

    expect(results.map((result) => result.outcome)).toStrictEqual(['copied', 'copied']);
    expect(h.ledger.row('proj_one').copiedGeneration).toBe(2);
    expect(h.ledger.row('proj_one').copiedManifestSha256).toBe(sha256Hex(sourceManifestBytes(h)));
  });

  it('should settle a stale pending clock when the copy already holds the store generation', async () => {
    const h = harness();
    push(h);
    await round(h);
    await h.ledger.markStoreAhead('proj_one', 2);

    const result = await round(h);

    expect(result).toStrictEqual({ outcome: 'noop', generation: 1 });
    expect(h.ledger.row('proj_one').copyPendingSince).toBeUndefined();
  });
});

describe('copyRepository on a tombstoned repository', () => {
  it('should write the tombstone snapshot and the owner marker and extend nothing', async () => {
    const h = harness();
    push(h);
    await round(h);
    h.time.advance(15 * day);
    const deletedAt = h.time.now();
    h.ledger.tombstones.set(alice.ownerId, {
      ownerId: alice.ownerId,
      deletedAt,
      purgeAfter: new Date(deletedAt.getTime() + 30 * day),
      erasure: false,
      copyMarkedAt: undefined,
    });
    const tombstone = h.source.tombstone(alice, deletedAt);
    h.ledger.recordGeneration(alice, tombstone.generation);
    h.destination.calls.length = 0;

    const result = await round(h);

    expect(result).toMatchObject({ outcome: 'tombstoned', generation: 2 });
    expect(h.destination.calls).not.toContain('extendRetention');
    expect(h.destination.keys()).toContain(ownerMarkerKey(alice.ownerId, deletedAt));
    expect(snapshotsOf(h)).toContain(snapshotKey(alice, 2, tombstone.incarnation));
    expect(h.ledger.row('proj_one')).toMatchObject({
      copiedGeneration: 2,
      copyLockedUntil: undefined,
    });
    // The sweep skips the owner too, so the data's locks lapse on their own.
    expect(await runRetentionSweep(h.context)).toStrictEqual({
      swept: 0,
      failed: 0,
    });
    expect(total(h.recorded, 'tau.mirror.rounds', { outcome: 'tombstoned' })).toBe(1);
  });

  it('should mark a deleted owner with no repository rows within one pass, extending nothing', async () => {
    const h = harness();
    const deletedAt = h.time.now();
    h.ledger.tombstones.set('user_gone', {
      ownerId: 'user_gone',
      deletedAt,
      purgeAfter: deletedAt,
      erasure: true,
      copyMarkedAt: undefined,
    });

    expect(await markTombstonedOwners(h.context)).toBe(1);
    expect(await markTombstonedOwners(h.context)).toBe(0);

    const marker = h.destination.latest(ownerMarkerKey('user_gone', deletedAt))!;
    expect(JSON.parse(new TextDecoder().decode(marker.bytes))).toStrictEqual({
      format: 1,
      ownerId: 'user_gone',
      deletedAt: deletedAt.toISOString(),
      purgeAfter: deletedAt.toISOString(),
      erasure: true,
    });
    expect(h.ledger.tombstones.get('user_gone')?.copyMarkedAt).toStrictEqual(deletedAt);
    expect(h.destination.calls).not.toContain('extendRetention');
    expect(h.destination.putKeys).toHaveLength(1);
  });
});

describe('markTombstonedOwners', () => {
  it('should mark the other owners when one marker fails, and count the failure', async () => {
    const h = harness();
    const deletedAt = h.time.now();
    for (const ownerId of ['not a storable id', 'user_gone']) {
      h.ledger.tombstones.set(ownerId, {
        ownerId,
        deletedAt,
        purgeAfter: deletedAt,
        erasure: true,
        copyMarkedAt: undefined,
      });
    }

    expect(await markTombstonedOwners(h.context)).toBe(1);

    expect(h.destination.keys()).toStrictEqual([ownerMarkerKey('user_gone', deletedAt)]);
    expect(h.ledger.tombstones.get('not a storable id')?.copyMarkedAt).toBeUndefined();
    expect(total(h.recorded, 'tau.mirror.copy_failures', { stage: 'dest_write', reason: 'other' })).toBe(1);
    expect(h.events).toContainEqual(expect.objectContaining({ event: 'tau_mirror.owner_marker_failed' }));
  });

  it('should label a marker recorded in the copy but not in Postgres as a watermark failure, not a copy write', async () => {
    const h = harness();
    const deletedAt = h.time.now();
    h.ledger.tombstones.set('user_gone', {
      ownerId: 'user_gone',
      deletedAt,
      purgeAfter: deletedAt,
      erasure: true,
      copyMarkedAt: undefined,
    });
    h.ledger.markTombstone = async () => {
      throw new Error('connection terminated');
    };

    expect(await markTombstonedOwners(h.context)).toBe(0);

    expect(h.destination.keys()).toStrictEqual([ownerMarkerKey('user_gone', deletedAt)]);
    expect(total(h.recorded, 'tau.mirror.copy_failures', { stage: 'watermark', reason: 'other' })).toBe(1);
    expect(total(h.recorded, 'tau.mirror.copy_failures', { stage: 'dest_write' })).toBe(0);
  });
});

describe('rolling retention', () => {
  it('should lock every new version for exactly 30 days', async () => {
    const h = harness();
    push(h);

    await round(h);

    for (const version of [...h.destination.objects.values()].flat()) {
      expect(version.retainUntil.getTime() - h.time.now().getTime()).toBe(30 * day);
    }
    expect(h.ledger.row('proj_one').copyLockedUntil).toStrictEqual(new Date(h.time.now().getTime() + 30 * day));
  });

  it('should extend every dependency in a round only once the earliest lock is under 20 days away', async () => {
    const h = harness();
    push(h);
    await round(h);
    const firstLock = h.ledger.row('proj_one').copyLockedUntil;

    // Above the floor, only what the round reused (the first pack and its index) is extended; the recorded lock stands.
    h.time.advance(5 * day);
    push(h);
    h.destination.calls.length = 0;
    await round(h);
    expect(h.destination.calls.filter((call) => call === 'extendRetention')).toHaveLength(2);
    expect(h.ledger.row('proj_one').copyLockedUntil).toStrictEqual(firstLock);

    h.time.advance(6 * day);
    const newest = push(h);
    h.destination.calls.length = 0;
    await round(h);
    expect(h.destination.calls).toContain('extendRetention');

    // Every dependency of the newest snapshot now holds a full 30 days; older snapshots keep their own lock and lapse.
    const now = h.time.now().getTime();
    const newestSnapshot = snapshotKey(alice, newest.generation, newest.incarnation);
    for (const [key, versions] of h.destination.objects) {
      const olderSnapshot = key.includes('/manifests/') && key !== newestSnapshot;
      for (const version of versions) {
        expect(version.retainUntil.getTime()).toBe(
          olderSnapshot ? version.modifiedAt.getTime() + 30 * day : now + 30 * day,
        );
      }
    }
  });

  it('should lock a version a crashed round left, when a later snapshot reuses it, at least to the recorded lock', async () => {
    const h = harness();
    push(h);
    await round(h);

    // Day 1: a round uploads the new pack and its index, then crashes before the snapshot.
    h.time.advance(day);
    const second = push(h);
    h.destination.failPutAt = h.destination.calls.filter((call) => call === 'put').length + 3;
    expect(await round(h)).toMatchObject({ outcome: 'failed' });
    const leftover = repositoryKey(alice, second.packs.at(-1)!.key);
    expect(h.destination.latest(leftover)?.retainUntil).toStrictEqual(new Date(h.time.now().getTime() + 30 * day));

    // Day 11: the sweep carries the recorded snapshot's dependencies to day 41.
    h.time.advance(10 * day);
    await runRetentionSweep(h.context);

    // Day 12: the next round reuses the leftover pack instead of writing it again.
    h.time.advance(day);
    expect(await round(h)).toMatchObject({ outcome: 'copied', generation: 2 });

    const recorded = h.ledger.row('proj_one').copyLockedUntil!;
    expect(h.destination.objects.get(leftover)).toHaveLength(1);
    const manifest = h.source.manifestOf(alice)!;
    const dependencies = [
      snapshotKey(alice, manifest.generation, manifest.incarnation),
      ...manifest.packs.flatMap((pack) => [
        repositoryKey(alice, pack.key),
        repositoryKey(alice, `${pack.key.slice(0, -'.pack'.length)}.idx`),
      ]),
    ];
    for (const key of dependencies) {
      for (const version of h.destination.objects.get(key)!) {
        expect(version.retainUntil.getTime(), key).toBeGreaterThanOrEqual(recorded.getTime());
      }
    }
  });

  it('should not extend a live repository of an owner whose storage is tombstoned', async () => {
    const h = harness();
    push(h);
    await round(h);
    h.time.advance(11 * day);
    push(h);
    h.ledger.tombstones.set(alice.ownerId, {
      ownerId: alice.ownerId,
      deletedAt: h.time.now(),
      purgeAfter: h.time.now(),
      erasure: true,
      copyMarkedAt: h.time.now(),
    });
    h.destination.calls.length = 0;

    await round(h);

    expect(h.destination.calls).not.toContain('extendRetention');
    expect(h.ledger.row('proj_one').copyLockedUntil).toBeUndefined();
  });

  it('should keep a repository idle for 45 days locked through the daily sweep', async () => {
    const h = harness();
    push(h);
    push(h);
    await round(h);

    for (let elapsed = 1; elapsed <= 45; elapsed += 1) {
      h.time.advance(day);
      // oxlint-disable-next-line no-await-in-loop -- one sweep per simulated day
      const sweep = await runRetentionSweep(h.context);
      expect(sweep.failed).toBe(0);
      expect(furthestLockAhead(h)).toBeLessThanOrEqual(30 * day);
    }

    const now = h.time.now().getTime();
    for (const version of [...h.destination.objects.values()].flat()) {
      expect(version.retainUntil.getTime()).toBeGreaterThan(now + 20 * day);
    }
  });

  it('should let an idle repository lapse after 30 days without the sweep (the failure the sweep prevents)', async () => {
    const h = harness();
    push(h);
    await round(h);

    h.time.advance(45 * day);

    const now = h.time.now().getTime();
    for (const version of [...h.destination.objects.values()].flat()) {
      expect(version.retainUntil.getTime()).toBeLessThan(now);
    }
  });

  it('should never lock anything beyond now + 30 days', async () => {
    const h = harness();
    for (let pass = 0; pass < 12; pass += 1) {
      push(h);
      // oxlint-disable-next-line no-await-in-loop -- passes are sequential in time
      await round(h);
      // oxlint-disable-next-line no-await-in-loop -- same
      await runRetentionSweep(h.context);
      expect(furthestLockAhead(h)).toBeLessThanOrEqual(30 * day);
      h.time.advance(3 * day);
    }
  });
});

describe('lag', () => {
  it('should export the exact lag against the clock, then zero once copied', async () => {
    const h = harness();
    push(h);
    push(h);
    h.time.advance(125_000);

    await exportBacklog(h.context);

    expect(last(h.recorded, 'tau.mirror.copy_lag_seconds', { destination: 'b2' })).toBe(125);
    expect(last(h.recorded, 'tau.mirror.copy_lag_generations')).toBe(2);
    expect(last(h.recorded, 'tau.mirror.backlog_repositories', { phase: 'steady' })).toBe(1);
    expect(
      last(h.recorded, 'tau.mirror.backlog_repositories', {
        phase: 'backfill',
      }),
    ).toBe(0);

    await round(h);
    await exportBacklog(h.context);

    expect(last(h.recorded, 'tau.mirror.copy_lag_seconds')).toBe(0);
    expect(last(h.recorded, 'tau.mirror.copy_lag_generations')).toBe(0);
    expect(last(h.recorded, 'tau.mirror.copy_delay_seconds')).toBe(125);
    expect(last(h.recorded, 'tau.mirror.retention_min_remaining_seconds')).toBe((30 * day) / 1000);
  });

  it('should keep the oldest clock through a burst, so the lag never resets while behind', async () => {
    const h = harness();
    push(h);
    h.time.advance(60_000);
    push(h);
    h.time.advance(60_000);

    await exportBacklog(h.context);

    expect(last(h.recorded, 'tau.mirror.copy_lag_seconds')).toBe(120);
  });
});

describe('the copier and the copy key', () => {
  it('should only ever list, head, get, put and extend: no hide, no delete', async () => {
    const h = harness();
    push(h);
    await round(h);
    h.time.advance(11 * day);
    await runRetentionSweep(h.context);
    h.ledger.tombstones.set(alice.ownerId, {
      ownerId: alice.ownerId,
      deletedAt: h.time.now(),
      purgeAfter: h.time.now(),
      erasure: true,
      copyMarkedAt: undefined,
    });
    h.ledger.recordGeneration(alice, h.source.tombstone(alice, h.time.now()).generation);
    await round(h);

    expect(new Set(h.destination.calls)).toStrictEqual(
      new Set(['listVersions', 'head', 'put', 'get', 'extendRetention']),
    );
    expect(h.destination.keys().every((key) => key.startsWith('tenants/'))).toBe(true);
    expect([...h.destination.objects.values()].flat().some((version) => version.hide)).toBe(false);
  });
});
