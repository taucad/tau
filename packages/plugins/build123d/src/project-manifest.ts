import { pythonLibraryVersionMismatches } from '@taucad/python-kernel-core';
import type { KernelIssue } from '@taucad/runtime/kernel';

/**
 * The libraries a Build123d project pins in `pyproject.toml`, at the versions this kernel runs: the CAD pins of
 * `python/requirements.in`. A test keeps them equal to that file and to the project template.
 */
export const build123dProjectLibraries: Readonly<Record<string, string>> = {
  build123d: '0.13.0',
  'cadquery-ocp-novtk': '8.0.1.0.0',
};

/**
 * Warn about every `[project] dependencies` pin in `pyproject.toml` that names one of this kernel's libraries at a
 * version the kernel does not run. An unpinned or ranged requirement is not a mismatch.
 * @param text - The project's `pyproject.toml`.
 * @returns One `LIBRARY_VERSION_MISMATCH` warning per mismatched pin, located at the pin.
 */
export const libraryVersionMismatches = (text: string): KernelIssue[] =>
  pythonLibraryVersionMismatches(text, { kernelId: 'build123d', libraries: build123dProjectLibraries });
