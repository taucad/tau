import { Axis, Vector, type VectorLike } from './geometry.js';
import { Edge, Face, Part, Shape, ShapeList, Sketch } from './shapes.js';
declare const inspect: unique symbol;
/** Default K-factor: the neutral fiber at 0.44 of the thickness from the inside surface. */
export declare const K_FACTOR = 0.44;
/**
 * What `kFactor` of `unfold`, `flatPattern` and `bends` takes: one K-factor for every bend; a
 * function `(radius, thickness, angle) => k`; a mapping from inside radius to K-factor (a `Map`, or
 * an object such as `{ 1: 0.33, 6: 0.45 }`); `[r / t, k]` pairs, interpolated; `'din6935'`; or
 * `null`/left out, the K-factor each bend was folded with (`fold`, `flange`), else `K_FACTOR`.
 */
export type KFactor = number | string | ((radius: number, thickness: number, angle: number) => number) | ReadonlyMap<number, number> | Readonly<Record<string, number>> | readonly (readonly [
    number,
    number
])[] | null;
/** The bend of `bendAllowance` and `bendDeduction`. */
export interface BendAllowanceOptions {
    /** Inside bend radius. */
    radius: number;
    /** Sheet thickness. */
    thickness: number;
    /** Position of the neutral fiber, 0 (inside) to 1 (outside); default `K_FACTOR`. */
    kFactor?: number;
}
/** The bends of `developedLength`. */
export interface DevelopedLengthOptions extends BendAllowanceOptions {
    /** The angle of every bend in degrees, or one angle per bend (default 90). */
    angle?: number | Iterable<number>;
}
/** Smallest inside radius: the kernel's bend region reaches 0.1 past the sheet on both sides, so
 * unfolding needs a radius above 0.1. */
export declare const MIN_RADIUS = 0.11;
/**
 * The K-factor of DIN 6935 for a bend of inside `radius` in a sheet of `thickness`: the standard
 * puts the neutral fiber at `k * t / 2` from the inside with the correction factor
 * `k = 0.65 + 0.5 * log10(r / t)`, which reaches 1 (the middle of the sheet) at `r / t = 5`. As a
 * K-factor: `k / 2`, from 0 to 0.5.
 */
export declare function din6935(radius: number, thickness: number): number;
/**
 * Length of the flat strip that a bend takes: `radians(angle) * (radius + kFactor * thickness)`.
 *
 * `angle` is the bend angle in degrees (90 for an L), `radius` the inside radius.
 */
export declare function bendAllowance(angle: number, options: BendAllowanceOptions): number;
/**
 * What a bend takes off the sum of the outside leg lengths: `2 * (radius + thickness) *
 * tan(angle / 2) - bendAllowance`. The outside lengths run to the virtual sharp, where the outer
 * faces of the two legs meet (below 180 degrees).
 */
export declare function bendDeduction(angle: number, options: BendAllowanceOptions): number;
/**
 * Length of the flat blank for a strip bent into `legs`:
 * `developedLength(30, 25, { radius: 2, thickness: 2 })`.
 *
 * The legs are outside lengths: from the free end, or from the virtual sharp where the outer
 * faces of two legs meet, to the next virtual sharp (the dimensions on a drawing of the part).
 * `angle` is the angle of every bend, or one angle per bend (`legs.length - 1` of them). The
 * result is `sum(legs) - sum(bend deductions)`.
 */
export declare function developedLength(...args: [
    ...legs: number[],
    options: DevelopedLengthOptions
]): number;
/**
 * One bend of a sheet metal part.
 *
 * `angle` in degrees, `radius` the inside radius, `length` the bend's extent along its axis.
 * From `bends`, `axis` is the axis of the bend's cylinders. In a `FlatPattern`, `line` is the bend
 * line (the middle of the bend's strip, at z = 0) and `direction` "up" or "down": where the sheet
 * beyond the line folds to, seen from above (+Z).
 */
