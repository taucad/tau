import { Axis, BoundBox, Plane, Vector, type VectorLike } from './geometry.js';
import { Edge, Part, Shell, Wire } from './shapes.js';
/** Highest degree of an exact result. A face whose exact image would need a higher degree (a
 * sphere in a 4 x 4 x 4 lattice needs 18) is approximated within the tolerance instead. */
export declare const MAX_DEGREE = 12;
/** Where a deformation applies along its axis. */
export interface RangeOptions {
    /** Where the deformation begins, as a distance along the axis from its origin. Default: where
     * the part begins along the axis. What lies before `start` stays. */
    start?: number | null;
    /** Where the deformation ends, measured the same way. Default: where the part ends. */
    end?: number | null;
    /** Largest distance of the deformed faces from the exact map (mm). */
    tolerance?: number | null;
}
/** How a part is twisted (see `twist`). */
export interface TwistOptions extends RangeOptions {
    /** The line to twist about (default the world Z axis through the origin). */
    axis?: Axis;
}
/**
 * Twist a part about an axis by `angle` degrees over its length (or from `start` to `end`).
 *
 * Every cross-section turns by an angle that grows evenly from 0 at `start` to `angle` at `end`. A
 * cylinder, cone, sphere or torus about the axis maps onto itself and stays as it was (a twisted
 * tube's walls are its cylinders).
 *
 * @param shape A Part (or a Shell), an Edge, a Wire, or points (a point or an array of them).
 * @param angle The turn in degrees between `start` and `end`, counterclockwise seen from the tip
 *   of `axis` (right-hand rule, like `rotate`). May exceed 360.
 * @param options `axis`: the line to twist about (default the world Z axis through the origin).
 *   `start`: where the twist begins, as a distance along the axis from `axis.origin`; default:
 *   where the part begins along the axis; what lies before `start` stays. `end`: where the twist
 *   ends, measured the same way; default: where the part ends along the axis; what lies beyond
 *   `end` is turned by the whole `angle`. `tolerance`: largest distance of the twisted faces from
 *   the exact twist (mm).
 *
 * Returns a Part (a Shell for a shell). The volume does not change. An Edge gives an Edge, a Wire a
 * Wire (see `bend`), a point a Vector, an array of points an array of Vectors; for points, give
 * `start` and `end` (the range of the part they belong to), since a point has no length along the
 * axis.
 */
export declare function twist(shape: Part, angle: number, options?: TwistOptions): Part;
export declare function twist(shape: Shell, angle: number, options?: TwistOptions): Shell;
export declare function twist(shape: Edge, angle: number, options?: TwistOptions): Edge;
export declare function twist(shape: Wire, angle: number, options?: TwistOptions): Wire;
export declare function twist(shape: VectorLike, angle: number, options?: TwistOptions): Vector;
export declare function twist(shape: readonly VectorLike[], angle: number, options?: TwistOptions): Vector[];
/** How a part is tapered (see `taper`). */
export interface TaperOptions extends RangeOptions {
    /** The line the cross-sections shrink toward (default the world Z axis). */
    axis?: Axis;
}
/**
 * Taper a part along an axis: its cross-sections scale from 1 to `scale` (exact result).
 *
 * The cross-sections are scaled toward the axis by a factor that changes evenly from 1 at `start`
 * to `scale` at `end`.
 *
 * @param shape A Part (or a Shell), an Edge, a Wire, or points (a point or an array of them).
 * @param scale Size of the cross-section at `end` relative to `start` (> 0): 0.5 halves it, 2
 *   doubles it. Lines along the axis stay straight.
 * @param options `axis`: the line the cross-sections shrink toward (default the world Z axis).
 *   `start`: where the tapered range begins, as a distance along the axis from `axis.origin`;
 *   default: where the part begins; what lies before `start` stays. `end`: where the tapered
 *   range ends, measured the same way; default: where the part ends; what lies beyond `end` is
 *   scaled by `scale` across the axis. `tolerance`: only for faces whose exact image would exceed
 *   `MAX_DEGREE` (mm).
 *
 * The result is exact: a cylinder becomes a cone, a box a frustum of a pyramid. Edges, wires and
 * points give edges, wires and points (see `twist`).
 */
