import { type AlignLike } from './align.js';
import { type Segment } from './font.js';
import { Edge, type Sketch, Wire } from './shapes.js';
/** How `Text` sets the text. */
export interface TextOptions {
    /** A TrueType or OpenType font (.ttf, .otf, .ttc, .woff): the bytes of its file, or its path
     * (Node). Default: the built-in Lato Regular. */
    font?: string | Uint8Array | null;
    /** Placement of the text's layout box (from the start to the end of the longest line, and from
     * the baseline of the last line to the cap height of the first). `CENTER` centers it on the
     * origin; `MIN` starts the text at x = 0 with the last baseline on y = 0; `MAX` ends it at
     * x = 0 with the first cap height on y = 0. One value or one per axis; the lines of a block are
     * aligned the same way (left, centered, right). Default: `Align.CENTER`. */
    align?: AlignLike;
    /** Extra distance between neighbouring letters in mm (negative: closer). Default 0. */
    spacing?: number;
    /** Distance between baselines as a multiple of `size`. Default 1.6. */
    lineSpacing?: number;
    /** Apply the font's kerning pairs. Default true. */
    kerning?: boolean;
    /** An edge or wire in the XY plane to set one line of text along. Each letter stands upright on
     * the path at the arc length of the middle of its advance, turned with the tangent; the text
     * reads in the direction of the path and stands on its left side. `align` places it along the
     * path (`MIN` at its start) and across it (`MIN`: baseline on the path, `CENTER`: the middle
     * of the capitals, `MAX`: their top). */
    path?: Edge | Wire | null;
}
/**
 * Lettering as a sketch in the XY plane, with the exact outlines of the font.
 *
 * `text` is the text; "\n" starts a new line. `size` is the height of the capital letters (H,
 * E, T) in mm, the nominal height of technical lettering: `Text("H", 10)` is 10 mm tall. Round
 * letters overshoot it by a few percent; descenders go below the baseline.
 *
 * Returns a `Sketch` on `Plane.XY`: one face per separate piece of a letter, counters as holes.
 * Outlines are exact: straight segments are lines, curved runs are B-splines through the font's
 * on-curve points.
 *
 * Throws a RangeError for an empty text, a size that is not positive, a character the font does
 * not have, a font that cannot be read, or a path the text does not fit on.
 */
export declare function Text(text: string, size: number, options?: TextOptions): Sketch;
/** Exact signed area contribution of a segment: 1/2 of the integral of x dy - y dx. */
export declare function _segmentArea(seg: Segment): number;
/** Python's sum() of floats: Neumaier's compensated summation (Python 3.12 and later). */
export declare function _sum(values: Iterable<number>): number;
/** Python's math.hypot of two numbers (its vector_norm: correctly rounded in nearly all cases;
 * JavaScript's Math.hypot can differ in the last bit). */
export declare function _hypot(a: number, b: number): number;
