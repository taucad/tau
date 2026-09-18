/**
 * *From Tau Cloud* — the projects this account can reach but this device has
 * never held (W18 DEF-2, architecture `:453`, AC17/AC21, charter D27).
 *
 * A second device cannot open a project it cannot name, and the name it needs
 * is the project's id, because the id *is* the repository path on the Tau
 * Hosted Remote. `GET /v1/projects` answers the caller's own ids **and the
 * projects shared with them**; everything this device already holds is
 * subtracted, and what is left is offered.
 *
 * A collaboration says whose it is before it is opened: an owned row reads
 * exactly as it always did, a shared one carries the role held on it, and a
 * view-only one says so rather than looking like a project to change.
 */

import { useState } from 'react';
import { Cloud, Users } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { useCloudProjects } from '#hooks/use-cloud-projects.js';
import { useOpenCloudProject } from '#hooks/use-open-cloud-project.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';
import { useProjects } from '#hooks/use-projects.js';
import { toast } from '#components/ui/sonner.js';

/** What a shared row says it is. An owned row keeps its own sentence. */
const collaborationCopy = (role: CloudProject['role']): Readonly<{ badge: string; line: string }> | undefined => {
  if (role === 'write') {
    return { badge: 'Can edit', line: 'Shared with you. This device does not have it yet.' };
  }
  if (role === 'read') {
    return { badge: 'Can view', line: 'Shared with you. You can open it but not change it.' };
  }
  return undefined;
};

/**
 * The library's *From Tau Cloud* section.
 *
 * @returns The section, or nothing when this device already holds everything.
 */
export function CloudProjects(): React.JSX.Element | undefined {
  const { projects } = useProjects();
  const openProject = useOpenCloudProject();
  const { projects: cloud } = useCloudProjects();
  const [opening, setOpening] = useState<string>();

  const held = new Set(projects.map((project) => project.id));
  const absent = cloud.filter((project) => !held.has(project.id));
  if (absent.length === 0) {
    return undefined;
  }

  const open = async (entry: CloudProject): Promise<void> => {
    setOpening(entry.id);
    try {
      await openProject(entry);
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
      {/* A list, so a row is one item a screen reader can step through rather
          than a run of sibling text (accessibility policy). */}
      <ul className='flex list-none flex-col gap-2'>
        {absent.map((entry) => {
          const shared = collaborationCopy(entry.role);
          return (
            <li key={entry.id} className='flex items-center gap-3 rounded-md border p-3'>
              {shared === undefined ? (
                <Cloud className='size-4 shrink-0 text-muted-foreground' aria-hidden />
              ) : (
                <Users className='size-4 shrink-0 text-muted-foreground' aria-hidden />
              )}
              <div className='min-w-0 flex-1'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span className='truncate font-medium'>{entry.name}</span>
                  {shared === undefined ? undefined : <Badge variant='secondary'>{shared.badge}</Badge>}
                </div>
                <div className='text-sm text-muted-foreground'>
                  {shared?.line ?? 'Backed up on Tau Cloud. This device does not have it yet.'}
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
