import { memo, useRef, useMemo } from 'react';
import { ChatHistory, ChatHistoryTrigger } from '#routes/builds_.$id/chat-history.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#components/ui/resizable.js';
import { ChatParameters, ChatParametersTrigger } from '#routes/builds_.$id/chat-parameters.js';
import { useViewContext } from '#routes/builds_.$id/chat-interface-controls.js';
import { cookieName } from '#constants/cookie.constants.js';
import { ChatViewer } from '#routes/builds_.$id/chat-viewer.js';
import { ChatEditorLayout, ChatEditorLayoutTrigger } from '#routes/builds_.$id/chat-editor-layout.js';
import { SettingsControl } from '#components/geometry/cad/settings-control.js';
import { ChatViewerStatus } from '#routes/builds_.$id/chat-viewer-status.js';
import { ChatViewerControls } from '#routes/builds_.$id/chat-viewer-controls.js';
import { ChatStackTrace } from '#routes/builds_.$id/chat-stack-trace.js';
import { ChatExplorerTree, ChatExplorerTrigger } from '#routes/builds_.$id/chat-editor-explorer.js';
import { ChatEditorDetails, ChatEditorDetailsTrigger } from '#routes/builds_.$id/chat-editor-details.js';
import { cn } from '#utils/ui.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useResizeObserver } from '#hooks/use-resize-observer.js';
import { ChatInterfaceNav, chatTabs } from '#routes/builds_.$id/chat-interface-nav.js';
import { Tabs, TabsContents, TabsContent } from '#components/ui/tabs.js';
import { Button } from '#components/ui/button.js';
import { Eye, EyeClosed } from 'lucide-react';

/**
 * The spacing/gap between the panels in pixels.
 */
const spacing = 8;

