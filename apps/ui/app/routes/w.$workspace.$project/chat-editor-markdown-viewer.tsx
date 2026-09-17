import { CodeEditor } from '#components/code/code-editor.client.js';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';
import { EditorPanePlaceholder } from '#components/code/editor-pane-placeholder.js';
import type { ChatEditorViewerProps } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';
import { createMonacoPath } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';

export function ChatEditorMarkdownViewer({
  filePath,
  content,
  language,
  isEditorReady,
  onChange,
  onValidate,
  readOnly,
  viewId = 'preview',
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

  const placeholder = <EditorPanePlaceholder label={`Loading ${filePath.split('/').pop() ?? filePath}`} />;
  if (!isEditorReady) {
    return placeholder;
  }
  return (
    <CodeEditor
      loading={placeholder}
      className='h-full bg-background'
      defaultLanguage={language}
      defaultValue={content}
      path={createMonacoPath(filePath)}
      onChange={onChange}
      onValidate={onValidate}
      options={readOnly === true ? { readOnly: true } : undefined}
    />
  );
}
