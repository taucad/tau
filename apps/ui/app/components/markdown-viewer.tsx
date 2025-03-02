import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/utils/ui';
import { CopyButton } from '@/components/copy-button';
import { CodeViewer } from '@/components/code-viewer';

import katexUrl from 'katex/dist/katex.min.css?url';
import type { LinkDescriptor } from '@remix-run/node';

export const markdownViewerLinks: LinkDescriptor[] = [{ rel: 'stylesheet', href: katexUrl }];

export const MarkdownViewer = ({ children }: { children: string }) => {
  return (
    <Markdown
      className={cn(
        'text-sm prose text-foreground w-full max-w-full',
        '[--tw-prose-headings:text-foreground]',
        '[--tw-prose-bullets:text-foreground]',
        '[--tw-prose-bold:text-foreground]',
        '[--tw-prose-counters:text-foreground]',
        '[--tw-prose-lead:text-foreground]',
        '[--tw-prose-quotes:text-foreground]',
        '[--tw-prose-quote-borders:text-foreground]',
        '[--tw-prose-kbd:text-foreground]',
        '[--tw-prose-links:text-foreground]',
        /* <pre> */
        'prose-pre:p-0 prose-pre:ps-0 prose-pre:pe-0 prose-pre:bg-neutral/10',
      )}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
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
            <div className="border border-neutral-200 rounded-md font-sans overflow-hidden">
              <div className="flex flex-row justify-between items-center pl-3 pr-1 pt-1 text-foreground/50">
                <div className="text-xs">{language}</div>
                <CopyButton size="xs" className="flex" text={text} />
              </div>
              <CodeViewer {...rest} children={text} language={language} />
            </div>
          ) : (
            <code
              {...rest}
              className={cn(
                className,
                'bg-neutral/20 text-foreground/80 p-1 font-normal rounded-sm after:content-none before:content-none',
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
