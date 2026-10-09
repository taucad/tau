# @jscad/modeling — primitives

1 top-level symbols. Signatures are verbatim typescript.

primitives

  // primitives.arc (function)
  declare function arc(options?: ArcOptions): Path2

  ArcOptions: export interface ArcOptions

    center?: Vec2

    radius?: number

    startAngle?: number

    endAngle?: number

    segments?: number

    makeTangent?: boolean

  // primitives.circle (function)
  declare function circle(options?: CircleOptions): Geom2

  CircleOptions: export interface CircleOptions

    center?: Vec2

    radius?: number

    startAngle?: number

    endAngle?: number

    segments?: number

  // primitives.cube (function)
  declare function cube(options?: CubeOptions): Geom3

  CubeOptions: export interface CubeOptions

    center?: Vec3

    size?: number

  // primitives.cuboid (function)
  declare function cuboid(options?: CuboidOptions): Geom3

  CuboidOptions: export interface CuboidOptions

    center?: Vec3

    size?: Vec3

  // primitives.cylinder (function)
  declare function cylinder(options?: CylinderOptions): Geom3

  CylinderOptions: export interface CylinderOptions

    center?: Vec3

    height?: number

    radius?: number

    segments?: number

  // primitives.cylinderElliptic (function)
  declare function cylinderElliptic(options?: CylinderEllipticOptions): Geom3

  CylinderEllipticOptions: export interface CylinderEllipticOptions

    center?: Vec3

    height?: number

    startRadius?: [number, number]

    startAngle?: number

    endRadius?: [number, number]

    endAngle?: number

    segments?: number

  // primitives.ellipse (function)
  declare function ellipse(options?: EllipseOptions): Geom2

  EllipseOptions: export interface EllipseOptions

    center?: Vec2

    radius?: Vec2

    startAngle?: number

    endAngle?: number

    segments?: number

  // primitives.ellipsoid (function)
  declare function ellipsoid(options?: EllipsoidOptions): Geom3

  EllipsoidOptions: export interface EllipsoidOptions

    center?: Vec3

    radius?: Vec3

    segments?: number

    axes?: Vec3

  // primitives.geodesicSphere (function)
  declare function geodesicSphere(options?: GeodesicSphereOptions): Geom3

  GeodesicSphereOptions: export interface GeodesicSphereOptions

    radius?: number

    frequency?: number

  // primitives.line (function)
  declare function line(points: Array<Vec2>): Path2

  // primitives.polygon (function)
  declare function polygon(options: PolygonOptions): Geom2

  PolygonOptions: export interface PolygonOptions

    points: Array<Vec2> | Array<Array<Vec2>>

    paths?: Array<number> | Array<Array<number>>

    orientation?: 'counterclockwise' | 'clockwise'

  // primitives.polyhedron (function)
  declare function polyhedron(options: PolyhedronOptions): Geom3

  PolyhedronOptions: export interface PolyhedronOptions

    points: Array<Vec3>

    faces: Array<Array<number>>

    colors?: Array<RGB | RGBA>

    orientation?: 'outward' | 'inward'

  // primitives.rectangle (function)
  declare function rectangle(options?: RectangleOptions): Geom2

  RectangleOptions: export interface RectangleOptions

    center?: Vec2

    size?: Vec2

  // primitives.roundedCuboid (function)
  declare function roundedCuboid(options?: RoundedCuboidOptions): Geom3

  RoundedCuboidOptions: export interface RoundedCuboidOptions

    center?: Vec3

    size?: Vec3

    roundRadius?: number

    segments?: number

  // primitives.roundedCylinder (function)
  declare function roundedCylinder(options?: RoundedCylinderOptions): Geom3

  RoundedCylinderOptions: export interface RoundedCylinderOptions

    center?: Vec3

    height?: number

    radius?: number

    roundRadius?: number

    segments?: number

  // primitives.roundedRectangle (function)
  declare function roundedRectangle(options?: RoundedRectangleOptions): Geom2

  RoundedRectangleOptions: export interface RoundedRectangleOptions

    center?: Vec2

    size?: Vec2

    roundRadius?: number

    segments?: number

  // primitives.sphere (function)
  declare function sphere(options?: SphereOptions): Geom3

  SphereOptions: export interface SphereOptions

    center?: Vec3

    radius?: number

    segments?: number

    axes?: Vec3

  // primitives.square (function)
  declare function square(options?: SquareOptions): Geom2

  SquareOptions: export interface SquareOptions

    center?: Vec2

    size?: number

  // primitives.star (function)
  declare function star(options?: StarOptions): Geom2

  StarOptions: export interface StarOptions

    center?: Vec2

    vertices?: number

    density?: number

    outerRadius?: number

    innerRadius?: number

    startAngle?: number

  // primitives.torus (function)
  declare function torus(options?: TorusOptions): Geom3

  TorusOptions: export interface TorusOptions

    innerRadius?: number

    outerRadius?: number

    innerSegments?: number

    outerSegments?: number

    innerRotation?: number

    outerRotation?: number

    startAngle?: number

  // primitives.triangle (function)
  declare function triangle(options?: TriangleOptions): Geom2

  TriangleOptions: export interface TriangleOptions

    type?: 'AAA' | 'AAS' | 'ASA' | 'SAS' | 'SSA' | 'SSS'

    values?: [number, number, number]
