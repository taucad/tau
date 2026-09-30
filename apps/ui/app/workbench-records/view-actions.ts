/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Conflict retries must be sequential. */
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import type { CheckedFileWriteResult } from '@taucad/types';
import { createWorkbenchViewStore, fenceClosedView, finishClosedView } from '#workbench-records/view-store.js';

type ViewFiles = Readonly<{
  exists: (path: string) => Promise<boolean>;
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  writeFileChecked: (input: {
    path: string;
    data: string;
    preconditions: ReadonlyArray<{ path: string; expected: Uint8Array<ArrayBuffer> | null }>;
  }) => Promise<CheckedFileWriteResult>;
  deleteFileChecked: (input: {
    path: string;
    preconditions: ReadonlyArray<{ path: string; expected: Uint8Array<ArrayBuffer> | null }>;
  }) => Promise<CheckedFileWriteResult>;
}>;

/** A panel command edits only the fields the person changed, against the bytes it just read. */
export async function editViewFile(
  input: Readonly<{
    root: string;
    viewId: string;
    files: ViewFiles;
    change: (current: WorkbenchView | undefined) => WorkbenchView;
    onError: (error: unknown) => void;
  }>,
): Promise<boolean> {
  const store = createWorkbenchViewStore({ ...input, onChange: () => undefined });
  try {
    if (!(await store.read()) || store.snapshot().refusal) {
      return false;
    }
    return await store.edit(input.change(store.snapshot().record));
  } finally {
    store.dispose();
  }
}

/** A person-closing a viewer deletes exactly the view bytes last observed. */
export async function deleteViewFile(
  input: Readonly<{
    root: string;
    viewId: string;
    files: ViewFiles;
    onError: (error: unknown) => void;
  }>,
): Promise<boolean> {
  const path = `${input.root}/${workbenchPaths.view(input.viewId)}`;
  await fenceClosedView(path);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (!(await input.files.exists(path))) {
          return true;
        }
        const bytes = await input.files.readFile(path);
        if (workbenchRecords.view.read(bytes).status !== 'current') {
          return false;
        }
        const result = await input.files.deleteFileChecked({ path, preconditions: [{ path, expected: bytes }] });
        if (result.status !== 'conflict') {
          return true;
        }
      } catch (error) {
        input.onError(error);
        return false;
      }
    }
    input.onError(new Error('The view changed while it was being closed. Try again.'));
    return false;
  } finally {
    finishClosedView(path);
  }
}

/** Page-level view commands share the live-root checked file client with the agent tool. */
export function useWorkbenchViewCommands(): Readonly<{
  edit: (viewId: string, change: (current: WorkbenchView | undefined) => WorkbenchView) => Promise<boolean>;
  remove: (viewId: string) => Promise<boolean>;
}> {
  const { parameterFiles, workbenchFiles } = useFileManager();
  const { projectId, profile } = useProject();
  const root = `/projects/${projectId}`;
  const files = useMemo(() => ({ ...parameterFiles, ...workbenchFiles }), [parameterFiles, workbenchFiles]);
  const onError = (error: unknown): void => {
    toast.error(error instanceof Error ? error.message : 'Workbench view could not be saved.');
  };
  const edit = useCallback(
    async (viewId: string, change: (current: WorkbenchView | undefined) => WorkbenchView) =>
      profile === 'shared' ? false : editViewFile({ root, viewId, files, change, onError }),
    [files, root, profile],
  );
  const remove = useCallback(
    async (viewId: string) => (profile === 'shared' ? false : deleteViewFile({ root, viewId, files, onError })),
    [files, root, profile],
  );
  return useMemo(() => ({ edit, remove }), [edit, remove]);
}
