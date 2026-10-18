import { type VectorLike } from './geometry.js';
import { Edge, Face, Part, Shell, Wire } from './shapes.js';
export declare function _shellOfSurface(srf: number): Shell;
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
 *   control points.
 *
 * A cloud must be a height field over its best-fit plane (no overhangs, nothing folded over). The
 * surface spans the smallest rectangle around the points in that plane; where there are no
 * points, the smoothing shapes it. Its normal points up (+Z); for a cloud that stands upright, to
 * +Y, else to +X.
 */
export declare function surface(points: readonly (readonly VectorLike[])[] | readonly VectorLike[], options?: {
    interpolate?: boolean;
    controls?: number | readonly [number, number] | null;
    smoothing?: number;
}): Shell;
/** The ruled surface between two curves (straight lines join matching points). */
export declare function ruled(a: Edge | Wire, b: Edge | Wire): Shell;
/**
 * Sew faces and sheets along their common edges: `stitch(a, b, c, { tolerance: 0.01 })`.
 *
 * Returns a Part when the result encloses a volume, otherwise a Shell. `tolerance` is the
 * largest gap to close (default: 1e-4 of the model size).
 */
export declare function stitch(...args: (Shell | Face | Part | Iterable<unknown> | {
    tolerance?: number | null;
})[]): Part | Shell;
/**
 * A round blend between the surfaces of two faces, as a sheet: for surfaces that are not the
 * faces of one part, such as two sheets that cross (`fillet` rounds the edges of a part).
 *
 * @param a The first face (or a sheet of one face). Its surface is blended, as far as it reaches:
 *   the blend may run past the face.
 * @param b The second face.
 * @param radius The radius of the blend: of the ball that rolls between the two surfaces.
 * @param options `sides`: the side of each face the blend lies on: 1 the side its normal
 *   (`normalAt()`) points to, -1 the other. Two crossing surfaces leave four places for a ball to
 *   roll, one per combination. Default `[1, 1]`.
 * @returns The blend, a sheet whose edges along its length lie on the two surfaces.
 */
export declare function surfaceFillet(a: Face | Shell, b: Face | Shell, radius: number, options?: {
    sides?: readonly [number, number];
}): Shell;
