/** A modeling operation cannot be done (for example a fillet radius that does not fit). */
export declare class ModelingError extends Error {
    constructor(message: string);
}
/**
 * An SMLib operation failed.
 *
 * `operation` names the smlibwasm call, `status` the kernel status code (e.g.
 * `SM_ERR_INVALID_INPUT`) and `hint` a suggestion when one is known. `trace` says where the
 * kernel gave up: the failures it reported during the call, oldest first, at most the last 48, as
 * `"SM_ERR at SmFilletExecutive.cpp:1603 (DoFillet)"`. It ends with the chain from the deepest
 * function that failed to the kernel's API function; what comes before are errors the kernel
 * recovered from. Empty where the error did not come from a kernel function (or the kernel
 * crashed). For bug reports: the sites change with the kernel.
 */
export declare class KernelError extends ModelingError {
    readonly operation: string;
    readonly status: string | null;
    readonly detail: string;
    readonly hint: string | null;
    /** Where the kernel gave up (see the class); set by `kernelCall`. */
    readonly trace: readonly string[];
    constructor(operation: string, detail: string, status?: string | null, hint?: string | null);
}
