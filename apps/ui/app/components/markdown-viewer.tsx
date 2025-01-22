import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { cn } from '@/utils/ui';
import { CopyButton } from '@/components/copy-button';

export const MarkdownViewer = ({ children }: { children: string }) => {
  return (
    <Markdown
      className={cn(
        'text-sm prose text-foreground [--tw-prose-headings:text-foreground] [--tw-prose-bullets:text-foreground]',
        /* <pre> */
        'prose-pre:p-0 prose-pre:ps-0 prose-pre:pe-0 prose-pre:bg-neutral-100',
      )}
      remarkPlugins={[remarkGfm]}
      components={{
        a: (properties) => {
          const { children, ...rest } = properties;
          return (
            <a {...rest} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        code: (properties) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { children, className, ref, node, style, ...rest } = properties;
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : 'text';

          const text = String(children).replace(/\n$/, '');

          return match ? (
            <div className="flex flex-col border border-neutral-200 rounded-md font-sans">
              <div className="flex flex-row justify-between items-center pl-3 pr-1 pt-1 text-foreground-500">
                <div className="text-xs">{language}</div>
                <CopyButton className="flex rounded-sm [&_svg]:size-3 hover:bg-neutral-50" text={text} />
              </div>
              <div className="overflow-x-scroll">
                <SyntaxHighlighter
                  {...rest}
                  customStyle={{
                    backgroundColor: 'transparent',
                    color: 'hsl(var(--foreground))',
                  }}
                  codeTagProps={{
                    className: cn(
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
                  children={text}
                  language={language}
                />
              </div>
            </div>
          ) : (
            <code
              {...rest}
              className={cn(
                className,
                'bg-neutral-200 text-neutral p-1 font-normal rounded-sm after:content-none before:content-none',
              )}
            >
              {children}
            </code>
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
};
