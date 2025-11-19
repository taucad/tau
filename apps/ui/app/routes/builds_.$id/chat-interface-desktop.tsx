import { memo, useRef, useState, useEffect } from 'react';
import { Allotment } from 'allotment';
import { ChatHistory, ChatHistoryTrigger } from '#routes/builds_.$id/chat-history.js';
import { ChatParameters, ChatParametersTrigger } from '#routes/builds_.$id/chat-parameters.js';
import { ChatViewer } from '#routes/builds_.$id/chat-viewer.js';
import { ChatEditorLayout, ChatEditorLayoutTrigger } from '#routes/builds_.$id/chat-editor-layout.js';
import { ChatViewerStatus } from '#routes/builds_.$id/chat-viewer-status.js';
import { ChatViewerControls } from '#routes/builds_.$id/chat-viewer-controls.js';
import { ChatStackTrace } from '#routes/builds_.$id/chat-stack-trace.js';
import { ChatExplorerTree, ChatExplorerTrigger } from '#routes/builds_.$id/chat-explorer.js';
import { ChatDetails, ChatDetailsTrigger } from '#routes/builds_.$id/chat-details.js';
import { ChatConverter, ChatConverterTrigger } from '#routes/builds_.$id/chat-converter.js';
import { ChatGit, ChatGitTrigger } from '#routes/builds_.$id/chat-git.js';
import { cn } from '#utils/ui.utils.js';
import {
  useChatInterfaceState,
  usePanePositionObserver,
  panelMinSizeStandard,
  panelMinSizeEditor,
  panelMinSizeViewer,
} from '#routes/builds_.$id/use-chat-interface-state.js';
import { ChatInterfaceStatus } from '#routes/builds_.$id/chat-interface-status.js';
import { ChatInterfaceGraphics } from '#routes/builds_.$id/chat-interface-graphics.js';

export const ChatInterfaceDesktop = memo(function (): React.JSX.Element {
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
    chatResize,
    setChatResize,
  } = useChatInterfaceState();

  const allotmentRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);

  // Set isClient to true after hydration to avoid SSR mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Update position attributes on visible panes for performant CSS selectors
  usePanePositionObserver(allotmentRef, {
    isChatOpen,
    isParametersOpen,
    isEditorOpen,
    isExplorerOpen,
    isConverterOpen,
    isGitOpen,
    isDetailsOpen,
  });

  // Return placeholder during SSR to avoid hydration mismatch
  if (!isClient) {
    return <div className="hidden size-full md:flex" />;
  }

  return (
    <div ref={allotmentRef} className="size-full">
      <Allotment
        defaultSizes={chatResize}
        separator={false}
        className={cn(
          'size-full',
          'pl-[calc(var(--sidebar-width-current)-var(--spacing)*2)]',
          'transition-[padding-left] duration-200 ease-linear',

          // Pad the sash container to the top of the header height.
          'pt-(--header-height)',
          'pb-2',

          // Set the height of the sash to the height of the content.
          '[&_.sash.sash-vertical:before]:h-[calc(100dvh-var(--header-height)-var(--spacing)*2)]!',

          // Apply top+bottom border to the floating panels.
          '**:data-[slot=floating-panel]:border-y',

          // Left side: First pane styling
          '[&_.rs-left.split-view-view-visible[data-first]]:pl-2',
          '[&_.rs-left.split-view-view-visible[data-first]_[data-slot=floating-panel]]:rounded-l-md',

          // Left side: Last pane styling
          '[&_.rs-left.split-view-view-visible[data-last]_[data-slot=floating-panel]]:rounded-r-md',
          '[&_.rs-left.split-view-view-visible[data-last]_[data-slot=floating-panel]]:border-r',

          // Left side: All visible panes get left border
          '[&_.rs-left.split-view-view-visible_[data-slot=floating-panel]]:border-l',

          // Right side: First pane styling (leftmost visually)
          '[&_.rs-right.split-view-view-visible[data-first]_[data-slot=floating-panel]]:rounded-l-md',
          '[&_.rs-right.split-view-view-visible[data-first]_[data-slot=floating-panel]]:border-l',

          // Right side: Last pane styling (rightmost visually, needs right padding)
          '[&_.rs-right.split-view-view-visible[data-last]]:pr-2',
          '[&_.rs-right.split-view-view-visible[data-last]_[data-slot=floating-panel]]:rounded-r-md',

          // Right side: All visible panes get right border
          '[&_.rs-right.split-view-view-visible_[data-slot=floating-panel]]:border-r',

          // Allow the viewer to appear behind the floating panels.
          '[&_.split-view-view]:overflow-visible!',
        )}
        onChange={(sizes) => {
          setChatResize(sizes);
        }}
      >
        <Allotment.Pane className="rs-left z-10" minSize={panelMinSizeStandard} visible={isChatOpen}>
          <ChatHistory isExpanded={isChatOpen} setIsExpanded={setIsChatOpen} />
        </Allotment.Pane>

        <Allotment.Pane className="rs-left z-10" minSize={panelMinSizeStandard} visible={isExplorerOpen}>
          <ChatExplorerTree isExpanded={isExplorerOpen} setIsExpanded={setIsExplorerOpen} />
        </Allotment.Pane>

        <Allotment.Pane className="rs-center px-2" minSize={panelMinSizeViewer}>
          {/* Top-left Content */}
          <div className="absolute top-0 left-2 z-10 flex flex-col gap-2">
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
          <div className="absolute top-0 right-2 z-10 flex flex-col gap-2">
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
          <div className={cn('absolute top-[10%] z-10', 'left-1/2', 'flex flex-col gap-2', '-translate-x-1/2')}>
            <ChatInterfaceStatus />
            <ChatViewerStatus />
          </div>

          {/* Gizmo Container - Static container for the gizmo to ensure it shares the same containing block as the anchor */}
          <div id="viewport-gizmo-container" className="absolute right-0 -bottom-2" />

          {/* Viewer */}
          <div className={cn('absolute inset-0 left-1/2 -mt-(--header-height) h-dvh w-dvw', '-translate-x-1/2')}>
            <ChatViewer />
          </div>

          {/* Bottom-left Content */}
          <div className="absolute bottom-0 left-2 z-10 flex w-100 shrink-0 flex-col gap-2">
            <ChatInterfaceGraphics />
            <ChatStackTrace />
            <ChatViewerControls />
          </div>
        </Allotment.Pane>

        <Allotment.Pane className="rs-right" minSize={panelMinSizeStandard} visible={isParametersOpen}>
          <ChatParameters isExpanded={isParametersOpen} setIsExpanded={setIsParametersOpen} />
        </Allotment.Pane>

        <Allotment.Pane className="rs-right" minSize={panelMinSizeEditor} visible={isEditorOpen}>
          <ChatEditorLayout isExpanded={isEditorOpen} setIsExpanded={setIsEditorOpen} />
        </Allotment.Pane>

        <Allotment.Pane className="rs-right" minSize={panelMinSizeStandard} visible={isConverterOpen}>
          <ChatConverter isExpanded={isConverterOpen} setIsExpanded={setIsConverterOpen} />
        </Allotment.Pane>

        <Allotment.Pane className="rs-right" minSize={panelMinSizeStandard} visible={isGitOpen}>
          <ChatGit isExpanded={isGitOpen} setIsExpanded={setIsGitOpen} />
        </Allotment.Pane>

        <Allotment.Pane className="rs-right" minSize={panelMinSizeStandard} visible={isDetailsOpen}>
          <ChatDetails isExpanded={isDetailsOpen} setIsExpanded={setIsDetailsOpen} />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
