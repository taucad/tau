import { completionTypeFromLsp } from '#components/code/editor-completion-icon.js';
import { definitionProvider } from '#components/code/editor-definition.js';
import { startAfterLineBreaks, storeDiagnostics } from '#components/code/editor-lint.js';
import { languageFeatures } from '#components/code/editor-language-features.js';
import type { EditorLocationItem, EditorSignature, EditorSymbol } from '#components/code/editor-language-features.js';
import { editorCompletionInfo, renderEditorDocumentation } from '#components/code/editor-documentation.js';
import { StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { autocompletion, snippet } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import { Decoration, EditorView, hoverTooltip, showDialog, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { foldService } from '@codemirror/language';
import type * as LSP from 'vscode-languageserver-protocol';
import { URI, Utils } from 'vscode-uri';
import type { Node } from '@taucad/kcl-wasm-lib/bindings/Node';
import type { Program } from '@taucad/kcl-wasm-lib/bindings/Program';
import type { KclValueView } from '@taucad/kcl-wasm-lib/bindings/KclValueView';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { Topic } from '@taucad/events';
import type { EditorDocument, DocumentChange, TextChange } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { workspacePathFromFileUri } from '#lib/editor-workspace-fs/editor-workspace-fs.js';
import { applyEditorWorkspaceEdits } from '#lib/editor-workspace-edits.js';
import type { EditorWorkspaceEdit } from '#lib/editor-workspace-edits.js';
import { KclLspClient } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import { semanticTokenTypes } from '#lib/kcl-language/lsp/kcl-lsp-types.js';
import { KclSymbolService, formatModuleHover, formatSymbolHover } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import type { KclSymbol } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import { applyLspCompletion } from '#lib/lsp-completion-apply.js';
import {
  kclDefinition,
  kclDocumentationMarkdown,
  kclDocumentSymbols,
  kclOccurrences,
  kclParameterHints,
  kclReferences,
  kclSignatureAt,
  kclTypeDefinition,
  kclWorkspaceSymbols,
  kclWorkspaceFileLimit,
  kclWorkspaceSources,
  openKclTarget,
} from '#lib/kcl-language/kcl-navigation.js';
import type { KclLocation, KclNavigationContext } from '#lib/kcl-language/kcl-navigation.js';
import type { KclBindingKind, KclOutlineSymbol } from '#lib/kcl-language/kcl-bindings.js';
import { loadKclStdlib } from '#lib/kcl-language/kcl-stdlib.js';
import type { KclStdlib } from '#lib/kcl-language/kcl-stdlib.js';

type OpenDocument = { count: number; text: string; unsubscribe: () => void };
type EditBasis = ReadonlyMap<string, Readonly<{ version: number; text: string }>>;

async function captureKclBasis(document: EditorDocument, environment: EditorLanguageEnvironment): Promise<EditBasis> {
  const basis = new Map<string, { version: number; text: string }>([
    [document.uri, { version: document.version, text: document.text }],
  ]);
  const { sources, truncated } = await kclWorkspaceSources(environment, kclWorkspaceFileLimit);
  if (truncated) {
    throw new Error('KCL workspace edit exceeds the bounded source snapshot');
  }
  for (const source of sources) {
    basis.set(source.uri, { version: source.version, text: source.text });
  }
  if (document.version !== basis.get(document.uri)?.version) {
    throw new Error('KCL source changed during snapshot');
  }
  return basis;
}

function positionAt(text: string, offset: number): LSP.Position {
  const prior = text.slice(0, offset);
  const line = prior.split('\n').length - 1;
  return { line, character: offset - prior.lastIndexOf('\n') - 1 };
}

function offsetAt(text: string, position: LSP.Position): number {
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

/**
 * Offsets of a range the KCL server reported. The server writes a column-0 start as the end of the previous line, so a
 * range that starts on a line break begins on the next line.
 */
export function kclRangeOffsets(text: string, range: LSP.Range): Readonly<{ from: number; to: number }> {
  return startAfterLineBreaks(text, { from: offsetAt(text, range.start), to: offsetAt(text, range.end) });
}

export function kclImportAt(text: string, offset: number): string | undefined {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const line = text.slice(start).split('\n', 1)[0] ?? '';
  if (!/^\s*import\b/.test(line)) {
    return undefined;
  }
  for (const match of line.matchAll(/["']([^\n"']+\.kcl)["']/g)) {
    const from = start + match.index + 1;
    const to = from + (match[1]?.length ?? 0);
    if (offset >= from && offset <= to) {
      return match[1];
    }
  }
  return undefined;
}

function wordAt(text: string, offset: number): string | undefined {
  const prefix = /[\w$]+$/.exec(text.slice(0, offset))?.[0] ?? '';
  const suffix = /^[\w$]+/.exec(text.slice(offset))?.[0] ?? '';
  return `${prefix}${suffix}` || undefined;
}

export function kclHoverFallback({
  text,
  offset,
  uri,
  symbols,
}: Readonly<{ text: string; offset: number; uri: string; symbols: Pick<KclSymbolService, 'getDefinitionForUsage'> }>):
  | string
  | undefined {
  const importPath = kclImportAt(text, offset);
  if (importPath) {
    return formatModuleHover(importPath).join('\n');
  }
  const word = wordAt(text, offset);
  if (!word) {
    return undefined;
  }
  const position = positionAt(text, offset);
  const symbol = symbols.getDefinitionForUsage({ uri, line: position.line + 1, column: position.character + 1, word });
  return symbol ? formatSymbolHover(symbol).join('\n') : undefined;
}

async function observeKclOperation(
  operation: Promise<unknown>,
  document: EditorDocument,
  isDisposed: () => boolean,
): Promise<void> {
  const { version } = document;
  try {
    await operation;
  } catch (error) {
    if (isDisposed() || document.version !== version) {
      return;
    }
    // oxlint-disable-next-line no-console -- Report a live LSP action failure while preserving the text editor.
    console.warn('[kcl] language service operation failed', error);
  }
}

export class KclBackend {
  readonly #client: KclLspClient;
  readonly #symbols = new KclSymbolService();
  readonly #environment: EditorLanguageEnvironment;
  readonly #documents = new Map<EditorDocument, OpenDocument>();
  readonly #symbolUpdates = new Map<EditorDocument, Promise<void>>();
  readonly #failures = new Topic<Error>({ name: 'KclBackend.failures' });
  readonly #bootFailure = Promise.withResolvers<never>();
  #refs = 0;
  #disposed = false;
  #ready = false;

  public constructor(environment: EditorLanguageEnvironment, client?: KclLspClient) {
    this.#environment = environment;
    if (client) {
      this.#client = client;
      return;
    }
    const snapshot = environment.fileManagerRef.getSnapshot();
    const paths = new WorkspacePathResolver(snapshot.context.rootDirectory);
    this.#client = new KclLspClient({
      fs: {
        fileManager: environment.fileManager,
        treeService: environment.treeService,
        paths,
        filePoolBuffer: snapshot.context.filePoolBuffer,
      },
      onNotification: (notification) => {
        void this.#onNotification(notification);
      },
      onError: (error) => {
        this.#onWorkerFailure(error);
      },
    });
  }

  public async initialize(): Promise<void> {
    await Promise.race([this.#client.initialize(), this.#bootFailure.promise]);
    await Promise.race([this.#client.waitForReady(), this.#bootFailure.promise]);
    this.#ready = true;
    this.#symbols.setParseFunction(async (code) => {
      const [program, issues] = (await this.#client.parseKcl(code)) as [Node<Program>, Array<{ severity: string }>];
      return {
        program,
        errors: issues.filter((issue) => issue.severity !== 'Warning'),
        warnings: issues.filter((issue) => issue.severity === 'Warning'),
      };
    });
    this.#symbols.setMockExecuteFunction(async (program, path) => {
      const result = (await this.#client.executeKclMock(JSON.stringify(program), path)) as {
        variables: Partial<Record<string, KclValueView>>;
        errors: unknown[];
        sourceFiles?: Record<
          string,
          { path: { type: 'Main' } | { type: 'Local'; value: string } | { type: 'Std'; value: string }; source: string }
        >;
      };
      if (result.sourceFiles) {
        await this.#symbols.processStdlibSources(result.sourceFiles);
      }
      return result;
    });
    if (this.#disposed) {
      this.#client.dispose();
    }
  }

  public get client(): KclLspClient {
    return this.#client;
  }

  public get symbols(): KclSymbolService {
    return this.#symbols;
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
    this.#client.setCurrentDocumentUri(document.uri);
    this.#client.textDocumentDidOpen({
      textDocument: { uri: document.uri, languageId: 'kcl', version: document.version, text: document.text },
    });
    this.#refreshSymbols(document);
    entry.unsubscribe = document.subscribe((event) => {
      this.#onChange(document, entry, event);
    });
  }

  public release(document: EditorDocument): boolean {
    const entry = this.#documents.get(document);
    if (entry) {
      entry.count -= 1;
      if (entry.count === 0) {
        entry.unsubscribe();
        this.#client.textDocumentDidClose({ textDocument: { uri: document.uri } });
        this.#symbols.removeDocument(document.uri);
        this.#symbolUpdates.delete(document);
        this.#documents.delete(document);
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
    this.#dispose(true);
  }

  #dispose(notifyClose: boolean): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    if (!this.#ready) {
      this.#bootFailure.reject(new Error('KCL LSP backend stopped'));
    }
    for (const [document, entry] of this.#documents) {
      entry.unsubscribe();
      if (notifyClose) {
        this.#client.textDocumentDidClose({ textDocument: { uri: document.uri } });
      }
    }
    this.#documents.clear();
    this.#client.dispose();
    this.#symbols.clear();
    this.#symbolUpdates.clear();
    this.#environment.diagnostics.clearOwner('kcl-lsp');
  }

  #onWorkerFailure(error: Error): void {
    if (this.#disposed) {
      return;
    }
    const notify = this.#ready;
    this.#bootFailure.reject(error);
    this.#dispose(false);
    if (notify) {
      this.#failures.emit(error);
    }
  }

  #onChange(document: EditorDocument, entry: OpenDocument, event: DocumentChange): void {
    const sync = this.#client.getServerCapabilities().textDocumentSync;
    const kind = typeof sync === 'number' ? sync : sync?.change;
    const changes: LSP.TextDocumentContentChangeEvent[] =
      kind === 2
        ? [...event.changes].reverse().map((change) => ({
            range: { start: positionAt(entry.text, change.from), end: positionAt(entry.text, change.to) },
            rangeLength: change.to - change.from,
            text: change.insert,
          }))
        : [{ text: document.text }];
    this.#client.textDocumentDidChange({
      textDocument: { uri: document.uri, version: event.version },
      contentChanges: changes,
    });
    entry.text = document.text;
    this.#refreshSymbols(document);
  }

  #refreshSymbols(document: EditorDocument): void {
    const previous = this.#symbolUpdates.get(document);
    const pending = (async (): Promise<void> => {
      try {
        if (previous) {
          await previous;
        }
        if (!this.#disposed && this.#documents.has(document)) {
          await this.#symbols.updateDocument(document.uri, document.text, document.version);
        }
      } catch {
        /* Parsing may fail on an incomplete edit; LSP editing remains available. */
      }
    })();
    this.#symbolUpdates.set(document, pending);
  }

  async #onNotification(notification: LSP.NotificationMessage): Promise<void> {
    if (this.#disposed || notification.method !== 'textDocument/publishDiagnostics') {
      return;
    }
    const params = notification.params as LSP.PublishDiagnosticsParams;
    let document = [...this.#documents.keys()].find((candidate) => candidate.uri === params.uri);
    if (!document) {
      try {
        document = await this.#environment.session.getOrEnsureDocument(workspacePathFromFileUri(URI.parse(params.uri)));
      } catch {
        return;
      }
    }
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- Worker notifications may arrive after async document lookup.
    if (!document || this.#disposed || (params.version !== undefined && params.version < document.version)) {
      return;
    }
    this.#environment.diagnostics.set(
      params.uri,
      'kcl-lsp',
      params.diagnostics.map((diagnostic) => ({
        ...kclRangeOffsets(document.text, diagnostic.range),
        message: typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value,
        severity:
          diagnostic.severity === 2
            ? 'warning'
            : diagnostic.severity === 3
              ? 'info'
              : diagnostic.severity === 4
                ? 'hint'
                : 'error',
        source: diagnostic.source,
        code: typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number' ? diagnostic.code : undefined,
      })),
    );
  }
}

