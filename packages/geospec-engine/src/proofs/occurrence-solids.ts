/**
 * Content-keyed cache of prepared occurrence solids (CO-R2).
 *
 * A prepared solid is the expensive half of every mesh-side proof: the
 * tessellation fetch, the BVH, the island partition and — for the winding
 * classifier — the Barnes-Hut tree. Two things make it worth caching outside
 * the proof context:
 *
 * - a requirement is evaluated per *context*, and a fresh subject built from
 *   the same artifact must not pay for the same soup twice (the per-context
 *   `WeakMap` cannot provide that);
 * - the key is the subject's **content hash**, so reuse is a pure function of
 *   the bytes — never of object identity, never of run order.
 *
 * The cache is a small LRU: proofs walk a handful of occurrences, and holding
 * every soup of a large assembly forever is how a runner runs out of memory.
 *
 * @module
 */

import { preparePrefilterComponent } from '#mesh/overlap-prefilter.js';
import { buildWindingTree, fastWindingNumber } from '#proofs/winding-number.js';
import type { PrefilterComponent } from '#mesh/overlap-prefilter.js';
import type { WindingTree } from '#proofs/winding-number.js';
import type { OccurrenceMesh } from '#mesh/types.js';

/**
 * One prepared occurrence solid.
 *
 * @public
 */
export type OccurrenceSolid = {
  component: PrefilterComponent;
  /** Generalized winding number at a point, over the Barnes-Hut tree. */
  winding(point: readonly [number, number, number]): number;
};

/** Prepared soups are multi-megabyte; a handful covers every proof shape. */
const cacheCapacity = 16;

const cache = new Map<string, OccurrenceSolid>();

/**
 * Drop every prepared solid. Test support and shard boundaries only.
 *
 * @public
 */
export const clearOccurrenceSolidCache = (): void => {
  cache.clear();
};

/**
 * Fetch (or build) the prepared solid for one occurrence.
 *
 * @param options - Cache identity plus the tessellation fetcher. `contentHash`
 * absent means the subject carries no content provenance: nothing is cached,
 * because there is no identity to key on.
 * @returns The prepared solid, or `undefined` when the tessellation is
 * unavailable or empty.
 * @public
 */
export const getOccurrenceSolid = (options: {
  contentHash?: string;
  occurrence: number;
  fetch: () => OccurrenceMesh | undefined;
}): OccurrenceSolid | undefined => {
  const key = options.contentHash === undefined ? undefined : `${options.contentHash}|${options.occurrence}`;
  if (key !== undefined) {
    const hit = cache.get(key);
    if (hit) {
      // Refresh recency: the LRU evicts the least recently *used*, not the
      // least recently built.
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
  }
  const mesh = options.fetch();
  if (!mesh || mesh.triangleCount === 0) {
    return undefined;
  }
  const solid = prepare(mesh);
  if (key !== undefined) {
    cache.set(key, solid);
    if (cache.size > cacheCapacity) {
      cache.delete(cache.keys().next().value!);
    }
  }
  return solid;
};

const prepare = (mesh: OccurrenceMesh): OccurrenceSolid => {
  const positions = Float64Array.from(mesh.positions);
  const component = preparePrefilterComponent(positions, mesh.triangleCount);
  let tree: WindingTree | undefined;
  return {
    component,
    winding: (point) => {
      tree ??= buildWindingTree(component.windingMesh);
      return fastWindingNumber(tree, [point[0], point[1], point[2]]);
    },
  };
};
