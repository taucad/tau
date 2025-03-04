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
      className={cn(className)}
      theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      defaultLanguage="typescript"
      options={{ minimap: { enabled: false }, extraEditorClassName: 'bg-background' }}
      {...rest}
    />
  );
}
