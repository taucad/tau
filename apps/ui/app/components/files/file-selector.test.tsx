import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { createStaticDataSource } from '@taucad/workbench-panes/files/file-selector';
import type { FileSelectorDataSource } from '@taucad/workbench-panes/files/file-selector';
import type { FilesEntry } from '@taucad/workbench-panes/files/files-source';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@taucad/ui/components/drawer';
import { FileSelector } from '#components/files/file-selector.js';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { classifyDirectoryListingError } from '@taucad/fs-client/directory-listing';
import type { DirectoryListing, ListedDirectoryEntry } from '@taucad/fs-client/directory-listing';

vi.mock('@taucad/ui/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: vi.fn(() => undefined),
}));

/** The tree service's shared listing projection over a scripted `listDirectory`, as `observeDirectory` builds it. */
const observeListing =
  (listDirectory: (path: string) => Promise<ListedDirectoryEntry[]>) =>
  (path: string): ObservationService<DirectoryListing> =>
    new ObservationService<DirectoryListing>({
      resource: path,
      watch: () => ({
        ready: Promise.resolve(),
        closed: new Promise<never>(() => {
          // Never closes.
        }),
        dispose: () => undefined,
      }),
      read: async () => {
        try {
          const listing: DirectoryListing = { kind: 'ready', path, entries: await listDirectory(path) };
          return listing;
        } catch (error) {
          return { kind: 'error', path, cause: classifyDirectoryListingError(error, path) };
        }
      },
    });

beforeEach(() => {
  vi.mocked(useIsMobile).mockReturnValue(false);
  vi.mocked(useOptionalFileManager).mockReturnValue(undefined);
  Element.prototype.scrollIntoView = vi.fn();
});

const rootEntries: FilesEntry[] = [
  { name: 'src', path: 'src', isFolder: true },
  { name: 'README.md', path: 'README.md', isFolder: false, size: 200 },
];

const sourceEntries: FilesEntry[] = [
  { name: 'main.ts', path: 'src/main.ts', isFolder: false, size: 100 },
  { name: 'utils', path: 'src/utils', isFolder: true },
];

