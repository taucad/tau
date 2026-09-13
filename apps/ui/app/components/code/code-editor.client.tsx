import { Editor } from '@monaco-editor/react';
import type { EditorProps } from '@monaco-editor/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CompletionRegistration } from 'monacopilot';
import type * as Monaco from 'monaco-editor';
import { cn } from '#utils/ui.utils.js';
import { configureMonaco, registerCompletions } from '#lib/monaco.lib.client.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

type CodeEditorProperties = EditorProps & {
  readonly onChange: (value: string) => void;
};

// Cap synchronous tokenization to avoid blocking the main thread on very large
// files. For typical engineering code files (< 500 lines) this is < 5 ms.
const maxForceTokenizeLines = 5000;

/**
 * Shared overflow widgets container for all Monaco editors.
 *
 * Monaco's hover tooltip, suggest widget, and parameter hints use
 * `position: fixed` when `fixedOverflowWidgets` is enabled. Inside
 * Dockview panels, CSS `contain: layout` and GPU-acceleration properties
 * (`transform`, `will-change`, `backface-visibility`) on ancestor elements
 * create new containing blocks that break fixed positioning — widgets get
 * clipped by `overflow: hidden` on the group view instead of rendering
 * above everything.
 *
 * Placing the overflow container on `document.body` (outside the Dockview
 * DOM hierarchy) avoids all CSS containment issues. Each Monaco editor
 * appends its own child `overflowingContentWidgets` container inside this
 * shared node. Combined with `fixedOverflowWidgets: true`, widgets use
 * viewport coordinates and render above all panes.
 */
function createOverflowWidgetsDomNode(): HTMLDivElement {
  const node = document.createElement('div');
  node.className = 'monaco-editor';
  node.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:50;';
  document.body.append(node);
  return node;
}

const overflowWidgetsDomNode = createOverflowWidgetsDomNode();

// Scrollbar styling shared between the editor wrapper and the overflow
// container (hover/suggest/parameter hints live on document.body).
const monacoScrollbarStyles = [
  '[&_.monaco-scrollable-element_>_.scrollbar]:!bg-(--scrollbar-track)',
  '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:!bg-(--scrollbar-thumb)/80',
] as const;

// Restore native list/blockquote/heading rendering inside Monaco overflow
// widgets. Tailwind v4 Preflight strips list-style globally; hover, suggest,
// and parameter-hints widgets render JSDoc Markdown that needs them back.
// Applied directly to overflowWidgetsDomNode (lives on document.body, outside
// the editor wrapper DOM, so Tailwind descendant selectors from `classNames`
// would never reach it).
// JSDoc in hovers must render list styles — Preflight strips them on body-owned overlay DOM.
const monacoOverlayRestoreStyles = [
  // Lists — restore bullets/numbers, indent, vertical rhythm
  '[&_.monaco-hover_ul]:[list-style:revert]',
  '[&_.monaco-hover_ol]:[list-style:revert]',
  '[&_.monaco-hover_ul]:ps-5',
  '[&_.monaco-hover_ol]:ps-5',
  '[&_.monaco-hover_ul]:[margin-block:0.25rem]',
  '[&_.monaco-hover_ol]:[margin-block:0.25rem]',
  '[&_.monaco-hover_li+li]:[margin-block-start:0.125rem]',
  '[&_.suggest-widget_ul]:[list-style:revert]',
  '[&_.suggest-widget_ol]:[list-style:revert]',
  '[&_.suggest-widget_ul]:ps-5',
  '[&_.suggest-widget_ol]:ps-5',
  '[&_.suggest-widget_ul]:[margin-block:0.25rem]',
  '[&_.suggest-widget_ol]:[margin-block:0.25rem]',
  '[&_.suggest-widget_li+li]:[margin-block-start:0.125rem]',
  '[&_.parameter-hints-widget_ul]:[list-style:revert]',
  '[&_.parameter-hints-widget_ol]:[list-style:revert]',
  '[&_.parameter-hints-widget_ul]:ps-5',
  '[&_.parameter-hints-widget_ol]:ps-5',
  '[&_.parameter-hints-widget_ul]:[margin-block:0.25rem]',
  '[&_.parameter-hints-widget_ol]:[margin-block:0.25rem]',
  '[&_.parameter-hints-widget_li+li]:[margin-block-start:0.125rem]',
  // Blockquotes — themed left rule using Monaco's own VS Code tokens
  '[&_.monaco-hover_blockquote]:border-s-2',
  '[&_.monaco-hover_blockquote]:border-s-(--vscode-editorHoverWidget-border)',
  '[&_.monaco-hover_blockquote]:ps-2',
  '[&_.monaco-hover_blockquote]:[margin-block:0.25rem]',
  '[&_.monaco-hover_blockquote]:text-(--vscode-descriptionForeground)',
  '[&_.suggest-widget_blockquote]:border-s-2',
  '[&_.suggest-widget_blockquote]:border-s-(--vscode-editorHoverWidget-border)',
  '[&_.suggest-widget_blockquote]:ps-2',
  '[&_.suggest-widget_blockquote]:[margin-block:0.25rem]',
  '[&_.suggest-widget_blockquote]:text-(--vscode-descriptionForeground)',
  '[&_.parameter-hints-widget_blockquote]:border-s-2',
  '[&_.parameter-hints-widget_blockquote]:border-s-(--vscode-editorHoverWidget-border)',
  '[&_.parameter-hints-widget_blockquote]:ps-2',
  '[&_.parameter-hints-widget_blockquote]:[margin-block:0.25rem]',
  '[&_.parameter-hints-widget_blockquote]:text-(--vscode-descriptionForeground)',
  // Headings — restore weight + vertical rhythm for @example / section headers
  '[&_.monaco-hover_:is(h1,h2,h3,h4)]:font-semibold',
  '[&_.monaco-hover_:is(h1,h2,h3,h4)]:[margin-block:0.5rem_0.25rem]',
  '[&_.suggest-widget_:is(h1,h2,h3,h4)]:font-semibold',
  '[&_.suggest-widget_:is(h1,h2,h3,h4)]:[margin-block:0.5rem_0.25rem]',
  '[&_.parameter-hints-widget_:is(h1,h2,h3,h4)]:font-semibold',
  '[&_.parameter-hints-widget_:is(h1,h2,h3,h4)]:[margin-block:0.5rem_0.25rem]',
] as const;

