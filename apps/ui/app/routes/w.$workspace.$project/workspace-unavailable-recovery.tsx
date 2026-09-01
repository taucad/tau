/**
 * Workspace-unavailable recovery leaf.
 *
 * Renders inside the `ProjectUnavailableOverlay` indirection when the
 * project's webaccess workspace can't be initialised — because its metadata
 * is missing, its handle was disconnected, or browser permission was revoked.
 * Mirrors the
 * full-shell FloatingPanel aesthetic so the broken
 * editor content underneath stays completely covered (Audit R8).
 *
 * Reconnecting a deliberately disconnected workspace replaces only its
 * handle, then reloads the existing project binding. Picking a different
 * workspace still uses `bindProjectToWorkspace`. The persistent record is
 * the only authority for the project ↔ workspace binding — see
 * `docs/policy/filesystem-policy.md` Rule 13b.
 */

import { useCallback, useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import {
  FloatingPanel,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
} from '#components/ui/floating-panel.js';
import { WorkspaceDirectoryPanel } from '#components/filesystem/workspace-directory-panel.js';
import { getWorkspace, listWorkspaces, requestHandlePermission } from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { toast } from '#components/ui/sonner.js';
import { isWorkspaceIdentityConflictError, workspaceIdentityConflictCopy } from '#filesystem/workspace-errors.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { cn } from '@taucad/ui/utils/cn';
import type { WorkspaceUnavailableReason } from '#machines/file-manager.machine.js';
import { webAccessDirectoryPicker } from '#constants/browser.constants.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { Label } from '@taucad/ui/components/label';
import { useProjectManager } from '#hooks/use-project-manager.js';

type WorkspaceUnavailableRecoveryProps = {
  readonly reason: WorkspaceUnavailableReason;
  readonly workspaceId: string | undefined;
  readonly workspaceName: string | undefined;
  readonly className?: string;
};

export function WorkspaceUnavailableRecovery({
  reason,
  workspaceId,
  workspaceName,
  className,
}: WorkspaceUnavailableRecoveryProps): React.JSX.Element {
  const { bindProjectToWorkspace, fileManagerRef, workspace } = useFileManager();
  const projectManager = useProjectManager();
  const telemetry = useWorkspaceTelemetry();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState<string | undefined>(workspaceId);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    // async-iife: bootstrap
    void (async () => {
      const list = await listWorkspaces();
      setWorkspaces(list);
    })();
  }, []);

  const handleGrantAccess = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setIsBusy(true);
    try {
      const entry = await getWorkspace(workspaceId);
      if (!entry) {
        toast.error('Workspace metadata is missing. Pick a different folder below.');
        return;
      }
      const granted = await requestHandlePermission(entry.handle);
      if (granted) {
        telemetry.workspaceConnected({ workspaceId });
        await bindProjectToWorkspace(workspaceId);
        await projectManager.refreshWorkspaceCatalog();
      } else {
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'permission' });
        toast.error('Permission was not granted.');
      }
    } finally {
      setIsBusy(false);
    }
  }, [bindProjectToWorkspace, projectManager, telemetry, workspaceId]);

  const handlePickAnother = useCallback(async () => {
    if (!webAccessDirectoryPicker()) {
      return;
    }
    setIsBusy(true);
    try {
      const connected = await projectManager.connectWorkspace();
      if (connected === undefined) {
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'aborted' });
        return;
      }
      if (connected.minted) {
        telemetry.workspaceCreated({ workspaceId: connected.workspace.workspaceId });
      }
      await bindProjectToWorkspace(connected.workspace.workspaceId);
      await projectManager.refreshWorkspaceCatalog();
      toast.success(`Connected workspace "${connected.workspace.name}"`);
    } catch (error) {
      telemetry.workspaceOpenFailed({ workspaceId, reason: 'unknown' });
      toast.error('Failed to connect workspace.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [bindProjectToWorkspace, projectManager, telemetry, workspaceId]);

  const handleReconnect = useCallback(async () => {
    const picker = webAccessDirectoryPicker();
    if (!picker || !workspaceId) {
      return;
    }
    setIsBusy(true);
    try {
      const handle = await picker.pick({ id: `tau-workspace-${workspaceId}`, mode: 'readwrite' });
      if (handle === undefined) {
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'aborted' });
        return;
      }
      await workspace.replaceWorkspaceHandle(workspaceId, handle);
      fileManagerRef.send({ type: 'reloadWorkspace' });
      await projectManager.refreshWorkspaceCatalog();
      telemetry.workspaceConnected({ workspaceId });
      toast.success(`Connected workspace "${workspaceName ?? handle.name}"`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'aborted' });
        return;
      }
      telemetry.workspaceOpenFailed({ workspaceId, reason: 'unknown' });
      toast.error(
        isWorkspaceIdentityConflictError(error) ? workspaceIdentityConflictCopy : 'Failed to reconnect workspace.',
      );
      console.error('Failed to reconnect workspace:', error);
    } finally {
      setIsBusy(false);
    }
  }, [fileManagerRef, projectManager, telemetry, workspace, workspaceId, workspaceName]);

  const handleSwitchToExisting = useCallback(async () => {
    if (!pickedWorkspaceId || pickedWorkspaceId === workspaceId) {
      return;
    }
    await bindProjectToWorkspace(pickedWorkspaceId);
    await projectManager.refreshWorkspaceCatalog();
  }, [bindProjectToWorkspace, pickedWorkspaceId, projectManager, workspaceId]);

  const title =
    reason === 'permission'
      ? 'Workspace Access Revoked'
      : reason === 'disconnected'
        ? 'Workspace Disconnected'
        : 'Workspace Not Connected';

  return (
    <div className={cn('absolute inset-0 z-20', className)}>
      <FloatingPanel isOpen side='right' align='start'>
        <FloatingPanelContent>
          <FloatingPanelContentHeader>
            <FloatingPanelContentTitle>{title}</FloatingPanelContentTitle>
          </FloatingPanelContentHeader>

          <FloatingPanelContentBody className='flex items-start justify-center p-6'>
            <div className='flex w-full max-w-md animate-in flex-col gap-4 duration-300 fade-in'>
              <div className='flex items-center justify-center'>
                <div className='flex size-16 items-center justify-center rounded-full bg-muted/50 dark:bg-muted/30'>
                  <FolderOpen className='size-8 text-muted-foreground' />
                </div>
              </div>

              <WorkspaceDirectoryPanel
                variant='inline'
                status={reason}
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                isBusy={isBusy}
                onConnect={reason === 'disconnected' ? handleReconnect : handlePickAnother}
                onGrantAccess={reason === 'permission' ? handleGrantAccess : undefined}
              />

              {workspaces.length > 1 ? (
                <div className='flex flex-col gap-1.5'>
                  <Label className='text-xs text-muted-foreground'>Or switch to another workspace</Label>
                  <div className='flex items-center gap-2'>
                    <Select
                      value={pickedWorkspaceId}
                      onValueChange={(value) => {
                        setPickedWorkspaceId(value);
                      }}
                    >
                      <SelectTrigger className='flex-1'>
                        <SelectValue placeholder='Pick a workspace' />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaces.map((workspace) => (
                          <SelectItem key={workspace.workspaceId} value={workspace.workspaceId}>
                            {workspace.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type='button'
                      className='inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50'
                      disabled={!pickedWorkspaceId || pickedWorkspaceId === workspaceId || isBusy}
                      onClick={handleSwitchToExisting}
                    >
                      Switch
                    </button>
                  </div>
                </div>
              ) : undefined}
            </div>
          </FloatingPanelContentBody>
        </FloatingPanelContent>
      </FloatingPanel>
    </div>
  );
}
