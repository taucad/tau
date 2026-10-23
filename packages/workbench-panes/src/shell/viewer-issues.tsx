/**
 * The viewer's issues, drawn by both the Tau app and the agent plugin viewer as part of the viewer bar: a segment with
 * the build's failure and its issue counts, and the list it opens, each issue with its location, its stack trace and
 * the host's fix action. A host keeps where the issues come from and what its actions do.
 */
import { useId, useRef, useState } from 'react';
import { ChevronRight, ChevronUp, CircleX, Download, Info, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { useModifiers } from '@taucad/ui/components/keyboard';
import { Progress } from '@taucad/ui/components/progress';
import { Separator } from '@taucad/ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { formatKeyCombination } from '@taucad/ui/utils/keys';
import type { IssueSeverity, KernelIssue, KernelStackFrame } from '@taucad/runtime';

/**
 * A view problem the person resolves by a choice, such as a saved view this build no longer offers, or work the view
 * waits on, such as a kernel download. Without an action it only informs.
 *
 * @public
 */
export type ViewerNotice = Readonly<{
  message: string;
  /** The action's name; the notice offers no action without it and {@link ViewerNotice.onAct}. */
  actionLabel?: string | undefined;
  onAct?: (() => void) | undefined;
  /** Percent done of work the view waits on, such as a kernel download; shown as a bar under the message. */
  progress?: number | undefined;
}>;

/**
 * A place an issue or one of its stack frames names, which {@link ViewerIssuesProps.onOpenLocation} opens.
 *
 * @public
 */
export type ViewerIssueLocation = Readonly<{
  /** The file, as the issue names it. */
  fileName: string;
  lineNumber?: number | undefined;
  column?: number | undefined;
}>;

/**
 * What one issue action receives.
 *
 * @public
 */
export type ViewerIssueActionInput = Readonly<{ issues: readonly KernelIssue[] }>;

/**
 * Props for {@link ViewerIssues}.
 *
 * @public
 */
export type ViewerIssuesProps = Readonly<{
  /** Issues to list, in any order (the app removes those its notices replace, such as a kernel download in progress). */
  issues: readonly KernelIssue[] | undefined;
  /** The build failed; the segment says so. */
  isFailed: boolean;
  /** Shown first in the list, which opens for each new one: the view waits on them. */
  notices?: readonly ViewerNotice[] | undefined;
  /** Open a location. Absent, locations and frames show as text. */
  onOpenLocation?: ((location: ViewerIssueLocation) => void) | undefined;
  /** "Fix with AI" (desktop) or "Add to chat" (plugin, VUI-3), per issue and as "Fix all". Absent, no action. */
  onFix?: ((input: ViewerIssueActionInput) => Promise<void> | void) | undefined;
  /** The action while Shift is held, into a new chat. Absent, Shift changes nothing. */
  onFixInNewChat?: ((input: ViewerIssueActionInput) => Promise<void> | void) | undefined;
  /** The action's name; "Fix with AI" by default. */
  fixLabel?: string | undefined;
  /** Offered on a `KERNEL_NOT_PREPARED` issue as "Prepare". Absent, the issue shows as it is. */
  onPrepareKernel?: ((issue: KernelIssue) => void) | undefined;
  /** Draws an issue's message, such as through the host's Markdown renderer. Absent, plain text. */
  renderMessage?: ((message: string) => React.ReactNode) | undefined;
  /**
   * Places the two parts in the viewer bar: `segment` (the failure and the issue counts, which toggles the list) at
   * the start of its controls line, and `list` (the open issues) directly above that line.
   */
  children: (parts: Readonly<{ segment: React.ReactNode; list: React.ReactNode }>) => React.ReactNode;
}>;

/**
 * One issue as Markdown for a chat message: its message, its location and its stack. Fix with AI and Add to chat send
 * this text.
 *
 * @param issue - The issue.
 * @returns A Markdown list.
 * @public
 *
 * @example <caption>An issue with a location</caption>
 * ```typescript
 * import { formatViewerIssue } from '@taucad/workbench-panes/shell/viewer-issues';
 *
 * formatViewerIssue({
 *   message: 'Unexpected token',
 *   code: 'BUNDLER_FAILED',
 *   severity: 'error',
 *   location: { fileName: 'main.ts', startLineNumber: 3, startColumn: 7 },
 * }); // '- **Message:** Unexpected token\n- **Location:** Line 3, Column 7\n'
 * ```
 */
export function formatViewerIssue(issue: KernelIssue): string {
  const locationText = issue.location
    ? `Line ${issue.location.startLineNumber}, Column ${issue.location.startColumn}`
    : 'Unknown location';
  const stackTraceText = issue.stackFrames
    ?.map(
      (frame, index) =>
        `    ${index + 1}. ${frame.functionName ?? '<anonymous>'} (${frame.fileName ?? '<unknown>'}:${frame.lineNumber}:${frame.columnNumber})`,
    )
    .join('\n');

  return `- **Message:** ${issue.message}
- **Location:** ${locationText}
${stackTraceText ? `- **Stack Trace:**\n${stackTraceText}` : ''}`;
}

/**
 * The native kernel a `KERNEL_NOT_PREPARED` refusal names, and the size of its download: what a host prepares before
 * the model renders.
 *
 * @param issues - The shown model's issues.
 * @returns The first unprepared kernel, or `undefined`.
 * @public
 *
 * @example <caption>A refusal that names its kernel</caption>
 * ```typescript
 * import { unpreparedKernelOf } from '@taucad/workbench-panes/shell/viewer-issues';
 *
 * unpreparedKernelOf([
 *   { message: 'Not prepared', code: 'KERNEL_NOT_PREPARED', severity: 'error', details: { kernel: 'picogk' } },
 * ]); // { kernel: 'picogk', byteLength: undefined }
 * ```
 */
export const unpreparedKernelOf = (
  issues: readonly KernelIssue[] | undefined,
): Readonly<{ kernel: string; byteLength: number | undefined }> | undefined => {
  for (const issue of issues ?? []) {
    if (issue.code !== 'KERNEL_NOT_PREPARED' || typeof issue.details !== 'object' || issue.details === null) {
      continue;
    }
    const kernel: unknown = Reflect.get(issue.details, 'kernel');
    const byteLength: unknown = Reflect.get(issue.details, 'byteLength');
    if (typeof kernel === 'string' && kernel !== '') {
      return { kernel, byteLength: typeof byteLength === 'number' && byteLength > 0 ? byteLength : undefined };
    }
  }
  return undefined;
};

const shiftKey = formatKeyCombination({ key: 'Shift' });

/** Each severity's glyph: status colour lives in the glyph alone. */
const severityGlyphs = {
  error: { Icon: CircleX, className: 'text-destructive' },
  warning: { Icon: TriangleAlert, className: 'text-warning' },
  info: { Icon: Info, className: 'text-info' },
} as const satisfies Record<IssueSeverity, unknown>;

const severityRank: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

/** A location as plain text, or a link that opens it when the host can. */
function Location({
  onOpen,
  location,
  className,
  children,
}: Readonly<{
  onOpen: ViewerIssuesProps['onOpenLocation'];
  location: ViewerIssueLocation | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}>): React.ReactNode {
  if (onOpen === undefined || location === undefined) {
    return <span className={className}>{children}</span>;
  }
  const open = (event: React.SyntheticEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    onOpen(location);
  };
  /* A span with button semantics, as the app's file link: it truncates inside the inline text, a button cannot. */
  return (
    <span
      role='button'
      tabIndex={0}
      className={cn(
        'inline cursor-action decoration-current underline-offset-2 hover:text-foreground hover:underline',
        className,
      )}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          open(event);
        }
      }}
    >
      {children}
    </span>
  );
}

