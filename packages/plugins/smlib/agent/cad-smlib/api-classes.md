# @classcad/smlibwasm — Classes

11 top-level symbols. Signatures are verbatim typescript.

// An infinite line through `origin` along `direction`
// Remarks: `Axis.X`, `Axis.Y` and `Axis.Z` (also exported as `X`, `Y`, `Z`) are the world axes. Axes are used to rotate, revolve, mirror, and to sort or filter shapes.
Axis: export declare class Axis

  // The world X axis, through the origin
  static X: Axis

  // The world Y axis, through the origin
  static Y: Axis

  // The world Z axis, through the origin
  static Z: Axis

  // A point of the axis (the one it was made with)
  readonly origin: Vector

  // The axis's direction, of length 1
  readonly direction: Vector

  // Axis.constructor (constructor)
  constructor(origin?: VectorLike, direction?: VectorLike);

  // The axis pointing the other way (Python's unary `-`), the same as `reversed()`
  // Axis.neg (method)
  neg(): Axis;

  // The axis through the same point, pointing the other way
  // Axis.reversed (method)
  reversed(): Axis;

  // The axis moved by a location
  // Axis.moved (method)
  moved(location: Location): Axis;

  // The same direction through another point
  // Axis.at (method)
  at(origin: VectorLike): Axis;

  // True if the axis runs along another axis or a direction (either sense), within `angleTolerance` degrees
  // Axis.isParallel (method)
  isParallel(other: Axis | VectorLike, angleTolerance?: number): boolean;

  // The distance of a point from the axis (the whole line)
  // Axis.distanceTo (method)
  distanceTo(point: VectorLike): number;

  // The point of the axis (the whole line) nearest to a point
  // Axis.project (method)
  project(point: VectorLike): Vector;

  // Signed coordinate of `point` along this axis
  // Axis.positionAlong (method)
  positionAlong(point: VectorLike): number;

  // Axis.equals (method)
  equals(other: unknown): boolean;

  // Axis.toString (method)
  toString(): string;

  // Axis.[inspect] (method)
  [inspect](): string;

BoundBox: export declare class BoundBox

  // The corner with the smallest x, y and z
  min: Vector

  // The corner with the largest x, y and z
  max: Vector

  // BoundBox.constructor (constructor)
  constructor(min: VectorLike, max: VectorLike);

  // The smallest box along the axes around the points
  // BoundBox.ofPoints (method)
  static ofPoints(points: Iterable<VectorLike>): BoundBox;

  // The box's extent along X, Y and Z, as a vector
  readonly size: Vector

  // The middle of the box
  readonly center: Vector

  // The length of the box's diagonal
  readonly diagonal: number

  // The smallest box around both boxes
  // BoundBox.union (method)
  union(other: BoundBox): BoundBox;

  // True if the point lies in the box or on its sides, or at most `tolerance` (mm) outside
  // BoundBox.contains (method)
  contains(point: VectorLike, tolerance?: number): boolean;

  // BoundBox.[Symbol.iterator] (method)
  [Symbol.iterator](): IterableIterator<Vector>;

  // BoundBox.toString (method)
  toString(): string;

  // BoundBox.[inspect] (method)
  [inspect](): string;

// The nearest points of two shapes (see `Part.closestPoints`)
// Remarks: - `point`: the point on the body the method was called on; `otherPoint`: the point on the other. - `distance`: their distance. - `face`: the face of the body the point lies on (at an edge or a corner, one of the faces there). - `otherFace`: the face of the other shape, or `null` when it is an edge or a wire.
ClosestPoints: export declare class ClosestPoints

  // The point on the body the method was called on
  readonly point: Vector

  // The point on the other shape
  readonly otherPoint: Vector

  // Their distance
  readonly distance: number

  // The face of the body the point lies on (at an edge or a corner, one of the faces there)
  readonly face: Face | null

  // The face of the other shape, or `null` when it is an edge or a wire
  readonly otherFace: Face | null

  // ClosestPoints.constructor (constructor)
  constructor(point: Vector, otherPoint: Vector, distance: number, face?: Face | null, otherFace?: Face | null);

