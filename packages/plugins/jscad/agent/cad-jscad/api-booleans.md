# @jscad/modeling — booleans

1 top-level symbols. Signatures are verbatim typescript.

booleans

  declare function intersect(...geometries: RecursiveArray<Geom2>): Geom2
  declare function intersect(...geometries: RecursiveArray<Geom3>): Geom3

  export function minkowskiSum(geometryA: Geom3, geometryB: Geom3): Geom3
  export function minkowskiSum(...geometries: Geom3[]): Geom3

  declare function subtract(...geometries: RecursiveArray<Geom2>): Geom2
  declare function subtract(...geometries: RecursiveArray<Geom3>): Geom3

  declare function union(...geometries: RecursiveArray<Geom2>): Geom2
  declare function union(...geometries: RecursiveArray<Geom3>): Geom3

  declare function scission(...geometries: RecursiveArray<Geom3>): Geom3[]
