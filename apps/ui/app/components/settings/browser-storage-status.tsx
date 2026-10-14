import { Button } from '@taucad/ui/components/button';
import type { PersistentStorageStatus } from '#filesystem/handle-store.js';

const statusCopy: Record<PersistentStorageStatus, { title: string; description: string }> = {
  'best-effort': {
    title: 'Saved in this browser',
    description: 'Home projects stay here between visits. The browser may remove them when space runs low.',
  },
  persistent: {
    title: 'Protected from automatic cleanup',
    description: 'The browser has granted Home storage protection. Clearing site data still removes these projects.',
  },
  unknown: {
    title: 'Storage protection not confirmed',
    description: 'Tau could not confirm whether Home projects are protected from automatic browser cleanup.',
  },
  unavailable: {
    title: 'Storage protection unavailable',
    description: 'This browser cannot report whether Home projects are protected from automatic cleanup.',
  },
};

/**
 * Browser eviction protection is separate from whether an individual save worked.
 * @param props - Observed status and a passive refresh action.
 * @returns Storage settings copy, with no permission prompt or save-error styling.
 */
export function BrowserStorageStatus({
  status,
  onCheckStatus,
}: {
  readonly status: PersistentStorageStatus;
  readonly onCheckStatus: () => void;
}): React.JSX.Element {
  const copy = statusCopy[status];
  return (
    <div className='flex flex-col items-start gap-3'>
      <div className='space-y-1' role='status'>
        <p className='text-sm font-medium'>{copy.title}</p>
        <p className='text-sm text-muted-foreground'>{copy.description}</p>
      </div>
      <p className='text-xs text-muted-foreground'>
        Keep a backup of important projects, or save them in a connected folder on your disk.
      </p>
      <Button variant='outline' size='sm' onClick={onCheckStatus}>
        Check status
      </Button>
    </div>
  );
}
