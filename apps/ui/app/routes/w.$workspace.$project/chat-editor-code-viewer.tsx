import { CodeEditor } from '#components/code/code-editor.client.js';
import { EditorPanePlaceholder } from '#components/code/editor-pane-placeholder.js';
import type { ChatEditorViewerProps } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';
import { createMonacoPath } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';

export function ChatEditorCodeViewer({
  // `paneId` is accepted to satisfy the shared `ChatEditorViewerProps`
  // contract — the plain code viewer has no internal tab state so it
  // does not need to key on the pane identity. Multi-tab viewers (e.g.
  // markdown) DO use it as a React `key` to survive renames.
  paneId: _paneId,
  filePath,
  content,
  language,
  isEditorReady,
  onChange,
  onValidate,
  readOnly,
}: ChatEditorViewerProps): React.JSX.Element {
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
