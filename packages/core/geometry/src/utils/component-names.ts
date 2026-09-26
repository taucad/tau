import { formatShapeName, isLegacyGeneratedShapeName, uniqueLabel } from '#utils/shape-names.js';

const assertNodeIndex = (nodeIndex: number): void => {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0) {
    throw new RangeError(`Component node index must be a non-negative integer; received ${nodeIndex}.`);
  }
};

/**
 * Format a payload-local component ID from a glTF node index.
 *
 * @param nodeIndex - Zero-based glTF node index.
 * @returns Canonical component identifier.
 * @public
 */
export const formatComponentId = (nodeIndex: number): string => {
  assertNodeIndex(nodeIndex);
  return `component:node-${nodeIndex}`;
};

/**
 * Format a stable component ID from a semantic shape name.
 *
 * @param name - Authored shape name.
 * @param nodeIndex - Zero-based glTF node index used to reject generated fallback names.
 * @returns Canonical named identifier, or undefined when the name is not semantic.
 * @public
 */
export const formatNamedComponentId = (name: string, nodeIndex: number): string | undefined => {
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
};

/**
 * De-duplicate a component ID within one payload, the way `uniqueShapeName` de-duplicates
 * names: the first occurrence keeps its ID and a repeat gets the next free ordinal, so distinct
 * names that slug alike (`Bolt +X`, `Bolt -X`) become `component:bolt-x` and `component:bolt-x-2`.
 *
 * @param id - Candidate component ID.
 * @param usedIds - Mutable count map for IDs already emitted in this payload.
 * @returns The original ID or a suffixed duplicate.
 * @public
 */
export const uniqueComponentId = (id: string, usedIds: Map<string, number>): string => uniqueLabel(id, usedIds, '-');

/**
 * Format a payload-local selector for a glTF node.
 *
 * @param nodeIndex - Zero-based glTF node index.
 * @returns Canonical node selector.
 * @public
 */
export const formatNodeSelector = (nodeIndex: number): string => {
  assertNodeIndex(nodeIndex);
  return `node/${nodeIndex}`;
};

/**
 * Format a payload-local selector for a semantic primitive.
 *
 * @param nodeIndex - Zero-based glTF node index.
 * @param kind - Surface or edge primitive kind.
 * @returns Canonical primitive selector.
 * @public
 */
export const formatPrimitiveSelector = (nodeIndex: number, kind: 'surface' | 'edges'): string =>
  `${formatNodeSelector(nodeIndex)}/${kind}`;
