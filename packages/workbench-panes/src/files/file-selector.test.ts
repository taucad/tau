import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FilesEntry } from '#files/files-source.js';
import { createStaticDataSource, useFileBrowser } from '#files/file-selector.jsx';

describe('createStaticDataSource', () => {
  it('should list a folder folders first, each implied by the paths under it', async () => {
    const source = createStaticDataSource([
      { path: 'src/main.ts', size: 100 },
      { path: 'README.md', size: 200 },
      { path: 'src/utils/helpers.ts', size: 50 },
    ]);

    expect(await source.loadDirectory('')).toEqual([
      { name: 'src', path: 'src', isFolder: true, size: undefined },
      { name: 'README.md', path: 'README.md', isFolder: false, size: 200 },
    ]);
    expect(await source.loadDirectory('src')).toEqual([
      { name: 'utils', path: 'src/utils', isFolder: true, size: undefined },
      { name: 'main.ts', path: 'src/main.ts', isFolder: false, size: 100 },
    ]);
    expect(await source.loadDirectory('missing')).toEqual([]);
  });

  it('should find files by name anywhere in the tree, ignoring case', async () => {
    const source = createStaticDataSource([
      { path: 'src/Main.ts', size: 100 },
      { path: 'src/utils/helpers.ts', size: 50 },
      { path: 'main/README.md', size: 200 },
    ]);

    expect(await source.searchFiles('main')).toEqual([
      { name: 'Main.ts', path: 'src/Main.ts', isFolder: false, size: 100 },
    ]);
  });

  it('should also find folders by name when asked to', async () => {
    const source = createStaticDataSource(
      [
        { path: 'src/Main.ts', size: 100 },
        { path: 'main/README.md', size: 200 },
      ],
      { shouldIncludeDirectories: true },
    );

    expect(await source.searchFiles('main')).toEqual([
      { name: 'main', path: 'main', isFolder: true, size: undefined },
      { name: 'Main.ts', path: 'src/Main.ts', isFolder: false, size: 100 },
    ]);
  });
});

describe('useFileBrowser search outcomes', () => {
  const match: FilesEntry = { name: 'wheel.js', path: 'parts/wheel.js', isFolder: false };

  it('should keep search failures distinct from directory completion and retry the query', async () => {
    const listing = Promise.withResolvers<FilesEntry[]>();
    const finding = Promise.withResolvers<FilesEntry[]>();
    const source = {
      loadDirectory: async () => listing.promise,
      searchFiles: vi
        .fn()
        .mockImplementationOnce(async () => finding.promise)
        .mockResolvedValue([match]),
    };
    const { result } = renderHook(() => useFileBrowser({ dataSource: source, isActive: true }));
    act(() => {
      result.current.onSearchChange('wheel');
    });
    expect(result.current.status.kind).toBe('loading');
    await act(async () => {
      finding.reject(new Error('Refine your search or browse folders.'));
    });
    expect(result.current.status).toEqual({ kind: 'error', message: 'Refine your search or browse folders.' });
    await act(async () => {
      listing.resolve([]);
    });
    expect(result.current.status.kind).toBe('error');
    act(() => {
      result.current.onRetry();
    });
    await waitFor(() => {
      expect(result.current.entries).toEqual([match]);
    });
    expect(result.current.status.kind).toBe('ready');
    expect(source.searchFiles).toHaveBeenCalledTimes(2);
    expect(source.searchFiles).toHaveBeenLastCalledWith('wheel');
  });

  it('should ignore an obsolete query failure after a new query succeeds', async () => {
    const old = Promise.withResolvers<FilesEntry[]>();
    const source = {
      loadDirectory: async () => [],
      searchFiles: vi
        .fn()
        .mockImplementationOnce(async () => old.promise)
        .mockResolvedValue([match]),
    };
    const { result } = renderHook(() => useFileBrowser({ dataSource: source, isActive: true }));
    act(() => {
      result.current.onSearchChange('old');
    });
    act(() => {
      result.current.onSearchChange('wheel');
    });
    await waitFor(() => {
      expect(result.current.entries).toEqual([match]);
    });
    await act(async () => {
      old.reject(new Error('Obsolete failure'));
    });
    expect(result.current.status.kind).toBe('ready');
    expect(result.current.entries).toEqual([match]);
    act(() => {
      result.current.onNavigate('parts');
    });
    expect(result.current.searchQuery).toBe('');
    await waitFor(() => {
      expect(result.current.status.kind).toBe('ready');
    });
  });

  it('should cancel a hidden search and refresh the same query on reopening or revision change', async () => {
    const old = Promise.withResolvers<FilesEntry[]>();
    const source = {
      loadDirectory: async () => [],
      searchFiles: vi
        .fn()
        .mockImplementationOnce(async () => old.promise)
        .mockResolvedValue([match]),
    };
    const { result, rerender } = renderHook(
      ({ active, revision }) => useFileBrowser({ dataSource: source, isActive: active, revision }),
      { initialProps: { active: true, revision: 0 } },
    );
    act(() => {
      result.current.onSearchChange('wheel');
    });
    rerender({ active: false, revision: 0 });
    await act(async () => {
      old.resolve([{ ...match, name: 'obsolete.js' }]);
    });
    expect(result.current.entries).toEqual([]);
    rerender({ active: true, revision: 0 });
    await waitFor(() => {
      expect(result.current.entries).toEqual([match]);
    });
    source.searchFiles.mockResolvedValue([]);
    rerender({ active: true, revision: 1 });
    await waitFor(() => {
      expect(result.current.entries).toEqual([]);
    });
    expect(source.searchFiles).toHaveBeenCalledTimes(3);
  });
});
