# replicad — Classs

29 top-level symbols. Signatures are verbatim typescript.

\_1DShape: export declare abstract class \_1DShape<Type extends TopoDS_Shape> extends Shape<Type>

repr

curve

startPoint

endPoint

tangentAt(position?: number): Vector;

pointAt(position?: number): Vector;

isClosed

isPeriodic

period

geomType

length

orientation

flipOrientation(): Type;

\_3DShape: export declare class \_3DShape<Type extends TopoDS_Shape> extends Shape<Type> implements Shape3DLike<Shape3D, ShapeMesh, AnyShape,

// Builds a new shape out of the two, fused, shapes
fuse(other: Shape3D, options?: BooleanOperationOptions): Shape3D;

// Builds a new shape by fusing this shape with all provided shapes in one OCCT boolean operation
fuseAll(others: readonly Shape3D[], options?: BooleanOperationOptions): Shape3D;

// Builds a new shape by removing the tool tape from this shape
cut(tool: Shape3D, options?: BooleanOperationOptions): Shape3D;

// Builds a new shape by removing all provided tool shapes in one OCCT boolean operation
cutAll(tools: readonly Shape3D[], options?: BooleanOperationOptions): Shape3D;

// Builds a new shape by intersecting this shape and another
intersect(tool: AnyShape, options?: BooleanOperationOptions): Shape3D;

// Builds a new shape by intersecting this shape with all provided shapes in one OCCT boolean operation
intersectAll(tools: readonly AnyShape[], options?: BooleanOperationOptions): Shape3D;

meshShape(options?: {
tolerance?: number;
angularTolerance?: number;
}): MeshShape;

// Hollows out the current shape, removing the faces found by the `filter` and keeping a border of `thickness`
shell(config: {
filter: FaceFinder;
thickness: number;
}, tolerance?: number): Shape3D;
shell(thickness: number, finderFcn: (f: FaceFinder) => FaceFinder, tolerance?: number): Shape3D;
shell(config: {
filter: FaceFinder;
thickness: number;
}, tolerance?: number): Shape3D;
shell(thickness: number, finderFcn: (f: FaceFinder) => FaceFinder, tolerance?: number): Shape3D;

