# @jscad/modeling — maths

1 top-level symbols. Signatures are verbatim typescript.

maths

constants

    EPS: number

    NEPS: number

    spatialResolution: number

line2

    declare function clone(line: Line2): Line2

    declare function closestPoint(line: Line2, point: Vec2): Vec2

    declare function copy(out: Line2, line: Line2): Line2

    declare function create(): Line2

    declare function direction(line: Line2): Vec2

    declare function distanceToPoint(line: Line2, point: Vec2): number

    declare function equals(a: Line2, b: Line2): boolean

    declare function fromPoints(out: Line2, point1: Vec2, point2: Vec2): Line2

    declare function fromValues(x: number, y: number, d: number): Line2

    declare function intersectPointOfLines(a: Line2, b: Line2): Vec2

    declare function origin(line: Line2): Vec2

    declare function reverse(out: Line2, line: Line2): Line2

    declare function toString(line: Line2): string

    declare function transform(out: Line2, line: Line2, matrix: Mat4): Line2

    declare function xAtY(line: Line2, y: number): number

    Line2: [number, number, number]

line3

    declare function clone(line: Line3): Line3

    declare function closestPoint(line: Line3, point: Vec3): Vec3

    declare function copy(out: Line3, line: Line3): Line3

    declare function create(): Line3

    declare function direction(line: Line3): Vec3

    declare function distanceToPoint(line: Line3, point: Vec3): number

    declare function equals(a: Line3, b: Line3): boolean

    declare function fromPlanes(out: Line3, a: Plane, b: Plane): Line3

    declare function fromPointAndDirection(out: Line3, point: Vec3, direction: Vec3): Line3

    declare function fromPoints(out: Line3, point1: Vec3, point2: Vec3): Line3

    declare function intersectPointOfLineAndPlane(line: Line3, plane: Plane): Vec3

    declare function origin(line: Line3): Vec3

    declare function reverse(out: Line3, line: Line3): Line3

    declare function toString(line: Line3): string

    declare function transform(out: Line3, line: Line3, matrix: Mat4): Line3

    Line3: [Vec3, Vec3]

mat4

    declare function add(out: Mat4, a: Mat4, b: Mat4): Mat4

    declare function clone(matrix: Mat4): Mat4

    declare function copy(out: Mat4, matrix: Mat4): Mat4

    declare function create(): Mat4

    declare function equals(a: Mat4, b: Mat4): boolean

    declare function fromRotation(out: Mat4, rad: number, axis: Vec3): Mat4

    declare function fromScaling(out: Mat4, vector: Vec3): Mat4

    declare function fromTaitBryanRotation(out: Mat4, yaw: number, pitch: number, roll: number): Mat4

    declare function fromTranslation(out: Mat4, vector: Vec3): Mat4

    declare function fromValues(m00: number, m01: number, m02: number, m03: number, m10: number, m11: number, m12: number, m13: number, m20: number, m21: number, m22: number, m23: number, m30: number, m31: number, m32: number, m33: number): Mat4

    declare function fromXRotation(out: Mat4, radians: number): Mat4

    declare function fromYRotation(out: Mat4, radians: number): Mat4

    declare function fromZRotation(out: Mat4, radians: number): Mat4

    declare function identity(out: Mat4): Mat4

    declare function isIdentity(matrix: Mat4): boolean

    declare function isMirroring(matrix: Mat4): boolean

    declare function mirrorByPlane(out: Mat4, plane: Plane): Mat4

    declare function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4

    declare function rotate(out: Mat4, matrix: Mat4, radians: number, axis: Vec3): Mat4

    declare function rotateX(out: Mat4, matrix: Mat4, radians: number): Mat4

    declare function rotateY(out: Mat4, matrix: Mat4, radians: number): Mat4

    declare function rotateZ(out: Mat4, matrix: Mat4, radians: number): Mat4

    declare function scale(out: Mat4, matrix: Mat4, dimensions: Vec3): Mat4

    declare function subtract(out: Mat4, a: Mat4, b: Mat4): Mat4

    declare function toString(matrix: Mat4): string

    declare function translate(out: Mat4, matrix: Mat4, offsets: Vec3): Mat4

    Mat4: [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
    ]

plane

    declare function clone(plane: Plane): Plane

    declare function copy(out: Plane, plane: Plane): Plane

    declare function create(): Plane

    declare function equals(a: Plane, b: Plane): boolean

    declare function flip(out: Plane, plane: Plane): Plane

    declare function fromNormalAndPoint(out: Plane, normal: Vec3, point: Vec3): Plane

    declare function fromValues(x: number, y: number, z: number, w: number): Plane

    declare function fromNoisyPoints(out: Plane, ...vertices: Array<Vec3>): Plane

    declare function fromPoints(out: Plane, ...vertices: Array<Vec3>): Plane

    declare function fromPointsRandom(out: Plane, a: Vec3, b: Vec3, c: Vec3): Plane

    declare function signedDistanceToPoint(plane: Plane, vec: Vec3): number

    declare function projectionOfPoint(plane: Plane, point: Vec3): Vec3

    declare function toString(plane: Plane): string

    declare function transform(out: Plane, plane: Plane, matrix: Mat4): Plane

    Plane: [number, number, number, number]

