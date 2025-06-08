# Replicad Public API Reference

Total APIs: 202

## 3D Operations

### basicFaceExtrusion

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const basicFaceExtrusion: (face: Face, extrusionVec: Vector) => Solid;
```

---

### ExtrusionProfile

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
export declare interface ExtrusionProfile {
    profile?: "s-curve" | "linear";
    endFactor?: number;
}
```

---

### loft

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const loft: (wires: Wire[], { ruled, startPoint, endPoint }?: LoftConfig, returnShell?: boolean) => Shape3D;
```

---

## Drawing & Sketching

### drawCircle

**Type:** function

**Usage Count:** 32

**Signature:**
```typescript
export declare function drawCircle(radius: number): Drawing;
```

**Parameters:**
- `radius: number`

---

### drawRoundedRectangle

**Type:** function

**Usage Count:** 22

**Signature:**
```typescript
export declare function drawRoundedRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Drawing;
```

**Parameters:**
- `width: number`
- `height: number`
- `r?: number | {
    rx?: number;
    ry?: number;
}`

---

### drawRectangle

**Type:** constant

**Usage Count:** 7

**Signature:**
```typescript
export declare const drawRectangle: typeof drawRoundedRectangle;
```

---

### sketchRectangle

**Type:** constant

**Usage Count:** 7

**Signature:**
```typescript
export declare const sketchRectangle: (xLength: number, yLength: number, planeConfig?: PlaneConfig) => Sketch;
```

---

### drawPolysides

**Type:** function

**Usage Count:** 5

**Signature:**
```typescript
export declare function drawPolysides(radius: number, sidesCount: number, sagitta?: number): Drawing;
```

**Parameters:**
- `radius: number`
- `sidesCount: number`
- `sagitta?: number`

---

### sketchCircle

**Type:** constant

**Usage Count:** 5

**Signature:**
```typescript
export declare const sketchCircle: (radius: number, planeConfig?: PlaneConfig) => Sketch;
```

---

### drawParametricFunction

**Type:** constant

**Usage Count:** 2

**Signature:**
```typescript
export declare const drawParametricFunction: (func: (t: number) => Point2D, { pointsCount, start, stop }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Drawing;
```

---

### Blueprint

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### Blueprints

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### BlueprintSketcher

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class BlueprintSketcher extends BaseSketcher2d implements GenericSketcher<Blueprint> {
    constructor(origin?: Point2D);
    done(): Blueprint;
    close(): Blueprint;
    closeWithMirror(): Blueprint;
    closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Blueprint;
}
```

---

### CompoundBlueprint

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### cutBlueprints

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const cutBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;
```

---

### drawEllipse

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function drawEllipse(majorRadius: number, minorRadius: number): Drawing;
```

**Parameters:**
- `majorRadius: number`
- `minorRadius: number`

---

### drawFaceOutline

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function drawFaceOutline(face: Face): Drawing;
```

**Parameters:**
- `face: Face`

---

### Drawing

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
    offset(distance: number): Drawing;
    approximate(target: "svg" | "arcs", options?: ApproximationOptions): Drawing;
    get blueprint(): Blueprint;
}
```

---

### DrawingInterface

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### DrawingPen

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing> {
    constructor(origin?: Point2D);
    done(): Drawing;
    close(): Drawing;
    closeWithMirror(): Drawing;
    closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Drawing;
}
```

---

### drawPointsInterpolation

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const drawPointsInterpolation: (points: Point2D[], approximationConfig?: BSplineApproximationConfig) => Drawing;
```

---

### drawProjection

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function drawProjection(shape: AnyShape, projectionCamera?: ProjectionPlane | ProjectionCamera): {
    visible: Drawing;
    hidden: Drawing;
};
```

**Parameters:**
- `shape: AnyShape`
- `projectionCamera?: ProjectionPlane | ProjectionCamera`

---

### drawSingleCircle

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function drawSingleCircle(radius: number): Drawing;
```

**Parameters:**
- `radius: number`

---

### drawSingleEllipse

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function drawSingleEllipse(majorRadius: number, minorRadius: number): Drawing;
```

**Parameters:**
- `majorRadius: number`
- `minorRadius: number`

---

### drawText

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function drawText(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Drawing;
```

**Parameters:**
- `text: string`
- `{ startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}`

---

### fuseBlueprints

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const fuseBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;
```

---

### intersectBlueprints

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const intersectBlueprints: (first: Blueprint, second: Blueprint) => null | Blueprint | Blueprints;
```

---

### organiseBlueprints

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const organiseBlueprints: (blueprints: Blueprint[]) => Blueprints;
```

---

### polysidesBlueprint

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const polysidesBlueprint: (radius: number, sidesCount: number, sagitta?: number) => Blueprint;
```

---

### roundedRectangleBlueprint

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const roundedRectangleBlueprint: (width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}) => Blueprint;
```

---

### sketchEllipse

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const sketchEllipse: (xRadius?: number, yRadius?: number, planeConfig?: PlaneConfig) => Sketch;
```

