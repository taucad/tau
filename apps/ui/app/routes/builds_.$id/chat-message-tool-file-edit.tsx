import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import type { JSX } from 'react';
import { Play } from 'lucide-react';
import { CodeViewer } from '@/components/code-viewer.js';
import { CopyButton } from '@/components/copy-button.js';
import { useBuild } from '@/hooks/use-build2.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/utils/ui.js';

export function ChatMessageToolFileEdit({ part }: { readonly part: ToolInvocationUIPart }): JSX.Element {
  const { setCode } = useBuild();

  switch (part.toolInvocation.state) {
    case 'call':
    case 'partial-call':
    case 'result': {
      const { content = '', fileName = '' } = (part.toolInvocation.args ?? {}) as {
        content?: string;
        fileName?: string;
      };
      return (
        <div className="border-neutral-200 @container/code overflow-hidden rounded-md border bg-neutral/10">
          <div className="sticky top-0 flex flex-row items-center justify-between border-b border-neutral/20 py-1 pr-1 pl-3 text-foreground/50">
            <div className="text-xs">{fileName}</div>
            <div className="flex flex-row gap-1">
              <CopyButton
                size="xs"
                className="[&_[data-slot=label]]:hidden @xs/code:[&_[data-slot=label]]:flex"
                getText={() => content}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="flex"
                    onClick={() => {
                      setCode(content);
                    }}
                  >
                    <span className="hidden @xs/code:block">Apply</span>
                    <Play />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Apply code</TooltipContent>
              </Tooltip>
            </div>
          </div>
          {/* <div className={cn('relative max-h-64', isExpanded ? 'max-h-none' : 'overflow-y-auto')}> */}
          <div
            className={cn(
              'prose w-full max-w-full text-sm text-foreground',
              '[--tw-prose-headings:text-foreground]',
              '[--tw-prose-bullets:text-foreground]',
              '[--tw-prose-bold:text-foreground]',
              '[--tw-prose-counters:text-foreground]',
              '[--tw-prose-lead:text-foreground]',
              '[--tw-prose-quotes:text-foreground]',
              '[--tw-prose-quote-borders:text-foreground]',
              '[--tw-prose-kbd:text-foreground]',
              '[--tw-prose-links:text-foreground]',
              /* <pre> */
              'p-0 ps-0 pe-0 text-xs',
            )}
          >
            <CodeViewer language="typescript">{content}</CodeViewer>

            {/* FIXME: ensure the code viewer doesn't auto-collapse during scrolling */}
            {/* <Button
                  variant="ghost"
                  size="xs"
                  className="h-4 text-foreground/50 sticky bottom-0 w-full text-center rounded-none hover:bg-neutral/20"
                  onClick={() => setIsExpanded((previous) => !previous)}
                >
                  <ChevronDown className={cn('transition-transform', isExpanded ? 'rotate-x-180' : '')} />
                </Button> */}
          </div>
        </div>
      );
    }
  }
}
