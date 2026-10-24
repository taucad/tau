import { describe, expect, it } from 'vitest';
import { repositoryLocator } from '#api/git/store/locator.js';
import { encodeManifest } from '#api/git/store/manifest.js';
import { copyRepository } from '#api/git/mirror/copier.js';
import { repositoryKey, snapshotKey } from '#api/git/mirror/keys.js';
import { day, harness, sha256Hex, total } from '#api/git/mirror/mirror.fixture.js';
import { runRetentionSweep } from '#api/git/mirror/retention.js';

const alice = repositoryLocator({
  ownerId: 'user_alice',
  projectId: 'proj_one',
});
const bob = repositoryLocator({ ownerId: 'user_bob', projectId: 'proj_two' });

const seeded = async () => {
  const h = harness();
  for (const locator of [alice, bob]) {
    const manifest = h.source.push(locator, h.time.now());
    h.ledger.recordGeneration(locator, manifest.generation);
    // oxlint-disable-next-line no-await-in-loop -- two repositories
    await copyRepository(h.context, (await h.ledger.candidate(locator.projectId))!);
  }
  return h;
};

describe('runRetentionSweep', () => {
  it('should do nothing while every lock has at least 20 days left', async () => {
    const h = await seeded();
    h.time.advance(9 * day);
    h.destination.calls.length = 0;

    expect(await runRetentionSweep(h.context)).toStrictEqual({
      swept: 0,
      failed: 0,
    });
    expect(h.destination.calls).not.toContain('extendRetention');
  });

  it('should extend the recorded snapshot and every dependency to now + 30 days, and record the new lock', async () => {
    const h = await seeded();
    h.time.advance(11 * day);

    expect(await runRetentionSweep(h.context)).toStrictEqual({
      swept: 2,
      failed: 0,
    });

    const until = new Date(h.time.now().getTime() + 30 * day);
    for (const version of [...h.destination.objects.values()].flat()) {
      expect(version.retainUntil).toStrictEqual(until);
    }
    expect(h.ledger.row('proj_one').copyLockedUntil).toStrictEqual(until);
    expect(
      total(h.recorded, 'tau.mirror.retention_extensions', {
        outcome: 'extended',
      }),
    ).toBe(6);
  });

  it('should skip every owner with a storage tombstone, so erasure is never postponed', async () => {
    const h = await seeded();
    h.ledger.tombstones.set(bob.ownerId, {
      ownerId: bob.ownerId,
      deletedAt: h.time.now(),
      purgeAfter: h.time.now(),
      erasure: true,
      copyMarkedAt: h.time.now(),
    });
    h.time.advance(11 * day);

    expect(await runRetentionSweep(h.context)).toStrictEqual({
      swept: 1,
      failed: 0,
    });
    const bobVersions = h.destination.keys('tenants/user_bob/').flatMap((key) => h.destination.objects.get(key)!);
    for (const version of bobVersions) {
      expect(version.retainUntil.getTime()).toBe(h.time.now().getTime() + 19 * day);
    }
  });

  it('should keep locking what the recorded snapshot names, not a forged newer version of it', async () => {
    const h = await seeded();
    const manifest = h.source.manifestOf(alice)!;
    const key = snapshotKey(alice, manifest.generation, manifest.incarnation);
    // Someone holding the copy key writes a second version naming no packs.
    const forged = encodeManifest({ ...manifest, packs: [] });
    await h.destination.put(key, forged, {
      contentLength: forged.byteLength,
      sha256: Buffer.from(sha256Hex(forged), 'hex').toString('base64'),
      retainUntil: h.time.now(),
    });
    h.time.advance(11 * day);

    expect(await runRetentionSweep(h.context)).toStrictEqual({
      swept: 2,
      failed: 0,
    });
    const pack = h.destination.latest(repositoryKey(alice, manifest.packs[0]!.key))!;
    expect(pack.retainUntil.getTime()).toBe(h.time.now().getTime() + 30 * day);
  });

  it('should fail a repository whose recorded snapshot is missing from the copy, and go on with the rest', async () => {
    const h = await seeded();
    const manifest = h.source.manifestOf(alice)!;
    h.destination.objects.delete(snapshotKey(alice, manifest.generation, manifest.incarnation));
    h.time.advance(11 * day);

    expect(await runRetentionSweep(h.context)).toStrictEqual({
      swept: 1,
      failed: 1,
    });
    expect(
      total(h.recorded, 'tau.mirror.copy_failures', {
        stage: 'retention',
        reason: 'checksum',
      }),
    ).toBe(1);
    expect(h.events).toContainEqual(
      expect.objectContaining({
        event: 'tau_mirror.sweep_failed',
        projectId: 'proj_one',
      }),
    );
  });

  it('should count a refused extension and leave the recorded lock where it was', async () => {
    const h = await seeded();
    const before = h.ledger.row('proj_one').copyLockedUntil;
    h.time.advance(11 * day);
    h.destination.extendRetention = async () => {
      throw Object.assign(new Error('AccessDenied'), {
        $metadata: { httpStatusCode: 403 },
      });
    };

    expect(await runRetentionSweep(h.context)).toStrictEqual({
      swept: 0,
      failed: 2,
    });
    expect(h.ledger.row('proj_one').copyLockedUntil).toStrictEqual(before);
    expect(
      total(h.recorded, 'tau.mirror.retention_extensions', {
        outcome: 'failed',
      }),
    ).toBe(2);
    expect(
      total(h.recorded, 'tau.mirror.copy_failures', {
        stage: 'retention',
        reason: 'http_4xx',
      }),
    ).toBe(2);
  });
});
