/**
 * `/w/{workspaceSlug}/{projectSlug}` — the canonical project URL (blueprint
 * D4). Slugs resolve to the `proj_` id, and everything downstream keeps
 * receiving that id (D6).
 *
 * Never add a static segment under `/w/`: it would shadow a workspace slug
 * (F13).
 */
import { useLocation, useNavigate, useParams } from 'react-router';
import { useCallback, useRef } from 'react';
import type { Handle } from '#types/matches.types.js';
import { Loader } from '#components/ui/loader.js';
import { ProjectNotFound } from '#routes/w.$workspace.$project/project-not-found.js';
import {
  ProjectChatRoute,
  ProjectRouteProviders,
  projectRouteHandle,
} from '#routes/w.$workspace.$project/project-route.js';
import { useCanonicalProjectUrlCorrection, useProjectIdBySlugs } from '#hooks/use-project-slug-route.js';
import { projectChatIdFromSearch, projectUrl } from '#utils/project-url.utils.js';

// Module-level for a stable component identity across HMR.
function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  const { workspace = '', project = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const resolution = useProjectIdBySlugs(workspace, project);
  // An external rename invalidates the URL, not the session: keep the resolved
  // project mounted and let the correction below rewrite the address bar (D8).
  const openProjectIdRef = useRef<string>(undefined);
  if (resolution.status === 'resolved') {
    openProjectIdRef.current = resolution.value;
  }
  const projectId = resolution.status === 'resolved' ? resolution.value : openProjectIdRef.current;
  const canonicalSlugs = useCanonicalProjectUrlCorrection(projectId);
  const requestedChatId = projectChatIdFromSearch(location.search);
  const currentUrlRef = useRef(`${location.pathname}${location.search}`);
  currentUrlRef.current = `${location.pathname}${location.search}`;
  const handleFocusedChatResolved = useCallback(
    (chatId: string) => {
      const parameters = new URLSearchParams(currentUrlRef.current.split('?')[1] ?? '');
      parameters.set('chat', chatId);
      const path = projectUrl(canonicalSlugs ?? { workspaceSlug: workspace, projectSlug: project });
      const target = `${path}?${parameters.toString()}`;
      if (currentUrlRef.current !== target) {
        void navigate(target, { replace: true });
      }
    },
    [canonicalSlugs, navigate, project, workspace],
  );

  if (projectId === undefined) {
    return resolution.status === 'resolving' ? (
      <div className='flex h-full items-center justify-center' role='status' aria-label='Opening project'>
        <Loader />
      </div>
    ) : (
      <ProjectNotFound />
    );
  }

  return (
    <ProjectRouteProviders
      projectId={projectId}
      requestedChatId={requestedChatId}
      onFocusedChatResolved={handleFocusedChatResolved}
    >
      {children}
    </ProjectRouteProviders>
  );
}
/* oxlint-enable react/refs */

export const handle: Handle = {
  ...projectRouteHandle,
  providers: () => RouteProvider,
};

export default function WorkspaceProjectRoute(): React.JSX.Element {
  return <ProjectChatRoute />;
}
