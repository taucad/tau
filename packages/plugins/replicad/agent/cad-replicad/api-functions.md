# replicad — Functions

116 top-level symbols. Signatures are verbatim typescript.

export declare function asDir(coords: Point): gp_Dir;

export declare function asPnt(coords: Point): gp_Pnt;

export declare function cast(shape: TopoDS_Shape): AnyShape;

export declare function complexExtrude(wire: Wire, center: Point, normal: Point, profileShape: ExtrusionProfile | undefined, shellMode: true): [Shape3D, Wire, Wire];
export declare function complexExtrude(wire: Wire, center: Point, normal: Point, profileShape?: ExtrusionProfile, shellMode?: false): Shape3D;

export declare function createAssembly(shapes?: ShapeConfig[]): AssemblyExporter;

// Deserializes a drawing from a string
export declare function deserializeDrawing(data: string): Drawing;

export declare function deserializeShape(data: string): AnyShape;

export declare function downcast(shape: TopoDS_Shape): GenericTopo;

// Creates a drawing pen to programatically draw in 2D
export declare function draw(initialPoint?: Point2D): DrawingPen;

// Creates the `Drawing` of a circle
export declare function drawCircle(radius: number): Drawing;

// Creates the `Drawing` of an ellipse
export declare function drawEllipse(majorRadius: number, minorRadius: number): Drawing;

// Creates the `Drawing` out of a face
export declare function drawFaceOutline(face: Face): Drawing;

// Creates the `Drawing` of an polygon in a defined plane
export declare function drawPolysides(radius: number, sidesCount: number, sagitta?: number): Drawing;

// Creates the `Drawing` of a projection of a shape on a plane
export declare function drawProjection(shape: AnyShape, projectionCamera?: ProjectionPlane | ProjectionCamera): {
visible: Drawing;
hidden: Drawing;
};

// Creates the `Drawing` of a rectangle with (optional) rounded corners
export declare function drawRoundedRectangle(width: number, height: number, r?: number | {
rx?: number;
ry?: number;
}): Drawing;

// Creates the `Drawing` of a circle as one single curve
export declare function drawSingleCircle(radius: number): Drawing;

// Creates the `Drawing` of an ellipse as one single curve
export declare function drawSingleEllipse(majorRadius: number, minorRadius: number): Drawing;

// Creates the `Drawing` of a text, in a defined font size and a font familiy (which will be the default)
export declare function drawText(text: string, { startX, startY, fontSize, fontFamily }?: {
startX?: number | undefined;
startY?: number | undefined;
fontSize?: number | undefined;
fontFamily?: string | undefined;
}): Drawing;

export declare function exportSTEP(shapes?: ShapeConfig[], { unit, modelUnit }?: {
unit?: SupportedUnit;
modelUnit?: SupportedUnit;
}): Blob;

export declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode: true): [Shape3D, Wire, Wire];
export declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode?: false): Shape3D;

export declare function getSingleFace(f: SingleFace, shape: AnyShape): Face;

// Creates a new shapes from a STEP file (as a Blob or a File)
export declare function importSTEP(STLBlob: Blob): Promise<AnyShape>;

// Creates a new shapes from a STL file (as a Blob or a File)
export declare function importSTL(STLBlob: Blob): Promise<AnyShape>;

// Imports an STL file (as a Blob or a File) and creates a MeshShape
export declare function importSTLAsMesh(stlBlob: Blob): Promise<MeshShape>;

export declare function intersect2D(first: Shape2D, second: Shape2D): Blueprint | Blueprints | CompoundBlueprint | null;

export declare function isPoint(p: unknown): p is Point;

export declare function isProjectionPlane(plane: unknown): plane is ProjectionPlane;

export declare function isShape3D(shape: AnyShape): shape is Shape3D;

export declare function isWire(shape: AnyShape): shape is Wire;

// Import a font in the text system
export declare function loadFont(fontPath: string | ArrayBuffer, fontFamily?: string, force?: boolean): Promise<opentype_2.Font>;

export declare function lookFromPlane(projectionPlane: ProjectionPlane): ProjectionCamera;

export declare function makeDirection(p: Direction): Point;

