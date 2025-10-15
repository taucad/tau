import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import katexUrl from 'katex/dist/katex.min.css?url';
import type { LinkDescriptor } from 'react-router';
import { memo } from 'react';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockAction,
  CodeBlockContent,
  InlineCode,
  Pre,
} from '#components/code/code-block.js';
import { CopyButton } from '#components/copy-button.js';
import { cn } from '#utils/ui.utils.js';

export const markdownViewerLinks: LinkDescriptor[] = [{ rel: 'stylesheet', href: katexUrl }];

export const MarkdownViewer = memo(({ children }: { readonly children: string }): React.JSX.Element => {
  return (
    <div
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
            // eslint-disable-next-line @typescript-eslint/no-base-to-string -- children is stringifiable.
            const text = String(children).replace(/\n$/, '');

            if (match) {
              const language = match[1];
              return (
                <CodeBlock variant="standard">
                  <CodeBlockHeader variant="standard">
                    <CodeBlockTitle variant="standard">{language}</CodeBlockTitle>
                    <CodeBlockAction variant="standard">
                      <CopyButton
                        size="xs"
                        className="h-6 [&_[data-slot=label]]:hidden @xs/code:[&_[data-slot=label]]:flex"
                        getText={() => text}
                      />
                    </CodeBlockAction>
                  </CodeBlockHeader>
                  <CodeBlockContent>
                    <Pre {...rest} language={language} className={cn('text-xs', className)}>
                      {children}
                    </Pre>
                  </CodeBlockContent>
                </CodeBlock>
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
