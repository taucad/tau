import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { checkHandlePermission, getWorkspace, listWorkspaces } from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';
import type { WorkspaceDirectoryStatus } from '#constants/workspace-directory-copy.constants.js';

type UseNewProjectWorkspacePickerResult = {
  readonly workspaces: Workspace[];
  readonly selectedWorkspaceId: string | undefined;
  readonly setSelectedWorkspaceId: Dispatch<SetStateAction<string | undefined>>;
  readonly workspaceStatus: WorkspaceDirectoryStatus;
  readonly permissionRevision: number;
  readonly bumpPermissionRevision: () => void;
  readonly loadWorkspaces: () => Promise<Workspace[]>;
};

/**
 * Workspace list + selection + status probe for `/projects/new`.
 * `selectedWorkspaceId` is the single source of truth; list refresh and
 * status derivation never clobber a user pick (stale-closure safe).
 */
export const useNewProjectWorkspacePicker = (): UseNewProjectWorkspacePickerResult => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(undefined);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceDirectoryStatus>(
    isFileSystemAccessSupported ? 'missing' : 'unsupported',
  );
  const [permissionRevision, setPermissionRevision] = useState(0);
  const probeGenerationRef = useRef(0);

  const loadWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    const list = await listWorkspaces();
    setWorkspaces(list);
    return list;
  }, []);

  const bumpPermissionRevision = useCallback(() => {
    setPermissionRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    if (!isFileSystemAccessSupported) {
      return;
    }
    // async-iife: bootstrap
    void (async () => {
      const list = await loadWorkspaces();
      setSelectedWorkspaceId((current) => {
        if (current !== undefined) {
          return current;
        }
        return (list.find((workspace) => workspace.isDefault) ?? list[0])?.workspaceId;
      });
    })();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!isFileSystemAccessSupported) {
      setWorkspaceStatus('unsupported');
      return;
    }
    if (selectedWorkspaceId === undefined) {
      setWorkspaceStatus('missing');
      return;
    }
    probeGenerationRef.current += 1;
    const probeToken = probeGenerationRef.current;
    const probeWorkspace = async (): Promise<void> => {
      const entry = await getWorkspace(selectedWorkspaceId);
      if (probeToken !== probeGenerationRef.current) {
        return;
      }
      if (!entry) {
        setWorkspaceStatus('missing');
        return;
      }
      const permission = await checkHandlePermission(entry.handle);
      if (probeToken !== probeGenerationRef.current) {
        return;
      }
      setWorkspaceStatus(permission === 'granted' ? 'connected' : 'permission');
    };
    // async-iife: probe workspace status for the current selection; cancellation guarded by `probeGenerationRef`
    void probeWorkspace();
    return () => {
      probeGenerationRef.current += 1;
    };
  }, [selectedWorkspaceId, permissionRevision]);

  return {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    workspaceStatus,
    permissionRevision,
    bumpPermissionRevision,
    loadWorkspaces,
  };
};
