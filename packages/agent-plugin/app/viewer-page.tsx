/**
 * The Tau viewer page: one bundle, two compositions (blueprint D10, I7).
 *
 * Inline (a card in the conversation) draws the canvas and two actions; the
 * tab (Codex's thread tab, fullscreen on any host, the loopback page) is the
 * Tau workbench: a header with the file tab and the app's Share, Export and
 * workbench toggle, the app's viewer bar over the canvas with the view cube
 * top-right, and the workbench panes beside it (viewer parity R1).
 * Everything the page shows comes through the host bridge.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { Box, Maximize2, MessageSquarePlus } from 'lucide-react';
import type { TauViewerCamera, TauViewerModel, TauViewerShowResult } from '@taucad/mcp/viewer-protocol';
import type { Artifact } from '@taucad/runtime';
import type { GeometryComponentReference } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { Separator } from '@taucad/ui/components/separator';
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
import {
  createModelComponentActionMenus,
  ModelComponentActionDropdown,
} from '@taucad/workbench-panes/component-menu/component-action-menu';
import type { ModelComponentActionMenuData } from '@taucad/workbench-panes/component-menu/component-action-menu';
import { useViewerPartMenu } from '@taucad/workbench-panes/component-menu/use-viewer-part-menu';
import { WorkbenchTab } from '@taucad/workbench-panes/components/workbench-tab';
import { WorkbenchToggleButton } from '@taucad/workbench-panes/components/workbench-toggle';
import type { WorkbenchPaneId } from '@taucad/workbench-panes/registry/pane-registry';
import { ViewerHeaderActions } from '@taucad/workbench-panes/shell/viewer-header-actions';
import { ViewerStage } from '@taucad/workbench-panes/shell/viewer-stage';
import type { ViewerStageStatus } from '@taucad/workbench-panes/shell/viewer-stage';
import { createComponentReveal, createPageComponentActions } from '#app/sources/component-menu.jsx';
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

/** The reference action's name per route, on the card and in the part menu: each says what a click does (D3, D9). */
const chatAction: Readonly<Record<ChatRoute, string>> = {
  context: 'Add to chat',
  message: 'Send to chat',
  clipboard: 'Copy reference',
};

/**
 * What the page says once a reference went its route.
 *
 * @param route - The route it took.
 * @param added - On the model-context route, how many parts the chat now holds and whether this one was there before.
 * @returns The notice.
 */
const chatNotice = (route: ChatRoute, added?: Readonly<{ count: number; isRepeat: boolean }>): string => {
  if (route === 'message') {
    return 'Sent to chat';
  }
  if (route === 'clipboard') {
    return 'Copied; paste it into your chat';
  }
  if (added === undefined) {
    return 'Added to chat';
  }
  return added.isRepeat ? 'Already in chat' : `Added to chat (${String(added.count)})`;
};

/** The parts the person added to chat from one shown model, keyed `path#componentId`, in the order added. */
type AddedParts = Readonly<{ modelSha: string; parts: ReadonlyMap<string, GeometryComponentReference> }>;

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

/** The canvas region the view cube draws in; in the tab it takes focus, so Shift+F10 opens the part menu (VUI-6). */
const canvasRegionId = 'tau-viewer-canvas';

/** A short confirmation over the canvas. */
function Notice({ text }: Readonly<{ text: string }>): React.JSX.Element {
  return (
    <p role='status' className='pointer-events-auto rounded-md border bg-popover px-2 py-1 text-xs shadow-xs'>
      {text}
    </p>
  );
}

type PageHeaderProps = Readonly<{
  model: TauViewerModel | undefined;
  /** The selected part's menu, which its name in the header opens; `undefined` with no part selected. */
  selectedMenu: ModelComponentActionMenuData | undefined;
  /** The selected part's name, as its chat reference names it. */
  selectedLabel: string | undefined;
  onOpenPane: (pane: WorkbenchPaneId) => void;
  /** The workbench toggle, drawn last while the lane is closed; the open lane draws it at the end of its tabs. */
  toggle: React.ReactNode;
}>;

