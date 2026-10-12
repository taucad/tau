# replicad — Classes (2)

17 top-level symbols. Signatures are verbatim typescript.

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
  rotate(angle: number, position?: Point, direction?: Direction): MeshShape;
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

  readonly boundingBox: BoundingBox

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

  readonly isEmpty: boolean

  // Exports the mesh shape as an STL file Blob
  // Remarks: Since MeshShape is already a triangle mesh, no tessellation parameters are needed (tolerance/angularTolerance are accepted but ignored for API compatibility).
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
  constructor(origin: Point, xDirection?: Direction | null, normal?: Direction);

  // Plane.delete (method)
  delete(): void;

  // Plane.clone (method)
  clone(): Plane;

  origin: Vector

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
  constructor(position?: Point, direction?: Direction, xAxis?: Direction);

  readonly position: Vector

  readonly direction: Vector

  readonly xAxis: Vector

  readonly yAxis: Vector

  // ProjectionCamera.autoAxes (method)
  autoAxes(): void;

  // ProjectionCamera.setPosition (method)
  setPosition(position: Point): this;

  // ProjectionCamera.setXAxis (method)
  setXAxis(xAxis: Direction): this;

  // ProjectionCamera.setYAxis (method)
  setYAxis(yAxis: Direction): this;

  // ProjectionCamera.lookAt (method)
  lookAt(shape: {
          boundingBox: BoundingBox;
      } | Point): this;

Shape: export declare class Shape<Type extends TopoDS_Shape> extends WrappingObj<Type>

  // Shape.constructor (constructor)
  constructor(ocShape: Type);

  // Shape.clone (method)
  clone(): this;

  // Shape.serialize (method)
  serialize(): string;

  readonly hashCode: number

  readonly isNull: boolean

  // Shape.isSame (method)
  isSame(other: AnyShape): boolean;

  // Shape.isEqual (method)
  isEqual(other: AnyShape): boolean;

  // Splits the solid parts of this shape with an oriented plane and groups them by side
  // Remarks: `offset` translates the splitting plane along its normal. Each side is `null` when empty, the resulting shape when it contains one piece, or a `Compound` when it contains multiple disconnected pieces. Positive is the direction of the plane's normal.
  // Shape.split (method)
  split(plane?: Plane | PlaneName, offset?: number, tolerance?: number): PlaneSplitResult<Solid | Compound>;

  // Asserts that this shape is a 3D shape (Shell, Solid, CompSolid, or Compound) and returns it typed as Shape3D
  // Remarks: Useful for chaining after operations that return a generic shape type.
  // Shape.asShape3D (method)
  asShape3D(): Shape3D;

  // Simplifies the shape by removing unnecessary edges and faces
  // Shape.simplify (method)
  simplify(): this;

  // Translates the shape of an arbitrary vector
  // Shape.translate (method)
  translate(xDist: number, yDist: number, zDist: number): this;
  translate(vector: Point): this;

  // Translates the shape on the X axis
  // Shape.translateX (method)
  translateX(distance: number): this;

  // Translates the shape on the Y axis
  // Shape.translateY (method)
  translateY(distance: number): this;

  // Translates the shape on the Z axis
  // Shape.translateZ (method)
  translateZ(distance: number): this;

  // Rotates the shape
  // Shape.rotate (method)
  rotate(angle: number, position?: Point, direction?: Direction): this;

  // Mirrors the shape through a plane
  // Shape.mirror (method)
  mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): this;

  // Returns a scaled version of the shape
  // Shape.scale (method)
  scale(scale: number, center?: Point): this;

  readonly edges: Edge[]

  readonly faces: Face[]

  readonly solids: Solid[]

  readonly wires: Wire[]

  readonly boundingBox: BoundingBox

  // Exports the current shape as a set of triangle
  // Shape.mesh (method)
  mesh(options?: MeshOptions): ShapeMesh;

  // Exports the current shape as a set of lines
  // Shape.meshEdges (method)
  meshEdges(options?: MeshOptions): ShapeEdgeMesh;

  // Exports the current shape as a STEP file as a Blob
  // Shape.blobSTEP (method)
  blobSTEP(): Blob;

  // Exports the current shape as a STL file as a Blob
  // Remarks: In order to create a STL file, the shape needs to be meshed. The tolerances correspond to the values used to mesh the shape.
  // Shape.blobSTL (method)
  blobSTL(options?: STLExportOptions): Blob;

Shell: export declare class Shell extends _3DShape<TopoDS_Shell>

