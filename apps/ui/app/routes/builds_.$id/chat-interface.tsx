import { memo } from 'react';
import { Eye, EyeClosed } from 'lucide-react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { ChatHistory, ChatHistoryTrigger } from '#routes/builds_.$id/chat-history.js';
import { ChatParameters, ChatParametersTrigger } from '#routes/builds_.$id/chat-parameters.js';
import { useViewContext } from '#routes/builds_.$id/chat-interface-view-context.js';
import { cookieName } from '#constants/cookie.constants.js';
import { ChatViewer } from '#routes/builds_.$id/chat-viewer.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { ChatEditorLayout, ChatEditorLayoutTrigger } from '#routes/builds_.$id/chat-editor-layout.js';
import { ChatViewerStatus } from '#routes/builds_.$id/chat-viewer-status.js';
import { ChatViewerControls } from '#routes/builds_.$id/chat-viewer-controls.js';
import { ChatStackTrace } from '#routes/builds_.$id/chat-stack-trace.js';
import { ChatExplorerTree, ChatExplorerTrigger } from '#routes/builds_.$id/chat-explorer.js';
import { ChatDetails, ChatDetailsTrigger } from '#routes/builds_.$id/chat-details.js';
import { ChatConverter, ChatConverterTrigger } from '#routes/builds_.$id/chat-converter.js';
import { ChatGit, ChatGitTrigger } from '#routes/builds_.$id/chat-git.js';
import { cn } from '#utils/ui.utils.js';
import { useCookie } from '#hooks/use-cookie.js';
import type { chatTabs } from '#routes/builds_.$id/chat-interface-nav.js';
import { ChatInterfaceNav } from '#routes/builds_.$id/chat-interface-nav.js';
import { Tabs, TabsContents, TabsContent } from '#components/ui/tabs.js';
import { Button } from '#components/ui/button.js';
import { ChatInterfaceStatus } from '#routes/builds_.$id/chat-interface-status.js';
import { ChatInterfaceGraphics } from '#routes/builds_.$id/chat-interface-graphics.js';
import { isBrowser } from '#constants/browser.constants.js';

