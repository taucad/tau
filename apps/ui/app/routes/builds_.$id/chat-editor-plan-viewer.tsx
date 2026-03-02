import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

type ChatEditorPlanViewerProperties = {
  readonly content: string;
  readonly filePath: string;
};

export function ChatEditorPlanViewer({
  content,
  filePath: _filePath,
}: ChatEditorPlanViewerProperties): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-auto bg-background">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <MarkdownViewer className="prose prose-sm dark:prose-invert prose-headings:font-semibold prose-p:text-muted-foreground prose-li:text-muted-foreground">
          {content}
        </MarkdownViewer>
      </div>
    </div>
  );
}
