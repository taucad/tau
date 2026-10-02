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
  // Remarks: The scale mode corresponds to the way the coordinates of the drawing are
interpreted match with the face:

- `original` uses global coordinates (1mm in the drawing is 1mm on the
  face). This is the default, but currently supported only for planar
  and circular faces
- `bounds` normalises the UV parameters on the face to [0,1] intervals.
- `native` uses the default UV parameters of opencascade
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
  // Remarks: The  shape of the ellipse is defined by both its radiuses, its angle
relative to the current coordinat system, as well as the long and sweep
flags (as defined for SVG paths)
  ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;

  // Draws an arc of ellipse by defining its end point and an ellipse
  // Remarks: The  shape of the ellipse is defined by both its radiuses, its angle
relative to the current coordinat system, as well as the long and sweep
flags (as defined for SVG paths)
  ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation: number, longAxis: boolean, sweep: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line)
  // Remarks: The sweep flag is to be understood as defined for SVG paths.
  halfEllipseTo(end: Point2D, radius: number, sweep: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line).The end point is defined by distances from he start point
  // Remarks: The sweep flag is to be understood as defined for SVG paths.
  halfEllipse(xDist: number, yDist: number, radius: number, sweep: boolean): this;

  // Draws a generic bezier curve to the end point, going using a set of control points
  // Remarks: This is the generic definition of a bézier curve, you might want to use
either the quadratic or cubic (most common) version, unless you know
exactly what you are aiming at.
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;

  // Draws a quadratic bezier curve to the end point, using the single control point
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, using the start and end control point to define its shape
  // Remarks: If you are struggling setting your control points, the smoothSpline might
be better for your needs.
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // Remarks: It will base its first control point so that its tangent is the same than
the previous segment.

The control point relative to the end is by default set to be in the
direction of the straight line between start and end. You can specifiy the
`endSkew` either as an angle (in degrees) to this direction, or as an
absolute direction in the coordinate system (a Point).

The start- and end- factors decide on how far the control point is from
the start and end point. At a factor of 1, the distance corresponds to
a quarter of the straight line distance.
  smoothSplineTo(end: Point2D, config?: SplineConfig): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // Remarks: It will base its first control point so that its tangent is the same than
the previous segment. You can force another tangent by defining
`startTangent`.

You can configure the tangent of the end point by configuring the
`endTangent`, either as "symmetric" to reproduce the start angle, as an
angle from the X axis (in the coordinate system) or a 2d direction (still
in the coordinate system.

The start- and end- factors decide on how far the control point is from
the start and end point. At a factor of 1, the distance corresponds to
a quarter of the straight line distance.
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
  // Remarks: You can define another extrusion direction or origin,

It is also possible to twist extrude with an angle (in degrees), or to
give a profile to the extrusion (the endFactor will scale the face, and
the profile will define how the scale is applied (either linarly or with
a s-shape).
  extrude(extrusionDistance: number, extrusionConfig?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;

  // Loft between this sketch and another sketch (or an array of them)
  // Remarks: You can also define a `startPoint` for the loft (that will be placed
before this sketch) and an `endPoint` after the last one.

You can also define if you want the loft to result in a ruled surface.

Note that all sketches will be deleted by this operation
  loftWith(otherSketches: this | this[], loftConfig: LoftConfig, returnShell?: boolean): Shape3D;
