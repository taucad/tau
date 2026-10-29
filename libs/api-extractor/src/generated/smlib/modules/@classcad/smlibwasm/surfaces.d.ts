import { type VectorLike } from './geometry.js';
import { Edge, Face, Part, Shell, Wire } from './shapes.js';
/**
 * How far the points given to `surface` lie from the surface (`surface(points, { report: true })`).
 *
 * The distances are true ones, to each point's closest point on the surface. (A fit's own
 * residuals, at the parameters it gave the points, overstate how far a cloud that is not a height
 * field lies from its surface: 18.3 where the worst point lies 7.4 from it.)
 */
export declare class FitReport {
    /** The largest distance of a point from the surface, to its closest point on it. */
    readonly maxDistance: number;
    /** The root mean square of the distances. */
    readonly rmsDistance: number;
    /** The distance of each point, in the order given (a grid's rows one after the other). */
    readonly distances: number[];
    constructor(maxDistance: number, rmsDistance: number, distances: number[]);
}
type SurfaceOptions = {
    interpolate?: boolean;
    controls?: number | readonly [
        number,
        number
    ] | null;
    smoothing?: number;
    report?: boolean;
};
/**
 * A freeform NURBS surface through a grid of points, or fitted to a cloud of points.
 *
 * @param points Rows of points, `points[i][j]` (a grid: all rows the same length, at least 4 x 4:
 *   the surface is bicubic). Or a cloud: points in any order (at least 4), such as a scan; the
 *   surface approximates them.
 * @param options `interpolate` (grids): pass through the points (default); `false` uses them as
 *   control points, which gives a smoother surface that only approaches them. `controls`
 *   (clouds): control points of the surface per direction, a number or `[along, across]` (4 to
 *   64), "along" the longer side of the cloud; default about one per 8 points, shaped like the
 *   cloud. `smoothing` (clouds): how much the surface resists bending, against how close it comes
 *   to the points: 0 to 1, default 1e-2; for noisy points raise it (0.1 to 1), or take fewer
 *   control points. `report`: `true` returns `[sheet, report]`, a `FitReport`: how far each point
 *   lies from the surface (to its closest point), the largest and the rms distance; about 0.13 s
 *   for 1,500 points, 3 s for 20,000 (smlibpy, natively).
 *
 * A cloud must be a height field over its best-fit plane (no overhangs, nothing folded over). The
 * surface spans the smallest rectangle around the points in that plane; where there are no
 * points, the smoothing shapes it. Its normal points up (+Z); for a cloud that stands upright, to
 * +Y, else to +X. A cloud that is not a height field gets a surface that misses it by millimetres,
 * without an error: check `report.maxDistance` against the noise you expect.
 */
export declare function surface(points: readonly (readonly VectorLike[])[] | readonly VectorLike[], options: SurfaceOptions & {
    report: true;
}): [
    Shell,
    FitReport
];
export declare function surface(points: readonly (readonly VectorLike[])[] | readonly VectorLike[], options?: SurfaceOptions): Shell;
/** A surface's NURBS data, as `Face.nurbs()` gives it. */
type NurbsSurfaceData = {
    readonly degrees: readonly [
        number,
        number
    ];
    readonly knots: readonly [
        readonly number[],
        readonly number[]
    ];
    readonly points: readonly (readonly VectorLike[])[];
    readonly weights: readonly (readonly number[])[] | null;
};
/**
 * A surface from its NURBS data: control points, knots, degrees and weights, as other programs,
 * files or papers give them (also rational surfaces, other degrees than 3, knots that are not
 * uniform). The inverse of `Face.nurbs()`.
 *
 * @param points The control points in rows, `points[i][j]` the point `i` along u and `j` along v
 *   (all rows the same length, at least `degree + 1` each way); or a `NurbsSurface`
 *   (`Face.nurbs()`: its degrees, knots, points and weights), with nothing else given.
 * @param knots The knot vectors `[uKnots, vKnots]`, every knot as often as its multiplicity:
 *   `rows + uDegree + 1` and `row length + vDegree + 1` knots, not decreasing. The ends need not
 *   repeat: the surface spans `knots[degree]` to `knots[length - degree - 1]` each way (inside the
 *   control net where they do not). Default: uniform and clamped (the surface starts and ends at
 *   the net's corner points).
 * @param degrees The degrees `[u, v]` (1 to 32), or one for both. Default: from the knots
 *   (`knots.length - points.length - 1`), or 3 (less where there are fewer than 4 points).
 * @param weights A positive weight per control point, in the same rows; `null` for a non-rational
 *   surface.
 * @returns A sheet of one face over the whole surface, its normal along `du x dv`.
 */
