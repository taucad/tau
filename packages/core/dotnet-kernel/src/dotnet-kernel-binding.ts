import { bindNativeKernel } from '@taucad/native-process-core/store';
import type { BoundNativeKernel } from '@taucad/native-process-core/store';

import type { DotnetKernelAdopter } from '#dotnet-kernel-adopter.js';
import type { DotnetClosure, DotnetClosureOptions, DotnetKernelOptions } from '#dotnet.schemas.js';

/**
 * Bind a native .NET kernel to its closure in `initialize`: an explicit `options.closure` wins; otherwise the
 * closure resolver a host installed, or the payload store, gives the sealed closure the deployment maps to options.
 * @param input - The kernel's deployment and its parsed options.
 * @returns The session options the closure and the host's bounds give.
 * @throws {UnpreparedKernelError} When the closure is not prepared or the host is not a target of the package; the
 *   runtime forwards its `KERNEL_NOT_PREPARED` issue and retries on the next operation.
 * @public
 */
export const bindDotnetKernel = async (input: {
  readonly adopter: DotnetKernelAdopter;
  readonly options: DotnetKernelOptions;
}): Promise<BoundNativeKernel<DotnetClosureOptions | DotnetClosure, DotnetKernelOptions>> =>
  bindNativeKernel({ deployment: input.adopter, kernel: input.adopter.kernel, options: input.options });
