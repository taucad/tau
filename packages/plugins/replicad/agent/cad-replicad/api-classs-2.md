# replicad — Classs (2)

17 top-level symbols. Signatures are verbatim typescript.

MeshShape: export declare class MeshShape extends WrappingObj<ManifoldInstance> implements Shape3DLike<MeshShape, MeshShapeMesh, MeshShape, number>

  constructor

  clone(): MeshShape;

  fuse(other: MeshShape, _options?: any): MeshShape;

  cut(other: MeshShape, _options?: any): MeshShape;

  intersect(other: MeshShape): MeshShape;

  translate(xDist: number, yDist: number, zDist: number): MeshShape;
  translate(vector: Point): MeshShape;
  translate(xDist: number, yDist: number, zDist: number): MeshShape;
  translate(vector: Point): MeshShape;

  translateX(distance: number): MeshShape;

  translateY(distance: number): MeshShape;

  translateZ(distance: number): MeshShape;

  rotate(angle: number, position?: Point, direction?: Point): MeshShape;
  rotate(vector: Point): MeshShape;
  rotate(angle: number, position?: Point, direction?: Point): MeshShape;
  rotate(vector: Point): MeshShape;

  scale(scale: number, center?: Point): MeshShape;

  mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): MeshShape;

  simplify(tolerance?: number): MeshShape;

  refine(n: number): MeshShape;

  refineToLength(length: number): MeshShape;

  refineToTolerance(tolerance: number): MeshShape;

  hull(): MeshShape;

  asOriginal(): MeshShape;

  mesh(): MeshShapeMesh;

  boundingBox

  volume(): number;

  surfaceArea(): number;

  numTri(): number;

  numVert(): number;

  numEdge(): number;

  isEmpty

  // Exports the mesh shape as an STL file Blob
  // Remarks: Since MeshShape is already a triangle mesh, no tessellation parameters are needed (tolerance/angularTolerance are accepted but ignored for API compatibility).
  blobSTL({ binary }?: {
          binary?: boolean | undefined;
      }): Blob;

Plane: export declare class Plane

  oc: OpenCascadeInstance

  xDir: Vector

  yDir: Vector

  zDir: Vector

  constructor

  delete(): void;

  clone(): Plane;

  origin

  translateTo(point: Point): Plane;

  translate(xDist: number, yDist: number, zDist: number): Plane;
  translate(vector: Point): Plane;
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

ProjectionCamera: export declare class ProjectionCamera extends WrappingObj<gp_Ax2>

  constructor

  position

  direction

  xAxis

  yAxis

  autoAxes(): void;

  setPosition(position: Point): this;

  setXAxis(xAxis: Point): this;

  setYAxis(yAxis: Point): this;

  lookAt(shape: {
          boundingBox: BoundingBox;
      } | Point): this;

Shape: export declare class Shape<Type extends TopoDS_Shape> extends WrappingObj<Type>

  constructor

  clone(): this;

  serialize(): string;

  hashCode

  isNull

  isSame(other: AnyShape): boolean;

  isEqual(other: AnyShape): boolean;

  // Asserts that this shape is a 3D shape (Shell, Solid, CompSolid, or Compound) and returns it typed as Shape3D
  // Remarks: Useful for chaining after operations that return a generic shape type.
  asShape3D(): Shape3D;

  // Simplifies the shape by removing unnecessary edges and faces
  simplify(): this;

  // Translates the shape of an arbitrary vector
  translate(xDist: number, yDist: number, zDist: number): this;
  translate(vector: Point): this;
  translate(xDist: number, yDist: number, zDist: number): this;
  translate(vector: Point): this;

  // Translates the shape on the X axis
  translateX(distance: number): this;

  // Translates the shape on the Y axis
  translateY(distance: number): this;

  // Translates the shape on the Z axis
  translateZ(distance: number): this;

  // Rotates the shape
  rotate(angle: number, position?: Point, direction?: Point): this;

  // Mirrors the shape through a plane
  mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): this;

  // Returns a scaled version of the shape
  scale(scale: number, center?: Point): this;

  edges

  faces

  wires

  boundingBox

  // Exports the current shape as a set of triangle
  mesh({ tolerance, angularTolerance }?: {
          tolerance?: number | undefined;
          angularTolerance?: number | undefined;
      }): ShapeMesh;

  // Exports the current shape as a set of lines
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

  // Exports the current shape as a STEP file as a Blob
  blobSTEP(): Blob;

  // Exports the current shape as a STL file as a Blob
  // Remarks: In order to create a STL file, the shape needs to be meshed. The tolerances correspond to the values used to mesh the shape.
  blobSTL({ tolerance, angularTolerance, binary, }?: {
          tolerance?: number | undefined;
          angularTolerance?: number | undefined;
          binary?: boolean | undefined;
      }): Blob;

