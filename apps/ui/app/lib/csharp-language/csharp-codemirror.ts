import { completionTypeFromLsp } from '#components/code/editor-completion-icon.js';
import { definitionProvider } from '#components/code/editor-definition.js';
import { renderEditorDocumentation } from '#components/code/editor-documentation.js';
import { autocompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { setDiagnostics } from '@codemirror/lint';
import { hoverTooltip, ViewPlugin } from '@codemirror/view';
import type { EditorView, HoverTooltipSource } from '@codemirror/view';
import type * as LSP from 'vscode-languageserver-protocol';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { Topic } from '@taucad/events';
import { CsharpLanguageClient } from '@taucad/csharp-language/client';
import { csharpMetadataUriPrefix } from '@taucad/csharp-language/protocol';
import type { CsharpLanguageAssets } from '@taucad/csharp-language/protocol';
import type { DocumentChange, EditorDocument } from '#lib/editor-document.js';
import type { EditorDiagnostic } from '#lib/editor-diagnostics.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { applyLspCompletion } from '#lib/lsp-completion-apply.js';

/** The language-server surface the editor uses; `CsharpLanguageClient` in the app, a fake in tests. */
export type CsharpClient = Pick<
  CsharpLanguageClient,
  'initialize' | 'request' | 'notify' | 'refreshWorkspace' | 'dispose'
>;

/** `textDocument/hover` with Tau's `definitionTargets`: the locations its `#tau-definition-N` links open. */
export type CsharpHover = LSP.Hover & Readonly<{ definitionTargets?: readonly LSP.Location[] }>;

const diagnosticsOwner = 'csharp-lsp';
const diagnosticsDelayMilliseconds = 250;
const workspaceRefreshDelayMilliseconds = 500;

/** The bundle this build staged (`TAU_CSHARP_LANGUAGE_STAGE`); absent builds keep C# syntax editing only. */
export const stagedCsharpLanguageAssets = (): CsharpLanguageAssets | undefined =>
  typeof tauCsharpLanguageAssets === 'undefined' ? undefined : (tauCsharpLanguageAssets ?? undefined);

export function positionAt(text: string, offset: number): LSP.Position {
  const prior = text.slice(0, offset);
  const line = prior.split('\n').length - 1;
  return { line, character: offset - prior.lastIndexOf('\n') - 1 };
}

export function offsetAt(text: string, position: LSP.Position): number {
  let offset = 0;
  for (let line = 0; line < position.line; line++) {
    const next = text.indexOf('\n', offset);
    if (next === -1) {
      return text.length;
    }
    offset = next + 1;
  }
  const end = text.indexOf('\n', offset);
  return Math.min(offset + position.character, end === -1 ? text.length : end);
}

const severities: Readonly<Partial<Record<number, EditorDiagnostic['severity']>>> = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'hint',
};

function mappedDiagnostics(text: string, diagnostics: readonly LSP.Diagnostic[]): EditorDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    from: offsetAt(text, diagnostic.range.start),
    to: offsetAt(text, diagnostic.range.end),
    message: typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value,
    severity: severities[diagnostic.severity ?? 1] ?? 'error',
    source: diagnostic.source,
    code: typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number' ? diagnostic.code : undefined,
  }));
}

type FailureScope = Readonly<{ document: EditorDocument; isDisposed: () => boolean }>;

function reportFailure(error: unknown, { document, isDisposed }: FailureScope, version: number): void {
  if (!isDisposed() && document.version === version) {
    console.warn('[csharp] language service operation failed', error);
  }
}

/** Run a language action started by a pointer or key, reporting a failure the edited text has not outdated. */
async function runReported(options: FailureScope, action: () => Promise<unknown>): Promise<void> {
  const { version } = options.document;
  try {
    await action();
  } catch (error) {
    reportFailure(error, options, version);
  }
}

type OpenDocument = { count: number; text: string; unsubscribe: () => void };

