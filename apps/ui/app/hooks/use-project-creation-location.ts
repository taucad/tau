import { useCallback, useEffect, useRef, useState } from 'react';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';
import {
  checkHandlePermission,
  createWorkspace,
  getProjectCreationLocation,
  getWorkspace,
  listWorkspaces,
  requestHandlePermission,
} from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import type {
  HomeProjectCreationLocation,
  ProjectCreationLocation,
  WorkspaceProjectCreationLocation,
} from '#types/project-creation-location.types.js';
import { projectCreationLocationsEqual, projectLocationDescriptor } from '#utils/project-creation-location.utils.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { toast } from '#components/ui/sonner.js';

export type HomeLocationOption = {
  readonly location: HomeProjectCreationLocation;
  readonly status: 'ready';
  readonly label: string;
  readonly detail: string;
};

export type WorkspaceLocationOption = {
  readonly location: WorkspaceProjectCreationLocation;
  readonly status: 'connected' | 'permission' | 'disconnected';
  readonly label: string;
  readonly detail: string;
};

export type ProjectCreationLocationOption = HomeLocationOption | WorkspaceLocationOption;

export type SelectedWorkspaceRecovery =
  | { readonly kind: 'grant'; readonly run: () => Promise<void> }
  | { readonly kind: 'reconnect'; readonly run: () => Promise<void> };

type ReadyCapableState = {
  readonly phase: 'ready';
  readonly hasWebAccessCapability: true;
  readonly shouldShowPicker: true;
  readonly value: ProjectCreationLocation;
  readonly selectedOption: ProjectCreationLocationOption;
  readonly options: readonly ProjectCreationLocationOption[];
  readonly canCreate: boolean;
  readonly select: (value: ProjectCreationLocation) => void;
  readonly connectWorkspace: () => Promise<void>;
  readonly selectedWorkspaceRecovery: SelectedWorkspaceRecovery | undefined;
  readonly refresh: () => Promise<void>;
};

export type ProjectCreationLocationState =
  | {
      readonly phase: 'ready';
      readonly hasWebAccessCapability: false;
      readonly shouldShowPicker: false;
      readonly value: HomeProjectCreationLocation;
      readonly options: readonly [HomeLocationOption];
      readonly canCreate: true;
    }
  | {
      readonly phase: 'loading';
      readonly hasWebAccessCapability: true;
      readonly shouldShowPicker: true;
      readonly options: readonly never[];
      readonly canCreate: false;
    }
  | ReadyCapableState;

const homeOption: HomeLocationOption = {
  location: homeProjectCreationLocation,
  status: 'ready',
  ...projectLocationDescriptor(homeProjectCreationLocation),
};

const homeOnlyState: ProjectCreationLocationState = {
  phase: 'ready',
  hasWebAccessCapability: false,
  shouldShowPicker: false,
  value: homeProjectCreationLocation,
  options: [homeOption],
  canCreate: true,
};

const loadingState: ProjectCreationLocationState = {
  phase: 'loading',
  hasWebAccessCapability: true,
  shouldShowPicker: true,
  options: [],
  canCreate: false,
};

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

const probeWorkspaceOption = async (workspace: Workspace): Promise<WorkspaceLocationOption> => {
  const entry = await getWorkspace(workspace.workspaceId);
  const status = entry
    ? (await checkHandlePermission(entry.handle)) === 'granted'
      ? 'connected'
      : 'permission'
    : 'disconnected';
  return {
    location: { kind: 'workspace', workspaceId: workspace.workspaceId },
    status,
    ...projectLocationDescriptor({ kind: 'workspace', workspaceName: workspace.name }),
  };
};