const searchResults: FilesEntry[] = [{ name: 'main.ts', path: 'src/main.ts', isFolder: false, size: 100 }];

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
  it('should name an empty selection trigger with its placeholder', () => {
    render(<FileSelector selectedFile='' placeholder='Select main file…' onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Select main file…' })).toBeVisible();
  });

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
    let resolveLoad: (value: FilesEntry[]) => void;
    const slowLoad = vi.fn().mockImplementation(
      async () =>
        new Promise<FilesEntry[]>((resolve) => {
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

    const searchInput = screen.getByPlaceholderText('Filter files…');
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

    const searchInput = screen.getByPlaceholderText('Filter files…');
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

    const searchInput = screen.getByPlaceholderText('Filter files…');
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

describe('FileSelector over createStaticDataSource', () => {
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
        observeDirectory: observeListing(listDirectory),
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
        observeDirectory: observeListing(listDirectory),
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

describe('FileSelector mobile drawer naming', () => {
  it('should keep its own accessible name and description beside an existing drawer title', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(
      <>
        <Drawer open modal={false}>
          <DrawerContent aria-labelledby='drawer-title' aria-describedby='drawer-description'>
            <DrawerTitle id='drawer-title'>Chat Interface</DrawerTitle>
            <DrawerDescription id='drawer-description'>Chat with the project</DrawerDescription>
          </DrawerContent>
        </Drawer>
        <FileSelector
          dataSource={createStaticDataSource([{ path: 'main.ts' }])}
          selectedFile={undefined}
          onSelect={vi.fn()}
          title='Open File'
          description='Choose a file to open in a new view'
        />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select file…' }));
    const picker = await screen.findByRole('dialog', { name: 'Open File' });
    expect(picker).toHaveAccessibleDescription('Choose a file to open in a new view');
    expect(document.querySelector('#drawer-title')).toHaveTextContent('Chat Interface');
  });
});

describe('FileSelector search recovery', () => {
  it('should show a search failure and retry instead of reporting an empty directory', async () => {
    const pending = Promise.withResolvers<FilesEntry[]>();
    const searchFiles = vi
      .fn()
      .mockImplementationOnce(async () => pending.promise)
      .mockResolvedValue(searchResults);
    const dataSource = { loadDirectory: async () => rootEntries, searchFiles };
    render(<FileSelector dataSource={dataSource} selectedFile={undefined} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Filter files…'), { target: { value: 'wheel' } });
    await act(async () => {
      pending.reject(new Error('Refine your search or browse folders to see supported files.'));
    });
    expect(await screen.findByText('Refine your search or browse folders to see supported files.')).toBeVisible();
    expect(screen.queryByText('No files found.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('main.ts')).toBeVisible();
  });

  it('should route context search errors and Retry through the search owner', async () => {
    const searchFiles = vi
      .fn<FileTreeService['searchFiles']>()
      .mockRejectedValueOnce(new Error('Search unavailable'))
      .mockResolvedValue([]);
    const treeService = mock<FileTreeService>({
      observeDirectory: observeListing(async () => []),
      searchFiles,
    });
    vi.mocked(useOptionalFileManager).mockReturnValue(
      mock<NonNullable<ReturnType<typeof useOptionalFileManager>>>({ treeService }),
    );
    render(<FileSelector selectedFile={undefined} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Filter files…'), { target: { value: 'wheel' } });
    expect(await screen.findByText('Search unavailable')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No files found.')).toBeVisible();
    expect(searchFiles).toHaveBeenCalledTimes(2);
  });

  it('should refresh results for an unchanged query when its source revision advances', async () => {
    const searchFiles = vi.fn().mockResolvedValue(searchResults);
    const source = { loadDirectory: async () => rootEntries, searchFiles, revision: 0 };
    const { rerender } = render(<FileSelector dataSource={source} selectedFile={undefined} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Filter files…'), { target: { value: 'main' } });
    expect(await screen.findByText('main.ts')).toBeVisible();
    searchFiles.mockResolvedValue([]);
    source.revision = 1;
    rerender(<FileSelector dataSource={source} selectedFile={undefined} onSelect={vi.fn()} />);
    expect(await screen.findByText('No files found.')).toBeVisible();
    expect(screen.queryByText('main.ts')).not.toBeInTheDocument();
    expect(searchFiles).toHaveBeenCalledTimes(2);
  });
});

describe('FileSelector (directories only)', () => {
  const folderSource = createStaticDataSource(
    [{ path: 'README.md' }, { path: 'public/fonts/a.woff' }, { path: 'public/index.html' }, { path: 'src/main.ts' }],
    { shouldIncludeDirectories: true },
  );

  const renderFolderSelector = (selectedFile = '', onSelect = vi.fn()): ReturnType<typeof vi.fn> => {
    render(
      <FileSelector
        shouldShowDirectoriesOnly
        dataSource={folderSource}
        rootLabel='Whole repository'
        selectedFile={selectedFile}
        searchPlaceholder='Search folders…'
        onSelect={onSelect}
      />,
    );
    return onSelect;
  };

  it('should name the root selection on its trigger and a folder by its path', () => {
    renderFolderSelector('public/fonts');
    expect(screen.getByRole('button', { name: 'public/fonts' })).toBeVisible();
  });

  it('should list folders only and choose the folder shown', async () => {
    const onSelect = renderFolderSelector();
    await userEvent.click(screen.getByRole('button', { name: 'Whole repository' }));

    expect(await screen.findByText('public')).toBeVisible();
    expect(screen.getByText('src')).toBeVisible();
    expect(screen.queryByText('README.md')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('public'));
    expect(await screen.findByText('fonts')).toBeVisible();
    expect(screen.queryByText('index.html')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: 'Select public' }));
    expect(onSelect).toHaveBeenCalledWith('public');
  });

  it('should choose the root from its own row', async () => {
    const onSelect = renderFolderSelector('src');
    await userEvent.click(screen.getByRole('button', { name: 'src' }));
    await userEvent.click(screen.getByRole('button', { name: 'Whole repository' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Select Whole repository' }));
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('should find folders by name', async () => {
    renderFolderSelector();
    await userEvent.click(screen.getByRole('button', { name: 'Whole repository' }));
    fireEvent.change(screen.getByPlaceholderText('Search folders…'), { target: { value: 'font' } });
    expect(await screen.findByText('fonts')).toBeVisible();
    expect(screen.queryByText('a.woff')).not.toBeInTheDocument();
  });
});
