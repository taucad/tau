export declare function translate(shape: TopoDS_Shape, vector: Point): TopoDS_Shape;
/**
 * Creates a drawing pen to programatically draw in 2D.
 *
 * @category Drawing
 */
export declare function draw(initialPoint?: Point2D): DrawingPen;
/**
 * Creates the `Drawing` of a circle.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
export declare function drawCircle(radius: number): Drawing;
/**
 * Creates the `Drawing` of a rectangle with (optional) rounded corners.
 *
 * The rectangle is centered on [0, 0]
 *
 * @category Drawing
 */
export declare function drawRoundedRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Drawing;
/**
 * With an EdgeFinder you can apply a set of filters to find specific edges
 * within a shape.
 *
 * @category Finders
 */
export declare class EdgeFinder extends Finder3d<Edge> {
    clone(): EdgeFinder;
    /**
     * Filter to find edges that are in a certain direction
     *
     * @category Filter
     */
    inDirection(direction: Direction_2 | Point): this;
    /**
     * Filter to find edges of a certain length
     *
     * @category Filter
     */
    ofLength(length: number | ((l: number) => boolean)): this;
    /**
     * Filter to find edges that are of a cetain curve type.
     *
     * @category Filter
     */
    ofCurveType(curveType: CurveType): this;
    /**
     * Filter to find edges that are parallel to a plane.
     *
     * Note that this will work only in lines (but the method does not
     * check this assumption).
     *
     * @category Filter
     */
    parallelTo(plane: Plane | StandardPlane | Face): this;
    /**
     * Filter to find edges that within a plane.
     *
     * Note that this will work only in lines (but the method does not
     * check this assumption).
     *
     * @category Filter
     */
    inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;
    shouldKeep(element: Edge): boolean;
}
export declare function makePlane(plane: Plane): Plane;
export declare function makePlane(plane?: PlaneName, origin?: Point | number): Plane;
/**
 * With a FaceFinder you can apply a set of filters to find specific faces
 * within a shape.
 *
 * @category Finders
 */
export declare class FaceFinder extends Finder3d<Face> {
    clone(): FaceFinder;
    /** Filter to find faces that are parallel to plane or another face
     *
     * Note that this will work only in planar faces (but the method does not
     * check this assumption).
     *
     * @category Filter
     */
    parallelTo(plane: Plane | StandardPlane | Face): this;
    /**
     * Filter to find faces that are of a cetain surface type.
     *
     * @category Filter
     */
    ofSurfaceType(surfaceType: SurfaceType): this;
    /** Filter to find faces that are contained in a plane.
     *
     * Note that this will work only in planar faces (but the method does not
     * check this assumption).
     *
     * @category Filter
     */
    inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;
    shouldKeep(element: Face): boolean;
}
export declare function rotate(shape: TopoDS_Shape, angle: number, position?: Point, direction?: Point): TopoDS_Shape;
export declare const drawRectangle: typeof drawRoundedRectangle;
/**
 * Creates the `Sketch` of a rectangle in a defined plane
 *
 * @category Sketching
 */
export declare const sketchRectangle: (xLength: number, yLength: number, planeConfig?: PlaneConfig) => Sketch;
export declare const assembleWire: (listOfEdges: (Edge | Wire)[]) => Wire;
/**
 * Creates the `Drawing` of an polygon in a defined plane
 *
 * The sides of the polygon can be arcs of circle with a defined sagitta.
 * The radius defines the out radius of the polygon without sagitta
 *
 * @category Drawing
 */
export declare function drawPolysides(radius: number, sidesCount: number, sagitta?: number): Drawing;
export declare const makeFace: (wire: Wire, holes?: Wire[]) => Face;
/**
 * Creates the `Sketch` of a circle in a defined plane
 *
 * @category Sketching
 */
export declare const sketchCircle: (radius: number, planeConfig?: PlaneConfig) => Sketch;
/** Welds faces and shells into a single shell and then makes a solid.
 *
 * @param facesOrShells - An array of faces and shells to be welded.
 * @returns A solid that contains all the faces and shells.
 **/
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
/**
 * The FaceSketcher allows you to sketch on a plane.
 *
 * @category Sketching
 */
