import { useCallback, useEffect, useRef, useState } from 'react';
import type { Extension } from '@codemirror/state';
import { CodeEditor, markCodeEditorMilestone } from '#components/code/code-editor.client.js';
import { EditorPanePlaceholder } from '#components/code/editor-pane-placeholder.js';
import { useEditorDocument, useEditorLanguageEnvironment } from '#hooks/use-editor-document-session.js';
import { useProject } from '#hooks/use-project.js';
import type { EditorDocument } from '#lib/editor-document.js';
import { registerEditorView } from '#lib/editor-navigation-service.js';
import type { ChatEditorViewerProps } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';
import { Button } from '@taucad/ui/components/button';

export function ChatEditorCodeViewer({
  paneId,
  filePath,
  language,
  onApply,
  onHistory,
  readOnly,
}: ChatEditorViewerProps): React.JSX.Element {
  const document = useEditorDocument(filePath);
  const { projectId } = useProject();
  const placeholder = <EditorPanePlaceholder label={`Loading ${filePath.split('/').pop() ?? filePath}`} />;
  return (
    <MountedCodeEditor
      document={document}
      paneId={paneId}
      language={language}
      onApply={onApply}
      onHistory={onHistory}
      readOnly={readOnly}
      placeholder={placeholder}
      projectId={projectId}
    />
  );
}

function MountedCodeEditor({
  document,
  paneId,
  language,
  onApply,
  onHistory,
  readOnly,
  placeholder,
  projectId,
}: Pick<ChatEditorViewerProps, 'paneId' | 'language' | 'onApply' | 'onHistory' | 'readOnly'> & {
  readonly document: EditorDocument | undefined;
  readonly placeholder: React.JSX.Element;
  readonly projectId: string;
}): React.JSX.Element {
  const environment = useEditorLanguageEnvironment();
  const [semantic, setSemantic] = useState<{ document: EditorDocument; language: string; extensions: Extension }>();
  const [semanticFailure, setSemanticFailure] = useState<{
    document: EditorDocument;
    language: string;
    message: string;
  }>();
  const activeLanguageLoad = useRef<{ controller: AbortController; dispose?: () => void } | undefined>(undefined);
  const acquire = useCallback(async (): Promise<void> => {
    if (!environment || !document) {
      return;
    }
    activeLanguageLoad.current?.controller.abort();
    activeLanguageLoad.current?.dispose?.();
    const controller = new AbortController();
    const load: { controller: AbortController; dispose?: () => void } = { controller };
    activeLanguageLoad.current = load;
    const fail = (error: unknown): void => {
      if (!controller.signal.aborted) {
        console.error('Editor language service failed to start or stopped unexpectedly', error);
        controller.abort();
        load.dispose?.();
        load.dispose = undefined;
        setSemantic(undefined);
        setSemanticFailure({
          document,
          language,
          message: 'Language tools are unavailable. Editing is still available.',
        });
      }
    };
    try {
      const { acquireEditorLanguage } = await import('#lib/editor-language-runtime.js');
      controller.signal.throwIfAborted();
      const lease = await acquireEditorLanguage({
        languageId: language,
        document,
        environment,
        signal: controller.signal,
        onFailure: fail,
      });
      if (controller.signal.aborted) {
        lease.dispose();
        return;
      }
      load.dispose = lease.dispose;
      setSemanticFailure(undefined);
      markCodeEditorMilestone('semantics-ready', paneId);
      setSemantic({ document, language, extensions: lease.extensions });
    } catch (error) {
      fail(error);
    }
  }, [document, environment, language, paneId]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        void acquire();
      }
    });
    return () => {
      active = false;
      activeLanguageLoad.current?.controller.abort();
      activeLanguageLoad.current?.dispose?.();
      activeLanguageLoad.current = undefined;
    };
  }, [acquire]);

  return (
    <div className='relative size-full'>
      <CodeEditor
        document={document}
        viewId={paneId}
        languageId={language}
        loading={placeholder}
        className='h-full bg-background'
        readOnly={readOnly}
        extensions={
          document && semantic?.document === document && semantic.language === language
            ? semantic.extensions
            : undefined
        }
        diagnostics={environment?.diagnostics}
        onApply={document ? (transaction) => onApply(document, transaction) : undefined}
        onHistory={document ? (kind) => onHistory(document, kind) : undefined}
        onMount={
          document
            ? (view, path) =>
                registerEditorView({
                  projectId,
                  path,
                  paneId,
                  reveal: (line, column) => {
                    const textLine = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
                    const offset = textLine.from + Math.max(0, Math.min(column - 1, textLine.length));
                    view.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
                    view.focus();
                  },
                })
            : undefined
        }
      />
      {document && semanticFailure?.document === document && semanticFailure.language === language && (
        <div
          role='status'
          className='absolute right-3 bottom-3 z-20 flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm'
        >
          <span>{semanticFailure.message}</span>
          <Button
            type='button'
            size='xs'
            variant='outline'
            onClick={() => {
              setSemanticFailure(undefined);
              void acquire();
            }}
          >
            Retry language tools
          </Button>
        </div>
      )}
    </div>
  );
}
