import { useState } from 'react';
import type { LargeObjectsFacet } from '@taucad/revisions';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import type { WaitIndicatorProps } from '@taucad/ui/components/wait-indicator';
import { useWaitClock } from '@taucad/ui/hooks/use-wait-clock';
import { cn } from '@taucad/ui/utils/cn';
import type { ViewerStageStatus } from '@taucad/workbench-panes/shell/viewer-stage';
import { useFileCheckSlow, useLargeObjects } from '#hooks/use-project-availability.js';
import type { ModelAvailability } from '#hooks/use-project-availability.js';
import { useRevisionStatus } from '#hooks/use-revision-status.js';
import { projectFilesCopy, projectOpenCopy } from '#lib/project-open-copy.js';
import {
  isModelFilesWait,
  isProjectFilesFailure,
  largeObjectsProgressText,
  ModelFilesRetry,
  modelFilesFailure,
  ProjectFilesAction,
  useIsOpenBoundWait,
  useProjectOpenRetry,
  useStageWaitStart,
} from '#routes/w.$workspace.$project/project-sync-placeholder.js';

/**
 * Everything the viewer's stage can wait on or fail at before it draws the model: the project's own open on this device
 * (opening, downloading, preparing, or offline, failed or signed out) and the model's own files (a check, a download or
 * its failure). The stage stays mounted through all of them and says each in its status slot.
 */
export type ViewerWait = Exclude<ModelAvailability, 'ready'>;

/** The waits that are running, which the stage's pill says. */
type RunningViewerWait = Extract<ViewerWait, 'connecting' | 'downloading' | 'preparing' | 'filesChecking' | 'files'>;

/**
 * Whether the stage is waiting for something that is still on its way, rather than for a person to act on a failure.
 *
 * @param wait - The stage's wait, if any.
 * @returns `true` while the pill says what is running.
 */
export const isRunningViewerWait = (wait: ViewerWait | undefined): wait is RunningViewerWait =>
  wait === 'connecting' ||
  wait === 'downloading' ||
  wait === 'preparing' ||
  wait === 'filesChecking' ||
  wait === 'files';

/**
 * Whether a wait is a step of the project's own open, rather than a wait for the model's files.
 *
 * @param wait - The running wait.
 * @returns `true` while connecting, downloading or preparing.
 */
const isProjectOpenStep = (wait: RunningViewerWait): boolean =>
  wait === 'connecting' || wait === 'downloading' || wait === 'preparing';

/** A download's numbers, as the pill and its detail line read them. */
type Measured = Readonly<{ fraction: number | undefined; numbers: string | undefined; key: string }>;

/**
 * A download's progress, from the large-object facet: the fraction the pill shows, the numbers the detail line shows,
 * and a key that changes whenever the download moves on, which restarts the slow mark.
 *
 * @param wait - The wait the pill shows.
 * @param facet - The large-object download, when one runs.
 * @returns The download's measure; no fraction or numbers for a wait that is no download or has no known size.
 */
function measure(wait: RunningViewerWait, facet: LargeObjectsFacet | undefined): Measured {
  const isDownload = wait === 'files' || wait === 'downloading';
  if (!isDownload || facet === undefined || facet.totalBytes <= 0) {
    return { fraction: undefined, numbers: undefined, key: wait };
  }
  return {
    fraction: Math.min(1, facet.bytes / facet.totalBytes),
    numbers: largeObjectsProgressText(facet),
    key: `${wait}:${facet.objects}:${facet.bytes}`,
  };
}

/** What the pill has shown of one wait's percentage, so it never shows less under its one label (rule 18). */
type ShownPercent = Readonly<{
  /** The wait it belongs to, as `useWaitClock` counts them. */
  wait: number;
  /** The transfer the percentage measures: its totals. */
  transfer: string | undefined;
  /** The highest fraction shown. */
  fraction: number;
  /** A transfer began again with its own count: the percentage is gone for the rest of the wait. */
  isDropped: boolean;
}>;

/**
 * The percentage the pill may show: the download's own while it only moves forward. A transfer that starts a count of
 * its own under the same label (a fill begun again over what is left, or the model's files after the project's) would
 * go back; the pill then drops its percentage for the rest of the wait and keeps the label and the detail line's
 * numbers. Kept with React's "information from previous renders" pattern; no effect runs.
 *
 * @param wait - The pill's wait count.
 * @param facet - The large-object download, when one runs.
 * @param fraction - The download's fraction, when known.
 * @returns The fraction to show, or `undefined`.
 */