---

### sketchFaceOffset

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const sketchFaceOffset: (face: Face, offset: number) => Sketch;
```

---

### sketchHelix

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const sketchHelix: (pitch: number, height: number, radius: number, center?: Point, dir?: Point, lefthand?: boolean) => Sketch;
```

---

### sketchParametricFunction

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const sketchParametricFunction: (func: (t: number) => Point2D, planeConfig?: PlaneConfig, { pointsCount, start, stop }?: {
    pointsCount?: number | undefined;
    start?: number | undefined;
    stop?: number | undefined;
}, approximationConfig?: BSplineApproximationConfig) => Sketch;
```

---

### sketchPolysides

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const sketchPolysides: (radius: number, sidesCount: number, sagitta?: number, planeConfig?: PlaneConfig) => Sketch;
```

---

### sketchRoundedRectangle

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const sketchRoundedRectangle: (width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}, planeConfig?: PlaneConfig) => Sketch;
```

---

### sketchText

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function sketchText(text: string, textConfig?: {
    startX?: number;
    startY?: number;
    fontSize?: number;
    fontFamily?: "string";
}, planeConfig?: {
    plane?: PlaneName | Plane;
    origin?: Point | number;
}): Sketches;
```

**Parameters:**
- `text: string`
- `textConfig?: {
    startX?: number;
    startY?: number;
    fontSize?: number;
    fontFamily?: "string";
}`
- `planeConfig?: {
    plane?: PlaneName | Plane;
    origin?: Point | number;
}`

---

### textBlueprints

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function textBlueprints(text: string, { startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}): Blueprints;
```

**Parameters:**
- `text: string`
- `{ startX, startY, fontSize, fontFamily }?: {
    startX?: number | undefined;
    startY?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
}`

---

## Finders & Filters

### EdgeFinder

**Type:** class

**Usage Count:** 12

**Signature:**
```typescript
export declare class EdgeFinder extends Finder3d<Edge> {
    clone(): EdgeFinder;
    inDirection(direction: Direction_2 | Point): this;
    ofLength(length: number | ((l: number) => boolean)): this;
    ofCurveType(curveType: CurveType): this;
    parallelTo(plane: Plane | StandardPlane | Face): this;
    inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;
    shouldKeep(element: Edge): boolean;
}
```

---

### FaceFinder

**Type:** class

**Usage Count:** 8

**Signature:**
```typescript
export declare class FaceFinder extends Finder3d<Face> {
    clone(): FaceFinder;
    parallelTo(plane: Plane | StandardPlane | Face): this;
    ofSurfaceType(surfaceType: SurfaceType): this;
    inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;
    shouldKeep(element: Face): boolean;
}
```

---

### assembleWire

**Type:** constant

**Usage Count:** 5

**Signature:**
```typescript
export declare const assembleWire: (listOfEdges: (Edge | Wire)[]) => Wire;
```

---

### addHolesInFace

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const addHolesInFace: (face: Face, holes: Wire[]) => Face;
```

---

### combineFinderFilters

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const combineFinderFilters: <Type, T>(filters: {
    filter: Finder<Type, T>;
    radius: number;
}[]) => [
    (v: Type) => number,
    () => void
];
```

---

### Corner

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type Corner = {
    firstCurve: Curve2D;
    secondCurve: Curve2D;
    point: Point2D;
};
```

