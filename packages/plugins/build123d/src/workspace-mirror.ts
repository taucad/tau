import { createWorkspaceMirror as createNativeWorkspaceMirror } from '@taucad/native-process-core';
import type { WorkspaceMirror } from '@taucad/native-process-core';

export type { WorkspaceMirror } from '@taucad/native-process-core';

/** Create Build123d's private, bounded physical workspace projection. */
export const createWorkspaceMirror = (): Promise<WorkspaceMirror> =>
  createNativeWorkspaceMirror({
    temporaryPrefix: 'tau-build123d-',
    displayName: 'Build123d',
    excludedDirectories: ['.mypy_cache', '.pytest_cache', '.venv', '__pycache__', 'venv'],
    excludedFileSuffixes: ['.pyc', '.pyo'],
  });