export const ChatInterface = memo(function (): React.JSX.Element {
  const { isChatOpen, setIsChatOpen, isParametersOpen, setIsParametersOpen, isEditorOpen, setIsEditorOpen, isExplorerOpen, setIsExplorerOpen, isDetailsOpen, setIsDetailsOpen } = useViewContext();
  const [chatResizeLeft, setChatResizeLeft] = useCookie(cookieName.chatRsLeft, [30, 20, 50]);
  const [chatResizeRight, setChatResizeRight] = useCookie(cookieName.chatRsRight, [50, 30, 20, 0]);
  const [activeTab, setActiveTab] = useCookie<typeof chatTabs[number]['id']>(cookieName.chatInterfaceTab, 'chat');

  // Refs for each individual panel
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const explorerPanelRef = useRef<HTMLDivElement>(null);
  const parametersPanelRef = useRef<HTMLDivElement>(null);
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const detailsPanelRef = useRef<HTMLDivElement>(null);

  // Track width of each panel
  const historySize = useResizeObserver({ ref: historyPanelRef as React.RefObject<HTMLElement> });
  const explorerSize = useResizeObserver({ ref: explorerPanelRef as React.RefObject<HTMLElement> });
  const parametersSize = useResizeObserver({ ref: parametersPanelRef as React.RefObject<HTMLElement> });
  const editorSize = useResizeObserver({ ref: editorPanelRef as React.RefObject<HTMLElement> });
  const detailsSize = useResizeObserver({ ref: detailsPanelRef as React.RefObject<HTMLElement> });

  // Calculate total widths for each side
  const leftPanelWidth = useMemo(() => {
    const historyWidth = isChatOpen ? (historySize.width ?? 0) + spacing : 0;
    const explorerWidth = isExplorerOpen ? (explorerSize.width ?? 0) + spacing : 0;
    return historyWidth + explorerWidth;
  }, [historySize.width, explorerSize.width, isChatOpen, isExplorerOpen]);

  const rightPanelWidth = useMemo(() => {
    const parametersWidth = isParametersOpen ? (parametersSize.width ?? 0) + spacing : 0;
    const editorWidth = isEditorOpen ? (editorSize.width ?? 0) + spacing : 0;
    const detailsWidth = isDetailsOpen ? (detailsSize.width ?? 0) + spacing : 0;
    return parametersWidth + editorWidth + detailsWidth;
  }, [parametersSize.width, editorSize.width, detailsSize.width, isParametersOpen, isEditorOpen, isDetailsOpen]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as typeof chatTabs[number]['id']);
  };

  const [isFullHeightPanel, setIsFullHeightPanel] = useCookie(cookieName.chatInterfaceFullHeight, false);
  const toggleFullHeightPanel = () => {
    setIsFullHeightPanel((previous) => !previous);
  };

  // Memoize the chat viewer to prevent re-rendering during responsive width changes.
  const chatViewer = useMemo(() => {
    return (
      <ChatViewer />
    );
  }, []);

  return (
    <>
      {/* Mobile */}
      <Tabs className={cn(
        'group/chat-tabs size-full absolute inset-0 gap-0',
        '[--nav-height:calc(var(--spacing)*10)]',
        'md:hidden',
        '[--full-panel-collapsed:30dvh]',
      )}
        value={activeTab}
        onValueChange={handleTabChange}
        data-active-tab={activeTab}
        data-full-height-panel={isFullHeightPanel}
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
          {chatViewer}

          {/* Top-left Content */}
          <div className='absolute top-(--header-height) left-2 right-12 group-data-[active-tab=model]/chat-tabs:block group-data-[full-height-panel=true]/chat-tabs:block hidden'>
            <ChatStackTrace />
          </div>

          {/* Top-right Content */}
          <div className='absolute top-(--header-height) right-2 group-data-[active-tab=model]/chat-tabs:block group-data-[full-height-panel=true]/chat-tabs:block hidden'>
            <SettingsControl />
          </div>

          {/* Centered Content */}
          <div className={cn(
            "absolute",
            "left-1/2",
            "-translate-x-1/2",
            "top-6",
            'z-50',
          )}>
            <ChatViewerStatus />
          </div>

          {/* Bottom-left Content */}
          <div className={cn(
            'absolute bottom-13 left-0 px-2 flex flex-row justify-between w-full gap-2 pointer-events-auto z-10',
            'group-data-[full-height-panel=false]/chat-tabs:hidden',
          )}>
            <ChatViewerControls />
          </div>
        </div>
        <div className='absolute z-20 bottom-0 left-0 right-0 p-1 pt-0 flex flex-row justify-between items-center w-full gap-1'>
          <ChatInterfaceNav className='h-(--nav-height) shadow-sm' />
          <Button
            size='icon'
            variant='overlay'
            onClick={toggleFullHeightPanel}
            className="size-10 [&_svg]:size-5! [&_svg]:text-muted-foreground [&_svg]:stroke-[1.5] rounded-xl bg-muted shadow-sm"
          >
            <EyeClosed className='group-data-[full-height-panel=true]/chat-tabs:hidden' />
            <Eye className='group-data-[full-height-panel=false]/chat-tabs:hidden' />
          </Button>
        </div>
        <TabsContents className={cn(
          'absolute inset-0',
          'size-full!',

          // Disable pointer events for the tabs contents so the user can interact with the viewer when height is half.
          'pointer-events-none',

          // Full height panel effect - toggle between half and full height.
          'pt-(--header-height)',
          'group-data-[full-height-panel=true]/chat-tabs:pt-(--full-panel-collapsed)',
          'transition-[padding-top] duration-200 ease-in-out',

          // Make only the top of the floating panel rounded.
          "[&_[data-slot=floating-panel]]:rounded-none",
          "[&_[data-slot=floating-panel]]:rounded-t-lg",
          "[&_[data-slot=floating-panel]]:h-full",
          "[&_[data-slot=floating-panel]]:pointer-events-auto",

          // Make sure the content is padded to the bottom of the floating panel.
          '[&_[data-slot=floating-panel-content]]:transition-none',
          "[&_[data-slot=floating-panel-content]]:pb-21",
          'group-data-[full-height-panel=false]/chat-tabs:[&_[data-slot=floating-panel-content]]:pb-[calc(var(--nav-height)+0.25rem)]',

          // Hide the floating panel trigger.
          "[&_[data-slot=floating-panel-trigger]]:hidden",
          "[&_[data-slot=floating-panel-content-header]]:px-3",

          // Make sure the tabs content is full height to allow the floating panel to be full height.
          "[&_[data-slot=tabs-content]]:h-full",

          // Model tab takes full height with floating panel effect.
          'group-data-[active-tab=model]/chat-tabs:border-t-0',
        )}>
          <TabsContent enableAnimation={false} value="chat">
            <ChatHistory isExpanded={true} setIsExpanded={() => { }} />
          </TabsContent>
          <TabsContent enableAnimation={false} value="parameters">
            <ChatParameters isExpanded={true} setIsExpanded={() => { }} />
          </TabsContent>
          <TabsContent
            enableAnimation={false}
            value="model"
            className='size-full pointer-events-none'
          >
          </TabsContent>
          <TabsContent enableAnimation={false} value="editor">
            <ChatEditorLayout isExpanded={true} setIsExpanded={() => { }} />
          </TabsContent>
          <TabsContent enableAnimation={false} value="details">
            <ChatEditorDetails isExpanded={true} setIsExpanded={() => { }} />
          </TabsContent>
        </TabsContents>
      </Tabs>

      {/* Desktop */}
      <div
        className={cn("group/chat-layout relative size-full flex-col hidden md:flex")}
        style={
          {
            '--left-panel-size': `${leftPanelWidth}px`,
            '--right-panel-size': `${rightPanelWidth}px`,
          } as React.CSSProperties
        }
        data-chat-open={isChatOpen}
        data-explorer-open={isExplorerOpen}
        data-parameters-open={isParametersOpen}
        data-editor-open={isEditorOpen}
        data-details-open={isDetailsOpen}
      >
        {/* Viewer - inset completely to occupy the background fully */}
        {/* The calculation is to center the viewer within the container */}
        <div className={cn(
          'absolute inset-0 h-full w-[200dvw] left-1/2',

          // Center the viewer based on the size of the left and right panels.
          '-translate-x-[calc((100%-var(--sidebar-width-current)+var(--right-panel-size)-var(--left-panel-size))/2)]',
          'transition-all duration-200 ease-in-out',

          // Position the gizmo cube.
          '[&_.viewport-gizmo-cube]:right-[calc((var(--sidebar-width-current)+var(--right-panel-size)+var(--left-panel-size)+100dvw)/2)]!',
        )}>
          {chatViewer}
        </div>

        {/* Left-side ResizablePanelGroup */}
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId={cookieName.chatRsLeft}
          className={cn(
            "absolute gap-1",
            "top-(--header-height)",
            "left-(--sidebar-width-current)",
            "h-[calc(100dvh-(--spacing(14)))]!",
            "w-[calc(50dvw-0.25rem)]!",
            "transition-all duration-200 ease-linear",
            "overflow-visible! pointer-events-none"
          )}
          onLayout={setChatResizeLeft}
        >
          <ResizablePanel order={1} id="history" minSize={25} defaultSize={chatResizeLeft[0]} className='pointer-events-auto overflow-visible! group-data-[chat-open=false]/chat-layout:hidden'>
            <div ref={historyPanelRef} className="size-full">
              <ChatHistory isExpanded={isChatOpen} setIsExpanded={setIsChatOpen} />
            </div>
          </ResizablePanel>

          <ResizableHandle variant='floating' className='hover:after:opacity-100 group-data-[chat-open=false]/chat-layout:hidden' />

          <ResizablePanel order={2} id="object-tree" minSize={20} maxSize={30} defaultSize={chatResizeLeft[1]} className='pointer-events-auto overflow-visible! group-data-[explorer-open=false]/chat-layout:hidden'>
            <div ref={explorerPanelRef} className="size-full">
              <ChatExplorerTree isExpanded={isExplorerOpen} setIsExpanded={setIsExplorerOpen} />
            </div>
          </ResizablePanel>

          <ResizableHandle variant='floating' className='hover:after:opacity-100 group-data-[explorer-open=false]/chat-layout:hidden' />

          <ResizablePanel order={3} id="spacer" defaultSize={chatResizeLeft[2]} minSize={0} className='relative overflow-visible! mr-2'>
            {/* Top-left Content */}
            <div className='absolute top-0 left-0 flex flex-col gap-2 pointer-events-auto'>
              <ChatHistoryTrigger
                isOpen={isChatOpen}
                onToggle={() => setIsChatOpen((previous) => !previous)}
              />
              <ChatExplorerTrigger
                isOpen={isExplorerOpen}
                onToggle={() => setIsExplorerOpen((previous) => !previous)}
              />
            </div>

            {/* Bottom-left Content */}
            <div className='absolute bottom-0 left-0 right-8 w-full flex flex-col gap-2 pointer-events-auto'>
              <ChatStackTrace />
              <ChatViewerControls />
            </div>

          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Right-side ResizablePanelGroup */}
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId={cookieName.chatRsRight}
          className={cn(
            "absolute gap-1",
            "top-(--header-height)",
            "right-2",
            "h-[calc(100dvh-(--spacing(14)))]!",
            "w-[calc(50dvw-0.25rem)]!",
            "transition-all duration-200 ease-linear",
            "overflow-visible! pointer-events-none"
          )}
          onLayout={setChatResizeRight}
        >
          {/* Spacer panel for open buttons */}
          <ResizablePanel order={1} id="spacer-right" defaultSize={chatResizeRight[0]} minSize={0} className='relative overflow-visible! ml-2'>
            {/* Top-right Content */}
            <div className='absolute top-0 right-0 flex flex-col gap-2 pointer-events-auto'>
              <SettingsControl />
              <ChatParametersTrigger
                isOpen={isParametersOpen}
                onToggle={() => setIsParametersOpen((previous) => !previous)}
              />
              <ChatEditorLayoutTrigger
                isOpen={isEditorOpen}
                onToggle={() => setIsEditorOpen((previous) => !previous)}
              />
              <ChatEditorDetailsTrigger
                isOpen={isDetailsOpen}
                onToggle={() => setIsDetailsOpen((previous) => !previous)}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle variant='floating' className='hover:after:opacity-100 group-data-[parameters-open=false]/chat-layout:hidden' />
          <ResizablePanel order={2} id="parameters" minSize={20} maxSize={40} defaultSize={chatResizeRight[1]} className='pointer-events-auto overflow-visible! group-data-[parameters-open=false]/chat-layout:hidden'>
            <div ref={parametersPanelRef} className="size-full">
              <ChatParameters isExpanded={isParametersOpen} setIsExpanded={setIsParametersOpen} />
            </div>
          </ResizablePanel>

          <ResizableHandle variant='floating' className='hover:after:opacity-100 group-data-[editor-open=false]/chat-layout:hidden' />
          <ResizablePanel order={3} id="editor-layout" minSize={25} maxSize={50} defaultSize={chatResizeRight[2]} className='pointer-events-auto overflow-visible! group-data-[editor-open=false]/chat-layout:hidden'>
            <div ref={editorPanelRef} className="size-full">
              <ChatEditorLayout isExpanded={isEditorOpen} setIsExpanded={setIsEditorOpen} />
            </div>
          </ResizablePanel>

          <ResizableHandle variant='floating' className='hover:after:opacity-100 group-data-[details-open=false]/chat-layout:hidden' />
          <ResizablePanel order={4} id="details" minSize={20} maxSize={35} defaultSize={chatResizeRight[3]} className='pointer-events-auto overflow-visible! group-data-[details-open=false]/chat-layout:hidden'>
            <div ref={detailsPanelRef} className="size-full">
              <ChatEditorDetails isExpanded={isDetailsOpen} setIsExpanded={setIsDetailsOpen} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Centered Content */}
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2",
          "left-1/2",
          "-translate-x-[calc((100%-var(--sidebar-width-current)+var(--right-panel-size)-var(--left-panel-size))/2)]",
          "top-[90%] -translate-y-[90%]",
        )}>
          <ChatViewerStatus />
        </div>
      </div>
    </>
  );
});
