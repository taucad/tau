import type { ReactNode } from 'react';
import { Fragment, useCallback, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useProject } from '#hooks/use-project.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { FileSelector } from '#components/files/file-selector.js';
import { OmniScroller } from '#components/ui/omni-scroller.js';

type ChatEditorBreadcrumbsProperties = {
  readonly filePath: string;
  readonly children?: ReactNode;
};

export function ChatEditorBreadcrumbs({ filePath, children }: ChatEditorBreadcrumbsProperties): ReactNode {
  const { editorRef } = useProject();

  // Derive breadcrumb data from the panel's own file path
  const activeFile = useMemo(
    () => ({
      path: filePath,
      parts: filePath.split('/'),
      name: filePath.split('/').pop() ?? '',
    }),
    [filePath],
  );

  // Handle file selection - opens file in editor
  const handleFileSelect = useCallback(
    (path: string) => {
      editorRef.send({ type: 'openFile', path, source: 'user' });
    },
    [editorRef],
  );

  // Compute breadcrumb data with paths for each segment
  const breadcrumbs = useMemo(() => {
    return activeFile.parts.map((part, index) => ({
      name: part,
      // Full path up to this segment
      path: activeFile.parts.slice(0, index + 1).join('/'),
      // Parent path (directory to show in FileSelector)
      parentPath: index === 0 ? '' : activeFile.parts.slice(0, index).join('/'),
      isLast: index === activeFile.parts.length - 1,
    }));
  }, [activeFile.parts]);

  if (!activeFile.path) {
    return null;
  }

  return (
    <div className='flex flex-row items-center justify-between px-2 py-1 text-muted-foreground'>
      <OmniScroller className='flex min-w-0 flex-1 [scrollbar-width:none] flex-row items-center gap-0.5 overscroll-x-none [&::-webkit-scrollbar]:hidden'>
        {breadcrumbs.length > 0 ? (
          breadcrumbs.map((crumb) => (
            <Fragment key={crumb.path}>
              <FileSelector
                shouldIncludeDirectories
                selectedFile={activeFile.path}
                initialPath={crumb.parentPath}
                popoverProperties={{ align: 'start' }}
                onSelect={handleFileSelect}
              >
                <button
                  type='button'
                  className='flex max-w-32 shrink-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-sm font-medium hover:bg-muted'
                >
                  {crumb.isLast ? <FileExtensionIcon filename={crumb.name} className='size-3 shrink-0' /> : undefined}
                  <span className='truncate'>{crumb.name}</span>
                </button>
              </FileSelector>
              {crumb.isLast ? undefined : <ChevronRight className='size-4 shrink-0' />}
            </Fragment>
          ))
        ) : (
          // Maintain height with invisible content when empty
          <span className='opacity-0'>placeholder</span>
        )}
      </OmniScroller>
      {children}
    </div>
  );
}
