/**
 * The Tau viewer page: one bundle, two compositions (blueprint D10, I7).
 *
 * Inline (a card in the conversation) draws the canvas and two actions; the
 * tab (Codex's thread tab, fullscreen on any host, the loopback page) is the
 * Tau workbench: a file tab, the app's viewer bar over the canvas with the view
 * cube top-right, and the workbench panes beside it (viewer parity R1).
 * Everything the page shows comes through the host bridge.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { FileCode2, Maximize2, MessageSquarePlus, PanelRight } from 'lucide-react';
import type { TauViewerCamera, TauViewerModel, TauViewerShowResult } from '@taucad/mcp/viewer-protocol';
import type { Artifact } from '@taucad/runtime';
import type { GeometryComponentReference } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { ViewerControls } from '@taucad/viewer/cad/viewer-controls';
import { ViewerEnvironmentProvider, defaultViewerEnvironment } from '@taucad/viewer/environment/viewer-environment';
import type { ViewerEnvironment } from '@taucad/viewer/environment/viewer-environment';
import { defaultGraphicsSettings } from '@taucad/viewer/graphics/graphics-settings';
import { GraphicsProvider } from '@taucad/viewer/hooks/use-graphics';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { buildGeometryComponentReference } from '@taucad/viewer/graphics/metadata/geometry-component-reference';
import { getModelInteractionUnitState } from '@taucad/viewer/machines/model-interaction.machine';
import { getViewCameraSession } from '@taucad/viewer/services/graphics-camera-registry';
import { ModelViewer } from '@taucad/viewer/model-viewer';
import type { ChatRoute, HostBridge, HostView } from '#app/host-bridge.js';
import { loadModel } from '#app/model-loader.js';
import { chatReferenceOf } from '#app/chat-reference.js';
import { captureLiveView, startLiveLink, viewStateOf, whenDrawn } from '#app/live-link.js';
import type { LiveLink } from '#app/live-link.js';
import { createModelComponentActionMenus } from '@taucad/workbench-panes/component-menu/component-action-menu';
import {
  createComponentReveal,
  createPageComponentActions,
  useViewerComponentMenu,
} from '#app/sources/component-menu.jsx';
import type { ComponentMenuPane } from '#app/sources/component-menu.jsx';
import { WorkbenchLane } from '#app/workbench-lane.jsx';

type Loaded = Readonly<{ model: TauViewerModel; artifact: Artifact }>;

type PageState =
  | Readonly<{ kind: 'waiting' }>
  | Readonly<{ kind: 'loading'; model: TauViewerModel; loaded: number; previous?: Loaded }>
  | Readonly<{ kind: 'ready'; current: Loaded }>
  | Readonly<{ kind: 'failed'; message: string; previous?: Loaded }>;

const previousOf = (state: PageState): Loaded | undefined =>
  state.kind === 'ready' ? state.current : state.kind === 'waiting' ? undefined : state.previous;

/** The card's height where the host's cap allows it (E5, G21). */
const inlineHeight = 420;

/**
 * The inline card's height: {@link inlineHeight}, or the host's cap when that is lower.
 *
 * @param view - What the page knows about its host.
 * @returns The height in CSS pixels, or `undefined` for the tab, which fills the viewport.
 */
const cardHeight = (view: HostView): number | undefined =>
  view.composition === 'inline' ? Math.min(inlineHeight, view.maxHeight ?? inlineHeight) : undefined;

/** The reference action's name per route: a message starts a turn, so it says so. */
const chatAction: Readonly<Record<ChatRoute, string>> = {
  context: 'Add to chat',
  message: 'Send to chat',
  clipboard: 'Copy prompt',
};

/** What the page says once the reference went its route. */
const chatNotice: Readonly<Record<ChatRoute, string>> = {
  context: 'Added to chat',
  message: 'Sent to chat',
  clipboard: 'Copied; paste it into your chat',
};

/**
 * Follows the bridge: shows each model it hands over, keeping the last one on screen while the next loads. The
 * returned `show` takes a model the live link heard of; `select` is the agent's latest selection request.
 */
