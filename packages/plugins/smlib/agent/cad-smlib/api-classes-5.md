# @classcad/smlibwasm — Classes (5)

12 top-level symbols. Signatures are verbatim typescript.

// A chain of edges, open or closed
Wire: export declare class Wire extends Shape

  // Wire.constructor (constructor)
  constructor(edges: Edge | Wire | Iterable<Edge | Wire | Iterable<Edge | Wire>>, options?: {
          sort?: boolean;
      });
  //   edges: All edges of this shape

  // Frees the kernel's curves of the wire's standalone edges now (see `Edge.dispose`)
  // Wire.dispose (method)
  dispose(): void;

  // Wire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

  // The wire's edges, in order
  // Wire.edges (method)
  edges(): ShapeList<Edge>;

  // The vertices of the wire's edges, each once
  // Wire.vertices (method)
  vertices(): ShapeList<Vertex>;

  // This wire, in a list
  // Wire.wires (method)
  wires(): ShapeList<Wire>;

  // True if the wire ends where it starts
  readonly isClosed: boolean

  // The point where the wire's first edge starts
  readonly start: Vector

  // The point where the wire's last edge ends
  readonly end: Vector

  // The sum of the edges' lengths
  readonly length: number

  // Length-weighted average of the edge midpoints
  // Wire.center (method)
  center(): Vector;

  // The box along the axes around the wire
  // Wire.bbox (method)
  bbox(): BoundBox;

  // Point at fraction `t` of the total length
  // Wire.pointAt (method)
  pointAt(t?: number): Vector;

  // The direction of the wire (length 1) at `t`, a fraction of its length from its start
  // Wire.tangentAt (method)
  tangentAt(t?: number): Vector;

  // Distance to a point, or to a body (see `Part.distanceTo`)
  // Wire.distanceTo (method)
  distanceTo(point: VectorLike | Shape): number;

  // The wire cut in two at `at`, a fraction of its length or a point on it
  // Wire.split (method)
  split(at: number | VectorLike | Vertex): [
          Wire,
          Wire
      ];

  // The part of the wire from `start` to `end`, each a fraction of its length or a point on it
  // Wire.trim (method)
  trim(start: number | VectorLike | Vertex, end: number | VectorLike | Vertex): Wire;

  // Points where this wire meets `other` (see `Edge.intersections`), in order along the wire
  // Wire.intersections (method)
  intersections(other: Shape | Iterable<Shape>, options?: {
          tolerance?: number | null;
      }): Vector[];

  // The wire as one edge
  // Remarks: One edge makes a single sweep or loft rail, a single SPLINE in DXF and a single curve for `makeCompatible`. const rail = FilletPolyline([0, 0], [30, 0], [30, 20], { radius: 5 }).toEdge()
  // Wire.toEdge (method)
  toEdge(): Edge;

  // The wire moved `distance` sideways in its plane, as a parallel curve
  // Remarks: Lines stay lines and arcs stay arcs, exactly; splines and ellipses are offset within 1e-6 of the wire's size (`Edge.offset`). `corners` shapes the corners the offset pulls apart: 'round' (arcs of radius |distance|), 'sharp' (the sides extended until they meet) or 'chamfer' (a straight cut across); at the corners it pushes together, the sides are cut where they cross. Where the offset would fold over or run into itself (an edge bends more tightly than the distance, an edge vanishes, parts of the wire lie closer than the distance), a ModelingError says where; a region's offset that merges and drops parts is `Sketch.offset`. `plane`: the plane the wire lies in, whose normal tells left from right (see `Edge.offset` for the default). const wall = Polyline([0, 0], [40, 0], [40, 30]).offset(2, { corners: 'sharp' })
  // Wire.offset (method)
  offset(distance: number, options?: {
          corners?: 'round' | 'sharp' | 'chamfer';
          plane?: Plane | null;
      }): Wire;

  // The wire as lines and circular arcs within `tolerance` (see `Edge.toArcs`)
  // Wire.toArcs (method)
  toArcs(tolerance?: number): Wire;

  // The smallest radius of curvature of the wire's edges
  // Wire.minRadius (method)
  minRadius(): number;

  // Where the wire bends most tightly (`minRadius`)
  // Wire.minRadiusAt (method)
  minRadiusAt(): number;

  // The point of the wire nearest to `point`
  // Wire.closestPoint (method)
  closestPoint(point: VectorLike): Vector;

  // How the edges of the wire meet at its joints (and where a closed wire closes) (`Continuity`)
  // Wire.continuity (method)
  continuity(options?: {
          angleTolerance?: number;
          curvatureTolerance?: number;
      }): Continuity;

  // This wire closed with a straight line from its end to its start
  // Wire.close (method)
  close(): Wire;

  // The wire run the other way
  // Wire.reversed (method)
  reversed(): Wire;

  // A wire of this one and the other (Python's `+`)
  // Wire.add (method)
  add(other: Edge | Wire): Wire;

  // The plane of a planar wire (normal by the right-hand rule along the wire)
  // Wire.plane (method)
  plane(): Plane;

  // Round corners with tangent arcs of `radius`
  // Wire.fillet (method)
  fillet(radius: number, vertices?: VectorLike | Vertex | Iterable<VectorLike | Vertex> | null): Wire;

  // The planar region bounded by this closed wire
  // Wire.toSketch (method)
  toSketch(): Sketch;

  // Wire.toString (method)
  toString(): string;

