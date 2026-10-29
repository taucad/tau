import { Plane } from './geometry.js';
import type { ShapesLike } from './exporters.js';
import { type BytesLike } from './_bytes.js';
import { type ShapeList, Sketch, Wire } from './shapes.js';
import { DrawingView } from './drawing.js';
/** How a drawing is read. */
export interface DxfReadOptions {
    /** Read only these layers (names in any letter case). */
    layers?: Iterable<string> | string | null;
    /** The unit of the drawing ("mm", "cm", "m", "um", "inch", "ft"), instead of the file's
     * `$INSUNITS`. A file without a unit is read as mm. */
    unit?: 'mm' | 'cm' | 'm' | 'um' | 'inch' | 'in' | 'ft' | null;
    /** Ends closer than this (mm) are joined. Default: 1e-7 of the drawing's size. */
    tolerance?: number | null;
}
/** How a drawing is written. */
export interface DxfWriteOptions {
    /** Unit of the file: "mm" (default), "cm", "m", "um", "inch" or "ft". The model (in mm) is
     * converted to it and `$INSUNITS` says so. */
    unit?: 'mm' | 'cm' | 'm' | 'um' | 'inch' | 'in' | 'ft';
    /** The plane of the drawing; the shapes are written in its coordinates and must lie in planes
     * parallel to it. Default: the world XY plane when the shapes are parallel to it, otherwise the
     * plane of the first sketch (a section in `Plane.XZ` is drawn in that plane's coordinates). */
    plane?: Plane | null;
    /** 'exact' (default) writes splines and ellipses as SPLINE and ELLIPSE; 'arcs' writes them as LINE
     * and ARC within `tolerance` (`Edge.toArcs`), for CNC, laser and plasma software that reads only
     * lines and arcs. */
    curves?: 'exact' | 'arcs';
    /** For `curves: 'arcs'`: the largest distance between a curve and its lines and arcs, in
     * millimeters (the model's unit; default 0.01). */
    tolerance?: number;
}
/**
 * Every chain of curves of a DXF drawing (a path; Node) as a `Wire`, open or closed.
 *
 * The curves are read and joined like in `importDxf`; chains also stop where three or more
 * curve ends meet. Closed chains come first, then open ones, each in drawing order.
 */
export declare function importDxfWires(path: string, options?: DxfReadOptions): ShapeList<Wire>;
/** `importDxfWires` of a drawing in memory: the text of a DXF file, or its bytes (a Uint8Array or
 * an ArrayBuffer). */
export declare function fromDxfWires(data: string | BytesLike, options?: DxfReadOptions): ShapeList<Wire>;
/**
 * Read the outlines of a DXF drawing (an ASCII DXF file's path; Node) as a sketch.
 *
 * Lines, arcs, circles, ellipses, polylines (bulges become exact arcs), splines (exact NURBS)
 * and inserted blocks are joined end to end into closed loops. Loops nest by the even-odd rule:
 * a loop inside a loop is a hole, a loop inside a hole an island. The result keeps the drawing's
 * coordinates, converted to millimeters.
 *
 * Throws ModelingError for curves that do not close into loops (with their ends and layers),
 * or outlines that branch.
 */
export declare function importDxf(path: string, options?: DxfReadOptions): Sketch;
/** `importDxf` of a drawing in memory: the text of a DXF file, or its bytes (a Uint8Array or an
 * ArrayBuffer). */
export declare function fromDxf(data: string | BytesLike, options?: DxfReadOptions): Sketch;
/** What a DXF file can hold, as `exportDxf` and `toDxf` take it: shapes, the views of
 * `drawingViews`, or lists of them. */
export type DxfShapesLike = ShapesLike | DrawingView | (Iterable<DxfShapesLike> & object);
/**
 * Write sketches, faces, wires and edges to a DXF drawing (AutoCAD 2000, AC1015) at `path`
 * (Node). See `toDxf`.
 */
export declare function exportDxf(shapes: DxfShapesLike, path: string, options?: DxfWriteOptions): void;
/**
 * Sketches, faces, wires and edges as the text of a DXF drawing (AutoCAD 2000, AC1015).
 *
 * Every curve is written exactly: LINE, ARC, CIRCLE, ELLIPSE, or SPLINE with the kernel's control
 * points, knots and weights. Circular B-splines (the edges of sections) are written as ARC and
 * CIRCLE, straight ones as LINE. A shape's name becomes its layer. `curves: 'arcs'` writes splines
 * and ellipses as LINE and ARC within `tolerance` (`Edge.toArcs`), for software that reads only
 * lines and arcs. The views of `drawingViews` go on the layers VISIBLE and HIDDEN, the hidden lines
 * dashed (the linetype DASHED: 3 mm dashes, 1.5 mm gaps).
 *
 * `shapes` is a `Sketch`, `Face`, `Wire`, `Edge`, `DrawingView` or an array of them.
 */
export declare function toDxf(shapes: DxfShapesLike, options?: DxfWriteOptions): string;
export {};
