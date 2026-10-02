# replicad — Functions

116 top-level symbols. Signatures are verbatim typescript.

// asDir (function)
export declare function asDir(coords: Point): gp_Dir;

// asPnt (function)
export declare function asPnt(coords: Point): gp_Pnt;

// cast (function)
export declare function cast(shape: TopoDS_Shape): AnyShape;

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
export declare function importSTEP(STLBlob: Blob): Promise<AnyShape>;

// Creates a new shapes from a STL file (as a Blob or a File)
// Remarks: This process can be relatively long depending on how much tesselation has been done to your STL. This function tries to clean a bit the triangulation of faces, but can fail in bad ways.
// importSTL (function)
export declare function importSTL(STLBlob: Blob): Promise<AnyShape>;

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

// Import a font in the text system
// Remarks: The font should be in TTF
// loadFont (function)
export declare function loadFont(fontPath: string | ArrayBuffer, fontFamily?: string, force?: boolean): Promise<opentype_2.Font>;

// lookFromPlane (function)
export declare function lookFromPlane(projectionPlane: ProjectionPlane): ProjectionCamera;

// makeDirection (function)
export declare function makeDirection(p: Direction): Point;

// makePlane (function)
export declare function makePlane(plane: Plane): Plane;
export declare function makePlane(plane: PlaneName): Plane;
export declare function makePlane(plane: Plane | PlaneName): Plane;
export declare function makePlane(plane?: PlaneName, origin?: Point | number): Plane;

// makePln (function)
export declare function makePln(origin: Point, dir: Point): gp_Pln;

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

// rotate (function)
export declare function rotate(shape: TopoDS_Shape, angle: number, position?: Point, direction?: Point): TopoDS_Shape;

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
(face: Face, holes: Wire[]) => Face

// assembleWire (function)
(listOfEdges: (Edge | Wire)[]) => Wire

// axis2d (function)
(point: Point2D, direction: Point2D) => gp_Ax2d

// basicFaceExtrusion (function)
(face: Face, extrusionVec: Vector) => Solid

// Combine a set of finder filters (defined with radius) to pass as a filter function
// combineFinderFilters (function)
<Type, T, R = number>(filters: {
    filter: Finder<Type, T>;
    radius: R;
}[]) => [(v: Type) => R | null, () => void]
//   filters: An array of objects containing a filter and its radius

// compoundShapes (function)
(shapeArray: AnyShape[]) => AnyShape

// createNamedPlane (function)
(plane: PlaneName, sourceOrigin?: Point | number) => Plane

