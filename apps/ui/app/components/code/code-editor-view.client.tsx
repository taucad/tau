import { tauHighlighter } from '@taucad/grammars';
import { createEditorSearchPanel } from '#components/code/editor-search-panel.js';
import { editorSurfaceTheme } from '#components/code/editor-surface-theme.js';
import '@vscode/codicons/dist/codicon.css';
import '#components/code/code-editor.css';
import { renderCompletionIcon } from '#components/code/editor-completion-icon.js';
import { definitionNavigation, goToDefinition, hasDefinitionProvider } from '#components/code/editor-definition.js';
import { availableLanguageActions, languageFeatureNavigation } from '#components/code/editor-language-features.js';
import type { AvailableLanguageAction } from '#components/code/editor-language-features.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import {
  EditorView,
  Decoration,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  tooltips,
} from '@codemirror/view';
import {
  bracketMatching,
  foldGutter,
  foldCode,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  unfoldCode,
} from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, indentWithTab, selectAll, toggleComment } from '@codemirror/commands';
import { gotoLine, openSearchPanel, searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
import { forceLinting, linter, lintGutter, lintKeymap } from '@codemirror/lint';
import { cn } from '@taucad/ui/utils/cn';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@taucad/ui/components/context-menu';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { markCodeEditorMilestone } from '#components/code/code-editor.client.js';
import { jsonDepthHighlighting } from '#components/code/json-depth-highlighting.js';
import type { CodeEditorProps } from '#components/code/code-editor.client.js';
import type { DocumentChange, EditorDocument, TextChange } from '#lib/editor-document.js';

/** Navigation commands sit with Go to Definition; the rest (rename, format, fixes) get their own group. */
const navigationActions = new Set([
  'typeDefinition',
  'implementation',
  'references',
  'callHierarchy',
  'documentSymbols',
  'workspaceSymbols',
]);

type ViewPosition = Readonly<{ anchor: number; head: number; scrollTop: number; scrollLeft: number }>;
const rememberedPositions = new WeakMap<EditorDocument, Map<string, ViewPosition>>();
const maxRememberedViewsPerDocument = 32;

function rememberViewPosition(document: EditorDocument, viewId: string, view: EditorView): void {
  const positions = rememberedPositions.get(document) ?? new Map<string, ViewPosition>();
  positions.delete(viewId);
  positions.set(viewId, {
    anchor: view.state.selection.main.anchor,
    head: view.state.selection.main.head,
    scrollTop: view.scrollDOM.scrollTop,
    scrollLeft: view.scrollDOM.scrollLeft,
  });
  while (positions.size > maxRememberedViewsPerDocument) {
    const oldest = positions.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    positions.delete(oldest);
  }
  rememberedPositions.set(document, positions);
}

function restoreViewPosition(document: EditorDocument, viewId: string, view: EditorView): void {
  const position = rememberedPositions.get(document)?.get(viewId);
  if (!position) {
    return;
  }
  view.dispatch({
    selection: {
      anchor: Math.min(position.anchor, view.state.doc.length),
      head: Math.min(position.head, view.state.doc.length),
    },
  });
  view.requestMeasure({
    read: () => undefined,
    write: () => {
      view.scrollDOM.scrollTop = position.scrollTop;
      view.scrollDOM.scrollLeft = position.scrollLeft;
    },
  });
}

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--foreground)',
    backgroundColor: 'var(--background)',
    fontFamily: 'var(--font-mono)',
  },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)' },
  '.cm-content': { caretColor: 'var(--foreground)', padding: '0' },
  '.cm-gutters': { backgroundColor: 'var(--background)', color: 'var(--muted-foreground)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--muted)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--accent) !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent) !important' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-panels, .cm-tooltip': {
    color: 'var(--foreground)',
    backgroundColor: 'var(--popover)',
    borderColor: 'var(--border)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-tooltip': { zIndex: '50', pointerEvents: 'auto' },
  '.cm-typescript-hover, .cm-signature-help': {
    maxWidth: 'min(36rem, 80vw)',
    padding: '0.5rem 0.75rem',
    color: 'var(--popover-foreground)',
  },
  '.cm-typescript-inlay-hint, .cm-kcl-inlay-hint': {
    marginInline: '0.25rem',
    color: 'var(--muted-foreground)',
    fontSize: '0.9em',
  },
  '.cm-dialog input': {
    color: 'var(--foreground)',
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
  },
  '.cm-conflict-mine': { backgroundColor: 'color-mix(in oklch, var(--success) 20%, transparent)' },
  '.cm-conflict-theirs': { backgroundColor: 'color-mix(in oklch, var(--feature) 20%, transparent)' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '4ch', padding: '0 var(--spacing)' },
  '.cm-gutter-lint': { width: '0' },
  '.cm-gutter-lint:has(.cm-lint-marker)': { width: '1em' },
  '.cm-gutter-lint .cm-gutterElement': { padding: '0' },
});

