import type { ClassValue } from 'clsx';
import { ArrowRightToLine } from 'lucide-react';
import type { JSX } from 'react';
import { Button } from '~/components/ui/button.js';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/components/ui/resizable.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import useCookie from '~/hooks/use-cookie.js';
import { useKeydown } from '~/hooks/use-keydown.js';
import { ChatEditorFileTree } from '~/routes/builds_.$id/chat-editor-file-tree.js';
import { ChatEditor } from '~/routes/builds_.$id/chat-editor.js';
import type { KeyCombination } from '~/utils/keys.js';
import { cn } from '~/utils/ui.js';

const chatResizeExplorerCookieName = 'chat-resize-explorer';
const chatExplorerOpenCookieName = 'chat-explorer-open';

const keyCombinationFileExplorer = {
  key: 's',
  ctrlKey: true,
} as const satisfies KeyCombination;

export function ChatEditorLayout({ className }: { readonly className?: ClassValue }): JSX.Element {
  const [explorerSize, setExplorerSize] = useCookie(chatResizeExplorerCookieName, [20, 80]);
  const [isExplorerOpen, setIsExplorerOpen] = useCookie(chatExplorerOpenCookieName, true);

  const toggleExplorer = () => {
    setIsExplorerOpen(!isExplorerOpen);
  };

  const { formattedKeyCombination } = useKeydown(keyCombinationFileExplorer, toggleExplorer);

  return (
    <div className="relative flex h-full flex-1">
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId={chatResizeExplorerCookieName}
        className={cn('flex h-full flex-1', className)}
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
      </ResizablePanelGroup>

      {/* Toggle Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-4 left-4 z-50 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/80 backdrop-blur-sm transition-colors hover:bg-accent"
            onClick={toggleExplorer}
          >
            <ArrowRightToLine className={cn('transition-transform', isExplorerOpen && 'rotate-y-180')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isExplorerOpen ? 'Hide Explorer' : 'Show Explorer'}
          <KeyShortcut variant="tooltip" className="ml-1">
            {formattedKeyCombination}
          </KeyShortcut>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
