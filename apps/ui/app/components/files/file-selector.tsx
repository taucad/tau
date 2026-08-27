import type { ReactNode } from 'react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { useDirectoryListing } from '@taucad/fs-client/react/use-directory-listing';
import type { DirectoryListingError, ListedDirectoryEntry } from '@taucad/fs-client/directory-listing';
import { classifyDirectoryListingError } from '@taucad/fs-client/directory-listing';
import { useIsMobile } from '#hooks/use-mobile.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { Command, CommandInput, CommandItem, CommandList } from '#components/ui/command.js';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '#components/ui/drawer.js';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover.js';
import { Button } from '#components/ui/button.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { cn } from '#utils/ui.utils.js';
import { menuItemLayoutClass } from '#components/ui/menu.variants.js';
import { Loader } from '#components/ui/loader.js';
import { OmniScroller } from '#components/ui/omni-scroller.js';

export type FileSelectorEntry = {
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
};

export type FileSelectorDataSource = {
  loadDirectory: (path: string) => Promise<FileSelectorEntry[]>;
  searchFiles: (query: string) => Promise<FileSelectorEntry[]>;
};

/**
 * Wrap a static file list into a `FileSelectorDataSource`.
 * Builds the tree once; all returned promises resolve in-memory (zero latency).
 * Used by import routes where files come from GitHub API or disk upload.
 */
export function createStaticDataSource(files: Array<{ path: string; size?: number }>): FileSelectorDataSource {
  const tree = buildTree(files);
  const toEntry = (node: TreeNode): FileSelectorEntry => ({
    name: node.name,
    path: node.path,
    isFolder: node.isFolder,
    size: node.size,
  });

  return {
    async loadDirectory(path: string) {
      return getItemsAtPath(tree, path).map((node) => toEntry(node));
    },
    async searchFiles(query: string) {
      return searchFilesRecursively(tree, query).map((node) => toEntry(node));
    },
  };
}

type FileSelectorProps = {
  readonly popoverProperties?: React.ComponentProps<typeof PopoverContent>;
  /** Explicit data source. When omitted, auto-resolves from FileManagerProvider context. */
  readonly dataSource?: FileSelectorDataSource;
  /** Include directories in search results (only applies to context-based data source). */
  readonly shouldIncludeDirectories?: boolean;
  readonly selectedFile: string | undefined;
  readonly onSelect: (file: string) => void;
  readonly placeholder?: string;
  readonly isLoading?: boolean;
  readonly isDisabled?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly title?: string;
  readonly description?: string;
  readonly searchPlaceholder?: string;
  readonly emptyMessage?: string;
  readonly virtualizationThreshold?: number;
  /** Directory path to show when opened. If not provided, navigates to parent of selectedFile. */
  readonly initialPath?: string;
};

type TreeNode = {
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
  children: Map<string, TreeNode>;
};

/**
 * Build tree structure from flat file paths
 */
function buildTree(files: Array<{ path: string; size?: number }>): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    isFolder: true,
    children: new Map(),
  };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (!part) {
        continue;
      }

      const isLastPart = index === parts.length - 1;
      const currentPath = parts.slice(0, index + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          isFolder: !isLastPart,
          size: isLastPart ? file.size : undefined,
          children: new Map(),
        });
      }

      const node = current.children.get(part);
      if (node) {
        current = node;
      }
    }
  }

  return root;
}

/**
 * Get items at a specific path level
 */
function getItemsAtPath(root: TreeNode, currentPath: string): TreeNode[] {
  if (!currentPath) {
    return [...root.children.values()].sort(sortNodes);
  }

  const parts = currentPath.split('/');
  let current = root;

  for (const part of parts) {
    const child = current.children.get(part);
    if (!child) {
      return [];
    }

    current = child;
  }

  return [...current.children.values()].sort(sortNodes);
}

/**
 * Sort nodes: folders first, then alphabetically
 */
