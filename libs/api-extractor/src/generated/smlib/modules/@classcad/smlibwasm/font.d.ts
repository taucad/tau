import { type BytesLike } from './_bytes.js';
/** A point of an outline in font units, `[x, y]`. */
export type Point = readonly [
    number,
    number
];
/** A line (2 points), a quadratic Bézier (3) or a cubic Bézier (4). */
export type Segment = readonly Point[];
/** A closed outline: segments end to end. */
export type Contour = Segment[];
/**
 * Kerning of two neighbouring glyphs in font units: the first glyph's advance changes by
 * `advance1` and it moves by `placement1`; the second moves by `placement2` and its advance
 * changes by `advance2`.
 */
export declare class PairAdjustment {
    readonly advance1: number;
    readonly placement1: number;
    readonly advance2: number;
    readonly placement2: number;
    constructor(advance1?: number, placement1?: number, advance2?: number, placement2?: number);
    toString(): string;
}
/** The data is not a font this reader can use (Python's FontError, a ValueError). */
export declare class FontError extends RangeError {
    constructor(message: string);
}
/**
 * The font `Text` uses unless told otherwise: Lato Regular (SIL Open Font License 1.1, see
 * fonts/OFL.txt), built in as the bytes of its TTF file.
 */
export declare const DEFAULT_FONT: Uint8Array;
/**
 * The font `source`, read once and kept: the bytes of a font file (a Uint8Array, another view of
 * an ArrayBuffer, or an ArrayBuffer, such as `await (await fetch(url)).arrayBuffer()`), or a font
 * file's path (Node). Without one, the built-in default (`DEFAULT_FONT`). TrueType and OpenType
 * fonts (.ttf, .otf, .ttc) and web fonts (.woff, .woff2) are read.
 *
 * A path that is no file throws an Error with `code` "ENOENT" (Python's FileNotFoundError).
 */
export declare function loadFont(source?: string | BytesLike | null): Font;
/** One font: its characters, metrics, kerning and glyph outlines (font units, y up). */
export declare class Font {
    /** The font file (null for a font given as bytes). */
    readonly path: string | null;
    /** The full name of the font ("Lato Regular"). */
    readonly name: string;
    readonly unitsPerEm: number;
    readonly numGlyphs: number;
    /** Height of the capital letters in font units: OS/2 sCapHeight, or the top of H. */
    readonly capHeight: number;
    /** A font from the bytes of its file (a Uint8Array, another view of an ArrayBuffer, or an
     * ArrayBuffer), or from a file path (Node). */
    constructor(source: string | BytesLike);
    toString(): string;
    /** The glyph of a character, or null when the font has none for it. */
    glyphIndex(char: string): number | null;
    /** Every character the font maps to a glyph. */
    characters(): string[];
    /** Advance width of a glyph in font units. */
    advance(glyph: number): number;
    /** The kerning of two neighbouring glyphs: GPOS pair adjustment when the font has it,
     * otherwise the kern table. */
    kerning(left: number, right: number): PairAdjustment;
    /** "GPOS", "kern" or null: where `kerning` takes its values from. */
    get kerningSource(): string | null;
    /** The contours of a glyph in font units (empty for a space). */
    outline(glyph: number): Contour[];
}
export {};
