# @classcad/smlibwasm — Classes (3)

4 top-level symbols. Signatures are verbatim typescript.

// A solid
// Remarks: Combine parts with `fuse` (union), `cut` (difference) and `intersect` (intersection). Each takes parts or any iterables of parts.
Part: export declare class Part extends _Body

  // The part's volume (mm³)
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

  // True if the part is a closed, manifold solid that encloses a positive volume and whose faces meet
  // Remarks: (A body whose faces point inward, or that encloses no volume, such as a profile revolved about an axis through it, is not valid; nor is one whose faces leave gaps that make its volume uncertain by 1e-2 of its value or more.) With `strict`, the kernel's own checks of each face, edge and vertex (`check`, all of them) must find nothing too: an imported, stitched or healed body can be closed and enclose its volume while its edges and vertices lie farther from its faces than their tolerances allow. (Of 1471 Boolean results of a random test campaign that `isValid()` accepts, 34 fail the strict test.)
  // Part.isValid (method)
  isValid(options?: {
          strict?: boolean;
      }): boolean;

  // The separate bodies of this part
  // Part.solids (method)
  solids(): ShapeList<Part>;

  // The closed sheets that bound the part, each a `Shell` of copies of its faces (joined along their edges)
  // Part.shells (method)
  shells(): ShapeList<Shell>;

  // The cavities of the part (closed spaces inside it, kernel plan T7), each a part of its own
  // Part.voids (method)
  voids(): ShapeList<Part>;

  // Counts and measures in one object
  // Part.info (method)
  info(): {
          type: string;
          faces: number;
          edges: number;
          vertices: number;
          bbox: [
              number[],
              number[]
          ];
          corners?: string;
          solids: number;
          voids: number;
      };

  // This part and others as one part made of cells
  // Remarks: `cells()` gives the cells as parts of their own, each named and colored after the parts it lies in (`cell.sources`); `volume` is the volume of the union. A merged part is not a manifold solid: `isValid()` is false, and Booleans, fillets and shells take its cells rather than the part itself. `exportStep` writes each cell as a solid of its own, with its name and color. A result whose volume is less than that of the largest part, or more than that of all parts together, is wrong: `ModelingError`.
  // Part.merge (method)
  merge(...others: (Part | Iterable<Part>)[]): Part;

  // For a cell of a merged part (see `cells`)
  readonly sources: Part[]

  // The cells of a part made by `merge`, each as a part of its own (every closed region of the body
  // Remarks: Each cell is named and colored after the parts given to merge that it lies in (its `sources`): the names joined by `&` ("steel&brass" where a steel and a brass part overlap), the color of the last of them that has one; the merged part's own name and color where none of them has one. The kernel keeps no record of the parts: smlibwasm classifies a point inside each cell against them. The kernel's stitcher runs in the probe worker (see GUARD_SECONDS): a crash there throws a KernelError, and this process goes on.
  // Part.cells (method)
  cells(): ShapeList<Part>;

  // Where a point lies
  // Remarks: The kernel classifies the point exactly (SmBrep::Point3DClassify), also where a ray from it would graze a face or pass through an edge, which the parity of `raycast` hits gets wrong.
  // Part.classify (method)
  classify(point: VectorLike, tolerance?: number | null): [
          string,
          Face | Edge | Vertex | null
      ];

  // True if the point lies in the material of this part or on its surface (within `tolerance`, see `classify`)
  // Part.contains (method)
  contains(point: VectorLike, tolerance?: number | null): boolean;

  // The cell of a merged part (see `merge`) that holds the point, as in `cells`
  // Part.cellAt (method)
  cellAt(point: VectorLike, tolerance?: number | null): Part | null;

  // Union with other parts (Python's `+`)
  // Part.fuse (method)
  fuse(...others: (Part | Iterable<Part>)[]): Part;

  // Subtract other parts (Python's `-`)
  // Part.cut (method)
  cut(...others: (Part | Iterable<Part>)[]): Part;

  // Keep only the volume shared with the other parts (Python's `&`)
  // Part.intersect (method)
  intersect(sheet: Shell | Face): Shell;
  intersect(...others: (Part | Iterable<Part>)[]): Part;

  // Round edges
  // Part.fillet (method)
  fillet(edges: EdgesLike, radius: FilletRadius, options?: FilletOptions): Part;
  //   edges: Edges of this part (a selection, a single edge, or faces whose edges to round)
  //   radius: Fillet radius

  // The surfaces of the rounds a fillet of `edges` with `radius` would make, as sheets, without rounding the part
  // Remarks: `edges` and `propagate` select as for `fillet`. A selection the kernel cannot round at any size throws a KernelError, as `fillet` does; a preview that succeeds does not promise that the fillet will (its corners and trims are not made). The kernel step of a part read from a file runs in the probe worker, as for `fillet`.
  // Part.filletPreview (method)
  filletPreview(edges: EdgesLike, radius: number, options?: {
          propagate?: boolean;
      }): ShapeList<Shell>;

  // Bevel edges
  // Remarks: An asymmetric bevel: `length2` is the setback on the other face of each edge, `length` the one on its `reference` face; or `angle` (degrees) is the angle between the bevel and the reference face (`length2` follows from it: `length * tan(angle)` where the faces meet at 90 degrees). `reference` is a face of this part (or several) that each edge lies on; `length2` and `angle` need it. Where the faces meet at an acute angle and the setbacks are less alike than its cosine, the kernel's solver cannot reach the bevel: a straight edge between planes whose ends lie on planes at right angles to it is then bevelled by cutting the bevel's prism along it; other such edges throw a ModelingError. The faces of each edge must meet at the same angle all along it (within 1 degree); where they do not (a hole into a tilted or curved face), use `fillet`. `propagate` bevels the edges that continue the selected ones tangentially too (`Edge.tangentChain`), as `fillet` does; `false` bevels the selected edges only. The edges a run adds must lie on a reference face too. `corners` sets the corners where three bevelled edges meet, as for `fillet`: "patch" cuts them off with a corner face, "mitre" runs the bevels on until they meet (the corners of three bevelled convex edges and no other edge).
  // Part.chamfer (method)
  chamfer(edges: EdgesLike, length: number, options?: ChamferOptions): Part;

  // Hollow the part out to walls of `thickness`, removing the `openings` faces
  // Remarks: The walls grow inward (the outside keeps its size) unless `outward` is true. `corners` says how the new side of the walls turns where the part's faces grow apart (the inside of a concave edge for walls that grow inward, the outside of a convex edge and corner for walls that grow outward): `'round'` keeps the wall's thickness all round with a round of radius `thickness`; `'sharp'` extends the faces until they meet, so that the wall is thicker there (up to `thickness / sin(a / 2)` at an edge of angle `a`). The default, null, takes `'round'` where the kernel builds it and `'sharp'` where it does not; the result's `info().corners` says which. Given `'round'` or `'sharp'`, a shell the kernel cannot build that way throws instead. `walls` gives faces walls of their own thickness: `[faces, thickness]` pairs, or a Map of faces to thicknesses (`walls: [[part.faces().bottom(), 5]]`). The face of the shell across such a wall is offset by the difference, and the faces around it are extended or trimmed to meet it (as `offsetFaces`). Faces that meet smoothly (a wall and the round beside it) need one thickness. The kernel leaves the rim of an opening open where it meets its neighbours tangentially (the flat top of a box rounded on all edges): planar openings of that kind, whose other rim edges meet walls standing at right angles to them or an ordinary opening, are cut out of the part shelled closed instead (the inner rounds then end at the rim). Walls that do not fit into the part (measured across it from each face), and results the kernel gets wrong (faces that do not meet, no cavity, the part given back, a closed shell of the wrong volume), throw a ModelingError. The kernel step runs in the probe worker (a kernel of its own; on a page's main thread in this one), so that a crash of its offset code throws a ModelingError too, and it is stopped after `GUARD_SECONDS` (20 s; `setGuardSeconds(seconds)` raises it for large parts).
  // Part.shell (method)
  shell(thickness: number, openings?: FacesLike | null, options?: {
          outward?: boolean;
          corners?: 'round' | 'sharp' | null;
          walls?: WallsLike | null;
      }): Part;

  // Grow (positive) or shrink (negative) the part by `distance` everywhere (0 gives an equal copy)
  // Remarks: `corners: "sharp"` (the default) moves each face by `distance` and extends the faces until they meet again: edges and corners stay sharp, and an edge whose faces meet at an angle `a` moves out by `distance / sin(a / 2)`. `"round"` rolls a ball of radius `distance` along the part: where faces grow apart (the convex edges and corners of a growing part) it fills in cylinders and spheres, so that every point of the result lies at `distance` from the part (a clearance body, the skin of an overmould). Shrinking with `"round"` rounds the concave edges, which grow apart inward; the convex ones stay sharp. The sharp mode fails where faces would vanish or cross (an acute wedge, a hole that closes, a groove narrower than twice the distance); the rounded mode builds those. Results the kernel gets wrong (faces that do not meet, a change of the wrong sign) throw a ModelingError. The kernel step runs in the probe worker and is stopped after `GUARD_SECONDS` (20 s), as for `shell`.
  // Part.offset (method)
  offset(distance: number, options?: {
          corners?: 'sharp' | 'round';
      }): Part;

  // Cut the part with a plane or along a sheet
  // Remarks: `keep = "above"` keeps the side the plane normal points to, "below" the other side, "both" returns `[above, below]`. A sheet (a `Shell`, or a face that is not planar: a curved split surface, a surface fitted to a scan) splits the part along its surface; "above" is the side its normals point to (`normalAt`). The sheet must cut through the part. A sheet of one face whose edges end inside the part is extended beyond them until it does (the face's trim is not kept): a free-form face tangentially, a plane, cylinder, cone or sphere as itself (`Face.extend`; around a closed face it cannot grow); sheets of several faces throw a ModelingError ("the surface does not cut through the part"). The two sides together hold the part's volume, which is checked. A planar face (or a sketch) stands for its plane. A plane that a seam of the part touches at a point (a torus' outer equator, where the kernel's Boolean can go wrong) gives only sides that together hold the part's volume, else a ModelingError.
  // Part.split (method)
  split(plane: Plane | Face | Shell | ShapeList<Face>, keep: 'above' | 'below'): Part;
  split(plane: Plane | Face | Shell | ShapeList<Face>, keep: 'both'): [
          Part,
          Part
      ];
  split(plane: Plane | Face | Shell | ShapeList<Face>): Part;

  // The part with its faces split where a tool crosses them, without changing its shape
  // Part.imprint (method)
  imprint(tool: Part | Shell | Face | ShapeList<Face> | Edge | Wire | Iterable<Edge | Wire>, direction?: Axis | VectorLike | null, options?: {
          nearest?: boolean;
      }): Part;
  //   tool: A part (the faces are split where its surface crosses them), a sheet or a face that crosses faces of the part, or a sketch (or a planar face) lying on a face of the part, whose outline is cut into that face (keep its region within the face
  //   direction: For curves, a sketch or a planar face
  //   options: `nearest`

  // The cross-section of the part in a plane, as a sketch
  // Part.section (method)
  section(plane?: Plane | Face): Sketch;

  // Sections (`section`) across `axis`, `step` apart
  // Part.slices (method)
  slices(step: number, axis?: Axis | VectorLike): Sketch[];

  // A faceted part of a closed mesh (see `Mesh.toPart`)
  // Part.fromMesh (method)
  static fromMesh(mesh: Mesh, maxFaces?: number): Part;

  // Twist about an axis (default Z) by `angle` degrees over the part
  // Part.twist (method)
  twist(angle: number, options?: TwistOptions): Part;

  // Scale cross-sections toward an axis (default Z) from 1 to `scale`
  // Part.taper (method)
  taper(scale: number, options?: TaperOptions): Part;

  // Bend around an axis by `angle` degrees (default
  // Part.bend (method)
  bend(angle: number, options?: BendOptions): Part;

  // Unroll this part from around an axis (default Z) into a flat one, the layer at `radius` keeping its length
  // Part.unroll (method)
  unroll(options: UnrollOptions): Part;

  // Deform with a `Lattice` (same as `lattice.apply(part)`)
  // Part.deform (method)
  deform(lattice: Lattice, options?: {
          tolerance?: number | null;
      }): Part;

  // The part with fillets taken out and their edges sharp again
  // Part.removeFillets (method)
  removeFillets(faces?: FacesLike | null, options?: {
          maxRadius?: number | null;
          partial?: boolean;
      }): Part;

  // The part with `faces` (a hole, a boss, a pocket) cut out and the gap closed by the faces around it
  // Part.removeFaces (method)
  removeFaces(faces: FacesLike, options?: {
          partial?: boolean;
      }): Part;

  // Draft angle of every face for the pull direction, with the faces grouped by whether they release (see `DraftAnalysis`)
  // Part.draftAnalysis (method)
  draftAnalysis(direction: Axis | VectorLike, options?: {
          minAngle?: number;
      }): DraftAnalysis;

  // The closed lines where the part's surface turns from facing `direction` to facing away from it
  // Part.partingLine (method)
  partingLine(direction: Axis | VectorLike): ShapeList<Wire>;

  // Tilt faces by a draft angle, so that a molded or cast part comes out of its mold
  // Remarks: Each face turns about the line where it meets the neutral plane and keeps its size there. The normal of the neutral plane is the pull direction, the way the mold moves off the part: a positive angle turns each face to look more along it, so the part narrows and pockets and holes widen along the normal, on either side of the plane. Afterwards `draftAnalysis` of that direction finds `angle` more draft on each of the faces. Planes can be drafted, and cylinders and cones whose axis runs along the normal (a cylinder becomes a cone). A face that meets a drafted face tangentially, such as a fillet between two walls, must be drafted with it; the faces around the drafted ones are extended or trimmed to meet them. A part with cavities is drafted as its outside and its cavities apart (the kernel drops cavities), which are cut out again; the walls of a cavity drafted by a positive angle widen along the pull direction, as a pocket's do.
  // Part.draft (method)
  draft(faces: FacesLike, angle: number, neutralPlane: Plane | Face): Part;
  //   faces: Faces of this part (a selection or a single face)
  //   angle: Draft angle in degrees, between -90 and 90 and not 0
  //   neutralPlane: Where the faces keep their size, a Plane or a planar face

  // Move faces of the part, and extend or trim the faces around them to meet them again
  // Remarks: `by` is a vector or a Location (a rotation and a translation: it also turns the faces). A face moved along itself stays where it is (a plane moved within its plane); the faces around it decide what changes. Faces that meet a moved face tangentially (a round, the other half of a slot) must be moved with it. Exact: planes, cylinders, cones, spheres, tori and free-form faces keep their shape, and the edges where a plane meets a cylinder, cone or sphere stay circles. Throws a ModelingError where the kernel cannot rebuild the part, where the moved faces change which faces meet (a face vanishes; use a Boolean), and where the result's faces do not meet. A part with cavities is edited as its outside and its cavities apart (the kernel drops cavities), which are cut out again; a move that makes a cavity reach the outside or another cavity throws, and so does a part with a body inside a cavity. Faces around the moved ones that the kernel extends keep their cylinder or cone.
  // Part.moveFaces (method)
  moveFaces(faces: FacesLike, by: Location | VectorLike): Part;
  //   faces: Faces of this part (a selection or a single face)
  //   by: A vector, or a Location

  // Offset faces of the part along their normals by `distance`, and extend or trim the faces around them to meet them again
  // Remarks: A positive distance moves the faces out of the material: the part grows, a hole narrows and a boss widens; a negative one moves them in. Faces that meet an offset face tangentially (a round, the other half of a slot, a fillet chain) are offset with it, and so on along the tangent chain. Exact: a plane moves, a cylinder, cone, sphere or torus changes its radius, a free-form face becomes its offset surface. Throws a ModelingError where a radius would reach 0, where the kernel cannot rebuild the part, where the offset faces change which faces meet (a face vanishes; use a Boolean), and where the volume does not change the way the distance says. A part with cavities is edited as for `moveFaces`: a face of a cavity's wall offset by a positive distance moves into the cavity.
  // Part.offsetFaces (method)
  offsetFaces(faces: FacesLike, distance: number): Part;
  //   faces: Faces of this part (a selection or a single face)
  //   distance: How far to move them, along their outward normals

  // Push or pull a face at a point
  // Remarks: The point moves exactly, the face's edges not at all: an edit that would move one (a hole's edge, a border cut across the surface, within `radius` of the point) throws a RangeError; take a smaller radius or a point farther from it. The face becomes a B-spline surface; a plane, cylinder or sphere stays exactly what it was away from the change.
  // Part.push (method)
  push(face: Face, at: VectorLike, options?: PushOptions): Part;
  //   face: A face of the part
  //   at: The point of the face that moves (a point off the face
  //   options: `by`

  // Raise or sink a region of a face
  // Remarks: The face changes only near the region, within the rectangle around it along the surface's two directions (the region itself for a rectangle drawn along them); the highest point lies near the region's middle (at it, for a region symmetric along both directions, with `'G2'`). Where that rectangle reaches an edge of the face (a hole), the edge would move: a RangeError. The face's B-spline loses the knots it does not need within 1e-6 of the size (its edges stay where they are).
  // Part.warp (method)
  warp(face: Face, region: RegionLike, by: number | VectorLike, options?: {
          continuity?: 'crease' | 'G1' | 'G2';
      }): Part;
  //   face: A face of the part
  //   region: The outline on the face
  //   by: How far the region rises at its highest point
  //   options: `continuity`

  // Press a region of a face onto a plane
  // Remarks: Inside the region the face lies in the plane, but for a border where it blends into the rest (3/16 of the region's width with `'G2'`, 2/16 with `'G1'`, 1/16 with `'crease'`); outside the rectangle around the region (along the surface's two directions) it does not change. Where that rectangle reaches an edge of the face (a hole), the edge would move: a RangeError. The face's B-spline loses the knots it does not need within 1e-6 of the size (its edges stay where they are; a box's top flattened: 21 x 21 control points, not 39 x 39).
  // Part.flatten (method)
  flatten(face: Face, region: RegionLike, plane: Plane | Face, options?: {
          continuity?: 'crease' | 'G1' | 'G2';
      }): Part;
  //   face: A face of the part
  //   region: The outline on the face, as for `warp`
  //   plane: The plane (or a planar face) the region is pressed onto, along its normal
  //   options: `continuity`

  // Fold this sheet along a line on its top or bottom face (see `fold`)
  // Part.fold (method)
  fold(line: Axis | Edge, angle: number, options: FoldOptions): Part;

  // Add a flange along a straight outer edge of this sheet (see `flange`)
  // Part.flange (method)
  flange(edge: Edge | ShapeList<Edge>, length: number, options: FlangeOptions): Part;

  // The bends of this sheet metal part (see `bends`)
  // Part.bends (method)
  bends(options?: {
          kFactor?: KFactor;
      }): Bend[];

  // This sheet metal part unfolded flat (see `unfold`)
  // Part.unfold (method)
  unfold(options?: UnfoldOptions): Part;

  // The flat pattern of this sheet metal part on XY (see `flatPattern`)
  // Part.flatPattern (method)
  flatPattern(options?: UnfoldOptions): FlatPattern;

  // Part.toString (method)
  toString(): string;