export declare function makePlane(plane: Plane): Plane;
export declare function makePlane(plane: PlaneName): Plane;
export declare function makePlane(plane: Plane | PlaneName): Plane;
export declare function makePlane(plane?: PlaneName, origin?: Point | number): Plane;

export declare function makePln(origin: Point, dir: Point): gp_Pln;

export declare function makeProjectedEdges(shape: AnyShape, camera: ProjectionCamera, withHiddenLines?: boolean): {
visible: Edge[];
hidden: Edge[];
};

// Welds faces and shells into a single shell and then makes a solid
export declare function makeSolid(facesOrShells: Array<Face | Shell>): Solid;
// facesOrShells: An array of faces and shells to be welded

// Measure the area of a shape
export declare function measureArea(shape: Face | Shape3D): number;

// Measure the distance between two shapes
export declare function measureDistanceBetween(shape1: AnyShape, shape2: AnyShape): number;

// Measure the length of a shape
export declare function measureLength(shape: AnyShape): number;

export declare function measureShapeLinearProperties(shape: AnyShape): LinearPhysicalProperties;

export declare function measureShapeSurfaceProperties(shape: Face | Shape3D): SurfacePhysicalProperties;

export declare function measureShapeVolumeProperties(shape: Shape3D): VolumePhysicalProperties;

// Measure the volume of a shape
export declare function measureVolume(shape: Shape3D): number;

export declare function mirror(shape: TopoDS_Shape, inputPlane?: Plane | PlaneName | Point, origin?: Point): TopoDS_Shape;

export declare function rotate(shape: TopoDS_Shape, angle: number, position?: Point, direction?: Point): TopoDS_Shape;

export declare function scale(shape: TopoDS_Shape, center: Point, scale: number): TopoDS_Shape;

// Creates the `Sketches` of a text, in a defined font size and a font familiy (which will be the default)
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
export declare function textBlueprints(text: string, { startX, startY, fontSize, fontFamily }?: {
startX?: number | undefined;
startY?: number | undefined;
fontSize?: number | undefined;
fontFamily?: string | undefined;
}): Blueprints;

export declare function translate(shape: TopoDS_Shape, vector: Point): TopoDS_Shape;

export declare function twistExtrude(wire: Wire, angleDegrees: number, center: Point, normal: Point, profileShape?: ExtrusionProfile, shellMode?: false): Shape3D;
export declare function twistExtrude(wire: Wire, angleDegrees: number, center: Point, normal: Point, profileShape: ExtrusionProfile | undefined, shellMode: true): [Shape3D, Wire, Wire];

// Welds faces and shells into a single shell
export declare function weldShellsAndFaces(facesOrShells: Array<Face | Shell>, ignoreType?: boolean): Shell;
// facesOrShells: An array of faces and shells to be welded
// ignoreType: If true, the function will not check if the result is a shell

(face: Face, holes: Wire[]) => Face

(listOfEdges: (Edge | Wire)[]) => Wire

(point: Point2D, direction: Point2D) => gp_Ax2d

(face: Face, extrusionVec: Vector) => Solid

// Combine a set of finder filters (defined with radius) to pass as a filter function
<Type, T, R = number>(filters: {
filter: Finder<Type, T>;
radius: R;
}[]) => [(v: Type) => R | null, () => void]
// filters: An array of objects containing a filter and its radius

(shapeArray: AnyShape[]) => AnyShape

(plane: PlaneName, sourceOrigin?: Point | number) => Plane

