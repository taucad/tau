# @classcad/smlibwasm — Classes (2)

16 top-level symbols. Signatures are verbatim typescript.

// A list of shapes with selection helpers
// Remarks: Every selector returns a new ShapeList, so selectors chain: part.edges().parallelTo(Z).maxBy(X) part.faces().planar().facing(Z.neg()) A one-element list can be used wherever a single shape is expected (`sketch.on(part.faces().top())`). Use `one()` to require exactly one.
ShapeList: export declare class ShapeList<T = Shape> extends Array<T>

  // The only element
  // ShapeList.one (method)
  one(): T;

  readonly first: T

  readonly last: T

  // Sort by position along an axis, by "length"/"area"/"volume"/"radius", or by any function of a shape
  // ShapeList.sortBy (method)
  sortBy(key?: SortKey, reverse?: boolean): ShapeList<T>;

  // `parallelTo(axis)`, `ofType(name)` or `filter(predicate)`, depending on the argument
  // ShapeList.filterBy (method)
  filterBy(criterion: Axis | string | ((s: T) => boolean)): ShapeList<T>;

  // ShapeList.sortByDistance (method)
  sortByDistance(point: VectorLike, reverse?: boolean): ShapeList<T>;

  // Group shapes with equal key (within `tol`), groups in ascending key order
  // ShapeList.groupBy (method)
  groupBy(key?: SortKey, tol?: number): ShapeList<T>[];

  // The shapes with the largest key (all of them, if several tie)
  // ShapeList.maxBy (method)
  maxBy(key?: SortKey, tol?: number): ShapeList<T>;

  // The shapes with the smallest key (all of them, if several tie)
  // ShapeList.minBy (method)
  minBy(key?: SortKey, tol?: number): ShapeList<T>;

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

  // Shapes passing through `point` (vertices at, edges/faces touching it)
  // ShapeList.atPoint (method)
  atPoint(point: VectorLike, tol?: number): ShapeList<T>;

  // The shapes of both lists, each once (Python's `|`)
  // ShapeList.union (method)
  union(other: Iterable<T>): ShapeList<T>;

  // The shapes not in `other` (Python's `-`)
  // ShapeList.difference (method)
  difference(other: Iterable<T>): ShapeList<T>;

  // The shapes also in `other` (Python's `&`)
  // ShapeList.intersection (method)
  intersection(other: Iterable<T>): ShapeList<T>;

  // ShapeList.vertices (method)
  vertices(): ShapeList<Vertex>;

  // ShapeList.edges (method)
  edges(): ShapeList<Edge>;

  // ShapeList.faces (method)
  faces(): ShapeList<Face>;

  // ShapeList.wires (method)
  wires(): ShapeList<Wire>;

  // Average of the members' centers
  // ShapeList.center (method)
  center(): Vector;

  // ShapeList.bbox (method)
  bbox(): BoundBox;

  // ShapeList.moved (method)
  moved(location: Location): ShapeList<T>;

  // Every shape placed onto a plane or face (see `Shape.on`)
  // ShapeList.on (method)
  on(target: unknown): ShapeList<T>;

  // ShapeList.translate (method)
  translate(x?: number | VectorLike, y?: number, z?: number): ShapeList<T>;

  // ShapeList.rotate (method)
  rotate(axis?: Axis, angle?: number): ShapeList<T>;

  // Returns a string representation of an array
  // ShapeList.toString (method)
  toString(): string;

  // ShapeList.[inspect] (method)
  [inspect](): string;

// A sheet body
Shell: export declare class Shell extends _Body

  readonly area: number

  // Center of mass (centroid) of the shape
  // Shell.center (method)
  center(): Vector;

  // Turn the sheet into a solid of `thickness` (along the face normals
  // Shell.thicken (method)
  thicken(thickness: number, options?: {
          both?: boolean;
      }): Part;

  // Union with other sheets (Python's `+`)
  // Shell.fuse (method)
  fuse(...others: unknown[]): Shell;

  // Shell.toString (method)
  toString(): string;

