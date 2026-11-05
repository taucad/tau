import { describe, expect, it, vi } from 'vitest';
import { listWorkspaceDirectories } from '#machines/file-manager-sync-fs-adapter.js';

describe('listWorkspaceDirectories', () => {
  it('lists directory names from one kind-carrying listing, with no stat per child', async () => {
    const fileSystem: Parameters<typeof listWorkspaceDirectories>[0] = {
      readdir: vi.fn(async () => []),
      stat: vi.fn(async () => ({ type: 'file' as const })),
      readdirEntries: vi.fn(async () => [
        { name: 'file.ts', kind: 'file' as const },
        { name: 'src', kind: 'dir' as const },
        { name: 'types', kind: 'dir' as const },
      ]),
    };

    await expect(listWorkspaceDirectories(fileSystem, '')).resolves.toEqual(['src', 'types']);
    expect(fileSystem.readdirEntries).toHaveBeenCalledWith('');
    expect(fileSystem.readdir).not.toHaveBeenCalled();
    expect(fileSystem.stat).not.toHaveBeenCalled();
  });

  it('falls back to a stat per child where no kind-carrying listing exists', async () => {
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