export declare class Bend {
    readonly angle: number;
    readonly radius: number;
    readonly thickness: number;
    readonly kFactor: number;
    readonly length: number;
    readonly axis: Axis | null;
    readonly line: Edge | null;
    readonly direction: string | null;
    constructor(angle: number, radius: number, thickness: number, kFactor: number, length: number, axis?: Axis | null, line?: Edge | null, direction?: string | null);
    /** The bend allowance (the width of the bend's strip in the flat). */
    get allowance(): number;
    /** Equal fields (Python's dataclass `==`). */
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
/**
 * The unfolded part, laid on the XY plane: its bottom face at z = 0, the top at z = thickness,
 * the longer side of the smallest rectangle around it along X and its bounding box starting at
 * the origin.
 *
 * `outline` is the cut contour (outer boundary and holes) as a sketch at z = 0; `bends` carry the
 * bend lines (at z = 0) with angle, radius, direction, K-factor and allowance. `kFactor` is the
 * K-factor of every bend, or `null` where the bends have different ones (each `Bend` has its own).
 */
export declare class FlatPattern {
    readonly part: Part;
    readonly outline: Sketch;
    readonly bends: Bend[];
    readonly thickness: number;
    readonly kFactor: number | null;
    constructor(part: Part, outline: Sketch, bends: Bend[], thickness: number, kFactor: number | null);
    /** The bend lines (middle of each bend's strip), at z = 0. */
    get bendLines(): ShapeList<Edge>;
    /** Size of the blank: (length along X, width along Y, thickness), measured on its edges. */
    get size(): Vector;
    /** Equal fields (Python's dataclass `==`). */
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
/** Options of `fold`. */
export interface FoldOptions {
    /** Inside bend radius. */
    radius: number;
    /** Position of the neutral fiber, 0 (inside) to 1 (outside); default `K_FACTOR`. The part keeps
     * it with the bend: `unfold` and `flatPattern` take it by default. */
    kFactor?: number;
    /** A point (or a face, edge or vertex) on the side of the line that stays in place; by default
     * the side that reaches farther from the line stays. */
    fixed?: VectorLike | Shape | null;
    /** Bend only along the segment `line` (an Edge), not across the whole sheet. The strip next to
     * the segment must be cut free from the rest of the sheet (relief cuts). */
    partial?: boolean;
}
/**
 * Fold a sheet along a line.
 *
 * @param part A sheet: a solid of constant thickness (a plate, or a part bent before).
 * @param line The bend line, an `Axis` or a straight `Edge` lying on the top or bottom face of the
 *   sheet. It is the middle of the bend: the strip of the bend allowance's width centered on it
 *   becomes the bend.
 * @param angle Bend angle in degrees, up to 180. A positive angle folds the sheet towards the side
 *   the face with the line faces (that face ends up inside the bend); a negative angle folds it
 *   the other way.
 * @param options `radius` (the inside bend radius), `kFactor` (the position of the neutral fiber,
 *   0 inside to 1 outside), `fixed` (a point, or a face, edge or vertex, on the side of the line
 *   that stays in place; by default the side that reaches farther from the line stays) and
 *   `partial` (bend only along the segment `line`, an Edge, not across the whole sheet; the strip
 *   next to the segment must be cut free from the rest of the sheet by relief cuts).
 * @returns The bent part: the bend faces are exact cylinders of `radius` and `radius + thickness`.
 */
export declare function fold(part: Part, line: Axis | Edge, angle: number, options: FoldOptions): Part;
/** Options of `flange`. */
export interface FlangeOptions {
    /** Bend angle in degrees, below 180 (default 90). A positive angle folds the flange towards the
     * side the face with the edge faces, a negative one the other way. */
    angle?: number;
    /** Inside bend radius. */
    radius: number;
    /** Position of the neutral fiber, 0 (inside) to 1 (outside); default `K_FACTOR`. */
    kFactor?: number;
}
/**
 * Add a flange along a straight edge of a sheet.
 *
 * The sheet is extended beyond the edge and bent there: the bend starts at the edge (the sheet
 * keeps its size), its inside radius is `radius`.
 *
 * @param part A sheet (a plate, or a part with bends or flanges).
 * @param edge A straight edge where a top or bottom face of the sheet meets a side face (an outer
 *   edge, such as `plate.edges().filterBy(Y).top().right()`).
 * @param length Outside length of the flange: from the virtual sharp, where the outside faces of
 *   the sheet and the flange meet, to the flange's end. For 90 degrees it is the flange's height
 *   over the outside face of the sheet.
 * @param options `angle` (the bend angle in degrees, below 180, default 90: a positive angle folds
 *   the flange towards the side the face with the edge faces, a negative one the other way),
 *   `radius` (the inside bend radius) and `kFactor` (the position of the neutral fiber, 0 inside
 *   to 1 outside).
 */
export declare function flange(part: Part, edge: Edge | ShapeList<Edge>, length: number, options: FlangeOptions): Part;
/**
 * The bends of a sheet metal part: angle, inside radius, thickness, length and axis of each.
 *
 * A bend is a pair of coaxial cylinder faces one sheet thickness apart (as `fold`, `flange` and
 * `bend` make them, or as imported from a sheet metal part), up to below a full turn. Cylinders
 * without such a partner (holes, rounds) are not bends. `kFactor` is only used for the allowances.
 */
export declare function bends(part: Part, options?: {
    kFactor?: KFactor;
}): Bend[];
/** Options of `unfold` and `flatPattern`. */
export interface UnfoldOptions {
    /** The K-factor of each bend (see `KFactor`); default: the one each bend was folded with, else `K_FACTOR`. */
    kFactor?: KFactor;
    /** The planar face of the part that stays in place (default: the largest planar face). */
    fixed?: Face | null;
}
/**
 * Unfold a sheet metal part: every bend becomes flat again.
 *
 * The face `fixed` (default: the largest planar face) stays where it is; the rest of the sheet
 * unfolds into its plane. With the K-factor the part was bent with, the result is the blank it
 * was bent from: by default each bend takes the K-factor `fold` or `flange` made it with (else
 * `K_FACTOR`, 0.44, as for an imported part). `kFactor` gives other ones: one number for every
 * bend, a function `(radius, thickness, angle) => k`, a mapping from inside radius to K-factor
 * (`{ 1: 0.33, 6: 0.45 }`), `[r / t, k]` pairs to interpolate (a shop's table), or `'din6935'`
 * (see `KFactor`). For the flat pattern on the XY plane, with outline and bend lines, use
 * `flatPattern`.
 *
 * Rolled parts (one bend, no flat sheet: a ring segment), bends at a free end of the sheet (a
 * curl) and bends over 180 degrees unroll at the neutral radius `radius + kFactor * thickness`; a
 * rolled part about the middle of its bend (`fixed` is refused there).
 */
export declare function unfold(part: Part, options?: UnfoldOptions): Part;
/**
 * The flat pattern of a sheet metal part, laid on the XY plane (see `FlatPattern`).
 *
 * `kFactor` as for `unfold`: by default each bend's own (from `fold` and `flange`), else `K_FACTOR`.
 * The part is unfolded with `fixed` (default: the largest planar face) staying in place; that
 * face is the bottom of the flat (z = 0) and bends are "up" when the far side of the sheet folds
 * towards +Z. The longer side of the smallest rectangle around the blank runs along X, and the
 * bounding box starts at the origin.
 */
export declare function flatPattern(part: Part, options?: UnfoldOptions): FlatPattern;
export {};
