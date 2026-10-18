import { BrepHandle, CurveHandle } from './kernel.js';
import { Axis, BoundBox, Hit, Nurbs, Location, Plane, Vector, type Matrix, type VectorLike } from './geometry.js';
import { type Mesh } from './mesh.js';
import { type BendOptions, type TaperOptions, type TwistOptions } from './deform.js';
import { type DraftAnalysis } from './draft.js';
import { type Bend, type FlangeOptions, type FlatPattern, type FoldOptions, type UnfoldOptions } from './sheetmetal.js';
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
/** Metadata a body carries: a name (exporters, the viewer) and a display color. */
export interface BodyOptions {
    name?: string | null;
    color?: ColorLike | null;
    /** (a sketch's plane) */
    plane?: Plane | null;
}
export declare function _t(p: ArrayLike<number>): [number, number, number];
/** Python's `type(x).__name__`, for messages. */
export declare function _typeName(x: unknown): string;
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
    abstract _transformed(m: Matrix): Shape;
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
    /** Triangulate the shape (see `tessellate`). */
    mesh(tolerance?: number | null, angle?: number): Mesh;
    /** Show the shape in the viewer (see `show`). */
    show(options?: Record<string, unknown>): unknown;
    /** Write the shape to a file; the format follows the extension (step, stl, glb, ...). */
    export(path: string, options?: Record<string, unknown>): void;
    toString(): string;
    [inspect](): string;
}
export declare function _asPlane(target: unknown): Plane;
/** What shapes are sorted and grouped by: an axis, a name ("length", "area", "volume",
 * "radius", "x", "y", "z", "size") or a function of a shape. */
