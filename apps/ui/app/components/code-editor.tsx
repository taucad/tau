import { cn } from '@/utils/ui';
import { Editor, type EditorProps } from '@monaco-editor/react';
import { useTheme } from 'remix-themes';

type CodeEditorProperties = EditorProps & {
  onChange: (value: string) => void;
};

// const displayLanguageFromOriginalLanguage = {
//   kcl: 'typescript',
// };

// type MappedLanguage = keyof typeof displayLanguageFromOriginalLanguage;

export function CodeEditor({ className, ...rest }: CodeEditorProperties) {
  const [theme] = useTheme();

  return (
    <Editor
      className={cn(
        className,
        'bg-background',
        // Target Monaco editor elements with Tailwind's nested syntax
        // Apply scrollbar colors
        '[&_.monaco-scrollable-element_>_.scrollbar]:bg-(--scrollbar-track)',
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:bg-(--scrollbar-thumb)',
        // Apply scrollbar dimensions
        // !important is needed to override the `style` attribute set by Monaco
        '[&_.monaco-scrollable-element_>_.scrollbar.vertical_>_.slider]:!w-[6px]',
        '[&_.monaco-scrollable-element_>_.scrollbar.horizontal_>_.slider]:!h-[6px]',
        // Apply rounded corners to scrollbar sliders
        '[&_.monaco-scrollable-element_>_.scrollbar_>_.slider]:rounded-[3px]',
        // Ensure scrollbars don't overlap content
        '[&_.monaco-scrollable-element]:overflow-hidden',
      )}
      theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      defaultLanguage="typescript"
      options={{
        minimap: { enabled: false },
        // Disable horizontal scroll beyond last line
        scrollBeyondLastColumn: 1,
        // Disable vertical scroll beyond last line
        scrollBeyondLastLine: false,
        // Ensure widgets like intellisense can appear above nearby elements
        fixedOverflowWidgets: true,
        // help Monaco resize properly in flex containers
        automaticLayout: true,
        // Custom scrollbar styling to match global scrollbar styles
        scrollbar: {
          // Applying to ensure that other elements that use the scrollbar
          // dimensions are styled correctly
          verticalScrollbarSize: 7,
          horizontalScrollbarSize: 7,
          verticalSliderSize: 7,
          horizontalSliderSize: 7,
          // Ensure browser back and forward navigation scroll does not take effect,
          // as it causes janky editor behavior resulting in poor UX.
          alwaysConsumeMouseWheel: true,
        },
      }}
      {...rest}
    />
  );
}
