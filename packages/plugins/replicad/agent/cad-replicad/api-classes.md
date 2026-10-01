# replicad — Classes

29 top-level symbols. Signatures are verbatim typescript.

_1DShape: export declare abstract class _1DShape<Type extends TopoDS_Shape> extends Shape<Type>

  repr

  curve

  startPoint

  endPoint

  // _1DShape.tangentAt (method)
  tangentAt(position?: number): Vector;

  // _1DShape.pointAt (method)
  pointAt(position?: number): Vector;

  isClosed

  isPeriodic

  period

  geomType

  length

  orientation

  // _1DShape.flipOrientation (method)
  flipOrientation(): Type;

_3DShape: export declare class _3DShape<Type extends TopoDS_Shape> extends Shape<Type> implements Shape3DLike<Shape3D, ShapeMesh, AnyShape,

  // Builds a new shape out of the two, fused, shapes
  // _3DShape.fuse (method)
  fuse(other: Shape3D, options?: BooleanOperationOptions): Shape3D;

  // Builds a new shape by fusing this shape with all provided shapes in one OCCT boolean operation
  // _3DShape.fuseAll (method)
  fuseAll(others: readonly Shape3D[], options?: BooleanOperationOptions): Shape3D;

  // Builds a new shape by removing the tool tape from this shape
  // _3DShape.cut (method)
  cut(tool: Shape3D, options?: BooleanOperationOptions): Shape3D;

  // Builds a new shape by removing all provided tool shapes in one OCCT boolean operation
  // _3DShape.cutAll (method)
  cutAll(tools: readonly Shape3D[], options?: BooleanOperationOptions): Shape3D;

  // Builds a new shape by intersecting this shape and another
  // _3DShape.intersect (method)
  intersect(tool: AnyShape, options?: BooleanOperationOptions): Shape3D;

  // Builds a new shape by intersecting this shape with all provided shapes in one OCCT boolean operation
  // _3DShape.intersectAll (method)
  intersectAll(tools: readonly AnyShape[], options?: BooleanOperationOptions): Shape3D;

  // _3DShape.meshShape (method)
  meshShape(options?: {
          tolerance?: number;
          angularTolerance?: number;
      }): MeshShape;

  // Hollows out the current shape, removing the faces found by the `filter` and keeping a border of `thickness`
  // _3DShape.shell (method)
  shell(config: {
          filter: FaceFinder;
          thickness: number;
      }, tolerance?: number): Shape3D;
  shell(thickness: number, finderFcn: (f: FaceFinder) => FaceFinder, tolerance?: number): Shape3D;

  // Creates a new shapes with some edges filletted, as specified in the radius config
  // _3DShape.fillet (method)
  fillet(radiusConfig: RadiusConfig<FilletRadius>, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;

  // Creates a new shapes with some edges chamfered, as specified in the radius config
  // _3DShape.chamfer (method)
  chamfer(radiusConfig: RadiusConfig<ChamferRadius>, filter?: (e: EdgeFinder) => EdgeFinder): Shape3D;

  // Applies a draft angle to selected faces of the shape
  // _3DShape.draft (method)
  draft(angle: number, faceFinder: (e: FaceFinder) => FaceFinder, neutralPlane?: Plane | PlaneName): AnyShape;

AssemblyExporter: export declare class AssemblyExporter extends WrappingObj<TDocStd_Document>

BaseSketcher2d: export declare class BaseSketcher2d

  pointer: Point2D

  firstPoint: Point2D

  pendingCurves: Curve2D[]

  // BaseSketcher2d.constructor (constructor)
  constructor(origin?: Point2D);

  // Returns the current pen position as [x, y] coordinates
  penPosition

  // Returns the current pen angle in degrees
  penAngle

  // BaseSketcher2d.movePointerTo (method)
  movePointerTo(point: Point2D): this;

  // BaseSketcher2d.saveCurve (method)
  protected saveCurve(curve: Curve2D): void;

  // BaseSketcher2d.lineTo (method)
  lineTo(point: Point2D): this;

  // BaseSketcher2d.line (method)
  line(xDist: number, yDist: number): this;

  // BaseSketcher2d.vLine (method)
  vLine(distance: number): this;

  // BaseSketcher2d.hLine (method)
  hLine(distance: number): this;

  // BaseSketcher2d.vLineTo (method)
  vLineTo(yPos: number): this;

  // BaseSketcher2d.hLineTo (method)
  hLineTo(xPos: number): this;

  // BaseSketcher2d.polarLineTo (method)
  polarLineTo([r, theta]: Point2D): this;

  // BaseSketcher2d.polarLine (method)
  polarLine(distance: number, angle: number): this;

  // BaseSketcher2d.tangentLine (method)
  tangentLine(distance: number): this;

  // BaseSketcher2d.threePointsArcTo (method)
  threePointsArcTo(end: Point2D, midPoint: Point2D): this;

  // BaseSketcher2d.threePointsArc (method)
  threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;

  // BaseSketcher2d.sagittaArcTo (method)
  sagittaArcTo(end: Point2D, sagitta: number): this;

  // BaseSketcher2d.sagittaArc (method)
  sagittaArc(xDist: number, yDist: number, sagitta: number): this;

  // BaseSketcher2d.vSagittaArc (method)
  vSagittaArc(distance: number, sagitta: number): this;

  // BaseSketcher2d.hSagittaArc (method)
  hSagittaArc(distance: number, sagitta: number): this;

  // BaseSketcher2d.bulgeArcTo (method)
  bulgeArcTo(end: Point2D, bulge: number): this;

  // BaseSketcher2d.bulgeArc (method)
  bulgeArc(xDist: number, yDist: number, bulge: number): this;

  // BaseSketcher2d.vBulgeArc (method)
  vBulgeArc(distance: number, bulge: number): this;

  // BaseSketcher2d.hBulgeArc (method)
  hBulgeArc(distance: number, bulge: number): this;

  // BaseSketcher2d.tangentArcTo (method)
  tangentArcTo(end: Point2D): this;

  // BaseSketcher2d.tangentArc (method)
  tangentArc(xDist: number, yDist: number): this;

  // BaseSketcher2d.ellipseTo (method)
  ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

  // BaseSketcher2d.ellipse (method)
  ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

  // BaseSketcher2d.halfEllipseTo (method)
  halfEllipseTo(end: Point2D, minorRadius: number, sweep?: boolean): this;

  // BaseSketcher2d.halfEllipse (method)
  halfEllipse(xDist: number, yDist: number, minorRadius: number, sweep?: boolean): this;

  // BaseSketcher2d.bezierCurveTo (method)
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;

  // BaseSketcher2d.quadraticBezierCurveTo (method)
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;

  // BaseSketcher2d.cubicBezierCurveTo (method)
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;

  // BaseSketcher2d.smoothSplineTo (method)
  smoothSplineTo(end: Point2D, config?: SplineConfig): this;

  // BaseSketcher2d.smoothSpline (method)
  smoothSpline(xDist: number, yDist: number, splineConfig?: SplineConfig): this;

  // Changes the corner between the previous and next segments
  // BaseSketcher2d.customCorner (method)
  customCorner(radius: number | ((first: Curve2D, second: Curve2D) => Curve2D[]), mode?: "fillet" | "chamfer" | "dogbone"): this;

// A Blueprint is an abstract Sketch, a 2D set of curves that can then be sketched on different surfaces (faces or planes)
Blueprint: export declare class Blueprint implements DrawingInterface

  curves: Curve2D[]

  // Blueprint.constructor (constructor)
  constructor(curves: Curve2D[]);

  // Blueprint.delete (method)
  delete(): void;

  // Blueprint.clone (method)
  clone(): Blueprint;

  repr

  boundingBox

  orientation

  // Blueprint.stretch (method)
  stretch(ratio: number, direction: Point2D, origin?: Point2D): Blueprint;

  // Blueprint.scale (method)
  scale(scaleFactor: number, center?: Point2D): Blueprint;

  // Blueprint.rotate (method)
  rotate(angle: number, center?: Point2D): Blueprint;

  // Blueprint.translate (method)
  translate(xDist: number, yDist: number): Blueprint;
  translate(translationVector: Point2D): Blueprint;

  // Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
  // Blueprint.mirror (method)
  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Blueprint;

  // Returns the sketched version of the drawing, on a plane
  // Blueprint.sketchOnPlane (method)
  sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): Sketch;

  // Returns the sketched version of the drawing, on a face
  // Blueprint.sketchOnFace (method)
  sketchOnFace(face: Face, scaleMode?: ScaleMode): Sketch;

  // Blueprint.subFace (method)
  subFace(face: Face, origin?: Point | null): Face;

  // Blueprint.punchHole (method)
  punchHole(shape: AnyShape, face: SingleFace, { height, origin, draftAngle, }?: {
          height?: number | null;
          origin?: Point | null;
          draftAngle?: number;
      }): AnyShape;

  // Blueprint.toSVGPathD (method)
  toSVGPathD(): string;

  // Blueprint.toSVGPath (method)
  toSVGPath(): string;

  // Returns the SVG viewbox that corresponds to this drawing
  // Blueprint.toSVGViewBox (method)
  toSVGViewBox(margin?: number): string;

  // Formats the drawing as a list of SVG paths
  // Blueprint.toSVGPaths (method)
  toSVGPaths(): string[];

  // Formats the drawing as an SVG image
  // Blueprint.toSVG (method)
  toSVG(margin?: number): string;

  firstPoint

  lastPoint

  // Blueprint.isInside (method)
  isInside(point: Point2D): boolean;

  // Blueprint.isClosed (method)
  isClosed(): boolean;

  // Blueprint.intersects (method)
  intersects(other: Blueprint): boolean;

