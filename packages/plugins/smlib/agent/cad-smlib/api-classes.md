# @classcad/smlibwasm — Classes

12 top-level symbols. Signatures are verbatim typescript.

// An infinite line through `origin` along `direction`
// Remarks: `Axis.X`, `Axis.Y` and `Axis.Z` (also exported as `X`, `Y`, `Z`) are the world axes. Axes are used to rotate, revolve, mirror, and to sort or filter shapes.
Axis: export declare class Axis

  static X: Axis

  static Y: Axis

  static Z: Axis

  readonly origin: Vector

  readonly direction: Vector

  // Axis.constructor (constructor)
  constructor(origin?: VectorLike, direction?: VectorLike);

  // Axis.neg (method)
  neg(): Axis;

  // Axis.reversed (method)
  reversed(): Axis;

  // Axis.moved (method)
  moved(loc: Location): Axis;

  // The same direction through another point
  // Axis.at (method)
  at(origin: VectorLike): Axis;

  // Axis.isParallel (method)
  isParallel(other: Axis | VectorLike, angleTol?: number): boolean;

  // Axis.distanceTo (method)
  distanceTo(point: VectorLike): number;

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

  min: Vector

  max: Vector

  // BoundBox.constructor (constructor)
  constructor(min: VectorLike, max: VectorLike);

  // BoundBox.ofPoints (method)
  static ofPoints(points: Iterable<VectorLike>): BoundBox;

  readonly size: Vector

  readonly center: Vector

  readonly diagonal: number

  // BoundBox.union (method)
  union(other: BoundBox): BoundBox;

  // BoundBox.contains (method)
  contains(point: VectorLike, tol?: number): boolean;

  // BoundBox.[Symbol.iterator] (method)
  [Symbol.iterator](): IterableIterator<Vector>;

  // BoundBox.toString (method)
  toString(): string;

  // BoundBox.[inspect] (method)
  [inspect](): string;

// Where a ray meets a shape or a mesh (see `raycast`)
// Remarks: - `point`: the point where the ray meets the surface. - `distance`: how far along the ray, from its start. - `normal`: the outward unit normal of the surface there (of the face, or the triangle). - `face`: the face that was hit (shapes), or `null`. - `triangle`: the index of the triangle that was hit (meshes), or `null`.
Hit: export declare class Hit

  readonly point: Vector

  readonly distance: number

  readonly normal: Vector

  readonly face: any

  readonly triangle: number | null

  // Hit.constructor (constructor)
  constructor(point: Vector, distance: number, normal: Vector, face?: any, triangle?: number | null);

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

  readonly position: Vector

  // Rotation as X, Y, Z angles in degrees (applied in that order about world axes)
  readonly rotation: Vector

  readonly xDir: Vector

  readonly yDir: Vector

  readonly zDir: Vector

  // The XY plane moved by this location
  readonly plane: Plane

  // Location.inverse (method)
  inverse(): Location;

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

  readonly degree: number

  readonly knots: number[]

  readonly points: Vector[]

  readonly weights: number[] | null

  // Nurbs.constructor (constructor)
  constructor(degree: number, knots: number[], points: Vector[], weights?: number[] | null);

