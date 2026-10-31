import { definitionProvider } from '#components/code/editor-definition.js';
import { languageFeatures } from '#components/code/editor-language-features.js';
import { startAfterLineBreaks } from '#components/code/editor-lint.js';
import type {
  CallHierarchyDirection,
  EditorLocationItem,
  EditorOccurrence,
  EditorSignature,
  EditorSymbol,
} from '#components/code/editor-language-features.js';
import {
  renderTypeScriptDocumentation,
  typeScriptDocumentationMarkdown,
} from '#components/code/editor-documentation.js';
import type ts from 'typescript';
import { autocompletion, snippet } from '@codemirror/autocomplete';
import type { Completion, CompletionSource } from '@codemirror/autocomplete';
import { codeFolding, foldService } from '@codemirror/language';
import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { StateEffect } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { Decoration, hoverTooltip, showDialog, ViewPlugin, WidgetType } from '@codemirror/view';
import type { ViewUpdate, EditorView } from '@codemirror/view';
import type {
  TypeScriptDocumentationPart,
  TypeScriptEditBasis,
  TypeScriptHighlight,
  TypeScriptLocation,
  TypeScriptSymbolLocation,
} from '@taucad/lsp/typescript-worker/typescript-service';
import type { TypeScriptWorkerCommand } from '@taucad/lsp/typescript-worker/protocol';
import type { EditorDocument } from '#lib/editor-document.js';
import type { TypeScriptService } from '#lib/typescript-language/typescript-service.js';

export type TypeScriptExtensionOptions = Readonly<{
  document: EditorDocument;
  service: TypeScriptService;
  navigate: (
    target: Readonly<{ uri: string; line: number; column: number; declaration?: Readonly<{ text: string }> }>,
  ) => void | Promise<void>;
  publishDiagnostics?: (uri: string, version: number, diagnostics: readonly Diagnostic[]) => void;
  applyWorkspaceEdits?: (edits: readonly TypeScriptEditBasis[]) => Promise<boolean>;
  workspaceScriptUris?: () => readonly string[];
  onError?: (error: Error) => void;
}>;

type TsDiagnostic = Readonly<{ code: number; category: number; message: string; start: number; length: number }>;
type CodeFix = Readonly<{ description: string; fixName: string; edits: TypeScriptEditBasis[] }>;
type CompletionDetails = Readonly<{
  details: ts.CompletionEntryDetails | undefined;
  codeActions: ReadonlyArray<{ description: string; edits: TypeScriptEditBasis[] }>;
}>;

export type TypeScriptActions = Readonly<{
  navigateLocation(target: TypeScriptLocation): Promise<void>;
  definition(position: number): Promise<void>;
  implementation(position: number): Promise<void>;
  typeDefinition(position: number): Promise<void>;
  references(position: number): Promise<readonly TypeScriptLocation[]>;
  signatureHelp(
    position: number,
    trigger?: Readonly<{ character?: string; retrigger?: boolean }>,
  ): Promise<ts.SignatureHelpItems | undefined>;
  occurrences(position: number): Promise<readonly TypeScriptHighlight[]>;
  rename(position: number, newName: string): Promise<boolean>;
  format(from?: number, to?: number): Promise<boolean>;
  codeFixes(from: number, to: number, errorCodes: readonly number[]): Promise<readonly CodeFix[]>;
  applyCodeFix(fix: CodeFix): Promise<boolean>;
  fileRename(oldUri: string, newUri: string): Promise<boolean>;
  symbols(): Promise<ts.NavigationTree | undefined>;
  workspaceSymbols(search: string): Promise<readonly ts.NavigateToItem[]>;
  workspaceSymbolLocations(search: string): Promise<readonly TypeScriptSymbolLocation[]>;
  callLocations(position: number, direction: CallHierarchyDirection): Promise<readonly TypeScriptSymbolLocation[]>;
  prepareCallHierarchy(position: number): Promise<ts.CallHierarchyItem | readonly ts.CallHierarchyItem[] | undefined>;
  incomingCalls(position: number): Promise<readonly ts.CallHierarchyIncomingCall[]>;
  outgoingCalls(position: number): Promise<readonly ts.CallHierarchyOutgoingCall[]>;
}>;