Blueprints: export declare class Blueprints implements DrawingInterface

  blueprints: Array<Blueprint | CompoundBlueprint>

  // Blueprints.constructor (constructor)
  constructor(blueprints: Array<Blueprint | CompoundBlueprint>);

  repr

  // Blueprints.clone (method)
  clone(): Blueprints;

  boundingBox

  // Blueprints.stretch (method)
  stretch(ratio: number, direction: Point2D, origin: Point2D): Blueprints;

  // Blueprints.rotate (method)
  rotate(angle: number, center?: Point2D): Blueprints;

  // Blueprints.scale (method)
  scale(scaleFactor: number, center?: Point2D): Blueprints;

  // Blueprints.translate (method)
  translate(xDist: number, yDist: number): Blueprints;
  translate(translationVector: Point2D): Blueprints;

  // Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
  // Blueprints.mirror (method)
  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Blueprints;

  // Returns the sketched version of the drawing, on a plane
  // Blueprints.sketchOnPlane (method)
  sketchOnPlane(plane?: PlaneName | Plane, origin?: Point | number): Sketches;

  // Returns the sketched version of the drawing, on a face
  // Blueprints.sketchOnFace (method)
  sketchOnFace(face: Face, scaleMode?: ScaleMode): Sketches;

  // Blueprints.punchHole (method)
  punchHole(shape: AnyShape, face: SingleFace, options?: {
          height?: number;
          origin?: Point;
          draftAngle?: number;
      }): AnyShape;

  // Returns the SVG viewbox that corresponds to this drawing
  // Blueprints.toSVGViewBox (method)
  toSVGViewBox(margin?: number): string;

  // Formats the drawing as a list of SVG paths
  // Blueprints.toSVGPaths (method)
  toSVGPaths(): string[][];

  // Formats the drawing as an SVG image
  // Blueprints.toSVG (method)
  toSVG(margin?: number): string;

