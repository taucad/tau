import type * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { createVertexColoredStripedMaterialForBackend } from '#components/geometry/graphics/three/materials/striped-material.js';
import type { StripedMaterialProperties } from '#components/geometry/graphics/three/materials/striped-material.types.js';

const materialCacheCapacity = 16;
const materialCache = new Map<string, THREE.Material>();
const recencyGenerationByKey = new Map<string, number>();
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
    const generation = recencyGenerationByKey.get(key);
    if (generation !== undefined && generation < oldestGeneration) {
      oldestGeneration = generation;
      oldestKey = key;
    }
  }

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

export const disposeVertexColoredSectionCapMaterialCache = (): void => {
  for (const material of materialCache.values()) {
    material.dispose();
  }

  materialCache.clear();
  recencyGenerationByKey.clear();
  recencyCounter = 0;
};
