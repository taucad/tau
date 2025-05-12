import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import katexUrl from 'katex/dist/katex.min.css?url';
import type { LinkDescriptor } from 'react-router';
import type { JSX } from 'react';
import { CodeViewer } from '@/components/code-viewer.js';
import { CopyButton } from '@/components/copy-button.js';
import { cn } from '@/utils/ui.js';

export const markdownViewerLinks: LinkDescriptor[] = [{ rel: 'stylesheet', href: katexUrl }];

export function MarkdownViewer({ children }: { readonly children: string }): JSX.Element {
  return (
    <Markdown
      className={cn(
        'prose w-full max-w-full text-sm text-foreground',
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
        'prose-pre:bg-neutral/10 prose-pre:p-0 prose-pre:ps-0 prose-pre:pe-0',
      )}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a(properties) {
          const { children, ...rest } = properties;
          return (
            <a {...rest} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        code(properties) {
          const { children, className, ref, node, style, ...rest } = properties;
          const match = /language-(\w+)/.exec(className ?? '');
          const language = match ? match[1] : 'text';

          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- TODO: revisit this
          const text = String(children).replace(/\n$/, '');

          return match ? (
            <div className="border-neutral-200 @container/code overflow-hidden rounded-md border font-sans">
              <div className="sticky top-0 flex flex-row items-center justify-between border-b border-neutral/20 py-1 pr-1 pl-3 text-foreground/50">
                <div className="text-xs">{language}</div>
                <div className="flex flex-row gap-1">
                  <CopyButton
                    size="xs"
                    className="[&_[data-slot=label]]:hidden @xs/code:[&_[data-slot=label]]:flex"
                    getText={() => text}
                  />
                </div>
              </div>
              <CodeViewer {...rest} language={language} text={text} className="p-2" />
            </div>
          ) : (
            <code
              {...rest}
              className={cn(
                className,
                'rounded-sm bg-neutral/20 px-1 py-0.5 font-normal text-foreground/80 before:content-none after:content-none',
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
}