/** One project's C# language worker, shared by every C# pane of an editor session. */
export class CsharpBackend {
  readonly #client: CsharpClient;
  readonly #environment: EditorLanguageEnvironment;
  readonly #documents = new Map<EditorDocument, OpenDocument>();
  readonly #failures = new Topic<Error>({ name: 'CsharpBackend.failures' });
  readonly #bootFailure = Promise.withResolvers<never>();
  #unsubscribeTree: (() => void) | undefined;
  #diagnosticsTimer: ReturnType<typeof setTimeout> | undefined;
  #refreshTimer: ReturnType<typeof setTimeout> | undefined;
  #refs = 0;
  #ready = false;
  #disposed = false;

  public constructor(
    environment: EditorLanguageEnvironment,
    { assets, client }: Readonly<{ assets?: CsharpLanguageAssets; client?: CsharpClient }>,
  ) {
    this.#environment = environment;
    if (client) {
      this.#client = client;
      return;
    }
    if (!assets) {
      throw new Error('The C# language service bundle is not staged in this build.');
    }
    const snapshot = environment.fileManagerRef.getSnapshot();
    this.#client = new CsharpLanguageClient({
      assets,
      fs: {
        fileManager: environment.fileManager,
        treeService: environment.treeService,
        paths: new WorkspacePathResolver(snapshot.context.rootDirectory),
        filePoolBuffer: snapshot.context.filePoolBuffer,
        rootDirectory: snapshot.context.rootDirectory,
      },
      onFatal: (error) => {
        this.#onWorkerFailure(error);
      },
    });
  }

  public get client(): CsharpClient {
    return this.#client;
  }

  public async initialize(): Promise<void> {
    await Promise.race([this.#client.initialize(), this.#bootFailure.promise]);
    this.#ready = true;
    if (this.#disposed) {
      return;
    }
    this.#unsubscribeTree = this.#environment.treeService.subscribeTree(() => {
      this.#scheduleRefresh();
    });
  }

  public onFailure(listener: (error: Error) => void): () => void {
    return this.#failures.subscribe(listener);
  }

  public retain(document: EditorDocument): void {
    this.#refs += 1;
    const existing = this.#documents.get(document);
    if (existing) {
      existing.count += 1;
      return;
    }
    const entry: OpenDocument = { count: 1, text: document.text, unsubscribe: () => undefined };
    this.#documents.set(document, entry);
    this.#client.notify('textDocument/didOpen', {
      textDocument: { uri: document.uri, languageId: 'csharp', version: document.version, text: document.text },
    } satisfies LSP.DidOpenTextDocumentParams);
    entry.unsubscribe = document.subscribe((event) => {
      this.#onChange(document, entry, event);
    });
    this.#scheduleDiagnostics();
  }

  /** Release one pane's hold; returns whether the backend stopped because no pane holds it. */
  public release(document: EditorDocument): boolean {
    const entry = this.#documents.get(document);
    if (entry) {
      entry.count -= 1;
      if (entry.count === 0) {
        entry.unsubscribe();
        this.#documents.delete(document);
        this.#client.notify('textDocument/didClose', {
          textDocument: { uri: document.uri },
        } satisfies LSP.DidCloseTextDocumentParams);
        this.#environment.diagnostics.set(document.uri, diagnosticsOwner, []);
      }
    }
    this.#refs -= 1;
    if (this.#refs === 0) {
      this.dispose();
      return true;
    }
    return false;
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    if (!this.#ready) {
      this.#bootFailure.reject(new Error('C# language backend stopped'));
    }
    clearTimeout(this.#diagnosticsTimer);
    clearTimeout(this.#refreshTimer);
    this.#unsubscribeTree?.();
    for (const entry of this.#documents.values()) {
      entry.unsubscribe();
    }
    this.#documents.clear();
    this.#client.dispose();
    this.#environment.diagnostics.clearOwner(diagnosticsOwner);
  }

  #onWorkerFailure(error: Error): void {
    if (this.#disposed) {
      return;
    }
    const notify = this.#ready;
    this.#bootFailure.reject(error);
    this.dispose();
    if (notify) {
      this.#failures.emit(error);
    }
  }

  #onChange(document: EditorDocument, entry: OpenDocument, event: DocumentChange): void {
    // The server syncs incrementally; each change is relative to the text after the previous one.
    const contentChanges: LSP.TextDocumentContentChangeEvent[] = [];
    let { text } = entry;
    for (const change of [...event.changes].reverse()) {
      contentChanges.push({
        range: { start: positionAt(text, change.from), end: positionAt(text, change.to) },
        text: change.insert,
      });
      text = `${text.slice(0, change.from)}${change.insert}${text.slice(change.to)}`;
    }
    entry.text = document.text;
    this.#client.notify('textDocument/didChange', {
      textDocument: { uri: document.uri, version: event.version },
      contentChanges,
    } satisfies LSP.DidChangeTextDocumentParams);
    this.#scheduleDiagnostics();
  }

  #scheduleRefresh(): void {
    clearTimeout(this.#refreshTimer);
    this.#refreshTimer = setTimeout(() => {
      if (!this.#disposed) {
        this.#client.refreshWorkspace();
        this.#scheduleDiagnostics();
      }
    }, workspaceRefreshDelayMilliseconds);
  }

  /** Pull diagnostics for every open document: one edit can change another file's errors. */
  #scheduleDiagnostics(): void {
    clearTimeout(this.#diagnosticsTimer);
    this.#diagnosticsTimer = setTimeout(() => {
      for (const document of this.#documents.keys()) {
        void this.#pullDiagnostics(document);
      }
    }, diagnosticsDelayMilliseconds);
  }

  async #pullDiagnostics(document: EditorDocument): Promise<void> {
    const { version, text } = document;
    try {
      const report = await this.#client.request<LSP.FullDocumentDiagnosticReport>('textDocument/diagnostic', {
        textDocument: { uri: document.uri },
      } satisfies LSP.DocumentDiagnosticParams);
      if (!this.#disposed && this.#documents.has(document) && document.version === version) {
        this.#environment.diagnostics.set(document.uri, diagnosticsOwner, mappedDiagnostics(text, report.items));
      }
    } catch (error) {
      reportFailure(error, { document, isDisposed: () => this.#disposed }, version);
    }
  }
}

