import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import {
  CheckCircle2,
  AlertCircle,
  Download,
  FolderArchive,
  FolderOpen,
  House,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FileSystemBackend } from '@taucad/types';
import { ExternalLink } from '#components/external-link.js';
import { Button } from '@taucad/ui/components/button';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Loader } from '#components/ui/loader.js';
import { Tree, Folder, File } from '#components/magicui/file-tree.js';
import type { TreeViewElement } from '#components/magicui/file-tree.js';
import { useFileManager, useHomeStorageBackend } from '#hooks/use-file-manager.js';
import { nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import { useProjects } from '#hooks/use-projects.js';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';
import type { Handle } from '#types/matches.types.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { checkHandlePermission, getWorkspace, listWorkspaces } from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import type { ProjectListItem } from '#types/project.types.js';
import { useProjectUrl } from '#hooks/use-project-slug-route.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { WorkspaceDirectoryStatus } from '#constants/workspace-directory-copy.constants.js';
import { toast } from '#components/ui/sonner.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import type { FileTreeNode, WorkspaceScope } from '@taucad/filesystem';
import type { WorkspaceConnectionState } from '#hooks/workspace-connection.machine.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/files'>Files</Link>
      </Button>
    );
  },
};

/**
 * One product-level Home column. Its physical engine is resolved per profile.
 */
type HomeColumnMeta = {
  label: string;
  icon: LucideIcon;
  description: string;
};

const homeColumn: HomeColumnMeta = {
  label: 'Home',
  icon: House,
  description: 'In this browser',
};

type ItemAction = {
  value: string;
  label: string;
  icon: LucideIcon;
};

const fileActions: ItemAction[] = [{ value: 'download', label: 'Download', icon: Download }];

const folderActions: ItemAction[] = [{ value: 'download-zip', label: 'Download as ZIP', icon: FolderArchive }];

const pendingTreeActionHandlers: TreeActionHandlers = {
  projectsByPath: new Map(),
  onDownloadFile: async () => undefined,
  onDownloadFolderZip: async () => undefined,
};

/** Stable cache key for the loaded-directories map. */
function makeBackendKey(backend: FileSystemBackend, workspaceId?: string): string {
  return backend === 'webaccess' && workspaceId ? `webaccess:${workspaceId}` : backend;
}

