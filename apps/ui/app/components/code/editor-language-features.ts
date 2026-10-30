import { renderSymbolIcon } from '#components/code/editor-completion-icon.js';
import { renderEditorDocumentation } from '#components/code/editor-documentation.js';
import type { DocumentationLinkHandler } from '#components/code/editor-documentation.js';
import { Facet, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Transaction } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap, showDialog, showPanel, showTooltip } from '@codemirror/view';
import type { Command, DecorationSet, Panel, Tooltip, ViewUpdate } from '@codemirror/view';

/** A symbol in the open document, nested like an LSP `DocumentSymbol`. */
export type EditorSymbol = Readonly<{
  name: string;
  kind: string;
  detail?: string;
  from: number;
  to: number;
  /** Where the name starts; navigation lands here. */
  selectionFrom: number;
  children: readonly EditorSymbol[];
}>;

/** A navigable result that may live in another file: a workspace symbol, a reference or a caller. */
export type EditorLocationItem = Readonly<{
  label: string;
  kind?: string;
  detail?: string;
  /** The source line at the location, shown under the label like VS Code's reference peek. */
  preview?: string;
  open: () => void | Promise<void>;
}>;

/** A semantic occurrence of the symbol under the cursor. */
export type EditorOccurrence = Readonly<{ from: number; to: number; kind: 'read' | 'write' | 'text' }>;

/** One signature, with each parameter as a `[from, to)` range inside `label`. */
export type EditorSignature = Readonly<{
  label: string;
  parameters: ReadonlyArray<readonly [number, number]>;
  activeParameter: number;
  /** Markdown for the signature. */
  documentation?: string;
  /** Markdown for the active parameter. */
  parameterDocumentation?: string;
  /** Opens the definition a `#tau-definition-N` link in either documentation names. */
  onDefinitionLink?: DocumentationLinkHandler;
  overload?: Readonly<{ index: number; count: number }>;
}>;

export type EditorSignatureHelp = Readonly<{
  triggerCharacters: readonly string[];
  /** Characters that refresh an open signature without opening a closed one. */
  retriggerCharacters?: readonly string[];
  provide: (view: EditorView, position: number, trigger?: string) => Promise<EditorSignature | undefined>;
}>;

export type CallHierarchyDirection = 'incoming' | 'outgoing';

type LanguageCommand = (view: EditorView) => void | Promise<void>;

/** Each language contributes what its server supports; the editor owns the keys, menus and views. */
export type LanguageFeatures = Readonly<{
  documentSymbols?: (view: EditorView) => Promise<readonly EditorSymbol[]>;
  workspaceSymbols?: (view: EditorView, query: string) => Promise<readonly EditorLocationItem[]>;
  references?: (view: EditorView, position: number) => Promise<readonly EditorLocationItem[]>;
  callHierarchy?: (
    view: EditorView,
    position: number,
    direction: CallHierarchyDirection,
  ) => Promise<readonly EditorLocationItem[]>;
  occurrences?: (view: EditorView, position: number) => Promise<readonly EditorOccurrence[]>;
  signatureHelp?: EditorSignatureHelp;
  typeDefinition?: LanguageCommand;
  implementation?: LanguageCommand;
  rename?: LanguageCommand;
  format?: LanguageCommand;
  quickFix?: LanguageCommand;
}>;

export const languageFeatures = Facet.define<LanguageFeatures, LanguageFeatures>({
  combine: (values) => {
    let merged: LanguageFeatures = {};
    for (const value of values) {
      merged = { ...merged, ...value };
    }
    return merged;
  },
});

function featuresOf(state: EditorState): LanguageFeatures {
  return state.facet(languageFeatures);
}

function report(error: unknown): void {
  console.error(error);
}

async function run(task: () => unknown): Promise<void> {
  try {
    await task();
  } catch (error) {
    report(error);
  }
}

function moveTo(view: EditorView, position: number): void {
  view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
  view.focus();
}

