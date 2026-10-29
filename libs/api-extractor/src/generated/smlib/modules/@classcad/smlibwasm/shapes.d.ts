/// <reference lib="esnext.disposable" />
import { Axis, BoundBox, ClosestPoints, Continuity, Curvature, Hit, Nurbs, NurbsSurface, Location, Plane, Vector, type VectorLike } from './geometry.js';
import { Mesh } from './mesh.js';
import { type ShowOptions } from './viewer.js';
import { type FileOptions } from './exporters.js';
import { type BendOptions, type Lattice, type TaperOptions, type TwistOptions, type UnrollOptions } from './deformations.js';
import { type DraftAnalysis } from './molding.js';
import { type Bend, type FlangeOptions, type FlatPattern, type FoldOptions, type KFactor, type UnfoldOptions } from './sheetmetal.js';
type Any = any;
/**
 * Relative accuracy of areas, volumes, centers and inertia: volumes and areas to `ACCURACY` of
 * their value, centers to `ACCURACY` times the size of the body (its bounding box diagonal),
 * inertia to `ACCURACY` times its largest principal moment. `massProperties(density, accuracy)`
 * takes another.
 */
export declare const ACCURACY = 1e-7;
declare const inspect: unique symbol;
/** A color: a CSS name ("steelblue"), "#4682b4", or [r, g, b] (0..1 or 0..255). */
export type ColorLike = string | readonly number[];
/** Edges as the operations on edges take them (`fillet`, `chamfer`): an edge, a face or a wire
 * (their edges), or a list of them (an array, a ShapeList, a Set; also nested). */
export type EdgesLike = Edge | Face | Wire | (Iterable<EdgesLike> & object);
/** Faces as the operations on faces take them (`shell`, `removeFaces`, `draft`): a face, or a list
 * of faces (an array, a ShapeList, a Set; also nested). */
export type FacesLike = Face | (Iterable<FacesLike> & object);
/** The bodies, faces or edges a selection is checked against (`ShapeList.newSince`, `derivedFrom`,
 * `joining`): one or several, in lists. */
export type SourcesLike = Part | Shell | Face | Edge | (Iterable<SourcesLike> & object);
/** A region on a face (`warp`, `flatten`): a closed Wire, a Face or a Sketch placed on the face (its
 * outline), or the corner points of a polygon on the face. */
export type RegionLike = Sketch | Face | Wire | Edge | Iterable<VectorLike>;
/** Walls of their own thickness for `shell`: [faces, thickness] pairs, or a Map of face to thickness. */
export type WallsLike = ReadonlyMap<Face, number> | Iterable<readonly [
    FacesLike,
    number
]>;
/** The options of `Face.iso`: `u` or `v`, a fraction (0 to 1) of the face's range of that parameter. */
export interface IsoOptions {
    u?: number | null;
    v?: number | null;
}
/** Metadata a body carries: a name (exporters, the viewer) and a display color. */
export interface BodyOptions {
    name?: string | null;
    color?: ColorLike | null;
    /** (a sketch's plane) */
    plane?: Plane | null;
}
/** Base class of all shapes. */
export declare abstract class Shape {
    /** All vertices of this shape. */
    abstract vertices(): ShapeList<Vertex>;
    /** All edges of this shape. */
    abstract edges(): ShapeList<Edge>;
    /** All wires (closed edge loops of faces, or the shape itself if it is a wire). */
    wires(): ShapeList<Wire>;
    /** All faces of this shape. */
    faces(): ShapeList<Face>;
    /** A copy of this shape moved by a location (`location.mul(shape)`). */
    moved(location: Location): this;
    /** A copy moved by `(x, y, z)`. */
    translate(x?: number | VectorLike, y?: number, z?: number): this;
    /** A copy rotated by `angle` degrees about `axis`. */
    rotate(axis?: Axis, angle?: number): this;
    /** A mirrored copy (reflection in `plane`, a plane or a planar face; by default the XZ plane,
     * which flips Y). */
    mirror(plane?: Plane | Face | Axis | ShapeList<Face>): this;
    /** A scaled copy. `factor` is a number or per-axis factors `[sx, sy, sz]`, none of them zero
     * (RangeError: that would flatten the shape). */
    scale(factor: number | VectorLike, center?: VectorLike): this;
    /**
     * Place this shape, designed around the world XY plane, onto a plane or face.
     *
     * The shape's origin goes to the plane origin (a face's center), its X axis to the plane's X
     * direction and its Z axis to the plane normal. `sketch.on(face)` is the usual way to draw on
     * a face.
     */
    on(target: Plane | Face | Location | ShapeList<Face> | Sketch): this;
    /** Tight axis-aligned bounding box. */
    abstract bbox(): BoundBox;
    /** Center of mass (centroid) of the shape. */
    abstract center(): Vector;
    /** Minimum distance to a point (and, for bodies, to another body). */
    distanceTo(_other: VectorLike | Shape): number;
    /** Triangulate the shape (see `tessellate`; `maxEdge` is the longest edge a triangle may have). */
    mesh(tolerance?: number | null, angle?: number, options?: {
        maxEdge?: number | null;
    }): Mesh;
    /** Show the shape in the viewer (see `show`); returns the path of the page. */
    show(options?: ShowOptions): string;
    /** Write the shape to a file; the format follows the extension (step, stl, glb, ...), the options
     * are the format's (see `exportFile`). */
    export(path: string, options?: FileOptions): void;
    toString(): string;
    [inspect](): string;
}
/** What shapes are sorted and grouped by: an axis, a name ("length", "area", "volume",
 * "radius", "x", "y", "z", "size") or a function of a shape. */
export type SortKey = Axis | string | ((s: Any) => number);
/**
 * A list of shapes with selection helpers.
 *
 * Every selector returns a new ShapeList, so selectors chain:
 *
 *     part.edges().parallelTo(Z).maxBy(X)
 *     part.faces().planar().facing(Z.neg())
 *
 * A one-element list can be used wherever a single shape is expected
 * (`sketch.on(part.faces().top())`). Use `one()` to require exactly one.
 */
export declare class ShapeList<T = Shape> extends Array<T> {
    /** The only element; throws if the list does not hold exactly one shape. */
    one(): T;
    /** The first shape; RangeError for an empty list. */
    get first(): T;
    /** The shape at `index` (Array's `at`: a negative index counts from the end). Python's
     * `at(point)` selects by a point; here that is `atPoint(point)`. */
    at(index: number): T | undefined;
    /** The last shape; RangeError for an empty list. */
    get last(): T;
    /** Sort by position along an axis, by "length"/"area"/"volume"/"radius", or by any function
     * of a shape. */
    sortBy(key?: SortKey, reverse?: boolean): ShapeList<T>;
    /** `parallelTo(axis)`, `ofType(name)` or `filter(predicate)`, depending on the argument. */
    filterBy(criterion: Axis | string | ((s: T) => boolean)): ShapeList<T>;
    /** The shapes by the distance of their centers from a point, nearest first (farthest first with `reverse`).
     * The shapes by the distance of their centers from a point, nearest first (farthest first with `reverse`). */
    sortByDistance(point: VectorLike, reverse?: boolean): ShapeList<T>;
    /** Group shapes with equal key (within `tolerance`), groups in ascending key order. */
    groupBy(key?: SortKey, tolerance?: number): ShapeList<T>[];
    /** The shapes with the largest key (all of them, if several tie within `tolerance`). */
    maxBy(key?: SortKey, tolerance?: number): ShapeList<T>;
    /** The shapes with the smallest key (all of them, if several tie within `tolerance`). */
    minBy(key?: SortKey, tolerance?: number): ShapeList<T>;
    /** Highest shapes (largest Z). */
    top(): ShapeList<T>;
    /** Lowest shapes (smallest Z). */
    bottom(): ShapeList<T>;
    /** Shapes furthest along +X. */
    right(): ShapeList<T>;
    /** Shapes furthest along -X. */
    left(): ShapeList<T>;
    /** Shapes furthest along +Y. */
    back(): ShapeList<T>;
    /** Shapes furthest along -Y. */
    front(): ShapeList<T>;
    /** The biggest shape by volume, area or length. */
    largest(): T;
    /** The smallest shape by volume, area or length. */
    smallest(): T;
    /** The shape whose center is closest to `point`. */
    nearest(point: VectorLike): T;
    /** Keep the shapes for which `predicate(shape)` is true. */
    filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: unknown): ShapeList<S>;
    filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown): ShapeList<T>;
    /** A plain array of what `fn` gives for each shape. */
    map<U>(fn: (value: T, index: number, array: T[]) => U, thisArg?: unknown): U[];
    /** Keep shapes of the given geometry types, e.g. "line", "circle", "plane", "cylinder",
     * "bspline". */
    ofType(...geomTypes: string[]): ShapeList<T>;
    /** Straight edges (also straight B-spline edges, such as the edges of a chamfer). */
    lines(): ShapeList<T>;
    /** Circular edges (full circles and arcs). */
    circles(): ShapeList<T>;
    /** Planar faces (also flat B-spline faces). */
    planar(): ShapeList<T>;
    /** Cylindrical faces. */
    cylinders(): ShapeList<T>;
    /** Straight edges along `axis`, or planar faces whose normal is along `axis`. */
    parallelTo(axis: Axis | VectorLike): ShapeList<T>;
    /** Straight edges perpendicular to `axis`, or planar faces containing it. */
    perpendicularTo(axis: Axis | VectorLike): ShapeList<T>;
    /**
     * Faces whose outward normal points along `direction` (within `maxAngle` degrees).
     *
     * A curved face counts only when its normal does so everywhere on the face: the wall of a hole
     * or a boss faces no direction, and a fillet only with a `maxAngle` that takes in all its
     * normals.
     */
    facing(direction: Axis | VectorLike, maxAngle?: number): ShapeList<T>;
    /** Edges on outside corners (material angle below 180 degrees), and the outside corners of a
     * sketch (vertices where the region's angle is below 180 degrees). */
    convex(): ShapeList<T>;
    /** Edges on inside corners (material angle above 180 degrees), and the inside corners of a
     * sketch. */
    concave(): ShapeList<T>;
    /** Edges where two faces meet tangentially, such as the borders of a fillet, and the vertices
     * of a sketch where two edges meet tangentially. */
    smooth(): ShapeList<T>;
    /** The edges of the list and the edges that continue them tangentially (see
     * `Edge.tangentChain`): what `fillet` and `chamfer` round for this selection. Other shapes are
     * left out. */
    tangentChain(): ShapeList<Edge>;
    /** Edges whose two faces meet at least tangentially all along them ("G1" or "G2" by
     * `Edge.continuity`): the borders of fillets and blends. */
    g1(): ShapeList<T>;
    /** Edges whose two faces meet with equal curvature as well ("G2" by `Edge.continuity`): the
     * borders of curvature-continuous blends (`fillet(..., { continuity: 'G2' })`), seams of smooth
     * surfaces. */
    g2(): ShapeList<T>;
    /** Fillet faces: rounds of convex edges and fillets of concave ones, found by geometry (with
     * the corner patches where fillets meet), up to `maxRadius`. See the defeature module. */
    fillets(maxRadius?: number | null): ShapeList<T>;
    /**
     * The faces (or bodies) of the list that a ray meets, nearest first: each once, in the order the
     * ray meets them (see `Part.raycast`). Only the shapes in the list count, so
     * `part.faces().planar().hitBy(...)` looks past the faces that are not planar.
     *
     * The ray starts at `origin` and runs along `direction` (an axis or a vector); an axis alone is a
     * ray from its origin along its direction. A ray through an edge meets the faces on both sides of it.
     */
    hitBy(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): ShapeList<T>;
    /** Shapes whose bounding box lies inside `box`. */
    within(box: BoundBox): ShapeList<T>;
    /** Shapes passing through `point` (vertices at, edges/faces touching it), at most `tolerance`
     * (mm) from it. (Python's `at`; Array has an `at` of its own.) */
    atPoint(point: VectorLike, tolerance?: number): ShapeList<T>;
    /**
     * The faces or edges that are new since the given bodies: made by the operations that led from
     * them to this list's body, descending from no face or edge of theirs (Python's `new`).
     *
     * `since` is a body (part, shell, sketch) or a list of them, or faces and edges (then only those
     * count as old). After a Boolean, the curves along which the bodies' faces cross
     * (`plate.fuse(boss).edges().newSince([plate, boss])`: the circle where a boss reaching into the
     * plate meets its top; where an edge of one body lies on the other, such as the bottom edge of a
     * boss standing on the plate, that edge is not new: `joining` finds both); after a fillet,
     * chamfer or shell, its new faces (`rounded.faces().newSince(part)`) and their edges.
     *
     * smlibwasm marks every face and edge of every body it makes, and the kernel carries the marks
     * along: a copy keeps them, both halves of a split face keep their parent's, a face merged from
     * two keeps both. A moved, turned, mirrored or scaled copy gets new marks (it is a shape of its
     * own). A body read from a file, and a section, have new marks everywhere, so all of them counts
     * as new.
     */
    newSince(since: SourcesLike): ShapeList<T>;
    /**
     * The faces or edges that descend from the given shapes: faces from faces, edges from edges,
     * both from a body (part, shell, sketch). A face that an operation split, trimmed, moved along
     * with the part or merged with another descends from it; one the operation made anew does not.
     *
     * `plate.cut(holes).faces().derivedFrom(holes)` gives the walls of the holes;
     * `cut.edges().derivedFrom(box.edges().top())` the pieces of the top edges of a box that a slot
     * cut. A body's faces and edges are marked as described in `newSince`.
     */
    derivedFrom(...shapes: SourcesLike[]): ShapeList<T>;
    /**
     * The edges that lie on the surfaces of both `a` and `b`: where two bodies that a Boolean combined
     * meet, the edges to round or chamfer after it. `plate.fuse(boss).edges().joining(plate, boss)`
     * gives the circle where the boss stands on the plate, also where the boss's bottom face lay on the
     * plate's top (which `newSince` does not count as new: the circle is the boss's bottom edge),
     * `block.cut(hole).edges().joining(block, hole)` the rims of the hole. `a` and `b` are bodies
     * (parts, shells, sketches) or lists of them (an edge on any of them counts).
     *
     * Each edge is tested at a quarter, half and three quarters of the way along it: there it lies on
     * a face of a body (within the edge's tolerance, at least 1e-6 of the bodies' size) where
     * `Part.classify` puts it on the body's surface. Edges of a merged face (a face of each body lying
     * in one plane, merged by a union) are not on both surfaces and are not taken.
     */
    joining(a: SourcesLike, b: SourcesLike): ShapeList<T>;
    /** The faces that lie between two cells of a merged part (see `Part.merge`): where two materials
     * meet, the faces a simulation mesh must match across or a contact condition goes on.
     * `merge(block, insert).faces().shared()`; `Face.cells` says which two cells. */
    shared(): ShapeList<T>;
    /** The shapes of both lists, each once (Python's `|`). */
    union(other: Iterable<T>): ShapeList<T>;
    /** The shapes not in `other` (Python's `-`). */
    difference(other: Iterable<T>): ShapeList<T>;
    /** The shapes also in `other` (Python's `&`). */
    intersection(other: Iterable<T>): ShapeList<T>;
    /** The vertices of all the shapes, each once. */
    vertices(): ShapeList<Vertex>;
    /** The edges of all the shapes, each once. */
    edges(): ShapeList<Edge>;
    /** The faces of all the shapes, each once. */
    faces(): ShapeList<Face>;
    /** The wires of all the shapes. */
    wires(): ShapeList<Wire>;
    /** Average of the members' centers. */
    center(): Vector;
    /** The box around all the shapes; RangeError for an empty list. */
    bbox(): BoundBox;
    /** Each shape moved by a location. */
    moved(location: Location): ShapeList<T>;
    /** Every shape placed onto a plane or face (see `Shape.on`). */
    on(target: Plane | Face | Location | ShapeList<Face> | Sketch): ShapeList<T>;
    /** Each shape moved by `(x, y, z)`. */
    translate(x?: number | VectorLike, y?: number, z?: number): ShapeList<T>;
    /** Each shape rotated about an axis by `angle` degrees. */
    rotate(axis?: Axis, angle?: number): ShapeList<T>;
    toString(): string;
    [inspect](): string;
}
/** A point. Vertices of bodies come from `.vertices()`; `new Vertex(x, y, z)` makes one. */
export declare class Vertex extends Shape {
    constructor(x?: number | VectorLike, y?: number, z?: number);
    /** Where the vertex is. */
    get point(): Vector;
    /** The vertex's x coordinate. */
    get x(): number;
    /** The vertex's y coordinate. */
    get y(): number;
    /** The vertex's z coordinate. */
    get z(): number;
    /** How far the edges and faces that meet at this vertex may pass from its point: the kernel's
     * tolerance of the vertex (1e-5 on most parts; larger where the surfaces of an imported, stitched
     * or healed body meet less exactly). RangeError for a vertex of no body (`new Vertex(x, y, z)`). */
    get tolerance(): number;
    /** Where the vertex is (as `point`). */
    center(): Vector;
    /** A box of size 0 at the vertex. */
    bbox(): BoundBox;
    /** This vertex, in a list. */
    vertices(): ShapeList<Vertex>;
    /** The edges of the body that meet at this vertex (none for a vertex of no body). */
    edges(): ShapeList<Edge>;
    /** The faces of the body that meet at this vertex (none for a vertex of no body). */
    faces(): ShapeList<Face>;
    /** The distance to a point or to a shape. */
    distanceTo(other: VectorLike | Shape): number;
    /** For a corner of a sketch: "convex" where the region's angle is below 180 degrees (an
     * outside corner), "concave" above (an inside corner, also every corner of a square hole),
     * "smooth" where the two edges meet tangentially. */
    get convexity(): string;
    equals(other: unknown): boolean;
    [Symbol.iterator](): IterableIterator<number>;
    toString(): string;
}
/**
 * A bounded curve: a line segment, an arc, a circle, an ellipse or a NURBS curve.
 *
 * Edges come from bodies (`part.edges()`) or from curve constructors such as `Line`,
 * `ThreePointArc` and `Spline`. Parameters along an edge (`pointAt(t)`) run from 0 at the start
 * to 1 at the end, proportional to arc length.
 */
