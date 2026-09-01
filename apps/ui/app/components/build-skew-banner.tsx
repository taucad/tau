import { useSyncExternalStore } from 'react';
import { AlertCircle } from 'lucide-react';
import { isBuildSuperseded, subscribeBuildSkew } from '#filesystem/build-skew.js';
import { Button } from '@taucad/ui/components/button';

const serverSnapshot = (): boolean => false;

const reload = (): void => {
  globalThis.location.reload();
};

/**
 * Persistent prompt shown in a tab whose bundle has been superseded by a newer
 * one in another tab (blueprint DF20). That tab has already stopped writing
 * durable state, so reloading is the only way to make it useful again.
 */
export function BuildSkewBanner(): React.JSX.Element | undefined {
  const superseded = useSyncExternalStore(subscribeBuildSkew, isBuildSuperseded, serverSnapshot);
  if (!superseded) {
    return undefined;
  }
  return (
    <div
      role='alert'
      className='border-amber-500/40 fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-md border bg-background p-3 shadow-lg'
    >
      <AlertCircle className='text-amber-600 size-4 shrink-0' />
      <div className='min-w-0 flex-1 text-sm'>A newer version of Tau is running — reload this tab.</div>
      <Button size='sm' variant='outline' onClick={reload}>
        Reload
      </Button>
    </div>
  );
}
