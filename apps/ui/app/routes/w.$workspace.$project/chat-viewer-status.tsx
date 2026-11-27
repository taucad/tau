import { useSelector } from '@xstate/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { isCodeLoadFailure } from '@taucad/ui-core/lib/code-loading';
import { useState } from 'react';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { useOpenWaitStart } from '#hooks/use-wait-start.js';
import { useProject } from '#hooks/use-project.js';
import { useCad, useCadSelector } from '#hooks/use-cad.js';
import { ZooUpgradeBanner } from '#cloud/zoo-upgrade-banner.js';
import { selectCadFailureIssues, selectCadLoadingPhase } from '#machines/cad.machine.js';

/** The build's one label, for every phase of it (Progressive Loading Policy rules 18 and 19): never a transport step. */
export const viewerBuildLabel = 'Rendering';

/**
 * The build's pill on the wait ladder (Progressive Loading Policy rule 16): the viewer pill's skin from 1,000 ms into
 * the build and then for at least 500 ms, so a fast render shows nothing. The build that renders the project's first
 * model is part of the open and keeps the open's clock, so it takes over the open's pill in place; a later build counts
 * from its own start. One label for every phase. It is live only for a build a person's gesture started: the route
 * speaks for the open (rule 22). Mounted from the first build on, so a shown pill serves its minimum, and takes no room
 * while idle.
 *
 * @param props - Whether a build runs.
 * @returns The pill, or nothing before the first build.
 */
function ViewerBuildStatus({ isBuilding }: { readonly isBuilding: boolean }): React.ReactNode {
  const { startedAt, isGesture } = useOpenWaitStart(isBuilding);
  const [hasBuilt, setHasBuilt] = useState(isBuilding);
  if (isBuilding && !hasBuilt) {
    setHasBuilt(true);
  }
  if (!hasBuilt) {
    return null;
  }
  return (
    <WaitIndicator
      active={isBuilding}
      variant='pill'
      label={viewerBuildLabel}
      startedAt={startedAt}
      live={isGesture}
      className='data-[state=idle]:hidden'
    />
  );
}

/**
 * The running build, as the viewer pill in `ViewerStage`'s status slot, which places it (centred
 * in an empty viewer, in the upper sixth over a model) so the bar never grows or shrinks around it. "Build failed" and
 * the issue counts stay in the bar's status segment. Once the build settles, the Zoo upgrade banner takes the slot
 * when the failure calls for it.
 */
export function ChatViewerStatus(): React.ReactNode {
  const { projectRef } = useProject();
  const loadingState = useCadSelector(selectCadLoadingPhase, undefined);
  const projectState = useSelector(projectRef, (state) => state.value);
  const failureIssues = useCadSelector(selectCadFailureIssues, undefined);
  const failureMessage = failureIssues?.find((issue) => issue.severity === 'error')?.message;

  // Don't show loading states if the project failed to load (e.g., not found)
  if (projectState === 'error') {
    return null;
  }

  /* One tree shape for every branch, so the build's pill keeps its element, and its minimum, whatever follows it. */
  return (
    <>
      <ViewerBuildStatus isBuilding={loadingState !== undefined} />
      {loadingState === undefined ? <ViewerBuildOutcome failureMessage={failureMessage} /> : null}
    </>
  );
}

/**
 * What the slot shows once the build settles: Reload when the runtime's own code did not load, else the Zoo upgrade
 * banner when the failure calls for it.
 */
function ViewerBuildOutcome({ failureMessage }: { readonly failureMessage: string | undefined }): React.ReactNode {
  const cadRef = useCad();
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
