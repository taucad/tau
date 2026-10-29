# @classcad/smlibwasm — Classes (4)

4 top-level symbols. Signatures are verbatim typescript.

// A list of shapes with selection helpers
// Remarks: Every selector returns a new ShapeList, so selectors chain: part.edges().parallelTo(Z).maxBy(X) part.faces().planar().facing(Z.neg()) A one-element list can be used wherever a single shape is expected (`sketch.on(part.faces().top())`). Use `one()` to require exactly one.
ShapeList: export declare class ShapeList<T = Shape> extends Array<T>

  // The only element
  // ShapeList.one (method)
  one(): T;

  // The first shape
  readonly first: T

  // The shape at `index` (Array's `at`
  // ShapeList.at (method)
  at(index: number): T | undefined;

  // The last shape
  readonly last: T

  // Sort by position along an axis, by "length"/"area"/"volume"/"radius", or by any function of a shape
  // ShapeList.sortBy (method)
  sortBy(key?: SortKey, reverse?: boolean): ShapeList<T>;

  // `parallelTo(axis)`, `ofType(name)` or `filter(predicate)`, depending on the argument
  // ShapeList.filterBy (method)
  filterBy(criterion: Axis | string | ((s: T) => boolean)): ShapeList<T>;

  // The shapes by the distance of their centers from a point, nearest first (farthest first with `reverse`)
  // ShapeList.sortByDistance (method)
  sortByDistance(point: VectorLike, reverse?: boolean): ShapeList<T>;

  // Group shapes with equal key (within `tolerance`), groups in ascending key order
  // ShapeList.groupBy (method)
  groupBy(key?: SortKey, tolerance?: number): ShapeList<T>[];

  // The shapes with the largest key (all of them, if several tie within `tolerance`)
  // ShapeList.maxBy (method)
  maxBy(key?: SortKey, tolerance?: number): ShapeList<T>;

  // The shapes with the smallest key (all of them, if several tie within `tolerance`)
  // ShapeList.minBy (method)
  minBy(key?: SortKey, tolerance?: number): ShapeList<T>;

  // Highest shapes (largest Z)
  // ShapeList.top (method)
  top(): ShapeList<T>;

  // Lowest shapes (smallest Z)
  // ShapeList.bottom (method)
  bottom(): ShapeList<T>;

  // Shapes furthest along +X
  // ShapeList.right (method)
  right(): ShapeList<T>;

  // Shapes furthest along -X
  // ShapeList.left (method)
  left(): ShapeList<T>;

  // Shapes furthest along +Y
  // ShapeList.back (method)
  back(): ShapeList<T>;

  // Shapes furthest along -Y
  // ShapeList.front (method)
  front(): ShapeList<T>;

  // The biggest shape by volume, area or length
  // ShapeList.largest (method)
  largest(): T;

  // The smallest shape by volume, area or length
  // ShapeList.smallest (method)
  smallest(): T;

  // The shape whose center is closest to `point`
  // ShapeList.nearest (method)
  nearest(point: VectorLike): T;

  // Keep the shapes for which `predicate(shape)` is true
  // ShapeList.filter (method)
  filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: unknown): ShapeList<S>;
  filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown): ShapeList<T>;

  // A plain array of what `fn` gives for each shape
  // ShapeList.map (method)
  map<U>(fn: (value: T, index: number, array: T[]) => U, thisArg?: unknown): U[];

  // Keep shapes of the given geometry types, e.g
  // ShapeList.ofType (method)
  ofType(...geomTypes: string[]): ShapeList<T>;

  // Straight edges (also straight B-spline edges, such as the edges of a chamfer)
  // ShapeList.lines (method)
  lines(): ShapeList<T>;

  // Circular edges (full circles and arcs)
  // ShapeList.circles (method)
  circles(): ShapeList<T>;

  // Planar faces (also flat B-spline faces)
  // ShapeList.planar (method)
  planar(): ShapeList<T>;

  // Cylindrical faces
  // ShapeList.cylinders (method)
  cylinders(): ShapeList<T>;

  // Straight edges along `axis`, or planar faces whose normal is along `axis`
  // ShapeList.parallelTo (method)
  parallelTo(axis: Axis | VectorLike): ShapeList<T>;

  // Straight edges perpendicular to `axis`, or planar faces containing it
  // ShapeList.perpendicularTo (method)
  perpendicularTo(axis: Axis | VectorLike): ShapeList<T>;

  // Faces whose outward normal points along `direction` (within `maxAngle` degrees)
  // Remarks: A curved face counts only when its normal does so everywhere on the face: the wall of a hole or a boss faces no direction, and a fillet only with a `maxAngle` that takes in all its normals.
  // ShapeList.facing (method)
  facing(direction: Axis | VectorLike, maxAngle?: number): ShapeList<T>;

  // Edges on outside corners (material angle below 180 degrees), and the outside corners of a sketch (vertices where the region's angle is below 180 degrees)
  // ShapeList.convex (method)
  convex(): ShapeList<T>;

  // Edges on inside corners (material angle above 180 degrees), and the inside corners of a sketch
  // ShapeList.concave (method)
  concave(): ShapeList<T>;

  // Edges where two faces meet tangentially, such as the borders of a fillet, and the vertices of a sketch where two edges meet tangentially
  // ShapeList.smooth (method)
  smooth(): ShapeList<T>;

  // The edges of the list and the edges that continue them tangentially (see `Edge.tangentChain`)
  // ShapeList.tangentChain (method)
  tangentChain(): ShapeList<Edge>;

  // Edges whose two faces meet at least tangentially all along them ("G1" or "G2" by `Edge.continuity`)
  // ShapeList.g1 (method)
  g1(): ShapeList<T>;

  // Edges whose two faces meet with equal curvature as well ("G2" by `Edge.continuity`)
  // ShapeList.g2 (method)
  g2(): ShapeList<T>;

  // Fillet faces
  // ShapeList.fillets (method)
  fillets(maxRadius?: number | null): ShapeList<T>;

  // The faces (or bodies) of the list that a ray meets, nearest first
  // Remarks: The ray starts at `origin` and runs along `direction` (an axis or a vector); an axis alone is a ray from its origin along its direction. A ray through an edge meets the faces on both sides of it.
  // ShapeList.hitBy (method)
  hitBy(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): ShapeList<T>;

  // Shapes whose bounding box lies inside `box`
  // ShapeList.within (method)
  within(box: BoundBox): ShapeList<T>;

  // Shapes passing through `point` (vertices at, edges/faces touching it), at most `tolerance` (mm) from it
  // ShapeList.atPoint (method)
  atPoint(point: VectorLike, tolerance?: number): ShapeList<T>;

  // The faces or edges that are new since the given bodies
  // Remarks: `since` is a body (part, shell, sketch) or a list of them, or faces and edges (then only those count as old). After a Boolean, the curves along which the bodies' faces cross (`plate.fuse(boss).edges().newSince([plate, boss])`: the circle where a boss reaching into the plate meets its top; where an edge of one body lies on the other, such as the bottom edge of a boss standing on the plate, that edge is not new: `joining` finds both); after a fillet, chamfer or shell, its new faces (`rounded.faces().newSince(part)`) and their edges. smlibwasm marks every face and edge of every body it makes, and the kernel carries the marks along: a copy keeps them, both halves of a split face keep their parent's, a face merged from two keeps both. A moved, turned, mirrored or scaled copy gets new marks (it is a shape of its own). A body read from a file, and a section, have new marks everywhere, so all of them counts as new.
  // ShapeList.newSince (method)
  newSince(since: SourcesLike): ShapeList<T>;

  // The faces or edges that descend from the given shapes
  // Remarks: `plate.cut(holes).faces().derivedFrom(holes)` gives the walls of the holes; `cut.edges().derivedFrom(box.edges().top())` the pieces of the top edges of a box that a slot cut. A body's faces and edges are marked as described in `newSince`.
  // ShapeList.derivedFrom (method)
  derivedFrom(...shapes: SourcesLike[]): ShapeList<T>;

  // The edges that lie on the surfaces of both `a` and `b`
  // Remarks: Each edge is tested at a quarter, half and three quarters of the way along it: there it lies on a face of a body (within the edge's tolerance, at least 1e-6 of the bodies' size) where `Part.classify` puts it on the body's surface. Edges of a merged face (a face of each body lying in one plane, merged by a union) are not on both surfaces and are not taken.
  // ShapeList.joining (method)
  joining(a: SourcesLike, b: SourcesLike): ShapeList<T>;

  // The faces that lie between two cells of a merged part (see `Part.merge`)
  // ShapeList.shared (method)
  shared(): ShapeList<T>;

  // The shapes of both lists, each once (Python's `|`)
  // ShapeList.union (method)
  union(other: Iterable<T>): ShapeList<T>;

  // The shapes not in `other` (Python's `-`)
  // ShapeList.difference (method)
  difference(other: Iterable<T>): ShapeList<T>;

  // The shapes also in `other` (Python's `&`)
  // ShapeList.intersection (method)
  intersection(other: Iterable<T>): ShapeList<T>;

  // The vertices of all the shapes, each once
  // ShapeList.vertices (method)
  vertices(): ShapeList<Vertex>;

  // The edges of all the shapes, each once
  // ShapeList.edges (method)
  edges(): ShapeList<Edge>;

  // The faces of all the shapes, each once
  // ShapeList.faces (method)
  faces(): ShapeList<Face>;

  // The wires of all the shapes
  // ShapeList.wires (method)
  wires(): ShapeList<Wire>;

  // Average of the members' centers
  // ShapeList.center (method)
  center(): Vector;

  // The box around all the shapes
  // ShapeList.bbox (method)
  bbox(): BoundBox;

  // Each shape moved by a location
  // ShapeList.moved (method)
  moved(location: Location): ShapeList<T>;

  // Every shape placed onto a plane or face (see `Shape.on`)
  // ShapeList.on (method)
  on(target: Plane | Face | Location | ShapeList<Face> | Sketch): ShapeList<T>;

  // Each shape moved by `(x, y, z)`
  // ShapeList.translate (method)
  translate(x?: number | VectorLike, y?: number, z?: number): ShapeList<T>;

  // Each shape rotated about an axis by `angle` degrees
  // ShapeList.rotate (method)
  rotate(axis?: Axis, angle?: number): ShapeList<T>;

  // Returns a string representation of an array
  // ShapeList.toString (method)
  toString(): string;

  // ShapeList.[inspect] (method)
  [inspect](): string;

