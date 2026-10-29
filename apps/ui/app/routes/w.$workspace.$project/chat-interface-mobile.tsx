import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DockviewApi } from 'dockview-react';
import { XIcon } from 'lucide-react';
import { ChatHistory } from '#routes/w.$workspace.$project/chat-history.js';
import { ProjectUnavailableOverlay } from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
import { ProjectManifestIssueBanner } from '#routes/w.$workspace.$project/project-manifest-issue-banner.js';
import { cn } from '@taucad/ui/utils/cn';
import { ChatInterfaceNav, surfaceTitle } from '#routes/w.$workspace.$project/chat-interface-nav.js';
import { mobileWorkbenchNavigationHeight } from '#components/mobile-workbench-navigation.js';
import type { MobileWorkbenchDestinationCue } from '#components/mobile-workbench-navigation.js';
import { mobileDrawerOpenSnapPoint } from '#constants/editor.constants.js';
import type { MobilePanelId } from '#constants/editor.constants.js';
import { useChatInterfaceState } from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { viewName } from '#workbench-records/view-titles.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import type { ViewerFileActions } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@taucad/ui/components/drawer';
import { ChatHistoryGate, ChatInterfaceSessionGate } from '#routes/w.$workspace.$project/focused-chat-gate.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import { useFeature } from '#flags/use-feature.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectSidebarRow } from '#hooks/use-sidebar-status.js';
import { TerminalCloseContext } from '#components/terminal/terminal-close.js';
import type { TerminalCloseHost } from '#components/terminal/terminal-close.js';
import { MobileProjectTopBar } from '#routes/w.$workspace.$project/mobile-project-top-bar.js';

/* B-27, D-UI-16: every panel but the chat is its own chunk, loaded when its surface
 * first opens. Only the active surface is mounted (Terminal survives hiding), so a phone that
 * stays on the chat never downloads the editor (CodeMirror and the dockview
 * workbench), parameters, converter or revision panels. */
const ChatFileTree = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-file-tree.js');
  return { default: module.ChatFileTree };
});
const ChatParameters = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-parameters.js');
  return { default: module.ChatParameters };
});
const ChatEditorLayout = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-editor-layout.js');
  return { default: module.ChatEditorLayout };
});
const ChatDetails = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-details.js');
  return { default: module.ChatDetails };
});
const ChatConverter = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-converter.js');
  return { default: module.ChatConverter };
});
const ProjectShareWorkbenchPanel = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/project-share-action.js');
  return { default: module.ProjectShareWorkbenchPanel };
});
const ChatRevisions = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-revisions.js');
  return { default: module.ChatRevisions };
});
/* The bodies the desktop Workbench registers, each behind its own availability gate, so a phone reaches every
 * registry pane (I1) with the same content and refusals. */
const ModelPanelBody = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-explorer.js');
  return { default: module.ModelPanelBody };
});
const KinematicsPanelBody = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-kinematics.js');
  return { default: module.KinematicsPanelBody };
});
const PrintPanelBody = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-print.js');
  return { default: module.PrintPanelBody };
});
const BrowserPane = lazy(async () => {
  const module = await import('#components/browser/browser-pane.js');
  return { default: module.BrowserPane };
});
const AgentsPanelBody = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-agents.js');
  return { default: module.AgentsPanelBody };
});
const JobsPanelBody = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-jobs.js');
  return { default: module.JobsPanelBody };
});
const TelemetryPanelContent = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-kernel.js');
  return { default: module.TelemetryPanelContent };
});
const ChatConsole = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/chat-console.js');
  return { default: module.ChatConsole };
});
const ProjectTerminalPane = lazy(async () => {
  const module = await import('#components/terminal/terminal-pane.js');
  return { default: module.ProjectTerminalPane };
});