BlueprintSketcher: export declare class BlueprintSketcher extends BaseSketcher2d implements GenericSketcher<Blueprint>

  // BlueprintSketcher.constructor (constructor)
  constructor(origin?: Point2D);

  // Stop drawing and returns the sketch
  // BlueprintSketcher.done (method)
  done(): Blueprint;

  // Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
  // BlueprintSketcher.close (method)
  close(): Blueprint;

  // Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
  // BlueprintSketcher.closeWithMirror (method)
  closeWithMirror(): Blueprint;

  // Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first), add a fillet between the last and the first segments and returns the sketch
  // BlueprintSketcher.closeWithCustomCorner (method)
  closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer" | "dogbone"): Blueprint;

BoundingBox: export declare class BoundingBox extends WrappingObj<Bnd_Box>

  // BoundingBox.constructor (constructor)
  constructor(wrapped?: Bnd_Box);

  // BoundingBox.fromBounds (method)
  static fromBounds(min: Point, max: Point): BoundingBox;

  repr

  bounds

  center

  width

  height

  depth

  // BoundingBox.add (method)
  add(other: BoundingBox): void;

  // BoundingBox.isOut (method)
  isOut(other: BoundingBox): boolean;

BoundingBox2d: export declare class BoundingBox2d extends WrappingObj<Bnd_Box2d>

  // BoundingBox2d.constructor (constructor)
  constructor(wrapped?: Bnd_Box2d);

  repr

  bounds

  center

  width

  height

  // BoundingBox2d.outsidePoint (method)
  outsidePoint(paddingPercent?: number): Point2D;

  // BoundingBox2d.add (method)
  add(other: BoundingBox2d): void;

  // BoundingBox2d.isOut (method)
  isOut(other: BoundingBox2d): boolean;

  // BoundingBox2d.containsPoint (method)
  containsPoint(other: Point2D): boolean;

