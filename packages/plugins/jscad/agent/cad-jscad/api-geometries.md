# @jscad/modeling — geometries

1 top-level symbols. Signatures are verbatim typescript.

geometries

  geom2

    // geometries.geom2.clone (function)
    declare function clone(geometry: Geom2): Geom2

    // geometries.geom2.create (function)
    declare function create(sides?: Array<[Vec2, Vec2]>): Geom2

    // geometries.geom2.fromPoints (function)
    declare function fromPoints(points: Array<Vec2>): Geom2

    // geometries.geom2.fromCompactBinary (function)
    declare function fromCompactBinary(data: Array<number> | Float32Array | Float64Array): Geom2

    // geometries.geom2.isA (function)
    declare function isA(object: any): object is Geom2

    // geometries.geom2.reverse (function)
    declare function reverse(geometry: Geom2): Geom2

    // geometries.geom2.toOutlines (function)
    declare function toOutlines(geometry: Geom2): Array<Array<Vec2>>

    // geometries.geom2.toPoints (function)
    declare function toPoints(geometry: Geom2): Array<Vec2>

    // geometries.geom2.toSides (function)
    declare function toSides(geometry: Geom2): Array<[Vec2, Vec2]>

    // geometries.geom2.toString (function)
    declare function toString(geometry: Geom2): string

    // geometries.geom2.toCompactBinary (function)
    declare function toCompactBinary(geom: Geom2): Float32Array

    // geometries.geom2.transform (function)
    declare function transform(matrix: Mat4, geometry: Geom2): Geom2

    // geometries.geom2.validate (function)
    declare function validate(object: any): void

    Geom2: declare interface Geom2

      sides: Array<[Vec2, Vec2]>

      transforms: Mat4

      color?: Color

  geom3

    // geometries.geom3.clone (function)
    declare function clone(geometry: Geom3): Geom3

    // geometries.geom3.create (function)
    declare function create(polygons?: Array<Poly3>): Geom3

    // geometries.geom3.fromPointsConvex (function)
    declare function fromPointsConvex(points: Array<Array<Vec3>>): Geom3

    // geometries.geom3.fromPoints (function)
    declare function fromPoints(points: Array<Array<Vec3>>): Geom3

    // geometries.geom3.fromCompactBinary (function)
    declare function fromCompactBinary(data: Array<number> | Float32Array | Float64Array): Geom3

    // geometries.geom3.invert (function)
    declare function invert(geometry: Geom3): Geom3

    // geometries.geom3.isA (function)
    declare function isA(object: any): object is Geom3

    // geometries.geom3.isConvex (function)
    export function isConvex(geometry: Geom3): boolean

    // geometries.geom3.toPoints (function)
    declare function toPoints(geometry: Geom3): Array<Array<Vec3>>

    // geometries.geom3.toPolygons (function)
    declare function toPolygons(geometry: Geom3): Array<Poly3>

    // geometries.geom3.toString (function)
    declare function toString(geometry: Geom3): string

    // geometries.geom3.toCompactBinary (function)
    declare function toCompactBinary(geom: Geom3): Float32Array

    // geometries.geom3.transform (function)
    declare function transform(matrix: Mat4, geometry: Geom3): Geom3

    // geometries.geom3.validate (function)
    declare function validate(object: any): void

    Geom3: declare interface Geom3

      polygons: Array<Poly3>

      transforms: Mat4

      color?: Color

  path2

    // geometries.path2.appendArc (function)
    declare function appendArc(options: AppendArcOptions, geometry: Path2): Path2

    AppendArcOptions: export interface AppendArcOptions

      endpoint: Vec2

      radius?: Vec2

      xaxisrotation?: number

      clockwise?: boolean

      large?: boolean

      segments?: number

    // geometries.path2.appendBezier (function)
    declare function appendBezier(options: AppendBezierOptions, geometry: Path2): Path2

    AppendBezierOptions: export interface AppendBezierOptions

      controlPoints: Array<Vec2 | null>

      segments?: number

    // geometries.path2.appendPoints (function)
    declare function appendPoints(points: Array<Vec2>, geometry: Path2): Path2

    // geometries.path2.clone (function)
    declare function clone(geometry: Path2): Path2

    // geometries.path2.close (function)
    declare function close(geometry: Path2): Path2

    // geometries.path2.concat (function)
    declare function concat(...paths: Array<Path2>): Path2

    // geometries.path2.create (function)
    declare function create(points?: Array<Vec2>): Path2

    // geometries.path2.equals (function)
    declare function equals(a: Path2, b: Path2): boolean

    // geometries.path2.fromPoints (function)
    declare function fromPoints(options: FromPointsOptions, points: Array<Vec2>): Path2

    FromPointsOptions: export interface FromPointsOptions

      closed?: boolean

    // geometries.path2.fromCompactBinary (function)
    declare function fromCompactBinary(data: Array<number> | Float32Array | Float64Array): Path2

    // geometries.path2.isA (function)
    declare function isA(object: any): object is Path2

    // geometries.path2.reverse (function)
    declare function reverse(path: Path2): Path2

    // geometries.path2.toPoints (function)
    declare function toPoints(geometry: Path2): Array<Vec2>

    // geometries.path2.toString (function)
    declare function toString(geometry: Path2): string

    // geometries.path2.toCompactBinary (function)
    declare function toCompactBinary(geometry: Path2): Float32Array

    // geometries.path2.transform (function)
    declare function transform(matrix: Mat4, geometry: Path2): Path2

    // geometries.path2.validate (function)
    declare function validate(object: any): void

    Path2: declare interface Path2

      points: Array<Vec2>

      isClosed: boolean

      transforms: Mat4

      color?: Color

  poly2

    // geometries.poly2.arePointsInside (function)
    declare function arePointsInside(points: Array<Vec2>, polygon: Poly2): number

    // geometries.poly2.create (function)
    declare function create(vertices?: Array<Vec2>): Poly2

    // geometries.poly2.flip (function)
    declare function flip(polygon: Poly2): Poly2

    // geometries.poly2.measureArea (function)
    declare function measureArea(polygon: Poly2): number

    Poly2: declare interface Poly2

      vertices: Array<Vec2>

  poly3

    // geometries.poly3.clone (function)
    declare function clone(polygon: Poly3): Poly3
    declare function clone(out: Poly3, polygon: Poly3): Poly3

    // geometries.poly3.create (function)
    declare function create(vertices?: Array<Vec3>): Poly3

    // geometries.poly3.fromPoints (function)
    declare function fromPoints(points: Array<Vec3>): Poly3

    // geometries.poly3.fromPointsAndPlane (function)
    declare function fromPointsAndPlane(vertices: Array<Vec3>, plane: Plane): Poly3

    // geometries.poly3.invert (function)
    declare function invert(polygon: Poly3): Poly3

    // geometries.poly3.isA (function)
    declare function isA(object: any): object is Poly3

    // geometries.poly3.isConvex (function)
    declare function isConvex(polygon: Poly3): boolean

    // geometries.poly3.measureArea (function)
    declare function measureArea(polygon: Poly3): number

    // geometries.poly3.measureBoundingBox (function)
    declare function measureBoundingBox(polygon: Poly3): [Vec3, Vec3]

    // geometries.poly3.measureBoundingSphere (function)
    declare function measureBoundingSphere(polygon: Poly3): Vec4

    // geometries.poly3.measureSignedVolume (function)
    declare function measureSignedVolume(polygon: Poly3): number

    // geometries.poly3.plane (function)
    declare function plane(polygon: Poly3): Plane;

    // geometries.poly3.toPoints (function)
    declare function toPoints(polygon: Poly3): Array<Vec3>

    // geometries.poly3.toString (function)
    declare function toString(polygon: Poly3): string

    // geometries.poly3.transform (function)
    declare function transform(matrix: Mat4, polygon: Poly3): Poly3

    // geometries.poly3.validate (function)
    declare function validate(object: any): void

    Poly3: declare interface Poly3

      vertices: Array<Vec3>

      color?: Color

      plane?: Plane
