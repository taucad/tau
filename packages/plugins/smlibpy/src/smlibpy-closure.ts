import type { PythonClosureOptions } from '@taucad/python-kernel-core';
import type { ClosureLaunch, SealClosureInput, SealClosureRefusal } from '@taucad/runtime/preparation/node';

import { smlibpyNative } from '#native.js';

/**
 * SMLibPy kernel options for a closure the preparation host sealed.
 * @public
 */
export type SmlibpyClosureOptions = PythonClosureOptions;

/**
 * SMLibPy's launch set: the interpreter, the worker, its two support modules and the four `tau_kernel` modules, which
 * every launch hashes. The preparation host records their rows in the closure's launch index; the rest of the closure
 * is re-verified when the worker exits before its handshake.
 * @returns Closure-relative paths.
 * @public
 */
export const smlibpyLaunchSet: () => readonly string[] = smlibpyNative.launchSet;

/**
 * Map a sealed `engine` closure to the options `smlibpyKernel` already takes: the interpreter, the worker and its
 * support modules, each with the digest the receipt recorded, and the closure root as the runtime path the sandbox
 * may read.
 *
 * @param receipt - The closure `tau prepare smlibpy` sealed, or the launch view a preparation host's `inspectLaunch`
 *   reads from its launch index.
 * @returns Options that `smlibpyOptionsSchema` accepts.
 * @throws {Error} When the receipt lacks the interpreter or a worker script.
 * @public
 * @example <caption>Compose the kernel from the prepared closure</caption>
 * ```typescript
 * import { smlibpy, smlibpyOptionsFromClosure } from '@taucad/smlibpy';
 * import type { PreparationHost } from '@taucad/runtime/preparation/node';
 * async function preparedKernel(host: PreparationHost) {
 *   const { state } = await host.inspect({ package: '@taucad/smlibpy' });
 *   if (state.status === 'ready') {
 *     return smlibpy({ kernels: { default: smlibpyOptionsFromClosure(state.receipts['engine']!) } });
 *   }
 * }
 * ```
 */
export const smlibpyOptionsFromClosure: (receipt: ClosureLaunch) => SmlibpyClosureOptions =
  smlibpyNative.optionsFromClosure;

/**
 * The seal step a host passes with `@taucad/smlibpy` to the preparation host: it compiles the closure's bytecode
 * inside the kernel sandbox and proves `import smlibpy, numpy` loads, refusing with `missing-system-library` when the
 * host lacks a library the closure links against.
 *
 * @param input - The unpacked closure the host is about to seal.
 * @returns A refusal, or `undefined` once the closure is compiled and loads.
 * @throws {PreparationError} `EXTRACTION_REFUSED` when compilation fails or the closure does not import.
 * @public
 */
export const sealSmlibpyClosure: (input: SealClosureInput) => Promise<SealClosureRefusal | undefined> =
  smlibpyNative.seal;
