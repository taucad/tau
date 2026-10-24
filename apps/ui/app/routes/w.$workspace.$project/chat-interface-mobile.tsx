import { lazy, memo, Suspense } from 'react';
import { ChatHistory } from '#routes/w.$workspace.$project/chat-history.js';
import { ProjectUnavailableOverlay } from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
import { ProjectManifestIssueBanner } from '#routes/w.$workspace.$project/project-manifest-issue-banner.js';
import { cn } from '@taucad/ui/utils/cn';
import { ChatInterfaceNav, surfaceTitle } from '#routes/w.$workspace.$project/chat-interface-nav.js';
import { mobileWorkbenchNavigationHeight } from '#components/mobile-workbench-navigation.js';
import type { MobilePanelId } from '#constants/editor.constants.js';
import { useChatInterfaceState } from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@taucad/ui/components/drawer';
import { ChatHistoryGate, ChatInterfaceSessionGate } from '#routes/w.$workspace.$project/focused-chat-gate.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';

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
      return <ProjectShareWorkbenchPanel />;
    }
    case 'revisions': {
      // The pane's own title and Close, as every other panel here (L3-F15).
      return <ChatRevisions />;
    }
    case 'viewer': {
      return null;
    }
  }
}

export const ChatInterfaceMobile = memo(function (): React.JSX.Element {
  const { activeTab, handleTabChange, drawerOpen, handleDrawerChange, snapPoints, activeSnapPoint, handleSnapChange } =
    useChatInterfaceState();

  const isViewerTab = activeTab === 'viewer';

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
            paddingBottom: isViewerTab ? 'var(--nav-offset)' : `calc(${Number(activeSnapPoint)} * 100dvh)`,
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
            >
              {/* The active surface, named by its title; the nav's destinations are buttons, not tabs. */}
              <section
                aria-label={surfaceTitle(activeTab)}
                data-slot='mobile-surface'
                className={cn(
                  'flex h-full flex-col p-0',
                  // While typing, the drawer is the frame above the keyboard and the panel fills it.
                  'group-data-[keyboard=open]/drawer-content:h-auto! group-data-[keyboard=open]/drawer-content:min-h-0 group-data-[keyboard=open]/drawer-content:flex-1',
                )}
                style={{
                  // The visible sheet less its grabber row, its 1px top border and the nav (with the home-indicator inset) over its foot.
                  height: `calc(${Number(activeSnapPoint)} * 100dvh - var(--drawer-handle-height) - var(--nav-offset) - 1px)`,
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
          className={cn(
            'pointer-events-auto fixed right-0 bottom-0 left-0 z-50',
            // Safari pans the page to show a focused field, which would lift the nav over the composer.
            '[:root:has([data-slot=drawer-content][data-keyboard=open])_&]:hidden',
          )}
        >
          <ChatInterfaceNav activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
      </div>
    </ChatInterfaceSessionGate>
  );
});