type PickerItem = EditorLocationItem & Readonly<{ depth?: number }>;

type PickerMode = Readonly<{ label: string; load: (query: string) => Promise<readonly PickerItem[]> }>;

type PickerConfig = Readonly<{
  title: string;
  placeholder: string;
  modes: readonly PickerMode[];
  /** Load once and filter locally (document symbols, references) instead of querying per keystroke. */
  filterLocally: boolean;
  empty: string;
}>;

/** Subsequence match ranked prefix, then substring, then scattered, like VS Code's quick pick. */
function matchScore(label: string, query: string): number | undefined {
  if (!query) {
    return 0;
  }
  const text = label.toLowerCase();
  const needle = query.toLowerCase();
  if (text.startsWith(needle)) {
    return 0;
  }
  const index = text.indexOf(needle);
  if (index !== -1) {
    return 1 + index;
  }
  let cursor = 0;
  for (const character of needle) {
    cursor = text.indexOf(character, cursor) + 1;
    if (cursor === 0) {
      return undefined;
    }
  }
  return 1000 + cursor;
}

function filterItems(items: readonly PickerItem[], query: string): readonly PickerItem[] {
  if (!query) {
    return items;
  }
  return items
    .map((item) => ({ item, score: matchScore(item.label, query) }))
    .filter((entry): entry is { item: PickerItem; score: number } => entry.score !== undefined)
    .sort((left, right) => left.score - right.score)
    .map((entry) => ({ ...entry.item, depth: 0 }));
}