/** Product-level creation-location state shared by every direct-create surface. */
export const useProjectCreationLocation = (): ProjectCreationLocationState => {
  const fileManager = useFileManager();
  const telemetry = useWorkspaceTelemetry();
  const [state, setState] = useState<ProjectCreationLocationState>(
    isFileSystemAccessSupported ? loadingState : homeOnlyState,
  );
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const selectedRef = useRef<ProjectCreationLocation | undefined>(undefined);
  const loadRef = useRef<(restorePreference: boolean) => Promise<void>>(async () => undefined);

  const grantWorkspace = useCallback(
    async (workspaceId: string): Promise<void> => {
      const entry = await getWorkspace(workspaceId);
      if (!entry || !(await requestHandlePermission(entry.handle))) {
        telemetry.workspaceOpenFailed({ workspaceId, reason: entry ? 'permission' : 'disconnected' });
        toast.error(entry ? 'Folder access was not granted.' : 'This folder is disconnected.');
        await loadRef.current(false);
        return;
      }
      telemetry.workspaceConnected({ workspaceId });
      await fileManager.workspace.syncProjectRoots();
      await loadRef.current(false);
    },
    [fileManager.workspace, telemetry],
  );

  const reconnectWorkspace = useCallback(
    async (workspaceId: string): Promise<void> => {
      try {
        const handle = await globalThis.window.showDirectoryPicker({
          id: `tau-workspace-${workspaceId}`,
          mode: 'readwrite',
        });
        await fileManager.workspace.replaceWorkspaceHandle(workspaceId, handle);
        telemetry.workspaceConnected({ workspaceId });
        await loadRef.current(false);
      } catch (error) {
        if (isAbortError(error)) {
          telemetry.workspaceOpenFailed({ workspaceId, reason: 'aborted' });
          return;
        }
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'unknown' });
        toast.error('Failed to reconnect the folder.');
      }
    },
    [fileManager.workspace, telemetry],
  );

  const getSelectedWorkspaceRecovery = useCallback(
    (option: ProjectCreationLocationOption): SelectedWorkspaceRecovery | undefined => {
      if (option.location.kind !== 'workspace') {
        return undefined;
      }
      const { workspaceId } = option.location;
      if (option.status === 'permission') {
        return {
          kind: 'grant',
          run: async () => {
            await grantWorkspace(workspaceId);
          },
        };
      }
      if (option.status === 'disconnected') {
        return {
          kind: 'reconnect',
          run: async () => {
            await reconnectWorkspace(workspaceId);
          },
        };
      }
      return undefined;
    },
    [grantWorkspace, reconnectWorkspace],
  );

  const select = useCallback(
    (value: ProjectCreationLocation): void => {
      selectedRef.current = value;
      setState((current) => {
        if (current.phase !== 'ready' || !current.hasWebAccessCapability) {
          return current;
        }
        const selectedOption = current.options.find((option) => projectCreationLocationsEqual(option.location, value));
        if (!selectedOption) {
          return current;
        }
        return {
          ...current,
          value,
          selectedOption,
          selectedWorkspaceRecovery: getSelectedWorkspaceRecovery(selectedOption),
          canCreate: selectedOption.status === 'ready' || selectedOption.status === 'connected',
        };
      });
    },
    [getSelectedWorkspaceRecovery],
  );

  const load = useCallback(
    async (restorePreference: boolean): Promise<void> => {
      const generation = ++generationRef.current;
      const [workspaces, preferred] = await Promise.all([
        listWorkspaces(),
        restorePreference
          ? getProjectCreationLocation({ webAccessSupported: true }).then(({ location }) => location)
          : Promise.resolve(selectedRef.current ?? homeProjectCreationLocation),
      ]);
      const workspaceOptions = await Promise.all(
        [...workspaces]
          .sort((left, right) => right.lastConnectedAt - left.lastConnectedAt)
          .map(async (workspace) => probeWorkspaceOption(workspace)),
      );
      if (!mountedRef.current || generation !== generationRef.current) {
        return;
      }
      const options = [homeOption, ...workspaceOptions] as const;
      const value = selectedRef.current ?? preferred;
      const selectedOption =
        options.find((option) => projectCreationLocationsEqual(option.location, value)) ?? homeOption;
      selectedRef.current = selectedOption.location;
      setState({
        phase: 'ready',
        hasWebAccessCapability: true,
        shouldShowPicker: true,
        value: selectedOption.location,
        selectedOption,
        options,
        canCreate: selectedOption.status === 'ready' || selectedOption.status === 'connected',
        select,
        connectWorkspace: async () => undefined,
        selectedWorkspaceRecovery: getSelectedWorkspaceRecovery(selectedOption),
        refresh: async () => undefined,
      });
    },
    [getSelectedWorkspaceRecovery, select],
  );
  loadRef.current = load;

  const connectWorkspace = useCallback(async (): Promise<void> => {
    try {
      const handle = await globalThis.window.showDirectoryPicker({ id: 'tau-workspace', mode: 'readwrite' });
      const workspace = await createWorkspace(handle);
      await fileManager.workspace.syncProjectRoots();
      if (workspace.minted) {
        telemetry.workspaceCreated({ workspaceId: workspace.workspaceId });
      }
      selectedRef.current = { kind: 'workspace', workspaceId: workspace.workspaceId };
      await loadRef.current(false);
    } catch (error) {
      if (isAbortError(error)) {
        telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'aborted' });
        return;
      }
      telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'unknown' });
      toast.error('Failed to connect the folder.');
    }
  }, [fileManager.workspace, telemetry]);

  const refresh = useCallback(async (): Promise<void> => loadRef.current(false), []);

  useEffect(() => {
    mountedRef.current = true;
    if (isFileSystemAccessSupported) {
      void loadRef.current(true);
    } else {
      void getProjectCreationLocation({ webAccessSupported: false });
    }
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  if (state.phase === 'ready' && state.hasWebAccessCapability) {
    return { ...state, connectWorkspace, refresh };
  }
  return state;
};
