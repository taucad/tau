export declare const TAU: number;
/** Turns smaller than this (the sine of the angle between two tangents) count as smooth. */
export declare const SMOOTH = 1e-9;
/** A planar construction that cannot be made. The message names what does not fit. */
export declare class GeometryError extends Error {
    constructor(message: string);
}
/** A direct construction (offset, stroke) that does not resolve locally; the caller falls back
 * to the construction from pieces and Booleans. */
export declare class NeedBooleans extends Error {
    constructor(message: string);
}
/** Python's `math.radians`. */
export declare function radians(d: number): number;
/** Python's `math.degrees`. */
export declare function degrees(r: number): number;
/** Python's float modulo `a % b`: the result has the sign of the divisor. */
export declare function pymod(a: number, b: number): number;
/** Python's integer modulo for an index (`i % n`, never negative for n > 0). */
export declare function imod(i: number, n: number): number;
/** Python's `round(x)`: to the nearest integer, a tie to the even one. */
export declare function pyround(x: number): number;
/** Python's `sum()` of floats (CPython 3.12: Neumaier's compensated summation). */
export declare function pysum(values: Iterable<number>): number;
/** The first item with the smallest key (Python's `min(items, key=...)`). */
export declare function minBy<T>(items: readonly T[], key: (item: T) => number): T;
/**
 * A complex number `re + im i`: a point or a direction in the plane. Immutable; the operations
 * are CPython's (a real operand counts as `(x, 0)`, as Python 3.12 has it).
 */
export declare class Complex {
    readonly re: number;
    readonly im: number;
    constructor(re: number, im: number);
    /** `this + b` */
    add(b: Complex): Complex;
    /** `this - b` */
    sub(b: Complex): Complex;
    /** `this * b` */
    mul(b: Complex): Complex;
    /** `this * f` (and `f * this`) for a real `f`. */
    scale(f: number): Complex;
    /** `this / b` (CPython's quotient, Smith's method). */
    div(b: Complex): Complex;
    /** `this / f` for a real `f`. */
    divs(f: number): Complex;
    /** `-this` */
    neg(): Complex;
    /** `this.conjugate()` */
    conj(): Complex;
    /** `abs(this)`: the length. */
    abs(): number;
    /** `cmath.phase(this)`: the angle from +X, -pi to pi. */
    phase(): number;
    /** `this == b` */
    equals(b: Complex): boolean;
    toString(): string;
}
/** `complex(re, im)` */
export declare function cx(re: number, im?: number): Complex;
/** `0j` */
export declare const ZERO: Complex;
/** `1 + 0j` */
export declare const ONE: Complex;
/** `1j` */
export declare const J: Complex;
/** `-1j` */
export declare const NEG_J: Complex;
export declare function cross(a: Complex, b: Complex): number;
export declare function dot(a: Complex, b: Complex): number;
export declare function unit(z: Complex): Complex;
export declare function cis(angle: number): Complex;
/** A number for messages: up to 4 decimals, no trailing zeros. */
export declare function fmt(v: number): string;
export declare function fmtPt(p: Complex): string;
export declare function deg(a: number): string;
/** `p` mirrored in the line through `o` whose direction squared is `u2`. */
export declare function reflect(p: Complex, o: Complex, u2: Complex): Complex;
/** A line or arc in the plane (or another curve, `Curve2`, that is passed through). */
export declare abstract class Seg {
    abstract readonly kind: string;
    abstract get start(): Complex;
    abstract get end(): Complex;
    abstract get length(): number;
    /** Unit tangent at the start. */
    abstract get t0(): Complex;
    /** Unit tangent at the end. */
    abstract get t1(): Complex;
    abstract at(s: number): Complex;
    /** Arc length from the start to the point of the carrier nearest `p` (negative before the
     * start, beyond `length` after the end). */
    position(_p: Complex): number;
    piece(_s0: number, _s1: number): Seg;
    offset(_e: number): Seg | null;
    abstract reversed(): Seg;
    reflected(_o: Complex, _u2: Complex): Seg;
    moved(_rot: Complex, _shift: Complex): Seg;
    abstract areaTerm(): number;
    sample(n: number): Complex[];
}
/** A straight segment from `a` to `b`. */
export declare class Line2 extends Seg {
    readonly kind = "line";
    readonly a: Complex;
    readonly b: Complex;
    private _d;
    constructor(a: Complex, b: Complex);
    get start(): Complex;
    get end(): Complex;
    get length(): number;
    get direction(): Complex;
    get t0(): Complex;
    get t1(): Complex;
    at(s: number): Complex;
    tangent(_s: number): Complex;
    position(p: Complex): number;
    piece(s0: number, s1: number): Line2;
    offset(e: number): Line2;
    reversed(): Line2;
    reflected(o: Complex, u2: Complex): Line2;
    moved(rot: Complex, shift: Complex): Line2;
    areaTerm(): number;
    sample(_n: number): Complex[];
    toString(): string;
}
/** A circular arc around `c` of radius `r`, from the angle `a0` (radians) over `sweep` (signed:
 * positive counterclockwise). */
