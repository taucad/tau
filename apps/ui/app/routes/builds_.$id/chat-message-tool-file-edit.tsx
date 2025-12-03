import type { ToolUIPart, UIToolInvocation } from 'ai';
import { useCallback, useState } from 'react';
import { File, LoaderCircle, Play, X, ChevronDown, AlertTriangle, Bug, Check, RotateCcw } from 'lucide-react';
import { useActorRef, useSelector } from '@xstate/react';
import type { CodeError, KernelError } from '@taucad/types';
import { waitFor } from 'xstate';
import type { MyTools } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { CodeViewer } from '#components/code/code-viewer.js';
import { CopyButton } from '#components/copy-button.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { AnimatedShinyText } from '#components/magicui/animated-shiny-text.js';
import { useBuild } from '#hooks/use-build.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { fileEditMachine } from '#machines/file-edit.machine.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { useFileManager } from '#hooks/use-file-manager.js';

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
}): React.JSX.Element | undefined {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);

  if (errors.length === 0) {
    return undefined;
  }

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
                  <div className="shrink-0 font-mono">
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
  readonly toolStatus: ToolUIPart['state'];
}): React.JSX.Element {
  if (chatStatus === 'streaming' && ['input-streaming', 'input-available'].includes(toolStatus)) {
    return <LoaderCircle className="size-3 animate-spin" />;
  }

  if (['error', 'ready'].includes(chatStatus) && ['input-streaming', 'input-available'].includes(toolStatus)) {
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
  readonly toolStatus: ToolUIPart['state'];
}): React.JSX.Element {
  if (chatStatus === 'streaming' && ['input-streaming', 'input-available'].includes(toolStatus)) {
    return <AnimatedShinyText>{targetFile}</AnimatedShinyText>;
  }

  return <span>{targetFile}</span>;
}

// eslint-disable-next-line complexity -- refactor later
export function ChatMessageToolFileEdit({
  part,
}: {
  readonly part: UIToolInvocation<MyTools[typeof toolName.fileEdit]>;
}): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const { getMainFilename } = useBuild();
  const status = useChatSelector((state) => state.status);

  // Create file edit machine
  const fileEditRef = useActorRef(fileEditMachine);
  const fileEditState = useSelector(fileEditRef, (state) => state.value);
  const fileEditError = useSelector(fileEditRef, (state) => state.context.error);
  const fileManager = useFileManager();

  const handleApplyEdit = useCallback(
    async (targetFile: string, editInstructions: string) => {
      const mainFilename = await getMainFilename();
      const resolvedPath = targetFile || mainFilename;

      const currentCode = await fileManager.readFile(resolvedPath);

      fileEditRef.start();
      fileEditRef.send({
        type: 'applyEdit',
        request: {
          targetFile: resolvedPath,
          originalContent: decodeTextFile(currentCode),
          codeEdit: editInstructions,
        },
      });

      const snapshot = await waitFor(fileEditRef, (state) => state.matches('success') || state.matches('error'));
      if (snapshot.matches('success')) {
        const { result } = snapshot.context;
        if (!result?.editedContent) {
          throw new Error('No content received from file edit service');
        }

        fileManager.writeFile(resolvedPath, encodeTextFile(result.editedContent));
      }

      if (snapshot.matches('error')) {
        const { error } = snapshot.context;
        throw new Error(`File edit failed: ${error}`);
      }
    },
    [fileEditRef, fileManager, getMainFilename],
  );

  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const { input } = part;
      const { targetFile = '', codeEdit = '' } = input ?? {};

      // Show last 4 lines during streaming
      const lines = codeEdit.split('\n');
      const lastFourLines = lines.slice(-4).join('\n');
      const hasContent = lastFourLines.trim().length > 0;

      return (
        <div className="@container/code overflow-hidden rounded-md border bg-neutral/10">
          <div className="flex h-7 w-full flex-row items-center gap-1 pr-1 pl-2 text-xs text-muted-foreground">
            <StatusIcon chatStatus={status} toolStatus={part.state} />
            <Filename targetFile={targetFile} chatStatus={status} toolStatus={part.state} />
          </div>
          {hasContent ? (
            <div className="h-[100px] overflow-hidden border-t">
              <CodeViewer language="typescript" text={lastFourLines} className="overflow-x-auto p-3 text-xs" />
            </div>
          ) : null}
        </div>
      );
    }

    case 'output-available': {
      const { input } = part;
      const { targetFile = '', codeEdit = '' } = input;

      const result = part.output;

      return (
        <div className="@container/code overflow-hidden rounded-md border bg-neutral/10">
          <div className="sticky top-0 flex flex-row items-center justify-between py-1 pr-1 pl-2 text-foreground/50">
            <div className="flex flex-row items-center gap-1 text-xs text-muted-foreground">
              <StatusIcon chatStatus={status} toolStatus={part.state} />
              <Filename targetFile={targetFile} chatStatus={status} toolStatus={part.state} />
            </div>
            <div className="flex flex-row gap-1">
              <CopyButton
                size="xs"
                className="**:data-[slot=label]:hidden @xs/code:**:data-[slot=label]:flex"
                getText={() => codeEdit}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="flex"
                    disabled={fileEditState === 'applying'}
                    onClick={() => {
                      void handleApplyEdit(targetFile, codeEdit);
                    }}
                  >
                    <span className="hidden @xs/code:block">
                      {fileEditState === 'applying'
                        ? 'Applying...'
                        : fileEditState === 'success'
                          ? 'Applied'
                          : fileEditState === 'error'
                            ? 'Retry'
                            : 'Apply'}
                    </span>
                    {fileEditState === 'applying' ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : fileEditState === 'success' ? (
                      <Check className="size-3" />
                    ) : fileEditState === 'error' ? (
                      <RotateCcw className="size-3" />
                    ) : (
                      <Play />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {fileEditState === 'applying'
                    ? 'Applying file edit...'
                    : fileEditState === 'success'
                      ? 'File edit applied successfully'
                      : fileEditState === 'error'
                        ? `Edit failed: ${fileEditError ?? 'Unknown error'}. Reverted to original content.`
                        : 'Apply edit'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className={cn('relative max-h-32 border-t', isExpanded ? 'max-h-none' : 'overflow-y-auto')}>
            <div className={cn('leading-0')}>
              <CodeViewer
                language="typescript"
                text={isExpanded ? codeEdit : codeEdit.split('\n').slice(0, 4).join('\n')}
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
            <div>
              <ErrorSection
                isInitiallyOpen
                className="border-t"
                type="kernel"
                errors={
                  result.kernelError
                    ? [
                        {
                          startLineNumber: result.kernelError.startLineNumber,
                          startColumn: result.kernelError.startColumn,
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
                errors={result.codeErrors}
                icon={AlertTriangle}
                isInitiallyOpen={result.codeErrors.length <= 3}
              />
            </div>
          </div>
        </div>
      );
    }

    case 'output-error': {
      return <div>File edit failed</div>;
    }
  }
}