// A coordinate system
// Remarks: Planes are where sketches live and where parts are placed. Named planes: `Plane.XY` (= `Plane.top`), `Plane.XZ` (= `Plane.front`), `Plane.YZ` (= `Plane.right`), plus `back`, `left` and `bottom`. Their local Y axis points up (world +Z) for the side views, so a sketch drawn "upwards" stands up on the front plane. A planar Face converts to a plane at its center with its outward normal: `new Plane(face)` or `face.plane`.
Plane: export declare class Plane

  static XY: Plane

  static YZ: Plane

  static ZX: Plane

  static XZ: Plane

  static YX: Plane

  static ZY: Plane

  static top: Plane

  static bottom: Plane

  static front: Plane

  static back: Plane

  static left: Plane

  static right: Plane

  readonly origin: Vector

  readonly xDir: Vector

  readonly yDir: Vector

  // The plane normal
  readonly zDir: Vector

  // Plane.constructor (constructor)
  constructor(origin?: VectorLike | Plane | Location | HasFacePlane, xDir?: VectorLike | null, zDir?: VectorLike);

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

  // Plane.moved (method)
  moved(loc: Location): Plane;

  // The same orientation through another origin
  // Plane.at (method)
  at(origin: VectorLike): Plane;

  // Plane.toLocal (method)
  toLocal(point: VectorLike): Vector;

  // Plane.fromLocal (method)
  fromLocal(point: VectorLike): Vector;

  // Plane.contains (method)
  contains(point: VectorLike, tol?: number): boolean;

  // Signed distance of a point above the plane
  // Plane.distanceTo (method)
  distanceTo(point: VectorLike): number;

  // Plane.project (method)
  project(point: VectorLike): Vector;

  // Plane.isCoplanar (method)
  isCoplanar(other: Plane, tol?: number): boolean;

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

  readonly x: number

  readonly y: number

  readonly z: number

  // Vector.constructor (constructor)
  constructor(x?: number | VectorLike, y?: number, z?: number);

  // `[x, y, z]`
  // Vector.toArray (method)
  toArray(): [number, number, number];

  // Vector.[Symbol.iterator] (method)
  [Symbol.iterator](): IterableIterator<number>;

  // Vector.add (method)
  add(other: VectorLike): Vector;

  // Vector.sub (method)
  sub(other: VectorLike): Vector;

  // This vector scaled by a number (`dot` and `cross` multiply two vectors)
  // Vector.mul (method)
  mul(s: number): Vector;

  // Vector.div (method)
  div(s: number): Vector;

  // Vector.neg (method)
  neg(): Vector;

  // Equal within TOLERANCE
  // Vector.equals (method)
  equals(other: unknown): boolean;

  // Vector.toString (method)
  toString(): string;

  // Vector.[inspect] (method)
  [inspect](): string;

  readonly length: number

  // Vector.dot (method)
  dot(other: VectorLike): number;

  // Vector.cross (method)
  cross(other: VectorLike): Vector;

  // Vector.normalized (method)
  normalized(): Vector;

  // Vector.distanceTo (method)
  distanceTo(other: VectorLike): number;

  // Angle to another vector in degrees (0..180)
  // Vector.angleTo (method)
  angleTo(other: VectorLike): number;

  // Vector.isClose (method)
  isClose(other: VectorLike, tol?: number): boolean;

  // True if both vectors point along the same line (either sense)
  // Vector.isParallel (method)
  isParallel(other: VectorLike, angleTol?: number): boolean;

  // Vector.isPerpendicular (method)
  isPerpendicular(other: VectorLike, angleTol?: number): boolean;

  // Rotate this point about an axis (through the origin for a plain vector)
  // Vector.rotate (method)
  rotate(axis: Axis | VectorLike, angle: number): Vector;

  // Orthogonal projection of this point onto a plane
  // Vector.projectTo (method)
  projectTo(plane: Plane): Vector;

  // A unit vector perpendicular to this one
  // Vector.anyPerpendicular (method)
  anyPerpendicular(): Vector;

// A bounded curve
// Remarks: Edges come from bodies (`part.edges()`) or from curve constructors such as `Line`, `ThreePointArc` and `Spline`. Parameters along an edge (`pointAt(t)`) run from 0 at the start to 1 at the end, proportional to arc length.
Edge: export declare class Edge extends Shape

  // Edge.constructor (constructor)
  constructor(token?: symbol);

  // "line", "circle" (also arcs), "ellipse", "bspline" or "other"
  readonly geomType: string

  readonly length: number

  readonly start: Vector

  readonly end: Vector

  readonly isClosed: boolean

  // True for the seam of a closed surface (an edge used twice by one face)
  readonly isSeam: boolean

  // "convex" for an outside corner (material angle below 180 degrees), "concave" for an inside corner, "smooth" where the faces meet tangentially
  readonly convexity: string

  // True on an outside corner (see `convexity`)
  // Edge.isConvex (method)
  isConvex(): boolean;

  // Unit direction of a straight edge (start to end)
  readonly direction: Vector

  // Radius of a circular edge
  readonly radius: number

  // Center of a circular edge
  readonly arcCenter: Vector

  // Axis direction of a circular edge
  readonly normal: Vector

  // Point at fraction `t` of the edge length (0 = start, 1 = end)
  // Edge.pointAt (method)
  pointAt(t?: number): Vector;

  // Unit tangent at fraction `t` of the edge length, pointing along the edge
  // Edge.tangentAt (method)
  tangentAt(t?: number): Vector;

  // The point halfway along the edge (use `arcCenter` for a circle's center)
  // Edge.center (method)
  center(): Vector;

  // Tight axis-aligned bounding box
  // Edge.bbox (method)
  bbox(): BoundBox;

  // Minimum distance to a point (and, for bodies, to another body)
  // Edge.distanceTo (method)
  distanceTo(point: VectorLike | Shape): number;

  // Points where this edge crosses another edge
  // Edge.intersections (method)
  intersections(other: Edge): Vector[];

  // All vertices of this shape
  // Edge.vertices (method)
  vertices(): ShapeList<Vertex>;

  // All edges of this shape
  // Edge.edges (method)
  edges(): ShapeList<Edge>;

  // All faces of this shape
  // Edge.faces (method)
  faces(): ShapeList<Face>;

  // The same edge traversed the other way
  // Edge.reversed (method)
  reversed(): Edge;

  // This edge as a NURBS curve, from its start to its end
  // Edge.nurbs (method)
  nurbs(): Nurbs;

  // The same curve with the knots it does not need taken out
  // Edge.removeKnots (method)
  removeKnots(): Edge;

  // A wire of this edge and the other (Python's `+`)
  // Edge.add (method)
  add(other: Edge | Wire): Wire;

  // Edge.equals (method)
  equals(other: unknown): boolean;

  // Edge.toString (method)
  toString(): string;