export declare class Edge extends Shape {
    /** (create edges with Line(), CenterArc(), Spline(), ... or take them from a shape) */
    constructor(token?: symbol);
    /** Frees the kernel's curve of a standalone edge now, not when the garbage collector gets to
     * it; the edges that share it (`reversed()`, wires made of the edge) cannot be used afterwards.
     * An edge of a body belongs to the body: dispose the body. */
    dispose(): void;
    [Symbol.dispose](): void;
    /** "line", "circle" (also arcs), "ellipse", "bspline" or "other". */
    get geomType(): string;
    /** How far this edge's curve, its ends and the faces it bounds may lie apart: the kernel's
     * tolerance of the edge (1e-5 on most parts; larger where the surfaces of an imported, stitched
     * or healed body meet less exactly). RangeError for an edge of no body (a curve made with `Line`,
     * `Spline`, ...). */
    get tolerance(): number;
    /** The edge's length. */
    get length(): number;
    /** The point where the edge starts (in its direction). */
    get start(): Vector;
    /** The point where the edge ends (in its direction). */
    get end(): Vector;
    /** True if the edge ends where it starts (a circle, a closed spline). */
    get isClosed(): boolean;
    /** True for the seam of a closed surface (an edge used twice by one face). */
    get isSeam(): boolean;
    /** "convex" for an outside corner (material angle below 180 degrees), "concave" for an inside
     * corner, "smooth" where the faces meet tangentially (within half a degree) all along the edge.
     * Taken at the middle of the edge; an edge that is tangent there but not at points along it
     * takes the kind where its faces turn most. Edges with a single face count as convex. */
    get convexity(): string;
    /** The angle between the two faces of the edge through the material, in degrees, at the middle
     * of the edge: 90 at the edges of a box, 270 at the inside corner of an L, 180 where the faces
     * meet tangentially. RangeError for an edge that does not lie between two faces. */
    get dihedralAngle(): number;
    /** True on an outside corner (see `convexity`). */
    isConvex(): boolean;
    /** Unit direction of a straight edge (start to end). */
    get direction(): Vector;
    /** Radius of a circular edge. */
    get radius(): number;
    /** Center of a circular edge. */
    get arcCenter(): Vector;
    /** Axis direction of a circular edge. */
    get normal(): Vector;
    /** Point at fraction `t` of the edge length (0 = start, 1 = end). */
    pointAt(t?: number): Vector;
    /** Unit tangent at fraction `t` of the edge length, pointing along the edge. */
    tangentAt(t?: number): Vector;
    /** The point halfway along the edge (use `arcCenter` for a circle's center). */
    center(): Vector;
    /** The box along the axes around the edge. */
    bbox(): BoundBox;
    /** Distance to a point, or to a body (see `Part.distanceTo`). */
    distanceTo(point: VectorLike | Shape): number;
    /**
     * How the two faces of the edge meet, checked at `samples` points along it (`Continuity`): "G2"
     * where their curvatures across the edge agree as well, "G1" where they meet tangentially (a
     * circular fillet's border), "G0" at a crease, `null` where they leave a gap wider than the edge's
     * tolerance.
     *
     * `angleTolerance` is the largest angle (degrees) between the faces' normals for G1; `curvatureTolerance` the
     * largest difference of their curvatures across the edge for G2, relative to the larger of them
     * (and at least `1e-3 / length`, so that nearly flat faces count as G2). RangeError for an edge
     * that does not lie between two faces.
     */
    continuity(samples?: number, options?: {
        angleTolerance?: number;
        curvatureTolerance?: number;
    }): Continuity;
    /** The point of the edge nearest to `point`. */
    closestPoint(point: VectorLike | Vertex): Vector;
    /**
     * Where on the edge the point nearest to `point` lies, as a fraction of the edge's length from
     * its start (0) to its end (1), as `pointAt` takes it: `edge.pointAt(edge.paramAtPoint(p))` is
     * `edge.closestPoint(p)` (build123d's name).
     */
    paramAtPoint(point: VectorLike | Vertex): number;
    /**
     * The part of the edge from `start` to `end`, each a fraction of the length (as in `pointAt`) or a
     * point on the edge. The part keeps the curve: a trimmed arc is an arc, a trimmed spline the same
     * spline. `start` must come before `end` along the edge.
     *
     *     const arc = CenterArc([0, 0], 10, 0, 180).trim(0.25, 0.75)   // the arc from 45 to 135 degrees
     */
    trim(start: number | VectorLike | Vertex, end: number | VectorLike | Vertex): Edge;
    /**
     * The edge cut in two at `at`, a fraction of the length or a point on the edge: the part before and
     * the part after, each keeping the curve.
     *
     *     const [a, b] = Line([0, 0], [10, 0]).split(0.3)   // 3 and 7 long
     */
    split(at: number | VectorLike | Vertex): [
        Edge,
        Edge
    ];
    /**
     * The edge made longer by `distance` at its `end` ('end', 'start' or 'both'), for cut tools and
     * paths that must run past a body.
     *
     * Lines and arcs (circles and ellipses) go on as themselves. Other curves are continued as
     * `continuity` says: 'G1' straight along the end tangent, 'G2' with the curvature at the end,
     * 'natural' as the curve's own polynomial goes on. The added length is `distance` in every case.
     *
     *     const groovePath = Spline([0, 0], [20, 8], [40, 0]).extend(5, { end: 'both' })
     */
    extend(distance: number, options?: {
        end?: 'start' | 'end' | 'both';
        continuity?: 'G1' | 'G2' | 'natural';
    }): Edge;
    /**
     * Points where this edge meets `other`: an edge, a wire, a face, a body (its faces) or a list of
     * them, in order along this edge.
     *
     * Where the two run along each other, the points where that overlap starts and ends. Points closer
     * than `tolerance` to the other shape count as on it (default: 1e-6, or 1e-9 of the size of the two
     * where that is larger); points closer than that to each other count once. No point is an empty
     * list.
     */
    intersections(other: Shape | Iterable<Shape>, options?: {
        tolerance?: number | null;
    }): Vector[];
    /** Where this edge meets `other` (see `intersections`), as fractions of its length (as `pointAt`
     * and `split` take them), in order. */
    intersectionParams(other: Shape | Iterable<Shape>, options?: {
        tolerance?: number | null;
    }): number[];
    /** Points where the edge crosses itself (a figure eight, a looping spline), in order along it; the
     * closing point of a closed edge does not count. */
    selfIntersections(options?: {
        tolerance?: number | null;
    }): Vector[];
    /** The curvature at fraction `t` of the length (as `pointAt`): one over the radius of the circle
     * that fits the edge best there; 0 where it runs straight. */
    curvatureAt(t?: number): number;
    /** The radius of curvature at fraction `t` of the length (`Infinity` where the edge runs
     * straight): the radius of the circle that fits the edge best there. */
    radiusAt(t?: number): number;
    /**
     * The smallest radius of curvature of the edge (as `Face.minRadius` is the face's): Infinity for a
     * line, an arc's radius. A sweep profile that reaches farther from the path than this folds over
     * itself. Where it is: `minRadiusAt`.
     *
     *     const r = path.minRadius()
     *     const p = path.pointAt(path.minRadiusAt())
     */
    minRadius(): number;
    /** Where the edge bends most tightly (`minRadius`): a fraction of its length, as `pointAt` takes it
     * (0 for a line or an arc). */
    minRadiusAt(): number;
    /**
     * Where the edge changes the side it bends to (an S-curve has one), as fractions of its length (as
     * `pointAt`), in order: points where its curvature passes through zero. Lines, arcs and curves that
     * bend one way only have none; a straight stretch between two bends counts once, at its middle,
     * where the bends go opposite ways.
     */
    inflections(): number[];
    /**
     * The edge moved `distance` sideways in its plane: an open edge to its left for a positive
     * distance (seen from the side the plane's normal points to), to its right for a negative one; a
     * closed edge (a circle, a closed spline) outward for a positive distance.
     *
     * Lines stay lines and arcs stay arcs, exactly. Splines and ellipses are offset by the kernel
     * within 1e-6 of their size. Where the edge bends toward that side more tightly than the distance
     * (a radius of curvature below it, see `minRadius`), the offset would fold over itself and a
     * ModelingError says where. A closed edge with a corner where it starts and ends
     * (`Spline(...pts, pts[0])`) comes back as one closed edge: rounded at the corner where the offset
     * pulls it apart, cut where its sides cross where it pushes them together (`Wire.offset` gives
     * sharp and chamfered corners).
     *
     * `plane`: the plane the edge lies in, whose normal tells left from right. Default: the XY plane
     * for an edge at one height, else the plane the edge lies in, its normal toward +Z (+Y, then +X,
     * for vertical planes).
     *
     *     const rail = Spline([0, 0], [20, 8], [40, 0]).offset(3) // 3 to the left (+Y side)
     */
    offset(distance: number, options?: {
        plane?: Plane | null;
    }): Edge;
    /**
     * The edge as lines and circular arcs within `tolerance` of it, end to end along it: for CNC,
     * laser and plasma cutters and DXF readers that take only LINE and ARC
     * (`exportDxf(..., { curves: 'arcs' })`). Lines and arcs come back as they are; splines and
     * ellipses become chains of arcs that join tangentially (lines where they run straight). Both
     * ways, every point of one lies within `tolerance` of the other.
     *
     *     const cut = Spline([0, 0], [10, 5], [20, -3], [30, 4]).toArcs(0.01) // 26 arcs
     */
    toArcs(tolerance?: number): Wire;
    /**
     * This edge bent to pass through `point` (and there in the direction `tangent`, if given): the
     * smallest move of its control points that does it, with the ends of the edge and its directions
     * at the ends kept. For "make this curve pass here" edits of splines, sweep paths and outlines;
     * lines and arcs become cubic B-splines.
     *
     * Options: `tangent`, the direction of the edge at that point (its length does not count; it is
     * the direction the edge runs in); `at`, where along the edge the point goes, as a fraction of its
     * length (strictly between 0 and 1; default: where the edge comes closest to the point).
     *
     * The change is local: it moves the few control points near `at` (knots are inserted there when
     * the edge has too few), so a point far from the edge makes a bump, not a new curve.
     *
     *     const path = Spline([0, 0], [20, 10], [40, 0]).through([20, 15])
     */
    through(point: VectorLike | Vertex, options?: {
        tangent?: VectorLike | null;
        at?: number | null;
    }): Edge;
    /**
     * This edge with its ends moved to `start` and `end` and its directions there set to
     * `startTangent` and `endTangent` (each optional: what is not given stays), bent smoothly in
     * between: the parts near the ends move as a whole, the middle blends. For closing gaps, snapping a
     * curve onto a point or another curve, and making it leave or arrive tangentially. Lines and arcs
     * become B-splines (cubic at least).
     *
     * The kernel's own end deformation (`SmCurve::DeformToEndPointTargets`); the ends land on their
     * targets exactly.
     *
     *     const snapped = spline.match({ end: other.start, endTangent: other.tangentAt(0) }) // G1 joint
     */
    match(options?: {
        start?: VectorLike | Vertex | null;
        end?: VectorLike | Vertex | null;
        startTangent?: VectorLike | null;
        endTangent?: VectorLike | null;
    }): Edge;
    /** The vertices at the edge's ends, start first (one for a closed edge). */
    vertices(): ShapeList<Vertex>;
    /** This edge, in a list. */
    edges(): ShapeList<Edge>;
    /** The faces of the body that meet at this edge (none for an edge of no body). */
    faces(): ShapeList<Face>;
    /**
     * This edge and the edges that continue it tangentially, through vertices where the next edge
     * runs on in the same direction (within 10 degrees) between faces that meet this edge's faces
     * smoothly, and so on along the run: all top edges of a plate with rounded corners, the outline
     * of a slot. This edge comes first. `fillet` and `chamfer` round the whole run of each selected
     * edge (their `propagate`). An edge of no part is its own chain.
     */
    tangentChain(): ShapeList<Edge>;
    /** The same edge traversed the other way. */
    reversed(): Edge;
    /**
     * This edge as a NURBS curve, from its start to its end: degree, knots, control points and
     * weights. Exact for lines, arcs (rational) and B-splines; other curves are approximated within
     * 1e-7.
     */
    nurbs(): Nurbs;
    /**
     * The edge of a NURBS curve given by its data: the inverse of `nurbs()`, for control points read
     * from a file or another program, curves edited by moving control points and B-splines of many
     * spans (a `Bezier` is one span).
     *
     * `nurbs`: a `Nurbs`, or `{ degree, knots, points, weights }`: the degree (1 to 32), the knot
     * vector with every knot as often as its multiplicity (`points.length + degree + 1` knots, not
     * decreasing; the ends need not repeat), the control points (2D points lie at z = 0) and a
     * positive weight per point, or `null` for a non-rational curve.
     *
     * The curve runs from `knots[degree]` to `knots[knots.length - degree - 1]`; where the ends do not
     * repeat `degree + 1` times, it starts and ends inside the control polygon.
     *
     *     const n = edge.nurbs()
     *     const points = [...n.points]
     *     points[2] = points[2].add([0, 0, 5]) // pull one control point up
     *     const bent = Edge.fromNurbs(new Nurbs(n.degree, n.knots, points, n.weights))
     */
    static fromNurbs(nurbs: Nurbs | {
        degree: number;
        knots: readonly number[];
        points: readonly VectorLike[];
        weights?: readonly number[] | null;
    }): Edge;
    /**
     * The same curve with the knots it does not need taken out: a B-spline with fewer control points
     * (the kernel's knot removal, which keeps the curve within about 1e-6 of where it was). Lines,
     * arcs and other analytic curves come back as they are.
     */
    removeKnots(): Edge;
    /** A wire of this edge and the other (Python's `+`). */
    add(other: Edge | Wire): Wire;
    equals(other: unknown): boolean;
    toString(): string;
}
/** A chain of edges, open or closed. `new Wire([edge, edge, ...])` orders and orients the edges. */
export declare class Wire extends Shape {
    constructor(edges: Edge | Wire | Iterable<Edge | Wire | Iterable<Edge | Wire>>, options?: {
        sort?: boolean;
    });
    /** Frees the kernel's curves of the wire's standalone edges now (see `Edge.dispose`); the edges
     * cannot be used afterwards, here or elsewhere. */
    dispose(): void;
    [Symbol.dispose](): void;
    /** The wire's edges, in order. */
    edges(): ShapeList<Edge>;
    /** The vertices of the wire's edges, each once. */
    vertices(): ShapeList<Vertex>;
    /** This wire, in a list. */
    wires(): ShapeList<Wire>;
    /** True if the wire ends where it starts. */
    get isClosed(): boolean;
    /** The point where the wire's first edge starts. */
    get start(): Vector;
    /** The point where the wire's last edge ends. */
    get end(): Vector;
    /** The sum of the edges' lengths. */
    get length(): number;
    /** Length-weighted average of the edge midpoints. */
    center(): Vector;
    /** The box along the axes around the wire. */
    bbox(): BoundBox;
    /** Point at fraction `t` of the total length. */
    pointAt(t?: number): Vector;
    /** The direction of the wire (length 1) at `t`, a fraction of its length from its start. */
    tangentAt(t?: number): Vector;
    /** Distance to a point, or to a body (see `Part.distanceTo`). */
    distanceTo(point: VectorLike | Shape): number;
    /** The wire cut in two at `at`, a fraction of its length or a point on it: the part before and the
     * part after. At a vertex the edges stay as they are; elsewhere the edge there is split
     * (`Edge.split`). */
    split(at: number | VectorLike | Vertex): [
        Wire,
        Wire
    ];
    /** The part of the wire from `start` to `end`, each a fraction of its length or a point on it;
     * `start` must come before `end` along the wire. */
    trim(start: number | VectorLike | Vertex, end: number | VectorLike | Vertex): Wire;
    /** Points where this wire meets `other` (see `Edge.intersections`), in order along the wire; a
     * point where two of its edges meet counts once. */
    intersections(other: Shape | Iterable<Shape>, options?: {
        tolerance?: number | null;
    }): Vector[];
    /**
     * The wire as one edge: its curves joined into one B-spline curve (a wire of one edge gives that
     * edge). The edges must meet end to end (within 1e-6); where they meet at a corner, the edge has a
     * corner there too.
     *
     * One edge makes a single sweep or loft rail, a single SPLINE in DXF and a single curve for
     * `makeCompatible`.
     *
     *     const rail = FilletPolyline([0, 0], [30, 0], [30, 20], { radius: 5 }).toEdge()
     */
    toEdge(): Edge;
    /**
     * The wire moved `distance` sideways in its plane, as a parallel curve: an open wire to its left
     * for a positive distance (seen from the side the plane's normal points to), to its right for a
     * negative one; a closed wire outward for a positive distance, inward for a negative one (as
     * `Sketch.offset` grows and shrinks).
     *
     * Lines stay lines and arcs stay arcs, exactly; splines and ellipses are offset within 1e-6 of the
     * wire's size (`Edge.offset`). `corners` shapes the corners the offset pulls apart: 'round' (arcs
     * of radius |distance|), 'sharp' (the sides extended until they meet) or 'chamfer' (a straight cut
     * across); at the corners it pushes together, the sides are cut where they cross. Where the offset
     * would fold over or run into itself (an edge bends more tightly than the distance, an edge
     * vanishes, parts of the wire lie closer than the distance), a ModelingError says where; a region's
     * offset that merges and drops parts is `Sketch.offset`.
     *
     * `plane`: the plane the wire lies in, whose normal tells left from right (see `Edge.offset` for
     * the default).
     *
     *     const wall = Polyline([0, 0], [40, 0], [40, 30]).offset(2, { corners: 'sharp' })
     */
    offset(distance: number, options?: {
        corners?: 'round' | 'sharp' | 'chamfer';
        plane?: Plane | null;
    }): Wire;
    /** The wire as lines and circular arcs within `tolerance` (see `Edge.toArcs`). */
    toArcs(tolerance?: number): Wire;
    /** The smallest radius of curvature of the wire's edges. The corners where edges meet do not count
     * (a corner has no radius; see `fillet`). Where it is: `minRadiusAt`. */
    minRadius(): number;
    /** Where the wire bends most tightly (`minRadius`): a fraction of its length, as `pointAt` takes it. */
    minRadiusAt(): number;
    /** The point of the wire nearest to `point`. */
    closestPoint(point: VectorLike): Vector;
    /**
     * How the edges of the wire meet at its joints (and where a closed wire closes) (`Continuity`):
     * "G2" where their curvature vectors agree as well, "G1" where they meet tangentially (within
     * `angleTolerance` degrees), "G0" at a corner, `null` where an edge does not start where the one before
     * ends (within 1e-6). `curvatureTolerance` is relative to the larger curvature (and at least
     * `1e-3 / length`). RangeError for a wire of one open edge, which has no joint.
     */
    continuity(options?: {
        angleTolerance?: number;
        curvatureTolerance?: number;
    }): Continuity;
    /** This wire closed with a straight line from its end to its start. */
    close(): Wire;
    /** The wire run the other way: its edges reversed, in reverse order. */
    reversed(): Wire;
    /** A wire of this one and the other (Python's `+`). */
    add(other: Edge | Wire): Wire;
    /** The plane of a planar wire (normal by the right-hand rule along the wire). */
    plane(): Plane;
    /**
     * Round corners with tangent arcs of `radius`: every sharp corner, or those at `vertices` (points
     * or vertices). A planar wire's corners are rounded in its plane, as `Sketch.fillet` does: between
     * lines and arcs exactly, next to splines and ellipses with the arc whose center lies at `radius`
     * from both curves (the curves are cut where it touches them). A wire that is not planar has its
     * corners between lines rounded. A corner a wire that is not planar has next to another curve, a
     * smooth corner that is named and a point that is not a corner throw a ModelingError; a radius that
     * does not fit throws a RangeError. Open wires keep their ends.
     */
    fillet(radius: number, vertices?: VectorLike | Vertex | Iterable<VectorLike | Vertex> | null): Wire;
    /** The planar region bounded by this closed wire. */
    toSketch(): Sketch;
    toString(): string;
}
/** A bounded piece of a surface, belonging to a body (a part, shell or sketch). */
export declare class Face extends Shape {
    constructor(owner: _Body | null, kface: number);
    /** The body this face belongs to. */
    get owner(): Part | Shell | null;
    /**
     * The face's own color as [r, g, b] from 0 to 1, or null: then it shows in its body's color.
     *
     * Faces get one with `body.colored(color, { faces })` and from STEP files that color single faces.
     * It stays with the face through later operations (kernel plan T5): with both pieces of a face a
     * Boolean splits, with the walls of a hole cut by a tool whose faces have one, with a face moved,
     * mirrored or scaled, with the offsets of a face in a shell; faces an operation makes anew (a
     * fillet's round, the rim around a shell's opening) have none.
     */
    get color(): [
        number,
        number,
        number
    ] | null;
    /** The face's name (`body.named(name, { faces })`, or from the `ADVANCED_FACE` of a STEP file), or
     * null. It stays with the face as `color` does. */
    get name(): string | null;
    /** The cells of its part that this face bounds, as indices into `Part.cells()`: one for a face on
     * the outside or on the wall of a cavity, two for a face between two cells of a merged part (see
     * `ShapeList.shared`), `[]` for a face of a sheet or a sketch. */
    get cells(): number[];
    /** "plane", "cylinder", "cone", "sphere", "torus", "revolution", "extrusion", "bspline",
     * "offset" or "other". */
    get geomType(): string;
    /** The face's area. */
    get area(): number;
    /** Area centroid. For curved faces it may lie off the face; see `interiorPoint`. */
    center(): Vector;
    /** A point guaranteed to lie on the face. */
    interiorPoint(): Vector;
    /** Outward unit normal at the face point closest to `point` (default: the center). */
    normalAt(point?: VectorLike | null): Vector;
    /** True for planes and for flat B-spline faces (control points in one plane). */
    get isPlanar(): boolean;
    /** The face's plane: origin at its centroid, normal pointing out of the body. */
    get plane(): Plane;
    /** Radius of a cylinder, sphere or cone (at its base), minor radius of a torus. */
    get radius(): number;
    /** Major radius of a torus: from its axis to the middle of its tube (`radius` is the tube's). */
    get majorRadius(): number;
    /** Half the opening angle of a cone, in degrees: the angle between its axis and its side. */
    get coneAngle(): number;
    /** Axis of a cylinder, cone, sphere, torus or surface of revolution. */
    get axis(): Axis;
    /** The box along the axes around the face. */
    bbox(): BoundBox;
    /** Distance to a point, or to a body (see `Part.distanceTo`). */
    distanceTo(point: VectorLike | Shape): number;
    /** The point of the face nearest to `point` (within its boundary). */
    closestPoint(point: VectorLike): Vector;
    /**
     * The parameters `[u, v]` of the face's point nearest to `point`, as fractions (0 to 1) of the
     * face's parameter box: `face.positionAt(...face.uvAt(p))` is `face.closestPoint(p)`.
     */
    uvAt(point: VectorLike): [
        number,
        number
    ];
    /**
     * The point of the face's surface at `(u, v)`, fractions (0 to 1) of the face's parameter box. A
     * trimmed face (a plate with a hole, a face cut by another) does not cover its whole box: points
     * there lie on the surface beyond the face's boundary.
     */
    positionAt(u: number, v: number): Vector;
    /**
     * The curvature of the face at its point nearest to `point` (default: a point inside the face):
     * both principal curvatures, their directions and the outward normal (`Curvature`). Curvatures
     * are positive where the face bends away from its outward normal (a ball, a boss), negative where
     * it bends towards it (a bore): a cylinder of radius 5 has `k1 = 0.2, k2 = 0`, its bore
     * `k1 = 0, k2 = -0.2`.
     */
    curvatureAt(point?: VectorLike | null): Curvature;
    /**
     * The smallest radius of curvature on the face, `1 / max(|k1|, |k2|)`: `Infinity` for a plane, the
     * radius of a cylinder or sphere, the smaller of a torus' tube radius and its inner radius, at the
     * narrow end of a cone. Free-form faces are sampled on a 24 x 24 grid of their parameters and
     * refined from the sharpest points (singular points such as a pole are left out). Compare it with
     * a wall thickness or a cutter radius.
     */
    minRadius(): number;
    /**
     * The face's surface as a NURBS (`NurbsSurface`): degrees, knots, control points and weights.
     * Exact for every kind (planes, cylinders, cones, spheres, tori as rational surfaces). It is the
     * whole surface, untrimmed: the face may cover only part of it.
     */
    nurbs(): NurbsSurface;
    /** Where a ray meets this face, nearest first (see `Part.raycast`). */
    raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit<Face>[];
    /**
     * The curve projected onto this face along its normals: every point to the nearest point of the
     * face's surface, the result trimmed to the face (pieces where it leaves the face and comes back).
     * Within 1e-7 of the size of the face and the curve. For curves drawn near a freeform face; along
     * one direction, see `Part.project`.
     */
    project(curve: Edge | Wire): ShapeList<Edge>;
    /**
     * The curve of the face along which one of its surface parameters is constant: `u` or `v` as a
     * fraction (0 to 1) of the face's range of that parameter. Trimmed to the face: several pieces
     * where the face has holes or notches. For styling lines, inspection curves and rails on freeform
     * faces. Which parameter runs which way depends on the surface: on a cylinder's side `v` is
     * constant around it (`iso({ v: 0.5 })`: the circle half way up) and `u` along it. Exact: lines,
     * arcs or B-splines of the surface itself, ending exactly where the face's edges cross them. Give
     * one of `u` and `v`.
     */
    iso(options?: IsoOptions): ShapeList<Edge>;
    /**
     * A drawing on XY wrapped onto this face, as a label onto a can: its origin goes to `at` (a point
     * of the face; default its middle), its X axis along the face in `direction` (default: the face's
     * first parameter direction there; it follows the parameter line nearest to it), its Y axis
     * across, so that it reads from outside. Lengths stay along the two parameter lines through `at`:
     * on planes and cylinders the whole drawing keeps its size (text around a cylinder); on cones and
     * doubly curved faces it stretches away from those lines. Around a closed face (a cylinder) the
     * drawing continues across the seam; what leaves the face is cut off (also in its holes). Returns
     * the curves on the face, fitted within 1e-7 of its size; a curve across the seam comes back as one edge.
     *
     * `shape`: an edge, a wire, a sketch or edges, drawn on XY (z is ignored). `at`: where the
     * drawing's origin goes, a point of the face's surface (default: the middle of the face's
     * parameter range). Options: `direction`, where its X axis points (projected onto the face).
     *
     *     const label = can.faces().cylinders()[0].wrap(Text('SMLIB', 8), [0, -20, 0], { direction: [1, 0, 0] })
     */
    wrap(shape: Edge | Wire | Sketch | Iterable<Edge>, at?: VectorLike | Vertex | null, options?: {
        direction?: VectorLike | null;
    }): ShapeList<Edge>;
    /** The face's outer boundary. */
    outerWire(): Wire;
    /** The boundaries of the face's holes. */
    innerWires(): ShapeList<Wire>;
    /** The face's boundaries: the outer one first, then those of its holes. */
    wires(): ShapeList<Wire>;
    /** The face's edges (seam edges only with `seams`). */
    edges(options?: {
        seams?: boolean;
    }): ShapeList<Edge>;
    /** The face's vertices. */
    vertices(): ShapeList<Vertex>;
    /** This face, in a list. */
    faces(): ShapeList<Face>;
    /** Faces sharing an edge with this one. */
    neighbors(): ShapeList<Face>;
    /** A sketch holding a copy of this (planar) face. */
    toSketch(): Sketch;
    /** A sheet body holding a copy of this face. */
    toShell(): Shell;
    /** A sheet of this face moved by `distance` along its normal (`normalAt`: out of the part it bounds;
     * a negative distance moves it in): the offset surface, trimmed as the face is (see `Shell.offset`). */
    offset(distance: number): Shell;
    /**
     * The pieces of this face cut along curves that lie on it, as the faces of a new sheet.
     *
     * @param curves Edges or wires on the face (see `Shell.trim`): each runs from border to border,
     *   or closes a loop.
     *
     * The face's own body does not change: to split the faces of a part where they are, use
     * `Part.imprint`; of a sheet, `Shell.trim` with `keep` `'split'`.
     */
    split(curves: Edge | Wire | Iterable<Edge | Wire>): ShapeList<Face>;
    /** A copy of this face, turned over: a sheet of one face whose normal points the other way (see
     * `Shell.flipped`). */
    flipped(): Shell;
    /**
     * The whole surface this face lies on, as a sheet of one face: its holes and cut borders are gone.
     *
     * A cylindrical face cut out of a box comes back as the whole cylinder the cut left it on (its
     * full height and all around), a B-spline face as its whole surface. A plane has no border of its
     * own: it comes back as the smallest rectangle around the face, along the plane's own directions.
     * The sheet's normal follows this face's (`normalAt`).
     */
    untrimmed(): Shell;
    /**
     * The face's surface grown past its sides, as a sheet of one face: to make a sheet reach across a
     * part before cutting or splitting it with it, or to give a blend room.
     *
     * @param distance How far past each side, measured along the surface (across the middle of the
     *   side).
     * @param options `sides`: edges of this face: grow past the sides they lie on only (default: past
     *   every side that can grow). `continuity`: how the surface goes on: `'natural'` (default) as it
     *   is (a plane stays the plane, a cylinder or sphere the same cylinder or sphere, a B-spline
     *   surface follows its own polynomials), `'G1'` straight on along its tangents, `'G2'` bending on
     *   with the curvature it has at the side.
     *
     * The sides are those of the face's surface rectangle, along its parameter directions: the four
     * edges of a box's face or of a sheet from `surface`, the two ends of a cylinder along its axis.
     * Trims (holes, a border cut at a slant) are dropped: the result is the rectangle, grown. A side
     * where the surface closes around (a full cylinder, around it) or shrinks to a point (a sphere's
     * pole, a cone's tip) cannot grow: it is left out by default, and naming its edge throws a
     * RangeError; so does an edge that does not run along a side.
     *
     * @returns A sheet of one face, its normal following this face's (`normalAt`).
     */
    extend(distance: number, options?: {
        sides?: Edge | Iterable<Edge> | null;
        continuity?: 'natural' | 'G1' | 'G2';
    }): Shell;
    /** Extrude a planar face along its normal (see `Sketch.extrude`). */
    extrude(amount: number, options?: ExtrudeOptions): Part;
    equals(other: unknown): boolean;
    toString(): string;
}
/** A shape backed by one kernel Brep: a Part, a Shell or a Sketch. */
export declare class _Body extends Shape {
    /** The body's name (`named`), or null. */
    name: string | null;
    /** The body's color (`colored`), or null. */
    color: ColorLike | null;
    /** (create bodies with the constructors: Box(), Rectangle(), ...) */
    constructor(token?: symbol);
    /** Frees the kernel's body now, not when the garbage collector gets to it. Faces, edges and
     * vertices taken from it must not be used afterwards. A body that shares its Brep with others
     * (`named()`, `colored()`) lets go of it, and the last of them frees it. */
    dispose(): void;
    [Symbol.dispose](): void;
    /**
     * The same body with a name (used by exporters and the viewer).
     *
     * With `faces` (faces of this body, or of an earlier version of it: as `Part.fillet` takes edges),
     * the body keeps its own name and those faces get this one (`Face.name`, null takes it off): it
     * stays with the faces and their pieces through later operations, and STEP files write it on the
     * face. `part.faces().filter((f) => f.name === 'seal')` finds them again.
     */
    named(name: string | null, options?: {
        faces?: FacesLike | null;
    }): this;
    /**
     * The same body with a display color ("steelblue", "#4682b4" or [r, g, b]).
     *
     * With `faces` (faces of this body, or of an earlier version of it), the body keeps its own color
     * and those faces get this one (`Face.color`; null takes it off): it stays with the faces through
     * later operations (the walls of a hole keep the color of the tool's faces), and STEP, glTF and USD
     * files and pictures show it on them:
     *
     *     const tool = Cylinder(5, 20)
     *     let plate = Box(60, 40, 8).cut(tool.colored('red', { faces: tool.faces() }))
     *     plate = plate.colored('steelblue', { faces: plate.faces().top() })
     */
    colored(color: ColorLike | null, options?: {
        faces?: FacesLike | null;
    }): this;
    /** The body's faces. */
    faces(): ShapeList<Face>;
    /** All edges. Seam edges (where a closed surface such as a cylinder meets itself) are left out
     * unless `seams` is true. */
    edges(options?: {
        seams?: boolean;
    }): ShapeList<Edge>;
    /** The body's vertices. */
    vertices(): ShapeList<Vertex>;
    /** The boundaries of all the body's faces. */
    wires(): ShapeList<Wire>;
    /** The box along the axes around the body. */
    bbox(): BoundBox;
    /** Center of mass (centroid) of the shape. */
    center(): Vector;
    /**
     * Minimum distance to a point, another body, a face, an edge or a wire.
     *
     * For a point inside a part, and for a body nested in another, it is the distance to the
     * surface (the wall clearance). Bodies that touch or overlap are 0 apart, and so are a body and
     * a curve that touches or crosses its surface.
     */
    distanceTo(other: VectorLike | Shape): number;
    /**
     * The nearest points of this body and another body, a face, an edge or a wire (`ClosestPoints`):
     * the point on this body, the point on the other, their distance and the faces they lie on. The
     * points are exact surface points (and curve points), as for `distanceTo`; where the shapes touch
     * or overlap, the distance is 0 and the points are one place where they meet.
     */
    closestPoints(other: Part | Shell | Face | Edge | Wire): ClosestPoints;
    /** The point of the body's surface nearest to a point (also from inside a part). */
    closestPoint(point: VectorLike): Vector;
    /**
     * Where a ray meets this body's faces, nearest first: the exact points (`Hit`: point, distance
     * from the start, the face, its outward normal there).
     *
     * The ray starts at `origin` and runs along `direction` (an axis or a vector); an axis alone is a
     * ray from its origin along its direction. Points behind the start are not hits. A ray through an
     * edge or a vertex hits once, a ray along a face where it enters the face. `hits[0]` is what the
     * ray sees first; `hits.length` is odd from inside a closed part, except where the ray grazes a
     * face (to test a point, use `Part.contains`).
     */
    raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit<Face>[];
    /**
     * The first hit of each of many rays, one per ray (a `Hit` or `null`), not `raycast` many times
     * (which gives every hit of a ray): for each origin, the `Hit` that `raycast` gives first (the
     * exact point on the face, the distance, the face, its outward normal), `null` where the ray
     * misses.
     *
     * `origins` are points; `directions` one direction (a vector or an axis) for all of them, or one
     * each. The rays are traced through a mesh of the body (made once per body, at 1e-4 of its size)
     * by the kernel's ray tracer, and each hit is moved onto the exact face the mesh says the ray
     * meets first; where that face is missed there, the ray is cast exactly (`raycast`), and so is a
     * ray that passes within twice the mesh's tolerance (1e-4 of its size) of a triangle it does not
     * meet (it can graze a curved face the mesh lies inside of). Give all the rays in one call: the
     * tracer is built once per call (0.2 s for a mesh of 20 000 triangles), then a ray takes 0.02 to
     * 0.05 ms.
     */
    raycastMany(origins: Iterable<VectorLike>, directions: VectorLike | Axis | Iterable<VectorLike | Axis>): (Hit<Face> | null)[];
    /**
     * Free what the kernel keeps from earlier queries of this body: the caches that `bbox()`,
     * `distanceTo()`, `closestPoint()`, `raycast()` and `mesh()` leave on its curves, its surfaces
     * and the body itself (evaluation grids, trimmed-surface data, spatial trees). The body does not
     * change, nor do its faces and edges; a later query builds what it needs again.
     *
     * The kernel keeps these caches as long as the body lives, and they can outweigh the body: on a
     * holed, filleted box of about 150 KB, `bbox()` left 42 KB, `mesh()` 770 KB and `distanceTo()` 820 KB
     * (smlibpy, natively). A query that finds them is about 1.2 times as fast (11 times for
     * `closestPoint()` after `distanceTo()`); Booleans gain nothing from them. Compact bodies that
     * are kept but no longer queried, such as the copies of a large pattern after they were
     * measured or exported: the module's memory (4 GB at most) is shared by all of them.
     */
    compact(): void;
    /**
     * The curves where this body's surface meets another body's surface, each one once.
     *
     * `other` is a Part, Shell or Sketch, a face (the face itself, bounded by its edges), or a `Plane`
     * (unbounded: where it cuts this body's faces, as `Part.section` cuts a part). Bodies that do not
     * meet, apart or one inside the other, give an empty list.
     */
    intersectionCurves(other: Part | Shell | Face | Plane): ShapeList<Edge>;
    /**
     * The contour of the body seen along `direction` (an axis or a vector, from the body towards the
     * viewer): the curves on its faces where the surface turns away from the viewer (`n . d = 0`), and
     * the edges between faces that face the viewer and faces that face away. All of them, seen or
     * not, as standalone 3D edges; arcs of one circle come joined (a sphere's rim is one circle).
     * Faces seen edge-on go with the faces behind them, so their near edges are the contour (a box
     * seen from +Z: its 4 top edges). A sheet's free edges are not part of it. The curves are exact for spheres, cylinders and tori around the direction, traced
     * (within 1e-6 of the body's size) otherwise.
     */
    silhouette(direction?: Axis | VectorLike): ShapeList<Edge>;
    /** Project a curve onto the body along `direction` (an axis or a vector); returns the curves on
     * its faces. */
    /**
     * Project a curve onto the body along `direction` (an axis or a vector); returns the curves on its
     * faces, fitted within 1e-7 of the size of the body and the curve.
     *
     * Every face the projection meets gets its pieces: the near side and the far side of the body, and
     * faces seen edge-on (pieces along the direction). `nearest: true` keeps what the projection
     * reaches first: the parts seen from the curve along the direction, cut where another part of the
     * body hides them.
     */
    project(curve: Edge | Wire, direction?: Axis | VectorLike, options?: {
        nearest?: boolean;
    }): ShapeList<Edge>;
    /**
     * The body's edges and contours projected onto a plane (a 2D drawing view), seen from the side the
     * plane's normal points to: the visible lines.
     *
     * With `hidden: true`, `[visible, hidden]`: the lines behind the body too, for dashed hidden
     * lines. With `tangentEdges: true` the edges between faces that meet tangentially (the tangent
     * lines of fillets) are drawn too. Either way each line comes once: hidden pieces under visible
     * lines are cut away, seams of closed faces and edges seen end-on are left out. See also
     * `drawingViews`.
     */
    outline(plane?: Plane, options?: {
        hidden?: false;
        tangentEdges?: boolean;
    }): ShapeList<Edge>;
    outline(plane: Plane | undefined, options: {
        hidden: true;
        tangentEdges?: boolean;
    }): [
        ShapeList<Edge>,
        ShapeList<Edge>
    ];
    outline(plane?: Plane, options?: {
        hidden?: boolean;
        tangentEdges?: boolean;
    }): ShapeList<Edge> | [
        ShapeList<Edge>,
        ShapeList<Edge>
    ];
    /** A copy whose faces and edges are all NURBS (analytic types converted). */
    toNurbs(): this;
    /** Repair gaps, tolerances and topology (mostly needed for imported data). A sheet whose faces
     * close around a volume once healed comes back as a `Part`. */
    heal(): this | Part;
    /**
     * What the kernel's own validity checks find wrong with the body: per failed test a `Problem`
     * with the face, edge or vertex it is about (or the body), a message, and the value and tolerance
     * it measured. An empty list: nothing found.
     *
     * `level` 0 checks the structure (how faces, loops, edges and vertices connect, the pointers
     * between them); 1 also the geometry; 2 (the default) everything, the slow tests too, among them
     * the gaps between vertices and faces against their tolerances. That takes about 0.1 s on a plate
     * with 24 holes and on an imported part of 170 faces (smlibpy, natively).
     *
     * The tests look at each face, edge and vertex and its neighbours (SmBrep::AssertValid): they do
     * not see a body that runs through itself. Use them where `isValid` cannot tell what is wrong:
     * after importing, stitching or healing, or where an operation on a part fails that `isValid()`
     * accepts.
     */
    check(level?: number): Problem[];
    equals(other: unknown): boolean;
    /** Counts and measures in one object. A body made by `shell` or `offset` also says how the corners
     * of its new walls came out: `corners` is `'round'` or `'sharp'`. */
    info(): {
        type: string;
        faces: number;
        edges: number;
        vertices: number;
        bbox: [
            number[],
            number[]
        ];
        corners?: string;
    };
}
/**
 * Something the kernel's validity checks find wrong with a body (see `check`): the face, edge or
 * vertex it is about, or the body itself (`shape`); what is wrong, with the value measured and the
 * tolerance where there are (`message`); the value measured (a gap, a distance, an angle) and the
 * tolerance it was held against (`value`, `tolerance`, or null); the kind of test (`category`:
 * "gap", "geometric", "topological", "values", "degenerate", ...: the kernel's SmAssertType) and
 * its short name (`test`: "Bad Gap", "Bad Loop Connection Vertex"); a second face, edge or vertex
 * the test compared with (`other`, or null).
 */