// How two faces meet at an edge, or two edges at the joints of a wire (see `Edge.continuity`, `Wire.continuity`)
// Remarks: - `level`: "G2" (curvature continuous), "G1" (tangent), "G0" (they meet at an angle) or `null` (they do not meet: a gap above the tolerance). - `gap`: the largest distance between the two sides. - `angle`: the largest angle between the two sides' normals (faces) or tangents (wires), degrees. - `curvatureJump`: the largest difference of the curvatures on the two sides (1/mm): across the edge for faces, of the curvature vectors for wires. NaN where it cannot be had. - `point`: where the sides differ most in what decides the level: the largest gap for `null`, the largest angle for "G0", the largest curvature jump for "G1" and "G2".
Continuity: export declare class Continuity

  // `"G2"` (curvature continuous), `"G1"` (tangent), `"G0"` (they meet at an angle) or `null` (they do not meet
  readonly level: string | null

  // The largest distance between the two sides
  readonly gap: number

  // The largest angle between the two sides' normals (faces) or tangents (wires), in degrees
  readonly angle: number

  // The largest difference of the curvatures on the two sides (1/mm)
  readonly curvatureJump: number

  // Where the sides differ most in what decides the level
  readonly point: Vector

  // Continuity.constructor (constructor)
  constructor(level: string | null, gap: number, angle: number, curvatureJump: number, point: Vector);

// The curvature of a face at a point (see `Face.curvatureAt`)
// Remarks: - `k1`: the larger principal curvature (1/mm): positive where the face bends away from its outward normal (convex, a ball seen from outside), negative where it bends towards it (a bore). - `k2`: the smaller principal curvature. - `dir1`: the unit direction of `k1`, tangent to the face; `dir2` the one of `k2`, square to it. - `normal`: the outward unit normal; `point`: the point on the face.
Curvature: export declare class Curvature

  // The larger principal curvature (1/mm)
  readonly k1: number

  // The smaller principal curvature
  readonly k2: number

  // The unit direction of `k1`, tangent to the face
  readonly dir1: Vector

  // The unit direction of `k2`, square to `dir1`
  readonly dir2: Vector

  // The outward unit normal
  readonly normal: Vector

  // The point on the face
  readonly point: Vector

  // Curvature.constructor (constructor)
  constructor(k1: number, k2: number, dir1: Vector, dir2: Vector, normal: Vector, point: Vector);

  // The mean curvature `(k1 + k2) / 2`
  readonly mean: number

  // The Gaussian curvature `k1 * k2` (positive on a ball, zero on a cylinder, negative at a saddle)
  readonly gaussian: number

// Where a ray meets a shape or a mesh (see `raycast`)
// Remarks: - `point`: the point where the ray meets the surface. - `distance`: how far along the ray, from its start. - `normal`: the outward unit normal of the surface there (of the face, or the triangle). - `face`: the face that was hit (shapes), or `null`. - `triangle`: the index of the triangle that was hit (meshes), or `null`.
Hit: export declare class Hit<F extends Face | null = Face | null>

  // The point where the ray meets the surface
  readonly point: Vector

  // How far along the ray, from its start
  readonly distance: number

  // The outward unit normal of the surface there (of the face, or the triangle)
  readonly normal: Vector

  // The face hit (null for a mesh's triangle
  readonly face: F

  // The index of the triangle that was hit (meshes), or `null`
  readonly triangle: number | null

  // Hit.constructor (constructor)
  constructor(point: Vector, distance: number, normal: Vector, face?: F, triangle?: number | null);

// A rigid placement (rotation + translation), stored as a 4x4 matrix
// Remarks: Build them with `Pos` and `Rot` and combine with `mul`. Applying a location to a shape moves the shape: `Pos(10, 0, 0).mul(Rot(0, 0, 45)).mul(Box(1, 1, 1))` first rotates the box about the world Z axis, then moves it 10 along X.
Location: export declare class Location

  // Location.constructor (constructor)
  constructor(position?: VectorLike | Plane | Location | Matrix | number[][] | null, rotation?: VectorLike | null);

  // Rotation by `angle` degrees about an arbitrary axis
  // Location.about (method)
  static about(axis: Axis, angle: number): Location;

  // The 4x4 homogeneous matrix (column-vector convention), row by row
  readonly matrix: number[][]

  // Where the location moves the origin to
  readonly position: Vector

  // Rotation as X, Y, Z angles in degrees (applied in that order about world axes)
  readonly rotation: Vector

  // Where the location turns the X direction to
  readonly xDir: Vector

  // Where the location turns the Y direction to
  readonly yDir: Vector

  // Where the location turns the Z direction to
  readonly zDir: Vector

  // The XY plane moved by this location
  readonly plane: Plane

  // The location that undoes this one
  // Location.inverse (method)
  inverse(): Location;

  // A direction turned by the location's rotation (its translation left out)
  // Location.rotateVector (method)
  rotateVector(v: VectorLike): Vector;

  // This location applied to something
  // Location.mul (method)
  mul(other: Location): Location;
  mul(other: VectorLike): Vector;
  mul(other: Axis): Axis;
  mul(other: Plane): Plane;
  mul<T>(other: Movable<T>): T;
  mul<T>(other: readonly T[]): unknown[];

  // Location.equals (method)
  equals(other: unknown): boolean;

  // Location.toString (method)
  toString(): string;

  // Location.[inspect] (method)
  [inspect](): string;

