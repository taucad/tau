import { Location, type Vector } from './geometry.js';
import { Shape, ShapeList } from './shapes.js';
declare const inspect: unique symbol;
/**
 * A list of locations. `new Locations([0, 0], [10, 5], ...)` takes points, locations, planes,
 * faces (their center planes) or vertices.
 */
export declare class Locations extends Array<Location> {
    static get [Symbol.species](): ArrayConstructor;
    constructor(...items: unknown[]);
    /**
     * Each location applied to something: a location (each composed with it), another pattern
     * (every pair), a shape or a list of shapes (one copy per location; a ShapeList).
     */
    mul(other: Location | Locations): Locations;
    mul<T>(other: Shape | Iterable<T>): ShapeList<Any>;
    /** The pattern moved by a location (`location.mul(pattern)`). */
    moved(location: Location): Locations;
    /** The pattern placed onto a plane or face. */
    on(target: unknown): Locations;
    get points(): Vector[];
    toString(): string;
    [inspect](): string;
}
type Any = any;
/** A rectangular grid in the XY plane, centered on the origin unless `centered: false`. */
export declare function GridLocations(xSpacing: number, ySpacing: number, xCount: number, yCount: number, options?: {
    centered?: boolean;
}): Locations;
/**
 * `count` locations on a circle of `radius` in the XY plane.
 *
 * With `rotate` the copies turn with the pattern (their X axis points outward). A full circle
 * (`angularRange: 360`) spaces them evenly without repeating the start.
 */
export declare function PolarLocations(radius: number, count: number, options?: {
    startAngle?: number;
    angularRange?: number;
    rotate?: boolean;
}): Locations;
/** A honeycomb pattern: rows `spacing` apart along X, every other row shifted by half. */
export declare function HexLocations(spacing: number, xCount: number, yCount: number, options?: {
    centered?: boolean;
}): Locations;
export {};
