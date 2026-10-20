# @classcad/smlibwasm API index

@classcad/smlibwasm 0.1.0-beta.8 · 697 symbols · extracted by TypeScript 5.9.3.

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
VIEWS (constant) [lines 36-37] — Named views

## Classes — `api-classes.md`

Axis (class) [lines 5-55] [17 members] — An infinite line through `origin` along `direction`
  Axis.X (property)
  Axis.Y (property)
  Axis.Z (property)
  Axis.origin (property)
  Axis.direction (property)
  Axis.constructor (constructor)
  Axis.neg (method)
  Axis.reversed (method)
  Axis.moved (method)
  Axis.at (method) — The same direction through another point
  Axis.isParallel (method)
  Axis.distanceTo (method)
  Axis.project (method)
  Axis.positionAlong (method) — Signed coordinate of `point` along this axis
  Axis.equals (method)
  Axis.toString (method)
  Axis.[inspect] (method)
BoundBox (class) [lines 57-88] [12 members]
  BoundBox.min (property)
  BoundBox.max (property)
  BoundBox.constructor (constructor)
  BoundBox.ofPoints (method)
  BoundBox.size (property)
  BoundBox.center (property)
  BoundBox.diagonal (property)
  BoundBox.union (method)
  BoundBox.contains (method)
  BoundBox.[Symbol.iterator] (method)
  BoundBox.toString (method)
  BoundBox.[inspect] (method)
