import { type AlignLike } from './align.js';
import { type VectorLike } from './geometry.js';
import { Edge, Sketch, Wire } from './shapes.js';
/** Where a new shape sits and how it is turned. */
export interface PlacementOptions {
    /** Degrees counterclockwise about the shape's center. */
    rotation?: number;
    /** Alignment relative to the origin (after the rotation). */
    align?: AlignLike;
}
/** The corner options of the shapes with corners. */
export interface CornerOptions {
    /** Round every corner with this radius. */
    fillet?: number;
    /** Bevel every corner by this length. */
    chamfer?: number;
}
/**
 * A `width` (X) by `height` (Y) rectangle.
 *
 * `fillet` rounds the four corners with that radius, `chamfer` bevels them by that length (at most
 * half the shorter side). `rotation` turns it about its center (degrees counterclockwise); `align`
 * then works on the turned outline.
 */
export declare function Rectangle(width: number, height: number, options?: CornerOptions & PlacementOptions): Sketch;
/** A rectangle with rounded corners; the same as `Rectangle(width, height, { fillet: radius })`. */
export declare function RoundedRectangle(width: number, height: number, radius: number, options?: {
    align?: AlignLike;
}): Sketch;
/** A disk of `radius`. */
export declare function Circle(radius: number, options?: {
    align?: AlignLike;
}): Sketch;
/** An ellipse with semi-axes `xRadius` and `yRadius`, turned by `rotation` degrees about its
 * center. */
export declare function Ellipse(xRadius: number, yRadius: number, options?: PlacementOptions): Sketch;
/** The options of `Polygon`: corners, and an alignment (none by default: the points stay where
 * they are). */
export interface PolygonOptions extends CornerOptions {
    align?: AlignLike;
}
/**
 * The polygon through the points (closed automatically): `Polygon([0, 0], [40, 0], [0, 30])`, or
 * one list of points. Points stay where they are unless `align` is given. `fillet` rounds every
 * corner with that radius, `chamfer` bevels every corner by that length.
 */
export declare function Polygon(...args: (VectorLike | readonly VectorLike[] | PolygonOptions)[]): Sketch;
/**
 * A regular polygon with `sides` corners.
 *
 * `radius` is the distance to the corners, or to the middle of the sides when `inscribed` is true
 * (handy for hexagons measured across flats: `radius = flats / 2`). `fillet` and `chamfer` round
 * or bevel every corner.
 */
export declare function RegularPolygon(radius: number, sides: number, options?: {
    inscribed?: boolean;
} & CornerOptions & PlacementOptions): Sketch;
/**
 * A triangle with a base of `width` along X and its top corner `height` above it.
 *
 * `apex` is the x position of the top corner measured from the left end of the base: the middle by
 * default (an isosceles triangle), `0` for a right angle at the left end, `width` for one at the
 * right end. The triangle is centered on its bounding box; `fillet` and `chamfer` round or bevel
 * the three corners.
 */
export declare function Triangle(width: number, height: number, options?: {
    apex?: number | null;
} & CornerOptions & PlacementOptions): Sketch;
/** The options of `Trapezoid`. */
export type TrapezoidOptions = CornerOptions & PlacementOptions;
/**
 * A trapezoid with a base of `width`; the side angles are measured inside the base corners
 * (`rightAngle` defaults to `leftAngle`). `fillet` and `chamfer` round or bevel the four corners.
 * The options may follow `leftAngle` directly: `Trapezoid(40, 15, 60, { rotation: 90 })`.
 */
export declare function Trapezoid(width: number, height: number, leftAngle: number, rightAngle?: number | null | TrapezoidOptions, options?: TrapezoidOptions): Sketch;
/** An obround slot `length` long overall (round ends included) and `width` wide, along X. For a
 * slot between two centers use `Stroke(Line(a, b), width)`; for one along an arc, `ArcSlot`. */
export declare function Slot(length: number, width: number, options?: PlacementOptions): Sketch;
/**
 * A slot along an arc around the origin: its centerline has `radius` and runs counterclockwise
 * over `angle` degrees from the X axis (turned by `rotation`); it is `width` wide with round ends.
 * The arc's center stays on the origin unless `align` is given.
 */
export declare function ArcSlot(radius: number, width: number, angle: number, options?: PlacementOptions): Sketch;
/**
 * The region a pen `width` wide covers along a path of lines and arcs: a slot between two centers
 * (`Stroke(Line(a, b), 6)`), a slot along an arc, a rib from its centerline.
 *
 * `ends`: "round" (half circles, the default) or "flat" (cut square at the end points).
 * `corners`: how the outside of a bend is shaped, "round", "sharp" or "chamfer". A closed path
 * makes a ring. The path stays where it is (in its plane).
 */
export declare function Stroke(path: Edge | Wire, width: number, options?: {
    ends?: string;
    corners?: string;
}): Sketch;
/**
 * The convex hull of points and shapes: the smallest convex region around them, as if a string
 * were pulled tight around them. Around circles and arcs the outline follows the arcs exactly,
 * joined by tangent lines.
 *
 * `items`: points ([x, y], Vectors, Vertices), edges, wires, sketches or faces, or lists of them.
 * `Hull(Circle(10), Pos(60, 0).mul(Circle(6)))` is a lever outline.
 */
export declare function Hull(...items: unknown[]): Sketch;
/** The planar region inside a closed wire, minus the regions inside `holes`. */
export declare function makeFace(outer: Wire | Edge, ...holes: (Wire | Edge)[]): Sketch;