await configureMonaco();

export function CodeEditor({ className, options: optionsFromProps, ...rest }: CodeEditorProperties): React.JSX.Element {
  const { theme } = useTheme();
  const [areInlayHintsEnabled] = useCookie(cookieName.codeInlayHints, false);
  const completionRef = useRef<CompletionRegistration | undefined>(null);
  const isMobile = useIsMobile();

  // Sync the shared overflow widgets container with the current theme and
  // styling overrides. This container lives on document.body (outside the
  // editor wrapper DOM), so Tailwind descendant selectors from the wrapper
  // don't reach it — styles are applied directly since it IS .monaco-editor.
  useEffect(() => {
    overflowWidgetsDomNode.className = cn(
      'monaco-editor',
      theme === Theme.DARK ? 'vs-dark' : 'vs',
      // Override Monaco's default SF Mono/system sans-serif with app fonts
      '![--monaco-monospace-font:var(--font-mono)]',
      '![font-family:var(--font-sans)]',
      ...monacoScrollbarStyles,
      ...monacoOverlayRestoreStyles,
    );
  }, [theme]);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    completionRef.current = registerCompletions(editor, monaco);

    // Force immediate tokenization of visible lines.
    // Monaco schedules background tokenization via requestIdleCallback, which
    // can be indefinitely delayed during initial page load when the browser is
    // busy with layout, React hydration, and Dockview initialization. This
    // causes code to appear without syntax highlighting until the user scrolls.
    // Forcing synchronous tokenization here ensures highlighting is visible
    // from the first render.
    const model = editor.getModel();
    if (model) {
      const targetLine = Math.min(model.getLineCount(), maxForceTokenizeLines);
      // Monaco's tokenization.forceTokenization is a stable internal API used
      // extensively by its own features (colorizer, auto-indent, comment commands,
      // etc.) but not exposed in public type declarations.
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Monaco internal API not exposed in public type declarations
      const tokenization = model as unknown as {
        tokenization?: { forceTokenization?: (lineNumber: number) => void };
      };
      tokenization.tokenization?.forceTokenization?.(targetLine);
    }
  }, []);

  useEffect(() => {
    return () => {
      completionRef.current?.deregister();
    };
  }, []);

  const baseOptions = useMemo(
    () =>
      ({
        fontSize: isMobile ? 16 : 14,
        fontFamily: 'var(--font-mono)',
        tabSize: 2,
        minimap: { enabled: false },
        // Explicitly configure line numbers
        lineNumbers: 'on',
        lineNumbersMinChars: 4,
        renderLineHighlight: 'line',
        renderLineHighlightOnlyWhenFocus: false,
        // Disable horizontal scroll beyond last line
        scrollBeyondLastColumn: 1,
        // Disable vertical scroll beyond last line
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        // Render overflow widgets (hover, suggest, parameter hints) in a shared
        // container on document.body so they escape Dockview's CSS containment.
        // fixedOverflowWidgets uses position:fixed with viewport coordinates;
        // overflowWidgetsDomNode places the container outside the Dockview hierarchy.
        fixedOverflowWidgets: true,
        overflowWidgetsDomNode,
        // Enable smooth cursor animation when typing and keying left/right/up/down
        cursorSmoothCaretAnimation: 'on',
        // Disable the sticky scrolling which displays the parent closure at the top of the editor for better performance.
        stickyScroll: {
          enabled: false,
        },
        // Configure gutter and margin properly
        glyphMargin: false,
        folding: true,
        // Custom scrollbar styling to match global scrollbar styles
        scrollbar: {
          // Applying to ensure that other elements that use the scrollbar
          // dimensions are styled correctly.
          verticalScrollbarSize: 14,
          horizontalScrollbarSize: 14,
          verticalSliderSize: 14,
          horizontalSliderSize: 14,
          // Ensure browser back and forward navigation scroll does not take effect,
          // as it causes janky editor behavior resulting in poor UX.
          alwaysConsumeMouseWheel: true,
        },
        // Intellisense
        suggest: {
          localityBonus: true,
          showStatusBar: true,
          preview: true,
        },
        parameterHints: {
          enabled: true,
          // Controls whether the parameter hints menu cycles or closes when reaching the end of the list.
          cycle: true,
        },
        inlayHints: {
          enabled: areInlayHintsEnabled ? 'on' : 'off',
        },
        automaticLayout: true,
        // Word-based suggestions are redundant for typed languages
        wordBasedSuggestions: 'off',
      }) as const satisfies Monaco.editor.IStandaloneEditorConstructionOptions,
    [areInlayHintsEnabled, isMobile],
  );

  const options = useMemo(() => ({ ...baseOptions, ...optionsFromProps }), [baseOptions, optionsFromProps]);

  const classNames = useMemo(
    () =>
      cn(
        // Override Monaco CSS variables to match the app theme
        '[&_.monaco-editor]:![--vscode-editor-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-editorStickyScroll-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-breadcrumb-background:transparent]',
        '[&_.monaco-editor]:![--vscode-multiDiffEditor-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-editorMarkerNavigation-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-editorGutter-background:var(--background)]',

        // Peek view: replace Monaco's default orange match highlights with
        // the app's primary color (teal). The result list highlight (30%
        // opacity) and editor preview highlight (40% opacity) mirror VS
        // Code's opacity levels but use the primary hue.
        '[&_.monaco-editor]:![--vscode-peekViewResult-matchHighlightBackground:oklch(0.75_0.15_var(--hue-primary)_/_0.3)]',
        '[&_.monaco-editor]:![--vscode-peekViewEditor-matchHighlightBackground:oklch(0.75_0.15_var(--hue-primary)_/_0.4)]',

        // Override Monaco's default system fonts with app fonts.
        // --monaco-monospace-font: used by code blocks in hover, suggest
        //   details, parameter hints, and go-to-error widgets.
        // font-family: sets the base UI font for prose/labels in all widgets;
        //   Monaco's inline styles on .view-line elements override it for code.
        '[&_.monaco-editor]:![--monaco-monospace-font:var(--font-mono)]',
        '[&_.monaco-editor]:![font-family:var(--font-sans)]',

        // Hide the redundant text area cover element
        '[&_.monaco-editor-background.textAreaCover.line-numbers]:!hidden',
        // Disable ::before pseudo-elements on line numbers
        '[&_.line-numbers::before]:!hidden',

        // Peek view: increase the close-button right padding from Monaco's
        // default 2px so it doesn't appear flush with the transparent scrollbar
        // track (which makes the gap invisible and the button look cut off).
        '[&_.peekview-widget_.head_.peekview-actions]:!pr-2',
        // Peek view: the ref-tree (definitions list) doesn't inherit the
        // editor's font settings — force monospace at the editor font size.
        '[&_.reference-zone-widget_.ref-tree]:![font-size:13px]',
        '[&_.reference-zone-widget_.ref-tree]:!font-mono',
        // Peek view: filename in the title bar should use monospace
        '[&_.peekview-title_.filename]:!font-mono',

        // Go-to-error: code spans in marker messages should use monospace
        '[&_.marker-widget_.message_.code]:!font-mono',

        // Scrollbar styling (shared with the overflow container)
        ...monacoScrollbarStyles,

        className,
      ),
    [className],
  );

  return (
    <Editor
      keepCurrentModel
      className={classNames}
      theme={theme === Theme.DARK ? 'github-dark' : 'github-light'}
      wrapperProps={{
        className: 'editor-container',
        style: { height: '100%' },
      }}
      options={options}
      onMount={handleMount}
      {...rest}
    />
  );
}