// A planar region (with holes, possibly several pieces) on a plane
// Remarks: Sketch constructors build in the world XY plane around the origin; place a sketch with `.on(planeOrFace)`, `plane.mul(sketch)` or `Pos(...).mul(sketch)`. Combine sketches with `fuse`, `cut`, `intersect` and `xor`, change them with `offset`, `fillet`, `chamfer` and `mirror`, then turn them into parts with `extrude`, `revolve`, `sweep` or `loft`. Outlines that are awkward as combinations of shapes are drawn with `Profile`.
Sketch: export declare class Sketch extends Shell

  // The sketch plane
  readonly plane: Plane

  // The union with other sketches (Python's `+`)
  // Sketch.fuse (method)
  fuse(...others: unknown[]): Sketch;

  // The region less other sketches (Python's `-`)
  // Sketch.cut (method)
  cut(...others: unknown[]): Sketch;

  // The region common to this and other sketches (Python's `&`)
  // Sketch.intersect (method)
  intersect(...others: unknown[]): Sketch;

  // The region in exactly one of the sketches (Python's `^`)
  // Sketch.xor (method)
  xor(...others: unknown[]): Sketch;

  // Area centroid of the region
  // Sketch.center (method)
  center(): Vector;

  // Total length of the boundary
  readonly perimeter: number

  // Grow (positive `distance`) or shrink (negative) the region
  // Remarks: `corners` shapes the corners that the offset pulls apart (convex ones when growing, concave ones when shrinking): "round" (arcs of radius |distance|), "sharp" (the sides extended until they meet) or "chamfer" (a straight cut across). Lines stay lines and arcs stay arcs. Parts that grow into each other merge, parts that get too thin vanish; shrinking away the whole region throws ModelingError. `round: false` is the older spelling of `corners: "sharp"`.
  // Sketch.offset (method)
  offset(distance: number, options?: {
          corners?: string;
          round?: boolean | null;
      }): Sketch;

  // Round corners of the region with tangent arcs of `radius`
  // Remarks: `vertices`: the corners to round, as vertices of this sketch (a selection such as `s.vertices().concave()`) or points; null rounds every sharp corner. Corners between lines and arcs are rounded exactly; a corner that does not fit, a point that is not a corner, or a smooth corner throws ModelingError.
  // Sketch.fillet (method)
  fillet(radius: number, vertices?: Iterable<VectorLike | Vertex> | null): Sketch;

  // Bevel corners of the region
  // Sketch.chamfer (method)
  chamfer(length: number, vertices?: Iterable<VectorLike | Vertex> | null): Sketch;

  // A mirrored copy
  // Remarks: Lines stay lines and arcs stay arcs. The sketch keeps facing the same way when the mirror is an axis in its own plane, so the mirrored profile extrudes to the same side.
  // Sketch.mirror (method)
  mirror(plane?: Plane | Face | Axis | ShapeList<Face>): this;

  // Extrude the region into a solid
  // Sketch.extrude (method)
  extrude(amount: number, options?: ExtrudeOptions): Part;
  //   amount: Distance along the sketch normal (negative goes the other way)

  // Revolve the region about an axis in its plane
  // Remarks: The default axis is the sketch's local Y axis through its plane origin. For the centered constructors (`Rectangle`, `Circle`, ...) and for `makeFace` that origin is the middle of the region, so pass `axis` unless the sketch was drawn beside its origin (`Polygon([10, 0], [20, 0], ...)`). A negative `angle` turns the other way. The axis must not cross the region (ModelingError).
  // Sketch.revolve (method)
  revolve(axis?: Axis | null, angle?: number): Part;

  // Sweep the region along a path
  // Sketch.sweep (method)
  sweep(path: Edge | Wire, options?: {
          sharpCorners?: boolean | null;
      }): Part;

  // Sketch.toString (method)
  toString(): string;

// A point
Vertex: export declare class Vertex extends Shape

  // Vertex.constructor (constructor)
  constructor(x?: number | VectorLike, y?: number, z?: number);

  readonly point: Vector

  readonly x: number

  readonly y: number

  readonly z: number

  // Center of mass (centroid) of the shape
  // Vertex.center (method)
  center(): Vector;

  // Tight axis-aligned bounding box
  // Vertex.bbox (method)
  bbox(): BoundBox;

  // All vertices of this shape
  // Vertex.vertices (method)
  vertices(): ShapeList<Vertex>;

  // All edges of this shape
  // Vertex.edges (method)
  edges(): ShapeList<Edge>;

  // All faces of this shape
  // Vertex.faces (method)
  faces(): ShapeList<Face>;

  // Minimum distance to a point (and, for bodies, to another body)
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

