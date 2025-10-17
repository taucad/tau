import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { useState } from 'react';
import { Eye, LoaderCircle, ChevronDown, Camera } from 'lucide-react';
import type { ToolResult } from 'ai';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { AnimatedShinyText } from '#components/magicui/animated-shiny-text.js';
import { useChatSelector } from '#components/chat/ai-chat-provider.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { CopyButton } from '#components/copy-button.js';

export type ImageAnalysisToolResult = ToolResult<
  'analyze_image',
  {
    requirements: string[];
  },
  {
    analysis: string;
    screenshot: string;
  }
>;

function StatusIcon({
  chatStatus,
  toolStatus,
}: {
  readonly chatStatus: 'error' | 'submitted' | 'streaming' | 'ready';
  readonly toolStatus: ToolInvocationUIPart['toolInvocation']['state'];
}): React.JSX.Element {
  if (chatStatus === 'streaming' && ['partial-call', 'call'].includes(toolStatus)) {
    return <LoaderCircle className="size-3 animate-spin" />;
  }

  return <Eye className="size-3" />;
}

function ToolTitle({
  chatStatus,
  toolStatus,
}: {
  readonly chatStatus: 'error' | 'submitted' | 'streaming' | 'ready';
  readonly toolStatus: ToolInvocationUIPart['toolInvocation']['state'];
}): React.JSX.Element {
  if (chatStatus === 'streaming' && ['partial-call', 'call'].includes(toolStatus)) {
    return <AnimatedShinyText>Analyzing model...</AnimatedShinyText>;
  }

  return <span>Visual Analysis</span>;
}

export function ChatMessageToolImageAnalysis({ part }: { readonly part: ToolInvocationUIPart }): React.JSX.Element {
  const [isRequirementsExpanded, setIsRequirementsExpanded] = useState(false);
  const status = useChatSelector((state) => state.context.status);

  switch (part.toolInvocation.state) {
    case 'partial-call':
    case 'call': {
      const { requirements = [] } = (part.toolInvocation.args ?? {}) as {
        requirements?: string[];
      };

      return (
        <div className="@container/analysis flex w-full flex-col gap-2 overflow-hidden rounded-md border bg-neutral/10 p-3">
          <div className="flex flex-row items-center gap-1 text-xs text-muted-foreground">
            <StatusIcon chatStatus={status} toolStatus={part.toolInvocation.state} />
            <ToolTitle chatStatus={status} toolStatus={part.toolInvocation.state} />
          </div>
          {requirements.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium">
                Checking {requirements.length} requirement{requirements.length > 1 ? 's' : ''}...
              </div>
            </div>
          )}
        </div>
      );
    }

    case 'result': {
      const { requirements = [] } = (part.toolInvocation.args ?? {}) as {
        requirements?: string[];
      };

      const result = part.toolInvocation.result as ImageAnalysisToolResult['result'];

      return (
        <div className="@container/analysis overflow-hidden rounded-md border bg-neutral/10">
          <div className="sticky top-0 flex flex-row items-center justify-between py-1 pr-1 pl-2 text-foreground/50">
            <div className="flex flex-row items-center gap-1 text-xs text-muted-foreground">
              <StatusIcon chatStatus={status} toolStatus={part.toolInvocation.state} />
              <ToolTitle chatStatus={status} toolStatus={part.toolInvocation.state} />
            </div>
            <div className="flex flex-row gap-1">
              <CopyButton
                size="xs"
                className="[&_[data-slot=label]]:hidden @xs/analysis:[&_[data-slot=label]]:flex"
                getText={() => result.analysis}
              />
            </div>
          </div>

          {/* Screenshot Section */}
          {result.screenshot ? (
            <div className="border-t p-2 pt-1">
              <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Camera className="size-3" />
                <span>Model Screenshot</span>
              </div>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <div className="cursor-pointer rounded-md border bg-neutral/5 hover:bg-neutral/10">
                    <img
                      src={result.screenshot}
                      alt="Model screenshot"
                      className="size-full rounded-sm object-cover object-top"
                    />
                  </div>
                </HoverCardTrigger>
                <HoverCardContent asChild side="top" align="start" className="w-96">
                  <img src={result.screenshot} alt="Model screenshot (full size)" className="max-w-full" />
                </HoverCardContent>
              </HoverCard>
            </div>
          ) : null}

          {/* Requirements Section */}
          {requirements.length > 0 && (
            <Collapsible open={isRequirementsExpanded} className="border-t" onOpenChange={setIsRequirementsExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="group flex h-auto w-full justify-start gap-2 rounded-none p-2 hover:bg-transparent"
                >
                  <span className="relative flex items-center">
                    <ChevronDown
                      className={cn(
                        'size-3 shrink-0 transition-transform duration-200',
                        isRequirementsExpanded ? 'rotate-180' : '',
                      )}
                    />
                  </span>
                  <span className="text-left text-xs font-normal">
                    {requirements.length} Requirement{requirements.length > 1 ? 's' : ''}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t">
                <div className="space-y-1 px-2 py-2 text-xs">
                  {requirements.map((requirement, index) => {
                    const key = `${index}-${requirement}`;

                    return (
                      <div key={key} className="flex items-start text-xs">
                        <div className="mr-2 flex-shrink-0 font-mono text-muted-foreground">{index + 1}.</div>
                        <div className="flex-1">{requirement}</div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Analysis Section */}
          {/* <div className="border-t">
            <div className="mb-1 flex items-center gap-1 px-2 py-1 pt-2 text-xs text-muted-foreground">
              <Eye className="size-3" />
              <span>Analysis</span>
            </div>
            <div className={cn('relative', isImageExpanded ? '' : 'max-h-96 overflow-y-auto')}>
              <div className="prose prose-sm max-w-none px-3 pb-3 text-xs dark:prose-invert">
                <ReactMarkdown>{result.analysis}</ReactMarkdown>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="sticky bottom-0 h-6 w-full rounded-none bg-neutral/10 text-center text-foreground/50 hover:bg-neutral/40"
                    onClick={() => {
                      setIsImageExpanded((previous) => !previous);
                    }}
                  >
                    <ChevronDown className={cn('transition-transform', isImageExpanded ? 'rotate-x-180' : '')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isImageExpanded ? 'Collapse' : 'Expand'} analysis</TooltipContent>
              </Tooltip>
            </div>
          </div> */}
        </div>
      );
    }
  }
}
