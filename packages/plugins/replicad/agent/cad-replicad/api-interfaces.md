# replicad — Interfaces

26 top-level symbols. Signatures are verbatim typescript.

BooleanOperationOptions: export declare interface BooleanOperationOptions

  optimisation?: "none" | "commonFace" | "sameFace"

BSplineApproximationConfig: export declare interface BSplineApproximationConfig

  tolerance?: number

  degMax?: number

  degMin?: number

  smoothing?: null | [number, number, number]

CurveLike: export declare interface CurveLike

  // CurveLike.delete (method)
  delete(): void;

  // CurveLike.Value (method)
  Value(v: number): gp_Pnt;

  // CurveLike.IsPeriodic (method)
  IsPeriodic(): boolean;

  // CurveLike.Period (method)
  Period(): number;

  // CurveLike.IsClosed (method)
  IsClosed(): boolean;

  // CurveLike.FirstParameter (method)
  FirstParameter(): number;

  // CurveLike.LastParameter (method)
  LastParameter(): number;

  // CurveLike.GetType (method)
  GetType?(): any;

  // CurveLike.D1 (method)
  D1(v: number, p: gp_Pnt, vPrime: gp_Vec): void;

Deletable: export declare interface Deletable

  delete: () => void

DrawingInterface: export declare interface DrawingInterface

  // DrawingInterface.clone (method)
  clone(): DrawingInterface;

  // DrawingInterface.delete (method)
  delete(): void;

  boundingBox: BoundingBox2d

  // DrawingInterface.stretch (method)
  stretch(ratio: number, direction: Point2D, origin: Point2D): DrawingInterface;

  // DrawingInterface.rotate (method)
  rotate(angle: number, center: Point2D): DrawingInterface;

  // DrawingInterface.translate (method)
  translate(xDist: number, yDist: number): DrawingInterface;
  translate(translationVector: Point2D): DrawingInterface;

  // Returns the mirror image of this drawing made with a single point (in center mode, the default, or a plane, (plane mode, with both direction and origin of the plane)
  // DrawingInterface.mirror (method)
  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: "center" | "plane"): DrawingInterface;

  // Returns the sketched version of the drawing, on a plane
  // DrawingInterface.sketchOnPlane (method)
  sketchOnPlane(inputPlane: Plane): SketchInterface | Sketches;
  sketchOnPlane(inputPlane?: PlaneName, origin?: Point | number): SketchInterface | Sketches;
  sketchOnPlane(inputPlane?: PlaneName | Plane, origin?: Point | number): SketchInterface | Sketches;

  // Returns the sketched version of the drawing, on a face
  // Remarks: The scale mode corresponds to the way the coordinates of the drawing are interpreted match with the face: - `original` uses global coordinates (1mm in the drawing is 1mm on the face). This is the default, but currently supported only for planar and circular faces - `bounds` normalises the UV parameters on the face to [0,1] intervals. - `native` uses the default UV parameters of opencascade
  // DrawingInterface.sketchOnFace (method)
  sketchOnFace(face: Face, scaleMode: ScaleMode): SketchInterface | Sketches;

  // Formats the drawing as an SVG image
  // DrawingInterface.toSVG (method)
  toSVG(margin: number): string;

  // Returns the SVG viewbox that corresponds to this drawing
  // DrawingInterface.toSVGViewBox (method)
  toSVGViewBox(margin?: number): string;

  // Formats the drawing as a list of SVG paths
  // DrawingInterface.toSVGPaths (method)
  toSVGPaths(): string[] | string[][];

ExtrusionProfile: export declare interface ExtrusionProfile

  profile?: "s-curve" | "linear"

  endFactor?: number

FaceTriangulation: export declare interface FaceTriangulation

  vertices: number[]

  trianglesIndexes: number[]

  verticesNormals: number[]

FaceUVBounds: export declare interface FaceUVBounds

  uMin: number

  uMax: number

  vMin: number

  vMax: number

