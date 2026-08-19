import type { Corners, Geom2, Geom3, Mat4, Path2, Plane, Poly3, RecursiveArray, Vec2, Vec3 } from '@jscad/modeling';

export type Geometry = Path2 | Geom2;
export declare function extrudeFromSlices<Base>(options: ExtrudeFromSlicesOptions<Base>, base: Base): Geom3;
export interface ExtrudeFromSlicesOptions<Base> {
    numberOfSlices?: number;
    capStart?: boolean;
    capEnd?: boolean;
    close?: boolean;
    callback?: (progress: number, index: number, base: Base) => Slice;
}
export declare function extrudeLinear(options: ExtrudeLinearOptions, geometry: Geometry): Geom3;
export declare function extrudeLinear(options: ExtrudeLinearOptions, ...geometries: RecursiveArray<Geometry>): Geom3;
export interface ExtrudeLinearOptions {
    height?: number;
    twistAngle?: number;
    twistSteps?: number;
}
export declare function extrudeRectangular(options: ExtrudeRectangularOptions, geometry: Geometry): Geom3;
export declare function extrudeRectangular(options: ExtrudeRectangularOptions, ...geometries: RecursiveArray<Geometry>): Geom3;
export interface ExtrudeRectangularOptions {
    size?: number;
    height?: number;
    corners?: Corners;
    segments?: number;
}
export declare function extrudeRotate(options: ExtrudeRotateOptions, geometry: Geom2): Geom3;
export interface ExtrudeRotateOptions {
    angle?: number;
    startAngle?: number;
    overflow?: 'cap';
    segments?: number;
}
export declare function extrudeHelical(options: ExtrudeHelicalOptions, geometry: Geom2): Geom3;
export interface ExtrudeHelicalOptions {
    angle?: number;
    startAngle?: number;
    pitch?: number;
    height?: number;
    endOffset?: number;
    segmentsPerRotation?: number;
}
export declare function project(options: ProjectOptions, geometry: Geom3): Geom2;
export declare function project(options: ProjectOptions, ...geometries: RecursiveArray<Geom3>): Array<Geom2>;
export declare function project(options: ProjectOptions, ...geometries: RecursiveArray<any>): Array<any>;
export interface ProjectOptions {
    axis?: Vec3;
    origin?: Vec3;
}
export namespace slice {
  export type Point = Vec2 | Vec3;
  export declare function calculatePlane(slice: Slice): Plane;
  export declare function clone(slice: Slice): Slice;
  export declare function clone(out: Slice, slice: Slice): Slice;
  export declare function create(edges?: Slice['edges']): Slice;
  export declare function equals(a: Slice, b: Slice): boolean;
  export declare function fromPoints(points: Array<Point>): Slice;
  export declare function fromSides(sides: Geom2['sides']): Slice;
  export declare function isA(object: any): object is Slice;
  export declare function reverse(slice: Slice): Slice;
  export declare function reverse(out: Slice, slice: Slice): Slice;
  export declare function toEdges(slice: Slice): Slice['edges'];
  export declare function toPolygons(slice: Slice): Array<Poly3>;
  export declare function toString(slice: Slice): string;
  export declare function transform(matrix: Mat4, slice: Slice): Slice;
  export interface Slice {
      edges: Array<[
          Vec3,
          Vec3
      ]>;
  }
}