// A bounded piece of a surface, belonging to a body (a part, shell or sketch)
Face: export declare class Face extends Shape

  // Face.constructor (constructor)
  constructor(owner: _Body | null, kface: number);

  // The body this face belongs to
  readonly owner: _Body | null

  // "plane", "cylinder", "cone", "sphere", "torus", "revolution", "extrusion", "bspline", "offset" or "other"
  readonly geomType: string

  readonly area: number

  // Area centroid
  // Face.center (method)
  center(): Vector;

  // A point guaranteed to lie on the face
  // Face.interiorPoint (method)
  interiorPoint(): Vector;

  // Outward unit normal at the face point closest to `point` (default
  // Face.normalAt (method)
  normalAt(point?: VectorLike | null): Vector;

  // True for planes and for flat B-spline faces (control points in one plane)
  readonly isPlanar: boolean

  // The face's plane
  readonly plane: Plane

  // Radius of a cylinder, sphere or cone (at its base), minor radius of a torus
  readonly radius: number

  // Axis of a cylinder, cone, sphere, torus or surface of revolution
  readonly axis: Axis

  // Tight axis-aligned bounding box
  // Face.bbox (method)
  bbox(): BoundBox;

  // Minimum distance to a point (and, for bodies, to another body)
  // Face.distanceTo (method)
  distanceTo(point: VectorLike | Shape): number;

  // Where a ray meets this face, nearest first (see `Part.raycast`)
  // Face.raycast (method)
  raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit[];

  // Face.outerWire (method)
  outerWire(): Wire;

  // Face.innerWires (method)
  innerWires(): ShapeList<Wire>;

  // All wires (closed edge loops of faces, or the shape itself if it is a wire)
  // Face.wires (method)
  wires(): ShapeList<Wire>;

  // The face's edges (seam edges only with `seams`)
  // Face.edges (method)
  edges(seams?: boolean): ShapeList<Edge>;

  // All vertices of this shape
  // Face.vertices (method)
  vertices(): ShapeList<Vertex>;

  // All faces of this shape
  // Face.faces (method)
  faces(): ShapeList<Face>;

  // Faces sharing an edge with this one
  // Face.neighbors (method)
  neighbors(): ShapeList<Face>;

  // A sketch holding a copy of this (planar) face
  // Face.toSketch (method)
  toSketch(): Sketch;

  // A sheet body holding a copy of this face
  // Face.toShell (method)
  toShell(): Shell;

  // Extrude a planar face along its normal (see `Sketch.extrude`)
  // Face.extrude (method)
  extrude(amount: number, options?: ExtrudeOptions): Part;

  // Face.equals (method)
  equals(other: unknown): boolean;

  // Face.toString (method)
  toString(): string;

MassProperties: export declare class MassProperties

  readonly mass: number

  readonly volume: number

  readonly area: number

  readonly center: Vector

  readonly inertia: number[][]

  readonly density: number

  // MassProperties.constructor (constructor)
  constructor(mass: number, volume: number, area: number, center: Vector, inertia: number[][], density: number);

  readonly principalMoments: [number, number, number]

  readonly principalAxes: [Vector, Vector, Vector]

  // MassProperties.toString (method)
  toString(): string;

  // MassProperties.[inspect] (method)
  [inspect](): string;

