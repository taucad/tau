/**
 * *From Tau Cloud* — the projects this account has backed up but this device
 * has never held (W18 DEF-2, architecture `:453`, AC17/AC21).
 *
 * A second device cannot open a project it cannot name, and the name it needs
 * is the project's id, because the id *is* the repository path on the Tau
 * Hosted Remote. `GET /v1/projects` answers the caller's own ids; everything
 * this device already holds is subtracted, and what is left is offered.
 *
 * *Open* is three things in one gesture, none of them new: the project is
 * created locally **under the remote's id**, the `tau` remote is connected
 * through the same worker command the Sync region sends, and W13's open pull
 * materializes the live checkout from `refs/remotes/tau/main` — files, history,
 * named versions and the `.tau/chats` projection — with no chat turn.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Cloud } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { ENV } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjects } from '#hooks/use-projects.js';
import { toast } from '#components/ui/sonner.js';
import { projectUrl } from '#utils/project-url.utils.js';

/**
 * One row of `GET /v1/projects`, as this page uses it.
 *
 * The route also answers `updatedAt`; nothing here renders a date, so it is not
 * in the type (review R7). Add it back with the copy that shows it.
 */
type CloudProject = Readonly<{ id: string; name: string }>;

const isCloudProject = (value: unknown): value is CloudProject =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Readonly<{ id?: unknown }>).id === 'string' &&
  typeof (value as Readonly<{ name?: unknown }>).name === 'string';

/**
 * The caller's projects on Tau Cloud, or none at all.
 *
 * A device that is signed out, offline, or pointed at an API that does not
 * answer has *no* section rather than an error: this is an addition to the
 * library, never a precondition for reading it.
 *
 * @returns Every project row the API answered with.
 */
const fetchCloudProjects = async (): Promise<readonly CloudProject[]> => {
  /* Normalised like every other caller of this API (review R6): a deployment
     whose `TAU_API_URL` ends in `/` would otherwise ask for `//v1/projects`. */
  const response = await fetch(`${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/projects`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return [];
  }
  const body: unknown = await response.json();
  return Array.isArray(body) ? body.filter((entry) => isCloudProject(entry)) : [];
};

/**
 * The library's *From Tau Cloud* section.
 *
 * @returns The section, or nothing when this device already holds everything.
 */
export function CloudProjects(): React.JSX.Element | undefined {
  const { projects } = useProjects();
  const { createProject } = useProjectManager();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<string>();
  const { data: cloud = [] } = useQuery({
    queryKey: ['cloud-projects'],
    queryFn: fetchCloudProjects,
    /* The set only changes when another device backs something up, and a window
       focus is when this device is most likely to have missed one — which is
       react-query's `refetchOnWindowFocus` default (`true`), left at its
       default deliberately. The stale window only stops rapid navigations
       re-asking. */
    staleTime: 30_000,
  });

  const held = new Set(projects.map((project) => project.id));
  const absent = cloud.filter((project) => !held.has(project.id));
  if (absent.length === 0) {
    return undefined;
  }

  const open = async (entry: CloudProject): Promise<void> => {
    setOpening(entry.id);
    try {
      const created = await createProject({
        id: entry.id,
        /* Someone's own project, arriving whole: the chats come with the pull
           (W17), so creating one here would be an empty chat nobody asked for
           that the pull cannot remove and the next push offers to the account
           (review R5). */
        chat: false,
        project: {
          name: entry.name,
          description: '',
          tags: [],
          /* A placeholder for one round trip: `tau.json` is versioned, so the
             remote's own manifest — its name and the file it opens with —
             arrives with the open pull and replaces this one. */
          assets: { main: { entryPath: 'main.scad' } },
        },
        files: {},
      });
      /* The library owns the root file-manager worker, while the project route
         owns a project-scoped worker. Carry the gesture across navigation so
         the owning worker records and opens the remote; sending it here loses
         the command when the project client replaces the root client. */
      await navigate(`${projectUrl(created.slugs)}?cloudOpen=tau`, { state: { openFromTauCloud: true } });
    } catch (error) {
      toast.error(`Could not open ${entry.name} from Tau Cloud`, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setOpening(undefined);
    }
  };

  return (
    <section className='mb-6 space-y-2' aria-labelledby='from-tau-cloud'>
      <h2 id='from-tau-cloud' className='text-sm font-medium text-muted-foreground'>
        From Tau Cloud
      </h2>
      {absent.map((entry) => (
        <div key={entry.id} className='flex items-center gap-3 rounded-md border p-3'>
          <Cloud className='size-4 shrink-0 text-muted-foreground' />
          <div className='min-w-0 flex-1'>
            <div className='truncate font-medium'>{entry.name}</div>
            <div className='text-sm text-muted-foreground'>
              Backed up on Tau Cloud. This device does not have it yet.
            </div>
          </div>
          <Button
            size='sm'
            variant='outline'
            disabled={opening !== undefined}
            onClick={() => {
              void open(entry);
            }}
          >
            {opening === entry.id ? 'Opening…' : 'Open'}
          </Button>
        </div>
      ))}
    </section>
  );
}