// cut2D (function)
(first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null

// cutBlueprints (function)
(first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints

// Creates the `Drawing` of parametric function
// Remarks: The drawing will be a spline approximating the function. Note that the degree should be at maximum 3 if you need to export the drawing as an SVG.
// drawParametricFunction (function)
(func: (t: number) => Point2D, { pointsCount, start, stop, closeShape }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
    closeShape?: boolean | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Drawing

// Creates the `Drawing` by interpolating points as a curve
// Remarks: The drawing will be a spline approximating the points. Note that the degree should be at maximum 3 if you need to export the drawing as an SVG.
// drawPointsInterpolation (function)
(points: Point2D[], approximationConfig?: BSplineApproximationConfig, options?: {
    closeShape?: boolean;
}) => Drawing

// drawRectangle (function)
export declare function drawRoundedRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Drawing;

// fuse2D (function)
(first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null

// fuseBlueprints (function)
(first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints

// GCWithObject (function)
(obj: any) => <Type extends Deletable>(value: Type) => Type

// GCWithScope (function)
() => <Type extends Deletable>(value: Type) => Type

// getFont (function)
(fontFamily?: string) => opentype_2.Font

// getManifold (function)
() => ManifoldToplevel

// getOC (function)
() => OpenCascadeInstance

// intersectBlueprints (function)
(first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints

// iterTopo (function)
(shape: TopoDS_Shape, topo: TopoEntity) => IterableIterator<TopoDS_Shape>

// localGC (function)
(debug?: boolean) => [<T extends Deletable>(v: T) => T, () => void, Set<Deletable> | undefined]

// loft (function)
(wires: Wire[], { ruled, startPoint, endPoint }?: LoftConfig, returnShell?: boolean) => Shape3D

// makeAx1 (function)
(center: Point, dir: Point) => gp_Ax1

// makeAx2 (function)
(center: Point, dir: Point, xDir?: Point) => gp_Ax2

// makeAx3 (function)
(center: Point, dir: Point, xDir?: Point) => gp_Ax3

// makeBaseBox (function)
(xLength: number, yLength: number, zLength: number) => Shape3D

// makeBezierCurve (function)
(points: Point[]) => Edge

// Creates a box with the given corner points
// makeBox (function)
(corner1: Point, corner2: Point) => Solid

// makeBSplineApproximation (function)
(points: Point[], { tolerance, smoothing, degMax, degMin, }?: BSplineApproximationConfig) => Edge

// makeCircle (function)
(radius: number, center?: Point, normal?: Point) => Edge

// makeCompound (function)
(shapeArray: AnyShape[]) => AnyShape

// Creates a cylinder with the given radius and height
// makeCylinder (function)
(radius: number, height: number, location?: Point, direction?: Point) => Solid

// makeEllipse (function)
(majorRadius: number, minorRadius: number, center?: Point, normal?: Point, xDir?: Point) => Edge

// makeEllipseArc (function)
(majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, center?: Point, normal?: Point, xDir?: Point) => Edge

// Creates an ellipsoid with the given lengths of the axes
// makeEllipsoid (function)
(aLength: number, bLength: number, cLength: number) => Solid

// makeFace (function)
(wire: Wire, holes?: Wire[]) => Face

// makeHelix (function)
(pitch: number, height: number, radius: number, center?: Point, dir?: Point, lefthand?: boolean) => Wire

// makeLine (function)
(v1: Point, v2: Point) => Edge

// makeNewFaceWithinFace (function)
(originFace: Face, wire: Wire) => Face

// makeNonPlanarFace (function)
(wire: Wire) => Face

// makeOffset (function)
(face: Face, offset: number, tolerance?: number) => Shape3D

// makePlaneFromFace (function)
(face: Face, originOnSurface?: Point2D) => Plane

// makePolygon (function)
(points: Point[]) => Face

// Creates a sphere with the given radius
// makeSphere (function)
(radius: number) => Solid

// makeTangentArc (function)
(startPoint: Point, startTgt: Point, endPoint: Point) => Edge

// makeThreePointArc (function)
(v1: Point, v2: Point, v3: Point) => Edge

// makeVertex (function)
(point: Point) => Vertex

// Groups an array of blueprints such that blueprints that correspond to holes in other blueprints are set in a `CompoundBlueprint`
// Remarks: The current algorithm does not handle cases where blueprints cross each other
// organiseBlueprints (function)
(blueprints: Blueprint[]) => Blueprints

// Helper function to compute the inner radius of a polyside (even if a sagitta is defined
// polysideInnerRadius (function)
(outerRadius: number, sidesCount: number, sagitta?: number) => number

// polysidesBlueprint (function)
(radius: number, sidesCount: number, sagitta?: number) => Blueprint

// revolution (function)
(face: Face, center?: Point, direction?: Point, angle?: number) => Shape3D

// roundedRectangleBlueprint (function)
(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}) => Blueprint

// setManifold (function)
(manifold: ManifoldToplevel) => void

// setOC (function)
(oc: OpenCascadeInstance) => void

// shapeType (function)
(shape: TopoDS_Shape) => TopAbs_ShapeEnum

// Creates the `Sketch` of a circle in a defined plane
// sketchCircle (function)
(radius: number, planeConfig?: PlaneConfig) => Sketch

// Creates the `Sketch` of an ellispe in a defined plane
// sketchEllipse (function)
(xRadius?: number, yRadius?: number, planeConfig?: PlaneConfig) => Sketch

// Creates the `Sketch` of an offset of a certain face
// sketchFaceOffset (function)
(face: Face, offset: number) => Sketch

// Creates the `Sketch` of a helix
// sketchHelix (function)
(pitch: number, height: number, radius: number, center?: Point, dir?: Point, lefthand?: boolean) => Sketch

// Creates the `Sketch` of parametric function in a specified plane
// Remarks: The sketch will be a spline approximating the function
// sketchParametricFunction (function)
(func: (t: number) => Point2D, planeConfig?: PlaneConfig, { pointsCount, start, stop }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Sketch

// Creates the `Sketch` of an polygon in a defined plane
// Remarks: The sides of the polygon can be arcs of circle with a defined sagitta. The radius defines the out radius of the polygon without sagitta
// sketchPolysides (function)
(radius: number, sidesCount: number, sagitta?: number, planeConfig?: PlaneConfig) => Sketch

// Creates the `Sketch` of a rectangle in a defined plane
// sketchRectangle (function)
(xLength: number, yLength: number, planeConfig?: PlaneConfig) => Sketch

// Creates the `Sketch` of a rounded rectangle in a defined plane
// sketchRoundedRectangle (function)
(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}, planeConfig?: PlaneConfig) => Sketch

// supportExtrude (function)
(wire: Wire, center: Point, normal: Point, support: TopoDS_Shape) => Shape3D