// A curve as a NURBS (see `Edge.nurbs`)
Nurbs: export declare class Nurbs

  // The degree of the curve
  readonly degree: number

  // The knot vector, every knot as often as its multiplicity (`points.length + degree + 1` of them)
  readonly knots: number[]

  // The control points
  readonly points: Vector[]

  // The weight of each control point, or `null` for a non-rational curve
  readonly weights: number[] | null

  // Nurbs.constructor (constructor)
  constructor(degree: number, knots: number[], points: Vector[], weights?: number[] | null);

// A surface as a NURBS (see `Face.nurbs`)
NurbsSurface: export declare class NurbsSurface

  // The degrees `[u, v]`
  readonly degrees: [
          number,
          number
      ]

  // The knot vectors `[uKnots, vKnots]`, every knot as often as its multiplicity
  readonly knots: [
          number[],
          number[]
      ]

  // The control points, one row per u index
  readonly points: Vector[][]

  // The weights in the same rows, or `null` for a non-rational surface
  readonly weights: number[][] | null

  // NurbsSurface.constructor (constructor)
  constructor(degrees: [
          number,
          number
      ], knots: [
          number[],
          number[]
      ], points: Vector[][], weights?: number[][] | null);

// A coordinate system
// Remarks: Planes are where sketches live and where parts are placed. Named planes: `Plane.XY` (= `Plane.top`), `Plane.XZ` (= `Plane.front`), `Plane.YZ` (= `Plane.right`), plus `back`, `left` and `bottom`. Their local Y axis points up (world +Z) for the side views, so a sketch drawn "upwards" stands up on the front plane. A planar Face converts to a plane at its center with its outward normal: `new Plane(face)` or `face.plane`.
Plane: export declare class Plane

  // Through the origin, X direction [1, 0, 0], normal [0, 0, 1]
  static XY: Plane

  // Through the origin, X direction [0, 1, 0], normal [1, 0, 0]
  static YZ: Plane

  // Through the origin, X direction [0, 0, 1], normal [0, 1, 0]
  static ZX: Plane

  // Through the origin, X direction [1, 0, 0], normal [0, -1, 0]
  static XZ: Plane

  // Through the origin, X direction [0, 1, 0], normal [0, 0, -1]
  static YX: Plane

  // Through the origin, X direction [0, 0, 1], normal [-1, 0, 0]
  static ZY: Plane

  // Through the origin, X direction [1, 0, 0], normal [0, 0, 1]
  static top: Plane

  // Through the origin, X direction [1, 0, 0], normal [0, 0, -1]
  static bottom: Plane

  // Through the origin, X direction [1, 0, 0], normal [0, -1, 0]
  static front: Plane

  // Through the origin, X direction [-1, 0, 0], normal [0, 1, 0]
  static back: Plane

  // Through the origin, X direction [0, -1, 0], normal [-1, 0, 0]
  static left: Plane

  // Through the origin, X direction [0, 1, 0], normal [1, 0, 0]
  static right: Plane

  // The plane's origin
  readonly origin: Vector

  // The plane's X direction, of length 1
  readonly xDir: Vector

  // The plane's Y direction, of length 1
  readonly yDir: Vector

  // The plane normal
  readonly zDir: Vector

  // Plane.constructor (constructor)
  constructor(origin?: VectorLike | Plane | Location | Face, xDir?: VectorLike | null, zDir?: VectorLike);

  // The plane normal (`zDir`)
  readonly normal: Vector

  // The location that maps the world XY plane onto this plane
  readonly location: Location

  // This plane moved `distance` along its normal
  // Plane.offset (method)
  offset(distance: number): Plane;

  // This plane moved within its own coordinates
  // Plane.shifted (method)
  shifted(x?: number, y?: number, z?: number): Plane;

  // The same plane seen from the other side (normal reversed, x kept)
  // Plane.flipped (method)
  flipped(): Plane;

  // Rotate about the plane's own X, then Y, then Z axis (degrees)
  // Plane.rotated (method)
  rotated(x?: number | XYZ, y?: number, z?: number): Plane;

  // The plane moved by a location
  // Plane.moved (method)
  moved(location: Location): Plane;

  // The same orientation through another origin
  // Plane.at (method)
  at(origin: VectorLike): Plane;

  // A point in the plane's coordinates
  // Plane.toLocal (method)
  toLocal(point: VectorLike): Vector;

  // The world coordinates of a point given in the plane's coordinates (see `toLocal`)
  // Plane.fromLocal (method)
  fromLocal(point: VectorLike): Vector;

  // True if the point lies in the plane, at most `tolerance` (mm) off it
  // Plane.contains (method)
  contains(point: VectorLike, tolerance?: number): boolean;

  // Signed distance of a point above the plane
  // Plane.distanceTo (method)
  distanceTo(point: VectorLike): number;

  // The point of the plane nearest to a point (straight along the normal)
  // Plane.project (method)
  project(point: VectorLike): Vector;

  // True if the other plane is the same plane (either facing), its origin at most `tolerance` (mm) off this one
  // Plane.isCoplanar (method)
  isCoplanar(other: Plane, tolerance?: number): boolean;

  // `plane.mul(shape)` places a shape (usually a sketch drawn on XY) onto this plane
  // Plane.mul (method)
  mul(other: Location): Location;
  mul(other: VectorLike): Vector;
  mul<T>(other: Movable<T>): T;

  // Plane.equals (method)
  equals(other: unknown): boolean;

  // Plane.toString (method)
  toString(): string;

  // Plane.[inspect] (method)
  [inspect](): string;

