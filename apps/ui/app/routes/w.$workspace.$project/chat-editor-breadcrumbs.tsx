import type { ReactNode, RefCallback } from 'react';
import { Fragment, useCallback, useId, useMemo } from 'react';
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useProject } from '#hooks/use-project.js';
import { useFileTreeEntry } from '#hooks/use-file-tree.js';
import { fileProvenanceLabel } from '#lib/file-provenance-labels.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { FileSelector } from '#components/files/file-selector.js';
import { OmniScroller } from '#components/ui/omni-scroller.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { useFileReturn } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { paneTitle } from '#workbench-records/pane-titles.js';

type ChatEditorBreadcrumbsProperties = {
  readonly filePath: string;
  readonly children?: ReactNode;
};

export function ChatEditorBreadcrumbs({ filePath, children }: ChatEditorBreadcrumbsProperties): ReactNode {
  const { editorRef } = useProject();
  const fileReturn = useFileReturn();
  // Only the file a pane opened, and only until it is used or another file opens.
  const returnTo = fileReturn?.returnTo?.path === filePath ? fileReturn.returnTo : undefined;
  const entry = useFileTreeEntry(filePath);
  const provenance = entry?.provenance;
  const label = fileProvenanceLabel(provenance, filePath);
  const descriptionId = useId();
  const attachScroller = useCallback<RefCallback<HTMLDivElement>>((scroller) => {
    if (!scroller) {
      return;
    }
    const revealFilename = (): void => {
      scroller.scrollLeft = scroller.scrollWidth;
    };
    const observer = new ResizeObserver(revealFilename);
    observer.observe(scroller);
    revealFilename();
    return () => {
      observer.disconnect();
    };
  }, []);

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
    <div className='@container'>
      <div className='flex min-h-9 flex-wrap items-center justify-between gap-y-1 border-b border-border bg-background px-1 py-1 text-muted-foreground'>
        <nav
          aria-label='File breadcrumbs'
          className='flex min-w-0 flex-1 items-center gap-1 @max-lg:w-full @max-lg:flex-none'
        >
          {returnTo ? (
            <PaneButton
              size='icon'
              className='shrink-0'
              aria-label={`Back to ${paneTitle(returnTo.panel)}`}
              tooltip={`Back to ${paneTitle(returnTo.panel)}`}
              onClick={fileReturn?.back}
            >
              <ArrowLeft aria-hidden />
            </PaneButton>
          ) : null}
          <OmniScroller
            key={filePath}
            ref={attachScroller}
            className='flex min-w-0 scroll-shadows-x [scrollbar-width:none] flex-row items-center gap-0 overscroll-x-none [&::-webkit-scrollbar]:hidden'
          >
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
                    <PaneButton
                      size='label'
                      className='max-w-48 gap-1 px-1! text-sm! font-medium'
                      aria-current={crumb.isLast ? 'page' : undefined}
                      title={crumb.name}
                    >
                      {crumb.isLast ? (
                        <FileExtensionIcon filename={crumb.name} className='size-3 shrink-0' />
                      ) : undefined}
                      <span className='truncate'>{crumb.name}</span>
                    </PaneButton>
                  </FileSelector>
                  {crumb.isLast ? undefined : <ChevronRight aria-hidden className='size-4 shrink-0' />}
                </Fragment>
              ))
            ) : (
              // Maintain height with invisible content when empty
              <span className='opacity-0'>placeholder</span>
            )}
          </OmniScroller>
          {label.breadcrumbBadge ? (
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Badge
                      asChild
                      variant='secondary'
                      className='h-6 border-border/50 bg-muted px-2 py-0 font-normal text-muted-foreground hover:bg-accent hover:text-foreground'
                    >
                      <button type='button' aria-describedby={descriptionId}>
                        {label.breadcrumbBadge}
                      </button>
                    </Badge>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent className='max-w-64'>{label.description}</TooltipContent>
              </Tooltip>
              <span id={descriptionId} className='sr-only'>
                {label.description}
              </span>
              <PopoverContent aria-label={label.breadcrumbBadge} align='end' className='text-sm'>
                {label.description}
              </PopoverContent>
            </Popover>
          ) : label.description ? (
            <span
              className='ml-1 flex shrink-0 items-center gap-1 text-xs text-muted-foreground'
              title={label.description}
            >
              {label.glyph === 'lock' ? <Lock aria-hidden data-provenance-glyph='lock' className='size-3' /> : null}
              {label.badge ? (
                <>
                  <Badge variant='secondary' className='px-1.5 py-0 font-normal'>
                    {label.badge}
                  </Badge>
                  <span className='sr-only'>{label.description}</span>
                </>
              ) : (
                <span className='max-w-40 truncate'>{label.description}</span>
              )}
            </span>
          ) : null}
        </nav>
        {children ? <div className='ml-auto flex shrink-0 items-center'>{children}</div> : null}
      </div>
    </div>
  );
}
