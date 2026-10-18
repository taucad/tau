import { createWorkspaceMirror } from '@taucad/native-process-core';
import type { WorkspaceMirror } from '@taucad/native-process-core';

import type { PythonKernelWorker } from '#python-kernel.js';

/**
 * Create a Python kernel's private physical workspace projection under a `tau-<kernelId>-` temporary root, the root
 * name `tau_kernel.protocol.run_worker` checks. Interpreter caches, virtual environments and bytecode never cross
 * into it, nor does the project thumbnail.
 *
 * @param worker - The kernel's worker.
 * @returns A fresh workspace mirror.
 * @public
 */
export const createPythonWorkspaceMirror = async (
  worker: Pick<PythonKernelWorker, 'kernelId' | 'kernelName'>,
): Promise<WorkspaceMirror> =>
  createWorkspaceMirror({
    temporaryPrefix: `tau-${worker.kernelId}-`,
    displayName: worker.kernelName,
    excludedDirectories: ['.mypy_cache', '.pytest_cache', '.venv', '__pycache__', 'venv'],
    excludedFileSuffixes: ['.pyc', '.pyo'],
    excludedPaths: ['thumbnail.webp'],
  });
