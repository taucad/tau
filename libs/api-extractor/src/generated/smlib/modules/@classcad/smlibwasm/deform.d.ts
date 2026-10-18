import { Axis, BoundBox, Plane, Vector, type VectorLike } from './geometry.js';
import { Part, Shell } from './shapes.js';
/** Highest degree of an exact result. A face whose exact image would need a higher degree (a
 * sphere in a 4 x 4 x 4 lattice needs 18) is approximated within the tolerance instead. */
export declare const MAX_DEGREE = 12;
/** A part or a shell (sketches deform into shells). */
type Deformable = Part | Shell;
type V3 = [number, number, number];
/** What the kernel's map does, as smlibpy's C++ takes it (the kernel's keys). */
export interface _Spec {
    axis: number[] | null;
    pieces: Record<string, unknown>[];
    tolerance: number;
    max_degree?: number;
}
/** What a deformation does: the shape to send (the ends of the range split into its faces), the
 * spec of the kernel map, and the bounds of the volume ratio. */
export declare class _Plan {
    shape: Deformable;
    spec: _Spec;
    volumeRatio: [number, number];
    constructor(shape: Deformable, spec: _Spec, volumeRatio: [number, number]);
}
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
export declare function _planTwist(shape: Deformable, angle: number, axis: Axis, start: number | null | undefined, end: number | null | undefined, tol: number): _Plan;
/** How a part is twisted (see `twist`). */
export interface TwistOptions extends RangeOptions {
    /** The line to twist about (default the world Z axis through the origin). */
    axis?: Axis;
}
/**
 * Twist a part about an axis by `angle` degrees over its length (or from `start` to `end`).
 *
 * Every cross-section turns by an angle that grows evenly from 0 at `start` to `angle` at `end`.
 *
 * @param shape A Part (or a Shell).
 * @param angle The turn in degrees between `start` and `end`, counterclockwise seen from the tip
 *   of `axis` (right-hand rule, like `rotate`). May exceed 360.
 * @param options `axis`: the line to twist about (default the world Z axis through the origin).
 *   `start`: where the twist begins, as a distance along the axis from `axis.origin`; default:
 *   where the part begins along the axis; what lies before `start` stays. `end`: where the twist
 *   ends, measured the same way; default: where the part ends along the axis; what lies beyond
 *   `end` is turned by the whole `angle`. `tolerance`: largest distance of the twisted faces from
 *   the exact twist (mm).
 *
 * Returns a Part (a Shell for a shell). The volume does not change.
 */
export declare function twist(shape: Part, angle: number, options?: TwistOptions): Part;
export declare function twist(shape: Shell, angle: number, options?: TwistOptions): Shell;
export declare function _planTaper(shape: Deformable, scale: number, axis: Axis, start: number | null | undefined, end: number | null | undefined, tol: number): _Plan;
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
 * @param shape A Part (or a Shell).
 * @param scale Size of the cross-section at `end` relative to `start` (> 0): 0.5 halves it, 2
 *   doubles it. Lines along the axis stay straight.
 * @param options `axis`: the line the cross-sections shrink toward (default the world Z axis).
 *   `start`: where the tapered range begins, as a distance along the axis from `axis.origin`;
 *   default: where the part begins; what lies before `start` stays. `end`: where the tapered
 *   range ends, measured the same way; default: where the part ends; what lies beyond `end` is
 *   scaled by `scale` across the axis. `tolerance`: only for faces whose exact image would exceed
 *   `MAX_DEGREE` (mm).
 *
 * The result is exact: a cylinder becomes a cone, a box a frustum of a pyramid.
 */
export declare function taper(shape: Part, scale: number, options?: TaperOptions): Part;
export declare function taper(shape: Shell, scale: number, options?: TaperOptions): Shell;
export declare function _planBend(shape: Deformable, angle: number, radius: number | null | undefined, plane: Plane, start: number | null | undefined, end: number | null | undefined, tol: number): _Plan;
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
 * @param shape A Part (or a Shell).
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
 * must not reach it.
 */
export declare function bend(shape: Part, angle: number, options?: BendOptions): Part;
export declare function bend(shape: Shell, angle: number, options?: BendOptions): Shell;
/** Which layers of the lattice along one direction: a number (negative counts from the end),
 * `null` for all of them (Python's `:`), or an array of numbers. */
export type LatticeLayers = number | null | readonly number[];
/** A selection of lattice points: one `LatticeLayers` per direction, `[i, j, k]` along X, Y and
 * Z; the points are every combination. */
export type LatticeIndex = readonly [LatticeLayers, LatticeLayers, LatticeLayers];
/**
 * A grid of control points around a part for free-form deformation (exact results).
 *
 * The points start evenly spaced over a box (`counts` points per direction, corners included).
 * Move them, then `apply` the lattice to a part: space inside the box moves smoothly with the
 * points (a Bezier volume; space outside the box follows the same polynomial). A lattice whose
 * points were not moved changes nothing.
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
    _rest: readonly (readonly (readonly (readonly number[])[])[])[];
    _origin: V3;
    _size: V3;
    _counts: [number, number, number];
    /**
     * @param box A BoundBox, or a shape whose bounding box is used.
     * @param counts Points per direction, one number or three, 2 to 12. 2 moves the corners only (a
     *   trilinear map), 3 adds the midpoints (default), more give finer control. The degree of the
     *   exact result grows with the counts (see `MAX_DEGREE`).
     * @param options `margin`: grow the box by this much on every side (mm).
     */
    constructor(box: BoundBox | {
        bbox(): BoundBox;
    }, counts?: number | readonly number[], options?: {
        margin?: number;
    });
    /** Points per direction (X, Y, Z). */
    get counts(): [number, number, number];
    /** The box the points started on. */
    get box(): BoundBox;
    /** The starting positions (read-only). */
    get rest(): readonly (readonly (readonly (readonly number[])[])[])[];
    /** How far each point was moved (`points - rest`). */
    get offsets(): number[][][][];
    /** The points of one layer across an axis, as a selection: `lat.layer(Z, -1)` is the top
     * layer, `lat.layer(X, 0)` the points at the smallest X. */
    layer(axis: Axis | string, index: number): [LatticeLayers, LatticeLayers, LatticeLayers];
    static _index(index: unknown): LatticeIndex;
    /** The [i, j, k] of the selected points, in numpy's order (repeats included). */
    _cells(index: unknown): [number, number, number][];
    /** The selected points mapped by `f` (all at once, from their positions before). */
    _update(index: unknown, f: (pts: V3[]) => V3[]): this;
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
    _spec(): Record<string, unknown>;
    /** Where the lattice moves a point. */
    map(point: VectorLike): Vector;
    _plan(shape: Deformable, tol: number): _Plan;
    /**
     * Deform a part (or a shell) with the lattice; returns the deformed copy.
     *
     * The result is exact unless a face's image needs a degree above `MAX_DEGREE`; such faces are
     * within `tolerance`. Throws a ModelingError when the lattice folds the part onto itself (a
     * point moved past its neighbours).
     */
    apply(shape: Part, options?: {
        tolerance?: number | null;
    }): Part;
    apply(shape: Shell, options?: {
        tolerance?: number | null;
    }): Shell;
    toString(): string;
}
export {};