// A sheet body
Shell: export declare class Shell extends _Body

  // The sheet of a NURBS surface given by its data
  // Shell.fromNurbs (method)
  static fromNurbs(nurbs: NurbsSurface | {
          readonly degrees: readonly [
              number,
              number
          ];
          readonly knots: readonly [
              readonly number[],
              readonly number[]
          ];
          readonly points: readonly (readonly VectorLike[])[];
          readonly weights?: readonly (readonly number[])[] | null;
      }): Shell;

  // The total area of the faces
  readonly area: number

  // The center of the faces' area (each face weighted by its area)
  // Shell.center (method)
  center(): Vector;

  // Turn the sheet into a solid of `thickness` (along the face normals
  // Remarks: The kernel step runs in the probe worker, so that a crash of its offset code throws a ModelingError, and is stopped after `GUARD_SECONDS` (20 s), as for `Part.shell`. Where the kernel's extended offset mode fails on a sheet whose faces meet tangentially at every edge, its other mode, which builds the same solid there, is tried.
  // Shell.thicken (method)
  thicken(thickness: number, options?: {
          both?: boolean;
      }): Part;

  // The sheet moved by `distance` along its face normals (a negative distance against them)
  // Remarks: Results the kernel gets wrong (no faces, faces closer to the sheet than `distance`, on its other side, or nowhere at that distance from it) throw a ModelingError; so does an offset beyond the radius of a concave curvature. The kernel step runs in the probe worker, as for `thicken`.
  // Shell.offset (method)
  offset(distance: number): Shell;

  // Cut the sheet along curves that lie on it, and keep one side, or both as faces of their own
  // Shell.trim (method)
  trim(curves: Edge | Wire | Iterable<Edge | Wire>, keep: VectorLike | string): this;
  //   curves: Edges or wires on the sheet
  //   keep: A point on the side to keep, or near it (not on a curve)

  // The sheet turned over
  // Remarks: `thicken` then grows to the other side, and the `sides` of `surfaceFillet` count from the new normals. A sheet that encloses a volume (the face of a whole sphere) faces outward whichever way its surface runs: it cannot be turned over (RangeError).
  // Shell.flipped (method)
  flipped(): this;

  // The sheet (of one face) grown past its sides
  // Shell.extend (method)
  extend(distance: number, options?: {
          sides?: Edge | Iterable<Edge> | null;
          continuity?: 'natural' | 'G1' | 'G2';
      }): this;
  //   distance: How far past each side, measured along the surface
  //   options: `sides`

  // The sheet with an edge moved onto a curve
  // Shell.matchEdge (method)
  matchEdge(edge: Edge, target: Edge | Wire, options?: {
          extent?: number;
      }): Shell;
  //   edge: An edge of the sheet, a whole side of its face
  //   target: The curve to run along (an edge, or a wire whose edges join end to end), either way round
  //   options: `extent`

  // The sheet with two faces made one
  // Shell.mergeFaces (method)
  mergeFaces(a: Face, b: Face): Shell;
  //   a: A face of the sheet, bounded by the four sides of its surface (no holes, no trimmed borders)
  //   b: Another such face, sharing one whole side with `a` (and no other)

  // Push or pull a face of the sheet at a point
  // Shell.push (method)
  push(face: Face, at: VectorLike, options?: PushOptions): Shell;

  // Raise or sink a region of a face of the sheet
  // Shell.warp (method)
  warp(face: Face, region: RegionLike, by: number | VectorLike, options?: {
          continuity?: 'crease' | 'G1' | 'G2';
      }): Shell;

  // Press a region of a face of the sheet onto a plane
  // Shell.flatten (method)
  flatten(face: Face, region: RegionLike, plane: Plane | Face, options?: {
          continuity?: 'crease' | 'G1' | 'G2';
      }): Shell;

  // Union with other sheets (Python's `+`)
  // Shell.fuse (method)
  fuse(...others: (Shell | Part | Face | Iterable<Shell | Part | Face>)[]): Shell;

  // The sheet trimmed by parts
  // Shell.cut (method)
  cut(...others: (Part | Sketch | Iterable<Part | Sketch>)[]): Shell;

  // The sheet trimmed by parts
  // Shell.intersect (method)
  intersect(...others: (Part | Sketch | Iterable<Part | Sketch>)[]): Shell;

  // Shell.toString (method)
  toString(): string;