/**
 * The canvas's header, as the app's viewer header: the shown file as the workbench's one editor tab (its name, its
 * path in the tooltip and beside it, and the selected part, whose name opens its part menu), then the shared Share and
 * Export, which open their panes (viewer chrome D4, D5, D8). The open lane's tabs continue the same row beside it,
 * ending in the workbench toggle, as the app's dock groups share one top bar; with the lane closed the toggle ends
 * this header.
 *
 * @param props - The shown model, the selected part's menu and name, what the actions do and the toggle while the
 *   lane is closed.
 * @returns The header.
 */
function PageHeader({ model, selectedMenu, selectedLabel, onOpenPane, toggle }: PageHeaderProps): React.JSX.Element {
  const path = model === undefined ? undefined : (model.sourceFile ?? model.path);
  return (
    <div className='flex h-9 shrink-0 items-center gap-1 border-b px-0.5'>
      {path === undefined ? null : (
        <>
          <WorkbenchTab
            as='div'
            isActive
            icon={<Box aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />}
            title={basenameOf(path)}
            fullTitle={path}
            className='mx-0.5 h-7 w-auto max-w-56 min-w-28 shrink-0 rounded-sm'
          />
          {/* The folder only when the file is not at the project root, so the name shows once. */}
          <p className='ml-1 min-w-0 truncate text-xs text-muted-foreground'>
            {path === basenameOf(path) ? null : path}
            {selectedMenu === undefined || selectedLabel === undefined ? null : (
              <span>
                {path === basenameOf(path) ? '' : ' · '}
                <ModelComponentActionDropdown
                  {...selectedMenu}
                  actionButtonClassName='inline-flex h-6 max-w-full items-center rounded-sm px-1 align-middle hover:bg-accent hover:text-foreground focus-visible:focus-outline'
                >
                  <span className='truncate'>{selectedLabel}</span>
                </ModelComponentActionDropdown>
              </span>
            )}
          </p>
        </>
      )}
      <div className='ml-auto flex shrink-0 items-center pr-0.5'>
        <ViewerHeaderActions isDisabled={model === undefined} trailing={toggle} onOpenPane={onOpenPane} />
      </div>
    </div>
  );
}

const basenameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/**
 * The rule and the workbench toggle at the end of the open lane's tabs; the canvas header draws its own rule.
 *
 * @param props - The workbench toggle button the rule precedes.
 * @returns The rule and the toggle.
 */
function LaneToggle({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <>
      {/* The variant, not `h-4`: the separator's own `data-[orientation=vertical]:h-full` outranks a bare height. */}
      <Separator orientation='vertical' className='data-[orientation=vertical]:h-4' />
      {children}
    </>
  );
}

/**
 * What the canvas shows besides the model, in the shared stage: the download's progress or the failure.
 *
 * @param state - Whether the page waits, loads, shows or failed, with the download's byte count.
 * @returns The loading pill with its share, the failure, or `undefined` while waiting or showing.
 */
const stageStatusOf = (state: PageState): ViewerStageStatus | undefined => {
  if (state.kind === 'loading') {
    return {
      kind: 'loading',
      label: `Loading ${state.model.title}`,
      progress: state.model.byteLength === 0 ? 1 : state.loaded / state.model.byteLength,
    };
  }
  return state.kind === 'failed' ? { kind: 'failed', message: state.message } : undefined;
};

/**
 * The page.
 *
 * @param props - The connected host bridge.
 * @returns The viewer in the composition the host asks for.
 */
