import type { PythonKernelWorker } from '@taucad/python-kernel-core';

/**
 * SMLibPy's worker: `worker.py` dispatches over smlibpy bodies, with its materials and mechanism support modules; the
 * `tau_kernel` modules of `@taucad/python-kernel-core` follow them in the closure.
 */
export const smlibpyWorker = {
  kernelId: 'smlibpy',
  kernelName: 'SMLibPy',
  workerModules: ['worker.py', 'smlibpy_materials.py', 'smlibpy_mechanisms.py'],
} as const satisfies PythonKernelWorker;