// A planar region (with holes, possibly several pieces) on a plane
// Remarks: Sketch constructors build in the world XY plane around the origin; place a sketch with `.on(planeOrFace)`, `plane.mul(sketch)` or `Pos(...).mul(sketch)`. Combine sketches with `fuse`, `cut`, `intersect` and `xor`, change them with `offset`, `fillet`, `chamfer` and `mirror`, then turn them into parts with `extrude`, `revolve`, `sweep` or `loft`. Outlines that are awkward as combinations of shapes are drawn with `Profile`.
Sketch: export declare class Sketch extends Shell

  // The sketch turned over
  // Sketch.flipped (method)
  flipped(): this;

  // The sketch plane
  readonly plane: Plane

  // The union with other sketches (Python's `+`)
  // Sketch.fuse (method)
  fuse(...others: (Sketch | Iterable<Sketch>)[]): Sketch;

  // The region less other sketches (Python's `-`)
  // Sketch.cut (method)
  cut(...others: (Sketch | Iterable<Sketch>)[]): Sketch;

  // The region common to this and other sketches (Python's `&`)
  // Sketch.intersect (method)
  intersect(...others: (Sketch | Iterable<Sketch>)[]): Sketch;

  // The region in exactly one of the sketches (Python's `^`)
  // Sketch.xor (method)
  xor(...others: (Sketch | Iterable<Sketch>)[]): Sketch;

  // Area centroid of the region
  // Sketch.center (method)
  center(): Vector;

  // Total length of the boundary
  readonly perimeter: number

  // Area, centroid and second moments of area of the region (a beam's or an extrusion's profile)
  // Remarks: Integrated as the mass properties of a thin slab of the region (to `ACCURACY` of the largest moment), less the slab's own thickness term.
  // Sketch.sectionProperties (method)
  sectionProperties(): SectionProperties;

  // Grow (positive `distance`) or shrink (negative) the region
  // Remarks: `corners` shapes the corners that the offset pulls apart (convex ones when growing, concave ones when shrinking): "round" (arcs of radius |distance|), "sharp" (the sides extended until they meet) or "chamfer" (a straight cut across). Lines stay lines and arcs stay arcs. Parts that grow into each other merge, parts that get too thin vanish; shrinking away the whole region throws ModelingError. `round: false` is the older spelling of `corners: "sharp"`.
  // Sketch.offset (method)
  offset(distance: number, options?: {
          corners?: 'round' | 'sharp' | 'chamfer';
      }): Sketch;

  // Round corners of the region with tangent arcs of `radius`
  // Remarks: `vertices`: the corners to round, as vertices of this sketch (a selection such as `s.vertices().concave()`) or points; null rounds every sharp corner. Corners between lines and arcs are rounded exactly; next to a spline or an ellipse the arc's center lies at `radius` from both curves (where their offsets meet), and the curves are cut where it touches them. A corner that does not fit, a point that is not a corner, or a smooth corner throws ModelingError.
  // Sketch.fillet (method)
  fillet(radius: number, vertices?: VectorLike | Vertex | Iterable<VectorLike | Vertex> | null): Sketch;

  // Bevel corners of the region
  // Sketch.chamfer (method)
  chamfer(length: number, vertices?: VectorLike | Vertex | Iterable<VectorLike | Vertex> | null): Sketch;

  // A mirrored copy
  // Remarks: Lines stay lines and arcs stay arcs. The sketch keeps facing the same way when the mirror is an axis in its own plane, so the mirrored profile extrudes to the same side.
  // Sketch.mirror (method)
  mirror(plane?: Plane | Face | Axis | ShapeList<Face>): this;

  // Extrude the region into a solid
  // Remarks: With a taper (degrees; positive narrows the solid away from the sketch, holes widen) the walls are drafted planes, cones and cylinders (as `Part.draft` makes them), B-spline surfaces where the profile has other curves. `corners` shapes the corners the taper pulls apart (convex ones of an outward taper, concave ones of an inward one): 'sharp' (the walls extended until they meet) or 'round' (rounded off, as an offset rounds them). With a taper only the normal (either way) is taken as `direction`: a taper drafts the walls about the normal, so a direction across it throws a RangeError.
  // Sketch.extrude (method)
  extrude(amount: number, options?: ExtrudeOptions): Part;
  //   amount: Distance along the sketch normal (negative goes the other way)

  // Revolve the region about an axis in its plane
  // Remarks: The default axis is the sketch's local Y axis through its plane origin. For the centered constructors (`Rectangle`, `Circle`, ...) and for `makeFace` that origin is the middle of the region, so pass `axis` unless the sketch was drawn beside its origin (`Polygon([10, 0], [20, 0], ...)`). A negative `angle` turns the other way. The axis must not cross the region (ModelingError).
  // Sketch.revolve (method)
  revolve(axis?: Axis | null, angle?: number): Part;

  // Sweep the region along a path (see `sweep`
  // Sketch.sweep (method)
  sweep(path: Edge | Wire, options?: {
          orient?: boolean;
          translational?: boolean;
          sharpCorners?: boolean | null;
          up?: Axis | VectorLike | string | null;
          twist?: number | ((s: number) => number);
          scale?: readonly [
              number,
              number
          ] | readonly (readonly [
              number,
              number
          ])[] | ((s: number) => number) | null;
          anchor?: 'center' | 'origin' | VectorLike | Vertex;
      }): Part;

  // Swing the region around an outline
  // Sketch.swing (method)
  swing(outline: Sketch | Face | Wire | Edge): Part;

  // Sketch.toString (method)
  toString(): string;