utils

    declare function aboutEqualNormals(a: Vec3, b: Vec3): boolean

    declare function area(points: Array<Vec2>): number

    declare function interpolateBetween2DPointsForY(point1: Vec2, point2: Vec2, y: number): number

    declare function intersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2

    declare function solve2Linear(a: number, b: number, c: number, d: number, u: number, v: number): Vec2

    export function sin(radians: number): number

    export function cos(radians: number): number

vec2

    declare function abs(out: Vec2, vector: Vec2): Vec2

    declare function add(out: Vec2, a: Vec2, b: Vec2): Vec2

    declare function angleRadians(vector: Vec2): number

    declare function angleDegrees(vector: Vec2): number

    declare function angleRadians(vector: Vec2): number

    declare function clone(vec: Vec2): Vec2

    declare function copy(out: Vec2, vector: Vec2): Vec2

    declare function create(): Vec2

    declare function cross(out: Vec3, a: Vec2, b: Vec2): Vec3

    declare function distance(a: Vec2, b: Vec2): number

    declare function divide(out: Vec2, a: Vec2, b: Vec2): Vec2

    declare function dot(a: Vec2, b: Vec2): number

    declare function equals(a: Vec2, b: Vec2): boolean

    declare function fromAngleDegrees(out: Vec2, degrees: number): Vec2

    declare function fromAngleRadians(out: Vec2, radians: number): Vec2

    declare function fromScalar(out: Vec2, scalar: number): Vec2

    declare function fromValues(x: number, y: number): Vec2

    declare function length(vector: Vec2): number

    declare function lerp(out: Vec2, a: Vec2, b: Vec2, t: number): Vec2

    declare function max(out: Vec2, a: Vec2, b: Vec2): Vec2

    declare function min(out: Vec2, a: Vec2, b: Vec2): Vec2

    declare function multiply(out: Vec2, a: Vec2, b: Vec2): Vec2

    declare function negate(out: Vec2, vec: Vec2): Vec2

    declare function normal(out: Vec2, vec:  Vec2): Vec2

    declare function normalize(out: Vec2, vector: Vec2): Vec2

    declare function rotate(out: Vec2, vector: Vec2, origin: Vec2, angle: number): Vec2

    declare function scale(out: Vec2, vector: Vec2, amount: number): Vec2

    declare function snap(out: Vec2, vector: Vec2, epsilon: number): Vec2

    declare function squaredDistance(a: Vec2, b: Vec2): number

    declare function squaredLength(vector: Vec2): number

    declare function subtract(out: Vec2, a: Vec2, b: Vec2): Vec2

    declare function toString(vec: Vec2): string

    declare function transform(out: Vec2, vector: Vec2, matrix: Mat4): Vec2

    Vec2: [number, number]

vec3

    declare function abs(out: Vec3, vector: Vec3): Vec3

    declare function add(out: Vec3, a: Vec3, b: Vec3): Vec3

    declare function angle(a: Vec3, b: Vec3): number

    declare function clone(vector: Vec3): Vec3

    declare function copy(out: Vec3, vector: Vec3): Vec3

    declare function create(): Vec3

    declare function cross(out: Vec3, a: Vec3, b: Vec3): Vec3

    declare function distance(a: Vec3, b: Vec3): number

    declare function divide(out: Vec3, a: Vec3, b: Vec3): Vec3

    declare function dot(a: Vec3, b: Vec3): number

    declare function equals(a: Vec3, b: Vec3): boolean

    declare function fromScalar(out: Vec3, scalar: number): Vec3

    declare function fromValues(x: number, y: number, z: number): Vec3

    declare function fromVector2(out: Vec3, vector: Vec2, z?: number): Vec3

    declare function length(vector: Vec3): number

    declare function lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3

    declare function max(out: Vec3, a: Vec3, b: Vec3): Vec3

    declare function min(out: Vec3, a: Vec3, b: Vec3): Vec3

    declare function multiply(out: Vec3, a: Vec3, b: Vec3): Vec3

    declare function negate(out: Vec3, vector: Vec3): Vec3

    declare function normalize(out: Vec3, vector: Vec3): Vec3

    declare function orthogonal(out: Vec3, vec: Vec3): Vec3

    declare function rotateX(out: Vec3, vector: Vec3, origin: Vec3, angle: number): Vec3

    declare function rotateY(out: Vec3, vector: Vec3, origin: Vec3, angle: number): Vec3

    declare function rotateZ(out: Vec3, vector: Vec3, origin: Vec3, angle: number): Vec3

    declare function scale(out: Vec3, vector: Vec3, amount: number): Vec3

    declare function snap(out: Vec3, vector: Vec3, epsilon: number): Vec3

    declare function squaredDistance(a: Vec3, b: Vec3): number

    declare function squaredLength(vector: Vec3): number

    declare function subtract(out: Vec3, a: Vec3, b: Vec3): Vec3

    declare function toString(vec: Vec3): string

    declare function transform(out: Vec3, vector: Vec3, matrix: Mat4): Vec3

    Vec3: [number, number, number]

vec4

    declare function clone(vec: Vec4): Vec4

    declare function copy(out: Vec4, vector: Vec4): Vec4

    declare function create(): Vec4

    declare function dot(a: Vec4, b: Vec4): number

    declare function equals(a: Vec4, b: Vec4): boolean

    declare function fromScalar(out: Vec4, scalar: number): Vec4

    declare function fromValues(x: number, y: number, z: number, w: number): Vec4

    declare function toString(vec: Vec4): string

    declare function transform(out: Vec4, vector: Vec4, matrix: Mat4): Vec4

    Vec4: [number, number, number, number]
