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
    readonly x: number;
    readonly y: number;
    readonly z: number;
    constructor(x?: number | VectorLike, y?: number, z?: number);
    /** `[x, y, z]` */
    toArray(): [number, number, number];
    [Symbol.iterator](): IterableIterator<number>;
    add(other: VectorLike): Vector;
    sub(other: VectorLike): Vector;
    /** This vector scaled by a number (`dot` and `cross` multiply two vectors). */
    mul(s: number): Vector;
    div(s: number): Vector;
    neg(): Vector;
    /** Equal within TOLERANCE. */
    equals(other: unknown): boolean;
    /** A key equal for vectors equal to 6 decimals (for maps and sets). */
    _key(): string;
    toString(): string;
    [inspect](): string;
    get length(): number;
    dot(other: VectorLike): number;
    cross(other: VectorLike): Vector;
    normalized(): Vector;
    distanceTo(other: VectorLike): number;
    /** Angle to another vector in degrees (0..180). */
    angleTo(other: VectorLike): number;
    isClose(other: VectorLike, tol?: number): boolean;
    /** True if both vectors point along the same line (either sense). */
    isParallel(other: VectorLike, angleTol?: number): boolean;
    isPerpendicular(other: VectorLike, angleTol?: number): boolean;
    /** Rotate this point about an axis (through the origin for a plain vector). */
    rotate(axis: Axis | VectorLike, angle: number): Vector;
    /** Orthogonal projection of this point onto a plane. */
    projectTo(plane: Plane): Vector;
    /** A unit vector perpendicular to this one. */
    anyPerpendicular(): Vector;
}
export declare function _formatG(v: number, precision?: number): string;
export declare function _formatE(v: number, digits: number): string;
export declare function _fmt(v: number): string;
export declare function _fmtF(v: number): number;
export declare function _degrees(rad: number): number;
export declare function _radians(deg: number): number;
export declare function _vec(v: VectorLike): Vector;
/** A point given as `[x, y]` or `[x, y, z]` numbers (not a shape, not a list of points). */
export declare function _isPointLike(v: unknown): v is VectorLike;
/**
 * An infinite line through `origin` along `direction`.
 *
 * `Axis.X`, `Axis.Y` and `Axis.Z` (also exported as `X`, `Y`, `Z`) are the world axes. Axes are
 * used to rotate, revolve, mirror, and to sort or filter shapes.
 */
export declare class Axis {
    static X: Axis;
    static Y: Axis;
    static Z: Axis;
    readonly origin: Vector;
    readonly direction: Vector;
    constructor(origin?: VectorLike, direction?: VectorLike);
    neg(): Axis;
    reversed(): Axis;
    moved(loc: Location): Axis;
    /** The same direction through another point. */
    at(origin: VectorLike): Axis;
    isParallel(other: Axis | VectorLike, angleTol?: number): boolean;
    distanceTo(point: VectorLike): number;
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
/** The unit vector of a direction given as an axis (its direction) or as a vector. */
export declare function _direction(direction: Axis | VectorLike, what: string): Vector;
export declare function _identity(): Matrix;
export declare function _matmul(a: Matrix, b: Matrix): Matrix;
/** The point `p` moved by the matrix (rotation and translation). */
export declare function _apply(m: Matrix, p: Vector): Vector;
/** The direction `v` turned by the matrix (no translation). */
export declare function _applyVector(m: Matrix, v: Vector): Vector;
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
    readonly _m: Matrix;
    constructor(position?: VectorLike | Plane | Location | Matrix | number[][] | null, rotation?: VectorLike | null);
    /** Rotation by `angle` degrees about an arbitrary axis. */
    static about(axis: Axis, angle: number): Location;
    /** The 4x4 homogeneous matrix (column-vector convention), row by row. */
    get matrix(): number[][];
    get position(): Vector;
    /** Rotation as X, Y, Z angles in degrees (applied in that order about world axes). */
    get rotation(): Vector;
    get xDir(): Vector;
    get yDir(): Vector;
    get zDir(): Vector;
    /** The XY plane moved by this location. */
    get plane(): Plane;
    inverse(): Location;
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
/** What a planar face gives: its plane (see Face). */
interface HasFacePlane {
    _planeOfFace(): Plane;
}
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
    static XY: Plane;
    static YZ: Plane;
    static ZX: Plane;
    static XZ: Plane;
    static YX: Plane;
    static ZY: Plane;
    static top: Plane;
    static bottom: Plane;
    static front: Plane;
    static back: Plane;
    static left: Plane;
    static right: Plane;
    readonly origin: Vector;
    readonly xDir: Vector;
    readonly yDir: Vector;
    /** The plane normal. */
    readonly zDir: Vector;
    constructor(origin?: VectorLike | Plane | Location | HasFacePlane, xDir?: VectorLike | null, zDir?: VectorLike);
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
    moved(loc: Location): Plane;
    /** The same orientation through another origin. */
    at(origin: VectorLike): Plane;
    toLocal(point: VectorLike): Vector;
    fromLocal(point: VectorLike): Vector;
    contains(point: VectorLike, tol?: number): boolean;
    /** Signed distance of a point above the plane. */
    distanceTo(point: VectorLike): number;
    project(point: VectorLike): Vector;
    isCoplanar(other: Plane, tol?: number): boolean;
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
/**
 * The x direction a plane gets when none is given.
 *
 * Vertical planes keep their local Y pointing up (world +Z), so sketches placed on side faces
 * stand upright. Other planes take the projection of world X (world Y when the normal is close
 * to X).
 */
export declare function _defaultXDir(z: Vector): Vector;
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
export declare class Hit {
    readonly point: Vector;
    readonly distance: number;
    readonly normal: Vector;
    readonly face: any;
    readonly triangle: number | null;
    constructor(point: Vector, distance: number, normal: Vector, face?: any, triangle?: number | null);
}
/**
 * A curve as a NURBS (see `Edge.nurbs`): the degree, the knot vector (every knot as often as its
 * multiplicity, `points.length + degree + 1` of them), the control points and the weight of each
 * (`null` for a non-rational curve).
 */
export declare class Nurbs {
    readonly degree: number;
    readonly knots: number[];
    readonly points: Vector[];
    readonly weights: number[] | null;
    constructor(degree: number, knots: number[], points: Vector[], weights?: number[] | null);
}
export declare class BoundBox {
    min: Vector;
    max: Vector;
    constructor(min: VectorLike, max: VectorLike);
    static ofPoints(points: Iterable<VectorLike>): BoundBox;
    get size(): Vector;
    get center(): Vector;
    get diagonal(): number;
    union(other: BoundBox): BoundBox;
    contains(point: VectorLike, tol?: number): boolean;
    [Symbol.iterator](): IterableIterator<Vector>;
    toString(): string;
    [inspect](): string;
}
export {};
