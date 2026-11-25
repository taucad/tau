import { useSelector } from '@xstate/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { isCodeLoadFailure } from '@taucad/ui-core/lib/code-loading';
import { ViewerStatusPill } from '@taucad/workbench-panes/shell/viewer-status';
import { useProject } from '#hooks/use-project.js';
import { useCad, useCadSelector } from '#hooks/use-cad.js';
import { ZooUpgradeBanner } from '#cloud/zoo-upgrade-banner.js';
import { selectCadFailureIssues, selectCadLoadingPhase } from '#machines/cad.machine.js';

/**
 * The running build phase, as the shared viewer status pill in `ViewerStage`'s status slot, which places it (centred
 * in an empty viewer, in the upper sixth over a model) so the bar never grows or shrinks around it. "Build failed" and
 * the issue counts stay in the bar's status segment. Once the build settles, the Zoo upgrade banner takes the slot
 * when the failure calls for it.
 */
export function ChatViewerStatus(): React.ReactNode {
  const { projectRef } = useProject();
  const cadRef = useCad();
  const loadingState = useCadSelector(selectCadLoadingPhase, undefined);
  const projectState = useSelector(projectRef, (state) => state.value);
  const failureIssues = useCadSelector(selectCadFailureIssues, undefined);
  const failureMessage = failureIssues?.find((issue) => issue.severity === 'error')?.message;

  // Don't show loading states if the project failed to load (e.g., not found)
  if (projectState === 'error') {
    return null;
  }

  if (loadingState) {
    return <ViewerStatusPill label={loadingState} />;
  }

  /* FP10 (PL7 staging verification 2026-11-21, row 5): the runtime's own code did not load and the unit has replaced
   * its worker as often as the page allows. This page can never load that code again, so the slot offers Reload, in
   * every viewer profile, never a retry in place and never only the closed channel the transport saw. */
  if (failureMessage !== undefined && isCodeLoadFailure(new Error(failureMessage))) {
    return (
      <section
        aria-label='Model viewer unavailable'
        className='m-auto flex max-w-xl flex-wrap items-center gap-2 rounded-md border bg-background/90 p-2 text-sm shadow-sm backdrop-blur-sm'
      >
        <p className='min-w-48 flex-1 text-muted-foreground'>
          Part of Tau did not finish loading, so the model cannot render. Reload the page to continue.
        </p>
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            globalThis.location.reload();
          }}
        >
          <RefreshCw aria-hidden className='size-3.5' />
          Reload
        </Button>
      </section>
    );
  }

  return (
    <ZooUpgradeBanner
      message={failureMessage}
      onRetry={() => {
        cadRef?.send({ type: 'filesystemBindingChanged' });
      }}
    />
  );
}
