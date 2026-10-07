# replicad — Functions

125 top-level symbols. Signatures are verbatim typescript.

// asDir (function)
export declare function asDir(direction: Direction): gp_Dir;

// asPnt (function)
export declare function asPnt(coords: Point): gp_Pnt;

// complexExtrude (function)
export declare function complexExtrude(wire: Wire, center: Point, normal: Point, profileShape: ExtrusionProfile | undefined, shellMode: true): [Shape3D, Wire, Wire];
export declare function complexExtrude(wire: Wire, center: Point, normal: Point, profileShape?: ExtrusionProfile, shellMode?: false): Shape3D;

// createAssembly (function)
export declare function createAssembly(shapes?: ShapeConfig[]): AssemblyExporter;

// Deserializes a drawing from a string
// deserializeDrawing (function)
export declare function deserializeDrawing(data: string): Drawing;

// deserializeShape (function)
export declare function deserializeShape(data: string): AnyShape;

// downcast (function)
export declare function downcast(shape: TopoDS_Shape): GenericTopo;

// Creates a drawing pen to programatically draw in 2D
// draw (function)
export declare function draw(initialPoint?: Point2D): DrawingPen;

// Creates the `Drawing` of a circle
// Remarks: The circle is centered on [0, 0]
// drawCircle (function)
export declare function drawCircle(radius: number): Drawing;

// Creates the `Drawing` of an ellipse
// Remarks: The ellipse is centered on [0, 0], with axes aligned with the coordinates.
// drawEllipse (function)
export declare function drawEllipse(majorRadius: number, minorRadius: number): Drawing;

// Creates the `Drawing` out of a face
// drawFaceOutline (function)
export declare function drawFaceOutline(face: Face): Drawing;

// Creates the `Drawing` of an polygon in a defined plane
// Remarks: The sides of the polygon can be arcs of circle with a defined sagitta. The radius defines the out radius of the polygon without sagitta
// drawPolysides (function)
export declare function drawPolysides(radius: number, sidesCount: number, sagitta?: number): Drawing;

// Creates the `Drawing` of a projection of a shape on a plane
// Remarks: The projection is done by projecting the edges of the shape on the plane.
// drawProjection (function)
export declare function drawProjection(shape: AnyShape, projectionCamera?: ProjectionPlane | ProjectionCamera): {
    visible: Drawing;
    hidden: Drawing;
};

// Creates the `Drawing` of a rectangle with (optional) rounded corners
// Remarks: The rectangle is centered on [0, 0]
// drawRoundedRectangle (function)
export declare function drawRoundedRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Drawing;

// Creates the `Drawing` of a circle as one single curve
// Remarks: The circle is centered on [0, 0]
// drawSingleCircle (function)
export declare function drawSingleCircle(radius: number): Drawing;

// Creates the `Drawing` of an ellipse as one single curve
// Remarks: The ellipse is centered on [0, 0], with axes aligned with the coordinates.
// drawSingleEllipse (function)
export declare function drawSingleEllipse(majorRadius: number, minorRadius: number): Drawing;

// Creates the `Drawing` of a text, in a defined font size and a font familiy (which will be the default)
// drawText (function)
export declare function drawText(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Drawing;

// exportSTEP (function)
export declare function exportSTEP(shapes?: ShapeConfig[], { unit, modelUnit }?: {
    unit?: SupportedUnit;
    modelUnit?: SupportedUnit;
}): Blob;

// genericSweep (function)
export declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode: true): [Shape3D, Wire, Wire];
export declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode?: false): Shape3D;

// getSingleFace (function)
export declare function getSingleFace(f: SingleFace, shape: AnyShape): Face;

// Creates a new shapes from a STEP file (as a Blob or a File)
// importSTEP (function)
export declare function importSTEP(STLBlob: Blob): Promise< AnyShape>;

// Creates a new shapes from a STL file (as a Blob or a File)
// Remarks: This process can be relatively long depending on how much tesselation has been done to your STL. This function tries to clean a bit the triangulation of faces, but can fail in bad ways.
// importSTL (function)
export declare function importSTL(STLBlob: Blob): Promise< AnyShape>;

// Imports an STL file (as a Blob or a File) and creates a MeshShape
// Remarks: Unlike `importSTL` which converts through OpenCascade's BRep representation, this function directly creates a MeshShape from the triangle data, which is faster and preserves the original mesh. Supports both binary and ASCII STL formats.
// importSTLAsMesh (function)
export declare function importSTLAsMesh(stlBlob: Blob): Promise<MeshShape>;