Shell: export declare class Shell extends _3DShape<TopoDS_Shell>

// A line drawing to be acted upon
// Remarks: Note that all operations will delete the sketch
Sketch: export declare class Sketch implements SketchInterface

  wire: Wire

  constructor

  baseFace

  delete(): void;

  clone(): Sketch;

  defaultOrigin

  defaultDirection

  // Transforms the lines into a face
  face(): Face;

  wires(): Wire;

  faces(): Face;

  // Revolves the drawing on an axis (defined by its direction and an origin (defaults to the sketch origin)
  revolve(revolutionAxis?: Point, { origin, angle }?: {
          origin?: Point;
          angle?: number;
      }): Shape3D;

  // Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
  // Remarks: You can define another extrusion direction or origin, It is also possible to twist extrude with an angle (in degrees), or to give a profile to the extrusion (the endFactor will scale the face, and the profile will define how the scale is applied (either linarly or with a s-shape).
  extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;

  // Sweep along this sketch another sketch defined in the function `sketchOnPlane`
  // Remarks: TODO: clean the interface of the sweep config to make it more understandable.
  sweepSketch(sketchOnPlane: (plane: Plane, origin: Point) => this, sweepConfig?: GenericSweepConfig): Shape3D;

  // Loft between this sketch and another sketch (or an array of them)
  // Remarks: You can also define a `startPoint` for the loft (that will be placed before this sketch) and an `endPoint` after the last one. You can also define if you want the loft to result in a ruled surface. Note that all sketches will be deleted by this operation
  loftWith(otherSketches: this | this[], loftConfig?: LoftConfig, returnShell?: boolean): Shape3D;

// The FaceSketcher allows you to sketch on a plane
Sketcher: export declare class Sketcher implements GenericSketcher<Sketch>

  plane: Plane

  pointer: Vector

  firstPoint: Vector

  pendingEdges: Edge[]

  constructor

  delete(): void;

  // Changes the point to start your drawing from
  movePointerTo([x, y]: Point2D): this;

  // Draws a line from the current point to the point given in argument
  lineTo([x, y]: Point2D): this;

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

  // Draws a line from the current point to the point defined in polar coordiates, of radius r and angle theta (in degrees) from the current point
  polarLine(distance: number, angle: number): this;

  // Draws a line from the current point to the point defined in polar coordiates, of radius r and angle theta (in degrees) from the origin
  polarLineTo([r, theta]: [number, number]): this;

  // Draws a line from the current point as a tangent to the previous part of curve drawn
  tangentLine(distance: number): this;

  // Draws an arc of circle by defining its end point and a third point through which the arc will pass
  threePointsArcTo(end: Point2D, innerPoint: Point2D): this;

  // Draws an arc of circle by defining its end point and a third point through which the arc will pass
  threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;

  // Draws an arc of circle from the current point as a tangent to the previous part of curve drawn
  tangentArcTo(end: Point2D): this;

  // Draws an arc of circle from the current point as a tangent to the previous part of curve drawn.The end point is defined by its horizontal and vertical distances from the start point
  tangentArc(xDist: number, yDist: number): this;

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

  // Draws an arc of ellipse by defining its end point and an ellipse
  // Remarks: The shape of the ellipse is defined by both its radiuses, its angle relative to the current coordinat system, as well as the long and sweep flags (as defined for SVG paths)
  ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

  // Draws an arc of ellipse by defining its end point and an ellipse
  // Remarks: The shape of the ellipse is defined by both its radiuses, its angle relative to the current coordinat system, as well as the long and sweep flags (as defined for SVG paths)
  ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line)
  // Remarks: The sweep flag is to be understood as defined for SVG paths.
  halfEllipseTo(end: Point2D, verticalRadius: number, sweep?: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line).The end point is defined by distances from he start point
  // Remarks: The sweep flag is to be understood as defined for SVG paths.
  halfEllipse(xDist: number, yDist: number, verticalRadius: number, sweep?: boolean): this;

  // Draws a generic bezier curve to the end point, going using a set of control points
  // Remarks: This is the generic definition of a bézier curve, you might want to use either the quadratic or cubic (most common) version, unless you know exactly what you are aiming at.
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;

  // Draws a quadratic bezier curve to the end point, using the single control point
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, using the start and end control point to define its shape
  // Remarks: If you are struggling setting your control points, the smoothSpline might be better for your needs.
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // Remarks: It will base its first control point so that its tangent is the same than the previous segment. The control point relative to the end is by default set to be in the direction of the straight line between start and end. You can specifiy the `endSkew` either as an angle (in degrees) to this direction, or as an absolute direction in the coordinate system (a Point). The start- and end- factors decide on how far the control point is from the start and end point. At a factor of 1, the distance corresponds to a quarter of the straight line distance.
  smoothSplineTo(end: Point2D, config?: SplineConfig): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // Remarks: It will base its first control point so that its tangent is the same than the previous segment. You can force another tangent by defining `startTangent`. You can configure the tangent of the end point by configuring the `endTangent`, either as "symmetric" to reproduce the start angle, as an angle from the X axis (in the coordinate system) or a 2d direction (still in the coordinate system. The start- and end- factors decide on how far the control point is from the start and end point. At a factor of 1, the distance corresponds to a quarter of the straight line distance.
  smoothSpline(xDist: number, yDist: number, splineConfig?: SplineConfig): this;

  protected buildWire(): Wire;

  // Stop drawing and returns the sketch
  done(): Sketch;

  // Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
  close(): Sketch;

  // Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
  closeWithMirror(): Sketch;

