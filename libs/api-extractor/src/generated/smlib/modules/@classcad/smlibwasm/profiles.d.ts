import { type Complex, Corner, type Seg } from './_planar.js';
import { type AlignLike } from './align.js';
import { Axis, Vector, type VectorLike } from './geometry.js';
import { Sketch, Wire } from './shapes.js';
declare const inspect: unique symbol;
/** The coordinate a line or a forward move goes to: `{ x }`, `{ y }` or both. */
export interface Coordinates {
    x?: number | null;
    y?: number | null;
}
/**
 * A pen that draws an outline in the XY plane, segment by segment.
 *
 * Start it at a point with a heading (degrees counterclockwise from +X), then move:
 *
 *     const section = new Profile([0, 0])
 *       .lineTo(12, 0).lineTo({ y: 4 }).fillet(1.5)
 *       .lineTo({ x: 6 }).lineTo({ y: 20 }).chamfer(1)
 *       .lineTo({ x: 0 })
 *       .close()                  // a Sketch: extrude or revolve it
 *
 * Moves: `lineTo` (to a point, or to an x or y), `lineBy` (by an offset), `forward` (along the
 * heading, or until x or y reaches a value), `arc` (tangent, by radius and angle; a positive angle
 * turns left), `arcTo` (tangent to an end point, or through a point). `turn`/`turnTo` change the
 * heading without drawing. `fillet` and `chamfer` round or bevel the corner at the pen, between the
 * segment before and the segment after. `mirror(axis)` adds the mirror image of the path drawn so
 * far. `close()` makes the region, `wire()` the open path.
 *
 * Each call returns a new Profile; `point` and `heading` tell where the pen is. Errors name the
 * segment (the call that drew it) and the numbers that do not fit.
 */
export declare class Profile {
    _start: Complex;
    _segs: readonly Seg[];
    _labels: readonly string[];
    _corners: readonly (readonly [number, Corner])[];
    _heading: number;
    /** `new Profile(start = [0, 0], { heading })`; the start may be left out:
     * `new Profile({ heading: 90 })`. */
    constructor(start?: VectorLike | {
        heading?: number;
    }, options?: {
        heading?: number;
    });
    _new(changes?: {
        segs?: readonly Seg[];
        labels?: readonly string[];
        corners?: readonly (readonly [number, Corner])[];
        heading?: number;
    }): Profile;
    get _cur(): Complex;
    /** Where the pen is. */
    get point(): Vector;
    /** Where the drawing started. */
    get start(): Vector;
    /** The direction the pen moves in, degrees counterclockwise from +X (-180 to 180). */
    get heading(): number;
    /** The number of segments drawn (Python's `len(profile)`). */
    get length(): number;
    _scale(...pts: Complex[]): number;
    _add(seg: Seg, call: string): Profile;
    /** A straight line to a point: `lineTo(30, 5)` or `lineTo([30, 5])`; or to a coordinate, keeping
     * the other one: `lineTo({ x: 30 })` (horizontal), `lineTo({ y: 5 })` (vertical). */
    lineTo(...args: (number | VectorLike | Coordinates)[]): Profile;
    static _point(args: readonly unknown[], what: string): Complex;
    /** A straight line by an offset from the pen: `lineBy(10, -5)` or `lineBy([10, -5])`. */
    lineBy(dx?: number | VectorLike, dy?: number): Profile;
    /** A straight line along the heading: `length` long (`forward(20)`), or until x reaches a value
     * (`forward({ x: 30 })`, or y: `forward({ y: 5 })`). */
    forward(length?: number | null | Coordinates, options?: Coordinates): Profile;
    /** Turn the heading by `angle` degrees (positive: left) without drawing; the next segment starts
     * at a corner. */
    turn(angle: number): Profile;
    /** Set the heading (degrees counterclockwise from +X) without drawing. */
    turnTo(heading: number): Profile;
    /** A tangent arc of `radius` that turns the heading by `angle` degrees: positive turns left
     * (counterclockwise), negative right. `arc(5, 180)` is a U-turn. */
    arc(radius: number, angle: number): Profile;
    /** An arc to an end point: tangent to the heading (`arcTo(20, 10)`), or through a point
     * (`arcTo(20, 10, { through: [15, 12] })`, which need not be tangent). */
    arcTo(...args: (number | VectorLike | {
        through?: VectorLike | null;
    })[]): Profile;
    _corner(c: Corner): Profile;
    /** Round the corner at the pen with a tangent arc of `radius`: the corner between the segment
     * just drawn and the next one (at the start point: between the closing segment and the first
     * one). */
    fillet(radius: number): Profile;
    /** Bevel the corner at the pen: cut back `length` along the segment before and the segment after
     * (measured along them) and join the two points with a line. */
    chamfer(length: number): Profile;
    /**
     * Continue with the mirror image of the path drawn so far, so that the whole outline is
     * symmetric about `axis` (an axis in the XY plane: `X`, `Y` or `new Axis([x, y], direction)`).
     * Draw half the outline from the axis back to the axis; an end that is off the axis is joined
     * straight across to its mirror image. Corners rounded on the half are rounded on the mirrored
     * half too.
     */
    mirror(axis: Axis): Profile;
    _resolve(closed: boolean): Seg[];
    /** The region inside the outline, as a Sketch on XY: a straight line goes back to the start if
     * the pen is not there. `align` moves the result (null, the default, leaves the outline where it
     * was drawn). */
    close(options?: {
        align?: AlignLike;
    }): Sketch;
    /** The path as drawn, as an open Wire of exact lines and arcs (a sweep path, or a centerline for
     * Stroke). */
    wire(): Wire;
    toString(): string;
    [inspect](): string;
}
export {};