/** A Workbench pane in the sheet: its title, a named Close, then the body the desktop pane renders (D4). */
function MobilePane({
  id,
  children,
  onOpenChange,
}: {
  readonly onOpenChange?: (open: boolean) => void;
  readonly id: MobilePanelId;
  readonly children: React.ReactNode;
}): React.ReactNode {
  const title = surfaceTitle(id);
  return (
    <FloatingPanel isOpen side='right' onOpenChange={onOpenChange}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>{title}</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose icon={XIcon} label={`Close ${title}`} tooltipContent={() => `Close ${title}`} />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className='flex min-h-0 flex-col overflow-hidden p-0'>
          <Suspense fallback={null}>{children}</Suspense>
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}

/** Debug panes refuse as their desktop panes do while debug mode is off. */
function DebugGate({
  refusal,
  children,
}: {
  readonly refusal: string;
  readonly children: React.ReactNode;
}): React.ReactNode {
  const enabled = useFeature('tauDebug');
  return enabled ? children : <p className='p-4 text-muted-foreground'>{refusal}</p>;
}

/** The active surface's panel; the model has none, since the viewer behind the sheet is the model. */
function MobileSurface({ id }: { readonly id: MobilePanelId }): React.ReactNode {
  switch (id) {
    case 'chat': {
      return (
        <ChatHistoryGate>
          <ChatHistory />
        </ChatHistoryGate>
      );
    }
    case 'files': {
      return <ChatFileTree />;
    }
    case 'parameters': {
      return <ChatParameters />;
    }
    case 'editor': {
      return <ChatEditorLayout />;
    }
    case 'details': {
      return <ChatDetails />;
    }
    case 'converter': {
      return <ChatConverter />;
    }
    case 'share': {
      // On a phone Share gets the title and Close every sheet pane has (PN-SHR-1). The share frame's own
      // "Share project" heading would repeat that title, so it is hidden here; it still names the frame's section.
      return (
        <MobilePane id={id}>
          <div className='flex min-h-0 flex-1 flex-col [&_[data-slot=share-pane-title]]:hidden'>
            <ProjectShareWorkbenchPanel />
          </div>
        </MobilePane>
      );
    }
    case 'revisions': {
      // The pane's own title and Close, as every other panel here (L3-F15).
      return <ChatRevisions />;
    }
    case 'model-tree': {
      return (
        <MobilePane id={id}>
          <ModelPanelBody />
        </MobilePane>
      );
    }
    case 'kinematics': {
      return (
        <MobilePane id={id}>
          <KinematicsPanelBody />
        </MobilePane>
      );
    }
    case 'print': {
      return (
        <MobilePane id={id}>
          <PrintPanelBody />
        </MobilePane>
      );
    }
    case 'browser': {
      return (
        <MobilePane id={id}>
          <BrowserPane />
        </MobilePane>
      );
    }
    case 'agents': {
      return (
        <MobilePane id={id}>
          <AgentsPanelBody />
        </MobilePane>
      );
    }
    case 'jobs': {
      return (
        <MobilePane id={id}>
          <JobsPanelBody />
        </MobilePane>
      );
    }
    case 'kernel': {
      return (
        <MobilePane id={id}>
          <DebugGate refusal='Kernel diagnostics require debug mode.'>
            <TelemetryPanelContent />
          </DebugGate>
        </MobilePane>
      );
    }
    case 'console': {
      return (
        <MobilePane id={id}>
          <DebugGate refusal='Console requires debug mode.'>
            <ChatConsole />
          </DebugGate>
        </MobilePane>
      );
    }
    case 'terminal': {
      // The shell owns this pane above the drawer so hiding it preserves the session.
      return null;
    }
    case 'viewer': {
      return null;
    }
  }
}

/** A snap point's visible height as a CSS length: a fraction of the viewport, or a fixed height. */
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
function snapPointLength(point: number | string | null): string {
  return typeof point === 'string' ? point : `${Number(point)} * 100dvh`;
}

const textEntryInputTypes = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** Escape inside a field or the code editor belongs to that control (clear, close a suggestion), not to the sheet. */
function isEditingTarget(target: EventTarget | undefined): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLInputElement) {
    return textEntryInputTypes.has(target.type);
  }
  return target instanceof HTMLTextAreaElement || target.isContentEditable || target.closest('.cm-editor') !== null;
}

const clippingOverflow = new Set(['auto', 'scroll', 'hidden', 'clip']);

/**
 * What can raise the sheet (I5): the run's error card (`data-decision=run-error`, which rides the transcript's last
 * turn), an approval waiting above the composer (`data-decision=approval`), and an agent question waiting for an answer
 * (`data-ask-state=open`), in the transcript or in the tray above the composer. Other alerts (a job's outcome, a form
 * error, a tool note) are records a person scrolls through, never a reason to move the sheet.
 */