export declare class Arc2 extends Seg {
    readonly kind = "arc";
    readonly c: Complex;
    readonly r: number;
    readonly a0: number;
    readonly sweep: number;
    private _start;
    private _end;
    constructor(c: Complex, r: number, a0: number, sweep: number);
    get sign(): number;
    get start(): Complex;
    get end(): Complex;
    get length(): number;
    get closed(): boolean;
    angleAt(s: number): number;
    at(s: number): Complex;
    tangent(s: number): Complex;
    get t0(): Complex;
    get t1(): Complex;
    position(p: Complex): number;
    piece(s0: number, s1: number): Arc2;
    offset(e: number): Arc2 | null;
    reversed(): Arc2;
    reflected(o: Complex, u2: Complex): Arc2;
    moved(rot: Complex, shift: Complex): Arc2;
    areaTerm(): number;
    sample(_n: number): Complex[];
    toString(): string;
}
/** The world edge a `Curve2` passes through (an Edge of shapes.ts). */
export interface CurveEdge {
    readonly geomType: string;
    reversed(): CurveEdge;
}
/**
 * Another curve (spline, ellipse) of a sketch, passed through unchanged. `edge` is the world edge
 * in the direction of the loop; the other fields are local to the plane.
 */
export declare class Curve2<E extends CurveEdge = CurveEdge> extends Seg {
    readonly kind = "curve";
    readonly edge: E;
    readonly start_: Complex;
    readonly end_: Complex;
    readonly t0_: Complex;
    readonly t1_: Complex;
    readonly length_: number;
    /** Samples along the curve (for areas and crossing checks). */
    readonly points: readonly Complex[];
    constructor(edge: E, start: Complex, end: Complex, t0: Complex, t1: Complex, length: number, points: readonly Complex[]);
    get start(): Complex;
    get end(): Complex;
    get length(): number;
    get t0(): Complex;
    get t1(): Complex;
    at(s: number): Complex;
    reversed(): Curve2<E>;
    areaTerm(): number;
    sample(_n: number): Complex[];
    toString(): string;
}
/** The segment in words, for messages (`fp` formats a point). */
export declare function describe(s: Seg, fp?: (p: Complex) => string): string;
/** Points where the carriers (infinite line, full circle) of two segments meet. */
export declare function carrierIntersections(s1: Seg, s2: Seg): Complex[];
/** The point of the carrier of `s` nearest `p`. */
export declare function foot(s: Seg, p: Complex): Complex;
/** Length of the stretch two segments share (collinear lines or arcs of one circle). */
export declare function overlap(s1: Seg, s2: Seg, tol: number): number;
/** Points where two segments meet (not counting an overlap; see `overlap`). */
export declare function segmentIntersections(s1: Seg, s2: Seg, tol: number): Complex[];
export declare function signedArea(loop: readonly Seg[]): number;
export declare function extent(segs: readonly Seg[]): number;
export declare function tolerance(segs: readonly Seg[]): number;
/** Join consecutive collinear lines and consecutive arcs of one circle; drop pieces of no
 * length. */
export declare function simplify(segs: readonly Seg[], labels: readonly string[], closed: boolean, tol: number): [Seg[], string[]];
/** The first pair of segments that cross, touch or run over each other: `[i, j, point]` (see
 * `runsBack` to tell the last case). */
