import type { ToolUIPart } from 'ai';
import type { DiffStatsWithContent } from '@taucad/chat';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, FilePlus, Trash2, ChevronDown } from 'lucide-react';
import { CodeViewer } from '#components/code/code-viewer.js';
import { DiffViewer, getFirstChangedLine } from '#components/code/diff-viewer.js';
import { FileLink } from '#components/files/file-link.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
} from '#components/chat/chat-tool-card.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useResizeObserver } from '#hooks/use-resize-observer.js';
import { cookieName } from '#constants/cookie.constants.js';
import { ChangeIndicator } from '#components/chat/change-indicator.js';
import { OpenRenderButton } from '#components/files/open-render-button.js';
import { shouldShowOpenRenderButton } from '#components/files/open-render-button.ignore.js';
import type { ShikiLanguage } from '#lib/code-language-resolution.js';
import { resolveHighlightLanguageForPath } from '#lib/code-language-resolution.js';

const fileOperationActionLabelClassName = '**:data-[slot=label]:hidden @xs/code:**:data-[slot=label]:flex';

/**
 * Fixed height of the collapsed preview viewport — exactly four `text-xs`
 * lines at the line-height used by both `DiffViewer` (1.6) and `CodeViewer`
 * (1.45), with a couple of pixels for vertical padding.
 */
const collapsedViewportClassName = 'max-h-[5rem]';

/**
 * Pixel height of the streaming preview box. Kept numerically aligned with
 * `collapsedViewportClassName` so the height does not jump when streaming
 * finishes and the diff snaps in.
 */
const streamingViewportClassName = 'h-[5rem]';

/**
 * Extract the filename from a path.
 */
function getFilename(path: string): string {
  const parts = path.split('/');
  return parts.at(-1) ?? path;
}

/**
 * Get the code language for syntax highlighting based on a filename's extension.
 * Falls back to plaintext if the extension is not recognized.
 */
function getLanguageFromFilename(filename: string): ShikiLanguage {
  return resolveHighlightLanguageForPath(filename).shikiLanguage;
}

type FourLineViewportProps = {
  readonly children: React.ReactNode;
};

/**
 * Fixed-height preview viewport for the file-operation card. Defaults to a
 * four-line clipped window with no scrolling and a conditional bottom fade
 * indicating "more content below". The expand affordance is a full-width
 * transparent hit-area overlaid on the bottom edge of the viewport; only a
 * small circular chevron badge centred in that hit-area fades in on outer-
 * card hover or keyboard focus, so the bar consumes zero vertical layout
 * and the badge stands out against the dimmed last code line. Expanding
 * grows the viewport to its natural content height with normal scroll.
 */
function FourLineViewport({ children }: FourLineViewportProps): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const measureOverflow = useCallback(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    setHasOverflow(node.scrollHeight - node.clientHeight > 1);
  }, []);

  useResizeObserver({
    ref: viewportRef,
    onResize: measureOverflow,
  });

  // Re-measure when expand state flips so the fade is suppressed immediately
  // on expand and restored immediately on collapse without waiting for the
  // next ResizeObserver tick.
  useEffect(() => {
    measureOverflow();
  }, [isExpanded, measureOverflow]);

  const showChevron = hasOverflow || isExpanded;

  return (
    <div className='relative border-t'>
      <div
        ref={viewportRef}
        className={cn(
          'w-full',
          isExpanded
            ? 'overflow-auto'
            : cn('overflow-hidden', collapsedViewportClassName, hasOverflow && 'scroll-shadow-bottom'),
        )}
      >
        {children}
      </div>
      {showChevron ? (
        <button
          type='button'
          aria-label={isExpanded ? 'Collapse code preview' : 'Expand code preview'}
          aria-expanded={isExpanded}
          onClick={() => {
            setIsExpanded((previous) => !previous);
          }}
          className='group/chevron-trigger absolute inset-x-0 bottom-0 flex h-5 w-full cursor-pointer items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
        >
          <span
            className={cn(
              'flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs',
              'opacity-0 transition-opacity duration-150',
              'group-hover/file-op:opacity-100 group-focus-visible/chevron-trigger:opacity-100',
            )}
          >
            <ChevronDown className={cn('size-3 transition-transform duration-150', isExpanded && 'rotate-180')} />
          </span>
        </button>
      ) : undefined}
    </div>
  );
}

type CodePreviewProps = {
  readonly content: string;
  readonly language?: ShikiLanguage;
};

function CodePreview({ content, language = 'plaintext' }: CodePreviewProps): React.JSX.Element {
  return (
    <FourLineViewport>
      <CodeViewer language={language} text={content} className='overflow-x-auto px-2.5 py-1.5 text-xs' />
    </FourLineViewport>
  );
}

type DiffPreviewProps = {
  readonly originalContent: string;
  readonly modifiedContent: string;
  readonly language?: ShikiLanguage;
};

export function DiffPreview({
  originalContent,
  modifiedContent,
  language = 'plaintext',
}: DiffPreviewProps): React.JSX.Element {
  return (
    <FourLineViewport>
      <DiffViewer originalContent={originalContent} modifiedContent={modifiedContent} language={language} />
    </FourLineViewport>
  );
}

const fileOperations = {
  edit: { icon: Pencil, past: 'Edited', active: 'Editing' },
  create: { icon: FilePlus, past: 'Created', active: 'Creating' },
  delete: { icon: Trash2, past: 'Deleted', active: 'Deleting' },
} as const;