/** A quick-pick dialog: type to filter, arrow keys to move, Enter to open. */
function showPicker(view: EditorView, config: PickerConfig): void {
  const { ownerDocument } = view.dom;
  showDialog(view, {
    top: true,
    focus: 'input',
    class: 'cm-tau-picker',
    content: (_current, close) => {
      const form = ownerDocument.createElement('form');
      form.className = 'cm-picker';
      form.setAttribute('aria-label', config.title);
      const header = ownerDocument.createElement('div');
      header.className = 'cm-picker-header';
      const title = ownerDocument.createElement('span');
      title.className = 'cm-picker-title';
      title.textContent = config.title;
      header.append(title);
      const input = ownerDocument.createElement('input');
      input.type = 'search';
      input.placeholder = config.placeholder;
      input.setAttribute('aria-label', config.placeholder);
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-expanded', 'true');
      input.autocomplete = 'off';
      const list = ownerDocument.createElement('ul');
      list.className = 'cm-picker-list';
      list.setAttribute('role', 'listbox');
      list.id = `cm-picker-${String(Date.now())}`;
      input.setAttribute('aria-controls', list.id);

      let mode = config.modes[0]!;
      let loaded: readonly PickerItem[] | undefined;
      let shown: readonly PickerItem[] = [];
      let active = 0;
      let generation = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const choose = (item: PickerItem | undefined): void => {
        if (!item) {
          return;
        }
        close();
        void run(item.open);
      };
      const highlight = (index: number): void => {
        active = Math.max(0, Math.min(index, shown.length - 1));
        for (const [position, element] of [...list.children].entries()) {
          const selected = position === active;
          element.setAttribute('aria-selected', String(selected));
          if (selected) {
            input.setAttribute('aria-activedescendant', element.id);
            element.scrollIntoView({ block: 'nearest' });
          }
        }
      };
      const render = (items: readonly PickerItem[]): void => {
        shown = items;
        list.replaceChildren();
        if (items.length === 0) {
          const empty = ownerDocument.createElement('li');
          empty.className = 'cm-picker-empty';
          empty.textContent = config.empty;
          list.append(empty);
          input.removeAttribute('aria-activedescendant');
          return;
        }
        for (const [index, item] of items.entries()) {
          const option = ownerDocument.createElement('li');
          option.id = `${list.id}-${String(index)}`;
          option.className = 'cm-picker-item';
          option.setAttribute('role', 'option');
          option.style.paddingInlineStart = `calc(var(--spacing) * ${String(2 + (item.depth ?? 0) * 4)})`;
          const line = ownerDocument.createElement('div');
          line.className = 'cm-picker-line';
          if (item.kind) {
            line.append(renderSymbolIcon(item.kind, ownerDocument));
          }
          const label = ownerDocument.createElement('span');
          label.className = 'cm-picker-label';
          label.textContent = item.label;
          line.append(label);
          if (item.detail) {
            const detail = ownerDocument.createElement('span');
            detail.className = 'cm-picker-detail';
            detail.textContent = item.detail;
            line.append(detail);
          }
          option.append(line);
          if (item.preview) {
            const preview = ownerDocument.createElement('code');
            preview.className = 'cm-picker-preview';
            preview.textContent = item.preview;
            option.append(preview);
          }
          option.dataset['index'] = String(index);
          list.append(option);
        }
        highlight(0);
      };
      const optionIndex = (event: Event): number | undefined => {
        const option = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-index]') : null;
        return option ? Number(option.dataset['index']) : undefined;
      };
      list.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      list.addEventListener('click', (event) => {
        const index = optionIndex(event);
        if (index !== undefined) {
          choose(shown[index]);
        }
      });
      list.addEventListener('mousemove', (event) => {
        const index = optionIndex(event);
        if (index !== undefined && index !== active) {
          highlight(index);
        }
      });
      const refresh = async (): Promise<void> => {
        const current = ++generation;
        const query = input.value.trim();
        try {
          if (config.filterLocally) {
            loaded ??= await mode.load('');
            if (current === generation) {
              render(filterItems(loaded, query));
            }
            return;
          }
          const items = await mode.load(query);
          if (current === generation) {
            render(items);
          }
        } catch (error) {
          report(error);
          if (current === generation) {
            render([]);
          }
        }
      };
      if (config.modes.length > 1) {
        const toggles = ownerDocument.createElement('div');
        toggles.className = 'cm-picker-modes';
        toggles.setAttribute('role', 'group');
        const select = (candidate: PickerMode, button: HTMLButtonElement): void => {
          mode = candidate;
          loaded = undefined;
          for (const element of toggles.children) {
            element.setAttribute('aria-pressed', String(element === button));
          }
          void refresh();
          input.focus();
        };
        toggles.append(
          ...config.modes.map((candidate) => {
            const button = ownerDocument.createElement('button');
            button.type = 'button';
            button.textContent = candidate.label;
            button.setAttribute('aria-pressed', String(candidate === mode));
            button.addEventListener('click', () => {
              select(candidate, button);
            });
            return button;
          }),
        );
        header.append(toggles);
      }
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(
          () => {
            void refresh();
          },
          config.filterLocally ? 0 : 120,
        );
      });
      input.addEventListener('keydown', (event) => {
        switch (event.key) {
          case 'ArrowDown': {
            event.preventDefault();
            highlight(active + 1);
            break;
          }
          case 'ArrowUp': {
            event.preventDefault();
            highlight(active - 1);
            break;
          }
          case 'Enter': {
            event.preventDefault();
            choose(shown[active]);
            break;
          }
          default:
        }
      });
      form.append(header, input, list);
      void refresh();
      return form;
    },
  });
}

function flattenSymbols(symbols: readonly EditorSymbol[], depth = 0): Array<EditorSymbol & { depth: number }> {
  return symbols.flatMap((symbol) => [{ ...symbol, depth }, ...flattenSymbols(symbol.children, depth + 1)]);
}

function symbolItems(view: EditorView, symbols: readonly EditorSymbol[]): readonly PickerItem[] {
  return flattenSymbols(symbols).map((symbol) => ({
    label: symbol.name,
    kind: symbol.kind,
    detail: symbol.detail,
    depth: symbol.depth,
    open: () => {
      moveTo(view, symbol.selectionFrom);
    },
  }));
}

