import type { PythonClosureOptions } from '@taucad/python-kernel-core';
import type { ClosureLaunch, SealClosureInput, SealClosureRefusal } from '@taucad/runtime/preparation/node';

import { build123dNative } from '#native.js';

/**
 * Build123d kernel options for a closure the preparation host sealed.
 * @public
 */
export type Build123dClosureOptions = PythonClosureOptions;

/**
 * Build123d's launch set: the interpreter, the worker, its two support modules and the four `tau_kernel` modules,
 * which every launch hashes. The preparation host records their rows in the closure's launch index, so a launch never
 * reads the 22,000-row receipt; the rest of the closure is re-verified when the worker exits before its handshake.
 * @returns Closure-relative paths.
 * @public
 */
export const build123dLaunchSet: () => readonly string[] = build123dNative.launchSet;

/**
 * Map a sealed `engine` closure to the options `build123dKernel` already takes: the interpreter, the worker and its
 * support modules, each with the digest the receipt recorded, and the closure root as the runtime path the sandbox
 * may read. The session hashes exactly these files at launch (D8), so the per-launch check stays O(1).
 *
 * @param receipt - The closure `tau prepare build123d` sealed: its receipt, or the launch view a preparation host's
 *   `inspectLaunch` reads from its launch index.
 * @returns Options that `build123dOptionsSchema` accepts.
 * @throws {Error} When the receipt lacks the interpreter or a worker script.
 * @public
 * @example <caption>Compose the kernel from the prepared closure</caption>
 * ```typescript
 * import { build123d, build123dOptionsFromClosure } from '@taucad/build123d';
 * import type { PreparationHost } from '@taucad/runtime/preparation/node';
 * async function preparedKernel(host: PreparationHost) {
 *   const { state } = await host.inspect({ package: '@taucad/build123d' });
 *   if (state.status === 'ready') {
 *     return build123d({ kernels: { default: build123dOptionsFromClosure(state.receipts['engine']!) } });
 *   }
 * }
 * ```
 */
export const build123dOptionsFromClosure: (receipt: ClosureLaunch) => Build123dClosureOptions =
  build123dNative.optionsFromClosure;

/**
 * The seal step a host passes with `@taucad/build123d` to the preparation host: it compiles the whole closure's
 * bytecode inside the kernel sandbox (D22) and proves `import OCP, build123d` loads, refusing with
 * `missing-system-library` when the host lacks a library the closure links against.
 *
 * @param input - The unpacked closure the host is about to seal.
 * @returns A refusal, or `undefined` once the closure is compiled and loads.
 * @throws {PreparationError} `EXTRACTION_REFUSED` when compilation fails or the closure does not import.
 * @public
 */
export const sealBuild123dClosure: (input: SealClosureInput) => Promise<SealClosureRefusal | undefined> =
  build123dNative.seal;
