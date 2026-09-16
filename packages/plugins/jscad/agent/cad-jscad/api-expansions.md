# @jscad/modeling — expansions

1 top-level symbols. Signatures are verbatim typescript.

expansions

  declare function expand(options: ExpandOptions, geometry: Path2 | Geom2): Geom2
  declare function expand(options: ExpandOptions, geometry: Geom3): Geom3
  declare function expand<T extends Geom>(options?: ExpandOptions, ...geometries: RecursiveArray<T>): Array<T>
  declare function expand(options?: ExpandOptions, ...geometries: RecursiveArray<Geom>): Array<Geom>

  ExpandOptions: export interface ExpandOptions

    delta: number

    corners: Corners

    segments: number

  declare function offset<T extends Geometry>(options: OffsetOptions, geometry: T): T
  declare function offset(options?: OffsetOptions, ...geometries: RecursiveArray<Geometry>): Geometry

  OffsetOptions: export interface OffsetOptions

    delta: number

    corners: 'edge' | 'chamfer' | 'round'

    segments: number