// A line drawing to be acted upon
// Remarks: Note that all operations will delete the sketch
Sketch: export declare class Sketch implements SketchInterface

  wire: Wire

  // Sketch.constructor (constructor)
  constructor(wire: Wire, { defaultOrigin, defaultDirection, }?: {
          defaultOrigin?: Point;
          defaultDirection?: Point;
      });

  baseFace: Face | null | undefined

  // Sketch.delete (method)
  delete(): void;

  // Sketch.clone (method)
  clone(): Sketch;

  defaultOrigin: Vector

  defaultDirection: Vector

  // Transforms the lines into a face
  // Sketch.face (method)
  face(): Face;

  // Sketch.wires (method)
  wires(): Wire;

  // Sketch.faces (method)
  faces(): Face;

  // Revolves the drawing on an axis (defined by its direction and an origin (defaults to the sketch origin)
  // Sketch.revolve (method)
  revolve(revolutionAxis?: Point, { origin, angle }?: {
          origin?: Point;
          angle?: number;
      }): Shape3D;

  // Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
  // Remarks: You can define another extrusion direction or origin, It is also possible to twist extrude with an angle (in degrees), or to give a profile to the extrusion (the endFactor will scale the face, and the profile will define how the scale is applied (either linarly or with a s-shape).
  // Sketch.extrude (method)
  extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;

  // Sweep along this sketch another sketch defined in the function `sketchOnPlane`
  // Remarks: TODO: clean the interface of the sweep config to make it more understandable.
  // Sketch.sweepSketch (method)
  sweepSketch(sketchOnPlane: (plane: Plane, origin: Point) => this, sweepConfig?: GenericSweepConfig): Shape3D;

  // Loft between this sketch and another sketch (or an array of them)
  // Remarks: You can also define a `startPoint` for the loft (that will be placed before this sketch) and an `endPoint` after the last one. You can also define if you want the loft to result in a ruled surface. Note that all sketches will be deleted by this operation
  // Sketch.loftWith (method)
  loftWith(otherSketches: this | this[], loftConfig?: LoftConfig, returnShell?: boolean): Shape3D;