export declare class Sketcher implements GenericSketcher<Sketch> {
    /**
     * The sketcher can be defined by a plane, or a simple plane definition,
     * with either a point of origin, or the position on the normal axis from
     * the coordinates origin
     */
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
/**
 * Creates the `Drawing` of parametric function
 *
 * The drawing will be a spline approximating the function. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
export declare const drawParametricFunction: (func: (t: number) => Point2D, { pointsCount, start, stop }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Drawing;
export declare const makeCylinder: (radius: number, height: number, location?: Point, direction?: Point) => Solid;
/**
 * Helper function to compute the inner radius of a polyside (even if a sagitta
 * is defined
 */
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
    /**
     * Simplifies the shape by removing unnecessary edges and faces
     */
    simplify(): this;
    /**
     * Translates the shape of an arbitrary vector
     *
     * @category Shape Transformations
     */
    translate(xDist: number, yDist: number, zDist: number): this;
    translate(vector: Point): this;
    /**
     * Translates the shape on the X axis
     *
     * @category Shape Transformations
     */
    translateX(distance: number): this;
    /**
     * Translates the shape on the Y axis
     *
     * @category Shape Transformations
     */
    translateY(distance: number): this;
    /**
     * Translates the shape on the Z axis
     *
     * @category Shape Transformations
     */
    translateZ(distance: number): this;
    /**
     * Rotates the shape
     *
     * @category Shape Transformations
     */
    rotate(angle: number, position?: Point, direction?: Point): this;
    /**
     * Mirrors the shape through a plane
     *
     * @category Shape Transformations
     */
    mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): this;
    /**
     * Returns a scaled version of the shape
     *
     * @category Shape Transformations
     */
    scale(scale: number, center?: Point): this;
    get edges(): Edge[];
    get faces(): Face[];
    get wires(): Wire[];
    get boundingBox(): BoundingBox;
    /**
     * Exports the current shape as a set of triangle. These can be used by threejs
     * for instance to represent the the shape
     *
     * @category Shape Export
     */
    mesh({ tolerance, angularTolerance }?: {
        tolerance?: number | undefined;
        angularTolerance?: number | undefined;
    }): ShapeMesh;
    /**
     * Exports the current shape as a set of lines. These can be used by threejs
     * for instance to represent the edges of the shape
     *
     * @category Shape Export
     */
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
    /**
     * Exports the current shape as a STEP file as a Blob
     *
     * @category Shape Export
     */
    blobSTEP(): Blob;
    /**
     * Exports the current shape as a STL file as a Blob
     *
     * In order to create a STL file, the shape needs to be meshed. The
     * tolerances correspond to the values used to mesh the shape.
     *
     * @category Shape Export
     */
    blobSTL({ tolerance, angularTolerance, binary, }?: {
        tolerance?: number | undefined;
        angularTolerance?: number | undefined;
        binary?: boolean | undefined;
    }): Blob;
}
/**
 * A line drawing to be acted upon. It defines directions to be acted upon by
 * definition (extrusion direction for instance).
 *
 * Note that all operations will delete the sketch
 *
 * @category Sketching
 */
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
    /**
     * Transforms the lines into a face. The lines should be closed.
     */
    face(): Face;
    wires(): Wire;
    faces(): Face;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: Point, { origin }?: {
        origin?: Point;
    }): Shape3D;
    /** Extrudes the sketch to a certain distance.(along the default direction
     * and origin of the sketch).
     *
     * You can define another extrusion direction or origin,
     *
     * It is also possible to twist extrude with an angle (in degrees), or to
     * give a profile to the extrusion (the endFactor will scale the face, and
     * the profile will define how the scale is applied (either linarly or with
     * a s-shape).
     */
    extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
        extrusionDirection?: Point;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: Point;
    }): Shape3D;
    /**
     * Sweep along this sketch another sketch defined in the function
     * `sketchOnPlane`.
     *
     * TODO: clean the interface of the sweep config to make it more
     * understandable.
     */
    sweepSketch(sketchOnPlane: (plane: Plane, origin: Point) => this, sweepConfig?: GenericSweepConfig): Shape3D;
    /** Loft between this sketch and another sketch (or an array of them)
     *
     * You can also define a `startPoint` for the loft (that will be placed
     * before this sketch) and an `endPoint` after the last one.
     *
     * You can also define if you want the loft to result in a ruled surface.
     *
     * Note that all sketches will be deleted by this operation
     */
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
    /**
     * Builds a new shape out of the two, fused, shapes
     *
     * @category Shape Modifications
     */
    fuse(other: Shape3D, { optimisation, }?: {
        optimisation?: "none" | "commonFace" | "sameFace";
    }): Shape3D;
    /**
     * Builds a new shape by removing the tool tape from this shape
     *
     * @category Shape Modifications
     */
    cut(tool: Shape3D, { optimisation, }?: {
        optimisation?: "none" | "commonFace" | "sameFace";
    }): Shape3D;
    /**
     * Builds a new shape by intersecting this shape and another
     *
     * @category Shape Modifications
     */
    intersect(tool: AnyShape): AnyShape;
    /**
     * Hollows out the current shape, removing the faces found by the `filter` and
     * keeping a border of `thickness`
     *
     * @category Shape Modifications
     */
    shell(config: {
        filter: FaceFinder;
        thickness: number;
    }, tolerance?: number): Shape3D;
    shell(thickness: number, finderFcn: (f: FaceFinder) => FaceFinder, tolerance?: number): Shape3D;
    /**
     * Creates a new shapes with some edges filletted, as specified in the
     * radius config.
     *
     * If the radius is a filter finder object (with an EdgeFinder as filter,
     * and a radius to specifiy the fillet radius), the fillet will only be
     * applied to the edges as selected by the finder. The finder will be
     * deleted unless it is explicitly specified to `keep` it.
     *
     * If the radius is a number all the edges will be filletted.
     *
     * If the radius is a function edges will be filletted according to the
     * value returned by the function (0 or null will not add any fillet).
     *
     * @category Shape Modifications
     */
    fillet(radiusConfig: RadiusConfig, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;
    /**
     * Creates a new shapes with some edges chamfered, as specified in the
     * radius config.
     *
     * If the radius is a filter finder object (with an EdgeFinder as filter,
     * and a radius to specifiy the chamfer radius), the fillet will only be
     * applied to the edges as selected by the finder. The finder will be
     * deleted unless it is explicitly specified to `keep` it.
     *
     * If the radius is a number all the edges will be chamfered.
     *
     * If the radius is a function edges will be chamfered according to the
     * value returned by the function (0 or null will not add any chamfer).
     *
     * @category Shape Modifications
     */
    chamfer(radiusConfig: RadiusConfig, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;
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
    /**
     * Changes the corner between the previous and next segments.
     */
    customCorner(radius: number, mode?: "fillet" | "chamfer"): this;
}
export declare const basicFaceExtrusion: (face: Face, extrusionVec: Vector) => Solid;
/**
 * A Blueprint is an abstract Sketch, a 2D set of curves that can then be
 * sketched on different surfaces (faces or planes)
 *
 * You should create them by "sketching" with a `BlueprintSketcher`
 */
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
    /**
     * Stop drawing, make sure the sketch is closed (by adding a straight line to
     * from the last point to the first), add a fillet between the last and the
     * first segments and returns the sketch.
     */
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
/**
 * Combine a set of finder filters (defined with radius) to pass as a filter
 * function.
 *
 * It returns the filter, as well as a cleanup function.
 */
export declare const combineFinderFilters: <Type, T>(filters: {
    filter: Finder<Type, T>;
    radius: number;
}[]) => [
    (v: Type) => number,
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
/**
 * A group of sketches that should correspond to a unique face (i.e. an outer
 * sketch, and multiple holes within this sketch.
 *
 * All the sketches should share the same base face (or surface)
 *
 * Ideally generated from a `CompoundBlueprint`
 */
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
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
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
    /**
     * Filter to find corner that have their point are in the list.
     *
     * @category Filter
     */
    inList(elementList: Point2D[]): this;
    /**
     * Filter to find elements that are at a specified distance from a point.
     *
     * @category Filter
     */
    atDistance(distance: number, point?: Point2D): this;
    /**
     * Filter to find elements that contain a certain point
     *
     * @category Filter
     */
    atPoint(point: Point2D): this;
    /**
     * Filter to find elements that are within a box
     *
     * @category Filter
     */
    inBox(corner1: Point2D, corner2: Point2D): this;
    /**
     * Filter to find corner that a certain angle between them - only between
     * 0 and 180.
     *
     * @category Filter
     */
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
/**
 * Creates the `Drawing` of an ellipse.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
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
    /**
     * Builds a new drawing by cuting another drawing into this one
     *
     * @category Drawing Modifications
     */
    cut(other: Drawing): Drawing;
    /**
     * Builds a new drawing by merging another drawing into this one
     *
     * @category Drawing Modifications
     */
    fuse(other: Drawing): Drawing;
    /**
     * Builds a new drawing by intersection this drawing with another
     *
     * @category Drawing Modifications
     */
    intersect(other: Drawing): Drawing;
    /**
     * Creates a new drawing with some corners filletted, as specified by the
     * radius and the corner finder function
     *
     * @category Drawing Modifications
     */
    fillet(radius: number, filter?: (c: CornerFinder) => CornerFinder): Drawing;
    /**
     * Creates a new drawing with some corners filletted, as specified by the
     * radius and the corner finder function
     *
     * @category Drawing Modifications
     */
    chamfer(radius: number, filter?: (c: CornerFinder) => CornerFinder): Drawing;
    sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
    sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
    sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;
    toSVG(margin?: number): string;
    toSVGViewBox(margin?: number): string;
    toSVGPaths(): string[] | string[][];
    offset(distance: number): Drawing;
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
    /**
     * Returns the mirror image of this drawing made with a single point (in
     * center mode, the default, or a plane, (plane mode, with both direction and
     * origin of the plane).
     */
    mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): DrawingInterface;
    /**
     * Returns the sketched version of the drawing, on a plane
     */
    sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
    sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
    sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): SketchInterface | Sketches;
    /**
     * Returns the sketched version of the drawing, on a face.
     *
     * The scale mode corresponds to the way the coordinates of the drawing are
     * interpreted match with the face:
     *
     * - `original` uses global coordinates (1mm in the drawing is 1mm on the
     *   face). This is the default, but currently supported only for planar
     *   and circular faces
     * - `bounds` normalises the UV parameters on the face to [0,1] intervals.
     * - `native` uses the default UV parameters of opencascade
     */
    sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;
    /**
     * Formats the drawing as an SVG image
     */
    toSVG(margin: number): string;
    /**
     * Returns the SVG viewbox that corresponds to this drawing
     */
    toSVGViewBox(margin?: number): string;
    /**
     * Formats the drawing as a list of SVG paths
     */
    toSVGPaths(): string[] | string[][];
}
export declare class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing> {
    constructor(origin?: Point2D);
    done(): Drawing;
    close(): Drawing;
    closeWithMirror(): Drawing;
    /**
     * Stop drawing, make sure the sketch is closed (by adding a straight line to
     * from the last point to the first), change the corner between the last and the
     * first segments and returns the sketch.
     */
    closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Drawing;
}
/**
 * Creates the `Drawing` by interpolating points as a curve
 *
 * The drawing will be a spline approximating the points. Note that the
 * degree should be at maximum 3 if you need to export the drawing as an SVG.
 *
 * @category Drawing
 */
