import type { GeometryComponentManifest, GeometryComponentPrimitiveRef } from '@taucad/types';

const primitiveReferenceKey = ({ nodeIndex, meshIndex, primitiveIndex }: GeometryComponentPrimitiveRef): string =>
  `${nodeIndex}/${meshIndex}/${primitiveIndex}`;

/**
 * List the ancestors of a component in the manifest, nearest parent first. A cyclic parent chain stops at the first
 * repeated ancestor.
 *
 * @param manifest - The component manifest to walk.
 * @param componentId - The component whose ancestors to list.
 * @returns The ancestor component IDs, nearest first.
 * @public
 */
export const getComponentAncestorIds = (manifest: GeometryComponentManifest, componentId: string): string[] => {
  const ancestors: string[] = [];
  const seen = new Set<string>();
  let current = manifest.nodesById[componentId];
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    ancestors.push(current.parentId);
    current = manifest.nodesById[current.parentId];
  }
  return ancestors;
};

/**
 * Check whether a component, or any of its ancestors, is in a set of component IDs.
 *
 * @param manifest - The component manifest to walk.
 * @param componentId - The component to check.
 * @param componentIds - The component IDs to look for.
 * @returns `true` when the component or an ancestor is in `componentIds`.
 * @public
 */
export const hasComponentOrAncestor = (
  manifest: GeometryComponentManifest,
  componentId: string,
  componentIds: ReadonlySet<string>,
): boolean =>
  componentIds.has(componentId) ||
  getComponentAncestorIds(manifest, componentId).some((ancestorId) => componentIds.has(ancestorId));

/**
 * Check whether a component, or any of its descendants, is in a set of component IDs.
 *
 * @param manifest - The component manifest to walk.
 * @param componentId - The component to check.
 * @param componentIds - The component IDs to look for.
 * @returns `true` when the component or a descendant is in `componentIds`.
 * @public
 */
export const hasComponentOrDescendant = (
  manifest: GeometryComponentManifest,
  componentId: string,
  componentIds: ReadonlySet<string>,
): boolean => {
  if (componentIds.has(componentId)) {
    return true;
  }
  const stack = [...(manifest.nodesById[componentId]?.childIds ?? [])];
  while (stack.length > 0) {
    const nextId = stack.pop()!;
    if (componentIds.has(nextId)) {
      return true;
    }
    stack.push(...(manifest.nodesById[nextId]?.childIds ?? []));
  }
  return false;
};

/**
 * Decide whether a component is shown. A component is hidden when it or an ancestor is hidden, and, while an isolation
 * is active, shown only when it is related to an isolated component as itself, an ancestor or a descendant.
 *
 * @param options - The manifest, the component to check and the hidden and isolated component IDs.
 * @returns `true` when the component is visible.
 * @public
 */
export const isModelComponentVisible = ({
  manifest,
  componentId,
  hiddenComponentIds,
  isolatedComponentIds,
}: {
  readonly manifest: GeometryComponentManifest;
  readonly componentId: string;
  readonly hiddenComponentIds: ReadonlySet<string>;
  readonly isolatedComponentIds: ReadonlySet<string>;
}): boolean =>
  !hasComponentOrAncestor(manifest, componentId, hiddenComponentIds) &&
  (isolatedComponentIds.size === 0 ||
    hasComponentOrAncestor(manifest, componentId, isolatedComponentIds) ||
    hasComponentOrDescendant(manifest, componentId, isolatedComponentIds));

/**
 * Lookup tables mapping glTF node indices and primitive references to the component that owns them.
 *
 * @public
 */
export type GltfComponentOwnership = {
  readonly componentIdByNodeIndex: ReadonlyMap<number, string>;
  readonly componentIdByPrimitiveReference: ReadonlyMap<string, string>;
};

/**
 * Build the glTF ownership tables for a component manifest. The first component in manifest order to claim a node index
 * owns it.
 *
 * @param manifest - The component manifest to index.
 * @returns The node and primitive ownership tables.
 * @public
 */
export const createGltfComponentOwnership = (manifest: GeometryComponentManifest): GltfComponentOwnership => {
  const componentIdByNodeIndex = new Map<number, string>();
  const componentIdByPrimitiveReference = new Map<string, string>();
  for (const componentId of manifest.nodeOrder) {
    const component = manifest.nodesById[componentId];
    if (!component) {
      continue;
    }
    for (const nodeIndex of component.meshNodeIndices) {
      if (!componentIdByNodeIndex.has(nodeIndex)) {
        componentIdByNodeIndex.set(nodeIndex, componentId);
      }
    }
    for (const reference of component.primitiveRefs ?? []) {
      componentIdByPrimitiveReference.set(primitiveReferenceKey(reference), componentId);
    }
  }
  return { componentIdByNodeIndex, componentIdByPrimitiveReference };
};

/**
 * Resolve the component that owns a glTF primitive, falling back to the owner of its node when the primitive has no
 * explicit owner.
 *
 * @param ownership - The ownership tables from `createGltfComponentOwnership`.
 * @param reference - The primitive to resolve.
 * @returns The owning component ID, or `undefined` when nothing owns it.
 * @public
 */
export const getGltfPrimitiveComponentId = (
  ownership: GltfComponentOwnership,
  reference: GeometryComponentPrimitiveRef,
): string | undefined =>
  ownership.componentIdByPrimitiveReference.get(primitiveReferenceKey(reference)) ??
  ownership.componentIdByNodeIndex.get(reference.nodeIndex);

/**
 * Keep the glTF primitives whose owning component is visible under the given hidden and isolated components. Primitives
 * no component owns are kept.
 *
 * @param options - The primitives, the component manifest and the hidden and isolated component IDs.
 * @returns The visible primitives, in their original order.
 * @public
 */
export const filterVisibleGltfPrimitives = ({
  primitives,
  manifest,
  hiddenComponentIds,
  isolatedComponentIds,
}: {
  readonly primitives: readonly GeometryComponentPrimitiveRef[];
  readonly manifest: GeometryComponentManifest;
  readonly hiddenComponentIds: readonly string[];
  readonly isolatedComponentIds: readonly string[];
}): GeometryComponentPrimitiveRef[] => {
  const ownership = createGltfComponentOwnership(manifest);
  const hidden = new Set(hiddenComponentIds);
  const isolated = new Set(isolatedComponentIds);
  return primitives.filter((reference) => {
    const componentId = getGltfPrimitiveComponentId(ownership, reference);
    return (
      componentId === undefined ||
      isModelComponentVisible({
        manifest,
        componentId,
        hiddenComponentIds: hidden,
        isolatedComponentIds: isolated,
      })
    );
  });
};
