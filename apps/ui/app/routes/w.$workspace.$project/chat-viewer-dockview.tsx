import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import type { ViewerNode } from '@taucad/workbench';
import { Box } from 'lucide-react';
import type { CapabilitiesManifest } from '@taucad/runtime';
import { sourcePathMatchesExtensions } from '@taucad/utils/file';
import type { FileEntry } from '@taucad/types';
import { idPrefix, tauFileDragMime, tauEditorPanelDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { fromDockview, mintViewRecordId, toDockview } from '#workbench-records/converters.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';
import { graphicsSettingsForView, newViewRecord, viewTabTitle } from '#workbench-records/projection.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { createStaticDataSource } from '#components/files/file-selector.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { useProject } from '#hooks/use-project.js';
import { useFileTreeMap } from '#hooks/use-file-tree.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import type { GraphicsViewSettings } from '#constants/editor.constants.js';
import { ChatViewer } from '#routes/w.$workspace.$project/chat-viewer.js';
import { Dockview } from '#components/panes/dockview.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { DockviewEmptyAction, DockviewEmptyCloseAction } from '#components/panes/dockview-empty-action.js';
import { getViewerTabIcon, ViewerDockviewTab } from '#components/panes/viewer-tab-context-menu.js';
import { DockviewLeftActions, DockviewFileActionProvider } from '#components/panes/dockview-open-file-action.js';
import { ProjectWorkspaceActions } from '#routes/w.$workspace.$project/project-workspace-actions.js';
import { ViewerChatLaneToggle } from '#routes/w.$workspace.$project/chat-lane-toggle.js';

/**
 * Params passed to each viewer panel via Dockview.
 */
type ViewerPanelParameters = {
  viewId: string;
  entryPath: string | undefined;
};

type ViewerNewTabParameters = { mode: 'launcher' };
type ViewerProfile = 'editor' | 'shared';

const isViewerPanelParameters = (parameters: unknown): parameters is ViewerPanelParameters =>
  typeof (parameters as Partial<ViewerPanelParameters> | undefined)?.viewId === 'string';

/** Adopt the record and return only view IDs genuinely removed from the arrangement. */
export function adoptViewerRecordNode(api: DockviewApi, node: ViewerNode): string[] {
  const ids = (current: ViewerNode): string[] =>
    current.kind === 'group' ? current.tabs.map((tab) => tab.view) : current.children.flatMap(ids);
  const desired = new Set(ids(node));
  const existing = api.panels.flatMap((panel) =>
    isViewerPanelParameters(panel.params) ? [{ id: panel.id, title: panel.title, params: panel.params }] : [],
  );
  const dimensions = { width: Math.max(1, api.width), height: Math.max(1, api.height) };
  const projection = toDockview('viewer', node, { dimensions });
  // Dockview reuses panel instances but replaces their metadata from the serialized projection.
  for (const prior of existing) {
    if (!desired.has(prior.id)) {
      continue;
    }
    const panel = projection.panels[prior.id];
    if (panel) {
      projection.panels[prior.id] = { ...panel, title: prior.title, params: prior.params };
    }
  }
  api.fromJSON(projection, { reuseExistingPanels: true });
  return existing.filter(({ id }) => !desired.has(id)).map(({ id }) => id);
}

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
    <ChatViewer viewId={viewId} entryPath={entryPath} panelApi={properties.api} profile={profile} />
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

export function ensureViewerGroup(api: DockviewApi): void {
  if (api.groups.length === 0) {
    api.addGroup();
  }
}

export function handleViewerDrop({
  event,
  getInheritedSettings,
  onViewCreated,
}: {
  readonly event: DockviewDidDropEvent;
  readonly getInheritedSettings: () => GraphicsViewSettings;
  readonly onViewCreated: (viewId: string, entryPath: string, settings: GraphicsViewSettings) => void;
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
    onViewCreated(viewId, entryPath, getInheritedSettings());
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

export const listViewerSelectableFiles = (
  fileTree: ReadonlyMap<string, FileEntry>,
  capabilities: Pick<CapabilitiesManifest, 'registrations'>,
): ViewerSelectableFile[] =>
  [...fileTree.values()]
    .filter((entry) => entry.type === 'file')
    /* The viewer renders the project's own geometry; a read-only overlay or a
     * dependency is never a render target (Exclusion Matrix). A row no view
     * stamped keeps its place so nothing disappears when provenance is absent. */
    .filter((entry) => entry.provenance === undefined || entry.provenance.source === 'project')
    .filter((entry) => {
      const path = entry.path.toLowerCase();
      return !viewerExcludedSourceSuffixes.some((suffix) => path.endsWith(suffix));
    })
    .filter((entry) =>
      capabilities.registrations.some(
        (registration) =>
          registration.kind === 'kernel' && sourcePathMatchesExtensions(entry.path, registration.extensions),
      ),
    )
    .map(({ name, path, size }) => ({ name, path, size }))
    .sort((a, b) => a.path.localeCompare(b.path));

function useViewerSelectableFiles(): ViewerSelectableFile[] | undefined {
  const { geometryUnits, mainEntryPath } = useProject();
  const fileTree = useFileTreeMap();
  const capabilities = useSelector(geometryUnits.get(mainEntryPath), (state) => state?.context.capabilities);

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
          renderTimeout: entriesRecord?.entries[entryPath]?.renderTimeout,
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

function ViewerWatermark({ containerApi, group }: IWatermarkPanelProps): React.JSX.Element {
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

export const createInheritedGraphicsSettings = (
  activeSettings: GraphicsViewSettings | undefined,
): GraphicsViewSettings => {
  if (!activeSettings) {
    return { ...defaultGraphicsSettings };
  }
  return {
    ...activeSettings,
    // Cuts belong to the geometry they were made through, so a new pane starts without them.
    cameraView: undefined,
    sectionView: undefined,
    pinnedMeasurements: undefined,
  };
};

function ViewerLeftActions(properties: IDockviewHeaderActionsProps): React.JSX.Element {
  const files = useViewerSelectableFiles();
  const fileSelectorDataSource = useMemo(() => createStaticDataSource(files ?? []), [files]);

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
}: {
  readonly profile?: ViewerProfile;
} = {}): React.JSX.Element {
  const { projectRef, mainEntryPath, viewRecords, entriesRecord, setViewEntryPath } = useProject();
  const viewCommands = useWorkbenchViewCommands();
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- The optional workspace is absent in shared-profile embeds.
  const layoutController = useProjectWorkspace({ enableNoContext: true })?.layoutController;
  const components = useMemo(
    () => ({
      viewer: (properties: IDockviewPanelProps<ViewerPanelParameters>) => (
        <ViewerPanel properties={properties} profile={profile} />
      ),
      newTab: ViewerNewTabPanel,
    }),
    [profile],
  );
  const [api, setApi] = useState<DockviewApi>();
  const isRestoringLayout = useRef(false);
  const adoptedProjectionRef = useRef<string | undefined>(undefined);
  // Track the active (focused) viewer panel for settings inheritance
  const [activeViewerPanelId, setActiveViewerPanelId] = useState<string | undefined>();

  /* The entry's CAD actor owns its render timeout; a unit is seeded with the durable value at spawn
   * rather than pushed from a mount (Finding 4, E1). */

  /**
   * Get the graphics settings to use for a new panel.
   * Inherits from the active panel's settings if available, otherwise falls back
   * to defaults. This gives new panels the same FOV, visibility toggles,
   * environment preset, etc. as what the user was just looking at.
   */
  const getInheritedSettings = useCallback((): GraphicsViewSettings => {
    return createInheritedGraphicsSettings(
      activeViewerPanelId
        ? viewRecords.get(activeViewerPanelId)
          ? graphicsSettingsForView(viewRecords.get(activeViewerPanelId)!)
          : undefined
        : undefined,
    );
  }, [activeViewerPanelId, viewRecords]);

  // A person-edited semantic lane is the only layout write from Dockview.
  useEffect(() => {
    if (!api || !layoutController || profile === 'shared') {
      return;
    }

    const disposable = api.onDidLayoutChange(() => {
      if (isRestoringLayout.current) {
        return;
      }
      try {
        const node = fromDockview('viewer', api.toJSON());
        if (JSON.stringify(node) === adoptedProjectionRef.current) {
          return;
        }
        adoptedProjectionRef.current = undefined;
        layoutController.personViewerChanged(node);
      } catch {
        // Dockview can emit while a drag has a temporary unsupported intermediate group.
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [api, layoutController, profile]);

  useEffect(() => {
    if (!api || !layoutController || profile === 'shared') {
      return;
    }
    return layoutController.registerViewer((node, applied) => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      isRestoringLayout.current = true;
      try {
        const removed = adoptViewerRecordNode(api, node);
        adoptedProjectionRef.current = JSON.stringify(fromDockview('viewer', api.toJSON()));
        for (const viewId of removed) {
          void viewCommands.remove(viewId);
        }
        applied();
      } finally {
        isRestoringLayout.current = false;
        active?.focus({ preventScroll: true });
      }
    });
  }, [api, layoutController, profile, viewCommands]);

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

  // Handle actor lifecycle for panels
  useEffect(() => {
    if (!api) {
      return;
    }

    const removeDisposable = api.onDidRemovePanel((event) => {
      if (isViewerPanelParameters(event.params)) {
        const viewId = event.id;
        setViewEntryPath(viewId, undefined);
        projectRef.send({ type: 'destroyViewGraphics', viewId });
        if (!isRestoringLayout.current && profile === 'editor') {
          void viewCommands.remove(viewId);
        }
      }
      if (api.panels.length === 0) {
        queueMicrotask(() => {
          ensureViewerGroup(api);
        });
      }
    });

    return () => {
      removeDisposable.dispose();
    };
  }, [api, projectRef, profile, setViewEntryPath, viewCommands]);

  useEffect(() => {
    if (!api || profile === 'shared') {
      return;
    }
    for (const panel of api.panels) {
      if (!isViewerPanelParameters(panel.params)) {
        continue;
      }
      const record = viewRecords.get(panel.id);
      if (!record) {
        continue;
      }
      const nextPath = record.entryPath ?? undefined;
      if (panel.params.entryPath !== nextPath) {
        panel.api.updateParameters({ entryPath: nextPath });
      }
      setViewEntryPath(panel.id, record.entryPath);
      const title = viewTabTitle(record);
      if (panel.title !== title) {
        panel.api.setTitle(title);
      }
    }
  }, [api, profile, setViewEntryPath, viewRecords]);

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

  // Reconcile visible panels once the project machine reaches 'ready'.
  // Dockview retains hidden restored panels, but they have no render demand.
  //
  // It also assigns `mainEntryPath` to any panel that was seeded without an
  // entryPath (happens when onReady fires before the project loads and the
  // main file is unknown).
  const projectIsReady = useSelector(projectRef, (state) => state.matches('ready'));
  const admittedGraphics = useRef(new Set<string>());
  const admittedGeometry = useRef(new Map<string, string>());
  const visibleGeometryDemand = useRef(new Map<string, string>());

  useEffect(() => {
    admittedGraphics.current.clear();
    admittedGeometry.current.clear();
    visibleGeometryDemand.current.clear();
    return () => {
      for (const viewId of visibleGeometryDemand.current.keys()) {
        projectRef.send({ type: 'setViewerGeometryDemand', viewId });
      }
      visibleGeometryDemand.current.clear();
    };
  }, [projectRef]);

  useEffect(() => {
    if (!api || !projectIsReady) {
      return;
    }

    const admit = (panel: (typeof api.panels)[number]): void => {
      if (!isViewerPanelParameters(panel.params)) {
        return;
      }
      const panelViewId = panel.id;
      if (!panel.api.isVisible) {
        if (visibleGeometryDemand.current.delete(panelViewId)) {
          projectRef.send({ type: 'setViewerGeometryDemand', viewId: panelViewId });
        }
        return;
      }
      const settings = viewRecords.get(panelViewId);

      const validatedSettings = settings ? graphicsSettingsForView(settings) : defaultGraphicsSettings;

      if (!admittedGraphics.current.has(panelViewId)) {
        admittedGraphics.current.add(panelViewId);
        projectRef.send({ type: 'createViewGraphics', viewId: panelViewId, settings: validatedSettings });
      }

      let panelEntryPath = (panel.params as ViewerPanelParameters | undefined)?.entryPath;
      setViewEntryPath(panelViewId, panelEntryPath ?? null);

      // If the panel was created without an entry path (project was still loading),
      // assign the main entry path now that the project is ready.
      if (!panelEntryPath && mainEntryPath) {
        panelEntryPath = mainEntryPath;
        const fileName = mainEntryPath.split('/').pop() ?? mainEntryPath;
        panel.api.setTitle(fileName);
        panel.api.updateParameters({ entryPath: mainEntryPath });
        if (profile === 'editor') {
          void viewCommands.edit(panelViewId, (current) => ({
            ...(current ?? newViewRecord(mainEntryPath)),
            entryPath: mainEntryPath,
          }));
        }
      }

      if (panelEntryPath && admittedGeometry.current.get(panelViewId) !== panelEntryPath) {
        admittedGeometry.current.set(panelViewId, panelEntryPath);
        projectRef.send({
          type: 'createGeometryUnit',
          entryPath: panelEntryPath,
          renderTimeout: entriesRecord?.entries[panelEntryPath]?.renderTimeout,
        });
      }
      if (panelEntryPath && visibleGeometryDemand.current.get(panelViewId) !== panelEntryPath) {
        visibleGeometryDemand.current.set(panelViewId, panelEntryPath);
        projectRef.send({ type: 'setViewerGeometryDemand', viewId: panelViewId, entryPath: panelEntryPath });
      }
    };

    const subscriptions = new Map<string, ReturnType<(typeof api.panels)[number]['api']['onDidVisibilityChange']>>();
    const watch = (panel: (typeof api.panels)[number]): void => {
      if (!isViewerPanelParameters(panel.params) || subscriptions.has(panel.id)) {
        return;
      }
      subscriptions.set(
        panel.id,
        panel.api.onDidVisibilityChange(() => {
          admit(panel);
        }),
      );
      admit(panel);
    };
    for (const panel of api.panels) {
      watch(panel);
    }
    const addSubscription = api.onDidAddPanel(watch);
    const removeSubscription = api.onDidRemovePanel((panel) => {
      subscriptions.get(panel.id)?.dispose();
      subscriptions.delete(panel.id);
      admittedGraphics.current.delete(panel.id);
      admittedGeometry.current.delete(panel.id);
      if (visibleGeometryDemand.current.delete(panel.id)) {
        projectRef.send({ type: 'setViewerGeometryDemand', viewId: panel.id });
      }
    });
    return () => {
      addSubscription.dispose();
      removeSubscription.dispose();
      for (const subscription of subscriptions.values()) {
        subscription.dispose();
      }
    };
  }, [
    api,
    projectIsReady,
    projectRef,
    mainEntryPath,
    viewRecords,
    entriesRecord,
    setViewEntryPath,
    profile,
    viewCommands,
  ]);

  // Listen for "open in viewer" requests from file tree or editor tab context menus.
  // Creates a new viewer panel for the requested file if one doesn't already exist.
  useEffect(() => {
    if (!api) {
      return;
    }

    const subscription = projectRef.on('viewerFileRequested', (event) => {
      const { entryPath } = event;

      // If a panel already exists for this file, activate it instead of creating a duplicate
      const existingPanel = api.panels.find(
        (panel) => (panel.params as ViewerPanelParameters | undefined)?.entryPath === entryPath,
      );
      if (existingPanel) {
        existingPanel.api.setActive();
        return;
      }

      // Create a new viewer panel
      const viewId = mintViewRecordId();
      const fileName = entryPath.split('/').pop() ?? entryPath;

      api.addPanel({
        id: viewId,
        component: 'viewer',
        title: fileName,
        params: { viewId, entryPath },
      });

      if (profile === 'editor') {
        void viewCommands.edit(viewId, (current) => current ?? newViewRecord(entryPath, getInheritedSettings()));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [api, getInheritedSettings, profile, projectRef, viewCommands]);

  // Handle ready event: restore layout or seed default
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const dockApi = event.api;
      setApi(dockApi);

      isRestoringLayout.current = true;

      try {
        if (profile === 'shared') {
          const viewId = mintViewRecordId();
          dockApi.addPanel({
            id: viewId,
            component: 'viewer',
            title: mainEntryPath || 'Viewer',
            params: { viewId, entryPath: mainEntryPath || undefined },
          });
        }
      } catch {
        // Corrupt layout -- re-seed defaults
        dockApi.clear();
        const viewId = mintViewRecordId();
        dockApi.addPanel({
          id: viewId,
          component: 'viewer',
          title: mainEntryPath || 'Viewer',
          params: { viewId, entryPath: mainEntryPath || undefined },
        });

        if (profile === 'editor') {
          void viewCommands.edit(viewId, (current) => current ?? newViewRecord(mainEntryPath || null));
        }
      } finally {
        isRestoringLayout.current = false;
      }
      ensureViewerGroup(dockApi);
    },
    [mainEntryPath, profile, viewCommands],
  );

  // Handle external file drops and cross-dockview editor panel drops
  const onDidDrop = useCallback(
    (event: DockviewDidDropEvent) => {
      handleViewerDrop({
        event,
        getInheritedSettings,
        onViewCreated: (viewId, entryPath, graphicsSettings) => {
          if (profile === 'editor') {
            void viewCommands.edit(viewId, (current) => current ?? newViewRecord(entryPath, graphicsSettings));
          }
          projectRef.send({
            type: 'createGeometryUnit',
            entryPath,
            renderTimeout: entriesRecord?.entries[entryPath]?.renderTimeout,
          });
        },
      });
    },
    [entriesRecord, getInheritedSettings, profile, projectRef, viewCommands],
  );

  // Open-file action: add a new viewer panel in the same group
  const handleOpenFile = useCallback(
    (path: string, group: DockviewGroupPanel, containerApi: DockviewApi) => {
      const viewId = mintViewRecordId();
      const fileName = path.split('/').pop() ?? path;

      containerApi.addPanel({
        id: viewId,
        component: 'viewer',
        title: fileName,
        params: { viewId, entryPath: path },
        position: {
          direction: 'within',
          referenceGroup: group,
        },
      });

      if (profile === 'editor') {
        void viewCommands.edit(viewId, (current) => current ?? newViewRecord(path, getInheritedSettings()));
      }

      projectRef.send({
        type: 'createGeometryUnit',
        entryPath: path,
        renderTimeout: entriesRecord?.entries[path]?.renderTimeout,
      });
    },
    [entriesRecord, getInheritedSettings, profile, projectRef, viewCommands],
  );

  return (
    <DockviewFileActionProvider value={handleOpenFile}>
      <div className='relative size-full'>
        <Dockview
          components={components}
          noPanelsOverlay='emptyGroup'
          defaultTabComponent={ViewerDockviewTab}
          getTabIcon={getViewerTabIcon}
          tabLeadingIcon='viewer'
          watermarkComponent={ViewerWatermark}
          leftHeaderActionsComponent={ViewerLeftActions}
          prefixHeaderActionsComponent={profile === 'editor' ? ViewerChatLaneToggle : undefined}
          rightHeaderActionsComponent={profile === 'editor' ? ProjectWorkspaceActions : undefined}
          onReady={onReady}
          onDidDrop={onDidDrop}
        />
      </div>
    </DockviewFileActionProvider>
  );
});
