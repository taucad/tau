import { describe, expect, it } from 'vitest';
import { resolveSectionPieces } from '#graphics/section-cuts.js';
import type { SectionCut } from '#graphics/section-cuts.js';
import {
  commitSectionViewSafeSnapshot,
  createSectionViewSafeSnapshotStore,
  getSectionViewSafeSnapshotDebugState,
  resetSectionViewSafeSnapshot,
} from '#graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionCutSet } from '#graphics/three/utils/section-view-safe-snapshot.js';

const cutSetOf = (...cuts: SectionCut[]): SectionCutSet => ({ cuts, pieces: resolveSectionPieces(cuts) });

const plane: SectionCut = { id: 'cut-a', kind: 'plane', plane: 'xz', offset: 0, isFlipped: false };
const cutaway: SectionCut = { id: 'cut-b', kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 0, sweep: 225 };

describe('section view safe snapshot', () => {
  it('should expose the committed cut set with its pieces', () => {
    const store = createSectionViewSafeSnapshotStore();
    const cutSet = cutSetOf(plane, cutaway);

    commitSectionViewSafeSnapshot(store, { identity: 'a+b', sourceIdentity: 'source-a', kind: 'complete', cutSet });

    expect(store.committed?.cutSet).toBe(cutSet);
    expect(store.committed?.cutSet.cuts).toEqual([plane, cutaway]);
    // The cutaway wider than 180° is two pieces.
    expect(store.committed?.cutSet.pieces).toHaveLength(3);
    expect(getSectionViewSafeSnapshotDebugState(store)).toMatchObject({ status: 'current', committedPieceCount: 3 });
  });

  it('should replace the committed cut set with the next one and clear it on reset', () => {
    const store = createSectionViewSafeSnapshotStore();
    commitSectionViewSafeSnapshot(store, {
      identity: 'a',
      sourceIdentity: 'source-a',
      kind: 'complete',
      cutSet: cutSetOf(plane),
    });
    const next = cutSetOf(plane, cutaway);

    commitSectionViewSafeSnapshot(store, {
      identity: 'a+b',
      sourceIdentity: 'source-b',
      kind: 'complete',
      cutSet: next,
    });

    expect(store.committed?.cutSet).toBe(next);
    expect(getSectionViewSafeSnapshotDebugState(store)).toMatchObject({ status: 'current', identity: 'a+b' });

    resetSectionViewSafeSnapshot(store);
    expect(store).toEqual({ committed: undefined });
    expect(getSectionViewSafeSnapshotDebugState(store)).toMatchObject({ status: 'ordinary', committedPieceCount: 0 });
  });

  it('should keep the committed snapshot and its cut set when the same cut set is committed again', () => {
    const store = createSectionViewSafeSnapshotStore();
    const snapshot = { identity: 'a', sourceIdentity: 'source-a', kind: 'complete', cutSet: cutSetOf(plane) } as const;
    commitSectionViewSafeSnapshot(store, snapshot);
    const { committed } = store;

    commitSectionViewSafeSnapshot(store, { ...snapshot, cutSet: cutSetOf(plane) });

    expect(store.committed).toBe(committed);
    expect(store.committed?.cutSet).toBe(snapshot.cutSet);
  });
});
