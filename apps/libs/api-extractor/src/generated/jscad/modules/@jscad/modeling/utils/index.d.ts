import type { Geometry, RecursiveArray } from '@jscad/modeling';

export declare function areAllShapesTheSameType(shapes: Array<Geometry>): boolean;
export declare function degToRad(degrees: number): number;
export declare function flatten<T>(arr: RecursiveArray<T>): Array<T>;
export declare function fnNumberSort(a: number, b: number): number;
export declare function insertSorted<T>(array: Array<T>, element: T, comparefunc: (a: T, b: T) => number): void;
export declare function radiusToSegments(radius: number, minimumLength?: number, minimumAngle?: number): number;
export declare function radToDeg(radians: number): number;
