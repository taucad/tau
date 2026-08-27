import { CodeEditor } from '#components/code/code-editor.client.js';
import { Loader } from '#components/ui/loader.js';
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
  onChange,
  onValidate,
  readOnly,
}: ChatEditorViewerProps): React.JSX.Element {
  return (
    <CodeEditor
      loading={<Loader className='size-20 stroke-1 text-primary' />}
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
