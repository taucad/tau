/**
 * The project file browser the Files pane and the Tau app's file picker share: the data source that lists a folder or
 * searches the tree, the order both draw, the browser and the hook that drives it.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps, ComponentType } from 'react';
import { ChevronRight, File as FileIconFallback, Folder } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { Button } from '@taucad/ui/components/button';
import { Command, CommandInput, CommandItem, CommandList } from '@taucad/ui/components/command';
import { Loader } from '@taucad/ui/components/loader';
import { menuItemLayoutClass } from '@taucad/ui/components/menu.variants';
import { cn } from '@taucad/ui/utils/cn';
import type { FilesEntry, FilesSource } from '#files/files-source.js';

/**
 * Where a file browser's entries come from: one folder's children at a time, or the files a query finds. The first two
 * members of a {@link FilesSource}.
 *
 * @public
 */
export type FileSelectorDataSource = Pick<FilesSource, 'loadDirectory' | 'searchFiles'>;

type StaticFile = Readonly<{ path: string; size?: number | undefined; renderable?: boolean | undefined }>;

type TreeNode = {
  name: string;
  path: string;
  isFolder: boolean;
  size?: number | undefined;
  renderable?: boolean | undefined;
  children: Map<string, TreeNode>;
};

/**
 * Folders first, then by name, ignoring case: the order every file browser lists entries in.
 *
 * @param left - One entry.
 * @param right - The other.
 * @returns A negative number when `left` comes first, positive when `right` does.
 * @public
 */
export function compareFileEntries(left: FilesEntry, right: FilesEntry): number {
  if (left.isFolder !== right.isFolder) {
    return left.isFolder ? -1 : 1;
  }
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

const toEntry = ({ name, path, isFolder, size, renderable }: TreeNode): FilesEntry => ({
  name,
  path,
  isFolder,
  size,
  ...(renderable === undefined ? {} : { renderable }),
});

/**
 * Build the tree a flat list of file paths describes; every folder on a path is implied.
 *
 * @param files - Project-relative file paths, with their sizes.
 * @returns The root folder.
 */
const buildTree = (files: readonly StaticFile[]): TreeNode => {
  const root: TreeNode = { name: '', path: '', isFolder: true, children: new Map() };
  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;
    for (const [index, part] of parts.entries()) {
      if (!part) {
        continue;
      }
      const isLastPart = index === parts.length - 1;
      let node = current.children.get(part);
      if (node === undefined) {
        node = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          isFolder: !isLastPart,
          size: isLastPart ? file.size : undefined,
          renderable: isLastPart ? file.renderable : undefined,
          children: new Map(),
        };
        current.children.set(part, node);
      }
      current = node;
    }
  }
  return root;
};

const childrenAt = (root: TreeNode, path: string): TreeNode[] => {
  let current: TreeNode | undefined = root;
  for (const part of path === '' ? [] : path.split('/')) {
    current = current.children.get(part);
    if (current === undefined) {
      return [];
    }
  }
  return [...current.children.values()].toSorted(compareFileEntries);
};

const searchTree = (root: TreeNode, query: string): TreeNode[] => {
  const results: TreeNode[] = [];
  const lowerQuery = query.toLowerCase();
  const traverse = (node: TreeNode): void => {
    for (const child of node.children.values()) {
      if (child.isFolder) {
        traverse(child);
      } else if (child.name.toLowerCase().includes(lowerQuery)) {
        results.push(child);
      }
    }
  };
  traverse(root);
  return results.toSorted(compareFileEntries);
};

/**
 * Wrap a static file list into a {@link FileSelectorDataSource}. The tree is built once, and every answer resolves
 * from memory: for files that come from a GitHub listing, an upload or a server's listing.
 *
 * @param files - Project-relative file paths, with their sizes and whether the view can show each.
 * @returns A data source over those files.
 * @public
 *
 * @example <caption>Browse an uploaded project</caption>
 * ```typescript
 * import { createStaticDataSource } from '@taucad/workbench-panes/files/file-selector';
 *
 * const source = createStaticDataSource([{ path: 'parts/arm.ts', size: 120 }, { path: 'main.ts' }]);
 * await source.loadDirectory(''); // the `parts` folder, then main.ts
 * ```
 */
