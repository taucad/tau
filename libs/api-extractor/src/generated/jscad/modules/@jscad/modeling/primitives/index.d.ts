import type { Geom2, Geom3, Path2, RGB, RGBA, Vec2, Vec3 } from '@jscad/modeling';

export declare function arc(options?: ArcOptions): Path2;
export interface ArcOptions {
    center?: Vec2;
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    segments?: number;
    makeTangent?: boolean;
}
export declare function circle(options?: CircleOptions): Geom2;
export interface CircleOptions {
    center?: Vec2;
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    segments?: number;
}
export declare function cube(options?: CubeOptions): Geom3;
export interface CubeOptions {
    center?: Vec3;
    size?: number;
}
export declare function cuboid(options?: CuboidOptions): Geom3;
export interface CuboidOptions {
    center?: Vec3;
    size?: Vec3;
}
export declare function cylinder(options?: CylinderOptions): Geom3;
export interface CylinderOptions {
    center?: Vec3;
    height?: number;
    radius?: number;
    segments?: number;
}
export declare function cylinderElliptic(options?: CylinderEllipticOptions): Geom3;
export interface CylinderEllipticOptions {
    center?: Vec3;
    height?: number;
    startRadius?: [
        number,
        number
    ];
    startAngle?: number;
    endRadius?: [
        number,
        number
    ];
    endAngle?: number;
    segments?: number;
}
export declare function ellipse(options?: EllipseOptions): Geom2;
export interface EllipseOptions {
    center?: Vec2;
    radius?: Vec2;
    startAngle?: number;
    endAngle?: number;
    segments?: number;
}
export declare function ellipsoid(options?: EllipsoidOptions): Geom3;
export interface EllipsoidOptions {
    center?: Vec3;
    radius?: Vec3;
    segments?: number;
    axes?: Vec3;
}
export declare function geodesicSphere(options?: GeodesicSphereOptions): Geom3;
export interface GeodesicSphereOptions {
    radius?: number;
    frequency?: number;
}
export declare function line(points: Array<Vec2>): Path2;
export declare function polygon(options: PolygonOptions): Geom2;
export interface PolygonOptions {
    points: Array<Vec2> | Array<Array<Vec2>>;
    paths?: Array<number> | Array<Array<number>>;
    orientation?: 'counterclockwise' | 'clockwise';
}
export declare function polyhedron(options: PolyhedronOptions): Geom3;
export interface PolyhedronOptions {
    points: Array<Vec3>;
    faces: Array<Array<number>>;
    colors?: Array<RGB | RGBA>;
    orientation?: 'outward' | 'inward';
}
export declare function rectangle(options?: RectangleOptions): Geom2;
export interface RectangleOptions {
    center?: Vec2;
    size?: Vec2;
}
export declare function roundedCuboid(options?: RoundedCuboidOptions): Geom3;
export interface RoundedCuboidOptions {
    center?: Vec3;
    size?: Vec3;
    roundRadius?: number;
    segments?: number;
}
export declare function roundedCylinder(options?: RoundedCylinderOptions): Geom3;
export interface RoundedCylinderOptions {
    center?: Vec3;
    height?: number;
    radius?: number;
    roundRadius?: number;
    segments?: number;
}
export declare function roundedRectangle(options?: RoundedRectangleOptions): Geom2;
export interface RoundedRectangleOptions {
    center?: Vec2;
    size?: Vec2;
    roundRadius?: number;
    segments?: number;
}
export declare function sphere(options?: SphereOptions): Geom3;
export interface SphereOptions {
    center?: Vec3;
    radius?: number;
    segments?: number;
    axes?: Vec3;
}
export declare function square(options?: SquareOptions): Geom2;
export interface SquareOptions {
    center?: Vec2;
    size?: number;
}
export declare function star(options?: StarOptions): Geom2;
export interface StarOptions {
    center?: Vec2;
    vertices?: number;
    density?: number;
    outerRadius?: number;
    innerRadius?: number;
    startAngle?: number;
}
export declare function torus(options?: TorusOptions): Geom3;
export interface TorusOptions {
    innerRadius?: number;
    outerRadius?: number;
    innerSegments?: number;
    outerSegments?: number;
    innerRotation?: number;
    outerRotation?: number;
    startAngle?: number;
}
export declare function triangle(options?: TriangleOptions): Geom2;
export interface TriangleOptions {
    type?: 'AAA' | 'AAS' | 'ASA' | 'SAS' | 'SSA' | 'SSS';
    values?: [
        number,
        number,
        number
    ];
}
