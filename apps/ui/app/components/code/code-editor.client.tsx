import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { DocumentChange, DocumentTransaction, EditorDocument } from '#lib/editor-document.js';
import type { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import { EditorPanePlaceholder } from '#components/code/editor-pane-placeholder.js';
import { loadEditorSyntax } from '#lib/editor-syntax.js';
import { Button } from '@taucad/ui/components/button';

/**
 * Longest wait for an idle period before requesting the editor runtime anyway. Milliseconds.
 * Short enough that a permanently busy page still gets a source pane, long enough that opening a
 * project serves the chat composer first.
 */
const runtimeIdleLimit = 2000;

/**
 * Run `start` once the main thread is idle, or after `runtimeIdleLimit`, whichever comes first.
 *
 * The runtime and its syntax were requested in a microtask, which runs inside the task that mounted
 * the pane. Opening a project mounts this pane as soon as the project's file services publish, and
 * measurement on the cloud host found the CodeMirror runtime and the TypeScript syntax chunk
 * compiling in front of the chat composer: the composer accepted a draft 2.3 s later than it did
 * when the pane had not yet been reached. Loading the editor is not a first action, so it waits for
 * a gap instead of taking one.
 *
 * @param start - Called once, when the main thread has a gap.
 * @returns Cancels a start that has not run yet.
 */
const whenIdle = (start: () => void): (() => void) => {
  if ('requestIdleCallback' in globalThis) {
    const id = requestIdleCallback(start, { timeout: runtimeIdleLimit });
    return () => {
      cancelIdleCallback(id);
    };
  }
  const id = setTimeout(start, 0);
  return () => {
    clearTimeout(id);
  };
};

/** Browser timing marks carry pane identity but never document text or paths. */
export function markCodeEditorMilestone(name: string, viewId: string): void {
  if (typeof performance.mark === 'function') {
    performance.mark(`tau.editor.${name}`, { detail: { viewId } });
  }
}

export type CodeEditorProps = Readonly<{
  document: EditorDocument;
  viewId: string;
  languageId: string;
  className?: string;
  readOnly?: boolean;
  loading?: ReactNode;
  extensions?: Extension;
  syntaxExtension?: Extension;
  diagnostics?: EditorDiagnostics;
  showLineNumbers?: boolean;
  lineHighlights?: ReadonlyArray<Readonly<{ fromLine: number; toLine: number; tone: 'mine' | 'theirs' }>>;
  onApply?: (transaction: DocumentTransaction) => DocumentChange | undefined;
  onHistory?: (kind: 'undo' | 'redo') => DocumentChange | undefined;
  /** Re-registers when the mounted view's document path changes. */
  onMount?: (view: EditorView, path: string) => void | (() => void);
}>;

export type CodeEditorBoundaryProps = Omit<CodeEditorProps, 'document' | 'syntaxExtension'> &
  Readonly<{ document?: EditorDocument }>;

/** The source pane boundary; importing this file does not request CodeMirror. */
export function CodeEditor(props: CodeEditorBoundaryProps): React.ReactNode {
  const [View, setView] = useState<ComponentType<CodeEditorProps>>();
  const [failure, setFailure] = useState<Error>();
  const [syntax, setSyntax] = useState<{ languageId: string; extension: Extension }>();
  const [syntaxFailure, setSyntaxFailure] = useState<Error>();
  const runtimeLoadSequence = useRef(0);
  const syntaxController = useRef<AbortController | undefined>(undefined);
  const loadRuntime = useCallback(async (): Promise<void> => {
    const request = ++runtimeLoadSequence.current;
    try {
      const { CodeEditorView } = await import('#components/code/code-editor-view.client.js');
      if (request === runtimeLoadSequence.current) {
        setFailure(undefined);
        setView(() => CodeEditorView);
      }
    } catch (error) {
      if (request === runtimeLoadSequence.current) {
        setFailure(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }, []);
  const loadSyntax = useCallback(async (languageId: string): Promise<void> => {
    syntaxController.current?.abort();
    const controller = new AbortController();
    syntaxController.current = controller;
    try {
      const extension = await loadEditorSyntax(languageId, controller.signal);
      if (!controller.signal.aborted) {
        setSyntax({ languageId, extension });
        setSyntaxFailure(undefined);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('Editor syntax failed to load', error);
        setSyntaxFailure(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }, []);
  useEffect(() => {
    markCodeEditorMilestone('code-pane-admission', props.viewId);
    let active = true;
    const cancel = whenIdle(() => {
      if (active) {
        void loadRuntime();
      }
    });
    return () => {
      active = false;
      cancel();
      runtimeLoadSequence.current += 1;
    };
  }, [loadRuntime, props.viewId]);
  useEffect(() => {
    let active = true;
    const cancel = whenIdle(() => {
      if (active) {
        void loadSyntax(props.languageId);
      }
    });
    return () => {
      active = false;
      cancel();
      syntaxController.current?.abort();
    };
  }, [loadSyntax, props.languageId]);
  useEffect(() => {
    if (props.document) {
      markCodeEditorMilestone('document-ready', props.viewId);
    }
  }, [props.document, props.viewId]);
  if (failure && !View) {
    return (
      <div
        role='alert'
        className='flex size-full flex-col items-center justify-center gap-3 bg-background p-4 text-sm text-foreground'
      >
        <span>Code editor could not load.</span>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => {
            setFailure(undefined);
            void loadRuntime();
          }}
        >
          Retry editor
        </Button>
      </div>
    );
  }
  const body =
    View && props.document ? (
      <View
        {...props}
        document={props.document}
        syntaxExtension={syntax?.languageId === props.languageId ? syntax.extension : undefined}
      />
    ) : (
      (props.loading ?? <EditorPanePlaceholder label='Loading editor' />)
    );
  return syntaxFailure && View && props.document ? (
    <div className='relative size-full'>
      {body}
      <div
        role='status'
        className='absolute right-3 bottom-3 z-20 flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm'
      >
        <span>Syntax colors could not load. Editing is still available.</span>
        <Button
          type='button'
          size='xs'
          variant='outline'
          onClick={() => {
            setSyntaxFailure(undefined);
            void loadSyntax(props.languageId);
          }}
        >
          Retry syntax
        </Button>
      </div>
    </div>
  ) : (
    body
  );
}
