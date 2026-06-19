import type { Vector2 } from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import {
  createGltfFatLineMaterial,
  setGltfFatLineMaterialColor,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import type { GltfFatLineMaterial } from '#components/geometry/graphics/three/materials/gltf-edges.js';

export type CreateSectionContourOutlineMaterialOptions = Readonly<{
  backend: ResolvedGraphicsBackend;
  edgeColor: number;
  resolution: Vector2;
}>;

export function applySectionContourOutlineMaterialState(material: GltfFatLineMaterial): void {
  material.transparent = false;
  material.depthTest = true;
  material.depthWrite = false;
  material.needsUpdate = true;
}

export function createSectionContourOutlineMaterial(
  options: CreateSectionContourOutlineMaterialOptions,
): GltfFatLineMaterial {
  const material = createGltfFatLineMaterial(options);
  applySectionContourOutlineMaterialState(material);

  return material;
}

export function setSectionContourOutlineMaterialColor(material: GltfFatLineMaterial, edgeColor: number): void {
  setGltfFatLineMaterialColor(material, edgeColor);
  applySectionContourOutlineMaterialState(material);
}
