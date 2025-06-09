import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { File, LoaderCircle, Play, X, ChevronDown, AlertTriangle, Bug, Camera } from 'lucide-react';
import type { ToolResult } from 'ai';
import { CodeViewer } from '~/components/code-viewer.js';
import { CopyButton } from '~/components/copy-button.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/tooltip.js';
import { Button } from '~/components/ui/button.js';
import { cn } from '~/utils/ui.js';
import { AnimatedShinyText } from '~/components/magicui/animated-shiny-text.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { useChatSelector } from '~/components/chat/ai-chat-provider.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/components/ui/hover-card.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible.js';
import type { CodeError } from '~/types/cad.js';

export type FileEditToolResult = ToolResult<
  'file_edit',
  {
    fileName: string;
    content: string;
  },
  {
    codeErrors: CodeError[];
    kernelError: string;
    screenshot: string;
  }
>;

function ErrorSection({
  type,
  errors,
  icon: Icon,
  isInitiallyOpen = false,
}: {
  readonly type: string;
  readonly errors: CodeError[];
  readonly icon: typeof AlertTriangle;
  readonly isInitiallyOpen?: boolean;
}): JSX.Element | undefined {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);

  if (errors.length === 0) return undefined;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="group flex h-auto w-full justify-start gap-2 rounded-none p-2 text-warning hover:bg-transparent"
        >
          {/* Show ChevronDown only on hover, otherwise show Icon */}
          <span className="relative flex items-center">
            <ChevronDown
              className={cn(
                'absolute left-0 size-3 shrink-0 opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100',
                isOpen ? 'rotate-180' : '',
              )}
            />
            <Icon
              className={cn('size-3 shrink-0 transition-opacity duration-200', 'group-hover:opacity-0', 'opacity-100')}
            />
          </span>
          <span className="text-left text-xs font-normal">
            {Number(errors.length)} {type} error{errors.length > 1 ? 's' : ''}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <div className="space-y-2 px-2 py-2 text-xs">
          {errors.map((error, index) => {
            // Handle both CodeError objects and string errors
            const isCodeError = typeof error === 'object' && 'startLineNumber' in error;
            const message = isCodeError ? error.message : error;
            const key = isCodeError ? `${error.startLineNumber}-${error.message}` : error;

            return (
              <div key={key} className="flex items-start text-xs">
                <div className="flex flex-row items-center gap-1 text-muted-foreground">
                  <div className="flex-shrink-0 font-mono">
                    {error.startLineNumber}:{error.startColumn}
                  </div>
                </div>
                <div className="ml-2 flex-1 font-mono">{message}</div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function StatusIcon({
  chatStatus,
  toolStatus,
}: {
  readonly chatStatus: 'error' | 'submitted' | 'streaming' | 'ready';
  readonly toolStatus: ToolInvocationUIPart['toolInvocation']['state'];
}): JSX.Element {
  if (chatStatus === 'streaming' && ['partial-call', 'call'].includes(toolStatus)) {
    return <LoaderCircle className="size-3 animate-spin" />;
  }

  if (['error', 'ready'].includes(chatStatus) && ['partial-call', 'call'].includes(toolStatus)) {
    return <X className="size-3 text-destructive" />;
  }

  return <File className="size-3" />;
}

function Filename({
  fileName,
  chatStatus,
  toolStatus,
}: {
  readonly fileName: string;
  readonly chatStatus: 'error' | 'submitted' | 'streaming' | 'ready';
  readonly toolStatus: ToolInvocationUIPart['toolInvocation']['state'];
}): JSX.Element {
  if (chatStatus === 'streaming' && ['partial-call', 'call'].includes(toolStatus)) {
    return <AnimatedShinyText>{fileName}</AnimatedShinyText>;
  }

  return <span>{fileName}</span>;
}

export function ChatMessageToolFileEdit({ part }: { readonly part: ToolInvocationUIPart }): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = useChatSelector((state) => state.context.status);

  const setCode = useCallback((code: string) => {
    cadActor.send({ type: 'setCode', code });
  }, []);

  switch (part.toolInvocation.state) {
    case 'partial-call':
    case 'call': {
      const { fileName = '' } = (part.toolInvocation.args ?? {}) as {
        content?: string;
        fileName?: string;
      };
      return (
        <div className="@container/code flex h-8 w-full flex-row items-center gap-1 overflow-hidden rounded-md border bg-neutral/10 pr-1 pl-3 text-xs text-muted-foreground">
          <StatusIcon chatStatus={status} toolStatus={part.toolInvocation.state} />
          <Filename fileName={fileName} chatStatus={status} toolStatus={part.toolInvocation.state} />
        </div>
      );
    }

    case 'result': {
      const { fileName = '', content = '' } = (part.toolInvocation.args ?? {}) as {
        content?: string;
        fileName?: string;
      };

      const result =
        part.toolInvocation.state === 'result'
          ? (part.toolInvocation.result as FileEditToolResult['result'])
          : undefined;

      return (
        <div className="@container/code overflow-hidden rounded-md border bg-neutral/10">
          <div className="sticky top-0 flex flex-row items-center justify-between py-1 pr-1 pl-2 text-foreground/50">
            <div className="flex flex-row items-center gap-1 text-xs text-muted-foreground">
              <StatusIcon chatStatus={status} toolStatus={part.toolInvocation.state} />
              <Filename fileName={fileName} chatStatus={status} toolStatus={part.toolInvocation.state} />
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
          <div>
            {result ? (
              <div>
                {result.screenshot ? (
                  <div className="border-t p-2 pt-1">
                    <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Camera className="size-3" />
                      <span>views</span>
                    </div>
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="cursor-pointer rounded-md border bg-neutral/5 hover:bg-neutral/10">
                          <img
                            src={result.screenshot}
                            alt="Generated screenshot"
                            className="size-full rounded-sm object-cover object-top"
                          />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent asChild side="top" align="start" className="w-96">
                        <img src={result.screenshot} alt="Generated screenshot (full size)" className="max-w-full" />
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                ) : null}

                {result.kernelError ? (
                  <div className="border-t">
                    <ErrorSection
                      isInitiallyOpen
                      type="kernel"
                      errors={
                        result.kernelError
                          ? [
                              {
                                startLineNumber: 0,
                                startColumn: 0,
                                message: result.kernelError,
                                endLineNumber: 0,
                                endColumn: 0,
                              },
                            ]
                          : []
                      }
                      icon={Bug}
                    />
                  </div>
                ) : null}

                {result.codeErrors && result.codeErrors.length > 0 ? (
                  <div className="border-t">
                    <ErrorSection
                      type="linter"
                      errors={result.codeErrors ?? []}
                      icon={AlertTriangle}
                      isInitiallyOpen={(result.codeErrors?.length ?? 0) <= 3}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {/* <div className={cn('relative max-h-32', isExpanded ? 'max-h-none' : 'overflow-y-auto')}>
            <div className={cn('leading-0')}>
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
          </div> */}
        </div>
      );
    }
  }
}
