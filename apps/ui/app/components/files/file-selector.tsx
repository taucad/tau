import type { ReactNode } from 'react';
import { useState, useMemo, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDirectoryListing } from '@taucad/fs-client/react/use-directory-listing';
import { classifyDirectoryListingError } from '@taucad/fs-client/directory-listing';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { compareFileEntries, FileBrowser, useFileBrowser } from '@taucad/workbench-panes/files/file-selector';
import type { FileBrowserStatus, FileSelectorDataSource } from '@taucad/workbench-panes/files/file-selector';
import type { FilesEntry } from '@taucad/workbench-panes/files/files-source';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '@taucad/ui/components/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Button } from '@taucad/ui/components/button';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { cn } from '@taucad/ui/utils/cn';
import { Loader } from '@taucad/ui/components/loader';
import { OmniScroller } from '#components/ui/omni-scroller.js';

type FileSelectorProps = {
  readonly popoverProperties?: React.ComponentProps<typeof PopoverContent>;
  /** Explicit data source. When omitted, auto-resolves from FileManagerProvider context. */
  readonly dataSource?: FileSelectorDataSource & { readonly revision?: number };
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

function useFileSelectorContextSearch(
  shouldIncludeDirectories?: boolean,
): { searchFiles: (query: string) => Promise<FilesEntry[]> } | undefined {
  const fileManager = useOptionalFileManager();
  const treeService = fileManager?.treeService;

  const searchFiles = useCallback(
    async (query: string): Promise<FilesEntry[]> => {
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

const describeListingError = (error: unknown, path: string): string =>
  classifyDirectoryListingError(error, path).message;

export function FileSelector({
  dataSource: explicitSource,
  shouldIncludeDirectories,
  selectedFile,
  onSelect,
  placeholder = 'Select file…',
  isLoading = false,
  isDisabled = false,
  children,
  className,
  title = 'Select File',
  description = 'Choose a file from the list',
  searchPlaceholder = 'Filter files…',
  emptyMessage = 'No files found.',
  virtualizationThreshold = 50,
  popoverProperties,
  initialPath,
}: FileSelectorProps): React.JSX.Element {
  const fileManager = useOptionalFileManager();
  const contextSearch = useFileSelectorContextSearch(shouldIncludeDirectories);
  const isExplicitBrowse = explicitSource !== undefined;

  const [open, setOpen] = useState(false);
  const [listingReloadToken, setListingReloadToken] = useState(0);
  const isMobile = useIsMobile();

  /* The shared browser lists an explicit source itself; the context source is the tree service's shared listing. */
  const browser = useFileBrowser({
    dataSource: explicitSource,
    search: explicitSource ?? contextSearch,
    isActive: open,
    revision: explicitSource?.revision,
    describeError: describeListingError,
  });
  const { currentPath, reset } = browser;

  const directoryListing = useDirectoryListing(
    !isExplicitBrowse && open ? fileManager?.treeService : undefined,
    currentPath,
    { reloadToken: listingReloadToken },
  );

  const contextEntries = useMemo(
    (): FilesEntry[] =>
      directoryListing.kind === 'ready'
        ? directoryListing.entries
            .map(({ name, path, isFolder, size }) => ({ name, path, isFolder, size }))
            .toSorted(compareFileEntries)
        : [],
    [directoryListing],
  );
  const contextStatus: FileBrowserStatus =
    directoryListing.kind === 'error'
      ? { kind: 'error', message: directoryListing.cause.message }
      : directoryListing.kind === 'ready'
        ? { kind: 'ready' }
        : { kind: 'loading' };

  const handleContextRetry = useCallback(() => {
    setListingReloadToken((n) => n + 1);
  }, []);

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
        reset(targetPath);
        setListingReloadToken(0);
      }
    },
    [initialPath, selectedFile, reset],
  );

  const handleSelect = useCallback(
    (path: string) => {
      onSelect(path);
      setOpen(false);
    },
    [onSelect],
  );

  const selectedFileName = selectedFile ? selectedFile.split('/').pop() : undefined;

  const triggerButton = children ?? (
    <Button variant='outline' className={cn('w-full justify-between', className)} disabled={isDisabled || isLoading}>
      <div className='flex min-w-0 flex-1 items-center gap-2'>
        {isLoading ? (
          <Loader className='size-4' />
        ) : selectedFile ? (
          <FileExtensionIcon filename={selectedFile} className='size-4 shrink-0' />
        ) : undefined}
        <span className={cn('truncate', !selectedFile && 'font-normal text-muted-foreground')}>
          {selectedFileName ?? placeholder}
        </span>
      </div>
      <ChevronDown className='size-4 shrink-0' />
    </Button>
  );

  const isSearching = browser.searchQuery.length > 0;
  const content = (
    <FileBrowser
      {...browser}
      entries={isExplicitBrowse || isSearching ? browser.entries : contextEntries}
      status={isExplicitBrowse || isSearching ? browser.status : contextStatus}
      selectedFile={selectedFile}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
      virtualizationThreshold={virtualizationThreshold}
      FileIcon={FileExtensionIcon}
      BreadcrumbScroller={OmniScroller}
      onRetry={isExplicitBrowse || isSearching ? browser.onRetry : handleContextRetry}
      onSelect={handleSelect}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
        <DrawerContent>
          <DrawerTitle className='sr-only'>{title}</DrawerTitle>
          <DrawerDescription className='sr-only'>{description}</DrawerDescription>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent {...popoverProperties} className={cn('w-75 p-0', popoverProperties?.className)}>
        {content}
      </PopoverContent>
    </Popover>
  );
}