export declare class Problem {
    /** The face, edge or vertex the problem is about, or the body itself. */
    readonly shape: Face | Edge | Vertex | Part | Shell;
    /** What is wrong, with the value measured and the tolerance where there are. */
    readonly message: string;
    /** The value measured (a gap, a distance, an angle), or `null`. */
    readonly value: number | null;
    /** The tolerance it was held against, or `null`. */
    readonly tolerance: number | null;
    /** The kind of test: `"gap"`, `"geometric"`, `"topological"`, `"values"`, `"degenerate"`, ... (the kernel's
     * SmAssertType). */
    readonly category: string;
    /** The test's short name (`"Bad Gap"`, `"Bad Loop Connection Vertex"`). */
    readonly test: string;
    /** A second face, edge or vertex the test compared with, or `null`. */
    readonly other: Face | Edge | Vertex | Part | Shell | null;
    constructor(shape: Face | Edge | Vertex | Part | Shell, message: string, value?: number | null, tolerance?: number | null, category?: string, test?: string, other?: Face | Edge | Vertex | Part | Shell | null);
    toString(): string;
    [inspect](): string;
}
export declare class MassProperties {
    /** The mass: the volume times the density. */
    readonly mass: number;
    /** The volume (mm³). */
    readonly volume: number;
    /** The surface area (mm²). */
    readonly area: number;
    /** The center of mass. */
    readonly center: Vector;
    /** The inertia tensor about the center of mass, axes parallel to the world axes (3 × 3). */
    readonly inertia: number[][];
    /** The density the mass was computed with. */
    readonly density: number;
    constructor(mass: number, volume: number, area: number, center: Vector, inertia: number[][], density: number);
    /** The principal moments of inertia, smallest first. */
    get principalMoments(): [
        number,
        number,
        number
    ];
    /** The principal axes of inertia (directions), in the order of `principalMoments`. */
    get principalAxes(): [
        Vector,
        Vector,
        Vector
    ];
    /**
     * The radius of gyration about each principal axis, `sqrt(moment / mass)`, in the order of
     * `principalMoments`: the distance from the axis at which the whole mass would have the same
     * moment of inertia.
     */
    get radiiOfGyration(): [
        number,
        number,
        number
    ];
    /**
     * The inertia tensor about `point` (axes parallel to the world axes): `inertia` moved by the
     * parallel-axis theorem, `inertia + mass * (d.d * I - d d^T)` with `d` from the center of mass to
     * the point.
     */
    inertiaAbout(point: VectorLike): number[][];
    /**
     * The moment of inertia about an axis (for example a shaft's axis or a pivot): `n^T I n` with the
     * inertia tensor about a point of the axis and its unit direction `n`.
     */
    momentAbout(axis: Axis): number;
    toString(): string;
    [inspect](): string;
}
/**
 * Section properties of a planar region (see `Sketch.sectionProperties`): the area and the second
 * moments of area of a profile, for beams, frames and extrusions.
 *
 * The moments are about the centroid, in the axes of `plane` (the sketch plane moved to the
 * centroid): `ixx = ∫ y² dA` about its x axis, `iyy = ∫ x² dA` about its y axis and the product
 * `ixy = ∫ x y dA`, in mm⁴.
 */
