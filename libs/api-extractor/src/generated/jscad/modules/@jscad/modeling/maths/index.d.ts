import type { Mat4, Plane, Vec2, Vec3 } from '@jscad/modeling';

export namespace constants {
  export const EPS: number;
  export const NEPS: number;
  export const spatialResolution: number;
}
export namespace line2 {
  export declare function clone(line: Line2): Line2;
  export declare function closestPoint(line: Line2, point: Vec2): Vec2;
  export declare function copy(out: Line2, line: Line2): Line2;
  export declare function create(): Line2;
  export declare function direction(line: Line2): Vec2;
  export declare function distanceToPoint(line: Line2, point: Vec2): number;
  export declare function equals(a: Line2, b: Line2): boolean;
  export declare function fromPoints(out: Line2, point1: Vec2, point2: Vec2): Line2;
  export declare function fromValues(x: number, y: number, d: number): Line2;
  export declare function intersectPointOfLines(a: Line2, b: Line2): Vec2;
  export declare function origin(line: Line2): Vec2;
  export declare function reverse(out: Line2, line: Line2): Line2;
  export declare function toString(line: Line2): string;
  export declare function transform(out: Line2, line: Line2, matrix: Mat4): Line2;
  export declare function xAtY(line: Line2, y: number): number;
  export declare type Line2 = [
      number,
      number,
      number
  ];
}
export namespace line3 {
  export declare function clone(line: Line3): Line3;
  export declare function closestPoint(line: Line3, point: Vec3): Vec3;
  export declare function copy(out: Line3, line: Line3): Line3;
  export declare function create(): Line3;
  export declare function direction(line: Line3): Vec3;
  export declare function distanceToPoint(line: Line3, point: Vec3): number;
  export declare function equals(a: Line3, b: Line3): boolean;
  export declare function fromPlanes(out: Line3, a: Plane, b: Plane): Line3;
  export declare function fromPointAndDirection(out: Line3, point: Vec3, direction: Vec3): Line3;
  export declare function fromPoints(out: Line3, point1: Vec3, point2: Vec3): Line3;
  export declare function intersectPointOfLineAndPlane(line: Line3, plane: Plane): Vec3;
  export declare function origin(line: Line3): Vec3;
  export declare function reverse(out: Line3, line: Line3): Line3;
  export declare function toString(line: Line3): string;
  export declare function transform(out: Line3, line: Line3, matrix: Mat4): Line3;
  export declare type Line3 = [
      Vec3,
      Vec3
  ];
}
export namespace mat4 {
  export declare function add(out: Mat4, a: Mat4, b: Mat4): Mat4;
  export declare function clone(matrix: Mat4): Mat4;
  export declare function copy(out: Mat4, matrix: Mat4): Mat4;
  export declare function create(): Mat4;
  export declare function equals(a: Mat4, b: Mat4): boolean;
  export declare function fromRotation(out: Mat4, rad: number, axis: Vec3): Mat4;
  export declare function fromScaling(out: Mat4, vector: Vec3): Mat4;
  export declare function fromTaitBryanRotation(out: Mat4, yaw: number, pitch: number, roll: number): Mat4;
  export declare function fromTranslation(out: Mat4, vector: Vec3): Mat4;
  export declare function fromValues(m00: number, m01: number, m02: number, m03: number, m10: number, m11: number, m12: number, m13: number, m20: number, m21: number, m22: number, m23: number, m30: number, m31: number, m32: number, m33: number): Mat4;
  export declare function fromXRotation(out: Mat4, radians: number): Mat4;
  export declare function fromYRotation(out: Mat4, radians: number): Mat4;
  export declare function fromZRotation(out: Mat4, radians: number): Mat4;
  export declare function identity(out: Mat4): Mat4;
  export declare function isIdentity(matrix: Mat4): boolean;
  export declare function isMirroring(matrix: Mat4): boolean;
  export declare function mirrorByPlane(out: Mat4, plane: Plane): Mat4;
  export declare function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4;
  export declare function rotate(out: Mat4, matrix: Mat4, radians: number, axis: Vec3): Mat4;
  export declare function rotateX(out: Mat4, matrix: Mat4, radians: number): Mat4;
  export declare function rotateY(out: Mat4, matrix: Mat4, radians: number): Mat4;
  export declare function rotateZ(out: Mat4, matrix: Mat4, radians: number): Mat4;
  export declare function scale(out: Mat4, matrix: Mat4, dimensions: Vec3): Mat4;
  export declare function subtract(out: Mat4, a: Mat4, b: Mat4): Mat4;
  export declare function toString(matrix: Mat4): string;
  export declare function translate(out: Mat4, matrix: Mat4, offsets: Vec3): Mat4;
  export declare type Mat4 = [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number
  ];
}
export namespace plane {
  export declare function clone(plane: Plane): Plane;
  export declare function copy(out: Plane, plane: Plane): Plane;
  export declare function create(): Plane;
  export declare function equals(a: Plane, b: Plane): boolean;
  export declare function flip(out: Plane, plane: Plane): Plane;
  export declare function fromNormalAndPoint(out: Plane, normal: Vec3, point: Vec3): Plane;
  export declare function fromValues(x: number, y: number, z: number, w: number): Plane;
  export declare function fromNoisyPoints(out: Plane, ...vertices: Array<Vec3>): Plane;
  export declare function fromPoints(out: Plane, ...vertices: Array<Vec3>): Plane;
  export declare function fromPointsRandom(out: Plane, a: Vec3, b: Vec3, c: Vec3): Plane;
  export declare function signedDistanceToPoint(plane: Plane, vec: Vec3): number;
  export declare function projectionOfPoint(plane: Plane, point: Vec3): Vec3;
  export declare function toString(plane: Plane): string;
  export declare function transform(out: Plane, plane: Plane, matrix: Mat4): Plane;
  export declare type Plane = [
      number,
      number,
      number,
      number
  ];
}
export namespace utils {
  export declare function aboutEqualNormals(a: Vec3, b: Vec3): boolean;
  export declare function area(points: Array<Vec2>): number;
  export declare function interpolateBetween2DPointsForY(point1: Vec2, point2: Vec2, y: number): number;
  export declare function intersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2;
  export declare function solve2Linear(a: number, b: number, c: number, d: number, u: number, v: number): Vec2;
  export function sin(radians: number): number;
  export function cos(radians: number): number;
}
export namespace vec2 {
  export declare function abs(out: Vec2, vector: Vec2): Vec2;
  export declare function add(out: Vec2, a: Vec2, b: Vec2): Vec2;
  export declare function angleRadians(vector: Vec2): number;
  export declare function angleDegrees(vector: Vec2): number;
  export declare function angleRadians(vector: Vec2): number;
  export declare function clone(vec: Vec2): Vec2;
  export declare function copy(out: Vec2, vector: Vec2): Vec2;
  export declare function create(): Vec2;
  export declare function cross(out: Vec3, a: Vec2, b: Vec2): Vec3;
  export declare function distance(a: Vec2, b: Vec2): number;
  export declare function divide(out: Vec2, a: Vec2, b: Vec2): Vec2;
  export declare function dot(a: Vec2, b: Vec2): number;
  export declare function equals(a: Vec2, b: Vec2): boolean;
  export declare function fromAngleDegrees(out: Vec2, degrees: number): Vec2;
  export declare function fromAngleRadians(out: Vec2, radians: number): Vec2;
  export declare function fromScalar(out: Vec2, scalar: number): Vec2;
  export declare function fromValues(x: number, y: number): Vec2;
  export declare function length(vector: Vec2): number;
  export declare function lerp(out: Vec2, a: Vec2, b: Vec2, t: number): Vec2;
  export declare function max(out: Vec2, a: Vec2, b: Vec2): Vec2;
  export declare function min(out: Vec2, a: Vec2, b: Vec2): Vec2;
  export declare function multiply(out: Vec2, a: Vec2, b: Vec2): Vec2;
  export declare function negate(out: Vec2, vec: Vec2): Vec2;
  export declare function normal(out: Vec2, vec: Vec2): Vec2;
  export declare function normalize(out: Vec2, vector: Vec2): Vec2;
  export declare function rotate(out: Vec2, vector: Vec2, origin: Vec2, angle: number): Vec2;
  export declare function scale(out: Vec2, vector: Vec2, amount: number): Vec2;
  export declare function snap(out: Vec2, vector: Vec2, epsilon: number): Vec2;
  export declare function squaredDistance(a: Vec2, b: Vec2): number;
  export declare function squaredLength(vector: Vec2): number;
  export declare function subtract(out: Vec2, a: Vec2, b: Vec2): Vec2;
  export declare function toString(vec: Vec2): string;
  export declare function transform(out: Vec2, vector: Vec2, matrix: Mat4): Vec2;
  export declare type Vec2 = [
      number,
      number
  ];
}
export namespace vec3 {
  export declare function abs(out: Vec3, vector: Vec3): Vec3;
  export declare function add(out: Vec3, a: Vec3, b: Vec3): Vec3;
  export declare function angle(a: Vec3, b: Vec3): number;
  export declare function clone(vector: Vec3): Vec3;
  export declare function copy(out: Vec3, vector: Vec3): Vec3;
  export declare function create(): Vec3;
  export declare function cross(out: Vec3, a: Vec3, b: Vec3): Vec3;
  export declare function distance(a: Vec3, b: Vec3): number;
  export declare function divide(out: Vec3, a: Vec3, b: Vec3): Vec3;
  export declare function dot(a: Vec3, b: Vec3): number;
  export declare function equals(a: Vec3, b: Vec3): boolean;
  export declare function fromScalar(out: Vec3, scalar: number): Vec3;
  export declare function fromValues(x: number, y: number, z: number): Vec3;
  export declare function fromVector2(out: Vec3, vector: Vec2, z?: number): Vec3;
  export declare function length(vector: Vec3): number;
  export declare function lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3;
  export declare function max(out: Vec3, a: Vec3, b: Vec3): Vec3;
  export declare function min(out: Vec3, a: Vec3, b: Vec3): Vec3;
  export declare function multiply(out: Vec3, a: Vec3, b: Vec3): Vec3;
  export declare function negate(out: Vec3, vector: Vec3): Vec3;
  export declare function normalize(out: Vec3, vector: Vec3): Vec3;
  export declare function orthogonal(out: Vec3, vec: Vec3): Vec3;
  export declare function rotateX(out: Vec3, vector: Vec3, origin: Vec3, angle: number): Vec3;
  export declare function rotateY(out: Vec3, vector: Vec3, origin: Vec3, angle: number): Vec3;
  export declare function rotateZ(out: Vec3, vector: Vec3, origin: Vec3, angle: number): Vec3;
  export declare function scale(out: Vec3, vector: Vec3, amount: number): Vec3;
  export declare function snap(out: Vec3, vector: Vec3, epsilon: number): Vec3;
  export declare function squaredDistance(a: Vec3, b: Vec3): number;
  export declare function squaredLength(vector: Vec3): number;
  export declare function subtract(out: Vec3, a: Vec3, b: Vec3): Vec3;
  export declare function toString(vec: Vec3): string;
  export declare function transform(out: Vec3, vector: Vec3, matrix: Mat4): Vec3;
  export declare type Vec3 = [
      number,
      number,
      number
  ];
}
export namespace vec4 {
  export declare function clone(vec: Vec4): Vec4;
  export declare function copy(out: Vec4, vector: Vec4): Vec4;
  export declare function create(): Vec4;
  export declare function dot(a: Vec4, b: Vec4): number;
  export declare function equals(a: Vec4, b: Vec4): boolean;
  export declare function fromScalar(out: Vec4, scalar: number): Vec4;
  export declare function fromValues(x: number, y: number, z: number, w: number): Vec4;
  export declare function toString(vec: Vec4): string;
  export declare function transform(out: Vec4, vector: Vec4, matrix: Mat4): Vec4;
  export declare type Vec4 = [
      number,
      number,
      number,
      number
  ];
}