// Creates a new shapes with some edges filletted, as specified in the radius config
fillet(radiusConfig: RadiusConfig<FilletRadius>, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;

// Creates a new shapes with some edges chamfered, as specified in the radius config
chamfer(radiusConfig: RadiusConfig<ChamferRadius>, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;

// Applies a draft angle to selected faces of the shape
draft(angle: number, faceFinder: (e: FaceFinder) => FaceFinder, neutralPlane?: Plane | PlaneName): AnyShape;

AssemblyExporter: export declare class AssemblyExporter extends WrappingObj<TDocStd_Document>

BaseSketcher2d: export declare class BaseSketcher2d

pointer: Point2D

firstPoint: Point2D

pendingCurves: Curve2D[]

constructor

// Returns the current pen position as [x, y] coordinates
penPosition

// Returns the current pen angle in degrees
penAngle

movePointerTo(point: Point2D): this;

protected saveCurve(curve: Curve2D): void;

lineTo(point: Point2D): this;

line(xDist: number, yDist: number): this;

vLine(distance: number): this;

hLine(distance: number): this;

vLineTo(yPos: number): this;

hLineTo(xPos: number): this;

polarLineTo([r, theta]: Point2D): this;

polarLine(distance: number, angle: number): this;

tangentLine(distance: number): this;

threePointsArcTo(end: Point2D, midPoint: Point2D): this;

threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;

sagittaArcTo(end: Point2D, sagitta: number): this;

sagittaArc(xDist: number, yDist: number, sagitta: number): this;

vSagittaArc(distance: number, sagitta: number): this;

hSagittaArc(distance: number, sagitta: number): this;

bulgeArcTo(end: Point2D, bulge: number): this;

bulgeArc(xDist: number, yDist: number, bulge: number): this;

vBulgeArc(distance: number, bulge: number): this;

hBulgeArc(distance: number, bulge: number): this;

tangentArcTo(end: Point2D): this;

tangentArc(xDist: number, yDist: number): this;

ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

halfEllipseTo(end: Point2D, minorRadius: number, sweep?: boolean): this;

halfEllipse(xDist: number, yDist: number, minorRadius: number, sweep?: boolean): this;

bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;

quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;

cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;

smoothSplineTo(end: Point2D, config?: SplineConfig): this;

smoothSpline(xDist: number, yDist: number, splineConfig?: SplineConfig): this;

// Changes the corner between the previous and next segments
customCorner(radius: number | ((first: Curve2D, second: Curve2D) => Curve2D[]), mode?: "fillet" | "chamfer" | "dogbone"): this;

// A Blueprint is an abstract Sketch, a 2D set of curves that can then be sketched on different surfaces (faces or planes)
Blueprint: export declare class Blueprint implements DrawingInterface

curves: Curve2D[]

constructor

delete(): void;

clone(): Blueprint;

repr

boundingBox

orientation

stretch(ratio: number, direction: Point2D, origin?: Point2D): Blueprint;

scale(scaleFactor: number, center?: Point2D): Blueprint;

rotate(angle: number, center?: Point2D): Blueprint;

translate(xDist: number, yDist: number): Blueprint;
translate(translationVector: Point2D): Blueprint;
translate(xDist: number, yDist: number): Blueprint;
translate(translationVector: Point2D): Blueprint;

// Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Blueprint;

// Returns the sketched version of the drawing, on a plane
sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): Sketch;

// Returns the sketched version of the drawing, on a face
sketchOnFace(face: Face, scaleMode?: ScaleMode): Sketch;

subFace(face: Face, origin?: Point | null): Face;

punchHole(shape: AnyShape, face: SingleFace, { height, origin, draftAngle, }?: {
height?: number | null;
origin?: Point | null;
draftAngle?: number;
}): AnyShape;

toSVGPathD(): string;

toSVGPath(): string;

// Returns the SVG viewbox that corresponds to this drawing
toSVGViewBox(margin?: number): string;

// Formats the drawing as a list of SVG paths
toSVGPaths(): string[];

// Formats the drawing as an SVG image
toSVG(margin?: number): string;

firstPoint

lastPoint

isInside(point: Point2D): boolean;

isClosed(): boolean;

intersects(other: Blueprint): boolean;

Blueprints: export declare class Blueprints implements DrawingInterface

blueprints: Array<Blueprint | CompoundBlueprint>

constructor

repr

clone(): Blueprints;

boundingBox

stretch(ratio: number, direction: Point2D, origin: Point2D): Blueprints;

rotate(angle: number, center?: Point2D): Blueprints;

scale(scaleFactor: number, center?: Point2D): Blueprints;

translate(xDist: number, yDist: number): Blueprints;
translate(translationVector: Point2D): Blueprints;
translate(xDist: number, yDist: number): Blueprints;
translate(translationVector: Point2D): Blueprints;

// Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Blueprints;

// Returns the sketched version of the drawing, on a plane
sketchOnPlane(plane?: PlaneName | Plane, origin?: Point | number): Sketches;

// Returns the sketched version of the drawing, on a face
sketchOnFace(face: Face, scaleMode?: ScaleMode): Sketches;

punchHole(shape: AnyShape, face: SingleFace, options?: {
height?: number;
origin?: Point;
draftAngle?: number;
}): AnyShape;

// Returns the SVG viewbox that corresponds to this drawing
toSVGViewBox(margin?: number): string;

// Formats the drawing as a list of SVG paths
toSVGPaths(): string[][];

// Formats the drawing as an SVG image
toSVG(margin?: number): string;

BlueprintSketcher: export declare class BlueprintSketcher extends BaseSketcher2d implements GenericSketcher<Blueprint>

constructor

// Stop drawing and returns the sketch
done(): Blueprint;

// Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
close(): Blueprint;

// Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
closeWithMirror(): Blueprint;

// Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first), add a fillet between the last and the first segments and returns the sketch
closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer" | "dogbone"): Blueprint;

BoundingBox: export declare class BoundingBox extends WrappingObj<Bnd_Box>

constructor

static fromBounds(min: Point, max: Point): BoundingBox;

repr

bounds

center

width

height

depth

add(other: BoundingBox): void;

isOut(other: BoundingBox): boolean;

BoundingBox2d: export declare class BoundingBox2d extends WrappingObj<Bnd_Box2d>

constructor

repr

bounds

center

width

height

outsidePoint(paddingPercent?: number): Point2D;

add(other: BoundingBox2d): void;

isOut(other: BoundingBox2d): boolean;

containsPoint(other: Point2D): boolean;

Compound: export declare class Compound extends \_3DShape<TopoDS_Compound>

CompoundBlueprint: export declare class CompoundBlueprint implements DrawingInterface

blueprints: Blueprint[]

constructor

clone(): CompoundBlueprint;

boundingBox

repr

stretch(ratio: number, direction: Point2D, origin: Point2D): CompoundBlueprint;

rotate(angle: number, center?: Point2D): CompoundBlueprint;

scale(scaleFactor: number, center?: Point2D): CompoundBlueprint;

translate(xDist: number, yDist: number): CompoundBlueprint;
translate(translationVector: Point2D): CompoundBlueprint;
translate(xDist: number, yDist: number): CompoundBlueprint;
translate(translationVector: Point2D): CompoundBlueprint;

// Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): CompoundBlueprint;

// Returns the sketched version of the drawing, on a plane
sketchOnPlane(plane?: PlaneName | Plane, origin?: Point | number): CompoundSketch;

// Returns the sketched version of the drawing, on a face
sketchOnFace(face: Face, scaleMode?: ScaleMode): CompoundSketch;

punchHole(shape: AnyShape, face: SingleFace, options?: {
height?: number;
origin?: Point;
draftAngle?: number;
}): AnyShape;

// Returns the SVG viewbox that corresponds to this drawing
toSVGViewBox(margin?: number): string;

// Formats the drawing as a list of SVG paths
toSVGPaths(): string[];

toSVGGroup(): string;

// Formats the drawing as an SVG image
toSVG(margin?: number): string;

// A group of sketches that should correspond to a unique face (i.e
CompoundSketch: export declare class CompoundSketch implements SketchInterface

sketches: Sketch[]

constructor

delete(): void;

outerSketch

innerSketches

wires

// Transforms the lines into a face
face(): Face;

// Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
extrusionDirection?: Point;
extrusionProfile?: ExtrusionProfile;
twistAngle?: number;
origin?: Point;
}): Shape3D;