---

### CornerFinder

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class CornerFinder extends Finder<Corner, Blueprint> {
    clone(): CornerFinder;
    inList(elementList: Point2D[]): this;
    atDistance(distance: number, point?: Point2D): this;
    atPoint(point: Point2D): this;
    inBox(corner1: Point2D, corner2: Point2D): this;
    ofAngle(angle: number): this;
    shouldKeep(element: Corner): boolean;
}
```

---

### CubeFace

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type CubeFace = "front" | "back" | "top" | "bottom" | "left" | "right";
```

---

### Edge

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class Edge extends _1DShape<TopoDS_Edge> {
}
```

---

### Face

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### FaceOrEdge

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type FaceOrEdge = Face | Edge;
```

---

### FaceSketcher

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class FaceSketcher extends BaseSketcher2d implements GenericSketcher<Sketch> {
    constructor(face: Face, origin?: Point2D);
    done(): Sketch;
    close(): Sketch;
    closeWithMirror(): Sketch;
    closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Sketch;
}
```

---

### FaceTriangulation

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
export declare interface FaceTriangulation {
    vertices: number[];
    trianglesIndexes: number[];
    verticesNormals: number[];
}
```

---

### Finder

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### Finder3d

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### isWire

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function isWire(shape: AnyShape): shape is Wire;
```

**Parameters:**
- `shape: AnyShape`

---

### weldShellsAndFaces

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function weldShellsAndFaces(facesOrShells: Array<Face | Shell>, ignoreType?: boolean): Shell;
```

**Parameters:**
- `facesOrShells: Array<Face | Shell>`
- `ignoreType?: boolean`

---

### Wire

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class Wire extends _1DShape<TopoDS_Wire> {
    offset2D(offset: number, kind?: "arc" | "intersection" | "tangent"): Wire;
}
```

---

## Geometry Types

### Plane

**Type:** class

**Usage Count:** 5

**Signature:**
```typescript
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
```

---

### Shape

**Type:** class

**Usage Count:** 2

**Signature:**
```typescript
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
```

---

### Shell

**Type:** class

**Usage Count:** 2

**Signature:**
```typescript
export declare class Shell extends _3DShape<TopoDS_Shell> {
}
```

---

### Vector

**Type:** class

**Usage Count:** 2

**Signature:**
```typescript
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
```

---

### _1DShape

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### _3DShape

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
    fillet(radiusConfig: RadiusConfig, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;
    chamfer(radiusConfig: RadiusConfig, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;
}
```

---

### AnyShape

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type AnyShape = Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound;
```

---

### compoundShapes

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const compoundShapes: (shapeArray: AnyShape[]) => AnyShape;
```

---

### CompSolid

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class CompSolid extends _3DShape<TopoDS_CompSolid> {
}
```

---

### createNamedPlane

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const createNamedPlane: (plane: PlaneName, sourceOrigin?: Point | number) => Plane;
```

---

### isPoint

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function isPoint(p: unknown): p is Point;
```

**Parameters:**
- `p: unknown`

---

### isProjectionPlane

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function isProjectionPlane(plane: unknown): plane is ProjectionPlane;
```

**Parameters:**
- `plane: unknown`

---

### isShape3D

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function isShape3D(shape: AnyShape): shape is Shape3D;
```

**Parameters:**
- `shape: AnyShape`

---

### lookFromPlane

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function lookFromPlane(projectionPlane: ProjectionPlane): ProjectionCamera;
```

**Parameters:**
- `projectionPlane: ProjectionPlane`

---

### PlaneConfig

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
declare interface PlaneConfig {
    plane?: PlaneName | Plane;
    origin?: Point | number;
}
```

---

### PlaneName

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type PlaneName = "XY" | "YZ" | "ZX" | "XZ" | "YX" | "ZY" | "front" | "back" | "left" | "right" | "top" | "bottom";
```

---

