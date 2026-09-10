# replicad API index

replicad 0.23.4-beta.2 · 742 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## Functions — `api-functions.md`

asDir (function)
asPnt (function)
cast (function)
complexExtrude (function)
createAssembly (function)
deserializeDrawing (function) — Deserializes a drawing from a string
deserializeShape (function)
downcast (function)
draw (function) — Creates a drawing pen to programatically draw in 2D
drawCircle (function) — Creates the `Drawing` of a circle
drawEllipse (function) — Creates the `Drawing` of an ellipse
drawFaceOutline (function) — Creates the `Drawing` out of a face
drawPolysides (function) — Creates the `Drawing` of an polygon in a defined plane
drawProjection (function) — Creates the `Drawing` of a projection of a shape on…
drawRoundedRectangle (function) — Creates the `Drawing` of a rectangle with (optional) rounded corners
drawSingleCircle (function) — Creates the `Drawing` of a circle as one single curve
drawSingleEllipse (function) — Creates the `Drawing` of an ellipse as one single curve
drawText (function) — Creates the `Drawing` of a text, in a defined font…
exportSTEP (function)
genericSweep (function)
getSingleFace (function)
importSTEP (function) — Creates a new shapes from a STEP file (as a…
importSTL (function) — Creates a new shapes from a STL file (as a…
importSTLAsMesh (function) — Imports an STL file (as a Blob or a File)…
intersect2D (function)
isPoint (function)
isProjectionPlane (function)
isShape3D (function)
isWire (function)
loadFont (function) — Import a font in the text system
lookFromPlane (function)
makeDirection (function)
makePlane (function)
makePln (function)
makeProjectedEdges (function)
makeSolid (function) — Welds faces and shells into a single shell and then…
measureArea (function) — Measure the area of a shape
measureDistanceBetween (function) — Measure the distance between two shapes
measureLength (function) — Measure the length of a shape
measureShapeLinearProperties (function)
measureShapeSurfaceProperties (function)
measureShapeVolumeProperties (function)
measureVolume (function) — Measure the volume of a shape
mirror (function)
rotate (function)
scale (function)
sketchText (function) — Creates the `Sketches` of a text, in a defined font…
textBlueprints (function) — Creates the `Blueprints` of a text, in a defined font…
translate (function)
twistExtrude (function)
weldShellsAndFaces (function) — Welds faces and shells into a single shell
addHolesInFace (function)
assembleWire (function)
axis2d (function)
basicFaceExtrusion (function)
combineFinderFilters (function) — Combine a set of finder filters (defined with radius) to…
compoundShapes (function)
createNamedPlane (function)
cut2D (function)
cutBlueprints (function)
drawParametricFunction (function) — Creates the `Drawing` of parametric function
drawPointsInterpolation (function) — Creates the `Drawing` by interpolating points as a curve
drawRectangle (function)
fuse2D (function)
fuseBlueprints (function)
GCWithObject (function)
GCWithScope (function)
getFont (function)
getManifold (function)
getOC (function)
intersectBlueprints (function)
iterTopo (function)
localGC (function)
loft (function)
makeAx1 (function)
makeAx2 (function)
makeAx3 (function)
makeBaseBox (function)
makeBezierCurve (function)
makeBox (function) — Creates a box with the given corner points
makeBSplineApproximation (function)
makeCircle (function)
makeCompound (function)
makeCylinder (function) — Creates a cylinder with the given radius and height
makeEllipse (function)
makeEllipseArc (function)
makeEllipsoid (function) — Creates an ellipsoid with the given lengths of the axes
makeFace (function)
makeHelix (function)
makeLine (function)
makeNewFaceWithinFace (function)
makeNonPlanarFace (function)
makeOffset (function)
makePlaneFromFace (function)
makePolygon (function)
makeSphere (function) — Creates a sphere with the given radius
makeTangentArc (function)
makeThreePointArc (function)
makeVertex (function)
organiseBlueprints (function) — Groups an array of blueprints such that blueprints that correspond…
polysideInnerRadius (function) — Helper function to compute the inner radius of a polyside…
polysidesBlueprint (function)
revolution (function)
roundedRectangleBlueprint (function)
setManifold (function)
setOC (function)
shapeType (function)
sketchCircle (function) — Creates the `Sketch` of a circle in a defined plane
sketchEllipse (function) — Creates the `Sketch` of an ellispe in a defined plane
sketchFaceOffset (function) — Creates the `Sketch` of an offset of a certain face
sketchHelix (function) — Creates the `Sketch` of a helix
sketchParametricFunction (function) — Creates the `Sketch` of parametric function in a specified plane
sketchPolysides (function) — Creates the `Sketch` of an polygon in a defined plane
sketchRectangle (function) — Creates the `Sketch` of a rectangle in a defined plane
sketchRoundedRectangle (function) — Creates the `Sketch` of a rounded rectangle in a defined…
supportExtrude (function)

## Classs — `api-classs.md`

\_1DShape (class) [13 members]
\_1DShape.repr (property)
\_1DShape.curve (property)
\_1DShape.startPoint (property)
\_1DShape.endPoint (property)
\_1DShape.tangentAt (method)
\_1DShape.pointAt (method)
\_1DShape.isClosed (property)
\_1DShape.isPeriodic (property)
\_1DShape.period (property)
\_1DShape.geomType (property)
\_1DShape.length (property)
\_1DShape.orientation (property)
\_1DShape.flipOrientation (method)
\_3DShape (class) [11 members]
\_3DShape.fuse (method) — Builds a new shape out of the two, fused, shapes
\_3DShape.fuseAll (method) — Builds a new shape by fusing this shape with all…
\_3DShape.cut (method) — Builds a new shape by removing the tool tape from…
\_3DShape.cutAll (method) — Builds a new shape by removing all provided tool shapes…
\_3DShape.intersect (method) — Builds a new shape by intersecting this shape and another
\_3DShape.intersectAll (method) — Builds a new shape by intersecting this shape with all…
\_3DShape.meshShape (method)
\_3DShape.shell (method) — Hollows out the current shape, removing the faces found by…
\_3DShape.fillet (method) — Creates a new shapes with some edges filletted, as specified…
\_3DShape.chamfer (method) — Creates a new shapes with some edges chamfered, as specified…
\_3DShape.draft (method) — Applies a draft angle to selected faces of the shape
AssemblyExporter (class)
BaseSketcher2d (class) [39 members]
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
Blueprint (class) [26 members] — A Blueprint is an abstract Sketch, a 2D set of…
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
Blueprints (class) [16 members]
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
BlueprintSketcher (class) [5 members]
BlueprintSketcher.constructor (constructor)
BlueprintSketcher.done (method) — Stop drawing and returns the sketch
BlueprintSketcher.close (method) — Stop drawing, make sure the sketch is closed (by adding…
BlueprintSketcher.closeWithMirror (method) — Stop drawing, make sure the sketch is closed (by mirroring…
BlueprintSketcher.closeWithCustomCorner (method) — Stop drawing, make sure the sketch is closed (by adding…
BoundingBox (class) [10 members]
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
BoundingBox2d (class) [10 members]
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
Compound (class)
CompoundBlueprint (class) [17 members]
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
CompoundSketch (class) [10 members] — A group of sketches that should correspond to a unique…
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
CompSolid (class)
CornerFinder (class) [8 members]
CornerFinder.clone (method)
CornerFinder.inList (method) — Filter to find corner that have their point are in…
CornerFinder.atDistance (method) — Filter to find elements that are at a specified distance…
CornerFinder.atPoint (method) — Filter to find elements that contain a certain point
CornerFinder.inBox (method) — Filter to find elements that are within a box
CornerFinder.ofAngle (method) — Filter to find corner that a certain angle between them…
CornerFinder.shouldKeep (method) — Check if a particular element should be filtered or not…
CornerFinder.applyFilter (method)
Curve (class) [9 members]
Curve.repr (property)
Curve.curveType (property)
Curve.startPoint (property)
Curve.endPoint (property)
Curve.pointAt (method)
Curve.tangentAt (method)
Curve.isClosed (property)
Curve.isPeriodic (property)
Curve.period (property)
Curve2D (class) [19 members]
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
DistanceQuery (class) [2 members]
DistanceQuery.constructor (constructor)
DistanceQuery.distanceTo (method)
DistanceTool (class) [2 members]
DistanceTool.constructor (constructor)
DistanceTool.distanceBetween (method)
Drawing (class) [24 members]
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
DrawingPen (class) [5 members] — DrawingPen is a helper class to draw in 2D
DrawingPen.constructor (constructor)
DrawingPen.done (method) — Stop drawing and returns the sketch
DrawingPen.close (method) — Stop drawing, make sure the sketch is closed (by adding…
DrawingPen.closeWithMirror (method) — Stop drawing, make sure the sketch is closed (by mirroring…
DrawingPen.closeWithCustomCorner (method) — Stop drawing, make sure the sketch is closed (by adding…
Edge (class)
EdgeFinder (class) [8 members] — With an EdgeFinder you can apply a set of filters…
EdgeFinder.clone (method)
EdgeFinder.inDirection (method) — Filter to find edges that are in a certain direction
EdgeFinder.ofLength (method) — Filter to find edges of a certain length
EdgeFinder.ofCurveType (method) — Filter to find edges that are of a cetain curve…
EdgeFinder.parallelTo (method) — Filter to find edges that are parallel to a plane
EdgeFinder.inPlane (method) — Filter to find edges that within a plane
EdgeFinder.shouldKeep (method) — Check if a particular element should be filtered or not…
EdgeFinder.applyFilter (method)
Face (class) [12 members]
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
FaceFinder (class) [6 members] — With a FaceFinder you can apply a set of filters…
FaceFinder.clone (method)
FaceFinder.parallelTo (method) — Filter to find faces that are parallel to plane or…
FaceFinder.ofSurfaceType (method) — Filter to find faces that are of a cetain surface…
FaceFinder.inPlane (method) — Filter to find faces that are contained in a plane
FaceFinder.shouldKeep (method) — Check if a particular element should be filtered or not…
FaceFinder.applyFilter (method)
FaceSketcher (class) [7 members] — The FaceSketcher allows you to sketch on a face that…
FaceSketcher.face (property)
FaceSketcher.constructor (constructor)
FaceSketcher.buildWire (method)
FaceSketcher.done (method) — Stop drawing and returns the sketch
FaceSketcher.close (method) — Stop drawing, make sure the sketch is closed (by adding…
FaceSketcher.closeWithMirror (method) — Stop drawing, make sure the sketch is closed (by mirroring…
FaceSketcher.closeWithCustomCorner (method) — Stop drawing, make sure the sketch is closed (by adding…
LinearPhysicalProperties (class) [1 members]
LinearPhysicalProperties.length (property)
MeshShape (class) [27 members]
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
Plane (class) [18 members]
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
ProjectionCamera (class) [10 members]
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

## Classs (2) — `api-classs-2.md`

Shape (class) [24 members]
Shape.constructor (constructor)
Shape.clone (method)
Shape.serialize (method)
Shape.hashCode (property)
Shape.isNull (property)
Shape.isSame (method)
Shape.isEqual (method)
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
Shape.wires (property)
Shape.boundingBox (property)
Shape.mesh (method) — Exports the current shape as a set of triangle
Shape.meshEdges (method) — Exports the current shape as a set of lines
Shape.blobSTEP (method) — Exports the current shape as a STEP file as a…
Shape.blobSTL (method) — Exports the current shape as a STL file as a…
Shell (class)
Sketch (class) [14 members] — A line drawing to be acted upon
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
Sketcher (class) [41 members] — The FaceSketcher allows you to sketch on a plane
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
Sketches (class) [6 members]
Sketches.sketches (property)
Sketches.constructor (constructor)
Sketches.wires (method)
Sketches.faces (method)
Sketches.extrude (method) — Extrudes the sketch to a certain distance.(along the default direction…
Sketches.revolve (method) — Revolves the drawing on an axis (defined by its direction…
Solid (class)
Surface (class) [1 members]
Surface.surfaceType (property)
SurfacePhysicalProperties (class) [1 members]
SurfacePhysicalProperties.area (property)
Transformation (class) [11 members]
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
Vector (class) [21 members]
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
Vertex (class) [1 members]
Vertex.asTuple (method)
VolumePhysicalProperties (class) [1 members]
VolumePhysicalProperties.volume (property)
Wire (class) [1 members]
Wire.offset2D (method)
WrappingObj (class) [4 members]
WrappingObj.oc (property)
WrappingObj.constructor (constructor)
WrappingObj.wrapped (property)
WrappingObj.delete (method)

## Types — `api-types.md`

AnyShape (type)
ChamferRadius (type) — We can defined a chamfer with only a number -…
Corner (type)
CubeFace (type)
CurveType (type)
FilletRadius (type)
FilterFcn (type)
ManifoldBox (type)
ManifoldInstance (type)
ManifoldMesh (type)
ManifoldVec3 (type)
PlaneName (type)
Point (type)
Point2D (type)
ProjectionPlane (type)
RadiusConfig (type) — A generic way to define radii for fillet or chamfer…
ScaleMode (type)
Shape2D (type)
Shape3D (type)
ShapeConfig (type)
SimplePoint (type)
SingleFace (type)
SplineConfig (type)
SupportedUnit (type)
SurfaceType (type)

## Interfaces — `api-interfaces.md`

BooleanOperationOptions (interface) [1 members]
BooleanOperationOptions.optimisation (property)
BSplineApproximationConfig (interface) [4 members]
BSplineApproximationConfig.tolerance (property)
BSplineApproximationConfig.degMax (property)
BSplineApproximationConfig.degMin (property)
BSplineApproximationConfig.smoothing (property)
CurveLike (interface) [9 members]
CurveLike.delete (method)
CurveLike.Value (method)
CurveLike.IsPeriodic (method)
CurveLike.Period (method)
CurveLike.IsClosed (method)
CurveLike.FirstParameter (method)
CurveLike.LastParameter (method)
CurveLike.GetType (method)
CurveLike.D1 (method)
Deletable (interface) [1 members]
Deletable.delete (property)
DrawingInterface (interface) [11 members]
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
ExtrusionProfile (interface) [2 members]
ExtrusionProfile.profile (property)
ExtrusionProfile.endFactor (property)
FaceTriangulation (interface) [3 members]
FaceTriangulation.vertices (property)
FaceTriangulation.trianglesIndexes (property)
FaceTriangulation.verticesNormals (property)
GenericSketcher (interface) [34 members] — Sketchers allow the user to draw a two dimentional shape…
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
GenericSweepConfig (interface) [7 members]
GenericSweepConfig.frenet (property)
GenericSweepConfig.auxiliarySpine (property)
GenericSweepConfig.law (property)
GenericSweepConfig.transitionMode (property)
GenericSweepConfig.withContact (property)
GenericSweepConfig.support (property)
GenericSweepConfig.forceProfileSpineOthogonality (property)
LoftConfig (interface) [3 members]
LoftConfig.ruled (property)
LoftConfig.startPoint (property)
LoftConfig.endPoint (property)
MeshShapeMesh (interface) [5 members]
MeshShapeMesh.vertices (property)
MeshShapeMesh.triangles (property)
MeshShapeMesh.normals (property)
MeshShapeMesh.vertProperties (property)
MeshShapeMesh.numProp (property)
Shape3DLike (interface) [12 members]
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
ShapeMesh (interface) [4 members]
ShapeMesh.triangles (property)
ShapeMesh.vertices (property)
ShapeMesh.normals (property)
ShapeMesh.faceGroups (property)
SketchInterface (interface) [4 members]
SketchInterface.face (method) — Transforms the lines into a face
SketchInterface.revolve (method) — Revolves the drawing on an axis (defined by its direction…
SketchInterface.extrude (method) — Extrudes the sketch to a certain distance.(along the default direction…
SketchInterface.loftWith (method) — Loft between this sketch and another sketch (or an array…

## Constants — `api-constants.md`

DEG2RAD (constant)
HASH_CODE_MAX (constant)
RAD2DEG (constant)