// A chain of edges, open or closed
Wire: export declare class Wire extends Shape

  // Wire.constructor (constructor)
  constructor(edges: Edge | Wire | Iterable<Edge | Wire | Iterable<Edge | Wire>>, options?: {
          sort?: boolean;
      });
  //   edges: All edges of this shape

  // All edges of this shape
  // Wire.edges (method)
  edges(): ShapeList<Edge>;

  // All vertices of this shape
  // Wire.vertices (method)
  vertices(): ShapeList<Vertex>;

  // All wires (closed edge loops of faces, or the shape itself if it is a wire)
  // Wire.wires (method)
  wires(): ShapeList<Wire>;

  readonly isClosed: boolean

  readonly start: Vector

  readonly end: Vector

  readonly length: number

  // Length-weighted average of the edge midpoints
  // Wire.center (method)
  center(): Vector;

  // Tight axis-aligned bounding box
  // Wire.bbox (method)
  bbox(): BoundBox;

  // Point at fraction `t` of the total length
  // Wire.pointAt (method)
  pointAt(t?: number): Vector;

  // Wire.tangentAt (method)
  tangentAt(t?: number): Vector;

  // Minimum distance to a point (and, for bodies, to another body)
  // Wire.distanceTo (method)
  distanceTo(point: VectorLike | Shape): number;

  // This wire closed with a straight line from its end to its start
  // Wire.close (method)
  close(): Wire;

  // Wire.reversed (method)
  reversed(): Wire;

  // A wire of this one and the other (Python's `+`)
  // Wire.add (method)
  add(other: Edge | Wire): Wire;

  // The plane of a planar wire (normal by the right-hand rule along the wire)
  // Wire.plane (method)
  plane(): Plane;

  // Round the corners between straight edges with tangent arcs (planar wires)
  // Wire.fillet (method)
  fillet(radius: number, vertices?: Iterable<VectorLike | Vertex> | null): Wire;

  // The planar region bounded by this closed wire
  // Wire.toSketch (method)
  toSketch(): Sketch;

  // Wire.toString (method)
  toString(): string;

// An indexed triangle mesh
// Remarks: - `vertices`: positions, x, y, z for each vertex (`Float64Array`). - `triangles`: three vertex indices for each triangle, counterclockwise seen from outside (`Uint32Array`). - `normals`: optional corner normals, three for each triangle (nine numbers per triangle, `Float32Array`), used for shading crisp CAD edges.
Mesh: export declare class Mesh

  vertices: Float64Array

  triangles: Uint32Array

  normals: Float32Array | null

  // Mesh.constructor (constructor)
  constructor(vertices: ArrayLike<number>, triangles: ArrayLike<number>, normals?: ArrayLike<number> | null, _poly?: PolyHandle | null);

  // The number of triangles (Python's `len(mesh)`)
  readonly length: number

  // One unit normal per triangle (x, y, z each)
  readonly triangleNormals: Float64Array

  readonly area: number

  // Enclosed volume (meaningful for closed meshes)
  readonly volume: number

  // Mesh.bbox (method)
  bbox(): BoundBox;

  // Mesh.center (method)
  center(): Vector;

  // Where a ray meets the mesh's triangles, nearest first (`Hit`
  // Mesh.raycast (method)
  raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit[];

  // True if every edge of the mesh is shared by exactly two triangles (a watertight mesh)
  // Mesh.isClosed (method)
  isClosed(): boolean;

  // The kernel's mesh union (Python's `+`)
  // Mesh.fuse (method)
  fuse(other: Mesh): Mesh;

  // The kernel's mesh difference (Python's `-`)
  // Mesh.cut (method)
  cut(other: Mesh): Mesh;

  // The kernel's mesh intersection (Python's `&`)
  // Mesh.intersect (method)
  intersect(other: Mesh): Mesh;

  // Write the mesh to a file (stl, obj, glb, ...
  // Mesh.export (method)
  export(path: string, options?: Record<string, unknown>): void;

  // Mesh.toString (method)
  toString(): string;

  // Mesh.[inspect] (method)
  [inspect](): string;

