# @classcad/smlibwasm — Classes (2)

3 top-level symbols. Signatures are verbatim typescript.

// A bounded curve
// Remarks: Edges come from bodies (`part.edges()`) or from curve constructors such as `Line`, `ThreePointArc` and `Spline`. Parameters along an edge (`pointAt(t)`) run from 0 at the start to 1 at the end, proportional to arc length.
Edge: export declare class Edge extends Shape

  // Edge.constructor (constructor)
  constructor(token?: symbol);

  // Frees the kernel's curve of a standalone edge now, not when the garbage collector gets to it
  // Edge.dispose (method)
  dispose(): void;

  // Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

  // "line", "circle" (also arcs), "ellipse", "bspline" or "other"
  readonly geomType: string

  // How far this edge's curve, its ends and the faces it bounds may lie apart
  readonly tolerance: number

  // The edge's length
  readonly length: number

  // The point where the edge starts (in its direction)
  readonly start: Vector

  // The point where the edge ends (in its direction)
  readonly end: Vector

  // True if the edge ends where it starts (a circle, a closed spline)
  readonly isClosed: boolean

  // True for the seam of a closed surface (an edge used twice by one face)
  readonly isSeam: boolean

  // "convex" for an outside corner (material angle below 180 degrees), "concave" for an inside corner, "smooth" where the faces meet tangentially (within half a degree) all along the edge
  readonly convexity: string

  // The angle between the two faces of the edge through the material, in degrees, at the middle of the edge
  readonly dihedralAngle: number

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

  // The box along the axes around the edge
  // Edge.bbox (method)
  bbox(): BoundBox;

  // Distance to a point, or to a body (see `Part.distanceTo`)
  // Edge.distanceTo (method)
  distanceTo(point: VectorLike | Shape): number;

  // How the two faces of the edge meet, checked at `samples` points along it (`Continuity`)
  // Remarks: `angleTolerance` is the largest angle (degrees) between the faces' normals for G1; `curvatureTolerance` the largest difference of their curvatures across the edge for G2, relative to the larger of them (and at least `1e-3 / length`, so that nearly flat faces count as G2). RangeError for an edge that does not lie between two faces.
  // Edge.continuity (method)
  continuity(samples?: number, options?: {
          angleTolerance?: number;
          curvatureTolerance?: number;
      }): Continuity;

  // The point of the edge nearest to `point`
  // Edge.closestPoint (method)
  closestPoint(point: VectorLike | Vertex): Vector;

  // Where on the edge the point nearest to `point` lies, as a fraction of the edge's length from its start (0) to its end (1), as `pointAt` takes it
  // Edge.paramAtPoint (method)
  paramAtPoint(point: VectorLike | Vertex): number;

  // The part of the edge from `start` to `end`, each a fraction of the length (as in `pointAt`) or a point on the edge
  // Remarks: const arc = CenterArc([0, 0], 10, 0, 180).trim(0.25, 0.75) // the arc from 45 to 135 degrees
  // Edge.trim (method)
  trim(start: number | VectorLike | Vertex, end: number | VectorLike | Vertex): Edge;

  // The edge cut in two at `at`, a fraction of the length or a point on the edge
  // Remarks: const [a, b] = Line([0, 0], [10, 0]).split(0.3) // 3 and 7 long
  // Edge.split (method)
  split(at: number | VectorLike | Vertex): [
          Edge,
          Edge
      ];

  // The edge made longer by `distance` at its `end` ('end', 'start' or 'both'), for cut tools and paths that must run past a body
  // Remarks: Lines and arcs (circles and ellipses) go on as themselves. Other curves are continued as `continuity` says: 'G1' straight along the end tangent, 'G2' with the curvature at the end, 'natural' as the curve's own polynomial goes on. The added length is `distance` in every case. const groovePath = Spline([0, 0], [20, 8], [40, 0]).extend(5, { end: 'both' })
  // Edge.extend (method)
  extend(distance: number, options?: {
          end?: 'start' | 'end' | 'both';
          continuity?: 'G1' | 'G2' | 'natural';
      }): Edge;

  // Points where this edge meets `other`
  // Remarks: Where the two run along each other, the points where that overlap starts and ends. Points closer than `tolerance` to the other shape count as on it (default: 1e-6, or 1e-9 of the size of the two where that is larger); points closer than that to each other count once. No point is an empty list.
  // Edge.intersections (method)
  intersections(other: Shape | Iterable<Shape>, options?: {
          tolerance?: number | null;
      }): Vector[];

  // Where this edge meets `other` (see `intersections`), as fractions of its length (as `pointAt` and `split` take them), in order
  // Edge.intersectionParams (method)
  intersectionParams(other: Shape | Iterable<Shape>, options?: {
          tolerance?: number | null;
      }): number[];

  // Points where the edge crosses itself (a figure eight, a looping spline), in order along it
  // Edge.selfIntersections (method)
  selfIntersections(options?: {
          tolerance?: number | null;
      }): Vector[];

  // The curvature at fraction `t` of the length (as `pointAt`)
  // Edge.curvatureAt (method)
  curvatureAt(t?: number): number;

  // The radius of curvature at fraction `t` of the length (`Infinity` where the edge runs straight)
  // Edge.radiusAt (method)
  radiusAt(t?: number): number;

  // The smallest radius of curvature of the edge (as `Face.minRadius` is the face's)
  // Remarks: const r = path.minRadius() const p = path.pointAt(path.minRadiusAt())
  // Edge.minRadius (method)
  minRadius(): number;

  // Where the edge bends most tightly (`minRadius`)
  // Edge.minRadiusAt (method)
  minRadiusAt(): number;

  // Where the edge changes the side it bends to (an S-curve has one), as fractions of its length (as `pointAt`), in order
  // Edge.inflections (method)
  inflections(): number[];

  // The edge moved `distance` sideways in its plane
  // Remarks: Lines stay lines and arcs stay arcs, exactly. Splines and ellipses are offset by the kernel within 1e-6 of their size. Where the edge bends toward that side more tightly than the distance (a radius of curvature below it, see `minRadius`), the offset would fold over itself and a ModelingError says where. A closed edge with a corner where it starts and ends (`Spline(...pts, pts[0])`) comes back as one closed edge: rounded at the corner where the offset pulls it apart, cut where its sides cross where it pushes them together (`Wire.offset` gives sharp and chamfered corners). `plane`: the plane the edge lies in, whose normal tells left from right. Default: the XY plane for an edge at one height, else the plane the edge lies in, its normal toward +Z (+Y, then +X, for vertical planes). const rail = Spline([0, 0], [20, 8], [40, 0]).offset(3) // 3 to the left (+Y side)
  // Edge.offset (method)
  offset(distance: number, options?: {
          plane?: Plane | null;
      }): Edge;

  // The edge as lines and circular arcs within `tolerance` of it, end to end along it
  // Remarks: const cut = Spline([0, 0], [10, 5], [20, -3], [30, 4]).toArcs(0.01) // 26 arcs
  // Edge.toArcs (method)
  toArcs(tolerance?: number): Wire;

  // This edge bent to pass through `point` (and there in the direction `tangent`, if given)
  // Remarks: Options: `tangent`, the direction of the edge at that point (its length does not count; it is the direction the edge runs in); `at`, where along the edge the point goes, as a fraction of its length (strictly between 0 and 1; default: where the edge comes closest to the point). The change is local: it moves the few control points near `at` (knots are inserted there when the edge has too few), so a point far from the edge makes a bump, not a new curve. const path = Spline([0, 0], [20, 10], [40, 0]).through([20, 15])
  // Edge.through (method)
  through(point: VectorLike | Vertex, options?: {
          tangent?: VectorLike | null;
          at?: number | null;
      }): Edge;

  // This edge with its ends moved to `start` and `end` and its directions there set to `startTangent` and `endTangent` (each optional
  // Remarks: The kernel's own end deformation (`SmCurve::DeformToEndPointTargets`); the ends land on their targets exactly. const snapped = spline.match({ end: other.start, endTangent: other.tangentAt(0) }) // G1 joint
  // Edge.match (method)
  match(options?: {
          start?: VectorLike | Vertex | null;
          end?: VectorLike | Vertex | null;
          startTangent?: VectorLike | null;
          endTangent?: VectorLike | null;
      }): Edge;

  // The vertices at the edge's ends, start first (one for a closed edge)
  // Edge.vertices (method)
  vertices(): ShapeList<Vertex>;

  // This edge, in a list
  // Edge.edges (method)
  edges(): ShapeList<Edge>;

  // The faces of the body that meet at this edge (none for an edge of no body)
  // Edge.faces (method)
  faces(): ShapeList<Face>;

  // This edge and the edges that continue it tangentially, through vertices where the next edge runs on in the same direction (within 10 degrees) between faces that meet this edge's faces smoothly, and so on along the run
  // Edge.tangentChain (method)
  tangentChain(): ShapeList<Edge>;

  // The same edge traversed the other way
  // Edge.reversed (method)
  reversed(): Edge;

  // This edge as a NURBS curve, from its start to its end
  // Edge.nurbs (method)
  nurbs(): Nurbs;

  // The edge of a NURBS curve given by its data
  // Remarks: `nurbs`: a `Nurbs`, or `{ degree, knots, points, weights }`: the degree (1 to 32), the knot vector with every knot as often as its multiplicity (`points.length + degree + 1` knots, not decreasing; the ends need not repeat), the control points (2D points lie at z = 0) and a positive weight per point, or `null` for a non-rational curve. The curve runs from `knots[degree]` to `knots[knots.length - degree - 1]`; where the ends do not repeat `degree + 1` times, it starts and ends inside the control polygon. const n = edge.nurbs() const points = [...n.points] points[2] = points[2].add([0, 0, 5]) // pull one control point up const bent = Edge.fromNurbs(new Nurbs(n.degree, n.knots, points, n.weights))
  // Edge.fromNurbs (method)
  static fromNurbs(nurbs: Nurbs | {
          degree: number;
          knots: readonly number[];
          points: readonly VectorLike[];
          weights?: readonly number[] | null;
      }): Edge;

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
  readonly owner: Part | Shell | null

  // The face's own color as [r, g, b] from 0 to 1, or null
  // Remarks: Faces get one with `body.colored(color, { faces })` and from STEP files that color single faces. It stays with the face through later operations (kernel plan T5): with both pieces of a face a Boolean splits, with the walls of a hole cut by a tool whose faces have one, with a face moved, mirrored or scaled, with the offsets of a face in a shell; faces an operation makes anew (a fillet's round, the rim around a shell's opening) have none.
  readonly color: [
          number,
          number,
          number
      ] | null

  // The face's name (`body.named(name, { faces })`, or from the `ADVANCED_FACE` of a STEP file), or null
  readonly name: string | null

  // The cells of its part that this face bounds, as indices into `Part.cells()`
  readonly cells: number[]

  // "plane", "cylinder", "cone", "sphere", "torus", "revolution", "extrusion", "bspline", "offset" or "other"
  readonly geomType: string

  // The face's area
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

  // Major radius of a torus
  readonly majorRadius: number

  // Half the opening angle of a cone, in degrees
  readonly coneAngle: number

  // Axis of a cylinder, cone, sphere, torus or surface of revolution
  readonly axis: Axis

  // The box along the axes around the face
  // Face.bbox (method)
  bbox(): BoundBox;

  // Distance to a point, or to a body (see `Part.distanceTo`)
  // Face.distanceTo (method)
  distanceTo(point: VectorLike | Shape): number;

  // The point of the face nearest to `point` (within its boundary)
  // Face.closestPoint (method)
  closestPoint(point: VectorLike): Vector;

  // The parameters `[u, v]` of the face's point nearest to `point`, as fractions (0 to 1) of the face's parameter box
  // Face.uvAt (method)
  uvAt(point: VectorLike): [
          number,
          number
      ];

  // The point of the face's surface at `(u, v)`, fractions (0 to 1) of the face's parameter box
  // Face.positionAt (method)
  positionAt(u: number, v: number): Vector;

  // The curvature of the face at its point nearest to `point` (default
  // Face.curvatureAt (method)
  curvatureAt(point?: VectorLike | null): Curvature;

  // The smallest radius of curvature on the face, `1 / max(|k1|, |k2|)`
  // Face.minRadius (method)
  minRadius(): number;

  // The face's surface as a NURBS (`NurbsSurface`)
  // Face.nurbs (method)
  nurbs(): NurbsSurface;

  // Where a ray meets this face, nearest first (see `Part.raycast`)
  // Face.raycast (method)
  raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit<Face>[];

  // The curve projected onto this face along its normals
  // Face.project (method)
  project(curve: Edge | Wire): ShapeList<Edge>;

  // The curve of the face along which one of its surface parameters is constant
  // Face.iso (method)
  iso(options?: IsoOptions): ShapeList<Edge>;

  // A drawing on XY wrapped onto this face, as a label onto a can
  // Remarks: `shape`: an edge, a wire, a sketch or edges, drawn on XY (z is ignored). `at`: where the drawing's origin goes, a point of the face's surface (default: the middle of the face's parameter range). Options: `direction`, where its X axis points (projected onto the face). const label = can.faces().cylinders()[0].wrap(Text('SMLIB', 8), [0, -20, 0], { direction: [1, 0, 0] })
  // Face.wrap (method)
  wrap(shape: Edge | Wire | Sketch | Iterable<Edge>, at?: VectorLike | Vertex | null, options?: {
          direction?: VectorLike | null;
      }): ShapeList<Edge>;

  // The face's outer boundary
  // Face.outerWire (method)
  outerWire(): Wire;

  // The boundaries of the face's holes
  // Face.innerWires (method)
  innerWires(): ShapeList<Wire>;

  // The face's boundaries
  // Face.wires (method)
  wires(): ShapeList<Wire>;

  // The face's edges (seam edges only with `seams`)
  // Face.edges (method)
  edges(options?: {
          seams?: boolean;
      }): ShapeList<Edge>;

  // The face's vertices
  // Face.vertices (method)
  vertices(): ShapeList<Vertex>;

  // This face, in a list
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

  // A sheet of this face moved by `distance` along its normal (`normalAt`
  // Face.offset (method)
  offset(distance: number): Shell;

  // The pieces of this face cut along curves that lie on it, as the faces of a new sheet
  // Face.split (method)
  split(curves: Edge | Wire | Iterable<Edge | Wire>): ShapeList<Face>;
  //   curves: Edges or wires on the face (see `Shell.trim`)

  // A copy of this face, turned over
  // Face.flipped (method)
  flipped(): Shell;

  // The whole surface this face lies on, as a sheet of one face
  // Remarks: A cylindrical face cut out of a box comes back as the whole cylinder the cut left it on (its full height and all around), a B-spline face as its whole surface. A plane has no border of its own: it comes back as the smallest rectangle around the face, along the plane's own directions. The sheet's normal follows this face's (`normalAt`).
  // Face.untrimmed (method)
  untrimmed(): Shell;

  // The face's surface grown past its sides, as a sheet of one face
  // Face.extend (method)
  extend(distance: number, options?: {
          sides?: Edge | Iterable<Edge> | null;
          continuity?: 'natural' | 'G1' | 'G2';
      }): Shell;
  //   distance: How far past each side, measured along the surface (across the middle of the side)
  //   options: `sides`

  // Extrude a planar face along its normal (see `Sketch.extrude`)
  // Face.extrude (method)
  extrude(amount: number, options?: ExtrudeOptions): Part;

  // Face.equals (method)
  equals(other: unknown): boolean;

  // Face.toString (method)
  toString(): string;