export declare class SectionProperties {
    /** The region's area (mm²). */
    readonly area: number;
    /** The centroid of the region. */
    readonly centroid: Vector;
    /** The sketch plane moved to the centroid: the axes of the moments. */
    readonly plane: Plane;
    /** The second moment of area about the plane's x axis, ∫ y² dA (mm⁴). */
    readonly ixx: number;
    /** The second moment of area about the plane's y axis, ∫ x² dA (mm⁴). */
    readonly iyy: number;
    /** The product of area, ∫ x y dA (mm⁴). */
    readonly ixy: number;
    constructor(area: number, plane: Plane, ixx: number, iyy: number, ixy: number, extent: [
        number,
        number,
        number,
        number
    ]);
    /** The polar moment about the centroid, `ixx + iyy` (the torsion constant only of a circle or a ring). */
    get polar(): number;
    /** The second moments about the principal axes through the centroid, ascending. */
    get principalMoments(): [
        number,
        number
    ];
    /** Unit directions (in world coordinates, in the plane) of the principal axes, in the order of `principalMoments`. */
    get principalAxes(): [
        Vector,
        Vector
    ];
    /** `[sqrt(ixx / area), sqrt(iyy / area)]`. */
    get radiiOfGyration(): [
        number,
        number
    ];
    /**
     * The elastic section moduli `[ixx / c_y, iyy / c_x]`, with `c` the distance from the centroid to
     * the farthest fiber of the region across each axis (the smaller modulus of a section that is
     * not symmetric).
     */
    get sectionModuli(): [
        number,
        number
    ];
    toString(): string;
    [inspect](): string;
}
/** A fillet radius: one for all edges, one per edge, or `{ start, end }` varying linearly along
 * each edge (Python's `(start, end)` tuple). */