Hit (class) [lines 90-105] [6 members] — Where a ray meets a shape or a mesh (see…
  Hit.point (property)
  Hit.distance (property)
  Hit.normal (property)
  Hit.face (property)
  Hit.triangle (property)
  Hit.constructor (constructor)
Location (class) [lines 107-157] [15 members] — A rigid placement (rotation + translation), stored as a 4x4…
  Location.constructor (constructor)
  Location.about (method) — Rotation by `angle` degrees about an arbitrary axis
  Location.matrix (property) — The 4x4 homogeneous matrix (column-vector convention), row by row
  Location.position (property)
  Location.rotation (property) — Rotation as X, Y, Z angles in degrees (applied in…
  Location.xDir (property)
  Location.yDir (property)
  Location.zDir (property)
  Location.plane (property) — The XY plane moved by this location
  Location.inverse (method)
  Location.rotateVector (method)
  Location.mul (method) — This location applied to something
  Location.equals (method)
  Location.toString (method)
  Location.[inspect] (method)
Nurbs (class) [lines 159-171] [5 members] — A curve as a NURBS (see `Edge.nurbs`)
  Nurbs.degree (property)
  Nurbs.knots (property)
  Nurbs.points (property)
  Nurbs.weights (property)
  Nurbs.constructor (constructor)
Plane (class) [lines 173-274] [35 members] — A coordinate system
  Plane.XY (property)
  Plane.YZ (property)
  Plane.ZX (property)
  Plane.XZ (property)
  Plane.YX (property)
  Plane.ZY (property)
  Plane.top (property)
  Plane.bottom (property)
  Plane.front (property)
  Plane.back (property)
  Plane.left (property)
  Plane.right (property)
  Plane.origin (property)
  Plane.xDir (property)
  Plane.yDir (property)
  Plane.zDir (property) — The plane normal
  Plane.constructor (constructor)
  Plane.normal (property) — The plane normal (`zDir`)
  Plane.location (property) — The location that maps the world XY plane onto this…
  Plane.offset (method) — This plane moved `distance` along its normal
  Plane.shifted (method) — This plane moved within its own coordinates
  Plane.flipped (method) — The same plane seen from the other side (normal reversed,…
  Plane.rotated (method) — Rotate about the plane's own X, then Y, then Z…
  Plane.moved (method)
  Plane.at (method) — The same orientation through another origin
  Plane.toLocal (method)
  Plane.fromLocal (method)
  Plane.contains (method)
  Plane.distanceTo (method) — Signed distance of a point above the plane
  Plane.project (method)
  Plane.isCoplanar (method)
  Plane.mul (method) — `plane.mul(shape)` places a shape (usually a sketch drawn on XY)…
  Plane.equals (method)
  Plane.toString (method)
  Plane.[inspect] (method)
Vector (class) [lines 276-360] [26 members] — An immutable 3D vector or point
  Vector.x (property)
  Vector.y (property)
  Vector.z (property)
  Vector.constructor (constructor)
  Vector.toArray (method) — `[x, y, z]`
  Vector.[Symbol.iterator] (method)
  Vector.add (method)
  Vector.sub (method)
  Vector.mul (method) — This vector scaled by a number (`dot` and `cross` multiply…
  Vector.div (method)
  Vector.neg (method)
  Vector.equals (method) — Equal within TOLERANCE
  Vector.toString (method)
  Vector.[inspect] (method)
  Vector.length (property)
  Vector.dot (method)
  Vector.cross (method)
  Vector.normalized (method)
  Vector.distanceTo (method)
  Vector.angleTo (method) — Angle to another vector in degrees (0..180)
  Vector.isClose (method)
  Vector.isParallel (method) — True if both vectors point along the same line (either…
  Vector.isPerpendicular (method)
  Vector.rotate (method) — Rotate this point about an axis (through the origin for…
  Vector.projectTo (method) — Orthogonal projection of this point onto a plane
  Vector.anyPerpendicular (method) — A unit vector perpendicular to this one
Edge (class) [lines 362-458] [28 members] — A bounded curve
  Edge.constructor (constructor)
  Edge.geomType (property) — "line", "circle" (also arcs), "ellipse", "bspline" or "other"
  Edge.length (property)
  Edge.start (property)
  Edge.end (property)
  Edge.isClosed (property)
  Edge.isSeam (property) — True for the seam of a closed surface (an edge…
  Edge.convexity (property) — "convex" for an outside corner (material angle below 180 degrees),…
  Edge.isConvex (method) — True on an outside corner (see `convexity`)
  Edge.direction (property) — Unit direction of a straight edge (start to end)
  Edge.radius (property) — Radius of a circular edge
  Edge.arcCenter (property) — Center of a circular edge
  Edge.normal (property) — Axis direction of a circular edge
  Edge.pointAt (method) — Point at fraction `t` of the edge length (0 =…
  Edge.tangentAt (method) — Unit tangent at fraction `t` of the edge length, pointing…
  Edge.center (method) — The point halfway along the edge (use `arcCenter` for a…
  Edge.bbox (method) — Tight axis-aligned bounding box
  Edge.distanceTo (method) — Minimum distance to a point (and, for bodies, to another…
  Edge.intersections (method) — Points where this edge crosses another edge
  Edge.vertices (method) — All vertices of this shape
  Edge.edges (method) — All edges of this shape
  Edge.faces (method) — All faces of this shape
  Edge.reversed (method) — The same edge traversed the other way
  Edge.nurbs (method) — This edge as a NURBS curve, from its start to…
  Edge.removeKnots (method) — The same curve with the knots it does not need…
  Edge.add (method) — A wire of this edge and the other (Python's `+`)
  Edge.equals (method)
  Edge.toString (method)
Face (class) [lines 460-552] [26 members] — A bounded piece of a surface, belonging to a body…
  Face.constructor (constructor)
  Face.owner (property) — The body this face belongs to
  Face.geomType (property) — "plane", "cylinder", "cone", "sphere", "torus", "revolution", "extrusion", "bspline", "offset" or…
  Face.area (property)
  Face.center (method) — Area centroid
  Face.interiorPoint (method) — A point guaranteed to lie on the face
  Face.normalAt (method) — Outward unit normal at the face point closest to `point`…
  Face.isPlanar (property) — True for planes and for flat B-spline faces (control points…
  Face.plane (property) — The face's plane
  Face.radius (property) — Radius of a cylinder, sphere or cone (at its base),…
  Face.axis (property) — Axis of a cylinder, cone, sphere, torus or surface of…
  Face.bbox (method) — Tight axis-aligned bounding box
  Face.distanceTo (method) — Minimum distance to a point (and, for bodies, to another…
  Face.raycast (method) — Where a ray meets this face, nearest first (see `Part.raycast`)
  Face.outerWire (method)
  Face.innerWires (method)
  Face.wires (method) — All wires (closed edge loops of faces, or the shape…
  Face.edges (method) — The face's edges (seam edges only with `seams`)
  Face.vertices (method) — All vertices of this shape
  Face.faces (method) — All faces of this shape
  Face.neighbors (method) — Faces sharing an edge with this one
  Face.toSketch (method) — A sketch holding a copy of this (planar) face
  Face.toShell (method) — A sheet body holding a copy of this face
  Face.extrude (method) — Extrude a planar face along its normal (see `Sketch.extrude`)
  Face.equals (method)
  Face.toString (method)
MassProperties (class) [lines 554-579] [11 members]
  MassProperties.mass (property)
  MassProperties.volume (property)
  MassProperties.area (property)
  MassProperties.center (property)
  MassProperties.inertia (property)
  MassProperties.density (property)
  MassProperties.constructor (constructor)
  MassProperties.principalMoments (property)
  MassProperties.principalAxes (property)
  MassProperties.toString (method)
  MassProperties.[inspect] (method)
Part (class) [lines 581-733] [32 members] — A solid
  Part.volume (property)
  Part.area (property) — Total surface area
  Part.center (method) — Center of mass (uniform density)
  Part.massProperties (method) — Mass, center of mass and inertia tensor for a uniform…
  Part.isValid (method) — True if the part is a closed, manifold solid that…
  Part.solids (method) — The separate bodies of this part
  Part.merge (method) — This part and others as one part made of cells
  Part.cells (method) — The cells of a part made by `merge`, each as…
  Part.fuse (method) — Union with other parts (Python's `+`)
  Part.cut (method) — Subtract other parts (Python's `-`)
  Part.intersect (method) — Keep only the volume shared with the other parts (Python's…
  Part.fillet (method) — Round edges
  Part.chamfer (method) — Bevel edges
  Part.shell (method) — Hollow the part out to walls of `thickness`, removing the…
  Part.offset (method) — Grow (positive) or shrink (negative) the part by `distance` everywhere
  Part.split (method) — Cut the part with a plane
  Part.section (method) — The cross-section of the part in a plane, as a…
  Part.twist (method) — Twist about an axis (default Z) by `angle` degrees over…
  Part.taper (method) — Scale cross-sections toward an axis (default Z) from 1 to…
  Part.bend (method) — Bend around an axis by `angle` degrees (default
  Part.deform (method) — Deform with a `Lattice` (same as `lattice.apply(part)`)
  Part.removeFillets (method) — The part with fillets taken out and their edges sharp…
  Part.removeFaces (method) — The part with `faces` (a hole, a boss, a pocket)…
  Part.draftAnalysis (method) — Draft angle of every face for the pull direction, with…
  Part.partingLine (method) — The closed lines where the part's surface turns from facing…
  Part.draft (method) — Tilt faces by a draft angle, so that a molded…
  Part.fold (method) — Fold this sheet along a line on its top or…
  Part.flange (method) — Add a flange along a straight outer edge of this…
  Part.bends (method) — The bends of this sheet metal part (see `bends`)
  Part.unfold (method) — This sheet metal part unfolded flat (see `unfold`)
  Part.flatPattern (method) — The flat pattern of this sheet metal part on XY…
  Part.toString (method)
Shape (class) [lines 735-807] [18 members] — Base class of all shapes
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
  Shape.mesh (method) — Triangulate the shape (see `tessellate`)
  Shape.show (method) — Show the shape in the viewer (see `show`)
  Shape.export (method) — Write the shape to a file
  Shape.toString (method)
  Shape.[inspect] (method)

## Classes (2) — `api-classes-2.md`

ShapeList (class) [lines 5-196] [50 members] — A list of shapes with selection helpers
  ShapeList.one (method) — The only element
  ShapeList.first (property)
  ShapeList.last (property)
  ShapeList.sortBy (method) — Sort by position along an axis, by "length"/"area"/"volume"/"radius", or by…
  ShapeList.filterBy (method) — `parallelTo(axis)`, `ofType(name)` or `filter(predicate)`, depending on the argument
  ShapeList.sortByDistance (method)
  ShapeList.groupBy (method) — Group shapes with equal key (within `tol`), groups in ascending…
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
  ShapeList.fillets (method) — Fillet faces
  ShapeList.hitBy (method) — The faces (or bodies) of the list that a ray…
  ShapeList.within (method) — Shapes whose bounding box lies inside `box`
  ShapeList.atPoint (method) — Shapes passing through `point` (vertices at, edges/faces touching it)
  ShapeList.union (method) — The shapes of both lists, each once (Python's `|`)
  ShapeList.difference (method) — The shapes not in `other` (Python's `-`)
  ShapeList.intersection (method) — The shapes also in `other` (Python's `&`)
  ShapeList.vertices (method)
  ShapeList.edges (method)
  ShapeList.faces (method)
  ShapeList.wires (method)
  ShapeList.center (method) — Average of the members' centers
  ShapeList.bbox (method)
  ShapeList.moved (method)
  ShapeList.on (method) — Every shape placed onto a plane or face (see `Shape.on`)
  ShapeList.translate (method)
  ShapeList.rotate (method)
  ShapeList.toString (method) — Returns a string representation of an array
  ShapeList.[inspect] (method)
Shell (class) [lines 198-218] [5 members] — A sheet body
  Shell.area (property)
  Shell.center (method) — Center of mass (centroid) of the shape
  Shell.thicken (method) — Turn the sheet into a solid of `thickness` (along the…
  Shell.fuse (method) — Union with other sheets (Python's `+`)
  Shell.toString (method)
Sketch (class) [lines 220-289] [15 members] — A planar region (with holes, possibly several pieces) on a…
  Sketch.plane (property) — The sketch plane
  Sketch.fuse (method) — The union with other sketches (Python's `+`)
  Sketch.cut (method) — The region less other sketches (Python's `-`)
  Sketch.intersect (method) — The region common to this and other sketches (Python's `&`)
  Sketch.xor (method) — The region in exactly one of the sketches (Python's `^`)
  Sketch.center (method) — Area centroid of the region
  Sketch.perimeter (property) — Total length of the boundary
  Sketch.offset (method) — Grow (positive `distance`) or shrink (negative) the region
  Sketch.fillet (method) — Round corners of the region with tangent arcs of `radius`
  Sketch.chamfer (method) — Bevel corners of the region
  Sketch.mirror (method) — A mirrored copy
  Sketch.extrude (method) — Extrude the region into a solid
  Sketch.revolve (method) — Revolve the region about an axis in its plane
  Sketch.sweep (method) — Sweep the region along a path
  Sketch.toString (method)
Vertex (class) [lines 291-339] [15 members] — A point
  Vertex.constructor (constructor)
  Vertex.point (property)
  Vertex.x (property)
  Vertex.y (property)
  Vertex.z (property)
  Vertex.center (method) — Center of mass (centroid) of the shape
  Vertex.bbox (method) — Tight axis-aligned bounding box
  Vertex.vertices (method) — All vertices of this shape
  Vertex.edges (method) — All edges of this shape
  Vertex.faces (method) — All faces of this shape
  Vertex.distanceTo (method) — Minimum distance to a point (and, for bodies, to another…
  Vertex.convexity (property) — For a corner of a sketch
  Vertex.equals (method)
  Vertex.[Symbol.iterator] (method)
  Vertex.toString (method)
Wire (class) [lines 341-413] [20 members] — A chain of edges, open or closed
  Wire.constructor (constructor)
  Wire.edges (method) — All edges of this shape
  Wire.vertices (method) — All vertices of this shape
  Wire.wires (method) — All wires (closed edge loops of faces, or the shape…
  Wire.isClosed (property)
  Wire.start (property)
  Wire.end (property)
  Wire.length (property)
  Wire.center (method) — Length-weighted average of the edge midpoints
  Wire.bbox (method) — Tight axis-aligned bounding box
  Wire.pointAt (method) — Point at fraction `t` of the total length
  Wire.tangentAt (method)
  Wire.distanceTo (method) — Minimum distance to a point (and, for bodies, to another…
  Wire.close (method) — This wire closed with a straight line from its end…
  Wire.reversed (method)
  Wire.add (method) — A wire of this one and the other (Python's `+`)
  Wire.plane (method) — The plane of a planar wire (normal by the right-hand…
  Wire.fillet (method) — Round the corners between straight edges with tangent arcs (planar…
  Wire.toSketch (method) — The planar region bounded by this closed wire
  Wire.toString (method)
Mesh (class) [lines 415-473] [18 members] — An indexed triangle mesh
  Mesh.vertices (property)
  Mesh.triangles (property)
  Mesh.normals (property)
  Mesh.constructor (constructor)
  Mesh.length (property) — The number of triangles (Python's `len(mesh)`)
  Mesh.triangleNormals (property) — One unit normal per triangle (x, y, z each)
  Mesh.area (property)
  Mesh.volume (property) — Enclosed volume (meaningful for closed meshes)
  Mesh.bbox (method)
  Mesh.center (method)
  Mesh.raycast (method) — Where a ray meets the mesh's triangles, nearest first (`Hit`
  Mesh.isClosed (method) — True if every edge of the mesh is shared by…
  Mesh.fuse (method) — The kernel's mesh union (Python's `+`)
  Mesh.cut (method) — The kernel's mesh difference (Python's `-`)
  Mesh.intersect (method) — The kernel's mesh intersection (Python's `&`)
  Mesh.export (method) — Write the mesh to a file (stl, obj, glb, ...
  Mesh.toString (method)
  Mesh.[inspect] (method)
Profile (class) [lines 475-554] [19 members] — A pen that draws an outline in the XY plane,…
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
Font (class) [lines 556-599] [13 members] — One font
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
FontError (class) [lines 601-605] [1 members] — The data is not a font this reader can use…
  FontError.constructor (constructor)
Locations (class) [lines 607-635] [8 members] — A list of locations
  Locations.[Symbol.species] (property)
  Locations.constructor (constructor)
  Locations.mul (method) — Each location applied to something
  Locations.moved (method) — The pattern moved by a location (`location.mul(pattern)`)
  Locations.on (method) — The pattern placed onto a plane or face
  Locations.points (property)
  Locations.toString (method) — Returns a string representation of an array
  Locations.[inspect] (method)
Lattice (class) [lines 637-705] [15 members] — A grid of control points around a part for free-form…
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
Bend (class) [lines 707-741] [13 members] — One bend of a sheet metal part
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
FlatPattern (class) [lines 743-774] [11 members] — The unfolded part, laid on the XY plane
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
StepModel (class) [lines 776-801] [9 members] — Everything `readStep` reads from a STEP file
  StepModel.bodies (property)
  StepModel.frames (property)
  StepModel.curves (property)
  StepModel.points (property)
  StepModel.constructor (constructor)
  StepModel.frame (method) — The coordinate system called `name` as a `Plane`
  StepModel.equals (method)
  StepModel.toString (method)
  StepModel.[inspect] (method)
StepCurve (class) [lines 803-825] [8 members] — A curve of a STEP file that belongs to no…
  StepCurve.name (property)
  StepCurve.shape (property)
  StepCurve.product (property)
  StepCurve.color (property) — [r, g, b] from 0 to 1, or null
  StepCurve.constructor (constructor)
  StepCurve.equals (method)
  StepCurve.toString (method)
  StepCurve.[inspect] (method)
StepFrame (class) [lines 827-852] [9 members] — A coordinate system of a STEP file (a named `AXIS2_PLACEMENT_3D`)…
  StepFrame.name (property)
  StepFrame.plane (property)
  StepFrame.product (property)
  StepFrame.color (property) — [r, g, b] from 0 to 1, or null
  StepFrame.constructor (constructor)
  StepFrame.location (property) — The placement that moves the world origin onto this coordinate…
  StepFrame.equals (method)
  StepFrame.toString (method)
  StepFrame.[inspect] (method)

## Classes (3) — `api-classes-3.md`

StepPoint (class) [lines 5-27] [8 members] — A point of a STEP file that belongs to no…
  StepPoint.name (property)
  StepPoint.point (property)
  StepPoint.product (property)
  StepPoint.color (property) — [r, g, b] from 0 to 1, or null
  StepPoint.constructor (constructor)
  StepPoint.equals (method)
  StepPoint.toString (method)
  StepPoint.[inspect] (method)
ImageDiff (class) [lines 29-54] [9 members] — The result of `diffImages`
  ImageDiff.changed (property)
  ImageDiff.total (property)
  ImageDiff.fraction (property)
  ImageDiff.bbox (property)
  ImageDiff.picture (property)
  ImageDiff.constructor (constructor)
  ImageDiff.save (method) — Write the picture of the difference as a PNG file…
  ImageDiff.toString (method)
  ImageDiff.[inspect] (method)
Picture (class) [lines 56-81] [9 members] — A render
  Picture.data (property)
  Picture.pixels (property)
  Picture.width (property)
  Picture.height (property)
  Picture.frame (property)
  Picture.constructor (constructor)
  Picture.save (method) — Write the PNG file (Node)
  Picture.toString (method)
  Picture.[inspect] (method)
KernelError (class) [lines 83-96] [5 members] — An SMLib operation failed
  KernelError.operation (property)
  KernelError.status (property)
  KernelError.detail (property)
  KernelError.hint (property)
  KernelError.constructor (constructor)
ModelingError (class) [lines 98-102] [1 members] — A modeling operation cannot be done (for example a fillet…
  ModelingError.constructor (constructor)

## Functions — `api-functions.md`

Pos (function) [lines 5-7] — A translation
Rot (function) [lines 9-11] — A rotation in degrees about the world X, then Y,…
tessellate (function) [lines 13-18] — Triangulate a shape
Bezier (function) [lines 20-24] — A Bézier curve (rational if `weights` are given) from its…
CenterArc (function) [lines 26-29] — An arc around `center` starting at `startAngle` and spanning `arcSize`…
EllipticalArc (function) [lines 31-34] — An ellipse (or elliptical arc) around `center` in `plane`
FilletPolyline (function) [lines 36-41] — A polyline whose corners are rounded with `radius`
Helix (function) [lines 43-51] — A helix around `direction` through `center`
Line (function) [lines 53-55] — A straight edge from `start` to `end`
PolarLine (function) [lines 57-59] — A line of `length` leaving `start` at `angle` degrees from…
Polyline (function) [lines 61-65] — Straight segments through the points
RadiusArc (function) [lines 67-70] — The shorter arc of `radius` from `start` to `end` in…
SagittaArc (function) [lines 72-74] — An arc from `start` to `end` whose middle is `sagitta`…
Spline (function) [lines 76-82] — A smooth cubic curve through the points
TangentArc (function) [lines 84-86] — An arc from `start` to `end` leaving `start` along `tangent`
ThreePointArc (function) [lines 88-90] — The circular arc from `start` through `through` to `end`
makeCompatible (function) [lines 92-95] — Copies of the curves as B-splines of one degree and…
ArcSlot (function) [lines 97-99] — A slot along an arc around the origin
Circle (function) [lines 101-105] — A disk of `radius`
Ellipse (function) [lines 107-109] — An ellipse with semi-axes `xRadius` and `yRadius`, turned by `rotation`…
Hull (function) [lines 111-114] — The convex hull of points and shapes
Polygon (function) [lines 116-118] — The polygon through the points (closed automatically)
Rectangle (function) [lines 120-123] — A `width` (X) by `height` (Y) rectangle
RegularPolygon (function) [lines 125-130] — A regular polygon with `sides` corners
RoundedRectangle (function) [lines 132-136] — A rectangle with rounded corners
Slot (function) [lines 138-140] — An obround slot `length` long overall (round ends included) and…
Stroke (function) [lines 142-148] — The region a pen `width` wide covers along a path…
Trapezoid (function) [lines 150-152] — A trapezoid with a base of `width`
Triangle (function) [lines 154-159] — A triangle with a base of `width` along X and…
makeFace (function) [lines 161-163] — The planar region inside a closed wire, minus the regions…
Text (function) [lines 165-168] — Lettering as a sketch in the XY plane, with the…
loadFont (function) [lines 170-173] — The font `source`, read once and kept
Box (function) [lines 175-179] — A box of `length` (X) by `width` (Y) by `height`…
Cone (function) [lines 181-185] — A cone (or frustum) along Z
CounterBoreHole (function) [lines 187-189] — A drilling tool with a counterbore at the top
CounterSinkHole (function) [lines 191-193] — A drilling tool with a conical countersink of included `angle`…
Cylinder (function) [lines 195-199] — A cylinder along Z
Hole (function) [lines 201-203] — A drilling tool
Sphere (function) [lines 205-209] — A sphere
Torus (function) [lines 211-215] — A torus around Z
Wedge (function) [lines 217-221] — A ramp
GridLocations (function) [lines 223-227] — A rectangular grid in the XY plane, centered on the…
HexLocations (function) [lines 229-233] — A honeycomb pattern
PolarLocations (function) [lines 235-242] — `count` locations on a circle of `radius` in the XY…
chamfer (function) [lines 244-246] — Bevel edges of the part they belong to (see `Part.chamfer`),…
extrude (function) [lines 248-251] — Extrude a sketch, a planar face or a closed wire…
fillet (function) [lines 253-255] — Round edges of the part they belong to (see `Part.fillet`),…
loft (function) [lines 257-264] — A solid through a sequence of cross sections, or a…
merge (function) [lines 266-268] — Parts as one part made of cells
mirror (function) [lines 270-272] — A mirrored copy of a shape
offset (function) [lines 274-279] — Grow or shrink a part or a sketch by `distance`…
revolve (function) [lines 281-284] — Revolve a sketch about an axis into a solid (see…
section (function) [lines 286-288] — Cross-section of a part (see `Part.section`)
shell (function) [lines 290-294] — Hollow out a part (see `Part.shell`)
split (function) [lines 296-298] — Cut a part with a plane (see `Part.split`)
sweep (function) [lines 300-305] — Sweep a profile along a path
thicken (function) [lines 307-309] — Turn a face or sheet into a solid of `thickness`
bend (function) [lines 311-318] — Bend a part around an axis by `angle` degrees, like…
taper (function) [lines 320-327] — Taper a part along an axis
twist (function) [lines 329-336] — Twist a part about an axis by `angle` degrees over…
ruled (function) [lines 338-340] — The ruled surface between two curves (straight lines join matching…
stitch (function) [lines 342-347] — Sew faces and sheets along their common edges
surface (function) [lines 349-357] — A freeform NURBS surface through a grid of points, or…
surfaceFillet (function) [lines 359-367] — A round blend between the surfaces of two faces, as…
bendAllowance (function) [lines 369-372] — Length of the flat strip that a bend takes
bendDeduction (function) [lines 374-376] — What a bend takes off the sum of the outside…
developedLength (function) [lines 378-381] — Length of the flat blank for a strip bent into…
flange (function) [lines 383-390] — Add a flange along a straight edge of a sheet
flatPattern (function) [lines 392-395] — The flat pattern of a sheet metal part, laid on…
fold (function) [lines 397-403] — Fold a sheet along a line
unfold (function) [lines 405-408] — Unfold a sheet metal part
exportFile (function) [lines 410-412] — Write shapes to `path`
exportGlb (function) [lines 414-417] — Binary glTF export with colors, names and (optionally) the B-rep…
exportGltf (function) [lines 419-421] — glTF export with the buffer embedded as a data URI…
exportObj (function) [lines 423-425] — Wavefront OBJ export (one object per part)
exportStep (function) [lines 427-429] — Exact B-rep export to STEP AP214
exportStl (function) [lines 431-435] — Triangle mesh export to an STL file (binary unless `ascii`)
importStl (function) [lines 437-439] — Read an STL file (binary or ASCII) as a mesh
load (function) [lines 441-444] — Read a file, picking the format from the extension
save (function) [lines 446-450] — Write a body to SMLib's native `.smb` format (exact and…
fromSmb (function) [lines 452-454] — The body of an SMLib native `.smb` file's contents
toSmb (function) [lines 456-460] — The contents of an SMLib native `.smb` file of one…
fromStl (function) [lines 462-464] — A mesh from the contents of an STL file (binary…
toGlb (function) [lines 466-469] — Binary glTF (GLB) of the shapes, with colors, names and…
toGltf (function) [lines 471-473] — glTF JSON of the shapes with the buffer embedded as…
toObj (function) [lines 475-477] — Wavefront OBJ text of the shapes (one object per part)
toStep (function) [lines 479-481] — The text of a STEP AP214 file of the shapes…
toStl (function) [lines 483-487] — A triangle mesh in STL (binary unless `ascii`)
fromStep (function) [lines 489-494] — Read the solids and surfaces of STEP file contents (AP203,…
fromStepModel (function) [lines 496-501] — Read everything STEP file contents hold that smlibwasm can use…
importStep (function) [lines 503-508] — Read the solids and surfaces of a STEP file (AP203,…
readStep (function) [lines 510-515] — Read everything a STEP file holds that smlibwasm can use
exportDxf (function) [lines 517-519] — Write sketches, faces, wires and edges to a DXF drawing…
fromDxf (function) [lines 521-523] — `importDxf` of a drawing in memory
fromDxfWires (function) [lines 525-527] — `importDxfWires` of a drawing in memory
importDxf (function) [lines 529-532] — Read the outlines of a DXF drawing (an ASCII DXF…
importDxfWires (function) [lines 534-537] — Every chain of curves of a DXF drawing (a path
toDxf (function) [lines 539-542] — Sketches, faces, wires and edges as the text of a…
exportUsd (function) [lines 544-546] — Write parts, sheets and meshes to a USD file (.usda,…

## Functions (2) — `api-functions-2.md`

fromUsd (function) [lines 5-9] — The bodies of the BrepArray prims of a USD text…
importUsd (function) [lines 11-15] — Read the bodies of the BrepArray prims of a USD…
toUsd (function) [lines 17-19] — The text of a USD file (.usda) of parts, sheets…
diffImages (function) [lines 21-27] — Compare two pictures of the same size pixel by pixel
render (function) [lines 29-33] — Render shapes to a PNG image
htmlPage (function) [lines 35-39] — A self-contained HTML page showing the shapes
show (function) [lines 41-45] — Show shapes (parts, sketches, faces, edges, wires, meshes, lists) in…
setWarningHandler (function) [lines 47-49] — Where smlibwasm's warnings go (Python's warnings.warn)

## Types — `api-types.md`

VectorLike (type) [lines 5-6] — A point or direction
AlignLike (type) [lines 8-9] — One alignment for all axes, or one per axis (null…

## Interfaces — `api-interfaces.md`

UsdExportOptions (interface) [lines 5-12] [3 members] — How a USD file is written
  UsdExportOptions.mesh (property)
  UsdExportOptions.tolerance (property)
  UsdExportOptions.angle (property)
Frame (interface) [lines 14-21] [3 members] — The frame of a single view
  Frame.scale (property)
  Frame.midX (property)
  Frame.midY (property)
ImageLike (interface) [lines 23-30] [3 members] — Pixels to compare
  ImageLike.width (property)
  ImageLike.height (property)
  ImageLike.data (property)
RenderOptions (interface) [lines 32-106] [24 members] — The options of `render`
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
PageOptions (interface) [lines 108-127] [6 members] — The options of `htmlPage`
  PageOptions.title (property) — The page title (default "smlibwasm")
  PageOptions.tolerance (property) — Tessellation tolerance
  PageOptions.angle (property) — Largest angle between neighbouring triangle normals on curved faces, degrees…
  PageOptions.edges (property) — Draw the B-rep edges (default true)
  PageOptions.view (property) — The direction from the model towards the camera, Z up…
  PageOptions.margin (property) — Room around the model when it is framed (default 1.1)
ShowOptions (interface) [lines 129-148] [6 members] — The options of `show`
  ShowOptions.title (property) — The page title (default "smlibwasm")
  ShowOptions.path (property) — Where to write the page (default
  ShowOptions.openBrowser (property) — Open the page in the default browser (default true)
  ShowOptions.tolerance (property) — Tessellation tolerance
  ShowOptions.angle (property) — Largest angle between neighbouring triangle normals on curved faces, degrees…
  ShowOptions.edges (property) — Draw the B-rep edges (default true)