export type SortKey = Axis | string | ((s: Any) => number);
/** A ShapeList of the items. */
export declare function _list<T>(items: Iterable<T>): ShapeList<T>;
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
    get first(): T;
    get last(): T;
    /** Sort by position along an axis, by "length"/"area"/"volume"/"radius", or by any function
     * of a shape. */
    sortBy(key?: SortKey, reverse?: boolean): ShapeList<T>;
    /** `parallelTo(axis)`, `ofType(name)` or `filter(predicate)`, depending on the argument. */
    filterBy(criterion: Axis | string | ((s: T) => boolean)): ShapeList<T>;
    sortByDistance(point: VectorLike, reverse?: boolean): ShapeList<T>;
    /** Group shapes with equal key (within `tol`), groups in ascending key order. */
    groupBy(key?: SortKey, tol?: number): ShapeList<T>[];
    /** The shapes with the largest key (all of them, if several tie). */
    maxBy(key?: SortKey, tol?: number): ShapeList<T>;
    /** The shapes with the smallest key (all of them, if several tie). */
    minBy(key?: SortKey, tol?: number): ShapeList<T>;
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
    /** Shapes passing through `point` (vertices at, edges/faces touching it). (Python's `at`;
     * Array has an `at` of its own.) */
    atPoint(point: VectorLike, tol?: number): ShapeList<T>;
    /** The shapes of both lists, each once (Python's `|`). */
    union(other: Iterable<T>): ShapeList<T>;
    /** The shapes not in `other` (Python's `-`). */
    difference(other: Iterable<T>): ShapeList<T>;
    /** The shapes also in `other` (Python's `&`). */
    intersection(other: Iterable<T>): ShapeList<T>;
    vertices(): ShapeList<Vertex>;
    edges(): ShapeList<Edge>;
    faces(): ShapeList<Face>;
    wires(): ShapeList<Wire>;
    /** Average of the members' centers. */
    center(): Vector;
    bbox(): BoundBox;
    moved(location: Location): ShapeList<T>;
    /** Every shape placed onto a plane or face (see `Shape.on`). */
    on(target: unknown): ShapeList<T>;
    translate(x?: number | VectorLike, y?: number, z?: number): ShapeList<T>;
    rotate(axis?: Axis, angle?: number): ShapeList<T>;
    toString(): string;
    [inspect](): string;
}
/** The shapes, each once (by `_identity()`). */
export declare function _unique<T>(items: Iterable<T>): ShapeList<T>;
/** A point. Vertices of bodies come from `.vertices()`; `new Vertex(x, y, z)` makes one. */
export declare class Vertex extends Shape {
    _owner: _Body | null;
    _v: number;
    _p: Vector;
    constructor(x?: number | VectorLike, y?: number, z?: number);
    static _of(owner: _Body | null, kvertex: number): Vertex;
    get point(): Vector;
    get x(): number;
    get y(): number;
    get z(): number;
    center(): Vector;
    bbox(): BoundBox;
    vertices(): ShapeList<Vertex>;
    edges(): ShapeList<Edge>;
    faces(): ShapeList<Face>;
    distanceTo(other: VectorLike | Shape): number;
    /** For a corner of a sketch: "convex" where the region's angle is below 180 degrees (an
     * outside corner), "concave" above (an inside corner, also every corner of a square hole),
     * "smooth" where the two edges meet tangentially. */
    get convexity(): string;
    _transformed(m: Matrix): Vertex;
    _identity(): string;
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
    _owner: _Body | null;
    _e: number;
    _c: CurveHandle | null;
    _rev: boolean;
    _cache: [number, number] | null;
    /** (create edges with Line(), ThreePointArc(), Spline(), ... or take them from a shape) */
    constructor(token?: symbol);
    static _of(owner: _Body | null, kedge: number, reversed?: boolean): Edge;
    /** Wrap a new standalone kernel curve (takes ownership). */
    static _fromCurve(curve: number): Edge;
    _curve(): number;
    _range(): [number, number];
    /** A new standalone kernel curve with this edge's extent and direction. */
    _copyCurve(): number;
    /** Kernel parameter at fraction `t` of the arc length (in edge direction). */
    _param(t: number): number;
    /** "line", "circle" (also arcs), "ellipse", "bspline" or "other". */
    get geomType(): string;
    get length(): number;
    get start(): Vector;
    get end(): Vector;
    get isClosed(): boolean;
    /** True for the seam of a closed surface (an edge used twice by one face). */
    get isSeam(): boolean;
    /** "convex" for an outside corner (material angle below 180 degrees), "concave" for an inside
     * corner, "smooth" where the faces meet tangentially. Edges with a single face count as
     * convex. */
    get convexity(): string;
    /** True on an outside corner (see `convexity`). */
    isConvex(): boolean;
    /** Unit direction of a straight edge (start to end). */
    get direction(): Vector;
    /** A line, or a B-spline whose control points lie on a line (chamfers, mirrored lines and the
     * like make those). */
    _isStraight(): boolean;
    _circle(): Any;
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
    bbox(): BoundBox;
    distanceTo(point: VectorLike | Shape): number;
    /** Points where this edge crosses another edge. */
    intersections(other: Edge): Vector[];
    vertices(): ShapeList<Vertex>;
    edges(): ShapeList<Edge>;
    faces(): ShapeList<Face>;
    /** The same edge traversed the other way. */
    reversed(): Edge;
    /**
     * This edge as a NURBS curve, from its start to its end: degree, knots, control points and
     * weights. Exact for lines, arcs (rational) and B-splines; other curves are approximated within
     * 1e-7.
     */
    nurbs(): Nurbs;
    /**
     * The same curve with the knots it does not need taken out: a B-spline with fewer control points
     * (the kernel's knot removal, which keeps the curve within about 1e-6 of where it was). Lines,
     * arcs and other analytic curves come back as they are.
     */
    removeKnots(): Edge;
    _transformed(m: Matrix): Edge;
    /** A wire of this edge and the other (Python's `+`). */
    add(other: Edge | Wire): Wire;
    _identity(): string;
    equals(other: unknown): boolean;
    toString(): string;
}
export declare function _coplanar(points: readonly (readonly number[])[]): boolean;
export declare function _isRigid(m: Matrix): boolean;
/** True for a rotation, reflection or uniform scale (with any translation): the maps that take
 * lines to lines and circles to circles. */
