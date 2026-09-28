import { describe, expect, it } from 'vitest';
import { resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut } from '#components/geometry/graphics/section-cuts.js';
import {
  commitSectionViewSafeSnapshot,
  createSectionViewSafeSnapshotStore,
  getSectionViewSafeSnapshotDebugState,
  rejectSectionViewSafeSnapshot,
  resetSectionViewSafeSnapshot,
} from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionCutSet } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';

const cutSetOf = (...cuts: SectionCut[]): SectionCutSet => ({ cuts, pieces: resolveSectionPieces(cuts) });

const plane: SectionCut = { id: 'cut-a', kind: 'plane', plane: 'xz', offset: 0, isFlipped: false };
const cutaway: SectionCut = { id: 'cut-b', kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 0, sweep: 225 };
const failure = { sourceKey: 'source', code: 'open-surface', message: 'unsupported' } as const;

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

  it('should keep the whole previous cut set when a new one is rejected', () => {
    const store = createSectionViewSafeSnapshotStore();
    const previous = cutSetOf(plane);
    commitSectionViewSafeSnapshot(store, {
      identity: 'a',
      sourceIdentity: 'source-a',
      kind: 'complete',
      cutSet: previous,
    });
    const { committed } = store;

    rejectSectionViewSafeSnapshot(store, { identity: 'a+b', sourceIdentity: 'source-a', failure });

    // All or nothing: none of the rejected set's cuts or pieces joins what stays committed.
    expect(store.committed).toBe(committed);
    expect(store.committed?.cutSet).toBe(previous);
    expect(store.committed?.cutSet.pieces).toEqual(resolveSectionPieces([plane]));
    expect(store.rejection?.identity).toBe('a+b');
    expect(getSectionViewSafeSnapshotDebugState(store)).toMatchObject({
      status: 'rejected',
      identity: 'a',
      retainedPreviousSnapshot: true,
    });

    resetSectionViewSafeSnapshot(store);
    expect(store).toEqual({ committed: undefined, rejection: undefined });
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

  it('should clear a rejection when the committed cut set is committed again', () => {
    const store = createSectionViewSafeSnapshotStore();
    const snapshot = { identity: 'a', sourceIdentity: 'source-a', kind: 'complete', cutSet: cutSetOf(plane) } as const;
    commitSectionViewSafeSnapshot(store, snapshot);
    rejectSectionViewSafeSnapshot(store, { identity: 'a+b', sourceIdentity: 'source-a', failure });

    commitSectionViewSafeSnapshot(store, snapshot);

    expect(store.rejection).toBeUndefined();
    expect(store.committed?.identity).toBe('a');
  });

  it('should return to the uncut view when replacement geometry cannot be certified', () => {
    const store = createSectionViewSafeSnapshotStore();
    commitSectionViewSafeSnapshot(store, {
      identity: 'a',
      sourceIdentity: 'source-a',
      kind: 'complete',
      cutSet: cutSetOf(plane),
    });

    rejectSectionViewSafeSnapshot(store, { identity: 'a', sourceIdentity: 'source-b', failure });

    expect(store.committed).toBeUndefined();
    expect(store.rejection?.identity).toBe('a');
  });
});