// Revolves the drawing on an axis (defined by its direction and an origin (defaults to the sketch origin)
revolve(revolutionAxis?: Point, { origin, angle }?: {
origin?: Point;
angle?: number;
}): Shape3D;

// Loft between this sketch and another sketch (or an array of them)
loftWith(otherCompound: this, loftConfig: LoftConfig): Shape3D;

CompSolid: export declare class CompSolid extends \_3DShape<TopoDS_CompSolid>

CornerFinder: export declare class CornerFinder extends Finder<Corner, Blueprint>

clone(): CornerFinder;

// Filter to find corner that have their point are in the list
inList(elementList: Point2D[]): this;

// Filter to find elements that are at a specified distance from a point
atDistance(distance: number, point?: Point2D): this;

// Filter to find elements that contain a certain point
atPoint(point: Point2D): this;

// Filter to find elements that are within a box
inBox(corner1: Point2D, corner2: Point2D): this;

// Filter to find corner that a certain angle between them - only between 0 and 180
ofAngle(angle: number): this;

// Check if a particular element should be filtered or not according to the current finder
shouldKeep(element: Corner): boolean;

protected applyFilter(blueprint: Blueprint): Corner[];

Curve: export declare class Curve extends WrappingObj<CurveLike>

repr

curveType

startPoint

endPoint

pointAt(position?: number): Vector;

tangentAt(position?: number): Vector;

isClosed

isPeriodic

period

Curve2D: export declare class Curve2D extends WrappingObj<Geom2d_Curve>

constructor

boundingBox

repr

innerCurve

serialize(): string;

value(parameter: number): Point2D;

firstPoint

lastPoint

firstParameter

lastParameter

adaptor(): Geom2dAdaptor_Curve;

