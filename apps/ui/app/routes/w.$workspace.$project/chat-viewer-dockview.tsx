import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Box } from 'lucide-react';
import type { CapabilitiesManifest } from '@taucad/runtime';
import { sourcePathMatchesExtensions } from '@taucad/utils/file';
import type { FileEntry } from '@taucad/types';
import { idPrefix, tauFileDragMime, tauEditorPanelDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { createStaticDataSource } from '#components/files/file-selector.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { useProject } from '#hooks/use-project.js';
import { useFileTreeMap } from '#hooks/use-file-tree.js';
import { defaultGraphicsSettings, parseGraphicsViewSettings } from '#constants/editor.constants.js';
import type { GraphicsViewSettings } from '#constants/editor.constants.js';
import { ChatViewer } from '#routes/w.$workspace.$project/chat-viewer.js';
import { Dockview } from '#components/panes/dockview.js';
import { DockviewWatermark } from '#components/panes/dockview-watermark.js';
import { DockviewEmptyAction, DockviewEmptyCloseAction } from '#components/panes/dockview-empty-action.js';
import { ViewerDockviewTab } from '#components/panes/viewer-tab-context-menu.js';
import { DockviewLeftActions, DockviewFileActionProvider } from '#components/panes/dockview-open-file-action.js';
import { ProjectWorkspaceActions } from '#routes/w.$workspace.$project/project-workspace-actions.js';

/**
 * Params passed to each viewer panel via Dockview.
 */
type ViewerPanelParameters = {
  viewId: string;
  entryPath: string | undefined;
};

type ViewerNewTabParameters = { mode: 'launcher' };

const isViewerPanelParameters = (parameters: unknown): parameters is ViewerPanelParameters =>
  typeof (parameters as Partial<ViewerPanelParameters> | undefined)?.viewId === 'string';

function getDragDataTransfer(event: DragEvent | PointerEvent): DataTransfer | undefined {
  return 'dataTransfer' in event ? (event.dataTransfer ?? undefined) : undefined;
}

/**
 * Viewer panel component rendered inside each Dockview panel.
 */
function ViewerPanel(properties: IDockviewPanelProps<ViewerPanelParameters>): React.JSX.Element {
  const { viewId, entryPath } = properties.params;
  return <ChatViewer viewId={viewId} entryPath={entryPath} panelApi={properties.api} />;
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
    title: 'New tab',
    params: { mode: 'launcher' },
    ...(group ? { position: { direction: 'within', referenceGroup: group } } : {}),
  });
}

export function replaceViewerNewTabWithFile({
  api,
  placeholderId,
  path,
  viewId = generatePrefixedId('view'),
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
    const viewId = generatePrefixedId('view');
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
}: {
  readonly files: readonly ViewerSelectableFile[] | undefined;
  readonly onSelect: (path: string) => void;
  readonly onClose: () => void;
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
            </DockviewEmptyAction>
          ))}
        </div>
      )}
      <DockviewEmptyCloseAction onClick={onClose} />
    </div>
  );
}

