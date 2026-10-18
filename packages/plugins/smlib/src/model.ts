import type { Mesh, Shape } from '@classcad/smlibwasm';
import type { GlbMaterial, GlbResources } from '@taucad/geometry-core';

/**
 * Anything an SMLib model can return for display: a body (`Part`, `Shell`, `Sketch`), a `Face`, a
 * triangle `Mesh`, or curves (`Edge`, `Wire`) for the drawing view.
 *
 * @public
 */
export type SmlibShape = Shape | Mesh;

/**
 * A shape with optional display and material metadata for rendering.
 *
 * Returned from an SMLib model's `main()` function to control per-shape appearance in glTF
 * rendering and STEP export. A body's own `named()` and `colored()` values apply when the config
 * leaves `name` or `color` out.
 *
 * @public
 *
 * @example <caption>Shape with PBR material properties</caption>
 * ```typescript
 * import { Cylinder } from '@classcad/smlibwasm';
 *
 * export default function main() {
 *   return {
 *     shape: Cylinder(10, 30),
 *     material: {
 *       pbrMetallicRoughness: { metallicFactor: 1, roughnessFactor: 0.25 },
 *       extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.8 } },
 *     },
 *   };
 * }
 * ```
 */
export type ShapeConfig = {
  shape: SmlibShape;
  name?: string;
  /** Drawing stroke style for curves: `'dashes'` or `'dots'`. */
  strokeType?: string;
  /** Physical density in g/cm³, retained on the part for mass evidence. */
  density?: number;
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

/** Model-level textures and images shared by the returned shapes. @public */
export type Model = GlbResources & { shapes: ShapeConfig[] };

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- Public authoring API exposes the shared standard material types.
export type { GlbMaterial as Material, GlbImage as Image, GlbResources as Resources } from '@taucad/geometry-core';
