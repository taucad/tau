import type { ReactNode } from 'react';
import { Fragment } from 'react/jsx-runtime';
import { ChevronRight, Download } from 'lucide-react';
import { FileExplorerContext } from '~/routes/builds_.$id/graphics-actor.js';
import { CopyButton } from '~/components/copy-button.js';
import { Button } from '~/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { toast } from '~/components/ui/sonner.js';
import { downloadBlob } from '~/utils/file.js';

export function ChatEditorBreadcrumbs(): ReactNode {
  const activeFile = FileExplorerContext.useSelector((state) =>
    state.context.openFiles.find((file) => file.id === state.context.activeFileId),
  );

  // Keep empty string initially to avoid flickering
  const displayPath = String(activeFile?.path ?? '');
  const parts = displayPath.split('/');

  const handleDownloadCode = () => {
    if (!activeFile) {
      return;
    }

    toast.promise(
      async () => {
        const blob = new Blob([activeFile.content], { type: 'text/plain' });
        downloadBlob(blob, activeFile.name);
      },
      {
        loading: `Downloading ${activeFile.name}...`,
        success: `Downloaded ${activeFile.name}`,
        error: `Failed to download ${activeFile.name}`,
      },
    );
  };

  return (
    <div className="flex h-11 flex-row items-center justify-between pr-2 pl-4 text-sm text-muted-foreground">
      <div className="flex flex-row items-center gap-0.5">
        {displayPath ? (
          parts.map((part, index) => (
            <Fragment key={part}>
              <span className="font-medium">{part}</span>
              {index < parts.length - 1 && <ChevronRight className="size-4" />}
            </Fragment>
          ))
        ) : (
          // Maintain height with invisible content when empty
          <span className="opacity-0">placeholder</span>
        )}
      </div>

      {Boolean(activeFile) && (
        <div className="flex flex-row items-center gap-1">
          <CopyButton
            size="icon"
            variant="ghost"
            className="size-7"
            getText={() => activeFile!.content}
            tooltip="Copy"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="size-7" onClick={handleDownloadCode}>
                <Download className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
