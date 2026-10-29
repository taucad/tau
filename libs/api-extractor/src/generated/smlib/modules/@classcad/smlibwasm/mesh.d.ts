/// <reference lib="esnext.disposable" />
import { PolyHandle } from './kernel.js';
import { Axis, BoundBox, Hit, Location, Plane, Vector, type VectorLike } from './geometry.js';
import { Face, MassProperties, Part, ShapeList, Wire, type Shape } from './shapes.js';
import { type FileOptions } from './exporters.js';
declare const inspect: unique symbol;
/**
 * An indexed triangle mesh.
 *
 * - `vertices`: positions, x, y, z for each vertex (`Float64Array`).
 * - `triangles`: three vertex indices for each triangle, counterclockwise seen from outside
 *   (`Uint32Array`).
 * - `normals`: optional corner normals, three for each triangle (nine numbers per triangle,
 *   `Float32Array`), used for shading crisp CAD edges.
 *
 * A mesh is its arrays: the kernel's mesh it came from is freed once they are copied out, and mesh
 * Booleans build one from the arrays when they need it. `dispose()` (or `using`) frees what a mesh
 * still holds in the kernel at once. The arrays can be changed in place; `translate`, `rotate`,
 * `mirror`, `scale` and `moved` return moved copies, as for shapes.
 *
 * Meshes of scans and STL files: `section` and `slices` cut them, `decimate` thins them out,
 * `fillHoles` and `repaired` close them, `massProperties` measures what they enclose and `toPart`
 * makes a faceted part of them.
 */
