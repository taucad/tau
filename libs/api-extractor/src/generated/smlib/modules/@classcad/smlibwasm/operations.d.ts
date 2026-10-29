import { Axis, type Location, Plane, type VectorLike } from './geometry.js';
import type { Mesh } from './mesh.js';
import { Edge, type EdgesLike, Face, type ChamferOptions, type FacesLike, type FilletOptions, type FilletRadius, Part, type PushOptions, type RegionLike, type Shape, ShapeList, Shell, Sketch, Vertex, type WallsLike, Wire } from './shapes.js';
type Any = any;
/** How a profile is extruded (see `Sketch.extrude`). */
export interface ExtrudeFunctionOptions {
    both?: boolean;
    taper?: number;
    direction?: Axis | VectorLike | null;
    corners?: 'sharp' | 'round';
}
/**
 * Extrude a sketch, a planar face or a closed wire into a solid (see `Sketch.extrude`).
 *
 * An open curve extrudes into a surface (a Shell), along `direction` (an axis or a vector) or the
 * normal of the curve's plane; it takes no `taper` (RangeError).
 */
export declare function extrude(profile: Sketch | Face | ShapeList<Sketch | Face>, amount: number, options?: ExtrudeFunctionOptions): Part;
export declare function extrude(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, amount: number, options?: ExtrudeFunctionOptions): Part | Shell;
/**
 * Revolve a sketch about an axis into a solid (see `Sketch.revolve`).
 *
 * An open curve revolves into a surface of revolution (a Shell).
 */
export declare function revolve(profile: Sketch | Face | ShapeList<Sketch | Face>, axis?: Axis | null, angle?: number): Part;
export declare function revolve(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, axis?: Axis | null, angle?: number): Part | Shell;
/** Options of `loft`. */
export type LoftOptions = {
    ruled?: boolean;
    smooth?: boolean;
    startTangent?: Axis | VectorLike | Face | ShapeList<Face> | null;
    endTangent?: Axis | VectorLike | Face | ShapeList<Face> | null;
    closed?: boolean;
    rails?: Edge | Wire | readonly (Edge | Wire)[] | null;
};
/**
 * A solid through a sequence of cross sections, or a surface through open curves.
 *
 * @param sections Two or more sections in order: sketches, planar faces or closed wires for a
 *   solid; open edges or wires for a surface (a Shell). Sections with holes make a hollow solid;
 *   every section needs the same number of holes.
 * `startTangent` and `endTangent` set the direction the loft leaves its first section in and reaches its
 * last in, so that it meets the bodies there smoothly; a face there (one that ends at the section) makes
 * the loft continue it:
 *
 *     const neck = loft([Circle(10), Circle(4).moved(new Location([0, 0, 30]))], { startTangent: Z, endTangent: Z })
 *     const cap = loft([topRim, Circle(4).moved(new Location([0, 0, 30]))], { startTangent: can.faces().cylinders()[0] })
 *
 * `rails` are curves a loft of open sections runs along from its first section to its last, through
 * every section (guide curves): the surface passes through them as through the sections:
 *
 *     const panel = loft([s0, s1, s2], { rails: [keel, chine] })
 *
 * @param options `ruled`: straight transitions between neighbouring sections. `smooth`: with four
 *   or more sections, pass through them with a cubic surface (`false`: quadratic). Three sections
 *   always give a quadratic one. `startTangent`: the direction (an axis or a vector) the loft leaves the
 *   first section in: across it, usually along its normal (`Z` for a section in the XY plane, as an
 *   extrusion of it leaves it); only the direction counts, and the loft is cubic then. Or a face that ends
 *   at the first section (the section lies on it, usually along its edge): the loft leaves the section
 *   continuing the face, tangent to it all along the section (within 1e-6 radians where the face is a
 *   plane, a cylinder, a cone or a sphere about the section, 1e-3 on others). `endTangent`: the
 *   direction the loft reaches the last section in, or a face that ends at the last section, which the
 *   loft runs into tangentially. `closed`: run on from the last section through the first again,
 *   smoothly (three sections or more): a ring without ends. `rails`: a curve (an edge or a wire) or a
 *   list of them that run from the first section to the last and cross every section once, for open
 *   sections (a surface): the loft passes through them as through the sections, within about 3e-7 (a Gordon
 *   surface through the sections and the rails, cubic or as near as the counts allow). Where no rail
 *   runs along the sections' starts or their ends, the loft's border there runs smoothly through them.
 *   Sections and rails must be smooth curves (each is joined into one). Not with `ruled`, the tangents
 *   or `closed`; closed sections along rails are not supported.
 */
