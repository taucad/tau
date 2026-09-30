/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The CAD canvas needs focus for scoped viewer shortcuts; a button role would misrepresent a drawing surface. */
import { memo, useEffect, useCallback, useMemo, useRef, useState } from 'react';
import type { FileEntry } from '@taucad/types';
import { asKnownArtifact } from '@taucad/runtime';
import type { Evaluation, Rendering, RuntimeDocument } from '@taucad/runtime';
import { canonicalJson } from '@taucad/utils/hash';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { FileX, FolderOpen, PlayCircle } from 'lucide-react';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { RuntimeErrorOverlay } from '#components/model-viewer.js';
import type { ModelComponentActionMenuData } from '#components/geometry/cad/model-component-action-menu.js';
import { ViewerModelComponentActionMenu } from '#components/geometry/cad/viewer-model-component-action-menu.js';
import type { ModelComponentSecondaryPointerTarget } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { FileSelector } from '#components/files/file-selector.js';
import { Button } from '@taucad/ui/components/button';
import { popoverSurfaceVariants } from '@taucad/ui/components/popover.variants';
import { useProject } from '#hooks/use-project.js';
import { useFileTreeSelector } from '#hooks/use-file-tree.js';
import { useFileContent } from '#hooks/use-file-content.js';
import { useRevisionStatus } from '#hooks/use-revision-status.js';
import { Loader } from '#components/ui/loader.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';
import { setLocalInstanceChoice, useLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { newViewRecord, viewTabTitle } from '#workbench-records/projection.js';
import { CadProvider, useCad, useCadSelector } from '#hooks/use-cad.js';
import {
  GraphicsProvider,
  useGraphics,
  useGraphicsSelector,
  useKinematicsSelector,
  useModelInteractionSelector,
} from '#hooks/use-graphics.js';
import type { ViewCameraSeed } from '#services/graphics-camera-registry.js';
import { ChatStackTrace } from '#routes/w.$workspace.$project/chat-stack-trace.js';
import { ChatViewerStatus } from '#routes/w.$workspace.$project/chat-viewer-status.js';
import { ChatViewerControls } from '#routes/w.$workspace.$project/chat-viewer-controls.js';
import { cn } from '@taucad/ui/utils/cn';
import { isEmptyGlb } from '#utils/inspect-glb.utils.js';
import { ArButton } from '#components/cad/ar-button.js';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { describeKinematicsHover, getKinematicsUnitState } from '#machines/kinematics.machine.js';
import {
  selectCadEvaluation,
  selectCadRendering,
  selectCadDocument,
  selectCadFailureIssues,
  selectIsCadLoading,
} from '#machines/cad.machine.js';
import {
  attachViewerSecondaryGestureTarget,
  beginViewerSecondaryGesture,
  cancelViewerSecondaryGesture,
  completeViewerSecondaryGesture,
  idleViewerSecondaryGestureState,
  moveViewerSecondaryGesture,
} from '#routes/w.$workspace.$project/chat-viewer-secondary-gesture.js';
import type {
  ViewerSecondaryGestureMenu,
  ViewerSecondaryGesturePoint,
  ViewerSecondaryGestureState,
} from '#routes/w.$workspace.$project/chat-viewer-secondary-gesture.js';

const componentNameBadgeRightEdgeThresholdPx = 220;
/** Within this distance of the bottom controls' top edge the badge flips above the pointer. */
const componentNameBadgeBottomThresholdPx = 56;

/** One visible Dockview pane owns one runtime view; the CAD unit separately keeps its default view. */
function usePaneRuntimeView({
  document,
  evaluation,
  selectedId,
  options,
  instance,
  blocked,
}: Readonly<{
  document: RuntimeDocument | undefined;
  evaluation: Evaluation | undefined;
  selectedId: string | undefined;
  options: Record<string, unknown> | undefined;
  instance: string | undefined;
  blocked?: string;
}>): Readonly<{ rendering: Rendering | undefined; unavailable: string | undefined }> {
  const [lastSuccess, setLastSuccess] = useState<{ key: string; rendering: Rendering } | undefined>();
  const [viewError, setViewError] = useState<{ key: string; message: string } | undefined>();
  const offered = evaluation?.success ? evaluation.views.find((view) => view.id === selectedId) : undefined;
  const unavailable =
    blocked ??
    (selectedId && evaluation?.success && !offered
      ? `Saved view “${selectedId}” is unavailable in this build.`
      : selectedId &&
          instance &&
          offered?.instances &&
          !offered.instances.some((offeredInstance) => offeredInstance.id === instance)
        ? `Saved instance “${instance}” is unavailable in view “${selectedId}”.`
        : undefined);
  const optionsKey = canonicalJson(options ?? {});
  const isEmpty = evaluation?.success === true && evaluation.views.length === 0;
  // The presented picture belongs to this document until a replacement succeeds,
  // including while the person switches views or a new view fails.
  const pictureKey = document?.id ?? '';
  const subscriptionKey = `${document?.id ?? ''}:${selectedId ?? ''}:${optionsKey}:${instance ?? ''}`;

  useEffect(() => {
    if (!document || Boolean(unavailable) || isEmpty) {
      return;
    }
    let closed = false;
    let view: ReturnType<typeof document.view>;
    try {
      const request = {
        options: JSON.parse(optionsKey) as Record<string, unknown>,
        ...(instance ? { instance } : {}),
      };
      view = selectedId ? document.view(selectedId, request) : document.view();
    } catch (error) {
      queueMicrotask(() => {
        if (!closed) {
          setViewError({
            key: subscriptionKey,
            message: error instanceof Error ? error.message : 'The selected view failed',
          });
        }
      });
      return () => {
        closed = true;
      };
    }
    const onRendering = (next: Rendering): void => {
      if (closed) {
        return;
      }
      if (next.success) {
        setLastSuccess({ key: pictureKey, rendering: next });
      }
      setViewError(
        next.success
          ? undefined
          : {
              key: subscriptionKey,
              message: next.issues.map((issue) => issue.message).join('; ') || 'View failed',
            },
      );
    };
    const unrendered = view.on('rendered', onRendering);
    const unstatus = view.on('status', (status) => {
      if (!closed && status === 'error') {
        setViewError((current) =>
          current?.key === subscriptionKey
            ? current
            : { key: subscriptionKey, message: 'The selected view is unavailable.' },
        );
      }
    });
    const readInitial = async (): Promise<void> => {
      try {
        const outcome = await view.rendering();
        if (!outcome.superseded) {
          onRendering(outcome.rendering);
        }
      } catch (error) {
        if (!closed) {
          setViewError({
            key: subscriptionKey,
            message: error instanceof Error ? error.message : 'The selected view failed',
          });
        }
      }
    };
    // async-iife: bootstrap — the subscription is the owner of its initial rendering settlement.
    void readInitial();
    return () => {
      closed = true;
      unrendered();
      unstatus();
      view.close();
    };
  }, [document, isEmpty, selectedId, optionsKey, instance, unavailable, pictureKey, subscriptionKey]);

  return {
    rendering:
      evaluation?.success && evaluation.views.length === 0
        ? undefined
        : lastSuccess?.key === pictureKey
          ? lastSuccess.rendering
          : undefined,
    unavailable: unavailable ?? (viewError?.key === subscriptionKey ? viewError.message : undefined),
  };
}

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
  readonly entryPath: string | undefined;
  /** Dockview panel API for updating title, etc. */
  readonly panelApi: IDockviewPanelHeaderProps['api'];
  readonly profile?: 'editor' | 'shared';
};

