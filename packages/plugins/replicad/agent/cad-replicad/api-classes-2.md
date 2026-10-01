# replicad — Classes (2)

14 top-level symbols. Signatures are verbatim typescript.

Shape: export declare class Shape<Type extends TopoDS_Shape> extends WrappingObj<Type>

  // Shape.constructor (constructor)
  constructor(ocShape: Type);

  // Shape.clone (method)
  clone(): this;

  // Shape.serialize (method)
  serialize(): string;

  hashCode

  isNull

  // Shape.isSame (method)
  isSame(other: AnyShape): boolean;

  // Shape.isEqual (method)
  isEqual(other: AnyShape): boolean;

  // Asserts that this shape is a 3D shape (Shell, Solid, CompSolid, or Compound) and returns it typed as Shape3D
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
  rotate(angle: number, position?: Point, direction?: Point): this;

  // Mirrors the shape through a plane
  // Shape.mirror (method)
  mirror(inputPlane?: Plane | PlaneName | Point, origin?: Point): this;

  // Returns a scaled version of the shape
  // Shape.scale (method)
  scale(scale: number, center?: Point): this;

  edges

  faces

  wires

  boundingBox

  // Exports the current shape as a set of triangle
  // Shape.mesh (method)
  mesh({ tolerance, angularTolerance }?: {
          tolerance?: number | undefined;
          angularTolerance?: number | undefined;
      }): ShapeMesh;

  // Exports the current shape as a set of lines
  // Shape.meshEdges (method)
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
  // Shape.blobSTEP (method)
  blobSTEP(): Blob;

  // Exports the current shape as a STL file as a Blob
  // Shape.blobSTL (method)
  blobSTL({ tolerance, angularTolerance, binary, }?: {
          tolerance?: number | undefined;
          angularTolerance?: number | undefined;
          binary?: boolean | undefined;
      }): Blob;

Shell: export declare class Shell extends _3DShape<TopoDS_Shell>

// A line drawing to be acted upon
Sketch: export declare class Sketch implements SketchInterface

  wire: Wire

  // Sketch.constructor (constructor)
  constructor(wire: Wire, { defaultOrigin, defaultDirection, }?: {
          defaultOrigin?: Point;
          defaultDirection?: Point;
      });

  baseFace

  // Sketch.delete (method)
  delete(): void;

  // Sketch.clone (method)
  clone(): Sketch;

  defaultOrigin

  defaultDirection

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
  // Sketch.extrude (method)
  extrude(extrusionDistance: number, { extrusionDirection, extrusionProfile, twistAngle, origin, }?: {
          extrusionDirection?: Point;
          extrusionProfile?: ExtrusionProfile;
          twistAngle?: number;
          origin?: Point;
      }): Shape3D;

  // Sweep along this sketch another sketch defined in the function `sketchOnPlane`
  // Sketch.sweepSketch (method)
  sweepSketch(sketchOnPlane: (plane: Plane, origin: Point) => this, sweepConfig?: GenericSweepConfig): Shape3D;

  // Loft between this sketch and another sketch (or an array of them)
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
  // Sketcher.ellipseTo (method)
  ellipseTo(end: Point2D, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

  // Draws an arc of ellipse by defining its end point and an ellipse
  // Sketcher.ellipse (method)
  ellipse(xDist: number, yDist: number, horizontalRadius: number, verticalRadius: number, rotation?: number, longAxis?: boolean, sweep?: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line)
  // Sketcher.halfEllipseTo (method)
  halfEllipseTo(end: Point2D, verticalRadius: number, sweep?: boolean): this;

  // Draws an arc as half an ellipse, defined by the sagitta of the ellipse (which corresponds to the radius in the axe orthogonal to the straight line).The end point is defined by distances from he start point
  // Sketcher.halfEllipse (method)
  halfEllipse(xDist: number, yDist: number, verticalRadius: number, sweep?: boolean): this;

  // Draws a generic bezier curve to the end point, going using a set of control points
  // Sketcher.bezierCurveTo (method)
  bezierCurveTo(end: Point2D, controlPoints: Point2D | Point2D[]): this;

  // Draws a quadratic bezier curve to the end point, using the single control point
  // Sketcher.quadraticBezierCurveTo (method)
  quadraticBezierCurveTo(end: Point2D, controlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, using the start and end control point to define its shape
  // Sketcher.cubicBezierCurveTo (method)
  cubicBezierCurveTo(end: Point2D, startControlPoint: Point2D, endControlPoint: Point2D): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
  // Sketcher.smoothSplineTo (method)
  smoothSplineTo(end: Point2D, config?: SplineConfig): this;

  // Draws a cubic bezier curve to the end point, attempting to make the line smooth with the previous segment
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

  surfaceType

SurfacePhysicalProperties: export declare class SurfacePhysicalProperties extends PhysicalProperties

  area

Transformation: export declare class Transformation extends WrappingObj<gp_Trsf>

  // Transformation.constructor (constructor)
  constructor(transform?: gp_Trsf);

  // Transformation.clone (method)
  clone(): Transformation;

  // Transformation.translate (method)
  translate(xDist: number, yDist: number, zDist: number): Transformation;
  translate(vector: Point): Transformation;

  // Transformation.rotate (method)
  rotate(angle: number, position?: Point, direction?: Point): Transformation;

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

  repr

  x

  y

  z

  Length

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
  rotate(angle: number, center?: Point, direction?: Point): Vector;

Vertex: export declare class Vertex extends Shape<TopoDS_Vertex>

  // Vertex.asTuple (method)
  asTuple(): [number, number, number];

VolumePhysicalProperties: export declare class VolumePhysicalProperties extends PhysicalProperties

  volume

Wire: export declare class Wire extends _1DShape<TopoDS_Wire>

  // Wire.offset2D (method)
  offset2D(offset: number, kind?: "arc" | "intersection" | "tangent"): Wire;

WrappingObj: export declare class WrappingObj<Type extends Deletable>

  oc: OpenCascadeInstance

  // WrappingObj.constructor (constructor)
  constructor(wrapped: Type);

  wrapped

  // WrappingObj.delete (method)
  delete(): void;