export declare function _similarity(m: Matrix): boolean;
/** Apply a 4x4 matrix to a standalone kernel curve (consumes `curve`). */
export declare function _transformCurve(curve: number, m: Matrix): number;
export declare function _canonicalCurve(poles: readonly (readonly number[])[], knots: Iterable<number>, degree: number, weights: Iterable<number> | null): number;
/** A chain of edges, open or closed. `new Wire([edge, edge, ...])` orders and orients the edges. */
export declare class Wire extends Shape {
    _edges: readonly Edge[];
    constructor(edges: Edge | Wire | Iterable<Edge | Wire | Iterable<Edge | Wire>>, options?: {
        sort?: boolean;
    });
    static _raw(edges: readonly Edge[]): Wire;
    edges(): ShapeList<Edge>;
    vertices(): ShapeList<Vertex>;
    wires(): ShapeList<Wire>;
    get isClosed(): boolean;
    get start(): Vector;
    get end(): Vector;
    get length(): number;
    /** Length-weighted average of the edge midpoints. */
    center(): Vector;
    bbox(): BoundBox;
    /** Point at fraction `t` of the total length. */
    pointAt(t?: number): Vector;
    tangentAt(t?: number): Vector;
    distanceTo(point: VectorLike | Shape): number;
    /** This wire closed with a straight line from its end to its start. */
    close(): Wire;
    reversed(): Wire;
    _transformed(m: Matrix): Wire;
    _copyCurves(): number[];
    /** A wire of this one and the other (Python's `+`). */
    add(other: Edge | Wire): Wire;
    /** The plane of a planar wire (normal by the right-hand rule along the wire). */
    plane(): Plane;
    /** Round the corners between straight edges with tangent arcs (planar wires). */
    fillet(radius: number, vertices?: Iterable<VectorLike | Vertex> | null): Wire;
    /** The planar region bounded by this closed wire. */
    toSketch(): Sketch;
    toString(): string;
}
/** The wire with consecutive collinear line segments joined into one. */
export declare function _mergedLines(wire: Wire): Wire;
/** Order edges head to tail, reversing where needed. Leaves them alone if they don't chain. */
export declare function _chain(edges: Edge[], tol?: number): Edge[];
/** Approximate enclosed area of a closed planar wire (sampled polygon). */
export declare function _loopArea(wire: Wire, samples?: number): number;
export declare function _fitPlane(points: readonly Vector[], closed?: boolean): Plane;
/** A bounded piece of a surface, belonging to a body (a part, shell or sketch). */
export declare class Face extends Shape {
    readonly _owner: _Body | null;
    readonly _f: number;
    _info: Any;
    _m: Any;
    constructor(owner: _Body | null, kface: number);
    /** The body this face belongs to. */
    get owner(): _Body | null;
    _surfaceInfo(): Any;
    /** "plane", "cylinder", "cone", "sphere", "torus", "revolution", "extrusion", "bspline",
     * "offset" or "other". */
    get geomType(): string;
    /** Area and first moments, integrated to `ACCURACY` (see `Part.massProperties`). */
    _measure(): Any;
    get area(): number;
    /** Area centroid. For curved faces it may lie off the face; see `interiorPoint`. */
    center(): Vector;
    /** A point guaranteed to lie on the face. */
    interiorPoint(): Vector;
    /** Outward unit normal at the face point closest to `point` (default: the center). */
    normalAt(point?: VectorLike | null): Vector;
    _naturalIsOutward(): boolean;
    /** True for planes and for flat B-spline faces (control points in one plane). */
    get isPlanar(): boolean;
    /** The face's plane: origin at its centroid, normal pointing out of the body. */
    get plane(): Plane;
    _planeOfFace(): Plane;
    /** Radius of a cylinder, sphere or cone (at its base), minor radius of a torus. */
    get radius(): number;
    /** Axis of a cylinder, cone, sphere, torus or surface of revolution. */
    get axis(): Axis;
    bbox(): BoundBox;
    distanceTo(point: VectorLike | Shape): number;
    /** Where a ray meets this face, nearest first (see `Part.raycast`). */
    raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit[];
    _loops(): Wire[];
    outerWire(): Wire;
    innerWires(): ShapeList<Wire>;
    wires(): ShapeList<Wire>;
    /** The face's edges (seam edges only with `seams`). */
    edges(seams?: boolean): ShapeList<Edge>;
    vertices(): ShapeList<Vertex>;
    faces(): ShapeList<Face>;
    /** Faces sharing an edge with this one. */
    neighbors(): ShapeList<Face>;
    /** A sketch holding a copy of this (planar) face. */
    toSketch(): Sketch;
    /** A sheet body holding a copy of this face. */
    toShell(): Shell;
    /** Extrude a planar face along its normal (see `Sketch.extrude`). */
    extrude(amount: number, options?: ExtrudeOptions): Part;
    _transformed(m: Matrix): Face;
    _identity(): string;
    equals(other: unknown): boolean;
    toString(): string;
}
/** A shape backed by one kernel Brep: a Part, a Shell or a Sketch. */
export declare class _Body extends Shape {
    _h: BrepHandle;
    name: string | null;
    color: ColorLike | null;
    /** (create bodies with the constructors: Box(), Rectangle(), ...) */
    constructor(token?: symbol);
    /** A body of this class around a new Brep (takes ownership). */
    static _wrap<B extends _Body>(this: new (token: symbol) => B, brep: number, options?: BodyOptions): B;
    get _brep(): number;
    _copyBrep(): number;
    /** A body of the same type and metadata around `brep`. */
    _like(brep: number): this;
    /** Frees the kernel's body now, not when the garbage collector gets to it. Faces, edges and
     * vertices taken from it must not be used afterwards. */
    dispose(): void;
    [Symbol.dispose](): void;
    /** The same body with a name (used by exporters and the viewer). */
    named(name: string): this;
    /** The same body with a display color ("steelblue", "#4682b4" or [r, g, b]). */
    colored(color: ColorLike): this;
    faces(): ShapeList<Face>;
    /** All edges. Seam edges (where a closed surface such as a cylinder meets itself) are left out
     * unless `seams` is true. */
    edges(seams?: boolean): ShapeList<Edge>;
    vertices(): ShapeList<Vertex>;
    wires(): ShapeList<Wire>;
    bbox(): BoundBox;
    /** A box around the body that may be slightly too large; far cheaper than `bbox()` (for
     * overlap tests and size scales). */
    _looseBox(): BoundBox;
    center(): Vector;
    /**
     * Minimum distance to a point or to another body.
     *
     * For a point inside a part, and for a body nested in another, it is the distance to the
     * surface (the wall clearance). Bodies that touch or overlap are 0 apart.
     */
    distanceTo(other: VectorLike | Shape): number;
    closestPoint(point: VectorLike): Vector;
    /**
     * Where a ray meets this body's faces, nearest first: the exact points (`Hit`: point, distance
     * from the start, the face, its outward normal there).
     *
     * The ray starts at `origin` and runs along `direction` (an axis or a vector); an axis alone is a
     * ray from its origin along its direction. Points behind the start are not hits. A ray through an
     * edge or a vertex hits once, a ray along a face where it enters the face. `hits[0]` is what the
     * ray sees first; `hits.length` is odd from inside a closed part.
     */
    raycast(origin: VectorLike | Axis, direction?: VectorLike | Axis | null): Hit[];
    /** The curves where this body's surface meets another body's surface, each one once. */
    intersectionCurves(other: _Body): ShapeList<Edge>;
    /** Silhouette curves on the body as seen along `direction` (an axis or a vector). */
    silhouette(direction?: Axis | VectorLike): ShapeList<Edge>;
    /** Project a curve onto the body along `direction` (an axis or a vector); returns the curves on
     * its faces. */
    project(curve: Edge | Wire, direction?: Axis | VectorLike): ShapeList<Edge>;
    /** The body's edges projected onto a plane (a 2D drawing view). */
    outline(plane?: Plane): ShapeList<Edge>;
    _transformed(m: Matrix): Shape;
    /** A copy whose faces and edges are all NURBS (analytic types converted). */
    toNurbs(): this;
    /** Repair gaps, tolerances and topology (mostly needed for imported data). */
    heal(): this;
    _identity(): string;
    equals(other: unknown): boolean;
    /** Counts and measures in one object. */
    info(): {
        type: string;
        faces: number;
        edges: number;
        vertices: number;
        bbox: [number[], number[]];
    };
}
export declare function _disjoint(a: BoundBox, b: BoundBox, tol?: number): boolean;
/** "separate", "touching", "interpenetrating", "a_contains_b" or "b_contains_a" (null if the
 * kernel cannot tell). */