// A solid
// Remarks: Combine parts with `fuse` (union), `cut` (difference) and `intersect` (intersection). Each takes parts or any iterables of parts.
Part: export declare class Part extends _Body

  readonly volume: number

  // Total surface area
  readonly area: number

  // Center of mass (uniform density)
  // Part.center (method)
  center(): Vector;

  // Mass, center of mass and inertia tensor for a uniform `density`
  // Remarks: `accuracy` is the relative accuracy of the results (default `ACCURACY`, 1e-7; from 1e-10 to 1e-2): volume, mass and area to `accuracy` of their value, the center to `accuracy` times the size of the part (its bounding box diagonal), the inertia to `accuracy` times its largest principal moment.
  // Part.massProperties (method)
  massProperties(density?: number, accuracy?: number | null): MassProperties;

  // True if the part is a closed, manifold solid that encloses a positive volume
  // Remarks: (A body whose faces point inward, or that encloses no volume, such as a profile revolved about an axis through it, is not valid.)
  // Part.isValid (method)
  isValid(): boolean;

  // The separate bodies of this part
  // Part.solids (method)
  solids(): ShapeList<Part>;

  // This part and others as one part made of cells
  // Remarks: `cells()` gives the cells as parts of their own; `volume` is the volume of the union. A merged part is not a manifold solid: `isValid()` is false, and Booleans, fillets and shells take its cells rather than the part itself.
  // Part.merge (method)
  merge(...others: unknown[]): Part;

  // The cells of a part made by `merge`, each as a part of its own (every closed region of the body
  // Part.cells (method)
  cells(): ShapeList<Part>;

  // Union with other parts (Python's `+`)
  // Part.fuse (method)
  fuse(...others: (Part | Iterable<Part>)[]): Part;

  // Subtract other parts (Python's `-`)
  // Part.cut (method)
  cut(...others: (Part | Iterable<Part>)[]): Part;

  // Keep only the volume shared with the other parts (Python's `&`)
  // Part.intersect (method)
  intersect(...others: (Part | Iterable<Part>)[]): Part;

  // Round edges
  // Part.fillet (method)
  fillet(edges: unknown, radius: FilletRadius, options?: FilletOptions): Part;
  //   edges: Edges of this part (a selection, a single edge, or faces whose edges to round)
  //   radius: Fillet radius

  // Bevel edges
  // Part.chamfer (method)
  chamfer(edges: unknown, length: number): Part;

  // Hollow the part out to walls of `thickness`, removing the `openings` faces
  // Remarks: The walls grow inward (the outside keeps its size) unless `outward` is true.
  // Part.shell (method)
  shell(thickness: number, openings?: unknown, options?: {
          outward?: boolean;
      }): Part;

  // Grow (positive) or shrink (negative) the part by `distance` everywhere
  // Part.offset (method)
  offset(distance: number): Part;

  // Cut the part with a plane
  // Remarks: `keep = "above"` keeps the side the plane normal points to, "below" the other side, "both" returns `[above, below]`.
  // Part.split (method)
  split(plane: Plane | Face, keep: 'above' | 'below'): Part;
  split(plane: Plane | Face, keep: 'both'): [Part, Part];
  split(plane: Plane | Face): Part;

  // The cross-section of the part in a plane, as a sketch
  // Part.section (method)
  section(plane?: Plane | Face): Sketch;

  // Twist about an axis (default Z) by `angle` degrees over the part
  // Part.twist (method)
  twist(angle: number, options?: TwistOptions): Part;

  // Scale cross-sections toward an axis (default Z) from 1 to `scale`
  // Part.taper (method)
  taper(scale: number, options?: TaperOptions): Part;

  // Bend around an axis by `angle` degrees (default
  // Part.bend (method)
  bend(angle: number, options?: BendOptions): Part;

  // Deform with a `Lattice` (same as `lattice.apply(part)`)
  // Part.deform (method)
  deform(lattice: {
          apply(part: Part, options?: Record<string, unknown>): Part;
      }, options?: Record<string, unknown>): Part;

  // The part with fillets taken out and their edges sharp again
  // Part.removeFillets (method)
  removeFillets(faces?: unknown, options?: {
          maxRadius?: number | null;
          partial?: boolean;
      }): Part;

  // The part with `faces` (a hole, a boss, a pocket) cut out and the gap closed by the faces around it
  // Part.removeFaces (method)
  removeFaces(faces: unknown, options?: {
          partial?: boolean;
      }): Part;

  // Draft angle of every face for the pull direction, with the faces grouped by whether they release (see `DraftAnalysis`)
  // Part.draftAnalysis (method)
  draftAnalysis(direction: Axis | VectorLike, options?: {
          minAngle?: number;
      }): DraftAnalysis;

  // The closed lines where the part's surface turns from facing `direction` to facing away from it (see `partingLine`)
  // Part.partingLine (method)
  partingLine(direction: Axis | VectorLike): ShapeList<Wire>;

  // Tilt faces by a draft angle, so that a molded or cast part comes out of its mold
  // Remarks: Each face turns about the line where it meets the neutral plane and keeps its size there. The normal of the neutral plane is the pull direction, the way the mold moves off the part: a positive angle turns each face to look more along it, so the part narrows and pockets and holes widen along the normal, on either side of the plane. Afterwards `draftAnalysis` of that direction finds `angle` more draft on each of the faces. Planes can be drafted, and cylinders and cones whose axis runs along the normal (a cylinder becomes a cone). A face that meets a drafted face tangentially, such as a fillet between two walls, must be drafted with it; the faces around the drafted ones are extended or trimmed to meet them.
  // Part.draft (method)
  draft(faces: unknown, angle: number, neutralPlane: Plane | Face): Part;
  //   faces: Faces of this part (a selection or a single face)
  //   angle: Draft angle in degrees, between -90 and 90 and not 0
  //   neutralPlane: Where the faces keep their size, a Plane or a planar face

  // Fold this sheet along a line on its top or bottom face (see `fold`)
  // Part.fold (method)
  fold(line: Axis | Edge, angle: number, options: FoldOptions): Part;

  // Add a flange along a straight outer edge of this sheet (see `flange`)
  // Part.flange (method)
  flange(edge: Edge | ShapeList<Edge>, length: number, options: FlangeOptions): Part;

  // The bends of this sheet metal part (see `bends`)
  // Part.bends (method)
  bends(options?: {
          kFactor?: number;
      }): Bend[];

  // This sheet metal part unfolded flat (see `unfold`)
  // Part.unfold (method)
  unfold(options?: UnfoldOptions): Part;

  // The flat pattern of this sheet metal part on XY (see `flatPattern`)
  // Part.flatPattern (method)
  flatPattern(options?: UnfoldOptions): FlatPattern;

  // Part.toString (method)
  toString(): string;

