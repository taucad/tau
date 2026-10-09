import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronUp, CircleX, Info, Sparkles, TriangleAlert } from 'lucide-react';
import type { KernelProvider, KernelIssue, KernelStackFrame, IssueSeverity } from '@taucad/runtime';
import { idPrefix, languageFromKernel } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Separator } from '@taucad/ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { FileLink } from '#components/files/file-link.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { useProject } from '#hooks/use-project.js';
import { useCadSelector } from '#hooks/use-cad.js';
import { useChats } from '#hooks/use-chats.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { useModifiers } from '#hooks/use-keyboard.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { cn } from '@taucad/ui/utils/cn';
import { buildUserMessage } from '#utils/chat.utils.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { selectCadEntryIssues, selectCadFailureIssues } from '#machines/cad.machine.js';

const shiftKey = formatKeyCombination({ key: 'Shift' });

type FormatErrorPromptOptions = {
  errors: readonly KernelIssue[];
  filePath: string;
  code: string;
  kernel: KernelProvider;
};

function formatIssue(error: KernelIssue): string {
  const locationText = error.location
    ? `Line ${error.location.startLineNumber}, Column ${error.location.startColumn}`
    : 'Unknown location';
  const stackTraceText = error.stackFrames
    ?.map(
      (frame, index) =>
        `    ${index + 1}. ${frame.functionName ?? '<anonymous>'} (${frame.fileName ?? '<unknown>'}:${frame.lineNumber}:${frame.columnNumber})`,
    )
    .join('\n');

  return `- **Message:** ${error.message}
- **Location:** ${locationText}
${stackTraceText ? `- **Stack Trace:**\n${stackTraceText}` : ''}`;
}

/**
 * Formats one or more kernel issues into a prompt for AI assistance.
 */