/** What `Mesh.repaired` did. */
export declare class RepairReport {
    /** Points that lay on each other (to 1e-9 of the largest coordinate), merged. */
    readonly mergedVertices: number;
    /** Triangles without an area, and repeated ones, left out. */
    readonly removedTriangles: number;
    /** Triangles turned to face the way their neighbours face (a closed piece outward). */
    readonly flippedTriangles: number;
    /** Holes filled (as `Mesh.fillHoles`). */
    readonly filledHoles: number;
    /** Borders that do not close on themselves, left open. */
    readonly openHoles: number;
    /** Edges of the result not shared by two triangles: 0 for a closed mesh. */
    readonly openEdges: number;
    constructor(mergedVertices: number, removedTriangles: number, flippedTriangles: number, filledHoles: number, openHoles: number, openEdges: number);
}
export declare class Mesh {
    /** The points, an array of [x, y, z]. */
    vertices: Float64Array;
    /** The triangles, as indices into `vertices`. */
    triangles: Uint32Array;
    /** A normal at each point, or null. */
    normals: Float32Array | null;
    constructor(vertices: ArrayLike<number>, triangles: ArrayLike<number>, normals?: ArrayLike<number> | null, _poly?: PolyHandle | null);
    /** The number of triangles (Python's `len(mesh)`). */
    get length(): number;
    /** Frees the kernel's copy of the mesh now, if it holds one (an internal tessellation can keep
     * it). The arrays stay, and the mesh stays usable: a mesh Boolean builds the kernel's mesh from
     * them again. */
    dispose(): void;
    [Symbol.dispose](): void;
    /** One unit normal per triangle (x, y, z each). */
    get triangleNormals(): Float64Array;
    /** The total area of the triangles. */
    get area(): number;
    /** Enclosed volume (meaningful for closed meshes). */
    get volume(): number;
    /** The box along the axes around the mesh's points; RangeError for an empty mesh. */
    bbox(): BoundBox;
    /** The middle of the bounding box (`centroid` is the center of mass). */
    center(): Vector;
    /** The center of mass of the volume a closed mesh encloses (uniform density); see
     * `massProperties`. */
    get centroid(): Vector;
    /**
     * Mass, center of mass and inertia tensor of the volume a closed mesh encloses, for a uniform
     * `density` (as `Part.massProperties`, a `MassProperties`).
     *
     * Exact for the triangles: each spans a tetrahedron with a point, and their integrals add up (the
     * divergence theorem). The mesh must be closed and face outward (ModelingError otherwise: close it
     * with `fillHoles` or `repaired`); an empty mesh throws a RangeError.
     */
    massProperties(density?: number): MassProperties;
    /** A copy placed by `location`. */
    moved(location: Location): Mesh;
    /** A copy moved by `(x, y, z)`. */
    translate(x?: number | VectorLike, y?: number, z?: number): Mesh;
    /** A copy rotated by `angle` degrees about `axis`. */
    rotate(axis?: Axis, angle?: number): Mesh;
    /** A mirrored copy (reflection in `plane`, a plane or a planar face; by default the XZ plane,
     * which flips Y). The triangles keep facing outward. */
    mirror(plane?: Plane | Face | Axis | ShapeList<Face>): Mesh;
    /** A scaled copy. `factor` is a number or per-axis factors `[sx, sy, sz]`, none of them zero
     * (RangeError). */
    scale(factor: number | VectorLike, center?: VectorLike): Mesh;
    /**
     * Where a ray meets the mesh's triangles, nearest first (`Hit`: point, distance from the start,
     * the triangle's normal and its index `triangle`). As `Part.raycast`, on the triangles instead
     * of the exact faces.
     */
    raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit<null>[];
    /**
     * The first hit of each of many rays, one per ray (a `Hit` or `null`), not `raycast` many times
     * (which gives every hit of a ray): for each origin, the `Hit` that `raycast` gives first (the
     * point, the distance, the triangle's normal and its index `triangle`), `null` where the ray
     * misses.
     *
     * `origins` are points; `directions` one direction (a vector or an axis) for all of them, or one
     * each. The kernel's ray tracer sorts the triangles into a grid once per call (0.8 s for 250 000
     * triangles) and then takes about 0.01 ms a ray, where `raycast` tests every triangle: give all
     * the rays in one call.
     */
    raycastMany(origins: Iterable<VectorLike>, directions: VectorLike | Axis | Iterable<VectorLike | Axis>): (Hit<null> | null)[];
    /** True if every edge of the mesh is shared by exactly two triangles (a watertight mesh). */
    isClosed(): boolean;
    /**
     * Where the plane cuts the mesh: polylines (wires of straight edges) through the points where its
     * triangles cross the plane, chained into loops, the longest first.
     *
     * Of a closed mesh every loop is closed, outer loops counterclockwise seen from the plane's normal
     * and holes clockwise (as the faces of `Part.section`); an open mesh can give open polylines too.
     * `makeFace(loop)` makes a face of a closed loop. Points where the cut runs straight on are left
     * out. A plane through a flat part of the mesh (the top face of a box's mesh) cuts it just beside
     * that, on the side where the cut encloses more. Empty where the plane misses the mesh.
     */
    section(plane?: Plane | Face): ShapeList<Wire>;
    /**
     * Sections (`section`) across `axis`, `step` apart: the mesh cut into layers of thickness `step`
     * from its lowest point along the axis up, each cut in its middle (at `step / 2`, `3 * step / 2`,
     * ... above the lowest point; the contours of a printer's layers). Layers whose plane cuts
     * nothing are left out.
     */
    slices(step: number, axis?: Axis | VectorLike): ShapeList<Wire>[];
    /**
     * A mesh with fewer triangles, as near to this one as the kernel's quadric decimation
     * (SmPolyDecimate) keeps it: it collapses the edges whose removal changes the shape least first,
     * keeps a closed mesh closed and keeps the border of an open one.
     *
     * Give one of:
     *
     * - `fraction`: the share of the triangles to remove (`0.9` leaves a tenth).
     * - `triangles`: about how many triangles to leave.
     * - `tolerance`: how far the result may be from this mesh at most. The mesh is decimated step by
     *   step while the distance stays within it (measured at the points of both meshes and the
     *   middles of their triangles), so this takes a few decimations (seconds for 100 000 triangles).
     *
     * `featureAngle` (degrees, 0 to 180, default 30): edges where the triangles turn by more than it
     * are features, which the decimation keeps longest, and stay sharp in the result's normals (at each
     * corner the average of the triangles around it, except across such edges). Triangles the
     * decimation leaves folded over (slivers facing against their neighbours) are taken out.
     * ModelingError if a closed mesh comes back open, or
     * an open mesh with another border (a mesh whose points all lie on its border, such as a tube of
     * long triangles, cannot keep it), and where the kernel collapses the mesh far below the count
     * asked (it does with the long thin triangles of a coarse mesh of a cone: mesh such a part with a
     * larger tolerance instead). The kernel orders equal choices by memory, so the count can differ by
     * a few triangles from run to run.
     */
    decimate(fraction?: number | null, options?: {
        triangles?: number | null;
        tolerance?: number | null;
        featureAngle?: number;
    }): Mesh;
    /**
     * A copy with every hole closed: each border of edges that only one triangle has, which closes on
     * itself, is filled with triangles (the kernel's triangulation of the polygon, also of one that is
     * not flat). The triangles of the mesh stay as they are; the new ones face as the triangles beside
     * them do. See `repaired`, which also merges points that lie on each other and turns triangles
     * that face the wrong way first.
     */
    fillHoles(): Mesh;
    /**
     * A repaired copy and what was done: points that lie on each other (to 1e-9 of the largest
     * coordinate) are merged, triangles left without an area and repeated ones are left out,
     * triangles are turned to face the way their neighbours face (a closed piece outward), and holes
     * are filled (as `fillHoles`).
     *
     * Returns `[mesh, report]`; the report counts `mergedVertices`, `removedTriangles`,
     * `flippedTriangles`, `filledHoles`, `openHoles` (borders that do not close on themselves, left
     * open) and `openEdges` (edges of the result not shared by two triangles: 0 for a closed mesh).
     */
    repaired(): [
        Mesh,
        RepairReport
    ];
    /**
     * A faceted part of a closed mesh: a planar face for each triangle, where neighbouring triangles
     * that lie in one plane (the faces of a CAD part's mesh) make one face. Exact Booleans with other
     * parts, sections and STEP files work on it; its faces stay flat (no fillets of curved faces).
     *
     * Booleans get slow as faces add up (a sphere of 14 080 triangles took 40 s to cut by a box), so a
     * mesh that would give more than `maxFaces` faces throws a ModelingError: decimate it first
     * (`mesh.decimate(null, { triangles: 2000 }).toPart()`), or give a larger `maxFaces` (`0`: no
     * limit). An open mesh throws a ModelingError too (close it with `fillHoles` or `repaired`), and
     * so does one whose part is not a valid solid or does not enclose the mesh's volume.
     */
    toPart(maxFaces?: number): Part;
    /** The kernel's mesh union (Python's `+`). */
    fuse(other: Mesh): Mesh;
    /** The kernel's mesh difference (Python's `-`). */
    cut(other: Mesh): Mesh;
    /** The kernel's mesh intersection (Python's `&`). */
    intersect(other: Mesh): Mesh;
    /** Write the mesh to a file (stl, obj, glb, ...; see `exportFile`, whose options it takes). */
    export(path: string, options?: FileOptions): void;
    toString(): string;
    [inspect](): string;
}
/**
 * Triangulate a shape.
 *
 * @param shape A part, sketch, shell or face (or a list of them). A face's mesh faces the way the
 *   face does in its body's mesh (out of a part).
 * @param tolerance Maximum distance between mesh and exact surface. Default: 0.1 % of the bounding
 *   box diagonal.
 * @param angle Maximum angle (degrees) between neighbouring triangle normals on curved faces.
 * @param options `maxEdge`: the longest edge a triangle may have (default: no limit): evenly sized
 *   triangles for simulation meshes, deformation or sampling, where the tolerance alone leaves a
 *   flat face two long triangles. A plate 100 long at tolerance 0.1 gets triangles 100 long;
 *   `maxEdge: 10` keeps them under 13 (the kernel splits by about that length).
 *
 * The kernel cuts each face into a grid whose lines it places by the curves along the face's
 * borders. A face that is straight in one direction and twisted along it (the sides of a twisted
 * bar, a ruled loft between different curves, the walls of a thickened free-form sheet) gets no
 * lines across, so a body with such a face is divided by halving its faces until every part is
 * flat within the tolerance: more triangles, but within the tolerance. So is a body with a
 * free-form face whose surface the grid misses (a bump between its lines). On spheres, tori, cones
 * and cylinders, edges whose middle is off the face by more than the tolerance are split onto it
 * (the grid's slivers near the poles of a sphere). Other bodies get the grid's triangles.
 *
 * With `maxEdge` every body gets the grid (the halving cannot take a longest edge): a body with a
 * twisted face whose grid triangles are then off by more than twice the tolerance gets a warning
 * saying how far (a smaller `maxEdge` brings them nearer).
 */
export declare function tessellate(shape: Shape | Iterable<Shape>, tolerance?: number | null, angle?: number, options?: {
    maxEdge?: number | null;
}): Mesh;
/**
 * One mesh per face of a part, shell or sketch (in `shape.faces()` order), cut from one
 * tessellation of the whole body. Faces of imported bodies that the kernel cannot mesh on their
 * own (copied out of the body) get theirs this way, and the faces share the points where they
 * meet.
 */
export declare function faceMeshes(shape: Shape | ShapeList<Shape>, tolerance?: number | null, angle?: number): Mesh[];
/** Concatenate meshes (no Boolean). */
export declare function merge(meshes: readonly Mesh[]): Mesh;
export {};
