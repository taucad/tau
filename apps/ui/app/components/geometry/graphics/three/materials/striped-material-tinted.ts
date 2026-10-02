import type * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { createStripedMaterialForBackend } from '#components/geometry/graphics/three/materials/striped-material.js';

/** Keyed `(backend, tint, frequency, width)` material cache for BVH contour fills (R8c). */
const materialCacheCapacity = 64;

/**
 * @internal
 * @remarks Test-only: disposes all cached materials.
 */
export function disposeTintedStripedMaterialCache(): void {
  for (const material of materialCache.values()) {
    material.dispose();
  }

  materialCache.clear();
  recencyGenerationByKey.clear();
  recencyCounter = 0;
}

const materialCache = new Map<string, THREE.Material>();

/** Monotonic touch order for deterministic LRU eviction when over capacity. */
const recencyGenerationByKey = new Map<string, number>();
let recencyCounter = 0;

function touchKey(key: string): void {
  recencyCounter += 1;
  recencyGenerationByKey.set(key, recencyCounter);
}

export type TintedStripedMaterialParameters = Readonly<{
  tintColor: number;
  stripeFrequency: number;
  stripeWidth: number;
}>;

function cacheMaterialKey(
  backend: ResolvedGraphicsBackend,
  parameters: Pick<TintedStripedMaterialParameters, 'tintColor' | 'stripeFrequency' | 'stripeWidth'>,
): string {
  return `${backend}:${parameters.tintColor}:${parameters.stripeFrequency}:${parameters.stripeWidth}`;
}

/** Evicts the least-recently-used tinted material when cache is at capacity. */
function evictStaleMaterialIfNeeded(forNewKey: string): void {
  if (materialCache.size < materialCacheCapacity || materialCache.has(forNewKey)) {
    return;
  }

  let oldestKey: string | undefined;
  let oldestGeneration = Infinity;
  for (const key of materialCache.keys()) {
    const generation = recencyGenerationByKey.get(key);
    if (generation === undefined) {
      continue;
    }

    if (generation < oldestGeneration) {
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
}

/**
 * Tinted striped material for per-mesh contour caps (Architecture C — no stencil).
 * Results are cached and shared across fill meshes with matching parameters.
 */
export function createTintedStripedMaterial(
  backend: ResolvedGraphicsBackend,
  parameters: TintedStripedMaterialParameters,
): THREE.Material {
  const key = cacheMaterialKey(backend, parameters);

  const cached = materialCache.get(key);
  if (cached !== undefined) {
    touchKey(key);
    return cached;
  }

  evictStaleMaterialIfNeeded(key);

  const material = createStripedMaterialForBackend(backend, {
    tintColor: parameters.tintColor,
    stripeFrequency: parameters.stripeFrequency,
    stripeWidth: parameters.stripeWidth,
  });

  materialCache.set(key, material);
  touchKey(key);
  return material;
}
