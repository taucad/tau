import { Matrix4 } from 'three';
import type { Box3, Object3D } from 'three';
import { resolveCoordinateTransform } from '@taucad/spatial';

/**
 * The glTF world convention: Y up, Z forward, one metre per unit.
 * @public
 */
export const canonicalGltfWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
/**
 * Tau's world convention: Z up, negative Y forward, one metre per unit.
 * @public
 */
export const tauWorld = { up: '+z', forward: '-y', metersPerUnit: 1 } as const;

const canonicalGltfToTau = new Matrix4().fromArray(
  resolveCoordinateTransform({ source: canonicalGltfWorld, target: tauWorld }).matrix,
);

/**
 * Returns a fresh asset-space adapter for a viewer wrapper group.
 *
 * @public
 */
export const createCanonicalGltfToTauMatrix = (): Matrix4 => canonicalGltfToTau.clone();

/**
 * Applies the sole glTF→Tau presentation transform at the Three.js loader boundary.
 *
 * @public
 */
export const applyCanonicalGltfWorld = <Scene extends Object3D>(scene: Scene): Scene => {
  scene.matrix.premultiply(canonicalGltfToTau);
  scene.matrix.decompose(scene.position, scene.quaternion, scene.scale);
  scene.updateMatrixWorld(true);
  return scene;
};

/**
 * Transforms bounds from glTF world space into Tau world space in place.
 *
 * @param bounds - The bounds in glTF world space.
 * @returns `bounds`, now in Tau world space.
 * @public
 */
export const applyCanonicalGltfBounds = (bounds: Box3): Box3 => bounds.applyMatrix4(canonicalGltfToTau);