// A pen that draws an outline in the XY plane, segment by segment
// Remarks: Start it at a point with a heading (degrees counterclockwise from +X), then move: const section = new Profile([0, 0]) .lineTo(12, 0).lineTo({ y: 4 }).fillet(1.5) .lineTo({ x: 6 }).lineTo({ y: 20 }).chamfer(1) .lineTo({ x: 0 }) .close() // a Sketch: extrude or revolve it Moves: `lineTo` (to a point, or to an x or y), `lineBy` (by an offset), `forward` (along the heading, or until x or y reaches a value), `arc` (tangent, by radius and angle; a positive angle turns left), `arcTo` (tangent to an end point, or through a point). `turn`/`turnTo` change the heading without drawing. `fillet` and `chamfer` round or bevel the corner at the pen, between the segment before and the segment after. `mirror(axis)` adds the mirror image of the path drawn so far. `close()` makes the region, `wire()` the open path. Each call returns a new Profile; `point` and `heading` tell where the pen is. Errors name the segment (the call that drew it) and the numbers that do not fit.
Profile: export declare class Profile

  // Profile.constructor (constructor)
  constructor(start?: VectorLike | {
          heading?: number;
      }, options?: {
          heading?: number;
      });

  // Where the pen is
  readonly point: Vector

  // Where the drawing started
  readonly start: Vector

  // The direction the pen moves in, degrees counterclockwise from +X (-180 to 180)
  readonly heading: number

  // The number of segments drawn (Python's `len(profile)`)
  readonly length: number

  // A straight line to a point
  // Profile.lineTo (method)
  lineTo(...args: (number | VectorLike | Coordinates)[]): Profile;

  // A straight line by an offset from the pen
  // Profile.lineBy (method)
  lineBy(dx?: number | VectorLike, dy?: number): Profile;

  // A straight line along the heading
  // Profile.forward (method)
  forward(length?: number | null | Coordinates, options?: Coordinates): Profile;

  // Turn the heading by `angle` degrees (positive
  // Profile.turn (method)
  turn(angle: number): Profile;

  // Set the heading (degrees counterclockwise from +X) without drawing
  // Profile.turnTo (method)
  turnTo(heading: number): Profile;

  // A tangent arc of `radius` that turns the heading by `angle` degrees
  // Profile.arc (method)
  arc(radius: number, angle: number): Profile;

  // An arc to an end point
  // Profile.arcTo (method)
  arcTo(...args: (number | VectorLike | {
          through?: VectorLike | null;
      })[]): Profile;

  // Round the corner at the pen with a tangent arc of `radius`
  // Profile.fillet (method)
  fillet(radius: number): Profile;

  // Bevel the corner at the pen
  // Profile.chamfer (method)
  chamfer(length: number): Profile;

  // Continue with the mirror image of the path drawn so far, so that the whole outline is symmetric about `axis` (an axis in the XY plane
  // Profile.mirror (method)
  mirror(axis: Axis): Profile;

  // The region inside the outline, as a Sketch on XY
  // Profile.close (method)
  close(options?: {
          align?: AlignLike;
      }): Sketch;

  // The path as drawn, as an open Wire of exact lines and arcs (a sweep path, or a centerline for Stroke)
  // Profile.wire (method)
  wire(): Wire;

  // Profile.toString (method)
  toString(): string;

  // Profile.[inspect] (method)
  [inspect](): string;

// One font
Font: export declare class Font

  // The font file (null for a font given as bytes)
  readonly path: string | null

  // The full name of the font ("Lato Regular")
  readonly name: string

  readonly unitsPerEm: number

  readonly numGlyphs: number

  // Height of the capital letters in font units
  readonly capHeight: number

  // Font.constructor (constructor)
  constructor(source: string | Uint8Array);

  // Font.toString (method)
  toString(): string;

  // The glyph of a character, or null when the font has none for it
  // Font.glyphIndex (method)
  glyphIndex(char: string): number | null;

  // Every character the font maps to a glyph
  // Font.characters (method)
  characters(): string[];

  // Advance width of a glyph in font units
  // Font.advance (method)
  advance(glyph: number): number;

  // The kerning of two neighbouring glyphs
  // Font.kerning (method)
  kerning(left: number, right: number): PairAdjustment;

  // "GPOS", "kern" or null
  readonly kerningSource: string | null

  // The contours of a glyph in font units (empty for a space)
  // Font.outline (method)
  outline(glyph: number): Contour[];

