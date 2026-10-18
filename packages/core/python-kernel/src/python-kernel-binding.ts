import { bindNativeKernel } from '@taucad/native-process-core/store';
import type { BoundNativeKernel } from '@taucad/native-process-core/store';

import type { PythonClosureOptions } from '#python-closure.js';
import type { PythonKernelAdopter } from '#python-kernel-adopter.js';
import type { PythonClosure } from '#python-kernel.js';

/**
 * The parsed options of a Python kernel, as `initialize` receives them.
 * @public
 */
export type ParsedPythonKernelOptions = {
  readonly closure?: PythonClosure | undefined;
  readonly requestTimeout: number;
  readonly maxArtifactBytes: number;
};

/**
 * Bind a Python kernel to its closure in `initialize`: an explicit `options.closure` wins; otherwise the closure
 * resolver a host installed, or the payload store, gives the sealed closure the deployment maps to options.
 * @param input - The kernel's deployment and its parsed options.
 * @returns The session options the closure and the host's bounds give.
 * @throws {UnpreparedKernelError} When the closure is not prepared or the host is not a target of the package; the
 *   runtime forwards its `KERNEL_NOT_PREPARED` issue and retries on the next operation.
 * @public
 */
export const bindPythonKernel = async (input: {
  readonly adopter: PythonKernelAdopter;
  readonly options: ParsedPythonKernelOptions;
}): Promise<BoundNativeKernel<PythonClosureOptions | PythonClosure, ParsedPythonKernelOptions>> =>
  bindNativeKernel({ deployment: input.adopter, kernel: input.adopter.worker.kernelId, options: input.options });