type SharedBackend = { backend: KclBackend; ready: Promise<KclBackend>; pending: number; active: number };
const backends = new WeakMap<EditorLanguageEnvironment['session'], SharedBackend>();

export async function acquireKclLanguage({
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
  let shared = backends.get(environment.session);
  if (!shared) {
    const backend = new KclBackend(environment);
    shared = { backend, ready: initializeBackend(backend), pending: 0, active: 0 };
    backends.set(environment.session, shared);
    backend.onFailure(() => {
      if (backends.get(environment.session)?.backend === backend) {
        backends.delete(environment.session);
      }
    });
  }
  const lease = shared;
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
      if (backends.get(environment.session)?.backend === lease.backend) {
        backends.delete(environment.session);
      }
    }
  };
  signal.addEventListener('abort', cancelPending, { once: true });
  let backend: KclBackend;
  try {
    backend = await lease.ready;
  } catch (error) {
    signal.removeEventListener('abort', cancelPending);
    cancelPending();
    if (backends.get(environment.session)?.backend === lease.backend) {
      backends.delete(environment.session);
    }
    signal.throwIfAborted();
    throw error;
  }
  if (signal.aborted) {
    signal.removeEventListener('abort', cancelPending);
    cancelPending();
    signal.throwIfAborted();
  }
  signal.removeEventListener('abort', cancelPending);
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
    if (backend.release(document) && backends.get(environment.session)?.backend === backend) {
      backends.delete(environment.session);
    }
  };
  signal.addEventListener('abort', dispose, { once: true });
  return { extensions: kclExtensions({ backend, document, environment, isDisposed: () => disposed }), dispose };
}