function sortNodes(a: TreeNode, b: TreeNode): number {
  if (a.isFolder && !b.isFolder) {
    return -1;
  }

  if (!a.isFolder && b.isFolder) {
    return 1;
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Recursively search tree for files matching the query
 */
function searchFilesRecursively(node: TreeNode, query: string): TreeNode[] {
  const results: TreeNode[] = [];
  const lowerQuery = query.toLowerCase();

  function traverse(current: TreeNode): void {
    for (const child of current.children.values()) {
      if (child.isFolder) {
        traverse(child);
      } else if (child.name.toLowerCase().includes(lowerQuery)) {
        results.push(child);
      }
    }
  }

  traverse(node);
  return results.sort(sortNodes);
}

/**
 * Get a relative directory hint for a file path from a base path
 */
function getDirectoryHint(filePath: string, basePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  const directory = parts.join('/');

  if (!directory) {
    return '';
  }

  if (!basePath) {
    return directory;
  }

  if (directory === basePath) {
    return '';
  }

  if (directory.startsWith(basePath + '/')) {
    return directory.slice(basePath.length + 1);
  }

  return directory;
}

/**
 * Format bytes to human-readable size.
 * Supports sizes up to Quettabytes (QB, ~10^30 bytes).
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  // SI byte units: B, KB, MB, GB, TB, PB, EB, ZB, YB, RB, QB
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'RB', 'QB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get breadcrumb segments from a path
 */
function getBreadcrumbs(path: string): Array<{ name: string; path: string }> {
  if (!path) {
    return [];
  }

  const parts = path.split('/');
  const crumbs: Array<{ name: string; path: string }> = [];

  for (let i = 0; i < parts.length; i++) {
    crumbs.push({
      name: parts[i] ?? '',
      path: parts.slice(0, i + 1).join('/'),
    });
  }

  return crumbs;
}

/**
 * Breadcrumb navigation component
 * Keeps "Files" root fixed, makes the rest scrollable with auto-scroll to current level
 */
function BreadcrumbNav({
  currentPath,
  onNavigate,
}: {
  readonly currentPath: string;
  readonly onNavigate: (path: string) => void;
}): React.JSX.Element {
  const crumbs = getBreadcrumbs(currentPath);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentCrumbRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to show the current (last) breadcrumb when path changes
  useEffect(() => {
    if (currentCrumbRef.current && scrollContainerRef.current) {
      currentCrumbRef.current.scrollIntoView({ behavior: 'instant', inline: 'end', block: 'nearest' });
    }
  }, [currentPath]);

  return (
    <div className='flex items-center border-b text-sm'>
      <OmniScroller
        ref={scrollContainerRef}
        className='mx-2 flex flex-1 snap-x snap-mandatory [scrollbar-width:none] items-center gap-0.5 overscroll-x-none [&::-webkit-scrollbar]:hidden'
      >
        {/* "Files" root button - inside scrollable area */}
        <button
          type='button'
          className={cn(
            'my-1.5 shrink-0 snap-start rounded-xs px-1 py-0.5 hover:bg-muted',
            currentPath === '' && 'font-medium text-foreground',
            currentPath !== '' && 'text-muted-foreground',
          )}
          onClick={() => {
            onNavigate('');
          }}
        >
          Files
        </button>
        {/* Path segments */}
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <div key={crumb.path} className='my-1.5 flex shrink-0 snap-start items-center gap-0.5'>
              <ChevronRight className='size-3 text-muted-foreground' />
              <button
                ref={isLast ? currentCrumbRef : undefined}
                type='button'
                className={cn(
                  'max-w-32 shrink-0 truncate rounded-xs px-1 py-0.5 hover:bg-muted',
                  isLast && 'font-medium text-foreground',
                  !isLast && 'text-muted-foreground',
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
      </OmniScroller>
    </div>
  );
}

/**
 * Render a single file/folder item
 * Both files and folders use CommandItem to ensure unified hover state management
 */
function FileSelectorItem({
  item,
  isSelected,
  directoryHint,
  onDrillDown,
  onSelect,
}: {
  readonly item: TreeNode;
  readonly isSelected: boolean;
  readonly directoryHint?: string;
  readonly onDrillDown: (path: string) => void;
  readonly onSelect: (path: string) => void;
}): React.JSX.Element {
  if (item.isFolder) {
    return (
      <CommandItem
        value={item.path}
        className='flex items-center justify-between gap-2'
        onSelect={() => {
          onDrillDown(item.path);
        }}
      >
        <div className={cn(menuItemLayoutClass, 'min-w-0 flex-1')}>
          <Folder className='shrink-0 text-muted-foreground' />
          <span className='truncate'>{item.name}</span>
        </div>
        <ChevronRight className='shrink-0 text-muted-foreground' />
      </CommandItem>
    );
  }

  return (
    <CommandItem
      value={item.path}
      className='flex items-center justify-between gap-2'
      onSelect={() => {
        onSelect(item.path);
      }}
    >
      <div className={cn(menuItemLayoutClass, 'min-w-0 flex-1')}>
        <FileExtensionIcon filename={item.name} className='shrink-0' />
        <span className={cn(directoryHint ? 'shrink-0' : 'truncate', isSelected && 'font-medium')}>{item.name}</span>
        {directoryHint ? (
          <span className='min-w-0 truncate text-xs text-muted-foreground'>{directoryHint}</span>
        ) : undefined}
      </div>
      {item.size === undefined ? undefined : (
        <span className='shrink-0 text-xs text-muted-foreground'>{formatBytes(item.size)}</span>
      )}
    </CommandItem>
  );
}

function FileSelectorItemList({
  items,
  currentPath,
  selectedFile,
  isSearching,
  virtualizationThreshold,
  emptyMessage,
  onDrillDown,
  onSelect,
}: {
  readonly items: TreeNode[];
  readonly currentPath: string;
  readonly selectedFile: string | undefined;
  readonly isSearching: boolean;
  readonly virtualizationThreshold: number;
  readonly emptyMessage: string;
  readonly onDrillDown: (path: string) => void;
  readonly onSelect: (path: string) => void;
}): React.JSX.Element {
  const renderItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) {
        return undefined;
      }

      const hint = isSearching ? getDirectoryHint(item.path, currentPath) : undefined;

      return (
        <FileSelectorItem
          key={item.path}
          item={item}
          isSelected={selectedFile === item.path}
          directoryHint={hint ?? undefined}
          onDrillDown={onDrillDown}
          onSelect={onSelect}
        />
      );
    },
    [items, selectedFile, isSearching, currentPath, onDrillDown, onSelect],
  );

  if (items.length === 0) {
    return <div className='p-1 py-6 text-center text-sm text-muted-foreground'>{emptyMessage}</div>;
  }

  if (items.length > virtualizationThreshold) {
    return (
      <Virtuoso
        className='scroll-shadows-y'
        style={{ height: '300px' }}
        totalCount={items.length}
        defaultItemHeight={40}
        itemContent={renderItem}
        components={{
          List: (properties) => <div {...properties} className='px-1' />,
          Header: () => <div className='h-1' />,
          Footer: () => <div className='h-1' />,
        }}
      />
    );
  }

  return (
    <div className='p-1'>
      {items.map((item) => {
        const hint = isSearching ? getDirectoryHint(item.path, currentPath) : undefined;
        return (
          <FileSelectorItem
            key={item.path}
            item={item}
            isSelected={selectedFile === item.path}
            directoryHint={hint ?? undefined}
            onDrillDown={onDrillDown}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

function useFileSelectorContextSearch(
  shouldIncludeDirectories?: boolean,
): { searchFiles: (query: string) => Promise<FileSelectorEntry[]> } | undefined {
  const fileManager = useOptionalFileManager();
  const treeService = fileManager?.treeService;

  const searchFiles = useCallback(
    async (query: string): Promise<FileSelectorEntry[]> => {
      if (!treeService) {
        return [];
      }
      const items = await treeService.searchFiles(query, {
        maxResults: 100,
        includeDirectories: shouldIncludeDirectories,
      });
      return items.map((f) => ({
        name: f.name,
        path: f.path,
        isFolder: f.type === 'dir',
        size: f.size,
      }));
    },
    [treeService, shouldIncludeDirectories],
  );

  return useMemo(() => (treeService ? { searchFiles } : undefined), [treeService, searchFiles]);
}

function listedEntriesToTreeNodes(entries: readonly ListedDirectoryEntry[]): TreeNode[] {
  return entries
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      isFolder: entry.isFolder,
      size: entry.size,
      children: new Map<string, TreeNode>(),
    }))
    .sort(sortNodes);
}

function FileSelectorBrowseErrorRow({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <div className='flex flex-col items-center gap-2 p-4 text-center text-sm'>
      <p className='text-destructive'>{message}</p>
      <Button type='button' variant='outline' size='sm' onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

// oxlint-disable-next-line complexity -- virtualized selector with explicit browse/search modes
export function FileSelector({
  dataSource: explicitSource,
  shouldIncludeDirectories,
  selectedFile,
  onSelect,
  placeholder = 'Select file...',
  isLoading = false,
  isDisabled = false,
  children,
  className,
  title = 'Select File',
  description = 'Choose a file from the list',
  searchPlaceholder = 'Search files...',
  emptyMessage = 'No files found.',
  virtualizationThreshold = 50,
  popoverProperties,
  initialPath,
}: FileSelectorProps): React.JSX.Element {
  const fileManager = useOptionalFileManager();
  const contextSearch = useFileSelectorContextSearch(shouldIncludeDirectories);
  const isExplicitBrowse = explicitSource !== undefined;
  const searchAdapter = explicitSource ?? contextSearch;

  const [open, setOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [listingReloadToken, setListingReloadToken] = useState(0);
  const isMobile = useIsMobile();

  const directoryListing = useDirectoryListing(
    !isExplicitBrowse && open ? fileManager?.treeService : undefined,
    currentPath,
    { reloadToken: listingReloadToken },
  );

  const [items, setItems] = useState<TreeNode[]>([]);
  const [browseError, setBrowseError] = useState<DirectoryListingError | undefined>(undefined);
  const [searchResults, setSearchResults] = useState<TreeNode[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  const loadDirectoryExplicit = useCallback(
    async (path: string) => {
      if (!explicitSource) {
        return;
      }
      setBrowseError(undefined);
      setIsLoadingItems(true);
      try {
        const entries = await explicitSource.loadDirectory(path);
        setItems(
          entries
            .map((entry) => ({
              name: entry.name,
              path: entry.path,
              isFolder: entry.isFolder,
              size: entry.size,
              children: new Map<string, TreeNode>(),
            }))
            .sort(sortNodes),
        );
      } catch (error) {
        setBrowseError(classifyDirectoryListingError(error, path));
        setItems([]);
      } finally {
        setIsLoadingItems(false);
      }
    },
    [explicitSource],
  );

  useEffect(() => {
    if (!searchAdapter || !searchQuery) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const fetchResults = async (): Promise<void> => {
      const results = await searchAdapter.searchFiles(searchQuery);
      if (!cancelled) {
        setSearchResults(
          results.map((entry) => ({
            name: entry.name,
            path: entry.path,
            isFolder: entry.isFolder,
            size: entry.size,
            children: new Map<string, TreeNode>(),
          })),
        );
      }
    };
    void fetchResults();
    return () => {
      cancelled = true;
    };
  }, [searchAdapter, searchQuery]);

  const contextBrowseItems = useMemo(() => {
    if (directoryListing.kind !== 'ready') {
      return [];
    }
    return listedEntriesToTreeNodes(directoryListing.entries);
  }, [directoryListing]);

  const explicitBrowseError = isExplicitBrowse ? browseError : undefined;
  const contextBrowseError =
    !isExplicitBrowse && directoryListing.kind === 'error' ? directoryListing.cause : undefined;
  const activeBrowseError = explicitBrowseError ?? contextBrowseError;

  const displayItems = searchQuery ? searchResults : isExplicitBrowse ? items : contextBrowseItems;

  const isSearching = searchQuery.length > 0;

  const isBrowsingLoading = isSearching
    ? false
    : isExplicitBrowse
      ? isLoadingItems
      : directoryListing.kind === 'loading' || directoryListing.kind === 'unready';

  const handleBrowseRetry = useCallback(() => {
    if (isExplicitBrowse) {
      void loadDirectoryExplicit(currentPath);
    } else {
      setListingReloadToken((n) => n + 1);
    }
  }, [isExplicitBrowse, loadDirectoryExplicit, currentPath]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        let targetPath = '';
        if (initialPath !== undefined) {
          targetPath = initialPath;
        } else if (selectedFile) {
          const parts = selectedFile.split('/');
          parts.pop();
          targetPath = parts.join('/');
        }
        setCurrentPath(targetPath);
        setSearchQuery('');
        setListingReloadToken(0);
        setBrowseError(undefined);
        if (isExplicitBrowse) {
          void loadDirectoryExplicit(targetPath);
        }
      }
    },
    [initialPath, selectedFile, isExplicitBrowse, loadDirectoryExplicit],
  );

  const handleSelect = useCallback(
    (path: string) => {
      onSelect(path);
      setOpen(false);
    },
    [onSelect],
  );

  const handleDrillDown = useCallback(
    (path: string) => {
      setCurrentPath(path);
      setSearchQuery('');
      if (isExplicitBrowse) {
        void loadDirectoryExplicit(path);
      }
    },
    [isExplicitBrowse, loadDirectoryExplicit],
  );

  const handleNavigate = useCallback(
    (path: string) => {
      setCurrentPath(path);
      setSearchQuery('');
      if (isExplicitBrowse) {
        void loadDirectoryExplicit(path);
      }
    },
    [isExplicitBrowse, loadDirectoryExplicit],
  );

  const selectedFileName = selectedFile?.split('/').pop();

  const triggerButton = children ?? (
    <Button variant='outline' className={cn('w-full justify-between', className)} disabled={isDisabled || isLoading}>
      <div className='flex min-w-0 flex-1 items-center gap-2'>
        {isLoading ? (
          <Loader className='size-4' />
        ) : selectedFile ? (
          <FileExtensionIcon filename={selectedFile} className='size-4 shrink-0' />
        ) : undefined}
        <span className={cn('truncate', !selectedFile && 'text-muted-foreground')}>
          {selectedFileName ?? placeholder}
        </span>
      </div>
      <ChevronDown className='size-4 shrink-0' />
    </Button>
  );

  const content = (
    <Command shouldFilter={false} className='flex flex-col'>
      <BreadcrumbNav currentPath={currentPath} onNavigate={handleNavigate} />
      <CommandInput placeholder={searchPlaceholder} value={searchQuery} onValueChange={setSearchQuery} />
      <CommandList className='max-h-[300px] scroll-shadows-y'>
        {isSearching ? (
          <FileSelectorItemList
            items={displayItems}
            currentPath={currentPath}
            selectedFile={selectedFile}
            isSearching={isSearching}
            virtualizationThreshold={virtualizationThreshold}
            emptyMessage={emptyMessage}
            onDrillDown={handleDrillDown}
            onSelect={handleSelect}
          />
        ) : activeBrowseError ? (
          <FileSelectorBrowseErrorRow message={activeBrowseError.message} onRetry={handleBrowseRetry} />
        ) : isBrowsingLoading ? (
          <div className='flex items-center justify-center p-4'>
            <Loader className='size-4' />
          </div>
        ) : (
          <FileSelectorItemList
            items={displayItems}
            currentPath={currentPath}
            selectedFile={selectedFile}
            isSearching={isSearching}
            virtualizationThreshold={virtualizationThreshold}
            emptyMessage={emptyMessage}
            onDrillDown={handleDrillDown}
            onSelect={handleSelect}
          />
        )}
      </CommandList>
    </Command>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
        <DrawerContent aria-labelledby='drawer-title' aria-describedby='drawer-description'>
          <DrawerTitle className='sr-only' id='drawer-title'>
            {title}
          </DrawerTitle>
          <DrawerDescription className='sr-only' id='drawer-description'>
            {description}
          </DrawerDescription>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent {...popoverProperties} className={cn('w-[300px] p-0', popoverProperties?.className)}>
        {content}
      </PopoverContent>
    </Popover>
  );
}