Compound: export declare class Compound extends _3DShape<TopoDS_Compound>

CompoundBlueprint: export declare class CompoundBlueprint implements DrawingInterface

  blueprints: Blueprint[]

  // CompoundBlueprint.constructor (constructor)
  constructor(blueprints: Blueprint[]);

  // CompoundBlueprint.clone (method)
  clone(): CompoundBlueprint;

  boundingBox

  repr

  // CompoundBlueprint.stretch (method)
  stretch(ratio: number, direction: Point2D, origin: Point2D): CompoundBlueprint;

  // CompoundBlueprint.rotate (method)
  rotate(angle: number, center?: Point2D): CompoundBlueprint;

  // CompoundBlueprint.scale (method)
  scale(scaleFactor: number, center?: Point2D): CompoundBlueprint;

  // CompoundBlueprint.translate (method)
  translate(xDist: number, yDist: number): CompoundBlueprint;
  translate(translationVector: Point2D): CompoundBlueprint;

  // Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
  // CompoundBlueprint.mirror (method)
  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): CompoundBlueprint;

  // Returns the sketched version of the drawing, on a plane
  // CompoundBlueprint.sketchOnPlane (method)
  sketchOnPlane(plane?: PlaneName | Plane, origin?: Point | number): CompoundSketch;

  // Returns the sketched version of the drawing, on a face
  // CompoundBlueprint.sketchOnFace (method)
  sketchOnFace(face: Face, scaleMode?: ScaleMode): CompoundSketch;

  // CompoundBlueprint.punchHole (method)
  punchHole(shape: AnyShape, face: SingleFace, options?: {
          height?: number;
          origin?: Point;
          draftAngle?: number;
      }): AnyShape;

  // Returns the SVG viewbox that corresponds to this drawing
  // CompoundBlueprint.toSVGViewBox (method)
  toSVGViewBox(margin?: number): string;

  // Formats the drawing as a list of SVG paths
  // CompoundBlueprint.toSVGPaths (method)
  toSVGPaths(): string[];

  // CompoundBlueprint.toSVGGroup (method)
  toSVGGroup(): string;

  // Formats the drawing as an SVG image
  // CompoundBlueprint.toSVG (method)
  toSVG(margin?: number): string;

