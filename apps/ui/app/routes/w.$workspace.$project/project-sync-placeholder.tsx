import { cloudOpenAccountReason } from '#lib/tau-cloud-intent.js';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { CloudOff, CircleAlert } from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { LargeObjectsFacet, RevisionStatusProjection } from '@taucad/revisions';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { Progress } from '@taucad/ui/components/progress';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { useWaitClock, useWaitClockSource } from '@taucad/ui/hooks/use-wait-clock';
import { indicatorDelayMilliseconds } from '@taucad/ui/utils/wait-timing';
import { cn } from '@taucad/ui/utils/cn';
import type { ViewerStageStatus } from '@taucad/workbench-panes/shell/viewer-stage';
import { useProject } from '#hooks/use-project.js';
import { useSessions } from '#hooks/use-sessions.js';
import {
  useCloudOpenPending,
  useFileCheckSlow,
  useLargeObjects,
  useModelAvailability,
  useProjectAvailability,
} from '#hooks/use-project-availability.js';
import type { ModelAvailability, ProjectAvailability } from '#hooks/use-project-availability.js';
import { useRevisionClient, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { formatBytes } from '@taucad/ui-core/lib/format-bytes';
import { createModelWaitReporter } from '#lib/model-wait-reporting.js';

const messages = {
  connecting: ['Opening project…', 'Opening this project on this device.'],
  downloading: ['Downloading project files', 'Your model will open when its files are ready.'],
  preparing: ['Preparing files…', 'Getting your files ready to open.'],
  offline: ['You’re offline', 'This project isn’t on this device yet. Go online, then try again.'],
  failed: ['Couldn’t open this project', 'The download didn’t finish. Try again.'],
  account: ['Sign in to continue', cloudOpenAccountReason],
  ready: ['Project files ready', ''],
} satisfies Record<ProjectAvailability, readonly [string, string]>;

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
 * The viewer's wait for the model's large files: the code and files are open,
 * and the model renders once every file is here, never over a partial set.
 */
function ModelFilesPlaceholder({ hasFailed: failed }: { readonly hasFailed: boolean }): React.JSX.Element {
  const facet = useLargeObjects();
  const client = useRevisionClient();
  const title = failed ? 'Couldn’t download model files' : 'Downloading model files';
  const progress = facet === undefined ? undefined : largeObjectsProgressText(facet);
  const percent =
    facet === undefined || facet.totalBytes === 0 ? 0 : Math.min(100, (facet.bytes / facet.totalBytes) * 100);
  return (
    <div
      className='flex size-full flex-col items-center justify-center gap-4 p-6 text-center'
      role='region'
      aria-label={title}
      aria-busy={!failed}
    >
      {failed ? (
        <CircleAlert className='size-8 text-muted-foreground' />
      ) : (
        <Loader className='size-8 motion-reduce:animate-none' />
      )}
      <div className='w-full max-w-64 space-y-2'>
        <p className='text-sm font-medium'>{title}</p>
        <p className='text-xs text-muted-foreground'>
          {failed
            ? 'Your files are open; the model needs the rest of them to render.'
            : 'Your files are open. The model renders when they are all here.'}
        </p>
        {progress === undefined ? null : (
          <>
            <Progress value={percent} aria-label='Model files downloaded' />
            <p className='text-xs text-muted-foreground tabular-nums'>{progress}</p>
          </>
        )}
      </div>
      {failed ? (
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            client?.send({ command: 'retryLargeObjects' });
          }}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The waits for the model's own files: a check of files already here, a download of the model's large files, or that
 * download's failure. The viewer shows these on its stage, which stays mounted through them (A15e; P-j): the canvas
 * and the last render stay, and the kernel waits for the files. The other model surfaces still show
 * {@link ProjectSyncPlaceholder}.
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

/** One wait for the model's files as the stage's indicator times it. */
type TrackedFilesWait = Readonly<{ active: boolean; startedAt: number }>;

/**
 * When the stage's wait for the model's files started, on the wait clock, read in render when the wait starts (React's
 * "information from previous renders" pattern; no effect, no timer).
 *
 * A wait the open itself waited for (the session still reports the first check `pending` or `slow`) began with the
 * open, which has already waited the open bound for it (A14): the bound is the indicator delay, so its indicator shows
 * as the stage mounts. Every other wait, such as a later check or a download that begins on screen, starts now.
 *
 * @param active - Whether the stage waits for the model's files now.
 * @returns The current wait's start, in milliseconds on the wait clock.
 */
function useModelFilesWaitStart(active: boolean): number {
  const clock = useWaitClockSource();
  const { projectId } = useProject();
  const isOpenWait = useSelector(useSessions(), (state) => {
    const availability = state.context.status[projectId]?.availability;
    return availability === 'pending' || availability === 'slow';
  });
  const startNow = (): number => clock.now() - (isOpenWait ? indicatorDelayMilliseconds : 0);
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

/**
 * The viewer stage's status for the model's files: the status pill, "Checking model files" or "Downloading model
 * files" with its percent, from 1,000 ms (UI Policy § 6). A check that outlasts its patience reads "Still checking
 * model files" with "Try again", which checks the files again (T5); the patience is the session's (`slow`, A14),
 * counted on its clock from when the check began, so the pill adds no clock of its own. It is rendered for the stage's
 * whole life, so a shown pill keeps its minimum after the files arrive. The open's route announcement speaks for it,
 * so it is not live. Mount it once the stage has waited for its files: it reads the project's session.
 *
 * The stage's other status (`children`, the build status) shares the pill's cell and stays mounted: it gives way from
 * the frame the pill reveals in and while the pill holds, on the same CSS delays, so a check too short to show the pill
 * never hides it. A failed download drops the pill at once: the stage's failure overlay says it.
 *
 * @param props - The wait the stage is in, or `undefined` once the files are here, and the status it shares a cell with.
 * @returns The status slot's wait content.
 */
export function ModelFilesStageStatus({
  wait,
  children,
}: {
  readonly wait: ModelFilesWait | undefined;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const isSlow = useFileCheckSlow();
  const facet = useLargeObjects();
  const isActive = wait === 'filesChecking' || wait === 'files';
  const startedAt = useModelFilesWaitStart(isActive);
  /* The same timing the pill reads: pure, from the wait's start and end, so no clock or timer is added. */
  const { timing } = useWaitClock({ active: isActive, startedAt });
  /* A shown pill keeps its words while it holds its minimum after the wait. */
  const [heldWait, setHeldWait] = useState(wait);
  if (isActive && wait !== heldWait) {
    setHeldWait(wait);
  }
  const shownWait = isActive ? wait : heldWait;
  const isDownloading = shownWait === 'files';
  const isSlowCheck = wait === 'filesChecking' && isSlow;
  const progress =
    isDownloading && facet !== undefined && facet.totalBytes > 0
      ? Math.min(1, facet.bytes / facet.totalBytes)
      : undefined;
  const label = isDownloading
    ? 'Downloading model files'
    : isSlowCheck
      ? 'Still checking model files'
      : 'Checking model files';
  const concealStyle: (React.CSSProperties & Record<'--wait-slow-delay', string>) | undefined =
    timing.state === 'waiting' ? { '--wait-slow-delay': timing.revealDelay } : undefined;
  return (
    <div className='group/viewer-wait grid justify-items-center *:[grid-area:1/1]'>
      <div data-slot='model-files-status' className='flex items-center justify-center gap-1.5'>
        {wait === 'filesFailed' ? null : (
          <WaitIndicator
            active={isActive}
            variant='pill'
            live={false}
            startedAt={startedAt}
            label={label}
            progress={progress}
          />
        )}
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
  );
}

/** "Try again" for the model's files: checks them again and resumes their download (T5). */
function ModelFilesRetry(): React.JSX.Element {
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
 * A model surface's wait while no download runs: the files are being checked, which is quick. The pane keeps its bare
 * frame (P-j: no "Preparing model" block) and shows "Checking model files" in it only from 1,000 ms (UI Policy § 6).
 * It never says "Downloading", and a check that outlasts its bound reads "Still checking model files" with Try again,
 * which checks the files again (T5). The bound is the session's (`slow`, A14), counted on its clock from when the check
 * began. The open's route announcement speaks for it, so it is not live.
 */
function ModelCheckPlaceholder(): React.JSX.Element {
  const isSlow = useFileCheckSlow();
  const startedAt = useModelFilesWaitStart(true);
  return (
    <div
      className='flex size-full items-center justify-center gap-1.5 p-6'
      role='region'
      aria-label='Checking model files'
      aria-busy='true'
    >
      <WaitIndicator
        active
        live={false}
        startedAt={startedAt}
        label={isSlow ? 'Still checking model files' : 'Checking model files'}
      />
      {isSlow ? <ModelFilesRetry /> : null}
    </div>
  );
}

/** One calm first-open treatment, shared by every unavailable file surface. */
export function ProjectSyncPlaceholder({ state }: { readonly state: ModelAvailability }): React.JSX.Element {
  if (state === 'filesChecking') {
    return <ModelCheckPlaceholder />;
  }
  if (state === 'files' || state === 'filesFailed') {
    return <ModelFilesPlaceholder hasFailed={state === 'filesFailed'} />;
  }
  return <ProjectFilesPlaceholder state={state} />;
}

/**
 * What the project placeholder says: the failure's own class where it names one, so a refused push or a conflicted
 * pull never reads as a download that did not finish.
 *
 * @param state - The project's availability.
 * @param status - The revision status the failure's class is read from.
 * @returns The title and the description.
 */
export const projectFilesCopy = (
  state: ProjectAvailability,
  status: Pick<RevisionStatusProjection, 'remote' | 'sync'> | undefined,
): readonly [string, string] => {
  if (state !== 'failed') {
    return messages[state];
  }
  const reason = status?.remote.reason ?? status?.sync.reason;
  if (reason === 'forbidden' || reason === 'notFound') {
    return ['Project unavailable', 'Your access may have changed. Open History to review the backup.'];
  }
  if (reason === 'unauthorized') {
    return ['Sign in to continue', 'Sign in again to finish opening this project. Open History to sign in.'];
  }
  if (reason === 'rejected') {
    return ['Couldn’t back up this project', 'Changes from this device weren’t backed up. Open History to see why.'];
  }
  if (status?.sync.state === 'conflicted') {
    return [
      'Needs your decision',
      'This project changed here and somewhere else. Open History to choose what to keep.',
    ];
  }
  if (reason === 'quota') {
    return [
      'Storage needs attention',
      'The download could not finish because a storage limit was reached. Open History for details.',
    ];
  }
  return messages.failed;
};

function ProjectFilesPlaceholder({ state }: { readonly state: ProjectAvailability }): React.JSX.Element {
  const { connectRemote, syncNow } = useRevisionCommands();
  const status = useRevisionStatus();
  const remote = status?.remote;
  const client = useRevisionClient();
  const location = useLocation();
  const parameters = new URLSearchParams(location.search);
  parameters.set('workbench', 'revisions');
  const detailsUrl = `${location.pathname}?${parameters.toString()}`;
  const reason = remote?.reason ?? status?.sync.reason;
  const needsDetails =
    state === 'account' ||
    status?.sync.state === 'conflicted' ||
    (reason !== undefined && reason !== 'unknown' && reason !== 'offline');
  const retry = (): void => {
    if (remote?.phase === 'reconnectRequired') {
      client?.send({ command: 'authorizeRemote' });
    } else if (remote?.phase === 'connected') {
      syncNow();
    } else {
      void connectRemote('tau');
    }
  };
  const isFailure = state === 'failed' || state === 'offline' || state === 'account';
  const [title, description] = projectFilesCopy(state, status);
  return (
    <div
      className='flex size-full flex-col items-center justify-center gap-4 p-6 text-center'
      role='region'
      aria-label={title}
      aria-busy={!isFailure}
    >
      {state === 'offline' ? (
        <CloudOff className='size-8 text-muted-foreground' />
      ) : isFailure ? (
        <CircleAlert className='size-8 text-muted-foreground' />
      ) : (
        <Loader className='size-8 motion-reduce:animate-none' />
      )}
      <div className='space-y-1'>
        <p className='text-sm font-medium'>{title}</p>
        <p className='max-w-64 text-xs text-muted-foreground'>{description}</p>
      </div>
      {isFailure && needsDetails ? (
        <Button asChild variant='outline' size='sm'>
          <Link to={detailsUrl}>Open History</Link>
        </Button>
      ) : isFailure ? (
        <Button variant='outline' size='sm' onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

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
  /* The project's own gate failed: the open never reached the model's files, and the placeholder says so. */
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
 * One live announcement per focused project, rather than one competing announcement per pane. It speaks for the first
 * view the panes show (the tree, the editor and the chats open on readiness during a Tau Cloud open, STO-25), so it
 * goes quiet when they open rather than when the whole apply ends; a pane still waiting shows its own state. That
 * moment is also the open's `first_view` (STO-25), which it tells the project's revision host.
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
      {state === 'ready' ? '' : projectFilesCopy(state, status).join('. ')}
    </div>
  );
}
