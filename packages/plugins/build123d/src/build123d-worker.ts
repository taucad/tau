import type { PythonKernelWorker } from '@taucad/python-kernel-core';

/**
 * Build123d's worker: `worker.py` dispatches over OCP objects, with its materials and mechanism support modules; the
 * `tau_kernel` modules of `@taucad/python-kernel-core` follow them in the closure.
 */
export const build123dWorker = {
  kernelId: 'build123d',
  kernelName: 'Build123d',
  workerModules: ['worker.py', 'native_materials.py', 'mechanisms.py'],
} as const satisfies PythonKernelWorker;