export type FilletRadius = number | readonly number[] | {
    start: number;
    end: number;
} | ReadonlyMap<number, number>;
/** How a fillet's cross-section is shaped. */
export interface FilletOptions {
    /** null for a circular fillet. "G2" or "G3" make a curvature-continuous blend ("G1" a
     * tangent blend) instead of a circular arc: no visible highlight seam, as used for consumer
     * and Class-A surfaces. */
    continuity?: number | string | null;
    /** Shape of a blend cross-section; above 1 fuller, below 1 flatter. */
    fullness?: number;
    /** Round the edges that continue the selected ones tangentially too (`Edge.tangentChain`): one
     * top edge of a plate with rounded corners rounds the whole outline. An added edge takes the
     * radius of the selected edge it continues. `false` rounds the selected edges only; where the
     * kernel then fails, the error names a selected edge that runs on tangentially into one that is
     * not selected (the kernel cannot always round such an edge alone). Default true. */
    propagate?: boolean;
    /** Where three rounded edges meet: "patch" (the default) joins their rounds with a corner patch (a
     * ball corner where the radii are equal); "mitre" runs the rounds on until they meet each other,
     * along mitre lines without a patch (the look of a machined part). Mitred are the corners where
     * three rounded convex edges meet and no other edge; a selection without such a corner throws a
     * RangeError. */
    corners?: 'patch' | 'mitre' | 'miter';
    /** Set the corners back: the rounds stop `setback` from the corner along each of its edges, and one
     * larger patch joins them there (a softer corner than the ball corner, as on molded and consumer
     * parts). Set back are the corners where three or more rounded edges meet and no other edge (every
     * edge at the vertex rounded), all convex (the outside corners of a box) or all concave (the floor
     * corners of a pocket); the others get their usual patch, and a selection without such a corner
     * throws a RangeError. `setback` must exceed how far the rounds reach along the corner's edges (the
     * radius, at a right-angled corner) and stay below the length of each rounded edge at such a corner
     * (half of it where both ends are set back). Constant radii only (also one per edge, and blends),
     * not with `corners: "mitre"`. Corners between slanted faces (the top corners of a frustum) the
     * kernel cannot always set back: KernelError. */
    setback?: number | null;
}
/** Which edges a chamfer bevels. */
export interface ChamferOptions {
    /** An asymmetric bevel: the setback on the other face of each edge (`length` is the one on its
     * `reference` face). */
    length2?: number | null;
    /** An asymmetric bevel: the angle (degrees) between the bevel and the `reference` face of each edge
     * (`length2` follows from it: `length * tan(angle)` where the faces meet at 90 degrees). */
    angle?: number | null;
    /** A face of the part (or several) that each edge lies on: `length` is measured on it. `length2` and
     * `angle` need it. */
    reference?: unknown;
    /** Bevel the edges that continue the selected ones tangentially too (`Edge.tangentChain`), as
     * `fillet` does; `false` bevels the selected edges only. The edges a run adds must lie on a
     * reference face too. Default true. */
    propagate?: boolean;
    /** The corners where three bevelled edges meet, as for `fillet`: "patch" (the default) cuts them off
     * with a corner face, "mitre" runs the bevels on until they meet (the corners of three bevelled
     * convex edges and no other edge). */
    corners?: 'patch' | 'mitre' | 'miter';
}
/**
 * A solid: one or more closed volumes.
 *
 * Combine parts with `fuse` (union), `cut` (difference) and `intersect` (intersection). Each
 * takes parts or any iterables of parts.
 */
