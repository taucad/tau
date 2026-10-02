/**
 * Workspace-unavailable recovery leaf.
 *
 * Renders inside the `ProjectUnavailableOverlay` indirection when the
 * project's webaccess workspace can't be initialised — either because the
 * workspace itself disappeared from the handle store (handle missing) or
 * because the browser revoked read/write permission on it. Mirrors the
 * full-shell `ProjectNotFound` aesthetic (FloatingPanel) so the broken
 * editor content underneath stays completely covered (Audit R8).
 *
 * Recovery actions all call `bindProjectToWorkspace` once the user
 * clears the underlying gate (grants permission or picks a different
 * folder). That helper performs the binding transaction — writes
 * `ProjectFileSystemConfig.workspaceId` first, then dispatches
 * `reloadWorkspace` on the FM machine. The machine re-runs
 * `initializeServicesActor` against the freshly persisted record and
 * transitions back to `ready` automatically. The persistent record is
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
import { createWorkspace, getWorkspace, listWorkspaces, requestHandlePermission } from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { toast } from '#components/ui/sonner.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { cn } from '#utils/ui.utils.js';
import type { WorkspaceUnavailableReason } from '#machines/file-manager.machine.js';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select.js';
import { Label } from '#components/ui/label.js';

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
  const { bindProjectToWorkspace } = useFileManager();
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
      } else {
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'permission' });
        toast.error('Permission was not granted.');
      }
    } finally {
      setIsBusy(false);
    }
  }, [bindProjectToWorkspace, telemetry, workspaceId]);

  const handlePickAnother = useCallback(async () => {
    if (!isFileSystemAccessSupported) {
      return;
    }
    setIsBusy(true);
    try {
      const handle = await globalThis.window.showDirectoryPicker({
        id: workspaceId ? `tau-workspace-${workspaceId}` : 'tau-workspace',
        mode: 'readwrite',
      });
      const workspace = await createWorkspace(handle, { setDefault: workspaces.length === 0 });
      telemetry.workspaceCreated({ workspaceId: workspace.workspaceId, isDefault: workspaces.length === 0 });
      await bindProjectToWorkspace(workspace.workspaceId);
      toast.success(`Connected workspace "${workspace.name}"`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'aborted' });
        return;
      }
      telemetry.workspaceOpenFailed({ workspaceId, reason: 'unknown' });
      toast.error('Failed to connect workspace.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [bindProjectToWorkspace, telemetry, workspaceId, workspaces.length]);

  const handleSwitchToExisting = useCallback(async () => {
    if (!pickedWorkspaceId || pickedWorkspaceId === workspaceId) {
      return;
    }
    await bindProjectToWorkspace(pickedWorkspaceId);
  }, [bindProjectToWorkspace, pickedWorkspaceId, workspaceId]);

  const title = reason === 'permission' ? 'Workspace Access Revoked' : 'Workspace Not Connected';

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
                onConnect={handlePickAnother}
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
                            {workspace.isDefault ? ' (default)' : ''}
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
