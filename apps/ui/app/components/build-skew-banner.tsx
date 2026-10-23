import { useSyncExternalStore } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { isBuildSuperseded, subscribeBuildSkew } from '#filesystem/build-skew.js';
import { Button } from '@taucad/ui/components/button';
import { useBrowserUpdateControlMounted } from '#components/nav/browser-update.js';

const serverSnapshot = (): boolean => false;

const reload = (): void => {
  globalThis.location.reload();
};

/**
 * Persistent prompt shown in a tab whose bundle has been superseded by a newer
 * one in another tab (blueprint DF20) or replaced by a deploy
 * (`#lib/stale-build-recovery`). That tab has already stopped writing
 * durable state, so reloading is the only way to make it useful again.
 *
 * Fallback for surfaces without the app sidebar (auth, shared pages, the
 * mobile sidebar while closed); elsewhere the sidebar's `BrowserUpdate` owns
 * the prompt.
 */
export function BuildSkewBanner(): React.JSX.Element | undefined {
  const superseded = useSyncExternalStore(subscribeBuildSkew, isBuildSuperseded, serverSnapshot);
  const sidebarOwnsPrompt = useBrowserUpdateControlMounted();
  if (!superseded || sidebarOwnsPrompt) {
    return undefined;
  }
  return (
    <div
      role='alert'
      className='fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-md border bg-background p-3 shadow-lg'
    >
      <ArrowUpCircle className='size-4 shrink-0 text-muted-foreground' />
      <div className='min-w-0 flex-1 text-sm'>
        A newer version of Tau is available. Reload to continue with the latest version.
      </div>
      <Button size='sm' variant='outline' onClick={reload}>
        Reload now
      </Button>
    </div>
  );
}
