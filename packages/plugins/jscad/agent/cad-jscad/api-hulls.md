# @jscad/modeling — hulls

1 top-level symbols. Signatures are verbatim typescript.

hulls

  declare function hull(...geometries: RecursiveArray<Geom2>): Geom2
  declare function hull(...geometries: RecursiveArray<Geom3>): Geom3
  declare function hull(...geometries: RecursiveArray<Path2>): Path2

  declare function hullChain(...geometries: RecursiveArray<Geom2>): Geom2
  declare function hullChain(...geometries: RecursiveArray<Geom3>): Geom3
  declare function hullChain(...geometries: RecursiveArray<Path2>): Path2

  declare function hullPoints2(uniquePoints: Array<Vec2>): Array<Vec2>

  declare function hullPoints3(uniquePoints: Array<Vec3>): Array<Poly3>