async function initializeBackend(backend: KclBackend): Promise<KclBackend> {
  await backend.initialize();
  return backend;
}

/** Render completion documentation; KCL passes one whose docs links open definitions. */
export type KclCompletionInfo = (markdown: string | undefined) => Completion['info'];

/** Keep the prior symbol completion text, signature and snippet behavior. */
export function symbolCompletion(
  symbol: KclSymbol,
  boost: number,
  info: KclCompletionInfo = editorCompletionInfo,
): Completion {
  if (symbol.kind === 'function') {
    const parameters = symbol.parameters ?? [];
    const signature = parameters
      .map((parameter) => `${parameter.name}${parameter.hasDefault ? '?' : ''}: ${parameter.type ?? 'unknown'}`)
      .join(', ');
    const suffix = symbol.returnType ? ` -> ${symbol.returnType}` : '';
    const fields = parameters.map((parameter, index) => `${parameter.name} = \${${index + 1}}`).join(', ');
    return {
      label: symbol.name,
      type: 'function',
      detail: `fn ${symbol.name}(${signature})${suffix}`,
      info: info(
        formatSymbolHover(symbol, { isAlias: Boolean(symbol.importPath), importPath: symbol.importPath }).join('\n'),
      ),
      boost,
      apply: snippet(`${symbol.name}(${fields})`),
    };
  }
  if (symbol.kind === 'parameter') {
    return {
      label: symbol.name,
      type: 'property',
      detail: `(param) ${symbol.name}: ${symbol.value ? 'value' : 'unknown'}`,
      info: info(symbol.containingFunction ? `Parameter of ${symbol.containingFunction}` : undefined),
      boost,
      apply: `${symbol.name} = `,
    };
  }
  return {
    label: symbol.name,
    type: 'variable',
    detail: symbol.kind,
    info: info(
      formatSymbolHover(symbol, { isAlias: Boolean(symbol.importPath), importPath: symbol.importPath }).join('\n'),
    ),
    boost,
  };
}

