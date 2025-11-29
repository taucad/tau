import type { ClassValue } from 'clsx';
import { XIcon, Code2 } from 'lucide-react';
import { useRef, useCallback } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#components/ui/resizable.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { ChatEditor } from '#routes/builds_.$id/chat-editor.js';
import { ChatConsole, collapsedConsoleSize } from '#routes/builds_.$id/chat-console.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { cn } from '#utils/ui.utils.js';

const keyCombinationEditor = {
  key: 'e',
  ctrlKey: true,
} as const satisfies KeyCombination;

const toggleConsoleKeyCombination = {
  key: 'l',
  ctrlKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

// Editor Trigger Component
export function ChatEditorLayoutTrigger({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <FloatingPanelTrigger
      icon={Code2}
      tooltipContent={
        <div className="flex items-center gap-2">
          {isOpen ? 'Close' : 'Open'} Editor
          <KeyShortcut variant="tooltip">{formatKeyCombination(keyCombinationEditor)}</KeyShortcut>
        </div>
      }
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
}

export function ChatEditorLayout({
  className,
  isExpanded = true,
  setIsExpanded,
}: {
  readonly className?: ClassValue;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const [consoleSize, setConsoleSize] = useCookie(cookieName.chatRsEditor, [
    100 - collapsedConsoleSize,
    collapsedConsoleSize,
  ]);

  const consolePanelReference = useRef<ImperativePanelHandle>(null);

  const toggleEditor = () => {
    setIsExpanded?.((current) => !current);
  };

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

  const { formattedKeyCombination: formattedEditorKeyCombination } = useKeydown(keyCombinationEditor, toggleEditor);
  const { formattedKeyCombination: formattedToggleConsoleKeyCombination } = useKeydown(
    toggleConsoleKeyCombination,
    toggleConsolePanel,
  );

  return (
    <FloatingPanel isOpen={isExpanded} side="right" onOpenChange={setIsExpanded}>
      <FloatingPanelClose
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Editor
            <KeyShortcut variant="tooltip">{formattedEditorKeyCombination}</KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent>
        <ResizablePanelGroup
          direction="vertical"
          autoSaveId={cookieName.chatRsEditor}
          className={cn('h-full', className)}
          onLayout={setConsoleSize}
        >
          {/* Editor Panel */}
          <ResizablePanel order={1} defaultSize={consoleSize[0]} minSize={5} id="chat-editor" className="size-full">
            <ChatEditor />
          </ResizablePanel>

          <ResizableHandle />

          {/* Console Panel */}
          <ResizablePanel
            ref={consolePanelReference}
            collapsible
            order={2}
            defaultSize={consoleSize[1]}
            minSize={15}
            collapsedSize={collapsedConsoleSize}
            id="chat-console"
            className="group/console-resizable min-h-11"
          >
            <ChatConsole
              keyCombination={formattedToggleConsoleKeyCombination}
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
      </FloatingPanelContent>
    </FloatingPanel>
  );
}