// A group of sketches that should correspond to a unique face (i.e
CompoundSketch: export declare class CompoundSketch implements SketchInterface

  sketches: Sketch[]

  // CompoundSketch.constructor (constructor)
  constructor(sketches: Sketch[]);

  // CompoundSketch.delete (method)
  delete(): void;

  outerSketch

  innerSketches

  wires

  // Transforms the lines into a face
  // CompoundSketch.face (method)
  face(): Face;

  // Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
  // CompoundSketch.extrude (method)
  extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;

  // Revolves the drawing on an axis (defined by its direction and an origin (defaults to the sketch origin)
  // CompoundSketch.revolve (method)
  revolve(revolutionAxis?: Point, { origin, angle }?: {
          origin?: Point;
          angle?: number;
      }): Shape3D;

  // Loft between this sketch and another sketch (or an array of them)
  // CompoundSketch.loftWith (method)
  loftWith(otherCompound: this, loftConfig: LoftConfig): Shape3D;

CompSolid: export declare class CompSolid extends _3DShape<TopoDS_CompSolid>

CornerFinder: export declare class CornerFinder extends Finder<Corner, Blueprint>

  // CornerFinder.clone (method)
  clone(): CornerFinder;

  // Filter to find corner that have their point are in the list
  // CornerFinder.inList (method)
  inList(elementList: Point2D[]): this;

  // Filter to find elements that are at a specified distance from a point
  // CornerFinder.atDistance (method)
  atDistance(distance: number, point?: Point2D): this;

  // Filter to find elements that contain a certain point
  // CornerFinder.atPoint (method)
  atPoint(point: Point2D): this;

  // Filter to find elements that are within a box
  // CornerFinder.inBox (method)
  inBox(corner1: Point2D, corner2: Point2D): this;

  // Filter to find corner that a certain angle between them - only between 0 and 180
  // CornerFinder.ofAngle (method)
  ofAngle(angle: number): this;

  // Check if a particular element should be filtered or not according to the current finder
  // CornerFinder.shouldKeep (method)
  shouldKeep(element: Corner): boolean;

  // CornerFinder.applyFilter (method)
  protected applyFilter(blueprint: Blueprint): Corner[];

Curve: export declare class Curve extends WrappingObj<CurveLike>

  repr

  curveType

  startPoint

  endPoint

  // Curve.pointAt (method)
  pointAt(position?: number): Vector;

  // Curve.tangentAt (method)
  tangentAt(position?: number): Vector;

  isClosed

  isPeriodic

  period

Curve2D: export declare class Curve2D extends WrappingObj<Geom2d_Curve>

  // Curve2D.constructor (constructor)
  constructor(handle: Geom2d_Curve);

  boundingBox

  repr

  innerCurve

  // Curve2D.serialize (method)
  serialize(): string;

  // Curve2D.value (method)
  value(parameter: number): Point2D;

  firstPoint

  lastPoint

  firstParameter

  lastParameter

  // Curve2D.adaptor (method)
  adaptor(): Geom2dAdaptor_Curve;

  geomType

  // Curve2D.clone (method)
  clone(): Curve2D;

  // Curve2D.reverse (method)
  reverse(): void;

  // Curve2D.distanceFrom (method)
  distanceFrom(element: Curve2D | Point2D): number;

  // Curve2D.isOnCurve (method)
  isOnCurve(point: Point2D): boolean;

  // Curve2D.parameter (method)
  parameter(point: Point2D, precision?: number): number;

  // Curve2D.tangentAt (method)
  tangentAt(index: number | Point2D): Point2D;

  // Curve2D.splitAt (method)
  splitAt(points: Point2D[] | number[], precision?: number): Curve2D[];

DistanceQuery: export declare class DistanceQuery extends WrappingObj<BRepExtrema_DistShapeShape>

  // DistanceQuery.constructor (constructor)
  constructor(shape: AnyShape);

  // DistanceQuery.distanceTo (method)
  distanceTo(shape: AnyShape): number;

DistanceTool: export declare class DistanceTool extends WrappingObj<BRepExtrema_DistShapeShape>

  // DistanceTool.constructor (constructor)
  constructor();

  // DistanceTool.distanceBetween (method)
  distanceBetween(shape1: AnyShape, shape2: AnyShape): number;

