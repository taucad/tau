import { CodeEditor } from '#components/code/code-editor.client.js';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';
import { Loader } from '#components/ui/loader.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs.js';
import { ChatEditorBreadcrumbs } from '#routes/projects_.$id/chat-editor-breadcrumbs.js';
import type { ChatEditorViewerProps } from '#routes/projects_.$id/chat-editor-viewer.types.js';
import { createMonacoPath } from '#routes/projects_.$id/chat-editor-viewer.types.js';

const tabsTriggerClassName = 'px-2 py-0.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm';

export function ChatEditorMarkdownViewer({
  paneId,
  filePath,
  content,
  language,
  onChange,
  onValidate,
  readOnly,
}: ChatEditorViewerProps): React.JSX.Element {
  // Key on `paneId` (stable pane identity) instead of `filePath` so a
  // rename does not remount the Tabs root and reset the user's
  // Preview/Markdown selection. See R21 (F27) in
  // `docs/research/editor-filesystem-surface-audit.md`.
  return (
    <Tabs key={paneId} defaultValue='markdown' className='flex min-h-0 flex-1 flex-col'>
      <ChatEditorBreadcrumbs filePath={filePath}>
        <TabsList enableAnimation={false} className='h-7'>
          <TabsTrigger value='preview' enableAnimation={false} className={tabsTriggerClassName}>
            Preview
          </TabsTrigger>
          <TabsTrigger value='markdown' enableAnimation={false} className={tabsTriggerClassName}>
            Markdown
          </TabsTrigger>
        </TabsList>
      </ChatEditorBreadcrumbs>
      <TabsContent
        value='preview'
        forceMount
        enableAnimation={false}
        className='flex-1 overflow-auto data-[state=inactive]:hidden'
      >
        <div className='mx-auto w-full max-w-3xl px-6 pt-3 pb-8'>
          <MarkdownViewerChat>{content}</MarkdownViewerChat>
        </div>
      </TabsContent>
      <TabsContent value='markdown' forceMount enableAnimation={false} className='flex-1 data-[state=inactive]:hidden'>
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
      </TabsContent>
    </Tabs>
  );
}