// Base class of all shapes
Shape: export declare abstract class Shape

  // All vertices of this shape
  // Shape.vertices (method)
  abstract vertices(): ShapeList<Vertex>;

  // All edges of this shape
  // Shape.edges (method)
  abstract edges(): ShapeList<Edge>;

  // All wires (closed edge loops of faces, or the shape itself if it is a wire)
  // Shape.wires (method)
  wires(): ShapeList<Wire>;

  // All faces of this shape
  // Shape.faces (method)
  faces(): ShapeList<Face>;

  // A copy of this shape moved by a location (`location.mul(shape)`)
  // Shape.moved (method)
  moved(location: Location): this;

  // A copy moved by `(x, y, z)`
  // Shape.translate (method)
  translate(x?: number | VectorLike, y?: number, z?: number): this;

  // A copy rotated by `angle` degrees about `axis`
  // Shape.rotate (method)
  rotate(axis?: Axis, angle?: number): this;

  // A mirrored copy (reflection in `plane`, a plane or a planar face
  // Shape.mirror (method)
  mirror(plane?: Plane | Face | Axis | ShapeList<Face>): this;

  // A scaled copy
  // Shape.scale (method)
  scale(factor: number | VectorLike, center?: VectorLike): this;

  // Place this shape, designed around the world XY plane, onto a plane or face
  // Remarks: The shape's origin goes to the plane origin (a face's center), its X axis to the plane's X direction and its Z axis to the plane normal. `sketch.on(face)` is the usual way to draw on a face.
  // Shape.on (method)
  on(target: Plane | Face | Location | ShapeList<Face> | Sketch): this;

  // Tight axis-aligned bounding box
  // Shape.bbox (method)
  abstract bbox(): BoundBox;

  // Center of mass (centroid) of the shape
  // Shape.center (method)
  abstract center(): Vector;

  // Minimum distance to a point (and, for bodies, to another body)
  // Shape.distanceTo (method)
  distanceTo(_other: VectorLike | Shape): number;

  // Triangulate the shape (see `tessellate`)
  // Shape.mesh (method)
  mesh(tolerance?: number | null, angle?: number): Mesh;

  // Show the shape in the viewer (see `show`)
  // Shape.show (method)
  show(options?: Record<string, unknown>): unknown;

  // Write the shape to a file
  // Shape.export (method)
  export(path: string, options?: Record<string, unknown>): void;

  // Shape.toString (method)
  toString(): string;

  // Shape.[inspect] (method)
  [inspect](): string;