function report(options: TypeScriptExtensionOptions, error: unknown): void {
  options.onError?.(error instanceof Error ? error : new Error(String(error)));
}

async function runAction(options: TypeScriptExtensionOptions, action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    report(options, error);
  }
}

/** All semantic requests start from an attached worker revision. */
async function revision(options: TypeScriptExtensionOptions): Promise<number> {
  await options.service.flush(options.document);
  return options.document.version;
}

function unchanged(options: TypeScriptExtensionOptions, version: number): boolean {
  return options.document.version === version;
}

async function apply(
  options: TypeScriptExtensionOptions,
  version: number,
  edits: readonly TypeScriptEditBasis[],
): Promise<boolean> {
  if (!unchanged(options, version) || edits.length === 0) {
    return false;
  }
  return options.applyWorkspaceEdits?.(edits) ?? false;
}

function mapCompletionRange(
  range: Readonly<{ from: number; to: number }>,
  edits: readonly TypeScriptEditBasis[],
  uri: string,
): Readonly<{ from: number; to: number }> | undefined {
  const { from, to } = range;
  const changes = edits
    .filter((edit) => edit.uri === uri)
    .flatMap((edit) => edit.changes)
    .sort((left, right) => left.from - right.from);
  if (
    changes.some(
      (change) =>
        (change.from < to && change.to > from) ||
        (change.from === change.to && change.from >= from && change.from < to),
    )
  ) {
    return undefined;
  }
  const map = (position: number): number | undefined => {
    let delta = 0;
    for (const change of changes) {
      if (change.to <= position) {
        delta += change.insert.length - (change.to - change.from);
      } else if (change.from < position) {
        return undefined;
      }
    }
    return position + delta;
  };
  const mappedFrom = map(from);
  const mappedTo = map(to);
  return mappedFrom === undefined || mappedTo === undefined ? undefined : { from: mappedFrom, to: mappedTo };
}

type CompletionSelection = Readonly<{
  options: TypeScriptExtensionOptions;
  view: EditorView;
  completion: Completion;
  entry: ts.CompletionEntry;
  version: number;
  from: number;
  to: number;
  extras: readonly TypeScriptEditBasis[];
}>;

/** Apply a completion and its checked imports while preserving CodeMirror snippet fields. */
export async function applyTypeScriptCompletionSelection(selection: CompletionSelection): Promise<void> {
  const { options, view, completion, entry, version, from, to, extras } = selection;
  if (!unchanged(options, version)) {
    return;
  }
  const { uri } = options.document;
  const insert = entry.insertText ?? entry.name;
  if (entry.isSnippet && entry.insertText) {
    if (extras.length === 0) {
      snippet(entry.insertText)(view, completion, from, to);
      return;
    }
    const mappedRange = mapCompletionRange({ from, to }, extras, uri);
    if (!mappedRange) {
      report(options, new Error('TypeScript completion import edit overlaps the snippet range'));
      return;
    }
    if (!(await apply(options, version, extras)) || view.state.doc.toString() !== options.document.text) {
      return;
    }
    snippet(entry.insertText)(view, completion, mappedRange.from, mappedRange.to);
    return;
  }
  const primary: TypeScriptEditBasis = {
    uri,
    baseText: options.document.text,
    workerVersion: version,
    changes: [{ from, to, insert }],
  };
  const own = extras.filter((edit) => edit.uri === uri);
  const others = extras.filter((edit) => edit.uri !== uri);
  const combined: TypeScriptEditBasis =
    own.length === 0
      ? primary
      : {
          ...primary,
          changes: [...primary.changes, ...own.flatMap((edit) => edit.changes)].sort((a, b) => a.from - b.from),
        };
  if (options.applyWorkspaceEdits) {
    await apply(options, version, [combined, ...others]);
  } else {
    view.dispatch({ changes: { from, to, insert } });
  }
}

