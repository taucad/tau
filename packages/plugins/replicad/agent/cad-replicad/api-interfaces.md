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

  profile: "s-curve" | "linear"

  endFactor: number

FaceTriangulation: export declare interface FaceTriangulation

  vertices: number[]

  trianglesIndexes: number[]

  verticesNormals: number[]

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
  // GenericSketcher.ellipseTo (method)
  ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;

  // Draws an arc of ellipse by defining its end point and an ellipse
  // GenericSketcher.ellipse (method)
  ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line)
  // GenericSketcher.halfEllipseTo (method)
  halfEllipseTo(end: Point2D, radius: number, sweep: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line).The end point is defined by distances from he start point
  // GenericSketcher.halfEllipse (method)
  halfEllipse(xDist: number, yDist: number, radius: number, sweep: boolean): this;

  // Draws a generic bezier curve to the end point, going using a set of control points
  // GenericSketcher.bezierCurveTo (method)
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;

  // Draws a quadratic bezier curve to the end point, using the single control point
  // GenericSketcher.quadraticBezierCurveTo (method)
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, using the start and end control point to define its shape
  // GenericSketcher.cubicBezierCurveTo (method)
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // GenericSketcher.smoothSplineTo (method)
  smoothSplineTo(end: Point2D, config?: SplineConfig): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
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
  rotate(angle: number, position?: Point, direction?: Point): ShapeT;

  // Shape3DLike.scale (method)
  scale(scale: number, center?: Point): ShapeT;

  // Shape3DLike.mirror (method)
  mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): ShapeT;

  // Shape3DLike.mesh (method)
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
  // SketchInterface.face (method)
  face(): Face;

  // Revolves the drawing on an axis (defined by its direction and an origin (defaults to the sketch origin)
  // SketchInterface.revolve (method)
  revolve(revolutionAxis?: Point, config?: {
          origin?: Point;
          angle?: number;
      }): Shape3D;

  // Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
  // SketchInterface.extrude (method)
  extrude(extrusionDistance: number, extrusionConfig?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;

  // Loft between this sketch and another sketch (or an array of them)
  // SketchInterface.loftWith (method)
  loftWith(otherSketches: this | this[], loftConfig: LoftConfig, returnShell?: boolean): Shape3D;
