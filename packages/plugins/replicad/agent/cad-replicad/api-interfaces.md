# replicad — Interfaces

14 top-level symbols. Signatures are verbatim typescript.

BooleanOperationOptions: export declare interface BooleanOperationOptions

optimisation: BooleanOptimisation

BSplineApproximationConfig: export declare interface BSplineApproximationConfig

tolerance: number

degMax: number

degMin: number

smoothing: null | [number, number, number]

CurveLike: export declare interface CurveLike

delete(): void;

Value(v: number): gp_Pnt;

IsPeriodic(): boolean;

Period(): number;

IsClosed(): boolean;

FirstParameter(): number;

LastParameter(): number;

GetType?(): any;

D1(v: number, p: gp_Pnt, vPrime: gp_Vec): void;

Deletable: export declare interface Deletable

delete: () => void

DrawingInterface: export declare interface DrawingInterface

clone(): DrawingInterface;

boundingBox: BoundingBox2d

stretch(ratio: number, direction: Point2D, origin: Point2D): DrawingInterface;

rotate(angle: number, center: Point2D): DrawingInterface;

translate(xDist: number, yDist: number): DrawingInterface;
translate(translationVector: Point2D): DrawingInterface;
translate(xDist: number, yDist: number): DrawingInterface;
translate(translationVector: Point2D): DrawingInterface;

// Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): DrawingInterface;

// Returns the sketched version of the drawing, on a plane
sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): SketchInterface | Sketches;
sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): SketchInterface | Sketches;
sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): SketchInterface | Sketches;

// Returns the sketched version of the drawing, on a face
sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;

// Formats the drawing as an SVG image
toSVG(margin: number): string;

// Returns the SVG viewbox that corresponds to this drawing
toSVGViewBox(margin?: number): string;

// Formats the drawing as a list of SVG paths
toSVGPaths(): string[] | string[][];

ExtrusionProfile: export declare interface ExtrusionProfile

profile: "s-curve" | "linear"

endFactor: number

FaceTriangulation: export declare interface FaceTriangulation

vertices: number[]

trianglesIndexes: number[]

verticesNormals: number[]

// Sketchers allow the user to draw a two dimentional shape using segment of curve
GenericSketcher: export declare interface GenericSketcher<ReturnType>

// Changes the point to start your drawing from
movePointerTo(point: Point2D): this;

// Draws a line from the current point to the point given in argument
lineTo(point: Point2D): this;

// Draws a line at the horizontal distance xDist and the vertical distance yDist of the current point
line(xDist: number, yDist: number): this;

// Draws a vertical line of length distance from the current point
vLine(distance: number): this;

// Draws an horizontal line of length distance from the current point
hLine(distance: number): this;

// Draws a vertical line to the y coordinate
vLineTo(yPos: number): this;

// Draws an horizontal line to the x coordinate
hLineTo(xPos: number): this;

// Draws a line from the current point to the point defined in polar coordiates, of radius r and angle theta (in degrees) from the origin
polarLineTo([r, theta]: [number, number]): this;

// Draws a line from the current point to the point defined in polar coordiates, of radius r and angle theta (in degrees) from the current point
polarLine(r: number, theta: number): this;

// Draws a line from the current point as a tangent to the previous part of curve drawn
tangentLine(distance: number): this;

// Draws an arc of circle by defining its end point and a third point through which the arc will pass
threePointsArcTo(end: Point2D, innerPoint: Point2D): this;

// Draws an arc of circle by defining its end point and a third point through which the arc will pass
threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;

// Draws an arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point
sagittaArcTo(end: Point2D, sagitta: number): this;

// Draws an arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point.The end point is defined by its horizontal and vertical distances from the start point
sagittaArc(xDist: number, yDist: number, sagitta: number): this;

// Draws a vertical arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point.The end point is defined by its vertical distance from the start point
vSagittaArc(distance: number, sagitta: number): this;

// Draws an horizontal arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point.The end point is defined by its horizontal distance from the start point
hSagittaArc(distance: number, sagitta: number): this;

