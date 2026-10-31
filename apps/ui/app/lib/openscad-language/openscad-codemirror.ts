import { completionTypeFromLsp } from '#components/code/editor-completion-icon.js';
import { definitionProvider } from '#components/code/editor-definition.js';
import { definitionLinkMarkdown, renderEditorDocumentation } from '#components/code/editor-documentation.js';
import { StateEffect, StateField } from '@codemirror/state';
import type { Extension, StateEffectType } from '@codemirror/state';
import { autocompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { Decoration, EditorView, hoverTooltip, keymap, showDialog, showTooltip, ViewPlugin } from '@codemirror/view';
import type { Tooltip, ViewUpdate } from '@codemirror/view';
import { setDiagnostics } from '@codemirror/lint';
import { foldService } from '@codemirror/language';
import type * as LSP from 'vscode-languageserver-protocol';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { Topic } from '@taucad/events';
import { OpenscadLanguageClient } from '@taucad/openscad-language/client';
import { openscadBuiltinsUri, openscadWorkspaceLimits } from '@taucad/openscad-language/protocol';
import type { OpenscadLanguageAssets } from '@taucad/openscad-language/protocol';
import type { EditorDocument, DocumentChange } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment, EditorNavigationTarget } from '#lib/editor-language-environment.js';
import { applyLspCompletion } from '#lib/lsp-completion-apply.js';
import { applyLspWorkspaceEdit, captureLspEditBasis } from '#lib/lsp-workspace-edit.js';
import type { LspEditBasis } from '#lib/lsp-workspace-edit.js';

/** The language server's diagnostics owner. */
const owner = 'openscad-lsp';
/** Token types and modifiers in the server's legend order (`TOKEN_TYPES` and `TOKEN_MODIFIERS` in features.rs). */
const tokenTypes = ['module', 'function', 'variable', 'parameter', 'property'] as const;
const defaultLibraryModifier = 0b10;

type OpenDocument = { text: string; unsubscribe: () => void; timer?: ReturnType<typeof setTimeout> };
// oxlint-disable-next-line typescript/no-restricted-types -- CodeMirror's tooltip facet uses null as its empty value.
type NullableTooltip = Tooltip | null;
// oxlint-disable-next-line typescript/no-restricted-types -- CodeMirror's completion sources answer null for no result.
type NullableCompletionResult = CompletionResult | null;

/** Language-server client calls the editor makes; the backend's client in production, a fake in tests. */
export type OpenscadClient = Pick<
  OpenscadLanguageClient,
  'initialize' | 'request' | 'notify' | 'refreshWorkspace' | 'dispose'
>;

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

function severityOf(severity: LSP.DiagnosticSeverity | undefined): 'error' | 'warning' | 'info' | 'hint' {
  return severity === 2 ? 'warning' : severity === 3 ? 'info' : severity === 4 ? 'hint' : 'error';
}

/** The assets the build staged (`openscad-language-assets.vite-plugin.ts`). */
function stagedAssets(): OpenscadLanguageAssets | undefined {
  return typeof tauOpenscadLanguageAssets === 'object' ? tauOpenscadLanguageAssets : undefined;
}

/**
 * Server documentation with each `[label](file:///path#Lline,column)` link the server resolved from `{@link}` turned
 * into a definition link, and the targets those links open.
 */