function MissingViewerFile({
  entryPath,
  onSelect,
}: {
  readonly entryPath: string;
  readonly onSelect: (path: string) => void;
}): React.JSX.Element {
  const checkingRemote = useRevisionStatus()?.sync.state === 'checking';
  return (
    <div className='flex h-full flex-col items-center justify-center gap-4 text-muted-foreground'>
      {checkingRemote ? (
        <Loader className='size-12 motion-reduce:animate-none' />
      ) : (
        <FileX className='size-12 stroke-1' />
      )}
      <div className='flex flex-col items-center gap-1' role={checkingRemote ? 'status' : undefined}>
        <p className='text-sm font-medium'>{checkingRemote ? 'Checking synced files…' : 'File not found'}</p>
        <p className='max-w-60 truncate text-xs'>{entryPath}</p>
      </div>
      <FileSelector
        selectedFile={undefined}
        placeholder='Select a file to render…'
        className='h-8 w-50'
        title='Viewport File'
        description='Choose a file to render in the viewport'
        searchPlaceholder='Search files…'
        emptyMessage='No files found.'
        onSelect={onSelect}
      />
    </div>
  );
}

export const ChatViewer = memo(function ({
  viewId,
  entryPath,
  panelApi,
  profile = 'editor',
}: ChatViewerProps): React.JSX.Element {
  const { projectRef, viewGraphics, viewRecords, entriesRecord, geometryUnits, mainEntryPath, setViewEntryPath } =
    useProject();
  const viewCommands = useWorkbenchViewCommands();
  // Get the per-view graphics machine
  const graphicsActor = viewGraphics.get(viewId);

  // Get the geometry unit for this view's entry path
  const cadActor = entryPath ? geometryUnits.get(entryPath) : undefined;

  // Detect if the entry path is a directory: a listed directory entry, or a
  // prefix of a listed path when its directory has not been listed itself.
  // Selected as a boolean so a tree publication (every file write) re-renders
  // the viewer only when the answer changes.
  const selectIsDirectory = useCallback(
    (fileTree: ReadonlyMap<string, FileEntry>): boolean => {
      if (!entryPath) {
        return false;
      }

      const entry = fileTree.get(entryPath);
      if (entry) {
        return entry.type === 'dir';
      }

      const directoryPrefix = `${entryPath}/`;
      for (const key of fileTree.keys()) {
        if (key.startsWith(directoryPrefix)) {
          return true;
        }
      }

      return false;
    },
    [entryPath],
  );
  const isDirectory = useFileTreeSelector(selectIsDirectory);

  // Derive isMissing from content service orphan outcome (VS Code pattern).
  // useFileContent auto-loads on cache miss; missing files resolve to the
  // 'orphaned' outcome via the discriminated FileContentResult contract.
  const fileContent = useFileContent(entryPath);
  const isMissing = fileContent.kind === 'orphaned' && !isDirectory;

  useEffect(() => {
    if (!graphicsActor || (entryPath && !isDirectory && !isMissing)) {
      return;
    }
    const unitId = graphicsActor.getSnapshot().context.modelInteractionUnitId;
    graphicsActor.send({ type: 'clearArtifact' });
    if (unitId) {
      projectRef.send({ type: 'reconcileViewManifest', unitId });
    }
  }, [entryPath, graphicsActor, isDirectory, isMissing, projectRef]);

  // The project view record is the camera seed for this pane.
  const viewRecord = viewRecords.get(viewId);
  const savedCamera = viewRecord?.selectedKernelView
    ? viewRecord.kernelViews?.find((view) => view.id === viewRecord.selectedKernelView)?.camera
    : viewRecord?.camera;
  /* Create-only seed for this view's camera session, built when the viewer mounts its canvas. The
   * canvas-less branches mount no provider, so a directory or a missing file builds no camera (R8). */
  const cameraSeed: ViewCameraSeed = {
    identity: entryPath,
    camera: {
      cameraFovAngle: viewRecord?.fieldOfView,
      cameraView: savedCamera?.kind === 'pose' ? savedCamera : undefined,
    },
  };

  // Handle file selection in the viewport FileSelector
  const handleFileSelect = useCallback(
    (path: string) => {
      // Ensure geometry unit exists for the selected file
      if (!geometryUnits.has(path)) {
        projectRef.send({
          type: 'createGeometryUnit',
          entryPath: path,
          operationTimeout: entriesRecord?.entries[path]?.operationTimeout,
        });
      }

      /* Cuts and measurements are entry-scoped and the graphics actor is retained across a file switch,
       * so the live ones are removed here too; removing the last cut ends Section. Turning Section off
       * would keep the cuts, and the next persist would write the previous file's cuts and pinned
       * measurements -- placed on geometry that is gone -- into the new file's record. */
      const graphicsContext = graphicsActor?.getSnapshot().context;
      for (const { id } of graphicsContext?.sectionCuts ?? []) {
        graphicsActor?.send({ type: 'removeSectionCut', payload: id });
      }
      for (const { id } of graphicsContext?.measurements ?? []) {
        graphicsActor?.send({ type: 'clearMeasurement', payload: id });
      }
      graphicsActor?.send({ type: 'cancelCurrentMeasurement' });

      void viewCommands.edit(viewId, (current) => ({
        ...(current ?? newViewRecord(path)),
        entryPath: path,
        camera: { kind: 'preset', preset: 'isometric' },
        section: { active: false, cuts: [] },
        measurements: [],
      }));
      setViewEntryPath(viewId, path);

      // Update Dockview panel params so the component re-renders with new entryPath
      panelApi.updateParameters({ entryPath: path });

      // Update the Dockview panel title
      panelApi.setTitle(viewTabTitle({ ...(viewRecord ?? newViewRecord(path)), entryPath: path }));
    },
    [
      entriesRecord,
      projectRef,
      geometryUnits,
      graphicsActor,
      viewId,
      panelApi,
      setViewEntryPath,
      viewCommands,
      viewRecord,
    ],
  );

  // A cloud project opens with a placeholder main file. Follow the real main
  // when its synced manifest arrives, but keep viewers on other chosen files.
  const previousMainEntryPath = useRef(mainEntryPath);
  useEffect(() => {
    const previous = previousMainEntryPath.current;
    previousMainEntryPath.current = mainEntryPath;
    if (entryPath === previous && mainEntryPath && mainEntryPath !== previous) {
      handleFileSelect(mainEntryPath);
    }
  }, [entryPath, handleFileSelect, mainEntryPath]);

  // If no graphics actor yet, render a placeholder
  if (!graphicsActor) {
    return (
      <div className='flex h-full items-center justify-center text-muted-foreground'>
        <span className='text-sm'>Initializing viewer…</span>
      </div>
    );
  }

  // If no file selected, render empty state with file selector
  if (!entryPath) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-4 text-muted-foreground'>
        <span className='text-sm'>No file selected</span>
        <FileSelector
          selectedFile={undefined}
          placeholder='Select file to render…'
          className='h-8 w-50'
          title='Viewport File'
          description='Choose which file to render in the viewport'
          searchPlaceholder='Search files…'
          emptyMessage='No files found.'
          onSelect={handleFileSelect}
        />
      </div>
    );
  }

  // If the entry path is a directory, show a friendly screen with a file selector
  if (isDirectory) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-4 text-muted-foreground'>
        <FolderOpen className='size-12 stroke-1' />
        <p className='text-sm'>The viewer cannot display a directory.</p>
        <FileSelector
          selectedFile={undefined}
          initialPath={entryPath}
          placeholder='Select a file to render…'
          className='h-8 w-50'
          title='Viewport File'
          description='Choose a file to render in the viewport'
          searchPlaceholder='Search files…'
          emptyMessage='No files found.'
          onSelect={handleFileSelect}
        />
      </div>
    );
  }

  // If the entry path doesn't exist in the file tree, show a friendly "not found" screen
  if (isMissing) {
    return <MissingViewerFile entryPath={entryPath} onSelect={handleFileSelect} />;
  }

  return (
    <CadProvider cadRef={cadActor}>
      <GraphicsProvider graphicsRef={graphicsActor} seed={cameraSeed}>
        <ViewerContent viewId={viewId} entryPath={entryPath} profile={profile} />
      </GraphicsProvider>
    </CadProvider>
  );
});

