import type { ClassValue } from 'clsx';
import { ArrowRightToLine } from 'lucide-react';
import { Button } from '~/components/ui/button.js';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/components/ui/resizable.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { cookieName } from '~/constants/cookie.constants.js';
import { useCookie } from '~/hooks/use-cookie.js';
import { useKeydown } from '~/hooks/use-keydown.js';
import { ChatEditorFileTree } from '~/routes/builds_.$id/chat-editor-file-tree.js';
import { ChatEditor } from '~/routes/builds_.$id/chat-editor.js';
import type { KeyCombination } from '~/utils/keys.js';
import { cn } from '~/utils/ui.js';

const keyCombinationFileExplorer = {
  key: 's',
  ctrlKey: true,
} as const satisfies KeyCombination;

export function ChatEditorLayout({ className }: { readonly className?: ClassValue }): React.JSX.Element {
  const [explorerSize, setExplorerSize] = useCookie(cookieName.chatResizeExplorer, [20, 80]);
  const [isExplorerOpen, setIsExplorerOpen] = useCookie(cookieName.chatExplorerOpen, true);

  const toggleExplorer = () => {
    setIsExplorerOpen(!isExplorerOpen);
  };

  const { formattedKeyCombination } = useKeydown(keyCombinationFileExplorer, toggleExplorer);

  return (
    <div className="relative flex size-full">
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId={cookieName.chatResizeExplorer}
        className={cn('h-full', className)}
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

        <ResizablePanel order={2} defaultSize={isExplorerOpen ? explorerSize[1] : 100} minSize={15} id="file-editor">
          <ChatEditor />
        </ResizablePanel>

        {/* Toggle Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="overlay"
              size="icon"
              className={cn('absolute bottom-2 left-2', 'transition-transform', isExplorerOpen && 'rotate-y-180')}
              onClick={toggleExplorer}
            >
              <ArrowRightToLine />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isExplorerOpen ? 'Hide file tree' : 'Show file tree'}
            <KeyShortcut variant="tooltip" className="ml-1">
              {formattedKeyCombination}
            </KeyShortcut>
          </TooltipContent>
        </Tooltip>
      </ResizablePanelGroup>
    </div>
  );
}