export declare function loft(sections: readonly (Sketch | Face | ShapeList<Sketch | Face>)[], options?: LoftOptions): Part;
export declare function loft(sections: readonly (Sketch | Face | Wire | Edge | ShapeList<Any>)[], options?: LoftOptions): Part | Shell;
/** How a profile is swept (see `sweep`). */
export interface SweepOptions {
    /** Turn the profile to be perpendicular to the path at its start (default). */
    orient?: boolean;
    /** Keep the profile's orientation fixed instead of turning it with the path. */
    translational?: boolean;
    /** For paths of several edges: miter the corners of a planar path (default for planar
     * paths); `false` sweeps the path piece by piece (each run of tangent edges in one go) and joins
     * the pieces. */
    sharpCorners?: boolean | null;
    /** An axis or a direction the profile keeps its attitude to: along the whole path it stands at the
     * angle it starts at to `up` made perpendicular to the path (the path must not run along `up`).
     * `'frenet'`: to the path's principal normal (towards the center of its curvature; the path must
     * bend everywhere). Default: the axis of a helical path, the smallest turn on others. */
    up?: Axis | VectorLike | string | null;
    /** Degrees the profile turns about the path on top of that, spread evenly along its length; or a
     * function of the fraction of the length (0 at the start, 1 at the end) that gives the angle in
     * degrees there (the profile starts turned by `twist(0)`). Along a closed path the profile must come
     * round into itself (a whole number of turns, or of its symmetry). */
    twist?: number | ((s: number) => number);
    /** The profile's scale along the path, about the point of it that sits on the path: `[start, end]`
     * changes evenly along the length; `[[t, s], ...]` passes through the scales `s` at the fractions `t`
     * of the length (from 0 to 1; a smooth curve that does not overshoot them); a function of the
     * fraction gives it. Positive everywhere; along a closed path the same at both ends. Planar paths of
     * several edges are then swept piece by piece (`sharpCorners: false`). */
    scale?: readonly [
        number,
        number
    ] | readonly (readonly [
        number,
        number
    ])[] | ((s: number) => number) | null;
    /** The point of the profile that goes on the path (and that `scale` scales about): `'center'` (the
     * default: the center of its box along the axes of its plane), `'origin'` (the origin of the sketch's
     * plane, `Sketch.plane`: [0, 0] of a `Polygon` or `Profile` drawn on XY, the middle of a centered
     * shape such as `Circle`, moved with it; for a face, a wire or an edge the point [0, 0, 0]), or a
     * point (a vector or a vertex) of the profile's plane. */
    anchor?: 'center' | 'origin' | VectorLike | Vertex;
    /** A second rail (an edge or a wire; the path is the first) for an open profile that runs from the
     * path to it: the profile is moved, turned and scaled (the same in every direction) so that its ends
     * stay on both, and the surface (a `Shell`) passes through both rails, within about 2e-7. The profile's frame
     * turns with the line from the path to the rail and with the rails' mean direction; the rails are
     * matched by the fraction of their lengths, from where the profile meets them to their ends. Not with
     * `orient`, `translational`, `sharpCorners`, `up`, `twist`, `scale` or `anchor`, which the rails decide:
     *
     *     const hood = sweep(ThreePointArc([0, 0, 0], [10, 0, 4], [20, 0, 0]), left, { rails: right }) */
    rails?: Edge | Wire | null;
}
/**
 * Sweep a profile along a path.
 *
 * The profile is moved so that the center of its box (along the axes of its plane) sits at the
 * start of the path and (with `orient`) turned to face along the path, so profiles can be drawn
 * anywhere, usually in the XY plane:
 *
 *     const tube = sweep(Circle(2), Spline([0, 0, 0], [0, 10, 20], [30, 10, 40]))
 *     const rail = sweep(Rectangle(4, 2), Helix(10, 40, 20))
 *
 * `anchor` puts another point of the profile on the path: `'origin'` (the origin of the sketch's
 * plane) or a point of the profile's plane:
 *
 *     const lip = sweep(Rectangle(4, 2, { align: [Align.MIN, Align.MIN] }), rim, { anchor: [0, 0] }) // its corner
 *
 * Edges of a path that meet tangentially are swept as one; at a corner of a path that is not
 * planar, the profile goes on turned by the smallest rotation from one tangent to the next. Where
 * the kernel cannot sweep an open path of several edges so, each edge is swept on its own, turned
 * to its own start, and the pieces are fused (with a warning unless the profile is round: it turns
 * where the edges meet). A closed path it cannot sweep so (the fuse where the halves of a loop
 * closed with a kink cross) is swept in pieces, each turned from the path's start to its own, where that puts the profile on the
 * path. Faces without area that a fuse leaves are taken out (or the sweep throws `ModelingError`).
 * The corners of a planar path of several edges are mitered, the profile placed as on any other
 * path; where they cannot be (arcs that meet at a corner), the path is swept piece by piece, with a
 * warning.
 *
 * Along the path the profile turns as little as it can (a rotation-minimizing frame: on a planar path
 * it keeps its attitude to the plane), except along a helix (also a conical one), where it keeps its
 * attitude to the helix's axis, as a thread or a flat spring wire does. `up` and `twist` set the
 * attitude instead:
 *
 *     const rail = sweep(Rectangle(4, 2), path, { up: Z })  // stays upright: its angle to Z kept
 *     const bar = sweep(Rectangle(10, 2), Line([0, 0, 0], [0, 0, 100]), { twist: 180 })  // a half turn
 *
 * `scale` grows or shrinks the profile along the path, about the point that sits on it:
 *
 *     const horn = sweep(Circle(2), Spline([0, 0, 0], [0, 10, 20], [30, 10, 40]), { scale: [1, 3] })
 *     const spring = sweep(Circle(1), Helix(8, 40, 15), { scale: [[0, 1], [0.5, 1.5], [1, 1]] })
 *
 * A single line or arc is swept as an extrusion or a revolve (planes, cylinders, cones, spheres and
 * tori, not B-spline surfaces); a profile that reaches across the axis of an arc throws `ModelingError`
 * (it would sweep through itself).
 *
 * @param profile A sketch (holes allowed), a planar face or a closed wire.
 * @param path An edge, or a wire of connected edges.
 */