MassProperties: export declare class MassProperties

  // The mass
  readonly mass: number

  // The volume (mm³)
  readonly volume: number

  // The surface area (mm²)
  readonly area: number

  // The center of mass
  readonly center: Vector

  // The inertia tensor about the center of mass, axes parallel to the world axes (3 × 3)
  readonly inertia: number[][]

  // The density the mass was computed with
  readonly density: number

  // MassProperties.constructor (constructor)
  constructor(mass: number, volume: number, area: number, center: Vector, inertia: number[][], density: number);

  // The principal moments of inertia, smallest first
  readonly principalMoments: [
          number,
          number,
          number
      ]

  // The principal axes of inertia (directions), in the order of `principalMoments`
  readonly principalAxes: [
          Vector,
          Vector,
          Vector
      ]

  // The radius of gyration about each principal axis, `sqrt(moment / mass)`, in the order of `principalMoments`
  readonly radiiOfGyration: [
          number,
          number,
          number
      ]

  // The inertia tensor about `point` (axes parallel to the world axes)
  // MassProperties.inertiaAbout (method)
  inertiaAbout(point: VectorLike): number[][];

  // The moment of inertia about an axis (for example a shaft's axis or a pivot)
  // MassProperties.momentAbout (method)
  momentAbout(axis: Axis): number;

  // MassProperties.toString (method)
  toString(): string;

  // MassProperties.[inspect] (method)
  [inspect](): string;