type SharedBackend = { backend: CsharpBackend; ready: Promise<CsharpBackend>; pending: number; active: number };
const backends = new WeakMap<EditorLanguageEnvironment['session'], SharedBackend>();

async function initializeBackend(backend: CsharpBackend): Promise<CsharpBackend> {
  await backend.initialize();
  return backend;
}

export async function acquireCsharpLanguage({
  document,
  environment,
  signal,
  onFailure,
  assets = stagedCsharpLanguageAssets(),
  createBackend = (): CsharpBackend => new CsharpBackend(environment, { assets }),
}: Readonly<{
  document: EditorDocument;
  environment: EditorLanguageEnvironment;
  signal: AbortSignal;
  onFailure?: (error: Error) => void;
  assets?: CsharpLanguageAssets;
  createBackend?: () => CsharpBackend;
}>): Promise<{ extensions: Extension[]; dispose(): void }> {
  signal.throwIfAborted();
  if (!assets) {
    return { extensions: [], dispose: () => undefined };
  }
  let shared = backends.get(environment.session);
  if (!shared) {
    const backend = createBackend();
    shared = { backend, ready: initializeBackend(backend), pending: 0, active: 0 };
    backends.set(environment.session, shared);
    backend.onFailure(() => {
      if (backends.get(environment.session)?.backend === backend) {
        backends.delete(environment.session);
      }
    });
  }
  const lease = shared;
  const forget = (): void => {
    if (backends.get(environment.session)?.backend === lease.backend) {
      backends.delete(environment.session);
    }
  };
  lease.pending += 1;
  let canceled = false;
  const cancelPending = (): void => {
    if (canceled) {
      return;
    }
    canceled = true;
    lease.pending -= 1;
    if (lease.pending === 0 && lease.active === 0) {
      lease.backend.dispose();
      forget();
    }
  };
  signal.addEventListener('abort', cancelPending, { once: true });
  let backend: CsharpBackend;
  try {
    backend = await lease.ready;
  } catch (error) {
    signal.removeEventListener('abort', cancelPending);
    cancelPending();
    forget();
    signal.throwIfAborted();
    throw error;
  }
  signal.removeEventListener('abort', cancelPending);
  if (signal.aborted) {
    cancelPending();
    signal.throwIfAborted();
  }
  lease.pending -= 1;
  lease.active += 1;
  backend.retain(document);
  let disposed = false;
  const stopFailure = backend.onFailure((error) => {
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
    lease.active -= 1;
    if (backend.release(document)) {
      forget();
    }
  };
  signal.addEventListener('abort', dispose, { once: true });
  return {
    extensions: csharpExtensions({ client: backend.client, document, environment, isDisposed: () => disposed }),
    dispose,
  };
}

type ExtensionOptions = Readonly<{
  client: CsharpClient;
  document: EditorDocument;
  environment: EditorLanguageEnvironment;
  isDisposed: () => boolean;
}>;

/** Open a definition: project files in the editor, library symbols as their generated read-only declaration. */
export async function openCsharpLocation(
  location: LSP.Location,
  { client, environment }: Pick<ExtensionOptions, 'client' | 'environment'>,
): Promise<void> {
  const line = location.range.start.line + 1;
  const column = location.range.start.character + 1;
  if (location.uri.startsWith(csharpMetadataUriPrefix)) {
    const source = await client.request<Readonly<{ uri: string; text: string }>>('tau/metadataSource', {
      uri: location.uri,
    });
    await environment.navigate({ uri: location.uri, line, column, declaration: { text: source.text } });
    return;
  }
  await environment.navigate({ uri: location.uri, line, column });
}

/** Find the completion the server offers now for the item a narrowed list still shows. */
async function currentCompletion(
  item: LSP.CompletionItem,
  { client, document }: Pick<ExtensionOptions, 'client' | 'document'>,
  offset: number,
): Promise<LSP.CompletionItem | undefined> {
  const list = await client.request<LSP.CompletionList>('textDocument/completion', {
    textDocument: { uri: document.uri },
    position: positionAt(document.text, offset),
  } satisfies LSP.CompletionParams);
  return list.items.find((candidate) => candidate.label === item.label && candidate.detail === item.detail);
}

/** Map one server completion to CodeMirror; accepting it applies the server's edits, including an added `using`. */
export function csharpCompletion(item: LSP.CompletionItem, version: number, options: ExtensionOptions): Completion {
  const { client, document, isDisposed } = options;
  let resolved: Promise<LSP.CompletionItem> | undefined;
  const resolve = async (): Promise<LSP.CompletionItem> => {
    resolved ??= client.request<LSP.CompletionItem>('completionItem/resolve', item);
    return resolved;
  };
  return {
    label: item.filterText ?? item.label,
    displayLabel: item.filterText && item.filterText !== item.label ? item.label : undefined,
    detail: item.detail,
    sortText: item.sortText,
    type: completionTypeFromLsp(item.kind),
    boost: item.preselect ? 99 : undefined,
    async info() {
      const { documentation } = await resolve();
      const markdown = typeof documentation === 'string' ? documentation : documentation?.value;
      return markdown && !isDisposed() ? renderEditorDocumentation(markdown) : null;
    },
    // oxlint-disable-next-line max-params -- CodeMirror completion apply callback contract.
    apply(view, completion, from, to) {
      const { version: acceptedVersion } = document;
      void runReported(options, async () => {
        // The list stays open while typing narrows it, and an item resolved against older text loses its `using`
        // edit, so a narrowed acceptance asks the server for the same item at the current text.
        const candidate = acceptedVersion === version ? item : await currentCompletion(item, options, to);
        const accepted =
          candidate === item
            ? await resolve()
            : candidate && (await client.request<LSP.CompletionItem>('completionItem/resolve', candidate));
        if (isDisposed() || document.version !== acceptedVersion) {
          return;
        }
        applyLspCompletion(view, completion, { item: accepted ?? item, from, to, current: accepted !== undefined });
      });
    },
  };
}

/** Hover documentation whose references link to the definitions the server resolved for them. */
export function csharpHover(options: ExtensionOptions): HoverTooltipSource {
  const { client, document, isDisposed } = options;
  const open = (location: LSP.Location | undefined): void => {
    if (!location) {
      return;
    }
    void runReported(options, async () => openCsharpLocation(location, options));
  };
  return async (view, pos) => {
    if (isDisposed()) {
      return null;
    }
    const { version } = document;
    let hover: CsharpHover | undefined;
    try {
      hover = await client.request<CsharpHover | undefined>('textDocument/hover', {
        textDocument: { uri: document.uri },
        position: positionAt(document.text, pos),
      } satisfies LSP.HoverParams);
    } catch (error) {
      reportFailure(error, options, version);
      return null;
    }
    const contents = hover?.contents;
    const markdown = contents && typeof contents === 'object' && 'kind' in contents ? contents.value : undefined;
    if (!hover || !markdown || isDisposed() || document.version !== version) {
      return null;
    }
    const targets = hover.definitionTargets ?? [];
    return {
      pos: hover.range ? offsetAt(document.text, hover.range.start) : pos,
      end: hover.range ? offsetAt(document.text, hover.range.end) : undefined,
      create: () => ({
        dom: renderEditorDocumentation(markdown, view.dom.ownerDocument, (index) => {
          open(targets[index]);
        }),
      }),
    };
  };
}

export function csharpExtensions(options: ExtensionOptions): Extension[] {
  const { client, document, environment, isDisposed } = options;
  const complete: CompletionSource = async (context) => {
    const word = context.matchBefore(/[\w@]*/u);
    const before = context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos);
    if (isDisposed() || (!context.explicit && word?.from === word?.to && before !== '.')) {
      return null;
    }
    const { version } = document;
    try {
      const list = await client.request<LSP.CompletionList>('textDocument/completion', {
        textDocument: { uri: document.uri },
        position: positionAt(document.text, context.pos),
      } satisfies LSP.CompletionParams);
      if (isDisposed() || document.version !== version) {
        return null;
      }
      return {
        from: word?.from ?? context.pos,
        options: list.items.map((item) => csharpCompletion(item, version, options)),
        validFor: /^[\w@]*$/u,
      };
    } catch (error) {
      reportFailure(error, options, version);
      return null;
    }
  };
  return [
    autocompletion({ override: [complete] }),
    hoverTooltip(csharpHover(options)),
    definitionProvider.of(async (_view, position) => {
      const { version } = document;
      try {
        const locations = await client.request<LSP.Location[]>('textDocument/definition', {
          textDocument: { uri: document.uri },
          position: positionAt(document.text, position),
        } satisfies LSP.DefinitionParams);
        const [location] = locations;
        if (location && !isDisposed() && document.version === version) {
          await openCsharpLocation(location, options);
        }
      } catch (error) {
        reportFailure(error, options, version);
      }
    }),
    ViewPlugin.define((view: EditorView) => {
      const show = (): void => {
        const diagnostics = environment.diagnostics.get(document.uri).get(diagnosticsOwner) ?? [];
        view.dispatch(setDiagnostics(view.state, [...diagnostics]));
      };
      const unsubscribe = environment.diagnostics.subscribe((event) => {
        if (event.uri === document.uri && event.owner === diagnosticsOwner) {
          show();
        }
      });
      let destroyed = false;
      queueMicrotask(() => {
        if (!destroyed && !isDisposed()) {
          show();
        }
      });
      return {
        destroy() {
          destroyed = true;
          unsubscribe();
        },
      };
    }),
  ];
}