function StackFrame({
  frame,
  index,
  onOpenLocation,
}: Readonly<{
  frame: KernelStackFrame;
  index: number;
  onOpenLocation: ViewerIssuesProps['onOpenLocation'];
}>): React.JSX.Element {
  const fileName = frame.fileName ?? '<unknown>';

  return (
    <div className='flex min-w-0 items-center gap-2 font-mono text-[0.625rem]'>
      <span className='w-3 shrink-0 text-right text-muted-foreground'>{index + 1}</span>
      <span className='shrink-0 text-muted-foreground'>|</span>
      <span className='shrink-0 text-foreground'>{frame.functionName ?? '<anonymous>'}</span>
      <Location
        onOpen={onOpenLocation}
        location={
          frame.fileName === undefined
            ? undefined
            : { fileName: frame.fileName, lineNumber: frame.lineNumber, column: frame.columnNumber }
        }
        className='flex min-w-0'
      >
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
      </Location>
    </div>
  );
}

function StackTraceSection({
  stackFrames,
  onOpenLocation,
}: Readonly<{
  stackFrames: readonly KernelStackFrame[];
  onOpenLocation: ViewerIssuesProps['onOpenLocation'];
}>): React.JSX.Element {
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
          onOpenLocation={onOpenLocation}
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

const basenameOf = (path: string): string => path.split('/').pop() ?? path;

function formatLocation(fileName?: string, lineNumber?: number, column?: number): string {
  if (!fileName) {
    return '';
  }
  const basename = basenameOf(fileName);
  if (lineNumber === undefined) {
    return basename;
  }
  if (column === undefined) {
    return `${basename}:${lineNumber}`;
  }
  return `${basename}:${lineNumber}:${column}`;
}

/**
 * One issue in the bar's issues row: its severity glyph, the message with its location, and the host's action. The
 * stack trace is a closed second level whose trigger sits below it: the bar grows upward, so the trigger stays put.
 */
function IssueRow({
  issue,
  label,
  hasNewChat,
  onAct,
  onPrepare,
  onOpenLocation,
  renderMessage,
}: Readonly<{
  issue: KernelIssue;
  /** The action's name while Shift is up or held. */
  label: string;
  /** Whether Shift starts a new chat, which the tooltip then says. */
  hasNewChat: boolean;
  onAct: (() => void) | undefined;
  /** Prepares the kernel a `KERNEL_NOT_PREPARED` issue names. */
  onPrepare: (() => void) | undefined;
  onOpenLocation: ViewerIssuesProps['onOpenLocation'];
  renderMessage: ViewerIssuesProps['renderMessage'];
}>): React.JSX.Element {
  const fileName = issue.location?.fileName;
  const startLineNumber = issue.location?.startLineNumber;
  const startColumn = issue.location?.startColumn;
  const locationText = formatLocation(fileName, startLineNumber, startColumn);
  const { Icon, className } = severityGlyphs[issue.severity];

  return (
    <li className='flex flex-col gap-1 py-1.5 pr-1 pl-2 text-xs'>
      <div className='flex items-start gap-2'>
        <Icon aria-label={issue.severity} className={cn('mt-0.5 size-3.5 shrink-0', className)} />
        <div className='flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-foreground'>
          {renderMessage === undefined ? <span>{issue.message}</span> : renderMessage(issue.message)}
          {locationText ? (
            <span className='font-mono text-muted-foreground' title={fileName}>
              <Location
                onOpen={onOpenLocation}
                location={
                  fileName === undefined || startLineNumber === undefined
                    ? undefined
                    : { fileName, lineNumber: startLineNumber, column: startColumn }
                }
                className='hover:text-foreground'
              >
                {locationText}
              </Location>
            </span>
          ) : null}
        </div>
        {onPrepare === undefined ? null : (
          <Button size='xs' variant='outline' className='shrink-0' onClick={onPrepare}>
            Prepare
          </Button>
        )}
        {onAct === undefined ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size='icon-xs'
                variant='ghost'
                aria-label={label}
                className='shrink-0 text-muted-foreground hover:text-foreground'
                onClick={onAct}
              >
                <Sparkles className='size-3' />
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top' className='flex flex-col gap-1'>
              <span>{label}</span>
              {hasNewChat ? (
                <span className='flex items-center gap-1 text-xs opacity-70'>
                  <KeyShortcut variant='tooltip'>{shiftKey}</KeyShortcut> for new chat
                </span>
              ) : null}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {issue.stackFrames && issue.stackFrames.length > 0 ? (
        <Collapsible>
          <CollapsibleContent>
            <StackTraceSection stackFrames={issue.stackFrames} onOpenLocation={onOpenLocation} />
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

type IssueCounts = Record<IssueSeverity, number>;

function getIssueCounts(issues: readonly KernelIssue[]): IssueCounts {
  const counts: IssueCounts = { error: 0, warning: 0, info: 0 };
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
}: Readonly<{ counts: IssueCounts; isFailed: boolean }>): React.JSX.Element {
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

const Hairline = (): React.JSX.Element => (
  <Separator orientation='vertical' className='mx-0 first:hidden data-[orientation=vertical]:h-4' />
);

/**
 * The viewer's issues, as part of its bar. Closed, a segment says that the build failed and how many errors, warnings
 * and notes it left; opening it unfolds the list above the controls, notices first, then errors, warnings and notes,
 * each with the host's action, and the action on all of them when there are several. New issues never reopen a closed
 * list; a new notice does. Render it inside the host's `KeyboardProvider` and `TooltipProvider`.
 *
 * @param props - The issues, the notices, the host's actions and message renderer, and where the two parts go.
 * @returns What `children` places.
 * @public
 *
 * @example <caption>The issues in the shared viewer bar</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ViewerControls } from '@taucad/viewer/cad/viewer-controls';
 * import { ViewerIssues } from '@taucad/workbench-panes/shell/viewer-issues';
 *
 * export const bar = createElement(ViewerIssues, {
 *   issues: [{ message: 'Unexpected token', code: 'BUNDLER_FAILED', severity: 'error' }],
 *   isFailed: true,
 *   children: ({ segment, list }) => createElement(ViewerControls, { leading: segment, aboveControls: list }),
 * });
 * ```
 */
export function ViewerIssues({
  issues,
  isFailed,
  notices = [],
  onOpenLocation,
  onFix,
  onFixInNewChat,
  fixLabel,
  onPrepareKernel,
  renderMessage,
  children,
}: ViewerIssuesProps): React.ReactNode {
  // Closed by default; a notice present from the start opens it.
  const [isOpen, setIsOpen] = useState(notices.length > 0);
  const listId = useId();
  const segmentRef = useRef<HTMLButtonElement>(null);
  const sorted = [...(issues ?? [])].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  // A notice is a decision the view waits on: it opens the list each time a new one arrives.
  const noticeMessage = notices.length === 0 ? undefined : notices.map((shown) => shown.message).join('\n');
  const [seenNotice, setSeenNotice] = useState(noticeMessage);
  if (noticeMessage !== seenNotice) {
    setSeenNotice(noticeMessage);
    if (noticeMessage) {
      setIsOpen(true);
    }
  }

  const { shift: isShiftHeld } = useModifiers();
  const fix = isShiftHeld && onFixInNewChat !== undefined ? onFixInNewChat : onFix;
  const isNewChat = fix !== undefined && fix === onFixInNewChat;
  /* Desktop's names stay as they were; a host's own label names the one action and counts the rest. */
  const label = isNewChat ? 'Fix in new chat' : (fixLabel ?? 'Fix with AI');
  const allLabel = (count: number): string =>
    isNewChat
      ? `Fix all ${count} in new chat`
      : fixLabel === undefined
        ? `Fix all ${count} with AI`
        : `${fixLabel} (${count})`;
  const act = (targets: readonly KernelIssue[]): void => {
    void fix?.({ issues: targets });
  };

  const total = sorted.length + notices.length;
  const open = isOpen && total > 0;
  const close = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setIsOpen(false);
      segmentRef.current?.focus();
    }
  };

  const counts = getIssueCounts(sorted);
  for (const shown of notices) {
    counts[shown.progress === undefined ? 'warning' : 'info']++;
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
        {notices.map((shown) => (
          <li
            key={shown.message}
            role={shown.progress === undefined ? 'alert' : 'status'}
            className='flex items-start gap-2 py-1.5 pr-1 pl-2 text-xs text-foreground'
          >
            {shown.progress === undefined ? (
              <TriangleAlert aria-hidden='true' className='mt-0.5 size-3.5 shrink-0 text-warning' />
            ) : (
              <Download aria-hidden='true' className='mt-0.5 size-3.5 shrink-0 text-muted-foreground' />
            )}
            <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
              <p>{shown.message}</p>
              {shown.progress === undefined ? null : (
                <Progress aria-label='Download progress' value={shown.progress} className='h-1' />
              )}
            </div>
            {shown.actionLabel === undefined || shown.onAct === undefined ? null : (
              <Button size='xs' variant='outline' className='shrink-0' onClick={shown.onAct}>
                {shown.actionLabel}
              </Button>
            )}
          </li>
        ))}
        {sorted.map((issue) => (
          <IssueRow
            key={`${issue.message}-${issue.location?.startLineNumber ?? 'unknown'}-${issue.location?.startColumn ?? 'unknown'}`}
            issue={issue}
            label={label}
            hasNewChat={onFixInNewChat !== undefined}
            onAct={
              fix === undefined
                ? undefined
                : () => {
                    act([issue]);
                  }
            }
            onPrepare={
              onPrepareKernel === undefined || issue.code !== 'KERNEL_NOT_PREPARED'
                ? undefined
                : () => {
                    onPrepareKernel(issue);
                  }
            }
            onOpenLocation={onOpenLocation}
            renderMessage={renderMessage}
          />
        ))}
      </ul>
      {sorted.length > 1 && fix !== undefined ? (
        <div className='flex justify-end border-t px-1 pt-1'>
          <Button
            size='xs'
            variant='ghost'
            className='text-muted-foreground hover:text-foreground'
            onClick={() => {
              act(sorted);
            }}
          >
            <Sparkles />
            {allLabel(sorted.length)}
          </Button>
        </div>
      ) : null}
    </div>
  ) : null;

  return children({ segment, list });
}
