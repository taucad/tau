import { createWorkspaceMirror } from '@taucad/native-process-core';
import type { WorkspaceMirror, WorkspaceMirrorOptions } from '@taucad/native-process-core';

/** Build output and IDE state a C# project accumulates, which the worker never reads. */
const dotnetExcludedDirectories = ['bin', 'obj', '.vs'];
/** Compiled binaries a project may hold; the worker compiles the project's sources itself. */
const dotnetExcludedFileSuffixes = ['.dll', '.exe', '.pdb'];

/**
 * Create the workspace mirror of a .NET kernel: the native process mirror without `bin`, `obj`, `.vs` and compiled
 * `.dll`, `.exe` and `.pdb` files, plus any exclusions the kernel adds.
 *
 * @param options - The mirror's temporary prefix, display name and the kernel's own exclusions.
 * @returns The mirror; the kernel runs its worker against `workspacePath` between `sync()` and `cleanup()`.
 * @public
 */
export const createDotnetWorkspaceMirror = async (options: WorkspaceMirrorOptions): Promise<WorkspaceMirror> =>
  createWorkspaceMirror({
    ...options,
    excludedDirectories: [...dotnetExcludedDirectories, ...(options.excludedDirectories ?? [])],
    excludedFileSuffixes: [...dotnetExcludedFileSuffixes, ...(options.excludedFileSuffixes ?? [])],
  });
