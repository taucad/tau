/**
 * The projects this account holds on Tau Cloud, as rows of the one library
 * (charter D20, W11; W18 DEF-2, architecture `:453`, AC17/AC21, D27).
 *
 * A second device cannot open a project it cannot name, and the name it needs
 * is the project's id, because the id *is* the repository path on the Tau
 * Hosted Remote. `GET /v1/projects` answers the caller's own ids **and the
 * projects shared with them**. The library lists them beside this device's own
 * projects in one list: a project this device holds and Tau Cloud also holds
 * carries the Tau Cloud glyph beside its location, and one only Tau Cloud holds
 * is a row of its own whose *Open* clones it under the remote's id.
 *
 * A collaboration says whose it is before it is opened: an owned row reads
 * exactly as it always did, a shared one carries the role held on it, and a
 * view-only one says so rather than looking like a project to change.
 */

import { useEffect, useRef, useState } from 'react';
import { Cloud, Users } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Card, CardFooter, CardHeader } from '@taucad/ui/components/card';
import { tauCloudIntent, useMaterializeOnSignInLocation } from '#hooks/use-cloud-projects.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { cloudProjectStub } from '#hooks/use-open-cloud-project.js';
import { useResolvedAuth } from '#hooks/use-resolved-auth.js';
import type { ProjectListItem } from '#types/project.types.js';

/** A project only Tau Cloud holds, as a library row (D20). @public */
export type CloudOnlyRow = CloudProject & {
  readonly cloudOnly: true;
  /** `updatedAt`, so *Last Updated* sorts it among this device's projects. */
  readonly lastActivityAt: number;
  readonly description: string;
};

/** One row of the one library: this device's project (and whether Tau Cloud has it too), or Tau Cloud's alone. @public */
export type LibraryRow = (ProjectListItem & { readonly onCloud?: boolean }) | CloudOnlyRow;

/**
 * Whether a row is Tau Cloud's alone.
 *
 * @param row - A library row.
 * @returns `true` for a project this device does not hold.
 * @public
 */
export const isCloudOnly = (row: LibraryRow): row is CloudOnlyRow => 'cloudOnly' in row;

/**
 * The one list (D20): this device's projects, marked when Tau Cloud also holds
 * them, then the ones only Tau Cloud holds.
 *
 * @param projects - This device's projects.
 * @param cloud - The account's Tau Cloud listing.
 * @param includeCloudOnly - `false` in the Trash, which lists this device's projects only.
 * @returns The rows.
 * @public
 */
export const toLibraryRows = (
  projects: readonly ProjectListItem[],
  cloud: readonly CloudProject[],
  includeCloudOnly: boolean,
): LibraryRow[] => {
  const onCloud = new Set(cloud.map((entry) => entry.id));
  const held = new Set(projects.map((project) => project.id));
  return [
    ...projects.map((project) => (onCloud.has(project.id) ? { ...project, onCloud: true } : project)),
    ...(includeCloudOnly
      ? cloud
          .filter((entry) => !held.has(entry.id))
          .map(
            (entry): CloudOnlyRow => ({
              ...entry,
              cloudOnly: true,
              lastActivityAt: entry.updatedAt ?? 0,
              description: '',
            }),
          )
      : []),
  ];
};

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

const cloudOnlyLine = (entry: CloudProject): string =>
  collaborationCopy(entry.role)?.line ?? 'Backed up on Tau Cloud. This device does not have it yet.';

/**
 * The glyph a row carries when Tau Cloud holds it too: the Sync region's own
 * `Cloud`, beside the location glyph that says this device holds it.
 *
 * @returns The glyph, with its words for a screen reader.
 * @public
 */
export function OnTauCloudMark(): React.JSX.Element {
  return (
    <span data-slot='on-tau-cloud' className='flex shrink-0 items-center'>
      <Cloud aria-hidden className='size-3 shrink-0' />
      <span className='sr-only'>Also on Tau Cloud</span>
    </span>
  );
}

/**
 * *Open* for a project only Tau Cloud holds: clones it under the remote's id.
 *
 * @param props - The row and the open verb, which reports its own failure.
 * @returns The button.
 * @public
 */
export function OpenCloudProjectButton({
  entry,
  onOpen,
  className,
}: {
  readonly entry: CloudProject;
  readonly onOpen: (entry: CloudProject) => Promise<void>;
  readonly className?: string;
}): React.JSX.Element {
  const [isOpening, setIsOpening] = useState(false);
  return (
    <Button
      size='sm'
      variant='outline'
      className={className}
      disabled={isOpening}
      aria-label={`Open ${entry.name}`}
      onClick={async () => {
        setIsOpening(true);
        try {
          await onOpen(entry);
        } finally {
          setIsOpening(false);
        }
      }}
    >
      {isOpening ? 'Opening…' : 'Open'}
    </Button>
  );
}

