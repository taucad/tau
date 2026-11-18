import { CircleAlert, WifiOff } from 'lucide-react';
import type { SyncFacet } from '@taucad/revisions';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { sidebarRowButtonClass } from '#components/nav/sidebar-row.js';

type SyncIndicator = Readonly<{ label: string; detail: string; kind: 'busy' | 'offline' | 'attention' }>;

function syncFailureIndicator(sync: SyncFacet | undefined, isCloudPending: boolean): SyncIndicator | undefined {
  if (sync?.state === 'conflicted') {
    return {
      label: 'Needs your decision',
      detail: 'This project changed here and somewhere else. Open History to choose what to keep.',
      kind: 'attention',
    };
  }
  if (sync && !sync.online && (sync.state !== 'noRemote' || isCloudPending)) {
    return {
      label: 'Offline',
      detail: isCloudPending
        ? 'Go online to download this project. It isn’t on this device yet.'
        : 'Changes back up when you’re back online.',
      kind: 'offline',
    };
  }
  if (sync?.state === 'failed' || sync?.state === 'queued') {
    return {
      label:
        sync.reason === 'unauthorized'
          ? 'Sign in to continue'
          : sync.reason === 'forbidden' || sync.reason === 'notFound'
            ? 'Project unavailable'
            : 'Couldn’t back up',
      detail: sync.error ?? 'Open History to try again.',
      kind: 'attention',
    };
  }
  return undefined;
}

/** Project sync activity and exceptions. Healthy sync intentionally has no mark. */
export function projectSyncIndicator(sync: SyncFacet | undefined, isCloudPending: boolean): SyncIndicator | undefined {
  const failure = syncFailureIndicator(sync, isCloudPending);
  if (failure) {
    return failure;
  }
  if (sync?.pullPhase === 'fetching') {
    return { label: 'Downloading files…', detail: 'Bringing this project to this device.', kind: 'busy' };
  }
  if (sync?.pullPhase === 'applying') {
    return { label: 'Preparing files…', detail: 'Getting your files ready to open.', kind: 'busy' };
  }
  if (sync?.chats === 'failed') {
    return {
      label: 'Couldn’t load chats',
      detail: 'Files are ready. Open History to try loading chats again.',
      kind: 'attention',
    };
  }
  if (sync?.chats === 'loading' || sync?.pullPhase === 'records') {
    return { label: 'Loading chats…', detail: 'Files are ready. Your chats are still loading.', kind: 'busy' };
  }
  if (isCloudPending && sync?.hasAppliedRemote) {
    return { label: 'Preparing files…', detail: 'Getting your files ready to open.', kind: 'busy' };
  }
  if (isCloudPending) {
    return { label: 'Opening project…', detail: 'Your files will appear when they are ready.', kind: 'busy' };
  }
  if (sync?.state === 'checking') {
    return { label: 'Checking for changes…', detail: 'Checking for new changes.', kind: 'busy' };
  }
  if (sync?.state === 'pending') {
    return {
      label: 'Backing up changes…',
      detail: 'Backing up your changes. You can keep working.',
      kind: 'busy',
    };
  }
  return undefined;
}

/** Right-side project sync control, separate from the left session-activity mark. */
export function ProjectSyncStatus({
  sync,
  isCloudPending,
  onOpenDetails,
}: {
  readonly sync: SyncFacet | undefined;
  readonly isCloudPending: boolean;
  readonly onOpenDetails: () => void;
}): React.JSX.Element | undefined {
  const indicator = projectSyncIndicator(sync, isCloudPending);
  if (!indicator) {
    return undefined;
  }
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className={sidebarRowButtonClass}
              aria-label={indicator.label}
            >
              {indicator.kind === 'busy' ? (
                <Loader aria-hidden />
              ) : indicator.kind === 'offline' ? (
                <WifiOff aria-hidden />
              ) : (
                <CircleAlert aria-hidden className='text-feature' />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side='bottom' align='start' className='max-w-64'>
          <p className='font-medium'>{indicator.label}</p>
          <p>{indicator.detail}</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent side='bottom' align='start' aria-label='Project status' className='space-y-2 text-sm'>
        <p className='font-medium'>{indicator.label}</p>
        <p>{indicator.detail}</p>
        <Button variant='outline' size='sm' onClick={onOpenDetails}>
          Open History
        </Button>
      </PopoverContent>
    </Popover>
  );
}