export declare function taper(shape: Part, scale: number, options?: TaperOptions): Part;
export declare function taper(shape: Shell, scale: number, options?: TaperOptions): Shell;
export declare function taper(shape: Edge, scale: number, options?: TaperOptions): Edge;
export declare function taper(shape: Wire, scale: number, options?: TaperOptions): Wire;
export declare function taper(shape: VectorLike, scale: number, options?: TaperOptions): Vector;
export declare function taper(shape: readonly VectorLike[], scale: number, options?: TaperOptions): Vector[];
/** How a part is bent (see `bend`). */
export interface BendOptions extends RangeOptions {
    /** The bend radius of the neutral layer. */
    radius?: number | null;
    /** Sets the bend: `xDir` along the part, `yDir` toward the inside of the bend (default
     * `Plane.XZ`). */
    plane?: Plane;
}
/**
 * Bend a part around an axis by `angle` degrees, like a bar bent over a mandrel.
 *
 * `plane` sets the bend: its `xDir` runs along the part, a positive `angle` bends the part toward
 * `yDir`, and the bend axis is parallel to the plane normal. The layer of the part through
 * `plane.origin` (spanned by `xDir` and the normal) is the neutral layer: it keeps its length;
 * material on the inside of the bend is compressed, material on the outside stretched. With the
 * default `Plane.XZ`, a part lying along X bends up (toward +Z) about an axis parallel to Y.
 *
 * @param shape A Part (or a Shell), an Edge, a Wire, or points (a point or an array of them).
 * @param angle How far the part turns, in degrees (positive: toward `plane.yDir`), less than 360.
 * @param options `radius`: the bend radius of the neutral layer; with `radius` and no `start` or
 *   `end`, the bend (length `radius * angle`) is centered on the plane origin; with one of them,
 *   it starts or ends there. `start`: where the bend begins, as a distance along `xDir` from
 *   `plane.origin`; default: where the part begins; what lies before `start` stays. `end`: where
 *   the bend ends, measured the same way; default: where the part ends, so `bend(part, 90)`
 *   bends the whole part into a quarter circle; what lies beyond `end` goes on straight, turned
 *   by `angle`. Without `radius`, `start` and `end` set it: radius = (end - start) / angle, with
 *   the angle in radians. `tolerance`: largest distance of the bent faces from the exact bend
 *   (mm).
 *
 * The bend axis lies `radius` from the neutral layer on the side the part bends toward; the part
 * must not reach it. Plane faces across the bend become exact cylinders about the bend axis (and
 * lines across it circles), so a bent plate is a sheet metal part to `bends` and `unfold`. That holds
 * for bends of up to 90 degrees and of 120, 135, 180, 240 and 270; at other angles the faces are
 * NURBS within `tolerance`, which `bends()` and `unfold` do not take for bends. The
 * K-factor its neutral layer gives (where it lies in the thickness) is kept with it. For sheet
 * metal, `fold` bends at a line with an inside radius and a K-factor, with flat legs on both sides.
 *
 * Edges and wires bend too, into paths for sweeps: every edge is split where it crosses `start` and
 * `end`, a line across the bend becomes an exact arc, and lines before and after it stay lines. A
 * Wire comes back with every piece an edge of its own (a straight path bent in its middle: line,
 * arc, line), an Edge as one edge (the pieces joined into one B-spline; pass `new Wire([edge])` to
 * keep them apart). Points give points (see `twist`).
 */