export declare function _relationship(a: _Body, b: _Body): string | null;
/** The bodies in `items`: a body, a face (its sheet) or any nesting of lists of them. */
export declare function _bodies(items: unknown, name?: string): _Body[];
export declare class MassProperties {
    readonly mass: number;
    readonly volume: number;
    readonly area: number;
    readonly center: Vector;
    readonly inertia: number[][];
    readonly density: number;
    constructor(mass: number, volume: number, area: number, center: Vector, inertia: number[][], density: number);
    get principalMoments(): [number, number, number];
    get principalAxes(): [Vector, Vector, Vector];
    toString(): string;
    [inspect](): string;
}
/** A fillet radius: one for all edges, one per edge, or `{ start, end }` varying linearly along
 * each edge (Python's `(start, end)` tuple). */
export type FilletRadius = number | readonly number[] | {
    start: number;
    end: number;
};
/** How a fillet's cross-section is shaped. */
export interface FilletOptions {
    /** null for a circular fillet. "G2" or "G3" make a curvature-continuous blend ("G1" a
     * tangent blend) instead of a circular arc: no visible highlight seam, as used for consumer
     * and Class-A surfaces. */
    continuity?: number | string | null;
    /** Shape of a blend cross-section; above 1 fuller, below 1 flatter. */
    fullness?: number;
}
/**
 * A solid: one or more closed volumes.
 *
 * Combine parts with `fuse` (union), `cut` (difference) and `intersect` (intersection). Each
 * takes parts or any iterables of parts.
 */