Drawing: export declare class Drawing implements DrawingInterface

  // Drawing.constructor (constructor)
  constructor(innerShape?: Shape2D);

  // Drawing.clone (method)
  clone(): Drawing;

  // Drawing.serialize (method)
  serialize(): string;

  boundingBox

  // Drawing.stretch (method)
  stretch(ratio: number, direction: Point2D, origin: Point2D): Drawing;

  repr

  // Drawing.rotate (method)
  rotate(angle: number, center?: Point2D): Drawing;

  // Drawing.translate (method)
  translate(xDist: number, yDist: number): Drawing;
  translate(translationVector: Point2D): Drawing;

  // Drawing.scale (method)
  scale(scaleFactor: number, center?: Point2D): Drawing;

  // Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
  // Drawing.mirror (method)
  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): Drawing;

  // Builds a new drawing by cuting another drawing into this one
  // Drawing.cut (method)
  cut(other: Drawing): Drawing;

  // Builds a new drawing by merging another drawing into this one
  // Drawing.fuse (method)
  fuse(other: Drawing): Drawing;

  // Builds a new drawing by intersection this drawing with another
  // Drawing.intersect (method)
  intersect(other: Drawing): Drawing;

  // Creates a new drawing with some corners filletted, as specified by the radius and the corner finder function
  // Drawing.fillet (method)
  fillet(radius: number, filter?: (c: CornerFinder) => CornerFinder): Drawing;

  // Creates a new drawing with some corners filletted, as specified by the radius and the corner finder function
  // Drawing.chamfer (method)
  chamfer(radius: number, filter?: (c: CornerFinder) => CornerFinder): Drawing;

  // Returns the sketched version of the drawing, on a plane
  // Drawing.sketchOnPlane (method)
  sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
  sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;

  // Returns the sketched version of the drawing, on a face
  // Drawing.sketchOnFace (method)
  sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;

  // Drawing.punchHole (method)
  punchHole(shape: AnyShape, faceFinder: SingleFace, options?: {
          height?: number;
          origin?: Point;
          draftAngle?: number;
      }): AnyShape;

  // Formats the drawing as an SVG image
  // Drawing.toSVG (method)
  toSVG(margin?: number): string;

  // Returns the SVG viewbox that corresponds to this drawing
  // Drawing.toSVGViewBox (method)
  toSVGViewBox(margin?: number): string;

  // Formats the drawing as a list of SVG paths
  // Drawing.toSVGPaths (method)
  toSVGPaths(): string[] | string[][];

  // Drawing.offset (method)
  offset(distance: number, offsetConfig?: Offset2DConfig): Drawing;

  // Drawing.approximate (method)
  approximate(target: "svg" | "arcs", options?: ApproximationOptions): Drawing;

  blueprint

// DrawingPen is a helper class to draw in 2D
DrawingPen: export declare class DrawingPen extends BaseSketcher2d implements GenericSketcher<Drawing>

  // DrawingPen.constructor (constructor)
  constructor(origin?: Point2D);

  // Stop drawing and returns the sketch
  // DrawingPen.done (method)
  done(): Drawing;

  // Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
  // DrawingPen.close (method)
  close(): Drawing;

  // Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
  // DrawingPen.closeWithMirror (method)
  closeWithMirror(): Drawing;

  // Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first), change the corner between the last and the first segments and returns the sketch
  // DrawingPen.closeWithCustomCorner (method)
  closeWithCustomCorner(radius: number, mode?: "fillet" | "chamfer"): Drawing;

Edge: export declare class Edge extends _1DShape<TopoDS_Edge>

