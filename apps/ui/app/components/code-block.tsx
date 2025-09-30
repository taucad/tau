import type { ComponentProps } from 'react';
import { CodeViewer } from '#components/code-viewer.js';
import type { CodeLanguage } from '#components/code-viewer.js';
import { cn } from '#utils/ui.js';
import { CopyButton } from '#components/copy-button.js';

type CodeBlockProps = ComponentProps<'div'> & {
  readonly title?: string;
  readonly showHeader?: boolean;
};

type PreProps = ComponentProps<'pre'>;

export function CodeBlock({
  children,
  title,
  showHeader = true,
  className,
  text,
  ...rest
}: CodeBlockProps & { readonly text: string }): React.JSX.Element {
  return (
    <div
      {...rest}
      className={cn(
        "@container/code overflow-hidden rounded-lg border font-sans not-prose text-sm bg-neutral/10",
        className
      )}
    >
      {showHeader && (
        <div className="sticky top-0 flex flex-row items-center justify-between border-b p-0.25 pl-3 text-foreground/50">
          <div className="text-xs">{title}</div>
          <div className="flex flex-row gap-1">
            <CopyButton
              size="xs"
              className="h-7 [&_[data-slot=label]]:hidden @xs/code:[&_[data-slot=label]]:flex"
              getText={() => text}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function Pre({ children, className, ...rest }: PreProps): React.JSX.Element {
  // Extract language from className (e.g., "language-typescript")
  const match = /language-(\w+)/.exec(className ?? '');
  const language = (match ? match[1] : 'text') as CodeLanguage;

  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Convert children to string
  const text = String(children).replace(/\n$/, '');

  // Render with syntax highlighting if language is detected
  if (match) {
    console.log({ match, className, text, language })
    return <CodeViewer language={'jsx'} text={text} className={cn("overflow-x-auto py-2 -mx-1", className)} />;
  }

  // Fallback to regular pre element
  return (
    <pre {...rest} className={cn("overflow-x-auto py-2", className)}>
      {children}
    </pre>
  );
}

export function InlineCode({ children, className, ...rest }: ComponentProps<'code'>): React.JSX.Element {
  return (
    <code
      {...rest}
      className={cn(
        className,
        'rounded-xs bg-neutral/20 px-1 py-0.5 font-normal text-foreground/80 before:content-none after:content-none',
      )}
    >
      {children}
    </code>
  );
}
