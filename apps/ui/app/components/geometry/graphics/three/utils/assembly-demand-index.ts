import type { Frustum } from 'three';
import type { AdmittedAssemblyGlbMetadata } from '@taucad/geometry-core';

type AssemblyBounds = AdmittedAssemblyGlbMetadata['bounds'];

/** Candidate-owned bounds only; no scene objects or definition resources are allocated. */
export type AssemblyDemandIndex = Readonly<{
  metadata: AdmittedAssemblyGlbMetadata;
  occurrenceIndices: readonly number[];
  keys: readonly string[];
  keyToLeaf: ReadonlyMap<string, number>;
  bounds: Float64Array;
  children: Int32Array;
  ranges: Uint32Array;
  order: Uint32Array;
  /** Metadata occurrence index to its actual canonical parent, without allocating scene wrappers. */
  parents: Int32Array;
  /** Actual typed storage bytes; key/map/metadata heap overhead remains separately accounted. */
  byteLength: number;
}>;

/** Build once from the admitted placed bounds, before any Three.js definition parsing. */
export function buildAssemblyDemandIndex(metadata: AdmittedAssemblyGlbMetadata): AssemblyDemandIndex {
  const occurrenceIndices: number[] = [];
  const keys: string[] = [];
  const keyToLeaf = new Map<string, number>();
  for (const [index, occurrence] of metadata.occurrences.entries()) {
    if (!occurrence.definition || !occurrence.bounds) {
      continue;
    }
    const key = JSON.stringify(occurrence.ancestry);
    keyToLeaf.set(key, keys.length);
    keys.push(key);
    occurrenceIndices.push(index);
  }
  const nodeCount = Math.max(0, keys.length * 2 - 1);
  const bounds = new Float64Array(nodeCount * 6);
  const children = new Int32Array(nodeCount * 2).fill(-1);
  const ranges = new Uint32Array(nodeCount * 2);
  const order = Uint32Array.from(occurrenceIndices, (_index, leaf) => leaf);
  const parents = new Int32Array(keys.length > 0 ? metadata.occurrences.length : 0).fill(-1);
  if (parents.length > 0) {
    const occurrenceIndexById = new Map(metadata.occurrences.map((occurrence, index) => [occurrence.id, index]));
    for (const [index, occurrence] of metadata.occurrences.entries()) {
      if (!occurrence.parentId) {
        continue;
      }
      const parent = occurrenceIndexById.get(occurrence.parentId);
      if (parent === undefined) {
        throw new Error('Assembly occurrence parent metadata is unavailable');
      }
      parents[index] = parent;
    }
  }
  let nextNode = 0;
  const leafBounds = (leaf: number): AssemblyBounds => metadata.occurrences[occurrenceIndices[leaf]!]!.bounds!;
  const build = (start: number, count: number): number => {
    const node = nextNode++;
    const offset = node * 6;
    bounds.set(
      [
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ],
      offset,
    );
    ranges[node * 2] = start;
    ranges[node * 2 + 1] = count;
    for (let index = start; index < start + count; index++) {
      const value = leafBounds(order[index]!);
      for (let axis = 0; axis < 3; axis++) {
        bounds[offset + axis] = Math.min(bounds[offset + axis]!, value.min[axis]!);
        bounds[offset + axis + 3] = Math.max(bounds[offset + axis + 3]!, value.max[axis]!);
      }
    }
    if (count === 1) {
      return node;
    }
    let axis = 0;
    for (let candidate = 1; candidate < 3; candidate++) {
      if (
        bounds[offset + candidate + 3]! - bounds[offset + candidate]! >
        bounds[offset + axis + 3]! - bounds[offset + axis]!
      ) {
        axis = candidate;
      }
    }
    order.subarray(start, start + count).sort((left, right) => {
      const a = leafBounds(left);
      const b = leafBounds(right);
      const difference = a.min[axis]! * 0.5 + a.max[axis]! * 0.5 - (b.min[axis]! * 0.5 + b.max[axis]! * 0.5);
      return difference || left - right;
    });
    const leftCount = Math.floor(count / 2);
    children[node * 2] = build(start, leftCount);
    children[node * 2 + 1] = build(start + leftCount, count - leftCount);
    return node;
  };
  if (keys.length > 0) {
    build(0, keys.length);
  }
  return {
    metadata,
    occurrenceIndices,
    keys,
    keyToLeaf,
    bounds,
    children,
    ranges,
    order,
    parents,
    byteLength: bounds.byteLength + children.byteLength + ranges.byteLength + order.byteLength + parents.byteLength,
  };
}

