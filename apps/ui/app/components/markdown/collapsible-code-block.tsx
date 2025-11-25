import { useState, useMemo } from 'react';
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
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';

export function CollapsibleCodeBlock({
  language,
  text,
  children,
  collapsedLineCount = 4,
  className = '',
}: {
  readonly language: string;
  readonly text: string;
  readonly children: React.ReactNode;
  readonly collapsedLineCount?: number;
  readonly className?: string;
}): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const lines = text.split('\n');
  const collapsedText = useMemo(() => lines.slice(0, collapsedLineCount).join('\n'), [lines, collapsedLineCount]);
  const shouldShowToggle = lines.length > collapsedLineCount;

  return (
    <CodeBlock className="-mx-3" variant="standard">
      <CodeBlockHeader variant="standard">
        <CodeBlockTitle variant="standard">{language}</CodeBlockTitle>
        <CodeBlockAction variant="standard">
          <CopyButton
            size="xs"
            className="h-6 **:data-[slot=label]:hidden @xs/code:**:data-[slot=label]:flex"
            getText={() => text}
          />
        </CodeBlockAction>
      </CodeBlockHeader>
      <div className={cn('relative leading-0', shouldShowToggle && !isExpanded ? 'max-h-32 overflow-y-auto' : '')}>
        <CodeBlockContent className="px-3">
          <Pre language={language} className={cn('text-xs', className)}>
            {isExpanded ? children : collapsedText}
          </Pre>
        </CodeBlockContent>
        {shouldShowToggle ? (
          <Button
            size="xs"
            className="sticky bottom-0 mb-0 h-4 w-full rounded-none bg-neutral/10 text-center text-foreground/50 hover:bg-neutral/40"
            onClick={() => {
              setIsExpanded((previous) => !previous);
            }}
          >
            <ChevronDown className={cn('transition-transform', isExpanded ? 'rotate-x-180' : '')} />
          </Button>
        ) : null}
      </div>
    </CodeBlock>
  );
}