function changesFromView(update: ViewUpdate): TextChange[] {
  const changes: TextChange[] = [];
  // eslint-disable-next-line max-params -- CodeMirror iterChanges supplies five positional fields.
  update.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    changes.push({ from, to, insert: inserted.toString() });
  });
  return changes;
}

function synchronize(view: EditorView, text: string): void {
  if (view.state.doc.toString() === text) {
    return;
  }
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

/** One CodeMirror view; the session document owns text, version, and undo. */
export function CodeEditorView({
  document,
  viewId,
  languageId,
  className,
  readOnly = false,
  extensions,
  syntaxExtension,
  diagnostics,
  onApply,
  onHistory,
  onMount,
  lineHighlights,
  showLineNumbers = true,
}: CodeEditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const applyingExternalRef = useRef(false);
  const isMobile = useIsMobile();
  const syntax = useRef(new Compartment());
  const semantics = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const highlightedLines = useRef(new Compartment());
  const callbacksRef = useRef({ onApply, onHistory, onMount, readOnly });
  const mountRegistration = useRef<
    | {
        view: EditorView;
        path: string;
        callback: CodeEditorProps['onMount'];
        dispose?: () => void;
      }
    | undefined
  >(undefined);
  const historyRef = useRef<{ kind: 'typing' | 'composition'; groupId: string; at: number } | undefined>(undefined);
  const historySequence = useRef(0);
  const markedFirstEdit = useRef(false);
  const [canGoToDefinition, setCanGoToDefinition] = useState(false);
  const [languageActions, setLanguageActions] = useState<readonly AvailableLanguageAction[]>([]);
  useEffect(() => {
    callbacksRef.current = { onApply, onHistory, onMount, readOnly };
  }, [onApply, onHistory, onMount, readOnly]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const overlay = globalThis.document.createElement('div');
    overlay.className = 'cm-editor ph-no-capture';
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50';
    globalThis.document.body.append(overlay);
    const applyHistory = (kind: 'undo' | 'redo'): boolean => {
      if (callbacksRef.current.readOnly) {
        return false;
      }
      const change = callbacksRef.current.onHistory ? callbacksRef.current.onHistory(kind) : document[kind](viewId);
      return change !== undefined;
    };
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: document.text,
        extensions: [
          editorTheme,
          editorSurfaceTheme,
          EditorView.contentAttributes.of({ 'aria-label': 'Code editor' }),
          EditorView.theme({ '&': { fontSize: isMobile ? '16px' : '14px' }, '.cm-content': { lineHeight: '1.5' } }),
          showLineNumbers ? lineNumbers() : [],
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          highlightActiveLine(),
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          indentOnInput(),
          bracketMatching(),
          foldGutter(),
          closeBrackets(),
          autocompletion({ icons: false, addToOptions: [{ render: renderCompletionIcon, position: 20 }] }),
          search({ createPanel: createEditorSearchPanel }),
          highlightSelectionMatches(),
          lintGutter(),
          diagnostics ? linter(() => diagnostics.get(document.uri).get('kernel') ?? [], { delay: 100 }) : [],
          syntaxHighlighting(tauHighlighter),
          tooltips({ parent: overlay, position: 'fixed' }),
          definitionNavigation(),
          languageFeatureNavigation(),
          Prec.highest(
            keymap.of([
              { key: 'Mod-z', run: () => applyHistory('undo') },
              { key: 'Mod-Shift-z', run: () => applyHistory('redo') },
              { key: 'Mod-y', run: () => applyHistory('redo') },
            ]),
          ),
          keymap.of([
            ...defaultKeymap,
            ...searchKeymap,
            ...completionKeymap,
            ...foldKeymap,
            ...closeBracketsKeymap,
            ...lintKeymap,
            indentWithTab,
            { key: 'Mod-/', run: toggleComment },
          ]),
          syntax.current.of([]),
          semantics.current.of(extensions ?? []),
          highlightedLines.current.of([]),
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || applyingExternalRef.current) {
              return;
            }
            const now = Date.now();
            const isComposition =
              update.view.composing || update.transactions.some((item) => item.isUserEvent('input.type.compose'));
            const isTyping = update.transactions.some((item) => item.isUserEvent('input.type'));
            let history: {
              kind: 'typing' | 'composition' | 'paste' | 'command';
              groupId?: string;
              atMilliseconds: number;
            };
            if (isComposition || isTyping) {
              const kind = isComposition ? 'composition' : 'typing';
              const prior = historyRef.current;
              const groupId =
                prior?.kind === kind && now - prior.at <= 1000
                  ? prior.groupId
                  : `${viewId}-${String(++historySequence.current)}`;
              historyRef.current = { kind, groupId, at: now };
              history = { kind, groupId, atMilliseconds: now };
            } else {
              historyRef.current = undefined;
              history = {
                kind: update.transactions.some((item) => item.isUserEvent('input.paste')) ? 'paste' : 'command',
                atMilliseconds: now,
              };
            }
            const transaction = {
              changes: changesFromView(update),
              origin: 'view',
              expectedVersion: document.version,
              viewId,
              history,
            } as const;
            const accepted = callbacksRef.current.onApply
              ? callbacksRef.current.onApply(transaction)
              : document.apply(transaction);
            if (accepted && !markedFirstEdit.current) {
              markedFirstEdit.current = true;
              markCodeEditorMilestone('first-applied-edit', viewId);
            }
            if (!accepted) {
              applyingExternalRef.current = true;
              try {
                synchronize(update.view, document.text);
              } finally {
                applyingExternalRef.current = false;
              }
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.dom.dataset['viewId'] = viewId;
    restoreViewPosition(document, viewId, view);
    markCodeEditorMilestone('editor-mounted', viewId);
    overlay.className = `${view.dom.className} cm-overlays ph-no-capture`;
    const unsubscribe = document.subscribe((event: DocumentChange) => {
      if (event.origin === 'view' && event.viewId === viewId) {
        return;
      }
      applyingExternalRef.current = true;
      try {
        if (event.previousVersion === document.version - 1) {
          view.dispatch({ changes: event.changes });
        }
        synchronize(view, document.text);
      } finally {
        applyingExternalRef.current = false;
      }
    });
    const unsubscribeDiagnostics = diagnostics?.subscribe((event) => {
      if (event.uri === document.uri && event.owner === 'kernel') {
        forceLinting(view);
      }
    });
    const callback = callbacksRef.current.onMount;
    const dispose = callback?.(view, document.path);
    mountRegistration.current = {
      view,
      path: document.path,
      callback,
      dispose: typeof dispose === 'function' ? dispose : undefined,
    };
    return () => {
      rememberViewPosition(document, viewId, view);
      if (mountRegistration.current?.view === view) {
        mountRegistration.current.dispose?.();
        mountRegistration.current = undefined;
      }
      unsubscribe();
      unsubscribeDiagnostics?.();
      viewRef.current = undefined;
      view.destroy();
      overlay.remove();
    };
  }, [diagnostics, document, isMobile, viewId]);

  const documentPath = document.path;
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const registered = mountRegistration.current;
    if (registered?.view === view && registered.path === documentPath && registered.callback === onMount) {
      return;
    }
    registered?.dispose?.();
    const dispose = onMount?.(view, documentPath);
    mountRegistration.current = {
      view,
      path: documentPath,
      callback: onMount,
      dispose: typeof dispose === 'function' ? dispose : undefined,
    };
  }, [documentPath, onMount]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: editable.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({ effects: semantics.current.reconfigure(extensions ?? []) });
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const decorations = (lineHighlights ?? []).flatMap((highlight) => {
      const output = [];
      for (
        let line = Math.max(1, highlight.fromLine);
        line <= Math.min(highlight.toLine, view.state.doc.lines);
        line += 1
      ) {
        output.push(
          Decoration.line({ class: highlight.tone === 'mine' ? 'cm-conflict-mine' : 'cm-conflict-theirs' }).range(
            view.state.doc.line(line).from,
          ),
        );
      }
      return output;
    });
    view.dispatch({
      effects: highlightedLines.current.reconfigure(EditorView.decorations.of(Decoration.set(decorations, true))),
    });
  }, [lineHighlights]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: syntax.current.reconfigure(
        syntaxExtension === undefined
          ? []
          : languageId === 'json'
            ? [syntaxExtension, jsonDepthHighlighting]
            : syntaxExtension,
      ),
    });
    if (syntaxExtension !== undefined) {
      markCodeEditorMilestone('syntax-ready', viewId);
    }
  }, [languageId, syntaxExtension, viewId]);

  const runCommand = (command: (view: EditorView) => boolean): void => {
    const view = viewRef.current;
    if (view) {
      view.focus();
      command(view);
    }
  };
  const runHistory = (kind: 'undo' | 'redo'): void => {
    if (readOnly) {
      return;
    }
    const changed = callbacksRef.current.onHistory ? callbacksRef.current.onHistory(kind) : document[kind](viewId);
    if (changed) {
      viewRef.current?.focus();
    }
  };

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) {
          setCanGoToDefinition(viewRef.current ? hasDefinitionProvider(viewRef.current.state) : false);
          setLanguageActions(viewRef.current ? availableLanguageActions(viewRef.current.state) : []);
        }
      }}
    >
      <ContextMenuTrigger className='contents'>
        <div ref={hostRef} className={cn('editor-container ph-no-capture size-full overflow-hidden', className)} />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={readOnly}
          onSelect={() => {
            runHistory('undo');
          }}
        >
          Undo
        </ContextMenuItem>
        <ContextMenuItem
          disabled={readOnly}
          onSelect={() => {
            runHistory('redo');
          }}
        >
          Redo
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            runCommand(selectAll);
          }}
        >
          Select All
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            runCommand(openSearchPanel);
          }}
        >
          Find and Replace
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            runCommand(gotoLine);
          }}
        >
          Go to Line
        </ContextMenuItem>
        {canGoToDefinition && (
          <ContextMenuItem
            onSelect={() => {
              runCommand(goToDefinition);
            }}
          >
            Go to Definition
          </ContextMenuItem>
        )}
        {languageActions
          .filter((action) => navigationActions.has(action.id))
          .map((action) => (
            <ContextMenuItem
              key={action.id}
              disabled={action.disabled}
              onSelect={() => {
                runCommand(action.run);
              }}
            >
              {action.label}
            </ContextMenuItem>
          ))}
        {languageActions.some((action) => !navigationActions.has(action.id)) && <ContextMenuSeparator />}
        {languageActions
          .filter((action) => !navigationActions.has(action.id))
          .map((action) => (
            <ContextMenuItem
              key={action.id}
              disabled={action.disabled}
              onSelect={() => {
                runCommand(action.run);
              }}
            >
              {action.label}
            </ContextMenuItem>
          ))}
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={readOnly}
          onSelect={() => {
            runCommand(toggleComment);
          }}
        >
          Toggle Comment
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            runCommand(foldCode);
          }}
        >
          Fold
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            runCommand(unfoldCode);
          }}
        >
          Unfold
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