function formatErrorPrompt({ errors, filePath, code, kernel }: FormatErrorPromptOptions): string {
  const [first] = errors;
  const errorText = errors.map((error) => formatIssue(error)).join('\n\n');

  // Get code context around the first issue's line (if available)
  let codeContext = '';
  const errorLine = first?.location?.startLineNumber;
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

  const subject = errors.length > 1 ? `${errors.length} issues` : 'an error';

  return `I'm getting ${subject} in my ${kernel} code and need help fixing ${errors.length > 1 ? 'them' : 'it'}.

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

function StackTraceSection({ stackFrames }: { readonly stackFrames: KernelStackFrame[] }): React.JSX.Element {
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
    <div className='mb-1 space-y-0.5 rounded-sm border bg-background/80 p-1.5'>
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
          className='mt-1 font-mono text-[0.625rem] text-muted-foreground/60 transition-colors hover:text-muted-foreground'
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
  );
}

function getBasename(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Each severity's glyph: status colour lives in the glyph alone. */
const severityGlyphs = {
  error: { Icon: CircleX, className: 'text-destructive' },
  warning: { Icon: TriangleAlert, className: 'text-warning' },
  info: { Icon: Info, className: 'text-info' },
} as const satisfies Record<IssueSeverity, unknown>;

const severityRank: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

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

/**
 * One issue in the bar's issues row: its severity glyph, the message with its location, and Fix with AI. The stack
 * trace is a closed second level whose trigger sits below it: the bar grows upward, so the trigger stays put.
 */
function IssueRow({
  issue,
  onFixWithAi,
}: {
  readonly issue: KernelIssue;
  readonly onFixWithAi?: (createNewChat: boolean) => void;
}): React.JSX.Element {
  const fileName = issue.location?.fileName;
  const startLineNumber = issue.location?.startLineNumber;
  const startColumn = issue.location?.startColumn;
  const isLocationClickable = Boolean(fileName && startLineNumber !== undefined);
  const locationText = formatLocation(fileName, startLineNumber, startColumn);
  const { Icon, className } = severityGlyphs[issue.severity];

  // Track shift key state for "new chat" functionality
  const { shift: isShiftHeld } = useModifiers();

  return (
    <li className='flex flex-col gap-1 py-1.5 pr-1 pl-2 text-xs'>
      <div className='flex items-start gap-2'>
        <Icon aria-label={issue.severity} className={cn('mt-0.5 size-3.5 shrink-0', className)} />
        <div className='flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-foreground'>
          <MarkdownViewer className='inline w-auto! text-xs text-inherit [&_code]:bg-muted'>
            {issue.message}
          </MarkdownViewer>
          {locationText ? (
            <span className='font-mono text-muted-foreground'>
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
            </span>
          ) : null}
        </div>
        {onFixWithAi ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size='icon-xs'
                variant='ghost'
                aria-label={isShiftHeld ? 'Fix in new chat' : 'Fix with AI'}
                className='shrink-0 text-muted-foreground hover:text-foreground'
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
      {issue.stackFrames && issue.stackFrames.length > 0 ? (
        <Collapsible>
          <CollapsibleContent>
            <StackTraceSection stackFrames={issue.stackFrames} />
          </CollapsibleContent>
          <CollapsibleTrigger className='group/trace flex items-center gap-1 rounded-sm text-[0.6875rem] text-muted-foreground hover:text-foreground focus-visible:focus-outline'>
            <ChevronRight className='size-3 transition-transform group-data-[state=open]/trace:-rotate-90' />
            Stack trace
          </CollapsibleTrigger>
        </Collapsible>
      ) : null}
    </li>
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
function getIssueCounts(issues: readonly KernelIssue[]): IssueCounts {
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

function summarize(counts: IssueCounts): string {
  return (['error', 'warning', 'info'] as const)
    .filter((severity) => counts[severity] > 0)
    .map((severity) =>
      severity === 'info' ? `${counts.info} info` : `${counts[severity]} ${severity}${counts[severity] > 1 ? 's' : ''}`,
    )
    .join(', ');
}

/** The closed form: "Build failed" when it did, then a glyph and count per severity. */
function IssueGlyphCounts({
  counts,
  isFailed,
}: {
  readonly counts: IssueCounts;
  readonly isFailed: boolean;
}): React.JSX.Element {
  return (
    <>
      {/* Between 420 and 520 px the bar's controls are glyphs too, and "Build failed" gives way to the counts. */}
      {isFailed ? (
        <span className='hidden text-foreground @max-[420px]/viewer:inline @min-[520px]/viewer:inline'>
          Build failed
        </span>
      ) : null}
      {(['error', 'warning', 'info'] as const)
        .filter((severity) => counts[severity] > 0)
        .map((severity) => {
          const { Icon, className } = severityGlyphs[severity];
          return (
            <span key={severity} className='flex items-center gap-0.5 tabular-nums'>
              <Icon aria-hidden='true' className={cn('size-3.5', className)} />
              {counts[severity]}
            </span>
          );
        })}
    </>
  );
}

/** A view problem the person resolves by a choice, such as a saved view this build no longer offers. */
export type ViewerNotice = Readonly<{ message: string; actionLabel: string; onAct: () => void }>;

const Hairline = (): React.JSX.Element => (
  <Separator orientation='vertical' className='mx-0 first:hidden data-[orientation=vertical]:h-4' />
);

type ViewerIssuesProps = Readonly<{
  /** Entry path being rendered in this viewer */
  entryPath: string;
  /** Shown first in the list, which opens for it: the view cannot show anything until it is resolved. */
  notice?: ViewerNotice;
  /**
   * Places the two parts in the viewer bar: `segment` (the failure and issue counts, which toggles the list) at
   * the start of its controls line, and `list` (the open issues) directly above that line.
   */
  children: (parts: Readonly<{ segment: React.ReactNode; list: React.ReactNode }>) => React.ReactNode;
}>;

/**
 * The viewer's issues, as part of its bar. Closed, a segment says that the build failed and how many errors, warnings
 * and notes it left (the running phase is the top pill, `ChatViewerStatus`); opening it unfolds the list above the controls, errors first, each with Fix with
 * AI, and Fix all when there are several. New issues never reopen a closed list; a view notice does.
 */
export function ViewerIssues({ entryPath, notice, children }: ViewerIssuesProps): React.ReactNode {
  const { getMainFilename, projectId, projectRef, setFocusedChatId } = useProject();
  const { setChatOpen } = useProjectWorkspace();
  const fileManager = useFileManager();
  const { createChat } = useChats(projectId, { enabled: false });
  // Closed by default; a notice present from the start opens it.
  const [isOpen, setIsOpen] = useState(notice !== undefined);
  const listId = useId();
  const segmentRef = useRef<HTMLButtonElement>(null);

  // CadProvider may retain the previous project's actor during a transition.
  const selectIsCadActorStale = useCallback(
    (snapshot: Parameters<typeof selectCadFailureIssues>[0]) => snapshot.context.parentRef !== projectRef,
    [projectRef],
  );
  const isCadActorStale = useCadSelector(selectIsCadActorStale, true);

  const failureIssues = useCadSelector(selectCadFailureIssues, undefined);
  const selectEntryIssues = useMemo(() => selectCadEntryIssues(entryPath), [entryPath]);
  const entryIssues = useCadSelector(selectEntryIssues, undefined);
  const errors = isCadActorStale ? undefined : (failureIssues ?? entryIssues);
  const isFailed = !isCadActorStale && failureIssues !== undefined && failureIssues.length > 0;
  const sorted = useMemo(
    () => [...(errors ?? [])].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    [errors],
  );

  // A notice is a decision the view waits on: it opens the list each time a new one arrives.
  const noticeMessage = notice?.message;
  const [seenNotice, setSeenNotice] = useState(noticeMessage);
  if (noticeMessage !== seenNotice) {
    setSeenNotice(noticeMessage);
    if (noticeMessage) {
      setIsOpen(true);
    }
  }

  // The chat-client composes the per-request `agent` payload (model, kernel,
  // mode, toolChoice, testingEnabled, snapshot, contextPayload) from the
  // current chat's active values. Fix-with-AI no longer stamps any of those
  // fields onto the user message — the regression-coverage test asserts the
  // captured wire body carries the full `agent` block via the chat-client.
  const cadChat = useCadChatClient();
  const { agent } = cadChat;

  const handleFixWithAi = useCallback(
    async (targets: readonly KernelIssue[], createNewChat: boolean) => {
      if (targets.length === 0) {
        return;
      }

      const filePath = await getMainFilename();
      const fileContent = await fileManager.readFile(filePath);
      const code = decodeTextFile(fileContent);

      const errorPrompt = formatErrorPrompt({
        errors: targets,
        filePath,
        code,
        kernel: agent.kernel,
      });

      setChatOpen(true);

      if (createNewChat) {
        // Persist the pending user message with an explicit one-shot startup
        // request so hydration can fire this intentional Fix-with-AI turn
        // without treating every pending user tail as command state.
        const message = buildUserMessage({ text: errorPrompt });
        const newChat = await createChat({
          name: 'New chat',
          messages: [message],
          startupRequest: {
            id: generatePrefixedId(idPrefix.request),
            kind: 'regenerate-tail',
            messageId: message.id,
            message,
            source: 'fix-with-ai-new-chat',
            createdAt: Date.now(),
          },
          activeExecution: agent.execution,
          activeKernel: agent.kernel,
        });
        setFocusedChatId(newChat.id);
      } else {
        void cadChat.submit({ text: errorPrompt });
      }
    },
    [getMainFilename, fileManager, agent.kernel, agent.execution, createChat, setFocusedChatId, cadChat, setChatOpen],
  );
  const { shift: isShiftHeld } = useModifiers();

  const total = sorted.length + (notice ? 1 : 0);
  const open = isOpen && total > 0;
  const close = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setIsOpen(false);
      segmentRef.current?.focus();
    }
  };

  const counts = getIssueCounts(sorted);
  if (notice) {
    counts.warning++;
  }

  const segment =
    total > 0 ? (
      <>
        <Hairline />
        <Button
          ref={segmentRef}
          variant='ghost'
          size='sm'
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`${isFailed ? 'Build failed. ' : ''}Issues: ${summarize(counts)}`}
          className='group/issues h-7 gap-1.5 px-2 text-xs has-[>svg]:px-2 aria-expanded:bg-accent/60 dark:aria-expanded:bg-accent/80'
          onClick={() => {
            setIsOpen(!open);
          }}
          onKeyDown={close}
        >
          <IssueGlyphCounts counts={counts} isFailed={isFailed} />
          <ChevronUp className='size-3 transition-transform group-aria-expanded/issues:rotate-180' />
        </Button>
      </>
    ) : null;

  const list = open ? (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape from anywhere in the list closes it
    <div
      id={listId}
      role='region'
      aria-label='Issues'
      className='flex w-full min-w-[min(30rem,calc(100cqw-1.75rem))] flex-col border-b pb-1'
      onKeyDown={close}
    >
      <ul className='max-h-[min(16rem,40svh)] divide-y overflow-y-auto'>
        {notice ? (
          <li role='alert' className='flex items-start gap-2 py-1.5 pr-1 pl-2 text-xs text-foreground'>
            <TriangleAlert aria-hidden='true' className='mt-0.5 size-3.5 shrink-0 text-warning' />
            <p className='min-w-0 flex-1'>{notice.message}</p>
            <Button size='xs' variant='outline' className='shrink-0' onClick={notice.onAct}>
              {notice.actionLabel}
            </Button>
          </li>
        ) : null}
        {sorted.map((issue) => (
          <IssueRow
            // Create a unique key from issue properties
            key={`${issue.message}-${issue.location?.startLineNumber ?? 'unknown'}-${issue.location?.startColumn ?? 'unknown'}`}
            issue={issue}
            onFixWithAi={async (createNewChat) => handleFixWithAi([issue], createNewChat)}
          />
        ))}
      </ul>
      {sorted.length > 1 ? (
        <div className='flex justify-end border-t px-1 pt-1'>
          <Button
            size='xs'
            variant='ghost'
            className='text-muted-foreground hover:text-foreground'
            onClick={() => {
              void handleFixWithAi(sorted, isShiftHeld);
            }}
          >
            <Sparkles />
            {isShiftHeld ? `Fix all ${sorted.length} in new chat` : `Fix all ${sorted.length} with AI`}
          </Button>
        </div>
      ) : null}
    </div>
  ) : null;

  return children({ segment, list });
}