// Sketchers allow the user to draw a two dimentional shape using segment of curve
GenericSketcher: export declare interface GenericSketcher<ReturnType>

  // Changes the point to start your drawing from
  // GenericSketcher.movePointerTo (method)
  movePointerTo(point: Point2D): this;

  // Draws a line from the current point to the point given in argument
  // GenericSketcher.lineTo (method)
  lineTo(point: Point2D): this;

  // Draws a line at the horizontal distance xDist and the vertical distance yDist of the current point
  // GenericSketcher.line (method)
  line(xDist: number, yDist: number): this;

  // Draws a vertical line of length distance from the current point
  // GenericSketcher.vLine (method)
  vLine(distance: number): this;

  // Draws an horizontal line of length distance from the current point
  // GenericSketcher.hLine (method)
  hLine(distance: number): this;

  // Draws a vertical line to the y coordinate
  // GenericSketcher.vLineTo (method)
  vLineTo(yPos: number): this;

  // Draws an horizontal line to the x coordinate
  // GenericSketcher.hLineTo (method)
  hLineTo(xPos: number): this;

  // Draws a line from the current point to the point defined in polar coordiates, of radius r and angle theta (in degrees) from the origin
  // GenericSketcher.polarLineTo (method)
  polarLineTo([r, theta]: [number, number]): this;

  // Draws a line from the current point to the point defined in polar coordiates, of radius r and angle theta (in degrees) from the current point
  // GenericSketcher.polarLine (method)
  polarLine(r: number, theta: number): this;

  // Draws a line from the current point as a tangent to the previous part of curve drawn
  // GenericSketcher.tangentLine (method)
  tangentLine(distance: number): this;

  // Draws an arc of circle by defining its end point and a third point through which the arc will pass
  // GenericSketcher.threePointsArcTo (method)
  threePointsArcTo(end: Point2D, innerPoint: Point2D): this;

  // Draws an arc of circle by defining its end point and a third point through which the arc will pass
  // GenericSketcher.threePointsArc (method)
  threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;

  // Draws an arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point
  // GenericSketcher.sagittaArcTo (method)
  sagittaArcTo(end: Point2D, sagitta: number): this;

  // Draws an arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point.The end point is defined by its horizontal and vertical distances from the start point
  // GenericSketcher.sagittaArc (method)
  sagittaArc(xDist: number, yDist: number, sagitta: number): this;

  // Draws a vertical arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point.The end point is defined by its vertical distance from the start point
  // GenericSketcher.vSagittaArc (method)
  vSagittaArc(distance: number, sagitta: number): this;

  // Draws an horizontal arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point.The end point is defined by its horizontal distance from the start point
  // GenericSketcher.hSagittaArc (method)
  hSagittaArc(distance: number, sagitta: number): this;

  // Draws an arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point
  // GenericSketcher.bulgeArcTo (method)
  bulgeArcTo(end: Point2D, bulge: number): this;

  // Draws an arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point in units of half the chord
  // GenericSketcher.bulgeArc (method)
  bulgeArc(xDist: number, yDist: number, bulge: number): this;

  // Draws a vertical arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point in units of half the chord
  // GenericSketcher.vBulgeArc (method)
  vBulgeArc(distance: number, bulge: number): this;

  // Draws an horizontal arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point in units of half the chord
  // GenericSketcher.hBulgeArc (method)
  hBulgeArc(distance: number, bulge: number): this;

  // Draws an arc of circle from the current point as a tangent to the previous part of curve drawn
  // GenericSketcher.tangentArcTo (method)
  tangentArcTo(end: Point2D): this;

  // Draws an arc of circle from the current point as a tangent to the previous part of curve drawn.The end point is defined by its horizontal and vertical distances from the start point
  // GenericSketcher.tangentArc (method)
  tangentArc(xDist: number, yDist: number): this;

  // Draws an arc of ellipse by defining its end point and an ellipse
  // Remarks: The shape of the ellipse is defined by both its radiuses, its angle relative to the current coordinat system, as well as the long and sweep flags (as defined for SVG paths)
  // GenericSketcher.ellipseTo (method)
  ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;

  // Draws an arc of ellipse by defining its end point and an ellipse
  // Remarks: The shape of the ellipse is defined by both its radiuses, its angle relative to the current coordinat system, as well as the long and sweep flags (as defined for SVG paths)
  // GenericSketcher.ellipse (method)
  ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line)
  // Remarks: The sweep flag is to be understood as defined for SVG paths.
  // GenericSketcher.halfEllipseTo (method)
  halfEllipseTo(end: Point2D, radius: number, sweep: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line).The end point is defined by distances from he start point
  // Remarks: The sweep flag is to be understood as defined for SVG paths.
  // GenericSketcher.halfEllipse (method)
  halfEllipse(xDist: number, yDist: number, radius: number, sweep: boolean): this;

  // Draws a generic bezier curve to the end point, going using a set of control points
  // Remarks: This is the generic definition of a bézier curve, you might want to use either the quadratic or cubic (most common) version, unless you know exactly what you are aiming at.
  // GenericSketcher.bezierCurveTo (method)
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;

  // Draws a quadratic bezier curve to the end point, using the single control point
  // GenericSketcher.quadraticBezierCurveTo (method)
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, using the start and end control point to define its shape
  // Remarks: If you are struggling setting your control points, the smoothSpline might be better for your needs.
  // GenericSketcher.cubicBezierCurveTo (method)
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // Remarks: It will base its first control point so that its tangent is the same than the previous segment. The control point relative to the end is by default set to be in the direction of the straight line between start and end. You can specifiy the `endSkew` either as an angle (in degrees) to this direction, or as an absolute direction in the coordinate system (a Point). The start- and end- factors decide on how far the control point is from the start and end point. At a factor of 1, the distance corresponds to a quarter of the straight line distance.
  // GenericSketcher.smoothSplineTo (method)
  smoothSplineTo(end: Point2D, config?: SplineConfig): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // Remarks: It will base its first control point so that its tangent is the same than the previous segment. You can force another tangent by defining `startTangent`. You can configure the tangent of the end point by configuring the `endTangent`, either as "symmetric" to reproduce the start angle, as an angle from the X axis (in the coordinate system) or a 2d direction (still in the coordinate system. The start- and end- factors decide on how far the control point is from the start and end point. At a factor of 1, the distance corresponds to a quarter of the straight line distance.
  // GenericSketcher.smoothSpline (method)
  smoothSpline(xDist: number, yDist: number, splineConfig: SplineConfig): this;

  // Stop drawing and returns the sketch
  // GenericSketcher.done (method)
  done(): ReturnType;

  // Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
  // GenericSketcher.close (method)
  close(): ReturnType;

  // Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
  // GenericSketcher.closeWithMirror (method)
  closeWithMirror(): ReturnType;