export function createStaticDataSource(files: readonly StaticFile[]): FileSelectorDataSource {
  const tree = buildTree(files);
  return {
    async loadDirectory(path) {
      return childrenAt(tree, path).map((node) => toEntry(node));
    },
    async searchFiles(query) {
      return searchTree(tree, query).map((node) => toEntry(node));
    },
  };
}

/**
 * The file icon a host draws for a file name; the Tau app passes its extension icons.
 *
 * @public
 */
export type FileBrowserIcon = ComponentType<Readonly<{ filename: string; className?: string }>>;

/**
 * What the browser shows while it is not searching: the folder's entries, a spinner, or why the folder did not list.
 *
 * @public
 */
export type FileBrowserStatus =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; message: string }>;

/**
 * Props for {@link FileBrowser}.
 *
 * @public
 */
export type FileBrowserProps = Readonly<{
  /** The folder shown, project-relative; `''` for the root. */
  currentPath: string;
  /** Show another folder, from a breadcrumb or a folder row. */
  onNavigate: (path: string) => void;
  /** The search text; while it is not empty, the browser lists `entries` as search results. */
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** The folder's entries, or the search results. */
  entries: readonly FilesEntry[];
  /** The folder's state while not searching. */
  status: FileBrowserStatus;
  /** List the folder again after it failed. */
  onRetry: () => void;
  /** The file drawn as chosen. */
  selectedFile: string | undefined;
  onSelect: (path: string) => void;
  /** A file being opened, drawn with a spinner. */
  pendingFile?: string | undefined;
  searchPlaceholder?: string | undefined;
  emptyMessage?: string | undefined;
  /** Entries above which the list is virtualized. */
  virtualizationThreshold?: number | undefined;
  /**
   * Fill the parent's height and scroll the list inside it, as a pane does. Otherwise the list is at most 300 px, as
   * in a popover.
   */
  fill?: boolean | undefined;
  FileIcon?: FileBrowserIcon | undefined;
  /** The breadcrumb row's scroller; the Tau app passes one that turns a vertical wheel into a horizontal scroll. */
  BreadcrumbScroller?: ComponentType<ComponentProps<'div'>> | undefined;
  className?: string | undefined;
}>;

/**
 * Where a search result sits relative to the folder shown, as the hint beside its name.
 *
 * @param filePath - The result's path.
 * @param basePath - The folder shown.
 * @returns The folder of the result, relative to the folder shown when inside it; `''` when it is that folder.
 */
const directoryHint = (filePath: string, basePath: string): string => {
  const directory = filePath.split('/').slice(0, -1).join('/');
  if (!directory || directory === basePath) {
    return '';
  }
  return basePath && directory.startsWith(`${basePath}/`) ? directory.slice(basePath.length + 1) : directory;
};

/**
 * Bytes as people read them, up to quettabytes.
 *
 * @param bytes - The size.
 * @returns For example `1.5 KB`.
 */
const formatBytes = (bytes: number): string => {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'RB', 'QB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${Number.parseFloat((bytes / k ** index).toFixed(1))} ${sizes[index]}`;
};

const breadcrumbsOf = (path: string): Array<{ name: string; path: string }> => {
  const parts = path === '' ? [] : path.split('/');
  return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }));
};

