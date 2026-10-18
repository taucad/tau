import { defineDotnetKernelAdopter } from '@taucad/dotnet-kernel-core/adopter';

import { picogkClosureLayout } from '#picogk-closure.js';

/**
 * How a host prepares and composes PicoGK from the payload store: its sealed `runtime` closure maps to Microsoft's
 * `dotnet` muxer running the Tau worker assembly, the launch set is matched by pattern, and `load()` imports the
 * kernel only when a host composes it. PicoGK has no seal step.
 * @public
 */
export const picogkNative = defineDotnetKernelAdopter({
  package: '@taucad/picogk',
  ...picogkClosureLayout,
  load: async () => {
    const { picogk } = await import('#picogk.plugin.js');
    return (options) => picogk({ kernels: { default: options } });
  },
});