Mesh: export declare class Mesh

  // The points, an array of [x, y, z]
  vertices: Float64Array

  // The triangles, as indices into `vertices`
  triangles: Uint32Array

  // A normal at each point, or null
  normals: Float32Array | null

  // Mesh.constructor (constructor)
  constructor(vertices: ArrayLike<number>, triangles: ArrayLike<number>, normals?: ArrayLike<number> | null, _poly?: PolyHandle | null);

  // The number of triangles (Python's `len(mesh)`)
  readonly length: number

  // Frees the kernel's copy of the mesh now, if it holds one (an internal tessellation can keep it)
  // Mesh.dispose (method)
  dispose(): void;

  // Mesh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

  // One unit normal per triangle (x, y, z each)
  readonly triangleNormals: Float64Array

  // The total area of the triangles
  readonly area: number

  // Enclosed volume (meaningful for closed meshes)
  readonly volume: number

  // The box along the axes around the mesh's points
  // Mesh.bbox (method)
  bbox(): BoundBox;

  // The middle of the bounding box (`centroid` is the center of mass)
  // Mesh.center (method)
  center(): Vector;

  // The center of mass of the volume a closed mesh encloses (uniform density)
  readonly centroid: Vector

  // Mass, center of mass and inertia tensor of the volume a closed mesh encloses, for a uniform `density` (as `Part.massProperties`, a `MassProperties`)
  // Remarks: Exact for the triangles: each spans a tetrahedron with a point, and their integrals add up (the divergence theorem). The mesh must be closed and face outward (ModelingError otherwise: close it with `fillHoles` or `repaired`); an empty mesh throws a RangeError.
  // Mesh.massProperties (method)
  massProperties(density?: number): MassProperties;

  // A copy placed by `location`
  // Mesh.moved (method)
  moved(location: Location): Mesh;

  // A copy moved by `(x, y, z)`
  // Mesh.translate (method)
  translate(x?: number | VectorLike, y?: number, z?: number): Mesh;

  // A copy rotated by `angle` degrees about `axis`
  // Mesh.rotate (method)
  rotate(axis?: Axis, angle?: number): Mesh;

  // A mirrored copy (reflection in `plane`, a plane or a planar face
  // Mesh.mirror (method)
  mirror(plane?: Plane | Face | Axis | ShapeList<Face>): Mesh;

  // A scaled copy
  // Mesh.scale (method)
  scale(factor: number | VectorLike, center?: VectorLike): Mesh;

  // Where a ray meets the mesh's triangles, nearest first (`Hit`
  // Mesh.raycast (method)
  raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit<null>[];

  // The first hit of each of many rays, one per ray (a `Hit` or `null`), not `raycast` many times (which gives every hit of a ray)
  // Remarks: `origins` are points; `directions` one direction (a vector or an axis) for all of them, or one each. The kernel's ray tracer sorts the triangles into a grid once per call (0.8 s for 250 000 triangles) and then takes about 0.01 ms a ray, where `raycast` tests every triangle: give all the rays in one call.
  // Mesh.raycastMany (method)
  raycastMany(origins: Iterable<VectorLike>, directions: VectorLike | Axis | Iterable<VectorLike | Axis>): (Hit<null> | null)[];

  // True if every edge of the mesh is shared by exactly two triangles (a watertight mesh)
  // Mesh.isClosed (method)
  isClosed(): boolean;

  // Where the plane cuts the mesh
  // Remarks: Of a closed mesh every loop is closed, outer loops counterclockwise seen from the plane's normal and holes clockwise (as the faces of `Part.section`); an open mesh can give open polylines too. `makeFace(loop)` makes a face of a closed loop. Points where the cut runs straight on are left out. A plane through a flat part of the mesh (the top face of a box's mesh) cuts it just beside that, on the side where the cut encloses more. Empty where the plane misses the mesh.
  // Mesh.section (method)
  section(plane?: Plane | Face): ShapeList<Wire>;

  // Sections (`section`) across `axis`, `step` apart
  // Mesh.slices (method)
  slices(step: number, axis?: Axis | VectorLike): ShapeList<Wire>[];

  // A mesh with fewer triangles, as near to this one as the kernel's quadric decimation (SmPolyDecimate) keeps it
  // Remarks: Give one of: - `fraction`: the share of the triangles to remove (`0.9` leaves a tenth). - `triangles`: about how many triangles to leave. - `tolerance`: how far the result may be from this mesh at most. The mesh is decimated step by step while the distance stays within it (measured at the points of both meshes and the middles of their triangles), so this takes a few decimations (seconds for 100 000 triangles). `featureAngle` (degrees, 0 to 180, default 30): edges where the triangles turn by more than it are features, which the decimation keeps longest, and stay sharp in the result's normals (at each corner the average of the triangles around it, except across such edges). Triangles the decimation leaves folded over (slivers facing against their neighbours) are taken out. ModelingError if a closed mesh comes back open, or an open mesh with another border (a mesh whose points all lie on its border, such as a tube of long triangles, cannot keep it), and where the kernel collapses the mesh far below the count asked (it does with the long thin triangles of a coarse mesh of a cone: mesh such a part with a larger tolerance instead). The kernel orders equal choices by memory, so the count can differ by a few triangles from run to run.
  // Mesh.decimate (method)
  decimate(fraction?: number | null, options?: {
          triangles?: number | null;
          tolerance?: number | null;
          featureAngle?: number;
      }): Mesh;

  // A copy with every hole closed
  // Mesh.fillHoles (method)
  fillHoles(): Mesh;

  // A repaired copy and what was done
  // Remarks: Returns `[mesh, report]`; the report counts `mergedVertices`, `removedTriangles`, `flippedTriangles`, `filledHoles`, `openHoles` (borders that do not close on themselves, left open) and `openEdges` (edges of the result not shared by two triangles: 0 for a closed mesh).
  // Mesh.repaired (method)
  repaired(): [
          Mesh,
          RepairReport
      ];

  // A faceted part of a closed mesh
  // Remarks: Booleans get slow as faces add up (a sphere of 14 080 triangles took 40 s to cut by a box), so a mesh that would give more than `maxFaces` faces throws a ModelingError: decimate it first (`mesh.decimate(null, { triangles: 2000 }).toPart()`), or give a larger `maxFaces` (`0`: no limit). An open mesh throws a ModelingError too (close it with `fillHoles` or `repaired`), and so does one whose part is not a valid solid or does not enclose the mesh's volume.
  // Mesh.toPart (method)
  toPart(maxFaces?: number): Part;

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
  export(path: string, options?: FileOptions): void;

  // Mesh.toString (method)
  toString(): string;

  // Mesh.[inspect] (method)
  [inspect](): string;