function useForwardPercent(
  wait: number,
  facet: LargeObjectsFacet | undefined,
  fraction: number | undefined,
): number | undefined {
  const transfer = facet === undefined ? undefined : `${facet.totalObjects}:${facet.totalBytes}`;
  const [shown, setShown] = useState<ShownPercent>({ wait, transfer, fraction: fraction ?? 0, isDropped: false });
  const next = nextShownPercent(shown, { wait, transfer, fraction });
  if (next !== shown) {
    setShown(next);
  }
  return next.isDropped ? undefined : fraction;
}

/**
 * The percentage's record after one more render.
 *
 * @param shown - The record so far.
 * @param now - The pill's wait count, the transfer's totals and its fraction now.
 * @returns The same record when nothing changed, so a render with no news sets no state.
 */
function nextShownPercent(
  shown: ShownPercent,
  now: Readonly<{ wait: number; transfer: string | undefined; fraction: number | undefined }>,
): ShownPercent {
  const { wait, transfer, fraction } = now;
  if (shown.wait !== wait) {
    return { wait, transfer, fraction: fraction ?? 0, isDropped: false };
  }
  if (fraction === undefined || shown.isDropped) {
    return shown;
  }
  const isNewTransfer = shown.transfer !== undefined && transfer !== shown.transfer;
  if (isNewTransfer || fraction < shown.fraction) {
    return { ...shown, isDropped: true };
  }
  return transfer === shown.transfer && fraction === shown.fraction ? shown : { ...shown, transfer, fraction };
}

/**
 * The pill's words for a wait: the open's one label for every step of a project open, and for a wait for the model's
 * files that the open bore; the model's own words for a wait for its files that began after the open.
 *
 * @param wait - The wait the pill shows.
 * @param isOpen - Whether the pill's wait is the project's open.
 * @param isSlowCheck - Whether the session reports the file check slow.
 * @returns The label, which the pill ends with an ellipsis.
 */
function pillLabel(wait: RunningViewerWait, isOpen: boolean, isSlowCheck: boolean): string {
  if (isOpen) {
    return isSlowCheck ? projectOpenCopy.slowLabel : projectOpenCopy.label;
  }
  if (wait === 'files') {
    return 'Downloading model files';
  }
  return isSlowCheck ? 'Still checking model files' : 'Checking model files';
}

type WaitDelayStyle = React.CSSProperties & Partial<Record<`--${string}`, string>>;

/**
 * The detail line's row, always laid out and hanging below the pill, so its words arriving or changing move nothing. A
 * download's numbers are laid out from the wait's start and shown by CSS at the ladder's detail mark (3 s); a step with
 * no numbers leaves the row empty. Once a download has made no progress for the slow mark, its numbers give way to what
 * to do. New waits and each progress get new elements, so the animations restart from their delays.
 *
 * @param props - The pill's timing and counts, the numbers, and whether the wait can be slow.
 * @returns The detail row.
 */
function ViewerWaitCaption({
  timing,
  wait,
  stall,
  numbers,
  isStallable,
}: {
  readonly timing: ReturnType<typeof useWaitClock>['timing'];
  readonly wait: number;
  readonly stall: number;
  readonly numbers: string | undefined;
  readonly isStallable: boolean;
}): React.JSX.Element {
  const isWaiting = timing.state === 'waiting';
  const slowStyle: WaitDelayStyle | undefined = isWaiting ? { '--wait-slow-delay': timing.slowDelay } : undefined;
  return (
    <p
      data-slot='viewer-wait-caption'
      className='absolute top-full left-1/2 mt-1.5 grid h-4 w-72 max-w-[calc(100cqw-1rem)] -translate-x-1/2 text-center text-xs text-muted-foreground tabular-nums *:min-w-0 *:truncate *:[grid-area:1/1]'
    >
      {/* Mounted for the whole wait, numbers or none, so its reveal counts from the wait's start, not a later step's. */}
      {isWaiting ? (
        <span
          key={`detail-${wait}`}
          data-slot='viewer-wait-caption-text'
          className='wait-detail'
          style={{ '--wait-detail-delay': timing.detailDelay } satisfies WaitDelayStyle}
        >
          {numbers === undefined ? null : (
            <span
              key={`numbers-${stall}`}
              className={isStallable ? 'wait-until-slow' : undefined}
              style={isStallable ? slowStyle : undefined}
            >
              {numbers}
            </span>
          )}
        </span>
      ) : null}
      {isWaiting && isStallable ? (
        <span
          key={`slow-${wait}-${stall}`}
          data-slot='viewer-wait-caption-slow'
          className='wait-after-slow'
          style={slowStyle}
        >
          {projectOpenCopy.slowHelper}
        </span>
      ) : null}
    </p>
  );
}

