import { Matrix4 } from 'three';
import type { Box3, Object3D } from 'three';
import { resolveCoordinateTransform } from '@taucad/spatial';

export const canonicalGltfWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
export const tauWorld = { up: '+z', forward: '-y', metersPerUnit: 1 } as const;

const canonicalGltfToTau = new Matrix4().fromArray(
  resolveCoordinateTransform({ source: canonicalGltfWorld, target: tauWorld }).matrix,
);

/** Returns a fresh asset-space adapter for a viewer wrapper group. */
export const createCanonicalGltfToTauMatrix = (): Matrix4 => canonicalGltfToTau.clone();

/** Applies the sole glTF→Tau presentation transform at the Three.js loader boundary. */
export const applyCanonicalGltfWorld = <Scene extends Object3D>(scene: Scene): Scene => {
  scene.matrix.premultiply(canonicalGltfToTau);
  scene.matrix.decompose(scene.position, scene.quaternion, scene.scale);
  scene.updateMatrixWorld(true);
  return scene;
};

export const applyCanonicalGltfBounds = (bounds: Box3): Box3 => bounds.applyMatrix4(canonicalGltfToTau);