/** The breadcrumb row: the fixed `Files` root, then each folder, scrolled so the folder shown stays in view. */
function FileBreadcrumbs({
  currentPath,
  onNavigate,
  Scroller = 'div',
}: Readonly<{
  currentPath: string;
  onNavigate: (path: string) => void;
  Scroller?: ComponentType<ComponentProps<'div'>> | 'div';
}>): React.JSX.Element {
  const crumbs = breadcrumbsOf(currentPath);
  const currentCrumbRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentCrumbRef.current?.scrollIntoView({ behavior: 'instant', inline: 'end', block: 'nearest' });
  }, [currentPath]);

  return (
    <div className='flex items-center text-sm'>
      <Scroller className='mx-1 flex flex-1 snap-x snap-mandatory [scrollbar-width:none] items-center gap-0.5 overflow-x-auto overscroll-x-none [&::-webkit-scrollbar]:hidden'>
        <button
          type='button'
          className={cn(
            'my-1 shrink-0 snap-start rounded-xs px-1 py-0.5 hover:bg-muted',
            currentPath === '' ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
          onClick={() => {
            onNavigate('');
          }}
        >
          Files
        </button>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <div key={crumb.path} className='my-1 flex shrink-0 snap-start items-center gap-0.5'>
              <ChevronRight className='size-3 text-muted-foreground' />
              <button
                ref={isLast ? currentCrumbRef : undefined}
                type='button'
                className={cn(
                  'max-w-32 shrink-0 truncate rounded-xs px-1 py-0.5 hover:bg-muted',
                  isLast ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
                onClick={() => {
                  onNavigate(crumb.path);
                }}
              >
                {crumb.name}
              </button>
            </div>
          );
        })}
      </Scroller>
    </div>
  );
}

type RowProps = Readonly<{
  entry: FilesEntry;
  isSelected: boolean;
  isDisabled: boolean;
  isPending: boolean;
  hint: string | undefined;
  FileIcon: FileBrowserIcon;
  onNavigate: (path: string) => void;
  onSelect: (path: string) => void;
}>;

/** One row; files and folders are both command items, so they share one hover and keyboard highlight. */
function FileRow({
  entry,
  isSelected,
  isDisabled,
  isPending,
  hint,
  FileIcon,
  onNavigate,
  onSelect,
}: RowProps): React.JSX.Element {
  if (entry.isFolder) {
    return (
      <CommandItem
        value={entry.path}
        className='flex items-center justify-between gap-2'
        onSelect={() => {
          onNavigate(entry.path);
        }}
      >
        <div className={cn(menuItemLayoutClass, 'min-w-0 flex-1')}>
          <Folder className='shrink-0 text-muted-foreground' />
          <span className='truncate'>{entry.name}</span>
        </div>
        <ChevronRight className='shrink-0 text-muted-foreground' />
      </CommandItem>
    );
  }
  return (
    <CommandItem
      value={entry.path}
      disabled={isDisabled}
      aria-current={isSelected ? 'true' : undefined}
      className='flex items-center justify-between gap-2'
      onSelect={() => {
        onSelect(entry.path);
      }}
    >
      <div className={cn(menuItemLayoutClass, 'min-w-0 flex-1')}>
        {isPending ? <Loader className='shrink-0' /> : <FileIcon filename={entry.name} className='shrink-0' />}
        <span className={cn(hint ? 'shrink-0' : 'truncate', isSelected && 'font-medium')}>{entry.name}</span>
        {hint ? <span className='min-w-0 truncate text-xs text-muted-foreground'>{hint}</span> : undefined}
      </div>
      {entry.size === undefined ? undefined : (
        <span className='shrink-0 text-xs text-muted-foreground'>{formatBytes(entry.size)}</span>
      )}
    </CommandItem>
  );
}

const PlainFileIcon: FileBrowserIcon = ({ className }) => (
  <FileIconFallback aria-hidden className={cn('text-muted-foreground', className)} />
);

/**
 * A project file browser: breadcrumbs, a search field and the folder's entries (folders first), as the Tau app's file
 * picker and the Files pane draw it. It holds no state; {@link useFileBrowser} drives it from a data source.
 *
 * @param props - The folder, the search, the entries and what a choice does.
 * @returns The browser.
 * @public
 *
 * @example <caption>A pane-filling browser over a data source</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { createStaticDataSource, FileBrowser, useFileBrowser } from '@taucad/workbench-panes/files/file-selector';
 *
 * const dataSource = createStaticDataSource([{ path: 'main.ts' }]);
 *
 * export function ProjectFiles(): React.JSX.Element {
 *   const browser = useFileBrowser({ dataSource, isActive: true });
 *   return createElement(FileBrowser, { ...browser, selectedFile: undefined, onSelect: console.info, fill: true });
 * }
 * ```
 */
