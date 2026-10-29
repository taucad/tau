import { Face, type Part, ShapeList } from './shapes.js';
type Any = any;
/** Angle (degrees) between the normals of two faces along an edge below which the faces meet
 * tangentially: the edge is a rail of a fillet. */
export declare const TANGENCY = 2;
/**
 * Seconds the kernel may take for one step that can crash or loop. Where JavaScript can wait for
 * another thread (Node, and Web Workers of a cross-origin isolated page), such steps run in a probe
 * worker, a kernel of its own, on copies of the bodies: if the kernel crashes there or takes longer
 * than this, a ModelingError says so and this kernel is left alone (SMLib's patching, offset and
 * Boolean code can crash or loop on some parts). This kernel never runs the step itself: what the
 * step made comes back as an exact copy (binary `.smb`). The steps are those of `removeFillets`,
 * `removeFaces`, `surfaceFillet`, `shell`, `offset`, `thicken` and `Part.cells()`, fillets and
 * chamfers of parts read from files (STEP, `.smb`, USD) and, with GUARD_BOOLEANS, Booleans. Where
 * no probe worker runs (a browser's main thread), the step runs in this kernel, held to this many
 * seconds by the kernel's deadline (`ext.set_deadline`): past it, the long loops of the kernel's
 * surface and topology intersections give up and the step is dropped as one that did not finish (a
 * step that spends its time elsewhere in the kernel is not stopped). `0` runs the kernel directly,
 * without a limit. Python's `GUARD_SECONDS`; `setGuardSeconds` sets it.
 */
export declare let GUARD_SECONDS: number;
/**
 * Whether every Boolean (`fuse`, `cut`, `intersect`, `merge`) runs in the probe worker too, as the
 * steps of GUARD_SECONDS (off by default: the bodies go there and back as `.smb`). For long batch
 * runs over unknown inputs, where a crash of the kernel must not end the run. Python's
 * `GUARD_BOOLEANS`; `setGuardBooleans` sets it.
 */
export declare let GUARD_BOOLEANS: boolean;
/** Sets GUARD_BOOLEANS (Python's `smlibpy.defeature.GUARD_BOOLEANS = on`); returns the value it
 * had. */
export declare function setGuardBooleans(on: boolean): boolean;
/** Sets GUARD_SECONDS (Python's `smlibpy.defeature.GUARD_SECONDS = seconds`); returns the value it
 * had. */
export declare function setGuardSeconds(seconds: number): number;
/** Cached blend data of faces (kernel face -> object or null). */
export declare class _Blends {
    info(f: Face): Any;
    /** A curved face that meets two other faces tangentially along edges that run across its
     * curvature (its rails), where those faces are walls, not fillets themselves. */
    isEdgeFillet(f: Face): boolean;
    /** The edge fillets a corner patch joins, or [] if `f` is no corner patch: a curved face with
     * three or more edges that is no edge fillet, meets all its neighbours tangentially, joins at
     * least two edge fillets and is curved about as tightly as they are. (A wall between two
     * fillets, such as the side of a disc rounded at both ends, is no corner.) */
    cornerFillets(f: Face): Face[];
    /** The fillet radius of an edge fillet, or of the fillets a corner patch joins. */
    radius(f: Face): number;
    convex(f: Face): boolean;
}
/** The fillets among `faces` (see `ShapeList.fillets`). */
export declare function filletFaces(faces: Iterable<unknown>, maxRadius?: number | null, options?: {
    _blends?: _Blends | null;
}): ShapeList<Face>;
/** See `Part.removeFillets`. */
export declare function removeFillets(part: Part, faces?: unknown, options?: {
    maxRadius?: number | null;
    partial?: boolean;
}): Part;
/** See `Part.removeFaces`. */
export declare function removeFaces(part: Part, faces: unknown, options?: {
    partial?: boolean;
}): Part;
export {};
