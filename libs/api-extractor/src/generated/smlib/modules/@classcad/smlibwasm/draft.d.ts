import { type Axis, Plane, Vector, type VectorLike } from './geometry.js';
import { Face, Part, ShapeList, Wire } from './shapes.js';
declare const inspect: unique symbol;
/** Draft angles (degrees) within this of 0 count as none: such a face is parallel to the pull
 * direction there. */
export declare const ANGLE_TOLERANCE = 0.000001;
/** Least and greatest n . d over a face. */
export declare function _range(face: Face, d: Vector): [number, number];
/** The draft of one face: the least and the greatest draft angle over it (degrees) and the group
 * it falls in ("positive", "insufficient", "vertical" or "undercut"). */
export declare class FaceDraft {
    readonly face: Face;
    readonly minAngle: number;
    readonly maxAngle: number;
    readonly kind: string;
    constructor(face: Face, minAngle: number, maxAngle: number, kind: string);
    equals(other: unknown): boolean;
    toString(): string;
    [inspect](): string;
}
/**
 * The draft of every face of a part for one pull direction.
 *
 * The faces fall into four groups, each a ShapeList of faces of the part (usable as a selection,
 * for example for highlighting):
 *
 * - `positive`: at least `minAngle` of draft everywhere; the face releases.
 * - `insufficient`: no negative draft, but less than `minAngle` somewhere.
 * - `vertical`: parallel to the pull direction everywhere (0 degrees).
 * - `undercut`: turns away from the pull direction somewhere (negative draft).
 *
 * `faces` holds one `FaceDraft` per face with its least and greatest angle.
 */
export declare class DraftAnalysis {
    readonly direction: Vector;
    readonly minAngle: number;
    readonly faces: readonly FaceDraft[];
    constructor(direction: Vector, minAngle: number, faces: readonly FaceDraft[]);
    _group(kind: string): ShapeList<Face>;
    /** Faces with at least `minAngle` of draft everywhere. */
    get positive(): ShapeList<Face>;
    /** Faces with less than `minAngle` of draft somewhere, but nowhere negative. */
    get insufficient(): ShapeList<Face>;
    /** Faces parallel to the pull direction (no draft). */
    get vertical(): ShapeList<Face>;
    /** Faces that turn away from the pull direction somewhere (negative draft). */
    get undercut(): ShapeList<Face>;
    /** True if every face has at least `minAngle` of draft. */
    get ok(): boolean;
    /** The least and the greatest draft angle of a face of the part (degrees). */
    angles(face: Face): [number, number];
    [Symbol.iterator](): IterableIterator<FaceDraft>;
    /** The number of faces (Python's `len`). */
    get length(): number;
    toString(): string;
    [inspect](): string;
}
/** See `Part.draftAnalysis`. */
export declare function draftAnalysis(part: Part, direction: Axis | VectorLike, options?: {
    minAngle?: number;
}): DraftAnalysis;
/** See `Part.partingLine`. */
export declare function partingLine(part: Part, direction: Axis | VectorLike): ShapeList<Wire>;
/** Angle (degrees) between the normals of two faces along an edge below which the faces meet
 * tangentially. A face that meets a drafted face so must be drafted with it. */
export declare let TANGENCY: number;
/** Sets TANGENCY (for tests, as Python's monkeypatch does); returns the value it had. */
export declare function _setTangency(value: number): number;
/** See `Part.draft`. */
export declare function draftFaces(part: Part, faces: unknown, angle: number, neutralPlane: Plane | Face): Part;
export {};
