import { useCallback } from 'react';
import { getWorkspace, requestHandlePermission } from '#filesystem/handle-store.js';
import { isWorkspaceDirectoryRequiredError } from '#filesystem/workspace-errors.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { projectCreationLocationErrorCopy } from '#utils/project-creation-location.utils.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { toast } from '#components/ui/sonner.js';

/** Presents one canonical recovery path while leaving retry and source state to the caller. */
export const useProjectCreationLocationError = (): ((error: unknown) => boolean) => {
  const fileManager = useFileManager();
  const telemetry = useWorkspaceTelemetry();

  return useCallback(
    (error: unknown): boolean => {
      if (!isWorkspaceDirectoryRequiredError(error)) {
        return false;
      }
      telemetry.projectCreateWebaccessBlocked({ reason: error.code });
      const copy = projectCreationLocationErrorCopy(error.code);

      if (error.code === 'permission' && error.workspaceId) {
        const { workspaceId } = error;
        toast.error(copy.message, {
          action: {
            label: copy.actionLabel,
            onClick: async () => {
              try {
                const entry = await getWorkspace(workspaceId);
                if (!entry || !(await requestHandlePermission(entry.handle))) {
                  toast.error('Folder access was not granted.');
                  return;
                }
                await fileManager.workspace.syncProjectRoots();
                toast.success('Folder access restored. Try creating the project again.');
              } catch (grantError) {
                console.error('Failed to restore folder access:', grantError);
                toast.error('Folder access could not be restored.');
              }
            },
          },
        });
        return true;
      }

      if (error.code === 'missing' || error.code === 'disconnected' || error.code === 'permission') {
        toast.error(copy.message, {
          action: {
            label: 'Manage locations',
            onClick: () => {
              globalThis.window.open('/files', '_blank', 'noopener,noreferrer');
            },
          },
        });
        return true;
      }

      toast.error(copy.message);
      return true;
    },
    [fileManager.workspace, telemetry],
  );
};
