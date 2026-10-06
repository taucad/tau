import { useSyncExternalStore } from 'react';
import type { Mesh, Object3D, InstancedMesh } from 'three';
import type { ModelComponentInstanceSlot } from '#components/geometry/graphics/three/utils/model-component-owner.js';

export type ModelEmphasisInstanceSelection = Readonly<{
  source: InstancedMesh;
  instanceIds: readonly number[];
  slots: readonly ModelComponentInstanceSlot[];
}>;

/** Surface meshes currently emphasised in one root scene, grouped by state. */
export type ModelEmphasisSet = Readonly<{
  hover: readonly Mesh[];
  selected: readonly Mesh[];
  hoverInstances?: readonly ModelEmphasisInstanceSelection[];
  selectedInstances?: readonly ModelEmphasisInstanceSelection[];
}>;

export const emptyModelEmphasisSet: ModelEmphasisSet = { hover: [], selected: [] };

type Listener = () => void;

const sets = new WeakMap<Object3D, ModelEmphasisSet>();
const listeners = new WeakMap<Object3D, Set<Listener>>();

const sameMeshes = (left: readonly Mesh[], right: readonly Mesh[]): boolean =>
  left.length === right.length && left.every((mesh, index) => mesh === right[index]);

const sameInstanceSelections = (
  left: readonly ModelEmphasisInstanceSelection[] = [],
  right: readonly ModelEmphasisInstanceSelection[] = [],
): boolean =>
  left.length === right.length &&
  left.every((selection, index) => {
    const other = right[index];
    return (
      other?.source === selection.source &&
      selection.instanceIds.length === other.instanceIds.length &&
      selection.instanceIds.every(
        (id, slot) => id === other.instanceIds[slot] && selection.slots[slot] === other.slots[slot],
      )
    );
  });

/**
 * Publish the emphasised surface meshes of a root scene. Written once per visual-state
 * application by the model owner; read by the silhouette/wash overlay without traversing the
 * scene per frame. Equal sets are dropped so subscribers never rebuild proxies needlessly.
 */
export function setModelEmphasisSet(root: Object3D, next: ModelEmphasisSet): void {
  const current = sets.get(root) ?? emptyModelEmphasisSet;
  if (
    sameMeshes(current.hover, next.hover) &&
    sameMeshes(current.selected, next.selected) &&
    sameInstanceSelections(current.hoverInstances, next.hoverInstances) &&
    sameInstanceSelections(current.selectedInstances, next.selectedInstances)
  ) {
    return;
  }
  sets.set(
    root,
    next.hover.length === 0 &&
      next.selected.length === 0 &&
      !next.hoverInstances?.length &&
      !next.selectedInstances?.length
      ? emptyModelEmphasisSet
      : next,
  );
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