/** Stands in for geometry that has not arrived; subscribes to loading so the viewer does not. */
function GeometryPlaceholder({ isEmpty = false }: { readonly isEmpty?: boolean }): React.JSX.Element {
  const isCadLoading = useCadSelector(selectIsCadLoading, false);
  return (
    <div
      role='status'
      aria-label={isEmpty ? 'Empty model' : isCadLoading ? 'Loading geometry' : 'Waiting for geometry'}
      aria-busy={isCadLoading || undefined}
      className='size-full bg-background'
    />
  );
}

/**
 * Inner content of a viewer panel with an active file.
 * Separated to avoid conditional hook usage in the parent.
 * CadProvider + GraphicsProvider are wrapped above this -- all descendants use
 * useCad()/useCadSelector() and useGraphics()/useGraphicsSelector().
 */
const ViewerContent = memo(function ({
  viewId,
  entryPath,
  profile,
}: {
  readonly viewId: string;
  readonly entryPath: string;
  readonly profile: 'editor' | 'shared';
}): React.JSX.Element {
  const { projectRef, entriesRecord, viewRecords } = useProject();
  const viewCommands = useWorkbenchViewCommands();
  const cadRef = useCad();
  const evaluation = useCadSelector(selectCadEvaluation, undefined);
  const defaultRendering = useCadSelector(selectCadRendering, undefined);
  const runtimeDocument = useCadSelector(selectCadDocument, undefined);
  const savedView = viewRecords.get(viewId);
  const selectedKernelView = savedView?.selectedKernelView;
  const offeredViewId = selectedKernelView ?? (evaluation?.success ? evaluation.views[0]?.id : undefined);
  const selectedState = savedView?.kernelViews?.find((state) => state.id === offeredViewId);
  const localInstance = useLocalInstanceChoice(viewId);
  const localForView = localInstance?.viewId === offeredViewId ? localInstance : undefined;
  const localExpired =
    localForView && localForView.evaluationId !== evaluation?.id
      ? `Instance “${localForView.instanceId}” belonged to a previous evaluation. Choose a current instance.`
      : undefined;
  const { rendering: paneRendering, unavailable } = usePaneRuntimeView({
    document: runtimeDocument,
    evaluation,
    selectedId:
      selectedKernelView ??
      (Boolean(localForView) || Boolean(selectedState?.authoredInstance) || Boolean(selectedState?.options)
        ? offeredViewId
        : undefined),
    options: selectedState?.options,
    instance: localForView && !localExpired ? localForView.instanceId : selectedState?.authoredInstance,
    blocked: localExpired,
  });
  const rendering =
    evaluation?.success && evaluation.views.length === 0
      ? undefined
      : (paneRendering ?? (selectedKernelView ? undefined : defaultRendering));
  const knownArtifact = rendering?.success ? asKnownArtifact(rendering.artifact) : undefined;
  const emptyModel = useMemo(
    () =>
      (evaluation?.success === true && evaluation.views.length === 0) ||
      (knownArtifact?.mimeType === 'model/gltf-binary' && isEmptyGlb(knownArtifact.content)),
    [evaluation, knownArtifact],
  );
  const artifact = rendering?.success && !emptyModel ? rendering.artifact : undefined;
  const artifactHash = artifact && rendering?.success ? rendering.hash : undefined;
  const failureIssues = useCadSelector(selectCadFailureIssues, undefined);
  const failureMessage =
    failureIssues?.find((issue) => issue.severity === 'error')?.message ?? failureIssues?.[0]?.message;
  const overlayFailureMessage = profile === 'shared' ? failureMessage : undefined;

  // The geometry unit can be closed via the parameters panel context menu.
  // When that happens cadRef goes undefined, geometry clears, but the panel
  // stays open. Surface a "Reopen renderer" overlay so the user can re-spawn
  // the cad actor without having to re-add the panel.
  const isGeometryUnitClosed = !cadRef;
  const handleReopenRenderer = useCallback(() => {
    projectRef.send({
      type: 'createGeometryUnit',
      entryPath,
      operationTimeout: entriesRecord?.entries[entryPath]?.operationTimeout,
    });
  }, [entriesRecord, projectRef, entryPath]);

  // Bridge this pane's projection to its graphics owner. Other panes may show
  // different views of the same evaluated document without changing this one.
  const graphicsActor = useGraphics();
  const presentedUnitId = useGraphicsSelector((state) => state.context.modelInteractionUnitId);
  const presentedMediaType = useGraphicsSelector((state) => state.context.artifact?.mimeType);
  const previousPresentation = useRef({ unitId: presentedUnitId, mimeType: presentedMediaType });
  useEffect(() => {
    const previous = previousPresentation.current;
    previousPresentation.current = { unitId: presentedUnitId, mimeType: presentedMediaType };
    if (
      previous.unitId &&
      (previous.unitId !== presentedUnitId ||
        (previous.mimeType === 'model/gltf-binary' && presentedMediaType !== 'model/gltf-binary'))
    ) {
      projectRef.send({ type: 'reconcileViewManifest', unitId: previous.unitId });
    }
  }, [presentedUnitId, presentedMediaType, projectRef]);
  useEffect(() => {
    if (emptyModel) {
      graphicsActor.send({ type: 'clearArtifact' });
      return;
    }
    if (!rendering?.success) {
      return;
    }
    const known = asKnownArtifact(rendering.artifact);
    if (known) {
      graphicsActor.send({
        type: 'updateArtifact',
        artifact: known,
        hash: rendering.hash,
        sourceFile: rendering.sourceRevision?.entry ?? entryPath,
      });
    }
  }, [rendering, emptyModel, entryPath, graphicsActor]);

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
  const viewerLayoutRef = useRef<HTMLDivElement>(null);
  const bottomControlsRef = useRef<HTMLDivElement>(null);
  const canvasRegionRef = useRef<HTMLDivElement>(null);
  const canvasEventSource = canvasRegionRef as React.RefObject<HTMLElement>;
  const [isPointerOverViewer, setIsPointerOverViewer] = useState(false);
  const [viewerActionMenu, setViewerActionMenu] = useState<ViewerSecondaryGestureMenu | undefined>(undefined);
  const secondaryGestureRef = useRef<ViewerSecondaryGestureState>(idleViewerSecondaryGestureState);
  const modelInteractionUnitId = useMemo(() => deriveModelInteractionUnitId({ sourceFile: entryPath }), [entryPath]);
  const componentNameForPointer = useModelInteractionSelector((state) => {
    const unit = getModelInteractionUnitState(state.context, modelInteractionUnitId);
    const { hoveredComponentId } = unit;
    // The open action menu already names its part, and the badge would draw over it.
    if (!hoveredComponentId || viewerActionMenu) {
      return undefined;
    }
    return unit.manifest?.nodesById[hoveredComponentId]?.name;
  });
  const hoveredComponentId = useModelInteractionSelector(
    (state) => getModelInteractionUnitState(state.context, modelInteractionUnitId).hoveredComponentId,
  );
  const kinematicsDetail = useKinematicsSelector((state) =>
    hoveredComponentId
      ? describeKinematicsHover(getKinematicsUnitState(state.context, modelInteractionUnitId), hoveredComponentId)
      : undefined,
  );
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
      hasHiddenComponents: unit.hiddenComponentIds.length > 0,
      hasOpacityOverrides: Object.keys(unit.opacityByComponentId).length > 0,
      opacity: unit.opacityByComponentId[viewerActionMenu.target.componentId] ?? 1,
    };
  });

  // Pointer moves arrive at display rate, including throughout a camera orbit.
  // The hover badge is placed from custom properties written straight to the
  // layout element so a move never re-renders this subtree; only pointer
  // entry/exit is React state.
  const updateViewerPointerPosition = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const layout = viewerLayoutRef.current;
    const viewerBounds = layout?.getBoundingClientRect();
    if (!layout || !viewerBounds) {
      setIsPointerOverViewer(false);
      return;
    }

    const x = Math.max(0, Math.min(event.clientX - viewerBounds.left, viewerBounds.width));
    const y = Math.max(0, Math.min(event.clientY - viewerBounds.top, viewerBounds.height));
    // Read at each move rather than kept: the bar grows and shrinks as tools start and stop.
    const controlsTop =
      (bottomControlsRef.current?.getBoundingClientRect().top ?? viewerBounds.bottom) - viewerBounds.top;
    layout.style.setProperty('--viewer-hover-label-x', `${x}px`);
    layout.style.setProperty('--viewer-hover-label-y', `${y}px`);
    layout.style.setProperty(
      '--viewer-hover-label-translate-x',
      x > viewerBounds.width - componentNameBadgeRightEdgeThresholdPx ? 'calc(-100% - 8px)' : '8px',
    );
    layout.style.setProperty(
      '--viewer-hover-label-translate-y',
      y > controlsTop - componentNameBadgeBottomThresholdPx ? 'calc(-100% - 10px)' : '10px',
    );
    setIsPointerOverViewer(true);
  }, []);

  const clearViewerPointerPosition = useCallback((): void => {
    setIsPointerOverViewer(false);
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
    setIsPointerOverViewer(false);
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
      queueMicrotask(() => {
        setIsPointerOverViewer(false);
        setViewerActionMenu(undefined);
      });
      secondaryGestureRef.current = idleViewerSecondaryGestureState;
    }
  }, [isGeometryUnitClosed]);

  return (
    <div
      ref={viewerLayoutRef}
      data-testid='chat-viewer-layout'
      data-viewer-frame
      className='group/viewer @container/viewer relative flex h-full flex-col'
      onKeyDown={(event) => {
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          evaluation?.success !== true ||
          evaluation.views.length < 2
        ) {
          return;
        }
        const { target } = event;
        if (
          !(target instanceof HTMLElement) ||
          target.isContentEditable ||
          target.closest('input, textarea, select, [contenteditable], [role="textbox"], .monaco-editor')
        ) {
          return;
        }
        const index = Number(event.key) - 1;
        const next = Number.isInteger(index) && index >= 0 && index < 3 ? evaluation.views[index] : undefined;
        if (!next) {
          return;
        }
        event.preventDefault();
        setLocalInstanceChoice(viewId, undefined);
        void viewCommands.edit(viewId, (current) => ({
          ...(current ?? newViewRecord(entryPath)),
          selectedKernelView: next.id,
        }));
      }}
    >
      {/* Status overlays */}
      <div className='absolute top-[10%] right-2 left-2 z-10 mx-auto flex w-fit max-w-full flex-col gap-2'>
        <ChatViewerStatus />
        {unavailable ? (
          <div role='alert' className='rounded-md border border-border bg-background/95 p-3 text-sm shadow-sm'>
            <p>{unavailable}</p>
            <Button
              size='sm'
              variant='outline'
              className='mt-2'
              onClick={() => {
                void viewCommands.edit(viewId, (current) => ({
                  ...(current ?? newViewRecord(entryPath)),
                  selectedKernelView: undefined,
                }));
                setLocalInstanceChoice(viewId, undefined);
              }}
            >
              Use default view
            </Button>
          </div>
        ) : null}
      </div>

      {/* Geometry canvas */}
      <div
        id={`viewport-gizmo-container-${viewId}`}
        ref={canvasRegionRef}
        data-testid='cad-viewer-canvas-region'
        role='application'
        aria-label='CAD canvas'
        tabIndex={0}
        className='relative min-h-0 flex-1 overflow-hidden'
        onPointerDownCapture={handleCanvasRegionPointerDownCapture}
        onPointerMoveCapture={handleCanvasRegionPointerMoveCapture}
        onPointerUpCapture={handleCanvasRegionPointerUpCapture}
        onPointerCancelCapture={handleCanvasRegionPointerCancelCapture}
        onLostPointerCapture={handleCanvasRegionLostPointerCapture}
        onContextMenu={handleCanvasRegionContextMenu}
        onPointerMove={updateViewerPointerPosition}
        onPointerLeave={clearViewerPointerPosition}
      >
        {artifact ? (
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
            artifact={artifact}
            artifactHash={artifactHash}
            sourceFile={entryPath}
            // Keep R3F on default offsetX/Y compute; eventPrefix='client'
            // is window-relative and mis-rays docked panels.
            eventSource={canvasEventSource}
            gizmoContainer={`#viewport-gizmo-container-${viewId}`}
            onModelComponentSecondaryPointerCandidate={handleModelComponentSecondaryPointerCandidate}
          />
        ) : overlayFailureMessage ? (
          <RuntimeErrorOverlay
            message={overlayFailureMessage}
            className='size-full flex-col justify-center gap-3 bg-background text-center [&>svg]:size-10'
          />
        ) : (
          <GeometryPlaceholder isEmpty={emptyModel} />
        )}
        {artifact && overlayFailureMessage ? (
          <RuntimeErrorOverlay
            message={overlayFailureMessage}
            className='absolute top-4 right-4 left-4 z-10 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-md border border-destructive/40 bg-background/90 p-2 shadow-sm backdrop-blur-sm'
          />
        ) : null}
      </div>
      <ViewerModelComponentActionMenu
        isOpen={viewerActionMenu !== undefined}
        point={viewerActionMenu?.point}
        data={viewerActionMenuData}
        onOpenChange={handleViewerActionMenuOpenChange}
      />

      {!isGeometryUnitClosed && isPointerOverViewer && componentNameForPointer ? (
        <ModelComponentNameBadge componentName={componentNameForPointer} detail={kinematicsDetail} />
      ) : undefined}

      {/* Reopen-renderer overlay — shown when the geometry unit was closed */}
      {isGeometryUnitClosed && (
        <div className='pointer-events-none absolute inset-0 z-20 flex items-center justify-center'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='pointer-events-auto shadow-lg'
            onClick={handleReopenRenderer}
          >
            <PlayCircle />
            Reopen renderer
          </Button>
        </div>
      )}

      {/* Bottom controls: the bar is centred on the last line and grows upward as tools start. The issues card and
          the AR button (mobile iOS only) share the line above it, so the bar never covers them. In a pane narrower
          than the bar, the bar starts at the left edge, keeping the grid readout and Section in view. */}
      <div
        ref={bottomControlsRef}
        className='pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-col items-center-safe gap-2'
      >
        <div className='flex w-full items-end gap-2 [&>*]:pointer-events-auto'>
          {profile === 'editor' ? <ChatStackTrace entryPath={entryPath} side='bottom' /> : null}
          <ArButton artifact={artifact} runtimeDocument={runtimeDocument} className='ml-auto shrink-0' />
        </div>
        <ChatViewerControls shouldEnableCapture={profile === 'editor'} />
      </div>
    </div>
  );
});

function ModelComponentNameBadge({
  componentName,
  detail,
}: {
  readonly componentName: string;
  /** A second, quieter line: what the part does in the mechanism while the Kinematics pane is open. */
  readonly detail?: string;
}): React.JSX.Element {
  return (
    <div
      aria-hidden='true'
      data-testid='model-component-name-badge'
      className={cn(
        popoverSurfaceVariants(),
        'pointer-events-none absolute z-20 flex max-w-[min(18rem,calc(100%-1rem))] flex-col px-2 py-1 text-xs',
      )}
      style={{
        left: 'var(--viewer-hover-label-x, 0px)',
        top: 'var(--viewer-hover-label-y, 0px)',
        translate: 'var(--viewer-hover-label-translate-x, 8px) var(--viewer-hover-label-translate-y, 10px)',
      }}
    >
      <span className='truncate font-medium'>{componentName}</span>
      {detail ? <span className='truncate text-muted-foreground'>{detail}</span> : null}
    </div>
  );
}
