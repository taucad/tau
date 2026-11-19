import { useEffect, useState } from 'react';
import type { LargeObjectsFacet } from '@taucad/revisions';
import { Button } from '@taucad/ui/components/button';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { useWaitClock, useWaitClockSource } from '@taucad/ui/hooks/use-wait-clock';
import { slowWaitMilliseconds } from '@taucad/ui/utils/wait-timing';
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

/**
 * Whether `delay` has passed since `startedAt` on the wait clock, while `active`: one timeout per start, on the clock the
 * pill is timed on, so a wait the stage took over part way through counts from its own start.
 *
 * @param active - Whether the wait runs.
 * @param startedAt - When it started, on the wait clock. Milliseconds.
 * @param markDelay - How long after its start the mark falls. Milliseconds.
 * @returns `true` from the mark until the wait ends or starts again.
 */
function useWaitMark(active: boolean, startedAt: number, markDelay: number): boolean {
  const clock = useWaitClockSource();
  const [reachedFor, setReachedFor] = useState<number>();
  useEffect(() => {
    if (!active) {
      return;
    }
    const markTimer = setTimeout(
      () => {
        setReachedFor(startedAt);
      },
      Math.max(0, startedAt + markDelay - clock.now()),
    );
    return () => {
      clearTimeout(markTimer);
    };
  }, [active, startedAt, markDelay, clock]);
  return active && reachedFor === startedAt;
}

/**
 * The pill's words for a wait.
 *
 * @param wait - The wait the pill shows.
 * @param slow - Whether the file check or the download has run past its slow mark.
 * @returns The label, which the pill ends with an ellipsis.
 */
function pillLabel(wait: RunningViewerWait, slow: Readonly<{ isSlowCheck: boolean; isSlowDownload: boolean }>): string {
  if (wait === 'files') {
    return 'Downloading model files';
  }
  if (wait === 'filesChecking') {
    return slow.isSlowCheck ? 'Still checking model files' : 'Checking model files';
  }
  if (wait === 'downloading' && slow.isSlowDownload) {
    return 'Still downloading files';
  }
  return projectWaitLabels[wait];
}

/**
 * The caption under the pill: a download's real numbers, the preparing sentence, or what to do once a download is
 * slow. An opening project has none: the pill already says it.
 *
 * @param wait - The running wait.
 * @param facet - The large-object download, when one runs.
 * @param isSlowDownload - Whether the download has run past its slow mark.
 * @returns The caption, or `undefined` for none.
 */
function captionFor(
  wait: RunningViewerWait,
  facet: LargeObjectsFacet | undefined,
  isSlowDownload: boolean,
): string | undefined {
  if (wait === 'downloading' && isSlowDownload) {
    return slowDownloadCaption;
  }
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
  const { timing } = useWaitClock({ active: isActive, startedAt });
  /* A shown pill keeps its words while it holds its minimum after the wait. */
  const [heldWait, setHeldWait] = useState<RunningViewerWait | undefined>(isActive ? wait : undefined);
  if (isActive && wait !== heldWait) {
    setHeldWait(wait);
  }
  const shownWait = isActive ? wait : heldWait;
  const isDownloading = isActive && wait === 'downloading';
  const downloadStartedAt = useStageWaitStart(isDownloading, false);
  const isSlowDownload = useWaitMark(isDownloading, downloadStartedAt, slowWaitMilliseconds);
  const isCaptionDue = useWaitMark(isActive, startedAt, captionDelayMilliseconds);
  const caption = isActive && (isCaptionDue || isSlowDownload) ? captionFor(wait, facet, isSlowDownload) : undefined;
  const concealStyle: (React.CSSProperties & Record<'--wait-slow-delay', string>) | undefined =
    timing.state === 'waiting' ? { '--wait-slow-delay': timing.revealDelay } : undefined;
  return (
    <div className='relative'>
      <div className='group/viewer-wait grid justify-items-center *:[grid-area:1/1]'>
        <div data-slot='viewer-wait-status' className='flex items-center justify-center gap-1.5'>
          {shownWait === undefined || (wait !== undefined && !isActive) ? null : (
            <WaitIndicator
              active={isActive}
              variant='pill'
              live={false}
              startedAt={startedAt}
              label={pillLabel(shownWait, { isSlowCheck, isSlowDownload })}
              progress={downloadProgress(shownWait, facet)}
            />
          )}
          {isSlowCheck ? <ModelFilesRetry /> : null}
          {isSlowDownload ? (
            <Button variant='outline' size='sm' onClick={retryOpen}>
              Try again
            </Button>
          ) : null}
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
      {/* The caption's row is always laid out and hangs below the pill, so its words arriving or changing move nothing. */}
      <p
        data-slot='viewer-wait-caption'
        className='absolute top-full left-1/2 mt-1.5 h-4 w-72 max-w-[calc(100cqw-1rem)] -translate-x-1/2 truncate text-center text-xs text-muted-foreground tabular-nums'
      >
        {caption}
      </p>
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
