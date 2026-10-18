import { Axis, Plane, type VectorLike } from './geometry.js';
import { Edge, Face, type FilletOptions, type FilletRadius, Part, type Shape, ShapeList, Shell, Sketch, Wire } from './shapes.js';
type Any = any;
/** How a profile is extruded (see `Sketch.extrude`). */
export interface ExtrudeFunctionOptions {
    both?: boolean;
    taper?: number;
    direction?: Axis | VectorLike | null;
}
/**
 * Extrude a sketch, a planar face or a closed wire into a solid (see `Sketch.extrude`).
 *
 * An open curve extrudes into a surface (a Shell), along `direction` (an axis or a vector) or the
 * normal of the curve's plane.
 */
export declare function extrude(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, amount: number, options?: ExtrudeFunctionOptions): Part | Shell;
/**
 * Revolve a sketch about an axis into a solid (see `Sketch.revolve`).
 *
 * An open curve revolves into a surface of revolution (a Shell).
 */
export declare function revolve(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, axis?: Axis | null, angle?: number): Part | Shell;
/**
 * A solid through a sequence of cross sections, or a surface through open curves.
 *
 * @param sections Two or more sections in order: sketches, planar faces or closed wires for a
 *   solid; open edges or wires for a surface (a Shell). Sections with holes make a hollow solid;
 *   every section needs the same number of holes.
 * @param options `ruled`: straight transitions between neighbouring sections. `smooth`: with four
 *   or more sections, pass through them with a cubic surface (`false`: quadratic). Three sections
 *   always give a quadratic one.
 */
export declare function loft(sections: readonly unknown[], options?: {
    ruled?: boolean;
    smooth?: boolean;
}): Part | Shell;
/** How a profile is swept (see `sweep`). */
export interface SweepOptions {
    /** Turn the profile to be perpendicular to the path at its start (default). */
    orient?: boolean;
    /** Keep the profile's orientation fixed instead of turning it with the path. */
    translational?: boolean;
    /** For paths of several edges: miter the corners of a planar path (default for planar
     * paths); `false` sweeps each edge on its own and joins the pieces. */
    sharpCorners?: boolean | null;
}
/**
 * Sweep a profile along a path.
 *
 * The profile is moved so that its center sits at the start of the path and (with `orient`)
 * turned to face along the path, so profiles can be drawn anywhere, usually in the XY plane:
 *
 *     const tube = sweep(Circle(2), Spline([0, 0, 0], [0, 10, 20], [30, 10, 40]))
 *     const rail = sweep(Rectangle(4, 2), Helix(10, 40, 20))
 *
 * @param profile A sketch (holes allowed), a planar face or a closed wire.
 * @param path An edge, or a wire of connected edges.
 */
export declare function sweep(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, path: Edge | Wire | ShapeList<Edge>, options?: SweepOptions): Part | Shell;
/** Round edges of the part they belong to (see `Part.fillet`), or corners of the sketch they
 * belong to: `fillet(s.vertices().concave(), 2)` (see `Sketch.fillet`). */
export declare function fillet(edges: unknown, radius: FilletRadius, options?: FilletOptions): Part | Sketch;
/** Bevel edges of the part they belong to (see `Part.chamfer`), or corners of the sketch they
 * belong to (see `Sketch.chamfer`). */
export declare function chamfer(edges: unknown, length: number): Part | Sketch;
/** Hollow out a part (see `Part.shell`). */
export declare function shell(part: Part, thickness: number, openings?: unknown, options?: {
    outward?: boolean;
}): Part;
/** Grow or shrink a part or a sketch by `distance` (for a sketch also the option
 * `corners: "round" | "sharp" | "chamfer"`, see `Sketch.offset`). */
export declare function offset(shape: Part | Sketch, distance: number, options?: {
    corners?: string;
    round?: boolean | null;
}): Part | Sketch;
/** A mirrored copy of a shape. */
export declare function mirror<S extends Shape>(shape: S, plane?: Plane | Face | Axis | ShapeList<Face>): S;
/** Cut a part with a plane (see `Part.split`). */
export declare function split(part: Part, plane: Plane | Face, keep?: 'above' | 'below' | 'both'): Part | [Part, Part];
/**
 * Parts as one part made of cells: overlaps become cells of their own, touching cells share their
 * faces (see `Part.merge`; `cells()` gives them as parts).
 */
export declare function merge(...parts: (Part | Iterable<Part>)[]): Part;
/** Cross-section of a part (see `Part.section`). */
export declare function section(part: Part, plane?: Plane | Face): Sketch;
/** Turn a face or sheet into a solid of `thickness`. */
export declare function thicken(surface: Shell | Face, thickness: number): Part;
export {};
