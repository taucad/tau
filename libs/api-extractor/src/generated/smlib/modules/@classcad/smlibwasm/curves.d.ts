import { type Axis, Plane, Vector, type VectorLike } from './geometry.js';
import { Edge, Vertex, Wire } from './shapes.js';
/** Python's float modulo: the result has the sign of the divisor. */
export declare function _mod(a: number, b: number): number;
/** The points of a call: `f(p1, p2, ...)`, or `f([p1, p2, ...])` with one list of points. */
export declare function _pts(points: readonly unknown[]): Vector[];
/** A straight edge from `start` to `end`. */
export declare function Line(start: VectorLike, end: VectorLike): Edge;
/** A line of `length` leaving `start` at `angle` degrees from the plane's X axis. */
export declare function PolarLine(start: VectorLike, length: number, angle: number, plane?: Plane): Edge;
/** Straight segments through the points. `close: true` connects the last point to the first:
 * `Polyline([0, 0], [10, 0], [10, 5], { close: true })`. */
export declare function Polyline(...args: (VectorLike | readonly VectorLike[] | {
    close?: boolean;
})[]): Wire;
/** The arguments of a call that ends in an options object: the items and the options. */
export declare function _withOptions<O extends object>(args: readonly unknown[]): {
    items: unknown[];
    options: O;
};
/**
 * An arc around `center` starting at `startAngle` and spanning `arcSize` degrees (angles
 * counterclockwise from the plane's X axis; a negative `arcSize` runs clockwise).
 * `CenterArc(c, r, 0, 360)` is a full circle.
 *
 * `center` is given in plane coordinates.
 */
export declare function CenterArc(center: VectorLike, radius: number, startAngle: number, arcSize: number, plane?: Plane): Edge;
/** A new kernel circle, or arc of one, around `center` (in plane coordinates) from `startAngle`
 * over `arcSize` degrees. The caller owns the curve. */
export declare function _arcCurve(center: Vector, radius: number, startAngle: number, arcSize: number, plane: Plane): number;
/** The circular arc from `start` through `through` to `end`. */
export declare function ThreePointArc(start: VectorLike, through: VectorLike, end: VectorLike): Edge;
/**
 * The shorter arc of `radius` from `start` to `end` in `plane`.
 *
 * A positive radius bulges to the left of the direction start->end, a negative one to the right.
 */
export declare function RadiusArc(start: VectorLike, end: VectorLike, radius: number, plane?: Plane): Edge;
/** An arc from `start` to `end` whose middle is `sagitta` away from the chord (positive to the
 * left of start->end). */
export declare function SagittaArc(start: VectorLike, end: VectorLike, sagitta: number, plane?: Plane): Edge;
/** An arc from `start` to `end` leaving `start` along `tangent`. */
export declare function TangentArc(start: VectorLike, end: VectorLike, tangent: VectorLike): Edge;
/**
 * An ellipse (or elliptical arc) around `center` in `plane`.
 *
 * The angles are ellipse angles in degrees (the point at angle a is
 * `(xRadius cos a, yRadius sin a)`). The arc runs counterclockwise from `startAngle` to
 * `endAngle`, also across 0 (300 to 60 passes through the X axis); equal angles give the whole
 * ellipse.
 */
export declare function EllipticalArc(center: VectorLike, xRadius: number, yRadius: number, startAngle?: number, endAngle?: number, plane?: Plane): Edge;
/** Values (or derivatives) of all B-spline basis functions of degree `p` at `u`. */
export declare function _basis(knots: readonly number[], p: number, u: number, deriv?: number): number[];
/**
 * A smooth cubic curve through the points: `Spline([0, 0], [10, 5], [20, 0])`.
 *
 * Options: `tangents`, the `[start, end]` tangent directions (either may be null); `closed`
 * makes a closed loop (smooth at the join).
 */
export declare function Spline(...args: (VectorLike | readonly VectorLike[] | {
    tangents?: readonly [VectorLike | null, VectorLike | null] | null;
    closed?: boolean;
})[]): Edge;
/** A Bézier curve (rational if `weights` are given) from its control points. */
export declare function Bezier(...args: (VectorLike | readonly VectorLike[] | {
    weights?: readonly number[] | null;
})[]): Edge;
/**
 * A helix around `direction` through `center`.
 *
 * `direction` is a vector or an axis (only its direction counts; `center` places the helix).
 * `endRadius` makes a conical helix; `pitch` is the rise per turn.
 */
export declare function Helix(pitch: number, height: number, radius: number, options?: {
    center?: VectorLike;
    direction?: Axis | VectorLike;
    endRadius?: number | null;
    leftHanded?: boolean;
}): Edge;
/** A polyline whose corners are rounded with `radius`:
 * `FilletPolyline([0, 0], [10, 0], [10, 10], { radius: 2 })`. */
export declare function FilletPolyline(...args: (VectorLike | readonly VectorLike[] | {
    radius: number;
    close?: boolean;
})[]): Wire;
export declare function _filletWire(wire: Wire, radius: number, vertices: Iterable<VectorLike | Vertex> | null): Wire;
/**
 * Copies of the curves as B-splines of one degree and one knot vector, with the same shapes: their
 * control points correspond one to one, as surfaces through the curves (a loft, a skin) need them
 * in other systems. Lines and arcs become B-splines too (arcs rational ones).
 *
 * @param edges Two or more edges (or arrays of them).
 */
export declare function makeCompatible(...edges: (Edge | Iterable<Edge>)[]): Edge[];