### Point

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type Point = SimplePoint | Vector | [
    number,
    number
] | {
    XYZ: () => gp_XYZ;
    delete: () => void;
};
```

---

### Point2D

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type Point2D = [
    number,
    number
];
```

---

### ProjectionPlane

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type ProjectionPlane = "XY" | "XZ" | "YZ" | "YX" | "ZX" | "ZY" | "front" | "back" | "top" | "bottom" | "left" | "right";
```

---

### Shape2D

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type Shape2D = Blueprint | Blueprints | CompoundBlueprint | null;
```

---

### Shape3D

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type Shape3D = Shell | Solid | CompSolid | Compound;
```

---

### ShapeConfig

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type ShapeConfig = {
    shape: AnyShape;
    color?: string;
    alpha?: number;
    name?: string;
};
```

---

### ShapeMesh

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### SimplePoint

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type SimplePoint = [
    number,
    number,
    number
];
```

---

### Solid

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class Solid extends _3DShape<TopoDS_Solid> {
}
```

---

### StandardPlane

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type StandardPlane = "XY" | "XZ" | "YZ";
```

---

### Vertex

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class Vertex extends Shape<TopoDS_Vertex> {
}
```

---

## Import/Export

### exportSTEP

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function exportSTEP(shapes?: ShapeConfig[], { unit, modelUnit }?: {
    unit?: SupportedUnit;
    modelUnit?: SupportedUnit;
}): Blob;
```

**Parameters:**
- `shapes?: ShapeConfig[]`
- `{ unit, modelUnit }?: {
    unit?: SupportedUnit;
    modelUnit?: SupportedUnit;
}`

---

### importSTEP

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function importSTEP(STLBlob: Blob): Promise<AnyShape>;
```

**Parameters:**
- `STLBlob: Blob`

---

### importSTL

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function importSTL(STLBlob: Blob): Promise<AnyShape>;
```

**Parameters:**
- `STLBlob: Blob`

---

## Measurements

### LinearPhysicalProperties

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class LinearPhysicalProperties extends PhysicalProperties {
    get length(): number;
}
```

---

### measureArea

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function measureArea(shape: Face | Shape3D): number;
```

**Parameters:**
- `shape: Face | Shape3D`

---

### measureDistanceBetween

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function measureDistanceBetween(shape1: AnyShape, shape2: AnyShape): number;
```

**Parameters:**
- `shape1: AnyShape`
- `shape2: AnyShape`

---

### measureLength

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function measureLength(shape: AnyShape): number;
```

**Parameters:**
- `shape: AnyShape`

---

### measureShapeLinearProperties

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function measureShapeLinearProperties(shape: AnyShape): LinearPhysicalProperties;
```

**Parameters:**
- `shape: AnyShape`

---

### measureShapeSurfaceProperties

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function measureShapeSurfaceProperties(shape: Face | Shape3D): SurfacePhysicalProperties;
```

**Parameters:**
- `shape: Face | Shape3D`

---

### measureShapeVolumeProperties

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function measureShapeVolumeProperties(shape: Shape3D): VolumePhysicalProperties;
```

**Parameters:**
- `shape: Shape3D`

---

### measureVolume

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function measureVolume(shape: Shape3D): number;
```

**Parameters:**
- `shape: Shape3D`

---

### PhysicalProperties

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
declare class PhysicalProperties extends WrappingObj<GProp_GProps> {
    get centerOfMass(): [
        number,
        number,
        number
    ];
}
```

---

### SurfacePhysicalProperties

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class SurfacePhysicalProperties extends PhysicalProperties {
    get area(): number;
}
```

---

### VolumePhysicalProperties

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class VolumePhysicalProperties extends PhysicalProperties {
    get volume(): number;
}
```

---

## Modifications

