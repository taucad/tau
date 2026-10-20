import { useSelector } from '@xstate/react';
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

  return (
    <ZooUpgradeBanner
      message={failureMessage}
      onRetry={() => {
        cadRef?.send({ type: 'filesystemBindingChanged' });
      }}
    />
  );
}
