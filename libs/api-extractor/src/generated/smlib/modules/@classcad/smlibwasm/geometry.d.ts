import type { Face } from './shapes.js';
/** Geometric tolerance used for comparisons (model units). */
export declare const TOLERANCE = 0.000001;
/** A point or direction: a Vector, or two or three numbers ([x, y] lies at z = 0). */
export type VectorLike = Vector | ArrayLike<number>;
declare const inspect: unique symbol;
/** A 4x4 matrix, row by row (`m[r * 4 + c]`), column-vector convention. */
export type Matrix = Float64Array;
/**
 * An immutable 3D vector or point.
 *
 * `new Vector(1, 2)`, `new Vector(1, 2, 3)`, `new Vector([1, 2, 3])` and `new Vector(other)` are
 * all accepted. Vectors have `add`, `sub`, `mul` (by a number), `div`, `neg`, `length` and
 * iterate over their coordinates.
 */
export declare class Vector {
    /** The x coordinate. */
    readonly x: number;
    /** The y coordinate. */
    readonly y: number;
    /** The z coordinate. */
    readonly z: number;
    constructor(x?: number | VectorLike, y?: number, z?: number);
    /** `[x, y, z]` */
    toArray(): [
        number,
        number,
        number
    ];
    [Symbol.iterator](): IterableIterator<number>;
    /** The sum of the two vectors (Python's `+`). */
    add(other: VectorLike): Vector;
    /** The difference of the two vectors (Python's `-`). */
    sub(other: VectorLike): Vector;
    /** This vector scaled by a number (`dot` and `cross` multiply two vectors). */
    mul(s: number): Vector;
    /** The vector divided by a number (Python's `/`). */
    div(s: number): Vector;
    /** The vector pointing the other way (Python's unary `-`). */
    neg(): Vector;
    /** Equal within TOLERANCE. */
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
    /** The length (for a point: its distance from the origin). */
    get length(): number;
    /** The dot product with another vector. */
    dot(other: VectorLike): number;
    /** The cross product with another vector: at right angles to both (right-handed). */
    cross(other: VectorLike): Vector;
    /** The vector scaled to length 1; RangeError for a zero-length vector. */
    normalized(): Vector;
    /** The distance to another point. */
    distanceTo(other: VectorLike): number;
    /** Angle to another vector in degrees (0..180). */
    angleTo(other: VectorLike): number;
    /** True if the two points are at most `tolerance` apart (mm). */
    isClose(other: VectorLike, tolerance?: number): boolean;
    /** True if both vectors point along the same line (either sense), within `angleTolerance` degrees. */
    isParallel(other: VectorLike, angleTolerance?: number): boolean;
    /** True if the vectors are at right angles, within `angleTolerance` degrees. */
    isPerpendicular(other: VectorLike, angleTolerance?: number): boolean;
    /** Rotate this point about an axis (through the origin for a plain vector). */
    rotate(axis: Axis | VectorLike, angle: number): Vector;
    /** Orthogonal projection of this point onto a plane. */
    projectTo(plane: Plane): Vector;
    /** A unit vector perpendicular to this one. */
    anyPerpendicular(): Vector;
}
/**
 * An infinite line through `origin` along `direction`.
 *
 * `Axis.X`, `Axis.Y` and `Axis.Z` (also exported as `X`, `Y`, `Z`) are the world axes. Axes are
 * used to rotate, revolve, mirror, and to sort or filter shapes.
 */
