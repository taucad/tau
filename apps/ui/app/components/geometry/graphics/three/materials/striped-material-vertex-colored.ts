import type * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { createVertexColoredStripedMaterialForBackend } from '#components/geometry/graphics/three/materials/striped-material.js';
import type { StripedMaterialProperties } from '#components/geometry/graphics/three/materials/striped-material.types.js';

const materialCacheCapacity = 16;
const materialCache = new Map<string, THREE.Material>();
const recencyGenerationByKey = new Map<string, number>();
// Keys pinned by a live mesh; eviction must skip these or it disposes a
// material that is still rendering.
const inUseCountByKey = new Map<string, number>();
let recencyCounter = 0;

const keyForVertexColoredStripedMaterial = (
  backend: ResolvedGraphicsBackend,
  properties: StripedMaterialProperties | undefined,
): string =>
  [backend, properties?.stripeFrequency ?? 'default-frequency', properties?.stripeWidth ?? 'default-width'].join(':');

const touchKey = (key: string): void => {
  recencyCounter += 1;
  recencyGenerationByKey.set(key, recencyCounter);
};

const evictStaleMaterialIfNeeded = (forNewKey: string): void => {
  if (materialCache.size < materialCacheCapacity || materialCache.has(forNewKey)) {
    return;
  }

  let oldestKey: string | undefined;
  let oldestGeneration = Infinity;
  for (const key of materialCache.keys()) {
    if ((inUseCountByKey.get(key) ?? 0) > 0) {
      continue;
    }
    const generation = recencyGenerationByKey.get(key);
    if (generation !== undefined && generation < oldestGeneration) {
      oldestGeneration = generation;
      oldestKey = key;
    }
  }

  // Every entry is pinned in-use — grow past capacity rather than dispose a
  // material a live mesh still references.
  if (oldestKey === undefined) {
    return;
  }

  materialCache.get(oldestKey)?.dispose();
  materialCache.delete(oldestKey);
  recencyGenerationByKey.delete(oldestKey);
};

export const createVertexColoredSectionCapMaterial = (
  backend: ResolvedGraphicsBackend,
  properties?: StripedMaterialProperties,
): THREE.Material => {
  const key = keyForVertexColoredStripedMaterial(backend, properties);
  const cached = materialCache.get(key);
  if (cached) {
    touchKey(key);
    return cached;
  }

  evictStaleMaterialIfNeeded(key);
  const material = createVertexColoredStripedMaterialForBackend(backend, properties);
  materialCache.set(key, material);
  touchKey(key);
  return material;
};

/**
 * Pin or unpin a cached cap material as in-use so LRU eviction never disposes
 * a material still bound to a live mesh. Callers mark on assign and unmark when
 * the mesh releases the material (or is torn down).
 */
export const markVertexColoredSectionCapMaterialInUse = (
  backend: ResolvedGraphicsBackend,
  properties: StripedMaterialProperties | undefined,
  inUse: boolean,
): void => {
  const key = keyForVertexColoredStripedMaterial(backend, properties);
  if (inUse) {
    inUseCountByKey.set(key, (inUseCountByKey.get(key) ?? 0) + 1);
    return;
  }

  const nextCount = (inUseCountByKey.get(key) ?? 0) - 1;
  if (nextCount > 0) {
    inUseCountByKey.set(key, nextCount);
  } else {
    inUseCountByKey.delete(key);
  }
};

export const disposeVertexColoredSectionCapMaterialCache = (): void => {
  for (const material of materialCache.values()) {
    material.dispose();
  }

  materialCache.clear();
  recencyGenerationByKey.clear();
  inUseCountByKey.clear();
  recencyCounter = 0;
};