export declare function nurbsSurface(points: readonly (readonly VectorLike[])[] | NurbsSurfaceData, knots?: readonly [
    readonly number[],
    readonly number[]
] | null, degrees?: number | readonly [
    number,
    number
] | null, weights?: readonly (readonly number[])[] | null): Shell;
/** The ruled surface between two curves (straight lines join matching points). */
export declare function ruled(a: Edge | Wire, b: Edge | Wire): Shell;
/** What `stitch` sewed (`stitch(..., { report: true })`). */
export declare class StitchReport {
    /** Pairs of free edges sewn into one edge. */
    readonly sewnEdges: number;
    /** Free edges left: the border of a sheet, and edges whose partner lies further away than the
     * tolerance. */
    readonly openEdges: number;
    /** The widest gap closed, between vertices or edges that were sewn (0 where the pieces met
     * exactly). Every gap closed is at most `tolerance`. */
    readonly maxGap: number;
    /** Faces turned over so that their normals agree with their neighbours' (on open results; a
     * closed result faces outward anyway). */
    readonly turnedFaces: number;
    /** The widest gap stitch looked for: the `tolerance` given, or its default, or less where every
     * edge was sewn before. */
    readonly tolerance: number;
    constructor(sewnEdges: number, openEdges: number, maxGap: number, turnedFaces: number, tolerance: number);
}
type StitchOptions = {
    tolerance?: number | null;
    report?: boolean;
};
type StitchPiece = Shell | Face | Part | Iterable<unknown>;
/**
 * Sew faces and sheets along their common edges: `stitch(a, b, c, { tolerance: 0.01 })`.
 *
 * @param args Faces, sheets, sketches or parts, and arrays of them; last, the options:
 *   `tolerance`: the widest gap to close (default: 1e-4 of the size of all pieces together).
 *   Edges and vertices further apart stay open: a gap is never closed silently. Edges that meet
 *   closely are sewn first, looser ones after them, up to the tolerance. `report`: `true` returns
 *   `[body, report]`, a `StitchReport`: the edges sewn, the free edges left and the widest gap
 *   closed.
 * @returns A Part when the pieces close around a volume (its faces then point outward), otherwise
 *   a Shell. The faces of an open result are turned to agree with their neighbours; each connected
 *   piece keeps the normal of its first face (in the order given), so that the sheet thickens.
 */
export declare function stitch(...args: [
    ...StitchPiece[],
    StitchOptions & {
        report: true;
    }
]): [
    Part | Shell,
    StitchReport
];
export declare function stitch(...args: (StitchPiece | StitchOptions)[]): Part | Shell;
/**
 * A round blend between the surfaces of two faces, as a sheet: for surfaces that are not the
 * faces of one part, such as two sheets that cross (`fillet` rounds the edges of a part). Or a flat
 * one, a chamfer, between the same lines.
 *
 * @param a The first face (or a sheet of one face). Its surface is blended, as far as it reaches:
 *   the blend may run past the face.
 * @param b The second face.
 * @param radius The radius of the blend: of the ball that rolls between the two surfaces.
 * @param options `radius2`: chamfers only: a second distance, from `b`; the chamfer then runs
 *   between the lines below where `a`'s surface moved out by `radius` and `b`'s moved out by
 *   `radius2` cross: for faces at right angles its edge on `b` lies `radius` from `a`, its edge on
 *   `a` `radius2` from `b` (default `radius`). `shape`: `'round'` (default): a circular
 *   cross-section; `'chamfer'`: a flat one, straight across between the lines where the round of
 *   the same radius meets the two surfaces (on faces at right angles, legs of `radius`).
 *   `sides`: the side of each face the blend lies on: 1 the side its normal
 *   (`normalAt()`) points to, -1 the other. Two crossing surfaces leave four places for a ball to
 *   roll, one per combination. Default `[1, 1]`. `trim`: `true` cuts both faces back to the blend's
 *   long edges and sews the three into one sheet; the blend's edges must run across both faces,
 *   from border to border.
 * @returns The blend, a sheet whose edges along its length lie on the two surfaces; with `trim` the
 *   two faces, cut back, and the blend between them as one sheet.
 */
