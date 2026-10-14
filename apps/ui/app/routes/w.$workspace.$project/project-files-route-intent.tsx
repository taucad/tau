import { useEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';

/** Consume the sidebar request through the same Files action as the command palette. */
export function ProjectFilesRouteIntent(): undefined {
  const location = useLocation();
  const navigate = useNavigate();
  const { openPanel, layoutController } = useProjectWorkspace();
  const layoutReady = useSyncExternalStore(layoutController.subscribe, layoutController.ready, layoutController.ready);

  useEffect(() => {
    const parameters = new URLSearchParams(location.search);
    if (!layoutReady || parameters.get(searchParameterName.workbench) !== 'files') {
      return;
    }
    openPanel('files', () => {
      parameters.delete(searchParameterName.workbench);
      const search = parameters.toString();
      void navigate(`${location.pathname}${search ? `?${search}` : ''}${location.hash}`, { replace: true });
    });
  }, [layoutReady, location.hash, location.pathname, location.search, navigate, openPanel]);

  return undefined;
}
