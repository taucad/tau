import type { ToolUIPart } from 'ai';
import type { DiffStatsWithContent } from '@taucad/chat';
import { useState, useEffect, useRef, useCallback } from 'react';
import { LoaderCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { CodeViewer } from '#components/code/code-viewer.js';
import { DiffViewer, getFirstChangedLine } from '#components/code/diff-viewer.js';
import { FileLink } from '#components/files/file-link.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';
import { AnimatedShinyText } from '#components/magicui/animated-shiny-text.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
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
          className='group/chevron-trigger absolute inset-x-0 bottom-0 flex h-5 w-full cursor-pointer items-center justify-center outline-none'
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

type CollapsibleFileOperationTriggerProps = {
  readonly targetFile: string;
  readonly toolStatus: ToolUIPart['state'];
  readonly isOpen: boolean;
  /**
   * When true, wraps the filename with FileLink for file opening functionality.
   */
  readonly enableFileLink?: boolean;
  /**
   * Diff statistics for displaying change indicator.
   */
  readonly diffStats?: DiffStatsWithContent;
  /**
   * Label to show while `targetFile` is empty during streaming (e.g. "Creating file...").
   */
  readonly pendingLabel?: string;
};

export function CollapsibleFileOperationTrigger({
  targetFile,
  toolStatus,
  isOpen,
  enableFileLink = false,
  diffStats,
  pendingLabel = 'file',
}: CollapsibleFileOperationTriggerProps): React.JSX.Element {
  const isStreaming = ['input-streaming', 'input-available'].includes(toolStatus);
  const filename = getFilename(targetFile);
  const hasPath = targetFile !== filename;

  // Render the filename content
  const filenameContent = isStreaming ? (
    <AnimatedShinyText>{filename || pendingLabel}</AnimatedShinyText>
  ) : (
    <span>{filename}</span>
  );

  // Calculate line number for first change when diff data is available
  const firstChangedLine =
    diffStats === undefined ? undefined : getFirstChangedLine(diffStats.originalContent, diffStats.modifiedContent);

  // Filename element - clickable when enableFileLink is true
  // Uses asChild to avoid nesting buttons inside CollapsibleTrigger
  const filenameElement =
    enableFileLink && !isStreaming ? (
      hasPath ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <FileLink
              asChild
              path={targetFile}
              lineNumber={firstChangedLine}
              className='min-w-0 truncate hover:text-foreground'
            >
              <span>{filenameContent}</span>
            </FileLink>
          </TooltipTrigger>
          <TooltipContent side='top' align='start'>
            {targetFile}
          </TooltipContent>
        </Tooltip>
      ) : (
        <FileLink
          asChild
          path={targetFile}
          lineNumber={firstChangedLine}
          className='min-w-0 truncate hover:text-foreground'
        >
          <span>{filenameContent}</span>
        </FileLink>
      )
    ) : hasPath && !isStreaming ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='min-w-0 truncate'>{filenameContent}</span>
        </TooltipTrigger>
        <TooltipContent side='top' align='start'>
          {targetFile}
        </TooltipContent>
      </Tooltip>
    ) : (
      <span className='min-w-0 truncate'>{filenameContent}</span>
    );

  // Show change indicator when diffStats is available and there are changes
  const showChangeIndicator =
    diffStats !== undefined && (diffStats.linesAdded > 0 || diffStats.linesRemoved > 0) && !isStreaming;

  // Entire header is the collapsible trigger
  return (
    <CollapsibleTrigger className='group flex h-7 min-w-0 flex-1 cursor-pointer flex-row items-center gap-1 pl-2 text-xs text-muted-foreground transition-colors'>
      {/* Status icon - visible by default, hidden on hover */}
      <span className='relative flex size-3 items-center justify-center'>
        {isStreaming ? (
          <LoaderCircle className='size-3 animate-spin' />
        ) : (
          <>
            <span className={cn('transition-opacity duration-150', 'group-hover:opacity-0')}>
              <FileExtensionIcon filename={filename} className='size-3' />
            </span>
            {/* Caret - hidden by default, visible on hover */}
            <ChevronRight
              className={cn(
                'absolute size-3 transition-all duration-150',
                'opacity-0 group-hover:opacity-100',
                isOpen ? 'rotate-90' : 'rotate-0',
              )}
            />
          </>
        )}
      </span>
      {filenameElement}
      {showChangeIndicator ? (
        <span className='shrink-0'>
          <ChangeIndicator linesAdded={diffStats.linesAdded} linesRemoved={diffStats.linesRemoved} />
        </span>
      ) : undefined}
    </CollapsibleTrigger>
  );
}