export declare const drawPointsInterpolation: (points: Point2D[], approximationConfig?: BSplineApproximationConfig) => Drawing;
export declare function drawProjection(shape: AnyShape, projectionCamera?: ProjectionPlane | ProjectionCamera): {
    visible: Drawing;
    hidden: Drawing;
};
/**
 * Creates the `Drawing` of a circle as one single curve.
 *
 * The circle is centered on [0, 0]
 *
 * @category Drawing
 */
export declare function drawSingleCircle(radius: number): Drawing;
/**
 * Creates the `Drawing` of an ellipse as one single curve.
 *
 * The ellipse is centered on [0, 0], with axes aligned with the coordinates.
 *
 * @category Drawing
 */
export declare function drawSingleEllipse(majorRadius: number, minorRadius: number): Drawing;
/**
 * Creates the `Drawing` of a text, in a defined font size and a font familiy
 * (which will be the default).
 *
 * @category Drawing
 */
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
/**
 * The FaceSketcher allows you to sketch on a face that is not planar, for
 * instance the sides of a cylinder.
 *
 * The coordinates passed to the methods corresponds to normalised distances on
 * this surface, between 0 and 1 in both direction.
 *
 * Note that if you are drawing on a closed surface (typically a revolution
 * surface or a cylinder), the first parameters represents the angle and can be
 * smaller than 0 or bigger than 1.
 *
 * @category Sketching
 */
