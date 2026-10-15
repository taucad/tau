/** `/w/{workspaceSlug}/{projectSlug}/preview` — preview for an owned project. */
import { useParams } from 'react-router';
import { useState } from 'react';
import type { Handle } from '#types/matches.types.js';
import { Loader } from '@taucad/ui/components/loader';
import { ProjectNotFound } from '#routes/w.$workspace.$project/project-not-found.js';
import ProjectPreview, { PreviewSession } from '#routes/w.$workspace.$project_.preview/preview-route.js';
import { useCanonicalProjectUrlCorrection, useProjectIdBySlugs } from '#hooks/use-project-slug-route.js';

function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  const { workspace = '', project = '' } = useParams();
  const resolution = useProjectIdBySlugs(workspace, project);
  const [openProjectId, setOpenProjectId] = useState<string>();
  if (resolution.status === 'resolved' && resolution.value !== openProjectId) {
    setOpenProjectId(resolution.value);
  }
  const projectId = resolution.status === 'resolved' ? resolution.value : openProjectId;
  useCanonicalProjectUrlCorrection(projectId, '/preview');

  if (projectId === undefined) {
    return resolution.status === 'resolving' ? (
      <div
        role='status'
        aria-label='Loading preview'
        aria-busy='true'
        className='flex h-full items-center justify-center'
      >
        <Loader className='size-16 text-primary' />
      </div>
    ) : (
      <ProjectNotFound />
    );
  }

  return <PreviewSession projectId={projectId}>{children}</PreviewSession>;
}

export const handle: Handle = {
  providers: () => RouteProvider,
};

export default function WorkspaceProjectPreviewRoute(): React.JSX.Element {
  return <ProjectPreview />;
}