geomType

clone(): Curve2D;

reverse(): void;

distanceFrom(element: Curve2D | Point2D): number;

isOnCurve(point: Point2D): boolean;

parameter(point: Point2D, precision?: number): number;

tangentAt(index: number | Point2D): Point2D;

splitAt(points: Point2D[] | number[], precision?: number): Curve2D[];

DistanceQuery: export declare class DistanceQuery extends WrappingObj<BRepExtrema_DistShapeShape>

constructor

distanceTo(shape: AnyShape): number;

DistanceTool: export declare class DistanceTool extends WrappingObj<BRepExtrema_DistShapeShape>

constructor

distanceBetween(shape1: AnyShape, shape2: AnyShape): number;

Drawing: export declare class Drawing implements DrawingInterface

constructor

clone(): Drawing;

serialize(): string;

boundingBox

stretch(ratio: number, direction: Point2D, origin: Point2D): Drawing;

repr

rotate(angle: number, center?: Point2D): Drawing;

translate(xDist: number, yDist: number): Drawing;
translate(translationVector: Point2D): Drawing;
translate(xDist: number, yDist: number): Drawing;
translate(translationVector: Point2D): Drawing;

scale(scaleFactor: number, center?: Point2D): Drawing;

// Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Drawing;

// Builds a new drawing by cuting another drawing into this one
cut(other: Drawing): Drawing;

// Builds a new drawing by merging another drawing into this one
fuse(other: Drawing): Drawing;

// Builds a new drawing by intersection this drawing with another
intersect(other: Drawing): Drawing;

// Creates a new drawing with some corners filletted, as specified by the radius and the corner finder function
fillet(radius: number, filter?: (c: CornerFinder) => CornerFinder): Drawing;

// Creates a new drawing with some corners filletted, as specified by the radius and the corner finder function
chamfer(radius: number, filter?: (c: CornerFinder) => CornerFinder): Drawing;

// Returns the sketched version of the drawing, on a plane
sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;

// Returns the sketched version of the drawing, on a face
sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;

punchHole(shape: AnyShape, faceFinder: SingleFace, options?: {
height?: number;
origin?: Point;
draftAngle?: number;
}): AnyShape;

// Formats the drawing as an SVG image
toSVG(margin?: number): string;

// Returns the SVG viewbox that corresponds to this drawing
toSVGViewBox(margin?: number): string;

// Formats the drawing as a list of SVG paths
toSVGPaths(): string[] | string[][];

offset(distance: number, offsetConfig?: Offset2DConfig): Drawing;

approximate(target: "svg" | "arcs", options?: ApproximationOptions): Drawing;

blueprint

// DrawingPen is a helper class to draw in 2D
DrawingPen: export declare class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing>

constructor

// Stop drawing and returns the sketch
done(): Drawing;

// Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
close(): Drawing;

// Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
closeWithMirror(): Drawing;

// Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first), change the corner between the last and the first segments and returns the sketch
closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Drawing;

Edge: export declare class Edge extends \_1DShape<TopoDS_Edge>

// With an EdgeFinder you can apply a set of filters to find specific edges within a shape
EdgeFinder: export declare class EdgeFinder extends Finder3d<Edge>

clone(): EdgeFinder;

// Filter to find edges that are in a certain direction
inDirection(direction: Direction_2 | Point): this;

// Filter to find edges of a certain length
ofLength(length: number | ((l: number) => boolean)): this;

// Filter to find edges that are of a cetain curve type
ofCurveType(curveType: CurveType): this;

// Filter to find edges that are parallel to a plane
parallelTo(plane: Plane | StandardPlane | Face): this;

// Filter to find edges that within a plane
inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;

// Check if a particular element should be filtered or not according to the current finder
shouldKeep(element: Edge): boolean;

protected applyFilter(shape: AnyShape): Edge[];

Face: export declare class Face extends Shape<TopoDS_Face>

surface

orientation

flipOrientation(): Face;

geomType

UVBounds

pointOnSurface(u: number, v: number): Vector;

uvCoordinates(point: Point): [number, number];

normalAt(locationVector?: Point): Vector;

center

