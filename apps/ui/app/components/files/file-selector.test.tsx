import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileSelector, createStaticDataSource } from '#components/files/file-selector.js';
import type { FileSelectorDataSource, FileSelectorEntry } from '#components/files/file-selector.js';

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: () => false,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: vi.fn(() => undefined),
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const rootEntries: FileSelectorEntry[] = [
  { name: 'src', path: 'src', isFolder: true },
  { name: 'README.md', path: 'README.md', isFolder: false, size: 200 },
];

const sourceEntries: FileSelectorEntry[] = [
  { name: 'main.ts', path: 'src/main.ts', isFolder: false, size: 100 },
  { name: 'utils', path: 'src/utils', isFolder: true },
];

const searchResults: FileSelectorEntry[] = [{ name: 'main.ts', path: 'src/main.ts', isFolder: false, size: 100 }];

function createMockDataSource(): {
  dataSource: FileSelectorDataSource;
  loadDirectory: ReturnType<typeof vi.fn>;
  searchFiles: ReturnType<typeof vi.fn>;
} {
  const loadDirectory = vi.fn().mockImplementation(async (path: string) => {
    if (path === '' || path === '/') {
      return rootEntries;
    }
    if (path === 'src') {
      return sourceEntries;
    }
    return [];
  });
  const searchFiles = vi.fn().mockResolvedValue(searchResults);

  return { dataSource: { loadDirectory, searchFiles }, loadDirectory, searchFiles };
}

describe('FileSelector (explicit dataSource)', () => {
  it('should call loadDirectory on open to show root items', async () => {
    const { dataSource, loadDirectory } = createMockDataSource();

    render(<FileSelector dataSource={dataSource} selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(loadDirectory).toHaveBeenCalledWith('');
    });

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
  });

  it('should call loadDirectory when user clicks a directory', async () => {
    const { dataSource, loadDirectory } = createMockDataSource();

    render(<FileSelector dataSource={dataSource} selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('src'));

    await waitFor(() => {
      expect(loadDirectory).toHaveBeenCalledWith('src');
    });

    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument();
    });
  });

  it('should show loading indicator while loadDirectory resolves', async () => {
    let resolveLoad: (value: FileSelectorEntry[]) => void;
    const slowLoad = vi.fn().mockImplementation(
      async () =>
        new Promise<FileSelectorEntry[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const dataSource: FileSelectorDataSource = {
      loadDirectory: slowLoad,
      searchFiles: vi.fn().mockResolvedValue([]),
    };

    render(<FileSelector dataSource={dataSource} selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(slowLoad).toHaveBeenCalled();
    });

    resolveLoad!(rootEntries);

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
  });

  it('should call searchFiles when user types in search box', async () => {
    const { dataSource, searchFiles } = createMockDataSource();

    render(<FileSelector dataSource={dataSource} selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Filter files...');
    await userEvent.type(searchInput, 'main');

    await waitFor(() => {
      expect(searchFiles).toHaveBeenCalledWith('main');
    });
  });

  it('should display search results from searchFiles', async () => {
    const { dataSource } = createMockDataSource();

    render(<FileSelector dataSource={dataSource} selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Filter files...');
    await userEvent.type(searchInput, 'main');

    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument();
    });
  });

  it('should clear search and return to directory view when search is cleared', async () => {
    const { dataSource, searchFiles } = createMockDataSource();

    render(<FileSelector dataSource={dataSource} selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Filter files...');
    await userEvent.type(searchInput, 'main');

    await waitFor(() => {
      expect(searchFiles).toHaveBeenCalled();
    });

    await userEvent.clear(searchInput);

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
  });

  it('should call onSelect with the correct path', async () => {
    const { dataSource } = createMockDataSource();
    const onSelect = vi.fn();

    render(<FileSelector dataSource={dataSource} selectedFile={undefined} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('README.md'));

    expect(onSelect).toHaveBeenCalledWith('README.md');
  });

  it('should surface Retry when explicit loadDirectory throws', async () => {
    const loadDirectory = vi.fn().mockRejectedValue(Object.assign(new Error('fail'), { code: 'ENOENT' }));
    const dataSource: FileSelectorDataSource = {
      loadDirectory,
      searchFiles: vi.fn().mockResolvedValue([]),
    };

    render(<FileSelector dataSource={dataSource} selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
    expect(screen.queryByText('No files found.')).not.toBeInTheDocument();
  });
});

describe('createStaticDataSource', () => {
  it('should return root-level items for loadDirectory("")', async () => {
    const ds = createStaticDataSource([
      { path: 'src/main.ts', size: 100 },
      { path: 'README.md', size: 200 },
    ]);

    const items = await ds.loadDirectory('');
    expect(items).toEqual([
      { name: 'src', path: 'src', isFolder: true, size: undefined },
      { name: 'README.md', path: 'README.md', isFolder: false, size: 200 },
    ]);
  });

  it('should return nested items for loadDirectory("src")', async () => {
    const ds = createStaticDataSource([
      { path: 'src/main.ts', size: 100 },
      { path: 'src/utils/helpers.ts', size: 50 },
    ]);

    const items = await ds.loadDirectory('src');
    expect(items).toEqual([
      { name: 'utils', path: 'src/utils', isFolder: true, size: undefined },
      { name: 'main.ts', path: 'src/main.ts', isFolder: false, size: 100 },
    ]);
  });

  it('should filter files via searchFiles', async () => {
    const ds = createStaticDataSource([
      { path: 'src/main.ts', size: 100 },
      { path: 'src/utils/helpers.ts', size: 50 },
      { path: 'README.md', size: 200 },
    ]);

    const results = await ds.searchFiles('main');
    expect(results).toEqual([{ name: 'main.ts', path: 'src/main.ts', isFolder: false, size: 100 }]);
  });

  it('should render correctly via FileSelector with createStaticDataSource', async () => {
    const ds = createStaticDataSource([
      { path: 'hello.ts', size: 42 },
      { path: 'world.ts', size: 99 },
    ]);

    render(<FileSelector dataSource={ds} selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('hello.ts')).toBeInTheDocument();
      expect(screen.getByText('world.ts')).toBeInTheDocument();
    });
  });
});

