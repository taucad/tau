# replicad — Classes

26 top-level symbols. Signatures are verbatim typescript.

_1DShape: export declare abstract class _1DShape<Type extends TopoDS_Shape> extends Shape<Type>

  readonly repr: string

  readonly curve: Curve

  readonly startPoint: Vector

  readonly endPoint: Vector

  // _1DShape.tangentAt (method)
  tangentAt(position?: number): Vector;

  // _1DShape.pointAt (method)
  pointAt(position?: number): Vector;

  readonly isClosed: boolean

  readonly isPeriodic: boolean

  readonly period: number

  readonly geomType: CurveType

  readonly length: number

  readonly orientation: "forward" | "backward"

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

  // Cuts this shape with a plane and retains one of its half-spaces
  // _3DShape.cutPlane (method)
  cutPlane(plane?: Plane | PlaneName, offset?: number, keep?: PlaneSide): Solid | Compound | null;

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
  shell(thickness: number, finderFcn: FinderFunction<FaceFinder, AnyShape>, tolerance?: number): Shape3D;

  // Creates a new shapes with some edges filletted, as specified in the radius config
  // Remarks: If the radius is a filter finder object (with an EdgeFinder as filter, and a radius to specifiy the fillet radius), the fillet will only be applied to the edges as selected by the finder. The finder will be deleted unless it is explicitly specified to `keep` it. If the radius is a number all the edges will be filletted. If the radius is a function edges will be filletted according to the value returned by the function (0 or null will not add any fillet).
  // _3DShape.fillet (method)
  fillet(radiusConfig: RadiusConfig<FilletRadius>, filter?: FinderFunction<EdgeFinder, AnyShape>): Shape3D;

  // Creates a new shapes with some edges chamfered, as specified in the radius config
  // Remarks: If the radius is a filter finder object (with an EdgeFinder as filter, and a radius to specifiy the chamfer radius), the fillet will only be applied to the edges as selected by the finder. The finder will be deleted unless it is explicitly specified to `keep` it. If the radius is a number all the edges will be chamfered. If the radius is a function edges will be chamfered according to the value returned by the function (0 or null will not add any chamfer).
  // _3DShape.chamfer (method)
  chamfer(radiusConfig: RadiusConfig<ChamferRadius>, filter?: FinderFunction<EdgeFinder, AnyShape>): Shape3D;

  // Applies a draft angle to selected faces of the shape
  // Remarks: A draft angle is a taper applied to faces, commonly used in moulding and casting to allow parts to be released from a mould. The selected faces are tilted by the given angle relative to the neutral plane. The face finder function receives a `FaceFinder` and should return it with the desired filters applied to select which faces to draft. The neutral plane defines the reference from which the draft angle is measured — faces are unchanged where they intersect this plane and taper away from it.
  // _3DShape.draft (method)
  draft(angle: number, faceFinder: FinderFunction<FaceFinder, AnyShape>, neutralPlane?: Plane | PlaneName): Shape3D;

AssemblyExporter: export declare class AssemblyExporter extends WrappingObj<TDocStd_Document>

