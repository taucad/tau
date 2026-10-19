import type { SectionCut, SectionPiece } from '#graphics/section-cuts.js';

export const sectionViewSafeSnapshotDebugUserDataKey = 'sectionViewSafeSnapshot';

/** A cut list and its pieces in the render frame: what the caps commit and the clip removes. */
export type SectionCutSet = Readonly<{
  cuts: readonly SectionCut[];
  pieces: readonly SectionPiece[];
}>;

export type SectionViewSafeSnapshot = Readonly<{
  /** The cut set's values and the sources they cut. */
  identity: string;
  sourceIdentity: string;
  kind: 'complete' | 'uncut';
  cutSet: SectionCutSet;
}>;

export type SectionViewSafeSnapshotStore = {
  committed: SectionViewSafeSnapshot | undefined;
};

export const createSectionViewSafeSnapshotStore = (): SectionViewSafeSnapshotStore => ({
  committed: undefined,
});

/**
 * Commits a cut set once the sources it cuts are known; no cut set is refused. Recommitting the committed identity
 * keeps the committed snapshot and its cut set, so the clip that reads them sees no change; the identity already
 * names the cut set's values.
 */
export const commitSectionViewSafeSnapshot = (
  store: SectionViewSafeSnapshotStore,
  snapshot: SectionViewSafeSnapshot,
): void => {
  const { committed } = store;
  if (
    committed?.identity === snapshot.identity &&
    committed.sourceIdentity === snapshot.sourceIdentity &&
    committed.kind === snapshot.kind
  ) {
    return;
  }

  store.committed = snapshot;
};

export const resetSectionViewSafeSnapshot = (store: SectionViewSafeSnapshotStore): void => {
  store.committed = undefined;
};

export const getSectionViewSafeSnapshotDebugState = (store: SectionViewSafeSnapshotStore): Record<string, unknown> => ({
  status: store.committed ? 'current' : 'ordinary',
  identity: store.committed?.identity,
  kind: store.committed?.kind,
  committedPieceCount: store.committed?.cutSet.pieces.length ?? 0,
});
