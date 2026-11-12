import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { CloudOff, CircleAlert } from 'lucide-react';
import type { LargeObjectsFacet, RevisionStatusProjection } from '@taucad/revisions';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { Progress } from '@taucad/ui/components/progress';
import { useLargeObjects, useModelAvailability, useProjectAvailability } from '#hooks/use-project-availability.js';
import type { ModelAvailability, ProjectAvailability } from '#hooks/use-project-availability.js';
import { useRevisionClient, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { formatBytes } from '@taucad/ui-core/lib/format-bytes';
import { createModelWaitReporter } from '#lib/model-wait-reporting.js';

const messages = {
  connecting: ['Connecting to Tau Cloud', 'Opening this project on this device.'],
  downloading: ['Downloading project files', 'Your model will open when its files are ready.'],
  preparing: ['Preparing project files', 'Getting your downloaded files ready to use.'],
  offline: ['Connect to download this project', 'This project is not on this device yet. Reconnect, then try again.'],
  failed: ['Couldn’t download this project', 'The download did not finish. Try again to continue.'],
  account: ['Sign in to continue', 'Use the account that opened this project from Tau Cloud.'],
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

/** How long a check of the model's files may run before the viewer offers a way out. Milliseconds. */
export const modelCheckPatienceMilliseconds = 10_000;

/**
 * The viewer's wait while no download runs: the files are being checked, which
 * is quick. It never says "Downloading", and a check that outlasts its bound
 * offers Try again, which checks the files again (T5).
 */
function ModelCheckPlaceholder(): React.JSX.Element {
  const client = useRevisionClient();
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSlow(true);
    }, modelCheckPatienceMilliseconds);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return (
    <div
      className='flex size-full flex-col items-center justify-center gap-4 p-6 text-center'
      role='region'
      aria-label='Preparing model'
      aria-busy='true'
    >
      <Loader className='size-8 motion-reduce:animate-none' />
      <div className='w-full max-w-64 space-y-2'>
        <p className='text-sm font-medium'>Preparing model</p>
        <p className='text-xs text-muted-foreground'>
          {isSlow ? 'This is taking longer than it should.' : 'Checking your model files.'}
        </p>
      </div>
      {isSlow ? (
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
    return ['Sign in to continue', 'Your connection needs authorization before this project can download.'];
  }
  if (reason === 'rejected') {
    return ['Couldn’t back up this project', 'Tau Cloud refused this device’s history. Open History to review it.'];
  }
  if (status?.sync.state === 'conflicted') {
    return [
      'This project needs a decision',
      'This device and Tau Cloud both changed it. Open History to choose what to keep.',
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

/** One live announcement per focused project, rather than one competing announcement per pane. */
export function ProjectSyncAnnouncement(): React.JSX.Element {
  const state = useProjectAvailability();
  const status = useRevisionStatus();
  useModelWaitReporting();
  return (
    <div className='sr-only' role='status' aria-live='polite' aria-atomic='true'>
      {state === 'ready' ? '' : projectFilesCopy(state, status).join('. ')}
    </div>
  );
}