BaseSketcher2d: export declare class BaseSketcher2d

  pointer: Point2D

  firstPoint: Point2D

  pendingCurves: Curve2D[]

  // BaseSketcher2d.constructor (constructor)
  constructor(origin?: Point2D);

  // Returns the current pen position as [x, y] coordinates
  // Remarks: Added By Ben Harper 5/12/2025
  readonly penPosition: Point2D

  // Returns the current pen angle in degrees
  // Remarks: The angle represents the tangent direction at the current pen position, based on the last drawing operation (line, arc, bezier, etc.). Returns 0 if nothing has been drawn yet.
  readonly penAngle: number

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
// Remarks: You should create them by "sketching" with a `BlueprintSketcher`
Blueprint: export declare class Blueprint implements DrawingInterface

  curves: Curve2D[]

  // Blueprint.constructor (constructor)
  constructor(curves: Curve2D[]);

  // Blueprint.delete (method)
  delete(): void;

  // Blueprint.clone (method)
  clone(): Blueprint;

  readonly repr: string

  readonly boundingBox: BoundingBox2d

  readonly orientation: "clockwise" | "counterClockwise"

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
  // Remarks: The scale mode corresponds to the way the coordinates of the drawing are interpreted match with the face: - `original` uses global coordinates (1mm in the drawing is 1mm on the face). This is the default, but currently supported only for planar and circular faces - `bounds` normalises the UV parameters on the face to [0,1] intervals. - `native` uses the default UV parameters of opencascade
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

  readonly firstPoint: Point2D

  readonly lastPoint: Point2D

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

  readonly repr: string

  // Blueprints.clone (method)
  clone(): Blueprints;

  readonly boundingBox: BoundingBox2d

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
  // Remarks: The scale mode corresponds to the way the coordinates of the drawing are interpreted match with the face: - `original` uses global coordinates (1mm in the drawing is 1mm on the face). This is the default, but currently supported only for planar and circular faces - `bounds` normalises the UV parameters on the face to [0,1] intervals. - `native` uses the default UV parameters of opencascade
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

  readonly repr: string

  readonly bounds: [SimplePoint, SimplePoint]

  readonly center: SimplePoint

  readonly width: number

  readonly height: number

  readonly depth: number

  // BoundingBox.add (method)
  add(other: BoundingBox): void;

  // BoundingBox.isOut (method)
  isOut(other: BoundingBox): boolean;

BoundingBox2d: export declare class BoundingBox2d extends WrappingObj<Bnd_Box2d>

  // BoundingBox2d.constructor (constructor)
  constructor(wrapped?: Bnd_Box2d);

  readonly repr: string

  readonly bounds: [Point2D, Point2D]

  readonly center: Point2D

  readonly width: number

  readonly height: number

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

  readonly boundingBox: BoundingBox2d

  readonly repr: string

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
  // Remarks: The scale mode corresponds to the way the coordinates of the drawing are interpreted match with the face: - `original` uses global coordinates (1mm in the drawing is 1mm on the face). This is the default, but currently supported only for planar and circular faces - `bounds` normalises the UV parameters on the face to [0,1] intervals. - `native` uses the default UV parameters of opencascade
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
// Remarks: All the sketches should share the same base face (or surface) Ideally generated from a `CompoundBlueprint`
CompoundSketch: export declare class CompoundSketch implements SketchInterface

  sketches: Sketch[]

  // CompoundSketch.constructor (constructor)
  constructor(sketches: Sketch[]);

  // CompoundSketch.delete (method)
  delete(): void;

  readonly outerSketch: Sketch

  readonly innerSketches: Sketch[]

  readonly wires: AnyShape

  // Transforms the lines into a face
  // CompoundSketch.face (method)
  face(): Face;

  // Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
  // Remarks: You can define another extrusion direction or origin, It is also possible to twist extrude with an angle (in degrees), or to give a profile to the extrusion (the endFactor will scale the face, and the profile will define how the scale is applied (either linarly or with a s-shape).
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
  // Remarks: You can also define a `startPoint` for the loft (that will be placed before this sketch) and an `endPoint` after the last one. You can also define if you want the loft to result in a ruled surface. Note that all sketches will be deleted by this operation
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

  readonly repr: string

  readonly curveType: CurveType

  readonly startPoint: Vector

  readonly endPoint: Vector

  // Curve.pointAt (method)
  pointAt(position?: number): Vector;

  // Curve.tangentAt (method)
  tangentAt(position?: number): Vector;

  readonly isClosed: boolean

  readonly isPeriodic: boolean

  readonly period: number

