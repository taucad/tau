import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { JSX, RefObject } from 'react';
import { cn } from '@/utils/ui.js';

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
}: SyntaxHighlighterProps & { readonly className?: string; readonly ref?: RefObject<SyntaxHighlighter> }): JSX.Element {
  return (
    <div className="relative w-full max-w-full overflow-hidden">
      <div className="w-full max-w-full overflow-x-auto">
        <SyntaxHighlighter
          {...rest}
          ref={ref}
          customStyle={{
            backgroundColor: 'transparent',
            color: 'var(--foreground)',
            margin: 0,
            padding: '1em',
            width: 'auto', // Allow content to determine width
            minWidth: '100%', // Ensure it fills container
            ...(showLineNumbers ? { paddingLeft: '3.8em', paddingTop: '0.5em', paddingBottom: '0.5em' } : {}),
          }}
          showLineNumbers={showLineNumbers}
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
          PreTag="pre"
        />
      </div>
    </div>
  );
}