export declare class Part extends _Body {
    /** The part's volume (mm³). */
    get volume(): number;
    /** Total surface area. */
    get area(): number;
    /** Center of mass (uniform density). */
    center(): Vector;
    /**
     * Mass, center of mass and inertia tensor for a uniform `density`.
     *
     * `accuracy` is the relative accuracy of the results (default `ACCURACY`, 1e-7; from 1e-10 to
     * 1e-2): volume, mass and area to `accuracy` of their value, the center to `accuracy` times the
     * size of the part (its bounding box diagonal), the inertia to `accuracy` times its largest
     * principal moment.
     */
    massProperties(density?: number, accuracy?: number | null): MassProperties;
    /**
     * True if the part is a closed, manifold solid that encloses a positive volume and whose faces
     * meet.
     *
     * (A body whose faces point inward, or that encloses no volume, such as a profile revolved
     * about an axis through it, is not valid; nor is one whose faces leave gaps that make its volume
     * uncertain by 1e-2 of its value or more.)
     *
     * With `strict`, the kernel's own checks of each face, edge and vertex (`check`, all of them)
     * must find nothing too: an imported, stitched or healed body can be closed and enclose its
     * volume while its edges and vertices lie farther from its faces than their tolerances allow. (Of
     * 1471 Boolean results of a random test campaign that `isValid()` accepts, 34 fail the strict
     * test.)
     */
    isValid(options?: {
        strict?: boolean;
    }): boolean;
    /** The separate bodies of this part: those that share no face, a body inside a cavity of another
     * (a captive part) too. Cells of a merged part that touch stay one solid (see `merge`); a body
     * keeps its cavities. */
    solids(): ShapeList<Part>;
    /**
     * The closed sheets that bound the part, each a `Shell` of copies of its faces (joined along
     * their edges): first the outside of each solid, then the wall of each cavity (and the outside of
     * a body that floats in one). For a part with a cavity, `shells()[1]` is the cavity's wall: the
     * faces to check the wall thickness on or to put a boundary condition on, which
     * `part.faces().derivedFrom(part.shells()[1])` selects on the part itself. Faces between two
     * cells of a merged part bound no space around it and lie in no shell (see `ShapeList.shared`).
     */
    shells(): ShapeList<Shell>;
    /** The cavities of the part (closed spaces inside it, kernel plan T7), each a part of its own: the
     * space inside a cavity's wall, less a body that floats in it. With them the part fills its
     * outside: `part.volume` plus their volumes. Empty for a part without cavities. `info()` counts
     * them. */
    voids(): ShapeList<Part>;
    /** Counts and measures in one object: as for every body, and `solids` (how many `solids()`) and
     * `voids` (how many cavities, `voids()`). */
    info(): {
        type: string;
        faces: number;
        edges: number;
        vertices: number;
        bbox: [
            number[],
            number[]
        ];
        corners?: string;
        solids: number;
        voids: number;
    };
    /**
     * This part and others as one part made of cells. Where parts overlap, the overlap becomes a
     * cell of its own; cells that touch share the faces between them (each such face bounds two
     * cells: the body is non-manifold). For simulation meshes that must match across materials, and
     * for models of several materials.
     *
     * `cells()` gives the cells as parts of their own, each named and colored after the parts it lies
     * in (`cell.sources`); `volume` is the volume of the union. A merged part is not a manifold solid:
     * `isValid()` is false, and Booleans, fillets and shells take its cells rather than the part
     * itself. `exportStep` writes each cell as a solid of its own, with its name and color.
     *
     * A result whose volume is less than that of the largest part, or more than that of all parts
     * together, is wrong: `ModelingError`.
     */
    merge(...others: (Part | Iterable<Part>)[]): Part;
    /** For a cell of a merged part (see `cells`): the parts given to `merge` whose material it lies in,
     * in the order they were given (a cell where two parts overlap lies in both; a part that was itself
     * merged stands for the parts it was merged from). They are the parts as given, not moved along
     * with the merged part. Empty for other parts. */
    get sources(): Part[];
    /**
     * The cells of a part made by `merge`, each as a part of its own (every closed region of the
     * body; a cavity is not a cell). A part that is one solid: `[itself]`.
     *
     * Each cell is named and colored after the parts given to merge that it lies in (its `sources`):
     * the names joined by `&` ("steel&brass" where a steel and a brass part overlap), the color of the
     * last of them that has one; the merged part's own name and color where none of them has one. The
     * kernel keeps no record of the parts: smlibwasm classifies a point inside each cell against them.
     *
     * The kernel's stitcher runs in the probe worker (see GUARD_SECONDS): a crash there throws a
     * KernelError, and this process goes on.
     */
    cells(): ShapeList<Part>;
    /**
     * Where a point lies: `['inside', null]` in the material, `['outside', null]` (also in a cavity),
     * or `['on', shape]` on the surface within `tolerance` (default: the part's own tolerance, 1e-5 for most
     * parts), with the vertex, edge or face it lies on (the vertex rather than its edges, an edge
     * rather than its faces).
     *
     * The kernel classifies the point exactly (SmBrep::Point3DClassify), also where a ray from it
     * would graze a face or pass through an edge, which the parity of `raycast` hits gets wrong.
     */
    classify(point: VectorLike, tolerance?: number | null): [
        string,
        Face | Edge | Vertex | null
    ];
    /** True if the point lies in the material of this part or on its surface (within `tolerance`, see
     * `classify`); false outside and in a cavity. */
    contains(point: VectorLike, tolerance?: number | null): boolean;
    /** The cell of a merged part (see `merge`) that holds the point, as in `cells`; null outside, in a
     * cavity and on a face (also one between two cells). For a part that is one solid: the part
     * itself or null. */
    cellAt(point: VectorLike, tolerance?: number | null): Part | null;
    /** Union with other parts (Python's `+`). */
    fuse(...others: (Part | Iterable<Part>)[]): Part;
    /** Subtract other parts (Python's `-`). */
    cut(...others: (Part | Iterable<Part>)[]): Part;
    /** Keep only the volume shared with the other parts (Python's `&`). With one sheet (a Shell or
     * a face) instead: the piece of the sheet inside the part, as a Shell (`sheet.intersect(part)`). */
    intersect(sheet: Shell | Face): Shell;
    intersect(...others: (Part | Iterable<Part>)[]): Part;
    /**
     * Round edges.
     *
     * @param edges Edges of this part (a selection, a single edge, or faces whose edges to round).
     * @param radius Fillet radius. `{ start, end }` varies the radius linearly along each run of
     *   selected edges that meet tangentially (a single edge, or a chain such as the outline of a
     *   rounded plate, with `propagate`: `Edge.tangentChain`), in proportion to the length along it. A
     *   run goes the way of its first selected edge (from that edge's start to its end) and starts at
     *   the end of the run that way starts from; a closed run cannot take different `start` and `end`
     *   radii. A `Map` of positions to radii sets the radius at positions along each run (0 its start,
     *   1 its end; a missing 0 or 1 takes the nearest radius given) and joins them smoothly, without
     *   overshooting them (flat at the ends and at each largest and smallest radius); around a closed
     *   run its radius at 1 must be the one at 0, and it can vary around a single closed edge only (a
     *   rim), not around a closed run of several edges. A varying radius makes circular rounds only.
     *   An array with one radius per edge rounds edges differently.
     *
     * Where three rounds meet, the corner patch is tangent continuous (G1) only, also with
     * `continuity: "G2"` or `"G3"`: zebra stripes kink there (the kernel's corner patches are G1
     * whatever the continuity of the rounds).
     *
     * A round the kernel cannot build throws a KernelError naming the corner or edge its fillet code
     * could not build, where it recorded one.
     *
     * The kernel step of a part read from a file (`fromStep`, `fromSmb`, `fromUsd`) or made from one
     * runs in the probe worker (see GUARD_SECONDS): the kernel's fillet code crashed on some imported
     * parts.
     */
    fillet(edges: EdgesLike, radius: FilletRadius, options?: FilletOptions): Part;
    /**
     * The surfaces of the rounds a fillet of `edges` with `radius` would make, as sheets, without rounding
     * the part: one per edge, untrimmed (each runs along its whole edge, before the corners are made and
     * the rounds trimmed to meet). For a quick look at a fillet before making it (show them with the
     * part), or to see where its rounds would run. Circular rounds of one radius, the kernel's preview
     * (`SmApiFilletPreview`); the part does not change.
     *
     * `edges` and `propagate` select as for `fillet`. A selection the kernel cannot round at any size
     * throws a KernelError, as `fillet` does; a preview that succeeds does not promise that the fillet
     * will (its corners and trims are not made). The kernel step of a part read from a file runs in the
     * probe worker, as for `fillet`.
     */
    filletPreview(edges: EdgesLike, radius: number, options?: {
        propagate?: boolean;
    }): ShapeList<Shell>;
    /**
     * Bevel edges. `length` is the setback measured along both adjacent faces.
     *
     * An asymmetric bevel: `length2` is the setback on the other face of each edge, `length` the one on
     * its `reference` face; or `angle` (degrees) is the angle between the bevel and the reference face
     * (`length2` follows from it: `length * tan(angle)` where the faces meet at 90 degrees). `reference`
     * is a face of this part (or several) that each edge lies on; `length2` and `angle` need it. Where the
     * faces meet at an acute angle and the setbacks are less alike than its cosine, the kernel's solver
     * cannot reach the bevel: a straight edge between planes whose ends lie on planes at right angles to it
     * is then bevelled by cutting the bevel's prism along it; other such edges throw a ModelingError.
     *
     * The faces of each edge must meet at the same angle all along it (within 1 degree); where they
     * do not (a hole into a tilted or curved face), use `fillet`.
     *
     * `propagate` bevels the edges that continue the selected ones tangentially too
     * (`Edge.tangentChain`), as `fillet` does; `false` bevels the selected edges only. The edges a run
     * adds must lie on a reference face too.
     *
     * `corners` sets the corners where three bevelled edges meet, as for `fillet`: "patch" cuts them off
     * with a corner face, "mitre" runs the bevels on until they meet (the corners of three bevelled
     * convex edges and no other edge).
     */
    chamfer(edges: EdgesLike, length: number, options?: ChamferOptions): Part;
    /**
     * Hollow the part out to walls of `thickness`, removing the `openings` faces.
     *
     * The walls grow inward (the outside keeps its size) unless `outward` is true.
     *
     * `corners` says how the new side of the walls turns where the part's faces grow apart (the inside
     * of a concave edge for walls that grow inward, the outside of a convex edge and corner for walls
     * that grow outward): `'round'` keeps the wall's thickness all round with a round of radius
     * `thickness`; `'sharp'` extends the faces until they meet, so that the wall is thicker there (up
     * to `thickness / sin(a / 2)` at an edge of angle `a`). The default, null, takes `'round'` where
     * the kernel builds it and `'sharp'` where it does not; the result's `info().corners` says which.
     * Given `'round'` or `'sharp'`, a shell the kernel cannot build that way throws instead.
     *
     * `walls` gives faces walls of their own thickness: `[faces, thickness]` pairs, or a Map of faces
     * to thicknesses (`walls: [[part.faces().bottom(), 5]]`). The face of the shell across such a wall
     * is offset by the difference, and the faces around it are extended or trimmed to meet it (as
     * `offsetFaces`). Faces that meet smoothly (a wall and the round beside it) need one thickness.
     *
     * The kernel leaves the rim of an opening open where it meets its neighbours tangentially (the flat
     * top of a box rounded on all edges): planar openings of that kind, whose other rim edges meet walls
     * standing at right angles to them or an ordinary opening, are cut out of the part shelled closed
     * instead (the inner rounds then end at the rim).
     *
     * Walls that do not fit into the part (measured across it from each face), and results the
     * kernel gets wrong (faces that do not meet, no cavity, the part given back, a closed shell of the
     * wrong volume), throw a ModelingError. The kernel step runs in the probe worker (a kernel of its
     * own; on a page's main thread in this one), so that a crash of its offset code throws a
     * ModelingError too, and it is stopped after `GUARD_SECONDS` (20 s; `setGuardSeconds(seconds)`
     * raises it for large parts).
     */
    shell(thickness: number, openings?: FacesLike | null, options?: {
        outward?: boolean;
        corners?: 'round' | 'sharp' | null;
        walls?: WallsLike | null;
    }): Part;
    /** Grow (positive) or shrink (negative) the part by `distance` everywhere (0 gives an equal
     * copy).
     *
     * `corners: "sharp"` (the default) moves each face by `distance` and extends the faces until they
     * meet again: edges and corners stay sharp, and an edge whose faces meet at an angle `a` moves out
     * by `distance / sin(a / 2)`. `"round"` rolls a ball of radius `distance` along the part: where
     * faces grow apart (the convex edges and corners of a growing part) it fills in cylinders and
     * spheres, so that every point of the result lies at `distance` from the part (a clearance body,
     * the skin of an overmould). Shrinking with `"round"` rounds the concave edges, which grow apart
     * inward; the convex ones stay sharp. The sharp mode fails where faces would vanish or cross (an
     * acute wedge, a hole that closes, a groove narrower than twice the distance); the rounded mode
     * builds those.
     *
     * Results the kernel gets wrong (faces that do not meet, a change of the wrong sign) throw a
     * ModelingError. The kernel step runs in the probe worker and is stopped after `GUARD_SECONDS`
     * (20 s), as for `shell`. */
    offset(distance: number, options?: {
        corners?: 'sharp' | 'round';
    }): Part;
    /**
     * Cut the part with a plane or along a sheet.
     *
     * `keep = "above"` keeps the side the plane normal points to, "below" the other side, "both"
     * returns `[above, below]`.
     *
     * A sheet (a `Shell`, or a face that is not planar: a curved split surface, a surface fitted to a
     * scan) splits the part along its surface; "above" is the side its normals point to (`normalAt`).
     * The sheet must cut through the part. A sheet of one face whose edges end inside the part is
     * extended beyond them until it does (the face's trim is not kept): a free-form face tangentially,
     * a plane, cylinder, cone or sphere as itself (`Face.extend`; around a closed face it cannot grow);
     * sheets of several faces throw a ModelingError ("the surface does not cut through the part"). The two sides
     * together hold the part's volume, which is checked. A planar face (or a sketch) stands for its
     * plane. A plane that a seam of the part touches at a point (a torus' outer equator, where the
     * kernel's Boolean can go wrong) gives only sides that together hold the part's volume, else a
     * ModelingError.
     */
    split(plane: Plane | Face | Shell | ShapeList<Face>, keep: 'above' | 'below'): Part;
    split(plane: Plane | Face | Shell | ShapeList<Face>, keep: 'both'): [
        Part,
        Part
    ];
    split(plane: Plane | Face | Shell | ShapeList<Face>): Part;
    /**
     * The part with its faces split where a tool crosses them, without changing its shape: split
     * lines for drafts, patches for the loads and supports of a simulation, regions of a face of their
     * own to color, draft or select (a label area, a parting line, a seal track). Nothing is added or
     * taken away: the volume stays.
     *
     * @param tool A part (the faces are split where its surface crosses them), a sheet or a face that
     *   crosses faces of the part, or a sketch (or a planar face) lying on a face of the part, whose
     *   outline is cut into that face (keep its region within the face: where it reaches past the
     *   face's edges, the neighbouring faces can get split lines close to them). Or curves: edges or
     *   wires, which without a direction must lie on the part's faces (`intersectionCurves`,
     *   `project`).
     * @param direction For curves, a sketch or a planar face: move their outline along this direction
     *   (an axis or a vector) onto the part first, where it crosses the part's faces as it moves (an
     *   outline projected onto them). Only ahead of the curves: a part behind them is not reached.
     * @param options `nearest`: with a direction, split only the faces the projection meets first: the
     *   side of the part facing the curves (default `true`: an imprint marks the faces the outline lands
     *   on). `false` splits every face the projection crosses, also on the far side (a box's top and
     *   bottom face). `project`, which returns the projected curves, keeps both sides by default
     *   (`nearest: false`) and takes the same option.
     *
     * The pieces of the part's faces that lie inside a tool part, or inside the sketch's region,
     * descend from the tool: `part.imprint(tool).faces().derivedFrom(tool)` selects them. A fillet or
     * chamfer across a split line removes it again. A curve across the seam of a closed face (a
     * cylinder's) gives a face on each side of the seam.
     *
     * ModelingError where the tool crosses no face of the part, and where the kernel's result is no
     * longer the part (another volume, or a broken body).
     */
    imprint(tool: Part | Shell | Face | ShapeList<Face> | Edge | Wire | Iterable<Edge | Wire>, direction?: Axis | VectorLike | null, options?: {
        nearest?: boolean;
    }): Part;
    /**
     * The cross-section of the part in a plane, as a sketch. Of a part made by `merge`, the sections
     * of the cells the plane cuts, side by side (a region per cell).
     */
    section(plane?: Plane | Face): Sketch;
    /**
     * Sections (`section`) across `axis`, `step` apart: the part cut into layers of thickness `step`
     * from its lowest point along the axis up, each cut in its middle (at `step / 2`, `3 * step / 2`,
     * ... above the lowest point; the contours of a printer's layers). Each sketch lies in its plane
     * (`sketch.plane`); layers whose plane misses the part are left out.
     */
    slices(step: number, axis?: Axis | VectorLike): Sketch[];
    /** A faceted part of a closed mesh (see `Mesh.toPart`). */
    static fromMesh(mesh: Mesh, maxFaces?: number): Part;
    /** Twist about an axis (default Z) by `angle` degrees over the part; see `twist`. */
    twist(angle: number, options?: TwistOptions): Part;
    /** Scale cross-sections toward an axis (default Z) from 1 to `scale`; see `taper`. */
    taper(scale: number, options?: TaperOptions): Part;
    /** Bend around an axis by `angle` degrees (default: along X, toward +Z); see `bend`. */
    bend(angle: number, options?: BendOptions): Part;
    /** Unroll this part from around an axis (default Z) into a flat one, the layer at `radius`
     * keeping its length; see `unroll`. */
    unroll(options: UnrollOptions): Part;
    /** Deform with a `Lattice` (same as `lattice.apply(part)`); see `deform`. */
    deform(lattice: Lattice, options?: {
        tolerance?: number | null;
    }): Part;
    /** The part with fillets taken out and their edges sharp again: `faces` (fillet faces of this
     * part), or all fillets up to `maxRadius`. With `partial` the fillets the kernel cannot take
     * out stay. See the defeature module. */
    removeFillets(faces?: FacesLike | null, options?: {
        maxRadius?: number | null;
        partial?: boolean;
    }): Part;
    /** The part with `faces` (a hole, a boss, a pocket) cut out and the gap closed by the faces
     * around it. With `partial` the features the kernel cannot close stay. See the defeature
     * module. */
    removeFaces(faces: FacesLike, options?: {
        partial?: boolean;
    }): Part;
    /** Draft angle of every face for the pull direction, with the faces grouped by whether they
     * release (see `DraftAnalysis`). */
    draftAnalysis(direction: Axis | VectorLike, options?: {
        minAngle?: number;
    }): DraftAnalysis;
    /** The closed lines where the part's surface turns from facing `direction` to facing away from
     * it: where the halves of a mold part (see `partingLine`). */
    partingLine(direction: Axis | VectorLike): ShapeList<Wire>;
    /**
     * Tilt faces by a draft angle, so that a molded or cast part comes out of its mold.
     *
     * Each face turns about the line where it meets the neutral plane and keeps its size there. The
     * normal of the neutral plane is the pull direction, the way the mold moves off the part: a
     * positive angle turns each face to look more along it, so the part narrows and pockets and
     * holes widen along the normal, on either side of the plane. Afterwards `draftAnalysis` of that
     * direction finds `angle` more draft on each of the faces.
     *
     * Planes can be drafted, and cylinders and cones whose axis runs along the normal (a cylinder
     * becomes a cone). A face that meets a drafted face tangentially, such as a fillet between two
     * walls, must be drafted with it; the faces around the drafted ones are extended or trimmed to
     * meet them. A part with cavities is drafted as its outside and its cavities apart (the kernel drops
     * cavities), which are cut out again; the walls of a cavity drafted by a positive angle widen along
     * the pull direction, as a pocket's do.
     *
     * @param faces Faces of this part (a selection or a single face).
     * @param angle Draft angle in degrees, between -90 and 90 and not 0. A face's draft may be 89
     *   degrees at most.
     * @param neutralPlane Where the faces keep their size, a Plane or a planar face. A face's
     *   normal points out of the part: the top face drafts for a mold that moves up, the bottom face
     *   for one that moves down (use `Plane.XY` there).
     */
    draft(faces: FacesLike, angle: number, neutralPlane: Plane | Face): Part;
    /**
     * Move faces of the part, and extend or trim the faces around them to meet them again: push or
     * pull a face, move a hole, a boss or a pocket.
     *
     * `by` is a vector or a Location (a rotation and a translation: it also turns the faces). A face
     * moved along itself stays where it is (a plane moved within its plane); the faces around it decide
     * what changes. Faces that meet a moved face tangentially (a round, the other half of a slot) must
     * be moved with it. Exact: planes, cylinders, cones, spheres, tori and free-form faces keep their
     * shape, and the edges where a plane meets a cylinder, cone or sphere stay circles.
     *
     * Throws a ModelingError where the kernel cannot rebuild the part, where the moved faces change
     * which faces meet (a face vanishes; use a Boolean), and where the result's faces do not meet. A part
     * with cavities is edited as its outside and its cavities apart (the kernel drops cavities), which are
     * cut out again; a move that makes a cavity reach the outside or another cavity throws, and so does a
     * part with a body inside a cavity. Faces around the moved ones that the kernel extends keep their
     * cylinder or cone.
     *
     * @param faces Faces of this part (a selection or a single face).
     * @param by A vector, or a Location.
     */
    moveFaces(faces: FacesLike, by: Location | VectorLike): Part;
    /**
     * Offset faces of the part along their normals by `distance`, and extend or trim the faces around
     * them to meet them again: push-pull by a distance, resize a hole or a boss.
     *
     * A positive distance moves the faces out of the material: the part grows, a hole narrows and a
     * boss widens; a negative one moves them in. Faces that meet an offset face tangentially (a round,
     * the other half of a slot, a fillet chain) are offset with it, and so on along the tangent chain.
     * Exact: a plane moves, a cylinder, cone, sphere or torus changes its radius, a free-form face
     * becomes its offset surface.
     *
     * Throws a ModelingError where a radius would reach 0, where the kernel cannot rebuild the part,
     * where the offset faces change which faces meet (a face vanishes; use a Boolean), and where the
     * volume does not change the way the distance says. A part with cavities is edited as for
     * `moveFaces`: a face of a cavity's wall offset by a positive distance moves into the cavity.
     *
     * @param faces Faces of this part (a selection or a single face).
     * @param distance How far to move them, along their outward normals.
     */
    offsetFaces(faces: FacesLike, distance: number): Part;
    /**
     * Push or pull a face at a point: a smooth dent or bump, local to the point, its edges in place.
     *
     * The point moves exactly, the face's edges not at all: an edit that would move one (a hole's
     * edge, a border cut across the surface, within `radius` of the point) throws a RangeError; take a
     * smaller radius or a point farther from it. The face becomes a B-spline surface; a plane, cylinder
     * or sphere stays exactly what it was away from the change.
     *
     * @param face A face of the part.
     * @param at The point of the face that moves (a point off the face: the face's point nearest to it).
     * @param options `by`: how far it moves: a distance along the face's outward normal there
     *   (positive: out of the part, a bump; negative: a dent), or a vector. `to`: where it moves to,
     *   instead of `by`. `normal`: the face's normal at the moved point (default: as it was there).
     *   `radius`: how far from the point the face changes, along the face (a square around the point
     *   along the surface's two directions, blended in smoothly; default: up to the face's nearest edge,
     *   smaller where that would still move an edge). `continuity`: how the face stays joined to its
     *   neighbours where the change reaches its border: `'G0'` (its edges stay), `'G1'` (default; also
     *   its tangent planes along them) or `'G2'` (also its curvature).
     * @returns A new part (this one does not change).
     */
    push(face: Face, at: VectorLike, options?: PushOptions): Part;
    /**
     * Raise or sink a region of a face: a smooth bump over an outline drawn on the face.
     *
     * The face changes only near the region, within the rectangle around it along the surface's two
     * directions (the region itself for a rectangle drawn along them); the highest point lies near the
     * region's middle (at it, for a region symmetric along both directions, with `'G2'`). Where that
     * rectangle reaches an edge of the face (a hole), the edge would move: a RangeError. The face's
     * B-spline loses the knots it does not need within 1e-6 of the size (its edges stay where they are).
     *
     * @param face A face of the part.
     * @param region The outline on the face: a closed Wire (on a curved face, `project` one onto it), a
     *   Sketch or Face placed on the face (its outline), or the corner points of a polygon on the face.
     * @param by How far the region rises at its highest point: a distance along the face's outward
     *   normal at the region's middle (positive: out of the part; negative: a recess), or a vector.
     * @param options `continuity`: how the change meets the rest of the face at the region's border:
     *   `'G2'` (default; curvature continuous), `'G1'` (tangent) or `'crease'` (a sharp border).
     * @returns A new part (this one does not change).
     */
    warp(face: Face, region: RegionLike, by: number | VectorLike, options?: {
        continuity?: 'crease' | 'G1' | 'G2';
    }): Part;
    /**
     * Press a region of a face onto a plane: a flat area (a seat, a pad, a label area) on a curved face,
     * blended into the rest of it.
     *
     * Inside the region the face lies in the plane, but for a border where it blends into the rest
     * (3/16 of the region's width with `'G2'`, 2/16 with `'G1'`, 1/16 with `'crease'`); outside the
     * rectangle around the region (along the surface's two directions) it does not change. Where that
     * rectangle reaches an edge of the face (a hole), the edge would move: a RangeError. The face's
     * B-spline loses the knots it does not need within 1e-6 of the size (its edges stay where they are;
     * a box's top flattened: 21 x 21 control points, not 39 x 39).
     *
     * @param face A face of the part.
     * @param region The outline on the face, as for `warp`.
     * @param plane The plane (or a planar face) the region is pressed onto, along its normal.
     * @param options `continuity`: how the flat area meets the rest of the face: `'G2'` (default),
     *   `'G1'` or `'crease'`.
     * @returns A new part (this one does not change).
     */
    flatten(face: Face, region: RegionLike, plane: Plane | Face, options?: {
        continuity?: 'crease' | 'G1' | 'G2';
    }): Part;
    /** Fold this sheet along a line on its top or bottom face (see `fold`). */
    fold(line: Axis | Edge, angle: number, options: FoldOptions): Part;
    /** Add a flange along a straight outer edge of this sheet (see `flange`). */
    flange(edge: Edge | ShapeList<Edge>, length: number, options: FlangeOptions): Part;
    /** The bends of this sheet metal part (see `bends`). */
    bends(options?: {
        kFactor?: KFactor;
    }): Bend[];
    /** This sheet metal part unfolded flat (see `unfold`). */
    unfold(options?: UnfoldOptions): Part;
    /** The flat pattern of this sheet metal part on XY (see `flatPattern`). */
    flatPattern(options?: UnfoldOptions): FlatPattern;
    toString(): string;
}
export declare const WHOLE_TURN = 0.01;
/** A sheet body: one or more faces that do not enclose a volume (surfaces). */
export declare class Shell extends _Body {
    /**
     * The sheet of a NURBS surface given by its data: the inverse of `Face.nurbs()`, as
     * `Edge.fromNurbs` is for curves (`nurbsSurface` with the data in `NurbsSurface`'s order).
     * `nurbs`: a `NurbsSurface`, or `{ degrees, knots, points, weights }`: the degrees `[u, v]`, the
     * knot vectors `[uKnots, vKnots]`, the control points in rows (`points[i][j]` the point `i` along
     * u and `j` along v) and a weight per point in the same rows, or null for a non-rational surface.
     */
    static fromNurbs(nurbs: NurbsSurface | {
        readonly degrees: readonly [
            number,
            number
        ];
        readonly knots: readonly [
            readonly number[],
            readonly number[]
        ];
        readonly points: readonly (readonly VectorLike[])[];
        readonly weights?: readonly (readonly number[])[] | null;
    }): Shell;
    /** The total area of the faces. */
    get area(): number;
    /** The center of the faces' area (each face weighted by its area). */
    center(): Vector;
    /** Turn the sheet into a solid of `thickness` (along the face normals; a negative thickness
     * grows against them). With `both` the solid is `thickness` thick in total, half of it to each
     * side of the sheet.
     *
     * The kernel step runs in the probe worker, so that a crash of its offset code throws a
     * ModelingError, and is stopped after `GUARD_SECONDS` (20 s), as for `Part.shell`. Where the
     * kernel's extended offset mode fails on a sheet whose faces meet tangentially at every edge, its
     * other mode, which builds the same solid there, is tried. */
    thicken(thickness: number, options?: {
        both?: boolean;
    }): Part;
    /**
     * The sheet moved by `distance` along its face normals (a negative distance against them): each face
     * offset, and where faces meet, extended or trimmed to meet again (sharp edges, as `Part.offset`). 0
     * gives an equal copy. Faces that touch along edges they do not share (faces copied one by one, or put
     * together with `fuse`) are joined along them first, where their normals agree (`stitch` without
     * turning a face); faces apart from the others, or whose normals disagree with their neighbours', move
     * each on its own.
     *
     * Results the kernel gets wrong (no faces, faces closer to the sheet than `distance`, on its other
     * side, or nowhere at that distance from it) throw a ModelingError; so does an offset beyond the
     * radius of a concave curvature. The kernel step runs in the probe worker, as for `thicken`.
     */
    offset(distance: number): Shell;
    /**
     * Cut the sheet along curves that lie on it, and keep one side, or both as faces of their own.
     *
     * @param curves Edges or wires on the sheet: where two sheets meet (`intersectionCurves`), the
     *   long edges of a `surfaceFillet`, curves projected onto the sheet (`project`). A curve may run
     *   across several faces of the sheet. Each one runs from border to border, or closes a loop (a
     *   hole or an outline).
     * @param keep A point on the side to keep, or near it (not on a curve): the faces it reaches
     *   without crossing a curve are kept. `'split'` keeps both sides, as faces of their own.
     * @returns The trimmed sheet (a new one; this one does not change).
     *
     * To cut along a direction instead (a hole through a curved panel), project the outline first:
     * `sheet.trim(sheet.project(Circle(5).edges()[0], [0, 0, -1]), [0, 0, 0])` keeps the disk.
     */
    trim(curves: Edge | Wire | Iterable<Edge | Wire>, keep: VectorLike | string): this;
    /**
     * The sheet turned over: a copy whose faces' normals all point the other way.
     *
     * `thicken` then grows to the other side, and the `sides` of `surfaceFillet` count from the new
     * normals. A sheet that encloses a volume (the face of a whole sphere) faces outward whichever
     * way its surface runs: it cannot be turned over (RangeError).
     */
    flipped(): this;
    /**
     * The sheet (of one face) grown past its sides: see `Face.extend`.
     *
     * @param distance How far past each side, measured along the surface.
     * @param options `sides`: edges of the sheet: grow past the sides they lie on only (default: every
     *   side that can grow). `continuity`: `'natural'` (default), `'G1'` or `'G2'`.
     * @returns A new sheet; this one does not change. For a sheet of several faces, extend one of its
     *   faces (`sheet.faces()[i].extend(...)`).
     */
    extend(distance: number, options?: {
        sides?: Edge | Iterable<Edge> | null;
        continuity?: 'natural' | 'G1' | 'G2';
    }): this;
    /**
     * The sheet with an edge moved onto a curve: the edge runs along `target` from end to end,
     * exactly, and its face bends to follow, smoothly, near the edge only. To close a gap between two
     * sheets before `stitch`, match one sheet's edge to the other's; to give a sheet a styling line,
     * match it to that curve.
     *
     * @param edge An edge of the sheet, a whole side of its face.
     * @param target The curve to run along (an edge, or a wire whose edges join end to end), either way
     *   round; its ends are where the edge's ends go.
     * @param options `extent`: how far into the face the change reaches: a part of the face's
     *   parameter range across from the edge (above 0, below 1; default 0.25). The face meets the rest
     *   of itself there with continuous derivatives (up to its degree less one).
     *
     * Where the curve's ends are not the edge's, the edge's vertices move to them, the edges next to it
     * bend near those ends, and the faces on the other side of those edges follow them the same way, but
     * meet the matched face with a crease near the matched edge (no tangent is kept across those side
     * edges: 20 to 34 degrees in a sheet of two faces; merge faces first with `mergeFaces` to keep a
     * sheet smooth). Every face that changes must be bounded by the four sides of its surface (as
     * `surface`, `loft`,
     * `ruled`, `fill` and `network` make them; no holes, no trimmed borders) and the edge a whole side
     * of it, else RangeError. The faces become B-splines (planes too).
     *
     * @returns A new sheet; this one does not change. A Sketch's comes back as a Shell.
     */
    matchEdge(edge: Edge, target: Edge | Wire, options?: {
        extent?: number;
    }): Shell;
    /**
     * The sheet with two faces made one: one surface over both, where they share a whole side, such
     * as the halves of a sheet split along a curve of its surface, or patches built through the same
     * curves. The joint's knot goes where the faces meet smoothly enough (within the sheet's
     * tolerance), so a split sheet comes back as it was.
     *
     * @param a A face of the sheet, bounded by the four sides of its surface (no holes, no trimmed
     *   borders).
     * @param b Another such face, sharing one whole side with `a` (and no other).
     *
     * The joined surface must reproduce both faces (within the sheet's tolerance), else RangeError:
     * faces whose parameters run at different speeds along the shared side, or whose normals point to
     * opposite sides, are not merged. The merged face's normal is `a`'s.
     *
     * @returns A new sheet with one face less; this one does not change. A Sketch's comes back as a
     *   Shell.
     */
    mergeFaces(a: Face, b: Face): Shell;
    /** Push or pull a face of the sheet at a point: see `Part.push` (`by` as a distance moves along the
     * face's normal). Returns a new sheet; a Sketch's comes back as a Shell. */
    push(face: Face, at: VectorLike, options?: PushOptions): Shell;
    /** Raise or sink a region of a face of the sheet: see `Part.warp`. Returns a new sheet; a Sketch's
     * comes back as a Shell. */
    warp(face: Face, region: RegionLike, by: number | VectorLike, options?: {
        continuity?: 'crease' | 'G1' | 'G2';
    }): Shell;
    /** Press a region of a face of the sheet onto a plane: see `Part.flatten`. Returns a new sheet; a
     * Sketch's comes back as a Shell. */
    flatten(face: Face, region: RegionLike, plane: Plane | Face, options?: {
        continuity?: 'crease' | 'G1' | 'G2';
    }): Shell;
    /** Union with other sheets (Python's `+`). */
    fuse(...others: (Shell | Part | Face | Iterable<Shell | Part | Face>)[]): Shell;
    /** The sheet trimmed by parts: the pieces outside them (Python's `sheet - part`). (`Sketch.cut`
     * takes sketches: the type names both.) */
    cut(...others: (Part | Sketch | Iterable<Part | Sketch>)[]): Shell;
    /** The sheet trimmed by parts: the pieces inside them (Python's `sheet & part`; also
     * `part.intersect(sheet)`). */
    intersect(...others: (Part | Sketch | Iterable<Part | Sketch>)[]): Shell;
    toString(): string;
}
/** How `Part.push` and `Shell.push` move the point (see `Part.push`). */
export interface PushOptions {
    /** How far the point moves: a distance along the face's outward normal there, or a vector. */
    by?: number | VectorLike | null;
    /** Where the point moves to, instead of `by`. */
    to?: VectorLike | null;
    /** The face's normal at the moved point (default: as it was there). */
    normal?: VectorLike | null;
    /** How far from the point the face changes (default: up to the face's nearest edge). */
    radius?: number | null;
    /** `'G0'`, `'G1'` (default) or `'G2'`: how the face stays joined to its neighbours. */
    continuity?: 'G0' | 'G1' | 'G2';
}
/** How a sketch is extruded. */
export interface ExtrudeOptions {
    /** Extrude the amount to both sides of the sketch. */
    both?: boolean;
    /** Draft angle in degrees; positive narrows the solid away from the sketch. */
    taper?: number;
    /** Extrude along this direction (an axis or a vector) instead of the normal; the amount is measured
     * along it. A direction in the sketch plane throws a `RangeError`; one less than 0.06 degrees (a sine
     * of 1e-3) off the plane warns, as the solid is then less than amount / 1000 thick. With `taper`
     * only the normal (either way) is taken: a direction across it throws a `RangeError`. */
    direction?: Axis | VectorLike | null;
    /** With a taper, the corners the taper pulls apart: 'sharp' (the walls extended until they meet)
     * or 'round' (rounded off, as an offset rounds them). */
    corners?: 'sharp' | 'round';
}
/**
 * A planar region (with holes, possibly several pieces) on a plane.
 *
 * Sketch constructors build in the world XY plane around the origin; place a sketch with
 * `.on(planeOrFace)`, `plane.mul(sketch)` or `Pos(...).mul(sketch)`. Combine sketches with
 * `fuse`, `cut`, `intersect` and `xor`, change them with `offset`, `fillet`, `chamfer` and
 * `mirror`, then turn them into parts with `extrude`, `revolve`, `sweep` or `loft`. Outlines that
 * are awkward as combinations of shapes are drawn with `Profile`.
 */
