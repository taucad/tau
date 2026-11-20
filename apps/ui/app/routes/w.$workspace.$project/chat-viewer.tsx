import { useModelAvailability } from '#hooks/use-project-availability.js';
import {
  ViewerWaitStatus,
  isRunningViewerWait,
  useViewerWaitFailure,
} from '#routes/w.$workspace.$project/viewer-wait-status.js';
import { isModelFilesWait } from '#routes/w.$workspace.$project/project-sync-placeholder.js';
import type { ViewerWait } from '#routes/w.$workspace.$project/viewer-wait-status.js';
import { interactiveViewContent } from '#lib/interactive-view-content.js';
import type { AppCapabilitiesManifest } from '#types/runtime-client.alias.js';
import { useSelector } from '@xstate/react';
import { memo, useEffect, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FileEntry } from '@taucad/types';
import { asKnownArtifact } from '@taucad/runtime';
import type { Evaluation, Rendering, RuntimeDocument, ViewSubscription } from '@taucad/runtime';
import { canonicalJson } from '@taucad/utils/hash';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { FileX, FolderOpen, PlayCircle } from 'lucide-react';
import { CadViewer } from '@taucad/viewer/cad/cad-viewer';
import { useModelComponentMenuActions } from '#components/geometry/cad/model-component-action-menu.js';
import { useOptionalPartThumbnailService } from '#providers/part-thumbnail-provider.js';
import { canonicalPartPreviews, sourceGlbDigest } from '#services/part-thumbnail-visual.js';
import type { PartThumbnailRequest } from '#services/part-thumbnail.service.js';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';
import { FileSelector } from '@taucad/files-ui/components/files/file-selector';
import { StartFromTemplate } from '#routes/w.$workspace.$project/start-from-template.js';
import { Button } from '@taucad/ui/components/button';
import { useProject } from '#hooks/use-project.js';
import { useFileTreeSelector } from '@taucad/files-ui/hooks/use-file-tree';
import { useFileContent } from '@taucad/files-ui/hooks/use-file-content';
import { useViewerViewFieldCommands } from '#workbench-records/view-field-commands.js';
import { useWorkbenchViewCommands } from '#workbench-records/view-actions.js';
import { settleLiveViewOptions, useLiveViewOptions } from '#workbench-records/live-view-options.js';
import { setLocalInstanceChoice, useLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { newViewRecord } from '@taucad/workbench-panes/records/view-record';
import { viewTabTitle } from '#workbench-records/view-titles.js';
import { CadProvider, useCad, useCadSelector } from '#hooks/use-cad.js';
import { GraphicsProvider, useOptionalGraphics, useOptionalGraphicsSelector } from '@taucad/viewer/hooks/use-graphics';
import { defaultGraphicsSettings } from '@taucad/viewer/graphics/graphics-settings';
import type { ViewCameraSeed } from '@taucad/viewer/graphics/graphics-camera';
import { ViewerIssues } from '#routes/w.$workspace.$project/chat-stack-trace.js';
import { ChatViewerStatus } from '#routes/w.$workspace.$project/chat-viewer-status.js';
import { ChatViewerControls } from '#routes/w.$workspace.$project/chat-viewer-controls.js';
import { useViewerCameraInput } from '#routes/w.$workspace.$project/use-viewer-camera-input.js';
import { ViewerKernelSettings } from '#routes/w.$workspace.$project/chat-viewer-kernel-settings.js';
import { ViewerProjectionPicker } from '#routes/w.$workspace.$project/chat-viewer-projection-picker.js';
import { isEmptyGlb } from '@taucad/viewer/utils/inspect-glb';
import { ArButton } from '#components/cad/ar-button.js';
import { deriveModelInteractionUnitId } from '@taucad/viewer/machines/model-interaction.machine';
import {
  selectCadEvaluation,
  selectCadCapabilities,
  selectCadActiveKernelId,
  selectCadRendering,
  selectCadDocument,
  selectCadFailureIssues,
  selectIsCadLoading,
} from '#machines/cad.machine.js';
import { useViewerPartMenu } from '@taucad/workbench-panes/component-menu/use-viewer-part-menu';
import type { ViewerPartMenuDecorator } from '@taucad/workbench-panes/component-menu/use-viewer-part-menu';
import { ViewerStage } from '@taucad/workbench-panes/shell/viewer-stage';
import type { ViewerStageStatus } from '@taucad/workbench-panes/shell/viewer-stage';
import { ExactMeasurementProvider } from '@taucad/viewer/graphics/three/react/exact-measurement';
import type { ExactOccurrenceDistanceRequest } from '@taucad/viewer/graphics/three/react/exact-measurement';
import { measureExactOccurrenceDistance } from '#workers/measurement-exact.client.js';

const emptyViewerPreviewSnapshot: ReadonlyMap<string, PartThumbnailState> = new Map();

/** One visible Dockview pane owns one runtime view; the CAD unit separately keeps its default view. */
function usePaneRuntimeView({
  document,
  evaluation,
  capabilities,
  kernelId,
  selectedId,
  options,
  instance,
  blocked,
  edgesShown,
}: Readonly<{
  document: RuntimeDocument | undefined;
  evaluation: Evaluation | undefined;
  capabilities: AppCapabilitiesManifest | undefined;
  kernelId: string | undefined;
  selectedId: string | undefined;
  options: Record<string, unknown> | undefined;
  instance: string | undefined;
  blocked?: string;
  /** Whether this pane shows lines; hidden lines are not computed. */
  edgesShown: boolean;
}>): Readonly<{
  rendering: Rendering | undefined;
  unavailable: string | undefined;
  captureRendering: () => Promise<Rendering>;
}> {
  const [lastSuccess, setLastSuccess] = useState<{ key: string; rendering: Rendering } | undefined>();
  const [viewError, setViewError] = useState<{ key: string; message: string } | undefined>();
  const offered = evaluation?.success
    ? selectedId
      ? evaluation.views.find((view) => view.id === selectedId)
      : evaluation.views[0]
    : undefined;
  const requestedId = selectedId ?? offered?.id;
  const content = interactiveViewContent({
    mimeType: offered?.mimeType,
    kernelId,
    capabilities,
    edgesShown,
  });
  const includeEdges = content?.includeEdges === true;
  const activeView = useRef<{ key: string; view: ViewSubscription; closed: boolean } | undefined>(undefined);
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
  const subscriptionKey = `${document?.id ?? ''}:${requestedId ?? ''}:${optionsKey}:${instance ?? ''}:${includeEdges}`;
  // The offered view, its MIME type and the kernel are unknown until the document first evaluates, so a view opened
  // earlier would be closed and reopened under its real key as soon as the evaluation lands.
  const evaluated = evaluation !== undefined;

  useEffect(() => {
    if (!document || !evaluated || Boolean(unavailable) || isEmpty) {
      return;
    }
    let closed = false;
    let view: ReturnType<typeof document.view>;
    try {
      const request = {
        options: JSON.parse(optionsKey) as Record<string, unknown>,
        ...(instance ? { instance } : {}),
        ...(content ? { content: { includeEdges } } : {}),
      };
      view = requestedId ? document.view(requestedId, request) : document.view();
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
    const active = { key: subscriptionKey, view, closed: false };
    activeView.current = active;
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
            : {
                key: subscriptionKey,
                message: 'The selected view is unavailable.',
              },
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
      active.closed = true;
      if (activeView.current === active) {
        activeView.current = undefined;
      }
      unrendered();
      unstatus();
      view.close();
    };
  }, [
    document,
    evaluated,
    isEmpty,
    requestedId,
    includeEdges,
    optionsKey,
    instance,
    unavailable,
    pictureKey,
    subscriptionKey,
  ]);

  const captureRendering = useCallback(async (): Promise<Rendering> => {
    const active = activeView.current;
    if (!active || active.key !== subscriptionKey || Boolean(unavailable) || isEmpty) {
      throw new Error('The selected view is unavailable for capture.');
    }
    const assertActive = (): void => {
      if (active.closed || activeView.current !== active) {
        throw new Error('The selected view changed during capture.');
      }
    };
    for (;;) {
      assertActive();
      // oxlint-disable-next-line no-await-in-loop -- Superseded evaluations must settle on the same pane subscription.
      const outcome = await active.view.rendering();
      assertActive();
      if (outcome.superseded) {
        continue;
      }
      if (!outcome.rendering.success || outcome.rendering.transient) {
        throw new Error('The selected view has no committed successful rendering for capture.');
      }
      return outcome.rendering;
    }
  }, [subscriptionKey, unavailable, isEmpty]);

  return {
    captureRendering,
    rendering:
      evaluation?.success && evaluation.views.length === 0
        ? undefined
        : lastSuccess?.key === pictureKey
          ? lastSuccess.rendering
          : undefined,
    // A failed evaluation fails every open view with the build's issues; the Issues card owns those.
    unavailable:
      unavailable ?? (evaluation?.success && viewError?.key === subscriptionKey ? viewError.message : undefined),
  };
}

type ChatViewerProps = {
  /** Unique Dockview panel ID for this viewer instance */
  readonly viewId: string;
  /** File path being rendered in this viewer (undefined = empty state) */
  readonly entryPath: string | undefined;
  /** Dockview panel API for updating title, etc. */
  readonly panelApi: IDockviewPanelHeaderProps['api'];
  readonly profile?: 'editor' | 'shared';
};

/**
 * What the viewer content shows besides the props it is given: the wait before the model can be drawn, if any (A15e;
 * cloud open loading states, option C).
 */
type ChatViewerContentProps = ChatViewerProps & {
  /**
   * The project is still opening on this device or could not open, or the model's files are still being checked or
   * downloaded, or their download failed; `undefined` once they are here.
   */
  readonly wait?: ViewerWait;
};

function MissingViewerFile({
  entryPath,
  onSelect,
}: {
  readonly entryPath: string;
  readonly onSelect: (path: string) => void;
}): React.JSX.Element {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-4 text-muted-foreground'>
      <FileX className='size-12 stroke-1' />
      <div className='flex flex-col items-center gap-1'>
        <p className='text-sm font-medium'>File not found</p>
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

type ViewerEntryAbsence = 'unbound' | 'directory' | 'missing' | undefined;

/**
 * The view's absence once its files are known.
 *
 * @param facts - The view's entry, main, whether the view waited for the files, and what is known about the entry.
 * @returns The absence, or `undefined` when the entry renders.
 */
function settledAbsence({
  entryPath,
  mainEntryPath,
  hasWaited,
  isDirectory,
  isMissing,
}: Readonly<{
  entryPath: string | undefined;
  mainEntryPath: string | undefined;
  hasWaited: boolean;
  isDirectory: boolean;
  isMissing: boolean;
}>): ViewerEntryAbsence {
  if (entryPath) {
    return isDirectory ? 'directory' : isMissing ? 'missing' : undefined;
  }
  /* A view that waited for the files with no entry, while main is known, is about to be bound to main: the adapter binds
     it in the settle commit's layout effect, so the stage stays rather than drawing "No file selected" for one commit. */
  return mainEntryPath && hasWaited ? undefined : 'unbound';
}

/**
 * Why the view has no entry to render (none is bound, it names a directory, or the file is not there), and the main it
 * is moving to. While the model's files are checked or downloaded an absence is not known afresh: the one known when
 * they last settled for this entry stays, and otherwise the stage and its last render stay (A15e; UI Policy § 5: no
 * empty state before the content is known to be empty). A main that changed during the check is followed from the
 * commit the files settle in, so the view's old file never reads missing on the way (P-j). Both are kept with React's
 * "information from previous renders" pattern; no effect or timer runs.
 *
 * @param facts - The view's entry, the project's main and what is known about the entry.
 * @returns The absence, `undefined` when the entry renders; the path the stage renders (`''` for an unbound view that
 *   keeps its stage through a file check); and the main to follow, if the view follows a changed one.
 */
function useViewerEntryAbsence({
  entryPath,
  mainEntryPath,
  isDirectory,
  isMissing,
  isFilesWait,
}: Readonly<{
  entryPath: string | undefined;
  mainEntryPath: string | undefined;
  isDirectory: boolean;
  isMissing: boolean;
  isFilesWait: boolean;
}>): Readonly<{ absence: ViewerEntryAbsence; renderedPath: string; followTarget: string | undefined }> {
  const [followedMain, setFollowedMain] = useState(mainEntryPath);
  const [settled, setSettled] = useState<Readonly<{ entryPath: string | undefined; absence: ViewerEntryAbsence }>>();
  const renderedPath = entryPath ?? '';
  const [hasWaited, setHasWaited] = useState(isFilesWait);
  if (isFilesWait && !hasWaited) {
    setHasWaited(true);
  }
  const followTarget =
    !isFilesWait && mainEntryPath && mainEntryPath !== followedMain && entryPath === followedMain
      ? mainEntryPath
      : undefined;
  if (!isFilesWait && followTarget === undefined && mainEntryPath !== followedMain) {
    setFollowedMain(mainEntryPath);
  }
  if (followTarget !== undefined) {
    return { absence: undefined, renderedPath, followTarget };
  }
  if (isFilesWait) {
    return {
      absence: settled !== undefined && settled.entryPath === entryPath ? settled.absence : undefined,
      renderedPath,
      followTarget,
    };
  }
  const absence = settledAbsence({ entryPath, mainEntryPath, hasWaited, isDirectory, isMissing });
  if (settled === undefined || settled.entryPath !== entryPath || settled.absence !== absence) {
    setSettled({ entryPath, absence });
  }
  return { absence, renderedPath, followTarget };
}

/**
 * What the view waits for before its entry is known, and whether it shows "Initializing viewer…" instead of its stage.
 * While the project opens or the model's files are checked or downloaded, an entry the tree has not landed yet is not
 * known to be absent: the stage and its last render stay, and the empty states wait for the files (A15e; UI Policy
 * § 5). A view that has shown its stage for a wait keeps it, still waiting, until its graphics arrive, which they do
 * only once the project is loaded here (cloud open loading states, option C), rather than swapping to "Initializing
 * viewer…". Kept with React's "information from previous renders" pattern; no effect runs.
 *
 * @param wait - The view's wait, if any.
 * @param hasGraphics - Whether the view has its graphics actor.
 * @returns Whether the view's entry waits, and whether its graphics are starting for a view that never waited.
 */
function useViewerWaitStage(
  wait: ViewerWait | undefined,
  hasGraphics: boolean,
): Readonly<{ isFilesWait: boolean; isGraphicsStarting: boolean }> {
  const [hasWaitStage, setHasWaitStage] = useState(wait !== undefined);
  if (wait !== undefined && !hasWaitStage) {
    setHasWaitStage(true);
  }
  return {
    isFilesWait: wait !== undefined || (hasWaitStage && !hasGraphics),
    isGraphicsStarting: !hasGraphics && !hasWaitStage,
  };
}

const ChatViewerContent = memo(function ({
  viewId,
  entryPath,
  panelApi,
  profile = 'editor',
  wait,
}: ChatViewerContentProps): React.JSX.Element {
  const { projectRef, viewGraphics, viewRecords, entriesRecord, geometryUnits, mainEntryPath, setViewEntryPath } =
    useProject();
  const viewCommands = useWorkbenchViewCommands();
  // Get the per-view graphics machine
  const graphicsActor = viewGraphics.get(viewId);
  const { isFilesWait, isGraphicsStarting } = useViewerWaitStage(wait, graphicsActor !== undefined);

  // Get the geometry unit for this view's entry path
  const cadActor = entryPath ? geometryUnits.get(entryPath) : undefined;
  const measureExact = useMemo(
    () =>
      cadActor
        ? async (request: ExactOccurrenceDistanceRequest) =>
            measureExactOccurrenceDistance({ ...request, cadRef: cadActor })
        : undefined,
    [cadActor],
  );

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
  /* Entry-less (blueprint D3): the loaded manifest declares no main, or names a file that is not there. */
  const declaredMain = useSelector(projectRef, (state) =>
    state.context.project === undefined ? '' : (state.context.project.assets.main?.entryPath ?? undefined),
  );
  const isMainMissing = useFileTreeSelector(
    useCallback(
      (fileTree: ReadonlyMap<string, FileEntry>): boolean =>
        declaredMain !== undefined && declaredMain !== '' && fileTree.get(declaredMain)?.type !== 'file',
      [declaredMain],
    ),
  );
  const isEntryless = declaredMain === undefined || isMainMissing;

  // Derive isMissing from content service orphan outcome (VS Code pattern).
  // useFileContent auto-loads on cache miss; missing files resolve to the
  // 'orphaned' outcome via the discriminated FileContentResult contract.
  const fileContent = useFileContent(entryPath);
  const isMissing = fileContent.kind === 'orphaned' && !isDirectory;
  const { absence, renderedPath, followTarget } = useViewerEntryAbsence({
    entryPath,
    mainEntryPath,
    isDirectory,
    isMissing,
    isFilesWait,
  });

  useEffect(() => {
    if (!graphicsActor || absence === undefined) {
      return;
    }
    // Graphics reports the unit it stops presenting, and the project releases its manifest with the last view.
    graphicsActor.send({ type: 'clearArtifact' });
  }, [graphicsActor, absence]);

  // The project view record is the camera seed for this pane.
  const viewRecord = viewRecords.get(viewId);
  const savedCamera = viewRecord?.selectedKernelView
    ? viewRecord.kernelViews?.find((view) => view.id === viewRecord.selectedKernelView)?.camera
    : viewRecord?.camera;
  /* The entry this view frames: a new identity re-arms the framing record with the persisted pose. The camera itself
   * is the graphics actor's child, seeded once when the project spawned the view. */
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
      // Ensure geometry unit exists for the selected file; during a file check the viewer adapter creates it once the
      // files settle (A15e; P-j).
      if (!isFilesWait && !geometryUnits.has(path)) {
        projectRef.send({
          type: 'createGeometryUnit',
          entryPath: path,
          operationTimeout: entriesRecord?.entries[path]?.renderTimeout,
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

      if (profile === 'editor') {
        void viewCommands.edit(viewId, (current) => ({
          ...(current ?? newViewRecord(path)),
          entryPath: path,
          camera: { kind: 'preset', preset: 'isometric' },
          section: { active: false, cuts: [] },
          measurements: [],
        }));
      }
      setViewEntryPath(viewId, path);

      // Update Dockview panel params so the component re-renders with new entryPath
      panelApi.updateParameters({ entryPath: path });

      // Update the Dockview panel title
      panelApi.setTitle(
        viewTabTitle({
          ...(viewRecord ?? newViewRecord(path)),
          entryPath: path,
        }),
      );
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
      profile,
      isFilesWait,
    ],
  );

  // A cloud project opens with a placeholder main file. Follow the real main
  // when its synced manifest arrives, but keep viewers on other chosen files. A main that changes during a file check
  // is followed once the files settle, so the view record is not written in the middle of the tree write (A15e; P-j).
  const followedTarget = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (followTarget === undefined) {
      followedTarget.current = undefined;
      return;
    }
    if (followedTarget.current !== followTarget) {
      followedTarget.current = followTarget;
      handleFileSelect(followTarget);
    }
  }, [followTarget, handleFileSelect]);

  // If no graphics actor yet, and no wait to say on the stage, render a placeholder
  if (isGraphicsStarting) {
    return (
      <div className='flex h-full items-center justify-center text-muted-foreground'>
        <span className='text-sm'>Initializing viewer…</span>
      </div>
    );
  }

  // If no file selected, render empty state with file selector
  if (absence === 'unbound') {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-4 text-muted-foreground'>
        {/* An entry-less project (blueprint D3): the first model the agent writes becomes main. */}
        <span className='text-sm'>{isEntryless ? 'No model yet' : 'No file selected'}</span>
        {isEntryless ? (
          <p className='max-w-64 text-center text-xs'>
            The agent writes one from your first message, or start from a template.
          </p>
        ) : null}
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
        {isEntryless ? <StartFromTemplate /> : null}
      </div>
    );
  }

  // If the entry path is a directory, show a friendly screen with a file selector
  if (absence === 'directory') {
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
  if (absence === 'missing') {
    return <MissingViewerFile entryPath={renderedPath} onSelect={handleFileSelect} />;
  }

  return (
    <CadProvider cadRef={cadActor}>
      <ExactMeasurementProvider measure={measureExact}>
        <GraphicsProvider graphicsRef={graphicsActor} seed={cameraSeed}>
          <ViewerContent viewId={viewId} entryPath={renderedPath} profile={profile} wait={wait} />
        </GraphicsProvider>
      </ExactMeasurementProvider>
    </CadProvider>
  );
});

/**
 * The view whose record the per-view controls write: the editor's, once the view is bound to an entry and its project
 * is on this device. An unbound view kept on the stage through a file check (`''`) has no record to write yet, and a
 * project still opening would take the write into a checkout its download has yet to land, so their controls change
 * the live owner only.
 *
 * @param view - The viewer's profile, the view, its entry (`''` when it has none) and whether its project is still
 *   opening on this device, or could not.
 * @returns The target, or `undefined` for none.
 */
const viewFieldTarget = ({
  profile,
  viewId,
  entryPath,
  isProjectOpening,
}: Readonly<{
  profile: 'editor' | 'shared';
  viewId: string;
  entryPath: string;
  isProjectOpening: boolean;
}>): Readonly<{ viewId: string; entryPath: string }> | undefined =>
  profile === 'editor' && entryPath !== '' && !isProjectOpening ? { viewId, entryPath } : undefined;

/**
 * The stage's failure overlay: an open that could not go on or a failed download of the model's files, each with its
 * action, or a shared view's build failure.
 *
 * @param waitFailure - The stage wait's failure, if any.
 * @param overlayFailureMessage - A shared view's build failure, if any.
 * @returns The stage's status, or `undefined` when nothing failed.
 */
function stageStatus(
  waitFailure: ViewerStageStatus | undefined,
  overlayFailureMessage: string | undefined,
): ViewerStageStatus | undefined {
  if (waitFailure !== undefined) {
    return waitFailure;
  }
  return overlayFailureMessage ? { kind: 'failed', message: overlayFailureMessage } : undefined;
}

/**
 * The build status, and from the stage's first wait the wait's pill in the same cell (A15e; cloud open loading states,
 * option C). The pill mounts with that first wait and stays, so a shown pill keeps its minimum after the wait ends; the
 * build status stays mounted and gives way only while the pill shows (a later check over the last render).
 */
function StageWaitStatus({ wait }: { readonly wait: ViewerWait | undefined }): React.JSX.Element {
  const [hasWaited, setHasWaited] = useState(wait !== undefined);
  if (wait !== undefined && !hasWaited) {
    setHasWaited(true);
  }
  if (!hasWaited) {
    return <ChatViewerStatus />;
  }
  return (
    <ViewerWaitStatus wait={wait}>
      <ChatViewerStatus />
    </ViewerWaitStatus>
  );
}

/** Announces absent geometry without hiding the interactive empty scene. */
function GeometryStatus({ isEmpty = false }: { readonly isEmpty?: boolean }): React.JSX.Element {
  const isCadLoading = useCadSelector(selectIsCadLoading, false);
  return (
    <div
      role='status'
      aria-label={isEmpty ? 'Empty model' : isCadLoading ? 'Loading geometry' : 'Waiting for geometry'}
      aria-busy={isCadLoading || undefined}
      className='sr-only'
    />
  );
}

/**
 * Inner content of a viewer panel with an active file.
 * Separated to avoid conditional hook usage in the parent.
 * CadProvider + GraphicsProvider are wrapped above this -- all descendants use
 * useCad()/useCadSelector() and useGraphics()/useGraphicsSelector(). The provider may have no graphics actor yet (a
 * project still loading here): this content reads it as optional, and mounts the canvas and the controls, which need
 * it, only once it arrives, so the stage keeps its identity throughout.
 */
const ViewerContent = memo(function ({
  viewId,
  entryPath,
  profile,
  wait,
}: {
  readonly viewId: string;
  readonly entryPath: string;
  readonly profile: 'editor' | 'shared';
  readonly wait: ViewerWait | undefined;
}): React.JSX.Element {
  const { projectRef, entriesRecord, viewRecords } = useProject();
  const viewCommands = useWorkbenchViewCommands();
  /* The view's graphics, `undefined` while its project is still loading here: the stage is laid out with the wait's
     status and failure, and draws no canvas and no controls until they arrive (cloud open loading states, option C). */
  const graphicsActor = useOptionalGraphics();
  // The editor's per-view controls write the view record; a shared session keeps changing the live owner only.
  /* The project is not on this device yet: no view record is written and no canvas takes a camera move, so nothing
     lands in its checkout before the open's own download does (cloud open loading states). */
  const isProjectOpening = wait !== undefined && !isModelFilesWait(wait);
  const viewFields = useViewerViewFieldCommands(viewFieldTarget({ profile, viewId, entryPath, isProjectOpening }));
  const waitFailure = useViewerWaitFailure(wait);
  const cadRef = useCad();
  // Lines this pane shows; the unit's default view computes edges only while some pane shows them. A pane without its
  // graphics yet shows none (`undefined`).
  const enableLines = useOptionalGraphicsSelector((state) => state.context.enableLines, undefined);
  useEffect(() => {
    cadRef?.send({ type: 'setViewerEdges', viewerId: viewId, shown: enableLines });
  }, [cadRef, viewId, enableLines]);
  useEffect(
    () => () => {
      cadRef?.send({ type: 'setViewerEdges', viewerId: viewId, shown: undefined });
    },
    [cadRef, viewId],
  );
  const evaluation = useCadSelector(selectCadEvaluation, undefined);
  const defaultRendering = useCadSelector(selectCadRendering, undefined);
  const runtimeDocument = useCadSelector(selectCadDocument, undefined);
  const capabilities = useCadSelector(selectCadCapabilities, undefined);
  const kernelId = useCadSelector(selectCadActiveKernelId, undefined);
  const savedView = viewRecords.get(viewId);
  const selectedKernelView = savedView?.selectedKernelView;
  const offeredViewId = selectedKernelView ?? (evaluation?.success ? evaluation.views[0]?.id : undefined);
  const selectedState = savedView?.kernelViews?.find((state) => state.id === offeredViewId);
  // The options panel's live draft leads the saved record, so edits re-render as they happen.
  const liveOptions = useLiveViewOptions(viewId);
  const viewOptions =
    liveOptions && liveOptions.viewId === offeredViewId ? liveOptions.options : selectedState?.options;
  // The draft yields once the record the file watcher delivers holds the same options, so the pane never steps back.
  const savedOptions = selectedState?.options;
  useEffect(() => {
    if (liveOptions !== undefined && offeredViewId !== undefined) {
      settleLiveViewOptions(viewId, liveOptions, { viewId: offeredViewId, options: savedOptions ?? {} });
    }
  }, [viewId, offeredViewId, savedOptions, liveOptions]);
  const localInstance = useLocalInstanceChoice(viewId);
  const localForView = localInstance?.viewId === offeredViewId ? localInstance : undefined;
  const localExpired =
    localForView && localForView.evaluationId !== evaluation?.id
      ? `Instance “${localForView.instanceId}” belonged to a previous evaluation. Choose a current instance.`
      : undefined;
  const {
    rendering: paneRendering,
    unavailable,
    captureRendering,
  } = usePaneRuntimeView({
    document: runtimeDocument,
    evaluation,
    capabilities,
    kernelId,
    selectedId:
      selectedKernelView ??
      (Boolean(localForView) || Boolean(selectedState?.authoredInstance) || Boolean(viewOptions)
        ? offeredViewId
        : undefined),
    options: viewOptions,
    instance: localForView && !localExpired ? localForView.instanceId : selectedState?.authoredInstance,
    blocked: localExpired,
    edgesShown: enableLines === true,
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
  const failureIssues = useCadSelector(selectCadFailureIssues, undefined);
  const failureMessage =
    failureIssues?.find((issue) => issue.severity === 'error')?.message ?? failureIssues?.[0]?.message;
  const overlayFailureMessage = profile === 'shared' ? failureMessage : undefined;
  const restoreDefaultView = (): void => {
    void viewCommands.edit(viewId, (current) => ({
      ...(current ?? newViewRecord(entryPath)),
      selectedKernelView: undefined,
    }));
    setLocalInstanceChoice(viewId, undefined);
  };

  // The geometry unit can be closed via the parameters panel context menu.
  // When that happens cadRef goes undefined, geometry clears, but the panel
  // stays open. Surface a "Reopen renderer" overlay so the user can re-spawn
  // the cad actor without having to re-add the panel. While the model's files
  // are checked or downloaded the unit is not created yet (A15e): the overlay
  // waits, and the canvas stays mounted either way.
  // A view still to be bound (`''`) has no unit to reopen.
  // A view without its graphics yet is not admitted, so it has no unit to reopen either.
  const isGeometryUnitClosed = !cadRef && wait === undefined && entryPath !== '' && graphicsActor !== undefined;
  const handleReopenRenderer = useCallback(() => {
    projectRef.send({
      type: 'createGeometryUnit',
      entryPath,
      operationTimeout: entriesRecord?.entries[entryPath]?.renderTimeout,
    });
  }, [entriesRecord, projectRef, entryPath]);

  // Bridge this pane's projection to its graphics owner. Other panes may show
  // different views of the same evaluated document without changing this one.
  useEffect(() => {
    if (!graphicsActor) {
      return;
    }
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
  const enableSurfaces = useOptionalGraphicsSelector(
    (state) => state.context.enableSurfaces,
    defaultGraphicsSettings.enableSurfaces,
  );
  const enableGizmo = useOptionalGraphicsSelector(
    (state) => state.context.enableGizmo,
    defaultGraphicsSettings.enableGizmo,
  );
  // The person's preset, toggles and gizmo style, with `viewerControls` on; none with it off.
  const { cameraInput, gizmoStyle } = useViewerCameraInput();
  const enableGrid = useOptionalGraphicsSelector(
    (state) => state.context.enableGrid,
    defaultGraphicsSettings.enableGrid,
  );
  const enableAxes = useOptionalGraphicsSelector(
    (state) => state.context.enableAxes,
    defaultGraphicsSettings.enableAxes,
  );
  const enableMatcap = useOptionalGraphicsSelector(
    (state) => state.context.enableMatcap,
    defaultGraphicsSettings.enableMatcap,
  );
  const upDirection = useOptionalGraphicsSelector(
    (state) => state.context.upDirection,
    defaultGraphicsSettings.upDirection,
  );
  const partMenu = useViewerPartMenu({
    graphicsRef: graphicsActor,
    actions: useModelComponentMenuActions(),
  });
  const modelInteractionUnitId = useMemo(() => deriveModelInteractionUnitId({ sourceFile: entryPath }), [entryPath]);
  const thumbnails = useOptionalPartThumbnailService(modelInteractionUnitId);
  const previewSourceDigests = useRef(new WeakMap<Uint8Array<ArrayBuffer>, Promise<string>>());
  const [previewRetry, setPreviewRetry] = useState<{
    part: PartThumbnailRequest;
    requestId: number;
    sourceKey: string;
  }>();
  const submittedRetryId = useRef(0);
  const subscribePreviews = useCallback(
    (listener: () => void) => thumbnails?.subscribe(listener) ?? (() => undefined),
    [thumbnails],
  );
  const getPreviewSnapshot = useCallback(() => thumbnails?.snapshot() ?? emptyViewerPreviewSnapshot, [thumbnails]);
  const previews = useSyncExternalStore(subscribePreviews, getPreviewSnapshot, getPreviewSnapshot);
  const presentedArtifact = useOptionalGraphicsSelector((state) => state.context.artifact, undefined);
  const presentedArtifactKey = useOptionalGraphicsSelector((state) => state.context.artifactKey, undefined);
  const presentedSourceFile = useOptionalGraphicsSelector((state) => state.context.artifactSourceFile, undefined);
  const presentedKey = useOptionalGraphicsSelector((state) => state.context.gltfPresentation.presentedKey, undefined);
  const viewerActionMenuData = partMenu.openMenuData;
  const viewerPart =
    viewerActionMenuData?.node.kind === 'part' && viewerActionMenuData.node.primitiveRefs?.length
      ? viewerActionMenuData.node
      : undefined;
  const retryPreview = useCallback(() => {
    if (!viewerPart || !presentedKey) {
      return;
    }
    const part = { id: viewerPart.id, primitives: viewerPart.primitiveRefs! };
    setPreviewRetry((current) => ({
      part,
      requestId: (current?.requestId ?? 0) + 1,
      sourceKey: presentedKey,
    }));
  }, [presentedKey, viewerPart]);
  useEffect(() => {
    if (previewRetry && previewRetry.sourceKey !== presentedKey) {
      // Retire an unsubmitted retry when its presented-source lifetime ends.
      submittedRetryId.current = previewRetry.requestId;
    }
    if (!thumbnails) {
      return;
    }
    thumbnails.announcePresentedSource(presentedKey);
    const pendingRetry =
      previewRetry && previewRetry.sourceKey === presentedKey && previewRetry.requestId !== submittedRetryId.current
        ? previewRetry
        : undefined;
    const requestedPart =
      pendingRetry?.part ?? (viewerPart ? { id: viewerPart.id, primitives: viewerPart.primitiveRefs! } : undefined);
    if (
      !requestedPart ||
      presentedArtifact?.mimeType !== 'model/gltf-binary' ||
      presentedArtifactKey !== presentedKey
    ) {
      thumbnails.releaseOwner('viewer');
      return;
    }
    let active = true;
    const { content } = presentedArtifact;
    if (content.buffer.byteLength > 64 * 1024 * 1024) {
      thumbnails.failPreparationForOwner(
        'viewer',
        [requestedPart],
        new RangeError('Part thumbnail source exceeds 64 MiB'),
      );
      return;
    }
    let sourceDigest = previewSourceDigests.current.get(content);
    if (!sourceDigest) {
      sourceDigest = sourceGlbDigest(content);
      previewSourceDigests.current.set(content, sourceDigest);
    }
    const prepare = async (): Promise<void> => {
      try {
        const [hash, prepared] = await Promise.all([
          sourceDigest,
          canonicalPartPreviews(content, [requestedPart.primitives]),
        ]);
        if (active) {
          thumbnails.requestForOwner(
            'viewer',
            {
              sourcePath: entryPath,
              geometryHash: hash,
              content,
              renderContent: prepared.renderContent,
            },
            [
              {
                ...requestedPart,
                visualKey: prepared.previews[0]?.key ?? prepared.visualKey,
              },
            ],
            pendingRetry ? { manualPartId: pendingRetry.part.id } : undefined,
          );
          if (pendingRetry) {
            submittedRetryId.current = pendingRetry.requestId;
          }
        }
      } catch (error) {
        if (active) {
          if (previewSourceDigests.current.get(content) === sourceDigest) {
            previewSourceDigests.current.delete(content);
          }
          thumbnails.failPreparationForOwner('viewer', [requestedPart], error);
        }
      }
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [entryPath, presentedArtifact, presentedArtifactKey, presentedKey, previewRetry, thumbnails, viewerPart]);
  useEffect(() => () => thumbnails?.releaseOwner('viewer'), [thumbnails]);
  const decoratePartMenu = useCallback<ViewerPartMenuDecorator>(
    (data) => ({
      ...data,
      preview: previews.get(data.node.id),
      onRetryPreview: retryPreview,
      onPreviewDecodeError: () => {
        const state = previews.get(data.node.id);
        if (state?.bytes) {
          thumbnails?.failDecode(data.node.id, state.bytes);
        }
      },
      onPreviewDecoded: () => {
        const state = previews.get(data.node.id);
        if (state?.bytes) {
          thumbnails?.markDecoded(data.node.id, state.bytes);
        }
      },
    }),
    [previews, retryPreview, thumbnails],
  );

  const closePartMenu = partMenu.close;
  useEffect(() => {
    if (isGeometryUnitClosed) {
      closePartMenu();
    }
  }, [closePartMenu, isGeometryUnitClosed]);

  return (
    <ViewerStage
      graphicsRef={graphicsActor}
      regionId={`viewport-gizmo-container-${viewId}`}
      data-testid='chat-viewer-layout'
      partMenu={graphicsActor === undefined ? undefined : partMenu}
      decoratePartMenu={decoratePartMenu}
      isModelShown={!isGeometryUnitClosed && Boolean(artifact && presentedArtifact)}
      status={stageStatus(waitFailure, overlayFailureMessage)}
      /* The canvas is still to come once a wait ends before the project is loaded here and the graphics arrive. */
      isWaiting={isRunningViewerWait(wait) || (wait === undefined && graphicsActor === undefined)}
      statusExtra={
        <>
          <StageWaitStatus wait={wait} />
          {unavailable && profile !== 'editor' ? (
            <div role='alert' className='rounded-md border border-border bg-background/95 p-3 text-sm shadow-sm'>
              <p>{unavailable}</p>
              <Button size='sm' variant='outline' className='mt-2' onClick={restoreDefaultView}>
                Use default view
              </Button>
            </div>
          ) : null}
        </>
      }
      onKeyDown={(event) => {
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.nativeEvent.isComposing ||
          evaluation?.success !== true ||
          evaluation.views.length < 2
        ) {
          return;
        }
        const { target } = event;
        if (
          !(target instanceof HTMLElement) ||
          target.isContentEditable ||
          target.closest('input, textarea, select, [contenteditable], [role="textbox"], .cm-editor')
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
      /* The canvas stays while the unit is closed or not created yet, so a unit that follows the files (an entry other
         than main gets its unit only once they settle) draws into the same canvas (A15e; C11). While the project is
         still opening the stage draws no canvas, so no camera move is written into a checkout not landed yet; nor does it
         before the view's graphics arrive. */
      renderCanvas={({ eventSource, gizmoContainer, onComponentSecondaryPointerCandidate }) =>
        isProjectOpening || graphicsActor === undefined ? null : (
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
            artifact={artifact ? presentedArtifact : undefined}
            artifactHash={presentedArtifactKey}
            sourceFile={presentedSourceFile}
            // Keep R3F on default offsetX/Y compute; eventPrefix='client'
            // is window-relative and mis-rays docked panels.
            eventSource={eventSource}
            gizmoContainer={gizmoContainer}
            onModelComponentSecondaryPointerCandidate={onComponentSecondaryPointerCandidate}
            cameraInput={cameraInput}
            gizmoStyle={gizmoStyle}
          />
        )
      }
      /* Bottom controls: the bar is centred on the last line and grows upward as tools start. In the editor it starts
         with the view menus and the build status, and the issues list unfolds above its controls. Capability-gated mobile AR shares the controls row. In a pane narrower than the bar, the
         bar starts at the left edge, keeping the grid readout and Section in view. */
      controls={
        graphicsActor === undefined ? undefined : profile === 'editor' ? (
          <ViewerIssues
            entryPath={entryPath}
            notice={
              unavailable
                ? {
                    message: unavailable,
                    actionLabel: 'Use default view',
                    onAct: restoreDefaultView,
                  }
                : undefined
            }
          >
            {({ segment, list }) => (
              <ChatViewerControls
                mobileAction={<ArButton artifact={artifact} />}
                captureRendering={captureRendering}
                kernelSettings={
                  cadRef ? <ViewerKernelSettings viewId={viewId} entryPath={entryPath} cadActor={cadRef} /> : undefined
                }
                leading={
                  <>
                    {cadRef ? <ViewerProjectionPicker viewId={viewId} entryPath={entryPath} cadActor={cadRef} /> : null}
                    {segment}
                  </>
                }
                aboveControls={list}
                viewFields={viewFields}
              />
            )}
          </ViewerIssues>
        ) : (
          <ChatViewerControls
            mobileAction={<ArButton artifact={artifact} />}
            shouldEnableCapture={false}
            captureRendering={captureRendering}
          />
        )
      }
    >
      {!artifact && !overlayFailureMessage ? <GeometryStatus isEmpty={emptyModel} /> : null}
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
    </ViewerStage>
  );
});

/**
 * Keep file absence and rendering errors hidden until the authored checkout is acknowledged. Every wait before the model
 * can be drawn is shown on the viewer's stage, which stays mounted through it (A15e; P-j, U13, U20; cloud open loading
 * states, option C): the project opening on this device, its download and preparing, the model's own files, and an
 * open that could not go on. One element type at one position, so no wait before, between or after renders replaces
 * the stage, and the stage shows no "File not found" or empty state until the files are known.
 */
export const ChatViewer = memo(function (props: ChatViewerProps): React.JSX.Element {
  const availability = useModelAvailability();
  if (props.profile === 'shared' || availability === 'ready') {
    return <ChatViewerContent {...props} />;
  }
  return <ChatViewerContent {...props} wait={availability} />;
});
