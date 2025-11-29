import { Fragment, useCallback, useEffect, useRef } from 'react';
import { X, Download, Eye, EyeOff } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { useBuild } from '#hooks/use-build.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { FloatingPanelContentHeader, FloatingPanelContentHeaderActions } from '#components/ui/floating-panel.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useCookie } from '#hooks/use-cookie.js';
import { CopyButton } from '#components/copy-button.js';
import { toast } from '#components/ui/sonner.js';
import { downloadBlob } from '#utils/file.utils.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';

export function ChatEditorTabs(): React.JSX.Element {
  const { fileExplorerRef, gitRef } = useBuild();

  // Get active file path from file explorer
  const activeFile = useSelector(fileExplorerRef, (state) => ({
    path: state.context.activeFilePath,
    parts: state.context.activeFilePath?.split('/') ?? [],
    name: state.context.activeFilePath?.split('/').pop() ?? '',
  }));
  const openFiles = useSelector(fileExplorerRef, (state) => state.context.openFiles);
  const activeFilePath = useSelector(fileExplorerRef, (state) => state.context.activeFilePath);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fileManager = useFileManager();

  const [enableFilePreview, setEnableFilePreview] = useCookie<boolean>('cad-file-preview', true);

  const handleDownloadCode = useCallback(() => {
    toast.promise(
      async () => {
        if (!activeFile.path) {
          throw new Error('Active file path is required for downloading code');
        }

        const activeFileData = await fileManager.readFile(activeFile.path);

        const blob = new Blob([activeFileData], { type: 'text/plain' });
        downloadBlob(blob, activeFile.name);
      },
      {
        loading: `Downloading ${activeFile.name}...`,
        success: `Downloaded ${activeFile.name}`,
        error: `Failed to download ${activeFile.path}`,
      },
    );
  }, [activeFile.name, activeFile.path, fileManager]);

  const handleGetCodeText = useCallback(async (): Promise<string> => {
    if (!activeFile.path) {
      throw new Error('Active file path is required for copying code');
    }

    const activeFileData = await fileManager.readFile(activeFile.path);

    return decodeTextFile(activeFileData);
  }, [activeFile.path, fileManager]);

  const handleToggleFilePreview = () => {
    setEnableFilePreview(!enableFilePreview);
  };

  // Get git statuses for display
  const gitStatuses = useSelector(gitRef, (state) => state.context.fileStatuses);

  const handleTabClick = useCallback(
    (path: string) => {
      fileExplorerRef.send({ type: 'setActiveFile', path });
    },
    [fileExplorerRef],
  );

  const handleTabClose = useCallback(
    (event: React.MouseEvent, path: string) => {
      event.stopPropagation();
      fileExplorerRef.send({ type: 'closeFile', path });
    },
    [fileExplorerRef],
  );

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      // Only handle vertical scroll when there's horizontal overflow
      if (event.deltaY !== 0 && scrollContainer.scrollWidth > scrollContainer.clientWidth) {
        event.preventDefault();
        scrollContainer.scrollLeft += event.deltaY;
      }
    };

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      scrollContainer.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <FloatingPanelContentHeader className="pl-0">
      <div
        ref={scrollContainerRef}
        className="z-40 -mb-px h-7.75 overflow-x-auto overflow-y-hidden overscroll-x-none [scrollbar-width:none]"
      >
        <div className="flex h-full w-max">
          {openFiles.map((file) => {
            const gitStatus = gitStatuses.get(file.path)?.status;
            const isActive = activeFilePath === file.path;

            return (
              <Fragment key={file.path}>
                <div
                  className={cn(
                    'group/editor-tab flex h-full min-w-0 cursor-pointer items-center gap-0 border-y border-y-transparent pr-1 pl-3 text-sm transition-colors',
                    'hover:bg-accent/40',
                    isActive
                      ? 'border-b-[1.5px] border-b-primary bg-accent/50 text-foreground'
                      : 'text-muted-foreground',
                  )}
                  role="tab"
                  tabIndex={0}
                  aria-selected={isActive}
                  onClick={() => {
                    handleTabClick(file.path);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      handleTabClick(file.path);
                    }
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex max-w-32 items-center gap-1.5 truncate">
                        <FileExtensionIcon filename={file.name} className="size-3 shrink-0" />
                        <span className="truncate">{file.name}</span>
                        {gitStatus && gitStatus !== 'clean' ? (
                          <span
                            aria-label={`File has git changes: ${gitStatus}`}
                            className="size-1.5 shrink-0 rounded-full bg-yellow"
                            title={`Git status: ${gitStatus}`}
                          />
                        ) : null}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{file.path}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          'ml-1 size-6 rounded-sm p-0 transition-opacity hover:bg-primary/20',
                          isActive ? 'opacity-100' : 'opacity-0 group-hover/editor-tab:opacity-100',
                        )}
                        aria-label={`Close ${file.name}`}
                        onClick={(event) => {
                          handleTabClose(event, file.path);
                        }}
                      >
                        <X className="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Close</TooltipContent>
                  </Tooltip>
                </div>
                <div className="h-full w-px bg-border" />
              </Fragment>
            );
          })}
        </div>
      </div>
      <FloatingPanelContentHeaderActions>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 rounded-sm"
              aria-label={enableFilePreview ? 'Disable file preview' : 'Enable file preview'}
              onClick={handleToggleFilePreview}
            >
              {enableFilePreview ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{enableFilePreview ? 'Disable file preview' : 'Enable file preview'}</TooltipContent>
        </Tooltip>
        {Boolean(activeFile) && (
          <>
            <CopyButton
              size="icon"
              variant="ghost"
              className="size-6 rounded-sm"
              getText={handleGetCodeText}
              tooltip="Copy code"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="size-6 rounded-sm" onClick={handleDownloadCode}>
                  <Download className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download code</TooltipContent>
            </Tooltip>
          </>
        )}
      </FloatingPanelContentHeaderActions>
    </FloatingPanelContentHeader>
  );
}
