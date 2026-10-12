# @jscad/modeling — maths

1 top-level symbols. Signatures are verbatim typescript.

maths

  constants

    EPS: number

    NEPS: number

    spatialResolution: number

  line2

    // maths.line2.clone (function)
    declare function clone(line: Line2): Line2

    // maths.line2.closestPoint (function)
    declare function closestPoint(line: Line2, point: Vec2): Vec2

    // maths.line2.copy (function)
    declare function copy(out: Line2, line: Line2): Line2

    // maths.line2.create (function)
    declare function create(): Line2

    // maths.line2.direction (function)
    declare function direction(line: Line2): Vec2

    // maths.line2.distanceToPoint (function)
    declare function distanceToPoint(line: Line2, point: Vec2): number

    // maths.line2.equals (function)
    declare function equals(a: Line2, b: Line2): boolean

    // maths.line2.fromPoints (function)
    declare function fromPoints(out: Line2, point1: Vec2, point2: Vec2): Line2

    // maths.line2.fromValues (function)
    declare function fromValues(x: number, y: number, d: number): Line2

    // maths.line2.intersectPointOfLines (function)
    declare function intersectPointOfLines(a: Line2, b: Line2): Vec2

    // maths.line2.origin (function)
    declare function origin(line: Line2): Vec2

    // maths.line2.reverse (function)
    declare function reverse(out: Line2, line: Line2): Line2

    // maths.line2.toString (function)
    declare function toString(line: Line2): string

    // maths.line2.transform (function)
    declare function transform(out: Line2, line: Line2, matrix: Mat4): Line2

    // maths.line2.xAtY (function)
    declare function xAtY(line: Line2, y: number): number

    Line2: [number, number, number]

  line3

    // maths.line3.clone (function)
    declare function clone(line: Line3): Line3

    // maths.line3.closestPoint (function)
    declare function closestPoint(line: Line3, point: Vec3): Vec3

    // maths.line3.copy (function)
    declare function copy(out: Line3, line: Line3): Line3

    // maths.line3.create (function)
    declare function create(): Line3

    // maths.line3.direction (function)
    declare function direction(line: Line3): Vec3

    // maths.line3.distanceToPoint (function)
    declare function distanceToPoint(line: Line3, point: Vec3): number

    // maths.line3.equals (function)
    declare function equals(a: Line3, b: Line3): boolean

    // maths.line3.fromPlanes (function)
    declare function fromPlanes(out: Line3, a: Plane, b: Plane): Line3

    // maths.line3.fromPointAndDirection (function)
    declare function fromPointAndDirection(out: Line3, point: Vec3, direction: Vec3): Line3

    // maths.line3.fromPoints (function)
    declare function fromPoints(out: Line3, point1: Vec3, point2: Vec3): Line3

    // maths.line3.intersectPointOfLineAndPlane (function)
    declare function intersectPointOfLineAndPlane(line: Line3, plane: Plane): Vec3

    // maths.line3.origin (function)
    declare function origin(line: Line3): Vec3

    // maths.line3.reverse (function)
    declare function reverse(out: Line3, line: Line3): Line3

    // maths.line3.toString (function)
    declare function toString(line: Line3): string

    // maths.line3.transform (function)
    declare function transform(out: Line3, line: Line3, matrix: Mat4): Line3

    Line3: [Vec3, Vec3]

  mat4

    // maths.mat4.add (function)
    declare function add(out: Mat4, a: Mat4, b: Mat4): Mat4

    // maths.mat4.clone (function)
    declare function clone(matrix: Mat4): Mat4

    // maths.mat4.copy (function)
    declare function copy(out: Mat4, matrix: Mat4): Mat4

    // maths.mat4.create (function)
    declare function create(): Mat4

    // maths.mat4.equals (function)
    declare function equals(a: Mat4, b: Mat4): boolean

    // maths.mat4.fromRotation (function)
    declare function fromRotation(out: Mat4, rad: number, axis: Vec3): Mat4

    // maths.mat4.fromScaling (function)
    declare function fromScaling(out: Mat4, vector: Vec3): Mat4

    // maths.mat4.fromTaitBryanRotation (function)
    declare function fromTaitBryanRotation(out: Mat4, yaw: number, pitch: number, roll: number): Mat4

    // maths.mat4.fromTranslation (function)
    declare function fromTranslation(out: Mat4, vector: Vec3): Mat4

    // maths.mat4.fromValues (function)
    declare function fromValues(m00: number, m01: number, m02: number, m03: number, m10: number, m11: number, m12: number, m13: number, m20: number, m21: number, m22: number, m23: number, m30: number, m31: number, m32: number, m33: number): Mat4

    // maths.mat4.fromXRotation (function)
    declare function fromXRotation(out: Mat4, radians: number): Mat4

    // maths.mat4.fromYRotation (function)
    declare function fromYRotation(out: Mat4, radians: number): Mat4

    // maths.mat4.fromZRotation (function)
    declare function fromZRotation(out: Mat4, radians: number): Mat4

    // maths.mat4.identity (function)
    declare function identity(out: Mat4): Mat4

    // maths.mat4.isIdentity (function)
    declare function isIdentity(matrix: Mat4): boolean

    // maths.mat4.isMirroring (function)
    declare function isMirroring(matrix: Mat4): boolean

    // maths.mat4.mirrorByPlane (function)
    declare function mirrorByPlane(out: Mat4, plane: Plane): Mat4

    // maths.mat4.multiply (function)
    declare function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4

    // maths.mat4.rotate (function)
    declare function rotate(out: Mat4, matrix: Mat4, radians: number, axis: Vec3): Mat4

    // maths.mat4.rotateX (function)
    declare function rotateX(out: Mat4, matrix: Mat4, radians: number): Mat4

    // maths.mat4.rotateY (function)
    declare function rotateY(out: Mat4, matrix: Mat4, radians: number): Mat4

    // maths.mat4.rotateZ (function)
    declare function rotateZ(out: Mat4, matrix: Mat4, radians: number): Mat4

    // maths.mat4.scale (function)
    declare function scale(out: Mat4, matrix: Mat4, dimensions: Vec3): Mat4

    // maths.mat4.subtract (function)
    declare function subtract(out: Mat4, a: Mat4, b: Mat4): Mat4

    // maths.mat4.toString (function)
    declare function toString(matrix: Mat4): string

    // maths.mat4.translate (function)
    declare function translate(out: Mat4, matrix: Mat4, offsets: Vec3): Mat4

    Mat4: [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
    ]

  plane

    // maths.plane.clone (function)
    declare function clone(plane: Plane): Plane

    // maths.plane.copy (function)
    declare function copy(out: Plane, plane: Plane): Plane

    // maths.plane.create (function)
    declare function create(): Plane

    // maths.plane.equals (function)
    declare function equals(a: Plane, b: Plane): boolean

    // maths.plane.flip (function)
    declare function flip(out: Plane, plane: Plane): Plane

    // maths.plane.fromNormalAndPoint (function)
    declare function fromNormalAndPoint(out: Plane, normal: Vec3, point: Vec3): Plane

    // maths.plane.fromValues (function)
    declare function fromValues(x: number, y: number, z: number, w: number): Plane

    // maths.plane.fromNoisyPoints (function)
    declare function fromNoisyPoints(out: Plane, ...vertices: Array<Vec3>): Plane

    // maths.plane.fromPoints (function)
    declare function fromPoints(out: Plane, ...vertices: Array<Vec3>): Plane

    // maths.plane.fromPointsRandom (function)
    declare function fromPointsRandom(out: Plane, a: Vec3, b: Vec3, c: Vec3): Plane

    // maths.plane.signedDistanceToPoint (function)
    declare function signedDistanceToPoint(plane: Plane, vec: Vec3): number

    // maths.plane.projectionOfPoint (function)
    declare function projectionOfPoint(plane: Plane, point: Vec3): Vec3

    // maths.plane.toString (function)
    declare function toString(plane: Plane): string

    // maths.plane.transform (function)
    declare function transform(out: Plane, plane: Plane, matrix: Mat4): Plane

    Plane: [number, number, number, number]

  utils

    // maths.utils.aboutEqualNormals (function)
    declare function aboutEqualNormals(a: Vec3, b: Vec3): boolean

    // maths.utils.area (function)
    declare function area(points: Array<Vec2>): number

    // maths.utils.interpolateBetween2DPointsForY (function)
    declare function interpolateBetween2DPointsForY(point1: Vec2, point2: Vec2, y: number): number

    // maths.utils.intersect (function)
    declare function intersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2

    // maths.utils.solve2Linear (function)
    declare function solve2Linear(a: number, b: number, c: number, d: number, u: number, v: number): Vec2

    // maths.utils.sin (function)
    export function sin(radians: number): number

    // maths.utils.cos (function)
    export function cos(radians: number): number

  vec2

    // maths.vec2.abs (function)
    declare function abs(out: Vec2, vector: Vec2): Vec2

    // maths.vec2.add (function)
    declare function add(out: Vec2, a: Vec2, b: Vec2): Vec2

    // maths.vec2.angle (function)
    declare function angle(vector: Vec2): number

    // maths.vec2.angleDegrees (function)
    declare function angleDegrees(vector: Vec2): number

    // maths.vec2.angleRadians (function)
    declare function angleRadians(vector: Vec2): number

    // maths.vec2.clone (function)
    declare function clone(vec: Vec2): Vec2

    // maths.vec2.copy (function)
    declare function copy(out: Vec2, vector: Vec2): Vec2

    // maths.vec2.create (function)
    declare function create(): Vec2

    // maths.vec2.cross (function)
    declare function cross(out: Vec3, a: Vec2, b: Vec2): Vec3

    // maths.vec2.distance (function)
    declare function distance(a: Vec2, b: Vec2): number

    // maths.vec2.divide (function)
    declare function divide(out: Vec2, a: Vec2, b: Vec2): Vec2

    // maths.vec2.dot (function)
    declare function dot(a: Vec2, b: Vec2): number

    // maths.vec2.equals (function)
    declare function equals(a: Vec2, b: Vec2): boolean

    // maths.vec2.fromAngleDegrees (function)
    declare function fromAngleDegrees(out: Vec2, degrees: number): Vec2

    // maths.vec2.fromAngleRadians (function)
    declare function fromAngleRadians(out: Vec2, radians: number): Vec2

    // maths.vec2.fromScalar (function)
    declare function fromScalar(out: Vec2, scalar: number): Vec2

    // maths.vec2.fromValues (function)
    declare function fromValues(x: number, y: number): Vec2

    // maths.vec2.length (function)
    declare function length(vector: Vec2): number

    // maths.vec2.lerp (function)
    declare function lerp(out: Vec2, a: Vec2, b: Vec2, t: number): Vec2

    // maths.vec2.max (function)
    declare function max(out: Vec2, a: Vec2, b: Vec2): Vec2

    // maths.vec2.min (function)
    declare function min(out: Vec2, a: Vec2, b: Vec2): Vec2

    // maths.vec2.multiply (function)
    declare function multiply(out: Vec2, a: Vec2, b: Vec2): Vec2

    // maths.vec2.negate (function)
    declare function negate(out: Vec2, vec: Vec2): Vec2

    // maths.vec2.normal (function)
    declare function normal(out: Vec2, vec:  Vec2): Vec2

    // maths.vec2.normalize (function)
    declare function normalize(out: Vec2, vector: Vec2): Vec2

    // maths.vec2.rotate (function)
    declare function rotate(out: Vec2, vector: Vec2, origin: Vec2, angle: number): Vec2

    // maths.vec2.scale (function)
    declare function scale(out: Vec2, vector: Vec2, amount: number): Vec2

    // maths.vec2.snap (function)
    declare function snap(out: Vec2, vector: Vec2, epsilon: number): Vec2

    // maths.vec2.squaredDistance (function)
    declare function squaredDistance(a: Vec2, b: Vec2): number

    // maths.vec2.squaredLength (function)
    declare function squaredLength(vector: Vec2): number

    // maths.vec2.subtract (function)
    declare function subtract(out: Vec2, a: Vec2, b: Vec2): Vec2

    // maths.vec2.toString (function)
    declare function toString(vec: Vec2): string

    // maths.vec2.transform (function)
    declare function transform(out: Vec2, vector: Vec2, matrix: Mat4): Vec2

    Vec2: [number, number]

  vec3

    // maths.vec3.abs (function)
    declare function abs(out: Vec3, vector: Vec3): Vec3

    // maths.vec3.add (function)
    declare function add(out: Vec3, a: Vec3, b: Vec3): Vec3

    // maths.vec3.angle (function)
    declare function angle(a: Vec3, b: Vec3): number

    // maths.vec3.clone (function)
    declare function clone(vector: Vec3): Vec3

    // maths.vec3.copy (function)
    declare function copy(out: Vec3, vector: Vec3): Vec3

    // maths.vec3.create (function)
    declare function create(): Vec3

    // maths.vec3.cross (function)
    declare function cross(out: Vec3, a: Vec3, b: Vec3): Vec3

    // maths.vec3.distance (function)
    declare function distance(a: Vec3, b: Vec3): number

    // maths.vec3.divide (function)
    declare function divide(out: Vec3, a: Vec3, b: Vec3): Vec3

    // maths.vec3.dot (function)
    declare function dot(a: Vec3, b: Vec3): number

    // maths.vec3.equals (function)
    declare function equals(a: Vec3, b: Vec3): boolean

    // maths.vec3.fromScalar (function)
    declare function fromScalar(out: Vec3, scalar: number): Vec3

    // maths.vec3.fromValues (function)
    declare function fromValues(x: number, y: number, z: number): Vec3

    // maths.vec3.fromVec2 (function)
    declare function fromVec2(out: Vec3, vector: Vec2, z?: number): Vec3

    // maths.vec3.length (function)
    declare function length(vector: Vec3): number

    // maths.vec3.lerp (function)
    declare function lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3

    // maths.vec3.max (function)
    declare function max(out: Vec3, a: Vec3, b: Vec3): Vec3

    // maths.vec3.min (function)
    declare function min(out: Vec3, a: Vec3, b: Vec3): Vec3

    // maths.vec3.multiply (function)
    declare function multiply(out: Vec3, a: Vec3, b: Vec3): Vec3

    // maths.vec3.negate (function)
    declare function negate(out: Vec3, vector: Vec3): Vec3

    // maths.vec3.normalize (function)
    declare function normalize(out: Vec3, vector: Vec3): Vec3

    // maths.vec3.orthogonal (function)
    declare function orthogonal(out: Vec3, vec: Vec3): Vec3

    // maths.vec3.rotateX (function)
    declare function rotateX(out: Vec3, vector: Vec3, origin: Vec3, angle: number): Vec3

    // maths.vec3.rotateY (function)
    declare function rotateY(out: Vec3, vector: Vec3, origin: Vec3, angle: number): Vec3

    // maths.vec3.rotateZ (function)
    declare function rotateZ(out: Vec3, vector: Vec3, origin: Vec3, angle: number): Vec3

    // maths.vec3.scale (function)
    declare function scale(out: Vec3, vector: Vec3, amount: number): Vec3

    // maths.vec3.snap (function)
    declare function snap(out: Vec3, vector: Vec3, epsilon: number): Vec3

    // maths.vec3.squaredDistance (function)
    declare function squaredDistance(a: Vec3, b: Vec3): number

    // maths.vec3.squaredLength (function)
    declare function squaredLength(vector: Vec3): number

    // maths.vec3.subtract (function)
    declare function subtract(out: Vec3, a: Vec3, b: Vec3): Vec3

    // maths.vec3.toString (function)
    declare function toString(vec: Vec3): string

    // maths.vec3.transform (function)
    declare function transform(out: Vec3, vector: Vec3, matrix: Mat4): Vec3

    Vec3: [number, number, number]

  vec4

    // maths.vec4.clone (function)
    declare function clone(vec: Vec4): Vec4

    // maths.vec4.copy (function)
    declare function copy(out: Vec4, vector: Vec4): Vec4

    // maths.vec4.create (function)
    declare function create(): Vec4

    // maths.vec4.dot (function)
    declare function dot(a: Vec4, b: Vec4): number

    // maths.vec4.equals (function)
    declare function equals(a: Vec4, b: Vec4): boolean

    // maths.vec4.fromScalar (function)
    declare function fromScalar(out: Vec4, scalar: number): Vec4

    // maths.vec4.fromValues (function)
    declare function fromValues(x: number, y: number, z: number, w: number): Vec4

    // maths.vec4.toString (function)
    declare function toString(vec: Vec4): string

    // maths.vec4.transform (function)
    declare function transform(out: Vec4, vector: Vec4, matrix: Mat4): Vec4

    Vec4: [number, number, number, number]