export declare function bend(shape: Part, angle: number, options?: BendOptions): Part;
export declare function bend(shape: Shell, angle: number, options?: BendOptions): Shell;
export declare function bend(shape: Edge, angle: number, options?: BendOptions): Edge;
export declare function bend(shape: Wire, angle: number, options?: BendOptions): Wire;
export declare function bend(shape: VectorLike, angle: number, options?: BendOptions): Vector;
export declare function bend(shape: readonly VectorLike[], angle: number, options?: BendOptions): Vector[];
/** How a part is unrolled (see `unroll`). */
export interface UnrollOptions {
    /** The radius of the neutral layer, the one that keeps its length (mm, > 0). */
    radius: number;
    /** The axis the part is rolled about (default the world Z axis). */
    axis?: Axis;
    /** A direction across the axis: the line that stays in place. Default: the middle of the
     * part's angle about the axis. */
    start?: VectorLike | null;
    /** Largest distance of fitted faces from the exact unroll (mm). */
    tolerance?: number | null;
}
/**
 * Unroll a part wrapped around an axis into a flat one: the inverse of `bend`.
 *
 * A point at distance `r` from the axis and at the angle `a` (radians) about it from `start` goes
 * to distance `r` from the axis along `start` and `radius * a` across: the layer at `radius` (the
 * neutral layer) keeps its length, material inside it gets longer and outside it shorter. A rolled
 * sheet (a ring segment of inside radius `R` and thickness `t`) unrolls into a flat plate; as sheet
 * metal, with `radius = R + kFactor * t` (`unfold` does that, also for rolled parts). Cylinders
 * about the axis become planes, circles about it lines; the faces are exact where their image is a
 * plane, cone, cylinder, line or circle, and within `tolerance` elsewhere.
 *
 * @param shape A Part (or a Shell), an Edge, a Wire or points around the axis: it must not reach the
 *   axis and must cover less than a full turn about it.
 * @param options `radius`: the radius of the neutral layer (mm, > 0). `axis`: the axis the part is
 *   rolled about (default the world Z axis). `start`: a direction across the axis: the line (at
 *   every distance from the axis) that stays in place; the unrolled part lies in the plane through
 *   it perpendicular to `start`; default: the middle of the part's angle about the axis; the part
 *   must not reach the half-plane opposite it. `tolerance`: largest distance of fitted faces from
 *   the exact unroll (mm).
 *
 * Returns a Part (a Shell for a shell); an Edge, a Wire or points give an Edge, a Wire or points (a
 * helix about the axis unrolls at its own radius into a straight line).
 */
export declare function unroll(shape: Part, options: UnrollOptions): Part;
export declare function unroll(shape: Shell, options: UnrollOptions): Shell;
export declare function unroll(shape: Edge, options: UnrollOptions): Edge;
export declare function unroll(shape: Wire, options: UnrollOptions): Wire;
export declare function unroll(shape: VectorLike, options: UnrollOptions): Vector;
export declare function unroll(shape: readonly VectorLike[], options: UnrollOptions): Vector[];
/** Which layers of the lattice along one direction: a number (negative counts from the end),
 * `null` for all of them (Python's `:`), or an array of numbers. */
export type LatticeLayers = number | null | readonly number[];
/** A selection of lattice points: one `LatticeLayers` per direction, `[i, j, k]` along X, Y and
 * Z; the points are every combination. */
export type LatticeIndex = readonly [
    LatticeLayers,
    LatticeLayers,
    LatticeLayers
];
/**
 * A grid of control points around a part for free-form deformation (exact results).
 *
 * The points start evenly spaced over a box (`counts` points per direction, corners included).
 * Move them, then `apply` the lattice to a part: space inside the box moves smoothly with the
 * points (a Bezier volume; space outside the box follows the same polynomial). A lattice whose
 * points were not moved changes nothing.
 *
 * A lattice is a global map, for the overall shape: every point pulls the whole box (most near
 * itself), so one moved point changes every face it does not leave in place. For a bump or dent on
 * one face, push or warp that face instead (`Part.push`, `Part.warp`): they change it near a point
 * or within a region and leave the other faces as they are.
 *
 * `points` holds the world positions, `points[i][j][k]` = `[x, y, z]`, indexed along X, Y and Z;
 * the arrays are writable: `lat.points[1][1][2][2] += 5` lifts one point. `move`, `scale` and
 * `rotate` take a selection `[i, j, k]` of numbers (negative ones count from the end), `null` for
 * all (Python's `:`) and arrays of numbers, or `layer(...)`; they change the lattice in place and
 * return it.
 */
