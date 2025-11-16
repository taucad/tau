import { X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import { useBuild } from '#hooks/use-build.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { FloatingPanelContentHeader } from '#components/ui/floating-panel.js';

export function ChatEditorTabs(): React.JSX.Element {
  const { fileExplorerRef, gitRef } = useBuild();
  const openFiles = useSelector(fileExplorerRef, (state) => state.context.openFiles);
  const activeFilePath = useSelector(fileExplorerRef, (state) => state.context.activeFilePath);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
        className="-mb-px h-7.75 overflow-x-auto overflow-y-hidden overscroll-x-none [scrollbar-width:none]"
      >
        <div className="flex h-full w-max">
          {openFiles.map((file) => {
            const gitStatus = gitStatuses.get(file.path)?.status;
            const isActive = activeFilePath === file.path;

            return (
              <Fragment key={file.path}>
                <div
                  className={cn(
                    'group/editor-tab flex h-full min-w-0 cursor-pointer items-center gap-1 border-y border-y-transparent pr-2 pl-4 text-sm transition-colors',
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
                  <span className="flex max-w-32 items-center gap-1.5 truncate">
                    <span className="truncate">{file.name}</span>
                    {gitStatus && gitStatus !== 'clean' ? (
                      <span
                        aria-label={`File has git changes: ${gitStatus}`}
                        className="size-1.5 shrink-0 rounded-full bg-yellow"
                        title={`Git status: ${gitStatus}`}
                      />
                    ) : null}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      'ml-1 size-4 p-0 transition-opacity hover:bg-primary/20',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover/editor-tab:opacity-100',
                    )}
                    aria-label={`Close ${file.name}`}
                    onClick={(event) => {
                      handleTabClose(event, file.path);
                    }}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
                <div className="h-full w-px bg-border" />
              </Fragment>
            );
          })}
        </div>
      </div>
    </FloatingPanelContentHeader>
  );
}
