import type { Project, ProjectManifest, ProjectManifestParseIssue } from '@taucad/types';
import type { ProjectLocator } from '@taucad/filesystem';
import type { ProjectSlugs } from '#utils/project-url.utils.js';

/** Local library state that cannot be reconstructed from portable project files. */
export type ProjectLibraryState = {
  readonly projectId: string;
  readonly lastActivityAt: number;
  readonly deletedAt?: number;
  /** Device-local permission to share GeoSpec candidate facts; absent means off. */
  readonly syncGeoSpecCandidates?: boolean;
};

/**
 * A discovered project enriched with local library state, its observed locator,
 * and the slugs its canonical `/w/…` URL is built from (blueprint L1). `slugs`
 * is absent only when the owning workspace row has vanished mid-listing.
 */
export type ProjectLibraryEntry = {
  readonly projectId: string;
  readonly manifest: ProjectManifest;
  readonly library: ProjectLibraryState;
  readonly locator: ProjectLocator;
  readonly slugs?: ProjectSlugs;
  readonly workspaceName?: string;
  /** Why `tau.json` is degraded: the project opens from `manifest`, its normalized view, until Repair. */
  readonly issue?: ProjectManifestParseIssue;
};

/** Flat presentation projection used by local library and recents components. */
export type ProjectListItem = Project & {
  readonly lastActivityAt: number;
  readonly deletedAt?: number;
  readonly locator: ProjectLocator;
  readonly slugs?: ProjectSlugs;
  readonly workspaceName?: string;
  /** Why `tau.json` is degraded, when it is. */
  readonly manifestIssue?: ProjectManifestParseIssue;
};

export const projectLibraryEntryToListItem = (entry: ProjectLibraryEntry): ProjectListItem => ({
  ...entry.manifest,
  id: entry.projectId,
  lastActivityAt: entry.library.lastActivityAt,
  ...(entry.library.deletedAt === undefined ? {} : { deletedAt: entry.library.deletedAt }),
  locator: entry.locator,
  ...(entry.slugs === undefined ? {} : { slugs: entry.slugs }),
  ...(entry.workspaceName === undefined ? {} : { workspaceName: entry.workspaceName }),
  ...(entry.issue === undefined ? {} : { manifestIssue: entry.issue }),
});

/*
 * A project's lifecycle (W30): three axes, each answered by one owner and never inferred from another. A trashed
 * project is still on this device; a project with no cloud copy is not a network fault; storage that was revoked is
 * not a missing project.
 */

/** This device's copy: listed (`live`), in the Trash (`trashed`), or no longer held (`gone`). */
export type ProjectLocalState = 'live' | 'trashed' | 'gone';

/**
 * Tau Cloud's copy, as its last answer said: it has one (`present`), it said it has none or deleted it (`absent`),
 * nothing has answered yet (`unknown`), or the request failed (`unreachable`). Only `unreachable` is a network fault.
 */
export type ProjectCloudState = 'present' | 'absent' | 'unknown' | 'unreachable';

/** The storage that holds this device's copy: readable (`connected`), its access withdrawn (`revoked`), or not reachable now (`unavailable`). */
export type ProjectStorageState = 'connected' | 'revoked' | 'unavailable';

/** One project's lifecycle on every axis. */
export type ProjectLifecycle = Readonly<{
  local: ProjectLocalState;
  cloud: ProjectCloudState;
  storage: ProjectStorageState;
}>;

/** Which local projects a listing shows: the live ones, the Trash, or both. */
export type ProjectScope = 'live' | 'trash' | 'all';

/**
 * The local state of a listed project.
 *
 * @param project - A row of the local listing.
 * @returns `trashed` when it carries a deletion time, else `live`.
 */
export const projectLocalStateOf = (project: Pick<ProjectListItem, 'deletedAt'>): Exclude<ProjectLocalState, 'gone'> =>
  project.deletedAt === undefined ? 'live' : 'trashed';

/**
 * Whether a listed project belongs to a scope.
 *
 * @param project - A row of the local listing.
 * @param scope - The listing's scope.
 * @returns `true` when the scope shows it.
 */
export const isInProjectScope = (project: Pick<ProjectListItem, 'deletedAt'>, scope: ProjectScope): boolean => {
  if (scope === 'all') {
    return true;
  }
  return projectLocalStateOf(project) === (scope === 'trash' ? 'trashed' : 'live');
};