export function ViewerPage({ bridge }: Readonly<{ bridge: HostBridge }>): React.JSX.Element {
  const [state, view, showRef, select] = useShownModel(bridge);
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
  /* What the person added to chat; a newly shown model starts an empty set (VUI-3). */
  const added = useRef<AddedParts | undefined>(undefined);
  const addedFrom = useCallback(
    (modelSha: string): GeometryComponentReference[] =>
      added.current?.modelSha === modelSha ? [...added.current.parts.values()] : [],
    [],
  );
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
          references: addedFrom(model.sha256),
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
  }, [addedFrom, bridge, graphicsRef, isDrawn, showRef, shownUnit]);

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
      linkRef.current?.nudge();
    };
    // async-iife: bootstrap — the selection lands when the model is drawn; a newer request cancels it.
    void apply();
    return () => {
      cancelled = true;
    };
  }, [graphicsRef, isDrawn, select, shownUnit]);

  /* The app's part menu (viewer parity V13): right-click a part on the canvas, or a row's menu in the Model pane. */
  const reveal = useMemo(() => createComponentReveal(), []);
  const [openPaneRequest, setOpenPaneRequest] = useState<
    Readonly<{ pane: WorkbenchPaneId; requestId: number }> | undefined
  >(undefined);
  /* Request ids only grow, so a request made after the lane closed still reads as new. */
  const paneRequests = useRef(0);
  const openPane = useCallback((pane: WorkbenchPaneId) => {
    paneRequests.current += 1;
    setIsPanelOpen(true);
    setOpenPaneRequest({ pane, requestId: paneRequests.current });
  }, []);
  /* One verb for the part menu, the Model pane's rows and the card: the part joins the set, the chat gets it along
   * the host's route, and the next sync reports the set to view_state (D2). */
  const addPartToChat = useCallback(
    (reference: GeometryComponentReference) => {
      const model = latest.current.shown?.model;
      if (model === undefined) {
        return;
      }
      const parts = new Map(addedFrom(model.sha256).map((part) => [`${part.filePath}#${part.componentId}`, part]));
      const key = `${reference.filePath}#${reference.componentId}`;
      const isRepeat = parts.has(key);
      parts.set(key, parts.get(key) ?? reference);
      added.current = { modelSha: model.sha256, parts };
      linkRef.current?.nudge();
      const all = chatReferenceOf(model, [...parts.values()]);
      // async-iife: bootstrap — a menu click starts it; the notice reports its outcome.
      void (async () => {
        try {
          const route = await bridge.addToChat(chatReferenceOf(model, [reference]), all);
          setNotice(chatNotice(route, { count: parts.size, isRepeat }));
        } catch {
          setNotice('Could not add to chat');
        }
      })();
    },
    [addedFrom, bridge],
  );
  const latestSelected = useRef<GeometryComponentReference | undefined>(undefined);
  /* The card's action adds the picked part, or names the whole model when nothing is picked (D1). */
  const addToChat = useCallback(() => {
    if (shown === undefined) {
      return;
    }
    const selected = latestSelected.current;
    if (selected !== undefined) {
      addPartToChat(selected);
      return;
    }
    const add = async (): Promise<void> => {
      try {
        setNotice(chatNotice(await bridge.addToChat(chatReferenceOf(shown.model, []))));
      } catch {
        setNotice('Could not add to chat');
      }
    };
    // async-iife: bootstrap — a click starts it; the notice reports its outcome.
    void add();
  }, [addPartToChat, bridge, shown]);
  const componentActions = useMemo(
    () =>
      createPageComponentActions({
        addToChat: addPartToChat,
        addToChatLabel: chatAction[view.chatRoute],
        openPane,
        reveal,
      }),
    [addPartToChat, openPane, reveal, view.chatRoute],
  );
  const rowMenus = useMemo(() => createModelComponentActionMenus(componentActions), [componentActions]);
  /* The selected part is the graphics actor's first selected component, whichever surface picked it. */
  const partMenu = useViewerPartMenu({ graphicsRef, actions: componentActions });
  const { selectedMenu } = partMenu;
  const selectedReference = useMemo(
    () =>
      selectedMenu === undefined
        ? undefined
        : buildGeometryComponentReference(selectedMenu.manifest, selectedMenu.node),
    [selectedMenu],
  );
  latestSelected.current = selectedReference;
  const selectedLabel = selectedReference?.label;
  /* A secondary press on a part in the card picks it, as the card has no part menu (D1). */
  const pickPart = useCallback(
    (reference: GeometryComponentReference) => {
      const unitId = graphicsRef.getSnapshot().context.modelInteractionUnitId;
      if (unitId !== undefined) {
        graphicsRef.send({
          type: 'selectModelComponent',
          unitId,
          componentId: reference.componentId,
          source: 'viewer',
        });
      }
    },
    [graphicsRef],
  );

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

  /* Closing drops the last pane request, so the lane reopens on its opening tabs instead of replaying it. The toggle
   * moves between the canvas header and the lane's, so the one it lands in takes focus back. */
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isToggleFocusPending = useRef(false);
  const togglePanel = useCallback(() => {
    if (isPanelOpen) {
      setOpenPaneRequest(undefined);
    }
    isToggleFocusPending.current = toggleRef.current !== null && toggleRef.current === document.activeElement;
    setIsPanelOpen(!isPanelOpen);
  }, [isPanelOpen]);
  useEffect(() => {
    if (isToggleFocusPending.current) {
      isToggleFocusPending.current = false;
      toggleRef.current?.focus();
    }
  }, [isPanelOpen]);
  const toggle = <WorkbenchToggleButton ref={toggleRef} isOpen={isPanelOpen} onClick={togglePanel} />;
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
              <div className='flex min-h-0 flex-1'>
                {/* The canvas column: its header and the open lane's tabs make one top row (viewer chrome D4). */}
                <div className='@container/viewer flex min-w-0 flex-1 flex-col'>
                  {isInline ? null : (
                    <PageHeader
                      model={shown?.model}
                      selectedMenu={selectedMenu}
                      selectedLabel={selectedLabel}
                      onOpenPane={openPane}
                      toggle={isPanelOpen ? undefined : toggle}
                    />
                  )}
                  {/* In the tab the region takes focus, so its part menu has a keyboard route (VUI-6, D8). */}
                  <ViewerStage
                    graphicsRef={graphicsRef}
                    regionId={canvasRegionId}
                    regionLabel='Model viewer'
                    partMenu={isInline ? undefined : partMenu}
                    isModelShown={shown !== undefined}
                    status={stageStatusOf(state)}
                    className='min-h-0 min-w-0 flex-1'
                    /* The app's bar, over the canvas, growing upward as tools start (viewer parity V2). */
                    controls={
                      isInline ? undefined : (
                        <>
                          {notice === undefined ? null : <Notice text={notice} />}
                          <ViewerControls />
                        </>
                      )
                    }
                    renderCanvas={({ eventSource, gizmoContainer, onComponentSecondaryPointerCandidate }) =>
                      shown === undefined && state.kind !== 'loading' ? (
                        state.kind === 'failed' ? null : (
                          <div className='flex size-full items-center justify-center p-4 text-center'>
                            <p className='text-sm text-muted-foreground'>Waiting for a model.</p>
                          </div>
                        )
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
                          /* The canvas region's pointer events, so the part menu and the camera see the same press. */
                          eventSource={eventSource}
                          /* Top-right of the canvas, as in the workbench (viewer parity V5). */
                          gizmoContainer={isInline ? undefined : gizmoContainer}
                          onComponentReference={isInline ? pickPart : undefined}
                          onComponentSecondaryPointerCandidate={onComponentSecondaryPointerCandidate}
                        />
                      )
                    }
                  >
                    {shown === undefined || !isInline ? null : (
                      <div className='pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-1 p-2'>
                        <p className='rounded-md bg-background/80 px-2 py-1 text-xs font-medium'>
                          {shown.model.title}
                          {selectedLabel === undefined ? null : (
                            <span className='text-muted-foreground'> · {selectedLabel}</span>
                          )}
                        </p>
                      </div>
                    )}
                    {isInline && notice !== undefined ? (
                      <div className='absolute right-2 bottom-2'>
                        <Notice text={notice} />
                      </div>
                    ) : null}
                  </ViewerStage>
                </div>
                {isInline || !isPanelOpen ? null : (
                  <WorkbenchLane
                    bridge={bridge}
                    model={shown?.model}
                    graphicsRef={graphicsRef}
                    onParametersWritten={showAgain}
                    reveal={reveal}
                    componentActions={rowMenus}
                    openPaneRequest={openPaneRequest}
                    headerEnd={<LaneToggle>{toggle}</LaneToggle>}
                  />
                )}
              </div>
              {/* In a card the conversation owns the wheel and vertical pan (E5, G21); its two actions are 44 pt and
               * the card keeps one height under the host's cap. The tab's part menu adds parts instead (D1). */}
              {isInline ? (
                <div className='flex items-center justify-end gap-1 border-t px-2 py-1'>
                  <Button variant='ghost' className='min-h-11' disabled={shown === undefined} onClick={addToChat}>
                    <MessageSquarePlus className='size-4' />
                    {chatAction[view.chatRoute]}
                  </Button>
                  {view.canRequestFullscreen ? (
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
                </div>
              ) : null}
            </main>
          </GraphicsProvider>
        </TooltipProvider>
      </KeyboardProvider>
    </ViewerEnvironmentProvider>
  );
}