/**
 * Whether the pill's current wait is the project's open, from the step it began at: a project open step, or a wait for
 * the model's files that the open itself waited for. A wait for the model's files that begins after the open is the
 * model's own. Kept with React's "information from previous renders" pattern; no effect runs.
 *
 * @param wait - The running wait, if any.
 * @returns Whether the pill says the open's one label.
 */
function useIsOpenPill(wait: RunningViewerWait | undefined): boolean {
  const isOpenBound = useIsOpenBoundWait();
  const opensNow = wait !== undefined && (isProjectOpenStep(wait) || isOpenBound);
  const [tracked, setTracked] = useState({ isActive: wait !== undefined, isOpen: opensNow });
  let current = tracked;
  if (tracked.isActive !== (wait !== undefined)) {
    current = { isActive: wait !== undefined, isOpen: wait === undefined ? tracked.isOpen : opensNow };
  } else if (wait !== undefined && opensNow && !tracked.isOpen) {
    current = { ...tracked, isOpen: true };
  }
  if (current !== tracked) {
    setTracked(current);
  }
  return current.isOpen;
}

/** What the viewer's wait shows, wherever it is drawn: the stage's pill, or a covering sheet's header slot. */
type ViewerWaitModel = Readonly<{
  /** Whether a wait is running now. */
  isActive: boolean;
  /** Whether a wait has run, so the indicator is mounted: it keeps its slot, and its hold, after the wait. */
  hasWaited: boolean;
  /** The project's download is running: the one step whose stall Try again can restart. */
  isStallable: boolean;
  /** The session reports the open's file check slow. */
  isSlowCheck: boolean;
  /** The wait's timing and counts, which the detail line keys its marks on. */
  clock: ReturnType<typeof useWaitClock>;
  /** The download's numbers while the wait runs. */
  numbers: string | undefined;
  /** The indicator's props: its words, its start, its percentage and its stall. */
  indicator: Omit<WaitIndicatorProps, 'variant' | 'live' | 'className'>;
}>;

/**
 * The viewer's wait as its indicator says it (Progressive Loading Policy rules 16 to 19): one clock from the stage's
 * first wait to its last, one label for the project's open, a percentage that only moves forward, and slow words with
 * "Try again" only once the project's download has made no progress for 10 s. Every mark is a CSS delay read when the
 * wait starts, ends or moves on; no timer runs.
 *
 * @param wait - The viewer's wait, `undefined` once there is none.
 * @returns What the indicator and its detail line show.
 */
function useViewerWaitModel(wait: ViewerWait | undefined): ViewerWaitModel {
  const isSlowCheck = useFileCheckSlow() && wait === 'filesChecking';
  const facet = useLargeObjects();
  const retryOpen = useProjectOpenRetry();
  const isActive = isRunningViewerWait(wait);
  /* A project open starts its wait on the stage; only a wait for the model's files can be one the open already bore. */
  const startedAt = useStageWaitStart(isActive, wait === undefined || isModelFilesWait(wait));
  /* A shown indicator keeps its words while it holds its minimum after the wait. */
  const [heldWait, setHeldWait] = useState<RunningViewerWait | undefined>(isActive ? wait : undefined);
  if (isActive && wait !== heldWait) {
    setHeldWait(wait);
  }
  const shownWait = isActive ? wait : heldWait;
  const isOpen = useIsOpenPill(isActive ? wait : undefined);
  const measured = isActive ? measure(wait, facet) : undefined;
  const isStallable = isActive && wait === 'downloading';
  /* The same timing the indicator reads: pure, from the wait's start, end and progress. */
  const clock = useWaitClock({ active: isActive, startedAt, progress: measured?.key });
  const percent = useForwardPercent(clock.wait, facet, measured?.fraction);
  return {
    isActive,
    hasWaited: shownWait !== undefined,
    isStallable,
    isSlowCheck,
    clock,
    numbers: measured?.numbers,
    indicator: {
      active: isActive,
      startedAt,
      label: shownWait === undefined ? projectOpenCopy.label : pillLabel(shownWait, isOpen, isSlowCheck),
      slowLabel: isStallable ? projectOpenCopy.slowLabel : undefined,
      onRetry: isStallable ? retryOpen : undefined,
      progress: percent,
      progressKey: measured?.key,
    },
  };
}