/** The innermost-last chain of symbols that contain `position`. */
export function symbolPathAt(symbols: readonly EditorSymbol[], position: number): readonly EditorSymbol[] {
  const path: EditorSymbol[] = [];
  let level = symbols;
  for (;;) {
    const next = level.find((symbol) => symbol.from <= position && position <= symbol.to);
    if (!next) {
      return path;
    }
    path.push(next);
    level = next.children;
  }
}

export const goToSymbolInEditor: Command = (view) => {
  const provider = featuresOf(view.state).documentSymbols;
  if (!provider) {
    return false;
  }
  showPicker(view, {
    title: 'Go to Symbol in Editor',
    placeholder: 'Type to filter symbols',
    empty: 'No symbols found',
    filterLocally: true,
    modes: [{ label: 'Symbols', load: async () => symbolItems(view, await provider(view)) }],
  });
  return true;
};

export const goToSymbolInWorkspace: Command = (view) => {
  const provider = featuresOf(view.state).workspaceSymbols;
  if (!provider) {
    return false;
  }
  showPicker(view, {
    title: 'Go to Symbol in Workspace',
    placeholder: 'Type a symbol name',
    empty: 'No matching symbols',
    filterLocally: false,
    modes: [{ label: 'Symbols', load: async (query) => (query ? provider(view, query) : []) }],
  });
  return true;
};

export const findAllReferences: Command = (view) => {
  const provider = featuresOf(view.state).references;
  if (!provider) {
    return false;
  }
  const position = view.state.selection.main.head;
  void run(async () => {
    const references = await provider(view, position);
    showPicker(view, {
      title: `${String(references.length)} ${references.length === 1 ? 'reference' : 'references'}`,
      placeholder: 'Filter references',
      empty: 'No references found',
      filterLocally: true,
      modes: [{ label: 'References', load: async () => references }],
    });
  });
  return true;
};

export const showCallHierarchy: Command = (view) => {
  const provider = featuresOf(view.state).callHierarchy;
  if (!provider) {
    return false;
  }
  const position = view.state.selection.main.head;
  showPicker(view, {
    title: 'Call Hierarchy',
    placeholder: 'Filter calls',
    empty: 'No calls found',
    filterLocally: true,
    modes: [
      { label: 'Incoming', load: async () => provider(view, position, 'incoming') },
      { label: 'Outgoing', load: async () => provider(view, position, 'outgoing') },
    ],
  });
  return true;
};

function commandFor(
  name: 'typeDefinition' | 'implementation' | 'rename' | 'format' | 'quickFix',
  writes: boolean,
): Command {
  return (view) => {
    const command = featuresOf(view.state)[name];
    if (!command || (writes && view.state.readOnly)) {
      return false;
    }
    void run(async () => command(view));
    return true;
  };
}

export const goToTypeDefinition = commandFor('typeDefinition', false);
export const goToImplementation = commandFor('implementation', false);
export const renameSymbol = commandFor('rename', true);
export const formatDocument = commandFor('format', true);
export const quickFix = commandFor('quickFix', true);

const setSignature = StateEffect.define<Tooltip | undefined>();

const signatureField = StateField.define<Tooltip | undefined>({
  create: () => undefined,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSignature)) {
        return effect.value;
      }
    }
    return value && transaction.docChanged ? { ...value, pos: transaction.changes.mapPos(value.pos) } : value;
  },
  provide: (field) => showTooltip.from(field, (value) => value ?? null),
});