const decisionSelector = '[data-decision], [data-ask-state=open]';

/** A decision that settled (an answered question, a resolved approval): its identity can retire. */
const settledSelector = '[data-ask-state=settled][data-ask-id], [data-decision-state=settled][data-decision-id]';

/** The fixed rows' overflow at half, the lowest detent, as an acknowledgement key. */
const fixedRowsKey = 'fixed-rows';

/** How often a scroll re-checks at most, while a list is still catching up with its content. Milliseconds. */
const scrollCheckInterval = 100;

/**
 * A decision's identity across a remount and a surface switch: the same ask in either home, the same failure or
 * approval. Never its text, which a countdown changes and a retry repeats; a decision without an identity is ignored.
 */
function decisionKey(decision: HTMLElement): string | undefined {
  const { askId, decisionId } = decision.dataset;
  return askId === undefined ? decisionId : `ask:${askId}`;
}

function hasBox(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/**
 * Whether a scroller sits where it rests with nothing scrolled by hand: a list that says it rests at its start
 * (`data-scroll-rest=start`, the question tray) at its top, any other (a transcript) at its end.
 */
function isAtRest(scroller: HTMLElement): boolean {
  if (scroller.dataset['scrollRest'] === 'start') {
    return scroller.scrollTop <= 1;
  }
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1;
}

/**
 * Whether the detent itself cuts the decision off: it is taller than the box that clips it, or that box is resting
 * (nothing scrolled by hand) and still cannot show all of it. A decision the person scrolled past is not cut off by
 * the detent, and neither is one that is not displayed.
 */
function isCutOffByDetent(decision: HTMLElement, section: HTMLElement): boolean {
  if (!hasBox(decision)) {
    return false;
  }
  const box = decision.getBoundingClientRect();
  for (let parent = decision.parentElement; parent && parent !== section; parent = parent.parentElement) {
    if (!clippingOverflow.has(getComputedStyle(parent).overflowY)) {
      continue;
    }
    const clip = parent.getBoundingClientRect();
    if (box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1) {
      continue;
    }
    // The nearest box that cuts it decides: a taller decision never fits; otherwise only a resting scroller's size counts.
    const scrolls = parent.scrollHeight > parent.clientHeight + 1;
    return box.height > clip.height + 1 || !scrolls || isAtRest(parent);
  }
  return false;
}

/** The identified decisions on screen, each with its identity. */
function decisionsIn(section: HTMLElement): Array<[string, HTMLElement]> {
  const found: Array<[string, HTMLElement]> = [];
  for (const decision of section.querySelectorAll<HTMLElement>(decisionSelector)) {
    const key = decisionKey(decision);
    if (key !== undefined) {
      found.push([key, decision]);
    }
  }
  return found;
}

/**
 * Never fold away a decision (I5). When a decision arrives and half cuts it off, the sheet rises to full; the same
 * holds for fixed rows (a title, a composer with an approval or a question above it) that no longer fit at half. A
 * detent the person chooses is theirs: the decisions on screen when they move the sheet are acknowledged, on any
 * surface and for as long as they wait, and only a decision that arrives after can raise it again.
 *
 * @returns The acknowledgement to call when the person moves the sheet.
 */
function useRaiseWhenClipped(
  section: HTMLElement | undefined,
  detent: 'half' | undefined,
  raise: () => void,
): () => void {
  const acknowledged = useRef(new Set<string>());
  const acknowledge = useCallback(() => {
    // Added to, never replaced: a move on another surface keeps what the person already saw on Chat.
    acknowledged.current.add(fixedRowsKey);
    for (const [key] of section ? decisionsIn(section) : []) {
      acknowledged.current.add(key);
    }
  }, [section]);
  useEffect(() => {
    if (!section || detent === undefined || typeof ResizeObserver === 'undefined') {
      return;
    }
    const check = (): void => {
      const open = decisionsIn(section);
      const openKeys = new Set(open.map(([key]) => key));
      for (const settled of section.querySelectorAll<HTMLElement>(settledSelector)) {
        const key = decisionKey(settled);
        // One copy can settle before another (an approval shows in the banner and in its message): the identity
        // retires only once no copy is still waiting.
        if (key !== undefined && !openKeys.has(key)) {
          acknowledged.current.delete(key);
        }
      }
      const fresh = open.filter(([key, decision]) => !acknowledged.current.has(key) && hasBox(decision));
      if (fresh.length > 0) {
        // Something new arrived: the person has not chosen a detent for it.
        acknowledged.current.delete(fixedRowsKey);
      }
      for (const panel of section.querySelectorAll<HTMLElement>('[data-slot=floating-panel-content]')) {
        // Half is the only detent below full, so the fixed rows overflowing it raise the sheet.
        if (!acknowledged.current.has(fixedRowsKey) && panel.scrollHeight > panel.clientHeight + 1) {
          raise();
          return;
        }
      }
      // One decision may show in two homes (a question's transcript card and its tray row): it is folded away only
      // when every copy is cut off.
      const copies = Map.groupBy(fresh, ([key]) => key);
      if ([...copies.values()].some((group) => group.every(([, copy]) => isCutOffByDetent(copy, section)))) {
        raise();
      }
    };
    const resize = new ResizeObserver(check);
    let frame = 0;
    const observe = (): void => {
      resize.disconnect();
      resize.observe(section);
      for (const row of section.querySelectorAll('[data-slot=floating-panel-content] > *')) {
        resize.observe(row);
      }
      check();
    };
    // Lazy bodies and new rows mount after the sheet does; observe them once a frame at most.
    const mutations = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(observe);
    });
    mutations.observe(section, { childList: true, subtree: true });
    // A virtualized transcript settles at its end over a few scrolls after its rows mount; re-check as it goes.
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const scrolled = (): void => {
      scrollTimer ??= setTimeout(() => {
        scrollTimer = undefined;
        check();
      }, scrollCheckInterval);
    };
    section.addEventListener('scroll', scrolled, { capture: true, passive: true });
    observe();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(scrollTimer);
      section.removeEventListener('scroll', scrolled, { capture: true });
      resize.disconnect();
      mutations.disconnect();
    };
  }, [section, detent, raise]);
  return acknowledge;
}