// An immutable 3D vector or point
// Remarks: `new Vector(1, 2)`, `new Vector(1, 2, 3)`, `new Vector([1, 2, 3])` and `new Vector(other)` are all accepted. Vectors have `add`, `sub`, `mul` (by a number), `div`, `neg`, `length` and iterate over their coordinates.
Vector: export declare class Vector

  // The x coordinate
  readonly x: number

  // The y coordinate
  readonly y: number

  // The z coordinate
  readonly z: number

  // Vector.constructor (constructor)
  constructor(x?: number | VectorLike, y?: number, z?: number);

  // `[x, y, z]`
  // Vector.toArray (method)
  toArray(): [
          number,
          number,
          number
      ];

  // Vector.[Symbol.iterator] (method)
  [Symbol.iterator](): IterableIterator<number>;

  // The sum of the two vectors (Python's `+`)
  // Vector.add (method)
  add(other: VectorLike): Vector;

  // The difference of the two vectors (Python's `-`)
  // Vector.sub (method)
  sub(other: VectorLike): Vector;

  // This vector scaled by a number (`dot` and `cross` multiply two vectors)
  // Vector.mul (method)
  mul(s: number): Vector;

  // The vector divided by a number (Python's `/`)
  // Vector.div (method)
  div(s: number): Vector;

  // The vector pointing the other way (Python's unary `-`)
  // Vector.neg (method)
  neg(): Vector;

  // Equal within TOLERANCE
  // Vector.equals (method)
  equals(other: unknown): boolean;

  // Vector.toString (method)
  toString(): string;

  // Vector.[inspect] (method)
  [inspect](): string;

  // The length (for a point
  readonly length: number

  // The dot product with another vector
  // Vector.dot (method)
  dot(other: VectorLike): number;

  // The cross product with another vector
  // Vector.cross (method)
  cross(other: VectorLike): Vector;

  // The vector scaled to length 1
  // Vector.normalized (method)
  normalized(): Vector;

  // The distance to another point
  // Vector.distanceTo (method)
  distanceTo(other: VectorLike): number;

  // Angle to another vector in degrees (0..180)
  // Vector.angleTo (method)
  angleTo(other: VectorLike): number;

  // True if the two points are at most `tolerance` apart (mm)
  // Vector.isClose (method)
  isClose(other: VectorLike, tolerance?: number): boolean;

  // True if both vectors point along the same line (either sense), within `angleTolerance` degrees
  // Vector.isParallel (method)
  isParallel(other: VectorLike, angleTolerance?: number): boolean;

  // True if the vectors are at right angles, within `angleTolerance` degrees
  // Vector.isPerpendicular (method)
  isPerpendicular(other: VectorLike, angleTolerance?: number): boolean;

  // Rotate this point about an axis (through the origin for a plain vector)
  // Vector.rotate (method)
  rotate(axis: Axis | VectorLike, angle: number): Vector;

  // Orthogonal projection of this point onto a plane
  // Vector.projectTo (method)
  projectTo(plane: Plane): Vector;

  // A unit vector perpendicular to this one
  // Vector.anyPerpendicular (method)
  anyPerpendicular(): Vector;
