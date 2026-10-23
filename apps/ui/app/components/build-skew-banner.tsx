import { ArrowUpCircle } from 'lucide-react';
import { describeSupersession } from '#filesystem/build-skew.js';
import { Button } from '@taucad/ui/components/button';
import { useReloadPromptOwned } from '#components/nav/browser-update.js';
import { useReloadOffered, useSupersedingBuild } from '#hooks/use-superseding-build.js';

const reload = (): void => {
  globalThis.location.reload();
};

/**
 * Floating reload prompt, shown while the reload is offered and no other surface owns the prompt.
 * The offer stands when another bundle owns storage (blueprint DF20: this tab has stopped writing
 * durable state) or when the server confirmed a deploy replaced this build
 * (`#lib/stale-build-recovery`, a lone tab that still writes).
 *
 * Fallback for surfaces without the app sidebar (auth, shared pages, the mobile sidebar while
 * closed); elsewhere the sidebar's `BrowserUpdate` or the error page owns the prompt.
 */
export function BuildSkewBanner(): React.JSX.Element | undefined {
  const superseded = useReloadOffered();
  const { supersedingBuildId } = useSupersedingBuild();
  const promptOwnedElsewhere = useReloadPromptOwned();
  if (!superseded || promptOwnedElsewhere) {
    return undefined;
  }
  return (
    <div
      role='alert'
      className='fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-md border bg-background p-3 shadow-lg'
    >
      <ArrowUpCircle className='size-4 shrink-0 text-muted-foreground' />
      <div className='min-w-0 flex-1 text-sm'>{describeSupersession(supersedingBuildId)}</div>
      <Button size='sm' variant='outline' onClick={reload}>
        Reload now
      </Button>
    </div>
  );
}
