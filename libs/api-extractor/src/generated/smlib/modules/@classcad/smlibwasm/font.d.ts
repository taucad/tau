/** A point of an outline in font units, `[x, y]`. */
export type Point = readonly [number, number];
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
 * The font `source`, read once and kept: the bytes of a font file (a Uint8Array), or a font
 * file's path (Node). Without one, the built-in default (`DEFAULT_FONT`).
 *
 * A path that is no file throws an Error with `code` "ENOENT" (Python's FileNotFoundError).
 */
export declare function loadFont(source?: string | Uint8Array | null): Font;
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
    _tables: Map<string, Uint8Array>;
    _longLoca: boolean;
    _numHmetrics: number;
    _outlines: _TrueTypeOutlines | _CFFOutlines;
    _cmap: Map<number, number>;
    _kern: _Kerning | null;
    /** A font from the bytes of its file, or from a file path (Node). */
    constructor(source: string | Uint8Array);
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
    _measuredCapHeight(): number;
}
/** The points of a glyph, whether each is on the curve, and the last point of each contour. */
type _Points = [Point[], boolean[], number[]];
declare class _TrueTypeOutlines {
    readonly glyf: Uint8Array;
    readonly offsets: number[];
    readonly numGlyphs: number;
    readonly _cache: Map<number, Contour[]>;
    constructor(glyf: Uint8Array, loca: Uint8Array, longLoca: boolean, numGlyphs: number);
    contours(glyph: number): Contour[];
    _points(glyph: number, depth: number): _Points;
    _composite(p: number, depth: number): _Points;
}
declare class _CFFOutlines {
    readonly gsubrs: Uint8Array[];
    readonly charstrings: Uint8Array[];
    readonly scale: number;
    readonly lsubrs: Uint8Array[][];
    readonly fdOf: number[] | null;
    readonly _cache: Map<number, Contour[]>;
    constructor(cff: Uint8Array, unitsPerEm: number);
    static _privateSubrs(cff: Uint8Array, d: Map<number, number[]>): Uint8Array[];
    contours(glyph: number): Contour[];
}
type _Values = [number, number, number, number];
declare class _Kerning {
    readonly lookups: _PairPos[][];
    readonly table: Map<number, number>;
    readonly source: string | null;
    readonly cache: Map<string, PairAdjustment>;
    constructor(gpos: Uint8Array | undefined, kern: Uint8Array | undefined);
    pair(left: number, right: number): PairAdjustment;
}
/** The key of a pair of glyphs in `_kernTable`: `left * 65536 + right`. */
export declare function _pairKey(left: number, right: number): number;
/** The format 0 pairs of a kern table, keyed by `_pairKey(left, right)`. */
export declare function _kernTable(t: Uint8Array): Map<number, number>;
/** One PairPos subtable, parsed on first use. */
declare class _PairPos {
    readonly t: Uint8Array;
    readonly o: number;
    parsed: boolean;
    fmt: number;
    coverage: Map<number, number>;
    f1: number;
    f2: number;
    sets: Map<number, Map<number, [_Values, _Values]>>;
    setOffsets: number[];
    cd1: Map<number, number>;
    cd2: Map<number, number>;
    c1: number;
    c2: number;
    records: number;
    size: number;
    constructor(t: Uint8Array, o: number);
    _parse(): void;
    _pairSet(index: number): Map<number, [_Values, _Values]>;
    find(left: number, right: number): [_Values, _Values] | null;
}
/** Python's repr() of a string. */
export declare function _repr(s: string): string;
export {};