Sketches: export declare class Sketches

  sketches: Array<Sketch | CompoundSketch>

  constructor

  wires(): AnyShape;

  faces(): AnyShape;

  // Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
  // Remarks: You can define another extrusion direction or origin, It is also possible to twist extrude with an angle (in degrees), or to give a profile to the extrusion (the endFactor will scale the face, and the profile will define how the scale is applied (either linarly or with a s-shape).
  extrude(extrusionDistance: number, extrusionConfig?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;

  // Revolves the drawing on an axis (defined by its direction and an origin (defaults to the sketch origin)
  revolve(revolutionAxis?: Point, config?: {
          origin?: Point;
          angle?: number;
      }): Shape3D;

Solid: export declare class Solid extends _3DShape<TopoDS_Solid>

Surface: export declare class Surface extends WrappingObj<Adaptor3d_Surface>

  surfaceType

SurfacePhysicalProperties: export declare class SurfacePhysicalProperties extends PhysicalProperties

  area

Transformation: export declare class Transformation extends WrappingObj<gp_Trsf>

  constructor

  clone(): Transformation;

  translate(xDist: number, yDist: number, zDist: number): Transformation;
  translate(vector: Point): Transformation;
  translate(xDist: number, yDist: number, zDist: number): Transformation;
  translate(vector: Point): Transformation;

  rotate(angle: number, position?: Point, direction?: Point): Transformation;

  mirror(inputPlane?: Plane | PlaneName | Point, inputOrigin?: Point): this;

  scale(center: Point, scale: number): this;

  inverse(): this;

  inverted(): Transformation;

  coordSystemChange(fromSystem: CoordSystem, toSystem: CoordSystem): this;

  transformPoint(point: Point): gp_Pnt;

  transform(shape: TopoDS_Shape): TopoDS_Shape;

Vector: export declare class Vector extends WrappingObj<gp_Vec>

  constructor

  repr

  x

  y

  z

  Length

  toTuple(): [number, number, number];

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

Vertex: export declare class Vertex extends Shape<TopoDS_Vertex>

  asTuple(): [number, number, number];

VolumePhysicalProperties: export declare class VolumePhysicalProperties extends PhysicalProperties

  volume

Wire: export declare class Wire extends _1DShape<TopoDS_Wire>

  offset2D(offset: number, kind?: "arc" | "intersection" | "tangent"): Wire;

WrappingObj: export declare class WrappingObj<Type extends Deletable>

  oc: OpenCascadeInstance

  constructor

  wrapped

  delete(): void;