// What `Mesh.repaired` did
RepairReport: export declare class RepairReport

  // Points that lay on each other (to 1e-9 of the largest coordinate), merged
  readonly mergedVertices: number

  // Triangles without an area, and repeated ones, left out
  readonly removedTriangles: number

  // Triangles turned to face the way their neighbours face (a closed piece outward)
  readonly flippedTriangles: number

  // Holes filled (as `Mesh.fillHoles`)
  readonly filledHoles: number

  // Borders that do not close on themselves, left open
  readonly openHoles: number

  // Edges of the result not shared by two triangles
  readonly openEdges: number

  // RepairReport.constructor (constructor)
  constructor(mergedVertices: number, removedTriangles: number, flippedTriangles: number, filledHoles: number, openHoles: number, openEdges: number);

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
  constructor(source: string | BytesLike);

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

Locations: export declare class Locations extends Array<Location>

  static readonly [Symbol.species]: ArrayConstructor

  // Locations.constructor (constructor)
  constructor(...items: LocationLike[]);

  // Each location applied to something
  // Locations.mul (method)
  mul(other: Location | Locations): Locations;
  mul<T>(other: Shape | Iterable<T>): ShapeList<Any>;

  // The pattern moved by a location (`location.mul(pattern)`)
  // Locations.moved (method)
  moved(location: Location): Locations;

  // The pattern placed onto a plane or face
  // Locations.on (method)
  on(target: Plane | Face | Location | ShapeList<Face> | Sketch): Locations;

  // Where the locations move the origin to
  readonly points: Vector[]

  // Returns a string representation of an array
  // Locations.toString (method)
  toString(): string;

  // Locations.[inspect] (method)
  [inspect](): string;

