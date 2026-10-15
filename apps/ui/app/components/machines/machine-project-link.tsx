import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { MachineJob } from '@taucad/runtime/machine';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { machineJobProjectUrl } from '#utils/machine-url.utils.js';

/** Resolve the durable project id through current placement, never an obsolete id-addressed route. */
export function MachineProjectLink({
  job,
  hostId,
}: {
  readonly job: MachineJob;
  readonly hostId: string;
}): React.JSX.Element {
  const { getProjectListing, isLoading } = useProjectManager();
  const listing = useQuery({
    queryKey: ['projects'],
    queryFn: async ({ signal }) => {
      const value = await getProjectListing({ includeDeleted: true });
      signal.throwIfAborted();
      return value;
    },
    enabled: !isLoading,
    staleTime: 3000,
  });
  const project = listing.data?.projects.find((candidate) => candidate.manifest.id === job.artifact.projectId);
  if (listing.isPending) {
    return (
      <span role='status' className='text-xs text-muted-foreground'>
        Finding source project for {job.program.name}…
      </span>
    );
  }
  if (listing.isError || project?.slugs === undefined || project.library.deletedAt !== undefined) {
    return (
      <span className='text-xs'>
        Source project{' '}
        {listing.isError
          ? 'could not be loaded'
          : project?.library.deletedAt === undefined
            ? 'is unavailable on this computer'
            : 'is in the trash'}
        .{' '}
        <Link className='underline' to='/projects'>
          Open projects
        </Link>
      </span>
    );
  }
  return (
    <Link
      className='text-xs underline underline-offset-4'
      to={machineJobProjectUrl(project.slugs, { hostId, machineId: job.machineId }, job.jobId)}
    >
      Open {project.manifest.name} · {job.program.name}
    </Link>
  );
}
