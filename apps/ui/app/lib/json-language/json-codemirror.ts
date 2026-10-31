import { completionTypeFromLsp } from '#components/code/editor-completion-icon.js';
import { editorCompletionInfo, renderEditorDocumentation } from '#components/code/editor-documentation.js';
import type { Extension } from '@codemirror/state';
import { autocompletion, snippet } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';
import { foldService } from '@codemirror/language';
import { hoverTooltip, keymap } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import { Topic } from '@taucad/events';
import type { EditorDocument, TextChange } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { lspSnippetToCodeMirror } from '#lib/lsp-completion-snippet.js';

type JsonDiagnostic = Readonly<{
  from: number;
  to: number;
  message: string;
  severity?: number;
  source?: string;
  code?: string | number;
}>;
type JsonCompletion = Readonly<{
  kind?: number;
  label: string;
  detail?: string;
  documentation?: string;
  insertText: string;
  isSnippet?: boolean;
  range?: { from: number; to: number };
}>;
type JsonHover = Readonly<{ text: string; range?: { from: number; to: number } }>;
type FoldRange = Readonly<{ fromLine: number; toLine: number }>;
type RequestMethod = 'validate' | 'complete' | 'hover' | 'format' | 'fold';

type OpenDocument = {
  count: number;
  unsubscribe: () => void;
  timer?: ReturnType<typeof setTimeout>;
  folds: readonly FoldRange[];
};

export class JsonBackend {
  readonly #worker = new Worker(new URL('json-language.worker.ts', import.meta.url), {
    type: 'module',
    name: 'json-language',
  });
  readonly #pending = new Map<number, PromiseWithResolvers<unknown>>();
  readonly #documents = new Map<EditorDocument, OpenDocument>();
  readonly #failures = new Topic<Error>({ name: 'JsonBackend.failures' });
  readonly #environment: EditorLanguageEnvironment;
  #nextId = 1;
  #refs = 0;
  #stopped = false;
  #stopError: Error | undefined;

  public constructor(environment: EditorLanguageEnvironment) {
    this.#environment = environment;
    this.#worker.addEventListener(
      'message',
      (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
        const pending = this.#pending.get(event.data.id);
        if (!pending) {
          return;
        }
        this.#pending.delete(event.data.id);
        if (event.data.error) {
          pending.reject(new Error(event.data.error));
        } else {
          pending.resolve(event.data.result);
        }
      },
    );
    this.#worker.addEventListener('error', (event) => {
      this.#fail(new Error(event.message || 'JSON language worker failed'));
    });
    this.#worker.addEventListener('messageerror', () => {
      this.#fail(new Error('JSON language worker sent an unreadable message'));
    });
  }

  public onFailure(listener: (error: Error) => void): () => void {
    return this.#failures.subscribe(listener);
  }

  public get stopError(): Error | undefined {
    return this.#stopError;
  }

  public retain(document: EditorDocument, environment: EditorLanguageEnvironment): void {
    this.#refs += 1;
    const existing = this.#documents.get(document);
    if (existing) {
      existing.count += 1;
      return;
    }
    const state: OpenDocument = { count: 1, unsubscribe: () => undefined, folds: [] };
    state.unsubscribe = document.subscribe(() => {
      if (state.timer) {
        clearTimeout(state.timer);
      }
      state.timer = setTimeout(() => {
        void this.#validate(document, environment, state);
      }, 150);
    });
    this.#documents.set(document, state);
    void this.#validate(document, environment, state);
  }

  public release(document: EditorDocument): boolean {
    const state = this.#documents.get(document);
    if (state) {
      state.count -= 1;
      if (state.count === 0) {
        state.unsubscribe();
        if (state.timer) {
          clearTimeout(state.timer);
        }
        this.#documents.delete(document);
      }
    }
    this.#refs -= 1;
    if (this.#refs === 0) {
      this.#stop(new Error('JSON language worker stopped'));
      return true;
    }
    return false;
  }

  public async request<T>(method: RequestMethod, document: EditorDocument, offset?: number): Promise<T> {
    if (this.#stopped) {
      throw new Error('JSON language worker stopped');
    }
    const id = this.#nextId++;
    const pending = Promise.withResolvers<unknown>();
    this.#pending.set(id, pending);
    try {
      this.#worker.postMessage({
        id,
        method,
        uri: document.uri,
        text: document.text,
        version: document.version,
        jsonc: document.path.endsWith('.jsonc'),
        offset,
      });
    } catch (error) {
      this.#fail(error instanceof Error ? error : new Error(String(error)));
    }
    return pending.promise as Promise<T>;
  }

  public folds(document: EditorDocument): readonly FoldRange[] {
    return this.#documents.get(document)?.folds ?? [];
  }

  #fail(error: Error): void {
    if (this.#stopped) {
      return;
    }
    this.#stop(error);
    this.#failures.emit(error);
  }

  #stop(error: Error): void {
    if (this.#stopped) {
      return;
    }
    this.#stopped = true;
    this.#stopError = error;
    this.#worker.terminate();
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
    for (const state of this.#documents.values()) {
      state.unsubscribe();
      if (state.timer) {
        clearTimeout(state.timer);
      }
    }
    this.#documents.clear();
    this.#environment.diagnostics.clearOwner('json-language');
  }

  async #validate(
    document: EditorDocument,
    environment: EditorLanguageEnvironment,
    state: OpenDocument,
  ): Promise<void> {
    const { version } = document;
    try {
      const [diagnostics, folds] = await Promise.all([
        this.request<readonly JsonDiagnostic[]>('validate', document),
        this.request<readonly FoldRange[]>('fold', document),
      ]);
      if (document.version !== version || this.#documents.get(document) !== state) {
        return;
      }
      state.folds = folds;
      environment.diagnostics.set(
        document.uri,
        'json-language',
        diagnostics.map((diagnostic) => ({
          from: diagnostic.from,
          to: diagnostic.to,
          message: diagnostic.message,
          severity: diagnostic.severity === 2 ? 'warning' : diagnostic.severity === 3 ? 'info' : 'error',
          source: diagnostic.source,
          code: diagnostic.code,
        })),
      );
    } catch {
      // The worker may be disposing; ordinary editing remains available.
    }
  }
}

