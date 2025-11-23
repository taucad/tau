import { useCallback } from 'react';
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
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { useFileManager } from '#hooks/use-file-manager.js';

export function ChatEditorBreadcrumbs(): ReactNode {
  const { fileExplorerRef } = useBuild();

  // Get active file path from file explorer
  const activeFile = useSelector(fileExplorerRef, (state) => ({
    path: state.context.activeFilePath,
    parts: state.context.activeFilePath?.split('/') ?? [],
    name: state.context.activeFilePath?.split('/').pop() ?? '',
  }));
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

  return (
    <div className="flex flex-row items-center justify-between py-0.25 pr-0.25 pl-3 text-muted-foreground">
      <div className="flex min-w-0 flex-1 flex-row items-center gap-0.5 overflow-hidden">
        {activeFile.parts.length > 0 ? (
          activeFile.parts.map((part, index) => (
            <Fragment key={part}>
              <span className="truncate text-sm font-medium">{part}</span>
              {index < activeFile.parts.length - 1 && <ChevronRight className="size-4 shrink-0" />}
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
              getText={handleGetCodeText}
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
