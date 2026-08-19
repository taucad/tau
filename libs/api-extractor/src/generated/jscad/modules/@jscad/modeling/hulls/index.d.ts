import type { Geom2, Geom3, Path2, Poly3, RecursiveArray, Vec2, Vec3 } from '@jscad/modeling';

export declare function hull(...geometries: RecursiveArray<Geom2>): Geom2;
export declare function hull(...geometries: RecursiveArray<Geom3>): Geom3;
export declare function hull(...geometries: RecursiveArray<Path2>): Path2;
export declare function hullChain(...geometries: RecursiveArray<Geom2>): Geom2;
export declare function hullChain(...geometries: RecursiveArray<Geom3>): Geom3;
export declare function hullChain(...geometries: RecursiveArray<Path2>): Path2;
export declare function hullPoints2(uniquePoints: Array<Vec2>): Array<Vec2>;
export declare function hullPoints3(uniquePoints: Array<Vec3>): Array<Poly3>;
