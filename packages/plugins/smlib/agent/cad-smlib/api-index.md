# @classcad/smlibwasm API index

@classcad/smlibwasm 0.1.0-beta.9 · 1164 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature, and each top-level symbol names the lines of that file which hold its declaration and members: read only that range.

## Constants — `api-constants.md`

version (constant) [lines 5-5]
TOLERANCE (constant) [lines 7-8] — Geometric tolerance used for comparisons (model units)
X (constant) [lines 10-10]
Y (constant) [lines 12-12]
Z (constant) [lines 14-14]
Align (constant) [lines 16-28] [3 members] — How a new shape sits relative to the origin along…
  Align.MIN (property)
  Align.CENTER (property)
  Align.MAX (property)
ACCURACY (constant) [lines 30-31] — Relative accuracy of areas, volumes, centers and inertia
DEFAULT_FONT (constant) [lines 33-34] — The font `Text` uses unless told otherwise
GUARD_BOOLEANS (constant) [lines 36-37] — Whether every Boolean (`fuse`, `cut`, `intersect`, `merge`) runs in the…
GUARD_SECONDS (constant) [lines 39-40] — Seconds the kernel may take for one step that can…
VIEWS (constant) [lines 42-47] — Named views

## Classes — `api-classes.md`

Axis (class) [lines 5-66] [17 members] — An infinite line through `origin` along `direction`
  Axis.X (property) — The world X axis, through the origin
  Axis.Y (property) — The world Y axis, through the origin
  Axis.Z (property) — The world Z axis, through the origin
  Axis.origin (property) — A point of the axis (the one it was made…
  Axis.direction (property) — The axis's direction, of length 1
  Axis.constructor (constructor)
  Axis.neg (method) — The axis pointing the other way (Python's unary `-`), the…
  Axis.reversed (method) — The axis through the same point, pointing the other way
  Axis.moved (method) — The axis moved by a location
  Axis.at (method) — The same direction through another point
  Axis.isParallel (method) — True if the axis runs along another axis or a…
  Axis.distanceTo (method) — The distance of a point from the axis (the whole…
  Axis.project (method) — The point of the axis (the whole line) nearest to…
  Axis.positionAlong (method) — Signed coordinate of `point` along this axis
  Axis.equals (method)
  Axis.toString (method)
  Axis.[inspect] (method)
BoundBox (class) [lines 68-107] [12 members]
  BoundBox.min (property) — The corner with the smallest x, y and z
  BoundBox.max (property) — The corner with the largest x, y and z
  BoundBox.constructor (constructor)
  BoundBox.ofPoints (method) — The smallest box along the axes around the points
  BoundBox.size (property) — The box's extent along X, Y and Z, as a…
  BoundBox.center (property) — The middle of the box
  BoundBox.diagonal (property) — The length of the box's diagonal
  BoundBox.union (method) — The smallest box around both boxes
  BoundBox.contains (method) — True if the point lies in the box or on…
  BoundBox.[Symbol.iterator] (method)
  BoundBox.toString (method)
  BoundBox.[inspect] (method)
ClosestPoints (class) [lines 109-129] [6 members] — The nearest points of two shapes (see `Part.closestPoints`)
  ClosestPoints.point (property) — The point on the body the method was called on
  ClosestPoints.otherPoint (property) — The point on the other shape
  ClosestPoints.distance (property) — Their distance
  ClosestPoints.face (property) — The face of the body the point lies on (at…
  ClosestPoints.otherFace (property) — The face of the other shape, or `null` when it…
  ClosestPoints.constructor (constructor)
Continuity (class) [lines 131-151] [6 members] — How two faces meet at an edge, or two edges…
  Continuity.level (property) — `"G2"` (curvature continuous), `"G1"` (tangent), `"G0"` (they meet at an…
  Continuity.gap (property) — The largest distance between the two sides
  Continuity.angle (property) — The largest angle between the two sides' normals (faces) or…
  Continuity.curvatureJump (property) — The largest difference of the curvatures on the two sides…
  Continuity.point (property) — Where the sides differ most in what decides the level
  Continuity.constructor (constructor)
Curvature (class) [lines 153-182] [9 members] — The curvature of a face at a point (see `Face.curvatureAt`)
  Curvature.k1 (property) — The larger principal curvature (1/mm)
  Curvature.k2 (property) — The smaller principal curvature
  Curvature.dir1 (property) — The unit direction of `k1`, tangent to the face
  Curvature.dir2 (property) — The unit direction of `k2`, square to `dir1`
  Curvature.normal (property) — The outward unit normal
  Curvature.point (property) — The point on the face
  Curvature.constructor (constructor)
  Curvature.mean (property) — The mean curvature `(k1 + k2) / 2`
  Curvature.gaussian (property) — The Gaussian curvature `k1 * k2` (positive on a ball,…
Hit (class) [lines 184-204] [6 members] — Where a ray meets a shape or a mesh (see…
  Hit.point (property) — The point where the ray meets the surface
  Hit.distance (property) — How far along the ray, from its start
  Hit.normal (property) — The outward unit normal of the surface there (of the…
  Hit.face (property) — The face hit (null for a mesh's triangle
  Hit.triangle (property) — The index of the triangle that was hit (meshes), or…
  Hit.constructor (constructor)
Location (class) [lines 206-262] [15 members] — A rigid placement (rotation + translation), stored as a 4x4…
  Location.constructor (constructor)
  Location.about (method) — Rotation by `angle` degrees about an arbitrary axis
  Location.matrix (property) — The 4x4 homogeneous matrix (column-vector convention), row by row
  Location.position (property) — Where the location moves the origin to
  Location.rotation (property) — Rotation as X, Y, Z angles in degrees (applied in…
  Location.xDir (property) — Where the location turns the X direction to
  Location.yDir (property) — Where the location turns the Y direction to
  Location.zDir (property) — Where the location turns the Z direction to
  Location.plane (property) — The XY plane moved by this location
  Location.inverse (method) — The location that undoes this one
  Location.rotateVector (method) — A direction turned by the location's rotation (its translation left…
  Location.mul (method) — This location applied to something
  Location.equals (method)
  Location.toString (method)
  Location.[inspect] (method)
Nurbs (class) [lines 264-280] [5 members] — A curve as a NURBS (see `Edge.nurbs`)
  Nurbs.degree (property) — The degree of the curve
  Nurbs.knots (property) — The knot vector, every knot as often as its multiplicity…
  Nurbs.points (property) — The control points
  Nurbs.weights (property) — The weight of each control point, or `null` for a…
  Nurbs.constructor (constructor)
NurbsSurface (class) [lines 282-310] [5 members] — A surface as a NURBS (see `Face.nurbs`)
  NurbsSurface.degrees (property) — The degrees `[u, v]`
  NurbsSurface.knots (property) — The knot vectors `[uKnots, vKnots]`, every knot as often as…
  NurbsSurface.points (property) — The control points, one row per u index
  NurbsSurface.weights (property) — The weights in the same rows, or `null` for a…
  NurbsSurface.constructor (constructor)
Plane (class) [lines 312-434] [35 members] — A coordinate system
  Plane.XY (property) — Through the origin, X direction [1, 0, 0], normal [0,…
  Plane.YZ (property) — Through the origin, X direction [0, 1, 0], normal [1,…
  Plane.ZX (property) — Through the origin, X direction [0, 0, 1], normal [0,…
  Plane.XZ (property) — Through the origin, X direction [1, 0, 0], normal [0,…
  Plane.YX (property) — Through the origin, X direction [0, 1, 0], normal [0,…
  Plane.ZY (property) — Through the origin, X direction [0, 0, 1], normal [-1,…
  Plane.top (property) — Through the origin, X direction [1, 0, 0], normal [0,…
  Plane.bottom (property) — Through the origin, X direction [1, 0, 0], normal [0,…
  Plane.front (property) — Through the origin, X direction [1, 0, 0], normal [0,…
  Plane.back (property) — Through the origin, X direction [-1, 0, 0], normal [0,…
  Plane.left (property) — Through the origin, X direction [0, -1, 0], normal [-1,…
  Plane.right (property) — Through the origin, X direction [0, 1, 0], normal [1,…
  Plane.origin (property) — The plane's origin
  Plane.xDir (property) — The plane's X direction, of length 1
  Plane.yDir (property) — The plane's Y direction, of length 1
  Plane.zDir (property) — The plane normal
  Plane.constructor (constructor)
  Plane.normal (property) — The plane normal (`zDir`)
  Plane.location (property) — The location that maps the world XY plane onto this…
  Plane.offset (method) — This plane moved `distance` along its normal
  Plane.shifted (method) — This plane moved within its own coordinates
  Plane.flipped (method) — The same plane seen from the other side (normal reversed,…
  Plane.rotated (method) — Rotate about the plane's own X, then Y, then Z…
  Plane.moved (method) — The plane moved by a location
  Plane.at (method) — The same orientation through another origin
  Plane.toLocal (method) — A point in the plane's coordinates
  Plane.fromLocal (method) — The world coordinates of a point given in the plane's…
  Plane.contains (method) — True if the point lies in the plane, at most…
  Plane.distanceTo (method) — Signed distance of a point above the plane
  Plane.project (method) — The point of the plane nearest to a point (straight…
  Plane.isCoplanar (method) — True if the other plane is the same plane (either…
  Plane.mul (method) — `plane.mul(shape)` places a shape (usually a sketch drawn on XY)…
  Plane.equals (method)
  Plane.toString (method)
  Plane.[inspect] (method)
Vector (class) [lines 436-538] [26 members] — An immutable 3D vector or point
  Vector.x (property) — The x coordinate
  Vector.y (property) — The y coordinate
  Vector.z (property) — The z coordinate
  Vector.constructor (constructor)
  Vector.toArray (method) — `[x, y, z]`
  Vector.[Symbol.iterator] (method)
  Vector.add (method) — The sum of the two vectors (Python's `+`)
  Vector.sub (method) — The difference of the two vectors (Python's `-`)
  Vector.mul (method) — This vector scaled by a number (`dot` and `cross` multiply…
  Vector.div (method) — The vector divided by a number (Python's `/`)
  Vector.neg (method) — The vector pointing the other way (Python's unary `-`)
  Vector.equals (method) — Equal within TOLERANCE
  Vector.toString (method)
  Vector.[inspect] (method)
  Vector.length (property) — The length (for a point
  Vector.dot (method) — The dot product with another vector
  Vector.cross (method) — The cross product with another vector
  Vector.normalized (method) — The vector scaled to length 1
  Vector.distanceTo (method) — The distance to another point
  Vector.angleTo (method) — Angle to another vector in degrees (0..180)
  Vector.isClose (method) — True if the two points are at most `tolerance` apart…
  Vector.isParallel (method) — True if both vectors point along the same line (either…
  Vector.isPerpendicular (method) — True if the vectors are at right angles, within `angleTolerance`…
  Vector.rotate (method) — Rotate this point about an axis (through the origin for…
  Vector.projectTo (method) — Orthogonal projection of this point onto a plane
  Vector.anyPerpendicular (method) — A unit vector perpendicular to this one

## Classes (2) — `api-classes-2.md`

Edge (class) [lines 5-235] [51 members] — A bounded curve
  Edge.constructor (constructor)
  Edge.dispose (method) — Frees the kernel's curve of a standalone edge now, not…
  Edge.[Symbol.dispose] (method)
  Edge.geomType (property) — "line", "circle" (also arcs), "ellipse", "bspline" or "other"
  Edge.tolerance (property) — How far this edge's curve, its ends and the faces…
  Edge.length (property) — The edge's length
  Edge.start (property) — The point where the edge starts (in its direction)
  Edge.end (property) — The point where the edge ends (in its direction)
  Edge.isClosed (property) — True if the edge ends where it starts (a circle,…
  Edge.isSeam (property) — True for the seam of a closed surface (an edge…
  Edge.convexity (property) — "convex" for an outside corner (material angle below 180 degrees),…
  Edge.dihedralAngle (property) — The angle between the two faces of the edge through…
  Edge.isConvex (method) — True on an outside corner (see `convexity`)
  Edge.direction (property) — Unit direction of a straight edge (start to end)
  Edge.radius (property) — Radius of a circular edge
  Edge.arcCenter (property) — Center of a circular edge
  Edge.normal (property) — Axis direction of a circular edge
  Edge.pointAt (method) — Point at fraction `t` of the edge length (0 =…
  Edge.tangentAt (method) — Unit tangent at fraction `t` of the edge length, pointing…
  Edge.center (method) — The point halfway along the edge (use `arcCenter` for a…
  Edge.bbox (method) — The box along the axes around the edge
  Edge.distanceTo (method) — Distance to a point, or to a body (see `Part.distanceTo`)
  Edge.continuity (method) — How the two faces of the edge meet, checked at…
  Edge.closestPoint (method) — The point of the edge nearest to `point`
  Edge.paramAtPoint (method) — Where on the edge the point nearest to `point` lies,…
  Edge.trim (method) — The part of the edge from `start` to `end`, each…
  Edge.split (method) — The edge cut in two at `at`, a fraction of…
  Edge.extend (method) — The edge made longer by `distance` at its `end` ('end',…
  Edge.intersections (method) — Points where this edge meets `other`
  Edge.intersectionParams (method) — Where this edge meets `other` (see `intersections`), as fractions of…
  Edge.selfIntersections (method) — Points where the edge crosses itself (a figure eight, a…
  Edge.curvatureAt (method) — The curvature at fraction `t` of the length (as `pointAt`)
  Edge.radiusAt (method) — The radius of curvature at fraction `t` of the length…
  Edge.minRadius (method) — The smallest radius of curvature of the edge (as `Face.minRadius`…
  Edge.minRadiusAt (method) — Where the edge bends most tightly (`minRadius`)
  Edge.inflections (method) — Where the edge changes the side it bends to (an…
  Edge.offset (method) — The edge moved `distance` sideways in its plane
  Edge.toArcs (method) — The edge as lines and circular arcs within `tolerance` of…
  Edge.through (method) — This edge bent to pass through `point` (and there in…
  Edge.match (method) — This edge with its ends moved to `start` and `end`…
  Edge.vertices (method) — The vertices at the edge's ends, start first (one for…
  Edge.edges (method) — This edge, in a list
  Edge.faces (method) — The faces of the body that meet at this edge…
  Edge.tangentChain (method) — This edge and the edges that continue it tangentially, through…
  Edge.reversed (method) — The same edge traversed the other way
  Edge.nurbs (method) — This edge as a NURBS curve, from its start to…
  Edge.fromNurbs (method) — The edge of a NURBS curve given by its data
  Edge.removeKnots (method) — The same curve with the knots it does not need…
  Edge.add (method) — A wire of this edge and the other (Python's `+`)
  Edge.equals (method)
  Edge.toString (method)
Face (class) [lines 237-423] [45 members] — A bounded piece of a surface, belonging to a body…
  Face.constructor (constructor)
  Face.owner (property) — The body this face belongs to
  Face.color (property) — The face's own color as [r, g, b] from 0…
  Face.name (property) — The face's name (`body.named(name, { faces })`, or from the…
  Face.cells (property) — The cells of its part that this face bounds, as…
  Face.geomType (property) — "plane", "cylinder", "cone", "sphere", "torus", "revolution", "extrusion", "bspline", "offset" or…
  Face.area (property) — The face's area
  Face.center (method) — Area centroid
  Face.interiorPoint (method) — A point guaranteed to lie on the face
  Face.normalAt (method) — Outward unit normal at the face point closest to `point`…
  Face.isPlanar (property) — True for planes and for flat B-spline faces (control points…
  Face.plane (property) — The face's plane
  Face.radius (property) — Radius of a cylinder, sphere or cone (at its base),…
  Face.majorRadius (property) — Major radius of a torus
  Face.coneAngle (property) — Half the opening angle of a cone, in degrees
  Face.axis (property) — Axis of a cylinder, cone, sphere, torus or surface of…
  Face.bbox (method) — The box along the axes around the face
  Face.distanceTo (method) — Distance to a point, or to a body (see `Part.distanceTo`)
  Face.closestPoint (method) — The point of the face nearest to `point` (within its…
  Face.uvAt (method) — The parameters `[u, v]` of the face's point nearest to…
  Face.positionAt (method) — The point of the face's surface at `(u, v)`, fractions…
  Face.curvatureAt (method) — The curvature of the face at its point nearest to…
  Face.minRadius (method) — The smallest radius of curvature on the face, `1 /…
  Face.nurbs (method) — The face's surface as a NURBS (`NurbsSurface`)
  Face.raycast (method) — Where a ray meets this face, nearest first (see `Part.raycast`)
  Face.project (method) — The curve projected onto this face along its normals
  Face.iso (method) — The curve of the face along which one of its…
  Face.wrap (method) — A drawing on XY wrapped onto this face, as a…
  Face.outerWire (method) — The face's outer boundary
  Face.innerWires (method) — The boundaries of the face's holes
  Face.wires (method) — The face's boundaries
  Face.edges (method) — The face's edges (seam edges only with `seams`)
  Face.vertices (method) — The face's vertices
  Face.faces (method) — This face, in a list
  Face.neighbors (method) — Faces sharing an edge with this one
  Face.toSketch (method) — A sketch holding a copy of this (planar) face
  Face.toShell (method) — A sheet body holding a copy of this face
  Face.offset (method) — A sheet of this face moved by `distance` along its…
  Face.split (method) — The pieces of this face cut along curves that lie…
  Face.flipped (method) — A copy of this face, turned over
  Face.untrimmed (method) — The whole surface this face lies on, as a sheet…
  Face.extend (method) — The face's surface grown past its sides, as a sheet…
  Face.extrude (method) — Extrude a planar face along its normal (see `Sketch.extrude`)
  Face.equals (method)
  Face.toString (method)
MassProperties (class) [lines 425-481] [14 members]
  MassProperties.mass (property) — The mass
  MassProperties.volume (property) — The volume (mm³)
  MassProperties.area (property) — The surface area (mm²)
  MassProperties.center (property) — The center of mass
  MassProperties.inertia (property) — The inertia tensor about the center of mass, axes parallel…
  MassProperties.density (property) — The density the mass was computed with
  MassProperties.constructor (constructor)
  MassProperties.principalMoments (property) — The principal moments of inertia, smallest first
  MassProperties.principalAxes (property) — The principal axes of inertia (directions), in the order of…
  MassProperties.radiiOfGyration (property) — The radius of gyration about each principal axis, `sqrt(moment /…
  MassProperties.inertiaAbout (method) — The inertia tensor about `point` (axes parallel to the world…
  MassProperties.momentAbout (method) — The moment of inertia about an axis (for example a…
  MassProperties.toString (method)
  MassProperties.[inspect] (method)

## Classes (3) — `api-classes-3.md`

Part (class) [lines 5-286] [49 members] — A solid
  Part.volume (property) — The part's volume (mm³)
  Part.area (property) — Total surface area
  Part.center (method) — Center of mass (uniform density)
  Part.massProperties (method) — Mass, center of mass and inertia tensor for a uniform…
  Part.isValid (method) — True if the part is a closed, manifold solid that…
  Part.solids (method) — The separate bodies of this part
  Part.shells (method) — The closed sheets that bound the part, each a `Shell`…
  Part.voids (method) — The cavities of the part (closed spaces inside it, kernel…
  Part.info (method) — Counts and measures in one object
  Part.merge (method) — This part and others as one part made of cells
  Part.sources (property) — For a cell of a merged part (see `cells`)
  Part.cells (method) — The cells of a part made by `merge`, each as…
  Part.classify (method) — Where a point lies
  Part.contains (method) — True if the point lies in the material of this…
  Part.cellAt (method) — The cell of a merged part (see `merge`) that holds…
  Part.fuse (method) — Union with other parts (Python's `+`)
  Part.cut (method) — Subtract other parts (Python's `-`)
  Part.intersect (method) — Keep only the volume shared with the other parts (Python's…
  Part.fillet (method) — Round edges
  Part.filletPreview (method) — The surfaces of the rounds a fillet of `edges` with…
  Part.chamfer (method) — Bevel edges
  Part.shell (method) — Hollow the part out to walls of `thickness`, removing the…
  Part.offset (method) — Grow (positive) or shrink (negative) the part by `distance` everywhere…
  Part.split (method) — Cut the part with a plane or along a sheet
  Part.imprint (method) — The part with its faces split where a tool crosses…
  Part.section (method) — The cross-section of the part in a plane, as a…
  Part.slices (method) — Sections (`section`) across `axis`, `step` apart
  Part.fromMesh (method) — A faceted part of a closed mesh (see `Mesh.toPart`)
  Part.twist (method) — Twist about an axis (default Z) by `angle` degrees over…
  Part.taper (method) — Scale cross-sections toward an axis (default Z) from 1 to…
  Part.bend (method) — Bend around an axis by `angle` degrees (default
  Part.unroll (method) — Unroll this part from around an axis (default Z) into…
  Part.deform (method) — Deform with a `Lattice` (same as `lattice.apply(part)`)
  Part.removeFillets (method) — The part with fillets taken out and their edges sharp…
  Part.removeFaces (method) — The part with `faces` (a hole, a boss, a pocket)…
  Part.draftAnalysis (method) — Draft angle of every face for the pull direction, with…
  Part.partingLine (method) — The closed lines where the part's surface turns from facing…
  Part.draft (method) — Tilt faces by a draft angle, so that a molded…
  Part.moveFaces (method) — Move faces of the part, and extend or trim the…
  Part.offsetFaces (method) — Offset faces of the part along their normals by `distance`,…
  Part.push (method) — Push or pull a face at a point
  Part.warp (method) — Raise or sink a region of a face
  Part.flatten (method) — Press a region of a face onto a plane
  Part.fold (method) — Fold this sheet along a line on its top or…
  Part.flange (method) — Add a flange along a straight outer edge of this…
  Part.bends (method) — The bends of this sheet metal part (see `bends`)
  Part.unfold (method) — This sheet metal part unfolded flat (see `unfold`)
  Part.flatPattern (method) — The flat pattern of this sheet metal part on XY…
  Part.toString (method)
Problem (class) [lines 288-319] [10 members] — Something the kernel's validity checks find wrong with a body…
  Problem.shape (property) — The face, edge or vertex the problem is about, or…
  Problem.message (property) — What is wrong, with the value measured and the tolerance…
  Problem.value (property) — The value measured (a gap, a distance, an angle), or…
  Problem.tolerance (property) — The tolerance it was held against, or `null`
  Problem.category (property) — The kind of test
  Problem.test (property) — The test's short name (`"Bad Gap"`, `"Bad Loop Connection Vertex"`)
  Problem.other (property) — A second face, edge or vertex the test compared with,…
  Problem.constructor (constructor)
  Problem.toString (method)
  Problem.[inspect] (method)
SectionProperties (class) [lines 321-382] [14 members] — Section properties of a planar region (see `Sketch.sectionProperties`)
  SectionProperties.area (property) — The region's area (mm²)
  SectionProperties.centroid (property) — The centroid of the region
  SectionProperties.plane (property) — The sketch plane moved to the centroid
  SectionProperties.ixx (property) — The second moment of area about the plane's x axis,…
  SectionProperties.iyy (property) — The second moment of area about the plane's y axis,…
  SectionProperties.ixy (property) — The product of area, ∫ x y dA (mm⁴)
  SectionProperties.constructor (constructor)
  SectionProperties.polar (property) — The polar moment about the centroid, `ixx + iyy` (the…
  SectionProperties.principalMoments (property) — The second moments about the principal axes through the centroid,…
  SectionProperties.principalAxes (property) — Unit directions (in world coordinates, in the plane) of the…
  SectionProperties.radiiOfGyration (property) — `[sqrt(ixx / area), sqrt(iyy / area)]`
  SectionProperties.sectionModuli (property) — The elastic section moduli `[ixx / c_y, iyy / c_x]`,…
  SectionProperties.toString (method)
  SectionProperties.[inspect] (method)
Shape (class) [lines 384-458] [18 members] — Base class of all shapes
  Shape.vertices (method) — All vertices of this shape
  Shape.edges (method) — All edges of this shape
  Shape.wires (method) — All wires (closed edge loops of faces, or the shape…
  Shape.faces (method) — All faces of this shape
  Shape.moved (method) — A copy of this shape moved by a location (`location.mul(shape)`)
  Shape.translate (method) — A copy moved by `(x, y, z)`
  Shape.rotate (method) — A copy rotated by `angle` degrees about `axis`
  Shape.mirror (method) — A mirrored copy (reflection in `plane`, a plane or a…
  Shape.scale (method) — A scaled copy
  Shape.on (method) — Place this shape, designed around the world XY plane, onto…
  Shape.bbox (method) — Tight axis-aligned bounding box
  Shape.center (method) — Center of mass (centroid) of the shape
  Shape.distanceTo (method) — Minimum distance to a point (and, for bodies, to another…
  Shape.mesh (method) — Triangulate the shape (see `tessellate`
  Shape.show (method) — Show the shape in the viewer (see `show`)
  Shape.export (method) — Write the shape to a file
  Shape.toString (method)
  Shape.[inspect] (method)

## Classes (4) — `api-classes-4.md`

ShapeList (class) [lines 5-242] [58 members] — A list of shapes with selection helpers
  ShapeList.one (method) — The only element
  ShapeList.first (property) — The first shape
  ShapeList.at (method) — The shape at `index` (Array's `at`
  ShapeList.last (property) — The last shape
  ShapeList.sortBy (method) — Sort by position along an axis, by "length"/"area"/"volume"/"radius", or by…
  ShapeList.filterBy (method) — `parallelTo(axis)`, `ofType(name)` or `filter(predicate)`, depending on the argument
  ShapeList.sortByDistance (method) — The shapes by the distance of their centers from a…
  ShapeList.groupBy (method) — Group shapes with equal key (within `tolerance`), groups in ascending…
  ShapeList.maxBy (method) — The shapes with the largest key (all of them, if…
  ShapeList.minBy (method) — The shapes with the smallest key (all of them, if…
  ShapeList.top (method) — Highest shapes (largest Z)
  ShapeList.bottom (method) — Lowest shapes (smallest Z)
  ShapeList.right (method) — Shapes furthest along +X
  ShapeList.left (method) — Shapes furthest along -X
  ShapeList.back (method) — Shapes furthest along +Y
  ShapeList.front (method) — Shapes furthest along -Y
  ShapeList.largest (method) — The biggest shape by volume, area or length
  ShapeList.smallest (method) — The smallest shape by volume, area or length
  ShapeList.nearest (method) — The shape whose center is closest to `point`
  ShapeList.filter (method) — Keep the shapes for which `predicate(shape)` is true
  ShapeList.map (method) — A plain array of what `fn` gives for each shape
  ShapeList.ofType (method) — Keep shapes of the given geometry types, e.g
  ShapeList.lines (method) — Straight edges (also straight B-spline edges, such as the edges…
  ShapeList.circles (method) — Circular edges (full circles and arcs)
  ShapeList.planar (method) — Planar faces (also flat B-spline faces)
  ShapeList.cylinders (method) — Cylindrical faces
  ShapeList.parallelTo (method) — Straight edges along `axis`, or planar faces whose normal is…
  ShapeList.perpendicularTo (method) — Straight edges perpendicular to `axis`, or planar faces containing it
  ShapeList.facing (method) — Faces whose outward normal points along `direction` (within `maxAngle` degrees)
  ShapeList.convex (method) — Edges on outside corners (material angle below 180 degrees), and…
  ShapeList.concave (method) — Edges on inside corners (material angle above 180 degrees), and…
  ShapeList.smooth (method) — Edges where two faces meet tangentially, such as the borders…
  ShapeList.tangentChain (method) — The edges of the list and the edges that continue…
  ShapeList.g1 (method) — Edges whose two faces meet at least tangentially all along…
  ShapeList.g2 (method) — Edges whose two faces meet with equal curvature as well…
  ShapeList.fillets (method) — Fillet faces
  ShapeList.hitBy (method) — The faces (or bodies) of the list that a ray…
  ShapeList.within (method) — Shapes whose bounding box lies inside `box`
  ShapeList.atPoint (method) — Shapes passing through `point` (vertices at, edges/faces touching it), at…
  ShapeList.newSince (method) — The faces or edges that are new since the given…
  ShapeList.derivedFrom (method) — The faces or edges that descend from the given shapes
  ShapeList.joining (method) — The edges that lie on the surfaces of both `a`…
  ShapeList.shared (method) — The faces that lie between two cells of a merged…
  ShapeList.union (method) — The shapes of both lists, each once (Python's `|`)
  ShapeList.difference (method) — The shapes not in `other` (Python's `-`)
  ShapeList.intersection (method) — The shapes also in `other` (Python's `&`)
  ShapeList.vertices (method) — The vertices of all the shapes, each once
  ShapeList.edges (method) — The edges of all the shapes, each once
  ShapeList.faces (method) — The faces of all the shapes, each once
  ShapeList.wires (method) — The wires of all the shapes
  ShapeList.center (method) — Average of the members' centers
  ShapeList.bbox (method) — The box around all the shapes
  ShapeList.moved (method) — Each shape moved by a location
  ShapeList.on (method) — Every shape placed onto a plane or face (see `Shape.on`)
  ShapeList.translate (method) — Each shape moved by `(x, y, z)`
  ShapeList.rotate (method) — Each shape rotated about an axis by `angle` degrees
  ShapeList.toString (method) — Returns a string representation of an array
  ShapeList.[inspect] (method)
Shell (class) [lines 244-345] [17 members] — A sheet body
  Shell.fromNurbs (method) — The sheet of a NURBS surface given by its data
  Shell.area (property) — The total area of the faces
  Shell.center (method) — The center of the faces' area (each face weighted by…
  Shell.thicken (method) — Turn the sheet into a solid of `thickness` (along the…
  Shell.offset (method) — The sheet moved by `distance` along its face normals (a…
  Shell.trim (method) — Cut the sheet along curves that lie on it, and…
  Shell.flipped (method) — The sheet turned over
  Shell.extend (method) — The sheet (of one face) grown past its sides
  Shell.matchEdge (method) — The sheet with an edge moved onto a curve
  Shell.mergeFaces (method) — The sheet with two faces made one
  Shell.push (method) — Push or pull a face of the sheet at a…
  Shell.warp (method) — Raise or sink a region of a face of the…
  Shell.flatten (method) — Press a region of a face of the sheet onto…
  Shell.fuse (method) — Union with other sheets (Python's `+`)
  Shell.cut (method) — The sheet trimmed by parts
  Shell.intersect (method) — The sheet trimmed by parts
  Shell.toString (method)
Sketch (class) [lines 347-441] [18 members] — A planar region (with holes, possibly several pieces) on a…
  Sketch.flipped (method) — The sketch turned over
  Sketch.plane (property) — The sketch plane
  Sketch.fuse (method) — The union with other sketches (Python's `+`)
  Sketch.cut (method) — The region less other sketches (Python's `-`)
  Sketch.intersect (method) — The region common to this and other sketches (Python's `&`)
  Sketch.xor (method) — The region in exactly one of the sketches (Python's `^`)
  Sketch.center (method) — Area centroid of the region
  Sketch.perimeter (property) — Total length of the boundary
  Sketch.sectionProperties (method) — Area, centroid and second moments of area of the region…
  Sketch.offset (method) — Grow (positive `distance`) or shrink (negative) the region
  Sketch.fillet (method) — Round corners of the region with tangent arcs of `radius`
  Sketch.chamfer (method) — Bevel corners of the region
  Sketch.mirror (method) — A mirrored copy
  Sketch.extrude (method) — Extrude the region into a solid
  Sketch.revolve (method) — Revolve the region about an axis in its plane
  Sketch.sweep (method) — Sweep the region along a path (see `sweep`
  Sketch.swing (method) — Swing the region around an outline
  Sketch.toString (method)
Vertex (class) [lines 443-498] [16 members] — A point
  Vertex.constructor (constructor)
  Vertex.point (property) — Where the vertex is
  Vertex.x (property) — The vertex's x coordinate
  Vertex.y (property) — The vertex's y coordinate
  Vertex.z (property) — The vertex's z coordinate
  Vertex.tolerance (property) — How far the edges and faces that meet at this…
  Vertex.center (method) — Where the vertex is (as `point`)
  Vertex.bbox (method) — A box of size 0 at the vertex
  Vertex.vertices (method) — This vertex, in a list
  Vertex.edges (method) — The edges of the body that meet at this vertex…
  Vertex.faces (method) — The faces of the body that meet at this vertex…
  Vertex.distanceTo (method) — The distance to a point or to a shape
  Vertex.convexity (property) — For a corner of a sketch
  Vertex.equals (method)
  Vertex.[Symbol.iterator] (method)
  Vertex.toString (method)

## Classes (5) — `api-classes-5.md`

Wire (class) [lines 5-143] [32 members] — A chain of edges, open or closed
  Wire.constructor (constructor)
  Wire.dispose (method) — Frees the kernel's curves of the wire's standalone edges now…
  Wire.[Symbol.dispose] (method)
  Wire.edges (method) — The wire's edges, in order
  Wire.vertices (method) — The vertices of the wire's edges, each once
  Wire.wires (method) — This wire, in a list
  Wire.isClosed (property) — True if the wire ends where it starts
  Wire.start (property) — The point where the wire's first edge starts
  Wire.end (property) — The point where the wire's last edge ends
  Wire.length (property) — The sum of the edges' lengths
  Wire.center (method) — Length-weighted average of the edge midpoints
  Wire.bbox (method) — The box along the axes around the wire
  Wire.pointAt (method) — Point at fraction `t` of the total length
  Wire.tangentAt (method) — The direction of the wire (length 1) at `t`, a…
  Wire.distanceTo (method) — Distance to a point, or to a body (see `Part.distanceTo`)
  Wire.split (method) — The wire cut in two at `at`, a fraction of…
  Wire.trim (method) — The part of the wire from `start` to `end`, each…
  Wire.intersections (method) — Points where this wire meets `other` (see `Edge.intersections`), in order…
  Wire.toEdge (method) — The wire as one edge
  Wire.offset (method) — The wire moved `distance` sideways in its plane, as a…
  Wire.toArcs (method) — The wire as lines and circular arcs within `tolerance` (see…
  Wire.minRadius (method) — The smallest radius of curvature of the wire's edges
  Wire.minRadiusAt (method) — Where the wire bends most tightly (`minRadius`)
  Wire.closestPoint (method) — The point of the wire nearest to `point`
  Wire.continuity (method) — How the edges of the wire meet at its joints…
  Wire.close (method) — This wire closed with a straight line from its end…
  Wire.reversed (method) — The wire run the other way
  Wire.add (method) — A wire of this one and the other (Python's `+`)
  Wire.plane (method) — The plane of a planar wire (normal by the right-hand…
  Wire.fillet (method) — Round corners with tangent arcs of `radius`
  Wire.toSketch (method) — The planar region bounded by this closed wire
  Wire.toString (method)
Mesh (class) [lines 145-282] [34 members]
  Mesh.vertices (property) — The points, an array of [x, y, z]
  Mesh.triangles (property) — The triangles, as indices into `vertices`
  Mesh.normals (property) — A normal at each point, or null
  Mesh.constructor (constructor)
  Mesh.length (property) — The number of triangles (Python's `len(mesh)`)
  Mesh.dispose (method) — Frees the kernel's copy of the mesh now, if it…
  Mesh.[Symbol.dispose] (method)
  Mesh.triangleNormals (property) — One unit normal per triangle (x, y, z each)
  Mesh.area (property) — The total area of the triangles
  Mesh.volume (property) — Enclosed volume (meaningful for closed meshes)
  Mesh.bbox (method) — The box along the axes around the mesh's points
  Mesh.center (method) — The middle of the bounding box (`centroid` is the center…
  Mesh.centroid (property) — The center of mass of the volume a closed mesh…
  Mesh.massProperties (method) — Mass, center of mass and inertia tensor of the volume…
  Mesh.moved (method) — A copy placed by `location`
  Mesh.translate (method) — A copy moved by `(x, y, z)`
  Mesh.rotate (method) — A copy rotated by `angle` degrees about `axis`
  Mesh.mirror (method) — A mirrored copy (reflection in `plane`, a plane or a…
  Mesh.scale (method) — A scaled copy
  Mesh.raycast (method) — Where a ray meets the mesh's triangles, nearest first (`Hit`
  Mesh.raycastMany (method) — The first hit of each of many rays, one per…
  Mesh.isClosed (method) — True if every edge of the mesh is shared by…
  Mesh.section (method) — Where the plane cuts the mesh
  Mesh.slices (method) — Sections (`section`) across `axis`, `step` apart
  Mesh.decimate (method) — A mesh with fewer triangles, as near to this one…
  Mesh.fillHoles (method) — A copy with every hole closed
  Mesh.repaired (method) — A repaired copy and what was done
  Mesh.toPart (method) — A faceted part of a closed mesh
  Mesh.fuse (method) — The kernel's mesh union (Python's `+`)
  Mesh.cut (method) — The kernel's mesh difference (Python's `-`)
  Mesh.intersect (method) — The kernel's mesh intersection (Python's `&`)
  Mesh.export (method) — Write the mesh to a file (stl, obj, glb, ...
  Mesh.toString (method)
  Mesh.[inspect] (method)
RepairReport (class) [lines 284-306] [7 members] — What `Mesh.repaired` did
  RepairReport.mergedVertices (property) — Points that lay on each other (to 1e-9 of the…
  RepairReport.removedTriangles (property) — Triangles without an area, and repeated ones, left out
  RepairReport.flippedTriangles (property) — Triangles turned to face the way their neighbours face (a…
  RepairReport.filledHoles (property) — Holes filled (as `Mesh.fillHoles`)
  RepairReport.openHoles (property) — Borders that do not close on themselves, left open
  RepairReport.openEdges (property) — Edges of the result not shared by two triangles
  RepairReport.constructor (constructor)
Profile (class) [lines 308-387] [19 members] — A pen that draws an outline in the XY plane,…
  Profile.constructor (constructor)
  Profile.point (property) — Where the pen is
  Profile.start (property) — Where the drawing started
  Profile.heading (property) — The direction the pen moves in, degrees counterclockwise from +X…
  Profile.length (property) — The number of segments drawn (Python's `len(profile)`)
  Profile.lineTo (method) — A straight line to a point
  Profile.lineBy (method) — A straight line by an offset from the pen
  Profile.forward (method) — A straight line along the heading
  Profile.turn (method) — Turn the heading by `angle` degrees (positive
  Profile.turnTo (method) — Set the heading (degrees counterclockwise from +X) without drawing
  Profile.arc (method) — A tangent arc of `radius` that turns the heading by…
  Profile.arcTo (method) — An arc to an end point
  Profile.fillet (method) — Round the corner at the pen with a tangent arc…
  Profile.chamfer (method) — Bevel the corner at the pen
  Profile.mirror (method) — Continue with the mirror image of the path drawn so…
  Profile.close (method) — The region inside the outline, as a Sketch on XY
  Profile.wire (method) — The path as drawn, as an open Wire of exact…
  Profile.toString (method)
  Profile.[inspect] (method)
Font (class) [lines 389-432] [13 members] — One font
  Font.path (property) — The font file (null for a font given as bytes)
  Font.name (property) — The full name of the font ("Lato Regular")
  Font.unitsPerEm (property)
  Font.numGlyphs (property)
  Font.capHeight (property) — Height of the capital letters in font units
  Font.constructor (constructor)
  Font.toString (method)
  Font.glyphIndex (method) — The glyph of a character, or null when the font…
  Font.characters (method) — Every character the font maps to a glyph
  Font.advance (method) — Advance width of a glyph in font units
  Font.kerning (method) — The kerning of two neighbouring glyphs
  Font.kerningSource (property) — "GPOS", "kern" or null
  Font.outline (method) — The contours of a glyph in font units (empty for…
FontError (class) [lines 434-438] [1 members] — The data is not a font this reader can use…
  FontError.constructor (constructor)
Locations (class) [lines 440-468] [8 members]
  Locations.[Symbol.species] (property)
  Locations.constructor (constructor)
  Locations.mul (method) — Each location applied to something
  Locations.moved (method) — The pattern moved by a location (`location.mul(pattern)`)
  Locations.on (method) — The pattern placed onto a plane or face
  Locations.points (property) — Where the locations move the origin to
  Locations.toString (method) — Returns a string representation of an array
  Locations.[inspect] (method)
Lattice (class) [lines 470-558] [15 members] — A grid of control points around a part for free-form…
  Lattice.points (property) — The world positions of the points, `points[i][j][k]` = `[x, y,…
  Lattice.constructor (constructor)
  Lattice.counts (property) — Points per direction (X, Y, Z)
  Lattice.box (property) — The box the points started on
  Lattice.rest (property) — The starting positions (read-only)
  Lattice.offsets (property) — How far each point was moved (`points - rest`)
  Lattice.layer (method) — The points of one layer across an axis, as a…
  Lattice.move (method) — Move the selected points by `offset`
  Lattice.scale (method) — Scale the selected points about `center` (default
  Lattice.rotate (method) — Turn the selected points by `angle` degrees about `axis`
  Lattice.reset (method) — Put every point back where it started
  Lattice.copy (method) — An independent copy
  Lattice.map (method) — Where the lattice moves a point
  Lattice.apply (method) — Deform a part (or a shell) with the lattice
  Lattice.toString (method)
FitReport (class) [lines 560-574] [4 members] — How far the points given to `surface` lie from the…
  FitReport.maxDistance (property) — The largest distance of a point from the surface, to…
  FitReport.rmsDistance (property) — The root mean square of the distances
  FitReport.distances (property) — The distance of each point, in the order given (a…
  FitReport.constructor (constructor)
StitchReport (class) [lines 576-595] [6 members] — What `stitch` sewed (`stitch(..., { report
  StitchReport.sewnEdges (property) — Pairs of free edges sewn into one edge
  StitchReport.openEdges (property) — Free edges left
  StitchReport.maxGap (property) — The widest gap closed, between vertices or edges that were…
  StitchReport.turnedFaces (property) — Faces turned over so that their normals agree with their…
  StitchReport.tolerance (property) — The widest gap stitch looked for
  StitchReport.constructor (constructor)
Bend (class) [lines 597-631] [13 members] — One bend of a sheet metal part
  Bend.angle (property)
  Bend.radius (property)
  Bend.thickness (property)
  Bend.kFactor (property)
  Bend.length (property)
  Bend.axis (property)
  Bend.line (property)
  Bend.direction (property)
  Bend.constructor (constructor)
  Bend.allowance (property) — The bend allowance (the width of the bend's strip in…
  Bend.equals (method) — Equal fields (Python's dataclass `==`)
  Bend.toString (method)
  Bend.[inspect] (method)
FlatPattern (class) [lines 633-664] [11 members] — The unfolded part, laid on the XY plane
  FlatPattern.part (property)
  FlatPattern.outline (property)
  FlatPattern.bends (property)
  FlatPattern.thickness (property)
  FlatPattern.kFactor (property)
  FlatPattern.constructor (constructor)
  FlatPattern.bendLines (property) — The bend lines (middle of each bend's strip), at z…
  FlatPattern.size (property) — Size of the blank
  FlatPattern.equals (method) — Equal fields (Python's dataclass `==`)
  FlatPattern.toString (method)
  FlatPattern.[inspect] (method)

## Classes (6) — `api-classes-6.md`

StepModel (class) [lines 5-32] [10 members] — Everything `readStep` reads from a STEP file
  StepModel.bodies (property)
  StepModel.frames (property)
  StepModel.curves (property)
  StepModel.points (property)
  StepModel.skipped (property)
  StepModel.constructor (constructor)
  StepModel.frame (method) — The coordinate system called `name` as a `Plane`
  StepModel.equals (method)
  StepModel.toString (method)
  StepModel.[inspect] (method)
StepCurve (class) [lines 34-56] [8 members] — A curve of a STEP file that belongs to no…
  StepCurve.name (property)
  StepCurve.shape (property)
  StepCurve.product (property)
  StepCurve.color (property) — [r, g, b] from 0 to 1, or null
  StepCurve.constructor (constructor)
  StepCurve.equals (method)
  StepCurve.toString (method)
  StepCurve.[inspect] (method)
StepFrame (class) [lines 58-83] [9 members] — A coordinate system of a STEP file (a named `AXIS2_PLACEMENT_3D`)…
  StepFrame.name (property)
  StepFrame.plane (property)
  StepFrame.product (property)
  StepFrame.color (property) — [r, g, b] from 0 to 1, or null
  StepFrame.constructor (constructor)
  StepFrame.location (property) — The placement that moves the world origin onto this coordinate…
  StepFrame.equals (method)
  StepFrame.toString (method)
  StepFrame.[inspect] (method)
StepPoint (class) [lines 85-107] [8 members] — A point of a STEP file that belongs to no…
  StepPoint.name (property)
  StepPoint.point (property)
  StepPoint.product (property)
  StepPoint.color (property) — [r, g, b] from 0 to 1, or null
  StepPoint.constructor (constructor)
  StepPoint.equals (method)
  StepPoint.toString (method)
  StepPoint.[inspect] (method)
DrawingView (class) [lines 109-131] [8 members] — One view of a drawing (see `drawingViews`)
  DrawingView.name (property)
  DrawingView.direction (property)
  DrawingView.visible (property)
  DrawingView.hidden (property)
  DrawingView.constructor (constructor)
  DrawingView.bbox (method) — The box around the view's lines
  DrawingView.toString (method)
  DrawingView.[inspect] (method)
ImageDiff (class) [lines 133-168] [9 members] — The result of `diffImages`
  ImageDiff.changed (property)
  ImageDiff.total (property)
  ImageDiff.fraction (property)
  ImageDiff.bbox (property)
  ImageDiff.picture (property)
  ImageDiff.constructor (constructor)
  ImageDiff.save (method) — Write the picture of the difference as a PNG file…
  ImageDiff.toString (method)
  ImageDiff.[inspect] (method)
Picture (class) [lines 170-195] [9 members] — A render
  Picture.data (property)
  Picture.pixels (property)
  Picture.width (property)
  Picture.height (property)
  Picture.frame (property)
  Picture.constructor (constructor)
  Picture.save (method) — Write the PNG file (Node)
  Picture.toString (method)
  Picture.[inspect] (method)
KernelError (class) [lines 197-213] [6 members] — An SMLib operation failed
  KernelError.operation (property)
  KernelError.status (property)
  KernelError.detail (property)
  KernelError.hint (property)
  KernelError.trace (property) — Where the kernel gave up (see the class)
  KernelError.constructor (constructor)
ModelingError (class) [lines 215-219] [1 members] — A modeling operation cannot be done (for example a fillet…
  ModelingError.constructor (constructor)
PairAdjustment (class) [lines 221-236] [6 members] — Kerning of two neighbouring glyphs in font units
  PairAdjustment.advance1 (property)
  PairAdjustment.placement1 (property)
  PairAdjustment.advance2 (property)
  PairAdjustment.placement2 (property)
  PairAdjustment.constructor (constructor)
  PairAdjustment.toString (method)
DraftAnalysis (class) [lines 238-283] [14 members] — The draft of every face of a part for one…
  DraftAnalysis.direction (property)
  DraftAnalysis.minAngle (property)
  DraftAnalysis.faces (property)
  DraftAnalysis.constructor (constructor)
  DraftAnalysis.positive (property) — Faces with at least `minAngle` of draft everywhere
  DraftAnalysis.insufficient (property) — Faces with less than `minAngle` of draft somewhere, but nowhere…
  DraftAnalysis.vertical (property) — Faces parallel to the pull direction (no draft)
  DraftAnalysis.undercut (property) — Faces that turn away from the pull direction somewhere (negative…
  DraftAnalysis.ok (property) — True if every face has at least `minAngle` of draft
  DraftAnalysis.angles (method) — The least and the greatest draft angle of a face…
  DraftAnalysis.[Symbol.iterator] (method)
  DraftAnalysis.length (property) — The number of faces (Python's `len`)
  DraftAnalysis.toString (method)
  DraftAnalysis.[inspect] (method)
FaceDraft (class) [lines 285-306] [8 members] — The draft of one face
  FaceDraft.face (property)
  FaceDraft.minAngle (property)
  FaceDraft.maxAngle (property)
  FaceDraft.kind (property)
  FaceDraft.constructor (constructor)
  FaceDraft.equals (method)
  FaceDraft.toString (method)
  FaceDraft.[inspect] (method)

## Functions — `api-functions.md`

Pos (function) [lines 5-7] — A translation
Rot (function) [lines 9-11] — A rotation in degrees about the world X, then Y,…
faceMeshes (function) [lines 13-15] — One mesh per face of a part, shell or sketch…
tessellate (function) [lines 17-25] — Triangulate a shape
Bezier (function) [lines 27-31] — A Bézier curve (rational if `weights` are given) from its…
CenterArc (function) [lines 33-36] — An arc around `center` starting at `startAngle` and spanning `arcSize`…
ConicArc (function) [lines 38-41] — A conic arc from `start` to `end`, tangent there to…
EllipticalArc (function) [lines 43-46] — An ellipse (or elliptical arc) around `center` in `plane`
FilletPolyline (function) [lines 48-53] — A polyline whose corners are rounded with `radius`
Helix (function) [lines 55-63] — A helix around `direction` through `center`
HyperbolicArc (function) [lines 65-68] — A piece of the hyperbola `x²/xRadius² - y²/yRadius² = 1`,…
Line (function) [lines 70-72] — A straight edge from `start` to `end`
ParabolicArc (function) [lines 74-77] — A piece of the parabola `y = x² / (4…
PolarLine (function) [lines 79-81] — A line of `length` leaving `start` at `angle` degrees from…
Polyline (function) [lines 83-87] — Straight segments through the points
RadiusArc (function) [lines 89-92] — The shorter arc of `radius` from `start` to `end` in…
SagittaArc (function) [lines 94-96] — An arc from `start` to `end` whose middle is `sagitta`…
Spiral (function) [lines 98-103] — A flat (Archimedean) spiral around the plane's origin
Spline (function) [lines 105-111] — A smooth cubic curve through the points
TangentArc (function) [lines 113-115] — An arc from `start` to `end` leaving `start` along `tangent`
ThreePointArc (function) [lines 117-119] — The circular arc from `start` through `through` to `end`
fitCurve (function) [lines 121-132] — A smooth curve near many points, with as few control…
makeCompatible (function) [lines 134-137] — Copies of the curves as B-splines of one degree and…
ArcSlot (function) [lines 139-141] — A slot along an arc around the origin
Circle (function) [lines 143-147] — A disk of `radius`
Ellipse (function) [lines 149-151] — An ellipse with semi-axes `xRadius` and `yRadius`, turned by `rotation`…
Hull (function) [lines 153-156] — The convex hull of points and shapes
Polygon (function) [lines 158-160] — The polygon through the points (closed automatically)
Rectangle (function) [lines 162-165] — A `width` (X) by `height` (Y) rectangle
RegularPolygon (function) [lines 167-172] — A regular polygon with `sides` corners
RoundedRectangle (function) [lines 174-178] — A rectangle with rounded corners
Slot (function) [lines 180-182] — An obround slot `length` long overall (round ends included) and…
Stroke (function) [lines 184-190] — The region a pen `width` wide covers along a path
Trapezoid (function) [lines 192-194] — A trapezoid with a base of `width`
Triangle (function) [lines 196-201] — A triangle with a base of `width` along X and…
makeFace (function) [lines 203-205] — The planar region inside a closed wire, minus the regions…
Text (function) [lines 207-210] — Lettering as a sketch in the XY plane, with the…
loadFont (function) [lines 212-215] — The font `source`, read once and kept
AnnularSector (function) [lines 217-221] — A sector of a tube along Z
Box (function) [lines 223-227] — A box of `length` (X) by `width` (Y) by `height`…
Cone (function) [lines 229-234] — A cone (or frustum) along Z
CounterBoreHole (function) [lines 236-238] — A drilling tool with a counterbore at the top
CounterSinkHole (function) [lines 240-242] — A drilling tool with a conical countersink of included `angle`…
Cylinder (function) [lines 244-250] — A cylinder along Z
Hole (function) [lines 252-254] — A drilling tool
Pyramid (function) [lines 256-260] — A pyramid
Sphere (function) [lines 262-270] — A sphere, or a part of one
Torus (function) [lines 272-280] — A torus around Z
Wedge (function) [lines 282-286] — A ramp
GridLocations (function) [lines 288-292] — A rectangular grid in the XY plane, centered on the…
HexLocations (function) [lines 294-298] — A honeycomb pattern
PolarLocations (function) [lines 300-307] — `count` locations on a circle of `radius` in the XY…
chamfer (function) [lines 309-313] — Bevel edges of the part they belong to (see `Part.chamfer`),…
cut (function) [lines 315-319] — A body less others, Python's `a - b` (see `Part.cut`,…
draft (function) [lines 321-323] — Tilt faces by a draft angle about a neutral plane…
extend (function) [lines 325-334] — Extend a sheet or a face past its edges (options…
extrude (function) [lines 336-340] — Extrude a sketch, a planar face or a closed wire…
fillet (function) [lines 342-346] — Round edges of the part they belong to (see `Part.fillet`),…
filletPreview (function) [lines 348-352] — The surfaces of a fillet's rounds as untrimmed sheets, the…
flatten (function) [lines 354-361] — Press a region of a face onto a plane (see…
fuse (function) [lines 363-367] — Union of bodies, Python's `a + b` (see `Part.fuse`, `Shell.fuse`,…
imprint (function) [lines 369-373] — The part's faces split where a tool crosses them (see…
intersect (function) [lines 375-380] — What bodies share, Python's `a & b` (see `Part.intersect`, `Shell.intersect`,…
intersectionCurves (function) [lines 382-384] — The curves where a body meets another, a face or…
loft (function) [lines 386-391] — A solid through a sequence of cross sections, or a…
matchEdge (function) [lines 393-397] — An edge of a sheet moved onto a curve (see…
merge (function) [lines 399-401] — Parts as one part made of cells
mergeFaces (function) [lines 403-405] — Two faces of a sheet that share a side made…
mirror (function) [lines 407-409] — A mirrored copy of a shape
moveFaces (function) [lines 411-413] — Move faces by a vector or a location, the part…
offset (function) [lines 415-431] — Grow or shrink a part or a sketch by `distance`…
offsetFaces (function) [lines 433-435] — Offset faces along their normals, the part rebuilt around them…
outline (function) [lines 437-449] — The lines of a view of a body, also its…
partingLine (function) [lines 451-453] — The parting lines of a part for a pull direction…
project (function) [lines 455-460] — A curve projected onto a body along a direction (see…
push (function) [lines 462-465] — A smooth dent or bump in a face at a…
removeFaces (function) [lines 467-471] — The part with a hole, a boss or a pocket…
removeFillets (function) [lines 473-478] — The part with fillets taken out and their edges sharp…

## Functions (2) — `api-functions-2.md`

revolve (function) [lines 5-9] — Revolve a sketch about an axis into a solid (see…
scale (function) [lines 11-13] — A scaled copy of a shape or a mesh, about…
section (function) [lines 15-17] — Cross-section of a part (see `Part.section`)
shell (function) [lines 19-25] — Hollow out a part (see `Part.shell`)
silhouette (function) [lines 27-29] — The contour of a body seen along a direction (see…
slices (function) [lines 31-34] — Sections of a part (sketches) or a mesh (wires) every…
split (function) [lines 36-46] — Cut a part with a plane or along a sheet…
sweep (function) [lines 48-54] — Sweep a profile along a path
swing (function) [lines 56-62] — Swing a profile around an outline
thicken (function) [lines 64-68] — Turn a face or sheet into a solid of `thickness`…
trim (function) [lines 70-74] — Trim a sheet with curves on it, keeping a side…
warp (function) [lines 76-83] — Raise or sink a region of a face (see `Part.warp`,…
xor (function) [lines 85-87] — The region in exactly one of the sketches, Python's `a…
setGuardBooleans (function) [lines 89-91] — Sets GUARD_BOOLEANS (Python's `smlibpy.defeature.GUARD_BOOLEANS = on`)
setGuardSeconds (function) [lines 93-95] — Sets GUARD_SECONDS (Python's `smlibpy.defeature.GUARD_SECONDS = seconds`)
bend (function) [lines 97-108] — Bend a part around an axis by `angle` degrees, like…
deform (function) [lines 110-129] — Deform a part, a sheet, a curve or points with…
taper (function) [lines 131-142] — Taper a part along an axis
twist (function) [lines 144-155] — Twist a part about an axis by `angle` degrees over…
unroll (function) [lines 157-167] — Unroll a part wrapped around an axis into a flat…
blend (function) [lines 169-181] — A smooth bridge between free edges of two sheets
fill (function) [lines 183-191] — A surface that fills a closed loop of curves
network (function) [lines 193-199] — A surface through a network of curves
nurbsSurface (function) [lines 201-213] — A surface from its NURBS data
ruled (function) [lines 215-217] — The ruled surface between two curves (straight lines join matching…
stitch (function) [lines 219-231] — Sew faces and sheets along their common edges
surface (function) [lines 233-243] — A freeform NURBS surface through a grid of points, or…
surfaceFillet (function) [lines 245-259] — A round blend between the surfaces of two faces, as…
bendAllowance (function) [lines 261-264] — Length of the flat strip that a bend takes
bendDeduction (function) [lines 266-268] — What a bend takes off the sum of the outside…
developedLength (function) [lines 270-276] — Length of the flat blank for a strip bent into…
flange (function) [lines 278-285] — Add a flange along a straight edge of a sheet
flatPattern (function) [lines 287-290] — The flat pattern of a sheet metal part, laid on…
fold (function) [lines 292-298] — Fold a sheet along a line
unfold (function) [lines 300-303] — Unfold a sheet metal part
exportFile (function) [lines 305-307] — Write shapes to `path`
exportGlb (function) [lines 309-312] — Binary glTF export with colors, names and (optionally) the B-rep…
exportGltf (function) [lines 314-316] — glTF export with the buffer embedded as a data URI…
exportObj (function) [lines 318-320] — Wavefront OBJ export (one object per part
exportStep (function) [lines 322-325] — Exact B-rep export to STEP AP214
exportStl (function) [lines 327-331] — Triangle mesh export to an STL file (binary unless `ascii`)
fromFile (function) [lines 333-336] — Read a file's contents in memory, picking the format from…
importStl (function) [lines 338-340] — Read an STL file (binary or ASCII) as a mesh
load (function) [lines 342-345] — Read a file, picking the format from the extension
save (function) [lines 347-351] — Write shapes to SMLib's native files (exact)
fromSmb (function) [lines 353-355] — The body of an SMLib native `.smb` file's contents (its…
toFile (function) [lines 357-360] — The contents of a file of the shapes, in memory,…
toSmb (function) [lines 362-366] — The contents of an SMLib native `.smb` file of one…
fromSmp (function) [lines 368-370] — The bodies and curves of an SMLib part file's contents…
toSmp (function) [lines 372-377] — The contents of an SMLib part file (`.smp`) of the…
fromStl (function) [lines 379-381] — A mesh from the contents of an STL file (binary…
toGlb (function) [lines 383-386] — Binary glTF (GLB) of the shapes, with colors, names and…
toGltf (function) [lines 388-390] — glTF JSON of the shapes with the buffer embedded as…
toObj (function) [lines 392-394] — Wavefront OBJ text of the shapes (one object per part),…
toStep (function) [lines 396-398] — The text of a STEP AP214 file of the shapes…
toStl (function) [lines 400-404] — A triangle mesh in STL (binary unless `ascii`)
fromStep (function) [lines 406-412] — Read the solids and surfaces of STEP file contents (AP203,…
fromStepModel (function) [lines 414-420] — Read everything STEP file contents hold that smlibwasm can use…
importStep (function) [lines 422-428] — Read the solids and surfaces of a STEP file (AP203,…
readStep (function) [lines 430-436] — Read everything a STEP file holds that smlibwasm can use

## Functions (3) — `api-functions-3.md`

fromIges (function) [lines 5-8] — Read the solids and surfaces of IGES file contents (IGES…
importIges (function) [lines 10-12] — Read the solids and surfaces of an IGES file (.igs,…
exportDxf (function) [lines 14-16] — Write sketches, faces, wires and edges to a DXF drawing…
fromDxf (function) [lines 18-20] — `importDxf` of a drawing in memory
fromDxfWires (function) [lines 22-24] — `importDxfWires` of a drawing in memory
importDxf (function) [lines 26-29] — Read the outlines of a DXF drawing (an ASCII DXF…
importDxfWires (function) [lines 31-34] — Every chain of curves of a DXF drawing (a path
toDxf (function) [lines 36-39] — Sketches, faces, wires and edges as the text of a…
drawingViews (function) [lines 41-44] — The views of a part for a 2D drawing, laid…
exportSvg (function) [lines 46-48] — Write `toSvg` of the shapes to a file (Node)
toSvg (function) [lines 50-53] — An SVG drawing of drawing views (dashed hidden lines), edges,…
exportUsd (function) [lines 55-57] — Write parts, sheets and meshes to a USD file (.usda,…
fromUsd (function) [lines 59-61] — The bodies of the BrepArray prims of a USD text…
importUsd (function) [lines 63-65] — Read the bodies of the BrepArray prims of a USD…
toUsd (function) [lines 67-69] — The text of a USD file (.usda) of parts, sheets…
exportBrep (function) [lines 71-74] — Write parts, sheets and faces to an OpenCASCADE .brep file…
fromBrep (function) [lines 76-78] — The bodies of an OpenCASCADE .brep file's contents (the text…
importBrep (function) [lines 80-83] — Read an OpenCASCADE .brep file (ASCII from BRepTools::Write, binary from…
toBrep (function) [lines 85-87] — The text of an OpenCASCADE .brep file of parts and…
diffImages (function) [lines 89-95] — Compare two pictures of the same size pixel by pixel
render (function) [lines 97-104] — Render shapes to a PNG image
htmlPage (function) [lines 106-113] — A self-contained HTML page showing the shapes
show (function) [lines 115-122] — Show shapes (parts, sketches, faces, edges, wires, meshes, lists) in…
memoryUsage (function) [lines 124-126] — What the kernel's memory holds, in bytes
scope (function) [lines 128-131] — Runs `fn` and frees every kernel object (body, curve, surface,…
setWarningHandler (function) [lines 133-135] — Where smlibwasm's warnings go (Python's warnings.warn)

## Types — `api-types.md`

VectorLike (type) [lines 5-6] — A point or direction
AlignLike (type) [lines 8-9] — One alignment for all axes, or one per axis (null…
LocationLike (type) [lines 11-12] — What a pattern of locations is made of (`new Locations(...)`)
KFactor (type) [lines 14-18] — What `kFactor` of `unfold`, `flatPattern` and `bends` takes
SvgItemsLike (type) [lines 20-21] — What `toSvg` and `exportSvg` draw
Matrix (type) [lines 23-24] — A 4x4 matrix, row by row (`m[r * 4 +…
ColorLike (type) [lines 26-27] — A color
EdgesLike (type) [lines 29-30] — Edges as the operations on edges take them (`fillet`, `chamfer`)
FacesLike (type) [lines 32-33] — Faces as the operations on faces take them (`shell`, `removeFaces`,…
FilletRadius (type) [lines 35-39] — A fillet radius
RegionLike (type) [lines 41-42] — A region on a face (`warp`, `flatten`)
SortKey (type) [lines 44-45] — What shapes are sorted and grouped by
SourcesLike (type) [lines 47-48] — The bodies, faces or edges a selection is checked against…
WallsLike (type) [lines 50-54] — Walls of their own thickness for `shell`
HullItem (type) [lines 56-57] — What `Hull` takes
TrapezoidOptions (type) [lines 59-72] [4 members] — The options of `Trapezoid`
  TrapezoidOptions.fillet (property) — Round every corner with this radius
  TrapezoidOptions.chamfer (property) — Bevel every corner by this length
  TrapezoidOptions.rotation (property) — Degrees counterclockwise about the shape's center
  TrapezoidOptions.align (property) — Alignment relative to the origin (after the rotation)
Contour (type) [lines 74-75] — A closed outline
Point (type) [lines 77-81] — A point of an outline in font units, `[x, y]`
Segment (type) [lines 83-84] — A line (2 points), a quadratic Bézier (3) or a…
LatticeIndex (type) [lines 86-91] — A selection of lattice points
LatticeLayers (type) [lines 93-94] — Which layers of the lattice along one direction
FileItemsLike (type) [lines 96-97] — What `exportFile` and `toFile` take
FileOptions (type) [lines 99-102] — What `exportFile`, `toFile`, `Shape.export` and `Mesh.export` take as options
ShapesLike (type) [lines 104-105] — Shapes as the exporters, `htmlPage` and `show` take them
StepItemsLike (type) [lines 107-108] — What a STEP file can hold, as `exportStep` and `toStep`…
BytesLike (type) [lines 110-111] — The contents of a file in memory
DxfShapesLike (type) [lines 113-114] — What a DXF file can hold, as `exportDxf` and `toDxf`…
CurvatureKind (type) [lines 116-117] — The kinds of curvature `render` maps (see `RenderOptions.curvature`)
RenderMarker (type) [lines 119-131] — A marker of `render` (see `RenderOptions.markers`)
RenderPoint (type) [lines 133-134] — A point of `render`'s options
RenderView (type) [lines 136-143] — A camera of `render` (see `RenderOptions.view`)
Renderable (type) [lines 145-146] — What `render` draws

## Interfaces — `api-interfaces.md`

IgesImportOptions (interface) [lines 5-10] [2 members] — How an IGES file is read
  IgesImportOptions.heal (property)
  IgesImportOptions.strict (property)
DrawingViewsOptions (interface) [lines 12-21] [4 members] — How `drawingViews` draws
  DrawingViewsOptions.projection (property)
  DrawingViewsOptions.hidden (property)
  DrawingViewsOptions.tangentEdges (property)
  DrawingViewsOptions.gap (property)
SvgOptions (interface) [lines 23-28] [2 members] — How `toSvg` draws
  SvgOptions.margin (property)
  SvgOptions.stroke (property)
UsdExportOptions (interface) [lines 30-41] [5 members] — How a USD file is written
  UsdExportOptions.mesh (property)
  UsdExportOptions.tolerance (property)
  UsdExportOptions.angle (property)
  UsdExportOptions.materials (property)
  UsdExportOptions.maxEdge (property)
UsdImportOptions (interface) [lines 43-54] [5 members] — How a USD stage is read
  UsdImportOptions.heal (property)
  UsdImportOptions.units (property)
  UsdImportOptions.placement (property)
  UsdImportOptions.check (property)
  UsdImportOptions.strict (property)
UsdReadOptions (interface) [lines 56-59] [1 members] — fromUsd's options
  UsdReadOptions.resolve (property)
BrepImportOptions (interface) [lines 61-69] [3 members] — How a .brep file is read
  BrepImportOptions.heal (property)
  BrepImportOptions.check (property)
  BrepImportOptions.strict (property) — Throw a ModelingError where a solid, shell or face of…
Frame (interface) [lines 71-78] [3 members] — The frame of a single view
  Frame.scale (property)
  Frame.midX (property)
  Frame.midY (property)
ImageLike (interface) [lines 80-87] [3 members] — Pixels to compare
  ImageLike.width (property)
  ImageLike.height (property)
  ImageLike.data (property)
RenderOptions (interface) [lines 89-193] [24 members] — The options of `render`
  RenderOptions.path (property) — Also write the PNG to this file (Node)
  RenderOptions.view (property) — The camera, orthographic, Z up
  RenderOptions.size (property) — Width and height in pixels (default [800, 600])
  RenderOptions.edges (property) — Draw the edges of faces in the shaded view (hidden…
  RenderOptions.background (property) — Background color (default "white")
  RenderOptions.tolerance (property) — Tessellation tolerance
  RenderOptions.zoom (property) — Factor on the scale that fits the shapes (2 shows…
  RenderOptions.lookAt (property) — A point that lands in the middle of the picture
  RenderOptions.frame (property) — The frame of an earlier render of the same view…
  RenderOptions.supersample (property) — Render at this many times the size and average down…
  RenderOptions.colors (property) — `"native"`
  RenderOptions.lines (property) — Line style instead of shading
  RenderOptions.drawing (property) — A technical drawing
  RenderOptions.sheet (property) — Several shaded views in one picture
  RenderOptions.section (property) — Cut at a plane and leave out what is on…
  RenderOptions.cap (property) — Fill the cut faces of closed bodies, hatched at 45…
  RenderOptions.highlight (property) — Shapes drawn in signal colors
  RenderOptions.highlightAt (property) — Points
  RenderOptions.markers (property) — Crosshairs with labels, drawn on top
  RenderOptions.annotate (property) — Measurement overlay
  RenderOptions.xray (property) — Translucent bodies
  RenderOptions.xrayAlpha (property) — Opacity of each face in the x-ray view (0 to…
  RenderOptions.zebra (property) — Zebra stripes
  RenderOptions.curvature (property) — A curvature map of the exact surfaces
PageOptions (interface) [lines 195-218] [6 members] — The options of `htmlPage`
  PageOptions.title (property) — The page title (default "smlibwasm")
  PageOptions.tolerance (property) — Tessellation tolerance
  PageOptions.angle (property) — Largest angle between neighbouring triangle normals on curved faces, degrees…
  PageOptions.edges (property) — Draw the B-rep edges (default true)
  PageOptions.view (property) — The direction from the model towards the camera, Z up…
  PageOptions.margin (property) — Room around the model when it is framed (default 1.1)
ShowOptions (interface) [lines 220-239] [6 members] — The options of `show`
  ShowOptions.title (property) — The page title (default "smlibwasm")
  ShowOptions.path (property) — Where to write the page (default
  ShowOptions.openBrowser (property) — Open the page in the default browser (default true)
  ShowOptions.tolerance (property) — Tessellation tolerance
  ShowOptions.angle (property) — Largest angle between neighbouring triangle normals on curved faces, degrees…
  ShowOptions.edges (property) — Draw the B-rep edges (default true)
MemoryUsage (interface) [lines 241-257] [5 members] — What the kernel's memory holds, in bytes (see `memoryUsage`)
  MemoryUsage.used (property) — What the kernel's objects take
  MemoryUsage.heap (property) — The module's memory
  MemoryUsage.limit (property) — What the module's memory can grow to
  MemoryUsage.handles (property) — The kernel objects (bodies, curves, surfaces, meshes) that JavaScript holds…
  MemoryUsage.crashes (property) — The times the kernel crashed (a trap of the module)…
Movable (interface) [lines 259-263] [1 members] — Anything with a `moved(location)`
  Movable.moved (method)
XYZ (interface) [lines 265-272] [3 members] — Coordinates by name, for `Pos({ z
  XYZ.x (property)
  XYZ.y (property)
  XYZ.z (property)
BodyOptions (interface) [lines 274-282] [3 members] — Metadata a body carries
  BodyOptions.name (property)
  BodyOptions.color (property)
  BodyOptions.plane (property) — (a sketch's plane)
ExtrudeOptions (interface) [lines 284-297] [4 members] — How a sketch is extruded
  ExtrudeOptions.both (property) — Extrude the amount to both sides of the sketch
  ExtrudeOptions.taper (property) — Draft angle in degrees
  ExtrudeOptions.direction (property) — Extrude along this direction (an axis or a vector) instead…
  ExtrudeOptions.corners (property) — With a taper, the corners the taper pulls apart
FilletOptions (interface) [lines 299-315] [5 members] — How a fillet's cross-section is shaped
  FilletOptions.continuity (property) — null for a circular fillet
  FilletOptions.fullness (property) — Shape of a blend cross-section
  FilletOptions.propagate (property) — Round the edges that continue the selected ones tangentially too…
  FilletOptions.corners (property) — Where three rounded edges meet
  FilletOptions.setback (property) — Set the corners back
IsoOptions (interface) [lines 317-322] [2 members] — The options of `Face.iso`
  IsoOptions.u (property)
  IsoOptions.v (property)
PushOptions (interface) [lines 324-340] [5 members] — How `Part.push` and `Shell.push` move the point (see `Part.push`)
  PushOptions.by (property) — How far the point moves
  PushOptions.to (property) — Where the point moves to, instead of `by`
  PushOptions.normal (property) — The face's normal at the moved point (default
  PushOptions.radius (property) — How far from the point the face changes (default
  PushOptions.continuity (property) — `'G0'`, `'G1'` (default) or `'G2'`
Coordinates (interface) [lines 342-347] [2 members] — The coordinate a line or a forward move goes to
  Coordinates.x (property)
  Coordinates.y (property)
CornerOptions (interface) [lines 349-356] [2 members] — The corner options of the shapes with corners
  CornerOptions.fillet (property) — Round every corner with this radius
  CornerOptions.chamfer (property) — Bevel every corner by this length
PlacementOptions (interface) [lines 358-365] [2 members] — Where a new shape sits and how it is turned
  PlacementOptions.rotation (property) — Degrees counterclockwise about the shape's center
  PlacementOptions.align (property) — Alignment relative to the origin (after the rotation)
PolygonOptions (interface) [lines 367-370] [1 members] — The options of `Polygon`
  PolygonOptions.align (property)
TextOptions (interface) [lines 372-391] [6 members] — How `Text` sets the text
  TextOptions.font (property) — A TrueType or OpenType font (.ttf, .otf, .ttc, .woff, .woff2)
  TextOptions.align (property) — Placement of the text's layout box (from the start to…
  TextOptions.spacing (property) — Extra distance between neighbouring letters in mm (negative
  TextOptions.lineSpacing (property) — Distance between baselines as a multiple of `size`
  TextOptions.kerning (property) — Apply the font's kerning pairs
  TextOptions.path (property) — An edge or wire in the XY plane to set…
ExtrudeFunctionOptions (interface) [lines 393-402] [4 members] — How a profile is extruded (see `Sketch.extrude`)
  ExtrudeFunctionOptions.both (property)
  ExtrudeFunctionOptions.taper (property)
  ExtrudeFunctionOptions.direction (property)
  ExtrudeFunctionOptions.corners (property)
SweepOptions (interface) [lines 404-436] [8 members] — How a profile is swept (see `sweep`)
  SweepOptions.orient (property) — Turn the profile to be perpendicular to the path at…
  SweepOptions.translational (property) — Keep the profile's orientation fixed instead of turning it with…
  SweepOptions.sharpCorners (property) — For paths of several edges
  SweepOptions.up (property) — An axis or a direction the profile keeps its attitude…
  SweepOptions.twist (property) — Degrees the profile turns about the path on top of…
  SweepOptions.scale (property) — The profile's scale along the path, about the point of…
  SweepOptions.anchor (property) — The point of the profile that goes on the path…
  SweepOptions.rails (property) — A second rail (an edge or a wire
BendOptions (interface) [lines 438-445] [2 members] — How a part is bent (see `bend`)
  BendOptions.radius (property) — The bend radius of the neutral layer
  BendOptions.plane (property) — Sets the bend
RangeOptions (interface) [lines 447-457] [3 members] — Where a deformation applies along its axis
  RangeOptions.start (property) — Where the deformation begins, as a distance along the axis…
  RangeOptions.end (property) — Where the deformation ends, measured the same way
  RangeOptions.tolerance (property) — Largest distance of the deformed faces from the exact map…
TaperOptions (interface) [lines 459-463] [1 members] — How a part is tapered (see `taper`)
  TaperOptions.axis (property) — The line the cross-sections shrink toward (default the world Z…
TwistOptions (interface) [lines 465-469] [1 members] — How a part is twisted (see `twist`)
  TwistOptions.axis (property) — The line to twist about (default the world Z axis…
BendAllowanceOptions (interface) [lines 471-481] [3 members] — The bend of `bendAllowance` and `bendDeduction`
  BendAllowanceOptions.radius (property) — Inside bend radius
  BendAllowanceOptions.thickness (property) — Sheet thickness
  BendAllowanceOptions.kFactor (property) — Position of the neutral fiber, 0 (inside) to 1 (outside)
DevelopedLengthOptions (interface) [lines 483-487] [1 members] — The bends of `developedLength`
  DevelopedLengthOptions.angle (property) — The angle of every bend in degrees, or one angle…
FlangeOptions (interface) [lines 489-499] [3 members] — Options of `flange`
  FlangeOptions.angle (property) — Bend angle in degrees, below 180 (default 90)
  FlangeOptions.radius (property) — Inside bend radius
  FlangeOptions.kFactor (property) — Position of the neutral fiber, 0 (inside) to 1 (outside)
FoldOptions (interface) [lines 501-514] [4 members] — Options of `fold`
  FoldOptions.radius (property) — Inside bend radius
  FoldOptions.kFactor (property) — Position of the neutral fiber, 0 (inside) to 1 (outside)
  FoldOptions.fixed (property) — A point (or a face, edge or vertex) on the…
  FoldOptions.partial (property) — Bend only along the segment `line` (an Edge), not across…
UnfoldOptions (interface) [lines 516-523] [2 members] — Options of `unfold` and `flatPattern`
  UnfoldOptions.kFactor (property) — The K-factor of each bend (see `KFactor`)
  UnfoldOptions.fixed (property) — The planar face of the part that stays in place…
GltfOptions (interface) [lines 525-530] [2 members] — How glTF is written
  GltfOptions.edges (property)
  GltfOptions.edgeColor (property)
MeshOptions (interface) [lines 532-539] [3 members] — How shapes are meshed
  MeshOptions.tolerance (property)
  MeshOptions.angle (property)
  MeshOptions.maxEdge (property)
StepExportOptions (interface) [lines 541-548] [3 members] — How a STEP file is written
  StepExportOptions.unit (property)
  StepExportOptions.name (property)
  StepExportOptions.assembly (property)
DxfReadOptions (interface) [lines 550-560] [3 members] — How a drawing is read
  DxfReadOptions.layers (property) — Read only these layers (names in any letter case)
  DxfReadOptions.unit (property) — The unit of the drawing ("mm", "cm", "m", "um", "inch",…
  DxfReadOptions.tolerance (property) — Ends closer than this (mm) are joined
DxfWriteOptions (interface) [lines 562-575] [4 members] — How a drawing is written
  DxfWriteOptions.unit (property) — Unit of the file
  DxfWriteOptions.plane (property) — The plane of the drawing
  DxfWriteOptions.curves (property) — 'exact' (default) writes splines and ellipses as SPLINE and ELLIPSE
  DxfWriteOptions.tolerance (property) — For `curves