GenericSweepConfig: export declare interface GenericSweepConfig

  frenet?: boolean

  auxiliarySpine?: Wire | Edge

  law?: null | Law_Function

  transitionMode?: "right" | "transformed" | "round"

  withContact?: boolean

  support?: TopoDS_Shape

  forceProfileSpineOthogonality?: boolean

LoftConfig: export declare interface LoftConfig

  ruled?: boolean

  startPoint?: Point

  endPoint?: Point

MeshOptions: export declare interface MeshOptions

  tolerance?: number

  angularTolerance?: number

MeshShapeMesh: export declare interface MeshShapeMesh

  vertices: number[]

  triangles: number[]

  normals: number[]

  vertProperties: number[]

  numProp: number

// A deterministic ownership scope for OpenCascade values (and other objects with a `delete()` method)
// Remarks: `scope(value)` registers a value the scope owns and returns it; `scope.keep(value)` takes it back out (the caller now owns it), and `scope.dispose()` deletes everything still owned, last registered first, skipping values that were already deleted. Dispose a scope in a `finally` block, or declare it with `using` where explicit resource management is available, so that a throw cannot leak what it owns: ```ts const r = ocScope(); try { const builder = r(new oc.BRepBuilderAPI_MakeFace(plane)); return builder.Face(); } finally { r.dispose(); } ``` Unlike {@link GCWithScope}, nothing waits for the garbage collector, which never runs during a synchronous model build.
OcScope: export declare interface OcScope

  // Releases a value from the scope
  // OcScope.keep (method)
  keep<T extends Deletable | null | undefined>(value: T): T;

  // Deletes every value the scope still owns
  // OcScope.dispose (method)
  dispose(): void;

// A host cache
// Remarks: The library calls `operation` only for calls made by user code: calls made while an operation runs (internal composition) go straight to the implementation, except inside a user callback that the library invokes (a sweep factory), where user code is routed again. Calls the cache makes itself go through the routing too; wrap them in `bypassOperationCache`.
OperationCache: export declare interface OperationCache

  // OperationCache.operation (method)
  operation<T>(request: OperationRequest<T>): T;

  // OperationCache.step (method)
  step<T>(request: OperationStep<T>): T;

  // Topological elements that user code took from `owner` (the `edges`, `faces`, `wires` and `solids` getters, a finder's `find`)
  // OperationCache.elements (method)
  elements(owner: object, kind: string, elements: readonly object[], ordinals: () => readonly number[] | undefined): void;

// One public operation, described lazily
OperationRequest: export declare interface OperationRequest<T>

  // `Class.method`, `set:Class.property` or the exported function name
  readonly op: string

  readonly effect: OperationEffect

  // `this` of a method
  readonly receiver: object | undefined

  // The arguments as passed
  // Remarks: Do not identify a finder instance (`EdgeFinder`, `FaceFinder`, `CornerFinder`) by its object identity: its clause methods mutate it without being routed, so the same object can select differently from one call to the next. Describe it by its clauses, or let the operation's step key the selection.
  readonly args: readonly unknown[]

  // Positions of finder arguments among `args`
  readonly finderArgs?: readonly number[]

  // The result is a mutable builder (a pen from `draw()`)
  readonly returnsBuilder?: boolean

  // The operation's errors are a deterministic function of its inputs (it calls no user code that the inputs do not describe), so a cache may reuse a failure
  readonly deterministicErrors?: boolean

  // For a builder (pen, sketcher) the cache has not seen
  readonly freshState?: () => readonly unknown[] | undefined

  // Runs the operation
  // OperationRequest.compute (method)
  compute(): T;

  // Deletes what the operation would have deleted
  // OperationRequest.consume (method)
  consume?(): void;

