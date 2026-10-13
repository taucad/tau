import type { Vector2 } from 'three';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { createGltfFatLineMaterial, setGltfFatLineMaterialColor } from '#graphics/three/materials/gltf-edges.js';
import type { GltfFatLineMaterial } from '#graphics/three/materials/gltf-edges.js';
import type { ModelComponentEmphasis } from '#graphics/three/materials/model-component-appearance.js';
import { gltfEdgeHoverColor, gltfEdgeSelectedColor } from '#graphics/three/overlay-colors.constants.js';
import { viewportRenderTiers } from '#graphics/three/utils/render-order.utils.js';

export type CreateSectionContourOutlineMaterialOptions = Readonly<{
  backend: ResolvedGraphicsBackend;
  edgeColor: number;
  resolution: Vector2;
}>;

export type SectionContourOutlineEmphasis = Readonly<{ edgeColor: number; renderOrder: number }>;

/**
 * How a cap outline is drawn for the emphasis of the component that was cut.
 *
 * The cut face belongs to the component, so its outline follows the component's characteristic
 * edges into the emphasis colour and up to {@link viewportRenderTiers.modelEmphasisEdge}. Leaving
 * it at the theme colour strands a black loop inside an otherwise yellow shape.
 */
export function resolveSectionContourOutlineEmphasis(
  emphasis: ModelComponentEmphasis,
  themeEdgeColor: number,
): SectionContourOutlineEmphasis {
  if (emphasis === 'none') {
    return { edgeColor: themeEdgeColor, renderOrder: viewportRenderTiers.sectionContourOutline };
  }
  return {
    edgeColor: emphasis === 'hover' ? gltfEdgeHoverColor : gltfEdgeSelectedColor,
    renderOrder: viewportRenderTiers.modelEmphasisEdge,
  };
}

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
