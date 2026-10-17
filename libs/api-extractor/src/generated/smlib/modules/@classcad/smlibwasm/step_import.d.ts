import { type Location, Plane, Vector } from './geometry.js';
import { Edge, Part, Shell, Wire, type ShapeList } from './shapes.js';
declare const inspect: unique symbol;
/** A coordinate system of a STEP file (a named `AXIS2_PLACEMENT_3D`) at its place in the
 * assembly. `product` names the part or assembly it belongs to. */
export declare class StepFrame {
    readonly name: string;
    readonly plane: Plane;
    readonly product: string;
    /** [r, g, b] from 0 to 1, or null */
    readonly color: readonly number[] | null;
    constructor(name: string, plane: Plane, product?: string, color?: readonly number[] | null);
    /** The placement that moves the world origin onto this coordinate system. */
    get location(): Location;
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
/** A curve of a STEP file that belongs to no body (wireframe geometry, contours), at its place in
 * the assembly: an `Edge`, or a `Wire` for a composite curve. */
export declare class StepCurve {
    readonly name: string;
    readonly shape: Edge | Wire;
    readonly product: string;
    /** [r, g, b] from 0 to 1, or null */
    readonly color: readonly number[] | null;
    constructor(name: string, shape: Edge | Wire, product?: string, color?: readonly number[] | null);
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
/** A point of a STEP file that belongs to no body, at its place in the assembly. */
export declare class StepPoint {
    readonly name: string;
    readonly point: Vector;
    readonly product: string;
    /** [r, g, b] from 0 to 1, or null */
    readonly color: readonly number[] | null;
    constructor(name: string, point: Vector, product?: string, color?: readonly number[] | null);
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
/** Everything `readStep` reads from a STEP file: the bodies (what `importStep` returns, always as
 * a list), and the coordinate systems, curves and points that belong to no body. */
export declare class StepModel {
    readonly bodies: ShapeList<Part | Shell>;
    readonly frames: StepFrame[];
    readonly curves: StepCurve[];
    readonly points: StepPoint[];
    constructor(bodies: ShapeList<Part | Shell>, frames?: StepFrame[], curves?: StepCurve[], points?: StepPoint[]);
    /** The coordinate system called `name` as a `Plane`. Where several have that name (each part of
     * a tool assembly has its own `MCS`), `product` picks the one of the product whose name is or
     * begins with it. */
    frame(name: string, product?: string | null): Plane;
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
/**
 * Read everything STEP file contents hold that smlibwasm can use (the text, or the bytes of the
 * file): its bodies, and the coordinate systems, curves and points that belong to no body.
 *
 * `readStep` for the contents in memory (in the browser too); see `readStep`.
 */
export declare function fromStepModel(data: string | Uint8Array, options?: {
    heal?: boolean;
}): StepModel;
/**
 * Read everything a STEP file holds that smlibwasm can use: its bodies, and the coordinate systems,
 * curves and points that belong to no body.
 *
 * The bodies are those of `importStep`, as a `ShapeList` also when there is one. Coordinate
 * systems are the placements of supplemental geometry (as NX, CATIA and tool catalogs write
 * `MCS`, `PCS` or `CSW`) and the named placements of shape representations; curves and points are
 * the wireframe geometry (contours such as a tool's cutting edge line, curve sets, reference
 * points). Each carries its name and the product it belongs to, at its place in the assembly, in
 * millimeters. Items on hidden layers are left out. A file with no bodies gives an empty
 * `bodies`. `heal` as for `importStep` (default true).
 */
export declare function readStep(path: string, options?: {
    heal?: boolean;
}): StepModel;
/**
 * Read the solids and surfaces of STEP file contents (AP203, AP214, AP242 B-rep data): the text,
 * or the bytes of the file.
 *
 * Returns a single `Part` (or `Shell`) when the file holds one body, otherwise a `ShapeList` of
 * them. Lengths are converted to millimeters; assembly placements are applied; names and colors
 * are kept. `heal` repairs bodies that come out invalid (valid ones are left alone; default true).
 */
export declare function fromStep(data: string | Uint8Array, options?: {
    heal?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;
/**
 * Read the solids and surfaces of a STEP file (AP203, AP214, AP242 B-rep data).
 *
 * Returns a single `Part` (or `Shell`) when the file holds one body, otherwise a `ShapeList` of
 * them. Lengths are converted to millimeters; assembly placements are applied; names and colors
 * are kept. `heal` repairs bodies that come out invalid (valid ones are left alone; default true).
 */
export declare function importStep(path: string, options?: {
    heal?: boolean;
}): Part | Shell | ShapeList<Part | Shell>;
export {};
