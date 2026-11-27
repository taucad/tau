import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useSelector } from '@xstate/react';
import type { LargeObjectsFacet } from '@taucad/revisions';
import { Button } from '@taucad/ui/components/button';
import { useWaitClockSource } from '@taucad/ui/hooks/use-wait-clock';
import { indicatorDelayMilliseconds } from '@taucad/ui/utils/wait-timing';
import type { ViewerStageStatus } from '@taucad/workbench-panes/shell/viewer-stage';
import { useProject } from '#hooks/use-project.js';
import { useSessions } from '#hooks/use-sessions.js';
import { useCloudOpenPending, useModelAvailability, useProjectAvailability } from '#hooks/use-project-availability.js';
import type { ModelAvailability, ProjectAvailability } from '#hooks/use-project-availability.js';
import { useRevisionClient, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { formatBytes } from '@taucad/ui-core/lib/format-bytes';
import { createModelWaitReporter } from '#lib/model-wait-reporting.js';
import { announcementOf, projectFilesCopy } from '#lib/project-open-copy.js';

/**
 * How far a large-object download is, as the viewer says it.
 *
 * @param facet - The checkout's large-object facet.
 * @returns e.g. `12 of 295 files, 3.1 MB of 70.0 MB`.
 */
export const largeObjectsProgressText = (
  facet: Pick<LargeObjectsFacet, 'objects' | 'totalObjects' | 'bytes' | 'totalBytes'>,
): string =>
  `${facet.objects} of ${facet.totalObjects} ${facet.totalObjects === 1 ? 'file' : 'files'}, ${formatBytes(facet.bytes)} of ${formatBytes(facet.totalBytes)}`;

/**
 * The waits for the model's own files: a check of files already here, a download of the model's large files, or that
 * download's failure. The viewer shows these on its stage, which stays mounted through them (A15e; P-j): the canvas
 * and the last render stay, and the kernel waits for the files. The other model surfaces draw their shape
 * (`ProjectWaitSkeleton`).
 */
export type ModelFilesWait = Extract<ModelAvailability, 'filesChecking' | 'files' | 'filesFailed'>;

/**
 * Whether the model's availability is one of its own files' waits, which the viewer shows on its stage.
 *
 * @param state - The model's availability.
 * @returns `true` for a check, a download or a failed download of the model's files.
 */
export const isModelFilesWait = (state: ModelAvailability): state is ModelFilesWait =>
  state === 'filesChecking' || state === 'files' || state === 'filesFailed';

/**
 * Whether the session still reports the project's open as owed (`pending`, or `slow` past its bound, A14): a wait for
 * the model's files that starts now is one the open itself bore.
 *
 * @returns `true` while the open is owed.
 */
export function useIsOpenBoundWait(): boolean {
  const { projectId } = useProject();
  return useSelector(useSessions(), (state) => {
    const availability = state.context.status[projectId]?.availability;
    return availability === 'pending' || availability === 'slow';
  });
}

/** One wait for the model's files as the stage's indicator times it. */
type TrackedFilesWait = Readonly<{ active: boolean; startedAt: number }>;

/**
 * When the stage's wait for the model's files started, on the wait clock, read in render when the wait starts (React's
 * "information from previous renders" pattern; no effect, no timer).
 *
 * A wait the open itself waited for (the session still reports the first check `pending` or `slow`) began with the
 * open, which has already waited the open bound for it (A14): the bound is the indicator delay, so its indicator shows
 * as the stage mounts. Every other wait, such as a later check or a download that begins on screen, starts now, and so
 * does a wait that began with the project's own open on the stage, whose pill keeps the open's start.
 *
 * @param active - Whether the stage waits for the model's files now.
 * @param isOpenBound - Whether a wait that starts now may be one the open waited for; `false` for a project open.
 * @returns The current wait's start, in milliseconds on the wait clock.
 */
export function useStageWaitStart(active: boolean, isOpenBound = true): number {
  const clock = useWaitClockSource();
  const isOpenWait = useIsOpenBoundWait();
  const startNow = (): number => clock.now() - (isOpenBound && isOpenWait ? indicatorDelayMilliseconds : 0);
  const [tracked, setTracked] = useState<TrackedFilesWait>(() => ({
    active,
    startedAt: startNow(),
  }));
  let current = tracked;
  if (tracked.active !== active) {
    current = active ? { active, startedAt: startNow() } : { ...tracked, active };
    setTracked(current);
  }
  return current.startedAt;
}

/** "Try again" for the model's files: checks them again and resumes their download (T5). */
export function ModelFilesRetry(): React.JSX.Element {
  const client = useRevisionClient();
  return (
    <Button
      variant='outline'
      size='sm'
      onClick={() => {
        client?.send({ command: 'retryLargeObjects' });
      }}
    >
      Try again
    </Button>
  );
}

/**
 * The viewer stage's failure for a download of the model's files that did not finish: what failed, what it means and
 * "Try again", over whatever the canvas still draws.
 */
export const modelFilesFailure: ViewerStageStatus = {
  kind: 'failed',
  summary: 'Couldn’t download model files',
  message: 'Your files are open; the model needs the rest of them to render.',
  action: <ModelFilesRetry />,
};

/**
 * Try again for an open that could not go on: authorise the remote again, pull now, or connect it, whichever the remote
 * needs.
 *
 * @returns The retry.
 */
export function useProjectOpenRetry(): () => void {
  const { connectRemote, syncNow } = useRevisionCommands();
  const remote = useRevisionStatus()?.remote;
  const client = useRevisionClient();
  return (): void => {
    if (remote?.phase === 'reconnectRequired') {
      client?.send({ command: 'authorizeRemote' });
    } else if (remote?.phase === 'connected') {
      syncNow();
    } else {
      void connectRemote('tau');
    }
  };
}

/**
 * What the person can do about an open that could not go on: "Open History" where the failure needs a decision or a
 * sign-in, otherwise "Try again".
 *
 * @param props - The project's failed availability.
 * @returns The action.
 */
export function ProjectFilesAction({
  state,
}: {
  readonly state: Extract<ProjectAvailability, 'offline' | 'failed' | 'account'>;
}): React.JSX.Element {
  const status = useRevisionStatus();
  const retry = useProjectOpenRetry();
  const location = useLocation();
  const parameters = new URLSearchParams(location.search);
  parameters.set('workbench', 'revisions');
  const detailsUrl = `${location.pathname}?${parameters.toString()}`;
  const reason = status?.remote.reason ?? status?.sync.reason;
  const needsDetails =
    state === 'account' ||
    status?.sync.state === 'conflicted' ||
    (reason !== undefined && reason !== 'unknown' && reason !== 'offline');
  return needsDetails ? (
    <Button asChild variant='outline' size='sm'>
      <Link to={detailsUrl}>Open History</Link>
    </Button>
  ) : (
    <Button variant='outline' size='sm' onClick={retry}>
      Try again
    </Button>
  );
}

/**
 * Whether the project's availability is an open that could not go on.
 *
 * @param state - The project's availability.
 * @returns `true` offline, after a failure, or for an account that may not open the project.
 */
export const isProjectFilesFailure = (
  state: ModelAvailability,
): state is Extract<ProjectAvailability, 'offline' | 'failed' | 'account'> =>
  state === 'failed' || state === 'offline' || state === 'account';

/** The model surfaces' wait on the large objects, reported when it stalls or fails (R7); one watch per focused project. */
function useModelWaitReporting(): void {
  const model = useModelAvailability();
  const status = useRevisionStatus();
  const reporter = useRef<ReturnType<typeof createModelWaitReporter> | undefined>(undefined);
  useEffect(() => {
    const created = createModelWaitReporter();
    reporter.current = created;
    return () => {
      created.dispose();
      reporter.current = undefined;
    };
  }, []);
  const gated = model === 'files' || model === 'filesFailed' || model === 'filesChecking';
  const facet = status?.largeObjects;
  /* The project's own gate failed: the open never reached the model's files, and the open's failure says so. */
  const isOpenFailed = model === 'failed';
  const reason = status?.remote.reason ?? status?.sync.reason ?? 'unknown';
  const remotePhase = status?.remote.phase;
  const syncState = status?.sync.state;
  const error = status?.remote.error ?? status?.sync.error;
  useEffect(() => {
    reporter.current?.observe({
      gated,
      projectId: status?.projectId,
      checkoutId: status?.checkoutId,
      readiness: status?.readiness,
      facet,
      openFailure: isOpenFailed ? { reason, remotePhase, syncState, error } : undefined,
    });
  }, [
    gated,
    status?.projectId,
    status?.checkoutId,
    status?.readiness,
    facet,
    isOpenFailed,
    reason,
    remotePhase,
    syncState,
    error,
  ]);
}

/**
 * The project open's one live region (Progressive Loading Policy rule 22), rather than one competing announcement per
 * pane: no pane, pill or failure card inside the open is live. It says the open's one label once, since every running
 * step reads the same words, and the failure if there is one; never a step, a percentage or a detail line. It speaks
 * for the first view the panes show (the tree, the editor and the chats open on readiness during a Tau Cloud open,
 * STO-25), so it goes quiet when they open rather than when the whole apply ends. That moment is also the open's
 * `first_view` (STO-25), which it tells the project's revision host.
 */
export function ProjectSyncAnnouncement(): React.JSX.Element {
  const state = useProjectAvailability('chats');
  const status = useRevisionStatus();
  const client = useRevisionClient();
  const isCloudOpenPending = useCloudOpenPending();
  useModelWaitReporting();
  /* STO-25: a Tau Cloud open's `first_view` is when this route shows its first view, which this tab alone knows. */
  useEffect(() => {
    if (isCloudOpenPending && state === 'ready') {
      client?.firstViewShown?.();
    }
  }, [client, isCloudOpenPending, state]);
  return (
    <div className='sr-only' role='status' aria-live='polite' aria-atomic='true'>
      {state === 'ready' ? '' : announcementOf(projectFilesCopy(state, status))}
    </div>
  );
}