Curve2D: export declare class Curve2D extends WrappingObj<Geom2d_Curve>

  // Curve2D.constructor (constructor)
  constructor(handle: Geom2d_Curve);

  readonly boundingBox: BoundingBox2d

  readonly repr: string

  readonly innerCurve: Geom2d_Curve

  // Curve2D.serialize (method)
  serialize(): string;

  // Curve2D.value (method)
  value(parameter: number): Point2D;

  readonly firstPoint: Point2D

  readonly lastPoint: Point2D

  readonly firstParameter: number

  readonly lastParameter: number

  // Curve2D.adaptor (method)
  adaptor(): Geom2dAdaptor_Curve;

  readonly geomType: CurveType

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

  readonly boundingBox: BoundingBox2d

  // Drawing.stretch (method)
  stretch(ratio: number, direction: Point2D, origin: Point2D): Drawing;

  readonly repr: string

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
  fillet(radius: number, filter?: FinderFunction<CornerFinder, Shape2D>): Drawing;

  // Creates a new drawing with some corners filletted, as specified by the radius and the corner finder function
  // Drawing.chamfer (method)
  chamfer(radius: number, filter?: FinderFunction<CornerFinder, Shape2D>): Drawing;

  // Returns the sketched version of the drawing, on a plane
  // Drawing.sketchOnPlane (method)
  sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
  sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;

  // Returns the sketched version of the drawing, on a face
  // Remarks: The scale mode corresponds to the way the coordinates of the drawing are interpreted match with the face: - `original` uses global coordinates (1mm in the drawing is 1mm on the face). This is the default, but currently supported only for planar and circular faces - `bounds` normalises the UV parameters on the face to [0,1] intervals. - `native` uses the default UV parameters of opencascade
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

  readonly blueprint: Blueprint

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
  inDirection(direction: Direction): this;

  // Filter to find edges of a certain length
  // EdgeFinder.ofLength (method)
  ofLength(length: number | ((l: number) => boolean)): this;

  // Filter to find edges that are of a cetain curve type
  // EdgeFinder.ofCurveType (method)
  ofCurveType(curveType: CurveType): this;

  // Filter to find edges that are parallel to a plane
  // Remarks: Note that this will work only in lines (but the method does not check this assumption).
  // EdgeFinder.parallelTo (method)
  parallelTo(plane: Plane | StandardPlane | Face): this;

  // Filter to find edges that within a plane
  // Remarks: Note that this will work only in lines (but the method does not check this assumption).
  // EdgeFinder.inPlane (method)
  inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;

  // Check if a particular element should be filtered or not according to the current finder
  // EdgeFinder.shouldKeep (method)
  shouldKeep(element: Edge): boolean;

  // EdgeFinder.applyFilter (method)
  protected applyFilter(shape: AnyShape): Edge[];

Face: export declare class Face extends Shape<TopoDS_Face>

  readonly surface: Surface

  readonly orientation: "forward" | "backward"

  // Face.flipOrientation (method)
  flipOrientation(): Face;

  readonly geomType: SurfaceType

  readonly UVBounds: FaceUVBounds

  // Face.pointOnSurface (method)
  pointOnSurface(u: number, v: number): Vector;

  // Face.uvCoordinates (method)
  uvCoordinates(point: Point): [number, number];

  // Face.normalAt (method)
  normalAt(locationVector?: Point): Vector;

  readonly center: Vector

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
  // Remarks: Note that this will work only in planar faces (but the method does not check this assumption).
  // FaceFinder.parallelTo (method)
  parallelTo(plane: Plane | StandardPlane | Face): this;

  // Filter to find faces that are of a cetain surface type
  // FaceFinder.ofSurfaceType (method)
  ofSurfaceType(surfaceType: SurfaceType): this;

  // Filter to find faces that are contained in a plane
  // Remarks: Note that this will work only in planar faces (but the method does not check this assumption).
  // FaceFinder.inPlane (method)
  inPlane(inputPlane: PlaneName | Plane, origin?: Point | number): this;

  // Check if a particular element should be filtered or not according to the current finder
  // FaceFinder.shouldKeep (method)
  shouldKeep(element: Face): boolean;

  // FaceFinder.applyFilter (method)
  protected applyFilter(shape: AnyShape): Face[];

// The FaceSketcher allows you to sketch on a face that is not planar, for instance the sides of a cylinder
// Remarks: The coordinates passed to the methods corresponds to normalised distances on this surface, between 0 and 1 in both direction. Note that if you are drawing on a closed surface (typically a revolution surface or a cylinder), the first parameters represents the angle and can be smaller than 0 or bigger than 1.
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

  readonly length: number
