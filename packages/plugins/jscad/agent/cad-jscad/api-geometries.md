# @jscad/modeling — geometries

1 top-level symbols. Signatures are verbatim typescript.

geometries

geom2

    declare function clone(geometry: Geom2): Geom2

    declare function create(sides?: Array<[Vec2, Vec2]>): Geom2

    declare function fromPoints(points: Array<Vec2>): Geom2

    declare function fromCompactBinary(data: Array<number> | Float32Array | Float64Array): Geom2

    declare function isA(object: any): object is Geom2

    declare function reverse(geometry: Geom2): Geom2

    declare function toOutlines(geometry: Geom2): Array<Array<Vec2>>

    declare function toPoints(geometry: Geom2): Array<Vec2>

    declare function toSides(geometry: Geom2): Array<[Vec2, Vec2]>

    declare function toString(geometry: Geom2): string

    declare function toCompactBinary(geom: Geom2): Float32Array

    declare function transform(matrix: Mat4, geometry: Geom2): Geom2

    declare function validate(object: any): void

    Geom2: declare interface Geom2

      sides: Array<[Vec2, Vec2]>

      transforms: Mat4

      color: Color

geom3

    declare function clone(geometry: Geom3): Geom3

    declare function create(polygons?: Array<Poly3>): Geom3

    declare function fromPointsConvex(points: Array<Array<Vec3>>): Geom3

    declare function fromPoints(points: Array<Array<Vec3>>): Geom3

    declare function fromCompactBinary(data: Array<number> | Float32Array | Float64Array): Geom3

    declare function invert(geometry: Geom3): Geom3

    declare function isA(object: any): object is Geom3

    export function isConvex(geometry: Geom3): boolean

    declare function toPoints(geometry: Geom3): Array<Array<Vec3>>

    declare function toPolygons(geometry: Geom3): Array<Poly3>

    declare function toString(geometry: Geom3): string

    declare function toCompactBinary(geom: Geom3): Float32Array

    declare function transform(matrix: Mat4, geometry: Geom3): Geom3

    declare function validate(object: any): void

    Geom3: declare interface Geom3

      polygons: Array<Poly3>

      transforms: Mat4

      color: Color

path2

    declare function appendArc(options: AppendArcOptions, geometry: Path2): Path2

    AppendArcOptions: export interface AppendArcOptions

      endpoint: Vec2

      radius: Vec2

      xaxisrotation: number

      clockwise: boolean

      large: boolean

      segments: number

    declare function appendBezier(options: AppendBezierOptions, geometry: Path2): Path2

    AppendBezierOptions: export interface AppendBezierOptions

      controlPoints: Array<Vec2 | null>

      segments: number

    declare function appendPoints(points: Array<Vec2>, geometry: Path2): Path2

    declare function clone(geometry: Path2): Path2

    declare function close(geometry: Path2): Path2

    declare function concat(...paths: Array<Path2>): Path2

    declare function create(points?: Array<Vec2>): Path2

    declare function equals(a: Path2, b: Path2): boolean

    declare function fromPoints(options: FromPointsOptions, points: Array<Vec2>): Path2

    FromPointsOptions: export interface FromPointsOptions

      closed: boolean

    declare function fromCompactBinary(data: Array<number> | Float32Array | Float64Array): Path2

    declare function isA(object: any): object is Path2

    declare function reverse(path: Path2): Path2

    declare function toPoints(geometry: Path2): Array<Vec2>

    declare function toString(geometry: Path2): string

    declare function toCompactBinary(geometry: Path2): Float32Array

    declare function transform(matrix: Mat4, geometry: Path2): Path2

    declare function validate(object: any): void

    Path2: declare interface Path2

      points: Array<Vec2>

      isClosed: boolean

      transforms: Mat4

      color: Color

poly2

    declare function arePointsInside(points: Array<Vec2>, polygon: Poly2): number

    declare function create(vertices?: Array<Vec2>): Poly2

    declare function flip(polygon: Poly2): Poly2

    declare function measureArea(polygon: Poly2): number

    Poly2: declare interface Poly2

      vertices: Array<Vec2>

poly3

    declare function clone(polygon: Poly3): Poly3
    declare function clone(out: Poly3, polygon: Poly3): Poly3

    declare function create(vertices?: Array<Vec3>): Poly3

    declare function fromPoints(points: Array<Vec3>): Poly3

    declare function fromPointsAndPlane(vertices: Array<Vec3>, plane: Plane): Poly3

    declare function invert(polygon: Poly3): Poly3

    declare function isA(object: any): object is Poly3

    declare function isConvex(polygon: Poly3): boolean

    declare function measureArea(polygon: Poly3): number

    declare function measureBoundingBox(polygon: Poly3): [Vec3, Vec3]

    declare function measureBoundingSphere(polygon: Poly3): Vec4

    declare function measureSignedVolume(polygon: Poly3): number

    declare function plane(polygon: Poly3): Plane;

    declare function toPoints(polygon: Poly3): Array<Vec3>

    declare function toString(polygon: Poly3): string

    declare function transform(matrix: Mat4, polygon: Poly3): Poly3

    declare function validate(object: any): void

    Poly3: declare interface Poly3

      vertices: Array<Vec3>

      color: Color

      plane: Plane