export declare class FaceSketcher extends BaseSketcher2d implements GenericSketcher<Sketch> {
    constructor(face: Face, origin?: Point2D);
    done(): Sketch;
    close(): Sketch;
    closeWithMirror(): Sketch;
    /**
     * Stop drawing, make sure the sketch is closed (by adding a straight line to
     * from the last point to the first), add a fillet between the last and the
     * first segments and returns the sketch.
     */
    closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Sketch;
}
export declare interface FaceTriangulation {
    vertices: number[];
    trianglesIndexes: number[];
    verticesNormals: number[];
}
export declare type FilterFcn<Type> = {
    element: Type;
    normal: Vector | null;
};
declare abstract class Finder<Type, FilterType> {
    /**
     * Check if a particular element should be filtered or not according to the
     * current finder
     */
    abstract shouldKeep(t: Type): boolean;
    constructor();
    delete(): void;
    /**
     * Combine logically a set of filter with an AND operation.
     *
     * You need to pass an array of functions that take a finder as a argument
     * and return the same finder with some filters applied to it.
     *
     * Note that by default filters are applied with and AND operation, but in
     * some case you might want to create them dynamically and use this method.
     *
     * @category Filter Combination
     */
    and(findersList: ((f: this) => this)[]): this;
    /**
     * Invert the result of a particular finder
     *
     * You need to pass a function that take a finder as a argument
     * and return the same finder with some filters applied to it.
     *
     * @category Filter Combination
     */
    not(finderFun: (f: this) => this): this;
    /**
     * Combine logically a set of filter with an OR operation.
     *
     * You need to pass an array of functions that take a finder as a argument
     * and return the same finder with some filters applied to it.
     *
     * @category Filter Combination
     */
    either(findersList: ((f: this) => this)[]): this;
    /**
     * Returns all the elements that fit the set of filters defined on this
     * finder
     *
     * If unique is configured as an option it will either return the unique
     * element found or throw an error.
     */
    find(shape: FilterType, options: {
        unique: true;
    }): Type;
    find(shape: FilterType): Type[];
    find(shape: FilterType, options: {
        unique?: false;
    }): Type[];
}
declare abstract class Finder3d<Type extends FaceOrEdge> extends Finder<Type, AnyShape> {
    /**
     * Filter to find elements following a custom function.
     *
     * @category Filter
     */
    when(filter: (filter: FilterFcn<Type>) => boolean): this;
    /**
     * Filter to find elements that are in the list.
     *
     * This deletes the elements in the list as the filter deletion.
     *
     * @category Filter
     */
    inList(elementList: Type[]): this;
    /**
     * Filter to find elements that are at a specified angle (in degrees) with
     * a direction.
     *
     * The element direction corresponds to its normal in the case of a face.
     *
     * @category Filter
     */
    atAngleWith(direction?: Direction_2 | Point, angle?: number): this;
    /**
     * Filter to find elements that are at a specified distance from a point.
     *
     * @category Filter
     */
    atDistance(distance: number, point?: Point): this;
    /**
     * Filter to find elements that contain a certain point
     *
     * @category Filter
     */
    containsPoint(point: Point): this;
    /**
     * Filter to find elements that are within a certain distance from a point.
     *
     * @category Filter
     */
    withinDistance(distance: number, point?: Point): this;
    /**
     * Filter to find elements that are within a box
     *
     * The elements that are not fully contained in the box are also found.
     *
     * @category Filter
     */
    inBox(corner1: Point, corner2: Point): this;
    /**
     * Filter to find elements that are within a generic shape
     *
     * The elements that are not fully contained in the shape are also found.
     *
     * @category Filter
     */
    inShape(shape: AnyShape): this;
}
export declare const fuse2D: (first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null;
export declare const fuseBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;
export declare const GCWithObject: (obj: any) => <Type extends Deletable>(value: Type) => Type;
export declare const GCWithScope: () => <Type extends Deletable>(value: Type) => Type;
/**
 * Sketchers allow the user to draw a two dimentional shape using segment of
 * curve. You start by defining where you sketch will start (with the method
 * `movePointerTo`.
 * Each sketching method corresponds to drawing a curve of some type (line,
 * arc, elliptic arc, bezier curve to a new point. The next segment will start
 * from the end point of the previous segment.
 * Once you end your sketch you will receive a `Sketch` object that allows you
 * to give some three dimentionlity to your finished sketch.
 *
 * @category Sketching
 */
export declare interface GenericSketcher<ReturnType> {
    /**
     * Changes the point to start your drawing from
     */
    movePointerTo(point: Point2D): this;
    /**
     * Draws a line from the current point to the point given in argument
     *
     * @category Line Segment
     */
    lineTo(point: Point2D): this;
    /**
     * Draws a line at the horizontal distance xDist and the vertical distance
     * yDist of the current point
     *
     * @category Line Segment
     */
    line(xDist: number, yDist: number): this;
    /**
     * Draws a vertical line of length distance from the current point
     *
     * @category Line Segment
     */
    vLine(distance: number): this;
    /**
     * Draws an horizontal line of length distance from the current point
     *
     * @category Line Segment
     */
    hLine(distance: number): this;
    /**
     * Draws a vertical line to the y coordinate
     *
     * @category Line Segment
     */
    vLineTo(yPos: number): this;
    /**
     * Draws an horizontal line to the x coordinate
     *
     * @category Line Segment
     */
    hLineTo(xPos: number): this;
    /**
     * Draws a line from the current point to the point defined in polar
     * coordiates, of radius r and angle theta (in degrees) from the origin
     *
     * @category Line Segment
     */
    polarLineTo([r, theta]: [
        number,
        number
    ]): this;
    /**
     * Draws a line from the current point to the point defined in polar
     * coordiates, of radius r and angle theta (in degrees) from the current
     * point
     *
     * @category Line Segment
     */
    polarLine(r: number, theta: number): this;
    /**
     * Draws a line from the current point as a tangent to the previous part of
     * curve drawn. The distance defines how long the line will be.
     *
     * @category Line Segment
     */
    tangentLine(distance: number): this;
    /** Draws an arc of circle by defining its end point and a third point
     * through which the arc will pass.
     *
     * @category Arc Segment
     */
    threePointsArcTo(end: Point2D, innerPoint: Point2D): this;
    /** Draws an arc of circle by defining its end point and a third point
     * through which the arc will pass. Both poinats are defined in horizontal
     * (x) and vertical (y) distances from the start point.
     *
     * @category Arc Segment
     */
    threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;
    /** Draws an arc of circle by defining its end point and the sagitta - the
     * maximum distance between the arc and the straight line going from start to
     * end point.
     *
     * @category Arc Segment
     */
    sagittaArcTo(end: Point2D, sagitta: number): this;
    /** Draws an arc of circle by defining its end point and the sagitta - the
     * maximum distance between the arc and the straight line going from start to
     * end point.The end point is defined by its horizontal and vertical
     * distances from the start point.
     *
     * @category Arc Segment
     */
    sagittaArc(xDist: number, yDist: number, sagitta: number): this;
    /** Draws a vertical arc of circle by defining its end point and the sagitta
     * - the maximum distance between the arc and the straight line going from
     * start to end point.The end point is defined by its  vertical distance from
     * the start point.
     *
     * @category Arc Segment
     */
    vSagittaArc(distance: number, sagitta: number): this;
    /** Draws an horizontal arc of circle by defining its end point and the
     * sagitta - the maximum distance between the arc and the straight line going
     * from start to end point.The end point is defined by its horizontal
     * distance from the start point.
     *
     * @category Arc Segment
     */
    hSagittaArc(distance: number, sagitta: number): this;
    /** Draws an arc of circle by defining its end point and the bulge - the
     * maximum distance between the arc and the straight line going from start to
     * end point.
     *
     * @category Arc Segment
     */
    bulgeArcTo(end: Point2D, bulge: number): this;
    /** Draws an arc of circle by defining its end point and the bulge - the
     * maximum distance between the arc and the straight line going from start to
     * end point in units of half the chord. The end point is defined by its horizontal and vertical distances
     * from the start point.
     *
     * @category Arc Segment
     */
    bulgeArc(xDist: number, yDist: number, bulge: number): this;
    /** Draws a vertical arc of circle by defining its end point and the bulge
     * - the maximum distance between the arc and the straight line going from
     * start to end point in units of half the chord. The end point is defined by its  vertical distance from
     * the start point.
     *
     * @category Arc Segment
     */
    vBulgeArc(distance: number, bulge: number): this;
    /** Draws an horizontal arc of circle by defining its end point and the bulge
     * - the maximum distance between the arc and the straight line going from
     * start to end point in units of half the chord. The end point is defined by
     * its horizontal distance from the start point.
     *
     * @category Arc Segment
     */
    hBulgeArc(distance: number, bulge: number): this;
    /**
     * Draws an arc of circle from the current point as a tangent to the previous
     * part of curve drawn.
     *
     * @category Arc Segment
     */
    tangentArcTo(end: Point2D): this;
    /**
     * Draws an arc of circle from the current point as a tangent to the previous
     * part of curve drawn.The end point is defined by its horizontal and vertical
     * distances from the start point.
     *
     * @category Arc Segment
     */
    tangentArc(xDist: number, yDist: number): this;
    /**
     * Draws an arc of ellipse by defining its end point and an ellipse.
     *
     * The  shape of the ellipse is defined by both its radiuses, its angle
     * relative to the current coordinat system, as well as the long and sweep
     * flags (as defined for SVG paths)
     *
     * @category Ellipse Arc Segment
     */
    ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;
    /**
     * Draws an arc of ellipse by defining its end point and an ellipse. The end
     * point is defined by distances from he start point.
     *
     * The  shape of the ellipse is defined by both its radiuses, its angle
     * relative to the current coordinat system, as well as the long and sweep
     * flags (as defined for SVG paths)
     *
     * @category Ellipse Arc Segment
     */
    ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;
    /**
     * Draws an arc as half an ellipse, defined by the sagitta of the ellipse
     * (which corresponds to the radius in the axe orthogonal to the straight
     * line).
     *
     * The sweep flag is to be understood as defined for SVG paths.
     *
     * @category Ellipse Arc Segment
     */
    halfEllipseTo(end: Point2D, radius: number, sweep: boolean): this;
    /**
     * Draws an arc as half an ellipse, defined by the sagitta of the ellipse
     * (which corresponds to the radius in the axe orthogonal to the straight
     * line).The end point is defined by distances from he start point.
     *
     * The sweep flag is to be understood as defined for SVG paths.
     *
     * @category Ellipse Arc Segment
     */
    halfEllipse(xDist: number, yDist: number, radius: number, sweep: boolean): this;
    /** Draws a generic bezier curve to the end point, going using a set of
     * control points.
     *
     * This is the generic definition of a bézier curve, you might want to use
     * either the quadratic or cubic (most common) version, unless you know
     * exactly what you are aiming at.
     *
     * @category Bezier Curve
     */
    bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
    /** Draws a quadratic bezier curve to the end point, using the single control
     * point.
     *
     * @category Bezier Curve
     */
    quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;
    /** Draws a cubic bezier curve to the end point, using the start  and end
     * control point to define its shape. This corresponds to the most commonly
     * used bezier curve.
     *
     * If you are struggling setting your control points, the smoothSpline might
     * be better for your needs.
     *
     * @category Bezier Curve
     */
    cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;
    /** Draws a cubic bezier curve to the end point, attempting to make the line
     * smooth with the previous segment.
     *
     * It will base its first control point so that its tangent is the same than
     * the previous segment.
     *
     * The control point relative to the end is by default set to be in the
     * direction of the straight line between start and end. You can specifiy the
     * `endSkew` either as an angle (in degrees) to this direction, or as an
     * absolute direction in the coordinate system (a Point).
     *
     * The start- and end- factors decide on how far the control point is from
     * the start and end point. At a factor of 1, the distance corresponds to
     * a quarter of the straight line distance.
     *
     * @category Bezier Curve
     */
    smoothSplineTo(end: Point2D, config?: SplineConfig): this;
    /** Draws a cubic bezier curve to the end point, attempting to make the line
     * smooth with the previous segment. The end point is defined by its distance
     * to the first point.
     *
     * It will base its first control point so that its tangent is the same than
     * the previous segment. You can force another tangent by defining
     * `startTangent`.
     *
     * You can configure the tangent of the end point by configuring the
     * `endTangent`, either as "symmetric" to reproduce the start angle, as an
     * angle from the X axis (in the coordinate system) or a 2d direction (still
     * in the coordinate system.
     *
     * The start- and end- factors decide on how far the control point is from
     * the start and end point. At a factor of 1, the distance corresponds to
     * a quarter of the straight line distance.
     *
     * @category Bezier Curve
     */
    smoothSpline(xDist: number, yDist: number, splineConfig: SplineConfig): this;
    /**
     * Stop drawing and returns the sketch.
     */
    done(): ReturnType;
    /**
     * Stop drawing, make sure the sketch is closed (by adding a straight line to
     * from the last point to the first) and returns the sketch.
     */
    close(): ReturnType;
    /**
     * Stop drawing, make sure the sketch is closed (by mirroring the lines
     * between the first and last points drawn) and returns the sketch.
     */
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
declare type GenericTopo = TopoDS_Face | TopoDS_Shape | TopoDS_Edge | TopoDS_Wire | TopoDS_Shell | TopoDS_Vertex | TopoDS_Solid | TopoDS_Compound | TopoDS_CompSolid;
export declare const getFont: (fontFamily?: string) => opentype_2.Font;
export declare const getOC: () => OpenCascadeInstance;
export declare const HASH_CODE_MAX = 2147483647;
/**
 * Creates a new shapes from a STEP file (as a Blob or a File).
 *
 * @category Import
 */
export declare function importSTEP(STLBlob: Blob): Promise<AnyShape>;
/** Creates a new shapes from a STL file (as a Blob or a File).
 *
 * This process can be relatively long depending on how much tesselation has
 * been done to your STL.
 *
 * This function tries to clean a bit the triangulation of faces, but can fail
 * in bad ways.
 *
 * @category Import
 */
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
/**
 * Import a font in the text system. If the font family is not defined it will
 * set its name as "default"
 *
 * The font should be in TTF
 */
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
/**
 * Measure the area of a shape
 *
 * @category Measure
 */
export declare function measureArea(shape: Face | Shape3D): number;
/**
 * Measure the distance between two shapes
 *
 * @category Measure
 */
export declare function measureDistanceBetween(shape1: AnyShape, shape2: AnyShape): number;
/**
 * Measure the length of a shape
 *
 * @category Measure
 */
export declare function measureLength(shape: AnyShape): number;
export declare function measureShapeLinearProperties(shape: AnyShape): LinearPhysicalProperties;
export declare function measureShapeSurfaceProperties(shape: Face | Shape3D): SurfacePhysicalProperties;
export declare function measureShapeVolumeProperties(shape: Shape3D): VolumePhysicalProperties;
/**
 * Measure the volume of a shape
 *
 * @category Measure
 */
export declare function measureVolume(shape: Shape3D): number;
/**
 * Groups an array of blueprints such that blueprints that correspond to holes
 * in other blueprints are set in a `CompoundBlueprint`.
 *
 * The current algorithm does not handle cases where blueprints cross each
 * other
 */
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
/**
 * A generic way to define radii for fillet or chamfer (the operation)
 *
 * If the radius is a filter finder object (with an EdgeFinder as filter, and
 * a radius to specify the fillet radius), the operation will only be applied
 * to the edges as selected by the finder. The finder will be deleted unless it
 * is explicitly specified to `keep` it.
 *
 * If the radius is a number all the edges will be targetted for the operation.
 *
 * If the radius is a function edges will be filletted or chamfered according
 * to the value returned by the function (0 or null will not add any fillet).
 */
export declare type RadiusConfig = ((e: Edge) => number | null) | number | {
    filter: EdgeFinder;
    radius: number;
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
/**
 * Creates the `Sketch` of an ellispe in a defined plane
 *
 * @category Sketching
 */
export declare const sketchEllipse: (xRadius?: number, yRadius?: number, planeConfig?: PlaneConfig) => Sketch;
export declare class Sketches {
    sketches: Array<Sketch | CompoundSketch>;
    constructor(sketches: Array<Sketch | CompoundSketch>);
    wires(): AnyShape;
    faces(): AnyShape;
    /** Extrudes the sketch to a certain distance.(along the default direction
     * and origin of the sketch).
     *
     * You can define another extrusion direction or origin,
     *
     * It is also possible to twist extrude with an angle (in degrees), or to
     * give a profile to the extrusion (the endFactor will scale the face, and
     * the profile will define how the scale is applied (either linarly or with
     * a s-shape).
     */
    extrude(extrusionDistance: number, extrusionConfig?: {
        extrusionDirection?: Point;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: Point;
    }): Shape3D;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: Point, config?: {
        origin?: Point;
    }): Shape3D;
}
/**
 * Creates the `Sketch` of an offset of a certain face. A negative offset will
 * be within the face, a positive one outside.
 *
 * @category Sketching
 */
export declare const sketchFaceOffset: (face: Face, offset: number) => Sketch;
export declare const sketchHelix: (pitch: number, height: number, radius: number, center?: Point, dir?: Point, lefthand?: boolean) => Sketch;
export declare interface SketchInterface {
    /**
     * Transforms the lines into a face. The lines should be closed.
     */
    face(): Face;
    /**
     * Revolves the drawing on an axis (defined by its direction and an origin
     * (defaults to the sketch origin)
     */
    revolve(revolutionAxis?: Point, config?: {
        origin?: Point;
    }): Shape3D;
    /**
     * Extrudes the sketch to a certain distance.(along the default direction
     * and origin of the sketch).
     *
     * You can define another extrusion direction or origin,
     *
     * It is also possible to twist extrude with an angle (in degrees), or to
     * give a profile to the extrusion (the endFactor will scale the face, and
     * the profile will define how the scale is applied (either linarly or with
     * a s-shape).
     */
    extrude(extrusionDistance: number, extrusionConfig?: {
        extrusionDirection?: Point;
        extrusionProfile?: ExtrusionProfile;
        twistAngle?: number;
        origin?: Point;
    }): Shape3D;
    /**
     * Loft between this sketch and another sketch (or an array of them)
     *
     * You can also define a `startPoint` for the loft (that will be placed
     * before this sketch) and an `endPoint` after the last one.
     *
     * You can also define if you want the loft to result in a ruled surface.
     *
     * Note that all sketches will be deleted by this operation
     */
    loftWith(otherSketches: this | this[], loftConfig: LoftConfig, returnShell?: boolean): Shape3D;
}
/**
 * Creates the `Sketch` of parametric function in a specified plane
 *
 * The sketch will be a spline approximating the function
 *
 * @category Sketching
 */
export declare const sketchParametricFunction: (func: (t: number) => Point2D, planeConfig?: PlaneConfig, { pointsCount, start, stop }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Sketch;
/**
 * Creates the `Sketch` of an polygon in a defined plane
 *
 * The sides of the polygon can be arcs of circle with a defined sagitta.
 * The radius defines the out radius of the polygon without sagitta
 *
 * @category Sketching
 */
export declare const sketchPolysides: (radius: number, sidesCount: number, sagitta?: number, planeConfig?: PlaneConfig) => Sketch;
/**
 * Creates the `Sketch` of a rounded rectangle in a defined plane
 *
 * @category Sketching
 */
export declare const sketchRoundedRectangle: (width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}, planeConfig?: PlaneConfig) => Sketch;
/**
 * Creates the `Sketches` of a text, in a defined font size and a font familiy
 * (which will be the default).
 */
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
/**
 * Creates the `Blueprints` of a text, in a defined font size and a font familiy
 * (which will be the default).
 */
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
}
export declare class VolumePhysicalProperties extends PhysicalProperties {
    get volume(): number;
}
/** Welds faces and shells into a single shell.
 *
 * @param facesOrShells - An array of faces and shells to be welded.
 * @param ignoreType - If true, the function will not check if the result is
 * a shell.
 * @returns A shell that contains all the faces and shells.
 * */
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