import { useFeature } from '#flags/use-feature.js';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';

/** Open Print for a source-job link, retaining its qualified machine and job selection. */
export function ProjectPrintRouteIntent(): undefined {
  const [parameters, setParameters] = useSearchParams();
  const { openPanel } = useProjectWorkspace();
  const enabled = useFeature('machines');
  const requested = enabled && parameters.get(searchParameterName.workbench) === 'print';
  useEffect(() => {
    if (!requested) {
      return;
    }
    // A pane intent from the route: the layout keeps it across this replace and applies it once the workbench shows.
    openPanel('print', 'route');
    setParameters(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(searchParameterName.workbench);
        return next;
      },
      { replace: true },
    );
  }, [openPanel, requested, setParameters]);
  return undefined;
}
