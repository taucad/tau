import manifest from '@taucad/smlibpy/tau-plugin.json' with { type: 'json' };
import { definePythonKernelAdopter } from '@taucad/python-kernel-core';

import { smlibpyWorker } from '#smlibpy-worker.js';
import { smlibpyClosureSchema } from '#smlibpy.schemas.js';
import { smlibpyProjectLibraries } from '#project-manifest.js';

/**
 * How a host prepares SMLibPy and how the kernel binds to the closure: its sealed `engine` closure maps to the
 * interpreter, the worker and its support modules, and the seal step compiles bytecode and proves the closure imports
 * smlibpy and numpy. Imports no kernel code, so a parent process can prepare SMLibPy by importing this module alone.
 * @public
 */
export const smlibpyNative = definePythonKernelAdopter({
  package: '@taucad/smlibpy',
  manifest,
  moduleUrl: import.meta.url,
  worker: smlibpyWorker,
  selfTestImports: ['smlibpy', 'numpy'],
  projectLibraries: smlibpyProjectLibraries,
  // A sealed closure always names its root, which the sandbox reads the interpreter and the worker from.
  optionsSchema: smlibpyClosureSchema.required({ runtimePath: true }),
});
