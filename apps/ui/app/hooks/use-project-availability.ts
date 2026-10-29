import type { LargeObjectsFacet, RevisionStatusProjection } from '@taucad/revisions';
import { useProject } from '#hooks/use-project.js';
import { useRevisionStatus } from '#hooks/use-revision-status.js';
import { canOpenCloudProject, useTauCloudIntent } from '#hooks/use-cloud-projects.js';

/** First-open readiness comes from the durable gesture and the worker's acknowledged checkout. */
export type ProjectAvailability =
  | 'ready'
  | 'connecting'
  | 'downloading'
  | 'preparing'
  | 'offline'
  | 'failed'
  | 'account';

/** Never equate an empty local checkout with an authoritative missing file. */
export function projectAvailability(
  isPending: boolean,
  status: Pick<RevisionStatusProjection, 'sync' | 'remote'> | undefined,
  canOpen = true,
): ProjectAvailability {
  if (!isPending) {
    return 'ready';
  }
  if (!canOpen) {
    return 'account';
  }
  if (status?.sync.hasAppliedRemote === true) {
    return 'preparing';
  }
  if (status?.sync.online === false) {
    return 'offline';
  }
  if (status?.sync.pullPhase === 'applying') {
    return 'preparing';
  }
  if (status?.sync.pullPhase === 'fetching') {
    return 'downloading';
  }
  if (
    status?.sync.state === 'failed' ||
    status?.sync.state === 'queued' ||
    status?.sync.state === 'conflicted' ||
    status?.remote.phase === 'reconnectRequired' ||
    status?.remote.phase === 'failed'
  ) {
    return 'failed';
  }
  return 'connecting';
}

/** Shared readiness for every pane; no local timer or second synchronization store. */
export function useProjectAvailability(): ProjectAvailability {
  const { projectId } = useProject();
  const intent = useTauCloudIntent(projectId);
  return projectAvailability(intent === 'open', useRevisionStatus(), canOpenCloudProject(projectId));
}

/**
 * What a model surface waits for: the project first, then every large object.
 *
 * The operator's "open the UI, model waits": code, files and chats open once
 * the checkout is written, while a file whose large object has not arrived
 * still holds its pointer. A render over a pointer would be partial geometry,
 * so the viewer, and everything else that runs the kernel, waits for them all.
 */
export type ModelAvailability = ProjectAvailability | 'files' | 'filesFailed';

/** {@link ModelAvailability} from the project's availability and its large-object facet. */
export function modelAvailability(
  project: ProjectAvailability,
  largeObjects: Pick<LargeObjectsFacet, 'phase'> | undefined,
): ModelAvailability {
  if (project !== 'ready' || largeObjects === undefined) {
    return project;
  }
  return largeObjects.phase === 'failed' ? 'filesFailed' : 'files';
}

/** Shared readiness for the viewer and the other kernel surfaces. */
export function useModelAvailability(): ModelAvailability {
  const project = useProjectAvailability();
  return modelAvailability(project, useRevisionStatus()?.largeObjects);
}

/**
 * Whether one file still waits for its large object.
 *
 * Such a file holds its pointer on disk; it is shown loading and never opened
 * as text, so its pointer is never read, edited or saved as its content.
 *
 * @param path - The checkout-relative path.
 * @returns `true` until its bytes are written.
 */
export function useLargeObjectPending(path: string | undefined): boolean {
  const paths = useRevisionStatus()?.largeObjects?.paths;
  return path !== undefined && (paths?.includes(path) ?? false);
}

/** The large-object facet itself, for the one surface that draws its progress. */
export function useLargeObjects(): LargeObjectsFacet | undefined {
  return useRevisionStatus()?.largeObjects;
}