describe('FileSelector (context auto-wiring)', () => {
  it('should not show empty-directory copy when FileManager tree is unavailable (shows loading instead)', async () => {
    render(<FileSelector selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.queryByText('No files found.')).not.toBeInTheDocument();
    });
  });

  it('should surface Retry instead of empty copy when context listDirectory fails', async () => {
    const { useOptionalFileManager } = await import('#hooks/use-file-manager.js');
    const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const listDirectory = vi.fn().mockRejectedValue(error);
    vi.mocked(useOptionalFileManager).mockReturnValue({
      treeService: {
        listDirectory,
        listDirectorySync: vi.fn().mockReturnValue(undefined),
        subscribePath: vi.fn().mockReturnValue(() => undefined),
      },
    } as unknown as ReturnType<typeof useOptionalFileManager>);

    render(<FileSelector selectedFile={undefined} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
    expect(screen.queryByText('No files found.')).not.toBeInTheDocument();

    vi.mocked(useOptionalFileManager).mockReturnValue(undefined);
  });

  it('should preserve full breadcrumb path when drilling down after navigating up', async () => {
    const { useOptionalFileManager } = await import('#hooks/use-file-manager.js');
    const listingSnapshot = new Map<
      string,
      Array<{ name: string; path: string; isFolder: boolean; size: number; mtimeMs: number }>
    >();

    const mockNodesForPath = (path: string) => {
      if (path === '') {
        return [{ id: 'public', name: 'public', size: 0, mtimeMs: 0, children: [] }];
      }
      if (path === 'public') {
        return [{ id: 'kcl-samples', name: 'kcl-samples', size: 0, mtimeMs: 0, children: [] }];
      }
      if (path === 'public/kcl-samples') {
        return [{ id: 'ball-bearing', name: 'ball-bearing', size: 0, mtimeMs: 0, children: [] }];
      }
      if (path === 'public/kcl-samples/ball-bearing') {
        return [{ id: 'main.kcl', name: 'main.kcl', size: 1, mtimeMs: 0 }];
      }
      return [];
    };

    const listDirectory = vi.fn().mockImplementation(async (path: string) => {
      const nodes = mockNodesForPath(path);
      const rows = nodes.map((n) => ({
        name: n.name,
        path: path ? `${path}/${n.name}` : n.name,
        isFolder: 'children' in n,
        size: 0,
        mtimeMs: 0,
      }));
      listingSnapshot.set(path, rows);
      return rows;
    });

    const listDirectorySync = vi.fn((path: string) => listingSnapshot.get(path));

    vi.mocked(useOptionalFileManager).mockReturnValue({
      treeService: {
        listDirectory,
        listDirectorySync,
        subscribePath: vi.fn().mockReturnValue(() => undefined),
      },
    } as unknown as ReturnType<typeof useOptionalFileManager>);

    render(<FileSelector selectedFile='public/kcl-samples/ball-bearing/main.kcl' onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getAllByText('main.kcl').length).toBeGreaterThanOrEqual(1);
    });

    const breadcrumbScroller = document.querySelector<HTMLElement>('[data-slot="omni-scroller"]');
    if (!breadcrumbScroller) {
      throw new Error('File selector breadcrumb scroller was missing.');
    }
    Object.defineProperties(breadcrumbScroller, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, value: 10, writable: true },
      scrollWidth: { configurable: true, value: 400 },
    });
    const breadcrumbWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 70 });
    breadcrumbScroller.lastElementChild?.dispatchEvent(breadcrumbWheel);

    expect(breadcrumbScroller.scrollLeft).toBe(80);
    expect(breadcrumbWheel.defaultPrevented).toBe(true);

    await userEvent.click(screen.getByText('kcl-samples'));

    await waitFor(() => {
      expect(screen.getByText('ball-bearing')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('ball-bearing'));

    await waitFor(() => {
      const listDirectoryMock = vi.mocked(listDirectory);
      const paths = listDirectoryMock.mock.calls.map((call) => {
        const [listedPath] = call as [unknown];
        if (typeof listedPath !== 'string') {
          throw new TypeError('expected listDirectory path argument to be a string');
        }

        return listedPath;
      });
      expect(paths).toContain('public/kcl-samples/ball-bearing');
    });

    await waitFor(() => {
      expect(screen.getAllByText('main.kcl').length).toBeGreaterThanOrEqual(1);
    });

    vi.mocked(useOptionalFileManager).mockReturnValue(undefined);
  });
});