// The data is not a font this reader can use (Python's FontError, a ValueError)
FontError: export declare class FontError extends RangeError

  // FontError.constructor (constructor)
  constructor(message: string);

// A list of locations
Locations: export declare class Locations extends Array<Location>

  static readonly [Symbol.species]: ArrayConstructor

  // Locations.constructor (constructor)
  constructor(...items: unknown[]);

  // Each location applied to something
  // Locations.mul (method)
  mul(other: Location | Locations): Locations;
  mul<T>(other: Shape | Iterable<T>): ShapeList<Any>;

  // The pattern moved by a location (`location.mul(pattern)`)
  // Locations.moved (method)
  moved(location: Location): Locations;

  // The pattern placed onto a plane or face
  // Locations.on (method)
  on(target: unknown): Locations;

  readonly points: Vector[]

  // Returns a string representation of an array
  // Locations.toString (method)
  toString(): string;

  // Locations.[inspect] (method)
  [inspect](): string;

// A grid of control points around a part for free-form deformation (exact results)
// Remarks: The points start evenly spaced over a box (`counts` points per direction, corners included). Move them, then `apply` the lattice to a part: space inside the box moves smoothly with the points (a Bezier volume; space outside the box follows the same polynomial). A lattice whose points were not moved changes nothing. `points` holds the world positions, `points[i][j][k]` = `[x, y, z]`, indexed along X, Y and Z; the arrays are writable: `lat.points[1][1][2][2] += 5` lifts one point. `move`, `scale` and `rotate` take a selection `[i, j, k]` of numbers (negative ones count from the end), `null` for all (Python's `:`) and arrays of numbers, or `layer(...)`; they change the lattice in place and return it.
Lattice: export declare class Lattice

  // The world positions of the points, `points[i][j][k]` = `[x, y, z]` (writable)
  points: number[][][][]

  // Lattice.constructor (constructor)
  constructor(box: BoundBox | {
          bbox(): BoundBox;
      }, counts?: number | readonly number[], options?: {
          margin?: number;
      });
  //   box: A BoundBox, or a shape whose bounding box is used
  //   counts: Points per direction, one number or three, 2 to 12
  //   options: `margin`

  // Points per direction (X, Y, Z)
  readonly counts: [number, number, number]

  // The box the points started on
  readonly box: BoundBox

  // The starting positions (read-only)
  readonly rest: readonly (readonly (readonly (readonly number[])[])[])[]

  // How far each point was moved (`points - rest`)
  readonly offsets: number[][][][]

  // The points of one layer across an axis, as a selection
  // Lattice.layer (method)
  layer(axis: Axis | string, index: number): [LatticeLayers, LatticeLayers, LatticeLayers];

  // Move the selected points by `offset`
  // Lattice.move (method)
  move(index: LatticeIndex, offset: VectorLike): this;

  // Scale the selected points about `center` (default
  // Lattice.scale (method)
  scale(index: LatticeIndex, factor: number | VectorLike, center?: VectorLike | null): this;

  // Turn the selected points by `angle` degrees about `axis`
  // Lattice.rotate (method)
  rotate(index: LatticeIndex, axis: Axis, angle: number): this;

  // Put every point back where it started
  // Lattice.reset (method)
  reset(): this;

  // An independent copy
  // Lattice.copy (method)
  copy(): Lattice;

  // Where the lattice moves a point
  // Lattice.map (method)
  map(point: VectorLike): Vector;

  // Deform a part (or a shell) with the lattice
  // Remarks: The result is exact unless a face's image needs a degree above `MAX_DEGREE`; such faces are within `tolerance`. Throws a ModelingError when the lattice folds the part onto itself (a point moved past its neighbours).
  // Lattice.apply (method)
  apply(shape: Part, options?: {
          tolerance?: number | null;
      }): Part;
  apply(shape: Shell, options?: {
          tolerance?: number | null;
      }): Shell;

  // Lattice.toString (method)
  toString(): string;

