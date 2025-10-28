import { Editor, useMonaco } from '@monaco-editor/react';
import type { EditorProps } from '@monaco-editor/react';
import { Theme, useTheme } from 'remix-themes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shikiToMonaco } from '@shikijs/monaco';
import type { CompletionRegistration, Monaco, StandaloneCodeEditor } from 'monacopilot';
import { cn } from '#utils/ui.utils.js';
import { highlighter } from '#lib/shiki.js';
import { configureMonaco, registerCompletions } from '#lib/monaco.js';
import { useIsMobile } from '#hooks/use-mobile.js';

type CodeEditorProperties = EditorProps & {
  readonly onChange: (value: string) => void;
};

await configureMonaco();

/**
 * Compute the minimum number of characters to display the line numbers.
 * This is used to ensure that the line numbers are always visible and do not shift when the line count changes.
 * @param lineCount - The number of lines in the editor.
 * @returns The minimum number of characters to display the line numbers.
 *
 * @example
 * computeMinCharsFromLineCount(100) // 3
 */
function computeMinCharsFromLineCount(lineCount: number): number {
  const safeLineCount = Math.max(1, Math.floor(lineCount));
  const digitCount = Math.floor(Math.log10(safeLineCount)) + 1;
  return Math.max(3, digitCount + 1);
}

export function CodeEditor({ className, ...rest }: CodeEditorProperties): React.JSX.Element {
  const [theme] = useTheme();
  const completionRef = useRef<CompletionRegistration | undefined>(null);
  const isMobile = useIsMobile();
  const editorRef = useRef<StandaloneCodeEditor | undefined>(undefined);
  const editorDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);

  const initialText =
    typeof rest.value === 'string' ? rest.value : typeof rest.defaultValue === 'string' ? rest.defaultValue : '';
  const initialLineCount = initialText.split(/\r\n|\r|\n/).length;
  const [lineNumbersMinChars, setLineNumbersMinChars] = useState<number>(() =>
    computeMinCharsFromLineCount(initialLineCount),
  );

  const handleMount = useCallback((editor: StandaloneCodeEditor, monaco: Monaco) => {
    completionRef.current = registerCompletions(editor, monaco);
    editorRef.current = editor;

    const updateFromEditor = (): void => {
      const model = editor.getModel();
      if (!model) {
        return;
      }

      const lines = model.getLineCount();
      setLineNumbersMinChars(computeMinCharsFromLineCount(lines));
    };

    updateFromEditor();

    const disposables = [
      editor.onDidChangeModelContent(() => {
        updateFromEditor();
      }),
      editor.onDidChangeModel(() => {
        updateFromEditor();
      }),
    ];
    editorDisposablesRef.current = [...editorDisposablesRef.current, ...disposables];
  }, []);

  useEffect(() => {
    return () => {
      completionRef.current?.deregister();
      for (const disposable of editorDisposablesRef.current) {
        try {
          disposable.dispose();
        } catch {
          // ignore
        }
      }

      editorDisposablesRef.current = [];
    };
  }, []);

  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
      shikiToMonaco(highlighter, monaco);
    }
  }, [monaco]);

  useEffect(() => {
    const text = typeof rest.defaultValue === 'string' ? rest.defaultValue : undefined;
    if (typeof text === 'string') {
      const lines = text.split(/\r\n|\r|\n/).length;
      setLineNumbersMinChars(computeMinCharsFromLineCount(lines));
    }
  }, [rest.value, rest.defaultValue]);

  return (
    <Editor
      className={cn(
        // Target Monaco editor elements with Tailwind's nested syntax
        // Override the background color of the Monaco editor
        '[&_.monaco-editor]:![--vscode-editor-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-editorStickyScroll-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-breadcrumb-background:transparent]',
        '[&_.monaco-editor]:![--vscode-multiDiffEditor-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-editorMarkerNavigation-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-editorGutter-background:var(--background)]',
        // Hide the redundant text area cover element
        '[&_.monaco-editor-background.textAreaCover.line-numbers]:!hidden',
        // Disable ::before pseudo-elements on line numbers
        '[&_.line-numbers::before]:!hidden',
        // Existing scrollbar styles
        '[&_.monaco-scrollable-element_>_.scrollbar]:!bg-(--scrollbar-track)',
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:!bg-(--scrollbar-thumb)/80',
        // Apply rounded corners to scrollbar sliders
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:rounded-[0.25rem]',
        // Ensure scrollbars don't overlap content
        '[&_.monaco-scrollable-element]:overflow-hidden',
        className,
      )}
      theme={theme === Theme.DARK ? 'github-dark' : 'github-light'}
      options={{
        fontSize: isMobile ? 16 : 14,
        fontFamily: 'var(--font-mono)',
        tabSize: 2,
        minimap: { enabled: false },
        // Explicitly configure line numbers
        lineNumbers: 'on',
        lineNumbersMinChars,
        renderLineHighlight: 'line',
        renderLineHighlightOnlyWhenFocus: false,
        // Disable horizontal scroll beyond last line
        scrollBeyondLastColumn: 1,
        // Disable vertical scroll beyond last line
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        // Ensure widgets like intellisense can appear above nearby elements
        fixedOverflowWidgets: true,
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
        // Word-based suggestions are redundant for typed languages
        wordBasedSuggestions: 'off',
      }}
      onMount={handleMount}
      {...rest}
    />
  );
}
