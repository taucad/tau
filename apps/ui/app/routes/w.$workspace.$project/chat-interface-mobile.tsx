import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
import { ChatHistory } from '#routes/w.$workspace.$project/chat-history.js';
import { ProjectUnavailableOverlay } from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
import { ProjectManifestIssueBanner } from '#routes/w.$workspace.$project/project-manifest-issue-banner.js';
import { cn } from '@taucad/ui/utils/cn';
import { ChatInterfaceNav, surfaceTitle } from '#routes/w.$workspace.$project/chat-interface-nav.js';
import { mobileWorkbenchNavigationHeight } from '#components/mobile-workbench-navigation.js';
import type { MobileWorkbenchDestinationCue } from '#components/mobile-workbench-navigation.js';
import { mobileDrawerOpenSnapPoint, mobileDrawerPeekSnapPoint } from '#constants/editor.constants.js';
import type { MobilePanelId } from '#constants/editor.constants.js';
import { useChatInterfaceState } from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
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

/* B-27, D-UI-16: every panel but the chat is its own chunk, loaded when its surface
 * first opens. Only the active surface is mounted, so a phone that
 * stays on the chat never downloads the editor (Monaco and the dockview
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

/** A Workbench pane in the sheet: its title, a named Close, then the body the desktop pane renders (D4). */
function MobilePane({
  id,
  children,
}: {
  readonly id: MobilePanelId;
  readonly children: React.ReactNode;
}): React.ReactNode {
  const title = surfaceTitle(id);
  return (
    <FloatingPanel isOpen side='right'>
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
      // The share body has no header of its own; on a phone it gets the title and Close every pane has (PN-SHR-1).
      return (
        <MobilePane id={id}>
          <ProjectShareWorkbenchPanel />
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
  return target instanceof HTMLTextAreaElement || target.isContentEditable || target.closest('.monaco-editor') !== null;
}

/**
 * Never fold away a decision (I5): at the peek, a surface whose fixed rows (a title, a composer with an approval or a
 * question above it) no longer fit is raised to half height instead of being clipped under the nav.
 */
function useRaiseWhenClipped(section: HTMLElement | undefined, isAtPeek: boolean, raise: () => void): void {
  useEffect(() => {
    if (!section || !isAtPeek || typeof ResizeObserver === 'undefined') {
      return;
    }
    const check = (): void => {
      for (const panel of section.querySelectorAll<HTMLElement>('[data-slot=floating-panel-content]')) {
        if (panel.scrollHeight > panel.clientHeight + 1) {
          raise();
          return;
        }
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
    observe();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [section, isAtPeek, raise]);
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
  const navigationRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<HTMLElement>();
  const attachSection = useCallback<React.RefCallback<HTMLElement>>((element) => {
    setSection(element ?? undefined);
  }, []);

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

  const raiseFromPeek = useCallback(() => {
    handleSnapChange(mobileDrawerOpenSnapPoint);
  }, [handleSnapChange]);
  useRaiseWhenClipped(section, drawerOpen && activeSnapPoint === mobileDrawerPeekSnapPoint, raiseFromPeek);

  const isViewerTab = activeTab === 'viewer';
  const sheetHeight = snapPointLength(activeSnapPoint);

  return (
    <ChatInterfaceSessionGate fallback={<WorkspaceSkeleton />}>
      <div
        className={cn(
          // --nav-height is the height of the navigation tabs
          'absolute inset-0 size-full',
          mobileWorkbenchNavigationHeight,
          'md:hidden', // Hidden on desktop
          // The workspace lands over the skeleton's background rather than snapping in.
          'animate-in duration-200 fade-in-50 motion-reduce:animate-none',
        )}
      >
        {/* Main viewer - always visible. Its box changes size in one step: an animated size
          reallocates the canvas and every render target on each frame of the transition. */}
        <div
          className='relative h-full'
          style={{
            paddingBottom: isViewerTab ? 'var(--nav-offset)' : `calc(${sheetHeight})`,
          }}
        >
          <ViewerDockview />
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
          setActiveSnapPoint={handleSnapChange}
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
                  <Suspense fallback={null}>
                    <MobileSurface id={activeTab} />
                  </Suspense>
                </div>
              </section>
            </DrawerContent>
          ) : null}
        </Drawer>

        {/* Navigation tabs - Always visible and sticky to bottom */}
        <div
          ref={navigationRef}
          className={cn(
            'pointer-events-auto fixed right-0 bottom-0 left-0 z-50',
            // Safari pans the page to show a focused field, which would lift the nav over the composer.
            '[:root:has([data-slot=drawer-content][data-keyboard=open])_&]:hidden',
          )}
        >
          <ChatInterfaceNav activeTab={activeTab} chatCue={chatCue} onTabChange={chooseSurface} />
        </div>
      </div>
    </ChatInterfaceSessionGate>
  );
});