export function FileBrowser({
  currentPath,
  onNavigate,
  searchQuery,
  onSearchChange,
  entries,
  status,
  onRetry,
  selectedFile,
  onSelect,
  pendingFile,
  searchPlaceholder = 'Filter files…',
  emptyMessage = 'No files found.',
  virtualizationThreshold = 50,
  fill = false,
  FileIcon = PlainFileIcon,
  BreadcrumbScroller,
  className,
}: FileBrowserProps): React.JSX.Element {
  const isSearching = searchQuery.length > 0;
  /* A filling list scrolls its command list; Virtuoso measures that element once it is mounted. */
  // oxlint-disable-next-line typescript/no-restricted-types -- React passes null when a callback ref detaches.
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const row = (entry: FilesEntry): React.JSX.Element => (
    <FileRow
      key={entry.path}
      entry={entry}
      isSelected={selectedFile === entry.path}
      isDisabled={entry.renderable === false}
      isPending={pendingFile === entry.path}
      hint={isSearching ? directoryHint(entry.path, currentPath) : undefined}
      FileIcon={FileIcon}
      onNavigate={onNavigate}
      onSelect={onSelect}
    />
  );
  const renderItem = (index: number): React.JSX.Element | undefined => {
    const entry = entries[index];
    return entry === undefined ? undefined : row(entry);
  };

  const list = (): React.JSX.Element => {
    if (entries.length === 0) {
      return <div className='p-1 py-6 text-center text-sm text-muted-foreground'>{emptyMessage}</div>;
    }
    if (entries.length > virtualizationThreshold && (!fill || scrollParent !== null)) {
      return (
        <Virtuoso
          className='scroll-shadows-y'
          style={fill ? undefined : { height: '300px' }}
          customScrollParent={fill ? (scrollParent ?? undefined) : undefined}
          totalCount={entries.length}
          defaultItemHeight={40}
          itemContent={renderItem}
          components={{
            List: (properties) => <div {...properties} className='flex flex-col gap-0.5 px-1' />,
            Header: () => <div className='h-1' />,
            Footer: () => <div className='h-1' />,
          }}
        />
      );
    }
    return <div className='flex flex-col gap-0.5 p-1'>{entries.map((entry) => row(entry))}</div>;
  };

  return (
    <Command shouldFilter={false} className={cn('flex flex-col', fill && 'size-full min-h-0', className)}>
      <FileBreadcrumbs currentPath={currentPath} Scroller={BreadcrumbScroller} onNavigate={onNavigate} />
      <CommandInput placeholder={searchPlaceholder} value={searchQuery} onValueChange={onSearchChange} />
      <CommandList
        ref={setScrollParent}
        className={cn('scroll-shadows-y', fill ? 'max-h-none min-h-0 flex-1' : 'max-h-75')}
      >
        {status.kind === 'error' ? (
          <div className='flex flex-col items-center gap-2 p-4 text-center text-sm'>
            <p className='text-feature'>{status.message}</p>
            <Button type='button' variant='outline' size='sm' onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : status.kind === 'loading' ? (
          <div className='flex items-center justify-center p-4'>
            <Loader className='size-4' />
          </div>
        ) : (
          list()
        )}
      </CommandList>
    </Command>
  );
}

/**
 * Options of {@link useFileBrowser}.
 *
 * @public
 */
export type UseFileBrowserOptions = Readonly<{
  /** Lists the folders. Without it the host lists them itself and passes its own entries and status. */
  dataSource?: FileSelectorDataSource | undefined;
  /** Searches the tree; the data source's own search when omitted. */
  search?: Pick<FileSelectorDataSource, 'searchFiles'> | undefined;
  /** Whether the browser is on screen; folders list only while it is, and again when the data source changes. */
  isActive: boolean;
  /** Moves when the files change; the folder shown and the search list again. */
  revision?: number | undefined;
  /** The sentence a folder that failed to list shows. */
  describeError?: ((error: unknown, path: string) => string) | undefined;
}>;

/**
 * What {@link useFileBrowser} drives a {@link FileBrowser} with, plus `reset` for a host that reopens it elsewhere.
 *
 * @public
 */
export type FileBrowserState = Pick<
  FileBrowserProps,
  'currentPath' | 'onNavigate' | 'searchQuery' | 'onSearchChange' | 'entries' | 'status' | 'onRetry'
> &
  Readonly<{
    /** Show a folder with an empty search, as when a picker opens. */
    reset: (path: string) => void;
  }>;

const describeFailure = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The browsing state of a {@link FileBrowser} over a data source: the folder shown, its entries, the search and its
 * results. A folder lists again when the data source or `revision` changes, so a host whose files changed says so.
 *
 * @param options - The data source, the search, whether the browser is on screen and how a failure reads.
 * @returns The browser's props and `reset`.
 * @public
 */
export function useFileBrowser({
  dataSource,
  search,
  isActive,
  revision = 0,
  describeError = describeFailure,
}: UseFileBrowserOptions): FileBrowserState {
  const [currentPath, setCurrentPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [items, setItems] = useState<readonly FilesEntry[]>([]);
  const [status, setStatus] = useState<FileBrowserStatus>({ kind: 'loading' });
  const [searchResults, setSearchResults] = useState<readonly FilesEntry[]>([]);
  const [searchStatus, setSearchStatus] = useState<FileBrowserStatus>({ kind: 'ready' });
  const describeRef = useRef(describeError);
  describeRef.current = describeError;
  /** The folder the entries on screen belong to; listing it again keeps them on screen meanwhile. */
  const shownPath = useRef<string | undefined>(undefined);
  const searchAdapter = search ?? dataSource;

  useEffect(() => {
    if (!isActive || dataSource === undefined) {
      return;
    }
    let cancelled = false;
    if (shownPath.current !== currentPath) {
      setStatus({ kind: 'loading' });
    }
    const load = async (): Promise<void> => {
      try {
        const entries = await dataSource.loadDirectory(currentPath);
        if (!cancelled) {
          shownPath.current = currentPath;
          setItems(entries.toSorted(compareFileEntries));
          setStatus({ kind: 'ready' });
        }
      } catch (error) {
        if (!cancelled) {
          shownPath.current = undefined;
          setItems([]);
          setStatus({ kind: 'error', message: describeRef.current(error, currentPath) });
        }
      }
    };
    // async-iife: bootstrap — a newer folder, source or retry cancels this listing.
    void load();
    return () => {
      cancelled = true;
    };
  }, [isActive, dataSource, currentPath, reloadToken, revision]);

  useEffect(() => {
    if (!isActive || searchAdapter === undefined || searchQuery === '') {
      return;
    }
    let cancelled = false;
    setSearchStatus({ kind: 'loading' });
    const find = async (): Promise<void> => {
      try {
        const results = await searchAdapter.searchFiles(searchQuery);
        if (!cancelled) {
          setSearchResults(results);
          setSearchStatus({ kind: 'ready' });
        }
      } catch (error) {
        if (!cancelled) {
          setSearchResults([]);
          setSearchStatus({ kind: 'error', message: describeRef.current(error, searchQuery) });
        }
      }
    };
    // async-iife: bootstrap — a newer query cancels this search.
    void find();
    return () => {
      cancelled = true;
    };
  }, [isActive, searchAdapter, searchQuery, revision, reloadToken]);

  const onNavigate = useCallback((path: string) => {
    setCurrentPath(path);
    setSearchQuery('');
  }, []);
  const reset = useCallback((path: string) => {
    shownPath.current = undefined;
    setCurrentPath(path);
    setSearchQuery('');
    setReloadToken((token) => token + 1);
  }, []);
  const onRetry = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return {
    currentPath,
    onNavigate,
    searchQuery,
    onSearchChange: setSearchQuery,
    entries: searchQuery === '' ? items : searchResults,
    status: searchQuery === '' ? status : searchStatus,
    onRetry,
    reset,
  };
}
