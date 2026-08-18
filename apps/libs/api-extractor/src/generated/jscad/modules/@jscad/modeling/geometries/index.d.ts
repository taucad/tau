import type { Color, Mat4, Plane, Poly3, Vec2, Vec3, Vec4 } from '@jscad/modeling';

export namespace geom2 {
  export declare function clone(geometry: Geom2): Geom2;
  export declare function create(sides?: Array<[
      Vec2,
      Vec2
  ]>): Geom2;
  export declare function fromPoints(points: Array<Vec2>): Geom2;
  export declare function fromCompactBinary(data: Array<number> | Float32Array | Float64Array): Geom2;
  export declare function isA(object: any): object is Geom2;
  export declare function reverse(geometry: Geom2): Geom2;
  export declare function toOutlines(geometry: Geom2): Array<Array<Vec2>>;
  export declare function toPoints(geometry: Geom2): Array<Vec2>;
  export declare function toSides(geometry: Geom2): Array<[
      Vec2,
      Vec2
  ]>;
  export declare function toString(geometry: Geom2): string;
  export declare function toCompactBinary(geom: Geom2): Float32Array;
  export declare function transform(matrix: Mat4, geometry: Geom2): Geom2;
  export declare function validate(object: any): void;
  export declare interface Geom2 {
      sides: Array<[
          Vec2,
          Vec2
      ]>;
      transforms: Mat4;
      color?: Color;
  }
}
export namespace geom3 {
  export declare function clone(geometry: Geom3): Geom3;
  export declare function create(polygons?: Array<Poly3>): Geom3;
  export declare function fromPointsConvex(points: Array<Array<Vec3>>): Geom3;
  export declare function fromPoints(points: Array<Array<Vec3>>): Geom3;
  export declare function fromCompactBinary(data: Array<number> | Float32Array | Float64Array): Geom3;
  export declare function invert(geometry: Geom3): Geom3;
  export declare function isA(object: any): object is Geom3;
  export function isConvex(geometry: Geom3): boolean;
  export declare function toPoints(geometry: Geom3): Array<Array<Vec3>>;
  export declare function toPolygons(geometry: Geom3): Array<Poly3>;
  export declare function toString(geometry: Geom3): string;
  export declare function toCompactBinary(geom: Geom3): Float32Array;
  export declare function transform(matrix: Mat4, geometry: Geom3): Geom3;
  export declare function validate(object: any): void;
  export declare interface Geom3 {
      polygons: Array<Poly3>;
      transforms: Mat4;
      color?: Color;
  }
}
export namespace path2 {
  export declare function appendArc(options: AppendArcOptions, geometry: Path2): Path2;
  export interface AppendArcOptions {
      endpoint: Vec2;
      radius?: Vec2;
      xaxisrotation?: number;
      clockwise?: boolean;
      large?: boolean;
      segments?: number;
  }
  export declare function appendBezier(options: AppendBezierOptions, geometry: Path2): Path2;
  export interface AppendBezierOptions {
      controlPoints: Array<Vec2 | null>;
      segments?: number;
  }
  export declare function appendPoints(points: Array<Vec2>, geometry: Path2): Path2;
  export declare function clone(geometry: Path2): Path2;
  export declare function close(geometry: Path2): Path2;
  export declare function concat(...paths: Array<Path2>): Path2;
  export declare function create(points?: Array<Vec2>): Path2;
  export declare function equals(a: Path2, b: Path2): boolean;
  export declare function fromPoints(options: FromPointsOptions, points: Array<Vec2>): Path2;
  export interface FromPointsOptions {
      closed?: boolean;
  }
  export declare function fromCompactBinary(data: Array<number> | Float32Array | Float64Array): Path2;
  export declare function isA(object: any): object is Path2;
  export declare function reverse(path: Path2): Path2;
  export declare function toPoints(geometry: Path2): Array<Vec2>;
  export declare function toString(geometry: Path2): string;
  export declare function toCompactBinary(geometry: Path2): Float32Array;
  export declare function transform(matrix: Mat4, geometry: Path2): Path2;
  export declare function validate(object: any): void;
  export declare interface Path2 {
      points: Array<Vec2>;
      isClosed: boolean;
      transforms: Mat4;
      color?: Color;
  }
}
export namespace poly2 {
  export declare function arePointsInside(points: Array<Vec2>, polygon: Poly2): number;
  export declare function create(vertices?: Array<Vec2>): Poly2;
  export declare function flip(polygon: Poly2): Poly2;
  export declare function measureArea(polygon: Poly2): number;
  export declare interface Poly2 {
      vertices: Array<Vec2>;
  }
}
export namespace poly3 {
  export declare function clone(polygon: Poly3): Poly3;
  export declare function clone(out: Poly3, polygon: Poly3): Poly3;
  export declare function create(vertices?: Array<Vec3>): Poly3;
  export declare function fromPoints(points: Array<Vec3>): Poly3;
  export declare function fromPointsAndPlane(vertices: Array<Vec3>, plane: Plane): Poly3;
  export declare function invert(polygon: Poly3): Poly3;
  export declare function isA(object: any): object is Poly3;
  export declare function isConvex(polygon: Poly3): boolean;
  export declare function measureArea(polygon: Poly3): number;
  export declare function measureBoundingBox(polygon: Poly3): [
      Vec3,
      Vec3
  ];
  export declare function measureBoundingSphere(polygon: Poly3): Vec4;
  export declare function measureSignedVolume(polygon: Poly3): number;
  export declare function plane(polygon: Poly3): Plane;
  export declare function toPoints(polygon: Poly3): Array<Vec3>;
  export declare function toString(polygon: Poly3): string;
  export declare function transform(matrix: Mat4, polygon: Poly3): Poly3;
  export declare function validate(object: any): void;
  export declare interface Poly3 {
      vertices: Array<Vec3>;
      color?: Color;
      plane?: Plane;
  }
}