// intersect2D (function)
export declare function intersect2D(first: Shape2D, second: Shape2D): Blueprint | Blueprints | CompoundBlueprint | null;

// isPoint (function)
export declare function isPoint(p: unknown): p is Point;

// isProjectionPlane (function)
export declare function isProjectionPlane(plane: unknown): plane is ProjectionPlane;

// isShape3D (function)
export declare function isShape3D(shape: AnyShape): shape is Shape3D;

// isWire (function)
export declare function isWire(shape: AnyShape): shape is Wire;

// iterTopo (function)
export declare function iterTopo<Entity extends TopoEntity>(shape: TopoDS_Shape, topo: Entity): IterableIterator<TopologyMap[Entity]>;

// Import a font in the text system
// Remarks: The font should be in TTF
// loadFont (function)
export declare function loadFont(fontPath: string | ArrayBuffer, fontFamily?: string, force?: boolean): Promise<default_2.Font>;

// lookFromPlane (function)
export declare function lookFromPlane(projectionPlane: ProjectionPlane): ProjectionCamera;

// makeDirVector (function)
export declare function makeDirVector(direction: Direction): Vector;

// makePlane (function)
export declare function makePlane(plane: Plane): Plane;
export declare function makePlane(plane: PlaneName): Plane;
export declare function makePlane(plane: Plane | PlaneName): Plane;
export declare function makePlane(plane?: PlaneName, origin?: Point | number): Plane;

// makePln (function)
export declare function makePln(origin: Point, dir: Direction): gp_Pln;

// makeProjectedEdges (function)
export declare function makeProjectedEdges(shape: AnyShape, camera: ProjectionCamera, withHiddenLines?: boolean): {
    visible: Edge[];
    hidden: Edge[];
};

// Welds faces and shells into a single shell and then makes a solid
// makeSolid (function)
export declare function makeSolid(facesOrShells: Array<Face | Shell>): Solid;
//   facesOrShells: An array of faces and shells to be welded

// Measure the area of a shape
// measureArea (function)
export declare function measureArea(shape: Face | Shape3D): number;

// Measure the distance between two shapes
// measureDistanceBetween (function)
export declare function measureDistanceBetween(shape1: AnyShape, shape2: AnyShape): number;

// Measure the length of a shape
// measureLength (function)
export declare function measureLength(shape: AnyShape): number;

// measureShapeLinearProperties (function)
export declare function measureShapeLinearProperties(shape: AnyShape): LinearPhysicalProperties;

// measureShapeSurfaceProperties (function)
export declare function measureShapeSurfaceProperties(shape: Face | Shape3D): SurfacePhysicalProperties;

// measureShapeVolumeProperties (function)
export declare function measureShapeVolumeProperties(shape: Shape3D): VolumePhysicalProperties;

// Measure the volume of a shape
// measureVolume (function)
export declare function measureVolume(shape: Shape3D): number;

// mirror (function)
export declare function mirror(shape: TopoDS_Shape, inputPlane?: Plane | PlaneName | Point, origin?: Point): TopoDS_Shape;

// resolveDirection (function)
export declare function resolveDirection(direction: Direction): Point;

// rotate (function)
export declare function rotate(shape: TopoDS_Shape, angle: number, position?: Point, direction?: Direction): TopoDS_Shape;

// scale (function)
export declare function scale(shape: TopoDS_Shape, center: Point, scale: number): TopoDS_Shape;

// Creates the `Sketches` of a text, in a defined font size and a font familiy (which will be the default)
// sketchText (function)
export declare function sketchText(text: string, textConfig?: {
    startX?: number;
    startY?: number;
    fontSize?: number;
    fontFamily?: "string";
}, planeConfig?: {
    plane?: PlaneName | Plane;
    origin?: Point | number;
}): Sketches;