### cut2D

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const cut2D: (first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null;
```

---

### fuse2D

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const fuse2D: (first: Shape2D, second: Shape2D) => Blueprint | Blueprints | CompoundBlueprint | null;
```

---

### intersect2D

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function intersect2D(first: Shape2D, second: Shape2D): Blueprint | Blueprints | CompoundBlueprint | null;
```

**Parameters:**
- `first: Shape2D`
- `second: Shape2D`

---

## Primitives & Makers

### makePlane

**Type:** function

**Usage Count:** 9

**Signature:**
```typescript
export declare function makePlane(plane: Plane): Plane;
```

**Parameters:**
- `plane: Plane`

---

### makePlane

**Type:** function

**Usage Count:** 9

**Signature:**
```typescript
export declare function makePlane(plane?: PlaneName, origin?: Point | number): Plane;
```

**Parameters:**
- `plane?: PlaneName`
- `origin?: Point | number`

---

### makeFace

**Type:** constant

**Usage Count:** 5

**Signature:**
```typescript
export declare const makeFace: (wire: Wire, holes?: Wire[]) => Face;
```

---

### makeSolid

**Type:** function

**Usage Count:** 4

**Signature:**
```typescript
export declare function makeSolid(facesOrShells: Array<Face | Shell>): Solid;
```

**Parameters:**
- `facesOrShells: Array<Face | Shell>`

---

### makeOffset

**Type:** constant

**Usage Count:** 3

**Signature:**
```typescript
export declare const makeOffset: (face: Face, offset: number, tolerance?: number) => Shape3D;
```

---

### makeCylinder

**Type:** constant

**Usage Count:** 2

**Signature:**
```typescript
export declare const makeCylinder: (radius: number, height: number, location?: Point, direction?: Point) => Solid;
```

---

### makeSphere

**Type:** constant

**Usage Count:** 2

**Signature:**
```typescript
export declare const makeSphere: (radius: number) => Solid;
```

---

### BoundingBox

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### BoundingBox2d

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### makeAx1

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeAx1: (center: Point, dir: Point) => gp_Ax1;
```

---

### makeAx2

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeAx2: (center: Point, dir: Point, xDir?: Point) => gp_Ax2;
```

---

### makeAx3

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeAx3: (center: Point, dir: Point, xDir?: Point) => gp_Ax3;
```

---

### makeBaseBox

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeBaseBox: (xLength: number, yLength: number, zLength: number) => Shape3D;
```

---

### makeBezierCurve

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeBezierCurve: (points: Point[]) => Edge;
```

---

### makeBox

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeBox: (corner1: Point, corner2: Point) => Solid;
```

---

### makeBSplineApproximation

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeBSplineApproximation: (points: Point[], { tolerance, smoothing, degMax, degMin, }?: BSplineApproximationConfig) => Edge;
```

---

### makeCircle

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeCircle: (radius: number, center?: Point, normal?: Point) => Edge;
```

---

### makeCompound

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeCompound: (shapeArray: AnyShape[]) => AnyShape;
```

---

### makeDirection

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function makeDirection(p: Direction): Point;
```

**Parameters:**
- `p: Direction`

---

### makeEllipse

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeEllipse: (majorRadius: number, minorRadius: number, center?: Point, normal?: Point, xDir?: Point) => Edge;
```

---

### makeEllipseArc

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeEllipseArc: (majorRadius: number, minorRadius: number, startAngle: number, endAngle: number, center?: Point, normal?: Point, xDir?: Point) => Edge;
```

---

### makeEllipsoid

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeEllipsoid: (aLength: number, bLength: number, cLength: number) => Solid;
```

---

### makeHelix

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeHelix: (pitch: number, height: number, radius: number, center?: Point, dir?: Point, lefthand?: boolean) => Wire;
```

---

### makeLine

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeLine: (v1: Point, v2: Point) => Edge;
```

---

### makeNewFaceWithinFace

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeNewFaceWithinFace: (originFace: Face, wire: Wire) => Face;
```

---

### makeNonPlanarFace

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeNonPlanarFace: (wire: Wire) => Face;
```

---

### makePlaneFromFace

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makePlaneFromFace: (face: Face, originOnSurface?: Point2D) => Plane;
```

---

### makePolygon

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makePolygon: (points: Point[]) => Face;
```

---

### makeProjectedEdges

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function makeProjectedEdges(shape: AnyShape, camera: ProjectionCamera, withHiddenLines?: boolean): {
    visible: Edge[];
    hidden: Edge[];
};
```

**Parameters:**
- `shape: AnyShape`
- `camera: ProjectionCamera`
- `withHiddenLines?: boolean`

---

### makeTangentArc

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeTangentArc: (startPoint: Point, startTgt: Point, endPoint: Point) => Edge;
```

---

### makeThreePointArc

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeThreePointArc: (v1: Point, v2: Point, v3: Point) => Edge;
```

---

### makeVertex

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const makeVertex: (point: Point) => Vertex;
```

---

## Transformations

### translate

**Type:** function

**Usage Count:** 55

**Signature:**
```typescript
export declare function translate(shape: TopoDS_Shape, vector: Point): TopoDS_Shape;
```

**Parameters:**
- `shape: TopoDS_Shape`
- `vector: Point`

---

### rotate

**Type:** function

**Usage Count:** 8

**Signature:**
```typescript
export declare function rotate(shape: TopoDS_Shape, angle: number, position?: Point, direction?: Point): TopoDS_Shape;
```

**Parameters:**
- `shape: TopoDS_Shape`
- `angle: number`
- `position?: Point`
- `direction?: Point`

---

### mirror

**Type:** function

**Usage Count:** 4

**Signature:**
```typescript
export declare function mirror(shape: TopoDS_Shape, inputPlane?: Plane | PlaneName | Point, origin?: Point): TopoDS_Shape;
```

**Parameters:**
- `shape: TopoDS_Shape`
- `inputPlane?: Plane | PlaneName | Point`
- `origin?: Point`

---

### scale

**Type:** function

**Usage Count:** 1

**Signature:**
```typescript
export declare function scale(shape: TopoDS_Shape, center: Point, scale: number): TopoDS_Shape;
```

**Parameters:**
- `shape: TopoDS_Shape`
- `center: Point`
- `scale: number`

---

### Transformation

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

## Utilities

### draw

**Type:** function

**Usage Count:** 34

**Signature:**
```typescript
export declare function draw(initialPoint?: Point2D): DrawingPen;
```

**Parameters:**
- `initialPoint?: Point2D`

---

### Sketcher

**Type:** class

**Usage Count:** 3

**Signature:**
```typescript
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
```

---

### polysideInnerRadius

**Type:** constant

**Usage Count:** 2

**Signature:**
```typescript
export declare const polysideInnerRadius: (outerRadius: number, sidesCount: number, sagitta?: number) => number;
```

---

### genericSweep

**Type:** function

**Usage Count:** 1

**Signature:**
```typescript
export declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode: true): [
    Shape3D,
    Wire,
    Wire
];
```

**Parameters:**
- `wire: Wire`
- `spine: Wire`
- `sweepConfig: GenericSweepConfig`
- `shellMode: true`

---

### genericSweep

**Type:** function

**Usage Count:** 1

**Signature:**
```typescript
export declare function genericSweep(wire: Wire, spine: Wire, sweepConfig: GenericSweepConfig, shellMode?: false): Shape3D;
```

**Parameters:**
- `wire: Wire`
- `spine: Wire`
- `sweepConfig: GenericSweepConfig`
- `shellMode?: false`

---

### revolution

**Type:** constant

**Usage Count:** 1

**Signature:**
```typescript
export declare const revolution: (face: Face, center?: Point, direction?: Point, angle?: number) => Shape3D;
```

---

### Sketch

**Type:** class

**Usage Count:** 1

**Signature:**
```typescript
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
```

---

### ApproximationOptions

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
declare interface ApproximationOptions {
    tolerance?: number;
    continuity?: "C0" | "C1" | "C2" | "C3";
    maxSegments?: number;
}
```

---

### asDir

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function asDir(coords: Point): gp_Dir;
```

**Parameters:**
- `coords: Point`

---

### asPnt

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function asPnt(coords: Point): gp_Pnt;
```

**Parameters:**
- `coords: Point`

---

### AssemblyExporter

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class AssemblyExporter extends WrappingObj<TDocStd_Document> {
}
```

---

### axis2d

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const axis2d: (point: Point2D, direction: Point2D) => gp_Ax2d;
```

---

### BaseSketcher2d

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### BSplineApproximationConfig

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### cast

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function cast(shape: TopoDS_Shape): AnyShape;
```

**Parameters:**
- `shape: TopoDS_Shape`

---

### complexExtrude

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function complexExtrude(wire: Wire, center: Point, normal: Point, profileShape: ExtrusionProfile | undefined, shellMode: true): [
    Shape3D,
    Wire,
    Wire
];
```

**Parameters:**
- `wire: Wire`
- `center: Point`
- `normal: Point`
- `profileShape: ExtrusionProfile | undefined`
- `shellMode: true`

---

### complexExtrude

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function complexExtrude(wire: Wire, center: Point, normal: Point, profileShape?: ExtrusionProfile, shellMode?: false): Shape3D;
```

**Parameters:**
- `wire: Wire`
- `center: Point`
- `normal: Point`
- `profileShape?: ExtrusionProfile`
- `shellMode?: false`

---

### Compound

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class Compound extends _3DShape<TopoDS_Compound> {
}
```

---

### CompoundSketch

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### CoordSystem

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type CoordSystem = "reference" | {
    origin: Point;
    zDir: Point;
    xDir: Point;
};
```

---

### createAssembly

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function createAssembly(shapes?: ShapeConfig[]): AssemblyExporter;
```

**Parameters:**
- `shapes?: ShapeConfig[]`

---

### Curve

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### Curve2D

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### CurveLike

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### CurveType

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type CurveType = "LINE" | "CIRCLE" | "ELLIPSE" | "HYPERBOLA" | "PARABOLA" | "BEZIER_CURVE" | "BSPLINE_CURVE" | "OFFSET_CURVE" | "OTHER_CURVE";
```

---

### DEG2RAD

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const DEG2RAD: number;
```

---

### Deletable

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
declare interface Deletable {
    delete: () => void;
}
```

---

### Direction

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type Direction = Point | "X" | "Y" | "Z";
```

---

### Direction_2

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type Direction_2 = "X" | "Y" | "Z";
```

---

### DistanceQuery

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class DistanceQuery extends WrappingObj<BRepExtrema_DistShapeShape> {
    constructor(shape: AnyShape);
    distanceTo(shape: AnyShape): number;
}
```

---

### DistanceTool

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class DistanceTool extends WrappingObj<BRepExtrema_DistShapeShape> {
    constructor();
    distanceBetween(shape1: AnyShape, shape2: AnyShape): number;
}
```

---

### downcast

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function downcast(shape: TopoDS_Shape): GenericTopo;
```

**Parameters:**
- `shape: TopoDS_Shape`

---

### FilterFcn

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type FilterFcn<Type> = {
    element: Type;
    normal: Vector | null;
};
```

---

### GCWithObject

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const GCWithObject: (obj: any) => <Type extends Deletable>(value: Type) => Type;
```

---

### GCWithScope

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const GCWithScope: () => <Type extends Deletable>(value: Type) => Type;
```

---

### GenericSketcher

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### GenericSweepConfig

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
export declare interface GenericSweepConfig {
    frenet?: boolean;
    auxiliarySpine?: Wire | Edge;
    law?: null | Handle_Law_Function;
    transitionMode?: "right" | "transformed" | "round";
    withContact?: boolean;
    support?: TopoDS_Shape;
    forceProfileSpineOthogonality?: boolean;
}
```

---

### GenericTopo

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type GenericTopo = TopoDS_Face | TopoDS_Shape | TopoDS_Edge | TopoDS_Wire | TopoDS_Shell | TopoDS_Vertex | TopoDS_Solid | TopoDS_Compound | TopoDS_CompSolid;
```

---

### getFont

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const getFont: (fontFamily?: string) => opentype_2.Font;
```

---

### getOC

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const getOC: () => OpenCascadeInstance;
```

---

### HASH_CODE_MAX

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const HASH_CODE_MAX = 2147483647;
```

---

### iterTopo

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const iterTopo: (shape: TopoDS_Shape, topo: TopoEntity) => IterableIterator<TopoDS_Shape>;
```

---

### loadFont

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const loadFont: (fontPath: string, fontFamily?: string) => Promise<opentype_2.Font>;
```

---

### localGC

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const localGC: (debug?: boolean) => [
    <T extends Deletable>(v: T) => T,
    () => void,
    Set<Deletable> | undefined
];
```

---

### LoftConfig

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
export declare interface LoftConfig {
    ruled?: boolean;
    startPoint?: Point;
    endPoint?: Point;
}
```

---

### ProjectionCamera

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### RAD2DEG

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const RAD2DEG: number;
```

---

### RadiusConfig

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type RadiusConfig = ((e: Edge) => number | null) | number | {
    filter: EdgeFinder;
    radius: number;
    keep?: boolean;
};
```

---

### ScaleMode

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type ScaleMode = "original" | "bounds" | "native";
```

---

### setOC

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const setOC: (oc: OpenCascadeInstance) => void;
```

---

### shapeType

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const shapeType: (shape: TopoDS_Shape) => TopAbs_ShapeEnum;
```

---

### Sketches

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
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
    }): AnyShape;
    revolve(revolutionAxis?: Point, config?: {
        origin?: Point;
    }): AnyShape;
}
```

---

### SketchInterface

**Type:** interface

**Usage Count:** 0

**Signature:**
```typescript
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
```

---

### SplineConfig

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type SplineConfig = SplineTangent | {
    endTangent?: SplineTangent;
    startTangent?: StartSplineTangent;
    startFactor?: number;
    endFactor?: number;
};
```

