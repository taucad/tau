import { formatShapeName, isLegacyGeneratedShapeName } from '@taucad/geometry-core';

/**
 * Format a generated component ID from a mesh-bearing node address.
 *
 * @param nodeIndex - Zero-based glTF node index.
 * @returns A payload-local component identifier.
 */
export function formatComponentId(nodeIndex: number): string {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0) {
    throw new RangeError(`Component node index must be a non-negative integer; received ${nodeIndex}.`);
  }

  return `component:node-${nodeIndex}`;
}

/**
 * Format a semantic component ID from a modeled component name.
 *
 * @param name - Resolved component display name.
 * @param nodeIndex - Zero-based glTF node index used to identify generated labels.
 * @returns A semantic component id, or undefined when the name is generated.
 */
export function formatNamedComponentId(name: string, nodeIndex: number): string | undefined {
  const normalized = name.trim();
  if (!normalized || isLegacyGeneratedShapeName(normalized) || normalized === formatShapeName(nodeIndex)) {
    return undefined;
  }

  const slug = normalized
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  return slug.length > 0 ? `component:${slug}` : undefined;
}

/**
 * Format a generated selector for a mesh-bearing glTF node.
 *
 * @param nodeIndex - Zero-based glTF node index.
 * @returns A payload-local node selector.
 */
export function formatNodeSelector(nodeIndex: number): string {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0) {
    throw new RangeError(`Selector node index must be a non-negative integer; received ${nodeIndex}.`);
  }

  return `node/${nodeIndex}`;
}

/**
 * Format a generated selector for a semantic primitive within a mesh-bearing node.
 *
 * @param nodeIndex - Zero-based glTF node index.
 * @param primitiveKind - Primitive role inside the node.
 * @returns A payload-local primitive selector.
 */
export function formatPrimitiveSelector(nodeIndex: number, primitiveKind: 'surface' | 'edges'): string {
  return `${formatNodeSelector(nodeIndex)}/${primitiveKind}`;
}