/** Worker documentation parts carry `{@link}` locations, so links open like F12 targets. */
function documentationOf(
  info:
    | Readonly<{
        documentation?: readonly TypeScriptDocumentationPart[];
        tags?: ReadonlyArray<Readonly<{ name: string; text?: readonly TypeScriptDocumentationPart[] }>>;
      }>
    | undefined,
): Readonly<{ markdown: string; targets: readonly TypeScriptLocation[] }> {
  return typeScriptDocumentationMarkdown(info?.documentation ?? [], info?.tags ?? []);
}

/** Editor actions retain the worker's exact text basis for every touched file. */
export function createTypeScriptActions(options: TypeScriptExtensionOptions): TypeScriptActions {
  const { client } = options.service;
  const { uri } = options.document;
  const navigateTarget = async (target: TypeScriptLocation): Promise<void> => {
    if (
      target.uri.startsWith('file:///__typescript_lib__/') ||
      target.uri.startsWith('file:///cdn-types/') ||
      target.uri.startsWith('file:///node_modules/')
    ) {
      const text = await client.request<string | undefined>({ kind: 'readDeclaration', uri: target.uri });
      if (text === undefined) {
        throw new Error(`TypeScript declaration unavailable: ${target.uri}`);
      }
      await options.navigate({ ...target, declaration: { text } });
      return;
    }
    await options.navigate(target);
  };
  const locations = async (
    kind: 'definitionLocations' | 'implementationLocations' | 'typeDefinitionLocations',
    position: number,
  ): Promise<readonly TypeScriptLocation[]> => {
    const version = await revision(options);
    const targets = await client.request<readonly TypeScriptLocation[]>({
      kind,
      uri,
      position,
      expectedVersion: version,
    });
    return unchanged(options, version) ? targets : [];
  };
  const navigate = async (
    kind: 'definitionLocations' | 'implementationLocations' | 'typeDefinitionLocations',
    position: number,
  ): Promise<void> => {
    const targets = await locations(kind, position);
    const first = targets[0];
    if (first) {
      await navigateTarget(first);
    }
  };
  return {
    navigateLocation: navigateTarget,
    definition: async (position: number) => navigate('definitionLocations', position),
    implementation: async (position: number) => navigate('implementationLocations', position),
    typeDefinition: async (position: number) => navigate('typeDefinitionLocations', position),
    async references(position: number): Promise<readonly TypeScriptLocation[]> {
      const version = await revision(options);
      const references = await client.request<readonly TypeScriptLocation[]>({
        kind: 'referenceLocations',
        uri,
        position,
        expectedVersion: version,
      });
      return unchanged(options, version) ? references : [];
    },
    async signatureHelp(
      position: number,
      trigger?: Readonly<{ character?: string; retrigger?: boolean }>,
    ): Promise<ts.SignatureHelpItems | undefined> {
      const version = await revision(options);
      const help = await client.request<ts.SignatureHelpItems | undefined>({
        kind: 'signatureHelp',
        uri,
        position,
        triggerCharacter: trigger?.character,
        retrigger: trigger?.retrigger,
        expectedVersion: version,
      });
      return unchanged(options, version) ? help : undefined;
    },
    async occurrences(position: number): Promise<readonly TypeScriptHighlight[]> {
      const version = await revision(options);
      const highlights = await client.request<readonly TypeScriptHighlight[]>({
        kind: 'documentHighlights',
        uri,
        position,
        expectedVersion: version,
      });
      return unchanged(options, version) ? highlights : [];
    },
    async rename(position: number, newName: string): Promise<boolean> {
      if (!newName.trim()) {
        return false;
      }
      const version = await revision(options);
      const info = await client.request<ts.RenameInfo>({ kind: 'renameInfo', uri, position, expectedVersion: version });
      if (!info.canRename || !unchanged(options, version)) {
        return false;
      }
      const edits = await client.request<readonly TypeScriptEditBasis[]>({
        kind: 'renameEdits',
        uri,
        position,
        newName,
        expectedVersion: version,
      });
      return apply(options, version, edits);
    },
    async format(from?: number, to?: number): Promise<boolean> {
      const version = await revision(options);
      const command: TypeScriptWorkerCommand =
        from === undefined || to === undefined
          ? { kind: 'formatWithBases', uri, expectedVersion: version }
          : { kind: 'rangeFormatWithBases', uri, start: from, end: to, expectedVersion: version };
      const edits = await client.request<readonly TypeScriptEditBasis[]>(command);
      return apply(options, version, edits);
    },
    async codeFixes(from: number, to: number, errorCodes: readonly number[]): Promise<readonly CodeFix[]> {
      const version = await revision(options);
      const fixes = await client.request<readonly CodeFix[]>({
        kind: 'codeFixesWithBases',
        uri,
        start: from,
        end: to,
        codes: errorCodes,
        expectedVersion: version,
      });
      return unchanged(options, version) ? fixes : [];
    },
    async applyCodeFix(fix: CodeFix): Promise<boolean> {
      const version = await revision(options);
      return apply(options, version, fix.edits);
    },
    async fileRename(oldUri: string, newUri: string): Promise<boolean> {
      const version = await revision(options);
      const edits = await client.request<readonly TypeScriptEditBasis[]>({
        kind: 'fileRenameEditsWithBases',
        uri,
        oldUri,
        newUri,
        expectedVersion: version,
      });
      return apply(options, version, edits);
    },
    async symbols(): Promise<ts.NavigationTree | undefined> {
      const version = await revision(options);
      const symbols = await client.request<ts.NavigationTree>({
        kind: 'navigationTree',
        uri,
        expectedVersion: version,
      });
      return unchanged(options, version) ? symbols : undefined;
    },
    async workspaceSymbols(search: string): Promise<readonly ts.NavigateToItem[]> {
      if (options.workspaceScriptUris) {
        await client.request({ kind: 'setProjectFiles', uris: options.workspaceScriptUris() });
      }
      return client.request<readonly ts.NavigateToItem[]>({ kind: 'workspaceSymbols', search });
    },
    async workspaceSymbolLocations(search: string): Promise<readonly TypeScriptSymbolLocation[]> {
      if (options.workspaceScriptUris) {
        await client.request({ kind: 'setProjectFiles', uris: options.workspaceScriptUris() });
      }
      return client.request<readonly TypeScriptSymbolLocation[]>({ kind: 'workspaceSymbolLocations', search });
    },
    async callLocations(
      position: number,
      direction: CallHierarchyDirection,
    ): Promise<readonly TypeScriptSymbolLocation[]> {
      const version = await revision(options);
      const calls = await client.request<readonly TypeScriptSymbolLocation[]>({
        kind: direction === 'incoming' ? 'incomingCallLocations' : 'outgoingCallLocations',
        uri,
        position,
        expectedVersion: version,
      });
      return unchanged(options, version) ? calls : [];
    },
    async prepareCallHierarchy(
      position: number,
    ): Promise<ts.CallHierarchyItem | readonly ts.CallHierarchyItem[] | undefined> {
      const version = await revision(options);
      const item = await client.request<ts.CallHierarchyItem | readonly ts.CallHierarchyItem[] | undefined>({
        kind: 'prepareCallHierarchy',
        uri,
        position,
        expectedVersion: version,
      });
      return unchanged(options, version) ? item : undefined;
    },
    async incomingCalls(position: number): Promise<readonly ts.CallHierarchyIncomingCall[]> {
      const version = await revision(options);
      const calls = await client.request<readonly ts.CallHierarchyIncomingCall[]>({
        kind: 'incomingCalls',
        uri,
        position,
        expectedVersion: version,
      });
      return unchanged(options, version) ? calls : [];
    },
    async outgoingCalls(position: number): Promise<readonly ts.CallHierarchyOutgoingCall[]> {
      const version = await revision(options);
      const calls = await client.request<readonly ts.CallHierarchyOutgoingCall[]>({
        kind: 'outgoingCalls',
        uri,
        position,
        expectedVersion: version,
      });
      return unchanged(options, version) ? calls : [];
    },
  };
}

