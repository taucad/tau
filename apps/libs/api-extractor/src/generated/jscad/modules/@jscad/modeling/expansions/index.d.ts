import type { Corners, Geom2, Geom3, Path2, RecursiveArray } from '@jscad/modeling';

export type Geom = Path2 | Geom2 | Geom3;
export type Geometry = Path2 | Geom2;
export declare function expand(options: ExpandOptions, geometry: Path2 | Geom2): Geom2;
export declare function expand(options: ExpandOptions, geometry: Geom3): Geom3;
export declare function expand<T extends Geom>(options?: ExpandOptions, ...geometries: RecursiveArray<T>): Array<T>;
export declare function expand(options?: ExpandOptions, ...geometries: RecursiveArray<Geom>): Array<Geom>;
export interface ExpandOptions {
    delta?: number;
    corners?: Corners;
    segments?: number;
}
export declare function offset<T extends Geometry>(options: OffsetOptions, geometry: T): T;
export declare function offset(options?: OffsetOptions, ...geometries: RecursiveArray<Geometry>): Geometry;
export interface OffsetOptions {
    delta?: number;
    corners?: 'edge' | 'chamfer' | 'round';
    segments?: number;
}
