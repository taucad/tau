import type { ProjectManifest } from '@taucad/types';
import type { ProjectLocator } from '@taucad/filesystem';
import type { ProjectSlugs } from '#utils/project-url.utils.js';

/** Browser-profile-local revision pointer. It is meaningful only with local chats. */
export type PersistedRevisionState = {
  readonly headTurnId: string;
  readonly supersededTurnIds: string[];
  readonly dirty: boolean;
};

/** Local library state that cannot be reconstructed from portable project files. */
export type ProjectLibraryState = {
  readonly projectId: string;
  readonly lastActivityAt: number;
  readonly deletedAt?: number;
  readonly revisionState?: PersistedRevisionState;
};

/**
 * A discovered project enriched with local library state, its observed locator,
 * and the slugs its canonical `/w/…` URL is built from (blueprint L1). `slugs`
 * is absent only when the owning workspace row has vanished mid-listing.
 */
export type ProjectLibraryEntry = {
  readonly manifest: ProjectManifest;
  readonly library: ProjectLibraryState;
  readonly locator: ProjectLocator;
  readonly slugs?: ProjectSlugs;
  readonly workspaceName?: string;
};

/** Flat presentation projection used by local library and recents components. */
export type ProjectListItem = ProjectManifest & {
  readonly lastActivityAt: number;
  readonly deletedAt?: number;
  readonly locator: ProjectLocator;
  readonly slugs?: ProjectSlugs;
  readonly workspaceName?: string;
};

export const projectLibraryEntryToListItem = (entry: ProjectLibraryEntry): ProjectListItem => ({
  ...entry.manifest,
  lastActivityAt: entry.library.lastActivityAt,
  ...(entry.library.deletedAt === undefined ? {} : { deletedAt: entry.library.deletedAt }),
  locator: entry.locator,
  ...(entry.slugs === undefined ? {} : { slugs: entry.slugs }),
  ...(entry.workspaceName === undefined ? {} : { workspaceName: entry.workspaceName }),
});