function renderSignature(view: EditorView, signature: EditorSignature): HTMLElement {
  const { ownerDocument } = view.dom;
  const dom = ownerDocument.createElement('div');
  dom.className = 'cm-signature-help';
  const line = ownerDocument.createElement('div');
  line.className = 'cm-signature-label';
  if (signature.overload && signature.overload.count > 1) {
    const overload = ownerDocument.createElement('span');
    overload.className = 'cm-signature-overload';
    overload.textContent = `${String(signature.overload.index + 1)}/${String(signature.overload.count)}`;
    line.append(overload);
  }
  const range = signature.parameters[signature.activeParameter];
  if (range) {
    const active = ownerDocument.createElement('span');
    active.className = 'cm-signature-active-parameter';
    active.textContent = signature.label.slice(range[0], range[1]);
    line.append(signature.label.slice(0, range[0]), active, signature.label.slice(range[1]));
  } else {
    line.append(signature.label);
  }
  dom.append(line);
  for (const markdown of [signature.parameterDocumentation, signature.documentation]) {
    if (markdown) {
      dom.append(renderEditorDocumentation(markdown, ownerDocument, signature.onDefinitionLink));
    }
  }
  return dom;
}

function typedCharacter(transaction: Transaction): string | undefined {
  if (!transaction.isUserEvent('input.type') && !transaction.isUserEvent('input.complete')) {
    return undefined;
  }
  let inserted = '';
  // oxlint-disable-next-line eslint/max-params -- CodeMirror fixes this callback signature.
  transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, text) => {
    inserted = text.toString();
  });
  // Bracket closing inserts `()` for a typed `(`, so the typed character is the first one inserted.
  return inserted.slice(0, 1) || undefined;
}

/** Parameter hints open on a trigger character and follow the cursor until the call ends, like VS Code. */
const signatureHelpPlugin = ViewPlugin.fromClass(
  class {
    private generation = 0;
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly rejects parameter properties.
    private readonly view: EditorView;
    public constructor(view: EditorView) {
      this.view = view;
    }
    public update(update: ViewUpdate): void {
      const help = featuresOf(update.state).signatureHelp;
      if (!help) {
        return;
      }
      const open = update.state.field(signatureField) !== undefined;
      if (update.docChanged) {
        const typed = update.transactions.map(typedCharacter).find(Boolean);
        if (typed && help.triggerCharacters.includes(typed)) {
          void this.request(typed);
        } else if (open) {
          void this.request(typed && help.retriggerCharacters?.includes(typed) ? typed : undefined);
        }
      } else if (update.selectionSet && open) {
        void this.request();
      }
    }
    public async request(trigger?: string): Promise<void> {
      const help = featuresOf(this.view.state).signatureHelp;
      if (!help) {
        return;
      }
      const generation = ++this.generation;
      const position = this.view.state.selection.main.head;
      try {
        const signature = await help.provide(this.view, position, trigger);
        if (generation !== this.generation || this.view.state.selection.main.head !== position) {
          return;
        }
        this.view.dispatch({
          effects: setSignature.of(
            signature
              ? { pos: position, above: true, create: (view) => ({ dom: renderSignature(view, signature) }) }
              : undefined,
          ),
        });
      } catch (error) {
        report(error);
      }
    }
  },
);

export const triggerParameterHints: Command = (view) => {
  if (!featuresOf(view.state).signatureHelp) {
    return false;
  }
  void view.plugin(signatureHelpPlugin)?.request();
  return true;
};

const closeParameterHints: Command = (view) => {
  if (view.state.field(signatureField, false) === undefined) {
    return false;
  }
  view.dispatch({ effects: setSignature.of(undefined) });
  return true;
};

const occurrenceMarks = {
  read: Decoration.mark({ class: 'cm-occurrence' }),
  text: Decoration.mark({ class: 'cm-occurrence' }),
  write: Decoration.mark({ class: 'cm-occurrence cm-occurrence-write' }),
} as const;

