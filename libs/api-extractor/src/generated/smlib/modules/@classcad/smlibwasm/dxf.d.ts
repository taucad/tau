import { Plane } from './geometry.js';
import { type ShapeList, Sketch, Wire } from './shapes.js';
/** How a drawing is read. */
export interface DxfReadOptions {
    /** Read only these layers (names in any letter case). */
    layers?: Iterable<string> | string | null;
    /** The unit of the drawing ("mm", "cm", "m", "um", "inch", "ft"), instead of the file's
     * `$INSUNITS`. A file without a unit is read as mm. */
    unit?: string | null;
    /** Ends closer than this (mm) are joined. Default: 1e-7 of the drawing's size. */
    tolerance?: number | null;
}
/** How a drawing is written. */
export interface DxfWriteOptions {
    /** Unit of the file: "mm" (default), "cm", "m", "um", "inch" or "ft". The model (in mm) is
     * converted to it and `$INSUNITS` says so. */
    unit?: string;
    /** The plane of the drawing; the shapes are written in its coordinates and must lie in planes
     * parallel to it. Default: the world XY plane when the shapes are parallel to it, otherwise the
     * plane of the first sketch (a section in `Plane.XZ` is drawn in that plane's coordinates). */
    plane?: Plane | null;
}
/**
 * Every chain of curves of a DXF drawing (a path; Node) as a `Wire`, open or closed.
 *
 * The curves are read and joined like in `importDxf`; chains also stop where three or more
 * curve ends meet. Closed chains come first, then open ones, each in drawing order.
 */
export declare function importDxfWires(path: string, options?: DxfReadOptions): ShapeList<Wire>;
/** `importDxfWires` of a drawing in memory: the text of a DXF file, or its bytes. */
export declare function fromDxfWires(data: string | Uint8Array, options?: DxfReadOptions): ShapeList<Wire>;
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
/** `importDxf` of a drawing in memory: the text of a DXF file, or its bytes. */
export declare function fromDxf(data: string | Uint8Array, options?: DxfReadOptions): Sketch;
/**
 * Write sketches, faces, wires and edges to a DXF drawing (AutoCAD 2000, AC1015) at `path`
 * (Node). See `toDxf`.
 */
export declare function exportDxf(shapes: unknown, path: string, options?: DxfWriteOptions): void;
/**
 * Sketches, faces, wires and edges as the text of a DXF drawing (AutoCAD 2000, AC1015).
 *
 * Every curve is written exactly: LINE, ARC, CIRCLE, ELLIPSE, or SPLINE with the kernel's control
 * points, knots and weights. Circular B-splines (the edges of sections) are written as ARC and
 * CIRCLE, straight ones as LINE. A shape's name becomes its layer.
 *
 * `shapes` is a `Sketch`, `Face`, `Wire`, `Edge` or an array of them.
 */
export declare function toDxf(shapes: unknown, options?: DxfWriteOptions): string;