// Creates the `Blueprints` of a text, in a defined font size and a font familiy (which will be the default)
// textBlueprints (function)
export declare function textBlueprints(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Blueprints;

// translate (function)
export declare function translate(shape: TopoDS_Shape, vector: Point): TopoDS_Shape;

// twistExtrude (function)
export declare function twistExtrude(wire: Wire, angleDegrees: number, center: Point, normal: Point, profileShape?: ExtrusionProfile, shellMode?: false): Shape3D;
export declare function twistExtrude(wire: Wire, angleDegrees: number, center: Point, normal: Point, profileShape: ExtrusionProfile | undefined, shellMode: true): [Shape3D, Wire, Wire];

// Welds faces and shells into a single shell
// weldShellsAndFaces (function)
export declare function weldShellsAndFaces(facesOrShells: Array<Face | Shell>, ignoreType?: boolean): Shell;
//   facesOrShells: An array of faces and shells to be welded
//   ignoreType: If true, the function will not check if the result is a shell

// addHolesInFace (function)
export declare function addHolesInFace(face: Face, holes: Wire[]): Face;

// assembleWire (function)
export declare function assembleWire(listOfEdges: (Edge | Wire)[]): Wire;

// Creates a predicate for a finder's `when` method that selects elements touching an axis-aligned bounding-box extreme of a shape
// Remarks: An element is selected when its bounding-box minimum or maximum is within `tolerance` of the corresponding bound of `shape`. This means that a side face touching the top of a shape is considered top-most too. Combine this predicate with an orientation filter when only horizontal or vertical elements should be selected. The shape bounds are calculated once when the predicate is created. Element bounds are calculated whenever the predicate is evaluated.
// atShapeExtremum (function)
export declare function atShapeExtremum(shape: AnyShape, axis: CartesianAxis, extremum: "min" | "max", tolerance?: number): ShapeExtremumFilter;
//   shape: Shape whose bounds define the extremum
//   axis: Cartesian axis along which to compare bounds
//   extremum: Whether to compare the minimum or maximum bound
//   tolerance: Maximum difference between bounds
// Example:
//   const topEdges = new EdgeFinder()
//     .when(atShapeExtremum(shape, "Z", "max"))
//     .parallelTo("XY")
//     .find(shape);

// axis2d (function)
export declare function axis2d(point: Point2D, direction: Point2D): gp_Ax2d;

// Creates a predicate selecting elements touching the shape's minimum Y bound
// Remarks: "Back" is defined as the negative Y direction.
// backMost (function)
export declare function backMost(shape: AnyShape, tolerance?: number): ShapeExtremumFilter;
// Example:
//   finder.when(backMost(shape));

// basicFaceExtrusion (function)
export declare function basicFaceExtrusion(face: Face, extrusionVec: Vector): Solid;

// Creates a predicate selecting elements touching the shape's minimum Z bound
// bottomMost (function)
export declare function bottomMost(shape: AnyShape, tolerance?: number): ShapeExtremumFilter;
// Example:
//   finder.when(bottomMost(shape));

// cast (function)
export declare function cast(shape: TopoDS_Shape): AnyShape;

// Combine a set of finder filters (defined with radius) to pass as a filter function
// combineFinderFilters (function)
export declare function combineFinderFilters<Type, T, R = number>(filters: {
    filter: Finder<Type, T>;
    radius: R;
}[]): [(v: Type) => R | null, () => void];
//   filters: An array of objects containing a filter and its radius

// compoundShapes (function)
export declare function compoundShapes(shapeArray: AnyShape[]): AnyShape;

// createNamedPlane (function)
export declare function createNamedPlane(plane: PlaneName, sourceOrigin?: Point | number): Plane;

// cut2D (function)
export declare function cut2D(first: Shape2D, second: Shape2D): Blueprint | Blueprints | CompoundBlueprint | null;

// cutBlueprints (function)
export declare function cutBlueprints(first: Blueprint, second: Blueprint): null | Blueprint | Blueprints;

// Creates the `Drawing` of parametric function
// Remarks: The drawing will be a spline approximating the function. Note that the degree should be at maximum 3 if you need to export the drawing as an SVG.
// drawParametricFunction (function)
export declare function drawParametricFunction(func: (t: number) => Point2D, { pointsCount, start, stop, closeShape }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
    closeShape?: boolean | undefined;
}, approximationConfig?: BSplineApproximationConfig): Drawing;

// Creates the `Drawing` by interpolating points as a curve
// Remarks: The drawing will be a spline approximating the points. Note that the degree should be at maximum 3 if you need to export the drawing as an SVG.
// drawPointsInterpolation (function)
export declare function drawPointsInterpolation(points: Point2D[], approximationConfig?: BSplineApproximationConfig, options?: {
    closeShape?: boolean;
}): Drawing;

// drawRectangle (function)
export declare function drawRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Drawing;

// Creates a predicate selecting elements touching the shape's maximum Y bound
// Remarks: "Front" is defined as the positive Y direction.
// frontMost (function)
export declare function frontMost(shape: AnyShape, tolerance?: number): ShapeExtremumFilter;
// Example:
//   finder.when(frontMost(shape));

