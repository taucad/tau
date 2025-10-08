import type { ClassValue } from 'clsx';
import { ArrowRightToLine, XIcon, Code2 } from 'lucide-react';
import { useRef, useCallback } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { Button } from '#components/ui/button.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#components/ui/resizable.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { ChatEditorFileTree } from '#routes/builds_.$id/chat-editor-file-tree.js';
import { ChatEditor } from '#routes/builds_.$id/chat-editor.js';
import { ChatConsole } from '#routes/builds_.$id/chat-console.js';
import type { KeyCombination } from '#utils/keys.js';
import { formatKeyCombination } from '#utils/keys.js';
import { cn } from '#utils/ui.js';

const keyCombinationFileExplorer = {
  key: 's',
  ctrlKey: true,
} as const satisfies KeyCombination;

const keyCombinationEditor = {
  key: 'e',
  ctrlKey: true,
} as const satisfies KeyCombination;

const toggleConsoleKeyCombination = {
  key: 'l',
  ctrlKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

export const collapsedConsoleSize = 4;

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
  const [explorerSize, setExplorerSize] = useCookie(cookieName.chatRsFileExplorer, [20, 80]);
  const [consoleSize, setConsoleSize] = useCookie(cookieName.chatRsEditor, [85, 15]);
  const [isExplorerOpen, setIsExplorerOpen] = useCookie(cookieName.chatOpFileExplorer, false);

  const consolePanelReference = useRef<ImperativePanelHandle>(null);

  const toggleExplorer = () => {
    setIsExplorerOpen(!isExplorerOpen);
  };

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

  const { formattedKeyCombination: formattedExplorerKeyCombination } = useKeydown(
    keyCombinationFileExplorer,
    toggleExplorer,
  );
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
          {/* Editor and File Explorer Panel */}
          <ResizablePanel order={1} defaultSize={consoleSize[0]} id="chat-editor" className="size-full">
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId={cookieName.chatRsFileExplorer}
              className="relative h-full"
              onLayout={setExplorerSize}
            >
              {/* File Explorer */}
              {isExplorerOpen ? (
                <>
                  <ResizablePanel order={1} defaultSize={explorerSize[0]} minSize={15} id="file-explorer">
                    <ChatEditorFileTree />
                  </ResizablePanel>
                  <ResizableHandle />
                </>
              ) : null}

              <ResizablePanel
                order={2}
                defaultSize={isExplorerOpen ? explorerSize[1] : 100}
                minSize={15}
                id="file-editor"
              >
                <ChatEditor />
              </ResizablePanel>

              {/* Toggle Button for File Explorer */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="overlay"
                    size="icon"
                    className={cn(
                      'absolute bottom-2 left-2 z-10 size-7',
                      'transition-transform',
                      isExplorerOpen && 'rotate-180',
                    )}
                    onClick={toggleExplorer}
                  >
                    <ArrowRightToLine />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isExplorerOpen ? 'Hide file tree' : 'Show file tree'}
                  <KeyShortcut variant="tooltip" className="ml-1">
                    {formattedExplorerKeyCombination}
                  </KeyShortcut>
                </TooltipContent>
              </Tooltip>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle />

          {/* Console Panel */}
          <ResizablePanel
            ref={consolePanelReference}
            collapsible
            order={2}
            defaultSize={consoleSize[1]}
            minSize={collapsedConsoleSize}
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
