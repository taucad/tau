import type { ReactNode, RefCallback } from 'react';
import { Fragment, useCallback, useId, useMemo } from 'react';
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useProject } from '#hooks/use-project.js';
import { useFileTreeEntry } from '#hooks/use-file-tree.js';
import { fileProvenanceLabel } from '#lib/file-provenance-labels.js';
import type { FileProvenanceLabel } from '#lib/file-provenance-labels.js';
import { FileExtensionIcon } from '@taucad/ui-kit/icons/file-extension-icon';
import { FileSelector } from '#components/files/file-selector.js';
import { OmniScroller } from '@taucad/ui-kit/components/omni-scroller';
import { PaneButton } from '@taucad/workbench-panes/components/pane-button';
import { useFileReturn } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { paneTitle } from '#workbench-records/pane-titles.js';
import { virtualDeclarationRoot } from '#lib/virtual-declarations.js';
import { symbolGlyph } from '#components/code/editor-completion-icon.js';
import type { EditorSymbolCrumb } from '#components/code/editor-language-features.js';
import { cn } from '@taucad/ui/utils/cn';

/** Every crumb, file or symbol, shares one height, text size and icon size, like VS Code's breadcrumbs. */
const crumbClassName = 'max-w-48 gap-1 font-medium';
const crumbIconClassName = 'size-3.5 shrink-0';
const separator = <ChevronRight aria-hidden className='-mx-0.5 size-3.5 shrink-0' />;

/** The syntax palette colour of a symbol glyph, matching the editor's suggestion and outline icons. */
const symbolColors: Readonly<Record<string, string>> = {
  method: 'var(--cm-function)',
  class: 'var(--cm-variable)',
  enum: 'var(--cm-variable)',
  structure: 'var(--cm-variable)',
  interface: 'var(--cm-type)',
  'type-parameter': 'var(--cm-type)',
  keyword: 'var(--cm-keyword)',
};

function SymbolIcon({ kind }: { readonly kind: string }): React.JSX.Element {
  const glyph = symbolGlyph(kind);
  return (
    <span
      aria-hidden
      data-symbol={glyph}
      // The codicon stylesheet fixes glyphs at 16px; size them with the file icon instead.
      className={cn('codicon', `codicon-symbol-${glyph}`, crumbIconClassName, 'text-[0.875rem]! leading-none!')}
      style={{ color: symbolColors[glyph] ?? 'var(--cm-number)' }}
    />
  );
}

const noSymbols: readonly EditorSymbolCrumb[] = [];

type ChatEditorBreadcrumbsProperties = {
  readonly filePath: string;
  /** The editor cursor's symbol path, shown after the file name like VS Code's outline breadcrumbs. */
  readonly symbolPath?: readonly EditorSymbolCrumb[];
  readonly children?: ReactNode;
};

export function ChatEditorBreadcrumbs({
  filePath,
  symbolPath = noSymbols,
  children,
}: ChatEditorBreadcrumbsProperties): ReactNode {
  const { editorRef } = useProject();
  const fileReturn = useFileReturn();
  // Only the file a pane opened, and only until it is used or another file opens.
  const returnTo = fileReturn?.returnTo?.path === filePath ? fileReturn.returnTo : undefined;
  const entry = useFileTreeEntry(filePath);
  const provenance = entry?.provenance;
  const declarationRoot = virtualDeclarationRoot(filePath);
  const label: FileProvenanceLabel = declarationRoot
    ? {
        glyph: 'lock',
        description: `Read-only ${declarationRoot.label} declaration`,
        dimmed: false,
        readOnly: true,
      }
    : fileProvenanceLabel(provenance, filePath);
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
    // Symbol crumbs change as the cursor moves without resizing the scroller; keep the innermost one in view.
    const crumbs = new MutationObserver(revealFilename);
    crumbs.observe(scroller, { childList: true, subtree: true, characterData: true });
    revealFilename();
    return () => {
      observer.disconnect();
      crumbs.disconnect();
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
    <div className='min-w-0'>
      <div className='flex min-h-9 items-center justify-between border-b border-border bg-background px-1 py-1 text-muted-foreground'>
        <nav aria-label='File breadcrumbs' className='flex min-w-0 flex-1 items-center gap-1'>
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
            className='flex min-w-0 flex-1 scroll-shadows-x [scrollbar-width:none] flex-row items-center gap-0 overscroll-x-none [&::-webkit-scrollbar]:hidden'
          >
            {declarationRoot ? (
              /* A library declaration has no project folder to browse: name its library, then the file. */
              [declarationRoot.label, ...filePath.slice(declarationRoot.prefix.length).split('/')].map(
                (name, index, names) => (
                  // oxlint-disable-next-line react/no-array-index-key -- crumbs are positional
                  <Fragment key={index}>
                    <span
                      className={cn('flex h-7 shrink-0 items-center px-2 text-xs', crumbClassName)}
                      aria-current={index === names.length - 1 ? 'page' : undefined}
                      title={name}
                    >
                      {index === names.length - 1 ? (
                        <FileExtensionIcon filename={name} className={crumbIconClassName} />
                      ) : undefined}
                      <span className='truncate'>{name}</span>
                    </span>
                    {index === names.length - 1 ? undefined : separator}
                  </Fragment>
                ),
              )
            ) : breadcrumbs.length > 0 ? (
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
                      className={crumbClassName}
                      aria-current={crumb.isLast ? 'page' : undefined}
                      title={crumb.name}
                    >
                      {crumb.isLast ? (
                        <FileExtensionIcon filename={crumb.name} className={crumbIconClassName} />
                      ) : undefined}
                      <span className='truncate'>{crumb.name}</span>
                    </PaneButton>
                  </FileSelector>
                  {crumb.isLast ? undefined : separator}
                </Fragment>
              ))
            ) : (
              // Maintain height with invisible content when empty
              <span className='opacity-0'>placeholder</span>
            )}
            {symbolPath.map((symbol, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- a symbol path is positional
              <Fragment key={index}>
                {separator}
                <PaneButton
                  size='label'
                  className={crumbClassName}
                  data-symbol-crumb=''
                  title={symbol.name}
                  onClick={symbol.reveal}
                >
                  <SymbolIcon kind={symbol.kind} />
                  <span className='truncate'>{symbol.name}</span>
                </PaneButton>
              </Fragment>
            ))}
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