// fuse2D (function)
export declare function fuse2D(first: Shape2D, second: Shape2D): Blueprint | Blueprints | CompoundBlueprint | null;

// fuseBlueprints (function)
export declare function fuseBlueprints(first: Blueprint, second: Blueprint): null | Blueprint | Blueprints;

// GCWithObject (function)
export declare function GCWithObject(obj: any): <Type extends Deletable>(value: Type) => Type;

// GCWithScope (function)
export declare function GCWithScope(): <Type extends Deletable>(value: Type) => Type;

// getFont (function)
export declare function getFont(fontFamily?: string): default_2.Font;

// getManifold (function)
export declare function getManifold(): ManifoldToplevel;

// getOC (function)
export declare function getOC(): OpenCascadeInstance;

// intersectBlueprints (function)
export declare function intersectBlueprints(first: Blueprint, second: Blueprint): null | Blueprint | Blueprints;

// Creates a predicate selecting elements touching the shape's minimum X bound
// leftMost (function)
export declare function leftMost(shape: AnyShape, tolerance?: number): ShapeExtremumFilter;
// Example:
//   finder.when(leftMost(shape));

// localGC (function)
export declare function localGC(debug?: boolean): [<T extends Deletable>(v: T) => T, () => void, Set<Deletable> | undefined];

// loft (function)
export declare function loft(wires: Wire[], { ruled, startPoint, endPoint }?: LoftConfig, returnShell?: boolean): Shape3D;

// makeAx1 (function)
export declare function makeAx1(center: Point, dir: Direction): gp_Ax1;

// makeAx2 (function)
export declare function makeAx2(center: Point, dir: Direction, xDir?: Direction): gp_Ax2;

// makeAx3 (function)
export declare function makeAx3(center: Point, dir: Direction, xDir?: Direction): gp_Ax3;

// Builds a rectangular box of the given lengths
// Remarks: The box is centred on the origin in X and Y (spanning `[-x/2, +x/2]` and `[-y/2, +y/2]`) and corner-based in Z (spanning `[0, +z]`). Translate by `[0, 0, -z/2]` to centre the box fully, or use {@link makeBox} when you want explicit two-corner control.
// makeBaseBox (function)
export declare function makeBaseBox(xLength: number, yLength: number, zLength: number): Shape3D;
// Example:
//   const slab = makeBaseBox(30, 50, 10);
//   // slab spans x: [-15, 15], y: [-25, 25], z: [0, 10]

// makeBezierCurve (function)
export declare function makeBezierCurve(points: Point[]): Edge;

// Creates a box with the given corner points
// makeBox (function)
export declare function makeBox(corner1: Point, corner2: Point): Solid;

// makeBSplineApproximation (function)
export declare function makeBSplineApproximation(points: Point[], { tolerance, smoothing, degMax, degMin, }?: BSplineApproximationConfig): Edge;

// makeCircle (function)
export declare function makeCircle(radius: number, center?: Point, normal?: Direction): Edge;

// makeCompound (function)
export declare function makeCompound(shapeArray: AnyShape[]): AnyShape;

// Creates a cylinder with the given radius and height
// makeCylinder (function)
export declare function makeCylinder(radius: number, height: number, location?: Point, direction?: Direction): Solid;

// makeDirection (function)
export declare function makeDirection(direction: Direction): Point;

// makeEllipse (function)
export declare function makeEllipse(majorRadius: number, minorRadius: number, center?: Point, normal?: Direction, xDir?: Direction): Edge;

// makeEllipseArc (function)
export declare function makeEllipseArc(majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, center?: Point, normal?: Direction, xDir?: Direction): Edge;

// Creates an ellipsoid with the given lengths of the axes, centred on the origin
// makeEllipsoid (function)
export declare function makeEllipsoid(aLength: number, bLength: number, cLength: number): Solid;

// makeFace (function)
export declare function makeFace(wire: Wire, holes?: Wire[]): Face;

// makeHelix (function)
export declare function makeHelix(pitch: number, height: number, radius: number, center?: Point, dir?: Direction, lefthand?: boolean): Wire;

// makeLine (function)
export declare function makeLine(v1: Point, v2: Point): Edge;

// makeNewFaceWithinFace (function)
export declare function makeNewFaceWithinFace(originFace: Face, wire: Wire): Face;

// makeNonPlanarFace (function)
export declare function makeNonPlanarFace(wire: Wire): Face;

// makeOffset (function)
export declare function makeOffset(face: Face, offset: number, tolerance?: number): Shape3D;

