/**
 * Indirection layer for every reason the project shell can't render
 * normal content (Audit R8). Renders inside both the desktop and mobile
 * chat shells over the dockview / viewer so the broken state is fully
 * covered — a banner approach was rejected because the dockview still
 * paints "File not found" errors underneath while the user is reading
 * the recovery copy.
 *
 * Priority (highest first):
 * 1. Project-machine load error.
 * 2. File-manager terminal error.
 * 3. `WorkspaceUnavailableRecovery` — webaccess handle missing or
 *    permission revoked (`unavailableReason !== undefined`).
 *
 * When none of the above apply, nothing renders (the dockview is fine).
 */

import { useSelector } from '@xstate/react';
import { ProjectLoadError } from '#routes/w.$workspace.$project/project-load-error.js';
import { WorkspaceUnavailableRecovery } from '#routes/w.$workspace.$project/workspace-unavailable-recovery.js';
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
  const projectError = useSelector(projectRef, (state) => state.context.error);
  const { fileManagerRef, unavailableReason, activeWorkspaceId, activeWorkspaceName } = useFileManager();
  const isFileManagerError = useSelector(fileManagerRef, (state) => state.matches('error'));
  const fileManagerError = useSelector(fileManagerRef, (state) => state.context.error);

  if (isProjectError) {
    return (
      <ProjectLoadError
        className={className}
        error={projectError ?? new Error('Project failed to load.')}
        onReload={() => {
          projectRef.send({ type: 'reloadProject' });
        }}
      />
    );
  }

  if (isFileManagerError) {
    return (
      <ProjectLoadError
        className={className}
        error={fileManagerError ?? new Error('File manager failed.')}
        onReload={() => {
          globalThis.location.reload();
        }}
      />
    );
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