// Draws an arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point
bulgeArcTo(end: Point2D, bulge: number): this;

// Draws an arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point in units of half the chord
bulgeArc(xDist: number, yDist: number, bulge: number): this;

// Draws a vertical arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point in units of half the chord
vBulgeArc(distance: number, bulge: number): this;

// Draws an horizontal arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point in units of half the chord
hBulgeArc(distance: number, bulge: number): this;

// Draws an arc of circle from the current point as a tangent to the previous part of curve drawn
tangentArcTo(end: Point2D): this;

// Draws an arc of circle from the current point as a tangent to the previous part of curve drawn.The end point is defined by its horizontal and vertical distances from the start point
tangentArc(xDist: number, yDist: number): this;

// Draws an arc of ellipse by defining its end point and an ellipse
ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;

// Draws an arc of ellipse by defining its end point and an ellipse
ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;

// Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line)
halfEllipseTo(end: Point2D, radius: number, sweep: boolean): this;

// Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line).The end point is defined by distances from he start point
halfEllipse(xDist: number, yDist: number, radius: number, sweep: boolean): this;

// Draws a generic bezier curve to the end point, going using a set of control points
bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;

// Draws a quadratic bezier curve to the end point, using the single control point
quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;

// Draws a cubic bezier curve to the end point, using the start and end control point to define its shape
cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;

// Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
smoothSplineTo(end: Point2D, config?: SplineConfig): this;

// Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
smoothSpline(xDist: number, yDist: number, splineConfig: SplineConfig): this;

// Stop drawing and returns the sketch
done(): ReturnType;

// Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
close(): ReturnType;

// Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
closeWithMirror(): ReturnType;

GenericSweepConfig: export declare interface GenericSweepConfig

frenet: boolean

auxiliarySpine: Wire | Edge

law: null | Law_Function

transitionMode: "right" | "transformed" | "round"

withContact: boolean

support: TopoDS_Shape

forceProfileSpineOthogonality: boolean

LoftConfig: export declare interface LoftConfig

ruled: boolean

startPoint: Point

endPoint: Point

MeshShapeMesh: export declare interface MeshShapeMesh

vertices: number[]

triangles: number[]

normals: number[]

vertProperties: number[]

numProp: number

Shape3DLike: export declare interface Shape3DLike<ShapeT, MeshT, OtherT = ShapeT, MeshOptionsT = any>

fuse(other: ShapeT, options?: any): ShapeT;

cut(other: ShapeT, options?: any): ShapeT;

intersect(other: OtherT): ShapeT;

translate(xDist: number, yDist: number, zDist: number): ShapeT;
translate(vector: Point): ShapeT;
translate(xDist: number, yDist: number, zDist: number): ShapeT;
translate(vector: Point): ShapeT;

translateX(distance: number): ShapeT;

translateY(distance: number): ShapeT;

translateZ(distance: number): ShapeT;

rotate(angle: number, position?: Point, direction?: Point): ShapeT;

scale(scale: number, center?: Point): ShapeT;

mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): ShapeT;

mesh(options?: MeshOptionsT): MeshT;

boundingBox: BoundingBox

ShapeMesh: export declare interface ShapeMesh

triangles: number[]

vertices: number[]

normals: number[]

faceGroups: {
start: number;
count: number;
faceId: number;
}[]

SketchInterface: export declare interface SketchInterface

// Transforms the lines into a face
face(): Face;

// Revolves the drawing on an axis (defined by its direction and an origin (defaults to the sketch origin)
revolve(revolutionAxis?: Point, config?: {
origin?: Point;
angle?: number;
}): Shape3D;

// Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
extrude(extrusionDistance: number, extrusionConfig?: {
extrusionDirection?: Point;
extrusionProfile?: ExtrusionProfile;
twistAngle?: number;
origin?: Point;
}): Shape3D;

// Loft between this sketch and another sketch (or an array of them)
loftWith(otherSketches: this | this[], loftConfig: LoftConfig, returnShell?: boolean): Shape3D;
