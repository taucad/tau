import { X } from 'lucide-react';
import { useCallback } from 'react';
import type { JSX } from 'react';
import { FileExplorerContext } from '~/routes/builds_.$id/graphics-actor.js';
import { Button } from '~/components/ui/button.js';
import { cn } from '~/utils/ui.js';

export function ChatEditorTabs(): JSX.Element {
  const openFiles = FileExplorerContext.useSelector((state) => state.context.openFiles);
  const activeFileId = FileExplorerContext.useSelector((state) => state.context.activeFileId);
  const actorRef = FileExplorerContext.useActorRef();

  const handleTabClick = useCallback(
    (fileId: string) => {
      actorRef.send({ type: 'setActiveFile', fileId });
    },
    [actorRef],
  );

  const handleTabClose = useCallback(
    (event: React.MouseEvent, fileId: string) => {
      event.stopPropagation();
      actorRef.send({ type: 'closeFile', fileId });
    },
    [actorRef],
  );

  return (
    <div className="h-8 border-b bg-muted/20">
      <div className="h-full overflow-x-auto overflow-y-hidden overscroll-x-none [scrollbar-width:none]">
        <div className="flex h-full w-max">
          {openFiles.map((file) => (
            <div
              key={file.id}
              className={cn(
                'group/editor-tab flex h-full min-w-0 cursor-pointer items-center gap-1 border-y border-r border-y-transparent pr-1 pl-2 text-sm transition-colors',
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
              <span className="max-w-32 truncate">
                {file.name}
                {file.isDirty ? ' •' : ''}
              </span>
              <Button
                size="xs"
                variant="ghost"
                className={cn(
                  'ml-1 size-5 p-0 transition-opacity hover:bg-primary/20',
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
          ))}
        </div>
      </div>
    </div>
  );
}