type CollapsibleFileOperationProps = {
  readonly operation: keyof typeof fileOperations;
  readonly targetFile: string;
  readonly toolStatus: ToolUIPart['state'];
  readonly content?: string;
  readonly children?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly isDefaultOpen?: boolean;
  readonly enableFileLink?: boolean;
  readonly diffStats?: DiffStatsWithContent;
};

// oxlint-disable-next-line complexity -- One disclosure owns streaming, snapshot-less, and expanded file presentation.
export function CollapsibleFileOperation({
  operation,
  targetFile,
  toolStatus,
  content,
  children,
  actions,
  footer,
  isDefaultOpen = false,
  enableFileLink = false,
  diffStats,
}: CollapsibleFileOperationProps): React.JSX.Element {
  const isStreaming = toolStatus === 'input-streaming' || toolStatus === 'input-available';
  const [showCodePreview] = useCookie(cookieName.chatToolCodePreview, true);
  const [userOpen, setUserOpen] = useState<boolean>();
  const hasPreview = diffStats !== undefined || (content !== undefined && (!isStreaming || content.length > 0));
  const isCollapsible = isStreaming || hasPreview || children !== undefined || footer !== undefined;
  // Derive automatic expansion from available evidence; an explicit toggle wins
  // across streaming completion, including edits whose modified content is empty.
  const isOpen = isCollapsible && (userOpen ?? (isDefaultOpen || (showCodePreview && hasPreview)));
  const { icon, past, active } = fileOperations[operation];
  const filename = getFilename(targetFile);
  const language = getLanguageFromFilename(filename);
  const canOpenFile = enableFileLink && !isStreaming && operation !== 'delete' && targetFile !== '';
  const firstChangedLine = diffStats && getFirstChangedLine(diffStats.originalContent, diffStats.modifiedContent);
  const showStats = !isStreaming && diffStats !== undefined && (diffStats.linesAdded > 0 || diffStats.linesRemoved > 0);
  const filenameLabel =
    targetFile === filename ? (
      filename || 'file'
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{filename}</span>
        </TooltipTrigger>
        <TooltipContent side='top' align='start'>
          {targetFile}
        </TooltipContent>
      </Tooltip>
    );

  const renderContent = (): React.ReactNode => {
    if (isStreaming) {
      if (!content) {
        return undefined;
      }
      return (
        <div className={cn('overflow-hidden border-t', streamingViewportClassName)}>
          <CodeViewer
            language={language}
            text={content.split('\n').slice(-4).join('\n')}
            className='overflow-x-auto p-3 text-xs'
          />
        </div>
      );
    }
    if (diffStats) {
      return (
        <DiffPreview
          originalContent={diffStats.originalContent}
          modifiedContent={diffStats.modifiedContent}
          language={language}
        />
      );
    }
    if (content !== undefined) {
      return <CodePreview content={content} language={language} />;
    }
    return undefined;
  };

  return (
    <ChatToolCard
      variant='minimal'
      status={isStreaming ? 'loading' : 'ready'}
      isCollapsible={isCollapsible}
      isOpen={isOpen}
      onOpenChange={setUserOpen}
    >
      <ChatToolCardHeader className='group/file-mutation-trigger'>
        <ChatToolCardIcon icon={icon} />
        <ChatToolCardTitle>
          <ChatToolLabel verb={isStreaming ? active : isOpen ? `${past} file` : past}>
            {isStreaming || !isOpen ? (
              <ChatToolDescription>
                {isStreaming && filename === '' ? 'file…' : filenameLabel}
                {showStats ? (
                  <>
                    {' '}
                    <ChangeIndicator
                      linesAdded={diffStats.linesAdded}
                      linesRemoved={diffStats.linesRemoved}
                      colorMode='header-hover'
                    />
                  </>
                ) : undefined}
              </ChatToolDescription>
            ) : undefined}
          </ChatToolLabel>
        </ChatToolCardTitle>
      </ChatToolCardHeader>
      {isCollapsible ? (
        <ChatToolCardContent className='pl-0'>
          <section
            aria-label={`${past} ${targetFile}`}
            className='group/file-op @container/code my-1 overflow-hidden rounded-md border bg-neutral/10'
          >
            <div className='flex h-7 items-center gap-1 px-2 text-xs text-muted-foreground'>
              <FileExtensionIcon filename={filename} className='size-3 shrink-0' />
              <span className='min-w-0 truncate'>
                {canOpenFile ? (
                  <FileLink path={targetFile} lineNumber={firstChangedLine}>
                    {filenameLabel}
                  </FileLink>
                ) : (
                  filenameLabel
                )}
              </span>
              {showStats ? (
                <ChangeIndicator linesAdded={diffStats.linesAdded} linesRemoved={diffStats.linesRemoved} />
              ) : undefined}
              {isStreaming ? undefined : (
                <div className='ml-auto flex shrink-0 items-center gap-1 opacity-0 group-focus-within/file-op:opacity-100 group-hover/file-op:opacity-100'>
                  {canOpenFile && shouldShowOpenRenderButton(targetFile) ? (
                    <OpenRenderButton
                      aria-label='Open in viewer'
                      path={targetFile}
                      size='xs'
                      className={fileOperationActionLabelClassName}
                    />
                  ) : undefined}
                  {actions}
                </div>
              )}
            </div>
            {renderContent()}
            {children}
            {footer}
          </section>
        </ChatToolCardContent>
      ) : undefined}
    </ChatToolCard>
  );
}
