import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  commitSectionViewSafeSnapshot,
  createSectionViewSafeSnapshotStore,
  rejectSectionViewSafeSnapshot,
  resetSectionViewSafeSnapshot,
} from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';

describe('section view safe snapshot', () => {
  it('retains the last complete plane when a new candidate is rejected', () => {
    const store = createSectionViewSafeSnapshotStore();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -2);
    commitSectionViewSafeSnapshot(store, {
      identity: 'complete',
      sourceIdentity: 'source-a',
      kind: 'complete',
      plane,
    });
    plane.constant = -4;

    rejectSectionViewSafeSnapshot(store, {
      identity: 'unsupported',
      sourceIdentity: 'source-a',
      failure: {
        sourceKey: 'source',
        code: 'open-surface',
        message: 'unsupported',
      },
    });

    expect(store.committed?.identity).toBe('complete');
    expect(store.committed?.plane.constant).toBe(-2);
    expect(store.rejection?.identity).toBe('unsupported');

    resetSectionViewSafeSnapshot(store);
    expect(store).toEqual({ committed: undefined, rejection: undefined });
  });

  it('returns to the ordinary view when replacement geometry cannot be certified', () => {
    const store = createSectionViewSafeSnapshotStore();
    commitSectionViewSafeSnapshot(store, {
      identity: 'complete',
      sourceIdentity: 'source-a',
      kind: 'complete',
      plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    });

    rejectSectionViewSafeSnapshot(store, {
      identity: 'replacement-failed',
      sourceIdentity: 'source-b',
      failure: {
        sourceKey: 'source-b',
        code: 'open-surface',
        message: 'replacement is unsupported',
      },
    });

    expect(store.committed).toBeUndefined();
    expect(store.rejection?.identity).toBe('replacement-failed');
  });
});
