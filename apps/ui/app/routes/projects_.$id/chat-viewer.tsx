import { memo, useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { DockviewApi, DockviewPanelApi, IDockviewPanelHeaderProps } from 'dockview-react';
import { FileX, FolderOpen, PlayCircle } from 'lucide-react';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import type { ModelComponentActionMenuData } from '#components/geometry/cad/model-component-action-menu.js';
import { ViewerModelComponentActionMenu } from '#components/geometry/cad/viewer-model-component-action-menu.js';
import type { ModelComponentSecondaryPointerTarget } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { FileSelector } from '#components/files/file-selector.js';
import { Button } from '#components/ui/button.js';
import { useProject } from '#hooks/use-project.js';
import { useFileTreeMap } from '#hooks/use-file-tree.js';
import { useFileContent } from '#hooks/use-file-content.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import { CadProvider, useCad, useCadSelector } from '#hooks/use-cad.js';
import {
  GraphicsProvider,
  useGraphics,
  useGraphicsSelector,
  useModelInteractionSelector,
} from '#hooks/use-graphics.js';
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
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  attachViewerSecondaryGestureTarget,
  beginViewerSecondaryGesture,
  cancelViewerSecondaryGesture,
  completeViewerSecondaryGesture,
  idleViewerSecondaryGestureState,
  moveViewerSecondaryGesture,
} from '#routes/projects_.$id/chat-viewer-secondary-gesture.js';
import type {
  ViewerSecondaryGestureMenu,
  ViewerSecondaryGesturePoint,
  ViewerSecondaryGestureState,
} from '#routes/projects_.$id/chat-viewer-secondary-gesture.js';

/** Horizontal inset sum for bottom controls (`left-2` + `right-2`); pairs with `max-w-[calc(100%-1rem)]` on the overlay. */
const bottomControlsGutterPx = 16;
const componentNameBadgeRightEdgeThresholdPx = 220;
const componentNameBadgeBottomEdgeThresholdPx = 56;

type ViewerPointerPosition = {
  readonly x: number;
  readonly y: number;
  readonly horizontal: 'left' | 'right';
  readonly vertical: 'above' | 'below';
};

const getViewerSecondaryGesturePoint = (event: React.PointerEvent<HTMLDivElement>): ViewerSecondaryGesturePoint => ({
  clientX: event.clientX,
  clientY: event.clientY,
});

const captureViewerPointer = ({
  element,
  pointerId,
}: {
  readonly element: HTMLElement;
  readonly pointerId: number;
}): void => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Pointer capture can fail if the browser has already ended the pointer session.
  }
};

