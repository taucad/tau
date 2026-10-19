import { pythonLibraryVersionMismatches } from '@taucad/python-kernel-core';
import type { KernelIssue } from '@taucad/runtime/kernel';

/**
 * The libraries an SMLibPy project pins in `pyproject.toml`, at the versions this kernel runs: the CAD pins of
 * `python/requirements.in`. A test keeps them equal to that file and to the project template.
 */
export const smlibpyProjectLibraries: Readonly<Record<string, string>> = {
  smlibpy: '0.3.5',
  numpy: '2.5.2',
};

/**
 * Warn about every `[project] dependencies` pin in `pyproject.toml` that names one of this kernel's libraries at a
 * version the kernel does not run. An unpinned or ranged requirement is not a mismatch.
 * @param text - The project's `pyproject.toml`.
 * @returns One `LIBRARY_VERSION_MISMATCH` warning per mismatched pin, located at the pin.
 */
export const libraryVersionMismatches = (text: string): KernelIssue[] =>
  pythonLibraryVersionMismatches(text, { kernelId: 'smlibpy', libraries: smlibpyProjectLibraries });