// A point
Vertex: export declare class Vertex extends Shape

  // Vertex.constructor (constructor)
  constructor(x?: number | VectorLike, y?: number, z?: number);

  // Where the vertex is
  readonly point: Vector

  // The vertex's x coordinate
  readonly x: number

  // The vertex's y coordinate
  readonly y: number

  // The vertex's z coordinate
  readonly z: number

  // How far the edges and faces that meet at this vertex may pass from its point
  readonly tolerance: number

  // Where the vertex is (as `point`)
  // Vertex.center (method)
  center(): Vector;

  // A box of size 0 at the vertex
  // Vertex.bbox (method)
  bbox(): BoundBox;

  // This vertex, in a list
  // Vertex.vertices (method)
  vertices(): ShapeList<Vertex>;

  // The edges of the body that meet at this vertex (none for a vertex of no body)
  // Vertex.edges (method)
  edges(): ShapeList<Edge>;

  // The faces of the body that meet at this vertex (none for a vertex of no body)
  // Vertex.faces (method)
  faces(): ShapeList<Face>;

  // The distance to a point or to a shape
  // Vertex.distanceTo (method)
  distanceTo(other: VectorLike | Shape): number;

  // For a corner of a sketch
  readonly convexity: string

  // Vertex.equals (method)
  equals(other: unknown): boolean;

  // Vertex.[Symbol.iterator] (method)
  [Symbol.iterator](): IterableIterator<number>;

  // Vertex.toString (method)
  toString(): string;
