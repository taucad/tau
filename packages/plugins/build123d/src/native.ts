import { definePythonKernelAdopter } from '@taucad/python-kernel-core';

import { build123dWorker } from '#build123d-worker.js';
import { build123dOptionsSchema } from '#build123d.schemas.js';
import { build123dProjectLibraries } from '#project-manifest.js';

/**
 * How a host prepares and composes Build123d from the payload store: its sealed `engine` closure maps to the
 * interpreter, the worker and its support modules, the seal step compiles bytecode and proves the closure imports, and
 * `load()` imports the kernel only when a host composes it.
 * @public
 */
export const build123dNative = definePythonKernelAdopter({
  package: '@taucad/build123d',
  worker: build123dWorker,
  selfTestImports: ['OCP', 'build123d'],
  projectLibraries: build123dProjectLibraries,
  // A sealed closure always names its root, which the sandbox reads the interpreter and the worker from.
  optionsSchema: build123dOptionsSchema.required({ runtimePath: true }),
  load: async () => {
    const { build123d } = await import('#build123d.plugin.js');
    return (options) => build123d({ kernels: { default: options } });
  },
});
