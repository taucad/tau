import { Editor, useMonaco } from '@monaco-editor/react';
import type { EditorProps } from '@monaco-editor/react';
import { Theme, useTheme } from 'remix-themes';
import { useEffect } from 'react';
import type { JSX } from 'react';
import { shikiToMonaco } from '@shikijs/monaco';
import { createHighlighter } from 'shiki';
import { cn } from '~/utils/ui.js';

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
        // Existing scrollbar styles
        '[&_.monaco-scrollable-element_>_.scrollbar]:!bg-(--scrollbar-track)',
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:!bg-(--scrollbar-thumb)/80',
        // Apply scrollbar dimensions
        // !important is needed to override the `style` attribute set by Monaco
        '[&_.monaco-scrollable-element_>_.scrollbar.vertical_>_.slider]:!w-[calc((calc(var(--scrollbar-thickness)_-_var(--scrollbar-padding)_*_2)*2))]',
        '[&_.monaco-scrollable-element_>_.scrollbar.horizontal_>_.slider]:!h-[calc((calc(var(--scrollbar-thickness)_-_var(--scrollbar-padding)_*_2))*2)]',
        // Apply rounded corners to scrollbar sliders
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:rounded-[calc(var(--scrollbar-thickness)_-_var(--scrollbar-padding)_*_2)]',
        // Ensure scrollbars don't overlap content
        '[&_.monaco-scrollable-element]:overflow-hidden',
        className,
      )}
      theme={theme === Theme.DARK ? 'github-dark' : 'github-light'}
      defaultLanguage="typescript"
      options={{
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
        // Custom scrollbar styling to match global scrollbar styles
        scrollbar: {
          // Applying to ensure that other elements that use the scrollbar
          // dimensions are styled correctly.
          // This is equivalent to `calc(var(--scrollbar-thickness) - var(--scrollbar-padding) * 2) * 2`
          verticalScrollbarSize: 14,
          horizontalScrollbarSize: 14,
          verticalSliderSize: 14,
          horizontalSliderSize: 14,
          // Ensure browser back and forward navigation scroll does not take effect,
          // as it causes janky editor behavior resulting in poor UX.
          alwaysConsumeMouseWheel: true,
        },
      }}
      {...rest}
    />
  );
}