// The FaceSketcher allows you to sketch on a plane
Sketcher: export declare class Sketcher implements GenericSketcher<Sketch>

  plane: Plane

  pointer: Vector

  firstPoint: Vector

  pendingEdges: Edge[]

  // Sketcher.constructor (constructor)
  constructor(plane: Plane);
  constructor(plane?: PlaneName, origin?: Point | number);

  // Sketcher.delete (method)
  delete(): void;

  // Changes the point to start your drawing from
  // Sketcher.movePointerTo (method)
  movePointerTo([x, y]: Point2D): this;

  // Draws a line from the current point to the point given in argument
  // Sketcher.lineTo (method)
  lineTo([x, y]: Point2D): this;

  // Draws a line at the horizontal distance xDist and the vertical distance yDist of the current point
  // Sketcher.line (method)
  line(xDist: number, yDist: number): this;

  // Draws a vertical line of length distance from the current point
  // Sketcher.vLine (method)
  vLine(distance: number): this;

  // Draws an horizontal line of length distance from the current point
  // Sketcher.hLine (method)
  hLine(distance: number): this;

  // Draws a vertical line to the y coordinate
  // Sketcher.vLineTo (method)
  vLineTo(yPos: number): this;

  // Draws an horizontal line to the x coordinate
  // Sketcher.hLineTo (method)
  hLineTo(xPos: number): this;

  // Draws a line from the current point to the point defined in polar coordiates, of radius r and angle theta (in degrees) from the current point
  // Sketcher.polarLine (method)
  polarLine(distance: number, angle: number): this;

  // Draws a line from the current point to the point defined in polar coordiates, of radius r and angle theta (in degrees) from the origin
  // Sketcher.polarLineTo (method)
  polarLineTo([r, theta]: [number, number]): this;

  // Draws a line from the current point as a tangent to the previous part of curve drawn
  // Sketcher.tangentLine (method)
  tangentLine(distance: number): this;

  // Draws an arc of circle by defining its end point and a third point through which the arc will pass
  // Sketcher.threePointsArcTo (method)
  threePointsArcTo(end: Point2D, innerPoint: Point2D): this;

  // Draws an arc of circle by defining its end point and a third point through which the arc will pass
  // Sketcher.threePointsArc (method)
  threePointsArc(xDist: number, yDist: number, viaXDist: number, viaYDist: number): this;

  // Draws an arc of circle from the current point as a tangent to the previous part of curve drawn
  // Sketcher.tangentArcTo (method)
  tangentArcTo(end: Point2D): this;

  // Draws an arc of circle from the current point as a tangent to the previous part of curve drawn.The end point is defined by its horizontal and vertical distances from the start point
  // Sketcher.tangentArc (method)
  tangentArc(xDist: number, yDist: number): this;

  // Draws an arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point
  // Sketcher.sagittaArcTo (method)
  sagittaArcTo(end: Point2D, sagitta: number): this;

  // Draws an arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point.The end point is defined by its horizontal and vertical distances from the start point
  // Sketcher.sagittaArc (method)
  sagittaArc(xDist: number, yDist: number, sagitta: number): this;

  // Draws a vertical arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point.The end point is defined by its vertical distance from the start point
  // Sketcher.vSagittaArc (method)
  vSagittaArc(distance: number, sagitta: number): this;

  // Draws an horizontal arc of circle by defining its end point and the sagitta - the maximum distance between the arc and the straight line going from start to end point.The end point is defined by its horizontal distance from the start point
  // Sketcher.hSagittaArc (method)
  hSagittaArc(distance: number, sagitta: number): this;

  // Draws an arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point
  // Sketcher.bulgeArcTo (method)
  bulgeArcTo(end: Point2D, bulge: number): this;

  // Draws an arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point in units of half the chord
  // Sketcher.bulgeArc (method)
  bulgeArc(xDist: number, yDist: number, bulge: number): this;

  // Draws a vertical arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point in units of half the chord
  // Sketcher.vBulgeArc (method)
  vBulgeArc(distance: number, bulge: number): this;

  // Draws an horizontal arc of circle by defining its end point and the bulge - the maximum distance between the arc and the straight line going from start to end point in units of half the chord
  // Sketcher.hBulgeArc (method)
  hBulgeArc(distance: number, bulge: number): this;

  // Draws an arc of ellipse by defining its end point and an ellipse
  // Remarks: The shape of the ellipse is defined by both its radiuses, its angle relative to the current coordinat system, as well as the long and sweep flags (as defined for SVG paths)
  // Sketcher.ellipseTo (method)
  ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

  // Draws an arc of ellipse by defining its end point and an ellipse
  // Remarks: The shape of the ellipse is defined by both its radiuses, its angle relative to the current coordinat system, as well as the long and sweep flags (as defined for SVG paths)
  // Sketcher.ellipse (method)
  ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line)
  // Remarks: The sweep flag is to be understood as defined for SVG paths.
  // Sketcher.halfEllipseTo (method)
  halfEllipseTo(end: Point2D, verticalRadius: number, sweep?: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line).The end point is defined by distances from he start point
  // Remarks: The sweep flag is to be understood as defined for SVG paths.
  // Sketcher.halfEllipse (method)
  halfEllipse(xDist: number, yDist: number, verticalRadius: number, sweep?: boolean): this;

  // Draws a generic bezier curve to the end point, going using a set of control points
  // Remarks: This is the generic definition of a bézier curve, you might want to use either the quadratic or cubic (most common) version, unless you know exactly what you are aiming at.
  // Sketcher.bezierCurveTo (method)
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;

  // Draws a quadratic bezier curve to the end point, using the single control point
  // Sketcher.quadraticBezierCurveTo (method)
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, using the start and end control point to define its shape
  // Remarks: If you are struggling setting your control points, the smoothSpline might be better for your needs.
  // Sketcher.cubicBezierCurveTo (method)
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // Remarks: It will base its first control point so that its tangent is the same than the previous segment. The control point relative to the end is by default set to be in the direction of the straight line between start and end. You can specifiy the `endSkew` either as an angle (in degrees) to this direction, or as an absolute direction in the coordinate system (a Point). The start- and end- factors decide on how far the control point is from the start and end point. At a factor of 1, the distance corresponds to a quarter of the straight line distance.
  // Sketcher.smoothSplineTo (method)
  smoothSplineTo(end: Point2D, config?: SplineConfig): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // Remarks: It will base its first control point so that its tangent is the same than the previous segment. You can force another tangent by defining `startTangent`. You can configure the tangent of the end point by configuring the `endTangent`, either as "symmetric" to reproduce the start angle, as an angle from the X axis (in the coordinate system) or a 2d direction (still in the coordinate system. The start- and end- factors decide on how far the control point is from the start and end point. At a factor of 1, the distance corresponds to a quarter of the straight line distance.
  // Sketcher.smoothSpline (method)
  smoothSpline(xDist: number, yDist: number, splineConfig?: SplineConfig): this;

  // Sketcher.buildWire (method)
  protected buildWire(): Wire;

  // Stop drawing and returns the sketch
  // Sketcher.done (method)
  done(): Sketch;

  // Stop drawing, make sure the sketch is closed (by adding a straight line to from the last point to the first) and returns the sketch
  // Sketcher.close (method)
  close(): Sketch;

  // Stop drawing, make sure the sketch is closed (by mirroring the lines between the first and last points drawn) and returns the sketch
  // Sketcher.closeWithMirror (method)
  closeWithMirror(): Sketch;

