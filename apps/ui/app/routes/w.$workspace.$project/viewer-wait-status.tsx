import { useState } from 'react';
import type { LargeObjectsFacet } from '@taucad/revisions';
import { Button } from '@taucad/ui/components/button';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { useWaitClock } from '@taucad/ui/hooks/use-wait-clock';
import { slowWaitMilliseconds } from '@taucad/ui/utils/wait-timing';
import type { WaitIndicatorTiming } from '@taucad/ui/utils/wait-timing';
import { cn } from '@taucad/ui/utils/cn';
import type { ViewerStageStatus } from '@taucad/workbench-panes/shell/viewer-stage';
import { useFileCheckSlow, useLargeObjects } from '#hooks/use-project-availability.js';
import type { ModelAvailability } from '#hooks/use-project-availability.js';
import { useRevisionStatus } from '#hooks/use-revision-status.js';
import {
  isModelFilesWait,
  isProjectFilesFailure,
  largeObjectsProgressText,
  ModelFilesRetry,
  modelFilesFailure,
  ProjectFilesAction,
  projectFilesCopy,
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
 * How long a project open runs before the caption under the pill says more (cloud open loading states, option C): a
 * fast open shows the pill alone. Milliseconds from the stage's wait start.
 */
export const captionDelayMilliseconds = 3000;

/** The pill's words for a project open: the project status control's (`projectSyncIndicator`), without the ellipsis. */
const projectWaitLabels = {
  connecting: 'Opening project',
  downloading: 'Downloading files',
  preparing: 'Preparing files',
} as const;

/** What the caption says once a download has run past the slow mark. */
const slowDownloadCaption = 'Check your connection, then try again.';

type WaitDelayStyle = React.CSSProperties & Partial<Record<`--${string}`, string>>;

/**
 * A running wait's slow delay, as the timing the indicator reads gives it: measured from when the timing was applied,
 * negative for a wait already under way, so a remount part way through keeps the wait's own clock.
 *
 * @param timing - The wait's timing.
 * @returns The CSS delay to the slow mark, or `undefined` while no wait runs.
 */
function slowDelayOf(timing: WaitIndicatorTiming): string | undefined {
  return timing.state === 'waiting' ? timing.slowDelay : undefined;
}

/**
 * The caption's delay: the open's slow delay brought forward to the caption mark, so it rides the pill's clock.
 *
 * @param slowDelay - The open's slow delay.
 * @returns The CSS delay to the caption mark.
 */
function captionDelay(slowDelay: string): string {
  return `calc(${slowDelay} - ${slowWaitMilliseconds - captionDelayMilliseconds}ms)`;
}

/**
 * The pill's words for a wait.
 *
 * @param wait - The wait the pill shows.
 * @param isSlowCheck - Whether the session reports the file check slow.
 * @returns The label, which the pill ends with an ellipsis.
 */
function pillLabel(wait: RunningViewerWait, isSlowCheck: boolean): string {
  if (wait === 'files') {
    return 'Downloading model files';
  }
  if (wait === 'filesChecking') {
    return isSlowCheck ? 'Still checking model files' : 'Checking model files';
  }
  return projectWaitLabels[wait];
}

/**
 * The caption under the pill: a download's real numbers or the preparing sentence. An opening project has none: the
 * pill already says it. What to do once a download is slow is swapped in by CSS at the download's slow mark.
 *
 * @param wait - The running wait.
 * @param facet - The large-object download, when one runs.
 * @returns The caption, or `undefined` for none.
 */
function captionFor(wait: RunningViewerWait, facet: LargeObjectsFacet | undefined): string | undefined {
  if (wait === 'downloading' || wait === 'files') {
    return facet === undefined
      ? wait === 'downloading'
        ? 'Bringing this project to this device.'
        : undefined
      : largeObjectsProgressText(facet);
  }
  if (wait === 'preparing') {
    return 'Getting your files ready to open.';
  }
  return undefined;
}

/**
 * How far a download the pill says is, from the large-object facet.
 *
 * @param wait - The wait the pill shows.
 * @param facet - The large-object download, when one runs.
 * @returns From 0 to 1, or `undefined` for a wait that is no download or a download of unknown size.
 */
function downloadProgress(wait: RunningViewerWait, facet: LargeObjectsFacet | undefined): number | undefined {
  const isDownload = wait === 'files' || wait === 'downloading';
  return isDownload && facet !== undefined && facet.totalBytes > 0
    ? Math.min(1, facet.bytes / facet.totalBytes)
    : undefined;
}

/**
 * Moves the pill's own slow swap (`wait-until-slow` on its label, `wait-after-slow` on its slow words) from the open's
 * slow delay to the download's, which the status row carries as `--viewer-download-slow-delay`.
 */
const downloadSlowWordsClasses =
  '[&_[data-slot=wait-indicator-label]]:[--wait-slow-delay:var(--viewer-download-slow-delay)] [&_[data-slot=wait-indicator-slow]]:[--wait-slow-delay:var(--viewer-download-slow-delay)]';

/** A running download's slow mark, as the CSS that swaps at it reads it. */
type DownloadSlowMark = Readonly<{
  /** The slow delay, measured from when the download started on the stage. */
  slowDelay: string;
  /** `--wait-slow-delay` set to {@link DownloadSlowMark.slowDelay}, for `wait-until-slow` and `wait-after-slow`. */
  style: WaitDelayStyle;
  /** Counts the downloads: key the swapped elements on it, so a new download restarts their animations. */
  wait: number;
}>;

/**
 * The download's slow mark, on the download's own timing, so it counts from the download's start while the pill keeps
 * the open's clock. Pure, like the pill's: the delay is read when the download starts, and CSS counts it down.
 *
 * @param isDownloading - Whether the project's files are downloading.
 * @returns The mark while the download runs, or `undefined`.
 */
function useDownloadSlowMark(isDownloading: boolean): DownloadSlowMark | undefined {
  const startedAt = useStageWaitStart(isDownloading, false);
  const { timing, wait } = useWaitClock({ active: isDownloading, startedAt });
  const slowDelay = isDownloading ? slowDelayOf(timing) : undefined;
  return slowDelay === undefined ? undefined : { slowDelay, style: { '--wait-slow-delay': slowDelay }, wait };
}

/**
 * The caption's row, always laid out and hanging below the pill, so its words arriving or changing move nothing. Its
 * words are laid out from the wait's start and shown by CSS 3 s into the open; a download swaps in what to do at its
 * own slow mark. A new wait gets new elements, so the animations restart from its delays.
 *
 * @param props - The open's wait count and slow delay, the caption's words and the download's slow mark.
 * @returns The caption row.
 */
function ViewerWaitCaption({
  openWait,
  openSlowDelay,
  caption,
  slowDownload,
}: {
  readonly openWait: number;
  readonly openSlowDelay: string | undefined;
  readonly caption: string | undefined;
  readonly slowDownload: DownloadSlowMark | undefined;
}): React.JSX.Element {
  return (
    <p
      data-slot='viewer-wait-caption'
      className='absolute top-full left-1/2 mt-1.5 grid h-4 w-72 max-w-[calc(100cqw-1rem)] -translate-x-1/2 text-center text-xs text-muted-foreground tabular-nums *:min-w-0 *:truncate *:[grid-area:1/1]'
    >
      {/* Mounted for the whole wait, words or none, so its reveal counts from the wait's start, not a later step's. */}
      {openSlowDelay === undefined ? null : (
        <span
          key={`open-${openWait}`}
          data-slot='viewer-wait-caption-text'
          className='wait-after-slow'
          style={{ '--wait-slow-delay': captionDelay(openSlowDelay) } satisfies WaitDelayStyle}
        >
          {caption === undefined ? null : (
            <span
              key={`download-${slowDownload?.wait}`}
              className={slowDownload === undefined ? undefined : 'wait-until-slow'}
              style={slowDownload?.style}
            >
              {caption}
            </span>
          )}
        </span>
      )}
      {slowDownload === undefined ? null : (
        <span
          key={`download-${slowDownload.wait}`}
          data-slot='viewer-wait-caption-slow'
          className='wait-after-slow'
          style={slowDownload.style}
        >
          {slowDownloadCaption}
        </span>
      )}
    </p>
  );
}

/**
 * The viewer stage's status while it waits before drawing the model (cloud open loading states, option C; A15e): one
 * pill, the shipped viewer pill skin, from 1,000 ms (UI Policy § 6), whose words follow the wait, "Opening project",
 * "Downloading files", "Preparing files", then the model's own "Checking model files" or "Downloading model files". The
 * pill is timed from the stage's first wait to its last, so a later step changes its words only, never its place.
 *
 * Under the pill one muted caption line is always laid out, hanging below it so the pill never moves: from 3,000 ms it
 * gives a download's numbers or the preparing sentence. Ten seconds into a download the pill reads "Still downloading
 * files" with "Try again" beside it, and the caption says what to do. A file check the session reports slow reads
 * "Still checking model files" with "Try again" (T5, A14). A failure drops the pill at once: the stage's failure
 * overlay says it ({@link useViewerWaitFailure}).
 *
 * The 3 s and 10 s marks are CSS animation delays, like the pill's own reveal and slow mark, computed from each wait's
 * start when it starts, so no timer runs and a remount part way through keeps the wait's clock. The words, and "Try
 * again", are laid out from the start and stay hidden, out of focus and the accessibility tree, until their mark.
 *
 * The open's route announcement speaks for the wait, so neither the pill nor the caption is live. The stage's other
 * status (`children`, the build status) shares the pill's cell and stays mounted: it gives way from the frame the pill
 * reveals in and while the pill holds, on the same CSS delays, so a wait too short to show the pill never hides it.
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
  const isSlowCheck = useFileCheckSlow() && wait === 'filesChecking';
  const facet = useLargeObjects();
  const retryOpen = useProjectOpenRetry();
  const isActive = isRunningViewerWait(wait);
  /* A project open starts its wait on the stage; only a wait for the model's files can be one the open already bore. */
  const startedAt = useStageWaitStart(isActive, wait === undefined || isModelFilesWait(wait));
  /* The same timing the pill reads: pure, from the wait's start and end, so no clock or timer is added. */
  const { timing, wait: openWait } = useWaitClock({ active: isActive, startedAt });
  /* A shown pill keeps its words while it holds its minimum after the wait. */
  const [heldWait, setHeldWait] = useState<RunningViewerWait | undefined>(isActive ? wait : undefined);
  if (isActive && wait !== heldWait) {
    setHeldWait(wait);
  }
  const shownWait = isActive ? wait : heldWait;
  const isDownloading = isActive && wait === 'downloading';
  const slowDownload = useDownloadSlowMark(isDownloading);
  const concealStyle: WaitDelayStyle | undefined =
    timing.state === 'waiting' ? { '--wait-slow-delay': timing.revealDelay } : undefined;
  return (
    <div className='relative'>
      <div className='group/viewer-wait grid justify-items-center *:[grid-area:1/1]'>
        <div
          data-slot='viewer-wait-status'
          className='flex items-center justify-center gap-1.5'
          style={slowDownload === undefined ? undefined : { '--viewer-download-slow-delay': slowDownload.slowDelay }}
        >
          {shownWait === undefined || (wait !== undefined && !isActive) ? null : (
            <WaitIndicator
              active={isActive}
              variant='pill'
              live={false}
              startedAt={startedAt}
              label={pillLabel(shownWait, isSlowCheck)}
              /* The pill's own slow swap, moved from the open's mark to the download's, so the pill never restarts. */
              slowLabel={isDownloading ? 'Still downloading files' : undefined}
              className={isDownloading ? downloadSlowWordsClasses : undefined}
              progress={downloadProgress(shownWait, facet)}
            />
          )}
          {isSlowCheck ? <ModelFilesRetry /> : null}
          {slowDownload === undefined ? null : (
            /* Hidden, so neither focusable nor in the accessibility tree, until the download's slow mark. */
            <Button
              key={`download-${slowDownload.wait}`}
              variant='outline'
              size='sm'
              className='wait-after-slow'
              style={slowDownload.style}
              onClick={retryOpen}
            >
              Try again
            </Button>
          )}
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
        openWait={openWait}
        openSlowDelay={slowDelayOf(timing)}
        caption={isActive ? captionFor(wait, facet) : undefined}
        slowDownload={slowDownload}
      />
    </div>
  );
}

/**
 * The stage's failure overlay for a wait that cannot go on by itself: a project open that is offline, failed or needs a
 * sign-in, with the project placeholder's words and action, or a download of the model's files that did not finish.
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
  return { kind: 'failed', summary, message, action: <ProjectFilesAction state={wait} /> };
}
