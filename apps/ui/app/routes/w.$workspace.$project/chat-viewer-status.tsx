import { useSelector } from '@xstate/react';
import { Loader } from '#components/ui/loader.js';
import { useProject } from '#hooks/use-project.js';
import { useCad, useCadSelector } from '#hooks/use-cad.js';
import { cn } from '@taucad/ui/utils/cn';
import { ZooUpgradeBanner } from '#cloud/zoo-upgrade-banner.js';
import { selectCadFailureIssues, selectCadLoadingPhase } from '#machines/cad.machine.js';

/**
 * The running build phase, as a pill in the viewer bar's skin at the top of the viewer: absolutely placed by its
 * host, so the bar never grows or shrinks around it, and where a person waiting on a build is looking. "Build
 * failed" and the issue counts stay in the bar's status segment. Once the build settles, the Zoo upgrade banner takes
 * the slot when the failure calls for it.
 */
export function ChatViewerStatus({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
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
    return (
      <div
        role='status'
        {...props}
        className={cn(
          'm-auto flex h-7 items-center gap-1.5 rounded-lg border bg-sidebar px-2 text-xs text-foreground shadow-xs',
          className,
        )}
      >
        <Loader className='size-3.5 text-primary' />
        <span className='capitalize'>{loadingState}…</span>
      </div>
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
