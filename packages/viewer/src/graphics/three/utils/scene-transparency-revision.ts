import type { Object3D, Scene } from 'three';

const revisions = new WeakMap<Scene, number>();

/** Invalidate AO classification when an owned scene's visibility or materials change. */
export function invalidateSceneTransparency(object: Object3D): void {
  let root = object;
  while (root.parent) {
    root = root.parent;
  }
  if ('isScene' in root && root.isScene === true) {
    const scene = root as Scene;
    revisions.set(scene, (revisions.get(scene) ?? 0) + 1);
  }
}

/** Undefined scenes retain uncached classification for callers without an appearance owner. */
export const sceneTransparencyRevision = (scene: Scene): number | undefined => revisions.get(scene);