// A grid of control points around a part for free-form deformation (exact results)
// Remarks: The points start evenly spaced over a box (`counts` points per direction, corners included). Move them, then `apply` the lattice to a part: space inside the box moves smoothly with the points (a Bezier volume; space outside the box follows the same polynomial). A lattice whose points were not moved changes nothing. A lattice is a global map, for the overall shape: every point pulls the whole box (most near itself), so one moved point changes every face it does not leave in place. For a bump or dent on one face, push or warp that face instead (`Part.push`, `Part.warp`): they change it near a point or within a region and leave the other faces as they are. `points` holds the world positions, `points[i][j][k]` = `[x, y, z]`, indexed along X, Y and Z; the arrays are writable: `lat.points[1][1][2][2] += 5` lifts one point. `move`, `scale` and `rotate` take a selection `[i, j, k]` of numbers (negative ones count from the end), `null` for all (Python's `:`) and arrays of numbers, or `layer(...)`; they change the lattice in place and return it.
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
  readonly counts: [
          number,
          number,
          number
      ]

  // The box the points started on
  readonly box: BoundBox

  // The starting positions (read-only)
  readonly rest: readonly (readonly (readonly (readonly number[])[])[])[]

  // How far each point was moved (`points - rest`)
  readonly offsets: number[][][][]

  // The points of one layer across an axis, as a selection
  // Lattice.layer (method)
  layer(axis: Axis | string, index: number): [
          LatticeLayers,
          LatticeLayers,
          LatticeLayers
      ];

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
  // Remarks: The result is exact unless a face's image needs a degree above `MAX_DEGREE`; such faces are within `tolerance`. Throws a ModelingError when the lattice folds the part onto itself (a point moved past its neighbours). An Edge or a Wire gives an Edge or a Wire (exact B-splines; lines and arcs the map only moves stay lines and arcs), points give points (as `map`); curves and points are not checked for folding.
  // Lattice.apply (method)
  apply(shape: Part, options?: {
          tolerance?: number | null;
      }): Part;
  apply(shape: Shell, options?: {
          tolerance?: number | null;
      }): Shell;
  apply(shape: Edge, options?: {
          tolerance?: number | null;
      }): Edge;
  apply(shape: Wire, options?: {
          tolerance?: number | null;
      }): Wire;
  apply(shape: VectorLike, options?: {
          tolerance?: number | null;
      }): Vector;
  apply(shape: readonly VectorLike[], options?: {
          tolerance?: number | null;
      }): Vector[];

  // Lattice.toString (method)
  toString(): string;

// How far the points given to `surface` lie from the surface (`surface(points, { report
// Remarks: The distances are true ones, to each point's closest point on the surface. (A fit's own residuals, at the parameters it gave the points, overstate how far a cloud that is not a height field lies from its surface: 18.3 where the worst point lies 7.4 from it.)
FitReport: export declare class FitReport

  // The largest distance of a point from the surface, to its closest point on it
  readonly maxDistance: number

  // The root mean square of the distances
  readonly rmsDistance: number

  // The distance of each point, in the order given (a grid's rows one after the other)
  readonly distances: number[]

  // FitReport.constructor (constructor)
  constructor(maxDistance: number, rmsDistance: number, distances: number[]);

// What `stitch` sewed (`stitch(..., { report
StitchReport: export declare class StitchReport

  // Pairs of free edges sewn into one edge
  readonly sewnEdges: number

  // Free edges left
  readonly openEdges: number

  // The widest gap closed, between vertices or edges that were sewn (0 where the pieces met exactly)
  readonly maxGap: number

  // Faces turned over so that their normals agree with their neighbours' (on open results
  readonly turnedFaces: number

  // The widest gap stitch looked for
  readonly tolerance: number

  // StitchReport.constructor (constructor)
  constructor(sewnEdges: number, openEdges: number, maxGap: number, turnedFaces: number, tolerance: number);

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
// Remarks: `outline` is the cut contour (outer boundary and holes) as a sketch at z = 0; `bends` carry the bend lines (at z = 0) with angle, radius, direction, K-factor and allowance. `kFactor` is the K-factor of every bend, or `null` where the bends have different ones (each `Bend` has its own).
FlatPattern: export declare class FlatPattern

  readonly part: Part

  readonly outline: Sketch

  readonly bends: Bend[]

  readonly thickness: number

  readonly kFactor: number | null

  // FlatPattern.constructor (constructor)
  constructor(part: Part, outline: Sketch, bends: Bend[], thickness: number, kFactor: number | null);

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
