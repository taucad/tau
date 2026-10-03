# @jscad/modeling — hulls

1 top-level symbols. Signatures are verbatim typescript.

hulls

  // hulls.hull (function)
  declare function hull(...geometries: RecursiveArray<Geom2>): Geom2
  declare function hull(...geometries: RecursiveArray<Geom3>): Geom3
  declare function hull(...geometries: RecursiveArray<Path2>): Path2

  // hulls.hullChain (function)
  declare function hullChain(...geometries: RecursiveArray<Geom2>): Geom2
  declare function hullChain(...geometries: RecursiveArray<Geom3>): Geom3
  declare function hullChain(...geometries: RecursiveArray<Path2>): Path2

  // hulls.hullPoints2 (function)
  declare function hullPoints2(uniquePoints: Array<Vec2>): Array<Vec2>

  // hulls.hullPoints3 (function)
  declare function hullPoints3(uniquePoints: Array<Vec3>): Array<Poly3>