export declare function sweep(profile: Sketch | Face | ShapeList<Sketch | Face>, path: Edge | Wire | ShapeList<Edge>, options?: SweepOptions): Part;
export declare function sweep(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, path: Edge | Wire | ShapeList<Edge>, options?: SweepOptions): Part | Shell;
/**
 * Swing a profile around an outline: a revolve about Z whose circle is the outline.
 *
 * At each height the section is the outline scaled about the Z axis so that it passes through the
 * profile's point on the +X side: the cut of the result by the XZ plane on the +X side is the
 * profile. A circle around the origin gives the revolve. The faces are exact (NURBS products of the
 * two curves).
 *
 * @param profile Drawn as for a lathe (see `revolve`): in the XZ plane (`Plane.front`), x the
 *   distance from the Z axis (at least 0), z the height. A region (a sketch, a planar face or a closed
 *   wire) gives a solid; its edges on the Z axis swing to nothing and are left out, its holes are swung
 *   and cut out. An open curve gives a surface (a Shell).
 * @param outline A closed curve around the Z axis in a plane parallel to XY (its height does not
 *   matter), such as `Ellipse(30, 20)` or a `RoundedRectangle`: a single region or a closed wire or
 *   edge. Every ray from the Z axis must cross it once.
 */
export declare function swing(profile: Sketch | Face, outline: Sketch | Face | Wire | Edge | ShapeList<Any>): Part;
export declare function swing(profile: Sketch | Face | Wire | Edge | ShapeList<Any>, outline: Sketch | Face | Wire | Edge | ShapeList<Any>): Part | Shell;
/** Round edges of the part they belong to (see `Part.fillet`), or corners of the sketch they
 * belong to: `fillet(s.vertices().concave(), 2)` (see `Sketch.fillet`). */
