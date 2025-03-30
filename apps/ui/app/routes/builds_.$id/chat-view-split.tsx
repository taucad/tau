import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useKeydown } from '@/hooks/use-keydown';
import { useCookie } from '@/utils/cookies';
import { KeyCombination } from '@/utils/keys';
import { useRef, useCallback } from 'react';
import { ImperativePanelHandle } from 'react-resizable-panels';
import { ChatConsole } from './chat-console';
import { ChatEditor } from './chat-editor';
import { ChatViewer } from './chat-viewer';

const CHAT_RESIZE_VIEWER_COOKIE_NAME = 'chat-resize-viewer';
const CHAT_RESIZE_CODE_COOKIE_NAME = 'chat-resize-editor';
const CONSOLE_OPEN_COOKIE_NAME = 'console-open';
const toggleConsoleKeyCombination = {
  key: 'l',
  ctrlKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

export const ChatViewSplit = () => {
  const [isConsoleOpen, setIsConsoleOpen] = useCookie(CONSOLE_OPEN_COOKIE_NAME, true);
  const [consoleSize, setConsoleSize] = useCookie(CHAT_RESIZE_CODE_COOKIE_NAME, [85, 15]);
  const [codeSize, setCodeSize] = useCookie(CHAT_RESIZE_VIEWER_COOKIE_NAME, [60, 40]);

  const consolePanelReference = useRef<ImperativePanelHandle>(null);

  const toggleConsolePanel = useCallback(() => {
    const panel = consolePanelReference.current;
    if (panel) {
      if (panel.isCollapsed()) {
        setIsConsoleOpen(true);

        panel.expand();
      } else {
        setIsConsoleOpen(false);
        panel.collapse();
      }
    }
  }, [consolePanelReference, setIsConsoleOpen]);

  const { formattedKeyCombination: formattedToggleConsoleKeyCombination } = useKeydown(
    toggleConsoleKeyCombination,
    toggleConsolePanel,
  );

  return (
    <ResizablePanelGroup
      autoSaveId={CHAT_RESIZE_VIEWER_COOKIE_NAME}
      direction="horizontal"
      className="h-full"
      onLayout={setCodeSize}
    >
      <ResizablePanel order={1} defaultSize={codeSize[0]} minSize={30} id="chat-viewer">
        <ChatViewer />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel order={2} defaultSize={codeSize[1]} minSize={30} id="chat-editor-container">
        <ResizablePanelGroup direction="vertical" autoSaveId={CHAT_RESIZE_CODE_COOKIE_NAME} onLayout={setConsoleSize}>
          <ResizablePanel order={1} defaultSize={consoleSize[0]} id="chat-editor" className="size-full pt-12">
              <ChatEditor />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            order={2}
            defaultSize={consoleSize[1]}
            minSize={4}
            collapsible
            collapsedSize={4}
            ref={consolePanelReference}
            id="chat-console"
          >
            <ChatConsole
              onButtonClick={toggleConsolePanel}
              keyCombination={formattedToggleConsoleKeyCombination}
              onFilterChange={(event) => {
                const panel = consolePanelReference.current;
                if (event.target.value.length > 0) {
                  panel?.expand();
                } else {
                  panel?.collapse();
                }
              }}
              data-state={isConsoleOpen ? 'open' : 'closed'}
              data-view="split"
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