export declare class Lattice {
    /** The world positions of the points, `points[i][j][k]` = `[x, y, z]` (writable). */
    points: number[][][][];
    /**
     * @param box A BoundBox, or a shape whose bounding box is used.
     * @param counts Points per direction, one number or three, 2 to 12. 2 moves the corners only (a
     *   trilinear map), 3 adds the midpoints (default). Every point pulls the whole box (Bernstein
     *   weights); more points concentrate a point's pull nearer to it without confining it. The
     *   degree of the exact result grows with the counts (see `MAX_DEGREE`).
     * @param options `margin`: grow the box by this much on every side (mm).
     */
    constructor(box: BoundBox | {
        bbox(): BoundBox;
    }, counts?: number | readonly number[], options?: {
        margin?: number;
    });
    /** Points per direction (X, Y, Z). */
    get counts(): [
        number,
        number,
        number
    ];
    /** The box the points started on. */
    get box(): BoundBox;
    /** The starting positions (read-only). */
    get rest(): readonly (readonly (readonly (readonly number[])[])[])[];
    /** How far each point was moved (`points - rest`). */
    get offsets(): number[][][][];
    /** The points of one layer across an axis, as a selection: `lat.layer(Z, -1)` is the top
     * layer, `lat.layer(X, 0)` the points at the smallest X. */
    layer(axis: Axis | string, index: number): [
        LatticeLayers,
        LatticeLayers,
        LatticeLayers
    ];
    /** Move the selected points by `offset`. In place; returns the lattice. */
    move(index: LatticeIndex, offset: VectorLike): this;
    /** Scale the selected points about `center` (default: their centroid) by `factor`, one number
     * or three (X, Y, Z). In place; returns the lattice. */
    scale(index: LatticeIndex, factor: number | VectorLike, center?: VectorLike | null): this;
    /** Turn the selected points by `angle` degrees about `axis`. In place; returns the lattice. */
    rotate(index: LatticeIndex, axis: Axis, angle: number): this;
    /** Put every point back where it started. In place; returns the lattice. */
    reset(): this;
    /** An independent copy. */
    copy(): Lattice;
    /** Where the lattice moves a point. */
    map(point: VectorLike): Vector;
    /**
     * Deform a part (or a shell) with the lattice; returns the deformed copy.
     *
     * The result is exact unless a face's image needs a degree above `MAX_DEGREE`; such faces are
     * within `tolerance`. Throws a ModelingError when the lattice folds the part onto itself (a
     * point moved past its neighbours). An Edge or a Wire gives an Edge or a Wire (exact B-splines;
     * lines and arcs the map only moves stay lines and arcs), points give points (as `map`); curves
     * and points are not checked for folding.
     */
    apply(shape: Part, options?: {
        tolerance?: number | null;
    }): Part;
    apply(shape: Shell, options?: {
        tolerance?: number | null;
    }): Shell;
    apply(shape: Edge, options?: {
        tolerance?: number | null;
    }): Edge;
    apply(shape: Wire, options?: {
        tolerance?: number | null;
    }): Wire;
    apply(shape: VectorLike, options?: {
        tolerance?: number | null;
    }): Vector;
    apply(shape: readonly VectorLike[], options?: {
        tolerance?: number | null;
    }): Vector[];
    toString(): string;
}
/** Deform a part, a sheet, a curve or points with a lattice: `lattice.apply(shape)` (see `Lattice`
 * and `Part.deform`). */
export declare function deform(shape: Part, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Part;
export declare function deform(shape: Shell, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Shell;
export declare function deform(shape: Edge, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Edge;
export declare function deform(shape: Wire, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Wire;
export declare function deform(shape: VectorLike, lattice: Lattice, options?: {
    tolerance?: number | null;
}): Vector;
export declare function deform(shape: readonly VectorLike[], lattice: Lattice, options?: {
    tolerance?: number | null;
}): Vector[];
export {};
