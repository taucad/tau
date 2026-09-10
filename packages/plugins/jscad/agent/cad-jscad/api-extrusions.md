# @jscad/modeling — extrusions

1 top-level symbols. Signatures are verbatim typescript.

extrusions

declare function extrudeFromSlices<Base>(options: ExtrudeFromSlicesOptions<Base>, base: Base): Geom3

ExtrudeFromSlicesOptions: export interface ExtrudeFromSlicesOptions<Base>

    numberOfSlices: number

    capStart: boolean

    capEnd: boolean

    close: boolean

    callback: (progress: number, index: number, base: Base) => Slice

declare function extrudeLinear(options: ExtrudeLinearOptions, geometry: Geometry): Geom3
declare function extrudeLinear(options: ExtrudeLinearOptions, ...geometries: RecursiveArray<Geometry>): Geom3

ExtrudeLinearOptions: export interface ExtrudeLinearOptions

    height: number

    twistAngle: number

    twistSteps: number

declare function extrudeRectangular(options: ExtrudeRectangularOptions, geometry: Geometry): Geom3
declare function extrudeRectangular(options: ExtrudeRectangularOptions, ...geometries: RecursiveArray<Geometry>): Geom3

ExtrudeRectangularOptions: export interface ExtrudeRectangularOptions

    size: number

    height: number

    corners: Corners

    segments: number

declare function extrudeRotate(options: ExtrudeRotateOptions, geometry: Geom2): Geom3

ExtrudeRotateOptions: export interface ExtrudeRotateOptions

    angle: number

    startAngle: number

    overflow: 'cap'

    segments: number

declare function extrudeHelical(options: ExtrudeHelicalOptions, geometry: Geom2): Geom3

ExtrudeHelicalOptions: export interface ExtrudeHelicalOptions

    angle: number

    startAngle: number

    pitch: number

    height: number

    endOffset: number

    segmentsPerRotation: number

declare function project(options: ProjectOptions, geometry: Geom3): Geom2
declare function project(options: ProjectOptions, ...geometries: RecursiveArray<Geom3>): Array<Geom2>
declare function project(options: ProjectOptions, ...geometries: RecursiveArray<any>): Array<any>

ProjectOptions: export interface ProjectOptions

    axis: Vec3

    origin: Vec3

slice

    declare function calculatePlane(slice: Slice): Plane

    declare function clone(slice: Slice): Slice
    declare function clone(out: Slice, slice: Slice): Slice

    declare function create(edges?: Slice['edges']): Slice

    declare function equals(a: Slice, b: Slice): boolean

    declare function fromPoints(points: Array<Point>): Slice

    declare function fromSides(sides: Geom2['sides']): Slice

    declare function isA(object: any): object is Slice

    declare function reverse(slice: Slice): Slice
    declare function reverse(out: Slice, slice: Slice): Slice

    declare function toEdges(slice: Slice): Slice['edges']

    declare function toPolygons(slice: Slice): Array<Poly3>

    declare function toString(slice: Slice): string

    declare function transform(matrix: Mat4, slice: Slice): Slice

    Slice: interface Slice

      edges: Array<[Vec3, Vec3]>
