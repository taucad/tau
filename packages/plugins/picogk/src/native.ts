import { defineDotnetKernelAdopter } from '@taucad/dotnet-kernel-core/adopter';
import manifest from '@taucad/picogk/tau-plugin.json' with { type: 'json' };

import { picogkClosureLayout } from '#picogk-closure.js';

/**
 * How a host prepares PicoGK and how the kernel binds to the closure: its sealed `runtime` closure maps to
 * Microsoft's `dotnet` muxer running the Tau worker assembly, and the launch set is matched by pattern. PicoGK has no
 * seal step. Imports no kernel code, so a parent process can prepare PicoGK by importing this module alone.
 * @public
 */
export const picogkNative = defineDotnetKernelAdopter({
  package: '@taucad/picogk',
  manifest,
  moduleUrl: import.meta.url,
  ...picogkClosureLayout,
});
