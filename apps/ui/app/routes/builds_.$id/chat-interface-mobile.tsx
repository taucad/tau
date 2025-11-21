import { memo } from 'react';
import { Eye, EyeClosed } from 'lucide-react';
import { ChatHistory } from '#routes/builds_.$id/chat-history.js';
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
import { Tabs, TabsContents, TabsContent } from '#components/ui/tabs.js';
import { Button } from '#components/ui/button.js';
import { ChatInterfaceStatus } from '#routes/builds_.$id/chat-interface-status.js';
import { useChatInterfaceState } from '#routes/builds_.$id/use-chat-interface-state.js';

export const ChatInterfaceMobile = memo(function (): React.JSX.Element {
  const { activeTab, handleTabChange, isFullHeightPanel, toggleFullHeightPanel } = useChatInterfaceState();

  return (
    <Tabs
      className={cn(
        'group/chat-tabs absolute inset-0 size-full gap-0',
        '[--nav-height:calc(var(--spacing)*9)]',
        'md:hidden',
        '[--full-panel-collapsed:40dvh]',
      )}
      value={activeTab}
      data-active-tab={activeTab}
      data-full-height-panel={isFullHeightPanel}
      onValueChange={handleTabChange}
    >
      <div
        // Position the model tab content absolutely to the top of the header height.
        className={cn(
          'relative size-full',
          'pb-0',
          'group-data-[full-height-panel=true]/chat-tabs:pb-[calc(100dvh-var(--full-panel-collapsed))]',
          'group-data-[active-tab=model]/chat-tabs:pb-0!',
        )}
      >
        {/* Main viewer */}
        <ChatViewer />

        {/* Gizmo Container - Static container for the gizmo to ensure it shares the same containing block as the anchor */}
        <div id="viewport-gizmo-container" className="absolute right-0 bottom-18" />

        {/* Top-left Content */}
        <div className="absolute top-(--header-height) right-2 left-2 hidden group-data-[active-tab=model]/chat-tabs:block group-data-[full-height-panel=true]/chat-tabs:block">
          <ChatStackTrace />
        </div>

        {/* Centered Content */}
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

        {/* Bottom-left Content */}
        <div
          className={cn(
            'pointer-events-auto absolute bottom-11 left-0 z-10 flex w-full flex-row justify-between gap-2 px-2',
            'hidden group-data-[active-tab=model]/chat-tabs:flex',
            'group-data-[full-height-panel=false]/chat-tabs:hidden',
          )}
        >
          <ChatViewerControls />
        </div>
      </div>
      <div className="absolute right-0 bottom-0 left-0 z-20 flex w-full flex-row items-center justify-between gap-2 px-2 pt-0">
        <ChatInterfaceNav className="h-(--nav-height)" />
        <Button
          size="icon"
          variant="overlay"
          className="size-9 rounded-full bg-sidebar shadow-none [&_svg]:size-5! [&_svg]:stroke-[1.5] [&_svg]:text-muted-foreground"
          onClick={toggleFullHeightPanel}
        >
          <EyeClosed className="group-data-[full-height-panel=true]/chat-tabs:hidden" />
          <Eye className="group-data-[full-height-panel=false]/chat-tabs:hidden" />
        </Button>
      </div>
      <TabsContents
        className={cn(
          'absolute inset-0',
          'size-full!',

          // Disable pointer events for the tabs contents so the user can interact with the viewer when height is half.
          'pointer-events-none',

          // Full height panel effect - toggle between half and full height.
          'pt-(--header-height)',
          'group-data-[full-height-panel=true]/chat-tabs:pt-(--full-panel-collapsed)',
          'transition-[padding-top] duration-200 ease-in-out',

          // Make only the top of the floating panel rounded.
          '[&_[data-slot=floating-panel]]:rounded-t-lg',
          '[&_[data-slot=floating-panel]]:border-t',
          '[&_[data-slot=floating-panel]]:pointer-events-auto',

          // Make sure the content is padded to the bottom of the floating panel.
          '[&_[data-slot=floating-panel-content]]:transition-none',
          '[&_[data-slot=floating-panel-content]]:pb-9',

          // Hide the floating panel trigger.
          '[&_[data-slot=floating-panel-trigger]]:hidden',
          '[&_[data-slot=floating-panel-content-header]]:px-3',

          // Make sure the tabs content is full height to allow the floating panel to be full height.
          '[&_[data-slot=tabs-content]]:h-full',

          // Model tab takes full height with floating panel effect.
          'group-data-[active-tab=model]/chat-tabs:border-t-0',
        )}
      >
        <TabsContent enableAnimation={false} value="chat">
          <ChatHistory />
        </TabsContent>
        <TabsContent enableAnimation={false} value="parameters">
          <ChatParameters />
        </TabsContent>
        <TabsContent enableAnimation={false} value="model" className="pointer-events-none size-full" />
        <TabsContent enableAnimation={false} value="editor">
          <ChatEditorLayout />
        </TabsContent>
        <TabsContent enableAnimation={false} value="details">
          <ChatDetails />
        </TabsContent>
        <TabsContent enableAnimation={false} value="converter">
          <ChatConverter />
        </TabsContent>
      </TabsContents>
    </Tabs>
  );
});