type CollapsibleFileOperationProps = {
  readonly targetFile: string;
  readonly toolStatus: ToolUIPart['state'];
  readonly content?: string;
  readonly children?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly isDefaultOpen?: boolean;
  /**
   * When true, wraps the filename with FileLink for file opening functionality.
   */
  readonly enableFileLink?: boolean;
  /**
   * Diff statistics for displaying change indicator.
   */
  readonly diffStats?: DiffStatsWithContent;
  /**
   * Label to show while `targetFile` is empty during streaming (e.g. "Creating file...").
   */
  readonly pendingLabel?: string;
};

export function CollapsibleFileOperation({
  targetFile,
  toolStatus,
  content,
  children,
  actions,
  footer,
  isDefaultOpen = false,
  enableFileLink = false,
  diffStats,
  pendingLabel = 'file',
}: CollapsibleFileOperationProps): React.JSX.Element {
  const isStreaming = ['input-streaming', 'input-available'].includes(toolStatus);
  const [showCodePreview] = useCookie(cookieName.chatToolCodePreview, true);

  // Track the previous streaming state to detect transitions
  const wasStreamingRef = useRef(isStreaming);

  // Default to open when content is available (after streaming completes) and showCodePreview is enabled
  const [isOpen, setIsOpen] = useState(isDefaultOpen || (!isStreaming && Boolean(content) && showCodePreview));

  // When transitioning from streaming to non-streaming, open if showCodePreview is enabled
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && content && showCodePreview) {
      setIsOpen(true);
    }

    wasStreamingRef.current = isStreaming;
  }, [isStreaming, content, showCodePreview]);

  const filename = getFilename(targetFile);
  const hasPath = targetFile !== filename;

  const showOpenRender = enableFileLink && !isStreaming && targetFile !== '' && shouldShowOpenRenderButton(targetFile);

  const headerActions = showOpenRender ? (
    <>
      <OpenRenderButton path={targetFile} size='xs' className={fileOperationActionLabelClassName} />
      {actions}
    </>
  ) : (
    actions
  );

  // For streaming, show last 4 lines without collapsible
  if (isStreaming && content) {
    const lines = content.split('\n');
    const totalLines = lines.length;
    const lastFourLines = lines.slice(-4).join('\n');
    // Always show content area when we have 4+ lines to maintain consistent height,
    // otherwise only show if there's actual content
    const shouldShowContent = totalLines >= 4 || lastFourLines.trim().length > 0;

    return (
      <div className='@container/code my-1 overflow-hidden rounded-md border bg-neutral/10'>
        <div className='flex h-7 w-full flex-row items-center gap-1 pr-1 pl-2 text-xs text-muted-foreground'>
          <LoaderCircle className='size-3 animate-spin' />
          {hasPath ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className='min-w-0 truncate'>
                  <AnimatedShinyText>{filename || pendingLabel}</AnimatedShinyText>
                </span>
              </TooltipTrigger>
              <TooltipContent side='top' align='start'>
                {targetFile}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className='min-w-0 truncate'>
              <AnimatedShinyText>{targetFile || pendingLabel}</AnimatedShinyText>
            </span>
          )}
        </div>
        {shouldShowContent ? (
          <div className={cn('overflow-hidden border-t', streamingViewportClassName)}>
            <CodeViewer
              language={getLanguageFromFilename(filename)}
              text={lastFourLines}
              className='overflow-x-auto p-3 text-xs'
            />
          </div>
        ) : undefined}
      </div>
    );
  }

  // Derive language from filename for syntax highlighting
  const language = getLanguageFromFilename(filename);

  // Render content: always show DiffPreview when diffStats is available
  const renderContent = (): React.ReactNode => {
    // Show diff view when diff data is available (primary view)
    if (diffStats) {
      return (
        <DiffPreview
          originalContent={diffStats.originalContent}
          modifiedContent={diffStats.modifiedContent}
          language={language}
        />
      );
    }

    // Fallback to code preview during streaming or when no diff data
    if (content) {
      return <CodePreview content={content} language={language} />;
    }

    return undefined;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className='group/file-op @container/code my-1 overflow-hidden rounded-md border bg-neutral/10'>
        <div className='flex items-center transition-colors hover:bg-foreground/5'>
          <CollapsibleFileOperationTrigger
            targetFile={targetFile}
            toolStatus={toolStatus}
            isOpen={isOpen}
            enableFileLink={enableFileLink}
            diffStats={diffStats}
            pendingLabel={pendingLabel}
          />
          {headerActions ? (
            <div
              className='ml-auto flex shrink-0 items-center gap-1 pr-1 text-muted-foreground opacity-0 group-hover/file-op:opacity-100'
              onClick={(event) => {
                // Prevent triggering the collapsible when clicking actions
                event.stopPropagation();
              }}
            >
              {headerActions}
            </div>
          ) : undefined}
        </div>
        <CollapsibleContent>
          {renderContent()}
          {children}
          {footer}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
