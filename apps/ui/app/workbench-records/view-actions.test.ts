/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Interleaving cases intentionally run in sequence. */
import { mock } from 'vitest-mock-extended';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { workbenchRecords } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import { deleteViewFile, editViewFile, useWorkbenchViewCommands } from '#workbench-records/view-actions.js';
import { createWorkbenchViewStore } from '#workbench-records/view-store.js';

const encoder = new TextEncoder();
const base = () => workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts' });
const path = '/projects/p/.tau/workbench/views/v-abcd1234.json';
let fileManager: unknown;
let projectProfile: 'editor' | 'shared' = 'editor';
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => fileManager }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', profile: projectProfile }) }));
vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, select: (snapshot: unknown) => unknown) =>
    select(actor.getSnapshot()),
}));

describe('view panel record commands', () => {
  it('edits and closes a live view while the selected code root is a checkout', async () => {
    const content = new Map<string, Uint8Array<ArrayBuffer>>([
      [path, encoder.encode(workbenchRecords.view.serialize(base()))],
    ]);
    const files = {
      exists: async (filePath: string) => content.has(filePath),
      readFile: async (filePath: string) => content.get(filePath)!,
      writeFileChecked: vi.fn(
        async ({ path: filePath, data }: { path: string; data: string }): Promise<CheckedFileWriteResult> => {
          const bytes = encoder.encode(data);
          content.set(filePath, bytes);
          return { status: 'applied', content: bytes };
        },
      ),
      deleteFileChecked: vi.fn(async ({ path: filePath }: { path: string }): Promise<CheckedFileWriteResult> => {
        content.delete(filePath);
        return { status: 'applied', content: new Uint8Array() };
      }),
    };
    fileManager = {
      fileManagerRef: { getSnapshot: () => ({ context: { rootDirectory: '/checkouts/c' } }) },
      parameterFiles: files,
      workbenchFiles: files,
    };
    const { result, unmount } = renderHook(() => useWorkbenchViewCommands());
    expect(await result.current.edit('v-abcd1234', (current) => ({ ...current!, name: 'Live edit' }))).toBe(true);
    expect(workbenchRecords.view.read(content.get(path)!)).toMatchObject({
      status: 'current',
      record: { name: 'Live edit' },
    });
    expect(content.has('/checkouts/c/.tau/workbench/views/v-abcd1234.json')).toBe(false);
    expect(await result.current.remove('v-abcd1234')).toBe(true);
    expect(content.has(path)).toBe(false);
    expect(files.deleteFileChecked).toHaveBeenCalledWith(expect.objectContaining({ path }));
    unmount();
  });
  it('creates a missing view after observing absence and deletes exactly the viewed bytes on person close', async () => {
    let bytes: Uint8Array<ArrayBuffer> | null = null;
    const files = {
      exists: vi.fn(async () => bytes !== null),
      readFile: vi.fn(async () => bytes!),
      writeFileChecked: vi.fn(
        async (input: {
          data: string;
          preconditions: ReadonlyArray<{ path: string; expected: Uint8Array<ArrayBuffer> | null }>;
        }): Promise<CheckedFileWriteResult> => {
          expect(input.preconditions).toEqual([{ path, expected: null }]);
          bytes = encoder.encode(input.data);
          return { status: 'applied', content: bytes };
        },
      ),
      deleteFileChecked: vi.fn(
        async (input: {
          path: string;
          preconditions: ReadonlyArray<{ path: string; expected: Uint8Array<ArrayBuffer> | null }>;
        }): Promise<CheckedFileWriteResult> => {
          expect(input.path).toBe(path);
          expect(input.preconditions).toEqual([{ path, expected: bytes }]);
          bytes = null;
          return { status: 'applied', content: new Uint8Array() };
        },
      ),
    };
    const onError = vi.fn();
    expect(
      await editViewFile({ root: '/projects/p', viewId: 'v-abcd1234', files, change: () => base(), onError }),
    ).toBe(true);
    expect(workbenchRecords.view.read(bytes!)).toMatchObject({ status: 'current', record: { entryPath: 'a.ts' } });
    expect(await deleteViewFile({ root: '/projects/p', viewId: 'v-abcd1234', files, onError })).toBe(true);
    expect(bytes).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('treats an already deleted view as an idempotent close without a write', async () => {
    const files = {
      exists: vi.fn(async () => false),
      readFile: vi.fn(async () => {
        throw new Error('should not read');
      }),
      writeFileChecked: vi.fn(),
      deleteFileChecked: vi.fn(),
    };
    expect(await deleteViewFile({ root: '/projects/p', viewId: 'v-abcd1234', files, onError: () => undefined })).toBe(
      true,
    );
    expect(files.writeFileChecked).not.toHaveBeenCalled();
    expect(files.deleteFileChecked).not.toHaveBeenCalled();
  });

  it('waits for a delayed create before closing so no orphan view file remains', async () => {
    let bytes: Uint8Array<ArrayBuffer> | null = null;
    const gate = Promise.withResolvers<void>();
    const files = {
      exists: async () => bytes !== null,
      readFile: async () => bytes!,
      writeFileChecked: vi.fn(async ({ data }: { data: string }): Promise<CheckedFileWriteResult> => {
        await gate.promise;
        bytes = encoder.encode(data);
        return { status: 'applied', content: bytes };
      }),
      deleteFileChecked: vi.fn(async (): Promise<CheckedFileWriteResult> => {
        bytes = null;
        return { status: 'applied', content: new Uint8Array() };
      }),
    };
    const creating = editViewFile({
      root: '/projects/p',
      viewId: 'v-1234abcd',
      files,
      change: () => base(),
      onError: vi.fn(),
    });
    await vi.waitFor(() => {
      expect(files.writeFileChecked).toHaveBeenCalledOnce();
    });
    const closing = deleteViewFile({ root: '/projects/p', viewId: 'v-1234abcd', files, onError: vi.fn() });
    gate.resolve();
    await Promise.all([creating, closing]);
    expect(bytes).toBeNull();
    expect(files.deleteFileChecked).toHaveBeenCalledOnce();
  });

  it('cancels a failed create retry when the view closes', async () => {
    vi.useFakeTimers();
    try {
      const files = {
        exists: async () => false,
        readFile: async () => {
          throw new Error('missing');
        },
        writeFileChecked: vi.fn(async (): Promise<CheckedFileWriteResult> => {
          throw new Error('offline');
        }),
        deleteFileChecked: vi.fn(),
      };
      expect(
        await editViewFile({
          root: '/projects/p',
          viewId: 'v-8765abcd',
          files,
          change: () => base(),
          onError: vi.fn(),
        }),
      ).toBe(false);
      expect(await deleteViewFile({ root: '/projects/p', viewId: 'v-8765abcd', files, onError: vi.fn() })).toBe(true);
      await vi.runOnlyPendingTimersAsync();
      expect(files.writeFileChecked).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows a new foreign-reopened lifetime while a delayed old edit cannot overwrite it', async () => {
    let bytes: Uint8Array<ArrayBuffer> | null = encoder.encode(workbenchRecords.view.serialize(base()));
    const gate = Promise.withResolvers<void>();
    const readStarted = Promise.withResolvers<void>();
    const files = {
      exists: async () => bytes !== null,
      readFile: async () => bytes!,
      writeFileChecked: vi.fn(async ({ data }: { data: string }): Promise<CheckedFileWriteResult> => {
        bytes = encoder.encode(data);
        return { status: 'applied', content: bytes };
      }),
      deleteFileChecked: vi.fn(async (): Promise<CheckedFileWriteResult> => {
        bytes = null;
        return { status: 'applied', content: new Uint8Array() };
      }),
    };
    const old = createWorkbenchViewStore({
      root: '/projects/p',
      viewId: 'v-5678abcd',
      files: {
        ...files,
        readFile: async () => {
          const captured = await files.readFile();
          readStarted.resolve();
          await gate.promise;
          return captured;
        },
      },
      onChange: () => undefined,
      onError: vi.fn(),
    });
    const delayed = old.edit({ ...base(), name: 'Old edit' });
    await readStarted.promise;
    expect(await deleteViewFile({ root: '/projects/p', viewId: 'v-5678abcd', files, onError: vi.fn() })).toBe(true);
    bytes = encoder.encode(workbenchRecords.view.serialize({ ...base(), name: 'Foreign reopen' }));
    const fresh = createWorkbenchViewStore({
      root: '/projects/p',
      viewId: 'v-5678abcd',
      files,
      onChange: () => undefined,
      onError: vi.fn(),
    });
    await fresh.read();
    expect(await fresh.edit({ ...fresh.snapshot().record!, name: 'New person edit' })).toBe(true);
    gate.resolve();
    expect(await delayed).toBe(false);
    expect(workbenchRecords.view.read(bytes)).toMatchObject({ status: 'current', record: { name: 'New person edit' } });
    expect(files.writeFileChecked).toHaveBeenCalledOnce();
    old.dispose();
    fresh.dispose();
  });
});

it('should refuse durable view commands in a shared preview before any filesystem access', async () => {
  const files = mock<Parameters<typeof editViewFile>[0]['files']>();
  files.exists.mockResolvedValue(false);
  const client = {
    exists: files.exists,
    readFile: files.readFile,
    writeFileChecked: files.writeFileChecked,
    deleteFileChecked: files.deleteFileChecked,
  };
  fileManager = { parameterFiles: client, workbenchFiles: client };
  projectProfile = 'shared';
  const { result, unmount } = renderHook(() => useWorkbenchViewCommands());
  try {
    expect(await result.current.edit('v-1234abcd', () => base())).toBe(false);
    expect(await result.current.remove('v-1234abcd')).toBe(false);
    expect(files.exists).not.toHaveBeenCalled();
    expect(files.readFile).not.toHaveBeenCalled();
    expect(files.writeFileChecked).not.toHaveBeenCalled();
    expect(files.deleteFileChecked).not.toHaveBeenCalled();
  } finally {
    unmount();
    projectProfile = 'editor';
  }
});