---

### SplineTangent

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type SplineTangent = StartSplineTangent | "symmetric";
```

---

### StartSplineTangent

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type StartSplineTangent = number | Point2D;
```

---

### SupportedUnit

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type SupportedUnit = "M" | "CM" | "MM" | "INCH" | "FT" | "m" | "mm" | "cm" | "inch" | "ft";
```

---

### supportExtrude

**Type:** constant

**Usage Count:** 0

**Signature:**
```typescript
export declare const supportExtrude: (wire: Wire, center: Point, normal: Point, support: TopoDS_Shape) => Shape3D;
```

---

### Surface

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class Surface extends WrappingObj<Adaptor3d_Surface> {
    get surfaceType(): SurfaceType;
}
```

---

### SurfaceType

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
export declare type SurfaceType = "PLANE" | "CYLINDRE" | "CONE" | "SPHERE" | "TORUS" | "BEZIER_SURFACE" | "BSPLINE_SURFACE" | "REVOLUTION_SURFACE" | "EXTRUSION_SURFACE" | "OFFSET_SURFACE" | "OTHER_SURFACE";
```

---

### TopoEntity

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type TopoEntity = "vertex" | "edge" | "wire" | "face" | "shell" | "solid" | "solidCompound" | "compound" | "shape";
```

---

