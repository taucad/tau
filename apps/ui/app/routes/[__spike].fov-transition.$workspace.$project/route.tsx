import { useParams } from 'react-router';
import { getEnvironment } from '#environment.config.js';
import type { Handle } from '#types/matches.types.js';
import { Loader } from '#components/ui/loader.js';
import { ProjectNotFound } from '#routes/w.$workspace.$project/project-not-found.js';
import { PreviewSession } from '#routes/w.$workspace.$project_.preview/preview-route.js';
import { useProjectIdBySlugs } from '#hooks/use-project-slug-route.js';
import FovTransitionSpike from '#routes/[__spike].fov-transition.$workspace.$project/fov-transition-spike.js';

export const loader = async (): Promise<undefined> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses Response for route control flow.
    throw new Response('Not found', { status: 404 });
  }
  return undefined;
};

export function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  const { workspace = '', project = '' } = useParams();
  const resolution = useProjectIdBySlugs(workspace, project);

  if (resolution.status === 'resolving') {
    return (
      <div role='status' aria-label='Resolving project' className='flex h-dvh items-center justify-center'>
        <Loader className='size-16 text-primary' />
      </div>
    );
  }

  if (resolution.status !== 'resolved') {
    return <ProjectNotFound />;
  }

  return <PreviewSession projectId={resolution.value}>{children}</PreviewSession>;
}

export const handle: Handle = {
  enablePageWrapper: false,
  providers: () => RouteProvider,
};

export default function FovTransitionSpikeRoute(): React.JSX.Element {
  return <FovTransitionSpike />;
}
