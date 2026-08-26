/**
 * Slug ↔ `proj_` id resolution for the `/w/{workspaceSlug}/{projectSlug}` route
 * grammar (blueprint D4/D5/D11).
 *
 * Both directions read the discovery listing, which already carries each
 * project's slugs (L1), so an external directory rename corrects itself on the
 * next listing refresh (D8) without any extra bookkeeping. Matching is
 * case-insensitive because the filesystems Tau targets are (F3), and the
 * project slug is the literal directory basename — Tau slugifies only the names
 * it generates.
 */

import { useEffect } from 'react';
import { idPrefix } from '@taucad/types/constants';
import { useProjects } from '#hooks/use-projects.js';
import type { ProjectListItem } from '#types/project.types.js';
import type { ProjectSlugs } from '#utils/project-url.utils.js';
import { projectUrl, projectUrlOr } from '#utils/project-url.utils.js';
import { legacyWorkspaceSlugTombstones } from '#filesystem/handle-store.js';

const equalsFolded = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase();
const isWorkspaceId = (value: string): boolean => value.startsWith(`${idPrefix.workspace}_`);
const isProjectId = (value: string): boolean => value.startsWith(`${idPrefix.project}_`);

type RouteProject = Pick<ProjectListItem, 'id' | 'locator' | 'slugs'>;

/** Resolve either URL segment by slug or durable id, rejecting old engine slugs. */
export function resolveProjectRoute(
  projects: readonly RouteProject[],
  workspaceSegment: string,
  projectSegment: string,
): string | undefined {
  if (legacyWorkspaceSlugTombstones.some((slug) => equalsFolded(slug, workspaceSegment))) {
    return undefined;
  }

  return projects.find((candidate) => {
    if (!candidate.slugs) {
      return false;
    }
    const workspaceMatches = isWorkspaceId(workspaceSegment)
      ? candidate.locator.backend === 'webaccess' && candidate.locator.workspaceId === workspaceSegment
      : equalsFolded(candidate.slugs.workspaceSlug, workspaceSegment);
    const projectMatches = isProjectId(projectSegment)
      ? candidate.id === projectSegment
      : equalsFolded(candidate.slugs.projectSlug, projectSegment);
    return workspaceMatches && projectMatches;
  })?.id;
}

/** Resolution outcome. `resolving` must not render a not-found. */
export type SlugResolution<T> =
  | { readonly status: 'resolving' }
  | { readonly status: 'resolved'; readonly value: T }
  | { readonly status: 'not-found' };

/** Canonical slugs for a project id, for redirects and URL correction. */
export function useProjectSlugs(projectId: string | undefined): SlugResolution<ProjectSlugs> {
  // Trashed projects still resolve: the route gate owns the "restore" UI.
  const { projects, isLoading } = useProjects({ includeDeleted: true });
  if (isLoading) {
    return { status: 'resolving' };
  }
  const slugs = projects.find((candidate) => candidate.id === projectId)?.slugs;
  return slugs ? { status: 'resolved', value: slugs } : { status: 'not-found' };
}

/**
 * Canonical project URL for surfaces that hold only an id (usage rows, the
 * files browser). Falls back to the library while discovery has not placed the
 * project — never a legacy `/projects/:id` URL (L1).
 */
export function useProjectUrl(projectId: string | undefined): string {
  const slugs = useProjectSlugs(projectId);
  return projectUrlOr(slugs.status === 'resolved' ? slugs.value : undefined);
}

/**
 * Keep the address bar on the open project's canonical URL (D8). A directory
 * renamed outside Tau changes the slug but not the `tau.json` id, so discovery
 * re-points the config and the next listing refresh lands here.
 *
 * @param projectId - The open project, once resolved.
 * @param suffix - Path appended to the canonical project URL (e.g. `/preview`).
 */
export function useCanonicalProjectUrlCorrection(projectId: string | undefined, suffix = ''): void {
  const canonical = useProjectSlugs(projectId);
  const target = canonical.status === 'resolved' ? `${projectUrl(canonical.value)}${suffix}` : undefined;
  useEffect(() => {
    if (target !== undefined && globalThis.location.pathname !== target) {
      globalThis.history.replaceState(globalThis.history.state, '', target);
    }
  }, [target]);
}

/** `proj_` id addressed by slug or id segments in the `/w/` grammar. */
export function useProjectIdBySlugs(workspaceSlug: string, projectSlug: string): SlugResolution<string> {
  const { projects, isLoading } = useProjects({ includeDeleted: true });
  if (isLoading) {
    return { status: 'resolving' };
  }
  const projectId = resolveProjectRoute(projects, workspaceSlug, projectSlug);
  return projectId ? { status: 'resolved', value: projectId } : { status: 'not-found' };
}
