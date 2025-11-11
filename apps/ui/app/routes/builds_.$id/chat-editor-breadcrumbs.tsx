import type { ReactNode } from 'react';
import { Fragment } from 'react/jsx-runtime';
import { ChevronRight, Download, Eye, EyeOff } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { CopyButton } from '#components/copy-button.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { toast } from '#components/ui/sonner.js';
import { downloadBlob } from '#utils/file.utils.js';
import { useBuild } from '#hooks/use-build.js';
import { useCookie } from '#hooks/use-cookie.js';

export function ChatEditorBreadcrumbs(): ReactNode {
  const { fileExplorerRef, buildRef } = useBuild();

  // Get active file path from file explorer
  const activeFilePath = useSelector(fileExplorerRef, (state) => state.context.activeFilePath);

  // Get active file content from build machine (source of truth)
  const activeFile = useSelector(buildRef, (state) => {
    if (!activeFilePath) {
      return undefined;
    }

    const files = state.context.build?.assets.mechanical?.files;
    const fileContent = files?.[activeFilePath];
    if (!fileContent) {
      return undefined;
    }

    return {
      path: activeFilePath,
      name: activeFilePath.split('/').pop() ?? activeFilePath,
      content: fileContent.content,
    };
  });

  const [enableFilePreview, setEnableFilePreview] = useCookie<boolean>('cad-file-preview', true);

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

  const handleToggleFilePreview = () => {
    setEnableFilePreview(!enableFilePreview);
  };

  return (
    <div className="flex flex-row items-center justify-between py-0.25 pr-0.25 pl-3 text-muted-foreground">
      <div className="flex flex-row items-center gap-0.5">
        {displayPath ? (
          parts.map((part, index) => (
            <Fragment key={part}>
              <span className="text-sm font-medium">{part}</span>
              {index < parts.length - 1 && <ChevronRight className="size-4" />}
            </Fragment>
          ))
        ) : (
          // Maintain height with invisible content when empty
          <span className="opacity-0">placeholder</span>
        )}
      </div>

      <div className="flex flex-row items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-sm"
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
              className="size-7 rounded-sm"
              getText={() => activeFile!.content}
              tooltip="Copy code"
            />
            <Button size="icon" variant="ghost" className="size-7 rounded-sm" onClick={handleDownloadCode}>
              <Download className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
