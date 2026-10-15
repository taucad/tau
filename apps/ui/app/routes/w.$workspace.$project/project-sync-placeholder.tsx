import { Link, useLocation } from 'react-router';
import { CloudOff, CircleAlert } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { useProjectAvailability } from '#hooks/use-project-availability.js';
import type { ProjectAvailability } from '#hooks/use-project-availability.js';
import { useRevisionClient, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';

const messages = {
  connecting: ['Connecting to Tau Cloud', 'Opening this project on this device.'],
  downloading: ['Downloading project files', 'Your model will open when its files are ready.'],
  preparing: ['Preparing project files', 'Getting your downloaded files ready to use.'],
  offline: ['Connect to download this project', 'This project is not on this device yet. Reconnect, then try again.'],
  failed: ['Couldn’t download this project', 'The download did not finish. Try again to continue.'],
  account: ['Sign in to continue', 'Use the account that opened this project from Tau Cloud.'],
  ready: ['Project files ready', ''],
} satisfies Record<ProjectAvailability, readonly [string, string]>;

/** One calm first-open treatment, shared by every unavailable file surface. */
export function ProjectSyncPlaceholder({ state }: { readonly state: ProjectAvailability }): React.JSX.Element {
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
