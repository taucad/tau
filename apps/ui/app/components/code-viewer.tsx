import { Prism as SyntaxHighlighter, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { cn } from '@/utils/ui';

export function CodeViewer({ ref, className, ...rest }: SyntaxHighlighterProps & { className?: string }) {
  return (
    <SyntaxHighlighter
      {...rest}
      customStyle={{
        backgroundColor: 'transparent',
        color: 'hsl(var(--foreground))',
        marginBottom: 0,
      }}
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
