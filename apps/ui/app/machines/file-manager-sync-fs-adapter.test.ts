import { describe, expect, it, vi } from 'vitest';
import { listWorkspaceDirectories } from '#machines/file-manager-sync-fs-adapter.js';

describe('listWorkspaceDirectories', () => {
  it('returns directory names without treating sibling files as directories', async () => {
    const fileSystem: Parameters<typeof listWorkspaceDirectories>[0] = {
      readdir: vi.fn(async () => ['file.ts', 'src', 'types']),
      stat: vi.fn(
        async (path: string): Promise<{ type: 'file' | 'dir' }> => ({
          type: path.endsWith('.ts') ? 'file' : 'dir',
        }),
      ),
    };

    await expect(listWorkspaceDirectories(fileSystem, '')).resolves.toEqual(['src', 'types']);
    expect(fileSystem.readdir).toHaveBeenCalledWith('');
    expect(fileSystem.stat).toHaveBeenCalledWith('file.ts');
  });
});
