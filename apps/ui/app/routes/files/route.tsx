import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import {
  Database,
  Download,
  FolderArchive,
  FolderOpen,
  HardDrive,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FileSystemBackend, Project } from '@taucad/types';
import { ExternalLink } from '#components/external-link.js';
import { Button } from '#components/ui/button.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Loader } from '#components/ui/loader.js';
import { Tree, Folder, File } from '#components/magicui/file-tree.js';
import type { TreeViewElement } from '#components/magicui/file-tree.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { coerceFilesystemBackendCookie } from '#components/filesystem/backend-selector.js';
import { useProjects } from '#hooks/use-projects.js';
import { cookieName } from '#constants/cookie.constants.js';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';
import type { Handle } from '#types/matches.types.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';
import {
  checkHandlePermission,
  createWorkspace,
  forgetWorkspace,
  getWorkspace,
  listProjectsForWorkspace,
  listWorkspaces,
  requestHandlePermission,
  setDefaultWorkspace,
  updateWorkspaceHandle,
} from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { WorkspaceDirectoryPanel } from '#components/filesystem/workspace-directory-panel.js';
import type { WorkspaceDirectoryStatus } from '#constants/workspace-directory-copy.constants.js';
import { toast } from '#components/ui/sonner.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import type { FileTreeNode, WorkspaceScope } from '@taucad/filesystem';
import { parentDirectory } from '@taucad/utils/path';

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
 * Column meta for non-webaccess backends. Webaccess columns are produced
 * per-workspace (see `workspaceColumns` below).
 */
type FixedColumnMeta = {
  key: 'indexeddb' | 'opfs';
  label: string;
  icon: LucideIcon;
  description: string;
  isSupported: boolean;
};

const fixedColumns: FixedColumnMeta[] = [
  {
    key: 'indexeddb',
    label: 'IndexedDB',
    icon: Database,
    description: 'Browser database storage',
    isSupported: true,
  },
  {
    key: 'opfs',
    label: 'OPFS',
    icon: HardDrive,
    description: 'Origin Private File System',
    isSupported: typeof navigator !== 'undefined' && 'storage' in navigator,
  },
];

type ItemAction = {
  value: string;
  label: string;
  icon: LucideIcon;
  variant?: 'default' | 'destructive';
};

const fileActions: ItemAction[] = [
  { value: 'download', label: 'Download', icon: Download },
  { value: 'delete', label: 'Delete', icon: Trash2, variant: 'destructive' },
];

const folderActions: ItemAction[] = [
  { value: 'download-zip', label: 'Download as ZIP', icon: FolderArchive },
  {
    value: 'delete',
    label: 'Delete Directory',
    icon: Trash2,
    variant: 'destructive',
  },
];

/** Stable cache key for the loaded-directories map. */
function makeBackendKey(backend: FileSystemBackend, workspaceId?: string): string {
  return backend === 'webaccess' && workspaceId ? `webaccess:${workspaceId}` : backend;
}

