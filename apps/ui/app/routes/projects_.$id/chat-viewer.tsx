import { memo, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { DockviewApi, DockviewPanelApi, IDockviewPanelHeaderProps } from 'dockview-react';
import { FileX, FolderOpen, PlayCircle } from 'lucide-react';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { FileSelector } from '#components/files/file-selector.js';
import { Button } from '#components/ui/button.js';
import { useProject } from '#hooks/use-project.js';
import { useFileTreeMap } from '#hooks/use-file-tree.js';
import { useFileContent } from '#hooks/use-file-content.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import { CadProvider, useCad, useCadSelector } from '#hooks/use-cad.js';
import { GraphicsProvider, useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';
import { useViewSettingsSync } from '#hooks/use-view-settings-sync.js';
import { ChatStackTrace } from '#routes/projects_.$id/chat-stack-trace.js';
import { ChatViewerStatus } from '#routes/projects_.$id/chat-viewer-status.js';
import { ChatViewerControls } from '#routes/projects_.$id/chat-viewer-controls.js';
import { ChatInterfaceGraphics } from '#routes/projects_.$id/chat-interface-graphics.js';
import { ChatInterfaceStatus } from '#routes/projects_.$id/chat-interface-status.js';
import { useIsTopRightPanel } from '#components/panes/use-is-top-right-group.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { useResizeObserver } from '#hooks/use-resize-observer.js';
import { cn } from '#utils/ui.utils.js';
import { ArButton } from '#components/cad/ar-button.js';

/** Horizontal inset sum for bottom controls (`left-2` + `right-2`); pairs with `max-w-[calc(100%-1rem)]` on the overlay. */
const bottomControlsGutterPx = 16;

type ChatViewerProps = {
  /** Unique Dockview panel ID for this viewer instance */
  readonly viewId: string;
  /** File path being rendered in this viewer (undefined = empty state) */
  readonly entryFile: string | undefined;
  /** Dockview panel API for updating title, etc. */
  readonly panelApi: IDockviewPanelHeaderProps['api'];
  /** Dockview container API for layout-aware positioning */
  readonly containerApi: DockviewApi;
};

export const ChatViewer = memo(function ({
  viewId,
  entryFile,
  panelApi,
  containerApi,
}: ChatViewerProps): React.JSX.Element {
  const { projectRef, editorRef, viewGraphics, geometryUnits } = useProject();
  // Get the per-view graphics machine
  const graphicsActor = viewGraphics.get(viewId);

  // Get the geometry unit for this view's entry file
  const cadActor = entryFile ? geometryUnits.get(entryFile) : undefined;

  // Lazy tree snapshot for isDirectory checks (prefix / loaded dir entry)
  const fileTree = useFileTreeMap();

  // Detect if the entry file is a directory.
  // The fileTree only stores file entries (not directories), so we check
  // whether entryFile is a prefix of any file path in the tree.
  const isDirectory = useMemo(() => {
    if (!entryFile) {
      return false;
    }

    const entry = fileTree.get(entryFile);
    if (entry) {
      return entry.type === 'dir';
    }

    const directoryPrefix = `${entryFile}/`;
    for (const key of fileTree.keys()) {
      if (key.startsWith(directoryPrefix)) {
        return true;
      }
    }

    return false;
  }, [entryFile, fileTree]);

  // Derive isMissing from content service orphan outcome (VS Code pattern).
  // useFileContent auto-loads on cache miss; missing files resolve to the
  // 'orphaned' outcome via the discriminated FileContentResult contract.
  const fileContent = useFileContent(entryFile);
  const isMissing = fileContent.kind === 'orphaned' && !isDirectory;

  // Get the current view settings from editor state for this panel
  const viewSettings = useSelector(editorRef, (state) => state.context.viewSettings);

  // Handle file selection in the viewport FileSelector
  const handleFileSelect = useCallback(
    (path: string) => {
      // Ensure geometry unit exists for the selected file
      if (!geometryUnits.has(path)) {
        projectRef.send({ type: 'createGeometryUnit', entryFile: path });
      }

      // Preserve existing view settings (FOV, visibility, environment preset, etc.)
      // But clear geometry-dependent state (camera pose, measurements) on file switch
      const existingGraphics = viewSettings[viewId]?.graphicsSettings;

      editorRef.send({
        type: 'setViewSettings',
        viewId,
        viewState: {
          entryFile: path,
          graphicsSettings: {
            ...(existingGraphics ?? defaultGraphicsSettings),
            // Clear geometry-dependent state on file switch
            pinnedMeasurements: undefined,
          },
        },
      });

      // Update Dockview panel params so the component re-renders with new entryFile
      panelApi.updateParameters({ entryFile: path });

      // Update the Dockview panel title
      const fileName = path.split('/').pop() ?? path;
      panelApi.setTitle(fileName);
    },
    [projectRef, editorRef, geometryUnits, viewId, panelApi, viewSettings],
  );

  // If no graphics actor yet, render a placeholder
  if (!graphicsActor) {
    return (
      <div className='flex h-full items-center justify-center text-muted-foreground'>
        <span className='text-sm'>Initializing viewer...</span>
      </div>
    );
  }

  // If no file selected, render empty state with file selector
  if (!entryFile) {
    return (
      <GraphicsProvider graphicsRef={graphicsActor}>
        <div className='flex h-full flex-col items-center justify-center gap-4 text-muted-foreground'>
          <span className='text-sm'>No file selected</span>
          <FileSelector
            selectedFile={undefined}
            placeholder='Select file to render...'
            className='h-8 w-[200px]'
            title='Viewport File'
            description='Choose which file to render in the viewport'
            searchPlaceholder='Search files...'
            emptyMessage='No files found.'
            onSelect={handleFileSelect}
          />
        </div>
      </GraphicsProvider>
    );
  }

  // If the entry file is a directory, show a friendly screen with a file selector
  if (isDirectory) {
    return (
      <GraphicsProvider graphicsRef={graphicsActor}>
        <div className='flex h-full flex-col items-center justify-center gap-4 text-muted-foreground'>
          <FolderOpen className='size-12 stroke-1' />
          <p className='text-sm'>The viewer cannot display a directory.</p>
          <FileSelector
            selectedFile={undefined}
            initialPath={entryFile}
            placeholder='Select a file to render...'
            className='h-8 w-[200px]'
            title='Viewport File'
            description='Choose a file to render in the viewport'
            searchPlaceholder='Search files...'
            emptyMessage='No files found.'
            onSelect={handleFileSelect}
          />
        </div>
      </GraphicsProvider>
    );
  }

  // If the entry file doesn't exist in the file tree, show a friendly "not found" screen
  if (isMissing) {
    return (
      <GraphicsProvider graphicsRef={graphicsActor}>
        <div className='flex h-full flex-col items-center justify-center gap-4 text-muted-foreground'>
          <FileX className='size-12 stroke-1' />
          <div className='flex flex-col items-center gap-1'>
            <p className='text-sm font-medium'>File not found</p>
            <p className='max-w-60 truncate text-xs'>{entryFile}</p>
          </div>
          <FileSelector
            selectedFile={undefined}
            placeholder='Select a file to render...'
            className='h-8 w-[200px]'
            title='Viewport File'
            description='Choose a file to render in the viewport'
            searchPlaceholder='Search files...'
            emptyMessage='No files found.'
            onSelect={handleFileSelect}
          />
        </div>
      </GraphicsProvider>
    );
  }

  return (
    <CadProvider cadRef={cadActor}>
      <GraphicsProvider graphicsRef={graphicsActor}>
        <ViewerContent viewId={viewId} entryFile={entryFile} panelApi={panelApi} containerApi={containerApi} />
      </GraphicsProvider>
    </CadProvider>
  );
});

/**
 * Inner content of a viewer panel with an active file.
 * Separated to avoid conditional hook usage in the parent.
 * CadProvider + GraphicsProvider are wrapped above this -- all descendants use
 * useCad()/useCadSelector() and useGraphics()/useGraphicsSelector().
 */
const ViewerContent = memo(function ({
  viewId,
  entryFile,
  panelApi,
  containerApi,
}: {
  readonly viewId: string;
  readonly entryFile: string;
  readonly panelApi: DockviewPanelApi;
  readonly containerApi: DockviewApi;
}): React.JSX.Element {
  const { editorRef, projectRef } = useProject();
  const cadRef = useCad();
  const geometries = useCadSelector((state) => state.context.geometries, []);
  const units = useCadSelector((state) => state.context.units, undefined);
  const kernelClient = useCadSelector((state) => state.context.kernelClient, undefined);

  // The geometry unit can be closed via the parameters panel context menu.
  // When that happens cadRef goes undefined, geometries clear, but the panel
  // stays open. Surface a "Reopen renderer" overlay so the user can re-spawn
  // the cad actor without having to re-add the panel.
  const isGeometryUnitClosed = !cadRef;
  const handleReopenRenderer = useCallback(() => {
    projectRef.send({ type: 'createGeometryUnit', entryFile });
  }, [projectRef, entryFile]);

  // Bridge geometry data from the headless CadMachine to the per-view GraphicsMachine
  const graphicsActor = useGraphics();
  useEffect(() => {
    if (units) {
      graphicsActor.send({
        type: 'updateGeometries',
        geometries,
        units,
      });
    }
  }, [graphicsActor, geometries, units]);

  // Sync graphics + render timeout settings back to editor state for persistence
  useViewSettingsSync({
    viewId,
    graphicsRef: graphicsActor,
    cadRef,
    editorRef,
  });

  // Restore persisted render timeout on mount
  const viewSettings = useSelector(editorRef, (state) => state.context.viewSettings);
  const restoredTimeoutRef = useRef(false);
  useEffect(() => {
    if (restoredTimeoutRef.current || !cadRef) {
      return;
    }
    const persisted = viewSettings[viewId]?.graphicsSettings.renderTimeout;
    if (persisted !== undefined) {
      restoredTimeoutRef.current = true;
      cadRef.send({ type: 'setRenderTimeout', renderTimeout: persisted });
    }
  }, [cadRef, viewId, viewSettings]);

  // Select individual primitive values so that useSelector's reference equality
  // check works correctly. An object-returning selector creates a new reference
  // on every emission, causing unnecessary re-renders.
  const enableSurfaces = useGraphicsSelector((state) => state.context.enableSurfaces);
  const enableLines = useGraphicsSelector((state) => state.context.enableLines);
  const enableGizmo = useGraphicsSelector((state) => state.context.enableGizmo);
  const enableGrid = useGraphicsSelector((state) => state.context.enableGrid);
  const enableAxes = useGraphicsSelector((state) => state.context.enableAxes);
  const enableMatcap = useGraphicsSelector((state) => state.context.enableMatcap);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);

  // Shift the gizmo left when this panel's group is at the top-right corner
  // of the dockview grid, so it doesn't overlap with the floating-panel
  // trigger buttons positioned in the center pane.  On mobile the trigger
  // buttons don't exist, so the shift is skipped.
  const isMobile = useIsMobile();
  const isTopRight = useIsTopRightPanel(panelApi, containerApi);
  const shiftGizmo = isTopRight && !isMobile;

  const viewerLayoutRef = useRef<HTMLDivElement>(null);
  const { width: viewerLayoutWidth } = useResizeObserver({ ref: viewerLayoutRef });
  const toolbarAvailableWidth =
    viewerLayoutWidth === undefined ? undefined : Math.max(0, viewerLayoutWidth - bottomControlsGutterPx);

  return (
    <div ref={viewerLayoutRef} className='group/viewer relative flex h-full flex-col'>
      {/* Status overlays */}
      <div className='absolute top-[10%] right-2 left-2 z-10 mx-auto flex w-fit max-w-full flex-col gap-2'>
        <ChatInterfaceStatus />
        <ChatViewerStatus />
      </div>

      {/* Gizmo Container */}
      <div
        id={`viewport-gizmo-container-${viewId}`}
        className={cn(
          'absolute top-[calc(var(--header-height)+var(--spacing)*12)] z-10',
          shiftGizmo ? 'right-10' : 'right-0',
        )}
      />

      {/* Geometry canvas */}
      <div className='min-h-0 flex-1'>
        <CadViewer
          enableZoom
          enablePan
          enableGizmo={enableGizmo}
          enableGrid={enableGrid}
          enableAxes={enableAxes}
          enableSurfaces={enableSurfaces}
          enableLines={enableLines}
          enableMatcap={enableMatcap}
          upDirection={upDirection}
          geometries={geometries}
          gizmoContainer={`#viewport-gizmo-container-${viewId}`}
        />
      </div>

      {/* Reopen-renderer overlay — shown when the geometry unit was closed */}
      {isGeometryUnitClosed && (
        <div className='pointer-events-none absolute inset-0 z-20 flex items-center justify-center'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='shadow-lg pointer-events-auto'
            onClick={handleReopenRenderer}
          >
            <PlayCircle />
            Reopen renderer
          </Button>
        </div>
      )}

      {/* AR button — mobile iOS only, positioned bottom-right above controls */}
      <ArButton geometries={geometries} kernelClient={kernelClient} className='absolute right-3 bottom-14 z-10' />

      {/* Bottom controls */}
      <div className='absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-1rem)] shrink-0 flex-col items-start gap-2'>
        <ChatInterfaceGraphics />
        <ChatStackTrace entryFile={entryFile} side='bottom' />
        <ChatViewerControls availableWidth={toolbarAvailableWidth} className='self-stretch' />
      </div>
    </div>
  );
});