/** Highlight every semantic occurrence of the symbol under the cursor, not just matching text. */
const occurrenceHighlighter = ViewPlugin.fromClass(
  class {
    public decorations: DecorationSet = Decoration.none;
    private generation = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly rejects parameter properties.
    private readonly view: EditorView;
    public constructor(view: EditorView) {
      this.view = view;
      this.schedule();
    }
    public update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = this.decorations.map(update.changes);
      }
      if (update.docChanged || update.selectionSet) {
        this.schedule();
      }
    }
    public destroy(): void {
      clearTimeout(this.timer);
      this.generation++;
    }
    private schedule(): void {
      clearTimeout(this.timer);
      const generation = ++this.generation;
      this.timer = setTimeout(() => {
        void this.refresh(generation);
      }, 150);
    }
    private async refresh(generation: number): Promise<void> {
      const { state } = this.view;
      const provider = featuresOf(state).occurrences;
      const { main } = state.selection;
      let next: DecorationSet = Decoration.none;
      if (provider && main.empty) {
        try {
          const occurrences = await provider(this.view, main.head);
          if (generation !== this.generation) {
            return;
          }
          const { length } = this.view.state.doc;
          next = Decoration.set(
            occurrences
              .filter((occurrence) => occurrence.from < occurrence.to && occurrence.to <= length)
              .map((occurrence) => occurrenceMarks[occurrence.kind].range(occurrence.from, occurrence.to)),
            true,
          );
        } catch (error) {
          report(error);
        }
      }
      if (generation !== this.generation || (next.size === 0 && this.decorations.size === 0)) {
        return;
      }
      this.decorations = next;
      this.view.dispatch({});
    }
  },
  { decorations: (value) => value.decorations },
);

/** The symbol path at the cursor above the editor; each crumb jumps to its symbol, the last opens the outline. */
function breadcrumbsPanel(view: EditorView): Panel {
  const { ownerDocument } = view.dom;
  const dom = ownerDocument.createElement('nav');
  dom.className = 'cm-breadcrumbs';
  dom.setAttribute('aria-label', 'Symbol breadcrumbs');
  let symbols: readonly EditorSymbol[] = [];
  let rendered = '';
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const render = (): void => {
    const path = symbolPathAt(symbols, view.state.selection.main.head);
    const key = path.map((symbol) => `${symbol.kind}:${symbol.name}:${String(symbol.selectionFrom)}`).join('/');
    if (key === rendered && dom.childElementCount > 0) {
      return;
    }
    rendered = key;
    dom.replaceChildren();
    dom.hidden = symbols.length === 0;
    if (path.length === 0) {
      const outline = ownerDocument.createElement('button');
      outline.type = 'button';
      outline.className = 'cm-breadcrumb';
      outline.textContent = 'Go to symbol…';
      outline.addEventListener('click', () => goToSymbolInEditor(view));
      dom.append(outline);
      return;
    }
    for (const [index, symbol] of path.entries()) {
      if (index > 0) {
        const separator = ownerDocument.createElement('span');
        separator.className = 'cm-breadcrumb-separator codicon codicon-chevron-right';
        separator.setAttribute('aria-hidden', 'true');
        dom.append(separator);
      }
      const crumb = ownerDocument.createElement('button');
      crumb.type = 'button';
      crumb.className = 'cm-breadcrumb';
      crumb.append(renderSymbolIcon(symbol.kind, ownerDocument), symbol.name);
      crumb.addEventListener('click', () => {
        if (index === path.length - 1) {
          goToSymbolInEditor(view);
        } else {
          moveTo(view, symbol.selectionFrom);
        }
      });
      dom.append(crumb);
    }
  };
  const reload = async (current: number): Promise<void> => {
    const provider = featuresOf(view.state).documentSymbols;
    if (!provider) {
      return;
    }
    try {
      const next = await provider(view);
      if (current === generation) {
        symbols = next;
        render();
      }
    } catch (error) {
      report(error);
    }
  };
  const load = (): void => {
    clearTimeout(timer);
    const current = ++generation;
    timer = setTimeout(() => {
      void reload(current);
    }, 300);
  };
  dom.hidden = true;
  load();
  return {
    dom,
    top: true,
    update(update) {
      if (update.docChanged) {
        load();
      } else if (update.selectionSet) {
        render();
      }
    },
    destroy() {
      clearTimeout(timer);
      generation++;
    },
  };
}

