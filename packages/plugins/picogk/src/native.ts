import { defineNativeKernelAdopter } from '@taucad/native-process-core/adopter';

import { picogkLaunchSet, picogkOptionsFromClosure } from '#picogk-closure.js';
import { picogkOptionsSchema } from '#picogk.schemas.js';

/**
 * How a host prepares and composes PicoGK from the payload store: its sealed `runtime` closure maps to Microsoft's
 * `dotnet` muxer running the Tau worker assembly, the launch set is matched by pattern, and `load()` imports the
 * kernel only when a host composes it. PicoGK has no seal step.
 * @public
 */
export const picogkNative = defineNativeKernelAdopter({
  package: '@taucad/picogk',
  ecosystem: 'nuget',
  // A sealed closure always names its root and the worker assembly the muxer runs.
  optionsSchema: picogkOptionsSchema.required({ runtimePath: true, workerArguments: true }),
  optionsFromClosure: picogkOptionsFromClosure,
  launchSet: picogkLaunchSet,
  load: async () => {
    const { picogk } = await import('#picogk.plugin.js');
    return (options) => picogk({ kernels: { default: options } });
  },
});