// With an EdgeFinder you can apply a set of filters to find specific edges within a shape
EdgeFinder: export declare class EdgeFinder extends Finder3d<Edge>

  // EdgeFinder.clone (method)
  clone(): EdgeFinder;

  // Filter to find edges that are in a certain direction
  // EdgeFinder.inDirection (method)
  inDirection(direction: Direction_2 | Point): this;

  // Filter to find edges of a certain length
  // EdgeFinder.ofLength (method)
  ofLength(length: number | ((l: number) => boolean)): this;

  // Filter to find edges that are of a cetain curve type
  // EdgeFinder.ofCurveType (method)
  ofCurveType(curveType: CurveType): this;

  // Filter to find edges that are parallel to a plane
  // EdgeFinder.parallelTo (method)
  parallelTo(plane: Plane | StandardPlane | Face): this;

  // Filter to find edges that within a plane
  // EdgeFinder.inPlane (method)
  inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;

  // Check if a particular element should be filtered or not according to the current finder
  // EdgeFinder.shouldKeep (method)
  shouldKeep(element: Edge): boolean;

  // EdgeFinder.applyFilter (method)
  protected applyFilter(shape: AnyShape): Edge[];

Face: export declare class Face extends Shape<TopoDS_Face>

  surface

  orientation

  // Face.flipOrientation (method)
  flipOrientation(): Face;

  geomType

  UVBounds

  // Face.pointOnSurface (method)
  pointOnSurface(u: number, v: number): Vector;

  // Face.uvCoordinates (method)
  uvCoordinates(point: Point): [number, number];

  // Face.normalAt (method)
  normalAt(locationVector?: Point): Vector;

  center

  // Face.outerWire (method)
  outerWire(): Wire;

  // Face.innerWires (method)
  innerWires(): Wire[];

  // Face.triangulation (method)
  triangulation(index0?: number): FaceTriangulation | null;

// With a FaceFinder you can apply a set of filters to find specific faces within a shape
FaceFinder: export declare class FaceFinder extends Finder3d<Face>

  // FaceFinder.clone (method)
  clone(): FaceFinder;

  // Filter to find faces that are parallel to plane or another face
  // FaceFinder.parallelTo (method)
  parallelTo(plane: Plane | StandardPlane | Face): this;

  // Filter to find faces that are of a cetain surface type
  // FaceFinder.ofSurfaceType (method)
  ofSurfaceType(surfaceType: SurfaceType): this;

  // Filter to find faces that are contained in a plane
  // FaceFinder.inPlane (method)
  inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;

  // Check if a particular element should be filtered or not according to the current finder
  // FaceFinder.shouldKeep (method)
  shouldKeep(element: Face): boolean;

  // FaceFinder.applyFilter (method)
  protected applyFilter(shape: AnyShape): Face[];

// The FaceSketcher allows you to sketch on a face that is not planar, for instance the sides of a cylinder
FaceSketcher: export declare class FaceSketcher extends BaseSketcher2d implements GenericSketcher<Sketch>

  face: Face

  // FaceSketcher.constructor (constructor)
  constructor(face: Face, origin?: Point2D);

  // FaceSketcher.buildWire (method)
  protected buildWire(): Wire;

  // Stop drawing and returns the sketch
  // FaceSketcher.done (method)
  done(): Sketch;

  // Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
  // FaceSketcher.close (method)
  close(): Sketch;

  // Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
  // FaceSketcher.closeWithMirror (method)
  closeWithMirror(): Sketch;

  // Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first), add a fillet between the last and the first segments and returns the sketch
  // FaceSketcher.closeWithCustomCorner (method)
  closeWithCustomCorner(radius: number | ((f: Curve2D, s: Curve2D) => Curve2D[]), mode?: "fillet" | "chamfer" | "dogbone"): Sketch;

LinearPhysicalProperties: export declare class LinearPhysicalProperties extends PhysicalProperties

  length