/** Actual demanded occurrence ancestors in parent-before-child order, with no offscreen wrapper expansion. */
export function collectAssemblyResidentAncestorIndices(
  index: AssemblyDemandIndex,
  occurrenceKeys: ReadonlySet<string>,
): readonly number[] {
  const retained = new Set<number>();
  const ordered: number[] = [];
  for (const key of occurrenceKeys) {
    const leaf = index.keyToLeaf.get(key);
    if (leaf === undefined) {
      continue;
    }
    let occurrence = index.occurrenceIndices[leaf]!;
    const ancestors: number[] = [];
    while (occurrence >= 0 && !retained.has(occurrence)) {
      ancestors.push(occurrence);
      occurrence = index.parents[occurrence]!;
    }
    for (const ancestor of ancestors.reverse()) {
      retained.add(ancestor);
      ordered.push(ancestor);
    }
  }
  return ordered;
}

/** Query in canonical double precision; callers transform the six camera planes through existing frame adapters. */
export function queryAssemblyDemandIndex({
  index,
  frustum,
  posedBounds = new Map<string, AssemblyBounds>(),
  forcedKeys = new Set<string>(),
}: {
  readonly index: AssemblyDemandIndex;
  readonly frustum: Frustum;
  /** Only changed rigid occurrence bounds; unchanged occurrences remain in the static tree. */
  readonly posedBounds?: ReadonlyMap<string, AssemblyBounds>;
  readonly forcedKeys?: ReadonlySet<string>;
}): Readonly<{ occurrenceKeys: ReadonlySet<string>; visitedNodes: number; testedLeaves: number }> {
  const occurrenceKeys = new Set<string>();
  let visitedNodes = 0;
  let testedLeaves = 0;
  const intersects = (minValues: ArrayLike<number>, offset = 0, maxValues = minValues): boolean => {
    const maxOffset = maxValues === minValues ? offset + 3 : 0;
    const minX = minValues[offset]!;
    const minY = minValues[offset + 1]!;
    const minZ = minValues[offset + 2]!;
    const maxX = maxValues[maxOffset]!;
    const maxY = maxValues[maxOffset + 1]!;
    const maxZ = maxValues[maxOffset + 2]!;
    for (const plane of frustum.planes) {
      const x = plane.normal.x * (plane.normal.x >= 0 ? maxX : minX);
      const y = plane.normal.y * (plane.normal.y >= 0 ? maxY : minY);
      const z = plane.normal.z * (plane.normal.z >= 0 ? maxZ : minZ);
      // Conservative rounding at large authored coordinates must not cull a boundary occurrence.
      const tolerance =
        Math.max(1, Math.abs(x), Math.abs(y), Math.abs(z), Math.abs(plane.constant)) * Number.EPSILON * 64;
      if (x + y + z + plane.constant < -tolerance) {
        return false;
      }
    }
    return true;
  };
  const visit = (node: number): void => {
    visitedNodes++;
    const offset = node * 6;
    if (!intersects(index.bounds, offset)) {
      return;
    }
    const left = index.children[node * 2]!;
    if (left < 0) {
      testedLeaves++;
      const leaf = index.order[index.ranges[node * 2]!]!;
      const key = index.keys[leaf]!;
      if (!posedBounds.has(key)) {
        occurrenceKeys.add(key);
      }
      return;
    }
    visit(left);
    visit(index.children[node * 2 + 1]!);
  };
  if (index.keys.length > 0) {
    visit(0);
  }
  for (const [key, value] of posedBounds) {
    if (!index.keyToLeaf.has(key)) {
      continue;
    }
    testedLeaves++;
    if (intersects(value.min, 0, value.max)) {
      occurrenceKeys.add(key);
    }
  }
  for (const key of forcedKeys) {
    if (index.keyToLeaf.has(key)) {
      occurrenceKeys.add(key);
    }
  }
  return { occurrenceKeys, visitedNodes, testedLeaves };
}
