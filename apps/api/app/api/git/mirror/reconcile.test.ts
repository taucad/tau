import { describe, expect, it } from 'vitest';
import { repositoryLocator } from '#api/git/store/locator.js';
import { copyRepository } from '#api/git/mirror/copier.js';
import { repositoryKey } from '#api/git/mirror/keys.js';
import { day, harness, last } from '#api/git/mirror/mirror.fixture.js';
import { reconcile } from '#api/git/mirror/reconcile.js';

const alice = repositoryLocator({
  ownerId: 'user_alice',
  projectId: 'proj_one',
});

const copied = async () => {
  const h = harness();
  const manifest = h.source.push(alice, h.time.now());
  h.ledger.recordGeneration(alice, manifest.generation);
  await copyRepository(h.context, (await h.ledger.candidate('proj_one'))!);
  return { h, manifest };
};

describe('reconcile', () => {
  it('should count hide markers, page on them, and never hide or delete anything itself', async () => {
    const { h, manifest } = await copied();
    h.destination.hide(repositoryKey(alice, manifest.packs[0]!.key));

    const result = await reconcile(h.context, 'active');

    expect(result.hidden).toBe(1);
    expect(
      last(h.recorded, 'tau.mirror.reconcile_hidden_versions', {
        destination: 'b2',
      }),
    ).toBe(1);
    expect(h.events).toContainEqual(
      expect.objectContaining({
        event: 'tau_mirror.hidden_versions',
        count: 1,
      }),
    );
    // The hidden pack's locked version is still there and still counts as held.
    expect(result.missing).toStrictEqual({});
    expect([...h.destination.objects.values()].flat().filter((version) => version.hide)).toHaveLength(1);
  });

  it('should count hide markers over the whole bucket on the full pass, with its bytes and versions', async () => {
    const { h, manifest } = await copied();
    h.destination.hide(repositoryKey(alice, manifest.packs[0]!.key));

    const result = await reconcile(h.context, 'full');

    const versions = [...h.destination.objects.values()].flat().filter((version) => !version.hide);
    expect(result).toMatchObject({
      hidden: 1,
      objectVersions: versions.length,
      storedBytes: versions.reduce((sum, version) => sum + version.bytes.byteLength, 0),
    });
    expect(last(h.recorded, 'tau.mirror.destination_object_versions')).toBe(versions.length);
    expect(
      last(h.recorded, 'tau.mirror.reconcile_last_success_timestamp_seconds', {
        scope: 'full',
      }),
    ).toBe(Math.floor(h.time.now().getTime() / 1000));
  });

  it('should restart the lag clock where the store is ahead of the copy (a lost receipt)', async () => {
    const { h } = await copied();
    // A push whose `recordGeneration` never landed: the row still says the copy is current.
    h.source.push(alice, h.time.now());
    expect(h.ledger.row('proj_one').copyPendingSince).toBeUndefined();

    const result = await reconcile(h.context, 'active');

    expect(result.storeAhead).toBe(1);
    expect(h.ledger.row('proj_one').copyPendingSince).toStrictEqual(h.time.now());
    const [claimed] = await h.ledger.claim({
      limit: 4,
      backfillLimit: 2,
      exclude: new Set(),
    });
    expect(claimed?.projectId).toBe('proj_one');
    const round = await copyRepository(h.context, claimed!);
    expect(round).toMatchObject({ outcome: 'copied', generation: 2 });
  });

  it('should copy retired markers and the packs they name while the primary still holds them', async () => {
    const h = harness();
    const first = h.source.push(alice, h.time.now());
    // Compaction replaces the first pack before the copier ever saw it.
    const second = h.source.push(alice, h.time.now(), { compact: true });
    h.ledger.recordGeneration(alice, second.generation);
    await copyRepository(h.context, (await h.ledger.candidate('proj_one'))!);
    const retiredPack = first.packs[0]!.key;
    expect(h.destination.keys()).not.toContain(repositoryKey(alice, retiredPack));
    const markerKey = `retired/${String(h.time.now().getTime())}-${retiredPack.slice('packs/'.length)}`;
    h.source.objects.set(`user_alice/proj_one/${markerKey}`, new Uint8Array(Buffer.from('{}')));

    const result = await reconcile(h.context, 'active');

    expect(result.retiredCopied).toBe(3);
    expect(h.destination.keys()).toEqual(
      expect.arrayContaining([
        repositoryKey(alice, markerKey),
        repositoryKey(alice, retiredPack),
        repositoryKey(alice, `${retiredPack.slice(0, -5)}.idx`),
      ]),
    );
    // Copied once; a second pass finds them by version listing.
    const again = await reconcile(h.context, 'active');
    expect(again.retiredCopied).toBe(0);
  });

  it('should not count a retired pack the primary has already swept as missing', async () => {
    const { h } = await copied();
    h.source.objects.set(
      `user_alice/proj_one/retired/1-pack-${'a'.repeat(40)}-00000000.pack`,
      new Uint8Array(Buffer.from('{}')),
    );

    const result = await reconcile(h.context, 'active');

    expect(result.retiredCopied).toBe(1);
    expect(result.missing).toStrictEqual({});
  });

  it('should count, by kind, what a copied snapshot names and the copy lacks', async () => {
    const { h, manifest } = await copied();
    h.destination.objects.delete(repositoryKey(alice, manifest.packs[0]!.key));

    const result = await reconcile(h.context, 'active');

    expect(result.missing).toStrictEqual({ pack: 1 });
    expect(
      last(h.recorded, 'tau.mirror.reconcile_missing_objects', {
        kind: 'pack',
      }),
    ).toBe(1);
    expect(last(h.recorded, 'tau.mirror.reconcile_missing_objects', { kind: 'idx' })).toBe(0);
  });

  it('should report the furthest lock ahead, so a lock set beyond 30 days by anyone else shows', async () => {
    const { h, manifest } = await copied();

    await reconcile(h.context, 'active');
    expect(last(h.recorded, 'tau.mirror.retention_max_ahead_seconds')).toBe((30 * day) / 1000);

    const key = repositoryKey(alice, manifest.packs[0]!.key);
    const version = h.destination.latest(key)!;
    await h.destination.extendRetention(key, version.versionId, new Date(h.time.now().getTime() + 90 * day));
    await reconcile(h.context, 'active');

    expect(last(h.recorded, 'tau.mirror.retention_max_ahead_seconds')).toBe((90 * day) / 1000);
  });

  it('should leave repositories idle for more than 48 hours to the weekly full pass', async () => {
    const { h } = await copied();
    h.time.advance(3 * day);

    const active = await reconcile(h.context, 'active');
    const full = await reconcile(h.context, 'full');

    expect(active.repositories).toBe(0);
    expect(full.repositories).toBe(1);
  });
});
