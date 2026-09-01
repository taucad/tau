import { useState, useMemo, memo } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockAction,
  CodeBlockContent,
  Pre,
} from '#components/code/code-block.js';
import { CopyButton } from '#components/copy-button.js';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';

type CollapsibleContainerProps = {
  readonly children: React.ReactNode;
  /**
   * Total number of lines in the content - used to determine if toggle should be shown.
   */
  readonly lineCount: number;
  /**
   * Number of lines before showing the collapse toggle.
   * @default 4
   */
  readonly collapsedLineCount?: number;
  /**
   * Max height when collapsed (Tailwind class).
   * @default 'max-h-32'
   */
  readonly collapsedMaxHeight?: string;
  readonly className?: string;
};

/**
 * A generic collapsible container that wraps any content with expand/collapse functionality.
 * Shows a toggle button when content exceeds the collapsed line count.
 */
export function CollapsibleContainer({
  children,
  lineCount,
  collapsedLineCount = 4,
  collapsedMaxHeight = 'max-h-32',
  className,
}: CollapsibleContainerProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldShowToggle = lineCount > collapsedLineCount;

  return (
    <div className={cn('flex flex-col leading-0', className)}>
      {/* Scrollable content area */}
      <div
        className={cn(
          'w-full overflow-x-auto',
          shouldShowToggle && !isExpanded ? `${collapsedMaxHeight} overflow-y-hidden` : '',
        )}
      >
        {children}
      </div>
      {/* Toggle button - always in normal flow so it has its own space */}
      {shouldShowToggle ? (
        <Button
          size='xs'
          aria-label={isExpanded ? 'Collapse code block' : 'Expand code block'}
          aria-expanded={isExpanded}
          className='h-4 w-full shrink-0 rounded-none bg-transparent text-center text-foreground/50 hover:bg-neutral/10'
          onClick={() => {
            setIsExpanded((previous) => !previous);
          }}
        >
          <ChevronDown className={cn('transition-transform', isExpanded ? 'rotate-x-180' : '')} />
        </Button>
      ) : null}
    </div>
  );
}

type CollapsibleCodeBlockProps = {
  readonly language: string;
  readonly title?: string;
  readonly text: string;
  readonly collapsedLineCount?: number;
  readonly className?: string;
  readonly containerClassName?: string;
};

/**
 * A collapsible code block with syntax highlighting.
 * Shows a preview of the first N lines when collapsed, full code when expanded.
 *
 * Memoized to prevent unnecessary re-renders during streaming -
 * only re-renders when the actual text content or language changes.
 */
export const CollapsibleCodeBlock = memo(function ({
  language,
  title,
  text,
  collapsedLineCount = 4,
  className = '',
  containerClassName = '',
}: CollapsibleCodeBlockProps): React.JSX.Element {
  const lineCount = useMemo(() => text.split('\n').length, [text]);

  return (
    <CodeBlock className={containerClassName} variant='standard'>
      <CodeBlockHeader variant='standard'>
        <CodeBlockTitle variant='standard'>{title}</CodeBlockTitle>
        <CodeBlockAction variant='standard'>
          <CopyButton
            size='xs'
            className='h-6 **:data-[slot=label]:hidden @xs/code:**:data-[slot=label]:flex'
            getText={() => text}
          />
        </CodeBlockAction>
      </CodeBlockHeader>
      <CollapsibleContainer lineCount={lineCount} collapsedLineCount={collapsedLineCount}>
        <CodeBlockContent className='px-3'>
          <Pre language={language} className={cn('text-xs', className)}>
            {text}
          </Pre>
        </CodeBlockContent>
      </CollapsibleContainer>
    </CodeBlock>
  );
});