export declare function fillet(edges: EdgesLike, radius: FilletRadius, options?: FilletOptions): Part;
export declare function fillet(vertices: Vertex | readonly Vertex[], radius: number): Sketch;
export declare function fillet(edges: EdgesLike | Vertex | readonly Vertex[], radius: FilletRadius, options?: FilletOptions): Part | Sketch;
/** Bevel edges of the part they belong to (see `Part.chamfer`), or corners of the sketch they
 * belong to (see `Sketch.chamfer`). */
export declare function chamfer(edges: EdgesLike, length: number, options?: ChamferOptions): Part;
export declare function chamfer(vertices: Vertex | readonly Vertex[], length: number): Sketch;
export declare function chamfer(edges: EdgesLike | Vertex | readonly Vertex[], length: number, options?: ChamferOptions): Part | Sketch;
/** Hollow out a part (see `Part.shell`). */
export declare function shell(part: Part, thickness: number, openings?: FacesLike | null, options?: {
    outward?: boolean;
    corners?: 'round' | 'sharp' | null;
    walls?: WallsLike | null;
}): Part;
/** Options of the function `offset`: `corners` for a part, a sketch or a wire, `plane` for a wire or an edge. */
export type OffsetFunctionOptions = {
    corners?: 'round' | 'sharp' | 'chamfer';
    plane?: Plane | null;
};
/** Grow or shrink a part or a sketch by `distance` (also the option `corners`: for a part
 * `"sharp" | "round"`, see `Part.offset`; for a sketch `"round" | "sharp" | "chamfer"`, see
 * `Sketch.offset`), move a sheet or a face along its normals (`Shell.offset`, `Face.offset`: a
 * sheet), or move a wire or an edge sideways (`Wire.offset`, `Edge.offset`). */
export declare function offset(shape: Part, distance: number, options?: {
    corners?: 'sharp' | 'round';
}): Part;
export declare function offset(shape: Sketch, distance: number, options?: {
    corners?: 'round' | 'sharp' | 'chamfer';
}): Sketch;
export declare function offset(shape: Shell | Face, distance: number): Shell;
export declare function offset(shape: Wire, distance: number, options?: {
    corners?: 'round' | 'sharp' | 'chamfer';
    plane?: Plane | null;
}): Wire;
export declare function offset(shape: Edge, distance: number, options?: {
    plane?: Plane | null;
}): Edge;
export declare function offset(shape: Part | Sketch | Shell | Face | Wire | Edge, distance: number, options?: OffsetFunctionOptions): Part | Sketch | Shell | Wire | Edge;
/** A mirrored copy of a shape. */
export declare function mirror<S extends Shape>(shape: S, plane?: Plane | Face | Axis | ShapeList<Face>): S;
/** Cut a part with a plane or along a sheet (see `Part.split`). */
export declare function split(part: Part, plane: Plane | Face | Shell, keep: 'both'): [
    Part,
    Part
];
export declare function split(part: Part, plane: Plane | Face | Shell, keep?: 'above' | 'below'): Part;
export declare function split(part: Part, plane: Plane | Face | Shell, keep?: 'above' | 'below' | 'both'): Part | [
    Part,
    Part
];
/**
 * Parts as one part made of cells: overlaps become cells of their own, touching cells share their
 * faces (see `Part.merge`; `cells()` gives them as parts).
 */
export declare function merge(...parts: (Part | Iterable<Part>)[]): Part;
/** Cross-section of a part (see `Part.section`). */
export declare function section(part: Part, plane?: Plane | Face): Sketch;
/** Turn a face or sheet into a solid of `thickness` (`both`: half of it to each side; see
 * `Shell.thicken`). */
