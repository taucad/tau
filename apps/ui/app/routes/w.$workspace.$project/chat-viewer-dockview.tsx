import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import type {
  DockviewApi,
  DockviewGroupPanel,
  DockviewReadyEvent,
  DockviewDidDropEvent,
  IDockviewHeaderActionsProps,
  IDockviewPanelProps,
  IWatermarkPanelProps,
} from 'dockview-react';
import { positionToDirection } from 'dockview-react';
import { withViewField } from '@taucad/workbench';
import type { ViewFieldPath, WorkbenchView } from '@taucad/workbench';
import { Box } from 'lucide-react';
import type { CapabilitiesManifest } from '@taucad/runtime';
import { sourcePathMatchesExtensions } from '@taucad/utils/file';
import type { FileEntry } from '@taucad/types';
import { idPrefix, tauFileDragMime, tauEditorPanelDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { mintViewRecordId } from '#workbench-records/converters.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';
import { exceptionsForView, viewExceptions, viewExceptionsStore } from '#workbench-records/view-exceptions.js';
import { graphicsSettingsForView, newViewRecord } from '@taucad/workbench-panes/records/view-record';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import type { FileSelectorDataSource } from '@taucad/workbench-panes/files/file-selector';
import { FileExtensionIcon } from '@taucad/ui-kit/icons/file-extension-icon';
import { useProject } from '#hooks/use-project.js';
import { useModelAvailability } from '#hooks/use-project-availability.js';
import { useFileTreeMap } from '#hooks/use-file-tree.js';
import { ChatViewer } from '#routes/w.$workspace.$project/chat-viewer.js';
import { chooseProjection } from '#routes/w.$workspace.$project/chat-viewer-projection-picker.js';
import { Dockview } from '#components/panes/dockview.js';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { DockviewEmptyAction, DockviewEmptyCloseAction } from '#components/panes/dockview-empty-action.js';
import { getViewerTabIcon, ViewerDockviewTab } from '#components/panes/viewer-tab-context-menu.js';
import { DockviewLeftActions, DockviewFileActionProvider } from '#components/panes/dockview-open-file-action.js';
import { ProjectWorkspaceActions } from '#routes/w.$workspace.$project/project-workspace-actions.js';
import { ViewerChatLaneToggle } from '#routes/w.$workspace.$project/chat-lane-toggle.js';
import { selectCadEvaluation } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { ActorRefFrom } from 'xstate';
import { setLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { useTourAnchor } from '#components/tour/tour-anchors.js';
import {
  createViewerAdapterFactsPort,
  ensureViewerGroup,
  isViewerPanelParameters,
  selectViewerDockAdapter,
  viewSourceOf,
} from '#workbench-records/viewer-adapter.js';
import type {
  ViewerAdapterFacts,
  ViewerAdapterPorts,
  ViewerDockReady,
  ViewerDockReleased,
  ViewerPanelParameters,
  ViewSource,
} from '#workbench-records/viewer-adapter.js';

type ViewerNewTabParameters = { mode: 'launcher' };
type ViewerProfile = 'editor' | 'shared';

function getDragDataTransfer(event: DragEvent | PointerEvent): DataTransfer | undefined {
  return 'dataTransfer' in event ? (event.dataTransfer ?? undefined) : undefined;
}

/**
 * Viewer panel component rendered inside each Dockview panel.
 */
function ViewerPanel({
  properties,
  profile,
}: {
  readonly properties: IDockviewPanelProps<ViewerPanelParameters>;
  readonly profile: ViewerProfile;
}): React.JSX.Element | undefined {
  const { viewId, entryPath } = properties.params;
  const viewerAnchor = useTourAnchor('viewer');
  const subscribeVisibility = useCallback(
    (onChange: () => void) => {
      const subscription = properties.api.onDidVisibilityChange(onChange);
      return () => {
        subscription.dispose();
      };
    },
    [properties.api],
  );
  const isVisible = useSyncExternalStore(
    subscribeVisibility,
    () => properties.api.isVisible,
    () => true,
  );
  return isVisible ? (
    /* The product tour's Look around tip hangs from this viewer's corner; the first viewer on the page is used. */
    <div ref={viewerAnchor} className='size-full'>
      <ChatViewer viewId={viewId} entryPath={entryPath} panelApi={properties.api} profile={profile} />
    </div>
  ) : undefined;
}

export function createViewerNewTab({
  api,
  group,
  id = generatePrefixedId(idPrefix.pane),
}: {
  readonly api: DockviewApi;
  readonly group?: DockviewGroupPanel;
  readonly id?: string;
}): void {
  api.addPanel({
    id,
    component: 'newTab',
    title: 'Viewer',
    params: { mode: 'launcher' },
    ...(group ? { position: { direction: 'within', referenceGroup: group } } : {}),
  });
}

export function replaceViewerNewTabWithFile({
  api,
  placeholderId,
  path,
  viewId = mintViewRecordId(),
  onViewCreated,
}: {
  readonly api: DockviewApi;
  readonly placeholderId: string;
  readonly path: string;
  readonly viewId?: string;
  readonly onViewCreated: (viewId: string, path: string) => void;
}): void {
  const placeholder = api.panels.find((panel) => panel.id === placeholderId);
  if (!placeholder) {
    return;
  }

  const { group } = placeholder.api;
  const index = group.panels.findIndex((panel) => panel.id === placeholderId);
  api.addPanel({
    id: viewId,
    component: 'viewer',
    title: path.split('/').pop() ?? path,
    params: { viewId, entryPath: path },
    position: { direction: 'within', referenceGroup: group, ...(index === -1 ? {} : { index }) },
  });
  onViewCreated(viewId, path);
  placeholder.api.close();
}

export function handleViewerDrop<Source>({
  event,
  getViewSource,
  onViewCreated,
}: {
  readonly event: DockviewDidDropEvent;
  /** The view a new one is made from, read when the view is made. */
  readonly getViewSource: () => Source;
  readonly onViewCreated: (viewId: string, entryPath: string, source: Source) => void;
}): void {
  const dataTransfer = getDragDataTransfer(event.nativeEvent);
  const addViewer = (entryPath: string): void => {
    const viewId = mintViewRecordId();
    event.api.addPanel({
      id: viewId,
      component: 'viewer',
      title: entryPath.split('/').pop() ?? entryPath,
      params: { viewId, entryPath },
      position: {
        direction: positionToDirection(event.position),
        referenceGroup: event.group ?? undefined,
      },
    });
    onViewCreated(viewId, entryPath, getViewSource());
  };

  const editorData = dataTransfer?.getData(tauEditorPanelDragMime);
  if (editorData) {
    try {
      const { filePath } = JSON.parse(editorData) as { filePath?: string };
      if (filePath) {
        addViewer(filePath);
      }
    } catch {
      // Ignore corrupt cross-dockview data.
    }
    return;
  }

  const fileData = dataTransfer?.getData(tauFileDragMime);
  if (!fileData) {
    return;
  }

  let paths: string[];
  try {
    paths = JSON.parse(fileData) as string[];
  } catch {
    return;
  }
  const filePath = paths[0];
  if (!filePath) {
    return;
  }

  const existing = event.group?.panels.find(
    (panel) => (panel.params as ViewerPanelParameters | undefined)?.entryPath === filePath,
  );
  if (existing) {
    existing.api.setActive();
    return;
  }
  addViewer(filePath);
}

/**
 * Empty state shown when all viewer panels have been closed.
 */
export type ViewerSelectableFile = Pick<FileEntry, 'name' | 'path'> & { readonly size?: number };

export const viewerExcludedSourceSuffixes = ['.geospec.ts', '.geospec.js'] as const;

const isProjectViewerEntry = (entry: Pick<FileEntry, 'provenance'>): boolean =>
  entry.provenance === undefined || entry.provenance.source === 'project';

const isViewerSourcePath = (path: string, capabilities: Pick<CapabilitiesManifest, 'registrations'>): boolean =>
  !viewerExcludedSourceSuffixes.some((suffix) => path.toLowerCase().endsWith(suffix)) &&
  capabilities.registrations.some(
    (registration) => registration.kind === 'kernel' && sourcePathMatchesExtensions(path, registration.extensions),
  );

export const listViewerSelectableFiles = (
  fileTree: ReadonlyMap<string, FileEntry>,
  capabilities: Pick<CapabilitiesManifest, 'registrations'>,
): ViewerSelectableFile[] =>
  [...fileTree.values()]
    .filter(
      (entry) => entry.type === 'file' && isProjectViewerEntry(entry) && isViewerSourcePath(entry.path, capabilities),
    )
    .map(({ name, path, size }) => ({ name, path, size }))
    .sort((a, b) => a.path.localeCompare(b.path));

/** Browse and search the project's authority, including directories the visible tree has never expanded. */
export function createViewerFileDataSource(
  tree: Pick<FileTreeService, 'listDirectory' | 'searchFilesDebounced' | 'getTreeSnapshot'> | undefined,
  capabilities: Pick<CapabilitiesManifest, 'registrations'> | undefined,
  revision = 0,
): FileSelectorDataSource & { readonly revision: number } {
  return {
    revision,
    async loadDirectory(path) {
      if (!tree || !capabilities) {
        return [];
      }
      const entries = await tree.listDirectory(path);
      const snapshot = tree.getTreeSnapshot();
      return entries.filter(
        (entry) =>
          isProjectViewerEntry(snapshot.get(entry.path) ?? {}) &&
          (entry.isFolder || isViewerSourcePath(entry.path, capabilities)),
      );
    },
    async searchFiles(query) {
      if (!tree || !capabilities) {
        return [];
      }
      const entries = await tree.searchFilesDebounced(query, {
        maxResults: 100,
        includeDirectories: false,
        caller: 'quick-open',
      });
      if (entries.length === 100) {
        throw new Error('Refine your search or browse folders to see supported files.');
      }
      return entries
        .filter(
          (entry) =>
            entry.type === 'file' && isProjectViewerEntry(entry) && isViewerSourcePath(entry.path, capabilities),
        )
        .map(({ name, path, size }) => ({ name, path, size, isFolder: false }));
    },
  };
}

function useViewerCapabilities() {
  const { geometryUnits, mainEntryPath } = useProject();
  return useSelector(geometryUnits.get(mainEntryPath), (state) => state?.context.capabilities);
}

function useViewerFileDataSource(): FileSelectorDataSource {
  const tree = useOptionalFileManager()?.treeService;
  const capabilities = useViewerCapabilities();
  const revision = useSyncExternalStore(
    useCallback((listener: () => void) => tree?.subscribeTree(listener) ?? (() => undefined), [tree]),
    useCallback(() => tree?.completeTreeVersion ?? 0, [tree]),
    () => 0,
  );
  return useMemo(() => createViewerFileDataSource(tree, capabilities, revision), [tree, capabilities, revision]);
}

function useViewerSelectableFiles(): ViewerSelectableFile[] | undefined {
  const fileTree = useFileTreeMap();
  const capabilities = useViewerCapabilities();

  return useMemo(
    () => (capabilities ? listViewerSelectableFiles(fileTree, capabilities) : undefined),
    [fileTree, capabilities],
  );
}

export function ViewerEmptyFilePicker({
  files,
  onSelect,
  onClose,
  closeLabel = 'Close tab',
}: {
  readonly files: readonly ViewerSelectableFile[] | undefined;
  readonly onSelect: (path: string) => void;
  readonly onClose?: () => void;
  readonly closeLabel?: string;
}): React.JSX.Element {
  const isScrollable = (files?.length ?? 0) >= 10;

  return (
    <div className='flex w-full max-w-lg flex-col gap-2'>
      {files === undefined ? (
        <p className='px-3 py-2 text-center text-xs text-muted-foreground'>Loading runtime formats…</p>
      ) : files.length === 0 ? (
        <p className='px-3 py-2 text-center text-xs text-muted-foreground'>No runtime-supported viewer files found.</p>
      ) : (
        <div
          data-testid='viewer-empty-file-list'
          className={
            isScrollable
              ? 'flex max-h-[clamp(4rem,calc(100cqh-8rem),22rem)] flex-col gap-2 overflow-y-auto pr-1'
              : 'flex flex-col gap-2'
          }
        >
          {files.map((file) => (
            <DockviewEmptyAction
              key={file.path}
              title={file.path}
              onClick={() => {
                onSelect(file.path);
              }}
            >
              <FileExtensionIcon filename={file.name} className='size-3.5 shrink-0' />
              <span className='truncate'>{file.name}</span>
              <span aria-hidden className='ml-auto text-xs text-muted-foreground'>
                Open
              </span>
            </DockviewEmptyAction>
          ))}
        </div>
      )}
      {onClose ? <DockviewEmptyCloseAction onClick={onClose}>{closeLabel}</DockviewEmptyCloseAction> : null}
    </div>
  );
}

function ViewerEmptyState({
  containerApi,
  group,
  placeholderId,
  onClose,
  closeLabel,
}: {
  readonly containerApi: DockviewApi;
  readonly group?: DockviewGroupPanel;
  readonly placeholderId?: string;
  readonly onClose?: () => void;
  readonly closeLabel?: string;
}): React.JSX.Element {
  const { projectRef, entriesRecord } = useProject();
  const viewCommands = useWorkbenchViewCommands();
  const files = useViewerSelectableFiles();

  const handleSelect = useCallback(
    (path: string) => {
      const onViewCreated = (viewId: string, entryPath: string): void => {
        void viewCommands.edit(viewId, (current) => current ?? newViewRecord(entryPath));
        projectRef.send({
          type: 'createGeometryUnit',
          entryPath,
          operationTimeout: entriesRecord?.entries[entryPath]?.renderTimeout,
        });
      };

      if (placeholderId) {
        replaceViewerNewTabWithFile({ api: containerApi, placeholderId, path, onViewCreated });
        return;
      }

      const viewId = mintViewRecordId();
      containerApi.addPanel({
        id: viewId,
        component: 'viewer',
        title: path.split('/').pop() ?? path,
        params: { viewId, entryPath: path },
        ...(group ? { position: { direction: 'within', referenceGroup: group } } : {}),
      });
      onViewCreated(viewId, path);
    },
    [containerApi, entriesRecord, group, placeholderId, projectRef, viewCommands],
  );

  return (
    <PanelEmptyState
      icon={Box}
      title='Choose a file to view'
      description='Select a design file below, or drag one here from the file tree'
    >
      <ViewerEmptyFilePicker files={files} onSelect={handleSelect} onClose={onClose} closeLabel={closeLabel} />
    </PanelEmptyState>
  );
}

/** Whether the layout record's first read has settled; without a project layout there is nothing to wait for. */
function useLayoutReadSettled(): boolean {
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- The optional workspace is absent in shared-profile embeds.
  const layoutController = useProjectWorkspace({ enableNoContext: true })?.layoutController;
  return useSyncExternalStore(
    useCallback(
      (listener: () => void) => layoutController?.subscribe(listener) ?? (() => undefined),
      [layoutController],
    ),
    () => layoutController?.ready() ?? true,
    () => layoutController?.ready() ?? true,
  );
}

/**
 * The dock's empty state. Before the layout record's first read settles the dock is empty only because the record has
 * not arranged it yet, so it shows nothing in place rather than offering a file choice the record is about to make
 * (A8d, staging M2). Once the read settles, an empty group is really empty.
 */
function ViewerWatermark({ containerApi, group }: IWatermarkPanelProps): React.JSX.Element | undefined {
  const isSettled = useLayoutReadSettled();
  if (!isSettled) {
    return undefined;
  }
  return (
    <ViewerEmptyState
      containerApi={containerApi}
      group={group as DockviewGroupPanel | undefined}
      closeLabel='Close split'
      onClose={
        group && containerApi.groups.length > 1
          ? () => {
              group.api.close();
            }
          : undefined
      }
    />
  );
}

function ViewerNewTabPanel(properties: IDockviewPanelProps<ViewerNewTabParameters>): React.JSX.Element {
  return (
    <ViewerEmptyState
      containerApi={properties.containerApi}
      group={properties.api.group}
      placeholderId={properties.api.id}
      onClose={() => {
        properties.api.close();
      }}
    />
  );
}

/**
 * The record of a view made from another (onboarding blueprint, V8). With a source, the source's own file values for
 * the inheritable leaves, its grid unit included, so a leaf it sets stays set and a leaf it inherits keeps inheriting;
 * its camera, section and measurements stay behind, because they belong to the geometry they were made through. With
 * none, the format values.
 *
 * @param entryPath - The entry the new view renders.
 * @param source - The view it is made from, if a viewer is active.
 * @returns The new record.
 */
export const newViewRecordFrom = (entryPath: string, source: WorkbenchView | undefined): WorkbenchView => {
  if (!source) {
    return newViewRecord(entryPath);
  }
  const { cameraView: _camera, ...settings } = graphicsSettingsForView(source);
  return withViewField(newViewRecord(entryPath, settings), 'grid.unit', source.grid.unit);
};

/* Put a view's exceptions back to `leaves`, as they were before a copy onto it. */
const restoreViewExceptions = (projectId: string, viewId: string, leaves: readonly ViewFieldPath[]): void => {
  viewExceptions.clearView(projectId, viewId);
  for (const leaf of leaves) {
    viewExceptions.add(projectId, viewId, leaf);
  }
};

/**
 * Write the record of a view made from `source`: this device's exceptions for the source are copied to the new id
 * first, so the new view reads as set exactly where the source does, then the record is created if it is missing.
 * When the copy is not saved, no record is written; when the record is not written after the copy saved, the new id's
 * exceptions are put back as they were.
 *
 * @param input - The project, the new view, its entry, the view it is made from and the record store's edit.
 * @returns Whether both the exceptions (when there is a source) and the record were saved.
 */
export const recordNewView = async ({
  projectId,
  viewId,
  entryPath,
  source,
  edit,
}: Readonly<{
  projectId: string;
  viewId: string;
  entryPath: string;
  source: ViewSource | undefined;
  edit: (viewId: string, change: (current: WorkbenchView | undefined) => WorkbenchView) => Promise<boolean>;
}>): Promise<boolean> => {
  const write = async (): Promise<boolean> =>
    edit(viewId, (current) => current ?? newViewRecordFrom(entryPath, source?.record));
  if (!source) {
    return write();
  }
  const prior = exceptionsForView(viewExceptionsStore.read(), projectId, viewId);
  if (viewExceptions.copy(projectId, source.viewId, viewId) !== 'saved') {
    return false;
  }
  let saved = false;
  try {
    saved = await write();
    return saved;
  } finally {
    if (!saved) {
      restoreViewExceptions(projectId, viewId, prior);
    }
  }
};

function ViewerLeftActions(properties: IDockviewHeaderActionsProps): React.JSX.Element {
  const fileSelectorDataSource = useViewerFileDataSource();

  return (
    <DockviewLeftActions
      {...properties}
      fileSelectorDataSource={fileSelectorDataSource}
      onDidSplit={(group) => {
        createViewerNewTab({ api: properties.containerApi, group });
      }}
    />
  );
}

/** Palette actions follow the active Dockview panel and the build's current offers. */
export function ViewerProjectionCommandItems({
  cadActor,
  viewId,
  entryPath,
}: {
  readonly cadActor: ActorRefFrom<typeof cadMachine>;
  readonly viewId: string;
  readonly entryPath: string;
}): undefined {
  const evaluation = useSelector(cadActor, selectCadEvaluation);
  const viewCommands = useWorkbenchViewCommands();
  useCommandPaletteItems(
    'viewer-projections',
    (): CommandPaletteItem[] =>
      evaluation?.success && evaluation.views.length > 1
        ? evaluation.views.flatMap((view): CommandPaletteItem[] => [
            {
              id: `show-view-${view.id}`,
              label: `Show ${view.title}`,
              detail: entryPath,
              group: 'Viewer',
              icon: <Box />,
              action: () => {
                setLocalInstanceChoice(viewId, undefined);
                chooseProjection({ viewCommands, viewId, entryPath, evaluation, nextId: view.id });
              },
            },
          ])
        : [],
    [entryPath, evaluation, viewCommands, viewId],
  );
  return undefined;
}

export function ViewerRightActions(properties: IDockviewHeaderActionsProps): React.JSX.Element {
  return <ProjectWorkspaceActions {...properties} />;
}

/** The mounted viewer's fresh-view command and its runtime-supported project files. */
export type ViewerFileActions = Readonly<{
  openFile: (path: string) => void;
  dataSource: FileSelectorDataSource;
}>;

/** What a viewer dock hands itself to: the project's layout, or on a page without one, its editor. */
type ViewerDockHost = Readonly<{
  send: (event: ViewerDockReady | ViewerDockReleased) => void;
  getSnapshot: () => { children: Readonly<Record<string, unknown>> };
}>;

/**
 * Hand the viewer's Dockview to its adapter (D11): the dock's ref callback sends `dockReady` once Dockview's `onReady`
 * gave it an api, then `attach` to the adapter the host spawned, once that step has returned and the layout is idle
 * (A8c's handover); its cleanup sends `dockReleased`. The host spawns and stops the adapter, so the component starts
 * and stops nothing (I1). A new host, api or port hands the dock over again; a release names its mount.
 *
 * @param host - The project's layout, or its editor on a page without one.
 * @param api - The Dockview api, once `onReady` gave it.
 * @param ports - The adapter's ports.
 * @returns The ref callback for the dock's box.
 */
function useViewerDockRef(
  host: ViewerDockHost,
  api: DockviewApi | undefined,
  ports: ViewerAdapterPorts,
  // oxlint-disable-next-line typescript/no-restricted-types -- React passes a ref callback `null` on detach.
): (element: HTMLDivElement | null) => (() => void) | undefined {
  const dockId = useId();
  return useCallback(
    // oxlint-disable-next-line typescript/no-restricted-types -- React passes a ref callback `null` on detach.
    (element: HTMLDivElement | null): (() => void) | undefined => {
      if (element === null || api === undefined) {
        return undefined;
      }
      host.send({ type: 'dockReady', adapter: 'viewer', dockId, api, ports });
      selectViewerDockAdapter(host, dockId)?.send({ type: 'attach' });
      return () => {
        host.send({ type: 'dockReleased', adapter: 'viewer', dockId });
      };
    },
    [api, dockId, host, ports],
  );
}

/**
 * ViewerDockview
 *
 * DockviewReact wrapper for the geometry viewer area. Provides:
 * - Tab support with file names as tab titles
 * - Split-view via drag-to-split
 * - Layout save/restore via EditorState persistence
 * - External file drops from the file tree
 * - Actor reconciliation on layout restore
 */
export const ViewerDockview = memo(function ({
  profile = 'editor',
  onApiChange,
  onFileActionsChange,
}: {
  readonly profile?: ViewerProfile;
  /** Exposes the mounted viewer for a host-owned view selector; clears it on teardown. */
  readonly onApiChange?: (api: DockviewApi | undefined) => void;
  /** Registers the same fresh-view action used by the desktop file picker; clears it on teardown. */
  readonly onFileActionsChange?: (actions: ViewerFileActions | undefined) => void;
} = {}): React.JSX.Element {
  const {
    projectId,
    projectRef,
    editorRef,
    mainEntryPath,
    viewRecords,
    entriesRecord,
    geometryUnits,
    setViewEntryPath,
  } = useProject();
  const viewCommands = useWorkbenchViewCommands();
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- The optional workspace is absent in shared-profile embeds.
  const workspace = useProjectWorkspace({ enableNoContext: true });
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- The optional workspace is absent in shared-profile embeds.
  const layoutController = workspace?.layoutController;
  const components = useMemo(
    () => ({
      viewer: (properties: IDockviewPanelProps<ViewerPanelParameters>) => (
        <ViewerPanel properties={properties} profile={profile} />
      ),
      newTab: ViewerNewTabPanel,
    }),
    [profile],
  );
  const fileDataSource = useViewerFileDataSource();
  const [api, setApi] = useState<DockviewApi>();
  useEffect(() => {
    onApiChange?.(api);
    return () => {
      onApiChange?.(undefined);
    };
  }, [api, onApiChange]);
  // Track the active (focused) viewer panel for settings inheritance
  const [activeViewerPanelId, setActiveViewerPanelId] = useState<string | undefined>();
  const activeViewerPanel = activeViewerPanelId
    ? api?.panels.find((panel) => panel.id === activeViewerPanelId)
    : api?.activePanel;
  const activeViewerParams =
    activeViewerPanel && isViewerPanelParameters(activeViewerPanel.params) ? activeViewerPanel.params : undefined;
  const activeViewerEntryPath = activeViewerParams?.entryPath;
  const activeViewerCadActor = activeViewerEntryPath ? geometryUnits.get(activeViewerEntryPath) : undefined;

  /**
   * Get the graphics settings to use for a new panel.
   * Inherits from the active panel's settings if available, otherwise falls back
   * to defaults. This gives new panels the same FOV, visibility toggles,
   * environment preset, etc. as what the user was just looking at.
   */
  const getViewSource = useCallback(
    (): ViewSource | undefined => viewSourceOf(activeViewerPanel, viewRecords),
    [activeViewerPanel, viewRecords],
  );

  /* A new view's record, made from the active view: its file values and grid unit, and this device's exceptions for
   * it copied first, so the new view reads as set exactly where the source does (V8). */
  const createViewRecord = useCallback(
    (viewId: string, entryPath: string, source: ViewSource | undefined): void => {
      if (profile !== 'editor') {
        return;
      }
      void recordNewView({ projectId, viewId, entryPath, source, edit: viewCommands.edit });
    },
    [profile, projectId, viewCommands],
  );

  /* What the viewer adapter reads from this tree (A8d): fed as a value before any passive effect of the commit runs.
   * The adapter, a child of the project's layout, holds the Dockview and does everything over time. */
  const projectIsReady = useSelector(projectRef, (state) => state.matches('ready'));
  const availability = useModelAvailability();
  const layoutPort =
    layoutController?.connectViewerIntents && layoutController.requestViewerFile ? layoutController : undefined;
  const adapterLayout = useMemo(
    (): ViewerAdapterPorts['layout'] =>
      layoutPort?.connectViewerIntents === undefined || layoutPort.requestViewerFile === undefined
        ? undefined
        : {
            registerViewer: layoutPort.registerViewer,
            personViewerChanged: layoutPort.personViewerChanged,
            connectViewerIntents: layoutPort.connectViewerIntents,
            requestViewerFile: layoutPort.requestViewerFile,
          },
    [layoutPort],
  );
  const adapterFacts = useMemo(
    (): ViewerAdapterFacts => ({
      admitsDemand: projectIsReady && availability === 'ready',
      mainEntryPath,
      viewRecords,
      entriesRecord,
      geometryUnits,
      viewCommands,
      setViewEntryPath,
      createViewRecord,
    }),
    [
      projectIsReady,
      availability,
      mainEntryPath,
      viewRecords,
      entriesRecord,
      geometryUnits,
      viewCommands,
      setViewEntryPath,
      createViewRecord,
    ],
  );
  // Each handover gets its own facts port, made from this render's facts: the dock's ref hands the adapter over and
  // attaches it before this component's layout effects run, so a port fed only from them would attach a re-handed
  // adapter on the previous commit's facts. The layout effect below then keeps it current.
  const { ports: adapterPorts, facts: factsPort } = useMemo(() => {
    const facts = createViewerAdapterFactsPort(adapterFacts);
    const ports: ViewerAdapterPorts = {
      profile,
      projectId,
      project: projectRef,
      layout: profile === 'shared' ? undefined : adapterLayout,
      facts,
    };
    return { ports, facts };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- New facts feed the port; only a new handover makes one.
  }, [adapterLayout, api, profile, projectId, projectRef]);
  useLayoutEffect(() => {
    factsPort.set(adapterFacts);
  }, [adapterFacts, factsPort]);
  // The layout runs the adapter on a page with one; elsewhere (a shared embed, a project without a layout) the editor
  // does (programme control, 2026-11-14).
  const dockRef = useViewerDockRef(workspace?.layout ?? editorRef, api, adapterPorts);

  // Track active viewer panel for settings inheritance
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onDidActivePanelChange((event) => {
      const { panel } = event;
      setActiveViewerPanelId(panel && isViewerPanelParameters(panel.params) ? panel.id : undefined);
    });

    return () => {
      disposable.dispose();
    };
  }, [api]);

  // Tag outgoing tab drags with the viewer MIME so the editor can identify them
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onWillDragPanel((event) => {
      const entryPath = (event.panel.params as ViewerPanelParameters | undefined)?.entryPath;
      const dataTransfer = getDragDataTransfer(event.nativeEvent);
      if (entryPath) {
        dataTransfer?.setData(tauViewerPanelDragMime, JSON.stringify({ entryPath }));
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [api]);

  // Accept external file drags and cross-dockview panel drags
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onUnhandledDragOver((event) => {
      const types = getDragDataTransfer(event.nativeEvent)?.types;

      if (types?.includes(tauFileDragMime)) {
        event.accept();
        return;
      }

      const panelData = typeof event.getData === 'function' ? event.getData() : undefined;
      if (panelData ?? types?.includes(tauEditorPanelDragMime)) {
        event.accept();
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [api]);

  // Handle ready event: seed a shared page's one viewer; the dock's ref then hands the Dockview to its adapter (D11).
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const dockApi = event.api;
      setApi(dockApi);
      if (profile === 'shared') {
        const viewId = mintViewRecordId();
        dockApi.addPanel({
          id: viewId,
          component: 'viewer',
          title: mainEntryPath || 'Viewer',
          params: { viewId, entryPath: mainEntryPath || undefined },
        });
      }
      ensureViewerGroup(dockApi);
    },
    [mainEntryPath, profile],
  );

  // Handle external file drops and cross-dockview editor panel drops
  const onDidDrop = useCallback(
    (event: DockviewDidDropEvent) => {
      handleViewerDrop({
        event,
        getViewSource,
        onViewCreated: (viewId, entryPath, source) => {
          createViewRecord(viewId, entryPath, source);
          projectRef.send({
            type: 'createGeometryUnit',
            entryPath,
            operationTimeout: entriesRecord?.entries[entryPath]?.renderTimeout,
          });
        },
      });
    },
    [createViewRecord, entriesRecord, getViewSource, projectRef],
  );

  // Open-file action: add a new viewer panel in the same group
  const handleOpenFile = useCallback(
    (path: string, group: DockviewGroupPanel | undefined, containerApi: DockviewApi) => {
      const viewId = mintViewRecordId();
      const fileName = path.split('/').pop() ?? path;

      containerApi.addPanel({
        id: viewId,
        component: 'viewer',
        title: fileName,
        params: { viewId, entryPath: path },
        ...(group ? { position: { direction: 'within', referenceGroup: group } } : {}),
      });

      createViewRecord(viewId, path, getViewSource());

      projectRef.send({
        type: 'createGeometryUnit',
        entryPath: path,
        operationTimeout: entriesRecord?.entries[path]?.renderTimeout,
      });
    },
    [createViewRecord, entriesRecord, getViewSource, projectRef],
  );

  useEffect(() => {
    onFileActionsChange?.(
      api
        ? {
            openFile: (path) => {
              handleOpenFile(path, api.activeGroup ?? api.groups[0], api);
            },
            dataSource: fileDataSource,
          }
        : undefined,
    );
    return () => {
      onFileActionsChange?.(undefined);
    };
  }, [api, fileDataSource, handleOpenFile, onFileActionsChange]);

  return (
    <DockviewFileActionProvider value={handleOpenFile}>
      {profile === 'editor' && activeViewerParams && activeViewerEntryPath && activeViewerCadActor ? (
        <ViewerProjectionCommandItems
          cadActor={activeViewerCadActor}
          viewId={activeViewerParams.viewId}
          entryPath={activeViewerEntryPath}
        />
      ) : null}
      <div ref={dockRef} className='@container/viewer relative size-full'>
        {/* D1: phones keep the mounted viewer and its file state without desktop tabs or split/close actions.
          Dockview observes the hidden header's zero height and gives that space back to the canvas. */}
        <Dockview
          className='max-md:[&_.dv-tabs-and-actions-container]:!hidden'
          components={components}
          noPanelsOverlay='emptyGroup'
          defaultTabComponent={ViewerDockviewTab}
          getTabIcon={getViewerTabIcon}
          tabLeadingIcon='viewer'
          watermarkComponent={ViewerWatermark}
          leftHeaderActionsComponent={ViewerLeftActions}
          prefixHeaderActionsComponent={profile === 'editor' ? ViewerChatLaneToggle : undefined}
          rightHeaderActionsComponent={profile === 'editor' ? ViewerRightActions : undefined}
          onReady={onReady}
          onDidDrop={onDidDrop}
        />
      </div>
    </DockviewFileActionProvider>
  );
});