export declare class Axis {
    /** The world X axis, through the origin. */
    static X: Axis;
    /** The world Y axis, through the origin. */
    static Y: Axis;
    /** The world Z axis, through the origin. */
    static Z: Axis;
    /** A point of the axis (the one it was made with). */
    readonly origin: Vector;
    /** The axis's direction, of length 1. */
    readonly direction: Vector;
    constructor(origin?: VectorLike, direction?: VectorLike);
    /** The axis pointing the other way (Python's unary `-`), the same as `reversed()`. */
    neg(): Axis;
    /** The axis through the same point, pointing the other way. */
    reversed(): Axis;
    /** The axis moved by a location: its origin moved, its direction turned. */
    moved(location: Location): Axis;
    /** The same direction through another point. */
    at(origin: VectorLike): Axis;
    /** True if the axis runs along another axis or a direction (either sense), within
     * `angleTolerance` degrees. */
    isParallel(other: Axis | VectorLike, angleTolerance?: number): boolean;
    /** The distance of a point from the axis (the whole line). */
    distanceTo(point: VectorLike): number;
    /** The point of the axis (the whole line) nearest to a point. */
    project(point: VectorLike): Vector;
    /** Signed coordinate of `point` along this axis. */
    positionAlong(point: VectorLike): number;
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
export declare const X: Axis;
export declare const Y: Axis;
export declare const Z: Axis;
/** Anything with a `moved(location)`: shapes, lists of shapes, patterns. */
export interface Movable<T> {
    moved(location: Location): T;
}
/**
 * A rigid placement (rotation + translation), stored as a 4x4 matrix.
 *
 * Build them with `Pos` and `Rot` and combine with `mul`. Applying a location to a shape moves
 * the shape: `Pos(10, 0, 0).mul(Rot(0, 0, 45)).mul(Box(1, 1, 1))` first rotates the box about the
 * world Z axis, then moves it 10 along X.
 */
export declare class Location {
    constructor(position?: VectorLike | Plane | Location | Matrix | number[][] | null, rotation?: VectorLike | null);
    /** Rotation by `angle` degrees about an arbitrary axis. */
    static about(axis: Axis, angle: number): Location;
    /** The 4x4 homogeneous matrix (column-vector convention), row by row. */
    get matrix(): number[][];
    /** Where the location moves the origin to. */
    get position(): Vector;
    /** Rotation as X, Y, Z angles in degrees (applied in that order about world axes). */
    get rotation(): Vector;
    /** Where the location turns the X direction to. */
    get xDir(): Vector;
    /** Where the location turns the Y direction to. */
    get yDir(): Vector;
    /** Where the location turns the Z direction to. */
    get zDir(): Vector;
    /** The XY plane moved by this location. */
    get plane(): Plane;
    /** The location that undoes this one. */
    inverse(): Location;
    /** A direction turned by the location's rotation (its translation left out). */
    rotateVector(v: VectorLike): Vector;
    /**
     * This location applied to something: another location (composed), a point (moved), an axis,
     * a plane, a shape or a list of them (moved; a pattern or a selection keeps its type).
     */
    mul(other: Location): Location;
    mul(other: VectorLike): Vector;
    mul(other: Axis): Axis;
    mul(other: Plane): Plane;
    mul<T>(other: Movable<T>): T;
    mul<T>(other: readonly T[]): unknown[];
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
/** Coordinates by name, for `Pos({ z: 5 })` and `Rot({ z: 45 })`. */
export interface XYZ {
    x?: number;
    y?: number;
    z?: number;
}
/** A translation. `Pos(10, 0, 5)`, `Pos([10, 0, 5])`, `Pos(vector)` or `Pos({ z: 5 })`. */
export declare function Pos(x?: number | VectorLike | XYZ, y?: number, z?: number): Location;
/** A rotation in degrees about the world X, then Y, then Z axis: `Rot(0, 0, 45)` or `Rot({ z: 45 })`. */
export declare function Rot(x?: number | VectorLike | XYZ, y?: number, z?: number): Location;
/**
 * A coordinate system: an origin, an x direction and a normal (`zDir`).
 *
 * Planes are where sketches live and where parts are placed. Named planes: `Plane.XY`
 * (= `Plane.top`), `Plane.XZ` (= `Plane.front`), `Plane.YZ` (= `Plane.right`), plus `back`, `left`
 * and `bottom`. Their local Y axis points up (world +Z) for the side views, so a sketch drawn
 * "upwards" stands up on the front plane.
 *
 * A planar Face converts to a plane at its center with its outward normal: `new Plane(face)` or
 * `face.plane`.
 */
export declare class Plane {
    /** Through the origin, X direction [1, 0, 0], normal [0, 0, 1]. */
    static XY: Plane;
    /** Through the origin, X direction [0, 1, 0], normal [1, 0, 0]. */
    static YZ: Plane;
    /** Through the origin, X direction [0, 0, 1], normal [0, 1, 0]. */
    static ZX: Plane;
    /** Through the origin, X direction [1, 0, 0], normal [0, -1, 0]. */
    static XZ: Plane;
    /** Through the origin, X direction [0, 1, 0], normal [0, 0, -1]. */
    static YX: Plane;
    /** Through the origin, X direction [0, 0, 1], normal [-1, 0, 0]. */
    static ZY: Plane;
    /** Through the origin, X direction [1, 0, 0], normal [0, 0, 1]. */
    static top: Plane;
    /** Through the origin, X direction [1, 0, 0], normal [0, 0, -1]. */
    static bottom: Plane;
    /** Through the origin, X direction [1, 0, 0], normal [0, -1, 0]. */
    static front: Plane;
    /** Through the origin, X direction [-1, 0, 0], normal [0, 1, 0]. */
    static back: Plane;
    /** Through the origin, X direction [0, -1, 0], normal [-1, 0, 0]. */
    static left: Plane;
    /** Through the origin, X direction [0, 1, 0], normal [1, 0, 0]. */
    static right: Plane;
    /** The plane's origin. */
    readonly origin: Vector;
    /** The plane's X direction, of length 1. */
    readonly xDir: Vector;
    /** The plane's Y direction, of length 1: `zDir.cross(xDir)`. */
    readonly yDir: Vector;
    /** The plane normal. */
    readonly zDir: Vector;
    constructor(origin?: VectorLike | Plane | Location | Face, xDir?: VectorLike | null, zDir?: VectorLike);
    /** The plane normal (`zDir`). */
    get normal(): Vector;
    /** The location that maps the world XY plane onto this plane. */
    get location(): Location;
    /** This plane moved `distance` along its normal. */
    offset(distance: number): Plane;
    /** This plane moved within its own coordinates. */
    shifted(x?: number, y?: number, z?: number): Plane;
    /** The same plane seen from the other side (normal reversed, x kept). */
    flipped(): Plane;
    /** Rotate about the plane's own X, then Y, then Z axis (degrees). */
    rotated(x?: number | XYZ, y?: number, z?: number): Plane;
    /** The plane moved by a location: its origin moved, its axes turned. */
    moved(location: Location): Plane;
    /** The same orientation through another origin. */
    at(origin: VectorLike): Plane;
    /** A point in the plane's coordinates: along its X and Y directions, and its height above it. */
    toLocal(point: VectorLike): Vector;
    /** The world coordinates of a point given in the plane's coordinates (see `toLocal`). */
    fromLocal(point: VectorLike): Vector;
    /** True if the point lies in the plane, at most `tolerance` (mm) off it. */
    contains(point: VectorLike, tolerance?: number): boolean;
    /** Signed distance of a point above the plane. */
    distanceTo(point: VectorLike): number;
    /** The point of the plane nearest to a point (straight along the normal). */
    project(point: VectorLike): Vector;
    /** True if the other plane is the same plane (either facing), its origin at most `tolerance` (mm)
     * off this one. */
    isCoplanar(other: Plane, tolerance?: number): boolean;
    /**
     * `plane.mul(shape)` places a shape (usually a sketch drawn on XY) onto this plane;
     * `plane.mul(location)` gives the plane's location composed with the location.
     */
    mul(other: Location): Location;
    mul(other: VectorLike): Vector;
    mul<T>(other: Movable<T>): T;
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
/** An axis-aligned bounding box. */
/**
 * Where a ray meets a shape or a mesh (see `raycast`).
 *
 * - `point`: the point where the ray meets the surface.
 * - `distance`: how far along the ray, from its start.
 * - `normal`: the outward unit normal of the surface there (of the face, or the triangle).
 * - `face`: the face that was hit (shapes), or `null`.
 * - `triangle`: the index of the triangle that was hit (meshes), or `null`.
 */
export declare class Hit<F extends Face | null = Face | null> {
    /** The point where the ray meets the surface. */
    readonly point: Vector;
    /** How far along the ray, from its start. */
    readonly distance: number;
    /** The outward unit normal of the surface there (of the face, or the triangle). */
    readonly normal: Vector;
    /** The face hit (null for a mesh's triangle: `Hit<null>`; a body's hits are `Hit<Face>`). */
    readonly face: F;
    /** The index of the triangle that was hit (meshes), or `null`. */
    readonly triangle: number | null;
    constructor(point: Vector, distance: number, normal: Vector, face?: F, triangle?: number | null);
}
/**
 * A curve as a NURBS (see `Edge.nurbs`): the degree, the knot vector (every knot as often as its
 * multiplicity, `points.length + degree + 1` of them), the control points and the weight of each
 * (`null` for a non-rational curve).
 */
export declare class Nurbs {
    /** The degree of the curve. */
    readonly degree: number;
    /** The knot vector, every knot as often as its multiplicity (`points.length + degree + 1` of them). */
    readonly knots: number[];
    /** The control points. */
    readonly points: Vector[];
    /** The weight of each control point, or `null` for a non-rational curve. */
    readonly weights: number[] | null;
    constructor(degree: number, knots: number[], points: Vector[], weights?: number[] | null);
}
/**
 * A surface as a NURBS (see `Face.nurbs`): the degrees `[u, v]`, the knot vectors `[uKnots,
 * vKnots]` (every knot as often as its multiplicity), the control points in rows by u
 * (`points[i][j]` is the point `i` along u and `j` along v) and the weights in the same rows (`null`
 * for a non-rational surface).
 */
export declare class NurbsSurface {
    /** The degrees `[u, v]`. */
    readonly degrees: [
        number,
        number
    ];
    /** The knot vectors `[uKnots, vKnots]`, every knot as often as its multiplicity. */
    readonly knots: [
        number[],
        number[]
    ];
    /** The control points, one row per u index: `points[i][j]` is the point `i` along u and `j` along v. */
    readonly points: Vector[][];
    /** The weights in the same rows, or `null` for a non-rational surface. */
    readonly weights: number[][] | null;
    constructor(degrees: [
        number,
        number
    ], knots: [
        number[],
        number[]
    ], points: Vector[][], weights?: number[][] | null);
}
/**
 * The curvature of a face at a point (see `Face.curvatureAt`).
 *
 * - `k1`: the larger principal curvature (1/mm): positive where the face bends away from its
 *   outward normal (convex, a ball seen from outside), negative where it bends towards it (a bore).
 * - `k2`: the smaller principal curvature.
 * - `dir1`: the unit direction of `k1`, tangent to the face; `dir2` the one of `k2`, square to it.
 * - `normal`: the outward unit normal; `point`: the point on the face.
 */
export declare class Curvature {
    /** The larger principal curvature (1/mm): positive where the face bends away from its outward normal (convex,
     * a ball seen from outside), negative where it bends towards it (a bore). */
    readonly k1: number;
    /** The smaller principal curvature. */
    readonly k2: number;
    /** The unit direction of `k1`, tangent to the face. */
    readonly dir1: Vector;
    /** The unit direction of `k2`, square to `dir1`. */
    readonly dir2: Vector;
    /** The outward unit normal. */
    readonly normal: Vector;
    /** The point on the face. */
    readonly point: Vector;
    constructor(k1: number, k2: number, dir1: Vector, dir2: Vector, normal: Vector, point: Vector);
    /** The mean curvature `(k1 + k2) / 2`. */
    get mean(): number;
    /** The Gaussian curvature `k1 * k2` (positive on a ball, zero on a cylinder, negative at a saddle). */
    get gaussian(): number;
}
/**
 * How two faces meet at an edge, or two edges at the joints of a wire (see `Edge.continuity`,
 * `Wire.continuity`).
 *
 * - `level`: "G2" (curvature continuous), "G1" (tangent), "G0" (they meet at an angle) or `null`
 *   (they do not meet: a gap above the tolerance).
 * - `gap`: the largest distance between the two sides.
 * - `angle`: the largest angle between the two sides' normals (faces) or tangents (wires), degrees.
 * - `curvatureJump`: the largest difference of the curvatures on the two sides (1/mm): across the
 *   edge for faces, of the curvature vectors for wires. NaN where it cannot be had.
 * - `point`: where the sides differ most in what decides the level: the largest gap for `null`, the
 *   largest angle for "G0", the largest curvature jump for "G1" and "G2".
 */
export declare class Continuity {
    /** `"G2"` (curvature continuous), `"G1"` (tangent), `"G0"` (they meet at an angle) or `null` (they do not
     * meet: a gap above the tolerance). */
    readonly level: string | null;
    /** The largest distance between the two sides. */
    readonly gap: number;
    /** The largest angle between the two sides' normals (faces) or tangents (wires), in degrees. */
    readonly angle: number;
    /** The largest difference of the curvatures on the two sides (1/mm): across the edge for faces, of the
     * curvature vectors for wires. NaN where it cannot be had. */
    readonly curvatureJump: number;
    /** Where the sides differ most in what decides the level: the largest gap for `null`, the largest angle for
     * `"G0"`, the largest curvature jump for `"G1"` and `"G2"`. */
    readonly point: Vector;
    constructor(level: string | null, gap: number, angle: number, curvatureJump: number, point: Vector);
}
/**
 * The nearest points of two shapes (see `Part.closestPoints`).
 *
 * - `point`: the point on the body the method was called on; `otherPoint`: the point on the other.
 * - `distance`: their distance.
 * - `face`: the face of the body the point lies on (at an edge or a corner, one of the faces there).
 * - `otherFace`: the face of the other shape, or `null` when it is an edge or a wire.
 */
export declare class ClosestPoints {
    /** The point on the body the method was called on. */
    readonly point: Vector;
    /** The point on the other shape. */
    readonly otherPoint: Vector;
    /** Their distance. */
    readonly distance: number;
    /** The face of the body the point lies on (at an edge or a corner, one of the faces there). */
    readonly face: Face | null;
    /** The face of the other shape, or `null` when it is an edge or a wire. */
    readonly otherFace: Face | null;
    constructor(point: Vector, otherPoint: Vector, distance: number, face?: Face | null, otherFace?: Face | null);
}
export declare class BoundBox {
    /** The corner with the smallest x, y and z. */
    min: Vector;
    /** The corner with the largest x, y and z. */
    max: Vector;
    constructor(min: VectorLike, max: VectorLike);
    /** The smallest box along the axes around the points. */
    static ofPoints(points: Iterable<VectorLike>): BoundBox;
    /** The box's extent along X, Y and Z, as a vector. */
    get size(): Vector;
    /** The middle of the box. */
    get center(): Vector;
    /** The length of the box's diagonal. */
    get diagonal(): number;
    /** The smallest box around both boxes. */
    union(other: BoundBox): BoundBox;
    /** True if the point lies in the box or on its sides, or at most `tolerance` (mm) outside. */
    contains(point: VectorLike, tolerance?: number): boolean;
    [Symbol.iterator](): IterableIterator<Vector>;
    toString(): string;
    [inspect](): string;
}
export {};
