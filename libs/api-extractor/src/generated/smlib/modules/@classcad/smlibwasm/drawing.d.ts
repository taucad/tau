import { BoundBox, Vector } from './geometry.js';
import { Edge, Face, Part, Shell, ShapeList, Wire } from './shapes.js';
declare const inspect: unique symbol;
/**
 * One view of a drawing (see `drawingViews`): its `name` (`'front'`, `'back'`, `'top'`,
 * `'bottom'`, `'left'` or `'right'`), the `direction` it looks from (from the part towards the
 * viewer), and its `visible` and `hidden` lines (drawn dashed): standalone edges in the drawing's
 * plane (world XY).
 */
export declare class DrawingView {
    readonly name: string;
    readonly direction: Vector;
    readonly visible: ShapeList<Edge>;
    readonly hidden: ShapeList<Edge>;
    constructor(name: string, direction: Vector, visible: ShapeList<Edge>, hidden: ShapeList<Edge>);
    /** The box around the view's lines. */
    bbox(): BoundBox;
    toString(): string;
    [inspect](): string;
}
/** How `drawingViews` draws: see there. */
export interface DrawingViewsOptions {
    projection?: 'first-angle' | 'third-angle';
    hidden?: boolean;
    tangentEdges?: boolean;
    gap?: number | null;
}
/**
 * The views of a part for a 2D drawing, laid out in the world XY plane.
 *
 * - `part`: a part (or a shell), or a list of them (an assembly): drawn together, each body hiding
 *   the lines of the others behind it (bodies that overlap are not cut where they meet).
 * - `views`: the views, by where they look from: `'front'` (from -Y; the drawing's x is the model's
 *   X, its y the model's Z), `'back'` (from +Y), `'top'` (from +Z: X and Y), `'bottom'` (from -Z),
 *   `'left'` (from -X: -Y and Z) and `'right'` (from +X: Y and Z).
 * - `projection`: `'first-angle'` (ISO: the top view below the front view, the left view to its
 *   right) or `'third-angle'` (ASME: the top view above it, the left view to its left). The back
 *   view goes at the far right.
 * - `hidden`: draw the hidden lines (`DrawingView.hidden`, dashed in DXF and SVG); `false` leaves
 *   them empty.
 * - `tangentEdges`: draw the edges between faces that meet tangentially (fillet tangent lines).
 * - `gap`: space between the views. Default: a fifth of the part's largest extent.
 *
 * The views of the front row share its height (the model's Z), the views of its column the front
 * view's x (the model's X). Write them with `exportDxf`/`toDxf` (layers VISIBLE and HIDDEN, the
 * hidden lines dashed) or `exportSvg`/`toSvg`.
 */
export declare function drawingViews(part: Part | Shell | Iterable<Part | Shell>, views?: string | readonly string[], options?: DrawingViewsOptions): DrawingView[];
/** What `toSvg` and `exportSvg` draw: drawing views, edges, wires, faces, sheets and sketches, or
 * lists of them (a Part is drawn through `drawingViews` or `outline`). */
export type SvgItemsLike = DrawingView | Edge | Wire | Face | Shell | readonly SvgItemsLike[];
/** How `toSvg` draws: the space around the lines and the width of the visible lines. */
export interface SvgOptions {
    margin?: number | null;
    stroke?: number | null;
}
/**
 * An SVG drawing of drawing views (dashed hidden lines), edges, wires and the edges of faces and
 * sketches, seen from +Z (their x and y; the SVG's y runs down). Lines and circular arcs are exact,
 * other curves polylines. Lengths are in millimeters: the drawing prints at its true size.
 *
 * - `shapes`: `DrawingView`, `Edge`, `Wire`, `Face`, `Sketch` or an array of them.
 * - `margin`: space around the lines. Default: 5 % of the drawing's size.
 * - `stroke`: width of the visible lines (the hidden ones are 0.7 of it, dashed). Default: 0.35 mm,
 *   or 1/500 of the drawing's size where that is smaller.
 */
export declare function toSvg(shapes: SvgItemsLike, options?: SvgOptions): string;
/** Write `toSvg` of the shapes to a file (Node). */
export declare function exportSvg(shapes: SvgItemsLike, path: string, options?: SvgOptions): void;
export {};