export declare function thicken(surface: Shell | Face, thickness: number, options?: {
    both?: boolean;
}): Part;
/** Union of bodies, Python's `a + b` (see `Part.fuse`, `Shell.fuse`, `Sketch.fuse`). */
export declare function fuse(shape: Sketch, ...others: (Sketch | Iterable<Sketch>)[]): Sketch;
export declare function fuse(shape: Shell, ...others: (Shell | Part | Face | Iterable<Shell | Part | Face>)[]): Shell;
export declare function fuse(shape: Part, ...others: (Part | Iterable<Part>)[]): Part;
/** A body less others, Python's `a - b` (see `Part.cut`, `Shell.cut`, `Sketch.cut`). */
export declare function cut(shape: Sketch, ...others: (Sketch | Iterable<Sketch>)[]): Sketch;
export declare function cut(shape: Shell, ...others: (Part | Iterable<Part>)[]): Shell;
export declare function cut(shape: Part, ...others: (Part | Iterable<Part>)[]): Part;
/** What bodies share, Python's `a & b` (see `Part.intersect`, `Shell.intersect`, `Sketch.intersect`). */
export declare function intersect(shape: Sketch, ...others: (Sketch | Iterable<Sketch>)[]): Sketch;
export declare function intersect(shape: Shell, ...others: (Part | Iterable<Part>)[]): Shell;
export declare function intersect(shape: Part, sheet: Shell | Face): Shell;
export declare function intersect(shape: Part, ...others: (Part | Iterable<Part>)[]): Part;
/** The region in exactly one of the sketches, Python's `a ^ b` (see `Sketch.xor`). */
export declare function xor(sketch: Sketch, ...others: (Sketch | Iterable<Sketch>)[]): Sketch;
/** The part's faces split where a tool crosses them (see `Part.imprint`). */
export declare function imprint(part: Part, tool: Part | Shell | Face | ShapeList<Face> | Edge | Wire | Iterable<Edge | Wire>, direction?: Axis | VectorLike | null, options?: {
    nearest?: boolean;
}): Part;
/** The surfaces of a fillet's rounds as untrimmed sheets, the part unchanged (see
 * `Part.filletPreview`); takes the edges, as `fillet` does. */
export declare function filletPreview(edges: EdgesLike, radius: number, options?: {
    propagate?: boolean;
}): ShapeList<Shell>;
/** Tilt faces by a draft angle about a neutral plane (see `Part.draft`). */
export declare function draft(part: Part, faces: FacesLike, angle: number, neutralPlane: Plane | Face): Part;
/** Move faces by a vector or a location, the part rebuilt around them (see `Part.moveFaces`). */
export declare function moveFaces(part: Part, faces: FacesLike, by: Location | VectorLike): Part;
/** Offset faces along their normals, the part rebuilt around them (see `Part.offsetFaces`). */
export declare function offsetFaces(part: Part, faces: FacesLike, distance: number): Part;
/** The part with a hole, a boss or a pocket taken out (see `Part.removeFaces`). */
export declare function removeFaces(part: Part, faces: FacesLike, options?: {
    partial?: boolean;
}): Part;
/** The part with fillets taken out and their edges sharp again (see `Part.removeFillets`). */
export declare function removeFillets(part: Part, faces?: FacesLike | null, options?: {
    maxRadius?: number | null;
    partial?: boolean;
}): Part;
/** A smooth dent or bump in a face at a point (see `Part.push`, `Shell.push`). */
export declare function push(shape: Part, face: Face, at: VectorLike, options?: PushOptions): Part;
export declare function push(shape: Shell, face: Face, at: VectorLike, options?: PushOptions): Shell;
/** Raise or sink a region of a face (see `Part.warp`, `Shell.warp`). */
export declare function warp(shape: Part, face: Face, region: RegionLike, by: number | VectorLike, options?: {
    continuity?: 'crease' | 'G1' | 'G2';
}): Part;
export declare function warp(shape: Shell, face: Face, region: RegionLike, by: number | VectorLike, options?: {
    continuity?: 'crease' | 'G1' | 'G2';
}): Shell;
/** Press a region of a face onto a plane (see `Part.flatten`, `Shell.flatten`). */
export declare function flatten(shape: Part, face: Face, region: RegionLike, plane: Plane | Face, options?: {
    continuity?: 'crease' | 'G1' | 'G2';
}): Part;
export declare function flatten(shape: Shell, face: Face, region: RegionLike, plane: Plane | Face, options?: {
    continuity?: 'crease' | 'G1' | 'G2';
}): Shell;
/** Extend a sheet or a face past its edges (options `sides`, `continuity`: see `Shell.extend`,
 * `Face.extend`), or an edge past an end (`end`, `continuity`: see `Edge.extend`). */