const backends = new WeakMap<EditorLanguageEnvironment['session'], JsonBackend>();

export async function acquireJsonLanguage({
  document,
  environment,
  signal,
  onFailure,
}: Readonly<{
  document: EditorDocument;
  environment: EditorLanguageEnvironment;
  signal: AbortSignal;
  onFailure?: (error: Error) => void;
}>): Promise<{ extensions: Extension[]; dispose(): void }> {
  signal.throwIfAborted();
  if (document.path.endsWith('.jsonl')) {
    return {
      extensions: [],
      dispose() {
        /* JSONL is syntax-only and owns no worker. */
      },
    };
  }
  let backend = backends.get(environment.session);
  if (!backend) {
    backend = new JsonBackend(environment);
    backends.set(environment.session, backend);
    const created = backend;
    backend.onFailure(() => {
      if (backends.get(environment.session) === created) {
        backends.delete(environment.session);
      }
    });
  }
  backend.retain(document, environment);
  if (backend.stopError) {
    const error = backend.stopError;
    backend.release(document);
    throw error;
  }
  const active = backend;
  let disposed = false;
  const stopFailure = active.onFailure((error) => {
    if (!disposed && !signal.aborted) {
      onFailure?.(error);
    }
  });
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    signal.removeEventListener('abort', dispose);
    stopFailure();
    if (active.release(document) && backends.get(environment.session) === active) {
      backends.delete(environment.session);
    }
  };
  signal.addEventListener('abort', dispose, { once: true });

  const extensions: Extension[] = [
    autocompletion({
      override: [
        async (context) => {
          if (disposed) {
            return null;
          }
          const { version } = document;
          const items = await active
            .request<readonly JsonCompletion[]>('complete', document, context.pos)
            .catch(() => []);
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- lease may abort while worker request is pending.
          if (disposed || document.version !== version) {
            return null;
          }
          return {
            from: context.matchBefore(/[\w$-]*/)?.from ?? context.pos,
            options: items.map((item) => ({
              label: item.label,
              type: completionTypeFromLsp(item.kind),
              detail: item.detail,
              info: editorCompletionInfo(item.documentation, { languageId: 'json' }),
              // oxlint-disable-next-line max-params -- CodeMirror completion apply callback contract.
              apply(view: EditorView, completion: Completion, from: number, to: number): void {
                const range = item.range ?? { from, to };
                if (!disposed && document.version === version) {
                  if (item.isSnippet) {
                    snippet(lspSnippetToCodeMirror(item.insertText))(view, completion, range.from, range.to);
                  } else {
                    view.dispatch({ changes: { from: range.from, to: range.to, insert: item.insertText } });
                  }
                }
              },
            })),
          };
        },
      ],
    }),
    hoverTooltip(async (_view, pos) => {
      if (disposed) {
        return null;
      }
      const { version } = document;
      const result = await active.request<JsonHover | undefined>('hover', document, pos).catch(() => undefined);
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- lease may abort while worker request is pending.
      if (!result?.text || disposed || document.version !== version) {
        return null;
      }
      return {
        pos: result.range?.from ?? pos,
        end: result.range?.to,
        create() {
          const dom = renderEditorDocumentation(result.text, documentObject(), { languageId: 'json' });
          return { dom };
        },
      };
    }),
    linter(
      async () => {
        if (disposed) {
          return [];
        }
        const { version } = document;
        const diagnostics = await active.request<readonly JsonDiagnostic[]>('validate', document).catch(() => []);
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- lease may abort while worker request is pending.
        if (disposed || document.version !== version) {
          return [];
        }
        return diagnostics.map((diagnostic) => ({
          from: diagnostic.from,
          to: diagnostic.to,
          message: diagnostic.message,
          severity: diagnostic.severity === 2 ? 'warning' : diagnostic.severity === 3 ? 'info' : 'error',
        }));
      },
      { delay: 150 },
    ),
    foldService.of((state, from) => {
      const line = state.doc.lineAt(from).number - 1;
      const range = active.folds(document).find((candidate) => candidate.fromLine === line);
      return range ? { from: state.doc.line(range.fromLine + 1).to, to: state.doc.line(range.toLine + 1).to } : null;
    }),
    keymap.of([
      {
        key: 'Shift-Alt-f',
        run(view) {
          // async-iife: bootstrap -- CodeMirror command returns synchronously while worker formatting completes.
          void (async (): Promise<void> => {
            const { version } = document;
            const edits = await active.request<readonly TextChange[]>('format', document).catch(() => []);
            if (!disposed && document.version === version && edits.length > 0) {
              view.dispatch({ changes: edits });
            }
          })();
          return true;
        },
      },
    ]),
  ];
  return { extensions, dispose };
}

function documentObject(): Document {
  return globalThis.document;
}