function ViewerEmptyState({
  containerApi,
  group,
  placeholderId,
  onClose,
}: {
  readonly containerApi: DockviewApi;
  readonly group?: DockviewGroupPanel;
  readonly placeholderId?: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  const { projectRef, editorRef } = useProject();
  const files = useViewerSelectableFiles();

  const handleSelect = useCallback(
    (path: string) => {
      const onViewCreated = (viewId: string, entryPath: string): void => {
        editorRef.send({
          type: 'setViewSettings',
          viewId,
          viewState: {
            entryPath,
            graphicsSettings: { ...defaultGraphicsSettings },
          },
        });
        projectRef.send({ type: 'createGeometryUnit', entryPath });
      };

      if (placeholderId) {
        replaceViewerNewTabWithFile({ api: containerApi, placeholderId, path, onViewCreated });
        return;
      }

      const viewId = generatePrefixedId('view');
      containerApi.addPanel({
        id: viewId,
        component: 'viewer',
        title: path.split('/').pop() ?? path,
        params: { viewId, entryPath: path },
        ...(group ? { position: { direction: 'within', referenceGroup: group } } : {}),
      });
      onViewCreated(viewId, path);
    },
    [containerApi, group, placeholderId, projectRef, editorRef],
  );

  return (
    <DockviewWatermark
      icon={Box}
      title='No geometry selected'
      description='Drag a file from the file tree, or select one below'
    >
      <ViewerEmptyFilePicker files={files} onSelect={handleSelect} onClose={onClose} />
    </DockviewWatermark>
  );
}

function ViewerWatermark({ containerApi, group }: IWatermarkPanelProps): React.JSX.Element {
  return (
    <ViewerEmptyState
      containerApi={containerApi}
      group={group as DockviewGroupPanel | undefined}
      onClose={() => {
        group?.api.close();
      }}
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

const components = {
  viewer: ViewerPanel,
  newTab: ViewerNewTabPanel,
};

export const createInheritedGraphicsSettings = (
  activeSettings: GraphicsViewSettings | undefined,
): GraphicsViewSettings => {
  if (!activeSettings) {
    return { ...defaultGraphicsSettings };
  }
  return {
    ...parseGraphicsViewSettings(activeSettings),
    cameraView: undefined,
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
export const ViewerDockview = memo(function (): React.JSX.Element {
  const { projectRef, editorRef, mainEntryPath } = useProject();
  const [api, setApi] = useState<DockviewApi>();
  const isRestoringLayout = useRef(false);
  // Track the active (focused) viewer panel for settings inheritance
  const [activeViewerPanelId, setActiveViewerPanelId] = useState<string | undefined>();

  // Read persisted layout from editor machine
  const viewerLayout = useSelector(editorRef, (state) => state.context.viewerLayout);
  const viewSettings = useSelector(editorRef, (state) => state.context.viewSettings);

  /**
   * Get the graphics settings to use for a new panel.
   * Inherits from the active panel's settings if available, otherwise falls back
   * to defaults. This gives new panels the same FOV, visibility toggles,
   * environment preset, etc. as what the user was just looking at.
   */
  const getInheritedSettings = useCallback((): GraphicsViewSettings => {
    return createInheritedGraphicsSettings(
      activeViewerPanelId ? viewSettings[activeViewerPanelId]?.graphicsSettings : undefined,
    );
  }, [activeViewerPanelId, viewSettings]);

  // Save layout to editor machine on layout changes
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onDidLayoutChange(() => {
      // Don't persist while restoring layout (fromJSON triggers layout changes)
      if (isRestoringLayout.current) {
        return;
      }

      editorRef.send({ type: 'setViewerLayout', layout: api.toJSON() });
    });

    return () => {
      disposable.dispose();
    };
  }, [api, editorRef]);

  // Track active viewer panel for settings inheritance
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onDidActivePanelChange((event) => {
      const panel = event.panel;
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

    const addDisposable = api.onDidAddPanel((event) => {
      if (!isViewerPanelParameters(event.params)) {
        return;
      }
      const viewId = event.id;
      const existingSettings = viewSettings[viewId];
      const settings = existingSettings?.graphicsSettings
        ? parseGraphicsViewSettings(existingSettings.graphicsSettings)
        : defaultGraphicsSettings;
      projectRef.send({
        type: 'createViewGraphics',
        viewId,
        settings,
      });
    });

    const removeDisposable = api.onDidRemovePanel((event) => {
      if (isViewerPanelParameters(event.params)) {
        const viewId = event.id;
        projectRef.send({ type: 'destroyViewGraphics', viewId });
        editorRef.send({ type: 'removeViewSettings', viewId });
      }
      if (api.panels.length === 0) {
        queueMicrotask(() => {
          ensureViewerGroup(api);
        });
      }
    });

    return () => {
      addDisposable.dispose();
      removeDisposable.dispose();
    };
  }, [api, projectRef, editorRef, viewSettings]);

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

  // Reconcile restored panels once the project machine reaches 'ready'.
  // onReady fires while the project machine is still 'loading', so
  // createViewGraphics events sent there are silently dropped. This effect
  // waits for the project to be ready and then ensures every panel has its
  // graphics actor and geometry unit. Both actions are idempotent.
  //
  // It also assigns `mainEntryPath` to any panel that was seeded without an
  // entryPath (happens when onReady fires before the project loads and the
  // main file is unknown).
  const projectIsReady = useSelector(projectRef, (state) => state.matches('ready'));
  const hasReconciled = useRef(false);

  useEffect(() => {
    if (!api || !projectIsReady || hasReconciled.current) {
      return;
    }

    hasReconciled.current = true;

    for (const panel of api.panels) {
      if (!isViewerPanelParameters(panel.params)) {
        continue;
      }
      const panelViewId = panel.id;
      const settings = viewSettings[panelViewId];

      const validatedSettings = settings?.graphicsSettings
        ? parseGraphicsViewSettings(settings.graphicsSettings)
        : defaultGraphicsSettings;

      projectRef.send({
        type: 'createViewGraphics',
        viewId: panelViewId,
        settings: validatedSettings,
      });

      let panelEntryPath = (panel.params as ViewerPanelParameters | undefined)?.entryPath;

      // If the panel was created without an entry path (project was still loading),
      // assign the main entry path now that the project is ready.
      if (!panelEntryPath && mainEntryPath) {
        panelEntryPath = mainEntryPath;
        const fileName = mainEntryPath.split('/').pop() ?? mainEntryPath;
        panel.api.setTitle(fileName);
        panel.api.updateParameters({ entryPath: mainEntryPath });
        editorRef.send({
          type: 'setViewSettings',
          viewId: panelViewId,
          viewState: {
            entryPath: mainEntryPath,
            graphicsSettings: validatedSettings,
          },
        });
      }

      if (panelEntryPath) {
        projectRef.send({
          type: 'createGeometryUnit',
          entryPath: panelEntryPath,
        });
      }
    }
  }, [api, projectIsReady, projectRef, editorRef, mainEntryPath, viewSettings]);

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
      const viewId = generatePrefixedId('view');
      const fileName = entryPath.split('/').pop() ?? entryPath;

      api.addPanel({
        id: viewId,
        component: 'viewer',
        title: fileName,
        params: { viewId, entryPath },
      });

      // Persist view settings (inherit from active panel)
      editorRef.send({
        type: 'setViewSettings',
        viewId,
        viewState: {
          entryPath,
          graphicsSettings: getInheritedSettings(),
        },
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [api, projectRef, editorRef, getInheritedSettings]);

  // Handle ready event: restore layout or seed default
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const dockApi = event.api;
      setApi(dockApi);

      isRestoringLayout.current = true;

      try {
        if (viewerLayout) {
          dockApi.fromJSON(viewerLayout);
        } else {
          // Seed default: single viewer panel for mainEntryPath
          const viewId = generatePrefixedId('view');
          dockApi.addPanel({
            id: viewId,
            component: 'viewer',
            title: mainEntryPath || 'Viewer',
            params: { viewId, entryPath: mainEntryPath || undefined },
          });

          // Persist view settings for the seeded panel
          editorRef.send({
            type: 'setViewSettings',
            viewId,
            viewState: {
              entryPath: mainEntryPath || undefined,
              graphicsSettings: { ...defaultGraphicsSettings },
            },
          });
        }
      } catch {
        // Corrupt layout -- re-seed defaults
        dockApi.clear();
        const viewId = generatePrefixedId('view');
        dockApi.addPanel({
          id: viewId,
          component: 'viewer',
          title: mainEntryPath || 'Viewer',
          params: { viewId, entryPath: mainEntryPath || undefined },
        });

        editorRef.send({
          type: 'setViewSettings',
          viewId,
          viewState: {
            entryPath: mainEntryPath || undefined,
            graphicsSettings: { ...defaultGraphicsSettings },
          },
        });
      } finally {
        isRestoringLayout.current = false;
      }
      ensureViewerGroup(dockApi);
    },
    [viewerLayout, mainEntryPath, editorRef],
  );

  // Handle external file drops and cross-dockview editor panel drops
  const onDidDrop = useCallback(
    (event: DockviewDidDropEvent) => {
      handleViewerDrop({
        event,
        getInheritedSettings,
        onViewCreated: (viewId, entryPath, graphicsSettings) => {
          editorRef.send({
            type: 'setViewSettings',
            viewId,
            viewState: { entryPath, graphicsSettings },
          });
          projectRef.send({ type: 'createGeometryUnit', entryPath });
        },
      });
    },
    [projectRef, editorRef, getInheritedSettings],
  );

  // Open-file action: add a new viewer panel in the same group
  const handleOpenFile = useCallback(
    (path: string, group: DockviewGroupPanel, containerApi: DockviewApi) => {
      const viewId = generatePrefixedId('view');
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

      // Inherit settings from active panel
      editorRef.send({
        type: 'setViewSettings',
        viewId,
        viewState: {
          entryPath: path,
          graphicsSettings: getInheritedSettings(),
        },
      });

      projectRef.send({ type: 'createGeometryUnit', entryPath: path });
    },
    [projectRef, editorRef, getInheritedSettings],
  );

  return (
    <DockviewFileActionProvider value={handleOpenFile}>
      <div className='relative size-full'>
        <Dockview
          components={components}
          noPanelsOverlay='emptyGroup'
          defaultTabComponent={ViewerDockviewTab}
          watermarkComponent={ViewerWatermark}
          leftHeaderActionsComponent={ViewerLeftActions}
          rightHeaderActionsComponent={ProjectWorkspaceActions}
          onReady={onReady}
          onDidDrop={onDidDrop}
        />
      </div>
    </DockviewFileActionProvider>
  );
});