function ProjectLink({
  projectId,
  projectName,
}: {
  readonly projectId: string;
  readonly projectName: string;
}): React.JSX.Element {
  return (
    <span
      role='presentation'
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <ExternalLink
        withArrow
        isArrowOnHoverOnly
        href={useProjectUrl(projectId)}
        className='text-xs text-muted-foreground max-md:hidden'
        arrowSize='xs'
      >
        {projectName}
      </ExternalLink>
    </span>
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function FileActions({
  path,
  onDownload,
}: {
  readonly path: string;
  readonly onDownload: (path: string) => Promise<void>;
}): React.JSX.Element {
  const handleAction = useCallback(
    async (actionValue: string) => {
      if (actionValue === 'download') {
        await onDownload(path);
      }
    },
    [onDownload, path],
  );

  return (
    <ComboBoxResponsive
      groupedItems={[{ name: 'Actions', items: fileActions }]}
      getValue={(item) => item.value}
      renderLabel={(item) => (
        <div className='flex items-center gap-2'>
          <item.icon className='size-4' />
          <span>{item.label}</span>
        </div>
      )}
      title='File Actions'
      description='Choose an action for this file'
      isSearchEnabled={false}
      onSelect={handleAction}
    >
      <Button
        variant='ghost'
        size='icon'
        className='size-6 shrink-0'
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <MoreHorizontal className='size-4' />
      </Button>
    </ComboBoxResponsive>
  );
}

function FolderActions({
  path,
  onDownloadZip,
}: {
  readonly path: string;
  readonly onDownloadZip: (path: string) => Promise<void>;
}): React.JSX.Element {
  const handleAction = useCallback(
    async (actionValue: string) => {
      if (actionValue === 'download-zip') {
        await onDownloadZip(path);
      }
    },
    [onDownloadZip, path],
  );

  return (
    <ComboBoxResponsive
      groupedItems={[{ name: 'Actions', items: folderActions }]}
      getValue={(item) => item.value}
      renderLabel={(item) => (
        <div className='flex items-center gap-2'>
          <item.icon className='size-4' />
          <span>{item.label}</span>
        </div>
      )}
      title='Folder Actions'
      description='Choose an action for this folder'
      isSearchEnabled={false}
      onSelect={handleAction}
    >
      <Button
        variant='ghost'
        size='icon'
        className='size-6 shrink-0'
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <MoreHorizontal className='size-4' />
      </Button>
    </ComboBoxResponsive>
  );
}

type TreeActionHandlers = {
  onDownloadFile: (path: string) => Promise<void>;
  onDownloadFolderZip: (path: string) => Promise<void>;
  projectsByPath: Map<string, ProjectListItem>;
};

function FolderLabel({
  name,
  project,
}: {
  readonly name: string;
  readonly project?: ProjectListItem;
}): React.JSX.Element {
  return (
    <span className='inline-flex items-center gap-2'>
      <span>{name}</span>
      {project ? <ProjectLink projectId={project.id} projectName={project.name} /> : undefined}
    </span>
  );
}

function renderTree(elements: TreeViewElement[], handlers: TreeActionHandlers): React.ReactNode {
  return elements.map((element) => {
    if (element.children) {
      const project = handlers.projectsByPath.get(element.id);

      return (
        <Folder
          key={element.id}
          element={<FolderLabel name={element.name} project={project} />}
          value={element.id}
          actions={<FolderActions path={element.id} onDownloadZip={handlers.onDownloadFolderZip} />}
        >
          {renderTree(element.children, handlers)}
        </Folder>
      );
    }

    return (
      <File
        key={element.id}
        value={element.id}
        actions={<FileActions path={element.id} onDownload={handlers.onDownloadFile} />}
      >
        {element.name}
      </File>
    );
  });
}

function countProjects(elements: TreeViewElement[], projectsByPath: Map<string, ProjectListItem>): number {
  let count = 0;
  for (const element of elements) {
    if (projectsByPath.has(element.id)) {
      count += 1;
    }

    if (element.children) {
      count += countProjects(element.children, projectsByPath);
    }
  }

  return count;
}

// ============ Workspace row state ============

type WorkspaceColumnState = {
  workspace: Workspace;
  status: WorkspaceDirectoryStatus;
};

// ============ Generic column shell ============

/**
 * Common column wrapper used by Home and connected workspace columns.
 * Owns the header, refresh button, and file-tree area.
 */
function ColumnShell({
  icon: Icon,
  title,
  subtitle,
  fileTree,
  isLoading,
  isDisabled,
  emptyHint,
  unsupportedHint,
  treeActionHandlers,
  topRight,
  status,
  onRefresh,
  onExpand,
}: {
  readonly icon: LucideIcon;
  readonly title: React.ReactNode;
  readonly subtitle: React.ReactNode;
  readonly fileTree: TreeViewElement[];
  readonly isLoading: boolean;
  readonly isDisabled: boolean;
  readonly emptyHint?: string;
  readonly unsupportedHint?: string;
  readonly treeActionHandlers: TreeActionHandlers;
  readonly topRight?: React.ReactNode;
  readonly status?: React.ReactNode;
  readonly onRefresh?: () => void;
  readonly onExpand?: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className={cn('flex min-h-0 flex-col gap-3 rounded-lg border bg-card p-4', isDisabled && 'opacity-50')}>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <Icon className='size-4 shrink-0 text-muted-foreground' />
          <div className='flex min-w-0 flex-col gap-0.5'>
            <div className='flex items-center gap-2'>
              <span className='truncate text-sm font-medium'>{title}</span>
              {countProjects(fileTree, treeActionHandlers.projectsByPath) > 0 ? (
                <span className='rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'>
                  {countProjects(fileTree, treeActionHandlers.projectsByPath)}
                </span>
              ) : undefined}
            </div>
            <span className='truncate text-xs text-muted-foreground'>{subtitle}</span>
          </div>
        </div>
        <div className='flex items-center gap-1'>
          {topRight}
          {onRefresh ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  disabled={isLoading || isDisabled}
                  onClick={onRefresh}
                >
                  <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          ) : undefined}
        </div>
      </div>

      {status}

      {isDisabled ? (
        <div className='flex flex-1 items-center justify-center rounded-md border border-dashed p-6 text-sm text-muted-foreground'>
          {unsupportedHint ?? 'Not supported in this browser'}
        </div>
      ) : (
        <div className='min-h-0 flex-1 overflow-auto rounded-md border'>
          {isLoading ? (
            <div className='flex h-32 items-center justify-center'>
              <Loader className='size-6' />
            </div>
          ) : fileTree.length === 0 ? (
            <div className='flex h-32 items-center justify-center text-sm text-muted-foreground'>
              {emptyHint ?? 'No files found'}
            </div>
          ) : (
            <Tree elements={fileTree} onExpand={onExpand}>
              {renderTree(fileTree, treeActionHandlers)}
            </Tree>
          )}
        </div>
      )}
    </div>
  );
}

function WorkspaceConnectionStatus({
  state,
  onRetry,
}: {
  readonly state: Exclude<WorkspaceConnectionState, { phase: 'idle' | 'selecting' | 'registering' }>;
  readonly onRetry: () => void;
}): React.JSX.Element {
  const content =
    state.phase === 'failed'
      ? ['Could not finish connecting', state.message]
      : state.phase === 'mounting'
        ? ['Preparing workspace…', 'Making local files available to Tau']
        : state.phase === 'browsing'
          ? ['Workspace connected', 'Loading folders and projects']
          : state.phase === 'discovering'
            ? ['Reading project folders…', 'Checking each folder for tau.json']
            : state.phase === 'publishing'
              ? [
                  'Preparing project links…',
                  `${state.projectCount} ${state.projectCount === 1 ? 'project' : 'projects'} found`,
                ]
              : state.conflictCount > 0
                ? [
                    `${state.projectCount} ${state.projectCount === 1 ? 'project' : 'projects'} ready`,
                    `${state.conflictCount} ${state.conflictCount === 1 ? 'project needs' : 'projects need'} attention`,
                  ]
                : [
                    `${state.projectCount} ${state.projectCount === 1 ? 'project' : 'projects'} ready`,
                    'Starting local change monitoring',
                  ];
  return (
    <div
      role='status'
      aria-live='polite'
      className={cn(
        'flex items-center gap-2 rounded-md border bg-muted/35 px-3 py-2',
        state.phase === 'failed' && 'border-destructive/30 bg-destructive/5',
      )}
    >
      {state.phase === 'failed' ? (
        <Button variant='outline' size='sm' className='order-2 ml-auto' onClick={onRetry}>
          {state.retry === 'pick-again'
            ? 'Choose folder again'
            : state.retry === 'grant-access'
              ? 'Grant access'
              : 'Try again'}
        </Button>
      ) : state.phase === 'ready' && state.conflictCount > 0 ? (
        <AlertCircle className='text-amber-600 size-4 shrink-0' />
      ) : state.phase === 'ready' ? (
        <CheckCircle2 className='size-4 shrink-0 text-primary' />
      ) : (
        <Loader className='size-4 shrink-0' />
      )}
      <div className='min-w-0'>
        <div className='truncate text-xs font-medium'>{content[0]}</div>
        <div className='truncate text-xs text-muted-foreground'>{content[1]}</div>
      </div>
    </div>
  );
}

// ============ Main Route Component ============

export default function FilesRoute(): React.JSX.Element {
  const homeBackend = useHomeStorageBackend();
  const { client, workspace } = useFileManager();
  const { projects } = useProjects();

  // Per-cache-key (backend | webaccess:<workspaceId>) loaded directories
  const [loadedDirectories, setLoadedDirectories] = useState<Record<string, Map<string, FileTreeNode[]>>>({});
  const [rootLoading, setRootLoading] = useState<Record<string, boolean>>({});
  const inflightRef = useRef<Set<string>>(new Set());

  const [workspaceColumns, setWorkspaceColumns] = useState<WorkspaceColumnState[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | undefined>(undefined);
  const telemetry = useWorkspaceTelemetry();
  const projectManager = useProjectManager();

  const reloadWorkspaceColumns = useCallback(async (): Promise<void> => {
    try {
      const workspaces = await listWorkspaces();
      const built = await Promise.all(
        workspaces.map(async (workspace): Promise<WorkspaceColumnState> => {
          const entry = await getWorkspace(workspace.workspaceId);
          let status: WorkspaceDirectoryStatus = 'disconnected';
          if (entry) {
            const permission = await checkHandlePermission(entry.handle);
            status = permission === 'granted' ? 'connected' : 'permission';
          }
          return {
            workspace,
            status,
          };
        }),
      );
      setWorkspaceColumns(built);
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => {
    void reloadWorkspaceColumns();
  }, [reloadWorkspaceColumns]);

  /**
   * Resolve the {@link WorkspaceScope} for a column. Returns `undefined`
   * when the requested webaccess workspace isn't connected (the
   * underlying provider call would throw `MissingWorkspaceHandleError`
   * upstream — surface a typed nullable instead).
   */
  const resolveScope = useCallback(
    async (backend: FileSystemBackend, workspaceId?: string): Promise<WorkspaceScope | undefined> => {
      if (backend !== 'webaccess') {
        return backend === 'memory'
          ? { backend, storageRootKey: 'memory:files' }
          : backend === 'node'
            ? { backend, path: nodeHomeRoot() }
            : { backend };
      }
      if (!workspaceId) {
        return undefined;
      }
      const entry = await getWorkspace(workspaceId);
      if (!entry) {
        return undefined;
      }
      return {
        backend: 'webaccess',
        directoryHandle: entry.handle,
        workspaceId: entry.workspace.workspaceId,
      };
    },
    [],
  );

  const loadDirectory = useCallback(
    async (backend: FileSystemBackend, directoryPath: string, workspaceId?: string): Promise<void> => {
      const cacheKey = makeBackendKey(backend, workspaceId);
      const inflightKey = `${cacheKey}:${directoryPath}`;
      if (inflightRef.current.has(inflightKey)) {
        return;
      }
      inflightRef.current.add(inflightKey);

      try {
        const scope = await resolveScope(backend, workspaceId);
        const nodes = scope ? await client.readShallowDirectory(directoryPath, { scope }) : [];
        setLoadedDirectories((previous) => {
          const directories = new Map(previous[cacheKey] ?? []);
          directories.set(directoryPath, nodes);
          return { ...previous, [cacheKey]: directories };
        });
      } catch {
        setLoadedDirectories((previous) => {
          const directories = new Map(previous[cacheKey] ?? []);
          directories.set(directoryPath, []);
          return { ...previous, [cacheKey]: directories };
        });
      } finally {
        inflightRef.current.delete(inflightKey);
      }
    },
    [client, resolveScope],
  );

  const projectTreeForKey = useCallback(
    (cacheKey: string): TreeViewElement[] => {
      const directories = loadedDirectories[cacheKey];
      if (!directories) {
        return [];
      }

      const buildSubtree = (nodes: FileTreeNode[]): TreeViewElement[] =>
        nodes.map((node) => {
          if (node.children !== undefined) {
            const childEntries = directories.get(node.id);
            return {
              id: node.id,
              name: node.name,
              children: childEntries ? buildSubtree(childEntries) : [],
            };
          }
          return { id: node.id, name: node.name };
        });

      const rootEntries = directories.get('/');
      if (!rootEntries) {
        return [];
      }
      return buildSubtree(rootEntries);
    },
    [loadedDirectories],
  );

  const handleExpand = useCallback(
    (id: string, backend: FileSystemBackend, workspaceId?: string) => {
      const cacheKey = makeBackendKey(backend, workspaceId);
      const directories = loadedDirectories[cacheKey];
      if (directories?.has(id)) {
        return;
      }
      void loadDirectory(backend, id, workspaceId);
    },
    [loadedDirectories, loadDirectory],
  );

  const loadColumnTree = useCallback(
    async (backend: FileSystemBackend, workspaceId?: string): Promise<void> => {
      const cacheKey = makeBackendKey(backend, workspaceId);
      setRootLoading((previous) => ({ ...previous, [cacheKey]: true }));
      await loadDirectory(backend, '/', workspaceId);
      setRootLoading((previous) => ({ ...previous, [cacheKey]: false }));
    },
    [loadDirectory],
  );

  const handleRefresh = useCallback(
    (backend: FileSystemBackend, workspaceId?: string) => {
      const cacheKey = makeBackendKey(backend, workspaceId);
      for (const key of inflightRef.current) {
        if (key.startsWith(`${cacheKey}:`)) {
          inflightRef.current.delete(key);
        }
      }
      const directories = loadedDirectories[cacheKey];
      if (!directories || directories.size === 0) {
        void loadColumnTree(backend, workspaceId);
        return;
      }
      for (const directoryPath of directories.keys()) {
        void loadDirectory(backend, directoryPath, workspaceId);
      }
    },
    [loadedDirectories, loadDirectory, loadColumnTree],
  );

  // Load Home on mount; load each connected disk workspace as it appears.
  useEffect(() => {
    void loadColumnTree(homeBackend);
  }, [homeBackend, loadColumnTree]);

  useEffect(() => {
    for (const column of workspaceColumns) {
      if (column.status === 'connected') {
        void loadColumnTree('webaccess', column.workspace.workspaceId);
      }
    }
  }, [workspaceColumns, loadColumnTree]);

  // ============ Action Handlers ============

  const handleAddWorkspace = useCallback(async () => {
    if (!isFileSystemAccessSupported) {
      return;
    }
    try {
      const connected = await projectManager.connectWorkspace();
      if (connected === undefined) {
        telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'aborted' });
        return;
      }
      if (connected.minted) {
        telemetry.workspaceCreated({
          workspaceId: connected.workspace.workspaceId,
        });
      } else {
        telemetry.workspaceConnected({ workspaceId: connected.workspace.workspaceId });
      }
      await reloadWorkspaceColumns();
      toast.success(`Connected workspace "${connected.workspace.name}"`);
    } catch (error) {
      telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'unknown' });
      toast.error('Failed to connect workspace.');
      throw error;
    }
  }, [projectManager, reloadWorkspaceColumns, telemetry]);

  const handleRetryWorkspace = useCallback(async () => {
    try {
      const connected = await projectManager.retryWorkspaceConnection();
      if (connected) {
        await reloadWorkspaceColumns();
        toast.success(`Connected workspace "${connected.workspace.name}"`);
      }
    } catch {
      toast.error('Failed to connect workspace.');
    }
  }, [projectManager, reloadWorkspaceColumns]);

  const handleDisconnectWorkspace = useCallback(
    async (target: Workspace) => {
      setBusyWorkspaceId(target.workspaceId);
      let disconnected: Awaited<ReturnType<typeof workspace.disconnectWorkspace>>;
      try {
        disconnected = await workspace.disconnectWorkspace(target.workspaceId);
      } catch (error) {
        console.error('Failed to disconnect workspace:', error);
        toast.error('Failed to disconnect workspace.');
        return;
      } finally {
        setBusyWorkspaceId(undefined);
      }

      if (disconnected) {
        const invalidatedKey = makeBackendKey('webaccess', target.workspaceId);
        setLoadedDirectories((previous) => {
          const { [invalidatedKey]: _removed, ...rest } = previous;
          return rest;
        });
      }
      try {
        await reloadWorkspaceColumns();
      } catch (error) {
        console.warn('Workspace disconnected but Files refresh failed', error);
      }
      if (!disconnected) {
        return;
      }
      toast.success(`Disconnected workspace "${disconnected.workspace.name}"`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            let restored: boolean;
            try {
              restored = await workspace.restoreWorkspaceHandle(target.workspaceId, disconnected.handle);
            } catch (error) {
              console.error('Failed to undo workspace disconnect:', error);
              toast.error('Failed to reconnect workspace.');
              return;
            }
            try {
              await reloadWorkspaceColumns();
              if (restored) {
                await projectManager.refreshWorkspaceCatalog();
              }
            } catch (error) {
              console.warn('Workspace restored but Files refresh failed', error);
            }
            if (restored) {
              telemetry.workspaceConnected({ workspaceId: target.workspaceId });
            } else {
              toast.info('Workspace connection has already changed.');
            }
          },
        },
      });
    },
    [projectManager, reloadWorkspaceColumns, telemetry, workspace],
  );

  const buildTreeActionHandlers = useCallback(
    (backend: FileSystemBackend, workspaceId?: string): TreeActionHandlers => ({
      projectsByPath: new Map(
        projects
          .filter(
            (project) =>
              project.locator.backend === backend &&
              (backend !== 'webaccess' ||
                (project.locator.backend === 'webaccess' && project.locator.workspaceId === workspaceId)),
          )
          .map((project) => [project.locator.relativeDirectory, project]),
      ),
      onDownloadFile: async (path: string) => {
        const scope = await resolveScope(backend, workspaceId);
        if (!scope) {
          toast.error('Workspace is not connected.');
          return;
        }
        const content = await client.readFile(path, { scope });
        const filename = path.split('/').pop() ?? 'file';
        downloadBlob(new Blob([content]), filename);
      },
      onDownloadFolderZip: async (path: string) => {
        const scope = await resolveScope(backend, workspaceId);
        if (!scope) {
          toast.error('Workspace is not connected.');
          return;
        }
        const blob = await client.getZippedDirectory(path, { scope });
        const folderName = path.split('/').pop() ?? 'folder';
        downloadBlob(blob, `${folderName}.zip`);
      },
    }),
    [projects, resolveScope, client],
  );

  const connectionState = projectManager.workspaceConnection;
  const connectionWorkspace = 'workspace' in connectionState ? connectionState.workspace : undefined;
  const existingConnectionColumn = connectionWorkspace
    ? workspaceColumns.some(({ workspace: candidate }) => candidate.workspaceId === connectionWorkspace.workspaceId)
    : false;
  const connectionCanBrowse =
    connectionState.phase === 'browsing' ||
    connectionState.phase === 'discovering' ||
    connectionState.phase === 'publishing' ||
    connectionState.phase === 'ready' ||
    (connectionState.phase === 'failed' &&
      (connectionState.failedPhase === 'discovering' || connectionState.failedPhase === 'publishing'));
  const pendingWorkspaceColumn: WorkspaceColumnState | undefined =
    connectionWorkspace && connectionCanBrowse && !existingConnectionColumn
      ? { workspace: connectionWorkspace, status: 'connected' }
      : undefined;
  const visibleWorkspaceColumns: WorkspaceColumnState[] = [
    ...workspaceColumns.filter((column) => column.status === 'connected'),
    ...(pendingWorkspaceColumn ? [pendingWorkspaceColumn] : []),
  ];
  const showPendingColumn =
    connectionState.phase === 'selecting' ||
    connectionState.phase === 'registering' ||
    (connectionState.phase === 'failed' && connectionWorkspace === undefined) ||
    (connectionWorkspace !== undefined && !connectionCanBrowse && !existingConnectionColumn);
  const isConnectionActive =
    connectionState.phase !== 'idle' && connectionState.phase !== 'ready' && connectionState.phase !== 'failed';

  useEffect(() => {
    if (connectionWorkspace && connectionCanBrowse) {
      void loadColumnTree('webaccess', connectionWorkspace.workspaceId);
    }
  }, [connectionCanBrowse, connectionWorkspace, loadColumnTree]);

  return (
    <div className='flex h-full flex-col gap-4 px-6 py-8'>
      <div className='flex items-center justify-between gap-4'>
        <h1 className='shrink-0 text-3xl font-medium tracking-tight'>Files</h1>
      </div>

      <div className='grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-4 overflow-x-auto md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]'>
        <ColumnShell
          icon={homeColumn.icon}
          title={homeColumn.label}
          subtitle={homeColumn.description}
          fileTree={projectTreeForKey(makeBackendKey(homeBackend))}
          isLoading={rootLoading[makeBackendKey(homeBackend)] ?? false}
          isDisabled={false}
          treeActionHandlers={buildTreeActionHandlers(homeBackend)}
          onRefresh={() => {
            handleRefresh(homeBackend);
          }}
          onExpand={(id) => {
            handleExpand(id, homeBackend);
          }}
        />

        {isFileSystemAccessSupported ? (
          isLoadingWorkspaces ? (
            <div className='flex items-center justify-center rounded-lg border bg-card p-4'>
              <Loader className='size-5' />
            </div>
          ) : (
            <>
              {visibleWorkspaceColumns.map((column) => {
                const cacheKey = makeBackendKey('webaccess', column.workspace.workspaceId);
                const status =
                  connectionWorkspace?.workspaceId === column.workspace.workspaceId &&
                  connectionState.phase !== 'idle' &&
                  connectionState.phase !== 'selecting' &&
                  connectionState.phase !== 'registering' ? (
                    <WorkspaceConnectionStatus state={connectionState} onRetry={() => void handleRetryWorkspace()} />
                  ) : undefined;
                return (
                  <ColumnShell
                    key={column.workspace.workspaceId}
                    icon={FolderOpen}
                    title={column.workspace.name}
                    subtitle='On your disk'
                    fileTree={projectTreeForKey(cacheKey)}
                    isLoading={rootLoading[cacheKey] ?? false}
                    isDisabled={column.status !== 'connected'}
                    emptyHint='No projects yet'
                    treeActionHandlers={buildTreeActionHandlers('webaccess', column.workspace.workspaceId)}
                    status={status}
                    topRight={
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-7'
                            disabled={busyWorkspaceId === column.workspace.workspaceId}
                            onClick={() => void handleDisconnectWorkspace(column.workspace)}
                            aria-label='Disconnect workspace'
                          >
                            <Unplug className='size-3.5' aria-hidden />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Disconnect workspace</TooltipContent>
                      </Tooltip>
                    }
                    onRefresh={() => {
                      handleRefresh('webaccess', column.workspace.workspaceId);
                    }}
                    onExpand={(id) => {
                      handleExpand(id, 'webaccess', column.workspace.workspaceId);
                    }}
                  />
                );
              })}

              {showPendingColumn ? (
                <ColumnShell
                  icon={FolderOpen}
                  title={
                    connectionState.phase === 'registering'
                      ? connectionState.workspaceName
                      : connectionState.phase === 'failed'
                        ? (connectionState.workspaceName ?? connectionWorkspace?.name ?? 'Workspace connection failed')
                        : (connectionWorkspace?.name ?? 'Choose a workspace folder')
                  }
                  subtitle='On your disk'
                  fileTree={[]}
                  isLoading={connectionState.phase !== 'failed'}
                  isDisabled={false}
                  treeActionHandlers={pendingTreeActionHandlers}
                  status={
                    connectionState.phase === 'registering' || connectionState.phase === 'selecting' ? (
                      <div
                        role='status'
                        aria-live='polite'
                        className='flex items-center gap-2 rounded-md border bg-muted/35 px-3 py-2'
                      >
                        <Loader className='size-4 shrink-0' />
                        <div>
                          <div className='text-xs font-medium'>
                            {connectionState.phase === 'selecting'
                              ? 'Choose a workspace folder'
                              : `Connecting “${connectionState.workspaceName}”…`}
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {connectionState.phase === 'selecting'
                              ? 'Browser folder picker is open'
                              : 'Saving access to this folder'}
                          </div>
                        </div>
                      </div>
                    ) : connectionState.phase === 'idle' ? undefined : (
                      <WorkspaceConnectionStatus state={connectionState} onRetry={() => void handleRetryWorkspace()} />
                    )
                  }
                />
              ) : undefined}

              {!isConnectionActive && connectionState.phase !== 'failed' ? (
                <button
                  type='button'
                  className='flex min-h-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50'
                  onClick={handleAddWorkspace}
                >
                  <Plus className='size-5' />
                  <span className='font-medium'>Add Workspace</span>
                  <span className='text-xs'>Connect another folder on your computer</span>
                </button>
              ) : undefined}
            </>
          )
        ) : undefined}
      </div>
    </div>
  );
}