Sketches: export declare class Sketches

  sketches: Array<Sketch | CompoundSketch>

  // Sketches.constructor (constructor)
  constructor(sketches: Array<Sketch | CompoundSketch>);

  // Sketches.wires (method)
  wires(): AnyShape;

  // Sketches.faces (method)
  faces(): AnyShape;

  // Extrudes the sketch to a certain distance.(along the default direction and origin of the sketch)
  // Remarks: You can define another extrusion direction or origin, It is also possible to twist extrude with an angle (in degrees), or to give a profile to the extrusion (the endFactor will scale the face, and the profile will define how the scale is applied (either linarly or with a s-shape).
  // Sketches.extrude (method)
  extrude(extrusionDistance: number, extrusionConfig?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;

  // Revolves the drawing on an axis (defined by its direction and an origin (defaults to the sketch origin)
  // Sketches.revolve (method)
  revolve(revolutionAxis?: Point, config?: {
          origin?: Point;
          angle?: number;
      }): Shape3D;

Solid: export declare class Solid extends _3DShape<TopoDS_Solid>

Surface: export declare class Surface extends WrappingObj<Adaptor3d_Surface>

  readonly surfaceType: SurfaceType

SurfacePhysicalProperties: export declare class SurfacePhysicalProperties extends PhysicalProperties

  readonly area: number

Transformation: export declare class Transformation extends WrappingObj<gp_Trsf>

  // Transformation.constructor (constructor)
  constructor(transform?: gp_Trsf);

  // Transformation.clone (method)
  clone(): Transformation;

  // Transformation.translate (method)
  translate(xDist: number, yDist: number, zDist: number): Transformation;
  translate(vector: Point): Transformation;

  // Transformation.rotate (method)
  rotate(angle: number, position?: Point, direction?: Direction): Transformation;

  // Transformation.mirror (method)
  mirror(inputPlane?: Plane | PlaneName | Point, inputOrigin?: Point): this;

  // Transformation.scale (method)
  scale(center: Point, scale: number): this;

  // Transformation.inverse (method)
  inverse(): this;

  // Transformation.inverted (method)
  inverted(): Transformation;

  // Transformation.coordSystemChange (method)
  coordSystemChange(fromSystem: CoordSystem, toSystem: CoordSystem): this;

  // Transformation.transformPoint (method)
  transformPoint(point: Point): gp_Pnt;

  // Transformation.transform (method)
  transform(shape: TopoDS_Shape): TopoDS_Shape;

Vector: export declare class Vector extends WrappingObj<gp_Vec>

  // Vector.constructor (constructor)
  constructor(vector?: Point);

  readonly repr: string

  readonly x: number

  readonly y: number

  readonly z: number

  readonly Length: number

  // Vector.toTuple (method)
  toTuple(): [number, number, number];

  // Vector.cross (method)
  cross(v: Vector): Vector;

  // Vector.dot (method)
  dot(v: Vector): number;

  // Vector.sub (method)
  sub(v: Vector): Vector;

  // Vector.add (method)
  add(v: Vector): Vector;

  // Vector.multiply (method)
  multiply(scale: number): Vector;

  // Vector.normalized (method)
  normalized(): Vector;

  // Vector.normalize (method)
  normalize(): Vector;

  // Vector.getCenter (method)
  getCenter(): Vector;

  // Vector.getAngle (method)
  getAngle(v: Vector): number;

  // Vector.projectToPlane (method)
  projectToPlane(plane: Plane): Vector;

  // Vector.equals (method)
  equals(other: Vector): boolean;

  // Vector.toPnt (method)
  toPnt(): gp_Pnt;

  // Vector.toDir (method)
  toDir(): gp_Dir;

  // Vector.rotate (method)
  rotate(angle: number, center?: Point, direction?: Direction): Vector;

Vertex: export declare class Vertex extends Shape<TopoDS_Vertex>

  // Vertex.asTuple (method)
  asTuple(): [number, number, number];

VolumePhysicalProperties: export declare class VolumePhysicalProperties extends PhysicalProperties

  readonly volume: number

Wire: export declare class Wire extends _1DShape<TopoDS_Wire>

  // Wire.offset2D (method)
  offset2D(offset: number, kind?: "arc" | "intersection" | "tangent"): Wire;

WrappingObj: export declare class WrappingObj<Type extends Deletable>

  oc: OpenCascadeInstance

  // WrappingObj.constructor (constructor)
  constructor(wrapped: Type);

  wrapped: Type

  // WrappingObj.delete (method)
  delete(): void;