/**
 * Where a Tau-Cloud-only row lives and whose it is: the glyph, `Tau Cloud`, and
 * the role badge on a collaboration.
 *
 * @param props - The row.
 * @returns The line.
 */
function CloudOnlyWhere({ entry }: { readonly entry: CloudProject }): React.JSX.Element {
  const shared = collaborationCopy(entry.role);
  const Glyph = shared === undefined ? Cloud : Users;
  return (
    <div className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
      <Glyph aria-hidden className='size-3 shrink-0' />
      <span className='truncate'>Tau Cloud</span>
      {shared === undefined ? undefined : <Badge variant='secondary'>{shared.badge}</Badge>}
    </div>
  );
}

/**
 * The table's name cell for a project only Tau Cloud holds.
 *
 * @param props - The row.
 * @returns The cell.
 * @public
 */
export function CloudProjectNameCell({ entry }: { readonly entry: CloudProject }): React.JSX.Element {
  return (
    <div className='flex items-center gap-3 pr-2'>
      <div className='flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'>
        <Cloud aria-hidden className='size-4' />
      </div>
      <div className='min-w-0 pl-2'>
        <div className='truncate font-medium'>{entry.name}</div>
        <CloudOnlyWhere entry={entry} />
        <div className='text-xs text-muted-foreground'>{cloudOnlyLine(entry)}</div>
      </div>
    </div>
  );
}

/**
 * The grid's card for a project only Tau Cloud holds: no thumbnail or preview,
 * because this device has no files to draw one from.
 *
 * @param props - The row and the open verb.
 * @returns The card.
 * @public
 */
export function CloudProjectCard({
  entry,
  onOpen,
}: {
  readonly entry: CloudProject;
  readonly onOpen: (entry: CloudProject) => Promise<void>;
}): React.JSX.Element {
  return (
    <Card data-slot='cloud-project-card' className='flex h-full flex-col overflow-hidden pt-0'>
      <div className='flex aspect-4/3 w-full items-center justify-center bg-muted text-muted-foreground'>
        <Cloud aria-hidden className='size-8' strokeWidth={1} />
      </div>
      <CardHeader>
        <div className='flex min-w-0 flex-col gap-1 py-1'>
          <span className='truncate text-base font-semibold'>{entry.name}</span>
          <CloudOnlyWhere entry={entry} />
          <p className='text-xs text-muted-foreground'>{cloudOnlyLine(entry)}</p>
        </div>
      </CardHeader>
      <CardFooter className='mt-auto'>
        <OpenCloudProjectButton entry={entry} onOpen={onOpen} />
      </CardFooter>
    </Card>
  );
}

/**
 * Materialize on sign-in (D20): with the setting on, every project only Tau
 * Cloud holds is created on this device, in the chosen workspace, under the
 * remote's id — the first half of *Open* — and marked so its first open
 * connects Tau Cloud and pulls, the second half.
 *
 * Once per library mount for a signed-in account; a project this device already
 * holds (trashed included) is refused by `createProject` and stays as it is.
 *
 * ponytail: files arrive on the first open's pull, not in the background — the
 * library has no revision root of its own; give it a headless one if offline
 * access before a first open matters.
 *
 * @param input - The account's Tau Cloud listing and whether it is the
 * server's own answer; this device's projects and whether they are still loading.
 * @public
 */
export const useMaterializeCloudProjects = ({
  cloud,
  isSettled,
  projects,
  isLoading,
}: Readonly<{
  cloud: readonly CloudProject[];
  isSettled: boolean;
  projects: readonly ProjectListItem[];
  isLoading: boolean;
}>): void => {
  const location = useMaterializeOnSignInLocation();
  const auth = useResolvedAuth();
  const { createProject } = useProjectManager();
  const hasRun = useRef(false);
  useEffect(() => {
    if (location === undefined || auth !== 'authed' || !isSettled || isLoading || hasRun.current) {
      return;
    }
    hasRun.current = true;
    const held = new Set(projects.map((project) => project.id));
    /* One pass, in order, so two creations never race one directory allocation. */
    const materialize = async (): Promise<void> => {
      for (const entry of cloud.filter((candidate) => !held.has(candidate.id))) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- sequential by design: each creation allocates a directory.
          await createProject({ ...cloudProjectStub(entry), location });
          tauCloudIntent.set(entry.id, 'open');
        } catch {
          /* Already on this device, or the workspace refused: the row stays Tau Cloud's. */
        }
      }
    };
    void materialize();
  }, [auth, cloud, createProject, isLoading, isSettled, location, projects]);
};
