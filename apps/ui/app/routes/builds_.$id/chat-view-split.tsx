import { useRef, useCallback } from 'react';
import type { JSX } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { ChatConsole } from '~/routes/builds_.$id/chat-console.js';
import { ChatEditor } from '~/routes/builds_.$id/chat-editor.js';
import { ChatViewer } from '~/routes/builds_.$id/chat-viewer.js';
import type { KeyCombination } from '~/utils/keys.js';
import { useCookie } from '~/hooks/use-cookie.js';
import { useKeydown } from '~/hooks/use-keydown.js';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '~/components/ui/resizable.js';
import { ChatEditorFileTree } from '~/routes/builds_.$id/chat-editor-file-tree.js';
import { ChatEditorLayout } from '~/routes/builds_.$id/chat-editor-layout.js';

const chatResizeViewerCookieName = 'chat-resize-viewer';
const chatResizeCodeCookieName = 'chat-resize-editor';
const toggleConsoleKeyCombination = {
  key: 'l',
  ctrlKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

export const collapsedConsoleSize = 4;

export function ChatViewSplit(): JSX.Element {
  const [consoleSize, setConsoleSize] = useCookie(chatResizeCodeCookieName, [85, 15]);
  const [codeSize, setCodeSize] = useCookie(chatResizeViewerCookieName, [60, 40]);

  const consolePanelReference = useRef<ImperativePanelHandle>(null);

  const toggleConsolePanel = useCallback(() => {
    const panel = consolePanelReference.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  }, [consolePanelReference]);

  const { formattedKeyCombination: formattedToggleConsoleKeyCombination } = useKeydown(
    toggleConsoleKeyCombination,
    toggleConsolePanel,
  );

  return (
    <ResizablePanelGroup
      autoSaveId={chatResizeViewerCookieName}
      direction="horizontal"
      className="h-full"
      onLayout={setCodeSize}
    >
      <ResizablePanel order={1} defaultSize={codeSize[0]} minSize={30} id="chat-viewer">
        <ChatViewer />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel order={2} defaultSize={codeSize[1]} minSize={30} id="chat-editor-container">
        <ResizablePanelGroup direction="vertical" autoSaveId={chatResizeCodeCookieName} onLayout={setConsoleSize}>
          <ResizablePanel order={1} defaultSize={consoleSize[0]} id="chat-editor" className="size-full">
            <ChatEditorLayout />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            ref={consolePanelReference}
            collapsible
            order={2}
            defaultSize={consoleSize[1]}
            minSize={collapsedConsoleSize}
            collapsedSize={collapsedConsoleSize}
            id="chat-console"
            // 10 is the height of the console buttons plus padding.
            className="group/console-resizable min-h-10"
          >
            <ChatConsole
              keyCombination={formattedToggleConsoleKeyCombination}
              data-view="split"
              onButtonClick={toggleConsolePanel}
              onFilterChange={(event) => {
                const panel = consolePanelReference.current;
                if (event.target.value.length > 0) {
                  panel?.expand();
                }
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