### twistExtrude

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function twistExtrude(wire: Wire, angleDegrees: number, center: Point, normal: Point, profileShape?: ExtrusionProfile, shellMode?: false): Shape3D;
```

**Parameters:**
- `wire: Wire`
- `angleDegrees: number`
- `center: Point`
- `normal: Point`
- `profileShape?: ExtrusionProfile`
- `shellMode?: false`

---

### twistExtrude

**Type:** function

**Usage Count:** 0

**Signature:**
```typescript
export declare function twistExtrude(wire: Wire, angleDegrees: number, center: Point, normal: Point, profileShape: ExtrusionProfile | undefined, shellMode: true): [
    Shape3D,
    Wire,
    Wire
];
```

**Parameters:**
- `wire: Wire`
- `angleDegrees: number`
- `center: Point`
- `normal: Point`
- `profileShape: ExtrusionProfile | undefined`
- `shellMode: true`

---

### UVBounds

**Type:** type

**Usage Count:** 0

**Signature:**
```typescript
declare type UVBounds = {
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
};
```

---

### WrappingObj

**Type:** class

**Usage Count:** 0

**Signature:**
```typescript
export declare class WrappingObj<Type extends Deletable> {
    constructor(wrapped: Type);
    get wrapped(): Type;
    set wrapped(newWrapped: Type);
    delete(): void;
}
```

---