export const ChatInterface = memo(function (): React.JSX.Element {
  const {
    isChatOpen,
    setIsChatOpen,
    isParametersOpen,
    setIsParametersOpen,
    isEditorOpen,
    setIsEditorOpen,
    isExplorerOpen,
    setIsExplorerOpen,
    isConverterOpen,
    setIsConverterOpen,
    isGitOpen,
    setIsGitOpen,
    isDetailsOpen,
    setIsDetailsOpen,
  } = useViewContext();
  const [chatResize, setChatResize] = useCookie(cookieName.chatRsInterface, [200, 200, 420, 200, 200, 200, 200, 200]);
  const [activeTab, setActiveTab] = useCookie<(typeof chatTabs)[number]['id']>(cookieName.chatInterfaceTab, 'chat');
  const isMobile = useIsMobile();

  const handleTabChange = (value: string) => {
    setActiveTab(value as (typeof chatTabs)[number]['id']);
  };

  const [isFullHeightPanel, setIsFullHeightPanel] = useCookie(cookieName.chatInterfaceFullHeight, false);
  const toggleFullHeightPanel = () => {
    setIsFullHeightPanel((previous) => !previous);
  };

  if (isMobile) {
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

            'group-data-[active-tab=model]/chat-tabs:[&_.viewport-gizmo-cube]:bottom-(--nav-height)!',
            '[&_.viewport-gizmo-cube]:z-auto!',
          )}
        >
          {/* Main viewer */}
          <ChatViewer />

          {/* Top-left Content */}
          <div className="absolute top-(--header-height) right-12 left-2 hidden group-data-[active-tab=model]/chat-tabs:block group-data-[full-height-panel=true]/chat-tabs:block">
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
            '[&_[data-slot=floating-panel]]:rounded-none',
            '[&_[data-slot=floating-panel]]:rounded-t-lg',
            '[&_[data-slot=floating-panel]]:border-b-0',
            '[&_[data-slot=floating-panel]]:h-full',
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
  }

  if (!isBrowser) {
    return <div className="hidden size-full md:flex" />;
  }

  return (
    <div className={cn('group/chat-layout relative hidden size-full flex-col md:flex')}>
      <div
        className={cn(
          'absolute',
          'top-(--header-height)',
          'h-[calc(100dvh-(--spacing(14)))]',
          'w-full',
          'pl-[calc(var(--sidebar-width-current)-var(--spacing)*2)]',
          'transition-[padding-left] duration-200 ease-linear',
          '[&_[data-slot=floating-panel]:first-child]:rounded-l-md',
          '[&_[data-slot=floating-panel]:last-child]:rounded-r-md',
          '[&_[data-slot=floating-panel]:first]:pl-2',
          '[&_[data-slot=floating-panel]:last]:pr-2',
        )}
      >
        <Allotment
          defaultSizes={chatResize}
          onChange={(sizes) => {
            setChatResize(sizes);
          }}
        >
          <Allotment.Pane minSize={200} visible={isChatOpen}>
            <ChatHistory isExpanded={isChatOpen} setIsExpanded={setIsChatOpen} />
          </Allotment.Pane>

          <Allotment.Pane minSize={200} visible={isExplorerOpen}>
            <ChatExplorerTree isExpanded={isExplorerOpen} setIsExpanded={setIsExplorerOpen} />
          </Allotment.Pane>

          <Allotment.Pane className="px-2" minSize={420}>
            <div className="relative size-full px-2">
              {/* Top-left Content */}
              <div className="pointer-events-auto absolute top-0 left-0 z-10 flex flex-col gap-2">
                <ChatHistoryTrigger
                  isOpen={isChatOpen}
                  onToggle={() => {
                    setIsChatOpen((previous) => !previous);
                  }}
                />
                <ChatExplorerTrigger
                  isOpen={isExplorerOpen}
                  onToggle={() => {
                    setIsExplorerOpen((previous) => !previous);
                  }}
                />
              </div>

              {/* Top-right Content */}
              <div className="pointer-events-auto absolute top-0 right-0 z-10 flex flex-col gap-2">
                <ChatParametersTrigger
                  isOpen={isParametersOpen}
                  onToggle={() => {
                    setIsParametersOpen((previous) => !previous);
                  }}
                />
                <ChatEditorLayoutTrigger
                  isOpen={isEditorOpen}
                  onToggle={() => {
                    setIsEditorOpen((previous) => !previous);
                  }}
                />
                <ChatConverterTrigger
                  isOpen={isConverterOpen}
                  onToggle={() => {
                    setIsConverterOpen((previous) => !previous);
                  }}
                />
                <ChatGitTrigger
                  isOpen={isGitOpen}
                  onToggle={() => {
                    setIsGitOpen((previous) => !previous);
                  }}
                />
                <ChatDetailsTrigger
                  isOpen={isDetailsOpen}
                  onToggle={() => {
                    setIsDetailsOpen((previous) => !previous);
                  }}
                />
              </div>

              {/* Centered Content */}
              <div className={cn('absolute top-[10%]', 'left-1/2', 'flex flex-col gap-2', '-translate-x-1/2')}>
                <ChatInterfaceStatus />
                <ChatViewerStatus />
              </div>

              <div
                className={cn(
                  'absolute inset-0 left-1/2 h-full w-[200dvw]',
                  '-translate-x-1/2',

                  // Position the gizmo cube.
                  '[&_.viewport-gizmo-cube]:right-[50%]',
                )}
              >
                <ChatViewer />
              </div>

              {/* Bottom-left Content */}
              <div className="pointer-events-auto absolute right-8 bottom-0 left-0 z-10 flex w-100 shrink-0 flex-col gap-2">
                <ChatInterfaceGraphics />
                <ChatStackTrace />
                <ChatViewerControls />
              </div>
            </div>
          </Allotment.Pane>

          <Allotment.Pane minSize={200} visible={isParametersOpen}>
            <ChatParameters isExpanded={isParametersOpen} setIsExpanded={setIsParametersOpen} />
          </Allotment.Pane>

          <Allotment.Pane minSize={200} visible={isEditorOpen}>
            <ChatEditorLayout isExpanded={isEditorOpen} setIsExpanded={setIsEditorOpen} />
          </Allotment.Pane>

          <Allotment.Pane minSize={200} visible={isConverterOpen}>
            <ChatConverter isExpanded={isConverterOpen} setIsExpanded={setIsConverterOpen} />
          </Allotment.Pane>

          <Allotment.Pane minSize={200} visible={isGitOpen}>
            <ChatGit isExpanded={isGitOpen} setIsExpanded={setIsGitOpen} />
          </Allotment.Pane>

          <Allotment.Pane minSize={200} visible={isDetailsOpen}>
            <ChatDetails isExpanded={isDetailsOpen} setIsExpanded={setIsDetailsOpen} />
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
});