export declare function surfaceFillet(a: Face | Shell, b: Face | Shell, radius: number, options?: {
    radius2?: number | null;
    shape?: 'round' | 'chamfer';
    sides?: readonly [
        number,
        number
    ];
    trim?: boolean;
}): Shell;
/**
 * A smooth bridge between free edges of two sheets: a sheet that leaves one sheet across one edge
 * and reaches the other across the other, tangent to both (or curvature-continuous).
 *
 * @param edgeA An edge on the border of a sheet (one face uses it), such as
 *   `sheet.edges().filter((e) => e.faces().length === 1)`.
 * @param edgeB An edge on the border of another sheet (or of the same one).
 * @param options `continuity`: how smoothly the blend meets the sheets: `'G1'` tangent, `'G2'` with
 *   the same curvature across the edges too (default), `'G3'` also the same change of curvature.
 *   `tension`: how far the blend runs on in each sheet's direction before it turns: its take-off at
 *   `edgeA` and `edgeB` as a part of the gap between the edges (default 1); one number for both, or
 *   a pair; less is tighter, more bulges. `join`: `true` sews the blend to both sheets (`stitch`)
 *   and returns the one sheet.
 *
 * The blend joins the nearest ends of the two edges (its side edges never cross), and its normal
 * follows `edgeA`'s sheet. Two closed edges (the rims of two tubes, full circles or closed loops) are
 * bridged all round: each point of `edgeA` is joined to the point of `edgeB` at the same fraction of
 * its length, counted from its point nearest `edgeA`'s start and running the same way round. Such a
 * blend is two faces sewn along two seams (the kernel offsets no face that closes around), as smooth
 * across them as elsewhere. A closed edge and an open one cannot be bridged.
 *
 * @returns The blend, a sheet of one face, of two between closed edges (with `join`, the two sheets
 *   and the blend sewn into one).
 */
export declare function blend(edgeA: Edge, edgeB: Edge, options?: {
    continuity?: 'G1' | 'G2' | 'G3' | number;
    tension?: number | readonly [
        number,
        number
    ];
    join?: boolean;
}): Shell;
/**
 * A surface that fills a closed loop of curves: a hole in a sheet, or the frame of a patch.
 *
 * @param boundary The curves around the hole, in any order and direction: edges on the border of
 *   sheets (`sheet.edges().filter((e) => e.faces().length === 1)`), curves (`Spline`,
 *   `ThreePointArc`, ...) or wires. One closed curve (the round edge of a hole), or two, is cut into
 *   four sides. Where the curves run into each other without corners (a rim in two or three pieces,
 *   cut where a seam crosses it), the four sides are as nearly equal as the curves' ends allow: a
 *   round hole is filled the same wherever its rim was cut.
 * @param options `tangent`: `true` (default): where the curves are edges of sheets, the patch meets
 *   each sheet tangentially along its edge; then every curve must be such an edge, and the sheets
 *   must meet each other tangentially where the edges meet (a hole in one smooth sheet, a corner
 *   between three rounds). `false` runs the patch through the curves only.
 *
 * Four sides make a Coons patch, of one face (through curves only, it is bilinear: straight across
 * between opposite sides, in the middle the sum of both). Five sides and more make an N-sided fill
 * of one face per side, sewn, meeting in the middle (tangent to the sheets only to about 1.4 degrees:
 * the kernel's N-sided fill). Three sides make an N-sided fill of three faces
 * through curves only; tangent to sheets, a Coons patch whose fourth side shrinks to a point at one
 * corner (a pole there: thickening such a patch fails). Three curves without corners between them
 * make four sides instead.
 *
 * @returns The patch, a sheet. Its normal follows the sheets it is tangent to; through curves only,
 *   it follows the right-hand rule around the loop in the direction of the first curve given. Sew it
 *   to the sheets with `stitch` (`stitch(sheet, patch)`).
 * @throws RangeError The curves do not close into one loop (the message names the gap), or some
 *   curves are edges of sheets and others not while `tangent` is true.
 * @throws ModelingError The patch misses its curves, meets a sheet at an angle, or folds back over
 *   the sheets.
 */
export declare function fill(boundary: Edge | Wire | Iterable<Edge | Wire>, options?: {
    tangent?: boolean;
}): Shell;
/**
 * A surface through a network of curves: `u` curves that each cross every `v` curve.
 *
 * @param u Two or more curves running one way, in any order and direction (splines, arcs, edges; a
 *   wire is joined into one curve).
 * @param v Two or more curves running across them: each crosses every `u` curve once. The outer
 *   curves of each set bound the surface: every curve ends on them.
 *
 * The curves are made to cross at common parameters first (a Gordon surface needs that: the
 * kernel's own missed its curves by 4e-2 on a 10 mm patch otherwise), and the surface is measured
 * against the curves as given.
 *
 * @returns A sheet of one face through every curve. Its normal is the first `u` curve's direction
 *   crossed with the first `v` curve's, where they cross.
 * @throws RangeError Curves that do not cross (within 1e-4 of the network's size), that cross out of
 *   order, or that run on past the outer curves of the other set.
 * @throws ModelingError The surface misses a curve by more than 1e-4 of the network's size (a very
 *   uneven network: curves of more even spacing, or more of them, help).
 */
export declare function network(u: Iterable<Edge | Wire>, v: Iterable<Edge | Wire>): Shell;
export {};
