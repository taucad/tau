import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type {
  DockviewApi,
  DockviewGroupPanel,
  DockviewReadyEvent,
  DockviewDidDropEvent,
  IDockviewPanelProps,
  IWatermarkPanelProps,
} from 'dockview-react';
import { positionToDirection } from 'dockview-react';
import { Box, ChevronDown } from 'lucide-react';
import type { FileEntry } from '@taucad/types';
import { tauFileDragMime, tauEditorPanelDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { FileSelector } from '#components/files/file-selector.js';
import { Button } from '#components/ui/button.js';
import { useBuild } from '#hooks/use-build.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { defaultGraphicsSettings, parseGraphicsViewSettings } from '#constants/editor.constants.js';
import type { GraphicsViewSettings } from '#constants/editor.constants.js';
import { ChatViewer } from '#routes/builds_.$id/chat-viewer.js';
import { Dockview } from '#components/panes/dockview.js';
import { DockviewWatermark } from '#components/panes/dockview-watermark.js';
import { ViewerDockviewTab } from '#components/panes/viewer-tab-context-menu.js';
import { DockviewOpenFileAction, DockviewFileActionProvider } from '#components/panes/dockview-open-file-action.js';
import { WebglContextTrackerProvider } from '#hooks/use-webgl-context-tracker.js';

/**
 * Params passed to each viewer panel via Dockview.
 */
type ViewerPanelParameters = {
  viewId: string;
  entryFile: string | undefined;
};

/**
 * Viewer panel component rendered inside each Dockview panel.
 */
function ViewerPanel(properties: IDockviewPanelProps<ViewerPanelParameters>): React.JSX.Element {
  const { viewId, entryFile } = properties.params;
  return (
    <ChatViewer
      viewId={viewId}
      entryFile={entryFile}
      panelApi={properties.api}
      containerApi={properties.containerApi}
    />
  );
}

const components = {
  viewer: ViewerPanel,
};

/**
 * Empty state shown when all viewer panels have been closed.
 */
function ViewerWatermark({ containerApi, group }: IWatermarkPanelProps): React.JSX.Element {
  const { buildRef, editorRef } = useBuild();
  const { fileManagerRef } = useFileManager();
  const fileTree = useSelector(fileManagerRef, (state) => state.context.fileTree);

  const files = useMemo(
    () =>
      [...fileTree.values()]
        .filter((entry: FileEntry) => entry.type === 'file')
        .map((entry: FileEntry) => ({ path: entry.path, size: entry.size })),
    [fileTree],
  );

  const handleSelect = useCallback(
    (path: string) => {
      const viewId = generatePrefixedId('view');
      const fileName = path.split('/').pop() ?? path;

      containerApi.addPanel({
        id: viewId,
        component: 'viewer',
        title: fileName,
        params: { viewId, entryFile: path },
      });

      editorRef.send({
        type: 'setViewSettings',
        viewId,
        viewState: {
          entryFile: path,
          graphicsSettings: { ...defaultGraphicsSettings },
        },
      });

      buildRef.send({ type: 'createCompilationUnit', entryFile: path });
    },
    [containerApi, buildRef, editorRef],
  );

  const handleClose = useCallback(() => {
    if (group) {
      containerApi.removeGroup(group);
    }
  }, [containerApi, group]);

  return (
    <DockviewWatermark
      icon={Box}
      title="No geometry selected"
      description="Drag a file from the file tree, or select one below"
      onClose={handleClose}
    >
      <FileSelector
        files={files}
        selectedFile={undefined}
        title="Viewport File"
        description="Choose which file to render in the viewport"
        searchPlaceholder="Search files..."
        emptyMessage="No files found."
        onSelect={handleSelect}
      >
        <Button size="sm" variant="outline" className="justify-between">
          <span className="truncate text-muted-foreground">
            <span className="@xs/watermark:hidden">Select file...</span>
            <span className="hidden @xs/watermark:inline">Select file to render...</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </FileSelector>
    </DockviewWatermark>
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
  const { buildRef, editorRef, mainEntryFile } = useBuild();
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
    if (activeViewerPanelId) {
      const activeSettings = viewSettings[activeViewerPanelId]?.graphicsSettings;
      if (activeSettings) {
        // Validate persisted settings and clear geometry-dependent state
        const validated = parseGraphicsViewSettings(activeSettings);
        return {
          ...validated,
          pinnedMeasurements: undefined,
        };
      }
    }

    return { ...defaultGraphicsSettings };
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

    const disposable = api.onDidActivePanelChange((panel) => {
      if (panel) {
        setActiveViewerPanelId(panel.id);
      }
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
      const viewId = event.id;
      const existingSettings = viewSettings[viewId];
      const settings = existingSettings?.graphicsSettings
        ? parseGraphicsViewSettings(existingSettings.graphicsSettings)
        : defaultGraphicsSettings;
      buildRef.send({
        type: 'createViewGraphics',
        viewId,
        settings,
      });
    });

    const removeDisposable = api.onDidRemovePanel((event) => {
      const viewId = event.id;
      buildRef.send({ type: 'destroyViewGraphics', viewId });
      editorRef.send({ type: 'removeViewSettings', viewId });
    });

    return () => {
      addDisposable.dispose();
      removeDisposable.dispose();
    };
  }, [api, buildRef, editorRef, viewSettings]);

  // Tag outgoing tab drags with the viewer MIME so the editor can identify them
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onWillDragPanel((event) => {
      const entryFile = (event.panel.params as ViewerPanelParameters | undefined)?.entryFile;
      if (entryFile) {
        event.nativeEvent.dataTransfer?.setData(tauViewerPanelDragMime, JSON.stringify({ entryFile }));
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

    const disposable = api.onUnhandledDragOverEvent((event) => {
      const types = event.nativeEvent.dataTransfer?.types;

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

  // Reconcile restored panels once the build machine reaches 'ready'.
  // onReady fires while the build machine is still 'loading', so
  // createViewGraphics events sent there are silently dropped. This effect
  // waits for the build to be ready and then ensures every panel has its
  // graphics actor and compilation unit. Both actions are idempotent.
  //
  // It also assigns `mainEntryFile` to any panel that was seeded without an
  // entryFile (happens when onReady fires before the build loads and the
  // main file is unknown).
  const buildIsReady = useSelector(buildRef, (state) => state.matches('ready'));
  const hasReconciled = useRef(false);

  useEffect(() => {
    if (!api || !buildIsReady || hasReconciled.current) {
      return;
    }

    hasReconciled.current = true;

    for (const panel of api.panels) {
      const panelViewId = panel.id;
      const settings = viewSettings[panelViewId];

      const validatedSettings = settings?.graphicsSettings
        ? parseGraphicsViewSettings(settings.graphicsSettings)
        : defaultGraphicsSettings;

      buildRef.send({
        type: 'createViewGraphics',
        viewId: panelViewId,
        settings: validatedSettings,
      });

      let panelEntryFile = (panel.params as ViewerPanelParameters | undefined)?.entryFile;

      // If the panel was created without an entry file (build was still loading),
      // assign the main entry file now that the build is ready.
      if (!panelEntryFile && mainEntryFile) {
        panelEntryFile = mainEntryFile;
        const fileName = mainEntryFile.split('/').pop() ?? mainEntryFile;
        panel.api.setTitle(fileName);
        panel.api.updateParameters({ entryFile: mainEntryFile });
        editorRef.send({
          type: 'setViewSettings',
          viewId: panelViewId,
          viewState: {
            entryFile: mainEntryFile,
            graphicsSettings: validatedSettings,
          },
        });
      }

      if (panelEntryFile) {
        buildRef.send({ type: 'createCompilationUnit', entryFile: panelEntryFile });
      }
    }
  }, [api, buildIsReady, buildRef, editorRef, mainEntryFile, viewSettings]);

  // Listen for "open in viewer" requests from file tree or editor tab context menus.
  // Creates a new viewer panel for the requested file if one doesn't already exist.
  useEffect(() => {
    if (!api) {
      return;
    }

    const subscription = buildRef.on('viewerFileRequested', (event) => {
      const { entryFile } = event;

      // If a panel already exists for this file, activate it instead of creating a duplicate
      const existingPanel = api.panels.find(
        (panel) => (panel.params as ViewerPanelParameters | undefined)?.entryFile === entryFile,
      );
      if (existingPanel) {
        existingPanel.api.setActive();
        return;
      }

      // Create a new viewer panel
      const viewId = generatePrefixedId('view');
      const fileName = entryFile.split('/').pop() ?? entryFile;

      api.addPanel({
        id: viewId,
        component: 'viewer',
        title: fileName,
        params: { viewId, entryFile },
      });

      // Persist view settings (inherit from active panel)
      editorRef.send({
        type: 'setViewSettings',
        viewId,
        viewState: {
          entryFile,
          graphicsSettings: getInheritedSettings(),
        },
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [api, buildRef, editorRef, getInheritedSettings]);

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
          // Seed default: single viewer panel for mainEntryFile
          const viewId = generatePrefixedId('view');
          dockApi.addPanel({
            id: viewId,
            component: 'viewer',
            title: mainEntryFile || 'Viewer',
            params: { viewId, entryFile: mainEntryFile || undefined },
          });

          // Persist view settings for the seeded panel
          editorRef.send({
            type: 'setViewSettings',
            viewId,
            viewState: {
              entryFile: mainEntryFile || undefined,
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
          title: mainEntryFile || 'Viewer',
          params: { viewId, entryFile: mainEntryFile || undefined },
        });

        editorRef.send({
          type: 'setViewSettings',
          viewId,
          viewState: {
            entryFile: mainEntryFile || undefined,
            graphicsSettings: { ...defaultGraphicsSettings },
          },
        });
      } finally {
        isRestoringLayout.current = false;
      }
    },
    [viewerLayout, mainEntryFile, editorRef],
  );

  // Handle external file drops and cross-dockview editor panel drops
  const onDidDrop = useCallback(
    (event: DockviewDidDropEvent) => {
      // Handle editor panel drag → create a viewer for that file
      const editorData = event.nativeEvent.dataTransfer?.getData(tauEditorPanelDragMime);
      if (editorData) {
        try {
          const { filePath: droppedFile } = JSON.parse(editorData) as { filePath?: string };
          if (droppedFile) {
            const viewId = generatePrefixedId('view');
            const fileName = droppedFile.split('/').pop() ?? droppedFile;

            event.api.addPanel({
              id: viewId,
              component: 'viewer',
              title: fileName,
              params: { viewId, entryFile: droppedFile },
              position: {
                direction: positionToDirection(event.position),
                referenceGroup: event.group ?? undefined,
              },
            });

            editorRef.send({
              type: 'setViewSettings',
              viewId,
              viewState: {
                entryFile: droppedFile,
                graphicsSettings: getInheritedSettings(),
              },
            });

            buildRef.send({ type: 'createCompilationUnit', entryFile: droppedFile });
          }
        } catch {
          // Ignore corrupt data
        }

        return;
      }

      // Handle file tree drags
      const data = event.nativeEvent.dataTransfer?.getData(tauFileDragMime);
      if (!data) {
        return;
      }

      let paths: string[];
      try {
        paths = JSON.parse(data) as string[];
      } catch {
        return;
      }

      const filePath = paths[0];
      if (!filePath) {
        return;
      }

      // Dedup: if the target group already has a panel for this file, activate it
      const targetGroup = event.group;
      if (targetGroup) {
        const existing = targetGroup.panels.find(
          (p) => (p.params as ViewerPanelParameters | undefined)?.entryFile === filePath,
        );
        if (existing) {
          existing.api.setActive();
          return;
        }
      }

      const viewId = generatePrefixedId('view');
      const fileName = filePath.split('/').pop() ?? filePath;

      event.api.addPanel({
        id: viewId,
        component: 'viewer',
        title: fileName,
        params: { viewId, entryFile: filePath },
        position: {
          direction: positionToDirection(event.position),
          referenceGroup: event.group ?? undefined,
        },
      });

      editorRef.send({
        type: 'setViewSettings',
        viewId,
        viewState: {
          entryFile: filePath,
          graphicsSettings: getInheritedSettings(),
        },
      });

      buildRef.send({ type: 'createCompilationUnit', entryFile: filePath });
    },
    [buildRef, editorRef, getInheritedSettings],
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
        params: { viewId, entryFile: path },
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
          entryFile: path,
          graphicsSettings: getInheritedSettings(),
        },
      });

      buildRef.send({ type: 'createCompilationUnit', entryFile: path });
    },
    [buildRef, editorRef, getInheritedSettings],
  );

  return (
    <WebglContextTrackerProvider>
      <DockviewFileActionProvider value={handleOpenFile}>
        <div className="relative size-full">
          <Dockview
            components={components}
            noPanelsOverlay="emptyGroup"
            defaultTabComponent={ViewerDockviewTab}
            watermarkComponent={ViewerWatermark}
            leftHeaderActionsComponent={DockviewOpenFileAction}
            onReady={onReady}
            onDidDrop={onDidDrop}
          />
        </div>
      </DockviewFileActionProvider>
    </WebglContextTrackerProvider>
  );
});
