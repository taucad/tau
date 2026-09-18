/**
 * The projects this account can reach on Tau Cloud, and how one is opened here.
 *
 * `GET /v1/projects` is the only place a client learns two facts D27 introduced:
 * which projects are *collaborations* rather than the caller's own, and which
 * role the caller holds on each. Three surfaces read it — the library's *From
 * Tau Cloud* section, the Sync region's invite gate, and the invitation accept
 * route — so the fetch, the query key and the open gesture live here once
 * rather than three times under three different cache keys.
 */

import { useQuery } from '@tanstack/react-query';
import type { RemoteFacet } from '@taucad/revisions';
import { ENV } from '#environment.config.js';

/** What this account may do with a project on Tau Cloud (D27). @public */
export type ProjectRole = 'owner' | 'write' | 'read';

/**
 * What a client surface knows about this account's access, losing it included.
 *
 * `revoked` is a *settled* answer: the listing was read and this project was not
 * in it, which is what an owner's revoke looks like to a tab that is still open.
 * `undefined` is "nothing known" — signed out, offline, a failed listing, or a
 * project with no Tau remote to hold a role at all. The two must never collapse,
 * because one folds a surface away and the other says access is gone.
 *
 * @public
 */
export type ProjectAccessRole = ProjectRole | 'revoked';

/**
 * Whether a surface may still offer a push (F1, N1).
 *
 * One fact for the Sync region and the command palette alike: two surfaces
 * deriving "can this person push" from two expressions is how the palette kept
 * an enabled *Sync now* for a read collaborator the region had already folded
 * away.
 *
 * @param remote - The project's remote facet, when a projection exists.
 * @param role - The account's role on the cloud project, when one is known.
 * @returns `true` when a push would be refused, so nothing may offer one.
 * @public
 */
export const isSyncReadOnly = (remote: RemoteFacet | undefined, role: ProjectAccessRole | undefined): boolean =>
  remote?.fetchOnly === true || role === 'read' || role === 'revoked';

/**
 * One row of `GET /v1/projects`, as the client surfaces use it.
 *
 * The route also answers `updatedAt`; nothing renders a date, so it is not in
 * the type (review R7). Add it back with the copy that shows it.
 */
export type CloudProject = Readonly<{ id: string; name: string; role: ProjectRole }>;

/** One cache key for one listing: a role read here is the role the library shows. */
export const cloudProjectsQueryKey = ['cloud-projects'] as const;

const isRole = (value: unknown): value is ProjectRole => value === 'owner' || value === 'write' || value === 'read';

const toCloudProject = (value: unknown): CloudProject | undefined => {
  const row = value as Readonly<{ id?: unknown; name?: unknown; role?: unknown }>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string') {
    return undefined;
  }
  /* Before D27 this route answered the caller's own projects and nothing else,
     so an absent role means "mine". It is a *label*, never an access decision:
     every collaborator surface it gates is refused again by the API. */
  return { id: row.id, name: row.name, role: isRole(row.role) ? row.role : 'owner' };
};

/**
 * The caller's projects on Tau Cloud, or none at all.
 *
 * A device that is signed out, offline, or pointed at an API that does not
 * answer gets an empty list rather than an error: these are additions to the
 * library and to the Sync region, never preconditions for reading either.
 *
 * @returns Every project row the API answered with.
 */
export const fetchCloudProjects = async (): Promise<readonly CloudProject[]> => {
  /* Normalised like every other caller of this API (review R6): a deployment
     whose `TAU_API_URL` ends in `/` would otherwise ask for `//v1/projects`. */
  const response = await fetch(`${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/projects`, {
    credentials: 'include',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header names retain TitleCase on the wire.
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    /* Throwing rather than answering `[]` is what lets a caller tell "you have
       no projects" from "nobody asked" (N1). The library renders no section for
       either; only the role resolver needs the difference, and a silent empty
       list would have told a signed-out tab its access had been revoked. */
    throw new Error(`Tau Cloud answered ${String(response.status)}`);
  }
  const body: unknown = await response.json();
  return Array.isArray(body) ? body.map((entry) => toCloudProject(entry)).filter((entry) => entry !== undefined) : [];
};

/**
 * The shared listing query.
 *
 * @param options - `enabled` gates the request; a project with no Tau remote has
 * no cloud row to read and must not make the library's call on its behalf (N3).
 * @returns The rows, and whether the listing that produced them actually
 * answered — `isSettled` is `false` for a request that is disabled, in flight or
 * failed, and only `true` when the array is the server's own answer.
 * @public
 */
export const useCloudProjects = (
  options?: Readonly<{ enabled?: boolean }>,
): Readonly<{ projects: readonly CloudProject[]; isSettled: boolean }> => {
  const { data = [], isSuccess } = useQuery({
    queryKey: cloudProjectsQueryKey,
    queryFn: fetchCloudProjects,
    enabled: options?.enabled ?? true,
    /* The set only changes when another device backs something up or an owner
       shares one, and a window focus is when this device is most likely to have
       missed either — which is react-query's `refetchOnWindowFocus` default
       (`true`), left at its default deliberately. The stale window only stops
       rapid navigations re-asking. */
    staleTime: 30_000,
  });
  return { projects: data, isSettled: isSuccess };
};

/**
 * This account's access to one cloud project (N1, N3).
 *
 * Separate from the hook in `use-revision-status.ts` that wraps it so the rule
 * can be driven without a revision worker: the caller supplies whether the
 * project is on a Tau remote, which is the only thing that makes a cloud row
 * exist for it.
 *
 * @param projectId - The project being asked about.
 * @param isTauRemote - Whether this project's remote is the Tau one.
 * @returns The role held, `revoked` when a successful listing did not name it,
 * or `undefined` when nothing is known.
 * @public
 */
export const useProjectAccessRole = (projectId: string, isTauRemote: boolean): ProjectAccessRole | undefined => {
  const { projects, isSettled } = useCloudProjects({ enabled: isTauRemote });
  if (!isTauRemote) {
    return undefined;
  }
  const listed = projects.find((project) => project.id === projectId);
  if (listed !== undefined) {
    return listed.role;
  }
  /* Settled and absent is the owner's revoke arriving at an open tab. Unsettled
     and absent is a listing nobody has read yet, which says nothing. */
  return isSettled ? 'revoked' : undefined;
};