/** Map one KCL LSP completion to CodeMirror with its request-time version guard. */
export function kclLspCompletion(
  item: LSP.CompletionItem,
  {
    document,
    version,
    isDisposed,
    info = editorCompletionInfo,
  }: Readonly<{ document: EditorDocument; version: number; isDisposed: () => boolean; info?: KclCompletionInfo }>,
): Completion {
  return {
    label: item.filterText ?? item.label,
    displayLabel: item.filterText && item.filterText !== item.label ? item.label : undefined,
    sortText: item.sortText,
    detail: item.detail,
    info: info(typeof item.documentation === 'string' ? item.documentation : item.documentation?.value),
    type: completionTypeFromLsp(item.kind),
    boost: item.preselect ? 99 : 4,
    // oxlint-disable-next-line max-params -- CodeMirror completion apply callback contract.
    apply(view, completion, from, to) {
      if (!isDisposed()) {
        applyLspCompletion(view, completion, { item, from, to, current: document.version === version });
      }
    },
  };
}

class KclHintWidget extends WidgetType {
  readonly #label: string;
  public constructor(label: string) {
    super();
    this.#label = label;
  }
  public override eq(other: KclHintWidget): boolean {
    return other.#label === this.#label;
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- CodeMirror WidgetType requires toDOM.
  public toDOM(view: EditorView): HTMLElement {
    const span = view.dom.ownerDocument.createElement('span');
    span.className = 'cm-kcl-inlay-hint';
    span.textContent = this.#label;
    return span;
  }
}

/** The standard library declarations, or none when their chunk cannot load; links then open externally. */
async function optionalStdlib(): Promise<KclStdlib | undefined> {
  try {
    return await loadKclStdlib();
  } catch {
    return undefined;
  }
}

export function kclExtensions({
  backend,
  document,
  environment,
  isDisposed,
}: Readonly<{
  backend: KclBackend;
  document: EditorDocument;
  environment: EditorLanguageEnvironment;
  isDisposed: () => boolean;
}>): Extension[] {
  const { client } = backend;
  const { symbols } = backend;
  const navigation: KclNavigationContext = { document, environment, symbols };
  /** KCL docs links to standard library pages open the declaration, like `{@link}` in TypeScript. */
  const renderDocumentation = (
    markdown: string,
    stdlib: KclStdlib | undefined,
    ownerDocument?: Document,
  ): HTMLElement => {
    const rewritten = kclDocumentationMarkdown(markdown, stdlib);
    return renderEditorDocumentation(rewritten.markdown, ownerDocument, (index) => {
      const target = rewritten.targets[index];
      if (target && !isDisposed()) {
        void observeKclOperation(openKclTarget(environment, target), document, isDisposed);
      }
    });
  };
  const locationItem = (location: KclLocation): EditorLocationItem => {
    const path = decodeURIComponent(location.uri.replace(/^file:\/\//u, ''));
    const slash = path.lastIndexOf('/');
    return {
      label: `${path.slice(slash + 1)}:${String(location.line)}`,
      detail: path.slice(0, Math.max(slash, 0)),
      preview: location.lineText.trim(),
      open: async () =>
        observeKclOperation(
          openKclTarget(environment, { kind: 'file', uri: location.uri, line: location.line, column: location.column }),
          document,
          isDisposed,
        ),
    };
  };
  const completionInfo: KclCompletionInfo = (markdown) =>
    markdown ? async () => renderDocumentation(markdown, await optionalStdlib()) : undefined;
  const tokenEffect = StateEffect.define<ReturnType<typeof Decoration.set>>();
  const tokenField = StateField.define<ReturnType<typeof Decoration.set>>({
    create: () => Decoration.none,
    update(value, transaction) {
      // oxlint-disable-next-line unicorn/no-array-callback-reference -- RangeSet.map accepts a ChangeDesc, not a callback.
      let next = value.map(transaction.changes);
      for (const effect of transaction.effects) {
        if (effect.is(tokenEffect)) {
          next = effect.value;
        }
      }
      return next;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  let folds: readonly LSP.FoldingRange[] = [];
  return [
    tokenField,
    EditorView.baseTheme({
      '.cm-kcl-semantic-number': { color: 'var(--syntax-number, #b55b3c)' },
      '.cm-kcl-semantic-string': { color: 'var(--syntax-string, #4f8b49)' },
      '.cm-kcl-semantic-keyword': { color: 'var(--syntax-keyword, #8159a3)' },
      '.cm-kcl-semantic-function': { color: 'var(--syntax-function, #265a97)' },
      '.cm-kcl-semantic-type': { color: 'var(--syntax-type, #265a97)' },
      '.cm-kcl-semantic-comment': { color: 'var(--syntax-comment, #7a7a7a)' },
      '.cm-kcl-semantic-variable': { color: 'var(--syntax-variable, #333)' },
      '.cm-kcl-semantic-operator': { color: 'var(--syntax-operator, #333)' },
      '.cm-kcl-semantic-parameter': { color: 'var(--syntax-parameter, #92593a)' },
      '.cm-kcl-semantic-property': { color: 'var(--syntax-property, #92593a)' },
    }),
    foldService.of((state, from) => {
      const line = state.doc.lineAt(from).number - 1;
      const range = folds.find((candidate) => candidate.startLine === line && candidate.endLine > line);
      return range ? { from: state.doc.line(range.startLine + 1).to, to: state.doc.line(range.endLine + 1).to } : null;
    }),
    ViewPlugin.fromClass(
      class {
        readonly #view: EditorView;
        #timer?: ReturnType<typeof setTimeout>;
        public constructor(view: EditorView) {
          this.#view = view;
          this.refresh();
        }
        public update(update: { docChanged: boolean }): void {
          if (update.docChanged) {
            this.refresh();
          }
        }
        public destroy(): void {
          if (this.#timer) {
            clearTimeout(this.#timer);
          }
        }
        private refresh(): void {
          if (this.#timer) {
            clearTimeout(this.#timer);
          }
          this.#timer = setTimeout(() => {
            void observeKclOperation(this.load(), document, isDisposed);
          }, 100);
        }
        private async load(): Promise<void> {
          const { version, text } = document;
          const [tokens, ranges] = await Promise.all([
            client.textDocumentSemanticTokensFull({ textDocument: { uri: document.uri } }),
            client.textDocumentFoldingRange({ textDocument: { uri: document.uri } }),
          ]);
          if (isDisposed() || document.version !== version) {
            return;
          }
          folds = ranges ?? [];
          if (tokens) {
            this.#view.dispatch({ effects: tokenEffect.of(semanticDecorations(text, tokens.data)) });
          }
        }
      },
    ),
    autocompletion({
      override: [
        async (context) => {
          if (isDisposed()) {
            return null;
          }
          const { version } = document;
          const position = positionAt(document.text, context.pos);
          let result: LSP.CompletionItem[] | LSP.CompletionList | undefined;
          try {
            result = await client.textDocumentCompletion({ textDocument: { uri: document.uri }, position });
          } catch {
            /* Symbol fallback remains available. */
          }
          if (isDisposed() || document.version !== version) {
            return null;
          }
          const items = result ? (Array.isArray(result) ? result : result.items) : [];
          const options: Completion[] = items.map((item) =>
            kclLspCompletion(item, { document, version, isDisposed, info: completionInfo }),
          );
          const seen = new Set(items.map((item) => item.label));
          const addSymbols = (candidates: readonly KclSymbol[], boost: number): void => {
            for (const symbol of candidates) {
              if (!seen.has(symbol.name)) {
                seen.add(symbol.name);
                options.push(symbolCompletion(symbol, boost, completionInfo));
              }
            }
          };
          if (symbols.hasStdlib) {
            addSymbols(symbols.getStdlibSymbols(), 3);
          }
          addSymbols(symbols.getCompletableSymbols(document.uri), 2);
          const imported = await symbols.getImportedSymbolsForCompletion(document.uri, client.getFileManager());
          if (isDisposed() || document.version !== version) {
            return null;
          }
          addSymbols(imported, 1);
          return { from: context.matchBefore(/[\w$]*/)?.from ?? context.pos, options };
        },
      ],
    }),
    hoverTooltip(async (view, pos) => {
      if (isDisposed()) {
        return null;
      }
      const { version } = document;
      let result: LSP.Hover | undefined;
      try {
        result = await client.textDocumentHover({
          textDocument: { uri: document.uri },
          position: positionAt(document.text, pos),
        });
      } catch {
        /* Symbol fallback remains available. */
      }
      if (isDisposed() || document.version !== version) {
        return null;
      }
      const contents = result?.contents;
      const text =
        contents === undefined
          ? kclHoverFallback({ text: document.text, offset: pos, uri: document.uri, symbols })
          : typeof contents === 'string'
            ? contents
            : Array.isArray(contents)
              ? contents.map((part) => (typeof part === 'string' ? part : part.value)).join('\n')
              : contents.value;
      if (!text) {
        return null;
      }
      const stdlib = await optionalStdlib();
      if (isDisposed() || document.version !== version) {
        return null;
      }
      const range = result?.range ? kclRangeOffsets(document.text, result.range) : undefined;
      return {
        pos: range?.from ?? pos,
        end: range?.to,
        create() {
          const dom = renderDocumentation(text, stdlib, view.dom.ownerDocument);
          return { dom };
        },
      };
    }),
    storeDiagnostics(environment.diagnostics, document, 'kcl-lsp'),
    definitionProvider.of(async (view) =>
      observeKclOperation(jumpToDefinition(view, client, { document, environment, symbols }), document, isDisposed),
    ),
    ViewPlugin.fromClass(
      class {
        public decorations: DecorationSet = Decoration.none;
        readonly #view: EditorView;
        #generation = 0;
        public constructor(view: EditorView) {
          this.#view = view;
          void this.refresh();
        }
        public update(update: ViewUpdate): void {
          if (update.docChanged || update.viewportChanged) {
            void this.refresh();
          }
        }
        private async refresh(): Promise<void> {
          const generation = ++this.#generation;
          const { version } = document;
          const ranges = this.#view.visibleRanges;
          try {
            const groups = await Promise.all(ranges.map(async (range) => kclParameterHints(navigation, range)));
            if (generation !== this.#generation || isDisposed() || document.version !== version) {
              return;
            }
            this.decorations = Decoration.set(
              groups
                .flat()
                .map((hint) =>
                  Decoration.widget({ widget: new KclHintWidget(hint.label), side: -1 }).range(hint.position),
                ),
              true,
            );
            this.#view.dispatch({});
          } catch (error) {
            if (!isDisposed() && document.version === version) {
              // oxlint-disable-next-line no-console -- Hints are optional; editing continues without them.
              console.warn('[kcl] inlay hints failed', error);
            }
          }
        }
      },
      { decorations: (value) => value.decorations },
    ),
    languageFeatures.of({
      references: async (_view, position) => {
        const references = await kclReferences(navigation, position);
        return references.map((reference) => locationItem(reference));
      },
      occurrences: async (_view, position) => kclOccurrences(navigation, position),
      documentSymbols: async () => editorSymbols(await kclDocumentSymbols(navigation)),
      workspaceSymbols: async (_view, query) => {
        const found = await kclWorkspaceSymbols(navigation, query);
        return found.map((symbol) => {
          const item = locationItem(symbol.location);
          return { ...item, label: symbol.name, kind: symbolKind(symbol.kind), detail: item.label };
        });
      },
      signatureHelp: {
        triggerCharacters: ['(', ','],
        retriggerCharacters: [')'],
        provide: async (_view, position) => signatureAt(client, navigation, position),
      },
      typeDefinition: async (view) =>
        observeKclOperation(
          (async (): Promise<void> => {
            const target = await kclTypeDefinition(navigation, view.state.selection.main.head);
            if (target) {
              await openKclTarget(environment, target);
            }
          })(),
          document,
          isDisposed,
        ),
      rename: async (view) =>
        observeKclOperation(renameSymbol(view, client, { document, environment }), document, isDisposed),
      format: async (view) => observeKclOperation(formatDocument(view, client, document), document, isDisposed),
      quickFix: async (view) =>
        observeKclOperation(showCodeActions(view, client, { document, environment }), document, isDisposed),
    }),
  ];
}

function semanticDecorations(text: string, data: readonly number[]): ReturnType<typeof Decoration.set> {
  const ranges: Array<{ from: number; to: number; value: ReturnType<typeof Decoration.mark> }> = [];
  let line = 0;
  let character = 0;
  for (let index = 0; index + 4 < data.length; index += 5) {
    line += data[index] ?? 0;
    character = (data[index] ?? 0) === 0 ? character + (data[index + 1] ?? 0) : (data[index + 1] ?? 0);
    const from = offsetAt(text, { line, character });
    const to = Math.min(from + (data[index + 2] ?? 0), text.length);
    const kind = semanticTokenTypes[data[index + 3] ?? -1];
    if (kind && to > from) {
      ranges.push({ from, to, value: Decoration.mark({ class: `cm-kcl-semantic-${kind}` }) });
    }
  }
  return Decoration.set(ranges, true);
}

export async function jumpToDefinition(
  view: Pick<EditorView, 'state'>,
  client: Pick<KclLspClient, 'textDocumentDefinition' | 'getFileManager' | 'getServerCapabilities'>,
  {
    document,
    environment,
    symbols,
  }: Readonly<{
    document: EditorDocument;
    environment: EditorLanguageEnvironment;
    symbols: Pick<
      KclSymbolService,
      'getDefinitionForUsage' | 'resolveImportedSymbol' | 'getIndex' | 'getVariableValue'
    >;
  }>,
): Promise<void> {
  const { version } = document;
  const { head } = view.state.selection.main;
  let result: LSP.Definition | LSP.DefinitionLink[] | undefined;
  // The bundled server does not implement definitions yet; ask only once it says it does.
  if (client.getServerCapabilities().definitionProvider) {
    try {
      result = await client.textDocumentDefinition({
        textDocument: { uri: document.uri },
        position: positionAt(document.text, head),
      });
    } catch {
      /* The AST resolution below remains available. */
    }
  }
  if (document.version !== version) {
    return;
  }
  const first = Array.isArray(result) ? result[0] : result;
  if (first) {
    const uri = 'targetUri' in first ? first.targetUri : first.uri;
    const start = 'targetSelectionRange' in first ? first.targetSelectionRange.start : first.range.start;
    await environment.navigate({ uri, line: start.line + 1, column: start.character + 1 });
    return;
  }
  const importPath = kclImportAt(document.text, head);
  if (importPath) {
    const uri = Utils.joinPath(Utils.joinPath(URI.parse(document.uri), '..'), importPath).toString();
    workspacePathFromFileUri(URI.parse(uri));
    await environment.navigate({ uri, line: 1, column: 1 });
    return;
  }
  const target = await kclDefinition({ document, environment, symbols }, head);
  if (document.version !== version) {
    return;
  }
  if (target) {
    await openKclTarget(environment, target);
    return;
  }
  // Text that no longer parses keeps the last parsed symbols, so navigation survives a broken edit.
  const word = wordAt(document.text, head);
  if (!word) {
    return;
  }
  let symbol = symbols.getDefinitionForUsage({
    uri: document.uri,
    line: positionAt(document.text, head).line + 1,
    column: positionAt(document.text, head).character + 1,
    word,
  });
  if (symbol?.kind === 'import') {
    symbol = (await symbols.resolveImportedSymbol(document.uri, word, client.getFileManager())) ?? symbol;
  }
  if (symbol && document.version === version) {
    await environment.navigate({ uri: symbol.uri, line: symbol.lineNumber, column: symbol.column });
  }
}

async function formatDocument(view: EditorView, client: KclLspClient, document: EditorDocument): Promise<void> {
  const basis = { text: document.text, version: document.version };
  const edits = await client.textDocumentFormatting({
    textDocument: { uri: document.uri },
    options: { tabSize: 2, insertSpaces: true },
  });
  if (!edits || document.version !== basis.version || view.state.doc.toString() !== basis.text) {
    return;
  }
  const changes: TextChange[] = edits.map((edit) => ({
    from: offsetAt(basis.text, edit.range.start),
    to: offsetAt(basis.text, edit.range.end),
    insert: edit.newText,
  }));
  view.dispatch({ changes });
}

async function renameSymbol(
  view: EditorView,
  client: KclLspClient,
  { document, environment }: Readonly<{ document: EditorDocument; environment: EditorLanguageEnvironment }>,
): Promise<void> {
  const basis = await captureKclBasis(document, environment);
  const { version } = document;
  const position = positionAt(document.text, view.state.selection.main.head);
  const prepared = await client.textDocumentPrepareRename({ textDocument: { uri: document.uri }, position });
  if (!prepared || document.version !== version) {
    return;
  }
  const dialog = showDialog(view, {
    label: 'Rename symbol',
    input: { value: typeof prepared === 'object' && 'placeholder' in prepared ? prepared.placeholder : '' },
    submitLabel: 'Rename',
  });
  const submitted = await dialog.result;
  const name = submitted?.querySelector('input')?.value.trim();
  if (!name || document.version !== version) {
    return;
  }
  const edit = await client.textDocumentRename({ textDocument: { uri: document.uri }, position, newName: name });
  if (edit && document.version === version) {
    await applyKclWorkspaceEdit(edit, environment, basis);
  }
}

function symbolKind(kind: KclBindingKind): string {
  return kind === 'variable' || kind === 'parameter' || kind === 'tag' ? 'variable' : kind === 'type' ? 'class' : kind;
}

function editorSymbols(symbols: readonly KclOutlineSymbol[]): EditorSymbol[] {
  return symbols.map(({ binding, children }) => ({
    name: binding.name,
    kind: symbolKind(binding.kind),
    from: binding.extent.from,
    to: binding.extent.to,
    selectionFrom: binding.from,
    children: editorSymbols(children),
  }));
}

/** Server signature help where it answers, otherwise the signature resolved from the AST. */
async function signatureAt(
  client: Pick<KclLspClient, 'textDocumentSignatureHelp'>,
  navigation: KclNavigationContext,
  position: number,
): Promise<EditorSignature | undefined> {
  const { document } = navigation;
  const { version } = document;
  let result: LSP.SignatureHelp | undefined;
  try {
    result = await client.textDocumentSignatureHelp({
      textDocument: { uri: document.uri },
      position: positionAt(document.text, position),
    });
  } catch {
    /* The AST signature below remains available. */
  }
  if (document.version !== version) {
    return undefined;
  }
  const signature = result?.signatures[result.activeSignature ?? 0];
  if (!signature) {
    return kclSignatureAt(navigation, position);
  }
  const { label } = signature;
  const parameters = (signature.parameters ?? []).map((parameter): readonly [number, number] => {
    if (typeof parameter.label !== 'string') {
      return parameter.label;
    }
    const from = label.indexOf(parameter.label);
    return [from, from + parameter.label.length];
  });
  const activeParameter = signature.activeParameter ?? result?.activeParameter ?? 0;
  const markdown = (value: string | LSP.MarkupContent | undefined): string | undefined =>
    // Docs links cannot navigate the app from the shared tooltip, so they open the published page.
    value === undefined
      ? undefined
      : kclDocumentationMarkdown(typeof value === 'string' ? value : value.value, undefined).markdown;
  return {
    label,
    parameters,
    activeParameter,
    documentation: markdown(signature.documentation),
    parameterDocumentation: markdown(signature.parameters?.[activeParameter]?.documentation),
  };
}

function isStandaloneCommand(action: LSP.CodeAction | LSP.Command): action is LSP.Command {
  return typeof action.command === 'string';
}

async function showCodeActions(
  view: EditorView,
  client: KclLspClient,
  { document, environment }: Readonly<{ document: EditorDocument; environment: EditorLanguageEnvironment }>,
): Promise<void> {
  const selection = view.state.selection.main;
  const basis = await captureKclBasis(document, environment);
  const { version } = document;
  const diagnostics: LSP.Diagnostic[] = (environment.diagnostics.get(document.uri).get('kcl-lsp') ?? []).map(
    (item) => ({
      range: { start: positionAt(document.text, item.from), end: positionAt(document.text, item.to) },
      message: item.message,
      severity: item.severity === 'warning' ? 2 : item.severity === 'info' ? 3 : item.severity === 'hint' ? 4 : 1,
      source: item.source,
      code: item.code,
    }),
  );
  const actions = await client.textDocumentCodeAction({
    textDocument: { uri: document.uri },
    range: { start: positionAt(document.text, selection.from), end: positionAt(document.text, selection.to) },
    context: { diagnostics },
  });
  if (document.version !== version) {
    return;
  }
  const offered = actions?.filter((action) => 'edit' in action || 'command' in action) ?? [];
  if (offered.length === 0) {
    return;
  }
  const dialog = showDialog(view, {
    content() {
      const form = globalThis.document.createElement('form');
      const select = globalThis.document.createElement('select');
      select.name = 'action';
      for (const [index, action] of offered.entries()) {
        const option = globalThis.document.createElement('option');
        option.value = String(index);
        option.textContent = action.title;
        select.append(option);
      }
      const button = globalThis.document.createElement('button');
      button.type = 'submit';
      button.textContent = 'Apply';
      form.append(select, button);
      return form;
    },
  });
  const submitted = await dialog.result;
  const choice = Number(submitted?.querySelector('select')?.value ?? -1);
  const chosen = offered[choice];
  if (!chosen || document.version !== version) {
    return;
  }
  if ('edit' in chosen && chosen.edit) {
    await applyKclWorkspaceEdit(chosen.edit, environment, basis);
  }
  const command = isStandaloneCommand(chosen) ? chosen : chosen.command;
  if (command) {
    await client.executeCommand({ command: command.command, arguments: command.arguments });
  }
}

/** Apply a server workspace edit against current document versions before any path is changed. */
export async function applyKclWorkspaceEdit(
  edit: LSP.WorkspaceEdit,
  environment: EditorLanguageEnvironment,
  basis: EditBasis = new Map(),
): Promise<void> {
  const entries: Array<{ uri: string; version?: number; edits: LSP.TextEdit[] }> =
    edit.documentChanges?.flatMap((change) =>
      'textDocument' in change
        ? [
            {
              uri: change.textDocument.uri,
              version: change.textDocument.version ?? undefined,
              edits: change.edits as LSP.TextEdit[],
            },
          ]
        : [],
    ) ?? Object.entries(edit.changes ?? {}).map(([uri, edits]) => ({ uri, version: undefined, edits }));
  const prepared = entries.map((entry): EditorWorkspaceEdit => {
    const requestBasis = basis.get(entry.uri);
    if (!requestBasis) {
      throw new Error(`KCL workspace edit lacks a request-time source snapshot: ${entry.uri}`);
    }
    if (entry.version !== undefined && entry.version !== requestBasis.version) {
      throw new Error(`KCL workspace edit has a stale document version: ${entry.uri}`);
    }
    return {
      uri: entry.uri,
      baseText: requestBasis.text,
      workerVersion: entry.version,
      changes: entry.edits.map((item) => ({
        from: offsetAt(requestBasis.text, item.range.start),
        to: offsetAt(requestBasis.text, item.range.end),
        insert: item.newText,
      })),
    };
  });
  if (!(await applyEditorWorkspaceEdits(environment, prepared))) {
    throw new Error('KCL workspace edit was refused by the filesystem authority');
  }
}
