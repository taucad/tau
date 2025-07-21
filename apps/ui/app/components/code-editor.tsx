import { Editor, useMonaco } from '@monaco-editor/react';
import type { EditorProps } from '@monaco-editor/react';
import { Theme, useTheme } from 'remix-themes';
import { useCallback, useEffect, useRef } from 'react';
import { shikiToMonaco } from '@shikijs/monaco';
import type { CompletionRegistration, Monaco, StandaloneCodeEditor } from 'monacopilot';
import { cn } from '~/utils/ui.js';
import { highlighter } from '~/lib/shiki.js';
import { configureMonaco, registerCompletions } from '~/lib/monaco.js';

type CodeEditorProperties = EditorProps & {
  readonly onChange: (value: string) => void;
};

await configureMonaco();

export function CodeEditor({ className, ...rest }: CodeEditorProperties): React.JSX.Element {
  const [theme] = useTheme();
  const completionRef = useRef<CompletionRegistration | undefined>(null);

  const handleMount = useCallback((editor: StandaloneCodeEditor, monaco: Monaco) => {
    completionRef.current = registerCompletions(editor, monaco);
  }, []);

  useEffect(() => {
    return () => {
      completionRef.current?.deregister();
    };
  }, []);

  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
      shikiToMonaco(highlighter, monaco);
    }
  }, [monaco]);

  return (
    <Editor
      className={cn(
        // Target Monaco editor elements with Tailwind's nested syntax
        // Override the background color of the Monaco editor
        '[&_.monaco-editor]:![--vscode-editor-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-editorStickyScroll-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-breadcrumb-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-multiDiffEditor-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-editorMarkerNavigation-background:var(--background)]',
        '[&_.monaco-editor]:![--vscode-editorGutter-background:var(--background)]',
        // Hide the redundant text area cover element
        '[&_.monaco-editor-background.textAreaCover.line-numbers]:!hidden',
        // Disable ::before pseudo-elements on line numbers
        '[&_.line-numbers::before]:!hidden',
        // Scroll decoration appears after scrolling from top, replace shadow with top border
        '[&_.scroll-decoration]:!border-t',
        '[&_.scroll-decoration]:![box-shadow:none]',
        // Existing scrollbar styles
        '[&_.monaco-scrollable-element_>_.scrollbar]:!bg-(--scrollbar-track)',
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:!bg-(--scrollbar-thumb)/80',
        // Apply rounded corners to scrollbar sliders
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:rounded-sm',
        // Ensure scrollbars don't overlap content
        '[&_.monaco-scrollable-element]:overflow-hidden',
        className,
      )}
      theme={theme === Theme.DARK ? 'github-dark' : 'github-light'}
      options={{
        fontSize: 14,
        tabSize: 2,
        minimap: { enabled: false },
        // Explicitly configure line numbers
        lineNumbers: 'on',
        lineNumbersMinChars: 5,
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
