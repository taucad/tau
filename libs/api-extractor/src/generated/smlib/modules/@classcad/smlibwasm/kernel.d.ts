type Any = any;
/**
 * The module's functions as Python's `smlibpy._core` has them: the kernel's calls at the top
 * (`k.create_box`), smlibpy's own C++ under its submodule (`k.ext.curve_data`,
 * `k.deform.map_points`), enums as objects of numbers (`k.BooleanOp.UNION`), and the queries of
 * Breps, faces, edges and vertices as functions (`k.brep_faces(b)` for Python's `b.faces()`).
 */
export interface Kernel {
    [name: string]: Any;
}
/** The module itself (its file system is `module.FS`). */
export declare const module: Any;
/**
 * Python's parameters of a function: names in order, `[name, default]` where Python has a
 * default. With them, a call can leave out trailing parameters that have defaults, and can give
 * parameters by name in a trailing object, as Python's keywords:
 * `k.fillet_edges(b, edges, { radius: 2, xsect_type: 2 })`.
 */
export type Signature = readonly (string | readonly [string, unknown])[];
export declare const k: Kernel;
export declare const ext: Any;
/** A modeling operation cannot be done (for example a fillet radius that does not fit). */
export declare class ModelingError extends Error {
    constructor(message: string);
}
/**
 * An SMLib operation failed.
 *
 * `operation` names the smlibwasm call, `status` the kernel status code (e.g.
 * `SM_ERR_INVALID_INPUT`) and `hint` a suggestion when one is known.
 */
export declare class KernelError extends ModelingError {
    readonly operation: string;
    readonly status: string | null;
    readonly detail: string;
    readonly hint: string | null;
    constructor(operation: string, detail: string, status?: string | null, hint?: string | null);
}
/**
 * A failure of the kernel: what the module throws for a kernel call that fails (a plain Error,
 * or one it names, such as TessellationError), and a ModelingError (as Python's RuntimeError
 * covers both). Errors of JavaScript itself (TypeError, RangeError) and of the module's bindings
 * (wrong arguments) are not.
 */
export declare function _isRuntimeError(e: unknown): e is Error;
/** Runs `fn`; a failure of the kernel becomes a KernelError with context. */
export declare function kernelCall<T>(operation: string, fn: () => T, hint?: string | null): T;
declare abstract class Handle {
    protected _p: number;
    private readonly _kind;
    constructor(kind: string, p: number);
    /** A number that tells handles apart for as long as they live (their kernel objects' numbers
     * can be reused once freed). */
    readonly id: number;
    /** Gives the kernel object to a new owner: this handle no longer frees it. */
    release(): number;
    /** Frees the kernel object now (it is freed on garbage collection otherwise). */
    dispose(): void;
    [Symbol.dispose](): void;
}
/**
 * Owns one kernel Brep and frees it with the last reference. `sound` records that the body was
 * found a sound solid, `props` its integrated mass properties (a body's Brep does not change
 * once wrapped).
 */
export declare class BrepHandle extends Handle {
    sound: boolean;
    props: Any;
    constructor(brep: number);
    get brep(): number;
}
/** Owns one standalone kernel curve. */
export declare class CurveHandle extends Handle {
    constructor(curve: number);
    get curve(): number;
}
/** Owns one standalone kernel surface. */
export declare class SurfaceHandle extends Handle {
    constructor(surface: number);
    get surface(): number;
}
/** Owns one kernel PolyBrep (triangle mesh). */
export declare class PolyHandle extends Handle {
    constructor(poly: number);
    /** The mesh, or 0 once disposed. */
    get poly(): number;
}
/** Where smlibwasm's warnings go (Python's warnings.warn): `console.warn` unless set here. */
export declare function setWarningHandler(handler: (message: string) => void): void;
export declare function _warn(message: string): void;
export {};
