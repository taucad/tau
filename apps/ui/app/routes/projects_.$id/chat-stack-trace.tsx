import { useCallback, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import type { KernelProvider, KernelIssue, KernelStackFrame, IssueSeverity } from '@taucad/runtime';
import { languageFromKernel } from '@taucad/types/constants';
import { messageRole, messageStatus } from '@taucad/chat/constants';
import { Button } from '#components/ui/button.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { FileLink } from '#components/files/file-link.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { useProject } from '#hooks/use-project.js';
import { useCad, useCadSelector } from '#hooks/use-cad.js';
import { useChats } from '#hooks/use-chats.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { useModifiers } from '#hooks/use-keyboard.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { cn } from '#utils/ui.utils.js';
import { createMessage } from '#utils/chat.utils.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { useFileManager } from '#hooks/use-file-manager.js';

const shiftKey = formatKeyCombination({ key: 'Shift' });

type FormatErrorPromptOptions = {
  error: KernelIssue;
  filePath: string;
  code: string;
  kernel: KernelProvider;
};

/**
 * Formats a kernel error into a prompt for AI assistance.
 */
function formatErrorPrompt({ error, filePath, code, kernel }: FormatErrorPromptOptions): string {
  // Format error location
  const locationText = error.location
    ? `Line ${error.location.startLineNumber}, Column ${error.location.startColumn}`
    : 'Unknown location';

  // Format stack trace
  const stackTraceText = error.stackFrames
    ?.map(
      (frame, index) =>
        `    ${index + 1}. ${frame.functionName ?? '<anonymous>'} (${frame.fileName ?? '<unknown>'}:${frame.lineNumber}:${frame.columnNumber})`,
    )
    .join('\n');

  const errorText = `- **Message:** ${error.message}
- **Location:** ${locationText}
${stackTraceText ? `- **Stack Trace:**\n${stackTraceText}` : ''}`;

  // Get code context around the error's line (if available)
  let codeContext = '';
  const errorLine = error.location?.startLineNumber;
  if (code && errorLine) {
    const lines = code.split('\n');
    const startLine = Math.max(0, errorLine - 3);
    const endLine = Math.min(lines.length, errorLine + 3);
    const contextLines = lines.slice(startLine, endLine);
    codeContext = contextLines
      .map((line, index) => {
        const lineNumber = startLine + index + 1;
        const marker = lineNumber === errorLine ? '> ' : '  ';

        return `${marker}${lineNumber} | ${line}`;
      })
      .join('\n');
  }

  return `I'm getting an error in my ${kernel} code and need help fixing it.

**File:** ${filePath}

${errorText}

${
  codeContext
    ? `**Code Context:**
\`\`\`
${codeContext}
\`\`\`
`
    : ''
}
${
  code
    ? `**Full Code:**
\`\`\`${languageFromKernel[kernel]}
${code}
\`\`\`
`
    : ''
}

Please analyze the error and fix the code. Focus on:
1. Identifying the root cause of the error
2. Providing a corrected version of the code
3. Explaining what was wrong and why the fix works

Please update the code to resolve this error.`;
}

function StackFrame({ frame, index }: { readonly frame: KernelStackFrame; readonly index: number }): React.JSX.Element {
  const fileName = frame.fileName ?? '<unknown>';
  const isClickable = Boolean(frame.fileName);

  const locationContent = (
    <>
      <span className='shrink-0 text-muted-foreground'>(</span>
      <span className='min-w-0 truncate text-muted-foreground' dir='rtl' title={fileName}>
        {fileName}
      </span>
      {frame.lineNumber !== undefined && frame.columnNumber !== undefined ? (
        <span className='shrink-0 text-muted-foreground'>
          :{frame.lineNumber}:{frame.columnNumber}
        </span>
      ) : null}
      <span className='shrink-0 text-muted-foreground'>)</span>
    </>
  );

  return (
    <div className='flex min-w-0 items-center gap-2 font-mono text-[0.625rem]'>
      <span className='w-3 shrink-0 text-right text-muted-foreground'>{index + 1}</span>
      <span className='shrink-0 text-muted-foreground'>|</span>
      <span className='shrink-0 text-foreground'>{frame.functionName ?? '<anonymous>'}</span>
      {isClickable ? (
        <FileLink
          path={frame.fileName!}
          lineNumber={frame.lineNumber}
          column={frame.columnNumber}
          className='flex min-w-0 hover:text-foreground'
        >
          {locationContent}
        </FileLink>
      ) : (
        <div className='flex min-w-0'>{locationContent}</div>
      )}
    </div>
  );
}

function StackTraceSection({
  stackFrames,
  styles,
}: {
  readonly stackFrames: KernelStackFrame[];
  readonly styles: ReturnType<typeof getSeverityStyles>;
}): React.JSX.Element {
  const [showInternal, setShowInternal] = useState(false);

  // Split frames into visible (user + library) and hidden (framework + runtime) frames
  const userFrames = stackFrames.filter((frame) => frame.context === 'user' || frame.context === 'library');
  const internalFrames = stackFrames.filter(
    (frame) => frame.context === 'framework' || frame.context === 'runtime' || !frame.context,
  );
  const hasInternalFrames = internalFrames.length > 0;

  // When collapsed, show only user frames; when expanded, show all in original order
  const visibleFrames = showInternal ? stackFrames : userFrames;

  return (
    <div className='space-y-1'>
      <div className='font-medium text-muted-foreground'>Stack trace:</div>
      <div className={cn('space-y-0.5 rounded border bg-background/80 p-2', styles.stackBorder)}>
        {visibleFrames.map((frame, index) => (
          <StackFrame
            key={`${frame.functionName}-${frame.fileName}-${frame.lineNumber}-${frame.columnNumber}`}
            frame={frame}
            index={index}
          />
        ))}
        {hasInternalFrames ? (
          <button
            type='button'
            className='mt-1 cursor-pointer font-mono text-[0.625rem] text-muted-foreground/60 transition-colors hover:text-muted-foreground'
            onClick={() => {
              setShowInternal(!showInternal);
            }}
          >
            {showInternal
              ? `▾ Hide platform internals (${internalFrames.length} frames)`
              : `▸ Show platform internals (${internalFrames.length} frames)`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getBasename(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Get styling classes based on issue severity.
 */
function getSeverityStyles(severity: IssueSeverity | undefined): {
  leftBorder: string;
  background: string;
  text: string;
  code: string;
  stackBorder: string;
  buttonBorder: string;
} {
  switch (severity) {
    case 'warning': {
      return {
        leftBorder: 'border-l-warning',
        background: 'bg-warning/5',
        text: 'text-warning',
        code: '[&_code]:text-warning [&_code]:border-warning/30',
        stackBorder: 'border-border',
        buttonBorder: 'border-warning/30 hover:border-warning/50',
      };
    }

    case 'info': {
      return {
        leftBorder: 'border-l-info',
        background: 'bg-info/5',
        text: 'text-info',
        code: '[&_code]:text-info [&_code]:border-info/30',
        stackBorder: 'border-border',
        buttonBorder: 'border-info/30 hover:border-info/50',
      };
    }

    default: {
      return {
        leftBorder: 'border-l-destructive',
        background: 'bg-destructive/5',
        text: 'text-destructive',
        code: '[&_code]:text-destructive [&_code]:border-destructive/30',
        stackBorder: 'border-border',
        buttonBorder: 'border-destructive/30 hover:border-destructive/50',
      };
    }
  }
}

function formatLocation(fileName?: string, lineNumber?: number, column?: number): string {
  if (!fileName) {
    return '';
  }

  const basename = getBasename(fileName);

  if (lineNumber === undefined) {
    return basename;
  }

  if (column === undefined) {
    return `${basename}:${lineNumber}`;
  }

  return `${basename}:${lineNumber}:${column}`;
}

function ErrorStackTrace({
  message,
  fileName,
  startLineNumber,
  startColumn,
  stackFrames,
  severity,
  isFirst,
  onFixWithAi,
}: {
  readonly message: string;
  readonly fileName?: string;
  readonly startLineNumber?: number;
  readonly startColumn?: number;
  readonly stackFrames?: KernelStackFrame[];
  readonly severity?: IssueSeverity;
  readonly isFirst: boolean;
  readonly onFixWithAi?: (createNewChat: boolean) => void;
}): React.JSX.Element {
  const isLocationClickable = Boolean(fileName && startLineNumber !== undefined);
  const locationText = formatLocation(fileName, startLineNumber, startColumn);
  const styles = getSeverityStyles(severity);

  // Track shift key state for "new chat" functionality
  const { shift: isShiftHeld } = useModifiers();

  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-l-2 p-3 text-xs',
        styles.leftBorder,
        styles.background,
        // Add top border for items after the first
        !isFirst && 'border-t border-t-border',
      )}
    >
      {/* Error message with Fix button */}
      <div className='flex flex-row items-start justify-between gap-2'>
        <div className={cn('flex flex-wrap items-baseline gap-x-1.5 font-medium', styles.text)}>
          <MarkdownViewer
            className={cn('inline w-auto! text-xs text-inherit', styles.code, '[&_code]:bg-background/80')}
          >
            {message}
          </MarkdownViewer>
          {locationText ? (
            <span className='font-mono font-normal text-muted-foreground'>
              (
              {isLocationClickable ? (
                <FileLink
                  path={fileName!}
                  lineNumber={startLineNumber}
                  column={startColumn}
                  className='hover:text-foreground'
                >
                  {locationText}
                </FileLink>
              ) : (
                locationText
              )}
              )
            </span>
          ) : null}
        </div>
        {onFixWithAi ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size='icon'
                variant='outline'
                className={cn('size-6 shrink-0 bg-background/80 hover:bg-background', styles.buttonBorder)}
                onClick={() => {
                  onFixWithAi(isShiftHeld);
                }}
              >
                <Sparkles className='size-3' />
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top' className='flex flex-col gap-1'>
              <span>{isShiftHeld ? 'Fix in new chat' : 'Fix with AI'}</span>
              <span className='flex items-center gap-1 text-xs opacity-70'>
                <KeyShortcut variant='tooltip'>{shiftKey}</KeyShortcut> for new chat
              </span>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* Stack trace */}
      {stackFrames && stackFrames.length > 0 ? <StackTraceSection stackFrames={stackFrames} styles={styles} /> : null}
    </div>
  );
}

type IssueCounts = {
  error: number;
  warning: number;
  info: number;
};

/**
 * Counts issues by severity.
 */
function getIssueCounts(issues: KernelIssue[]): IssueCounts {
  const counts: IssueCounts = {
    error: 0,
    warning: 0,
    info: 0,
  };

  for (const { severity } of issues) {
    counts[severity]++;
  }

  return counts;
}

type IssuePart = { key: string; element: React.ReactNode };

/**
 * Renders a color-coded summary of issues for the collapsible trigger.
 */
function IssuesSummary({ counts }: { readonly counts: IssueCounts }): React.JSX.Element {
  const parts: IssuePart[] = [];

  if (counts.error > 0) {
    parts.push({
      key: 'error',
      element: (
        <span className='text-destructive'>
          {counts.error} error{counts.error > 1 ? 's' : ''}
        </span>
      ),
    });
  }

  if (counts.warning > 0) {
    parts.push({
      key: 'warning',
      element: (
        <span className='text-warning'>
          {counts.warning} warning{counts.warning > 1 ? 's' : ''}
        </span>
      ),
    });
  }

  if (counts.info > 0) {
    parts.push({
      key: 'info',
      element: <span className='text-info'>{counts.info} info</span>,
    });
  }

  return (
    <>
      {parts.map((part, index) => (
        <span key={part.key}>
          {index > 0 ? <span className='text-muted-foreground'>, </span> : null}
          {part.element}
        </span>
      ))}
    </>
  );
}

type ChatStackTraceProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Entry file being rendered in this viewer */
  readonly entryFile: string;
  /**
   * Which side to show the collapsible trigger.
   * - 'top': Trigger at the top, content expands below
   * - 'bottom': Trigger at the bottom, content expands above
   */
  readonly side: 'top' | 'bottom';
};

export function ChatStackTrace({ entryFile, className, side, ...props }: ChatStackTraceProps): React.ReactNode {
  const { getMainFilename, editorRef, projectId, setFocusedChatId } = useProject();
  const fileManager = useFileManager();
  const { createChat } = useChats(projectId);
  const [isOpen, setIsOpen] = useState(true);

  // Guard against stale cadActor during project transitions.
  // CadProvider may still hold the previous project's actor while projectId has
  // already changed to the new project. Check that the actor ID matches the
  // expected pattern "cad-{projectId}-{entryFile}" before reading its state.
  const cadRef = useCad();
  const isCadActorStale = cadRef ? !cadRef.id.includes(projectId) : true;

  // Get all kernel issues for this viewer's geometry unit via CadProvider context
  const rawErrors = useCadSelector((state) => state.context.kernelIssues.get(entryFile), undefined);
  const errors = isCadActorStale ? undefined : rawErrors;

  // The chat-client composes the per-request `agent` payload (model, kernel,
  // mode, toolChoice, testingEnabled, snapshot, contextPayload) from the
  // current chat's active values. Fix-with-AI no longer stamps any of those
  // fields onto the user message — the regression-coverage test asserts the
  // captured wire body carries the full `agent` block via the chat-client.
  const cadChat = useCadChatClient();
  const { agent } = cadChat;

  const handleFixWithAi = useCallback(
    async (errorIndex: number, createNewChat: boolean) => {
      if (!errors || errors.length === 0) {
        return;
      }

      const targetError = errors[errorIndex];
      if (!targetError) {
        return;
      }

      const filePath = await getMainFilename();
      const fileContent = await fileManager.readFile(filePath);
      const code = decodeTextFile(fileContent);

      const errorPrompt = formatErrorPrompt({
        error: targetError,
        filePath,
        code,
        kernel: agent.kernel,
      });

      editorRef.send({
        type: 'setPanelState',
        panelState: { openPanels: { chat: true } },
      });

      if (createNewChat) {
        // Persist the pending user message and let the hydration auto-regen
        // (chat-session-store#loadChatActor) fire the assistant turn through
        // the chat-client once the new chat mounts. The seed message only
        // needs the pending status — the wire body's `agent` payload is
        // composed by the chat-client at regenerate time, not from this
        // metadata block. Seeding `activeModel` / `activeKernel` on the
        // chat row keeps the new chat pinned to the current selection.
        const message = createMessage({
          content: errorPrompt,
          role: messageRole.user,
          metadata: {
            status: messageStatus.pending,
          },
        });
        const newChat = await createChat({
          name: 'New chat',
          messages: [message],
          activeModel: agent.model,
          activeKernel: agent.kernel,
        });
        setFocusedChatId(newChat.id);
      } else {
        cadChat.submit({ text: errorPrompt });
      }
    },
    [errors, getMainFilename, fileManager, agent.kernel, agent.model, editorRef, createChat, setFocusedChatId, cadChat],
  );

  if (!errors || errors.length === 0) {
    return null;
  }

  const issueCounts = getIssueCounts(errors);

  const trigger = (
    <CollapsibleTrigger
      className={cn(
        'group/collapsible flex h-8 w-full items-center justify-between border-border bg-sidebar px-2 py-1.5 transition-colors hover:bg-accent',
      )}
    >
      <span className='flex items-center gap-1.5 text-xs font-medium'>
        <span>Issues</span>
        <span>
          <span>(</span>
          <IssuesSummary counts={issueCounts} />
          <span>)</span>
        </span>
      </span>
      <ChevronRight
        className={cn(
          'size-3.5 text-muted-foreground transition-transform duration-200 ease-in-out',
          // Rotate based on side: top trigger rotates down when open, bottom trigger rotates up when open
          side === 'top'
            ? 'group-data-[state=open]/collapsible:rotate-90'
            : 'group-data-[state=open]/collapsible:-rotate-90',
        )}
      />
    </CollapsibleTrigger>
  );

  const content = (
    <CollapsibleContent className={cn('border-border', side === 'bottom' && 'border-b', side === 'top' && 'border-b')}>
      <div className='flex max-h-[min(20rem,40svh)] scroll-shadows-y flex-col'>
        {errors.map((error, errorIndex) => {
          // Create a unique key from error properties
          const errorKey = `${error.message}-${error.location?.startLineNumber ?? 'unknown'}-${error.location?.startColumn ?? 'unknown'}`;

          return (
            <ErrorStackTrace
              key={errorKey}
              message={error.message}
              fileName={error.location?.fileName}
              startLineNumber={error.location?.startLineNumber}
              startColumn={error.location?.startColumn}
              stackFrames={error.stackFrames}
              severity={error.severity}
              isFirst={errorIndex === 0}
              onFixWithAi={async (createNewChat) => handleFixWithAi(errorIndex, createNewChat)}
            />
          );
        })}
      </div>
    </CollapsibleContent>
  );

  return (
    <div {...props} className={cn('max-w-md overflow-hidden rounded-md border border-border bg-sidebar/50', className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {side === 'top' ? (
          <>
            {trigger}
            {content}
          </>
        ) : (
          <>
            {content}
            {trigger}
          </>
        )}
      </Collapsible>
    </div>
  );
}