export declare class Part extends _Body {
    /** Area, volume and moments (density 1) to the relative `accuracy` (default `ACCURACY`),
     * integrated by smlibpy's C++ with an error estimate (src/cpp/measure.cpp). Kept with the body,
     * which does not change: the next query costs nothing. No warnings: for the checks inside
     * operations; the public measures go through `_measured`. */
    _props(accuracy?: number | null): Any;
    /** `_props` for the user: says when the numbers are not what was asked for (the integration
     * did not reach the accuracy, or the body's faces leave gaps that make its volume uncertain
     * beyond the fifth digit), each thing once per part. */
    _measured(accuracy?: number | null): Any;
    /** The kernel's own integration (SmBrep::ComputePreciseProperties) at a coarse accuracy, for
     * the quick checks of operations (the sign of a volume, a rough change). Cheap, but its error is
     * not bounded by `accuracy`: the volume can be 300 times worse. A body whose faces are misbuilt
     * can fail it. */
    _kernelProps(accuracy: number): Any;
    /** The volume for a plausibility check with a margin of 1e-3 or more: the measured one if the
     * part has it, else the kernel's quick integration at `accuracy` (see `_kernelProps`). */
    _quickVolume(accuracy?: number): number;
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
     * True if the part is a closed, manifold solid that encloses a positive volume.
     *
     * (A body whose faces point inward, or that encloses no volume, such as a profile revolved
     * about an axis through it, is not valid.)
     */
    isValid(): boolean;
    /** Why this is not a sound solid ("empty", "inside out (negative volume)", ...), or null. The
     * volume is integrated coarsely (or `volume`, which the caller integrated anyway, is used):
     * this catches broken bodies, not small errors. A body found sound is not checked again. */
    _solidProblem(volume?: number | null): string | null;
    /** The checks of `_solidProblem` that need no volume integration. */
    _shapeProblem(): string | null;
    /** Diagonal of the kernel's loose bounding box (the tight `bbox()` can cost more than a volume
     * integration). */
    _extent(): number;
    /** Refuse to run a feature on a broken body (the kernel may crash on one). */
    _requireValid(what: string): void;
    /** The separate bodies of this part. */
    solids(): ShapeList<Part>;
    /**
     * This part and others as one part made of cells. Where parts overlap, the overlap becomes a
     * cell of its own; cells that touch share the faces between them (each such face bounds two
     * cells: the body is non-manifold). For simulation meshes that must match across materials, and
     * for models of several materials.
     *
     * `cells()` gives the cells as parts of their own; `volume` is the volume of the union. A merged
     * part is not a manifold solid: `isValid()` is false, and Booleans, fillets and shells take its
     * cells rather than the part itself.
     */
    merge(...others: unknown[]): Part;
    /**
     * The cells of a part made by `merge`, each as a part of its own (every closed region of the
     * body; a cavity is not a cell). A part that is one solid: `[itself]`.
     */
    cells(): ShapeList<Part>;
    _boolean(others: unknown, op: number, name: string): Part;
    _runBoolean(tools: readonly _Body[], op: number, name: string): number;
    /** What is wrong with a Boolean result, or null. An empty result is right where the operands
     * say so (a cut by a tool that encloses the part, an intersection of bodies apart from each
     * other). */
    _booleanProblem(result: Part, tools: readonly Part[], op: number): string | null;
    /** Union with other parts (Python's `+`). */
    fuse(...others: (Part | Iterable<Part>)[]): Part;
    /** Subtract other parts (Python's `-`). */
    cut(...others: (Part | Iterable<Part>)[]): Part;
    /** Keep only the volume shared with the other parts (Python's `&`). */
    intersect(...others: (Part | Iterable<Part>)[]): Part;
    /** Kernel edges of this part for the given edge selection. */
    _ownEdges(edges: unknown): number[];
    _ownFaces(faces: unknown): number[];
    /** The selected edges without seams and tangent (smooth) edges, which cannot be rounded. */
    _sharpEdges(edges: unknown, operation: string): Edge[];
    /** Reject rounds that cannot fit: on a face, two edges running alongside each other must be
     * further apart than their setbacks. (The kernel does not always notice and may return an
     * invalid solid.) */
    _checkRoundSizes(edges: readonly Edge[], setbacks: readonly number[], what: string, sizeName: string): void;
    /** Distance from the edge to where a circular round of `radius` meets the faces. */
    static _setback(e: Edge, radius: number): number;
    /**
     * Check a fillet or chamfer result: a valid solid whose volume changed in the right direction
     * and by no more than the rounds can take away or add.
     *
     * `sizes` are the radii (`shape` "circular" or "blend") or the setbacks (`shape` "chamfer").
     * Near the size limit the kernel can return a valid-looking body with whole regions missing.
     */
    _checkVolumeChange(result: Part, edges: readonly Edge[], what: string, sizes: readonly number[], shape: string): void;
    _withEdges(edges: unknown): [BrepHandle, number[]];
    _withFaces(faces: unknown): [BrepHandle, number[]];
    /**
     * Round edges.
     *
     * @param edges Edges of this part (a selection, a single edge, or faces whose edges to round).
     * @param radius Fillet radius. `{ start, end }` varies the radius linearly along each edge. An
     *   array with one radius per edge rounds edges differently.
     */
    fillet(edges: unknown, radius: FilletRadius, options?: FilletOptions): Part;
    /** Bevel edges. `length` is the setback measured along both adjacent faces. */
    chamfer(edges: unknown, length: number): Part;
    /**
     * Hollow the part out to walls of `thickness`, removing the `openings` faces.
     *
     * The walls grow inward (the outside keeps its size) unless `outward` is true.
     */
    shell(thickness: number, openings?: unknown, options?: {
        outward?: boolean;
    }): Part;
    /** Refuse inward walls that cannot fit: along each axis the part must be thicker than its walls
     * (two, or one where an opening faces that way). The kernel returns wrong bodies there, or
     * crashes. */
    _checkWallFits(t: number, openings: readonly number[]): void;
    /** Grow (positive) or shrink (negative) the part by `distance` everywhere. */
    offset(distance: number): Part;
    /** Run a kernel operation whose result the kernel does not always get right, check the result
     * and retry. (SMLib's offset machinery depends on memory order and occasionally returns a solid
     * with misplaced faces.) */
    _checked(name: string, attempt: () => Part, options: {
        grow: number;
        smaller: boolean;
        attempts?: number;
    }): Part;
    /**
     * Cut the part with a plane.
     *
     * `keep = "above"` keeps the side the plane normal points to, "below" the other side, "both"
     * returns `[above, below]`.
     */
    split(plane: Plane | Face, keep: 'above' | 'below'): Part;
    split(plane: Plane | Face, keep: 'both'): [Part, Part];
    split(plane: Plane | Face): Part;
    /** The cross-section of the part in a plane, as a sketch. */
    section(plane?: Plane | Face): Sketch;
    /** Twist about an axis (default Z) by `angle` degrees over the part; see `twist`. */
    twist(angle: number, options?: TwistOptions): Part;
    /** Scale cross-sections toward an axis (default Z) from 1 to `scale`; see `taper`. */
    taper(scale: number, options?: TaperOptions): Part;
    /** Bend around an axis by `angle` degrees (default: along X, toward +Z); see `bend`. */
    bend(angle: number, options?: BendOptions): Part;
    /** Deform with a `Lattice` (same as `lattice.apply(part)`). */
    deform(lattice: {
        apply(part: Part, options?: Record<string, unknown>): Part;
    }, options?: Record<string, unknown>): Part;
    /** The part with fillets taken out and their edges sharp again: `faces` (fillet faces of this
     * part), or all fillets up to `maxRadius`. With `partial` the fillets the kernel cannot take
     * out stay. See the defeature module. */
    removeFillets(faces?: unknown, options?: {
        maxRadius?: number | null;
        partial?: boolean;
    }): Part;
    /** The part with `faces` (a hole, a boss, a pocket) cut out and the gap closed by the faces
     * around it. With `partial` the features the kernel cannot close stay. See the defeature
     * module. */
    removeFaces(faces: unknown, options?: {
        partial?: boolean;
    }): Part;
    /** Draft angle of every face for the pull direction, with the faces grouped by whether they
     * release (see `DraftAnalysis`). */
    draftAnalysis(direction: Axis | VectorLike, options?: {
        minAngle?: number;
    }): DraftAnalysis;
    /** The closed lines where the part's surface turns from facing `direction` to facing away from
     * it (see `partingLine`). */
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
     * meet them.
     *
     * @param faces Faces of this part (a selection or a single face).
     * @param angle Draft angle in degrees, between -90 and 90 and not 0. A face's draft may be 89
     *   degrees at most.
     * @param neutralPlane Where the faces keep their size, a Plane or a planar face. A face's
     *   normal points out of the part: the top face drafts for a mold that moves up, the bottom face
     *   for one that moves down (use `Plane.XY` there).
     */
    draft(faces: unknown, angle: number, neutralPlane: Plane | Face): Part;
    /** Fold this sheet along a line on its top or bottom face (see `fold`). */
    fold(line: Axis | Edge, angle: number, options: FoldOptions): Part;
    /** Add a flange along a straight outer edge of this sheet (see `flange`). */
    flange(edge: Edge | ShapeList<Edge>, length: number, options: FlangeOptions): Part;
    /** The bends of this sheet metal part (see `bends`). */
    bends(options?: {
        kFactor?: number;
    }): Bend[];
    /** This sheet metal part unfolded flat (see `unfold`). */
    unfold(options?: UnfoldOptions): Part;
    /** The flat pattern of this sheet metal part on XY (see `flatPattern`). */
    flatPattern(options?: UnfoldOptions): FlatPattern;
    toString(): string;
}
/** The axis and the positive angle of a revolve (a negative angle turns the other way). */
export declare function _revolveAxisAngle(ax: Axis, angle: number): [Axis, number];
/** Throw if a feature returned a broken solid (inside out, without volume, open). */
export declare function _requireSolid(part: Part, what: string, hint: string): Part;
/** Release a handle's Brep to a new owner. */
export declare function _take(h: BrepHandle): number;
export declare function _continuity(c: number | string | null | undefined): number | null;
export declare function _flattenEdges(items: unknown): Edge[];
export declare function _flattenFaces(items: unknown): Face[];
/** A sheet body: one or more faces that do not enclose a volume (surfaces). */
export declare class Shell extends _Body {
    get area(): number;
    center(): Vector;
    /** Turn the sheet into a solid of `thickness` (along the face normals; a negative thickness
     * grows against them). With `both` the solid is `thickness` thick in total, half of it to each
     * side of the sheet. */
    thicken(thickness: number, options?: {
        both?: boolean;
    }): Part;
    /** Union with other sheets (Python's `+`). */
    fuse(...others: unknown[]): Shell;
    toString(): string;
}
/** How a sketch is extruded. */
export interface ExtrudeOptions {
    /** Extrude the amount to both sides of the sketch. */
    both?: boolean;
    /** Draft angle in degrees; positive narrows the solid away from the sketch. */
    taper?: number;
    /** Extrude along this direction (an axis or a vector) instead of the normal. */
    direction?: Axis | VectorLike | null;
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
    _plane: Plane;
    _loops: Any;
    _like(brep: number): this;
    static _fromWires(wires: readonly Wire[], plane?: Plane | null): Sketch;
    /** The sketch plane; extrusions follow its normal. */
    get plane(): Plane;
    _transformed(m: Matrix): Sketch;
    _boolean2d(other: unknown, op: number, name: string): Sketch;
    _boolean2dWith(tools: readonly Sketch[], op: number, name: string): Sketch;
    _empty(): Sketch;
    _slabOrEmpty(other: Sketch, op: number, name: string): Sketch;
    /** A cheap check of a union or exclusive or: its area is at least the larger operand's (minus
     * the overlap for xor). Skipped for large sketches, where areas are slow. */
    _boolean2dPlausible(tools: readonly Sketch[], result: Sketch, op: number): boolean;
    _slabBoolean(other: Sketch, op: number, name: string): Sketch;
    /** The union with other sketches (Python's `+`). */
    fuse(...others: unknown[]): Sketch;
    /** The region less other sketches (Python's `-`). */
    cut(...others: unknown[]): Sketch;
    /** The region common to this and other sketches (Python's `&`). */
    intersect(...others: unknown[]): Sketch;
    /** The region in exactly one of the sketches (Python's `^`). */
    xor(...others: unknown[]): Sketch;
    /** Area centroid of the region. */
    center(): Vector;
    /** Total length of the boundary: outlines and holes. */
    get perimeter(): number;
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
        corners?: string;
        round?: boolean | null;
    }): Sketch;
    /** The kernel's offset, for outlines with splines and ellipses. */
    _kernelOffset(distance: number, round: boolean): Sketch;
    /** Region bounded by a loop moved `distance` outward (grow) or inward. */
    _offsetLoop(wire: Wire, distance: number, options: {
        grow: boolean;
        round: boolean;
    }): Sketch | null;
    /**
     * Round corners of the region with tangent arcs of `radius`.
     *
     * `vertices`: the corners to round, as vertices of this sketch (a selection such as
     * `s.vertices().concave()`) or points; null rounds every sharp corner. Corners between lines and
     * arcs are rounded exactly; a corner that does not fit, a point that is not a corner, or a
     * smooth corner throws ModelingError.
     */
    fillet(radius: number, vertices?: Iterable<VectorLike | Vertex> | null): Sketch;
    /** Bevel corners of the region: cut back `length` along both edges of each corner (measured
     * along the edge) and join the two points with a line. `vertices` as for `fillet`; null bevels
     * every sharp corner. */
    chamfer(length: number, vertices?: Iterable<VectorLike | Vertex> | null): Sketch;
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
     * @param amount Distance along the sketch normal (negative goes the other way).
     */
    extrude(amount: number, options?: ExtrudeOptions): Part;
    _extrudeTaper(amount: number, taper: number, both: boolean): Part;
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
    _requireRegion(what: string): void;
    /** Throw if the axis runs through the region (the kernel then returns a body without volume, or
     * an inside-out one, for a full turn). */
    _checkAxisBeside(ax: Axis, isDefault: boolean): void;
    /** Sweep the region along a path. The sketch should sit at the start of the path. */
    sweep(path: Edge | Wire, options?: {
        sharpCorners?: boolean | null;
    }): Part;
    toString(): string;
}
export {};
