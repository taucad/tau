export declare function translate(shape: TopoDS_Shape, vector: Point): TopoDS_Shape;
export declare function draw(initialPoint?: Point2D): DrawingPen;
export declare function drawCircle(radius: number): Drawing;
export declare function drawRoundedRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Drawing;
export declare class EdgeFinder extends Finder3d<Edge> {
    clone(): EdgeFinder;
    inDirection(direction: Direction_2 | Point): this;
    ofLength(length: number | ((l: number) => boolean)): this;
    ofCurveType(curveType: CurveType): this;
    parallelTo(plane: Plane | StandardPlane | Face): this;
    inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;
    shouldKeep(element: Edge): boolean;
}
export declare class FaceFinder extends Finder3d<Face> {
    clone(): FaceFinder;
    parallelTo(plane: Plane | StandardPlane | Face): this;
    ofSurfaceType(surfaceType: SurfaceType): this;
    inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;
    shouldKeep(element: Face): boolean;
}
export declare function rotate(shape: TopoDS_Shape, angle: number, position?: Point, direction?: Point): TopoDS_Shape;
export declare const drawRectangle: typeof drawRoundedRectangle;
export declare function makePlane(plane: Plane): Plane;
export declare function makePlane(plane?: PlaneName, origin?: Point | number): Plane;
export declare const assembleWire: (listOfEdges: (Edge | Wire)[]) => Wire;
export declare function drawPolysides(radius: number, sidesCount: number, sagitta?: number): Drawing;
export declare const makeFace: (wire: Wire, holes?: Wire[]) => Face;
export declare const sketchCircle: (radius: number, planeConfig?: PlaneConfig) => Sketch;
export declare const sketchRectangle: (xLength: number, yLength: number, planeConfig?: PlaneConfig) => Sketch;
export declare function makeSolid(facesOrShells: Array<Face | Shell>): Solid;
export declare function mirror(shape: TopoDS_Shape, inputPlane?: Plane | PlaneName | Point, origin?: Point): TopoDS_Shape;
export declare class Plane {
    xDir: Vector;
    yDir: Vector;
    zDir: Vector;
    constructor(origin: Point, xDirection?: Point | null, normal?: Point);
    delete(): void;
    clone(): Plane;
    get origin(): Vector;
    set origin(newOrigin: Vector);
    translateTo(point: Point): Plane;
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
}
export declare const makeOffset: (face: Face, offset: number, tolerance?: number) => Shape3D;
export declare class Sketcher implements GenericSketcher<Sketch> {
    constructor(plane: Plane);
    constructor(plane?: PlaneName, origin?: Point | number);
    delete(): void;
    movePointerTo([x, y]: Point2D): this;
    lineTo([x, y]: Point2D): this;
    line(xDist: number, yDist: number): this;
    vLine(distance: number): this;
    hLine(distance: number): this;
    vLineTo(yPos: number): this;
    hLineTo(xPos: number): this;
    polarLine(distance: number, angle: number): this;
    polarLineTo([r, theta]: [
        number,
        number
    ]): this;
    tangentLine(distance: number): this;
    threePointsArcTo(end: Point2D, innerPoint: Point2D): this;
    threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;
    tangentArcTo(end: Point2D): this;
    tangentArc(xDist: number, yDist: number): this;
    sagittaArcTo(end: Point2D, sagitta: number): this;
    sagittaArc(xDist: number, yDist: number, sagitta: number): this;
    vSagittaArc(distance: number, sagitta: number): this;
    hSagittaArc(distance: number, sagitta: number): this;
    bulgeArcTo(end: Point2D, bulge: number): this;
    bulgeArc(xDist: number, yDist: number, bulge: number): this;
    vBulgeArc(distance: number, bulge: number): this;
    hBulgeArc(distance: number, bulge: number): this;
    ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;
    ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;
    halfEllipseTo(end: Point2D, verticalRadius: number, sweep?: boolean): this;
    halfEllipse(xDist: number, yDist: number, verticalRadius: number, sweep?: boolean): this;
    bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
    quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;
    cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;
    smoothSplineTo(end: Point2D, config?: SplineConfig): this;
    smoothSpline(xDist: number, yDist: number, splineConfig?: SplineConfig): this;
    done(): Sketch;
    close(): Sketch;
    closeWithMirror(): Sketch;
}
export declare const drawParametricFunction: (func: (t: number) => Point2D, { pointsCount, start, stop, closeShape }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
    closeShape?: boolean | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Drawing;
export declare const makeCylinder: (radius: number, height: number, location?: Point, direction?: Point) => Solid;
export declare const polysideInnerRadius: (outerRadius: number, sidesCount: number, sagitta?: number) => number;
export declare class Shell extends _3DShape<TopoDS_Shell> {
}
export declare class Vector extends WrappingObj<gp_Vec> {
    constructor(vector?: Point);
    get repr(): string;
    get x(): number;
    get y(): number;
    get z(): number;
    get Length(): number;
    toTuple(): [
        number,
        number,
        number
    ];
    cross(v: Vector): Vector;
    dot(v: Vector): number;
    sub(v: Vector): Vector;
    add(v: Vector): Vector;
    multiply(scale: number): Vector;
    normalized(): Vector;
    normalize(): Vector;
    getCenter(): Vector;
    getAngle(v: Vector): number;
    projectToPlane(plane: Plane): Vector;
    equals(other: Vector): boolean;
    toPnt(): gp_Pnt;
    toDir(): gp_Dir;
    rotate(angle: number, center?: Point, direction?: Point): Vector;
}
export declare const makeSphere: (radius: number) => Solid;
export declare const revolution: (face: Face, center?: Point, direction?: Point, angle?: number) => Shape3D;
export declare function scale(shape: TopoDS_Shape, center: Point, scale: number): TopoDS_Shape;
export declare class Shape<Type extends TopoDS_Shape> extends WrappingObj<Type> {
    constructor(ocShape: Type);
    clone(): this;
    get hashCode(): number;
    get isNull(): boolean;
    isSame(other: AnyShape): boolean;
    isEqual(other: AnyShape): boolean;
    simplify(): this;
    translate(xDist: number, yDist: number, zDist: number): this;
    translate(vector: Point): this;
    translateX(distance: number): this;
    translateY(distance: number): this;
    translateZ(distance: number): this;
    rotate(angle: number, position?: Point, direction?: Point): this;
    mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): this;
    scale(scale: number, center?: Point): this;
    get edges(): Edge[];
    get faces(): Face[];
    get wires(): Wire[];
    get boundingBox(): BoundingBox;
    mesh({ tolerance, angularTolerance }?: {
        tolerance?: number | undefined;
        angularTolerance?: number | undefined;
    }): ShapeMesh;
    meshEdges({ tolerance, angularTolerance }?: {
        tolerance?: number | undefined;
        angularTolerance?: number | undefined;
    }): {
        lines: number[];
        edgeGroups: {
            start: number;
            count: number;
            edgeId: number;
        }[];
    };
    blobSTEP(): Blob;
    blobSTL({ tolerance, angularTolerance, binary, }?: {
        tolerance?: number | undefined;
        angularTolerance?: number | undefined;
        binary?: boolean | undefined;
    }): Blob;
}
export declare class Sketch implements SketchInterface {
    wire: Wire;
    constructor(wire: Wire, { defaultOrigin, defaultDirection, }?: {
        defaultOrigin?: Point;
        defaultDirection?: Point;
    });
    get baseFace(): Face | null | undefined;
    set baseFace(newFace: Face | null | undefined);
    delete(): void;
    clone(): Sketch;
    get defaultOrigin(): Vector;
    set defaultOrigin(newOrigin: Point);
    get defaultDirection(): Vector;
    set defaultDirection(newDirection: Point);
    face(): Face;
    wires(): Wire;
    faces(): Face;
    revolve(revolutionAxis?: Point, { origin }?: {
        origin?: Point;
    }): Shape3D;
    extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
        extrusionDirection?: Point;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: Point;
    }): Shape3D;
    sweepSketch(sketchOnPlane: (plane: Plane, origin: Point) => this, sweepConfig?: GenericSweepConfig): Shape3D;
    loftWith(otherSketches: this | this[], loftConfig?: LoftConfig, returnShell?: boolean): Shape3D;
}
export declare abstract class _1DShape<Type extends TopoDS_Shape> extends Shape<Type> {
    get repr(): string;
    get curve(): Curve;
    get startPoint(): Vector;
    get endPoint(): Vector;
    tangentAt(position?: number): Vector;
    pointAt(position?: number): Vector;
    get isClosed(): boolean;
    get isPeriodic(): boolean;
    get period(): number;
    get geomType(): CurveType;
    get length(): number;
    get orientation(): "forward" | "backward";
}
export declare class _3DShape<Type extends TopoDS_Shape> extends Shape<Type> {
    fuse(other: Shape3D, { optimisation, }?: {
        optimisation?: "none" | "commonFace" | "sameFace";
    }): Shape3D;
    cut(tool: Shape3D, { optimisation, }?: {
        optimisation?: "none" | "commonFace" | "sameFace";
    }): Shape3D;
    intersect(tool: AnyShape): AnyShape;
    shell(config: {
        filter: FaceFinder;
        thickness: number;
    }, tolerance?: number): Shape3D;
    shell(thickness: number, finderFcn: (f: FaceFinder) => FaceFinder, tolerance?: number): Shape3D;
    fillet(radiusConfig: RadiusConfig<FilletRadius>, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;
    chamfer(radiusConfig: RadiusConfig<ChamferRadius>, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;
}
export declare const addHolesInFace: (face: Face, holes: Wire[]) => Face;
export declare type AnyShape = Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound;
declare interface ApproximationOptions {
    tolerance?: number;
    continuity?: "C0" | "C1" | "C2" | "C3";
    maxSegments?: number;
}
export declare function asDir(coords: Point): gp_Dir;
export declare function asPnt(coords: Point): gp_Pnt;
export declare class AssemblyExporter extends WrappingObj<TDocStd_Document> {
}
export declare const axis2d: (point: Point2D, direction: Point2D) => gp_Ax2d;
export declare class BaseSketcher2d {
    constructor(origin?: Point2D);
    movePointerTo(point: Point2D): this;
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
    customCorner(radius: number, mode?: "fillet" | "chamfer"): this;
}
export declare const basicFaceExtrusion: (face: Face, extrusionVec: Vector) => Solid;
export declare class Blueprint implements DrawingInterface {
    curves: Curve2D[];
    constructor(curves: Curve2D[]);
    delete(): void;
    clone(): Blueprint;
    get repr(): string;
    get boundingBox(): BoundingBox2d;
    get orientation(): "clockwise" | "counterClockwise";
    stretch(ratio: number, direction: Point2D, origin?: Point2D): Blueprint;
    scale(scaleFactor: number, center?: Point2D): Blueprint;
    rotate(angle: number, center?: Point2D): Blueprint;
    translate(xDist: number, yDist: number): Blueprint;
    translate(translationVector: Point2D): Blueprint;
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Blueprint;
    sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): Sketch;
    sketchOnFace(face: Face, scaleMode?: ScaleMode): Sketch;
    toSVGPathD(): string;
    toSVGPath(): string;
    toSVGViewBox(margin?: number): string;
    toSVGPaths(): string[];
    toSVG(margin?: number): string;
    get firstPoint(): Point2D;
    get lastPoint(): Point2D;
    isInside(point: Point2D): boolean;
    isClosed(): boolean;
    intersects(other: Blueprint): boolean;
}
export declare class Blueprints implements DrawingInterface {
    blueprints: Array<Blueprint | CompoundBlueprint>;
    constructor(blueprints: Array<Blueprint | CompoundBlueprint>);
    get repr(): string;
    clone(): Blueprints;
    get boundingBox(): BoundingBox2d;
    stretch(ratio: number, direction: Point2D, origin: Point2D): Blueprints;
    rotate(angle: number, center?: Point2D): Blueprints;
    scale(scaleFactor: number, center?: Point2D): Blueprints;
    translate(xDist: number, yDist: number): Blueprints;
    translate(translationVector: Point2D): Blueprints;
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Blueprints;
    sketchOnPlane(plane?: PlaneName | Plane, origin?: Point | number): Sketches;
    sketchOnFace(face: Face, scaleMode?: ScaleMode): Sketches;
    toSVGViewBox(margin?: number): string;
    toSVGPaths(): string[][];
    toSVG(margin?: number): string;
}
export declare class BlueprintSketcher extends BaseSketcher2d implements GenericSketcher<Blueprint> {
    constructor(origin?: Point2D);
    done(): Blueprint;
    close(): Blueprint;
    closeWithMirror(): Blueprint;
    closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Blueprint;
}
export declare class BoundingBox extends WrappingObj<Bnd_Box> {
    constructor(wrapped?: Bnd_Box);
    get repr(): string;
    get bounds(): [
        SimplePoint,
        SimplePoint
    ];
    get center(): SimplePoint;
    get width(): number;
    get height(): number;
    get depth(): number;
    add(other: BoundingBox): void;
    isOut(other: BoundingBox): boolean;
}
export declare class BoundingBox2d extends WrappingObj<Bnd_Box2d> {
    constructor(wrapped?: Bnd_Box2d);
    get repr(): string;
    get bounds(): [
        Point2D,
        Point2D
    ];
    get center(): Point2D;
    get width(): number;
    get height(): number;
    outsidePoint(paddingPercent?: number): Point2D;
    add(other: BoundingBox2d): void;
    isOut(other: BoundingBox2d): boolean;
    containsPoint(other: Point2D): boolean;
}
export declare interface BSplineApproximationConfig {
    tolerance?: number;
    degMax?: number;
    degMin?: number;
    smoothing?: null | [
        number,
        number,
        number
    ];
}
export declare function cast(shape: TopoDS_Shape): AnyShape;
export declare type ChamferRadius = number | {
    distances: [
        number,
        number
    ];
    selectedFace: (f: FaceFinder) => FaceFinder;
} | {
    distance: number;
    angle: number;
    selectedFace: (f: FaceFinder) => FaceFinder;
};
export declare const combineFinderFilters: <Type, T, R = number>(filters: {
    filter: Finder<Type, T>;
    radius: R;
}[]) => [
    (v: Type) => R | null,
    () => void
];
export declare function complexExtrude(wire: Wire, center: Point, normal: Point, profileShape: ExtrusionProfile | undefined, shellMode: true): [
    Shape3D,
    Wire,
    Wire
];
export declare function complexExtrude(wire: Wire, center: Point, normal: Point, profileShape?: ExtrusionProfile, shellMode?: false): Shape3D;
export declare class Compound extends _3DShape<TopoDS_Compound> {
}
export declare class CompoundBlueprint implements DrawingInterface {
    blueprints: Blueprint[];
    constructor(blueprints: Blueprint[]);
    clone(): CompoundBlueprint;
    get boundingBox(): BoundingBox2d;
    get repr(): string;
    stretch(ratio: number, direction: Point2D, origin: Point2D): CompoundBlueprint;
    rotate(angle: number, center?: Point2D): CompoundBlueprint;
    scale(scaleFactor: number, center?: Point2D): CompoundBlueprint;
    translate(xDist: number, yDist: number): CompoundBlueprint;
    translate(translationVector: Point2D): CompoundBlueprint;
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): CompoundBlueprint;
    sketchOnPlane(plane?: PlaneName | Plane, origin?: Point | number): CompoundSketch;
    sketchOnFace(face: Face, scaleMode?: ScaleMode): CompoundSketch;
    toSVGViewBox(margin?: number): string;
    toSVGPaths(): string[];
    toSVGGroup(): string;
    toSVG(margin?: number): string;
}
export declare const compoundShapes: (shapeArray: AnyShape[]) => AnyShape;
export declare class CompoundSketch implements SketchInterface {
    sketches: Sketch[];
    constructor(sketches: Sketch[]);
    delete(): void;
    get outerSketch(): Sketch;
    get innerSketches(): Sketch[];
    get wires(): AnyShape;
    face(): Face;
    extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
        extrusionDirection?: Point;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: Point;
    }): Shape3D;
    revolve(revolutionAxis?: Point, { origin }?: {
        origin?: Point;
    }): Shape3D;
    loftWith(otherCompound: this, loftConfig: LoftConfig): Shape3D;
}
export declare class CompSolid extends _3DShape<TopoDS_CompSolid> {
}
declare type CoordSystem = "reference" | {
    origin: Point;
    zDir: Point;
    xDir: Point;
};
export declare type Corner = {
    firstCurve: Curve2D;
    secondCurve: Curve2D;
    point: Point2D;
};
export declare class CornerFinder extends Finder<Corner, Blueprint> {
    clone(): CornerFinder;
    inList(elementList: Point2D[]): this;
    atDistance(distance: number, point?: Point2D): this;
    atPoint(point: Point2D): this;
    inBox(corner1: Point2D, corner2: Point2D): this;
    ofAngle(angle: number): this;
    shouldKeep(element: Corner): boolean;
}
export declare function createAssembly(shapes?: ShapeConfig[]): AssemblyExporter;
export declare const createNamedPlane: (plane: PlaneName, sourceOrigin?: Point | number) => Plane;
export declare type CubeFace = "front" | "back" | "top" | "bottom" | "left" | "right";
export declare class Curve extends WrappingObj<CurveLike> {
    get repr(): string;
    get curveType(): CurveType;
    get startPoint(): Vector;
    get endPoint(): Vector;
    pointAt(position?: number): Vector;
    tangentAt(position?: number): Vector;
    get isClosed(): boolean;
    get isPeriodic(): boolean;
    get period(): number;
}
export declare class Curve2D extends WrappingObj<Handle_Geom2d_Curve> {
    constructor(handle: Handle_Geom2d_Curve);
    get boundingBox(): BoundingBox2d;
    get repr(): string;
    get innerCurve(): Geom2d_Curve;
    value(parameter: number): Point2D;
    get firstPoint(): Point2D;
    get lastPoint(): Point2D;
    get firstParameter(): number;
    get lastParameter(): number;
    adaptor(): Geom2dAdaptor_Curve;
    get geomType(): CurveType;
    clone(): Curve2D;
    reverse(): void;
    distanceFrom(element: Curve2D | Point2D): number;
    isOnCurve(point: Point2D): boolean;
    parameter(point: Point2D, precision?: number): number;
    tangentAt(index: number | Point2D): Point2D;
    splitAt(points: Point2D[] | number[], precision?: number): Curve2D[];
}
export declare interface CurveLike {
    delete(): void;
    Value(v: number): gp_Pnt;
    IsPeriodic(): boolean;
    Period(): number;
    IsClosed(): boolean;
    FirstParameter(): number;
    LastParameter(): number;
    GetType?(): any;
    D1(v: number, p: gp_Pnt, vPrime: gp_Vec): void;
}
export declare type CurveType = "LINE" | "CIRCLE" | "ELLIPSE" | "HYPERBOLA" | "PARABOLA" | "BEZIER_CURVE" | "BSPLINE_CURVE" | "OFFSET_CURVE" | "OTHER_CURVE";
export declare const cut2D: (first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null;
export declare const cutBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;
export declare const DEG2RAD: number;
declare interface Deletable {
    delete: () => void;
}
declare type Direction = Point | "X" | "Y" | "Z";
declare type Direction_2 = "X" | "Y" | "Z";
export declare class DistanceQuery extends WrappingObj<BRepExtrema_DistShapeShape> {
    constructor(shape: AnyShape);
    distanceTo(shape: AnyShape): number;
}
export declare class DistanceTool extends WrappingObj<BRepExtrema_DistShapeShape> {
    constructor();
    distanceBetween(shape1: AnyShape, shape2: AnyShape): number;
}
export declare function downcast(shape: TopoDS_Shape): GenericTopo;
export declare function drawEllipse(majorRadius: number, minorRadius: number): Drawing;
export declare function drawFaceOutline(face: Face): Drawing;
export declare class Drawing implements DrawingInterface {
    constructor(innerShape?: Shape2D);
    clone(): Drawing;
    get boundingBox(): BoundingBox2d;
    stretch(ratio: number, direction: Point2D, origin: Point2D): Drawing;
    get repr(): string;
    rotate(angle: number, center?: Point2D): Drawing;
    translate(xDist: number, yDist: number): Drawing;
    translate(translationVector: Point2D): Drawing;
    scale(scaleFactor: number, center?: Point2D): Drawing;
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Drawing;
    cut(other: Drawing): Drawing;
    fuse(other: Drawing): Drawing;
    intersect(other: Drawing): Drawing;
    fillet(radius: number, filter?: (c: CornerFinder) => CornerFinder): Drawing;
    chamfer(radius: number, filter?: (c: CornerFinder) => CornerFinder): Drawing;
    sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
    sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
    sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;
    toSVG(margin?: number): string;
    toSVGViewBox(margin?: number): string;
    toSVGPaths(): string[] | string[][];
    offset(distance: number, offsetConfig?: Offset2DConfig): Drawing;
    approximate(target: "svg" | "arcs", options?: ApproximationOptions): Drawing;
    get blueprint(): Blueprint;
}
export declare interface DrawingInterface {
    clone(): DrawingInterface;
    boundingBox: BoundingBox2d;
    stretch(ratio: number, direction: Point2D, origin: Point2D): DrawingInterface;
    rotate(angle: number, center: Point2D): DrawingInterface;
    translate(xDist: number, yDist: number): DrawingInterface;
    translate(translationVector: Point2D): DrawingInterface;
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): DrawingInterface;
    sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
    sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
    sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): SketchInterface | Sketches;
    sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;
    toSVG(margin: number): string;
    toSVGViewBox(margin?: number): string;
    toSVGPaths(): string[] | string[][];
}
export declare class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing> {
    constructor(origin?: Point2D);
    done(): Drawing;
    close(): Drawing;
    closeWithMirror(): Drawing;
    closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Drawing;
}
export declare const drawPointsInterpolation: (points: Point2D[], approximationConfig?: BSplineApproximationConfig, options?: {
    closeShape?: boolean;
}) => Drawing;
export declare function drawProjection(shape: AnyShape, projectionCamera?: ProjectionPlane | ProjectionCamera): {
    visible: Drawing;
    hidden: Drawing;
};
export declare function drawSingleCircle(radius: number): Drawing;
export declare function drawSingleEllipse(majorRadius: number, minorRadius: number): Drawing;
export declare function drawText(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Drawing;
export declare class Edge extends _1DShape<TopoDS_Edge> {
}
export declare function exportSTEP(shapes?: ShapeConfig[], { unit, modelUnit }?: {
    unit?: SupportedUnit;
    modelUnit?: SupportedUnit;
}): Blob;
export declare interface ExtrusionProfile {
    profile?: "s-curve" | "linear";
    endFactor?: number;
}
export declare class Face extends Shape<TopoDS_Face> {
    get surface(): Surface;
    get orientation(): "forward" | "backward";
    get geomType(): SurfaceType;
    get UVBounds(): {
        uMin: number;
        uMax: number;
        vMin: number;
        vMax: number;
    };
    pointOnSurface(u: number, v: number): Vector;
    normalAt(locationVector?: Point): Vector;
    get center(): Vector;
    outerWire(): Wire;
    innerWires(): Wire[];
    triangulation(index0?: number): FaceTriangulation | null;
}
declare type FaceOrEdge = Face | Edge;
export declare class FaceSketcher extends BaseSketcher2d implements GenericSketcher<Sketch> {
    constructor(face: Face, origin?: Point2D);
    done(): Sketch;
    close(): Sketch;
    closeWithMirror(): Sketch;
    closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Sketch;
}
export declare interface FaceTriangulation {
    vertices: number[];
    trianglesIndexes: number[];
    verticesNormals: number[];
}
export declare type FilletRadius = number | [
    number,
    number
];
export declare type FilterFcn<Type> = {
    element: Type;
    normal: Vector | null;
};
declare abstract class Finder<Type, FilterType> {
    abstract shouldKeep(t: Type): boolean;
    constructor();
    delete(): void;
    and(findersList: ((f: this) => this)[]): this;
    not(finderFun: (f: this) => this): this;
    either(findersList: ((f: this) => this)[]): this;
    find(shape: FilterType, options: {
        unique: true;
    }): Type;
    find(shape: FilterType): Type[];
    find(shape: FilterType, options: {
        unique?: false;
    }): Type[];
}
declare abstract class Finder3d<Type extends FaceOrEdge> extends Finder<Type, AnyShape> {
    when(filter: (filter: FilterFcn<Type>) => boolean): this;
    inList(elementList: Type[]): this;
    atAngleWith(direction?: Direction_2 | Point, angle?: number): this;
    atDistance(distance: number, point?: Point): this;
    containsPoint(point: Point): this;
    withinDistance(distance: number, point?: Point): this;
    inBox(corner1: Point, corner2: Point): this;
    inShape(shape: AnyShape): this;
}
export declare const fuse2D: (first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null;
export declare const fuseBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;
export declare const GCWithObject: (obj: any) => <Type extends Deletable>(value: Type) => Type;
export declare const GCWithScope: () => <Type extends Deletable>(value: Type) => Type;
export declare interface GenericSketcher<ReturnType> {
    movePointerTo(point: Point2D): this;
    lineTo(point: Point2D): this;
    line(xDist: number, yDist: number): this;
    vLine(distance: number): this;
    hLine(distance: number): this;
    vLineTo(yPos: number): this;
    hLineTo(xPos: number): this;
    polarLineTo([r, theta]: [
        number,
        number
    ]): this;
    polarLine(r: number, theta: number): this;
    tangentLine(distance: number): this;
    threePointsArcTo(end: Point2D, innerPoint: Point2D): this;
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
    ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;
    ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;
    halfEllipseTo(end: Point2D, radius: number, sweep: boolean): this;
    halfEllipse(xDist: number, yDist: number, radius: number, sweep: boolean): this;
    bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
    quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;
    cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;
    smoothSplineTo(end: Point2D, config?: SplineConfig): this;
    smoothSpline(xDist: number, yDist: number, splineConfig: SplineConfig): this;
    done(): ReturnType;
    close(): ReturnType;
    closeWithMirror(): ReturnType;
}
export declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode: true): [
    Shape3D,
    Wire,
    Wire
];
export declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode?: false): Shape3D;
export declare interface GenericSweepConfig {
    frenet?: boolean;
    auxiliarySpine?: Wire | Edge;
    law?: null | Handle_Law_Function;
    transitionMode?: "right" | "transformed" | "round";
    withContact?: boolean;
    support?: TopoDS_Shape;
    forceProfileSpineOthogonality?: boolean;
}
declare type GenericTopo = TopoDS_Vertex | TopoDS_Face | TopoDS_Shape | TopoDS_Edge | TopoDS_Wire | TopoDS_Shell | TopoDS_Vertex | TopoDS_Solid | TopoDS_Compound | TopoDS_CompSolid;
export declare const getFont: (fontFamily?: string) => opentype_2.Font;
export declare const getOC: () => OpenCascadeInstance;
export declare const HASH_CODE_MAX = 2147483647;
export declare function importSTEP(STLBlob: Blob): Promise<AnyShape>;
export declare function importSTL(STLBlob: Blob): Promise<AnyShape>;
export declare function intersect2D(first: Shape2D, second: Shape2D): Blueprint | Blueprints | CompoundBlueprint | null;
export declare const intersectBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;
export declare function isPoint(p: unknown): p is Point;
export declare function isProjectionPlane(plane: unknown): plane is ProjectionPlane;
export declare function isShape3D(shape: AnyShape): shape is Shape3D;
export declare function isWire(shape: AnyShape): shape is Wire;
export declare const iterTopo: (shape: TopoDS_Shape, topo: TopoEntity) => IterableIterator<TopoDS_Shape>;
export declare class LinearPhysicalProperties extends PhysicalProperties {
    get length(): number;
}
export declare const loadFont: (fontPath: string, fontFamily?: string) => Promise<opentype_2.Font>;
export declare const localGC: (debug?: boolean) => [
    <T extends Deletable>(v: T) => T,
    () => void,
    Set<Deletable> | undefined
];
export declare const loft: (wires: Wire[], { ruled, startPoint, endPoint }?: LoftConfig, returnShell?: boolean) => Shape3D;
export declare interface LoftConfig {
    ruled?: boolean;
    startPoint?: Point;
    endPoint?: Point;
}
export declare function lookFromPlane(projectionPlane: ProjectionPlane): ProjectionCamera;
export declare const makeAx1: (center: Point, dir: Point) => gp_Ax1;
export declare const makeAx2: (center: Point, dir: Point, xDir?: Point) => gp_Ax2;
export declare const makeAx3: (center: Point, dir: Point, xDir?: Point) => gp_Ax3;
export declare const makeBaseBox: (xLength: number, yLength: number, zLength: number) => Shape3D;
export declare const makeBezierCurve: (points: Point[]) => Edge;
export declare const makeBox: (corner1: Point, corner2: Point) => Solid;
export declare const makeBSplineApproximation: (points: Point[], { tolerance, smoothing, degMax, degMin, }?: BSplineApproximationConfig) => Edge;
export declare const makeCircle: (radius: number, center?: Point, normal?: Point) => Edge;
export declare const makeCompound: (shapeArray: AnyShape[]) => AnyShape;
export declare function makeDirection(p: Direction): Point;
export declare const makeEllipse: (majorRadius: number, minorRadius: number, center?: Point, normal?: Point, xDir?: Point) => Edge;
export declare const makeEllipseArc: (majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, center?: Point, normal?: Point, xDir?: Point) => Edge;
export declare const makeEllipsoid: (aLength: number, bLength: number, cLength: number) => Solid;
export declare const makeHelix: (pitch: number, height: number, radius: number, center?: Point, dir?: Point, lefthand?: boolean) => Wire;
export declare const makeLine: (v1: Point, v2: Point) => Edge;
export declare const makeNewFaceWithinFace: (originFace: Face, wire: Wire) => Face;
export declare const makeNonPlanarFace: (wire: Wire) => Face;
export declare const makePlaneFromFace: (face: Face, originOnSurface?: Point2D) => Plane;
export declare const makePolygon: (points: Point[]) => Face;
export declare function makeProjectedEdges(shape: AnyShape, camera: ProjectionCamera, withHiddenLines?: boolean): {
    visible: Edge[];
    hidden: Edge[];
};
export declare const makeTangentArc: (startPoint: Point, startTgt: Point, endPoint: Point) => Edge;
export declare const makeThreePointArc: (v1: Point, v2: Point, v3: Point) => Edge;
export declare const makeVertex: (point: Point) => Vertex;
export declare function measureArea(shape: Face | Shape3D): number;
export declare function measureDistanceBetween(shape1: AnyShape, shape2: AnyShape): number;
export declare function measureLength(shape: AnyShape): number;
export declare function measureShapeLinearProperties(shape: AnyShape): LinearPhysicalProperties;
export declare function measureShapeSurfaceProperties(shape: Face | Shape3D): SurfacePhysicalProperties;
export declare function measureShapeVolumeProperties(shape: Shape3D): VolumePhysicalProperties;
export declare function measureVolume(shape: Shape3D): number;
declare interface Offset2DConfig {
    lineJoinType?: "miter" | "bevel" | "round";
}
export declare const organiseBlueprints: (blueprints: Blueprint[]) => Blueprints;
declare class PhysicalProperties extends WrappingObj<GProp_GProps> {
    get centerOfMass(): [
        number,
        number,
        number
    ];
}
declare interface PlaneConfig {
    plane?: PlaneName | Plane;
    origin?: Point | number;
}
export declare type PlaneName = "XY" | "YZ" | "ZX" | "XZ" | "YX" | "ZY" | "front" | "back" | "left" | "right" | "top" | "bottom";
export declare type Point = SimplePoint | Vector | [
    number,
    number
] | {
    XYZ: () => gp_XYZ;
    delete: () => void;
};
export declare type Point2D = [
    number,
    number
];
export declare const polysidesBlueprint: (radius: number, sidesCount: number, sagitta?: number) => Blueprint;
export declare class ProjectionCamera extends WrappingObj<gp_Ax2> {
    constructor(position?: Point, direction?: Point, xAxis?: Point);
    get position(): Vector;
    get direction(): Vector;
    get xAxis(): Vector;
    get yAxis(): Vector;
    autoAxes(): void;
    setPosition(position: Point): this;
    setXAxis(xAxis: Point): this;
    setYAxis(yAxis: Point): this;
    lookAt(shape: {
        boundingBox: BoundingBox;
    } | Point): this;
}
export declare type ProjectionPlane = "XY" | "XZ" | "YZ" | "YX" | "ZX" | "ZY" | "front" | "back" | "top" | "bottom" | "left" | "right";
export declare const RAD2DEG: number;
export declare type RadiusConfig<R = number> = ((e: Edge) => R | null) | R | {
    filter: EdgeFinder;
    radius: R;
    keep?: boolean;
};
export declare const roundedRectangleBlueprint: (width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}) => Blueprint;
export declare type ScaleMode = "original" | "bounds" | "native";
export declare const setOC: (oc: OpenCascadeInstance) => void;
export declare type Shape2D = Blueprint | Blueprints | CompoundBlueprint | null;
export declare type Shape3D = Shell | Solid | CompSolid | Compound;
declare type ShapeConfig = {
    shape: AnyShape;
    color?: string;
    alpha?: number;
    name?: string;
};
export declare interface ShapeMesh {
    triangles: number[];
    vertices: number[];
    normals: number[];
    faceGroups: {
        start: number;
        count: number;
        faceId: number;
    }[];
}
export declare const shapeType: (shape: TopoDS_Shape) => TopAbs_ShapeEnum;
export declare type SimplePoint = [
    number,
    number,
    number
];
export declare const sketchEllipse: (xRadius?: number, yRadius?: number, planeConfig?: PlaneConfig) => Sketch;
export declare class Sketches {
    sketches: Array<Sketch | CompoundSketch>;
    constructor(sketches: Array<Sketch | CompoundSketch>);
    wires(): AnyShape;
    faces(): AnyShape;
    extrude(extrusionDistance: number, extrusionConfig?: {
        extrusionDirection?: Point;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: Point;
    }): Shape3D;
    revolve(revolutionAxis?: Point, config?: {
        origin?: Point;
    }): Shape3D;
}
export declare const sketchFaceOffset: (face: Face, offset: number) => Sketch;
export declare const sketchHelix: (pitch: number, height: number, radius: number, center?: Point, dir?: Point, lefthand?: boolean) => Sketch;
export declare interface SketchInterface {
    face(): Face;
    revolve(revolutionAxis?: Point, config?: {
        origin?: Point;
    }): Shape3D;
    extrude(extrusionDistance: number, extrusionConfig?: {
        extrusionDirection?: Point;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: Point;
    }): Shape3D;
    loftWith(otherSketches: this | this[], loftConfig: LoftConfig, returnShell?: boolean): Shape3D;
}
export declare const sketchParametricFunction: (func: (t: number) => Point2D, planeConfig?: PlaneConfig, { pointsCount, start, stop }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Sketch;
export declare const sketchPolysides: (radius: number, sidesCount: number, sagitta?: number, planeConfig?: PlaneConfig) => Sketch;
export declare const sketchRoundedRectangle: (width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}, planeConfig?: PlaneConfig) => Sketch;
export declare function sketchText(text: string, textConfig?: {
    startX?: number;
    startY?: number;
    fontSize?: number;
    fontFamily?: "string";
}, planeConfig?: {
    plane?: PlaneName | Plane;
    origin?: Point | number;
}): Sketches;
export declare class Solid extends _3DShape<TopoDS_Solid> {
}
export declare type SplineConfig = SplineTangent | {
    endTangent?: SplineTangent;
    startTangent?: StartSplineTangent;
    startFactor?: number;
    endFactor?: number;
};
declare type SplineTangent = StartSplineTangent | "symmetric";
declare type StandardPlane = "XY" | "XZ" | "YZ";
declare type StartSplineTangent = number | Point2D;
export declare type SupportedUnit = "M" | "CM" | "MM" | "INCH" | "FT" | "m" | "mm" | "cm" | "inch" | "ft";
export declare const supportExtrude: (wire: Wire, center: Point, normal: Point, support: TopoDS_Shape) => Shape3D;
export declare class Surface extends WrappingObj<Adaptor3d_Surface> {
    get surfaceType(): SurfaceType;
}
export declare class SurfacePhysicalProperties extends PhysicalProperties {
    get area(): number;
}
export declare type SurfaceType = "PLANE" | "CYLINDRE" | "CONE" | "SPHERE" | "TORUS" | "BEZIER_SURFACE" | "BSPLINE_SURFACE" | "REVOLUTION_SURFACE" | "EXTRUSION_SURFACE" | "OFFSET_SURFACE" | "OTHER_SURFACE";
export declare function textBlueprints(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Blueprints;
declare type TopoEntity = "vertex" | "edge" | "wire" | "face" | "shell" | "solid" | "solidCompound" | "compound" | "shape";
export declare class Transformation extends WrappingObj<gp_Trsf> {
    constructor(transform?: gp_Trsf);
    translate(xDist: number, yDist: number, zDist: number): Transformation;
    translate(vector: Point): Transformation;
    rotate(angle: number, position?: Point, direction?: Point): Transformation;
    mirror(inputPlane?: Plane | PlaneName | Point, inputOrigin?: Point): this;
    scale(center: Point, scale: number): this;
    coordSystemChange(fromSystem: CoordSystem, toSystem: CoordSystem): this;
    transformPoint(point: Point): gp_Pnt;
    transform(shape: TopoDS_Shape): TopoDS_Shape;
}
export declare function twistExtrude(wire: Wire, angleDegrees: number, center: Point, normal: Point, profileShape?: ExtrusionProfile, shellMode?: false): Shape3D;
export declare function twistExtrude(wire: Wire, angleDegrees: number, center: Point, normal: Point, profileShape: ExtrusionProfile | undefined, shellMode: true): [
    Shape3D,
    Wire,
    Wire
];
declare type UVBounds = {
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
};
export declare class Vertex extends Shape<TopoDS_Vertex> {
    asTuple(): [
        number,
        number,
        number
    ];
}
export declare class VolumePhysicalProperties extends PhysicalProperties {
    get volume(): number;
}
export declare function weldShellsAndFaces(facesOrShells: Array<Face | Shell>, ignoreType?: boolean): Shell;
export declare class Wire extends _1DShape<TopoDS_Wire> {
    offset2D(offset: number, kind?: "arc" | "intersection" | "tangent"): Wire;
}
export declare class WrappingObj<Type extends Deletable> {
    constructor(wrapped: Type);
    get wrapped(): Type;
    set wrapped(newWrapped: Type);
    delete(): void;
}