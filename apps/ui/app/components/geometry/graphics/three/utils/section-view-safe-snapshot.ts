import type * as THREE from 'three';
import type { SectionTopologyFailure } from '#components/geometry/graphics/three/utils/section-surface-topology.js';

export const sectionViewSafeSnapshotDebugUserDataKey = 'sectionViewSafeSnapshot';

export type SectionViewSafeSnapshot = Readonly<{
  identity: string;
  sourceIdentity: string;
  kind: 'complete' | 'uncut';
  plane: THREE.Plane;
}>;

export type SectionViewSafeSnapshotStore = {
  committed: SectionViewSafeSnapshot | undefined;
  rejection: Readonly<{ identity: string; sourceIdentity: string; failure: SectionTopologyFailure }> | undefined;
};

export const createSectionViewSafeSnapshotStore = (): SectionViewSafeSnapshotStore => ({
  committed: undefined,
  rejection: undefined,
});

export const commitSectionViewSafeSnapshot = (
  store: SectionViewSafeSnapshotStore,
  snapshot: Omit<SectionViewSafeSnapshot, 'plane'> & Readonly<{ plane: THREE.Plane }>,
): void => {
  store.committed = { ...snapshot, plane: snapshot.plane.clone() };
  store.rejection = undefined;
};

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
  retainedPreviousSnapshot: Boolean(store.rejection && store.committed),
  failure: store.rejection?.failure,
});