export function openscadDocumentation(markdown: string): {
  markdown: string;
  targets: EditorNavigationTarget[];
} {
  const targets: EditorNavigationTarget[] = [];
  const rewritten = markdown.replaceAll(
    /\[(`?)([^\]`]*)\1\]\((file:\/\/\/[^\s#)]*)#L(\d+),(\d+)\)/gu,
    // oxlint-disable-next-line max-params -- String.replaceAll callback supplies capture groups.
    (_match, code: string, label: string, uri: string, line: string, column: string) => {
      targets.push({ uri, line: Number(line), column: Number(column) });
      return definitionLinkMarkdown(label, targets.length - 1, code === '`');
    },
  );
  return { markdown: rewritten, targets };
}

async function observe(
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
    // oxlint-disable-next-line no-console -- Report a live language action failure while editing continues.
    console.warn('[openscad] language service operation failed', error);
  }
}

/** One project's OpenSCAD language worker, shared by every OpenSCAD pane in the session. */
export class OpenscadBackend {
  readonly #client: OpenscadClient;
  readonly #environment: EditorLanguageEnvironment;
  readonly #documents = new Map<EditorDocument, OpenDocument & { count: number }>();
  readonly #failures = new Topic<Error>({ name: 'OpenscadBackend.failures' });
  readonly #bootFailure = Promise.withResolvers<never>();
  #unsubscribeTree: (() => void) | undefined;
  #refreshTimer?: ReturnType<typeof setTimeout>;
  #refs = 0;
  #disposed = false;
  #ready = false;

  public constructor(environment: EditorLanguageEnvironment, client?: OpenscadClient) {
    this.#environment = environment;
    if (client) {
      this.#client = client;
      return;
    }
    const assets = stagedAssets();
    if (!assets) {
      throw new Error('The OpenSCAD language server is not built; run `pnpm nx run openscad-language:prepare`.');
    }
    const snapshot = environment.fileManagerRef.getSnapshot();
    this.#client = new OpenscadLanguageClient({
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

  public get client(): OpenscadClient {
    return this.#client;
  }

  public async initialize(): Promise<void> {
    await Promise.race([this.#client.initialize(), this.#bootFailure.promise]);
    this.#ready = true;
    if (this.#disposed) {
      this.#client.dispose();
      return;
    }
    // Closed files reach the server from the worker's own reads; a tree change sends what changed.
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
    const entry: OpenDocument & { count: number } = { count: 1, text: document.text, unsubscribe: () => undefined };
    this.#documents.set(document, entry);
    this.#client.notify('textDocument/didOpen', {
      textDocument: { uri: document.uri, languageId: 'openscad', version: document.version, text: document.text },
    } satisfies LSP.DidOpenTextDocumentParams);
    entry.unsubscribe = document.subscribe((event) => {
      this.#onChange(document, entry, event);
    });
    this.#scheduleDiagnostics(document, entry, 0);
  }

  public release(document: EditorDocument): boolean {
    const entry = this.#documents.get(document);
    if (entry) {
      entry.count -= 1;
      if (entry.count === 0) {
        this.#close(document, entry, true);
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

  #close(document: EditorDocument, entry: OpenDocument, notify: boolean): void {
    entry.unsubscribe();
    clearTimeout(entry.timer);
    if (notify) {
      this.#client.notify('textDocument/didClose', { textDocument: { uri: document.uri } });
    }
    this.#environment.diagnostics.set(document.uri, owner, []);
  }

  #dispose(notifyClose: boolean): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    if (!this.#ready) {
      this.#bootFailure.reject(new Error('OpenSCAD language backend stopped'));
    }
    for (const [document, entry] of this.#documents) {
      this.#close(document, entry, notifyClose);
    }
    this.#documents.clear();
    clearTimeout(this.#refreshTimer);
    this.#unsubscribeTree?.();
    this.#client.dispose();
    this.#environment.diagnostics.clearOwner(owner);
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
    // The server takes incremental changes (`textDocumentSync.change: 2`), applied in order against its text.
    let { text } = entry;
    const contentChanges: LSP.TextDocumentContentChangeEvent[] = [];
    for (const change of [...event.changes].reverse()) {
      contentChanges.push({
        range: { start: positionAt(text, change.from), end: positionAt(text, change.to) },
        text: change.insert,
      });
      text = `${text.slice(0, change.from)}${change.insert}${text.slice(change.to)}`;
    }
    this.#client.notify('textDocument/didChange', {
      textDocument: { uri: document.uri, version: event.version },
      contentChanges: text === document.text ? contentChanges : [{ text: document.text }],
    } satisfies LSP.DidChangeTextDocumentParams);
    entry.text = document.text;
    this.#scheduleDiagnostics(document, entry, 150);
  }

  #scheduleRefresh(): void {
    clearTimeout(this.#refreshTimer);
    this.#refreshTimer = setTimeout(() => {
      if (this.#disposed) {
        return;
      }
      this.#client.refreshWorkspace();
      // Imports that now resolve, or no longer do, change every open file's diagnostics.
      for (const [document, entry] of this.#documents) {
        this.#scheduleDiagnostics(document, entry, 100);
      }
    }, 250);
  }

  #scheduleDiagnostics(document: EditorDocument, entry: OpenDocument, debounceMilliseconds: number): void {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      void observe(this.#pullDiagnostics(document), document, () => this.#disposed);
    }, debounceMilliseconds);
  }

  async #pullDiagnostics(document: EditorDocument): Promise<void> {
    const { version, text } = document;
    const report = await this.#client.request<LSP.FullDocumentDiagnosticReport>('textDocument/diagnostic', {
      textDocument: { uri: document.uri },
    } satisfies LSP.DocumentDiagnosticParams);
    if (this.#disposed || !this.#documents.has(document) || document.version !== version) {
      return;
    }
    this.#environment.diagnostics.set(
      document.uri,
      owner,
      report.items.map((diagnostic) => ({
        from: offsetAt(text, diagnostic.range.start),
        to: offsetAt(text, diagnostic.range.end),
        message: typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value,
        severity: severityOf(diagnostic.severity),
        source: diagnostic.source,
        code: typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number' ? diagnostic.code : undefined,
      })),
    );
  }
}

