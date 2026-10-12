---
name: cad-replicad
description: Guides Replicad BRep, Tau physical materials, textures, named interfaces and kinematics. Use for Replicad models and appearance or moving-part requests.
---

# Replicad authoring

## Workflow

1. Author `main.ts` with ES module imports from `replicad`, camelCase names, exported `defaultParams`, and a default `main(params)` returning a shape, Tau `ShapeConfig[]`, or a `Model` envelope.
2. Prefer BRep-native construction: holes in the source sketch, revolved wall profiles for round shells, and separate named `ShapeConfig` parts when a fused solid is unnecessary.
3. Use analytical arcs/circles where they fit. For involutes, airfoils, spirals, or cycloids, sample about eight control points and use `drawPointsInterpolation(points)` instead of chained lines.
4. For appearance, materials, textures, STEP interfaces or mass requests, read `tau-authoring-reference.md` and use Tau model types from `@taucad/replicad/model`. Use physical `material` for glTF effects beyond the legacy color/opacity/metalness/roughness fields.
5. If parts move relative to one another, read `kinematics-reference.md`. Return separate named parts, export `mechanism` with joints and an animation for every independent motion, and verify the Kinematics pane plays them.
6. Verify the entry point and every renderable library file independently. Fix material/resource and mechanism warnings even if geometry renders.

For multiple files, import helpers with explicit ESM paths such as `./lib/widget.js`. Library files export geometry builders; `main.ts` assembles them. A standalone test target must export a default `main` returning geometry.

## Kernel rules

- Prefer `fuseAll`, `cutAll`, and `intersectAll` over long pairwise boolean chains.
- Build one prototype, then `clone()` before transforming repeated parts.
- Use the `draw()` pen (`.threePointsArcTo`, `.bezierCurveTo`, `.smoothSplineTo`), `drawCircle`, or `drawPointsInterpolation` instead of polyline approximations.
- Do not expose export tessellation in `defaultParams`; the runtime owns linear and angular deflection.

## Canonical pattern

```ts
import { drawRoundedRectangle, makeCylinder, type Shape3D } from 'replicad';

export const defaultParams = { width: 80, depth: 30, height: 12, holeRadius: 4 };

export default function main(p = defaultParams): Shape3D {
  const body = drawRoundedRectangle(p.width, p.depth, 4).sketchOnPlane('XY').extrude(p.height);
  const hole = makeCylinder(p.holeRadius, p.height + 2);
  return body.cutAll([hole.translate([-20, 0, 0]), hole.translate([20, 0, 0])]);
}
```

Check invalid dimensions, open/self-intersecting sketches, coincident boolean faces, and accidental polyline curves first. `api-*` files cover upstream `replicad`; `tau-api-*` files cover Tau's returned model, material and annotation types. Grep them before assuming a field or API is unavailable.

## Wrong / Correct

- Wrong: `draw().moveTo([0, 0])`. Correct: `draw([0, 0])`, or `pen.movePointerTo([x, y])` before the first segment.
- Wrong: starting a pen with `.tangentArcTo(…)` ("You need a previous curve"). Correct: draw a `lineTo`/`hLine`/arc first; a tangent arc continues the previous curve.
- Wrong: `makeCylinder(r, h).translate(…)` reused in several places. Correct: build once, then `clone()` each copy before transforming.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### Functions

```ts
// Creates a drawing pen to programatically draw in 2D
export declare function draw(initialPoint?: Point2D): DrawingPen;

Point2D: [number, number]

// Creates the `Drawing` of a circle
export declare function drawCircle(radius: number): Drawing;

// Creates the `Drawing` of a rectangle with (optional) rounded corners
export declare function drawRoundedRectangle(width: number, height: number, r?: number | {
    rx?: number;
    ry?: number;
}): Drawing;

// Creates a cylinder with the given radius and height
export declare function makeCylinder(radius: number, height: number, location?: Point, direction?: Direction): Solid;

Point: SimplePoint | Vector | [number, number] | {
    XYZ: () => gp_XYZ;
    delete: () => void;
}

// A vector-like point or a named principal axis
Direction: Point | AxisName

SimplePoint: [number, number, number]

AxisName: (typeof AXIS_NAMES)[number]

// Creates a box with the given corner points
export declare function makeBox(corner1: Point, corner2: Point): Solid;
```

### Classes

