import { X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import { useBuild } from '#hooks/use-build.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';

export function ChatEditorTabs(): React.JSX.Element {
  const { fileExplorerRef } = useBuild();
  const openFiles = useSelector(fileExplorerRef, (state) => state.context.openFiles);
  const activeFileId = useSelector(fileExplorerRef, (state) => state.context.activeFileId);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleTabClick = useCallback(
    (fileId: string) => {
      fileExplorerRef.send({ type: 'setActiveFile', fileId });
    },
    [fileExplorerRef],
  );

  const handleTabClose = useCallback(
    (event: React.MouseEvent, fileId: string) => {
      event.stopPropagation();
      fileExplorerRef.send({ type: 'closeFile', fileId });
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
    <div className="border-b bg-muted/20">
      <div
        ref={scrollContainerRef}
        className="h-7.5 overflow-x-auto overflow-y-hidden overscroll-x-none [scrollbar-width:none]"
      >
        <div className="flex h-full w-max">
          {openFiles.map((file) => (
            <Fragment key={file.path}>
              <div
                key={file.id}
                className={cn(
                  'group/editor-tab flex h-full min-w-0 cursor-pointer items-center gap-1 border-y border-y-transparent pr-2 pl-4 text-sm transition-colors',
                  'hover:bg-muted/40',
                  activeFileId === file.id
                    ? 'border-b-primary bg-background text-foreground'
                    : 'bg-muted/20 text-muted-foreground',
                )}
                role="tab"
                tabIndex={0}
                aria-selected={activeFileId === file.id}
                onClick={() => {
                  handleTabClick(file.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    handleTabClick(file.id);
                  }
                }}
              >
                <span className="flex max-w-32 items-center gap-1.5 truncate">
                  <span className="truncate">{file.name}</span>
                  {(file.isDirty ?? file.gitStatus !== 'clean') ? (
                    <span
                      aria-label={
                        file.isDirty ? 'File has unsaved changes' : `File has git changes: ${file.gitStatus ?? ''}`
                      }
                      className="size-1.5 shrink-0 rounded-full bg-yellow"
                      title={file.isDirty ? 'Unsaved changes' : `Git status: ${file.gitStatus ?? ''}`}
                    />
                  ) : null}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'ml-1 size-4 p-0 transition-opacity hover:bg-primary/20',
                    activeFileId === file.id ? 'opacity-100' : 'opacity-0 group-hover/editor-tab:opacity-100',
                  )}
                  aria-label={`Close ${file.name}`}
                  onClick={(event) => {
                    handleTabClose(event, file.id);
                  }}
                >
                  <X className="size-3" />
                </Button>
              </div>
              <div className="h-full w-px bg-border" />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