type SharedBackend = { backend: OpenscadBackend; ready: Promise<OpenscadBackend>; pending: number; active: number };
const backends = new WeakMap<EditorLanguageEnvironment['session'], SharedBackend>();

async function initializeBackend(backend: OpenscadBackend): Promise<OpenscadBackend> {
  await backend.initialize();
  return backend;
}

export async function acquireOpenScadLanguage({
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
    const backend = new OpenscadBackend(environment);
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
  let backend: OpenscadBackend;
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
  return {
    extensions: openscadExtensions({ client: backend.client, document, environment, isDisposed: () => disposed }),
    dispose,
  };
}

type ExtensionContext = Readonly<{
  client: OpenscadClient;
  document: EditorDocument;
  environment: EditorLanguageEnvironment;
  isDisposed: () => boolean;
}>;

/** Open a definition target; built-ins open their generated declaration source read-only. */
async function navigateTo(
  { client, environment }: Pick<ExtensionContext, 'client' | 'environment'>,
  target: EditorNavigationTarget,
): Promise<void> {
  if (target.uri !== openscadBuiltinsUri) {
    await environment.navigate(target);
    return;
  }
  const { text } = await client.request<{ text: string }>('tau/declarationSource', { uri: target.uri });
  await environment.navigate({ ...target, declaration: { text } });
}

async function openLink(
  context: Pick<ExtensionContext, 'client' | 'environment'>,
  target: EditorNavigationTarget,
): Promise<void> {
  try {
    await navigateTo(context, target);
  } catch (error) {
    // oxlint-disable-next-line no-console -- A failed link keeps the tooltip and the editor usable.
    console.warn('[openscad] documentation link failed', error);
  }
}

function documentationDom(
  context: Pick<ExtensionContext, 'client' | 'environment'>,
  markdown: string,
  ownerDocument?: Document,
): HTMLElement {
  const { markdown: rendered, targets } = openscadDocumentation(markdown);
  return renderEditorDocumentation(rendered, ownerDocument, {
    onDefinitionLink(index) {
      const target = targets[index];
      if (target) {
        void openLink(context, target);
      }
    },
    languageId: 'openscad',
  });
}

function markupText(value: string | LSP.MarkupContent | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.value;
}

/** Map one server completion to CodeMirror; accepting it applies the server's edits, including an added import. */
export function openscadLspCompletion(
  item: LSP.CompletionItem,
  context: ExtensionContext & Readonly<{ version: number; showSignature: (view: EditorView) => void }>,
): Completion {
  const { client, document, version, isDisposed } = context;
  const documentation = markupText(item.documentation);
  return {
    label: item.filterText ?? item.label,
    displayLabel: item.filterText && item.filterText !== item.label ? item.label : undefined,
    sortText: item.sortText,
    detail: item.labelDetails?.description ?? item.detail,
    type: completionTypeFromLsp(item.kind),
    async info() {
      const resolved =
        documentation === undefined && item.data !== undefined && !isDisposed()
          ? await client.request<LSP.CompletionItem>('completionItem/resolve', item)
          : undefined;
      const markdown = [
        item.detail && item.labelDetails?.description ? `\`${item.detail}\`` : undefined,
        documentation ?? markupText(resolved?.documentation),
      ]
        .filter(Boolean)
        .join('\n\n');
      return markdown ? documentationDom(context, markdown) : null;
    },
    // oxlint-disable-next-line max-params -- CodeMirror completion apply callback contract.
    apply(view, completion, from, to) {
      if (isDisposed()) {
        return;
      }
      applyLspCompletion(view, completion, { item, from, to, current: document.version === version });
      if (item.command?.command === 'editor.action.triggerParameterHints') {
        context.showSignature(view);
      }
    },
  };
}

async function completions(
  completionContext: CompletionContext,
  context: ExtensionContext & Readonly<{ showSignature: (view: EditorView) => void }>,
): Promise<NullableCompletionResult> {
  const { client, document, isDisposed } = context;
  const word = completionContext.matchBefore(/[\w$]*/u);
  const before = completionContext.state.sliceDoc(completionContext.pos - 1, completionContext.pos);
  if (!completionContext.explicit && word?.from === word?.to && !/[<(/,$]/u.test(before)) {
    return null;
  }
  const { version } = document;
  const list = await client.request<LSP.CompletionList | undefined>('textDocument/completion', {
    textDocument: { uri: document.uri },
    position: positionAt(document.text, completionContext.pos),
  } satisfies LSP.CompletionParams);
  if (!list || isDisposed() || document.version !== version || completionContext.aborted) {
    return null;
  }
  const first = list.items[0]?.textEdit;
  const from =
    first && 'range' in first ? offsetAt(document.text, first.range.start) : (word?.from ?? completionContext.pos);
  return {
    from: Math.min(from, completionContext.pos),
    options: list.items.map((item) => openscadLspCompletion(item, { ...context, version })),
    // A complete list narrows as the word grows; an incomplete one (capped auto-imports) asks again.
    ...(list.isIncomplete ? {} : { validFor: /^[\w$]*$/u }),
  };
}

function semanticDecorations(text: string, data: readonly number[]): ReturnType<typeof Decoration.set> {
  const ranges: Array<{ from: number; to: number; value: ReturnType<typeof Decoration.mark> }> = [];
  let line = 0;
  let character = 0;
  for (let index = 0; index + 4 < data.length; index += 5) {
    const deltaLine = data[index] ?? 0;
    line += deltaLine;
    character = deltaLine === 0 ? character + (data[index + 1] ?? 0) : (data[index + 1] ?? 0);
    const from = offsetAt(text, { line, character });
    const to = Math.min(from + (data[index + 2] ?? 0), text.length);
    const kind = tokenTypes[data[index + 3] ?? -1];
    const builtin = Math.floor((data[index + 4] ?? 0) / defaultLibraryModifier) % 2 === 1;
    if (kind && to > from) {
      const className = `cm-openscad-semantic-${kind}${builtin ? ' cm-openscad-semantic-builtin' : ''}`;
      ranges.push({ from, to, value: Decoration.mark({ class: className }) });
    }
  }
  return Decoration.set(ranges, true);
}

async function showSignature(
  view: EditorView,
  {
    client,
    document,
    effect,
  }: Pick<ExtensionContext, 'client' | 'document'> & Readonly<{ effect: StateEffectType<NullableTooltip> }>,
): Promise<void> {
  const { version } = document;
  const { head } = view.state.selection.main;
  const help = await client.request<LSP.SignatureHelp | undefined>('textDocument/signatureHelp', {
    textDocument: { uri: document.uri },
    position: positionAt(document.text, head),
  } satisfies LSP.SignatureHelpParams);
  if (document.version !== version) {
    return;
  }
  const signature = help?.signatures[help.activeSignature ?? 0];
  if (!signature) {
    view.dispatch({ effects: effect.of(null) });
    return;
  }
  const active = signature.parameters?.[help.activeParameter ?? signature.activeParameter ?? 0];
  const parameterDocumentation = markupText(active?.documentation);
  view.dispatch({
    effects: effect.of({
      pos: head,
      above: true,
      create() {
        const dom = view.dom.ownerDocument.createElement('div');
        dom.className = 'cm-openscad-signature';
        const label = view.dom.ownerDocument.createElement('code');
        if (active && Array.isArray(active.label)) {
          const [start, end] = active.label;
          const strong = view.dom.ownerDocument.createElement('strong');
          strong.textContent = signature.label.slice(start, end);
          label.append(signature.label.slice(0, start), strong, signature.label.slice(end));
        } else {
          label.textContent = signature.label;
        }
        dom.append(label);
        if (parameterDocumentation) {
          dom.append(
            renderEditorDocumentation(parameterDocumentation, view.dom.ownerDocument, { languageId: 'openscad' }),
          );
        }
        return { dom };
      },
    }),
  });
}

/** The OpenSCAD sources a workspace edit may touch, snapshotted before each request. */
const openscadSources = {
  language: 'OpenSCAD',
  extension: '.scad',
  maximumFiles: openscadWorkspaceLimits.maximumFiles,
};

async function captureBasis(document: EditorDocument, environment: EditorLanguageEnvironment): Promise<LspEditBasis> {
  return captureLspEditBasis(document, environment, openscadSources);
}

/** Apply a server workspace edit against the request-time sources before any file changes. */
export async function applyOpenscadWorkspaceEdit(
  edit: LSP.WorkspaceEdit,
  environment: EditorLanguageEnvironment,
  basis: LspEditBasis,
): Promise<void> {
  await applyLspWorkspaceEdit(edit, { environment, basis, language: openscadSources.language });
}

async function renameSymbol(view: EditorView, { client, document, environment }: ExtensionContext): Promise<void> {
  const basis = await captureBasis(document, environment);
  const { version } = document;
  const position = positionAt(document.text, view.state.selection.main.head);
  const prepared = await client.request<{ range: LSP.Range; placeholder: string } | undefined>(
    'textDocument/prepareRename',
    { textDocument: { uri: document.uri }, position } satisfies LSP.PrepareRenameParams,
  );
  if (!prepared || document.version !== version) {
    return;
  }
  const dialog = showDialog(view, {
    label: 'Rename symbol',
    input: { value: prepared.placeholder },
    submitLabel: 'Rename',
  });
  const submitted = await dialog.result;
  const name = submitted?.querySelector('input')?.value.trim();
  if (!name || name === prepared.placeholder || document.version !== version) {
    return;
  }
  const edit = await client.request<LSP.WorkspaceEdit | undefined>('textDocument/rename', {
    textDocument: { uri: document.uri },
    position,
    newName: name,
  } satisfies LSP.RenameParams);
  if (edit && document.version === version) {
    await applyOpenscadWorkspaceEdit(edit, environment, basis);
  }
}

async function showCodeActions(view: EditorView, { client, document, environment }: ExtensionContext): Promise<void> {
  const selection = view.state.selection.main;
  const basis = await captureBasis(document, environment);
  const { version, text } = document;
  const diagnostics: LSP.Diagnostic[] = (environment.diagnostics.get(document.uri).get(owner) ?? []).map((item) => ({
    range: { start: positionAt(text, item.from), end: positionAt(text, item.to) },
    message: item.message,
    severity: item.severity === 'warning' ? 2 : item.severity === 'info' ? 3 : item.severity === 'hint' ? 4 : 1,
    source: item.source,
    code: item.code,
  }));
  const actions = await client.request<LSP.CodeAction[] | undefined>('textDocument/codeAction', {
    textDocument: { uri: document.uri },
    range: { start: positionAt(text, selection.from), end: positionAt(text, selection.to) },
    context: { diagnostics },
  } satisfies LSP.CodeActionParams);
  const offered = actions?.filter((action) => action.edit) ?? [];
  if (offered.length === 0 || document.version !== version) {
    return;
  }
  const dialog = showDialog(view, {
    content() {
      const form = view.dom.ownerDocument.createElement('form');
      const select = view.dom.ownerDocument.createElement('select');
      select.name = 'action';
      for (const [index, action] of offered.entries()) {
        const option = view.dom.ownerDocument.createElement('option');
        option.value = String(index);
        option.textContent = action.title;
        select.append(option);
      }
      const button = view.dom.ownerDocument.createElement('button');
      button.type = 'submit';
      button.textContent = 'Apply';
      form.append(select, button);
      return form;
    },
  });
  const submitted = await dialog.result;
  const choice = Number(submitted?.querySelector('select')?.value ?? -1);
  const chosen = offered[choice];
  if (chosen?.edit && document.version === version) {
    await applyOpenscadWorkspaceEdit(chosen.edit, environment, basis);
  }
}

async function jumpToDefinition(view: EditorView, position: number, context: ExtensionContext): Promise<void> {
  const { client, document } = context;
  const { version } = document;
  const links = await client.request<LSP.LocationLink[] | undefined>('textDocument/definition', {
    textDocument: { uri: document.uri },
    position: positionAt(view.state.doc.toString(), position),
  } satisfies LSP.DefinitionParams);
  const [link] = links ?? [];
  if (link && document.version === version && !context.isDisposed()) {
    const { start } = link.targetSelectionRange;
    await navigateTo(context, { uri: link.targetUri, line: start.line + 1, column: start.character + 1 });
  }
}

export function openscadExtensions(context: ExtensionContext): Extension[] {
  const { client, document, environment, isDisposed } = context;
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
  const signatureEffect = StateEffect.define<NullableTooltip>();
  const signatureField = StateField.define<NullableTooltip>({
    create: () => null,
    update(value, transaction) {
      let next = value;
      if (transaction.docChanged && value) {
        next = { ...value, pos: transaction.changes.mapPos(value.pos) };
      }
      for (const effect of transaction.effects) {
        if (effect.is(signatureEffect)) {
          next = effect.value;
        }
      }
      return next;
    },
    provide: (field) => showTooltip.from(field),
  });
  const signature = (view: EditorView): void => {
    void observe(showSignature(view, { client, document, effect: signatureEffect }), document, isDisposed);
  };
  let folds: readonly LSP.FoldingRange[] = [];
  return [
    tokenField,
    signatureField,
    EditorView.baseTheme({
      '.cm-openscad-semantic-module': { color: 'var(--syntax-function, #265a97)' },
      '.cm-openscad-semantic-function': { color: 'var(--syntax-function, #265a97)' },
      '.cm-openscad-semantic-parameter': { color: 'var(--syntax-parameter, #92593a)' },
      '.cm-openscad-semantic-property': { color: 'var(--syntax-property, #92593a)' },
      '.cm-openscad-semantic-builtin': { fontStyle: 'normal' },
      '.cm-openscad-signature': { padding: '2px 6px', fontFamily: 'var(--font-mono, monospace)' },
    }),
    foldService.of((state, from) => {
      const line = state.doc.lineAt(from).number - 1;
      const range = folds.find((candidate) => candidate.startLine === line && candidate.endLine > line);
      return range && range.endLine < state.doc.lines
        ? { from: state.doc.line(range.startLine + 1).to, to: state.doc.line(range.endLine + 1).to }
        : null;
    }),
    ViewPlugin.fromClass(
      class {
        readonly #view: EditorView;
        #timer?: ReturnType<typeof setTimeout>;
        public constructor(view: EditorView) {
          this.#view = view;
          this.refresh();
        }
        public update(update: ViewUpdate): void {
          if (!update.docChanged) {
            return;
          }
          this.refresh();
          // Typing `(` or `,` in a call shows the parameters, as VS Code's signature help trigger characters do.
          const typing = update.transactions.some((transaction) => transaction.isUserEvent('input.type'));
          const { head } = update.state.selection.main;
          const typed = typing ? update.state.sliceDoc(head - 1, head) : '';
          if (typed === '(' || typed === ',') {
            signature(update.view);
          } else if (typed === ')' || typed === ';') {
            update.view.dispatch({ effects: signatureEffect.of(null) });
          }
        }
        public destroy(): void {
          clearTimeout(this.#timer);
        }
        private refresh(): void {
          clearTimeout(this.#timer);
          this.#timer = setTimeout(() => {
            void observe(this.load(), document, isDisposed);
          }, 150);
        }
        private async load(): Promise<void> {
          const { version, text } = document;
          const [tokens, ranges] = await Promise.all([
            client.request<LSP.SemanticTokens>('textDocument/semanticTokens/full', {
              textDocument: { uri: document.uri },
            }),
            client.request<LSP.FoldingRange[]>('textDocument/foldingRange', { textDocument: { uri: document.uri } }),
          ]);
          if (isDisposed() || document.version !== version) {
            return;
          }
          folds = ranges;
          this.#view.dispatch({ effects: tokenEffect.of(semanticDecorations(text, tokens.data)) });
        }
      },
    ),
    autocompletion({
      override: [
        async (completionContext) => {
          if (isDisposed()) {
            return null;
          }
          const result = completions(completionContext, { ...context, showSignature: signature });
          void observe(result, document, isDisposed);
          try {
            return await result;
          } catch {
            return null;
          }
        },
      ],
    }),
    hoverTooltip(async (view, pos) => {
      if (isDisposed()) {
        return null;
      }
      const { version, text } = document;
      let hover: LSP.Hover | undefined;
      try {
        hover = await client.request<LSP.Hover | undefined>('textDocument/hover', {
          textDocument: { uri: document.uri },
          position: positionAt(text, pos),
        } satisfies LSP.HoverParams);
      } catch {
        return null;
      }
      const contents = hover?.contents;
      const markdown = contents && typeof contents === 'object' && 'value' in contents ? contents.value : undefined;
      if (!markdown || isDisposed() || document.version !== version) {
        return null;
      }
      return {
        pos: hover?.range ? offsetAt(text, hover.range.start) : pos,
        end: hover?.range ? offsetAt(text, hover.range.end) : undefined,
        create: () => ({ dom: documentationDom(context, markdown, view.dom.ownerDocument) }),
      };
    }),
    ViewPlugin.fromClass(
      class {
        readonly #unsubscribe: () => void;
        public constructor(view: EditorView) {
          const show = (): void => {
            const diagnostics = environment.diagnostics.get(document.uri).get(owner) ?? [];
            view.dispatch(
              setDiagnostics(
                view.state,
                diagnostics.map(({ from, to, message, severity }) => ({ from, to, message, severity })),
              ),
            );
          };
          this.#unsubscribe = environment.diagnostics.subscribe((event) => {
            if (event.uri === document.uri && event.owner === owner && !isDisposed()) {
              show();
            }
          });
          queueMicrotask(() => {
            if (!isDisposed()) {
              show();
            }
          });
        }
        public destroy(): void {
          this.#unsubscribe();
        }
      },
    ),
    definitionProvider.of(async (view, position) =>
      observe(jumpToDefinition(view, position, context), document, isDisposed),
    ),
    keymap.of([
      {
        key: 'F2',
        run(view) {
          void observe(renameSymbol(view, context), document, isDisposed);
          return true;
        },
      },
      {
        key: 'Ctrl-Shift-Space',
        run(view) {
          signature(view);
          return true;
        },
      },
      {
        key: 'Mod-.',
        run(view) {
          void observe(showCodeActions(view, context), document, isDisposed);
          return true;
        },
      },
      {
        key: 'Escape',
        run(view) {
          if (!view.state.field(signatureField)) {
            return false;
          }
          view.dispatch({ effects: signatureEffect.of(null) });
          return true;
        },
      },
    ]),
  ];
}