const environmentChanged = StateEffect.define<number>();

/** TypeScript `ScriptElementKind` as the shared symbol kind the editor renders. */
function symbolKind(kind: string): string {
  const base = kind.replace(/^local /u, '');
  return base === 'enum member' ? 'enumMember' : base === 'type parameter' ? 'typeParameter' : base;
}

function editorSymbols(items: readonly ts.NavigationTree[] | undefined): EditorSymbol[] {
  return (items ?? []).flatMap((item) => {
    const span = item.spans[0];
    if (!span) {
      return [];
    }
    return [
      {
        name: item.text,
        kind: symbolKind(item.kind),
        from: span.start,
        to: span.start + span.length,
        selectionFrom: item.nameSpan?.start ?? span.start,
        children: editorSymbols(item.childItems),
      },
    ];
  });
}

function fileLabel(location: TypeScriptLocation): Readonly<{ name: string; directory: string }> {
  const path = decodeURIComponent(location.uri.replace(/^file:\/\//u, ''));
  const slash = path.lastIndexOf('/');
  return { name: path.slice(slash + 1), directory: path.slice(0, Math.max(slash, 0)) };
}

/** TypeScript signature parts as one label with each parameter's range, like VS Code's parameter hints. */
function editorSignature(help: ts.SignatureHelpItems): EditorSignature | undefined {
  const item = help.items[help.selectedItemIndex];
  if (!item) {
    return undefined;
  }
  const text = (parts: readonly ts.SymbolDisplayPart[]): string => parts.map((part) => part.text).join('');
  const separator = text(item.separatorDisplayParts);
  let label = text(item.prefixDisplayParts);
  const parameters: Array<readonly [number, number]> = [];
  for (const [index, parameter] of item.parameters.entries()) {
    if (index > 0) {
      label += separator;
    }
    const start = label.length;
    label += text(parameter.displayParts);
    parameters.push([start, label.length]);
  }
  label += text(item.suffixDisplayParts);
  const activeParameter = Math.min(help.argumentIndex, Math.max(item.parameters.length - 1, 0));
  const documentation = typeScriptDocumentationMarkdown(item.documentation, item.tags).markdown;
  const parameterDocumentation = text(item.parameters[activeParameter]?.documentation ?? []);
  return {
    label,
    parameters,
    activeParameter,
    documentation: documentation || undefined,
    parameterDocumentation: parameterDocumentation || undefined,
    overload: { index: help.selectedItemIndex, count: help.items.length },
  };
}

class HintWidget extends WidgetType {
  private readonly label: string;
  public constructor(label: string) {
    super();
    this.label = label;
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- CodeMirror WidgetType requires toDOM.
  public toDOM(view: EditorView): HTMLElement {
    const span = view.dom.ownerDocument.createElement('span');
    span.className = 'cm-typescript-inlay-hint';
    span.textContent = this.label;
    return span;
  }
}

/** CodeMirror view layer over the project-scoped, editor-independent TS service. */
export function createTypeScriptExtensions(options: TypeScriptExtensionOptions): Extension[] {
  const { client } = options.service;
  const { uri } = options.document;
  const actions = createTypeScriptActions(options);
  const attachedViews = new WeakSet<EditorView>();
  let outlineSpans: readonly ts.OutliningSpan[] = [];
  let latestDiagnostics: readonly TsDiagnostic[] = [];
  let diagnosticsVersion = -1;
  let completionMarked = false;
  let diagnosticsMarked = false;
  const openLink =
    (targets: readonly TypeScriptLocation[]) =>
    (index: number): void => {
      const target = targets[index];
      if (target) {
        void runAction(options, async () => actions.navigateLocation(target));
      }
    };
  const locationItem = (location: TypeScriptLocation): EditorLocationItem => {
    const file = fileLabel(location);
    return {
      label: `${file.name}:${String(location.line)}`,
      detail: file.directory,
      preview: location.preview,
      open: async () => runAction(options, async () => actions.navigateLocation(location)),
    };
  };
  const symbolItem = (symbol: TypeScriptSymbolLocation): EditorLocationItem => {
    const file = fileLabel(symbol.location);
    return {
      label: symbol.name,
      kind: symbolKind(symbol.kind),
      detail: [symbol.containerName, `${file.name}:${String(symbol.location.line)}`].filter(Boolean).join(' · '),
      preview: symbol.location.preview,
      open: async () => runAction(options, async () => actions.navigateLocation(symbol.location)),
    };
  };
  const showQuickFixes = async (view: EditorView): Promise<void> => {
    const position = view.state.selection.main.head;
    const diagnostic = latestDiagnostics.find(
      (entry) => position >= entry.start && position <= entry.start + entry.length,
    );
    if (!diagnostic || diagnosticsVersion !== options.document.version) {
      return;
    }
    const fixes = await actions.codeFixes(diagnostic.start, diagnostic.start + diagnostic.length, [diagnostic.code]);
    if (fixes.length === 0) {
      return;
    }
    showDialog(view, {
      content: (current, close) => {
        const form = current.dom.ownerDocument.createElement('form');
        form.className = 'cm-typescript-code-actions';
        for (const fix of fixes) {
          const button = current.dom.ownerDocument.createElement('button');
          button.type = 'button';
          button.textContent = fix.description;
          button.addEventListener('click', () => {
            close();
            void runAction(options, async () => actions.applyCodeFix(fix));
          });
          form.append(button);
        }
        return form;
      },
    });
  };
  const renameAtCursor = async (view: EditorView): Promise<void> => {
    const position = view.state.selection.main.head;
    const version = await revision(options);
    const prepared = await client.request<ts.RenameInfo>({
      kind: 'renameInfo',
      uri,
      position,
      expectedVersion: version,
    });
    if (!prepared.canRename || !unchanged(options, version)) {
      return;
    }
    const oldName = view.state.doc.sliceString(
      prepared.triggerSpan.start,
      prepared.triggerSpan.start + prepared.triggerSpan.length,
    );
    const dialog = showDialog(view, {
      label: 'Rename symbol',
      input: { value: oldName },
      submitLabel: 'Rename',
      focus: true,
    });
    const submitted = await dialog.result;
    const newName = submitted?.querySelector('input')?.value.trim();
    if (newName && unchanged(options, version)) {
      await actions.rename(position, newName);
    }
  };
  const completionSource: CompletionSource = async (context) => {
    const word = context.matchBefore(/[\w$]*/u);
    if (!context.explicit && (!word || word.from === word.to)) {
      return null;
    }
    try {
      const version = await revision(options);
      const response = await client.request<ts.CompletionInfo | undefined>({
        kind: 'completions',
        uri,
        position: context.pos,
        expectedVersion: version,
      });
      if (!response || !unchanged(options, version) || context.aborted) {
        return null;
      }
      if (!completionMarked && context.view) {
        completionMarked = true;
        performance.mark('tau.editor.first-correct-completion', {
          detail: { viewId: context.view.dom.dataset['viewId'] },
        });
      }
      const optionsList: Completion[] = response.entries.map((entry) => ({
        label: entry.filterText ?? entry.name,
        displayLabel: entry.filterText && entry.filterText !== entry.name ? entry.name : undefined,
        sortText: entry.sortText,
        type: entry.kind,
        commitCharacters: entry.commitCharacters ?? response.defaultCommitCharacters,
        detail: entry.sourceDisplay?.map((part) => part.text).join(''),
        info: async () => {
          try {
            const details = await client.request<CompletionDetails>({
              kind: 'completionDetailsWithBases',
              uri,
              position: context.pos,
              name: entry.name,
              source: entry.source,
              data: entry.data,
              expectedVersion: version,
            });
            if (!unchanged(options, version)) {
              return null;
            }
            const documentation = documentationOf(details.details);
            const parts = details.details?.displayParts ?? [];
            if (!documentation.markdown && parts.length === 0) {
              return null;
            }
            const dom = renderTypeScriptDocumentation(parts, documentation.markdown, {
              ownerDocument: context.view?.dom.ownerDocument,
              onDefinitionLink: openLink(documentation.targets),
            });
            return dom;
          } catch (error) {
            report(options, error);
            return null;
          }
        },
        // oxlint-disable-next-line eslint/max-params -- CodeMirror fixes this callback signature.
        apply: (view, _completion, from, to) => {
          void runAction(options, async () => {
            // The list stays open while typing narrows it, so resolve the entry against the current text.
            const current = await revision(options);
            const span = current === version ? (entry.replacementSpan ?? response.optionalReplacementSpan) : undefined;
            const replaceFrom = span?.start ?? from;
            const replaceTo = span ? span.start + span.length : to;
            const details = await client.request<CompletionDetails>({
              kind: 'completionDetailsWithBases',
              uri,
              position: current === version ? context.pos : replaceTo,
              name: entry.name,
              source: entry.source,
              data: entry.data,
              expectedVersion: current,
            });
            if (!unchanged(options, current)) {
              return;
            }
            const extras = details.codeActions.flatMap((action) => action.edits);
            await applyTypeScriptCompletionSelection({
              options,
              view,
              completion: _completion,
              entry,
              version: current,
              from: replaceFrom,
              to: replaceTo,
              extras,
            });
          });
        },
      }));
      return { from: word?.from ?? context.pos, options: optionsList, validFor: /^[\w$]*$/u };
    } catch (error) {
      report(options, error);
      return null;
    }
  };

  const inlayHints = ViewPlugin.fromClass(
    class {
      public decorations = Decoration.none;
      private generation = 0;
      // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly rejects parameter properties.
      private readonly view: EditorView;
      public constructor(view: EditorView) {
        this.view = view;
        void this.refresh();
      }
      public update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          void this.refresh();
        }
      }
      private async refresh(): Promise<void> {
        const generation = ++this.generation;
        const { version } = options.document;
        const ranges = this.view.visibleRanges;
        try {
          await options.service.flush(options.document);
          const [groups, outlines] = await Promise.all([
            Promise.all(
              ranges.map(async (range) =>
                client.request<readonly ts.InlayHint[]>({
                  kind: 'inlayHints',
                  uri,
                  start: range.from,
                  end: range.to,
                  expectedVersion: version,
                }),
              ),
            ),
            client.request<readonly ts.OutliningSpan[]>({ kind: 'outliningSpans', uri, expectedVersion: version }),
          ]);
          if (generation !== this.generation || !unchanged(options, version)) {
            return;
          }
          this.decorations = Decoration.set(
            groups
              .flat()
              .map((hint) => Decoration.widget({ widget: new HintWidget(hint.text), side: 1 }).range(hint.position)),
            true,
          );
          outlineSpans = outlines;
          this.view.dispatch({});
        } catch (error) {
          report(options, error);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );

  return [
    autocompletion({ override: [completionSource] }),
    hoverTooltip(async (view, position) => {
      try {
        const version = await revision(options);
        const info = await client.request<ts.QuickInfo | undefined>({
          kind: 'quickInfo',
          uri,
          position,
          expectedVersion: version,
        });
        if (!info || !unchanged(options, version)) {
          return null;
        }
        const parts = info.displayParts ?? [];
        const documentation = documentationOf(info);
        const text = parts.length > 0 || documentation.markdown;
        return text
          ? {
              pos: info.textSpan.start,
              end: info.textSpan.start + info.textSpan.length,
              create: () => {
                const dom = renderTypeScriptDocumentation(parts, documentation.markdown, {
                  ownerDocument: view.dom.ownerDocument,
                  onDefinitionLink: openLink(documentation.targets),
                });
                dom.classList.add('cm-typescript-hover');
                return { dom };
              },
            }
          : null;
      } catch (error) {
        report(options, error);
        return null;
      }
    }),
    ViewPlugin.define((view) => {
      attachedViews.add(view);
      const unsubscribe = options.service.subscribeEnvironment(() => {
        diagnosticsVersion = -1;
        latestDiagnostics = [];
        view.dispatch({ effects: environmentChanged.of(options.service.environmentRevision) });
      });
      return {
        destroy: () => {
          attachedViews.delete(view);
          unsubscribe();
        },
      };
    }),
    linter(
      async (view) => {
        try {
          const version = await revision(options);
          let environmentRevision: number;
          let result: readonly TsDiagnostic[];
          do {
            environmentRevision = options.service.environmentRevision;
            // oxlint-disable-next-line no-await-in-loop -- retry a response invalidated by newly acquired declarations.
            result = await client.request<readonly TsDiagnostic[]>({
              kind: 'diagnostics',
              uri,
              expectedVersion: version,
            });
          } while (
            attachedViews.has(view) &&
            unchanged(options, version) &&
            environmentRevision !== options.service.environmentRevision
          );
          if (!attachedViews.has(view) || !unchanged(options, version)) {
            return [];
          }
          const diagnostics: Diagnostic[] = result.map((entry) => ({
            ...startAfterLineBreaks(view.state.doc, {
              from: entry.start,
              to: entry.start + Math.max(entry.length, 1),
            }),
            severity: entry.category === 1 ? 'error' : entry.category === 0 ? 'warning' : 'info',
            message: entry.message,
            source: 'typescript',
          }));
          if (!unchanged(options, version)) {
            return [];
          }

          latestDiagnostics = result;
          diagnosticsVersion = version;
          options.publishDiagnostics?.(uri, version, diagnostics);
          if (!diagnosticsMarked && !result.some((entry) => entry.code === 2307)) {
            diagnosticsMarked = true;
            performance.mark('tau.editor.first-correct-diagnostic', { detail: { viewId: view.dom.dataset['viewId'] } });
          }
          return diagnostics;
        } catch (error) {
          report(options, error);
          return [];
        }
      },
      {
        delay: 250,
        needsRefresh: (update) =>
          update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(environmentChanged)),
          ),
      },
    ),
    inlayHints,
    foldService.of((_state, lineStart, lineEnd) => {
      const span = outlineSpans.find(
        (candidate) =>
          candidate.textSpan.start >= lineStart &&
          candidate.textSpan.start <= lineEnd &&
          candidate.textSpan.length > lineEnd - lineStart,
      );
      return span ? { from: lineEnd, to: span.textSpan.start + span.textSpan.length } : null;
    }),
    codeFolding(),
    definitionProvider.of(async (_view, position) => runAction(options, async () => actions.definition(position))),
    languageFeatures.of({
      typeDefinition: async (view) =>
        runAction(options, async () => actions.typeDefinition(view.state.selection.main.head)),
      implementation: async (view) =>
        runAction(options, async () => actions.implementation(view.state.selection.main.head)),
      references: async (_view, position) => {
        const references = await actions.references(position);
        return references.map((reference) => locationItem(reference));
      },
      callHierarchy: async (_view, position, direction) => {
        const calls = await actions.callLocations(position, direction);
        return calls.map((call) => symbolItem(call));
      },
      documentSymbols: async () => {
        const tree = await actions.symbols();
        return editorSymbols(tree?.childItems);
      },
      workspaceSymbols: async (_view, query) => {
        const symbols = await actions.workspaceSymbolLocations(query);
        return symbols.map((symbol) => symbolItem(symbol));
      },
      occurrences: async (_view, position) => {
        const highlights = await actions.occurrences(position);
        return highlights.map(
          (highlight): EditorOccurrence => ({
            from: highlight.start,
            to: highlight.start + highlight.length,
            kind: highlight.kind,
          }),
        );
      },
      signatureHelp: {
        triggerCharacters: ['(', ',', '<'],
        retriggerCharacters: [')'],
        provide: async (_view, position, trigger) => {
          const help = await actions.signatureHelp(position, {
            character: trigger,
            retrigger: trigger !== undefined && trigger === ')',
          });
          return help && editorSignature(help);
        },
      },
      format: async () => runAction(options, async () => actions.format()),
      quickFix: async (view) => runAction(options, async () => showQuickFixes(view)),
      rename: async (view) => runAction(options, async () => renameAtCursor(view)),
    }),
  ];
}
