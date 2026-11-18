# replicad API index

replicad 1.2.0-beta.0 · 838 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature, and each top-level symbol names the lines of that file which hold its declaration and members: read only that range.

## Functions — `api-functions.md`

asDir (function) [lines 5-6]
asPnt (function) [lines 8-9]
bypassOperationCache (function) [lines 11-13] — Runs `fn` as library-internal work
createAssembly (function) [lines 15-16]
deserializeShape (function) [lines 18-19]
downcast (function) [lines 21-22]
elementOrdinals (function) [lines 24-26] — Positions of `elements` in the enumeration of `kind` sub shapes…
exportSTEP (function) [lines 28-32]
getOperationCache (function) [lines 34-36] — The installed operation cache, if any
getSingleFace (function) [lines 38-39]
importSTEP (function) [lines 41-43] — Creates a new shapes from a STEP file (as a…
importSTL (function) [lines 45-48] — Creates a new shapes from a STL file (as a…
importSTLAsMesh (function) [lines 50-53] — Imports an STL file (as a Blob or a File)…
isPoint (function) [lines 55-56]
isProjectionPlane (function) [lines 58-59]
isShape3D (function) [lines 61-62]
isWire (function) [lines 64-65]
iterTopo (function) [lines 67-68]
loadFont (function) [lines 70-73] — Import a font in the text system
lookFromPlane (function) [lines 75-76]
makeDirVector (function) [lines 78-79]
makePlane (function) [lines 81-85]
makePln (function) [lines 87-88]
measureArea (function) [lines 90-92] — Measure the area of a shape
measureDistanceBetween (function) [lines 94-96] — Measure the distance between two shapes
measureLength (function) [lines 98-100] — Measure the length of a shape
measureShapeLinearProperties (function) [lines 102-103]
measureShapeSurfaceProperties (function) [lines 105-106]
measureShapeVolumeProperties (function) [lines 108-109]
measureVolume (function) [lines 111-113] — Measure the volume of a shape
mirror (function) [lines 115-116]
resolveDirection (function) [lines 118-119]
rotate (function) [lines 121-122]
scale (function) [lines 124-125]
setOperationCache (function) [lines 127-130] — Installs an operation cache, or removes it with `undefined`, and…
translate (function) [lines 132-133]
addHolesInFace (function) [lines 135-136]
assembleWire (function) [lines 138-139]
atShapeExtremum (function) [lines 141-153] — Creates a predicate for a finder's `when` method that selects…
axis2d (function) [lines 155-156]
backMost (function) [lines 158-163] — Creates a predicate selecting elements touching the shape's minimum Y…
basicFaceExtrusion (function) [lines 165-166]
bottomMost (function) [lines 168-172] — Creates a predicate selecting elements touching the shape's minimum Z…
cast (function) [lines 174-175]
combineFinderFilters (function) [lines 177-183] — Combine a set of finder filters (defined with radius) to…
complexExtrude (function) [lines 185-187]
compoundShapes (function) [lines 189-190]
createNamedPlane (function) [lines 192-193]
cut2D (function) [lines 195-196]
cutBlueprints (function) [lines 198-199]
deserializeDrawing (function) [lines 201-203] — Deserializes a drawing from a string
draw (function) [lines 205-207] — Creates a drawing pen to programatically draw in 2D
drawCircle (function) [lines 209-212] — Creates the `Drawing` of a circle
drawEllipse (function) [lines 214-217] — Creates the `Drawing` of an ellipse
drawFaceOutline (function) [lines 219-221] — Creates the `Drawing` out of a face
drawParametricFunction (function) [lines 223-231] — Creates the `Drawing` of parametric function
drawPointsInterpolation (function) [lines 233-238] — Creates the `Drawing` by interpolating points as a curve
drawPolysides (function) [lines 240-243] — Creates the `Drawing` of an polygon in a defined plane
drawProjection (function) [lines 245-251] — Creates the `Drawing` of a projection of a shape on…
drawRectangle (function) [lines 253-257]
drawRoundedRectangle (function) [lines 259-265] — Creates the `Drawing` of a rectangle with (optional) rounded corners
drawSingleCircle (function) [lines 267-270] — Creates the `Drawing` of a circle as one single curve
drawSingleEllipse (function) [lines 272-275] — Creates the `Drawing` of an ellipse as one single curve
drawText (function) [lines 277-284] — Creates the `Drawing` of a text, in a defined font…
frontMost (function) [lines 286-291] — Creates a predicate selecting elements touching the shape's maximum Y…
fuse2D (function) [lines 293-294]
fuseBlueprints (function) [lines 296-297]
GCWithObject (function) [lines 299-300]
GCWithScope (function) [lines 302-303]
genericSweep (function) [lines 305-307]
getFont (function) [lines 309-310]
getManifold (function) [lines 312-313]
getOC (function) [lines 315-316]
intersect2D (function) [lines 318-319]
intersectBlueprints (function) [lines 321-322]
leftMost (function) [lines 324-328] — Creates a predicate selecting elements touching the shape's minimum X…
localGC (function) [lines 330-331]
loft (function) [lines 333-334]
makeAx1 (function) [lines 336-337]
makeAx2 (function) [lines 339-340]
makeAx3 (function) [lines 342-343]
makeBaseBox (function) [lines 345-351] — Builds a rectangular box of the given lengths
makeBezierCurve (function) [lines 353-354]
makeBox (function) [lines 356-358] — Creates a box with the given corner points
makeBSplineApproximation (function) [lines 360-361]
makeCircle (function) [lines 363-364]
makeCompound (function) [lines 366-367]
makeCylinder (function) [lines 369-371] — Creates a cylinder with the given radius and height
makeDirection (function) [lines 373-374]
makeEllipse (function) [lines 376-377]
makeEllipseArc (function) [lines 379-380]
makeEllipsoid (function) [lines 382-384] — Creates an ellipsoid with the given lengths of the axes,…
makeFace (function) [lines 386-387]
makeHelix (function) [lines 389-390]
makeLine (function) [lines 392-393]
makeNewFaceWithinFace (function) [lines 395-396]
makeNonPlanarFace (function) [lines 398-399]
makeOffset (function) [lines 401-402]
makePlaneFromFace (function) [lines 404-405]
makePolygon (function) [lines 407-408]
makeProjectedEdges (function) [lines 410-414]
makeSolid (function) [lines 416-419] — Welds faces and shells into a single shell and then…
makeSphere (function) [lines 421-423] — Creates a sphere with the given radius, centred on the…
makeTangentArc (function) [lines 425-426]
makeThreePointArc (function) [lines 428-429]
makeVertex (function) [lines 431-432]
organiseBlueprints (function) [lines 434-437] — Groups an array of blueprints such that blueprints that correspond…
polysideInnerRadius (function) [lines 439-441] — Helper function to compute the inner radius of a polyside…
polysidesBlueprint (function) [lines 443-444]
revolution (function) [lines 446-447]
rightMost (function) [lines 449-453] — Creates a predicate selecting elements touching the shape's maximum X…
roundedRectangleBlueprint (function) [lines 455-459]
setManifold (function) [lines 461-462]
setOC (function) [lines 464-465]
shapeType (function) [lines 467-468]
sketchCircle (function) [lines 470-472] — Creates the `Sketch` of a circle in a defined plane
sketchEllipse (function) [lines 474-476] — Creates the `Sketch` of an ellispe in a defined plane
sketchFaceOffset (function) [lines 478-480] — Creates the `Sketch` of an offset of a certain face
sketchHelix (function) [lines 482-484] — Creates the `Sketch` of a helix
sketchParametricFunction (function) [lines 486-493] — Creates the `Sketch` of parametric function in a specified plane
sketchPolysides (function) [lines 495-498] — Creates the `Sketch` of an polygon in a defined plane
sketchRectangle (function) [lines 500-502] — Creates the `Sketch` of a rectangle in a defined plane
sketchRoundedRectangle (function) [lines 504-509] — Creates the `Sketch` of a rounded rectangle in a defined…
sketchText (function) [lines 511-521] — Creates the `Sketches` of a text, in a defined font…
supportExtrude (function) [lines 523-524]
textBlueprints (function) [lines 526-533] — Creates the `Blueprints` of a text, in a defined font…
topMost (function) [lines 535-541] — Creates a predicate selecting elements touching the shape's maximum Z…
twistExtrude (function) [lines 543-545]
weldShellsAndFaces (function) [lines 547-551] — Welds faces and shells into a single shell

## Classes — `api-classes.md`

_1DShape (class) [lines 5-34] [13 members]
  _1DShape.repr (property)
  _1DShape.curve (property)
  _1DShape.startPoint (property)
  _1DShape.endPoint (property)
  _1DShape.tangentAt (method)
  _1DShape.pointAt (method)
  _1DShape.isClosed (property)
  _1DShape.isPeriodic (property)
  _1DShape.period (property)
  _1DShape.geomType (property)
  _1DShape.length (property)
  _1DShape.orientation (property)
  _1DShape.flipOrientation (method)
_3DShape (class) [lines 36-93] [12 members]
  _3DShape.fuse (method) — Builds a new shape out of the two, fused, shapes
  _3DShape.fuseAll (method) — Builds a new shape by fusing this shape with all…
  _3DShape.cut (method) — Builds a new shape by removing the tool tape from…
  _3DShape.cutAll (method) — Builds a new shape by removing all provided tool shapes…
  _3DShape.intersect (method) — Builds a new shape by intersecting this shape and another
  _3DShape.intersectAll (method) — Builds a new shape by intersecting this shape with all…
  _3DShape.cutPlane (method) — Cuts this shape with a plane and retains one of…
  _3DShape.meshShape (method)
  _3DShape.shell (method) — Hollows out the current shape, removing the faces found by…
  _3DShape.fillet (method) — Creates a new shapes with some edges filletted, as specified…
  _3DShape.chamfer (method) — Creates a new shapes with some edges chamfered, as specified…
  _3DShape.draft (method) — Applies a draft angle to selected faces of the shape
AssemblyExporter (class) [lines 95-95]
BaseSketcher2d (class) [lines 97-214] [39 members]
  BaseSketcher2d.pointer (property)
  BaseSketcher2d.firstPoint (property)
  BaseSketcher2d.pendingCurves (property)
  BaseSketcher2d.constructor (constructor)
  BaseSketcher2d.penPosition (property) — Returns the current pen position as [x, y] coordinates
  BaseSketcher2d.penAngle (property) — Returns the current pen angle in degrees
  BaseSketcher2d.movePointerTo (method)
  BaseSketcher2d.saveCurve (method)
  BaseSketcher2d.lineTo (method)
  BaseSketcher2d.line (method)
  BaseSketcher2d.vLine (method)
  BaseSketcher2d.hLine (method)
  BaseSketcher2d.vLineTo (method)
  BaseSketcher2d.hLineTo (method)
  BaseSketcher2d.polarLineTo (method)
  BaseSketcher2d.polarLine (method)
  BaseSketcher2d.tangentLine (method)
  BaseSketcher2d.threePointsArcTo (method)
  BaseSketcher2d.threePointsArc (method)
  BaseSketcher2d.sagittaArcTo (method)
  BaseSketcher2d.sagittaArc (method)
  BaseSketcher2d.vSagittaArc (method)
  BaseSketcher2d.hSagittaArc (method)
  BaseSketcher2d.bulgeArcTo (method)
  BaseSketcher2d.bulgeArc (method)
  BaseSketcher2d.vBulgeArc (method)
  BaseSketcher2d.hBulgeArc (method)
  BaseSketcher2d.tangentArcTo (method)
  BaseSketcher2d.tangentArc (method)
  BaseSketcher2d.ellipseTo (method)
  BaseSketcher2d.ellipse (method)
  BaseSketcher2d.halfEllipseTo (method)
  BaseSketcher2d.halfEllipse (method)
  BaseSketcher2d.bezierCurveTo (method)
  BaseSketcher2d.quadraticBezierCurveTo (method)
  BaseSketcher2d.cubicBezierCurveTo (method)
  BaseSketcher2d.smoothSplineTo (method)
  BaseSketcher2d.smoothSpline (method)
  BaseSketcher2d.customCorner (method) — Changes the corner between the previous and next segments
Blueprint (class) [lines 216-302] [26 members] — A Blueprint is an abstract Sketch, a 2D set of…
  Blueprint.curves (property)
  Blueprint.constructor (constructor)
  Blueprint.delete (method)
  Blueprint.clone (method)
  Blueprint.repr (property)
  Blueprint.boundingBox (property)
  Blueprint.orientation (property)
  Blueprint.stretch (method)
  Blueprint.scale (method)
  Blueprint.rotate (method)
  Blueprint.translate (method)
  Blueprint.mirror (method) — Returns the mirror image of this drawing made with a…
  Blueprint.sketchOnPlane (method) — Returns the sketched version of the drawing, on a plane
  Blueprint.sketchOnFace (method) — Returns the sketched version of the drawing, on a face
  Blueprint.subFace (method)
  Blueprint.punchHole (method)
  Blueprint.toSVGPathD (method)
  Blueprint.toSVGPath (method)
  Blueprint.toSVGViewBox (method) — Returns the SVG viewbox that corresponds to this drawing
  Blueprint.toSVGPaths (method) — Formats the drawing as a list of SVG paths
  Blueprint.toSVG (method) — Formats the drawing as an SVG image
  Blueprint.firstPoint (property)
  Blueprint.lastPoint (property)
  Blueprint.isInside (method)
  Blueprint.isClosed (method)
  Blueprint.intersects (method)
Blueprints (class) [lines 304-361] [16 members]
  Blueprints.blueprints (property)
  Blueprints.constructor (constructor)
  Blueprints.repr (property)
  Blueprints.clone (method)
  Blueprints.boundingBox (property)
  Blueprints.stretch (method)
  Blueprints.rotate (method)
  Blueprints.scale (method)
  Blueprints.translate (method)
  Blueprints.mirror (method) — Returns the mirror image of this drawing made with a…
  Blueprints.sketchOnPlane (method) — Returns the sketched version of the drawing, on a plane
  Blueprints.sketchOnFace (method) — Returns the sketched version of the drawing, on a face
  Blueprints.punchHole (method)
  Blueprints.toSVGViewBox (method) — Returns the SVG viewbox that corresponds to this drawing
  Blueprints.toSVGPaths (method) — Formats the drawing as a list of SVG paths
  Blueprints.toSVG (method) — Formats the drawing as an SVG image
BlueprintSketcher (class) [lines 363-382] [5 members]
  BlueprintSketcher.constructor (constructor)
  BlueprintSketcher.done (method) — Stop drawing and returns the sketch
  BlueprintSketcher.close (method) — Stop drawing, make sure the sketch is closed (by adding…
  BlueprintSketcher.closeWithMirror (method) — Stop drawing, make sure the sketch is closed (by mirroring…
  BlueprintSketcher.closeWithCustomCorner (method) — Stop drawing, make sure the sketch is closed (by adding…
BoundingBox (class) [lines 384-408] [10 members]
  BoundingBox.constructor (constructor)
  BoundingBox.fromBounds (method)
  BoundingBox.repr (property)
  BoundingBox.bounds (property)
  BoundingBox.center (property)
  BoundingBox.width (property)
  BoundingBox.height (property)
  BoundingBox.depth (property)
  BoundingBox.add (method)
  BoundingBox.isOut (method)
BoundingBox2d (class) [lines 410-435] [10 members]
  BoundingBox2d.constructor (constructor)
  BoundingBox2d.repr (property)
  BoundingBox2d.bounds (property)
  BoundingBox2d.center (property)
  BoundingBox2d.width (property)
  BoundingBox2d.height (property)
  BoundingBox2d.outsidePoint (method)
  BoundingBox2d.add (method)
  BoundingBox2d.isOut (method)
  BoundingBox2d.containsPoint (method)
Compound (class) [lines 437-437]
CompoundBlueprint (class) [lines 439-499] [17 members]
  CompoundBlueprint.blueprints (property)
  CompoundBlueprint.constructor (constructor)
  CompoundBlueprint.clone (method)
  CompoundBlueprint.boundingBox (property)
  CompoundBlueprint.repr (property)
  CompoundBlueprint.stretch (method)
  CompoundBlueprint.rotate (method)
  CompoundBlueprint.scale (method)
  CompoundBlueprint.translate (method)
  CompoundBlueprint.mirror (method) — Returns the mirror image of this drawing made with a…
  CompoundBlueprint.sketchOnPlane (method) — Returns the sketched version of the drawing, on a plane
  CompoundBlueprint.sketchOnFace (method) — Returns the sketched version of the drawing, on a face
  CompoundBlueprint.punchHole (method)
  CompoundBlueprint.toSVGViewBox (method) — Returns the SVG viewbox that corresponds to this drawing
  CompoundBlueprint.toSVGPaths (method) — Formats the drawing as a list of SVG paths
  CompoundBlueprint.toSVGGroup (method)
  CompoundBlueprint.toSVG (method) — Formats the drawing as an SVG image
CompoundSketch (class) [lines 501-543] [10 members] — A group of sketches that should correspond to a unique…
  CompoundSketch.sketches (property)
  CompoundSketch.constructor (constructor)
  CompoundSketch.delete (method)
  CompoundSketch.outerSketch (property)
  CompoundSketch.innerSketches (property)
  CompoundSketch.wires (property)
  CompoundSketch.face (method) — Transforms the lines into a face
  CompoundSketch.extrude (method) — Extrudes the sketch to a certain distance.(along the default direction…
  CompoundSketch.revolve (method) — Revolves the drawing on an axis (defined by its direction…
  CompoundSketch.loftWith (method) — Loft between this sketch and another sketch (or an array…
CompSolid (class) [lines 545-545]
CornerFinder (class) [lines 547-577] [8 members]
  CornerFinder.clone (method)
  CornerFinder.inList (method) — Filter to find corner that have their point are in…
  CornerFinder.atDistance (method) — Filter to find elements that are at a specified distance…
  CornerFinder.atPoint (method) — Filter to find elements that contain a certain point
  CornerFinder.inBox (method) — Filter to find elements that are within a box
  CornerFinder.ofAngle (method) — Filter to find corner that a certain angle between them…
  CornerFinder.shouldKeep (method) — Check if a particular element should be filtered or not…
  CornerFinder.applyFilter (method)
Curve (class) [lines 579-599] [9 members]
  Curve.repr (property)
  Curve.curveType (property)
  Curve.startPoint (property)
  Curve.endPoint (property)
  Curve.pointAt (method)
  Curve.tangentAt (method)
  Curve.isClosed (property)
  Curve.isPeriodic (property)
  Curve.period (property)
Curve2D (class) [lines 601-650] [19 members]
  Curve2D.constructor (constructor)
  Curve2D.boundingBox (property)
  Curve2D.repr (property)
  Curve2D.innerCurve (property)
  Curve2D.serialize (method)
  Curve2D.value (method)
  Curve2D.firstPoint (property)
  Curve2D.lastPoint (property)
  Curve2D.firstParameter (property)
  Curve2D.lastParameter (property)
  Curve2D.adaptor (method)
  Curve2D.geomType (property)
  Curve2D.clone (method)
  Curve2D.reverse (method)
  Curve2D.distanceFrom (method)
  Curve2D.isOnCurve (method)
  Curve2D.parameter (method)
  Curve2D.tangentAt (method)
  Curve2D.splitAt (method)
DistanceQuery (class) [lines 652-658] [2 members]
  DistanceQuery.constructor (constructor)
  DistanceQuery.distanceTo (method)
DistanceTool (class) [lines 660-666] [2 members]
  DistanceTool.constructor (constructor)
  DistanceTool.distanceBetween (method)
Drawing (class) [lines 668-755] [24 members]
  Drawing.constructor (constructor)
  Drawing.clone (method)
  Drawing.serialize (method)
  Drawing.boundingBox (property)
  Drawing.stretch (method)
  Drawing.repr (property)
  Drawing.rotate (method)
  Drawing.translate (method)
  Drawing.scale (method)
  Drawing.mirror (method) — Returns the mirror image of this drawing made with a…
  Drawing.cut (method) — Builds a new drawing by cuting another drawing into this…
  Drawing.fuse (method) — Builds a new drawing by merging another drawing into this…
  Drawing.intersect (method) — Builds a new drawing by intersection this drawing with another
  Drawing.fillet (method) — Creates a new drawing with some corners filletted, as specified…
  Drawing.chamfer (method) — Creates a new drawing with some corners filletted, as specified…
  Drawing.sketchOnPlane (method) — Returns the sketched version of the drawing, on a plane
  Drawing.sketchOnFace (method) — Returns the sketched version of the drawing, on a face
  Drawing.punchHole (method)
  Drawing.toSVG (method) — Formats the drawing as an SVG image
  Drawing.toSVGViewBox (method) — Returns the SVG viewbox that corresponds to this drawing
  Drawing.toSVGPaths (method) — Formats the drawing as a list of SVG paths
  Drawing.offset (method)
  Drawing.approximate (method)
  Drawing.blueprint (property)
DrawingPen (class) [lines 757-777] [5 members] — DrawingPen is a helper class to draw in 2D
  DrawingPen.constructor (constructor)
  DrawingPen.done (method) — Stop drawing and returns the sketch
  DrawingPen.close (method) — Stop drawing, make sure the sketch is closed (by adding…
  DrawingPen.closeWithMirror (method) — Stop drawing, make sure the sketch is closed (by mirroring…
  DrawingPen.closeWithCustomCorner (method) — Stop drawing, make sure the sketch is closed (by adding…
Edge (class) [lines 779-779]
EdgeFinder (class) [lines 781-814] [8 members] — With an EdgeFinder you can apply a set of filters…
  EdgeFinder.clone (method)
  EdgeFinder.inDirection (method) — Filter to find edges that are in a certain direction
  EdgeFinder.ofLength (method) — Filter to find edges of a certain length
  EdgeFinder.ofCurveType (method) — Filter to find edges that are of a cetain curve…
  EdgeFinder.parallelTo (method) — Filter to find edges that are parallel to a plane
  EdgeFinder.inPlane (method) — Filter to find edges that within a plane
  EdgeFinder.shouldKeep (method) — Check if a particular element should be filtered or not…
  EdgeFinder.applyFilter (method)
Face (class) [lines 816-847] [12 members]
  Face.surface (property)
  Face.orientation (property)
  Face.flipOrientation (method)
  Face.geomType (property)
  Face.UVBounds (property)
  Face.pointOnSurface (method)
  Face.uvCoordinates (method)
  Face.normalAt (method)
  Face.center (property)
  Face.outerWire (method)
  Face.innerWires (method)
  Face.triangulation (method)
FaceFinder (class) [lines 849-874] [6 members] — With a FaceFinder you can apply a set of filters…
  FaceFinder.clone (method)
  FaceFinder.parallelTo (method) — Filter to find faces that are parallel to plane or…
  FaceFinder.ofSurfaceType (method) — Filter to find faces that are of a cetain surface…
  FaceFinder.inPlane (method) — Filter to find faces that are contained in a plane
  FaceFinder.shouldKeep (method) — Check if a particular element should be filtered or not…
  FaceFinder.applyFilter (method)
FaceSketcher (class) [lines 876-902] [7 members] — The FaceSketcher allows you to sketch on a face that…
  FaceSketcher.face (property)
  FaceSketcher.constructor (constructor)
  FaceSketcher.buildWire (method)
  FaceSketcher.done (method) — Stop drawing and returns the sketch
  FaceSketcher.close (method) — Stop drawing, make sure the sketch is closed (by adding…
  FaceSketcher.closeWithMirror (method) — Stop drawing, make sure the sketch is closed (by mirroring…
  FaceSketcher.closeWithCustomCorner (method) — Stop drawing, make sure the sketch is closed (by adding…
LinearPhysicalProperties (class) [lines 904-906] [1 members]
  LinearPhysicalProperties.length (property)

## Classes (2) — `api-classes-2.md`

MeshShape (class) [lines 5-90] [27 members]
  MeshShape.constructor (constructor)
  MeshShape.clone (method)
  MeshShape.fuse (method)
  MeshShape.cut (method)
  MeshShape.intersect (method)
  MeshShape.translate (method)
  MeshShape.translateX (method)
  MeshShape.translateY (method)
  MeshShape.translateZ (method)
  MeshShape.rotate (method)
  MeshShape.scale (method)
  MeshShape.mirror (method)
  MeshShape.simplify (method)
  MeshShape.refine (method)
  MeshShape.refineToLength (method)
  MeshShape.refineToTolerance (method)
  MeshShape.hull (method)
  MeshShape.asOriginal (method)
  MeshShape.mesh (method)
  MeshShape.boundingBox (property)
  MeshShape.volume (method)
  MeshShape.surfaceArea (method)
  MeshShape.numTri (method)
  MeshShape.numVert (method)
  MeshShape.numEdge (method)
  MeshShape.isEmpty (property)
  MeshShape.blobSTL (method) — Exports the mesh shape as an STL file Blob
Plane (class) [lines 92-142] [18 members]
  Plane.oc (property)
  Plane.xDir (property)
  Plane.yDir (property)
  Plane.zDir (property)
  Plane.constructor (constructor)
  Plane.delete (method)
  Plane.clone (method)
  Plane.origin (property)
  Plane.translateTo (method)
  Plane.translate (method)
  Plane.translateX (method)
  Plane.translateY (method)
  Plane.translateZ (method)
  Plane.pivot (method)
  Plane.rotate2DAxes (method)
  Plane.setOrigin2d (method)
  Plane.toLocalCoords (method)
  Plane.toWorldCoords (method)
ProjectionCamera (class) [lines 144-172] [10 members]
  ProjectionCamera.constructor (constructor)
  ProjectionCamera.position (property)
  ProjectionCamera.direction (property)
  ProjectionCamera.xAxis (property)
  ProjectionCamera.yAxis (property)
  ProjectionCamera.autoAxes (method)
  ProjectionCamera.setPosition (method)
  ProjectionCamera.setXAxis (method)
  ProjectionCamera.setYAxis (method)
  ProjectionCamera.lookAt (method)
Shape (class) [lines 174-263] [26 members]
  Shape.constructor (constructor)
  Shape.clone (method)
  Shape.serialize (method)
  Shape.hashCode (property)
  Shape.isNull (property)
  Shape.isSame (method)
  Shape.isEqual (method)
  Shape.split (method) — Splits the solid parts of this shape with an oriented…
  Shape.asShape3D (method) — Asserts that this shape is a 3D shape (Shell, Solid,…
  Shape.simplify (method) — Simplifies the shape by removing unnecessary edges and faces
  Shape.translate (method) — Translates the shape of an arbitrary vector
  Shape.translateX (method) — Translates the shape on the X axis
  Shape.translateY (method) — Translates the shape on the Y axis
  Shape.translateZ (method) — Translates the shape on the Z axis
  Shape.rotate (method) — Rotates the shape
  Shape.mirror (method) — Mirrors the shape through a plane
  Shape.scale (method) — Returns a scaled version of the shape
  Shape.edges (property)
  Shape.faces (property)
  Shape.solids (property)
  Shape.wires (property)
  Shape.boundingBox (property)
  Shape.mesh (method) — Exports the current shape as a set of triangle
  Shape.meshEdges (method) — Exports the current shape as a set of lines
  Shape.blobSTEP (method) — Exports the current shape as a STEP file as a…
  Shape.blobSTL (method) — Exports the current shape as a STL file as a…
Shell (class) [lines 265-265]
Sketch (class) [lines 267-326] [14 members] — A line drawing to be acted upon
  Sketch.wire (property)
  Sketch.constructor (constructor)
  Sketch.baseFace (property)
  Sketch.delete (method)
  Sketch.clone (method)
  Sketch.defaultOrigin (property)
  Sketch.defaultDirection (property)
  Sketch.face (method) — Transforms the lines into a face
  Sketch.wires (method)
  Sketch.faces (method)
  Sketch.revolve (method) — Revolves the drawing on an axis (defined by its direction…
  Sketch.extrude (method) — Extrudes the sketch to a certain distance.(along the default direction…
  Sketch.sweepSketch (method) — Sweep along this sketch another sketch defined in the function…
  Sketch.loftWith (method) — Loft between this sketch and another sketch (or an array…
Sketcher (class) [lines 328-491] [41 members] — The FaceSketcher allows you to sketch on a plane
  Sketcher.plane (property)
  Sketcher.pointer (property)
  Sketcher.firstPoint (property)
  Sketcher.pendingEdges (property)
  Sketcher.constructor (constructor)
  Sketcher.delete (method)
  Sketcher.movePointerTo (method) — Changes the point to start your drawing from
  Sketcher.lineTo (method) — Draws a line from the current point to the point…
  Sketcher.line (method) — Draws a line at the horizontal distance xDist and the…
  Sketcher.vLine (method) — Draws a vertical line of length distance from the current…
  Sketcher.hLine (method) — Draws an horizontal line of length distance from the current…
  Sketcher.vLineTo (method) — Draws a vertical line to the y coordinate
  Sketcher.hLineTo (method) — Draws an horizontal line to the x coordinate
  Sketcher.polarLine (method) — Draws a line from the current point to the point…
  Sketcher.polarLineTo (method) — Draws a line from the current point to the point…
  Sketcher.tangentLine (method) — Draws a line from the current point as a tangent…
  Sketcher.threePointsArcTo (method) — Draws an arc of circle by defining its end point…
  Sketcher.threePointsArc (method) — Draws an arc of circle by defining its end point…
  Sketcher.tangentArcTo (method) — Draws an arc of circle from the current point as…
  Sketcher.tangentArc (method) — Draws an arc of circle from the current point as…
  Sketcher.sagittaArcTo (method) — Draws an arc of circle by defining its end point…
  Sketcher.sagittaArc (method) — Draws an arc of circle by defining its end point…
  Sketcher.vSagittaArc (method) — Draws a vertical arc of circle by defining its end…
  Sketcher.hSagittaArc (method) — Draws an horizontal arc of circle by defining its end…
  Sketcher.bulgeArcTo (method) — Draws an arc of circle by defining its end point…
  Sketcher.bulgeArc (method) — Draws an arc of circle by defining its end point…
  Sketcher.vBulgeArc (method) — Draws a vertical arc of circle by defining its end…
  Sketcher.hBulgeArc (method) — Draws an horizontal arc of circle by defining its end…
  Sketcher.ellipseTo (method) — Draws an arc of ellipse by defining its end point…
  Sketcher.ellipse (method) — Draws an arc of ellipse by defining its end point…
  Sketcher.halfEllipseTo (method) — Draws an arc as half an ellipse, defined by the…
  Sketcher.halfEllipse (method) — Draws an arc as half an ellipse, defined by the…
  Sketcher.bezierCurveTo (method) — Draws a generic bezier curve to the end point, going…
  Sketcher.quadraticBezierCurveTo (method) — Draws a quadratic bezier curve to the end point, using…
  Sketcher.cubicBezierCurveTo (method) — Draws a cubic bezier curve to the end point, using…
  Sketcher.smoothSplineTo (method) — Draws a cubic bezier curve to the end point, attempting…
  Sketcher.smoothSpline (method) — Draws a cubic bezier curve to the end point, attempting…
  Sketcher.buildWire (method)
  Sketcher.done (method) — Stop drawing and returns the sketch
  Sketcher.close (method) — Stop drawing, make sure the sketch is closed (by adding…
  Sketcher.closeWithMirror (method) — Stop drawing, make sure the sketch is closed (by mirroring…
Sketches (class) [lines 493-521] [6 members]
  Sketches.sketches (property)
  Sketches.constructor (constructor)
  Sketches.wires (method)
  Sketches.faces (method)
  Sketches.extrude (method) — Extrudes the sketch to a certain distance.(along the default direction…
  Sketches.revolve (method) — Revolves the drawing on an axis (defined by its direction…
Solid (class) [lines 523-523]
Surface (class) [lines 525-527] [1 members]
  Surface.surfaceType (property)
SurfacePhysicalProperties (class) [lines 529-531] [1 members]
  SurfacePhysicalProperties.area (property)
Transformation (class) [lines 533-567] [11 members]
  Transformation.constructor (constructor)
  Transformation.clone (method)
  Transformation.translate (method)
  Transformation.rotate (method)
  Transformation.mirror (method)
  Transformation.scale (method)
  Transformation.inverse (method)
  Transformation.inverted (method)
  Transformation.coordSystemChange (method)
  Transformation.transformPoint (method)
  Transformation.transform (method)
Vector (class) [lines 569-627] [21 members]
  Vector.constructor (constructor)
  Vector.repr (property)
  Vector.x (property)
  Vector.y (property)
  Vector.z (property)
  Vector.Length (property)
  Vector.toTuple (method)
  Vector.cross (method)
  Vector.dot (method)
  Vector.sub (method)
  Vector.add (method)
  Vector.multiply (method)
  Vector.normalized (method)
  Vector.normalize (method)
  Vector.getCenter (method)
  Vector.getAngle (method)
  Vector.projectToPlane (method)
  Vector.equals (method)
  Vector.toPnt (method)
  Vector.toDir (method)
  Vector.rotate (method)
Vertex (class) [lines 629-632] [1 members]
  Vertex.asTuple (method)
VolumePhysicalProperties (class) [lines 634-636] [1 members]
  VolumePhysicalProperties.volume (property)
Wire (class) [lines 638-641] [1 members]
  Wire.offset2D (method)
WrappingObj (class) [lines 643-653] [4 members]
  WrappingObj.oc (property)
  WrappingObj.constructor (constructor)
  WrappingObj.wrapped (property)
  WrappingObj.delete (method)

## Types — `api-types.md`

AnyShape (type) [lines 5-5]
AxisName (type) [lines 7-7]
ChamferRadius (type) [lines 9-18] — We can defined a chamfer with only a number -…
Corner (type) [lines 20-30] [3 members]
  Corner.firstCurve (property)
  Corner.secondCurve (property)
  Corner.point (property)
CubeFace (type) [lines 32-32]
CurveType (type) [lines 34-34]
Direction (type) [lines 36-37] — A vector-like point or a named principal axis
FilletRadius (type) [lines 39-39]
FilterFcn (type) [lines 41-48] [2 members]
  FilterFcn.element (property)
  FilterFcn.normal (property)
FinderFunction (type) [lines 50-50]
ManifoldBox (type) [lines 52-56] [2 members]
  ManifoldBox.min (property)
  ManifoldBox.max (property)
ManifoldInstance (type) [lines 58-58]
ManifoldMesh (type) [lines 60-60]
ManifoldVec3 (type) [lines 62-62]
OperationEffect (type) [lines 64-66] — How an operation treats its receiver
PlaneName (type) [lines 68-68]
PlaneSide (type) [lines 70-70]
Point (type) [lines 72-75]
Point2D (type) [lines 77-77]
ProjectionPlane (type) [lines 79-79]
RadiusConfig (type) [lines 81-87] — A generic way to define radii for fillet or chamfer…
ScaleMode (type) [lines 89-89]
Shape2D (type) [lines 91-91]
Shape3D (type) [lines 93-93]
ShapeConfig (type) [lines 95-123] [7 members]
  ShapeConfig.shape (property)
  ShapeConfig.color (property)
  ShapeConfig.alpha (property)
  ShapeConfig.name (property)
  ShapeConfig.metalness (property) — PBR metalness factor (0 = dielectric, 1 = metal)
  ShapeConfig.roughness (property) — PBR roughness factor — threaded to GLTF only (not STEP
  ShapeConfig.density (property) — Material density in g/cm3, written as the shape's STEP material
SimplePoint (type) [lines 125-125]
SingleFace (type) [lines 127-127]
SplineConfig (type) [lines 129-134]
SupportedUnit (type) [lines 136-136]
SurfaceType (type) [lines 138-138]
TopoEntity (type) [lines 140-140]

## Constants — `api-constants.md`

AXIS_NAMES (constant) [lines 5-5]
DEG2RAD (constant) [lines 7-7]
finderClauses (constant) [lines 9-20] [3 members] — Finder clauses by how their arguments describe them, for a…
  finderClauses.value (property)
  finderClauses.combinator (property)
  finderClauses.predicate (property)
HASH_CODE_MAX (constant) [lines 22-22]
RAD2DEG (constant) [lines 24-24]

## Interfaces — `api-interfaces.md`

BooleanOperationOptions (interface) [lines 5-7] [1 members]
  BooleanOperationOptions.optimisation (property)
BSplineApproximationConfig (interface) [lines 9-17] [4 members]
  BSplineApproximationConfig.tolerance (property)
  BSplineApproximationConfig.degMax (property)
  BSplineApproximationConfig.degMin (property)
  BSplineApproximationConfig.smoothing (property)
CurveLike (interface) [lines 19-46] [9 members]
  CurveLike.delete (method)
  CurveLike.Value (method)
  CurveLike.IsPeriodic (method)
  CurveLike.Period (method)
  CurveLike.IsClosed (method)
  CurveLike.FirstParameter (method)
  CurveLike.LastParameter (method)
  CurveLike.GetType (method)
  CurveLike.D1 (method)
Deletable (interface) [lines 48-50] [1 members]
  Deletable.delete (property)
DrawingInterface (interface) [lines 52-94] [11 members]
  DrawingInterface.clone (method)
  DrawingInterface.boundingBox (property)
  DrawingInterface.stretch (method)
  DrawingInterface.rotate (method)
  DrawingInterface.translate (method)
  DrawingInterface.mirror (method) — Returns the mirror image of this drawing made with a…
  DrawingInterface.sketchOnPlane (method) — Returns the sketched version of the drawing, on a plane
  DrawingInterface.sketchOnFace (method) — Returns the sketched version of the drawing, on a face
  DrawingInterface.toSVG (method) — Formats the drawing as an SVG image
  DrawingInterface.toSVGViewBox (method) — Returns the SVG viewbox that corresponds to this drawing
  DrawingInterface.toSVGPaths (method) — Formats the drawing as a list of SVG paths
ExtrusionProfile (interface) [lines 96-100] [2 members]
  ExtrusionProfile.profile (property)
  ExtrusionProfile.endFactor (property)
FaceTriangulation (interface) [lines 102-108] [3 members]
  FaceTriangulation.vertices (property)
  FaceTriangulation.trianglesIndexes (property)
  FaceTriangulation.verticesNormals (property)
FaceUVBounds (interface) [lines 110-118] [4 members]
  FaceUVBounds.uMin (property)
  FaceUVBounds.uMax (property)
  FaceUVBounds.vMin (property)
  FaceUVBounds.vMax (property)
GenericSketcher (interface) [lines 120-265] [34 members] — Sketchers allow the user to draw a two dimentional shape…
  GenericSketcher.movePointerTo (method) — Changes the point to start your drawing from
  GenericSketcher.lineTo (method) — Draws a line from the current point to the point…
  GenericSketcher.line (method) — Draws a line at the horizontal distance xDist and the…
  GenericSketcher.vLine (method) — Draws a vertical line of length distance from the current…
  GenericSketcher.hLine (method) — Draws an horizontal line of length distance from the current…
  GenericSketcher.vLineTo (method) — Draws a vertical line to the y coordinate
  GenericSketcher.hLineTo (method) — Draws an horizontal line to the x coordinate
  GenericSketcher.polarLineTo (method) — Draws a line from the current point to the point…
  GenericSketcher.polarLine (method) — Draws a line from the current point to the point…
  GenericSketcher.tangentLine (method) — Draws a line from the current point as a tangent…
  GenericSketcher.threePointsArcTo (method) — Draws an arc of circle by defining its end point…
  GenericSketcher.threePointsArc (method) — Draws an arc of circle by defining its end point…
  GenericSketcher.sagittaArcTo (method) — Draws an arc of circle by defining its end point…
  GenericSketcher.sagittaArc (method) — Draws an arc of circle by defining its end point…
  GenericSketcher.vSagittaArc (method) — Draws a vertical arc of circle by defining its end…
  GenericSketcher.hSagittaArc (method) — Draws an horizontal arc of circle by defining its end…
  GenericSketcher.bulgeArcTo (method) — Draws an arc of circle by defining its end point…
  GenericSketcher.bulgeArc (method) — Draws an arc of circle by defining its end point…
  GenericSketcher.vBulgeArc (method) — Draws a vertical arc of circle by defining its end…
  GenericSketcher.hBulgeArc (method) — Draws an horizontal arc of circle by defining its end…
  GenericSketcher.tangentArcTo (method) — Draws an arc of circle from the current point as…
  GenericSketcher.tangentArc (method) — Draws an arc of circle from the current point as…
  GenericSketcher.ellipseTo (method) — Draws an arc of ellipse by defining its end point…
  GenericSketcher.ellipse (method) — Draws an arc of ellipse by defining its end point…
  GenericSketcher.halfEllipseTo (method) — Draws an arc as half an ellipse, defined by the…
  GenericSketcher.halfEllipse (method) — Draws an arc as half an ellipse, defined by the…
  GenericSketcher.bezierCurveTo (method) — Draws a generic bezier curve to the end point, going…
  GenericSketcher.quadraticBezierCurveTo (method) — Draws a quadratic bezier curve to the end point, using…
  GenericSketcher.cubicBezierCurveTo (method) — Draws a cubic bezier curve to the end point, using…
  GenericSketcher.smoothSplineTo (method) — Draws a cubic bezier curve to the end point, attempting…
  GenericSketcher.smoothSpline (method) — Draws a cubic bezier curve to the end point, attempting…
  GenericSketcher.done (method) — Stop drawing and returns the sketch
  GenericSketcher.close (method) — Stop drawing, make sure the sketch is closed (by adding…
  GenericSketcher.closeWithMirror (method) — Stop drawing, make sure the sketch is closed (by mirroring…
GenericSweepConfig (interface) [lines 267-281] [7 members]
  GenericSweepConfig.frenet (property)
  GenericSweepConfig.auxiliarySpine (property)
  GenericSweepConfig.law (property)
  GenericSweepConfig.transitionMode (property)
  GenericSweepConfig.withContact (property)
  GenericSweepConfig.support (property)
  GenericSweepConfig.forceProfileSpineOthogonality (property)
LoftConfig (interface) [lines 283-289] [3 members]
  LoftConfig.ruled (property)
  LoftConfig.startPoint (property)
  LoftConfig.endPoint (property)
MeshOptions (interface) [lines 291-295] [2 members]
  MeshOptions.tolerance (property)
  MeshOptions.angularTolerance (property)
MeshShapeMesh (interface) [lines 297-307] [5 members]
  MeshShapeMesh.vertices (property)
  MeshShapeMesh.triangles (property)
  MeshShapeMesh.normals (property)
  MeshShapeMesh.vertProperties (property)
  MeshShapeMesh.numProp (property)
OperationCache (interface) [lines 309-321] [3 members] — A host cache
  OperationCache.operation (method)
  OperationCache.step (method)
  OperationCache.elements (method) — Topological elements that user code took from `owner` (the `edges`,…
OperationRequest (interface) [lines 323-356] [10 members] — One public operation, described lazily
  OperationRequest.op (property) — `Class.method`, `set:Class.property` or the exported function name
  OperationRequest.effect (property)
  OperationRequest.receiver (property) — `this` of a method
  OperationRequest.args (property) — The arguments as passed
  OperationRequest.finderArgs (property) — Positions of finder arguments among `args`
  OperationRequest.returnsBuilder (property) — The result is a mutable builder (a pen from `draw()`)
  OperationRequest.deterministicErrors (property) — The operation's errors are a deterministic function of its inputs…
  OperationRequest.freshState (property) — For a builder (pen, sketcher) the cache has not seen
  OperationRequest.compute (method) — Runs the operation
  OperationRequest.consume (method) — Deletes what the operation would have deleted
OperationStep (interface) [lines 358-376] [6 members] — The part of an operation that depends on a callback…
  OperationStep.op (property)
  OperationStep.receiver (property)
  OperationStep.deterministicErrors (property) — See {@link OperationRequest.deterministicErrors}
  OperationStep.values (method) — The inputs known after the callback ran (selected element ordinals…
  OperationStep.compute (method)
  OperationStep.consume (method)
PlaneConfig (interface) [lines 378-382] [2 members]
  PlaneConfig.plane (property)
  PlaneConfig.origin (property)
PlaneFace (interface) [lines 384-390] [2 members]
  PlaneFace.pointOnSurface (method)
  PlaneFace.normalAt (method)
PlaneSplitResult (interface) [lines 392-399] [3 members] — Pieces grouped by their position relative to an oriented plane
  PlaneSplitResult.positive (property)
  PlaneSplitResult.negative (property)
  PlaneSplitResult.on (property)
Shape3DLike (interface) [lines 401-437] [12 members]
  Shape3DLike.fuse (method)
  Shape3DLike.cut (method)
  Shape3DLike.intersect (method)
  Shape3DLike.translate (method)
  Shape3DLike.translateX (method)
  Shape3DLike.translateY (method)
  Shape3DLike.translateZ (method)
  Shape3DLike.rotate (method)
  Shape3DLike.scale (method)
  Shape3DLike.mirror (method)
  Shape3DLike.mesh (method)
  Shape3DLike.boundingBox (property)
ShapeEdgeMesh (interface) [lines 439-447] [2 members]
  ShapeEdgeMesh.lines (property)
  ShapeEdgeMesh.edgeGroups (property)
ShapeMesh (interface) [lines 449-461] [4 members]
  ShapeMesh.triangles (property)
  ShapeMesh.vertices (property)
  ShapeMesh.normals (property)
  ShapeMesh.faceGroups (property)
SketchInterface (interface) [lines 463-489] [4 members]
  SketchInterface.face (method) — Transforms the lines into a face
  SketchInterface.revolve (method) — Revolves the drawing on an axis (defined by its direction…
  SketchInterface.extrude (method) — Extrudes the sketch to a certain distance.(along the default direction…
  SketchInterface.loftWith (method) — Loft between this sketch and another sketch (or an array…
STLExportOptions (interface) [lines 491-493] [1 members]
  STLExportOptions.binary (property)
TopologyMap (interface) [lines 495-513] [9 members]
  TopologyMap.vertex (property)
  TopologyMap.edge (property)
  TopologyMap.wire (property)
  TopologyMap.face (property)
  TopologyMap.shell (property)
  TopologyMap.solid (property)
  TopologyMap.solidCompound (property)
  TopologyMap.compound (property)
  TopologyMap.shape (property)
