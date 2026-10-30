import { Link, useLocation } from 'react-router';
import { CloudOff, CircleAlert } from 'lucide-react';
import type { LargeObjectsFacet } from '@taucad/revisions';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { Progress } from '@taucad/ui/components/progress';
import { useLargeObjects, useProjectAvailability } from '#hooks/use-project-availability.js';
import type { ModelAvailability, ProjectAvailability } from '#hooks/use-project-availability.js';
import { useRevisionClient, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { formatBytes } from '#lib/format-bytes.js';

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

/** One calm first-open treatment, shared by every unavailable file surface. */
export function ProjectSyncPlaceholder({ state }: { readonly state: ModelAvailability }): React.JSX.Element {
  if (state === 'files' || state === 'filesFailed') {
    return <ModelFilesPlaceholder hasFailed={state === 'filesFailed'} />;
  }
  return <ProjectFilesPlaceholder state={state} />;
}

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
  const needsDetails = state === 'account' || (reason !== undefined && reason !== 'unknown' && reason !== 'offline');
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
  const [title, description] =
    state === 'failed' && (reason === 'forbidden' || reason === 'notFound')
      ? ['Project unavailable', 'Your access may have changed. Open Revisions to review the connection.']
      : state === 'failed' && reason === 'unauthorized'
        ? ['Sign in to continue', 'Your connection needs authorization before this project can download.']
        : state === 'failed' && reason === 'quota'
          ? [
              'Storage needs attention',
              'The download could not finish because a storage limit was reached. Open Revisions for details.',
            ]
          : messages[state];
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
          <Link to={detailsUrl}>Open Revisions</Link>
        </Button>
      ) : isFailure ? (
        <Button variant='outline' size='sm' onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** One live announcement per focused project, rather than one competing announcement per pane. */
export function ProjectSyncAnnouncement(): React.JSX.Element {
  const state = useProjectAvailability();
  return (
    <div className='sr-only' role='status' aria-live='polite' aria-atomic='true'>
      {state === 'ready' ? '' : messages[state].join('. ')}
    </div>
  );
}
