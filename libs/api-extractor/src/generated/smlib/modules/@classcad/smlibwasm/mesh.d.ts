import { PolyHandle } from './kernel.js';
import { Axis, BoundBox, Hit, Vector, type VectorLike } from './geometry.js';
import { ShapeList, _Body, type Shape } from './shapes.js';
declare const inspect: unique symbol;
/**
 * An indexed triangle mesh.
 *
 * - `vertices`: positions, x, y, z for each vertex (`Float64Array`).
 * - `triangles`: three vertex indices for each triangle, counterclockwise seen from outside
 *   (`Uint32Array`).
 * - `normals`: optional corner normals, three for each triangle (nine numbers per triangle,
 *   `Float32Array`), used for shading crisp CAD edges.
 */
export declare class Mesh {
    vertices: Float64Array;
    triangles: Uint32Array;
    normals: Float32Array | null;
    _poly: PolyHandle | null;
    constructor(vertices: ArrayLike<number>, triangles: ArrayLike<number>, normals?: ArrayLike<number> | null, _poly?: PolyHandle | null);
    /** The number of triangles (Python's `len(mesh)`). */
    get length(): number;
    /** One unit normal per triangle (x, y, z each). */
    get triangleNormals(): Float64Array;
    get area(): number;
    /** Enclosed volume (meaningful for closed meshes). */
    get volume(): number;
    bbox(): BoundBox;
    center(): Vector;
    /**
     * The kernel's mesh of this one: from the tessellation, or built from the triangles (meshes read
     * from files or made from arrays), stitched along the edges they share.
     */
    _polyBrep(): number;
    _bool(other: Mesh, op: number, name: string): Mesh;
    _openEdgeCount(): number;
    /**
     * Where a ray meets the mesh's triangles, nearest first (`Hit`: point, distance from the start,
     * the triangle's normal and its index `triangle`). As `Part.raycast`, on the triangles instead
     * of the exact faces.
     */
    raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit[];
    /** True if every edge of the mesh is shared by exactly two triangles (a watertight mesh). */
    isClosed(): boolean;
    /** The kernel's mesh union (Python's `+`). */
    fuse(other: Mesh): Mesh;
    /** The kernel's mesh difference (Python's `-`). */
    cut(other: Mesh): Mesh;
    /** The kernel's mesh intersection (Python's `&`). */
    intersect(other: Mesh): Mesh;
    static _fromPoly(poly: number, normals?: boolean): Mesh;
    /** Write the mesh to a file (stl, obj, glb, ...; see `exportFile`). */
    export(path: string, options?: Record<string, unknown>): void;
    toString(): string;
    [inspect](): string;
}
/** A VTK-style polygon list (n, i0, ..., n, ...) as triangles (a fan per polygon) and, per
 * triangle corner, the index of its polygon corner. */
/**
 * Where the ray o + t d (t >= 0) crosses triangles (Moeller-Trumbore): the distances t and the
 * indices of the triangles.
 */
export declare function _rayTriangles(o: Vector, d: Vector, vertices: ArrayLike<number>, triangles: ArrayLike<number>, tol: number): [number[], number[]];
export declare function _triangulate(faces: ArrayLike<number>): [Uint32Array, Uint32Array];
/**
 * Triangulate a shape.
 *
 * @param shape A part, sketch, shell or face (or a list of them). A face's mesh faces the way the
 *   face does in its body's mesh (out of a part).
 * @param tolerance Maximum distance between mesh and exact surface. Default: 0.1 % of the bounding
 *   box diagonal.
 * @param angle Maximum angle (degrees) between neighbouring triangle normals on curved faces.
 *
 * The kernel cuts each face into a grid whose lines it places by the curves along the face's
 * borders. A face that is straight in one direction and twisted along it (the sides of a twisted
 * bar, a ruled loft between different curves, the walls of a thickened free-form sheet) gets no
 * lines across, so a body with such a face is divided by halving its faces until every part is
 * flat within the tolerance: more triangles, but within the tolerance. Other bodies get the
 * grid's triangles.
 */
export declare function tessellate(shape: Shape | Iterable<Shape>, tolerance?: number | null, angle?: number): Mesh;
/**
 * One mesh per face of a part, shell or sketch (in `shape.faces()` order), cut from one
 * tessellation of the whole body. Faces of imported bodies that the kernel cannot mesh on their
 * own (copied out of the body) get theirs this way, and the faces share the points where they
 * meet.
 */
export declare function faceMeshes(shape: _Body | ShapeList<Shape>, tolerance?: number | null, angle?: number): Mesh[];
/** Concatenate meshes (no Boolean). */
export declare function merge(meshes: readonly Mesh[]): Mesh;
export {};
