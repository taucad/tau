/**
 * The only place project URLs are built. Raw `'/projects/' + id` templates are
 * banned — the canonical grammar is `/w/{workspaceSlug}/{projectSlug}`
 * (blueprint D4), and both segments must be percent-encoded because a project
 * slug is the literal directory name (D11). There is no id-addressed fallback:
 * `/projects/:id` ceased to exist (L1/L2).
 */

import type { ProjectLocator } from '@taucad/filesystem';
import type { Workspace } from '#filesystem/handle-store.js';

/** The two segments of a canonical project URL. */
export type ProjectSlugs = {
  readonly workspaceSlug: string;
  readonly projectSlug: string;
};

/** The project library — where a surface points when it cannot name a project. */
export const projectLibraryUrl = '/projects';

/** Stable, system-owned identity of the built-in workspace. */
export const homeWorkspaceSlug = 'home';

/** Canonical project URL. `projectSlug` is the literal directory basename. */
export const projectUrl = ({ workspaceSlug, projectSlug }: ProjectSlugs): string =>
  `/w/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(projectSlug)}`;

/** Canonical preview URL for a discovered project. */
export const projectPreviewUrl = (slugs: ProjectSlugs): string => `${projectUrl(slugs)}/preview`;

/**
 * Canonical URL when the slugs are known, the library otherwise. Surfaces fed
 * by activity/usage rows can paint before discovery has resolved a project's
 * location; they link to the library rather than to a URL that no longer routes.
 */
export const projectUrlOr = (slugs: ProjectSlugs | undefined): string =>
  slugs ? projectUrl(slugs) : projectLibraryUrl;

/** Physical directory basename — the `{projectSlug}` URL segment. */
export const directorySlug = (relativeDirectory: string): string =>
  relativeDirectory.split('/').findLast(Boolean) ?? relativeDirectory;

/** Physical directory basename of a discovered project. */
export const projectSlugOf = (locator: ProjectLocator): string => directorySlug(locator.relativeDirectory);

/**
 * Workspace slug owning a discovered project. Both browser engines are the
 * physical implementation of the single system-owned Home workspace.
 */
export const workspaceSlugOf = (locator: ProjectLocator, workspaces: readonly Workspace[]): string | undefined =>
  locator.backend === 'webaccess'
    ? workspaces.find((workspace) => workspace.workspaceId === locator.workspaceId)?.slug
    : homeWorkspaceSlug;

/** Canonical slugs for a discovered project, or `undefined` when its workspace is unknown. */
export const projectSlugsOf = (locator: ProjectLocator, workspaces: readonly Workspace[]): ProjectSlugs | undefined => {
  const workspaceSlug = workspaceSlugOf(locator, workspaces);
  return workspaceSlug === undefined ? undefined : { workspaceSlug, projectSlug: projectSlugOf(locator) };
};

/** Static community/sample project preview (blueprint D4 examples namespace). */
export const exampleUrl = (exampleId: string): string => `/examples/${encodeURIComponent(exampleId)}`;
