import type { ClassValue } from 'clsx';
import type { JSX } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/components/ui/resizable.js';
import useCookie from '~/hooks/use-cookie.js';
import { ChatEditorFileTree } from '~/routes/builds_.$id/chat-editor-file-tree.js';
import { ChatEditor } from '~/routes/builds_.$id/chat-editor.js';
import { cn } from '~/utils/ui.js';

const chatResizeExplorerCookieName = 'chat-resize-explorer';

export function ChatEditorLayout({ className }: { readonly className?: ClassValue }): JSX.Element {
  const [explorerSize, setExplorerSize] = useCookie(chatResizeExplorerCookieName, [20, 80]);

  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId={chatResizeExplorerCookieName}
      className={cn('flex flex-1', className)}
      onLayout={setExplorerSize}
    >
      {/* File Explorer */}
      <ResizablePanel order={1} defaultSize={explorerSize[0]} minSize={15} id="file-explorer">
        <ChatEditorFileTree />
      </ResizablePanel>

      <ResizableHandle />
      <ResizablePanel order={2} defaultSize={explorerSize[1]} minSize={15} id="file-editor">
        <ChatEditor />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
