import { type Axis, Plane, type VectorLike } from './geometry.js';
import { Edge, Wire } from './shapes.js';
/** A straight edge from `start` to `end`. */
export declare function Line(start: VectorLike, end: VectorLike): Edge;
/** A line of `length` leaving `start` at `angle` degrees from the plane's X axis. */
export declare function PolarLine(start: VectorLike, length: number, angle: number, plane?: Plane): Edge;
/** Straight segments through the points. `close: true` connects the last point to the first:
 * `Polyline([0, 0], [10, 0], [10, 5], { close: true })`. */
export declare function Polyline(...args: (VectorLike | readonly VectorLike[] | {
    close?: boolean;
})[]): Wire;
/**
 * An arc around `center` starting at `startAngle` and spanning `arcSize` degrees (angles
 * counterclockwise from the plane's X axis; a negative `arcSize` runs clockwise).
 * `CenterArc(c, r, 0, 360)` is a full circle.
 *
 * `center` is given in plane coordinates.
 */
export declare function CenterArc(center: VectorLike, radius: number, startAngle: number, arcSize: number, plane?: Plane): Edge;
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
/**
 * A piece of the parabola `y = x² / (4 focalLength)`: its vertex at `vertex` (in plane
 * coordinates), opening along the plane's Y axis, from `x = start` to `x = end` (measured from the
 * vertex along the plane's X axis). Exact: a quadratic B-spline. For reflectors, horns and nozzle
 * contours; a negative focal length opens it along -Y.
 *
 * `ParabolicArc([0, 0], 10, -20, 20)` runs from (-20, 10) through (0, 0) to (20, 10); its focus is
 * at (0, 10).
 */
export declare function ParabolicArc(vertex: VectorLike, focalLength: number, start: number, end: number, plane?: Plane): Edge;
/**
 * A piece of the hyperbola `x²/xRadius² - y²/yRadius² = 1`, the branch on the +X side of `center`
 * (in plane coordinates), from `y = start` to `y = end` (measured from the center along the plane's
 * Y axis). Exact: a rational quadratic B-spline. Its vertex is at `(xRadius, 0)` from the center and
 * its asymptotes have the slopes `±yRadius / xRadius`.
 *
 * `HyperbolicArc([0, 0], 10, 20, -30, 30)` revolved about the Y axis is a cooling tower with a
 * waist of radius 10.
 */
export declare function HyperbolicArc(center: VectorLike, xRadius: number, yRadius: number, start: number, end: number, plane?: Plane): Edge;
/**
 * A conic arc from `start` to `end`, tangent there to the lines toward `apex` (the point where the
 * end tangents meet), with the fullness `rho` (0 < rho < 1): the arc passes `rho` of the way from
 * the middle of the chord to the apex. 0.5 is a parabola, less an ellipse (flatter), more a
 * hyperbola (closer to the apex). The rho conic of styling: a corner blend whose shape a single
 * number sets. Exact: a rational quadratic B-spline.
 *
 * `ConicArc([0, 0], [10, 0], [10, 10], 0.4142)` is nearly the quarter circle of radius 10 (exactly
 * for rho = sqrt(2) - 1).
 */
export declare function ConicArc(start: VectorLike, apex: VectorLike, end: VectorLike, rho?: number): Edge;
/**
 * A smooth cubic curve through the points: `Spline([0, 0], [10, 5], [20, 0])`.
 *
 * Options: `tangents`, the `[start, end]` tangent directions (either may be null), or one direction
 * for every point (an array as long as the points: the curve passes through each point in its
 * direction); `closed` makes a closed loop (smooth at the join).
 */
