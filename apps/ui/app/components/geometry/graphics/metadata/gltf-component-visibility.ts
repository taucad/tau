import type { GeometryComponentManifest, GeometryComponentPrimitiveRef } from '@taucad/types';

const primitiveReferenceKey = ({ nodeIndex, meshIndex, primitiveIndex }: GeometryComponentPrimitiveRef): string =>
  `${nodeIndex}/${meshIndex}/${primitiveIndex}`;

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

export const hasComponentOrAncestor = (
  manifest: GeometryComponentManifest,
  componentId: string,
  componentIds: ReadonlySet<string>,
): boolean =>
  componentIds.has(componentId) ||
  getComponentAncestorIds(manifest, componentId).some((ancestorId) => componentIds.has(ancestorId));

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

export type GltfComponentOwnership = {
  readonly componentIdByNodeIndex: ReadonlyMap<number, string>;
  readonly componentIdByPrimitiveReference: ReadonlyMap<string, string>;
};

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

export const getGltfPrimitiveComponentId = (
  ownership: GltfComponentOwnership,
  reference: GeometryComponentPrimitiveRef,
): string | undefined =>
  ownership.componentIdByPrimitiveReference.get(primitiveReferenceKey(reference)) ??
  ownership.componentIdByNodeIndex.get(reference.nodeIndex);

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
