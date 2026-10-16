import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';

/**
 * Preorder projection retaining matching ancestors, computed once per manifest/search.
 *
 * @internal
 * @param manifest - The unit's component manifest.
 * @param normalizedQuery - The trimmed, lower-cased filter; empty keeps every component.
 * @returns The components to list, in tree order.
 */
export function getVisibleModelComponents(
  manifest: GeometryComponentManifest,
  normalizedQuery: string,
): GeometryComponentNode[] {
  const root = manifest.nodesById[manifest.rootId];
  if (!root) {
    return [];
  }
  const ordered: GeometryComponentNode[] = [];
  const pending = [...root.childIds].reverse();
  while (pending.length > 0) {
    const node = manifest.nodesById[pending.pop()!];
    if (!node) {
      continue;
    }
    ordered.push(node);
    for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
      pending.push(node.childIds[index]!);
    }
  }
  if (!normalizedQuery) {
    return ordered;
  }
  const matching = new Set<string>();
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const node = ordered[index]!;
    if (
      node.name.toLowerCase().includes(normalizedQuery) ||
      (node.appearance?.materials?.some((material) => material.name?.toLowerCase().includes(normalizedQuery)) ??
        false) ||
      node.childIds.some((id) => matching.has(id))
    ) {
      matching.add(node.id);
    }
  }
  return ordered.filter((node) => matching.has(node.id));
}

/**
 * Whether a part has geometry the preview renderer can draw.
 *
 * @internal
 * @param node - The component.
 * @returns Whether it is a part with primitives.
 */
export const isPreviewablePart = (node: GeometryComponentNode): boolean =>
  node.kind === 'part' && (node.primitiveRefs?.length ?? 0) > 0;
