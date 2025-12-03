import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import katexUrl from 'katex/dist/katex.min.css?url';
import type { LinkDescriptor } from 'react-router';
import { memo } from 'react';
import { InlineCode } from '#components/code/code-block.js';
import { cn } from '#utils/ui.utils.js';
import { extractTextFromChildren } from '#utils/react.utils.js';
import { CollapsibleCodeBlock } from '#components/markdown/collapsible-code-block.js';

export const markdownViewerLinks: LinkDescriptor[] = [{ rel: 'stylesheet', href: katexUrl }];

export const MarkdownViewer = memo(({ children }: { readonly children: string }): React.JSX.Element => {
  return (
    <div
      className={cn(
        'prose w-full max-w-full text-sm text-foreground',
        'overflow-wrap-anywhere wrap-break-word hyphens-auto',
        '[--tw-prose-headings:text-foreground]',
        '[--tw-prose-bullets:text-foreground]',
        '[--tw-prose-bold:text-foreground]',
        '[--tw-prose-counters:text-foreground]',
        '[--tw-prose-lead:text-foreground]',
        '[--tw-prose-quotes:text-foreground]',
        '[--tw-prose-quote-borders:text-foreground]',
        '[--tw-prose-kbd:text-foreground]',
        '[--tw-prose-links:text-foreground]',
        '[--tw-prose-pre-bg:text-neutral/10]',
      )}
    >
      <Markdown
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
            // Check if this is a code block (has language class) or inline code
            const match = /language-(\w+)/.exec(className ?? '');
            const text = extractTextFromChildren(children).replace(/\n$/, '');

            if (match?.[1]) {
              const language = match[1];
              return (
                <CollapsibleCodeBlock language={language} title={language} text={text} className={className ?? ''}>
                  {children}
                </CollapsibleCodeBlock>
              );
            }

            // Render as inline code
            return (
              <InlineCode {...rest} className={className}>
                {children}
              </InlineCode>
            );
          },
        }}
      >
        {children}
      </Markdown>
    </div>
  );
});
