import { memo } from 'react';
import { ChatHistory } from '#routes/builds_.$id/chat-history.js';
import { ChatFileTree } from '#routes/builds_.$id/chat-file-tree.js';
import { ChatParameters } from '#routes/builds_.$id/chat-parameters.js';
import { ChatViewer } from '#routes/builds_.$id/chat-viewer.js';
import { ChatEditorLayout } from '#routes/builds_.$id/chat-editor-layout.js';
import { ChatViewerStatus } from '#routes/builds_.$id/chat-viewer-status.js';
import { ChatViewerControls } from '#routes/builds_.$id/chat-viewer-controls.js';
import { ChatStackTrace } from '#routes/builds_.$id/chat-stack-trace.js';
import { ChatDetails } from '#routes/builds_.$id/chat-details.js';
import { ChatConverter } from '#routes/builds_.$id/chat-converter.js';
import { cn } from '#utils/ui.utils.js';
import { ChatInterfaceNav } from '#routes/builds_.$id/chat-interface-nav.js';
import { Tabs, TabsContent } from '#components/ui/tabs.js';
import { ChatInterfaceStatus } from '#routes/builds_.$id/chat-interface-status.js';
import { useChatInterfaceState } from '#routes/builds_.$id/use-chat-interface-state.js';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '#components/ui/drawer.js';

export const ChatInterfaceMobile = memo(function (): React.JSX.Element {
  const { activeTab, handleTabChange, drawerOpen, handleDrawerChange, snapPoints, activeSnapPoint, handleSnapChange } =
    useChatInterfaceState();

  const isModelTab = activeTab === 'model';

  return (
    <div className={cn('absolute inset-0 size-full', '[--nav-height:calc(var(--spacing)*10)]', 'md:hidden')}>
      {/* Main viewer - always visible */}
      <div
        className="relative h-full transition-all duration-200 ease-linear"
        style={{
          paddingBottom: isModelTab ? '0' : `calc(${Number(activeSnapPoint) - 0.07} * 100dvh)`,
        }}
      >
        <ChatViewer />

        {/* Gizmo Container - Static container for the gizmo to ensure it shares the same containing block as the anchor */}
        <div
          id="viewport-gizmo-container"
          className={cn('absolute right-0 bottom-18', isModelTab ? 'bottom-18' : 'hidden')}
        />

        {/* Top Content - Stack trace */}
        <div
          className={cn(
            'absolute top-(--header-height) right-2 left-2',
            isModelTab || !drawerOpen ? 'block' : 'hidden',
          )}
        >
          <ChatStackTrace />
        </div>

        {/* Centered Content - Status indicators */}
        <div
          className={cn(
            'absolute',
            'left-1/2',
            '-translate-x-1/2',
            'top-[calc(var(--header-height)+var(--spacing)*4)]',
            'z-50',
          )}
        >
          <ChatViewerStatus />
          <ChatInterfaceStatus />
        </div>

        {/* Bottom-left Content - Viewer controls (only visible on model tab) */}
        <div
          className={cn(
            'pointer-events-auto absolute bottom-[calc(var(--nav-height)+var(--spacing)*2)] left-0 z-10 flex w-full flex-row justify-between gap-2 px-2',
            isModelTab ? 'flex' : 'hidden',
          )}
        >
          <ChatViewerControls />
        </div>
      </div>

      <Drawer
        handleOnly
        open={drawerOpen}
        snapPoints={snapPoints}
        activeSnapPoint={activeSnapPoint}
        setActiveSnapPoint={handleSnapChange}
        modal={false}
        onOpenChange={handleDrawerChange}
      >
        <DrawerTitle className="sr-only" id="drawer-title">
          Chat Interface
        </DrawerTitle>
        <DrawerDescription className="sr-only" id="drawer-description">
          Chat Interface - use navigation tabs to switch between panels
        </DrawerDescription>

        {/* Drawer for content panels */}
        <DrawerContent
          aria-labelledby="drawer-title"
          aria-describedby="drawer-description"
          className={cn(
            'flex-1 rounded-t-lg border-t bg-sidebar',
            //
            'data-[vaul-drawer-direction=bottom]:max-h-[94vh]!',
            'data-[vaul-drawer-direction=bottom]:mt-0',
            '[&_[data-slot=drawer-handle-indicator]]:bg-sidebar-primary/15',
          )}
          style={{
            // Height: isModelTab ? '100dvh' : `calc(${Number(activeSnapPoint) - 0.06} * 100dvh)`,
            height: '100%',
          }}
        >
          {/* Tab contents */}
          <Tabs
            value={activeTab}
            className="flex h-full flex-col pb-13"
            style={{
              height: isModelTab ? '100dvh' : `calc(${Number(activeSnapPoint) - 0.05} * 100dvh)`,
            }}
            onValueChange={handleTabChange}
          >
            <TabsContent enableAnimation={false} value="chat" className="flex h-full flex-col">
              <ChatHistory />
            </TabsContent>
            <TabsContent enableAnimation={false} value="files" className="flex h-full flex-col">
              <ChatFileTree />
            </TabsContent>
            <TabsContent enableAnimation={false} value="parameters" className="flex h-full flex-col">
              <ChatParameters />
            </TabsContent>
            <TabsContent enableAnimation={false} value="model" className="flex h-full flex-col" />
            <TabsContent enableAnimation={false} value="editor" className="flex h-full flex-col">
              <ChatEditorLayout />
            </TabsContent>
            <TabsContent enableAnimation={false} value="details" className="flex h-full flex-col">
              <ChatDetails />
            </TabsContent>
            <TabsContent enableAnimation={false} value="converter" className="flex h-full flex-col">
              <ChatConverter />
            </TabsContent>
          </Tabs>
        </DrawerContent>
      </Drawer>

      {/* Navigation tabs - Always visible and sticky to bottom */}
      <div className={cn('pointer-events-auto fixed right-0 bottom-0 left-0 z-60')}>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <ChatInterfaceNav className="h-(--nav-height)" />
        </Tabs>
      </div>
    </div>
  );
});