type LanguageAction = Readonly<{
  id: string;
  label: string;
  keys: readonly string[];
  run: Command;
  available: (features: LanguageFeatures) => boolean;
  writes: boolean;
}>;

/** VS Code's language commands and default keys. Keys run only when a language provides the feature. */
const languageActions: readonly LanguageAction[] = [
  {
    id: 'typeDefinition',
    label: 'Go to Type Definition',
    keys: ['Alt-F12'],
    run: goToTypeDefinition,
    available: (features) => Boolean(features.typeDefinition),
    writes: false,
  },
  {
    id: 'implementation',
    label: 'Go to Implementations',
    keys: ['Mod-F12', 'Mod-Shift-F12'],
    run: goToImplementation,
    available: (features) => Boolean(features.implementation),
    writes: false,
  },
  {
    id: 'references',
    label: 'Find All References',
    keys: ['Shift-F12'],
    run: findAllReferences,
    available: (features) => Boolean(features.references),
    writes: false,
  },
  {
    id: 'callHierarchy',
    label: 'Show Call Hierarchy',
    keys: ['Shift-Alt-h'],
    run: showCallHierarchy,
    available: (features) => Boolean(features.callHierarchy),
    writes: false,
  },
  {
    id: 'documentSymbols',
    label: 'Go to Symbol in Editor…',
    keys: ['Mod-Shift-o'],
    run: goToSymbolInEditor,
    available: (features) => Boolean(features.documentSymbols),
    writes: false,
  },
  {
    id: 'workspaceSymbols',
    label: 'Go to Symbol in Workspace…',
    keys: ['Mod-t', 'Mod-Alt-t'],
    run: goToSymbolInWorkspace,
    available: (features) => Boolean(features.workspaceSymbols),
    writes: false,
  },
  {
    id: 'rename',
    label: 'Rename Symbol',
    keys: ['F2'],
    run: renameSymbol,
    available: (features) => Boolean(features.rename),
    writes: true,
  },
  {
    id: 'format',
    label: 'Format Document',
    keys: ['Shift-Alt-f', 'Mod-Shift-Alt-f'],
    run: formatDocument,
    available: (features) => Boolean(features.format),
    writes: true,
  },
  {
    id: 'quickFix',
    label: 'Quick Fix…',
    keys: ['Mod-.'],
    run: quickFix,
    available: (features) => Boolean(features.quickFix),
    writes: true,
  },
  {
    id: 'parameterHints',
    label: 'Trigger Parameter Hints',
    keys: ['Mod-Shift-Space'],
    run: triggerParameterHints,
    available: (features) => Boolean(features.signatureHelp),
    writes: false,
  },
];

export type AvailableLanguageAction = Readonly<{ id: string; label: string; disabled: boolean; run: Command }>;

/** Language commands the current editor supports, for menus. */
export function availableLanguageActions(state: EditorState): readonly AvailableLanguageAction[] {
  const features = featuresOf(state);
  return languageActions
    .filter((action) => action.available(features))
    .map((action) => ({
      id: action.id,
      label: action.label,
      disabled: action.writes && state.readOnly,
      run: action.run,
    }));
}

/** Keys, views and decorations for every language that contributes `languageFeatures`. */
export function languageFeatureNavigation(): Extension {
  return [
    signatureField,
    signatureHelpPlugin,
    occurrenceHighlighter,
    showPanel.compute([languageFeatures], (state) => (featuresOf(state).documentSymbols ? breadcrumbsPanel : null)),
    keymap.of([
      { key: 'Escape', run: closeParameterHints },
      ...languageActions.flatMap((action) => action.keys.map((key) => ({ key, run: action.run }))),
    ]),
    EditorView.theme({
      '.cm-occurrence': { backgroundColor: 'color-mix(in oklch, var(--muted-foreground) 18%, transparent)' },
      '.cm-occurrence-write': { backgroundColor: 'color-mix(in oklch, var(--primary) 22%, transparent)' },
    }),
  ];
}