const releaseViewerPointerCapture = ({
  element,
  pointerId,
}: {
  readonly element: HTMLElement;
  readonly pointerId: number;
}): void => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Some test/browser environments do not support pointer capture for every pointer type.
  }
};

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
  const geometry = useCadSelector((state) => state.context.geometry, undefined);
  const units = useCadSelector((state) => state.context.units, undefined);
  const kernelClient = useCadSelector((state) => state.context.kernelClient, undefined);

  // The geometry unit can be closed via the parameters panel context menu.
  // When that happens cadRef goes undefined, geometry clears, but the panel
  // stays open. Surface a "Reopen renderer" overlay so the user can re-spawn
  // the cad actor without having to re-add the panel.
  const isGeometryUnitClosed = !cadRef;
  const handleReopenRenderer = useCallback(() => {
    projectRef.send({ type: 'createGeometryUnit', entryFile });
  }, [projectRef, entryFile]);

  // Bridge geometry data from the headless CadMachine to the per-view GraphicsMachine
  const graphicsActor = useGraphics();
  useEffect(() => {
    if (units && geometry) {
      graphicsActor.send({
        type: 'updateGeometry',
        geometry,
        units,
        sourceFile: entryFile,
      });
    }
  }, [entryFile, graphicsActor, geometry, units]);

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
  const canvasRegionRef = useRef<HTMLDivElement>(null);
  const canvasEventSource = canvasRegionRef as React.RefObject<HTMLElement>;
  const { width: viewerLayoutWidth } = useResizeObserver({ ref: viewerLayoutRef });
  const toolbarAvailableWidth =
    viewerLayoutWidth === undefined ? undefined : Math.max(0, viewerLayoutWidth - bottomControlsGutterPx);
  const [viewerPointerPosition, setViewerPointerPosition] = useState<ViewerPointerPosition | undefined>(undefined);
  const [viewerActionMenu, setViewerActionMenu] = useState<ViewerSecondaryGestureMenu | undefined>(undefined);
  const secondaryGestureRef = useRef<ViewerSecondaryGestureState>(idleViewerSecondaryGestureState);
  const modelInteractionUnitId = useMemo(() => deriveModelInteractionUnitId({ sourceFile: entryFile }), [entryFile]);
  const componentNameForPointer = useModelInteractionSelector((state) => {
    const unit = getModelInteractionUnitState(state.context, modelInteractionUnitId);
    const { hoveredComponentId } = unit;
    if (!hoveredComponentId) {
      return undefined;
    }
    return unit.manifest?.nodesById[hoveredComponentId]?.name;
  });
  const viewerActionMenuData = useModelInteractionSelector((state): ModelComponentActionMenuData | undefined => {
    if (!viewerActionMenu) {
      return undefined;
    }

    const unit = getModelInteractionUnitState(state.context, viewerActionMenu.target.unitId);
    const { manifest } = unit;
    const node = manifest?.nodesById[viewerActionMenu.target.componentId];
    if (!manifest || !node) {
      return undefined;
    }

    return {
      manifest,
      node,
      graphicsRef: graphicsActor,
      unitId: viewerActionMenu.target.unitId,
      source: 'viewer',
      isFocused: unit.focusedComponentId === viewerActionMenu.target.componentId,
      isIsolated: unit.isolatedComponentIds.includes(viewerActionMenu.target.componentId),
      opacity: unit.opacityByComponentId[viewerActionMenu.target.componentId] ?? 1,
    };
  });

  const updateViewerPointerPosition = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const viewerBounds = viewerLayoutRef.current?.getBoundingClientRect();
    if (!viewerBounds) {
      setViewerPointerPosition(undefined);
      return;
    }

    const x = Math.max(0, Math.min(event.clientX - viewerBounds.left, viewerBounds.width));
    const y = Math.max(0, Math.min(event.clientY - viewerBounds.top, viewerBounds.height));
    setViewerPointerPosition({
      x,
      y,
      horizontal: x > viewerBounds.width - componentNameBadgeRightEdgeThresholdPx ? 'right' : 'left',
      vertical: y > viewerBounds.height - componentNameBadgeBottomEdgeThresholdPx ? 'above' : 'below',
    });
  }, []);

  const clearViewerPointerPosition = useCallback((): void => {
    setViewerPointerPosition(undefined);
  }, []);

  const handleModelComponentSecondaryPointerCandidate = useCallback(
    (target: ModelComponentSecondaryPointerTarget | undefined): void => {
      secondaryGestureRef.current = attachViewerSecondaryGestureTarget(secondaryGestureRef.current, target);
    },
    [],
  );

  const handleCanvasRegionPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 2) {
      return;
    }

    setViewerActionMenu(undefined);
    secondaryGestureRef.current = beginViewerSecondaryGesture({
      pointerId: event.pointerId,
      point: getViewerSecondaryGesturePoint(event),
    });
    captureViewerPointer({ element: event.currentTarget, pointerId: event.pointerId });
  }, []);

  const handleCanvasRegionPointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const previousGestureState = secondaryGestureRef.current;
      const nextGestureState = moveViewerSecondaryGesture({
        state: previousGestureState,
        pointerId: event.pointerId,
        point: getViewerSecondaryGesturePoint(event),
      });

      if (previousGestureState.status === 'pendingContextClick' && nextGestureState.status === 'cameraPan') {
        graphicsActor.send({ type: 'markModelPointerGestureMoved' });
      }

      secondaryGestureRef.current = nextGestureState;
    },
    [graphicsActor],
  );

  const handleCanvasRegionPointerUpCapture = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 2) {
      return;
    }

    const completion = completeViewerSecondaryGesture({
      state: secondaryGestureRef.current,
      pointerId: event.pointerId,
      point: getViewerSecondaryGesturePoint(event),
    });
    secondaryGestureRef.current = completion.state;
    releaseViewerPointerCapture({ element: event.currentTarget, pointerId: event.pointerId });
    setViewerActionMenu(completion.menu);
  }, []);

  const handleCanvasRegionPointerCancelCapture = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    secondaryGestureRef.current = cancelViewerSecondaryGesture(secondaryGestureRef.current, event.pointerId);
    releaseViewerPointerCapture({ element: event.currentTarget, pointerId: event.pointerId });
    setViewerPointerPosition(undefined);
  }, []);

  const handleCanvasRegionLostPointerCapture = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    secondaryGestureRef.current = cancelViewerSecondaryGesture(secondaryGestureRef.current, event.pointerId);
  }, []);

  const handleCanvasRegionContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleViewerActionMenuOpenChange = useCallback((isOpen: boolean): void => {
    if (!isOpen) {
      setViewerActionMenu(undefined);
    }
  }, []);

  useEffect(() => {
    if (isGeometryUnitClosed) {
      setViewerPointerPosition(undefined);
      setViewerActionMenu(undefined);
      secondaryGestureRef.current = idleViewerSecondaryGestureState;
    }
  }, [isGeometryUnitClosed]);

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
      <div
        ref={canvasRegionRef}
        data-testid='cad-viewer-canvas-region'
        className='min-h-0 flex-1'
        onPointerDownCapture={handleCanvasRegionPointerDownCapture}
        onPointerMoveCapture={handleCanvasRegionPointerMoveCapture}
        onPointerUpCapture={handleCanvasRegionPointerUpCapture}
        onPointerCancelCapture={handleCanvasRegionPointerCancelCapture}
        onLostPointerCapture={handleCanvasRegionLostPointerCapture}
        onContextMenu={handleCanvasRegionContextMenu}
        onPointerMove={updateViewerPointerPosition}
        onPointerLeave={clearViewerPointerPosition}
        onPointerCancel={clearViewerPointerPosition}
      >
        {geometry ? (
          <CadViewer
            enableZoom
            enablePan
            secondaryMouseButtonMode='camera-pan'
            enableGizmo={enableGizmo}
            enableGrid={enableGrid}
            enableAxes={enableAxes}
            enableSurfaces={enableSurfaces}
            enableLines={enableLines}
            enableMatcap={enableMatcap}
            upDirection={upDirection}
            geometry={geometry}
            sourceFile={entryFile}
            // Keep R3F on default offsetX/Y compute; eventPrefix='client'
            // is window-relative and mis-rays docked panels.
            eventSource={canvasEventSource}
            gizmoContainer={`#viewport-gizmo-container-${viewId}`}
            onModelComponentSecondaryPointerCandidate={handleModelComponentSecondaryPointerCandidate}
          />
        ) : (
          <div role='status' aria-label='Waiting for geometry' className='size-full bg-background' />
        )}
      </div>
      <ViewerModelComponentActionMenu
        isOpen={viewerActionMenu !== undefined}
        point={viewerActionMenu?.point}
        data={viewerActionMenuData}
        onOpenChange={handleViewerActionMenuOpenChange}
      />

      {!isGeometryUnitClosed && viewerPointerPosition && componentNameForPointer ? (
        <ModelComponentNameBadge componentName={componentNameForPointer} position={viewerPointerPosition} />
      ) : undefined}

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
      <ArButton geometry={geometry} kernelClient={kernelClient} className='absolute right-3 bottom-14 z-10' />

      {/* Bottom controls */}
      <div
        data-testid='chat-viewer-bottom-controls-overlay'
        className='pointer-events-none absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-1rem)] shrink-0 flex-col items-start gap-2 [&>*]:pointer-events-auto'
      >
        <ChatInterfaceGraphics />
        <ChatStackTrace entryFile={entryFile} side='bottom' />
        <ChatViewerControls availableWidth={toolbarAvailableWidth} className='self-stretch' />
      </div>
    </div>
  );
});

function ModelComponentNameBadge({
  componentName,
  position,
}: {
  readonly componentName: string;
  readonly position: ViewerPointerPosition;
}): React.JSX.Element {
  return (
    <div
      aria-hidden='true'
      data-testid='model-component-name-badge'
      className={cn(
        'pointer-events-none absolute z-20 max-w-[min(18rem,calc(100%-1rem))] truncate rounded-md border border-border/60 bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md',
        position.horizontal === 'right' ? '-translate-x-[calc(100%+8px)]' : 'translate-x-2',
        position.vertical === 'above' ? '-translate-y-[calc(100%+10px)]' : 'translate-y-2.5',
      )}
      style={
        {
          left: `${position.x}px`,
          top: `${position.y}px`,
          '--viewer-hover-label-x': `${position.x}px`,
          '--viewer-hover-label-y': `${position.y}px`,
        } as React.CSSProperties
      }
    >
      {componentName}
    </div>
  );
}