function useShownModel(
  bridge: HostBridge,
): readonly [PageState, HostView, React.RefObject<((result: TauViewerShowResult) => void) | undefined>, SelectRequest] {
  const [state, setState] = useState<PageState>({ kind: 'waiting' });
  const [view, setView] = useState<HostView>(() => bridge.view());
  const [select, setSelect] = useState<SelectRequest>(undefined);
  const shownSha = useRef<string | undefined>(undefined);
  const showRef = useRef<((result: TauViewerShowResult) => void) | undefined>(undefined);

  useEffect(() => {
    let current = 0;
    const show = (result: TauViewerShowResult): void => {
      const { model } = result;
      if (result.select !== undefined) {
        setSelect({ modelSha: model.sha256, componentIds: result.select });
      }
      if (model.sha256 === shownSha.current) {
        return;
      }
      shownSha.current = model.sha256;
      current += 1;
      const request = current;
      setState((previous) => ({ kind: 'loading', model, loaded: 0, previous: previousOf(previous) }));
      const load = async (): Promise<void> => {
        try {
          const artifact = await loadModel(bridge.callTool, model, (loaded) => {
            if (request === current) {
              setState((previous) => (previous.kind === 'loading' ? { ...previous, loaded } : previous));
            }
          });
          if (request === current) {
            setState({ kind: 'ready', current: { model, artifact } });
          }
        } catch (error) {
          if (request === current) {
            shownSha.current = undefined;
            setState((previous) => ({
              kind: 'failed',
              message: error instanceof Error ? error.message : String(error),
              previous: previousOf(previous),
            }));
          }
        }
      };
      // async-iife: bootstrap — a host event starts the load; its outcome lands in state, and a newer model supersedes it.
      void load();
    };
    showRef.current = show;
    const unsubscribe = bridge.subscribe((event) => {
      if (event.type === 'context') {
        setView(event.view);
        return;
      }
      if (event.type === 'error') {
        setState((previous) => ({ kind: 'failed', message: event.message, previous: previousOf(previous) }));
        return;
      }
      show(event.result);
    });
    return () => {
      showRef.current = undefined;
      unsubscribe();
    };
  }, [bridge]);

  return [state, view, showRef, select] as const;
}

/** The agent's request to select components of one model (`show_model` with `select`). */
type SelectRequest = Readonly<{ modelSha: string; componentIds: readonly string[] }> | undefined;

/** The canvas region the view cube draws in. */
const canvasRegionId = 'tau-viewer-canvas';

/** A short confirmation over the canvas. */
function Notice({ text }: Readonly<{ text: string }>): React.JSX.Element {
  return (
    <p role='status' className='pointer-events-auto rounded-md border bg-popover px-2 py-1 text-xs shadow-xs'>
      {text}
    </p>
  );
}

/** The shown file as the workbench's one editor tab: its name, then its path, and the selected component. */
function FileTab({
  model,
  selected,
}: Readonly<{ model: TauViewerModel; selected: GeometryComponentReference | undefined }>): React.JSX.Element {
  const path = model.sourceFile ?? model.path;
  return (
    <div className='flex h-9 shrink-0 items-center border-b px-0.5'>
      <div
        title={path}
        className='mx-0.5 flex h-7 max-w-full min-w-28 items-center gap-1.5 rounded-sm bg-accent px-2 text-[13px] text-foreground'
      >
        <FileCode2 aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
        <span className='truncate'>{basenameOf(path)}</span>
      </div>
      {/* The folder only when the file is not at the project root, so the name shows once. */}
      <p className='ml-2 min-w-0 truncate text-xs text-muted-foreground'>
        {path === basenameOf(path) ? null : path}
        {selected === undefined ? null : (
          <span>
            {path === basenameOf(path) ? '' : ' · '}
            {selected.label}
          </span>
        )}
      </p>
    </div>
  );
}

const basenameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** What the canvas shows besides the model: progress, a failure, or the wait for a first model. */
function StatusLine({ state }: Readonly<{ state: PageState }>): React.ReactNode {
  if (state.kind === 'loading') {
    const percent = state.model.byteLength === 0 ? 100 : Math.round((state.loaded / state.model.byteLength) * 100);
    return (
      <p role='status' className='text-xs text-muted-foreground'>
        Loading {state.model.title}… {percent}%
      </p>
    );
  }
  if (state.kind === 'failed') {
    return (
      <p role='alert' className='text-xs text-feature'>
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * The page.
 *
 * @param props - The connected host bridge.
 * @returns The viewer in the composition the host asks for.
 */
export function ViewerPage({ bridge }: Readonly<{ bridge: HostBridge }>): React.JSX.Element {
  const [state, view, showRef, select] = useShownModel(bridge);
  const [selected, setSelected] = useState<GeometryComponentReference | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const graphicsRef = useActorRef(graphicsMachine, {
    input: {
      enableSurfaces: defaultGraphicsSettings.enableSurfaces,
      enableLines: defaultGraphicsSettings.enableLines,
      enableGizmo: defaultGraphicsSettings.enableGizmo,
      enableGrid: defaultGraphicsSettings.enableGrid,
      enableAxes: defaultGraphicsSettings.enableAxes,
      enableMatcap: defaultGraphicsSettings.enableMatcap,
      enablePostProcessing: defaultGraphicsSettings.enablePostProcessing,
      upDirection: defaultGraphicsSettings.upDirection,
      /* The sandboxed frame gets WebGL (I6). */
      graphicsBackend: 'webgl',
    },
  });
  const environment = useMemo(
    (): ViewerEnvironment => ({
      ...defaultViewerEnvironment,
      colorScheme: view.colorScheme,
      graphicsBackend: 'webgl',
      /* The page prints no status text of its own (E2). */
      showRenderFps: false,
      /* The view_state tool captures the live canvas (W6). */
      readableCanvas: true,
    }),
    [view.colorScheme],
  );
  const shown = state.kind === 'ready' ? state.current : previousOf(state);
  const isInline = view.composition === 'inline';
  /* The tab opens with its panes beside a wide canvas; a narrow one keeps the canvas whole until asked. */
  const [isPanelOpen, setIsPanelOpen] = useState(() => globalThis.innerWidth >= 720);
  /* What the canvas draws follows the graphics actor, so Viewer settings and the panes change it as in the app. */
  const enableGrid = useSelector(graphicsRef, (snapshot) => snapshot.context.enableGrid);
  const enableAxes = useSelector(graphicsRef, (snapshot) => snapshot.context.enableAxes);
  const enableLines = useSelector(graphicsRef, (snapshot) => snapshot.context.enableLines);
  const enableSurfaces = useSelector(graphicsRef, (snapshot) => snapshot.context.enableSurfaces);
  const enableMatcap = useSelector(graphicsRef, (snapshot) => snapshot.context.enableMatcap);
  const enableGizmo = useSelector(graphicsRef, (snapshot) => snapshot.context.enableGizmo);

  useEffect(() => {
    setSelected(undefined);
  }, [shown?.model.sha256]);

  /* The live link (W6) reads the latest of these, not the render they were captured in. */
  const rootRef = useRef<HTMLElement>(null);
  const interactedAt = useRef(0);
  const latest = useRef({ state, view, shown });
  latest.current = { state, view, shown };
  const showAgain = useCallback(() => {
    const sourceFile = latest.current.shown?.model.sourceFile;
    if (sourceFile === undefined) {
      return;
    }
    // async-iife: bootstrap — a written parameter edit asks for the model rendered with it.
    void (async () => {
      try {
        const result = await bridge.callTool('show_model', { targetFile: sourceFile });
        showRef.current?.(result as TauViewerShowResult);
      } catch {
        /* The status line keeps the model it shows; the next edit tries again. */
      }
    })();
  }, [bridge, showRef]);
  const isDrawn = useCallback((): boolean => {
    const { current } = latest;
    if (current.state.kind !== 'ready') {
      return false;
    }
    const { context } = graphicsRef.getSnapshot();
    return (
      current.state.current.model.mimeType !== 'model/gltf-binary' || context.gltfPresentation.phase === 'presented'
    );
  }, [graphicsRef]);
  const shownUnit = useCallback(() => {
    const { context } = graphicsRef.getSnapshot();
    const unitId = context.modelInteractionUnitId;
    return unitId === undefined
      ? undefined
      : { unitId, unit: getModelInteractionUnitState(context.modelInteractionRef.getSnapshot().context, unitId) };
  }, [graphicsRef]);
  const linkRef = useRef<LiveLink | undefined>(undefined);
  useEffect(() => {
    const link = startLiveLink(bridge.callTool, {
      view() {
        const model = latest.current.shown?.model;
        const unit = shownUnit();
        if (model === undefined || unit === undefined) {
          return undefined;
        }
        const session = getViewCameraSession(graphicsRef);
        const cameraView = session?.framing.initialized ? session.rig.actorRef.getSnapshot().context.view : undefined;
        const camera: TauViewerCamera | undefined =
          cameraView === undefined
            ? undefined
            : {
                target: [...cameraView.target],
                direction: [...cameraView.direction],
                up: [...cameraView.up],
                verticalSpan: cameraView.verticalSpan,
                frameId: cameraView.frameId,
                perspectiveZoom: cameraView.perspectiveZoom,
              };
        const { context } = graphicsRef.getSnapshot();
        return viewStateOf({
          model,
          unit: unit.unit,
          camera,
          sectionActive: context.isSectionViewActive,
          measurementCount: context.measurements.length,
          composition: latest.current.view.composition,
          interactedAt: interactedAt.current,
        });
      },
      follows: () => latest.current.view.follows,
      linked: () => latest.current.view.linked,
      toolCallId: () => latest.current.view.toolCallId,
      show(result) {
        showRef.current?.(result);
      },
      async capture() {
        if (!(await whenDrawn(isDrawn))) {
          return { error: 'The viewer has not drawn a model yet.' };
        }
        /* The canvas region alone: a pane may draw canvases of its own. */
        const region = rootRef.current?.querySelector(`#${canvasRegionId}`) ?? rootRef.current;
        return region === null ? { error: 'The viewer is not on screen.' } : captureLiveView(region);
      },
    });
    linkRef.current = link;
    return () => {
      linkRef.current = undefined;
      link.stop();
    };
  }, [bridge, graphicsRef, isDrawn, showRef, shownUnit]);

  /* Report the view once a newly shown model is drawn, so `view_state` finds the page without waiting for its held
   * sync to come back: a card's first sync left before it had a model. */
  const shownModelId = shown?.model.id;
  useEffect(() => {
    if (shownModelId === undefined) {
      return;
    }
    let cancelled = false;
    const report = async (): Promise<void> => {
      if (!(await whenDrawn(isDrawn)) || cancelled) {
        return;
      }
      linkRef.current?.nudge();
    };
    // async-iife: bootstrap — the report goes once the model is drawn; a newer model cancels it.
    void report();
    return () => {
      cancelled = true;
    };
  }, [isDrawn, shownModelId]);

  /* After the person changes the view, report it once they pause. */
  const reportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const noteInteraction = useCallback(() => {
    interactedAt.current = Date.now();
    clearTimeout(reportTimer.current);
    reportTimer.current = setTimeout(() => {
      linkRef.current?.nudge();
    }, 400);
  }, []);
  useEffect(
    () => () => {
      clearTimeout(reportTimer.current);
    },
    [],
  );

  /* The agent's selection (show_model with select), once the model it names is drawn. */
  useEffect(() => {
    if (select === undefined) {
      return;
    }
    let cancelled = false;
    const apply = async (): Promise<void> => {
      if (!(await whenDrawn(() => isDrawn() && latest.current.shown?.model.sha256 === select.modelSha)) || cancelled) {
        return;
      }
      const shownNow = shownUnit();
      const manifest = shownNow?.unit.manifest;
      if (shownNow === undefined || manifest === undefined) {
        return;
      }
      const { unitId } = shownNow;
      const known = select.componentIds.filter((componentId) => manifest.nodesById[componentId] !== undefined);
      graphicsRef.send({ type: 'clearModelComponentSelection', unitId, source: 'chat' });
      for (const [index, componentId] of known.entries()) {
        graphicsRef.send({
          type: index === 0 ? 'selectModelComponent' : 'toggleModelComponentSelection',
          unitId,
          componentId,
          source: 'chat',
        });
      }
      const [first] = known;
      const node = first === undefined ? undefined : manifest.nodesById[first];
      setSelected(node === undefined ? undefined : buildGeometryComponentReference(manifest, node));
      linkRef.current?.nudge();
    };
    // async-iife: bootstrap — the selection lands when the model is drawn; a newer request cancels it.
    void apply();
    return () => {
      cancelled = true;
    };
  }, [graphicsRef, isDrawn, select, shownUnit]);

  const addToChat = useCallback(() => {
    if (shown === undefined) {
      return;
    }
    const add = async (): Promise<void> => {
      try {
        const outcome = await bridge.addToChat(chatReferenceOf(shown.model, selected));
        setNotice(chatNotice[outcome]);
      } catch {
        setNotice('Could not add to chat');
      }
    };
    // async-iife: bootstrap — a click starts it; the notice reports its outcome.
    void add();
  }, [bridge, shown, selected]);

  /* The app's part menu (viewer parity V13): right-click a part on the canvas, or a row's menu in the Model pane. */
  const reveal = useMemo(() => createComponentReveal(), []);
  const [openPaneRequest, setOpenPaneRequest] = useState<
    Readonly<{ pane: ComponentMenuPane; requestId: number }> | undefined
  >(undefined);
  const openPane = useCallback((pane: ComponentMenuPane) => {
    setIsPanelOpen(true);
    setOpenPaneRequest((request) => ({ pane, requestId: (request?.requestId ?? 0) + 1 }));
  }, []);
  const addPartToChat = useCallback(
    (reference: GeometryComponentReference) => {
      const model = latest.current.shown?.model;
      if (model === undefined) {
        return;
      }
      // async-iife: bootstrap — a menu click starts it; the notice reports its outcome.
      void (async () => {
        try {
          setNotice(chatNotice[await bridge.addToChat(chatReferenceOf(model, reference))]);
        } catch {
          setNotice('Could not add to chat');
        }
      })();
    },
    [bridge],
  );
  const componentActions = useMemo(
    () => createPageComponentActions({ addToChat: addPartToChat, openPane, reveal }),
    [addPartToChat, openPane, reveal],
  );
  const rowMenus = useMemo(() => createModelComponentActionMenus(componentActions), [componentActions]);
  const componentMenu = useViewerComponentMenu({ graphicsRef, actions: componentActions });
  const closeComponentMenu = componentMenu.close;
  useEffect(() => {
    closeComponentMenu();
  }, [shown?.model.sha256, closeComponentMenu]);

  useEffect(() => {
    if (notice === undefined) {
      return;
    }
    const timer = setTimeout(() => {
      setNotice(undefined);
    }, 2500);
    return () => {
      clearTimeout(timer);
    };
  }, [notice]);

  /* In a card the conversation owns the wheel and vertical pan (E5, G21);
   * controls are 44 pt there and the card keeps one height under the host's cap. */
  const actions = (
    <>
      <Button
        variant='ghost'
        size={isInline ? 'default' : 'xs'}
        className={cn(isInline && 'min-h-11')}
        disabled={shown === undefined}
        onClick={addToChat}
      >
        <MessageSquarePlus className='size-4' />
        {chatAction[view.chatRoute]}
      </Button>
      {isInline ? null : (
        <Button
          variant='ghost'
          size='xs'
          aria-pressed={isPanelOpen}
          aria-label={isPanelOpen ? 'Hide panes' : 'Show panes'}
          onClick={() => {
            setIsPanelOpen((open) => !open);
          }}
        >
          <PanelRight className='size-4' />
          <span className='hidden @min-[520px]/viewer:inline'>Panes</span>
        </Button>
      )}
      {isInline && view.canRequestFullscreen ? (
        <Button
          variant='ghost'
          className='min-h-11'
          onClick={() => {
            void bridge.requestFullscreen();
          }}
        >
          <Maximize2 className='size-4' />
          Open full view
        </Button>
      ) : null}
    </>
  );

  return (
    <ViewerEnvironmentProvider value={environment}>
      <KeyboardProvider>
        <TooltipProvider>
          <GraphicsProvider graphicsRef={graphicsRef}>
            <main
              ref={rootRef}
              data-composition={view.composition}
              onPointerUp={noteInteraction}
              onKeyUp={noteInteraction}
              onWheel={noteInteraction}
              className={cn('@container/viewer flex flex-col bg-background text-foreground', !isInline && 'h-dvh')}
              style={{
                height: cardHeight(view),
                paddingTop: view.safeArea.top,
                paddingRight: view.safeArea.right,
                paddingBottom: view.safeArea.bottom,
                paddingLeft: view.safeArea.left,
              }}
            >
              {isInline || shown === undefined ? null : <FileTab model={shown.model} selected={selected} />}
              <div className='flex min-h-0 flex-1'>
                <div
                  id={canvasRegionId}
                  className='@container/viewer relative min-w-0 flex-1 overflow-hidden'
                  {...(isInline ? {} : componentMenu.regionProps)}
                >
                  {shown === undefined && state.kind !== 'loading' ? (
                    <div className='flex size-full items-center justify-center p-4 text-center'>
                      {state.kind === 'failed' ? (
                        <StatusLine state={state} />
                      ) : (
                        <p className='text-sm text-muted-foreground'>Waiting for a model.</p>
                      )}
                    </div>
                  ) : (
                    <ModelViewer
                      graphicsRef={graphicsRef}
                      artifact={shown?.artifact}
                      artifactHash={shown?.model.sha256}
                      /* The unit the panes name: the source, or the GLB itself when it has none. */
                      sourceFile={shown?.model.sourceFile ?? shown?.model.path}
                      enablePan={!isInline}
                      enableZoom={!isInline}
                      graphicsOptions={{
                        enableGrid,
                        enableAxes,
                        enableLines,
                        enableSurfaces,
                        enableMatcap,
                        /* The view cube belongs to the tab; a card shows the canvas and two actions (E2). */
                        enableGizmo: !isInline && enableGizmo,
                      }}
                      /* Top-right of the canvas, as in the workbench (viewer parity V5). */
                      gizmoContainer={isInline ? undefined : `#${canvasRegionId}`}
                      onComponentReference={setSelected}
                      onComponentSecondaryPointerCandidate={
                        isInline ? undefined : componentMenu.onComponentSecondaryPointerCandidate
                      }
                    />
                  )}
                  <div className='pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-1 p-2'>
                    {shown === undefined || !isInline ? null : (
                      <p className='rounded-md bg-background/80 px-2 py-1 text-xs font-medium'>
                        {shown.model.title}
                        {selected === undefined ? null : (
                          <span className='text-muted-foreground'> · {selected.label}</span>
                        )}
                      </p>
                    )}
                    {shown === undefined ? null : <StatusLine state={state} />}
                  </div>
                  {/* The app's bar, over the canvas, growing upward as tools start (viewer parity V2). */}
                  {isInline ? null : (
                    <div className='pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-col items-center-safe gap-2'>
                      {notice === undefined ? null : <Notice text={notice} />}
                      <ViewerControls actions={actions} />
                    </div>
                  )}
                  {isInline && notice !== undefined ? (
                    <div className='absolute right-2 bottom-2'>
                      <Notice text={notice} />
                    </div>
                  ) : null}
                </div>
                {isInline || !isPanelOpen ? null : (
                  <WorkbenchLane
                    bridge={bridge}
                    model={shown?.model}
                    graphicsRef={graphicsRef}
                    onSelect={setSelected}
                    onParametersWritten={showAgain}
                    onHide={() => {
                      setIsPanelOpen(false);
                    }}
                    reveal={reveal}
                    componentActions={rowMenus}
                    openPaneRequest={openPaneRequest}
                  />
                )}
              </div>
              {isInline ? (
                <div className='flex items-center justify-end gap-1 border-t px-2 py-1'>{actions}</div>
              ) : null}
            </main>
            {isInline ? null : componentMenu.menu}
          </GraphicsProvider>
        </TooltipProvider>
      </KeyboardProvider>
    </ViewerEnvironmentProvider>
  );
}
