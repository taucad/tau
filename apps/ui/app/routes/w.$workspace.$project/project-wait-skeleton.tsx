import { Skeleton } from '@taucad/ui/components/skeleton';
import { useWaitClock } from '@taucad/ui/hooks/use-wait-clock';
import { cn } from '@taucad/ui/utils/cn';
import type { ModelAvailability } from '#hooks/use-project-availability.js';
import { useContext, useMemo } from 'react';
import { openWaitContext, useOpenWaitStart } from '#hooks/use-wait-start.js';

/**
 * The usual shape of a pane's content, drawn while it waits (Progressive Loading Policy rule 15; UI Policy § 5). Each is
 * generic: a fixed number of rows, never a count or names remembered from an earlier visit.
 *
 * - `transcript`: the chat feed, a request card and the lines of its reply, twice.
 * - `fields`: a search row and labelled controls, in the parameter form's row metrics.
 * - `tree`: indented rows, as a file or model tree draws them.
 * - `list`: rows of a title and a line under it.
 * - `code`: ragged lines of code.
 * - `tabs`: a dock's tab strip, two tabs at a tab's height and margins.
 */
export type ProjectWaitShape = 'transcript' | 'fields' | 'tree' | 'list' | 'code' | 'tabs';

/** A wait the pane is still on: neither a failed open nor a failed download of the model's files. */
const isRunning = (state: Exclude<ModelAvailability, 'ready'>): boolean =>
  state !== 'failed' && state !== 'offline' && state !== 'account' && state !== 'filesFailed';