// makePlaneFromFace (function)
export declare function makePlaneFromFace(face: PlaneFace, originOnSurface?: Point2D): Plane;

// makePolygon (function)
export declare function makePolygon(points: Point[]): Face;

// Creates a sphere with the given radius, centred on the origin
// makeSphere (function)
export declare function makeSphere(radius: number): Solid;

// makeTangentArc (function)
export declare function makeTangentArc(startPoint: Point, startTgt: Point, endPoint: Point): Edge;

// makeThreePointArc (function)
export declare function makeThreePointArc(v1: Point, v2: Point, v3: Point): Edge;

// makeVertex (function)
export declare function makeVertex(point: Point): Vertex;

// Groups an array of blueprints such that blueprints that correspond to holes in other blueprints are set in a `CompoundBlueprint`
// Remarks: The current algorithm does not handle cases where blueprints cross each other
// organiseBlueprints (function)
export declare function organiseBlueprints(blueprints: Blueprint[]): Blueprints;

// Helper function to compute the inner radius of a polyside (even if a sagitta is defined
// polysideInnerRadius (function)
export declare function polysideInnerRadius(outerRadius: number, sidesCount: number, sagitta?: number): number;

// polysidesBlueprint (function)
export declare function polysidesBlueprint(radius: number, sidesCount: number, sagitta?: number): Blueprint;

// revolution (function)
export declare function revolution(face: Face, center?: Point, direction?: Direction, angle?: number): Shape3D;

// Creates a predicate selecting elements touching the shape's maximum X bound
// rightMost (function)
export declare function rightMost(shape: AnyShape, tolerance?: number): ShapeExtremumFilter;
// Example:
//   finder.when(rightMost(shape));

// roundedRectangleBlueprint (function)
export declare function roundedRectangleBlueprint(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Blueprint;

// setManifold (function)
export declare function setManifold(manifold: ManifoldToplevel): void;

// setOC (function)
export declare function setOC(oc: OpenCascadeInstance): void;

// shapeType (function)
export declare function shapeType(shape: TopoDS_Shape): TopAbs_ShapeEnum;

// Creates the `Sketch` of a circle in a defined plane
// sketchCircle (function)
export declare function sketchCircle(radius: number, planeConfig?: PlaneConfig): Sketch;

// Creates the `Sketch` of an ellispe in a defined plane
// sketchEllipse (function)
export declare function sketchEllipse(xRadius?: number, yRadius?: number, planeConfig?: PlaneConfig): Sketch;

// Creates the `Sketch` of an offset of a certain face
// sketchFaceOffset (function)
export declare function sketchFaceOffset(face: Face, offset: number): Sketch;

// Creates the `Sketch` of a helix
// sketchHelix (function)
export declare function sketchHelix(pitch: number, height: number, radius: number, center?: Point, dir?: Direction, lefthand?: boolean): Sketch;

// Creates the `Sketch` of parametric function in a specified plane
// Remarks: The sketch will be a spline approximating the function
// sketchParametricFunction (function)
export declare function sketchParametricFunction(func: (t: number) => Point2D, planeConfig?: PlaneConfig, { pointsCount, start, stop }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
}, approximationConfig?: BSplineApproximationConfig): Sketch;

// Creates the `Sketch` of an polygon in a defined plane
// Remarks: The sides of the polygon can be arcs of circle with a defined sagitta. The radius defines the out radius of the polygon without sagitta
// sketchPolysides (function)
export declare function sketchPolysides(radius: number, sidesCount: number, sagitta?: number, planeConfig?: PlaneConfig): Sketch;

// Creates the `Sketch` of a rectangle in a defined plane
// sketchRectangle (function)
export declare function sketchRectangle(xLength: number, yLength: number, planeConfig?: PlaneConfig): Sketch;

// Creates the `Sketch` of a rounded rectangle in a defined plane
// sketchRoundedRectangle (function)
export declare function sketchRoundedRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}, planeConfig?: PlaneConfig): Sketch;

// supportExtrude (function)
export declare function supportExtrude(wire: Wire, center: Point, normal: Point, support: TopoDS_Shape): Shape3D;

// Creates a predicate selecting elements touching the shape's maximum Z bound
// topMost (function)
export declare function topMost(shape: AnyShape, tolerance?: number): ShapeExtremumFilter;
// Example:
//   shape.fillet(2, (finder, shape) =>
//     finder.when(topMost(shape)).parallelTo("XY")
//   );
