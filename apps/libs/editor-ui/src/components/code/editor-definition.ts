import { Facet, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap } from '@codemirror/view';
import type { Command, DecorationSet } from '@codemirror/view';

/** Resolve and open the definition of the symbol at a document offset. */
export type DefinitionProvider = (view: EditorView, position: number) => void | Promise<void>;

/** Each language contributes one provider; F12, Mod-click, and the context menu share it. */
export const definitionProvider = Facet.define<DefinitionProvider>();

type LinkRange = Readonly<{ from: number; to: number }>;

const setDefinitionLink = StateEffect.define<LinkRange | undefined>();
const definitionLinkMark = Decoration.mark({ class: 'cm-definition-link' });

const definitionLinkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = transaction.docChanged ? Decoration.none : value;
    for (const effect of transaction.effects) {
      if (effect.is(setDefinitionLink)) {
        next = effect.value
          ? Decoration.set([definitionLinkMark.range(effect.value.from, effect.value.to)])
          : Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform);

/** VS Code's go-to-definition modifier: Cmd on macOS, Ctrl elsewhere. */
export function isDefinitionModifier(event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  if (event.altKey || event.shiftKey) {
    return false;
  }
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function hasDefinitionProvider(state: EditorState): boolean {
  return state.facet(definitionProvider).length > 0;
}

/** Move the cursor to the position and open its definition through the language provider. */
export function goToDefinitionAt(view: EditorView, position: number): boolean {
  const [provider] = view.state.facet(definitionProvider);
  if (!provider) {
    return false;
  }
  view.dispatch({ selection: { anchor: position } });
  void provider(view, position);
  return true;
}

export const goToDefinition: Command = (view) => goToDefinitionAt(view, view.state.selection.main.head);

function linkRangeAt(view: EditorView, coordinates: Readonly<{ x: number; y: number }>): LinkRange | undefined {
  if (!hasDefinitionProvider(view.state)) {
    return undefined;
  }
  const position = view.posAtCoords(coordinates);
  const word = position === null ? null : view.state.wordAt(position);
  return word ? { from: word.from, to: word.to } : undefined;
}

function showLink(view: EditorView, range: LinkRange | undefined): void {
  const current = view.state.field(definitionLinkField).iter();
  const unchanged =
    range === undefined ? current.value === null : current.from === range.from && current.to === range.to;
  if (!unchanged) {
    view.dispatch({ effects: setDefinitionLink.of(range) });
  }
}

/** Mod-hover underlines a symbol and Mod-click opens its definition, matching VS Code. */
export function definitionNavigation(): Extension {
  let pointer: { x: number; y: number } | undefined;
  const refresh = (view: EditorView, event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): void => {
    showLink(view, pointer && isDefinitionModifier(event) ? linkRangeAt(view, pointer) : undefined);
  };
  return [
    definitionLinkField,
    keymap.of([{ key: 'F12', run: goToDefinition }]),
    EditorView.domEventHandlers({
      mousemove(event, view) {
        pointer = { x: event.clientX, y: event.clientY };
        refresh(view, event);
        return false;
      },
      mouseleave(_event, view) {
        pointer = undefined;
        showLink(view, undefined);
        return false;
      },
      keydown(event, view) {
        refresh(view, event);
        return false;
      },
      keyup(event, view) {
        refresh(view, event);
        return false;
      },
      blur(_event, view) {
        showLink(view, undefined);
        return false;
      },
      mousedown(event, view) {
        if (event.button !== 0 || !isDefinitionModifier(event)) {
          return false;
        }
        const range = linkRangeAt(view, { x: event.clientX, y: event.clientY });
        const position = view.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });
        if (!range || position === null) {
          return false;
        }
        event.preventDefault();
        showLink(view, undefined);
        return goToDefinitionAt(view, position);
      },
    }),
    EditorView.theme({
      '.cm-definition-link': {
        textDecoration: 'underline',
        textUnderlineOffset: '0.15em',
        cursor: 'var(--cursor-action)',
      },
    }),
  ];
}
