/**
 * `/w/{workspaceSlug}/{projectSlug}` — the canonical project URL (blueprint
 * D4). Slugs resolve to the `proj_` id, and everything downstream keeps
 * receiving that id (D6).
 *
 * Never add a static segment under `/w/`: it would shadow a workspace slug
 * (F13).
 */
import type { Handle } from '#types/matches.types.js';
import { ProjectRouteProviders, projectRouteHandle } from '#routes/w.$workspace.$project/project-route.js';
import { ProjectChatRoute } from '#routes/w.$workspace.$project/project-live-sessions.js';

// Module-level for a stable component identity across HMR.
function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  return <ProjectRouteProviders>{children}</ProjectRouteProviders>;
}

export const handle: Handle = {
  ...projectRouteHandle,
  providers: () => RouteProvider,
};

export default function WorkspaceProjectRoute(): React.JSX.Element {
  return <ProjectChatRoute />;
}
