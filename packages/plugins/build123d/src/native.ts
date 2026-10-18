import { defineNativeKernelAdopter } from '@taucad/native-process-core/adopter';

import { build123dLaunchSet, build123dOptionsFromClosure, sealBuild123dClosure } from '#build123d-closure.js';
import { build123dOptionsSchema } from '#build123d.schemas.js';

/**
 * How a host prepares and composes Build123d from the payload store: its sealed `engine` closure maps to the
 * interpreter, the worker and its support modules, the seal step compiles bytecode and proves the closure imports, and
 * `load()` imports the kernel only when a host composes it.
 * @public
 */
export const build123dNative = defineNativeKernelAdopter({
  package: '@taucad/build123d',
  ecosystem: 'pypi',
  // A sealed closure always names its root, which the sandbox reads the interpreter and the worker from.
  optionsSchema: build123dOptionsSchema.required({ runtimePath: true }),
  optionsFromClosure: build123dOptionsFromClosure,
  seal: sealBuild123dClosure,
  launchSet: build123dLaunchSet,
  load: async () => {
    const { build123d } = await import('#build123d.plugin.js');
    return (options) => build123d({ kernels: { default: options } });
  },
});
