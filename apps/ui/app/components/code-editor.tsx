import { Editor, useMonaco } from '@monaco-editor/react';
import type { EditorProps } from '@monaco-editor/react';
import { Theme, useTheme } from 'remix-themes';
import { useCallback, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { shikiToMonaco } from '@shikijs/monaco';
import { createHighlighter } from 'shiki';
import { registerCompletion } from 'monacopilot';
import type { CompletionRegistration, Monaco, StandaloneCodeEditor } from 'monacopilot';
import { cn } from '~/utils/ui.js';
import { ENV } from '~/config.js';

// Create the highlighter, it can be reused
const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['javascript', 'typescript'],
});

type CodeEditorProperties = EditorProps & {
  readonly onChange: (value: string) => void;
};

// Const displayLanguageFromOriginalLanguage = {
//   kcl: 'typescript',
// };

// type MappedLanguage = keyof typeof displayLanguageFromOriginalLanguage;

export function CodeEditor({ className, ...rest }: CodeEditorProperties): JSX.Element {
  const [theme] = useTheme();
  const completionRef = useRef<CompletionRegistration | undefined>(null);

  const handleMount = useCallback((editor: StandaloneCodeEditor, monaco: Monaco) => {
    completionRef.current = registerCompletion(monaco, editor, {
      endpoint: `${ENV.TAU_API_URL}/v1/code-completion`,
      language: 'typescript',
      trigger: 'onTyping',
    });
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
        // Scroll decoration appears after scrolling from top, replace shadow with top border
        '[&_.scroll-decoration]:!border-t',
        '[&_.scroll-decoration]:![box-shadow:none]',
        // Existing scrollbar styles
        '[&_.monaco-scrollable-element_>_.scrollbar]:!bg-(--scrollbar-track)',
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:!bg-(--scrollbar-thumb)/80',
        // Apply rounded corners to scrollbar sliders
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:rounded-[4px]',
        // Ensure scrollbars don't overlap content
        '[&_.monaco-scrollable-element]:overflow-hidden',
        className,
      )}
      theme={theme === Theme.DARK ? 'github-dark' : 'github-light'}
      defaultLanguage="typescript"
      options={{
        tabSize: 2,
        minimap: { enabled: false },
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
      }}
      onMount={handleMount}
      {...rest}
    />
  );
}
