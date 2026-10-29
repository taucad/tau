import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';
import { ChatEditorCodeViewer } from '#routes/w.$workspace.$project/chat-editor-code-viewer.js';
import type { ChatEditorViewerProps } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';

export function ChatEditorMarkdownViewer({
  content,
  viewId = 'preview',
  ...editorProps
}: ChatEditorViewerProps & { readonly viewId?: string }): React.JSX.Element {
  if (viewId !== 'source') {
    return (
      <div className='h-full overflow-auto'>
        <div className='mx-auto w-full max-w-3xl px-6 pt-3 pb-8'>
          <MarkdownViewerChat>{content}</MarkdownViewerChat>
        </div>
      </div>
    );
  }
  return <ChatEditorCodeViewer {...editorProps} content={content} />;
}