function TranscriptShape(): React.JSX.Element {
  return (
    <div className='mx-auto flex w-[calc(100%_-_1rem)] max-w-xl flex-col gap-3 px-3 py-4'>
      {[3, 2].map((lines) => (
        <div key={lines} className='flex flex-col gap-3'>
          <Skeleton className='h-10 w-full rounded-lg' />
          <div className='flex flex-col'>
            {Array.from({ length: lines }, (_, line) => (
              <Skeleton
                // oxlint-disable-next-line react/no-array-index-key -- static decorative lines
                key={line}
                className={cn('my-1 h-3', line === lines - 1 ? 'w-2/3' : line === 0 ? 'w-full' : 'w-11/12')}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* The parameter form's rows (`rjsf-theme.tsx`: `my-1.5 flex flex-col gap-0.5 px-2.5`), label at 40%. */
const fieldRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'] as const;

function FieldsShape(): React.JSX.Element {
  return (
    <div className='flex flex-col py-1.5'>
      <div className='px-2.5 pb-1.5'>
        <Skeleton className='h-8 w-full' />
      </div>
      {fieldRows.map((row) => (
        <div key={row} className='my-1.5 flex flex-col gap-0.5 px-2.5'>
          <Skeleton className='my-1 h-3 w-2/5' />
          <Skeleton className='h-8 w-full' />
        </div>
      ))}
    </div>
  );
}

/* Indent depth and name width per row, as a tree of folders and files draws them. */
const treeRows = [
  [0, 'w-28'],
  [1, 'w-24'],
  [1, 'w-32'],
  [2, 'w-20'],
  [2, 'w-28'],
  [1, 'w-24'],
  [0, 'w-20'],
  [0, 'w-28'],
] as const;

function TreeShape(): React.JSX.Element {
  return (
    <div className='flex flex-col gap-1 px-2 py-2'>
      {treeRows.map(([depth, width], row) => (
        <div
          // oxlint-disable-next-line react/no-array-index-key -- static decorative rows
          key={row}
          className='flex h-6 items-center gap-2'
          style={{ paddingInlineStart: `${depth * 12}px` }}
        >
          <Skeleton className='size-4 shrink-0' />
          <Skeleton className={cn('h-3', width)} />
        </div>
      ))}
    </div>
  );
}

const listRows = ['row-1', 'row-2', 'row-3', 'row-4'] as const;

function ListShape(): React.JSX.Element {
  return (
    <div className='flex flex-col gap-2 p-3'>
      {listRows.map((row) => (
        <div key={row} className='flex flex-col gap-1.5 rounded-md border border-transparent px-2 py-1.5'>
          <Skeleton className='h-3.5 w-1/2' />
          <Skeleton className='h-3 w-3/4' />
        </div>
      ))}
    </div>
  );
}

/* Ragged code-shaped line lengths, as the code pane's own placeholder draws them. */
const codeLineWidths = ['42%', '68%', '55%', '30%', '0%', '61%', '74%', '48%', '36%', '0%', '58%', '44%'] as const;

function CodeShape(): React.JSX.Element {
  return (
    <div className='flex flex-col gap-2 py-1.5 pr-6 pl-16'>
      {codeLineWidths.map((width, line) => (
        <Skeleton
          // oxlint-disable-next-line react/no-array-index-key -- static decorative lines
          key={line}
          className={cn('h-3 shrink-0 rounded-sm', width === '0%' && 'invisible')}
          style={{ width }}
        />
      ))}
    </div>
  );
}

/* The dock's tab metrics (`dockview-theme.ts`: a 2.25rem strip, `0.25rem 0.125rem` tab margins). */
const tabWidths = ['w-28', 'w-20'] as const;

function TabsShape(): React.JSX.Element {
  return (
    <div className='flex h-9 items-center gap-1 px-0.5'>
      {tabWidths.map((width) => (
        <Skeleton key={width} className={cn('h-7 rounded-sm', width)} />
      ))}
    </div>
  );
}

const shapes = {
  transcript: TranscriptShape,
  fields: FieldsShape,
  tree: TreeShape,
  list: ListShape,
  code: CodeShape,
  tabs: TabsShape,
} as const satisfies Record<ProjectWaitShape, () => React.JSX.Element>;

type SkeletonDelayStyle = React.CSSProperties & Partial<Record<`--${string}`, string>>;

/**
 * A region's content shape while it waits (Progressive Loading Policy rules 15, 16 and 22): `Skeleton` bars in the
 * shape, revealed by CSS at the ladder's skeleton mark (300 ms) on the wait's clock, so a fast wait draws the frame
 * alone and a region that mounts part way through a wait draws its bars as soon as the wait's mark has passed. No
 * spinner, step, percentage or sentence. While the wait runs the wrapper carries `aria-busy` and the region's name; the
 * bars are hidden from assistive technology and nothing here is live. When the wait ends without content (a failure)
 * the bars stop and the body is empty.
 *
 * Every waiting body of the project route draws through this one primitive: the panes' project open
 * ({@link ProjectWaitSkeleton}), a pane's chunk, the workspace frame's lanes and the chat transcript.
 *
 * @param props - Whether the wait runs, when it started, its content's shape and the region's name.
 * @returns The region's waiting body.
 */
export function WaitSkeleton({
  isActive,
  startedAt,
  shape,
  label,
  className,
}: {
  /** Whether the wait runs: from its start until its content, or its failure, arrives. */
  readonly isActive: boolean;
  /** The wait's start on the wait clock; `0`, navigation start, by default. */
  readonly startedAt?: number;
  readonly shape: ProjectWaitShape;
  /** The region's name, such as "Parameters", which the waiting body carries for assistive technology. */
  readonly label: string;
  readonly className?: string;
}): React.JSX.Element {
  const { timing, wait } = useWaitClock({ active: isActive, startedAt });
  const Shape = shapes[shape];
  return (
    <div
      role='group'
      aria-label={label}
      aria-busy={isActive}
      data-slot='project-wait'
      data-state={isActive ? 'waiting' : 'failed'}
      className={cn('relative size-full min-h-0 overflow-hidden', className)}
    >
      {isActive && timing.state === 'waiting' ? (
        <div
          key={wait}
          aria-hidden='true'
          data-slot='project-wait-skeleton'
          className='wait-skeleton'
          style={{ '--wait-skeleton-delay': timing.skeletonDelay } satisfies SkeletonDelayStyle}
        >
          <Shape />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A pane's body while its code arrives: the content's shape on the project open's clock when the pane is part of the
 * open, or from its own start when a person opened it later (`useOpenWaitStart`).
 *
 * @param props - The pane's content shape and name.
 * @returns The pane's waiting body.
 */
export function PaneWaitSkeleton({
  shape,
  label,
}: {
  readonly shape: ProjectWaitShape;
  readonly label: string;
}): React.JSX.Element {
  const { startedAt } = useOpenWaitStart(true);
  return <WaitSkeleton isActive startedAt={startedAt} shape={shape} label={label} />;
}

/**
 * A pane's body while the project opens or the model's files arrive (Progressive Loading Policy rules 15, 17 and 21):
 * the pane keeps its frame and draws its content's shape ({@link WaitSkeleton}). The wait is the project open's, so a
 * pane that mounts during the open counts from the open's start. No spinner, step, percentage or sentence: the viewer
 * is the one region of the open that says it is running, and the route's announcement the one that says it aloud.
 *
 * When the wait fails the bars stop and the body is empty: the viewer says the failure, once, with its one action. In a
 * phone sheet at full that covers the viewer, the sheet's host says it over the body instead (`CoveringSheetFailure`).
 *
 * @param props - The pane's wait, its content's shape and its name.
 * @returns The pane's waiting body.
 */
export function ProjectWaitSkeleton({
  state,
  shape,
  label,
  className,
}: {
  readonly state: Exclude<ModelAvailability, 'ready'>;
  readonly shape: ProjectWaitShape;
  /** The pane's name, such as "Parameters", which the waiting body carries for assistive technology. */
  readonly label: string;
  readonly className?: string;
}): React.JSX.Element {
  const isWaiting = isRunning(state);
  const { startedAt } = useOpenWaitStart(isWaiting);
  return <WaitSkeleton isActive={isWaiting} startedAt={startedAt} shape={shape} label={label} className={className} />;
}

/**
 * Marks the open below revealed or not: a live layout wraps its panes in it, so a pane that mounts before the reveal
 * takes over the frame's bars on the open's clock, and one a person opens after it times its own wait.
 *
 * @param props - Whether the live workspace has replaced the frame's lanes, and the panes.
 * @returns The scoped panes.
 */
export function OpenWaitReveal({
  isRevealed,
  children,
}: {
  readonly isRevealed: boolean;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const open = useContext(openWaitContext);
  const value = useMemo(() => (open === undefined ? undefined : { ...open, isRevealed }), [open, isRevealed]);
  return <openWaitContext.Provider value={value}>{children}</openWaitContext.Provider>;
}
