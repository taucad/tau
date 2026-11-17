import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DockviewApi } from 'dockview-react';
import { LayoutPriority } from 'allotment';
import type { AllotmentHandle } from 'allotment';
import { Allotment } from '#components/panes/allotment.js';
import { useSelector } from '@xstate/react';
import { ChatHistory } from '#routes/w.$workspace.$project/chat-history.js';
import { ChatHistoryGate, ChatInterfaceSessionGate } from '#routes/w.$workspace.$project/focused-chat-gate.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { getWorkbenchTabIcon, WorkbenchDockview } from '#routes/w.$workspace.$project/chat-workbench-dockview.js';
import { WorkbenchToggle } from '#routes/w.$workspace.$project/workbench-toggle.js';
import { ProjectUnavailableOverlay } from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
import { ProjectManifestIssueBanner } from '#routes/w.$workspace.$project/project-manifest-issue-banner.js';
import { WorkspaceOpening } from '#routes/w.$workspace.$project/workspace-frame.js';
import { handOffRevealContext } from '#components/hand-off/hand-off-store.js';
import { frameHintKey, writeWideFrameHint } from '#lib/frame-hint.js';
import { ChatContextInsertionProvider } from '@taucad/chat-ui/components/chat-context-insertion';
import { useSidebar } from '#components/ui/sidebar.js';
import { useProject } from '#hooks/use-project.js';
import {
  resolveCompactAuxiliary,
  useProjectWorkspace,
  WorkspaceLanesContext,
  WorkspaceLayoutReadyContext,
} from '#routes/w.$workspace.$project/project-workspace-context.js';
import {
  panelMinSizeChat,
  panelMinSizeViewer,
  panelMinSizeViewerTight,
  panelMinSizeWorkbench,
  tightWorkspaceWidth,
} from '@taucad/ui-core/constants/editor.constants';
import { cn } from '@taucad/ui/utils/cn';

export const compactWorkspaceWidth = 1120;

/**
 * Reserve the titlebar-controls width in front of the top-left group's tab
 * bar only: a group inside any non-first `.dv-view` sits below or right of
 * another one. A `::before` flex item rather than padding so the tab bar's
 * bottom border, which the children draw, continues under the controls.
 *
 * The inset stops one spacing step short because the chat lane toggle leads
 * the tab bar with `pl-1`: the toggle then lands on the pixel it holds at the
 * head of the chat pane header, which starts at the full controls width.
 */
const topLeftTabBarInset = [
  "[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:content-['']",
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:w-[calc(var(--titlebar-controls-width)-var(--spacing))]',
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:shrink-0',
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:border-b',
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:border-b-border',
].join(' ');

