import { memo } from 'react';
import { ChatHistory } from '#routes/w.$workspace.$project/chat-history.js';
import { ChatFileTree } from '#routes/w.$workspace.$project/chat-file-tree.js';
import { ChatParameters } from '#routes/w.$workspace.$project/chat-parameters.js';
import { ChatEditorLayout } from '#routes/w.$workspace.$project/chat-editor-layout.js';
import { ChatDetails } from '#routes/w.$workspace.$project/chat-details.js';
import { ChatConverter } from '#routes/w.$workspace.$project/chat-converter.js';
import { ProjectShareWorkbenchPanel } from '#routes/w.$workspace.$project/project-share-action.js';
import { ChatRevisions } from '#routes/w.$workspace.$project/chat-revisions.js';
import { ProjectUnavailableOverlay } from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
import { ProjectManifestIssueBanner } from '#routes/w.$workspace.$project/project-manifest-issue-banner.js';
import { cn } from '@taucad/ui/utils/cn';
import { ChatInterfaceNav } from '#routes/w.$workspace.$project/chat-interface-nav.js';
import { Tabs, TabsContent } from '@taucad/ui/components/tabs';
import { useChatInterfaceState } from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@taucad/ui/components/drawer';
import { ChatHistoryGate, ChatInterfaceSessionGate } from '#routes/w.$workspace.$project/focused-chat-gate.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';

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
          '[--nav-height:calc(var(--spacing)*11)]', // 10 units of spacing
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
            paddingBottom: isViewerTab ? 'var(--nav-height)' : `calc(${Number(activeSnapPoint)} * 100dvh)`,
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
                //
                'data-[vaul-drawer-direction=bottom]:max-h-[100dvh]',
                'data-[vaul-drawer-direction=bottom]:mt-0',
                '[&_[data-slot=drawer-handle-indicator]]:bg-sidebar-primary/15',
              )}
              style={{
                height: '100%',
              }}
            >
              {/* Tab contents */}
              <Tabs
                value={activeTab}
                className={cn(
                  'flex h-full flex-col p-0',
                  // While typing, the drawer is the frame above the keyboard and the panel fills it.
                  'group-data-[keyboard=open]/drawer-content:h-auto! group-data-[keyboard=open]/drawer-content:min-h-0 group-data-[keyboard=open]/drawer-content:flex-1',
                )}
                style={{
                  height: isViewerTab ? '100dvh' : `calc(${Number(activeSnapPoint)} * 100dvh - var(--spacing)*12)`,
                }}
                onValueChange={handleTabChange}
              >
                <TabsContent enableAnimation={false} value='chat' className='flex h-full flex-col'>
                  <ChatHistoryGate>
                    <ChatHistory />
                  </ChatHistoryGate>
                </TabsContent>
                <TabsContent enableAnimation={false} value='files' className='flex h-full flex-col'>
                  <ChatFileTree />
                </TabsContent>
                <TabsContent enableAnimation={false} value='parameters' className='flex h-full flex-col'>
                  <ChatParameters />
                </TabsContent>
                <TabsContent enableAnimation={false} value='viewer' className='flex h-full flex-col' />
                <TabsContent enableAnimation={false} value='editor' className='flex h-full flex-col'>
                  <ChatEditorLayout />
                </TabsContent>
                <TabsContent enableAnimation={false} value='details' className='flex h-full flex-col'>
                  <ChatDetails />
                </TabsContent>
                <TabsContent enableAnimation={false} value='converter' className='flex h-full flex-col'>
                  <ChatConverter />
                </TabsContent>
                <TabsContent enableAnimation={false} value='share' className='flex h-full flex-col'>
                  <ProjectShareWorkbenchPanel />
                </TabsContent>
                <TabsContent enableAnimation={false} value='revisions' className='flex h-full flex-col'>
                  {/* The pane's own title and Close, as every other panel here (L3-F15). */}
                  <ChatRevisions />
                </TabsContent>
              </Tabs>
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
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <ChatInterfaceNav className='h-(--nav-height)' />
          </Tabs>
        </div>
      </div>
    </ChatInterfaceSessionGate>
  );
});
