import type { RevisionStatusProjection } from '@taucad/revisions';
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