(first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null

(first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints

// Creates the `Drawing` of parametric function
(func: (t: number) => Point2D, { pointsCount, start, stop, closeShape }?: {
pointsCount?: number | undefined;
start?: number | undefined;
stop?: number | undefined;
closeShape?: boolean | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Drawing

// Creates the `Drawing` by interpolating points as a curve
(points: Point2D[], approximationConfig?: BSplineApproximationConfig, options?: {
closeShape?: boolean;
}) => Drawing

export declare function drawRoundedRectangle(width: number, height: number, r?: number | {
rx?: number;
ry?: number;
}): Drawing;

(first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null

(first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints

(obj: any) => <Type extends Deletable>(value: Type) => Type

() => <Type extends Deletable>(value: Type) => Type

(fontFamily?: string) => opentype_2.Font

() => ManifoldToplevel

() => OpenCascadeInstance

(first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints

(shape: TopoDS_Shape, topo: TopoEntity) => IterableIterator<TopoDS_Shape>

(debug?: boolean) => [<T extends Deletable>(v: T) => T, () => void, Set<Deletable> | undefined]

(wires: Wire[], { ruled, startPoint, endPoint }?: LoftConfig, returnShell?: boolean) => Shape3D

(center: Point, dir: Point) => gp_Ax1

(center: Point, dir: Point, xDir?: Point) => gp_Ax2

(center: Point, dir: Point, xDir?: Point) => gp_Ax3

(xLength: number, yLength: number, zLength: number) => Shape3D

(points: Point[]) => Edge

// Creates a box with the given corner points
(corner1: Point, corner2: Point) => Solid

(points: Point[], { tolerance, smoothing, degMax, degMin, }?: BSplineApproximationConfig) => Edge

(radius: number, center?: Point, normal?: Point) => Edge

(shapeArray: AnyShape[]) => AnyShape

// Creates a cylinder with the given radius and height
(radius: number, height: number, location?: Point, direction?: Point) => Solid

(majorRadius: number, minorRadius: number, center?: Point, normal?: Point, xDir?: Point) => Edge

(majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, center?: Point, normal?: Point, xDir?: Point) => Edge

// Creates an ellipsoid with the given lengths of the axes
(aLength: number, bLength: number, cLength: number) => Solid

(wire: Wire, holes?: Wire[]) => Face

(pitch: number, height: number, radius: number, center?: Point, dir?: Point, lefthand?: boolean) => Wire

(v1: Point, v2: Point) => Edge

(originFace: Face, wire: Wire) => Face

(wire: Wire) => Face

(face: Face, offset: number, tolerance?: number) => Shape3D

(face: Face, originOnSurface?: Point2D) => Plane

(points: Point[]) => Face

// Creates a sphere with the given radius
(radius: number) => Solid

(startPoint: Point, startTgt: Point, endPoint: Point) => Edge

(v1: Point, v2: Point, v3: Point) => Edge

(point: Point) => Vertex

// Groups an array of blueprints such that blueprints that correspond to holes in other blueprints are set in a `CompoundBlueprint`
(blueprints: Blueprint[]) => Blueprints

// Helper function to compute the inner radius of a polyside (even if a sagitta is defined
(outerRadius: number, sidesCount: number, sagitta?: number) => number

(radius: number, sidesCount: number, sagitta?: number) => Blueprint

(face: Face, center?: Point, direction?: Point, angle?: number) => Shape3D

(width: number, height: number, r?: number | {
rx?: number;
ry?: number;
}) => Blueprint

(manifold: ManifoldToplevel) => void

(oc: OpenCascadeInstance) => void

(shape: TopoDS_Shape) => TopAbs_ShapeEnum

// Creates the `Sketch` of a circle in a defined plane
(radius: number, planeConfig?: PlaneConfig) => Sketch

// Creates the `Sketch` of an ellispe in a defined plane
(xRadius?: number, yRadius?: number, planeConfig?: PlaneConfig) => Sketch

// Creates the `Sketch` of an offset of a certain face
(face: Face, offset: number) => Sketch

// Creates the `Sketch` of a helix
(pitch: number, height: number, radius: number, center?: Point, dir?: Point, lefthand?: boolean) => Sketch

// Creates the `Sketch` of parametric function in a specified plane
(func: (t: number) => Point2D, planeConfig?: PlaneConfig, { pointsCount, start, stop }?: {
pointsCount?: number | undefined;
start?: number | undefined;
stop?: number | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Sketch

// Creates the `Sketch` of an polygon in a defined plane
(radius: number, sidesCount: number, sagitta?: number, planeConfig?: PlaneConfig) => Sketch

// Creates the `Sketch` of a rectangle in a defined plane
(xLength: number, yLength: number, planeConfig?: PlaneConfig) => Sketch

// Creates the `Sketch` of a rounded rectangle in a defined plane
(width: number, height: number, r?: number | {
rx?: number;
ry?: number;
}, planeConfig?: PlaneConfig) => Sketch

(wire: Wire, center: Point, normal: Point, support: TopoDS_Shape) => Shape3D