MeshShape: export declare class MeshShape extends WrappingObj<ManifoldInstance> implements Shape3DLike<MeshShape, MeshShapeMesh, MeshShape, number>

  // MeshShape.constructor (constructor)
  constructor(manifoldShape: ManifoldInstance);

  // MeshShape.clone (method)
  clone(): MeshShape;

  // MeshShape.fuse (method)
  fuse(other: MeshShape, _options?: any): MeshShape;

  // MeshShape.cut (method)
  cut(other: MeshShape, _options?: any): MeshShape;

  // MeshShape.intersect (method)
  intersect(other: MeshShape): MeshShape;

  // MeshShape.translate (method)
  translate(xDist: number, yDist: number, zDist: number): MeshShape;
  translate(vector: Point): MeshShape;

  // MeshShape.translateX (method)
  translateX(distance: number): MeshShape;

  // MeshShape.translateY (method)
  translateY(distance: number): MeshShape;

  // MeshShape.translateZ (method)
  translateZ(distance: number): MeshShape;

  // MeshShape.rotate (method)
  rotate(angle: number, position?: Point, direction?: Point): MeshShape;
  rotate(vector: Point): MeshShape;

  // MeshShape.scale (method)
  scale(scale: number, center?: Point): MeshShape;

  // MeshShape.mirror (method)
  mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): MeshShape;

  // MeshShape.simplify (method)
  simplify(tolerance?: number): MeshShape;

  // MeshShape.refine (method)
  refine(n: number): MeshShape;

  // MeshShape.refineToLength (method)
  refineToLength(length: number): MeshShape;

  // MeshShape.refineToTolerance (method)
  refineToTolerance(tolerance: number): MeshShape;

  // MeshShape.hull (method)
  hull(): MeshShape;

  // MeshShape.asOriginal (method)
  asOriginal(): MeshShape;

  // MeshShape.mesh (method)
  mesh(): MeshShapeMesh;

  boundingBox

  // MeshShape.volume (method)
  volume(): number;

  // MeshShape.surfaceArea (method)
  surfaceArea(): number;

  // MeshShape.numTri (method)
  numTri(): number;

  // MeshShape.numVert (method)
  numVert(): number;

  // MeshShape.numEdge (method)
  numEdge(): number;

  isEmpty

  // Exports the mesh shape as an STL file Blob
  // MeshShape.blobSTL (method)
  blobSTL({ binary }?: {
          binary?: boolean | undefined;
      }): Blob;

Plane: export declare class Plane

  oc: OpenCascadeInstance

  xDir: Vector

  yDir: Vector

  zDir: Vector

  // Plane.constructor (constructor)
  constructor(origin: Point, xDirection?: Point | null, normal?: Point);

  // Plane.delete (method)
  delete(): void;

  // Plane.clone (method)
  clone(): Plane;

  origin

  // Plane.translateTo (method)
  translateTo(point: Point): Plane;

  // Plane.translate (method)
  translate(xDist: number, yDist: number, zDist: number): Plane;
  translate(vector: Point): Plane;

  // Plane.translateX (method)
  translateX(xDist: number): Plane;

  // Plane.translateY (method)
  translateY(yDist: number): Plane;

  // Plane.translateZ (method)
  translateZ(zDist: number): Plane;

  // Plane.pivot (method)
  pivot(angle: number, direction?: Direction): Plane;

  // Plane.rotate2DAxes (method)
  rotate2DAxes(angle: number): Plane;

  // Plane.setOrigin2d (method)
  setOrigin2d(x: number, y: number): void;

  // Plane.toLocalCoords (method)
  toLocalCoords(vec: Vector): Vector;

  // Plane.toWorldCoords (method)
  toWorldCoords(v: Point): Vector;

ProjectionCamera: export declare class ProjectionCamera extends WrappingObj<gp_Ax2>

  // ProjectionCamera.constructor (constructor)
  constructor(position?: Point, direction?: Point, xAxis?: Point);

  position

  direction

  xAxis

  yAxis

  // ProjectionCamera.autoAxes (method)
  autoAxes(): void;

  // ProjectionCamera.setPosition (method)
  setPosition(position: Point): this;

  // ProjectionCamera.setXAxis (method)
  setXAxis(xAxis: Point): this;

  // ProjectionCamera.setYAxis (method)
  setYAxis(yAxis: Point): this;

  // ProjectionCamera.lookAt (method)
  lookAt(shape: {
          boundingBox: BoundingBox;
      } | Point): this;
