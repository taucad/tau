import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown, File, LoaderCircle, Play } from 'lucide-react';
import { CodeViewer } from '@/components/code-viewer.js';
import { CopyButton } from '@/components/copy-button.js';
import { useBuild } from '@/hooks/use-build2.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/utils/ui.js';
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text.js';

export function ChatMessageToolFileEdit({ part }: { readonly part: ToolInvocationUIPart }): JSX.Element {
  const { setCode } = useBuild();
  const [isExpanded, setIsExpanded] = useState(false);

  switch (part.toolInvocation.state) {
    case 'partial-call': {
      const { fileName = '' } = (part.toolInvocation.args ?? {}) as {
        content?: string;
        fileName?: string;
      };
      return (
        <div className="border-neutral-200 @container/code overflow-hidden rounded-md border bg-neutral/10">
          <div className="sticky top-0 flex flex-row items-center justify-between py-1 pr-1 pl-3 text-foreground/50">
            <div className="flex flex-row items-center gap-1 text-xs text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" />
              <AnimatedShinyText>{fileName}</AnimatedShinyText>
            </div>
          </div>
        </div>
      );
    }

    case 'call':
    case 'result': {
      const { content = '', fileName = '' } = (part.toolInvocation.args ?? {}) as {
        content?: string;
        fileName?: string;
      };
      return (
        <div className="border-neutral-200 @container/code overflow-hidden rounded-md border bg-neutral/10">
          <div className="sticky top-0 flex flex-row items-center justify-between border-b border-neutral/20 py-1 pr-1 pl-3 text-foreground/50">
            <div className="flex flex-row items-center gap-1 text-xs text-muted-foreground">
              <File className={cn('hidden size-3', part.toolInvocation.state === 'result' && 'block')} />
              <span>{fileName}</span>
            </div>
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
          <div className={cn('relative max-h-32 leading-0', isExpanded ? 'max-h-none' : 'overflow-y-auto')}>
            <CodeViewer language="typescript" text={content} className="overflow-x-auto p-3 text-xs" />
            <Button
              size="xs"
              className="sticky bottom-0 h-4 w-full rounded-none bg-neutral/10 text-center text-foreground/50 hover:bg-neutral/40"
              onClick={() => {
                setIsExpanded((previous) => !previous);
              }}
            >
              <ChevronDown className={cn('transition-transform', isExpanded ? 'rotate-x-180' : '')} />
            </Button>
          </div>
        </div>
      );
    }
  }
}
