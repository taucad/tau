/**
 * Indirection layer for every reason the project shell can't render
 * normal content (Audit R8). Renders inside both the desktop and mobile
 * chat shells over the dockview / viewer so the broken state is fully
 * covered — a banner approach was rejected because the dockview still
 * paints "File not found" errors underneath while the user is reading
 * the recovery copy.
 *
 * Priority (highest first):
 * 1. `ProjectNotFound` — the project itself is missing/deleted.
 * 2. `FileManagerError` — the FM machine reached its terminal `error`
 *    state (worker crash, IDB unavailable, etc.).
 * 3. `WorkspaceUnavailableRecovery` — webaccess handle missing or
 *    permission revoked (`unavailableReason !== undefined`).
 *
 * When none of the above apply, nothing renders (the dockview is fine).
 */

import { useSelector } from '@xstate/react';
import { ProjectNotFound } from '#routes/projects_.$id/project-not-found.js';
import { FileManagerError } from '#routes/projects_.$id/file-manager-error.js';
import { WorkspaceUnavailableRecovery } from '#routes/projects_.$id/workspace-unavailable-recovery.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';

type ProjectUnavailableOverlayProps = {
  readonly className?: string;
};

export function ProjectUnavailableOverlay({
  className,
}: ProjectUnavailableOverlayProps): React.JSX.Element | undefined {
  const { projectRef } = useProject();
  const isProjectError = useSelector(projectRef, (state) => state.matches('error'));
  const { fileManagerRef, unavailableReason, activeWorkspaceId, activeWorkspaceName } = useFileManager();
  const isFileManagerError = useSelector(fileManagerRef, (state) => state.matches('error'));
  const fileManagerError = useSelector(fileManagerRef, (state) => state.context.error);

  if (isProjectError) {
    return <ProjectNotFound className={className} />;
  }

  if (isFileManagerError) {
    return <FileManagerError className={className} error={fileManagerError ?? new Error('File manager failed.')} />;
  }

  if (unavailableReason) {
    return (
      <WorkspaceUnavailableRecovery
        className={className}
        reason={unavailableReason}
        workspaceId={activeWorkspaceId}
        workspaceName={activeWorkspaceName}
      />
    );
  }

  return undefined;
}