```ts
// DrawingPen is a helper class to draw in 2D
export declare class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing>
  constructor(origin?: Point2D);
  // Stop drawing and returns the sketch
  done(): Drawing;
  // Stop drawing, make sure the sketch is closed (by adding a straight line to…
  close(): Drawing;
  // Stop drawing, make sure the sketch is closed (by mirroring the lines between the…
  closeWithMirror(): Drawing;
  // Stop drawing, make sure the sketch is closed (by adding a straight line to…
  closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Drawing;

// A line drawing to be acted upon
export declare class Sketch implements SketchInterface
  wire: Wire
  constructor(wire: Wire, { defaultOrigin, defaultDirection, }?: {
          defaultOrigin?: Point;
          defaultDirection?: Point;
      });
  baseFace: Face | null | undefined
  delete(): void;
  clone(): Sketch;
  // Transforms the lines into a face
  face(): Face;
  wires(): Wire;
  faces(): Face;
  // Revolves the drawing on an axis (defined by its direction and an origin (defaults…
  revolve(revolutionAxis?: Point, { origin, angle }?: {
          origin?: Point;
          angle?: number;
      }): Shape3D;
  // Extrudes the sketch to a certain distance.(along the default direction and origin of the…
  extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;
  // Sweep along this sketch another sketch defined in the function `sketchOnPlane`
  sweepSketch(sketchOnPlane: (plane: Plane, origin: Point) => this, sweepConfig?: GenericSweepConfig): Shape3D;
  // Loft between this sketch and another sketch (or an array of them)
  loftWith(otherSketches: this | this[], loftConfig?: LoftConfig, returnShell?: boolean): Shape3D;
  // … 2 more members in the API reference

Shape3D: Shell | Solid | CompSolid | Compound

export declare interface ExtrusionProfile
  profile?: "s-curve" | "linear"
  endFactor?: number

export declare interface GenericSweepConfig
  frenet?: boolean
  auxiliarySpine?: Wire | Edge
  law?: null | Law_Function
  transitionMode?: "right" | "transformed" | "round"
  withContact?: boolean
  support?: TopoDS_Shape
  forceProfileSpineOthogonality?: boolean

export declare interface LoftConfig
  ruled?: boolean
  startPoint?: Point
  endPoint?: Point

export declare class Drawing implements DrawingInterface
  constructor(innerShape?: Shape2D);
  clone(): Drawing;
  readonly boundingBox: BoundingBox2d
  rotate(angle: number, center?: Point2D): Drawing;
  translate(xDist: number, yDist: number): Drawing;
  translate(translationVector: Point2D): Drawing;
  scale(scaleFactor: number, center?: Point2D): Drawing;
  // Returns the mirror image of this drawing made with a single point (in center…
  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Drawing;
  // Builds a new drawing by cuting another drawing into this one
  cut(other: Drawing): Drawing;
  // Builds a new drawing by merging another drawing into this one
  fuse(other: Drawing): Drawing;
  // Builds a new drawing by intersection this drawing with another
  intersect(other: Drawing): Drawing;
  // Creates a new drawing with some corners filletted, as specified by the radius and…
  fillet(radius: number, filter?: FinderFunction<CornerFinder, Shape2D>): Drawing;
  // Creates a new drawing with some corners filletted, as specified by the radius and…
  chamfer(radius: number, filter?: FinderFunction<CornerFinder, Shape2D>): Drawing;
  // Returns the sketched version of the drawing, on a plane
  sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
  sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
  // Returns the sketched version of the drawing, on a face
  sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;
  // Formats the drawing as a list of SVG paths
  toSVGPaths(): string[] | string[][];
  offset(distance: number, offsetConfig?: Offset2DConfig): Drawing;
  readonly blueprint: Blueprint
  // … 7 more members in the API reference

Shape2D: Blueprint | Blueprints | CompoundBlueprint | null

FinderFunction: (finder: FinderType, shape: ShapeType) => FinderType

PlaneName: "XY" | "YZ" | "ZX" | "XZ" | "YX" | "ZY" | "front" | "back" | "left" | "right" | "top" | "bottom"

ScaleMode: "original" | "bounds" | "native"

// With an EdgeFinder you can apply a set of filters to find specific edges…
export declare class EdgeFinder extends Finder3d<Edge>
  clone(): EdgeFinder;
  // Filter to find edges that are in a certain direction
  inDirection(direction: Direction): this;
  // Filter to find edges of a certain length
  ofLength(length: number | ((l: number) => boolean)): this;
  // Filter to find edges that are of a cetain curve type
  ofCurveType(curveType: CurveType): this;
  // Filter to find edges that are parallel to a plane
  parallelTo(plane: Plane | StandardPlane | Face): this;
  // Filter to find edges that within a plane
  inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;
  // Check if a particular element should be filtered or not according to the current…
  shouldKeep(element: Edge): boolean;
  protected applyFilter(shape: AnyShape): Edge[];

CurveType: "LINE" | "CIRCLE" | "ELLIPSE" | "HYPERBOLA" | "PARABOLA" | "BEZIER_CURVE" | "BSPLINE_CURVE" | "OFFSET_CURVE" | "OTHER_CURVE"

AnyShape: Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound

export declare class _3DShape<Type extends TopoDS_Shape> extends Shape<Type> implements Shape3DLike<Shape3D, ShapeMesh, AnyShape,
  // Builds a new shape out of the two, fused, shapes
  fuse(other: Shape3D, options?: BooleanOperationOptions): Shape3D;
  // Builds a new shape by fusing this shape with all provided shapes in one…
  fuseAll(others: readonly Shape3D[], options?: BooleanOperationOptions): Shape3D;
  // Builds a new shape by removing the tool tape from this shape
  cut(tool: Shape3D, options?: BooleanOperationOptions): Shape3D;
  // Builds a new shape by removing all provided tool shapes in one OCCT boolean…
  cutAll(tools: readonly Shape3D[], options?: BooleanOperationOptions): Shape3D;
  // Builds a new shape by intersecting this shape and another
  intersect(tool: AnyShape, options?: BooleanOperationOptions): Shape3D;
  // Builds a new shape by intersecting this shape with all provided shapes in one…
  intersectAll(tools: readonly AnyShape[], options?: BooleanOperationOptions): Shape3D;
  // Hollows out the current shape, removing the faces found by the `filter` and keeping…
  shell(config: {
          filter: FaceFinder;
          thickness: number;
      }, tolerance?: number): Shape3D;
  shell(thickness: number, finderFcn: FinderFunction<FaceFinder, AnyShape>, tolerance?: number): Shape3D;
  // Creates a new shapes with some edges filletted, as specified in the radius config
  fillet(radiusConfig: RadiusConfig<FilletRadius>, filter?: FinderFunction<EdgeFinder, AnyShape>): Shape3D;
  // Creates a new shapes with some edges chamfered, as specified in the radius config
  chamfer(radiusConfig: RadiusConfig<ChamferRadius>, filter?: FinderFunction<EdgeFinder, AnyShape>): Shape3D;
  // … 3 more members in the API reference

export declare interface BooleanOperationOptions
  optimisation?: "none" | "commonFace" | "sameFace"

// A generic way to define radii for fillet or chamfer (the operation)
RadiusConfig: ((e: Edge) => R | null) | R | {
    filter: EdgeFinder;
    radius: R;
    keep?: boolean;
}

FilletRadius: number | [number, number]

// We can defined a chamfer with only a number - in that case it…
ChamferRadius: number | {
    distances: [number, number];
    selectedFace: FinderFunction<FaceFinder, AnyShape>;
} | {
    distance: number;
    angle: number;
    selectedFace: FinderFunction<FaceFinder, AnyShape>;
}

export declare class Shape<Type extends TopoDS_Shape> extends WrappingObj<Type>
  constructor(ocShape: Type);
  clone(): this;
  // Splits the solid parts of this shape with an oriented plane and groups them…
  split(plane?: Plane | PlaneName, offset?: number, tolerance?: number): PlaneSplitResult<Solid | Compound>;
  // Asserts that this shape is a 3D shape (Shell, Solid, CompSolid, or Compound) and…
  asShape3D(): Shape3D;
  // Simplifies the shape by removing unnecessary edges and faces
  simplify(): this;
  // Translates the shape of an arbitrary vector
  translate(xDist: number, yDist: number, zDist: number): this;
  translate(vector: Point): this;
  // Translates the shape on the X axis
  translateX(distance: number): this;
  // Translates the shape on the Y axis
  translateY(distance: number): this;
  // Translates the shape on the Z axis
  translateZ(distance: number): this;
  // Rotates the shape
  rotate(angle: number, position?: Point, direction?: Direction): this;
  // Mirrors the shape through a plane
  mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): this;
  // Returns a scaled version of the shape
  scale(scale: number, center?: Point): this;
  readonly faces: Face[]
  readonly wires: Wire[]
  readonly boundingBox: BoundingBox
  // … 11 more members in the API reference

// Pieces grouped by their position relative to an oriented plane
export declare interface PlaneSplitResult<T>
  positive: T | null
  negative: T | null
  on: T | null

export declare class BaseSketcher2d
  firstPoint: Point2D
  constructor(origin?: Point2D);
  movePointerTo(point: Point2D): this;
  lineTo(point: Point2D): this;
  line(xDist: number, yDist: number): this;
  vLine(distance: number): this;
  hLine(distance: number): this;
  vLineTo(yPos: number): this;
  hLineTo(xPos: number): this;
  threePointsArcTo(end: Point2D, midPoint: Point2D): this;
  threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;
  sagittaArcTo(end: Point2D, sagitta: number): this;
  hSagittaArc(distance: number, sagitta: number): this;
  bulgeArcTo(end: Point2D, bulge: number): this;
  tangentArcTo(end: Point2D): this;
  tangentArc(xDist: number, yDist: number): this;
  ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;
  halfEllipse(xDist: number, yDist: number, minorRadius: number, sweep?: boolean): this;
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;
  smoothSplineTo(end: Point2D, config?: SplineConfig): this;
  // Changes the corner between the previous and next segments
  customCorner(radius: number | ((first: Curve2D, second: Curve2D) => Curve2D[]), mode?: "fillet" | "chamfer" | "dogbone"): this;
  // … 16 more members in the API reference

SplineConfig: SplineTangent | {
    endTangent?: SplineTangent;
    startTangent?: StartSplineTangent;
    startFactor?: number;
    endFactor?: number;
}

export declare class Sketches
  sketches: Array<Sketch | CompoundSketch>
  constructor(sketches: Array<Sketch | CompoundSketch>);
  wires(): AnyShape;
  faces(): AnyShape;
  // Extrudes the sketch to a certain distance.(along the default direction and origin of the…
  extrude(extrusionDistance: number, extrusionConfig?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;
  // Revolves the drawing on an axis (defined by its direction and an origin (defaults…
  revolve(revolutionAxis?: Point, config?: {
          origin?: Point;
          angle?: number;
      }): Shape3D;

// The FaceSketcher allows you to sketch on a plane
export declare class Sketcher implements GenericSketcher<Sketch>
  constructor(plane: Plane);
  constructor(plane?: PlaneName, origin?: Point | number);
  // Changes the point to start your drawing from
  movePointerTo([x, y]: Point2D): this;
  // Draws a line from the current point to the point given in argument
  lineTo([x, y]: Point2D): this;
  // Draws a line at the horizontal distance xDist and the vertical distance yDist of…
  line(xDist: number, yDist: number): this;
  // Draws a vertical line of length distance from the current point
  vLine(distance: number): this;
  // Draws an horizontal line of length distance from the current point
  hLine(distance: number): this;
  // Draws an arc of circle by defining its end point and a third point…
  threePointsArcTo(end: Point2D, innerPoint: Point2D): this;
  // Draws an arc of circle from the current point as a tangent to the…
  tangentArcTo(end: Point2D): this;
  // Draws an arc of circle from the current point as a tangent to the…
  tangentArc(xDist: number, yDist: number): this;
  // Draws a generic bezier curve to the end point, going using a set of…
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;
  // Draws a cubic bezier curve to the end point, attempting to make the line…
  smoothSplineTo(end: Point2D, config?: SplineConfig): this;
  // Stop drawing and returns the sketch
  done(): Sketch;
  // Stop drawing, make sure the sketch is closed (by adding a straight line to…
  close(): Sketch;
  // … 28 more members in the API reference

export declare class BoundingBox extends WrappingObj<Bnd_Box>
  constructor(wrapped?: Bnd_Box);
  static fromBounds(min: Point, max: Point): BoundingBox;
  readonly repr: string
  readonly bounds: [SimplePoint, SimplePoint]
  readonly center: SimplePoint
  readonly width: number
  readonly height: number
  readonly depth: number
  add(other: BoundingBox): void;
  isOut(other: BoundingBox): boolean;

export declare class BoundingBox2d extends WrappingObj<Bnd_Box2d>
  constructor(wrapped?: Bnd_Box2d);
  readonly repr: string
  readonly bounds: [Point2D, Point2D]
  readonly center: Point2D
  readonly width: number
  readonly height: number
  outsidePoint(paddingPercent?: number): Point2D;
  add(other: BoundingBox2d): void;
  isOut(other: BoundingBox2d): boolean;
  containsPoint(other: Point2D): boolean;
```

### Types

```ts
ShapeConfig: {
  shape: AnyShape
  color?: string
  alpha?: number
  name?: string
  // PBR metalness factor (0 = dielectric, 1 = metal)
  metalness?: number
  // PBR roughness factor — threaded to GLTF only (not STEP
  roughness?: number
  // Material density in g/cm3, written as the shape's STEP material
  density?: number
}

ManifoldBox: Box
  min: Vec3
  max: Vec3
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 804 symbols by file.

- `api-functions.md` — Functions
- `api-classes.md` — Classes
- `api-classes-2.md` — Classes (2)
- `api-types.md` — Types
- `api-constants.md` — Constants
- `api-interfaces.md` — Interfaces

Read ranges, not whole files. Never copy a reference into a source file.
