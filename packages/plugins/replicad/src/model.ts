import type { AnyShape, MeshShape } from 'replicad';
import type { GlbMaterial, GlbResources } from '@taucad/geometry-core';
import type { InterfaceDeclarations } from '#annotations/index.js';

/**
 * A shape with optional display and material metadata for rendering.
 *
 * Returned from a Replicad model's `main()` function to control per-shape
 * appearance in GLTF preview rendering. Native BRep shapes also support STEP;
 * imported MeshShape geometry remains mesh-only.
 *
 * @public
 *
 * @example <caption>Shape with PBR material properties</caption>
 * ```typescript
 * import { makeCylinder } from 'replicad';
 *
 * export default function main() {
 *   return {
 *     shape: makeCylinder(10, 30),
 *     material: {
 *       pbrMetallicRoughness: { metallicFactor: 1, roughnessFactor: 0.25 },
 *       extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.8 } },
 *     },
 *     density: 7.85,
 *   };
 * }
 * ```
 */
export type ShapeConfig = {
  shape: AnyShape | MeshShape;
  name?: string;
  strokeType?: string;
  /** Authored density in g/cm³ for physical inspection and native STEP export. */
  density?: number;
  interfaces?: InterfaceDeclarations;
} & (
  | {
      /** CSS color, converted from sRGB to linear glTF base color. */
      color?: string;
      opacity?: number;
      metalness?: number;
      roughness?: number;
      material?: never;
    }
  | {
      /** Standard glTF material. Color factors are linear; volume distances are metres. */
      material: GlbMaterial;
      color?: never;
      opacity?: never;
      metalness?: never;
      roughness?: never;
    }
);

/** Model-level textures and images shared by the returned BRep shapes. @public */
export type Model = GlbResources & { shapes: ShapeConfig[] };

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- Public authoring API exposes the shared standard material types.
export type { GlbMaterial as Material, GlbImage as Image, GlbResources as Resources } from '@taucad/geometry-core';