function extractProjectId(path: string): string | undefined {
  const match = /^\/projects\/([^/]+)$/.exec(path);
  return match?.[1];
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
        href={`/projects/${projectId}`}
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
  onDelete,
  onDownload,
}: {
  readonly path: string;
  readonly onDelete: (path: string) => Promise<void>;
  readonly onDownload: (path: string) => Promise<void>;
}): React.JSX.Element {
  const handleAction = useCallback(
    async (actionValue: string) => {
      if (actionValue === 'delete') {
        await onDelete(path);
      } else if (actionValue === 'download') {
        await onDownload(path);
      }
    },
    [onDelete, onDownload, path],
  );

  return (
    <ComboBoxResponsive
      groupedItems={[{ name: 'Actions', items: fileActions }]}
      getValue={(item) => item.value}
      renderLabel={(item) => (
        <div
          className={cn(
            'flex items-center gap-2',
            item.variant === 'destructive' && 'text-destructive [&>svg]:text-destructive!',
          )}
        >
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
  onDelete,
  onDownloadZip,
}: {
  readonly path: string;
  readonly onDelete: (path: string) => Promise<void>;
  readonly onDownloadZip: (path: string) => Promise<void>;
}): React.JSX.Element {
  const handleAction = useCallback(
    async (actionValue: string) => {
      if (actionValue === 'delete') {
        await onDelete(path);
      } else if (actionValue === 'download-zip') {
        await onDownloadZip(path);
      }
    },
    [onDelete, onDownloadZip, path],
  );

  return (
    <ComboBoxResponsive
      groupedItems={[{ name: 'Actions', items: folderActions }]}
      getValue={(item) => item.value}
      renderLabel={(item) => (
        <div
          className={cn(
            'flex items-center gap-2',
            item.variant === 'destructive' && 'text-destructive [&>svg]:text-destructive!',
          )}
        >
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
  onDeleteFile: (path: string) => Promise<void>;
  onDownloadFile: (path: string) => Promise<void>;
  onDeleteFolder: (path: string) => Promise<void>;
  onDownloadFolderZip: (path: string) => Promise<void>;
  projectsMap: Map<string, Project>;
};

function FolderLabel({ name, project }: { readonly name: string; readonly project?: Project }): React.JSX.Element {
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
      const projectId = extractProjectId(element.id);
      const project = projectId ? handlers.projectsMap.get(projectId) : undefined;

      return (
        <Folder
          key={element.id}
          element={<FolderLabel name={element.name} project={project} />}
          value={element.id}
          actions={
            <FolderActions
              path={element.id}
              onDelete={handlers.onDeleteFolder}
              onDownloadZip={handlers.onDownloadFolderZip}
            />
          }
        >
          {renderTree(element.children, handlers)}
        </Folder>
      );
    }

    return (
      <File
        key={element.id}
        value={element.id}
        actions={
          <FileActions path={element.id} onDelete={handlers.onDeleteFile} onDownload={handlers.onDownloadFile} />
        }
      >
        {element.name}
      </File>
    );
  });
}

function countProjects(elements: TreeViewElement[]): number {
  let count = 0;
  for (const element of elements) {
    if (element.name.startsWith('proj_')) {
      count += 1;
    }

    if (element.children) {
      count += countProjects(element.children);
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
 * Common column wrapper used by both fixed (indexeddb/opfs) and
 * per-workspace columns. Owns the header, default-toggle, refresh
 * button, and the file-tree area.
 */
function ColumnShell({
  icon: Icon,
  title,
  subtitle,
  isDefault,
  defaultTooltip,
  fileTree,
  isLoading,
  isDisabled,
  emptyHint,
  unsupportedHint,
  treeActionHandlers,
  topRight,
  body,
  onRefresh,
  onSetDefault,
  onExpand,
}: {
  readonly icon: LucideIcon;
  readonly title: React.ReactNode;
  readonly subtitle: React.ReactNode;
  readonly isDefault: boolean;
  readonly defaultTooltip: string;
  readonly fileTree: TreeViewElement[];
  readonly isLoading: boolean;
  readonly isDisabled: boolean;
  readonly emptyHint?: string;
  readonly unsupportedHint?: string;
  readonly treeActionHandlers: TreeActionHandlers;
  readonly topRight?: React.ReactNode;
  readonly body?: React.ReactNode;
  readonly onRefresh?: () => void;
  readonly onSetDefault?: () => void;
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
              {countProjects(fileTree) > 0 ? (
                <span className='rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'>
                  {countProjects(fileTree)}
                </span>
              ) : undefined}
            </div>
            <span className='truncate text-xs text-muted-foreground'>{subtitle}</span>
          </div>
        </div>
        <div className='flex items-center gap-1'>
          {topRight}
          {onSetDefault ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className={cn('size-7', isDefault && 'text-primary')}
                  disabled={isDisabled}
                  onClick={onSetDefault}
                >
                  <Star className={cn('size-3.5', isDefault && 'fill-primary')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{defaultTooltip}</TooltipContent>
            </Tooltip>
          ) : undefined}
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

      {body}

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

// ============ Main Route Component ============

export default function FilesRoute(): React.JSX.Element {
  const [rawBackendCookie, setBackendCookie] = useCookie(cookieName.filesystemBackend, 'indexeddb');
  const backendCookie = coerceFilesystemBackendCookie(rawBackendCookie);
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

  const projectsMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  const reloadWorkspaceColumns = useCallback(async (): Promise<void> => {
    try {
      const workspaces = await listWorkspaces();
      const built = await Promise.all(
        workspaces.map(async (workspace): Promise<WorkspaceColumnState> => {
          const entry = await getWorkspace(workspace.workspaceId);
          let status: WorkspaceDirectoryStatus = 'missing';
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
        return { backend };
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

  // Load fixed columns on mount; load each connected workspace column as
  // permission flips to `connected`.
  useEffect(() => {
    for (const column of fixedColumns) {
      if (column.isSupported) {
        void loadColumnTree(column.key);
      }
    }
  }, [loadColumnTree]);

  useEffect(() => {
    for (const column of workspaceColumns) {
      if (column.status === 'connected') {
        void loadColumnTree('webaccess', column.workspace.workspaceId);
      }
    }
  }, [workspaceColumns, loadColumnTree]);

  // ============ Action Handlers ============

  const handleSetDefaultBackend = useCallback(
    (backend: FileSystemBackend) => {
      if (backend === 'webaccess' && !workspaceColumns.some((column) => column.status === 'connected')) {
        toast.error('Connect a workspace folder first.');
        return;
      }
      setBackendCookie(backend);
    },
    [setBackendCookie, workspaceColumns],
  );

  const handleAddWorkspace = useCallback(async () => {
    if (!isFileSystemAccessSupported) {
      return;
    }
    try {
      const handle = await globalThis.window.showDirectoryPicker({
        id: 'tau-workspace',
        mode: 'readwrite',
      });
      const workspace = await createWorkspace(handle, { setDefault: workspaceColumns.length === 0 });
      telemetry.workspaceCreated({ workspaceId: workspace.workspaceId, isDefault: workspaceColumns.length === 0 });
      await reloadWorkspaceColumns();
      toast.success(`Connected workspace "${handle.name}"`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'aborted' });
        return;
      }
      telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'unknown' });
      toast.error('Failed to connect workspace.');
      throw error;
    }
  }, [reloadWorkspaceColumns, telemetry, workspaceColumns.length]);

  const handleChangeWorkspaceFolder = useCallback(
    async (workspaceId: string) => {
      if (!isFileSystemAccessSupported) {
        return;
      }
      setBusyWorkspaceId(workspaceId);
      try {
        const handle = await globalThis.window.showDirectoryPicker({
          id: `tau-workspace-${workspaceId}`,
          mode: 'readwrite',
        });
        await updateWorkspaceHandle(workspaceId, handle);
        // Drop both the worker-side standalone provider cache (keyed
        // by `workspaceId`, Audit R6 / Finding 9) and the route-level
        // tree cache for this workspace before reloading the column
        // — otherwise the next read continues to use the stale handle.
        await workspace.invalidateStandaloneProvider('webaccess', workspaceId);
        telemetry.workspaceConnected({ workspaceId });
        const invalidatedKey = makeBackendKey('webaccess', workspaceId);
        setLoadedDirectories((previous) => {
          const { [invalidatedKey]: _removed, ...rest } = previous;
          return rest;
        });
        await reloadWorkspaceColumns();
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          telemetry.workspaceOpenFailed({ workspaceId, reason: 'aborted' });
          return;
        }
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'unknown' });
        toast.error('Failed to change workspace folder.');
        throw error;
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [reloadWorkspaceColumns, telemetry, workspace],
  );

  const handleGrantWorkspaceAccess = useCallback(
    async (workspaceId: string) => {
      setBusyWorkspaceId(workspaceId);
      try {
        const entry = await getWorkspace(workspaceId);
        if (!entry) {
          return;
        }
        const granted = await requestHandlePermission(entry.handle);
        if (granted) {
          telemetry.workspaceConnected({ workspaceId });
        } else {
          telemetry.workspaceOpenFailed({ workspaceId, reason: 'permission' });
          toast.error('Permission was not granted.');
        }
        await reloadWorkspaceColumns();
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [reloadWorkspaceColumns, telemetry],
  );

  const handleForgetWorkspace = useCallback(
    async (workspaceId: string) => {
      setBusyWorkspaceId(workspaceId);
      try {
        const bound = await listProjectsForWorkspace(workspaceId);
        if (bound.length > 0) {
          toast.error(
            `Cannot forget — ${bound.length} project${bound.length === 1 ? '' : 's'} still bound to this workspace.`,
          );
          return;
        }
        await forgetWorkspace(workspaceId);
        await workspace.invalidateStandaloneProvider('webaccess', workspaceId);
        const invalidatedKey = makeBackendKey('webaccess', workspaceId);
        setLoadedDirectories((previous) => {
          const { [invalidatedKey]: _removed, ...rest } = previous;
          return rest;
        });
        await reloadWorkspaceColumns();
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [reloadWorkspaceColumns, workspace],
  );

  const handleSetDefaultWorkspace = useCallback(
    async (workspaceId: string) => {
      setBusyWorkspaceId(workspaceId);
      try {
        await setDefaultWorkspace(workspaceId);
        await reloadWorkspaceColumns();
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [reloadWorkspaceColumns],
  );

  /**
   * Reload the parent directory inside the column whose scope owns the
   * mutation, so the UI reflects the deletion without re-fetching the
   * other columns. Cross-column staleness is acceptable because the
   * other columns reference different storage backends entirely.
   */
  const invalidateColumn = useCallback(
    (parentPath: string, backend: FileSystemBackend, workspaceId?: string) => {
      void loadDirectory(backend, parentPath, workspaceId);
    },
    [loadDirectory],
  );

  const buildTreeActionHandlers = useCallback(
    (backend: FileSystemBackend, workspaceId?: string): TreeActionHandlers => ({
      projectsMap,
      onDeleteFile: async (path: string) => {
        const scope = await resolveScope(backend, workspaceId);
        if (!scope) {
          toast.error('Workspace is not connected.');
          return;
        }
        await client.unlink(path, { scope });
        invalidateColumn(parentDirectory(path), backend, workspaceId);
      },
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
      onDeleteFolder: async (path: string) => {
        const scope = await resolveScope(backend, workspaceId);
        if (!scope) {
          toast.error('Workspace is not connected.');
          return;
        }
        await client.rmdir(path, { scope, recursive: true });
        invalidateColumn(parentDirectory(path), backend, workspaceId);
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
    [projectsMap, resolveScope, client, invalidateColumn],
  );

  const isWebAccessDefault = backendCookie === 'webaccess';

  return (
    <div className='flex h-full flex-col gap-4 px-6 py-8'>
      <div className='flex items-center justify-between gap-4'>
        <h1 className='shrink-0 text-3xl font-medium tracking-tight'>Files</h1>
      </div>

      <div className='grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-4 overflow-x-auto md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]'>
        {fixedColumns.map((column) => {
          const cacheKey = makeBackendKey(column.key);
          return (
            <ColumnShell
              key={column.key}
              icon={column.icon}
              title={column.label}
              subtitle={column.description}
              isDefault={backendCookie === column.key}
              defaultTooltip={backendCookie === column.key ? 'Default storage' : 'Set as default storage'}
              fileTree={projectTreeForKey(cacheKey)}
              isLoading={rootLoading[cacheKey] ?? false}
              isDisabled={!column.isSupported}
              treeActionHandlers={buildTreeActionHandlers(column.key)}
              onRefresh={() => {
                handleRefresh(column.key);
              }}
              onSetDefault={() => {
                handleSetDefaultBackend(column.key);
              }}
              onExpand={(id) => {
                handleExpand(id, column.key);
              }}
            />
          );
        })}

        {isFileSystemAccessSupported ? (
          isLoadingWorkspaces ? (
            <div className='flex items-center justify-center rounded-lg border bg-card p-4'>
              <Loader className='size-5' />
            </div>
          ) : (
            <>
              {workspaceColumns.map((column) => {
                const cacheKey = makeBackendKey('webaccess', column.workspace.workspaceId);
                return (
                  <ColumnShell
                    key={column.workspace.workspaceId}
                    icon={FolderOpen}
                    title={column.workspace.name}
                    subtitle='Local folder on your computer'
                    isDefault={isWebAccessDefault && column.workspace.isDefault}
                    defaultTooltip={
                      isWebAccessDefault && column.workspace.isDefault
                        ? 'Default workspace'
                        : 'Set as default workspace'
                    }
                    fileTree={projectTreeForKey(cacheKey)}
                    isLoading={rootLoading[cacheKey] ?? false}
                    isDisabled={column.status !== 'connected'}
                    emptyHint='No projects yet'
                    treeActionHandlers={buildTreeActionHandlers('webaccess', column.workspace.workspaceId)}
                    body={
                      column.status === 'connected' ? undefined : (
                        <WorkspaceDirectoryPanel
                          variant='banner'
                          status={column.status}
                          workspaceId={column.workspace.workspaceId}
                          workspaceName={column.workspace.name}
                          isBusy={busyWorkspaceId === column.workspace.workspaceId}
                          onConnect={async () => {
                            await handleChangeWorkspaceFolder(column.workspace.workspaceId);
                          }}
                          onGrantAccess={async () => {
                            await handleGrantWorkspaceAccess(column.workspace.workspaceId);
                          }}
                        />
                      )
                    }
                    topRight={
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-7'
                            disabled={busyWorkspaceId === column.workspace.workspaceId}
                            onClick={() => void handleForgetWorkspace(column.workspace.workspaceId)}
                          >
                            <Trash2 className='size-3.5' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Forget workspace</TooltipContent>
                      </Tooltip>
                    }
                    onRefresh={() => {
                      handleRefresh('webaccess', column.workspace.workspaceId);
                    }}
                    onSetDefault={() => {
                      if (!isWebAccessDefault) {
                        setBackendCookie('webaccess');
                      }
                      void handleSetDefaultWorkspace(column.workspace.workspaceId);
                    }}
                    onExpand={(id) => {
                      handleExpand(id, 'webaccess', column.workspace.workspaceId);
                    }}
                  />
                );
              })}

              <button
                type='button'
                className='flex min-h-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50'
                onClick={handleAddWorkspace}
              >
                <Plus className='size-5' />
                <span className='font-medium'>Add Workspace</span>
                <span className='text-xs'>Connect another folder on your computer</span>
              </button>
            </>
          )
        ) : undefined}
      </div>
    </div>
  );
}
