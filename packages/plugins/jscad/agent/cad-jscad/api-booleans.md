# @jscad/modeling — booleans

1 top-level symbols. Signatures are verbatim typescript.

booleans

  // booleans.intersect (function)
  declare function intersect(...geometries: RecursiveArray<Geom2>): Geom2
  declare function intersect(...geometries: RecursiveArray<Geom3>): Geom3

  // booleans.minkowski (function)
  export function minkowski(geometryA: Geom3, geometryB: Geom3): Geom3
  export function minkowski(...geometries: Geom3[]): Geom3

  // booleans.subtract (function)
  declare function subtract(...geometries: RecursiveArray<Geom2>): Geom2
  declare function subtract(...geometries: RecursiveArray<Geom3>): Geom3

  // booleans.union (function)
  declare function union(...geometries: RecursiveArray<Geom2>): Geom2
  declare function union(...geometries: RecursiveArray<Geom3>): Geom3

  // booleans.scission (function)
  declare function scission(...geometries: RecursiveArray<Geom3>): Geom3[]