/**
 * The viewer stage's status while it waits before drawing the model (Progressive Loading Policy rules 15 to 22): one
 * pill, the shipped viewer pill skin, from 1,000 ms, that says one label for the whole project open ("Opening project")
 * and the model's own words for a wait for its files that began after it. The pill is timed from the stage's first wait
 * to its last, so a later step never changes its words or its place.
 *
 * The pill shows a download's percentage while it is measurable and only moves forward. Under it one muted detail line
 * is always laid out, hanging below it so the pill never moves: from 3,000 ms it gives a download's numbers, and nothing
 * for a step without them. Once the project's download has made no progress for 10,000 ms the pill reads "Still opening
 * project" with "Try again", and the detail line says what to do; every progress restarts that mark, so a download that
 * moves is never called slow. A file check the session reports slow reads its slow words with "Try again" (T5, A14). A
 * failure drops the pill at once: the stage's failure card says it ({@link useViewerWaitFailure}).
 *
 * Every mark is a CSS animation delay from `utils/wait-timing`, computed when the wait starts or moves on, so no timer
 * runs and a remount part way through keeps the wait's clock. The words, and "Try again", are laid out from the start
 * and stay hidden, out of focus and the accessibility tree, until their mark.
 *
 * The open's route announcement speaks for the wait, so neither the pill nor the detail line is live. The stage's
 * other status (`children`, the build status) shares the pill's cell and stays mounted: it gives way from the frame the
 * pill reveals in and while the pill holds, on the same CSS delays, so a wait too short to show the pill never hides it.
 *
 * @param props - The stage's wait, `undefined` once there is none, and the status it shares a cell with.
 * @returns The status slot's wait content.
 */
export function ViewerWaitStatus({
  wait,
  children,
}: {
  readonly wait: ViewerWait | undefined;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const { isActive, hasWaited, isStallable, isSlowCheck, clock, numbers, indicator } = useViewerWaitModel(wait);
  const { timing } = clock;
  /* The pill mounts with the stage's first running wait and stays for its hold; a failure drops it at once. */
  const isPillShown = hasWaited && (wait === undefined || isActive);
  const concealStyle: WaitDelayStyle | undefined =
    timing.state === 'waiting' ? { '--wait-slow-delay': timing.revealDelay } : undefined;
  return (
    <div className='relative'>
      <div className='group/viewer-wait grid justify-items-center *:[grid-area:1/1]'>
        <div data-slot='viewer-wait-status' className='flex items-center justify-center gap-1.5'>
          {isPillShown ? <WaitIndicator {...indicator} variant='pill' live={false} /> : null}
          {isSlowCheck ? <ModelFilesRetry /> : null}
        </div>
        {children === undefined ? null : (
          /* `wait-until-slow` conceals at its delay, set here to the pill's reveal. */
          <div
            className={cn(
              'group-has-[[data-slot=wait-indicator][data-state=holding]]/viewer-wait:invisible',
              concealStyle === undefined ? undefined : 'wait-until-slow',
            )}
            style={concealStyle}
          >
            {children}
          </div>
        )}
      </div>
      <ViewerWaitCaption
        timing={timing}
        wait={clock.wait}
        stall={clock.stall}
        numbers={isActive ? numbers : undefined}
        isStallable={isStallable}
      />
    </div>
  );
}

/**
 * The viewer's status where a phone sheet at full covers the viewer (rule 17): the same words in the sheet header's
 * trailing slot, in the indicator's inline skin, so the status moves instead of being shown twice. The covered viewer
 * is inert. Running waits only, with the stalled download's slow words and its one "Try again"; a failure is the
 * covering sheet's body notice (`CoveringSheetNotice`).
 *
 * @param props - The viewer's wait, `undefined` once there is none.
 * @returns The header slot's indicator.
 */
export function ViewerWaitInline({ wait }: { readonly wait: ViewerWait | undefined }): React.JSX.Element {
  const { indicator } = useViewerWaitModel(wait);
  return <WaitIndicator {...indicator} variant='inline' live={false} />;
}

/**
 * The stage's failure for a wait that cannot go on by itself: a project open that is offline, failed or needs a
 * sign-in, with the open's words and action, or a download of the model's files that did not finish. The route's
 * announcement already says a failed open, so that failure is a labelled group, not a second alert (rule 22); a failed
 * download of the model's files is said by the stage alone.
 *
 * @param wait - The stage's wait, if any.
 * @returns The failed status, or `undefined` while nothing failed.
 */
export function useViewerWaitFailure(wait: ViewerWait | undefined): ViewerStageStatus | undefined {
  const status = useRevisionStatus();
  if (wait === 'filesFailed') {
    return modelFilesFailure;
  }
  if (wait === undefined || !isProjectFilesFailure(wait)) {
    return undefined;
  }
  const [summary, message] = projectFilesCopy(wait, status);
  return { kind: 'failed', summary, message, action: <ProjectFilesAction state={wait} />, live: false };
}