export declare function firstCrossing(segs: readonly Seg[], closed: boolean, tol: number): [number, number, Complex] | null;
/** True if segments `i` and `j` share a stretch (the outline runs back over itself). */
export declare function runsBack(segs: readonly Seg[], i: number, j: number, tol: number): boolean;
/** [sine, cosine] of the turn from the end of `s1` to the start of `s2`. */
export declare function turn(s1: Seg, s2: Seg): [number, number];
export declare function isSmooth(s1: Seg, s2: Seg): boolean;
/**
 * Round the corner where `s1` ends and `s2` starts with a tangent arc of radius `r`.
 *
 * Returns how far the arc cuts back along `s1` (from its end), how far along `s2` (from its
 * start), and the arc. The cut-backs are not checked against the lengths; see `assemble`.
 */
export declare function filletCorner(s1: Seg, s2: Seg, r: number): [number, number, Arc2];
/** Bevel the corner where `s1` ends and `s2` starts: cut back `length` along each (measured
 * along the segment) and join the two points with a line. */
export declare function chamferCorner(s1: Seg, s2: Seg, length: number): [number, number, Line2];
/** A corner to round ("fillet", `size` the radius) or bevel ("chamfer", `size` the length);
 * `label` is how the user asked for it, for messages. */
export declare class Corner {
    readonly kind: string;
    readonly size: number;
    readonly label: string;
    constructor(kind: string, size: number, label: string);
}
/**
 * Apply corner fillets and chamfers. `corners.get(i)` rounds the corner where `segs[i - 1]` ends
 * and `segs[i]` starts (`i = 0`: the corner between the last and the first segment of a closed
 * loop). `what(i)` names segment `i` and `fp` formats points in messages.
 */
export declare function assemble(segs: readonly Seg[], labels: readonly string[], corners: ReadonlyMap<number, Corner>, closed: boolean, tol: number, what?: ((i: number) => string) | null, fp?: (p: Complex) => string): [Seg[], string[]];
/**
 * The chain moved `e` to the left (negative: to the right), with the gaps at corners that open
 * filled (`corners`: "round", "sharp" or "chamfer") and the overlaps at corners that close
 * trimmed. Throws `NeedBooleans` when the result does not follow from the neighbouring segments
 * alone (a segment that vanishes, an arc that collapses).
 */
export declare function offsetChain(segs: readonly Seg[], e: number, corners: string, closed: boolean, tol: number): Seg[];
/** A region: outer loop (counterclockwise) and holes. */
export type Piece = [Seg[], Seg[][]];
/** The region a segment covers when it moves `e` to its left (negative: right). An arc that
 * would pass its center stops there (a pie slice); a full circle gives a ring. */
export declare function sweepPiece(s: Seg, e: number): Piece[];
/** The region within `half` of a segment on both sides, ends cut square. */
export declare function bandPiece(s: Seg, half: number): Piece[];
export declare function disk(c: Complex, r: number): Seg[];
export declare function polygon(...pts: Complex[]): Seg[];
/**
 * The gap between the offsets of two segments at a corner that the offset `e` (to the left) pulls
 * apart; nothing where the corner does not open on that side. The piece shares its straight
 * sides with the pieces of the two segments, so the Booleans meet edges, not tangencies.
 */
export declare function cornerPiece(s1: Seg, s2: Seg, e: number, corners: string): Piece[];
/** Distance from a point to a line or arc segment. */
export declare function distance(s: Seg, p: Complex): number;
export declare function orientCcw(loop: Seg[]): Seg[];
/** A site of the hull: a point (`r` 0) or an arc of a circle, which supports the hull for the
 * outward normal directions `lo` .. `lo + span` (counterclockwise). */
export declare class _Site {
    readonly c: Complex;
    readonly r: number;
    readonly lo: number;
    readonly span: number;
    constructor(c: Complex, r: number, lo?: number, span?: number);
    covers(phi: number): boolean;
    support(phi: number): number;
    point(phi: number): Complex;
}
export declare function hullSites(segs: readonly Seg[]): _Site[];
/**
 * The boundary of the convex hull of points and arcs, counterclockwise, as lines and arcs.
 *
 * The walk follows the outward normal direction once around: on an arc site the boundary runs
 * along the arc, and where another site takes over the support the boundary jumps to it along
 * their common tangent line.
 */
export declare function convexHull(sites: readonly _Site[], tol: number): Seg[];