export const ChatInterfaceDesktop = memo(function (): React.JSX.Element {
  const { editorRef } = useProject();
  const { open: sidebarOpen } = useSidebar();
  const { setChatOpen, setWorkbenchOpen } = useProjectWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState<boolean>();
  /* Too narrow for a lane beside the full viewer minimum: the viewer's minimum drops so the lanes fit (D12). */
  const [isTight, setIsTight] = useState(false);
  const isClient = isCompact !== undefined;
  const [workbenchApi, setWorkbenchApi] = useState<DockviewApi>();
  const isEditorReady = useSelector(editorRef, (state) => state.matches('ready'));
  const desktopLayout = useSelector(editorRef, (state) => state.context.panelState.desktopLayout);
  const compactAuxiliary = isCompact ? resolveCompactAuxiliary(desktopLayout) : undefined;
  const chatVisible = desktopLayout.chatOpen && (!isCompact || compactAuxiliary === 'chat');
  const workbenchVisible = desktopLayout.workbenchOpen && (!isCompact || compactAuxiliary === 'workbench');
  const lanes = useMemo(() => ({ chat: chatVisible, workbench: workbenchVisible }), [chatVisible, workbenchVisible]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    // Resolve the initial lanes before mounting their layout engines. Pixel
    // changes within the same mode must not rerender the workspace subtree.
    const initialWidth = container.getBoundingClientRect().width;
    let compact = initialWidth < compactWorkspaceWidth;
    let tight = initialWidth < tightWorkspaceWidth;
    setIsCompact(compact);
    setIsTight(tight);
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const nextCompact = entry.contentRect.width < compactWorkspaceWidth;
      const nextTight = entry.contentRect.width < tightWorkspaceWidth;
      if (nextCompact === compact && nextTight === tight) {
        return;
      }
      compact = nextCompact;
      tight = nextTight;
      // ResizeObserver runs before paint; commit the lane change in that same
      // delivery instead of letting concurrent React show an intermediate mode.
      flushSync(() => {
        setIsCompact(nextCompact);
        setIsTight(nextTight);
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  /* Allotment observes its container only after its first paint and adds its panes on the render that
   * observation triggers, so its first frames have panes at their content's width (U8: 1, 17 and 16 px).
   * Until the first layout with real pane sizes, which Allotment reports from a layout effect, its panes
   * are not rendered (`content-visibility: hidden`) and the workspace frame's lanes show beneath at the
   * same boxes. The commit that reveals the panes marks the workspace ready, which hides the frame's
   * lanes, so each frame draws one set of lanes (A15b). */
  const [areLanesLaidOut, setAreLanesLaidOut] = useState(false);
  const handleLanesChange = useCallback((sizes: readonly number[]) => {
    if (sizes.some((size) => size > 0)) {
      setAreLanesLaidOut(true);
    }
  }, []);

  /* A composer focus asked for by the navigation (`focusChatComposer`) runs when the chat lane mounts, while the panes
   * are still unrendered and cannot take focus. It is given again in the commit that reveals them. */
  const focusAtMountRef = useRef<Element | undefined>(undefined);
  useLayoutEffect(() => {
    focusAtMountRef.current = document.activeElement ?? undefined;
  }, []);
  useLayoutEffect(() => {
    const state = globalThis.history.state as { usr?: { focusChatComposer?: unknown } } | undefined;
    if (!areLanesLaidOut || state?.usr?.focusChatComposer !== true) {
      return;
    }
    /* Only if nothing has taken focus since the workspace mounted (the control that navigated may still hold it). */
    const active = document.activeElement ?? undefined;
    if (active !== focusAtMountRef.current && active !== document.body && active !== undefined) {
      return;
    }
    containerRef.current
      ?.querySelector<HTMLElement>(
        '[aria-label="Ask Tau to build anything..."][contenteditable="true"], textarea[aria-label="Chat message"]',
      )
      ?.focus();
  }, [areLanesLaidOut]);

  /* Allotment sizes the panes it adds at their preferred widths before it applies `visible`, so a
   * hidden workbench still takes its width on the first layout and squeezes the chat lane to its
   * minimum (280 px rather than 320 px at a 1056 px workspace). Once that first layout lands, the chat
   * lane gets its preferred width back from the viewer, in the same commit that reveals the panes. */
  const lanesRef = useRef<AllotmentHandle>(null);
  useLayoutEffect(() => {
    if (!areLanesLaidOut || !chatVisible) {
      return;
    }
    const views = containerRef.current?.querySelector('.split-view-container')?.children;
    if (views?.length !== 3) {
      return;
    }
    const sizes = Array.from(views, (view) => view.getBoundingClientRect().width);
    const [chat = 0, viewer = 0, workbench = 0] = sizes;
    const missing = desktopLayout.chatWidth - chat;
    const viewerMinimum = isTight ? panelMinSizeViewerTight : panelMinSizeViewer;
    if (missing > 0 && viewer - missing >= viewerMinimum) {
      lanesRef.current?.resize([desktopLayout.chatWidth, viewer - missing, workbench]);
    }
    // Only the first layout: later widths are the person's own, and persisted on drag end.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the lanes first lay out
  }, [areLanesLaidOut]);

  /* The frame hint mirrors the layout the editor machine holds, so the next load of this project draws its lanes
   * where they are now (A15b). Only once the editor state has loaded: before that the layout is the default. */
  useLayoutEffect(() => {
    const hintKey = frameHintKey(globalThis.location.pathname);
    if (isEditorReady && hintKey !== undefined) {
      writeWideFrameHint(hintKey, desktopLayout);
    }
  }, [isEditorReady, desktopLayout]);

  const persistWidths = useCallback(
    (sizes: readonly number[]) => {
      const chatWidth = sizes[0];
      const workbenchWidth = sizes[2];
      editorRef.send({
        type: 'setPanelState',
        panelState: {
          desktopLayout: {
            ...(chatWidth !== undefined && chatWidth > 0 ? { chatWidth } : {}),
            ...(workbenchWidth !== undefined && workbenchWidth > 0 ? { workbenchWidth } : {}),
          },
        },
      });
    },
    [editorRef],
  );

  const areLanesReady = isClient && isEditorReady && areLanesLaidOut;

  return (
    <ChatContextInsertionProvider>
      <WorkspaceLanesContext.Provider value={lanes}>
        <div
          ref={containerRef}
          /* No background of its own: the workspace frame behind it draws the window's background and the lanes. */
          className='relative size-full overflow-hidden'
          data-project-workspace
          data-compact={isCompact}
          data-workspace-lanes={areLanesReady ? 'ready' : undefined}
          /* Once laid out, whether the live chat lane is shown: where it is not, the frame's composer box, which stays
           * until a composer adopts its input, hides and keeps the text (PL6). */
          data-chat-lane={areLanesReady ? (chatVisible ? 'shown' : 'hidden') : undefined}
        >
          {isClient && isEditorReady ? (
            <div className='absolute top-1 right-1 z-10 flex gap-1'>
              <WorkbenchToggle
                isOpen={workbenchVisible}
                api={workbenchApi}
                getIcon={getWorkbenchTabIcon}
                onOpenChange={setWorkbenchOpen}
              />
            </div>
          ) : null}
          {/* Until the editor state has loaded and the focused chat exists, this
              draws nothing: the workspace frame's lanes show beneath. */}
          {/* The composer adopts the frame's native input (PL6) in the commit that reveals the panes: before it they
              are unrendered, and the frame's input is the one to type in. */}
          {/* Layout-ready: the panes mount what sizes itself once (the viewer's canvas) only at their settled boxes. */}
          <WorkspaceLayoutReadyContext.Provider value={areLanesLaidOut}>
            <handOffRevealContext.Provider value={areLanesReady}>
              <ChatInterfaceSessionGate fallback={<WorkspaceOpening />}>
                {isClient && isEditorReady ? (
                  <Allotment
                    ref={lanesRef}
                    paneLabels={['Chat', 'Viewer', 'Workbench']}
                    separator={false}
                    proportionalLayout={false}
                    /* No entrance: the panes take the frame's boxes in place (U9). */
                    className={cn(
                      'size-full [&_.split-view-view:not(:last-child)]:border-r [&_.split-view-view:not(:last-child)]:border-border',
                      !areLanesLaidOut && '[&_.split-view-container]:[content-visibility:hidden]',
                    )}
                    onChange={handleLanesChange}
                    onDragEnd={persistWidths}
                  >
                    <Allotment.Pane
                      key='chat'
                      minSize={panelMinSizeChat}
                      preferredSize={desktopLayout.chatWidth}
                      priority={LayoutPriority.Low}
                      visible={chatVisible}
                    >
                      <ChatHistoryGate>
                        <ChatHistory
                          /* The chat lane toggle leads the header on the pixel it holds at the head of the
                       viewer's tab bar while the lane is closed: one step in from the lane's edge, or
                       straight after the host's controls. */
                          className={cn(
                            sidebarOpen
                              ? '[&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:pl-1'
                              : '[&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:pl-(--titlebar-controls-width) [&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:[app-region:no-drag]',
                          )}
                          isExpanded={desktopLayout.chatOpen}
                          setIsExpanded={(value) => {
                            setChatOpen(typeof value === 'function' ? value(desktopLayout.chatOpen) : value);
                          }}
                        />
                      </ChatHistoryGate>
                    </Allotment.Pane>

                    <Allotment.Pane
                      key='viewer'
                      minSize={isTight ? panelMinSizeViewerTight : panelMinSizeViewer}
                      priority={LayoutPriority.High}
                    >
                      <div
                        className={cn(
                          '@container/viewer relative size-full overflow-hidden',
                          !sidebarOpen && !chatVisible && topLeftTabBarInset,
                        )}
                      >
                        <ViewerDockview />
                        <ProjectManifestIssueBanner />
                        <ProjectUnavailableOverlay />
                      </div>
                    </Allotment.Pane>

                    <Allotment.Pane
                      key='workbench'
                      minSize={panelMinSizeWorkbench}
                      preferredSize={desktopLayout.workbenchWidth}
                      priority={LayoutPriority.Low}
                      visible={workbenchVisible}
                    >
                      <WorkbenchDockview onApiChange={setWorkbenchApi} />
                    </Allotment.Pane>
                  </Allotment>
                ) : (
                  <WorkspaceOpening />
                )}
              </ChatInterfaceSessionGate>
            </handOffRevealContext.Provider>
          </WorkspaceLayoutReadyContext.Provider>
        </div>
      </WorkspaceLanesContext.Provider>
    </ChatContextInsertionProvider>
  );
});
