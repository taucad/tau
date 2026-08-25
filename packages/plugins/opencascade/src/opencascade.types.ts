import type { TopoDS_Shape } from 'libcascade/init';

/**
 * A shape with optional display and material metadata for the OpenCASCADE kernel.
 *
 * Returned from an OpenCASCADE model's `main()` function to control per-shape
 * appearance in both GLTF preview rendering and STEP export via XCAF.
 *
 * @public
 */
export type ShapeEntry = {
  shape: TopoDS_Shape;
  name?: string;
  /** CSS hex color string (e.g. `'#ff0000'`). Applied to GLTF baseColor and STEP surface color. */
  color?: string;
  /** Opacity from 0 (transparent) to 1 (opaque). Maps to GLTF alpha and STEP transparency. */
  opacity?: number;
  /** PBR metalness factor (0 = dielectric, 1 = metal). Threaded to GLTF metallicFactor and STEP visual material. */
  metalness?: number;
  /** PBR roughness factor (0 = mirror, 1 = diffuse). Threaded to GLTF roughnessFactor and STEP visual material. */
  roughness?: number;
  /** Physical density in g/cm³. Written to STEP as XCAFDoc_Material for mass computation. */
  density?: number;
};