outerWire(): Wire;

innerWires(): Wire[];

triangulation(index0?: number): FaceTriangulation | null;

// With a FaceFinder you can apply a set of filters to find specific faces within a shape
FaceFinder: export declare class FaceFinder extends Finder3d<Face>

clone(): FaceFinder;

// Filter to find faces that are parallel to plane or another face
parallelTo(plane: Plane | StandardPlane | Face): this;

// Filter to find faces that are of a cetain surface type
ofSurfaceType(surfaceType: SurfaceType): this;

// Filter to find faces that are contained in a plane
inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;

// Check if a particular element should be filtered or not according to the current finder
shouldKeep(element: Face): boolean;

protected applyFilter(shape: AnyShape): Face[];

// The FaceSketcher allows you to sketch on a face that is not planar, for instance the sides of a cylinder
FaceSketcher: export declare class FaceSketcher extends BaseSketcher2d implements GenericSketcher<Sketch>

face: Face

constructor

protected buildWire(): Wire;

// Stop drawing and returns the sketch
done(): Sketch;

// Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
close(): Sketch;

// Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
closeWithMirror(): Sketch;

// Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first), add a fillet between the last and the first segments and returns the sketch
closeWithCustomCorner(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: "fillet" | "chamfer" | "dogbone"): Sketch;

LinearPhysicalProperties: export declare class LinearPhysicalProperties extends PhysicalProperties

length

MeshShape: export declare class MeshShape extends WrappingObj<ManifoldInstance> implements Shape3DLike<MeshShape, MeshShapeMesh, MeshShape, number>

constructor

clone(): MeshShape;

fuse(other: MeshShape, \_options?: any): MeshShape;

cut(other: MeshShape, \_options?: any): MeshShape;

intersect(other: MeshShape): MeshShape;

translate(xDist: number, yDist: number, zDist: number): MeshShape;
translate(vector: Point): MeshShape;
translate(xDist: number, yDist: number, zDist: number): MeshShape;
translate(vector: Point): MeshShape;

translateX(distance: number): MeshShape;

translateY(distance: number): MeshShape;

translateZ(distance: number): MeshShape;

rotate(angle: number, position?: Point, direction?: Point): MeshShape;
rotate(vector: Point): MeshShape;
rotate(angle: number, position?: Point, direction?: Point): MeshShape;
rotate(vector: Point): MeshShape;

scale(scale: number, center?: Point): MeshShape;

mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): MeshShape;

simplify(tolerance?: number): MeshShape;

refine(n: number): MeshShape;

refineToLength(length: number): MeshShape;

refineToTolerance(tolerance: number): MeshShape;

hull(): MeshShape;

asOriginal(): MeshShape;

mesh(): MeshShapeMesh;

boundingBox

volume(): number;

surfaceArea(): number;

numTri(): number;

numVert(): number;

numEdge(): number;

isEmpty

// Exports the mesh shape as an STL file Blob
blobSTL({ binary }?: {
binary?: boolean | undefined;
}): Blob;

Plane: export declare class Plane

oc: OpenCascadeInstance

xDir: Vector

yDir: Vector

zDir: Vector

constructor

delete(): void;

clone(): Plane;

origin

translateTo(point: Point): Plane;

translate(xDist: number, yDist: number, zDist: number): Plane;
translate(vector: Point): Plane;
translate(xDist: number, yDist: number, zDist: number): Plane;
translate(vector: Point): Plane;

translateX(xDist: number): Plane;

translateY(yDist: number): Plane;

translateZ(zDist: number): Plane;

pivot(angle: number, direction?: Direction): Plane;

rotate2DAxes(angle: number): Plane;

setOrigin2d(x: number, y: number): void;

toLocalCoords(vec: Vector): Vector;

toWorldCoords(v: Point): Vector;

ProjectionCamera: export declare class ProjectionCamera extends WrappingObj<gp_Ax2>

constructor

position

direction

xAxis

yAxis

autoAxes(): void;

setPosition(position: Point): this;

setXAxis(xAxis: Point): this;

setYAxis(yAxis: Point): this;

lookAt(shape: {
boundingBox: BoundingBox;
} | Point): this;
