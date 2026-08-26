import { describe, expect, it, vi } from 'vitest';
import type { FileTreeNode, WorkspaceFileService } from '@taucad/filesystem';
import { listWorkspaceDirectories } from '#machines/file-manager-sync-fs-adapter.js';

describe('listWorkspaceDirectories', () => {
  it('returns directory names without treating sibling files as directories', async () => {
    const entries: FileTreeNode[] = [
      { id: 'file.ts', name: 'file.ts', size: 1, mtimeMs: 1, contentKind: 'text', lineCount: 1 },
      { id: 'src', name: 'src', size: 0, mtimeMs: 1, children: [] },
      { id: 'types', name: 'types', size: 0, mtimeMs: 1, children: [] },
    ];
    const fileService = {
      readDirectory: vi.fn(async () => entries),
    } as unknown as Pick<WorkspaceFileService, 'readDirectory'>;

    await expect(listWorkspaceDirectories(fileService, '/project')).resolves.toEqual(['src', 'types']);
    expect(fileService.readDirectory).toHaveBeenCalledWith('/project');
  });
});
