import type { ReactNode } from 'react';
import { Fragment } from 'react/jsx-runtime';
import { ChevronRight } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { useBuild } from '#hooks/use-build.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';

export function ChatEditorBreadcrumbs(): ReactNode {
  const { fileExplorerRef } = useBuild();

  // Get active file path from file explorer
  const activeFile = useSelector(fileExplorerRef, (state) => ({
    path: state.context.activeFilePath,
    parts: state.context.activeFilePath?.split('/') ?? [],
    name: state.context.activeFilePath?.split('/').pop() ?? '',
  }));

  return (
    <div className="flex flex-row items-center justify-between py-1 pr-0.25 pl-3 text-muted-foreground">
      <div className="flex min-w-0 flex-1 flex-row items-center gap-0.5 overflow-hidden">
        {activeFile.parts.length > 0 ? (
          activeFile.parts.map((part, index) => (
            <Fragment key={part}>
              <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                {index === activeFile.parts.length - 1 && (
                  <FileExtensionIcon filename={part} className="size-3 shrink-0" />
                )}
                {part}
              </span>
              {index < activeFile.parts.length - 1 && <ChevronRight className="size-4 shrink-0" />}
            </Fragment>
          ))
        ) : (
          // Maintain height with invisible content when empty
          <span className="opacity-0">placeholder</span>
        )}
      </div>
    </div>
  );
}
