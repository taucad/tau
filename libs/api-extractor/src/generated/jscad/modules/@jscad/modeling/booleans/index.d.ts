import type { Geom2, Geom3, RecursiveArray } from '@jscad/modeling';

export declare function intersect(...geometries: RecursiveArray<Geom2>): Geom2;
export declare function intersect(...geometries: RecursiveArray<Geom3>): Geom3;
export function minkowskiSum(geometryA: Geom3, geometryB: Geom3): Geom3;
export function minkowskiSum(...geometries: Geom3[]): Geom3;
export declare function subtract(...geometries: RecursiveArray<Geom2>): Geom2;
export declare function subtract(...geometries: RecursiveArray<Geom3>): Geom3;
export declare function union(...geometries: RecursiveArray<Geom2>): Geom2;
export declare function union(...geometries: RecursiveArray<Geom3>): Geom3;
export declare function scission(...geometries: RecursiveArray<Geom3>): Geom3[];