export declare function extend(shape: Edge, distance: number, options?: {
    end?: 'start' | 'end' | 'both';
    continuity?: 'G1' | 'G2' | 'natural';
}): Edge;
export declare function extend(shape: Shell | Face, distance: number, options?: {
    sides?: Edge | Iterable<Edge> | null;
    continuity?: 'natural' | 'G1' | 'G2';
}): Shell;
/** Trim a sheet with curves on it, keeping a side (`trim(sheet, curves, keep)`: see `Shell.trim`), or
 * an edge or a wire to a stretch of it (`trim(edge, start, end)`: see `Edge.trim`, `Wire.trim`). */
export declare function trim(shape: Shell, curves: Edge | Wire | Iterable<Edge | Wire>, keep: VectorLike | string): Shell;
export declare function trim(shape: Edge, start: number | VectorLike | Vertex, end: number | VectorLike | Vertex): Edge;
export declare function trim(shape: Wire, start: number | VectorLike | Vertex, end: number | VectorLike | Vertex): Wire;
/** An edge of a sheet moved onto a curve (see `Shell.matchEdge`). */
export declare function matchEdge(sheet: Shell, edge: Edge, target: Edge | Wire, options?: {
    extent?: number;
}): Shell;
/** Two faces of a sheet that share a side made one (see `Shell.mergeFaces`). */
export declare function mergeFaces(sheet: Shell, a: Face, b: Face): Shell;
/** A curve projected onto a body along a direction (see `Part.project`), or onto a face along its
 * normals (see `Face.project`). */
export declare function project(shape: Face, curve: Edge | Wire): ShapeList<Edge>;
export declare function project(shape: Part | Shell, curve: Edge | Wire, direction?: Axis | VectorLike, options?: {
    nearest?: boolean;
}): ShapeList<Edge>;
/** The lines of a view of a body, also its hidden ones (see `Part.outline`). */
export declare function outline(shape: Part | Shell, plane?: Plane, options?: {
    hidden?: false;
    tangentEdges?: boolean;
}): ShapeList<Edge>;
export declare function outline(shape: Part | Shell, plane: Plane | undefined, options: {
    hidden: true;
    tangentEdges?: boolean;
}): [
    ShapeList<Edge>,
    ShapeList<Edge>
];
/** The contour of a body seen along a direction (see `Part.silhouette`). */
export declare function silhouette(shape: Part | Shell, direction?: Axis | VectorLike): ShapeList<Edge>;
/** The curves where a body meets another, a face or a plane (see `Part.intersectionCurves`). */
export declare function intersectionCurves(shape: Part | Shell, other: Part | Shell | Face | Plane): ShapeList<Edge>;
/** The parting lines of a part for a pull direction (see `Part.partingLine`). */
export declare function partingLine(part: Part, direction: Axis | VectorLike): ShapeList<Wire>;
/** Sections of a part (sketches) or a mesh (wires) every `step` along an axis (see `Part.slices`,
 * `Mesh.slices`). */
export declare function slices(shape: Part, step: number, axis?: Axis | VectorLike): Sketch[];
export declare function slices(shape: Mesh, step: number, axis?: Axis | VectorLike): ShapeList<Wire>[];
/** A scaled copy of a shape or a mesh, about `center` (see `Shape.scale`). */
export declare function scale<S extends Shape | Mesh>(shape: S, factor: number | VectorLike, center?: VectorLike): S;
export {};