// The part of an operation that depends on a callback the cache could not describe up front (a sweep factory, a finder predicate)
OperationStep: export declare interface OperationStep<T>

  readonly op: string

  readonly receiver: object | undefined

  // See {@link OperationRequest.deterministicErrors}
  readonly deterministicErrors?: boolean

  // The inputs known after the callback ran (selected element ordinals and radii, the factory's sketch), or `undefined` if they cannot be described (a selected element is not part of the receiver)
  // OperationStep.values (method)
  values(): readonly unknown[] | undefined;

  // OperationStep.compute (method)
  compute(): T;

  // OperationStep.consume (method)
  consume?(): void;

PlaneConfig: export declare interface PlaneConfig

  plane?: PlaneName | Plane

  origin?: Point | number

PlaneFace: export declare interface PlaneFace

  // PlaneFace.pointOnSurface (method)
  pointOnSurface(u: number, v: number): Vector;

  // PlaneFace.normalAt (method)
  normalAt(point: Point): Vector;

// Pieces grouped by their position relative to an oriented plane
PlaneSplitResult: export declare interface PlaneSplitResult<T>

  positive: T | null

  negative: T | null

  on: T | null

Shape3DLike: export declare interface Shape3DLike<ShapeT, MeshT, OtherT = ShapeT, MeshOptionsT = any>

  // Shape3DLike.fuse (method)
  fuse(other: ShapeT, options?: any): ShapeT;

  // Shape3DLike.cut (method)
  cut(other: ShapeT, options?: any): ShapeT;

  // Shape3DLike.intersect (method)
  intersect(other: OtherT): ShapeT;

  // Shape3DLike.translate (method)
  translate(xDist: number, yDist: number, zDist: number): ShapeT;
  translate(vector: Point): ShapeT;

  // Shape3DLike.translateX (method)
  translateX(distance: number): ShapeT;

  // Shape3DLike.translateY (method)
  translateY(distance: number): ShapeT;

  // Shape3DLike.translateZ (method)
  translateZ(distance: number): ShapeT;

  // Shape3DLike.rotate (method)
  rotate(angle: number, position?: Point, direction?: Direction): ShapeT;

  // Shape3DLike.scale (method)
  scale(scale: number, center?: Point): ShapeT;

  // Shape3DLike.mirror (method)
  mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): ShapeT;

  // Shape3DLike.mesh (method)
  mesh(options?: MeshOptionsT): MeshT;

  readonly boundingBox: BoundingBox

ShapeEdgeMesh: export declare interface ShapeEdgeMesh

  lines: Float32Array

  edgeGroups: {
          start: number;
          count: number;
          edgeId: number;
      }[]

ShapeMesh: export declare interface ShapeMesh

  triangles: Uint32Array

  vertices: Float32Array

  normals: Float32Array

  faceGroups: {
          start: number;
          count: number;
          faceId: number;
      }[]

SketchInterface: export declare interface SketchInterface

  // Transforms the lines into a face
  // SketchInterface.face (method)
  face(): Face;

  // Revolves the drawing on an axis (defined by its direction and an origin (defaults to the sketch origin)
  // SketchInterface.revolve (method)
  revolve(revolutionAxis?: Point, config?: {
          origin?: Point;
          angle?: number;
      }): Shape3D;

  // Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
  // Remarks: You can define another extrusion direction or origin, It is also possible to twist extrude with an angle (in degrees), or to give a profile to the extrusion (the endFactor will scale the face, and the profile will define how the scale is applied (either linarly or with a s-shape).
  // SketchInterface.extrude (method)
  extrude(extrusionDistance: number, extrusionConfig?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;

  // Loft between this sketch and another sketch (or an array of them)
  // Remarks: You can also define a `startPoint` for the loft (that will be placed before this sketch) and an `endPoint` after the last one. You can also define if you want the loft to result in a ruled surface. Note that all sketches will be deleted by this operation
  // SketchInterface.loftWith (method)
  loftWith(otherSketches: this | this[], loftConfig: LoftConfig, returnShell?: boolean): Shape3D;

STLExportOptions: export declare interface STLExportOptions extends MeshOptions

  binary?: boolean

TopologyMap: export declare interface TopologyMap

  vertex: TopoDS_Vertex

  edge: TopoDS_Edge

  wire: TopoDS_Wire

  face: TopoDS_Face

  shell: TopoDS_Shell

  solid: TopoDS_Solid

  solidCompound: TopoDS_CompSolid

  compound: TopoDS_Compound

  shape: TopoDS_Shape