// One bend of a sheet metal part
// Remarks: `angle` in degrees, `radius` the inside radius, `length` the bend's extent along its axis. From `bends`, `axis` is the axis of the bend's cylinders. In a `FlatPattern`, `line` is the bend line (the middle of the bend's strip, at z = 0) and `direction` "up" or "down": where the sheet beyond the line folds to, seen from above (+Z).
Bend: export declare class Bend

  readonly angle: number

  readonly radius: number

  readonly thickness: number

  readonly kFactor: number

  readonly length: number

  readonly axis: Axis | null

  readonly line: Edge | null

  readonly direction: string | null

  // Bend.constructor (constructor)
  constructor(angle: number, radius: number, thickness: number, kFactor: number, length: number, axis?: Axis | null, line?: Edge | null, direction?: string | null);

  // The bend allowance (the width of the bend's strip in the flat)
  readonly allowance: number

  // Equal fields (Python's dataclass `==`)
  // Bend.equals (method)
  equals(other: unknown): boolean;

  // Bend.toString (method)
  toString(): string;

  // Bend.[inspect] (method)
  [inspect](): string;

// The unfolded part, laid on the XY plane
// Remarks: `outline` is the cut contour (outer boundary and holes) as a sketch at z = 0; `bends` carry the bend lines (at z = 0) with angle, radius, direction and allowance.
FlatPattern: export declare class FlatPattern

  readonly part: Part

  readonly outline: Sketch

  readonly bends: Bend[]

  readonly thickness: number

  readonly kFactor: number

  // FlatPattern.constructor (constructor)
  constructor(part: Part, outline: Sketch, bends: Bend[], thickness: number, kFactor: number);

  // The bend lines (middle of each bend's strip), at z = 0
  readonly bendLines: ShapeList<Edge>

  // Size of the blank
  readonly size: Vector

  // Equal fields (Python's dataclass `==`)
  // FlatPattern.equals (method)
  equals(other: unknown): boolean;

  // FlatPattern.toString (method)
  toString(): string;

  // FlatPattern.[inspect] (method)
  [inspect](): string;

// Everything `readStep` reads from a STEP file
StepModel: export declare class StepModel

  readonly bodies: ShapeList<Part | Shell>

  readonly frames: StepFrame[]

  readonly curves: StepCurve[]

  readonly points: StepPoint[]

  // StepModel.constructor (constructor)
  constructor(bodies: ShapeList<Part | Shell>, frames?: StepFrame[], curves?: StepCurve[], points?: StepPoint[]);

  // The coordinate system called `name` as a `Plane`
  // StepModel.frame (method)
  frame(name: string, product?: string | null): Plane;

  // StepModel.equals (method)
  equals(other: unknown): boolean;

  // StepModel.toString (method)
  toString(): string;

  // StepModel.[inspect] (method)
  [inspect](): string;

// A curve of a STEP file that belongs to no body (wireframe geometry, contours), at its place in the assembly
StepCurve: export declare class StepCurve

  readonly name: string

  readonly shape: Edge | Wire

  readonly product: string

  // [r, g, b] from 0 to 1, or null
  readonly color: readonly number[] | null

  // StepCurve.constructor (constructor)
  constructor(name: string, shape: Edge | Wire, product?: string, color?: readonly number[] | null);

  // StepCurve.equals (method)
  equals(other: unknown): boolean;

  // StepCurve.toString (method)
  toString(): string;

  // StepCurve.[inspect] (method)
  [inspect](): string;

// A coordinate system of a STEP file (a named `AXIS2_PLACEMENT_3D`) at its place in the assembly
StepFrame: export declare class StepFrame

  readonly name: string

  readonly plane: Plane

  readonly product: string

  // [r, g, b] from 0 to 1, or null
  readonly color: readonly number[] | null

  // StepFrame.constructor (constructor)
  constructor(name: string, plane: Plane, product?: string, color?: readonly number[] | null);

  // The placement that moves the world origin onto this coordinate system
  readonly location: Location

  // StepFrame.equals (method)
  equals(other: unknown): boolean;

  // StepFrame.toString (method)
  toString(): string;

  // StepFrame.[inspect] (method)
  [inspect](): string;