export declare class Sketch extends Shell {
    /** The sketch turned over: its faces and its plane face the other way (an extrusion then grows to
     * the other side). */
    flipped(): this;
    /** The sketch plane; extrusions follow its normal. */
    get plane(): Plane;
    /** The union with other sketches (Python's `+`). */
    fuse(...others: (Sketch | Iterable<Sketch>)[]): Sketch;
    /** The region less other sketches (Python's `-`). */
    cut(...others: (Sketch | Iterable<Sketch>)[]): Sketch;
    /** The region common to this and other sketches (Python's `&`). */
    intersect(...others: (Sketch | Iterable<Sketch>)[]): Sketch;
    /** The region in exactly one of the sketches (Python's `^`). */
    xor(...others: (Sketch | Iterable<Sketch>)[]): Sketch;
    /** Area centroid of the region. */
    center(): Vector;
    /** Total length of the boundary: outlines and holes. */
    get perimeter(): number;
    /**
     * Area, centroid and second moments of area of the region (a beam's or an extrusion's profile):
     * `ixx`, `iyy` and `ixy` about the centroid in the axes of the sketch plane, the principal
     * moments and axes, the polar moment, the radii of gyration and the section moduli (see
     * `SectionProperties`).
     *
     * Integrated as the mass properties of a thin slab of the region (to `ACCURACY` of the largest
     * moment), less the slab's own thickness term.
     */
    sectionProperties(): SectionProperties;
    /**
     * Grow (positive `distance`) or shrink (negative) the region; holes move the other way.
     *
     * `corners` shapes the corners that the offset pulls apart (convex ones when growing, concave
     * ones when shrinking): "round" (arcs of radius |distance|), "sharp" (the sides extended until
     * they meet) or "chamfer" (a straight cut across). Lines stay lines and arcs stay arcs. Parts
     * that grow into each other merge, parts that get too thin vanish; shrinking away the whole
     * region throws ModelingError. `round: false` is the older spelling of `corners: "sharp"`.
     */
    offset(distance: number, options?: {
        corners?: 'round' | 'sharp' | 'chamfer';
    }): Sketch;
    /**
     * Round corners of the region with tangent arcs of `radius`.
     *
     * `vertices`: the corners to round, as vertices of this sketch (a selection such as
     * `s.vertices().concave()`) or points; null rounds every sharp corner. Corners between lines and
     * arcs are rounded exactly; next to a spline or an ellipse the arc's center lies at `radius` from
     * both curves (where their offsets meet), and the curves are cut where it touches them. A corner
     * that does not fit, a point that is not a corner, or a smooth corner throws ModelingError.
     */
    fillet(radius: number, vertices?: VectorLike | Vertex | Iterable<VectorLike | Vertex> | null): Sketch;
    /** Bevel corners of the region: cut back `length` along both edges of each corner (measured
     * along the edge) and join the two points with a line. `vertices` as for `fillet`; null bevels
     * every sharp corner. */
    chamfer(length: number, vertices?: VectorLike | Vertex | Iterable<VectorLike | Vertex> | null): Sketch;
    /**
     * A mirrored copy: about an Axis in the sketch plane (`s.mirror(Y)`), or in a plane or planar
     * face (by default the XZ plane, which flips Y).
     *
     * Lines stay lines and arcs stay arcs. The sketch keeps facing the same way when the mirror is
     * an axis in its own plane, so the mirrored profile extrudes to the same side.
     */
    mirror(plane?: Plane | Face | Axis | ShapeList<Face>): this;
    /**
     * Extrude the region into a solid.
     *
     * With a taper (degrees; positive narrows the solid away from the sketch, holes widen) the walls
     * are drafted planes, cones and cylinders (as `Part.draft` makes them), B-spline surfaces where the
     * profile has other curves. `corners` shapes the corners the taper pulls apart (convex ones of an
     * outward taper, concave ones of an inward one): 'sharp' (the walls extended until they meet) or
     * 'round' (rounded off, as an offset rounds them).
     *
     * With a taper only the normal (either way) is taken as `direction`: a taper drafts the walls about
     * the normal, so a direction across it throws a RangeError.
     *
     * @param amount Distance along the sketch normal (negative goes the other way).
     */
    extrude(amount: number, options?: ExtrudeOptions): Part;
    /**
     * Revolve the region about an axis in its plane.
     *
     * The default axis is the sketch's local Y axis through its plane origin. For the centered
     * constructors (`Rectangle`, `Circle`, ...) and for `makeFace` that origin is the middle of the
     * region, so pass `axis` unless the sketch was drawn beside its origin
     * (`Polygon([10, 0], [20, 0], ...)`). A negative `angle` turns the other way. The axis must not
     * cross the region (ModelingError).
     */
    revolve(axis?: Axis | null, angle?: number): Part;
    /** Sweep the region along a path (see `sweep`: the center of the region's box, or the point `anchor`
     * names, goes to the start of the path; `up` and `twist` set its attitude along it, `scale` its size). */
    sweep(path: Edge | Wire, options?: {
        orient?: boolean;
        translational?: boolean;
        sharpCorners?: boolean | null;
        up?: Axis | VectorLike | string | null;
        twist?: number | ((s: number) => number);
        scale?: readonly [
            number,
            number
        ] | readonly (readonly [
            number,
            number
        ])[] | ((s: number) => number) | null;
        anchor?: 'center' | 'origin' | VectorLike | Vertex;
    }): Part;
    /** Swing the region around an outline: a revolve about Z whose circle is the outline (see `swing`:
     * the region drawn as for a lathe in the XZ plane, the outline a closed curve around the Z axis
     * parallel to XY, scaled at each height to pass through the region's outline on the +X side). */
    swing(outline: Sketch | Face | Wire | Edge): Part;
    toString(): string;
}
export {};