// Something the kernel's validity checks find wrong with a body (see `check`)
Problem: export declare class Problem

  // The face, edge or vertex the problem is about, or the body itself
  readonly shape: Face | Edge | Vertex | Part | Shell

  // What is wrong, with the value measured and the tolerance where there are
  readonly message: string

  // The value measured (a gap, a distance, an angle), or `null`
  readonly value: number | null

  // The tolerance it was held against, or `null`
  readonly tolerance: number | null

  // The kind of test
  readonly category: string

  // The test's short name (`"Bad Gap"`, `"Bad Loop Connection Vertex"`)
  readonly test: string

  // A second face, edge or vertex the test compared with, or `null`
  readonly other: Face | Edge | Vertex | Part | Shell | null

  // Problem.constructor (constructor)
  constructor(shape: Face | Edge | Vertex | Part | Shell, message: string, value?: number | null, tolerance?: number | null, category?: string, test?: string, other?: Face | Edge | Vertex | Part | Shell | null);

  // Problem.toString (method)
  toString(): string;

  // Problem.[inspect] (method)
  [inspect](): string;

// Section properties of a planar region (see `Sketch.sectionProperties`)
// Remarks: The moments are about the centroid, in the axes of `plane` (the sketch plane moved to the centroid): `ixx = ∫ y² dA` about its x axis, `iyy = ∫ x² dA` about its y axis and the product `ixy = ∫ x y dA`, in mm⁴.
SectionProperties: export declare class SectionProperties

  // The region's area (mm²)
  readonly area: number

  // The centroid of the region
  readonly centroid: Vector

  // The sketch plane moved to the centroid
  readonly plane: Plane

  // The second moment of area about the plane's x axis, ∫ y² dA (mm⁴)
  readonly ixx: number

  // The second moment of area about the plane's y axis, ∫ x² dA (mm⁴)
  readonly iyy: number

  // The product of area, ∫ x y dA (mm⁴)
  readonly ixy: number

  // SectionProperties.constructor (constructor)
  constructor(area: number, plane: Plane, ixx: number, iyy: number, ixy: number, extent: [
          number,
          number,
          number,
          number
      ]);

  // The polar moment about the centroid, `ixx + iyy` (the torsion constant only of a circle or a ring)
  readonly polar: number

  // The second moments about the principal axes through the centroid, ascending
  readonly principalMoments: [
          number,
          number
      ]

  // Unit directions (in world coordinates, in the plane) of the principal axes, in the order of `principalMoments`
  readonly principalAxes: [
          Vector,
          Vector
      ]

  // `[sqrt(ixx / area), sqrt(iyy / area)]`
  readonly radiiOfGyration: [
          number,
          number
      ]

  // The elastic section moduli `[ixx / c_y, iyy / c_x]`, with `c` the distance from the centroid to the farthest fiber of the region across each axis (the smaller modulus of a section that is not symmetric)
  readonly sectionModuli: [
          number,
          number
      ]

  // SectionProperties.toString (method)
  toString(): string;

  // SectionProperties.[inspect] (method)
  [inspect](): string;

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

  // Triangulate the shape (see `tessellate`
  // Shape.mesh (method)
  mesh(tolerance?: number | null, angle?: number, options?: {
          maxEdge?: number | null;
      }): Mesh;

  // Show the shape in the viewer (see `show`)
  // Shape.show (method)
  show(options?: ShowOptions): string;

  // Write the shape to a file
  // Shape.export (method)
  export(path: string, options?: FileOptions): void;

  // Shape.toString (method)
  toString(): string;

  // Shape.[inspect] (method)
  [inspect](): string;
