import manifest from '@taucad/build123d/tau-plugin.json' with { type: 'json' };
import { definePythonKernelAdopter } from '@taucad/python-kernel-core';

import { build123dWorker } from '#build123d-worker.js';
import { build123dClosureSchema } from '#build123d.schemas.js';
import { build123dProjectLibraries } from '#project-manifest.js';

/**
 * How a host prepares Build123d and how the kernel binds to the closure: its sealed `engine` closure maps to the
 * interpreter, the worker and its support modules, and the seal step compiles bytecode and proves the closure imports.
 * Imports no kernel code, so a parent process can prepare Build123d by importing this module alone.
 * @public
 */
export const build123dNative = definePythonKernelAdopter({
  package: '@taucad/build123d',
  manifest,
  moduleUrl: import.meta.url,
  worker: build123dWorker,
  selfTestImports: ['OCP', 'build123d'],
  projectLibraries: build123dProjectLibraries,
  // A sealed closure always names its root, which the sandbox reads the interpreter and the worker from.
  optionsSchema: build123dClosureSchema.required({ runtimePath: true }),
});
