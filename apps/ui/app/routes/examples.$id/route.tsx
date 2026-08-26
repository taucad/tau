/**
 * `/examples/:id` — community/sample project previews (blueprint D4). These ids
 * are static content, not projects of this profile, so they get their own
 * namespace instead of sharing the `proj_` id space.
 */
import { useParams } from 'react-router';
import type { Handle } from '#types/matches.types.js';
import ProjectPreview, {
  PreviewSession,
  previewBreadcrumb,
} from '#routes/w.$workspace.$project_.preview/preview-route.js';
import { exampleUrl } from '#utils/project-url.utils.js';

function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  const { id = '' } = useParams();
  return <PreviewSession projectId={id}>{children}</PreviewSession>;
}

export const handle: Handle = {
  breadcrumb(match) {
    const { id } = match.params as { id: string };
    return previewBreadcrumb(id, exampleUrl(id));
  },
  providers: () => RouteProvider,
};

export default function ExampleRoute(): React.JSX.Element {
  return <ProjectPreview />;
}