export declare function Spline(...args: (VectorLike | readonly VectorLike[] | {
    tangents?: readonly (VectorLike | null)[] | null;
    closed?: boolean;
})[]): Edge;
/**
 * A smooth curve near many points, with as few control points as keep it within `tolerance` of
 * every one: for scanned or digitized outlines, sampled curves and long polylines, where `Spline`
 * passes through every point, follows every wiggle and needs a control point per point.
 *
 * A least-squares B-spline: it averages noise smaller than the tolerance out instead of following it,
 * and takes more control points (spread evenly over the points) until every point is within the
 * tolerance, measured to the nearest point of the curve. An open curve runs from the first point to
 * the last; where the points run smoothly there and no tangent is given, it leaves them in the points'
 * own direction. Below the points' noise it takes up to a control point per point, and where even that
 * does not keep within the tolerance it throws a `ModelingError` with the distance it reached (`Spline`
 * passes through every point).
 *
 * `points`: the points in order along the curve (2D points lie at z = 0). Options: `tolerance`, the
 * largest distance from any point to the curve (default: 1/1000 of the size of the points);
 * `degree`, the degree of the curve, 2 to 9; `tangents`, optional `[start, end]` directions, either may
 * be null, or a direction at every point (as many as there are points, none null; a cubic curve then:
 * the curve leaves each point near that direction, as the curve through the points along them,
 * `Spline(...points, { tangents })`, does, simplified within the tolerance), not for closed curves;
 * `closed`, a closed curve starting and ending near the first point (within the tolerance), as smooth
 * there as elsewhere.
 *
 * Few points (fewer than six) give the curve through them (`Spline`). Where no fit keeps within the
 * tolerance, a ModelingError gives the distance it reached.
 *
 *     const outline = fitCurve(scanPoints, { tolerance: 0.02 })
 */
export declare function fitCurve(points: Iterable<VectorLike>, options?: {
    tolerance?: number | null;
    degree?: number;
    tangents?: readonly [
        VectorLike | null,
        VectorLike | null
    ] | readonly VectorLike[] | null;
    closed?: boolean;
}): Edge;
/** A Bézier curve (rational if `weights` are given) from its control points. */
export declare function Bezier(...args: (VectorLike | readonly VectorLike[] | {
    weights?: readonly number[] | null;
})[]): Edge;
/**
 * A helix around `direction` through `center`.
 *
 * `direction` is a vector or an axis (only its direction counts; `center` places the helix).
 * `endRadius` makes a conical helix; `pitch` is the rise per turn. Any number of turns: beyond 120
 * the helix is fitted in pieces of whole turns, joined into one curve.
 */
export declare function Helix(pitch: number, height: number, radius: number, options?: {
    center?: VectorLike;
    direction?: Axis | VectorLike;
    endRadius?: number | null;
    leftHanded?: boolean;
}): Edge;
/**
 * A flat (Archimedean) spiral around the plane's origin: its radius grows (or shrinks) evenly with
 * the angle from `startRadius` to `endRadius` over `turns` turns. It starts on the plane's X axis and
 * turns counterclockwise seen from the plane's normal (`clockwise: true`: the other way). Either
 * radius may be 0 (a spiral from or to the center). For spiral springs, scroll grooves and coils; a
 * B-spline within 1e-4 of the exact spiral, as `Helix`. Less than a turn with a large change of radius
 * (`Spiral(2, 20, 0.5)`) and very many turns (`Spiral(20, 0, 130)`) are beyond the kernel's
 * approximation: a `KernelError`, whose hint says what makes such a curve.
 *
 * `Spiral(2, 20, 5)` runs from (2, 0) to (20, 0) in five turns, 9/5 = 3.6 apart.
 */
export declare function Spiral(startRadius: number, endRadius: number, turns: number, plane?: Plane, options?: {
    clockwise?: boolean;
}): Edge;
/** A polyline whose corners are rounded with `radius`:
 * `FilletPolyline([0, 0], [10, 0], [10, 10], { radius: 2 })`. */
export declare function FilletPolyline(...args: (VectorLike | readonly VectorLike[] | {
    radius: number;
    close?: boolean;
})[]): Wire;
/**
 * Copies of the curves as B-splines of one degree and one knot vector, with the same shapes: their
 * control points correspond one to one, as surfaces through the curves (a loft, a skin) need them
 * in other systems. Lines and arcs become B-splines too (arcs rational ones).
 *
 * @param edges Two or more edges (or arrays of them).
 */
export declare function makeCompatible(...edges: (Edge | Iterable<Edge>)[]): Edge[];
