import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType, UIEvent } from 'react';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { DocumentChange, DocumentTransaction, EditorDocument } from '#lib/editor-document.js';
import type { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { EditorSymbolCrumb } from '#components/code/editor-language-features.js';
import { EditorPanePlaceholder } from '#components/code/editor-pane-placeholder.js';
import { loadEditorSyntax } from '#lib/editor-syntax.js';
import { Button } from '@taucad/ui/components/button';
import { pageProjectOpenPerformance } from '@taucad/ui-core/lib/project-open-performance';

/**
 * Longest wait for an idle period before requesting the editor runtime anyway. Milliseconds.
 * Short enough that a permanently busy page still gets a source pane, long enough that opening a
 * project serves the chat composer first.
 */
const runtimeIdleLimit = 2000;

/**
 * Run `start` once the main thread is idle, or after `runtimeIdleLimit`, whichever comes first. Only a pane that is not
 * on screen as it opens waits for this gap; a pane on screen requests the runtime at once ({@link whenShown}).
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

/**
 * Run `start` in a microtask of the mounting task: the pane is on screen and its file's text already is, so the
 * editor is the next thing the person will use (loading states UX blueprint, P-i; audit R10). A microtask, not a
 * direct call, so the language effect that runs after the mount effect still finds the runtime unrequested and leaves
 * the syntax to this one request.
 *
 * @param start - Called once, after the mounting effects.
 * @returns Cancels a start that has not run yet.
 */
const whenShown = (start: () => void): (() => void) => {
  let isPending = true;
  queueMicrotask(() => {
    if (isPending) {
      start();
    }
  });
  return () => {
    isPending = false;
  };
};

/**
 * Whether the pane is on screen as it opens. The workbench mounts a source pane only while its Dockview panel is shown
 * (`isPanelShown`), so the remaining cases are a page in a background tab and a pane whose host is out of the layout
 * (a hidden surface, a collapsed lane): the document's visibility and the pane's own layout box at mount answer both,
 * without a prop every caller would have to thread. Read once, at mount; a pane that becomes visible later is already
 * in its idle gap, which is bounded.
 *
 * @param element - The pane's placeholder frame.
 * @returns True when the pane is visible now.
 */
function isShownAtMount(element: HTMLElement | undefined): boolean {
  if (element === undefined || globalThis.document.visibilityState !== 'visible') {
    return false;
  }
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility()
    : element.getClientRects().length > 0;
}

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
  /** The placeholder's accessible name until the editor mounts, such as "Loading main.ts". */
  loadingLabel?: string;
  /** The file's text as read, shown in the placeholder until the document is held; the document's text wins. */
  loadingText?: string;
  extensions?: Extension;
  syntaxExtension?: Extension;
  diagnostics?: EditorDiagnostics;
  showLineNumbers?: boolean;
  lineHighlights?: ReadonlyArray<Readonly<{ fromLine: number; toLine: number; tone: 'mine' | 'theirs' }>>;
  onApply?: (transaction: DocumentTransaction) => DocumentChange | undefined;
  onHistory?: (kind: 'undo' | 'redo') => DocumentChange | undefined;
  /** The cursor's symbol path, outermost first, for breadcrumbs outside the editor. */
  onSymbolPath?: (path: readonly EditorSymbolCrumb[]) => void;
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
    const runtimeSpan = pageProjectOpenPerformance().begin('editor.runtime');
    try {
      const { CodeEditorView } = await import('#components/code/code-editor-view.client.js');
      runtimeSpan.finish(request === runtimeLoadSequence.current ? 'ok' : 'superseded');
      if (request === runtimeLoadSequence.current) {
        setFailure(undefined);
        setView(() => CodeEditorView);
      }
    } catch (error) {
      runtimeSpan.finish('error');
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
  /* The runtime and the syntax are requested from one idle gap, so the syntax reaches a mounted view
   * no later than it did when both were requested from one microtask: a syntax that lands after the
   * view mounts reconfigures it under whatever the user has already started, such as a completion. */
  const runtimeRequested = useRef(false);
  const languageId = useRef(props.languageId);
  const placeholderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    markCodeEditorMilestone('code-pane-admission', props.viewId);
    let active = true;
    runtimeRequested.current = false;
    const schedule = isShownAtMount(placeholderRef.current ?? undefined) ? whenShown : whenIdle;
    const cancel = schedule(() => {
      if (active) {
        runtimeRequested.current = true;
        void loadRuntime();
        void loadSyntax(languageId.current);
      }
    });
    return () => {
      active = false;
      cancel();
      runtimeLoadSequence.current += 1;
      syntaxController.current?.abort();
    };
  }, [loadRuntime, loadSyntax, props.viewId]);
  useEffect(() => {
    languageId.current = props.languageId;
    // Until the idle gap requests the runtime, that gap requests this language with it.
    let active = runtimeRequested.current;
    queueMicrotask(() => {
      if (active) {
        void loadSyntax(props.languageId);
      }
    });
    return () => {
      active = false;
      syntaxController.current?.abort();
    };
  }, [loadSyntax, props.languageId]);
  useEffect(() => {
    if (props.document) {
      markCodeEditorMilestone('document-ready', props.viewId);
    }
  }, [props.document, props.viewId]);
  /* Where the person scrolled the file's text before the editor mounted; the mounted view starts there, once. */
  const placeholderScroll = useRef<{ path: string; top: number; left: number } | undefined>(undefined);
  const documentPath = props.document?.path;
  const handlePlaceholderScroll = (event: UIEvent<HTMLDivElement>): void => {
    if (documentPath !== undefined) {
      const { scrollTop, scrollLeft } = event.currentTarget;
      placeholderScroll.current = { path: documentPath, top: scrollTop, left: scrollLeft };
    }
  };
  const { onMount } = props;
  const handleMount = useCallback(
    (view: EditorView, path: string): void | (() => void) => {
      const scrolled = placeholderScroll.current;
      placeholderScroll.current = undefined;
      if (scrolled?.path === path) {
        const scrollTo = (): void => {
          view.scrollDOM.scrollTop = scrolled.top;
          view.scrollDOM.scrollLeft = scrolled.left;
        };
        // Now, so the first frame is already there, and after the view's first measure, which settles its height.
        scrollTo();
        view.requestMeasure({ read: () => undefined, write: scrollTo });
      }
      return onMount?.(view, path);
    },
    [onMount],
  );
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
  const { loadingLabel, loadingText, ...viewProps } = props;
  const body =
    View && props.document ? (
      <View
        {...viewProps}
        document={props.document}
        syntaxExtension={syntax?.languageId === props.languageId ? syntax.extension : undefined}
        onMount={handleMount}
      />
    ) : (
      <EditorPanePlaceholder
        ref={placeholderRef}
        label={loadingLabel ?? 'Loading editor'}
        text={props.document?.text ?? loadingText}
        hasLineNumbers={props.showLineNumbers}
        className={props.className}
        onScroll={props.document ? handlePlaceholderScroll : undefined}
      />
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
