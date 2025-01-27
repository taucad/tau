import { Prism as SyntaxHighlighter, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { cn } from '@/utils/ui';

const displayLanguageFromOriginalLanguage = {
  kcl: 'typescript',
};

type MappedLanguage = keyof typeof displayLanguageFromOriginalLanguage;

export function CodeViewer({
  ref,
  className,
  showLineNumbers,
  language,
  ...rest
}: SyntaxHighlighterProps & { className?: string }) {
  return (
    <SyntaxHighlighter
      {...rest}
      showLineNumbers={showLineNumbers}
      customStyle={{
        backgroundColor: 'transparent',
        color: 'hsl(var(--foreground))',
        margin: 0,
        ...(showLineNumbers ? { padding: '0.5em 0' } : {}),
      }}
      language={language ? displayLanguageFromOriginalLanguage[language as MappedLanguage] || language : undefined}
      codeTagProps={{
        className: cn(
          className,
          /* Text shadow, remove it */
          '[text-shadow:none]',
          /* Dark mode, make it brighter and more contrast */
          'dark:brightness-150 dark:contrast-100',
          /* Some tokens have a background applied which we need to remove */
          '[&_*]:!bg-transparent',
        ),
      }}
      ref={ref as React.Ref<SyntaxHighlighter>}
      PreTag="pre"
    />
  );
}
