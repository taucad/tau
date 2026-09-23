import { useSyncExternalStore } from 'react';
import type { Mesh, Object3D } from 'three';

/** Surface meshes currently emphasised in one root scene, grouped by state. */
export type ModelEmphasisSet = Readonly<{
  hover: readonly Mesh[];
  selected: readonly Mesh[];
}>;

export const emptyModelEmphasisSet: ModelEmphasisSet = { hover: [], selected: [] };

type Listener = () => void;

const sets = new WeakMap<Object3D, ModelEmphasisSet>();
const listeners = new WeakMap<Object3D, Set<Listener>>();

const sameMeshes = (left: readonly Mesh[], right: readonly Mesh[]): boolean =>
  left.length === right.length && left.every((mesh, index) => mesh === right[index]);

/**
 * Publish the emphasised surface meshes of a root scene. Written once per visual-state
 * application by the model owner; read by the silhouette/wash overlay without traversing the
 * scene per frame. Equal sets are dropped so subscribers never rebuild proxies needlessly.
 */
export function setModelEmphasisSet(root: Object3D, next: ModelEmphasisSet): void {
  const current = sets.get(root) ?? emptyModelEmphasisSet;
  if (sameMeshes(current.hover, next.hover) && sameMeshes(current.selected, next.selected)) {
    return;
  }
  sets.set(root, next.hover.length === 0 && next.selected.length === 0 ? emptyModelEmphasisSet : next);
  for (const listener of listeners.get(root) ?? []) {
    listener();
  }
}

export function getModelEmphasisSet(root: Object3D): ModelEmphasisSet {
  return sets.get(root) ?? emptyModelEmphasisSet;
}

function subscribeModelEmphasis(root: Object3D, listener: Listener): () => void {
  const bucket = listeners.get(root) ?? new Set<Listener>();
  bucket.add(listener);
  listeners.set(root, bucket);
  return () => {
    bucket.delete(listener);
  };
}

/** React binding for the overlay owner: re-renders only when the emphasised mesh set changes. */
export function useModelEmphasisSet(root: Object3D): ModelEmphasisSet {
  return useSyncExternalStore(
    (listener) => subscribeModelEmphasis(root, listener),
    () => getModelEmphasisSet(root),
    () => emptyModelEmphasisSet,
  );
}
