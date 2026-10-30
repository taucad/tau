/// <reference lib="esnext.disposable" />
import { KernelError, ModelingError } from './_errors.js';
export { KernelError, ModelingError };
type Any = any;
/**
 * The module's functions as Python's `smlibpy._core` has them: the kernel's calls at the top
 * (`k.create_box`, `k.intersect_surfaces`), smlibpy's own C++ under its submodule
 * (`k.ext.curve_data`, `k.deform.map_points`), enums as objects of numbers (`k.BooleanOp.UNION`,
 * `k.ContinuityType.G1`), and the queries of Breps, faces, edges and vertices as functions
 * (`k.brep_faces(b)` for Python's `b.faces()`).
 *
 * Every function SmPyLib binds for Python's module level is here, with Python's parameters and
 * defaults (`k.create_partial_cylinder([0, 0, 0], 10, 20, 0, 90)`, keywords in a trailing object:
 * `k.boolean_union(a, b, { post_process: false })`), and every method of its classes
 * (`k.brep_area(b)`, `k.poly_ray_intersection(mesh, ...)`). Most are SmPyLib's own code, compiled
 * into the module (`k.smpylib.<name>` and `k.smpylib.<Class>.<method>` have them all); those
 * smlibwasm calls itself have bindings of their own, with the same names, parameters and results.
 * Kernel objects are numbers (0: none), points `[x, y, z]`, lists of numbers Float64Arrays,
 * Python's tuples arrays and its dicts plain objects; a result that is a new Brep, curve or surface
 * is the caller's, to free with `k.ext.delete_brep` (or to hand to a `BrepHandle`, ...). Not here:
 * SmPyLib's USD functions, the constructors of its classes and its value classes (Vec3, Vec2,
 * Axis2Placement: arrays, and `{origin, x, y}` from `k.Axis2Placement`).
 */
export interface Kernel {
    [name: string]: Any;
}
/** The module itself (its file system is `module.FS`), loaded from the file next to its loader,
 * or from where `init` (init.ts) said. (defeature's probe worker imports this module: it imports
 * no module that starts a worker, see _guard.ts) */
export declare const module: Any;
/**
 * Python's parameters of a function: names in order, `[name, default]` where Python has a
 * default. With them, a call can leave out trailing parameters that have defaults, and can give
 * parameters by name in a trailing object, as Python's keywords:
 * `k.fillet_edges(b, edges, { radius: 2, xsect_type: 2 })`.
 */
export type Signature = readonly (string | readonly [
    string,
    unknown
])[];
export declare const k: Kernel;
export declare const ext: Any;
/** Runs `fn`; a failure of the kernel becomes a KernelError with context. Memory that is used up
 * is SM_ERR_OUT_OF_MEMORY, with a hint that says so in place of `hint`; a crash of the kernel (a
 * trap) says so before `hint`. The module keeps a reserve of its memory for the step that finds it
 * used up (js/cpp/bind_runtime.cpp), so that the kernel does not run out in the middle of its work:
 * where the reserve cannot be taken again before a step, the step fails with SM_ERR_OUT_OF_MEMORY
 * before the kernel runs (kernel plan W8). */
export declare function kernelCall<T>(operation: string, fn: () => T, hint?: string | null): T;
/** What the kernel's memory holds, in bytes (see `memoryUsage`). */
export interface MemoryUsage {
    /** What the kernel's objects take: the bytes its allocator has handed out and not got back (less
     * the 8 MB the module holds in reserve for the step that finds the memory used up). */
    readonly used: number;
    /** The module's memory: it grows when the kernel needs more, up to `limit`, and never shrinks. */
    readonly heap: number;
    /** What the module's memory can grow to: 4 GB (less 64 kB), as far as a 32-bit WebAssembly
     * module reaches. */
    readonly limit: number;
    /** The kernel objects (bodies, curves, surfaces, meshes) that JavaScript holds and that are not
     * freed yet: neither disposed nor garbage collected. A count, not bytes. */
    readonly handles: number;
    /** The times the kernel crashed (a trap of the module) since it was loaded. After a crash its
     * memory may be damaged, and what it computes may be wrong: the first crash warns, and an app
     * that goes on loads the module again (reloads the page) or models in a KernelWorker, which
     * starts a new kernel after one. A count, not bytes. */
    readonly crashes: number;
}
/**
 * What the kernel's memory holds, in bytes: what its objects take (`used`), how far the module's
 * memory has grown (`heap`) and how far it can grow (`limit`, 4 GB). Each body, mesh and curve
 * lives there until it is disposed or garbage collected; a kernel call that finds the memory used
 * up fails with a KernelError of status SM_ERR_OUT_OF_MEMORY. Also how many kernel objects
 * JavaScript holds (`handles`) and how often the kernel crashed (`crashes`), after which its memory
 * may be damaged. The module of each thread (a page, a worker) has its own memory. (A
 * JavaScript-only function: smlibpy's kernel shares the memory of its process, which a crash
 * ends.)
 */
