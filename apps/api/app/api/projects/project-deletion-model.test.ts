import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { commitTombstone } from '#api/git/store/commit.js';
import { decodeManifest, encodeManifest, succeedManifest } from '#api/git/store/manifest.js';
import type { CommitToken, ManifestBytes, RepositoryStore } from '#api/git/store/port.js';
import { retentionWindowMilliseconds } from '#api/git/store/limits.js';

/** Durable manifest state survives replacement of the caller, as in CPD-01 Crash/Recover. */
const durableStore = () => {
  let held: { manifest: ManifestBytes; token: CommitToken } | undefined;
  let generation = 0;
  const store = mock<RepositoryStore>({
    readManifest: vi.fn<RepositoryStore['readManifest']>(async () => held),
    commitManifest: vi.fn<RepositoryStore['commitManifest']>(async (_locator, manifest, expected) => {
      if (expected === 'absent' ? held !== undefined : expected.token !== held?.token.token) {
        return 'lost';
      }
      generation += 1;
      const token = { token: String(generation) };
      held = { manifest, token };
      return token;
    }),
  });
  return store;
};

const locator = { ownerId: 'user_cpd_model', projectId: 'proj_cpd_model' };

describe('ProjectDeletion model conformance: manifest fence', () => {
  it('should fence an absent repository and preserve its deadline when recovery repeats the commit', async () => {
    const store = durableStore();
    const at = new Date('2026-10-24T00:00:00.000Z');
    const first = await commitTombstone({ store, locator, committedBy: locator.ownerId, at });
    const recovered = await commitTombstone({
      store,
      locator,
      committedBy: locator.ownerId,
      at: new Date(at.getTime() + 60_000),
    });
    expect(recovered).toEqual(first);
    expect(recovered.manifest.tombstone).toEqual({
      tombstonedAt: at.toISOString(),
      purgeAfter: new Date(at.getTime() + retentionWindowMilliseconds).toISOString(),
    });
    expect(await store.commitManifest(locator, encodeManifest(first.manifest), 'absent')).toBe('lost');
  });

  it('should refuse a writer admitted before the fence and leave the tombstone intact', async () => {
    const store = durableStore();
    const initial = succeedManifest(undefined, { refs: {}, packs: [], committedBy: locator.ownerId });
    const token = await store.commitManifest(locator, encodeManifest(initial), 'absent');
    if (token === 'lost') {
      throw new Error('Fixture initialization unexpectedly lost its commit');
    }
    const deleted = await commitTombstone({ store, locator, committedBy: locator.ownerId });
    const stale = succeedManifest(initial, { refs: {}, packs: [], committedBy: locator.ownerId });
    expect(await store.commitManifest(locator, encodeManifest(stale), token)).toBe('lost');
    const current = await store.readManifest(locator);
    expect(current).toBeDefined();
    if (!current) {
      throw new Error('Deletion removed its physical fence');
    }
    expect(decodeManifest(current.manifest)).toEqual(deleted.manifest);
  });
});
