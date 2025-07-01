import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { useCallback, useState, useEffect } from 'react';
import type { JSX } from 'react';
import { File, LoaderCircle, Play, X, ChevronDown, AlertTriangle, Bug, Camera, Check, RotateCcw } from 'lucide-react';
import type { ToolResult } from 'ai';
import { useMachine } from '@xstate/react';
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
import type { KernelError } from '~/types/kernel.js';
import { fileEditMachine } from '~/machines/file-edit.machine.js';

export type FileEditToolResult = ToolResult<
  'edit_file',
  {
    targetFile: string;
    codeEdit: string;
  },
  {
    codeErrors: CodeError[];
    kernelError?: KernelError;
    screenshot: string;
  }
>;

function ErrorSection({
  type,
  errors,
  icon: Icon,
  isInitiallyOpen = false,
  className,
}: {
  readonly type: string;
  readonly errors: Array<CodeError | KernelError>;
  readonly icon: typeof AlertTriangle;
  readonly isInitiallyOpen?: boolean;
  readonly className?: string;
}): JSX.Element | undefined {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);

  if (errors.length === 0) return undefined;

  return (
    <Collapsible open={isOpen} className={className} onOpenChange={setIsOpen}>
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
          {errors.map((error) => {
            const key = `${error.startLineNumber}-${error.message}`;

            return (
              <div key={key} className="flex items-start text-xs">
                <div className="flex flex-row items-center gap-1 text-muted-foreground">
                  <div className="flex-shrink-0 font-mono">
                    {error.startLineNumber}:{error.startColumn}
                  </div>
                </div>
                <div className="ml-2 flex-1 font-mono">{error.message}</div>
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
  targetFile,
  chatStatus,
  toolStatus,
}: {
  readonly targetFile: string;
  readonly chatStatus: 'error' | 'submitted' | 'streaming' | 'ready';
  readonly toolStatus: ToolInvocationUIPart['toolInvocation']['state'];
}): JSX.Element {
  if (chatStatus === 'streaming' && ['partial-call', 'call'].includes(toolStatus)) {
    return <AnimatedShinyText>{targetFile}</AnimatedShinyText>;
  }

  return <span>{targetFile}</span>;
}

// eslint-disable-next-line complexity -- refactor later
export function ChatMessageToolFileEdit({ part }: { readonly part: ToolInvocationUIPart }): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = useChatSelector((state) => state.context.status);

  // Create file edit machine
  const [fileEditState, fileEditSend] = useMachine(fileEditMachine);

  const setCode = useCallback((code: string) => {
    cadActor.send({ type: 'setCode', code });
  }, []);

  const handleApplyEdit = useCallback(
    (targetFile: string, editInstructions: string) => {
      // Get the current code from the CAD actor as the original codeEdit
      const currentCode = cadActor.getSnapshot().context.code;

      fileEditSend({
        type: 'applyEdit',
        request: {
          targetFile,
          originalContent: currentCode,
          codeEdit: editInstructions,
        },
      });
    },
    [fileEditSend],
  );

  // When file edit is successful or failed with fallback content, set the code in the CAD actor
  useEffect(() => {
    if (fileEditState.matches('success') || fileEditState.matches('error')) {
      const { result } = fileEditState.context;
      if (result?.editedContent) {
        // Set the edited content (which will be original content on error as fallback)
        setCode(result.editedContent);
      }
    }
  }, [fileEditState, setCode]);

  switch (part.toolInvocation.state) {
    case 'partial-call':
    case 'call': {
      const { targetFile = '' } = (part.toolInvocation.args ?? {}) as {
        codeEdit?: string;
        targetFile?: string;
      };
      return (
        <div className="@container/code flex h-7 w-full flex-row items-center gap-1 overflow-hidden rounded-md border bg-neutral/10 pr-1 pl-3 text-xs text-muted-foreground">
          <StatusIcon chatStatus={status} toolStatus={part.toolInvocation.state} />
          <Filename targetFile={targetFile} chatStatus={status} toolStatus={part.toolInvocation.state} />
        </div>
      );
    }

    case 'result': {
      const { targetFile = '', codeEdit = '' } = (part.toolInvocation.args ?? {}) as {
        codeEdit?: string;
        targetFile?: string;
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
              <Filename targetFile={targetFile} chatStatus={status} toolStatus={part.toolInvocation.state} />
            </div>
            <div className="flex flex-row gap-1">
              <CopyButton
                size="xs"
                className="[&_[data-slot=label]]:hidden @xs/code:[&_[data-slot=label]]:flex"
                getText={() => codeEdit}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="flex"
                    disabled={fileEditState.matches('applying')}
                    onClick={() => {
                      handleApplyEdit(targetFile, codeEdit);
                    }}
                  >
                    <span className="hidden @xs/code:block">
                      {fileEditState.matches('applying')
                        ? 'Applying...'
                        : fileEditState.matches('success')
                          ? 'Applied'
                          : fileEditState.matches('error')
                            ? 'Retry'
                            : 'Apply'}
                    </span>
                    {fileEditState.matches('applying') ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : fileEditState.matches('success') ? (
                      <Check className="size-3" />
                    ) : fileEditState.matches('error') ? (
                      <RotateCcw className="size-3" />
                    ) : (
                      <Play />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {fileEditState.matches('applying')
                    ? 'Applying file edit...'
                    : fileEditState.matches('success')
                      ? 'File edit applied successfully'
                      : fileEditState.matches('error')
                        ? `Edit failed: ${fileEditState.context.error}. Reverted to original content.`
                        : 'Apply file edit using Morph'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className={cn('relative max-h-32 border-t', isExpanded ? 'max-h-none' : 'overflow-y-auto')}>
            <div className={cn('leading-0')}>
              <CodeViewer
                language="typescript"
                text={isExpanded ? codeEdit : codeEdit.split('\n').slice(0, 5).join('\n')}
                className="overflow-x-auto p-3 text-xs"
              />
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

                <ErrorSection
                  isInitiallyOpen
                  className="border-t"
                  type="kernel"
                  errors={
                    result.kernelError
                      ? [
                          {
                            startLineNumber: result.kernelError.startLineNumber ?? 0,
                            startColumn: result.kernelError.startColumn ?? 0,
                            message: result.kernelError.message,
                          },
                        ]
                      : []
                  }
                  icon={Bug}
                />

                <ErrorSection
                  className="border-t"
                  type="linter"
                  errors={result.codeErrors ?? []}
                  icon={AlertTriangle}
                  isInitiallyOpen={(result.codeErrors?.length ?? 0) <= 3}
                />
              </div>
            ) : null}
          </div>
        </div>
      );
    }
  }
}
