import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import type { ChatEditorViewerProps } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';

export function ChatEditorPlanViewer({ content }: ChatEditorViewerProps): React.JSX.Element {
  // `paneId` (in props) intentionally unused: plan viewer is single-tab.
  return (
    <div className='flex h-full flex-col overflow-auto bg-background'>
      <div className='mx-auto w-full max-w-3xl px-6 pt-3 pb-8'>
        <MarkdownViewer className='prose-sm dark:prose-invert prose prose-headings:font-semibold prose-p:text-muted-foreground prose-li:text-muted-foreground'>
          {content}
        </MarkdownViewer>
      </div>
    </div>
  );
}
