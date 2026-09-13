import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { ChatEditorBreadcrumbs } from '#routes/projects_.$id/chat-editor-breadcrumbs.js';
import type { ChatEditorViewerProps } from '#routes/projects_.$id/chat-editor-viewer.types.js';

export function ChatEditorPlanViewer({ filePath, content }: ChatEditorViewerProps): React.JSX.Element {
  // `paneId` (in props) intentionally unused: plan viewer is single-tab.
  return (
    <>
      <ChatEditorBreadcrumbs filePath={filePath} />
      <div className='flex h-full flex-col overflow-auto bg-background'>
        <div className='mx-auto w-full max-w-3xl px-6 pt-3 pb-8'>
          <MarkdownViewer className='prose-sm dark:prose-invert prose prose-headings:font-semibold prose-p:text-muted-foreground prose-li:text-muted-foreground'>
            {content}
          </MarkdownViewer>
        </div>
      </div>
    </>
  );
}
