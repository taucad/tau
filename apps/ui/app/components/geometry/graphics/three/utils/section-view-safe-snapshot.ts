import type { SectionCut, SectionPiece } from '#components/geometry/graphics/section-cuts.js';
import type { SectionTopologyFailure } from '#components/geometry/graphics/three/utils/section-surface-topology.js';

export const sectionViewSafeSnapshotDebugUserDataKey = 'sectionViewSafeSnapshot';

/** A cut list and its pieces in the render frame: what the caps certify and the clip removes. */
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
  rejection: Readonly<{ identity: string; sourceIdentity: string; failure: SectionTopologyFailure }> | undefined;
};

export const createSectionViewSafeSnapshotStore = (): SectionViewSafeSnapshotStore => ({
  committed: undefined,
  rejection: undefined,
});

/**
 * Commits a cut set whose every cap face certified. Recommitting the committed identity keeps the committed snapshot
 * and its cut set, so the clip that reads them sees no change; the identity already names the cut set's values.
 */
export const commitSectionViewSafeSnapshot = (
  store: SectionViewSafeSnapshotStore,
  snapshot: SectionViewSafeSnapshot,
): void => {
  const { committed } = store;
  if (
    !store.rejection &&
    committed?.identity === snapshot.identity &&
    committed.sourceIdentity === snapshot.sourceIdentity &&
    committed.kind === snapshot.kind
  ) {
    return;
  }

  store.committed = snapshot;
  store.rejection = undefined;
};

/**
 * Refuses a cut set as a whole. The committed set stays while the sources are the same, so the clip, the caps and
 * raycasts keep showing it; when the sources changed, nothing stays committed and the view is uncut.
 */
export const rejectSectionViewSafeSnapshot = (
  store: SectionViewSafeSnapshotStore,
  rejection: NonNullable<SectionViewSafeSnapshotStore['rejection']>,
): void => {
  if (store.committed?.sourceIdentity !== rejection.sourceIdentity) {
    store.committed = undefined;
  }
  store.rejection = rejection;
};

export const resetSectionViewSafeSnapshot = (store: SectionViewSafeSnapshotStore): void => {
  store.committed = undefined;
  store.rejection = undefined;
};

export const getSectionViewSafeSnapshotDebugState = (store: SectionViewSafeSnapshotStore): Record<string, unknown> => ({
  status: store.rejection ? 'rejected' : store.committed ? 'current' : 'ordinary',
  identity: store.committed?.identity,
  kind: store.committed?.kind,
  committedPieceCount: store.committed?.cutSet.pieces.length ?? 0,
  retainedPreviousSnapshot: Boolean(store.rejection && store.committed),
  failure: store.rejection?.failure,
});