/** The detents a decision can raise the sheet from; full has nowhere higher to go. */
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
function raisableDetent(point: number | string | null): 'half' | undefined {
  return point === mobileDrawerOpenSnapPoint ? 'half' : undefined;
}

/** A decision or unseen failure waiting in this project's chats, for the Chat destination (I5). */
function useChatCue(): MobileWorkbenchDestinationCue | undefined {
  const { projectId } = useProject();
  const row = useProjectSidebarRow(projectId);
  // The row counts the checkout conflict and settings issues too; the status line owns those (I4).
  const chatsNeedingYou = row.attention - (row.conflicted ? 1 : 0) - row.settings;
  if (chatsNeedingYou > 0) {
    return {
      tone: 'attention',
      description: chatsNeedingYou === 1 ? 'A chat needs you' : `${chatsNeedingYou} chats need you`,
    };
  }
  if (row.failed > 0) {
    return { tone: 'failed', description: row.failed === 1 ? 'A chat failed' : `${row.failed} chats failed` };
  }
  return undefined;
}

export const ChatInterfaceMobile = memo(function (): React.JSX.Element {
  const { activeTab, handleTabChange, drawerOpen, handleDrawerChange, snapPoints, activeSnapPoint, handleSnapChange } =
    useChatInterfaceState();
  const chatCue = useChatCue();
  const [viewerApi, setViewerApi] = useState<DockviewApi>();
  const [viewerFileActions, setViewerFileActions] = useState<ViewerFileActions>();
  const { viewRecords } = useProject();
  const viewerNames = useMemo(
    () => new Map([...viewRecords].map(([id, record]) => [id, viewName(record)])),
    [viewRecords],
  );
  const navigationRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<HTMLElement>();
  const attachSection = useCallback<React.RefCallback<HTMLElement>>((element) => {
    setSection(element ?? undefined);
  }, []);

  // React keeps the pane in one portal; only its host DOM node moves with the drawer's transient slot.
  const [terminalHost, setTerminalHost] = useState<HTMLDivElement>();
  const [terminalSlot, setTerminalSlot] = useState<HTMLDivElement>();
  const attachTerminalSlot = useCallback<React.RefCallback<HTMLDivElement>>((element) => {
    setTerminalSlot(element ?? undefined);
    if (element) {
      setTerminalHost((host) => {
        if (host) {
          return host;
        }
        const container = document.createElement('div');
        container.className = 'size-full';
        return container;
      });
    }
  }, []);
  useEffect(() => {
    if (!terminalHost || !terminalSlot) {
      return;
    }
    terminalSlot.append(terminalHost);
    return () => {
      terminalHost.remove();
    };
  }, [terminalHost, terminalSlot]);
  // The named Close asks a running Terminal first; hiding the sheet keeps the portal, and with it the session.
  const terminalCloseRequest = useRef<(() => boolean) | undefined>(undefined);
  const terminalCloseHost = useMemo<TerminalCloseHost>(
    () => ({
      close() {
        setTerminalHost(undefined);
        handleDrawerChange(false);
      },
      hide() {
        handleDrawerChange(false);
      },
      register(request) {
        terminalCloseRequest.current = request;
        return () => {
          if (terminalCloseRequest.current === request) {
            terminalCloseRequest.current = undefined;
          }
        };
      },
    }),
    [handleDrawerChange],
  );
  const closeTerminal = useCallback(
    (open: boolean) => {
      if (!open && !terminalCloseRequest.current?.()) {
        terminalCloseHost.close();
      }
    },
    [terminalCloseHost],
  );

  // A surface the person chooses takes focus; one restored from storage or opened by the app does not.
  const surfaceToFocus = useRef<MobilePanelId | undefined>(undefined);
  const chooseSurface = useCallback(
    (id: MobilePanelId) => {
      // Choosing the open surface changes nothing, so no focus is owed to a later, app-opened visit.
      const isUnchanged = id === activeTab && drawerOpen;
      surfaceToFocus.current = id === 'viewer' || isUnchanged ? undefined : id;
      handleTabChange(id);
    },
    [activeTab, drawerOpen, handleTabChange],
  );
  useEffect(() => {
    if (surfaceToFocus.current === activeTab && drawerOpen && section) {
      surfaceToFocus.current = undefined;
      section.focus({ preventScroll: true });
    }
  }, [activeTab, drawerOpen, section]);

  const raiseOneDetent = useCallback(() => {
    handleSnapChange(1);
  }, [handleSnapChange]);
  const acknowledgeDecisions = useRaiseWhenClipped(
    section,
    drawerOpen ? raisableDetent(activeSnapPoint) : undefined,
    raiseOneDetent,
  );
  const chooseSnapPoint = useCallback(
    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
    (value: number | string | null): void => {
      // The person moved the sheet (a drag or the grabber's keys): their detent holds over what is on screen now. Vaul's
      // reset after the sheet closes is not a move.
      if (drawerOpen) {
        acknowledgeDecisions();
      }
      handleSnapChange(value);
    },
    [acknowledgeDecisions, drawerOpen, handleSnapChange],
  );

  const isViewerTab = activeTab === 'viewer';
  const sheetHeight = snapPointLength(activeSnapPoint);

  return (
    <ChatInterfaceSessionGate fallback={<WorkspaceSkeleton />}>
      <div
        className={cn(
          // --nav-height is the height of the navigation tabs
          'absolute inset-0 flex size-full flex-col overflow-hidden',
          mobileWorkbenchNavigationHeight,
          'md:hidden', // Hidden on desktop
          // The workspace lands over the skeleton's background rather than snapping in.
          'animate-in duration-200 fade-in-50 motion-reduce:animate-none',
        )}
      >
        {/* W2 (D2, EQ2 = H1): the project's top bar — sidebar, title with status line, Share. */}
        <MobileProjectTopBar />
        {/* Main viewer - always visible. Its box changes size in one step: an animated size
          reallocates the canvas and every render target on each frame of the transition. */}
        <div
          className='relative min-h-0 flex-1'
          style={{
            paddingBottom: isViewerTab ? 'var(--nav-offset)' : `calc(${sheetHeight})`,
          }}
        >
          <ViewerDockview onApiChange={setViewerApi} onFileActionsChange={setViewerFileActions} />
          <ProjectManifestIssueBanner />

          {/* Renders the shared failure notice or WorkspaceUnavailableRecovery
            depending on which gate has failed. See Audit R8 for rationale. */}
          <ProjectUnavailableOverlay />
        </div>

        <Drawer
          handleOnly
          modal={false}
          open={drawerOpen}
          snapPoints={snapPoints}
          activeSnapPoint={activeSnapPoint}
          setActiveSnapPoint={chooseSnapPoint}
          onOpenChange={handleDrawerChange}
        >
          <DrawerTitle className='sr-only' id='drawer-title'>
            Chat Interface
          </DrawerTitle>
          <DrawerDescription className='sr-only' id='drawer-description'>
            Chat Interface - use navigation tabs to switch between panels
          </DrawerDescription>

          {/* This docked panel shares interaction with the viewer and persistent navigation. */}
          {drawerOpen ? (
            <DrawerContent
              ref={sheetRef}
              aria-labelledby='drawer-title'
              aria-describedby='drawer-description'
              className={cn(
                'flex-1 rounded-t-lg border-t bg-sidebar',
                'z-40', // Position below the navigation tabs
                // The drawer is portalled out of the shell, so it takes the nav's height variables itself.
                mobileWorkbenchNavigationHeight,
                //
                'data-[vaul-drawer-direction=bottom]:max-h-[100dvh]',
                'data-[vaul-drawer-direction=bottom]:mt-0',
                '[&_[data-slot=drawer-handle-indicator]]:bg-sidebar-primary/15',
              )}
              style={{
                height: '100%',
              }}
              onEscapeKeyDown={(event) => {
                if (isEditingTarget(event.target ?? undefined)) {
                  event.preventDefault();
                }
              }}
              onCloseAutoFocus={(event) => {
                // Closing returns focus to the nav's current destination (the Model), not to the page.
                event.preventDefault();
                const focused = document.activeElement;
                if (!focused || focused === document.body || sheetRef.current?.contains(focused)) {
                  navigationRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
                }
              }}
            >
              {/* The active surface, named by its title; the nav's destinations are buttons, not tabs. */}
              <section
                ref={attachSection}
                tabIndex={-1}
                aria-label={surfaceTitle(activeTab)}
                data-slot='mobile-surface'
                className={cn(
                  'flex h-full flex-col p-0 outline-none',
                  // While typing, the drawer is the frame above the keyboard and the panel fills it.
                  'group-data-[keyboard=open]/drawer-content:h-auto! group-data-[keyboard=open]/drawer-content:min-h-0 group-data-[keyboard=open]/drawer-content:flex-1',
                )}
                style={{
                  // The visible sheet less its grabber row, its 1px top border and the nav (with the home-indicator inset) over its foot.
                  height: `calc(${sheetHeight} - var(--drawer-handle-height) - var(--nav-offset) - 1px)`,
                }}
              >
                <div className='flex h-full flex-1 flex-col'>
                  {activeTab === 'terminal' ? (
                    <div ref={attachTerminalSlot} className='size-full' />
                  ) : (
                    <Suspense fallback={null}>
                      <MobileSurface id={activeTab} />
                    </Suspense>
                  )}
                </div>
              </section>
            </DrawerContent>
          ) : null}
        </Drawer>

        {terminalHost
          ? createPortal(
              <MobilePane id='terminal' onOpenChange={closeTerminal}>
                <TerminalCloseContext.Provider value={terminalCloseHost}>
                  <ProjectTerminalPane />
                </TerminalCloseContext.Provider>
              </MobilePane>,
              terminalHost,
            )
          : null}

        {/* Navigation tabs - Always visible and sticky to bottom */}
        <div
          ref={navigationRef}
          className={cn(
            'pointer-events-auto fixed right-0 bottom-0 left-0 z-50',
            // Safari pans the page to show a focused field, which would lift the nav over the composer.
            '[:root:has([data-slot=drawer-content][data-keyboard=open])_&]:hidden',
          )}
        >
          <ChatInterfaceNav
            activeTab={activeTab}
            chatCue={chatCue}
            viewerApi={viewerApi}
            viewerNames={viewerNames}
            fileActions={viewerFileActions}
            onTabChange={chooseSurface}
          />
        </div>
      </div>
    </ChatInterfaceSessionGate>
  );
});