export declare function memoryUsage(): MemoryUsage;
/** The owner of a kernel object: it frees the object when it is garbage collected, or at once with
 * `dispose()` (BrepHandle, CurveHandle, SurfaceHandle, PolyHandle). */
export declare abstract class Handle {
    private readonly _kind;
    constructor(kind: string, p: number);
    /** A number that tells handles apart for as long as they live (their kernel objects' numbers
     * can be reused once freed). */
    readonly id: number;
    /** Gives the kernel object to a new owner: this handle no longer frees it. */
    release(): number;
    /** False once the kernel object was disposed (or given to a new owner). */
    get alive(): boolean;
    /** Frees the kernel object now (it is freed on garbage collection otherwise). */
    dispose(): void;
    [Symbol.dispose](): void;
}
/**
 * Runs `fn` and frees every kernel object (body, curve, surface, mesh) made while it runs that its
 * result does not hold, at once: the parts, sketches, faces and meshes `fn` returns (also in
 * arrays, ShapeLists, Maps, Sets and plain objects) stay, everything else it made, named or not
 * (the operands of a chain such as `Box(...).cut(Cylinder(...)).fillet(...)`, a step's
 * intermediates), is disposed when `fn` returns. Objects made before the scope stay as they are.
 * Where `fn` throws, what it made is freed (what the error holds stays) and the error goes on.
 *
 * The garbage collector frees kernel objects only between tasks of the event loop, so a loop that
 * builds without returning to the event loop keeps every object until it ends: `scope` keeps such
 * a loop's memory flat. Scopes nest: what an inner scope returns belongs to the outer one.
 *
 * `fn` must return its result, not a promise (a scope cannot see what an async function makes after
 * its first `await`): a promise is a TypeError, and nothing is freed. Do not keep objects that `fn`
 * makes anywhere but in its result (in a variable outside, a cache): they are disposed, and using
 * them is a TypeError. (A JavaScript-only function: Python frees each kernel object with its last
 * reference.)
 */
export declare function scope<T>(fn: () => T): T;
/**
 * Owns one kernel Brep and frees it with the last reference. `sound` records how far the body was
 * found a sound solid (0: not checked; the levels are in shapes.ts), `props` its integrated mass
 * properties, `imported` whether it was read from a file or made from such a body (its fillets run
 * in the probe worker, see GUARD_SECONDS).
 *
 * No operation changes a body's faces, edges and vertices or their geometry once it is wrapped, but
 * measuring it stores refitted trim curves in its Brep (the first area, volume or tight box of a
 * face): later measures can differ from the first in the last digits, and a `.smb` file written after
 * a measure from one written before (kernel plan T6). So caches hold what was measured first, and a
 * body scaled differently along its axes gets its analytic faces back before anything measures it.
 * `named()` and `colored()` wrap the same handle (kernel plan T8): its caches serve both bodies, and a
 * measure of one stores its trims for both.
 */
export declare class BrepHandle extends Handle {
    sound: number;
    props: Any;
    /** The tags of its faces and edges (`ext.topology_tags`, read once). */
    tags: [
        number[][],
        number[][]
    ] | null;
    /** Its shells and the cells each face bounds (`ext.brep_shells`, read once; kernel plan T7). */
    shells: [
        Any[],
        number[][]
    ] | null;
    /** For a body made by `Part.merge` (or a copy of one): the parts it was merged from, the placement
     * it was moved by since, and its cells' sources once found (kernel plan B15). */
    merged: {
        parts: Any[];
        placement: Float64Array;
        cells: Any[][] | null;
    } | null;
    /** For a cell of a merged part: the parts it lies in. */
    sources: Any[] | null;
    /** The meshes rays are cast against, by purpose (a body's Brep does not change once wrapped). */
    meshes: Map<string, any>;
    imported: boolean;
    constructor(brep: number);
    get brep(): number;
    /** Holds another Brep in place of its own, which the kernel deleted (as Python's `h.brep = ...`):
     * `ext.boolean` can give its result as a new Brep. */
    set brep(brep: number);
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
