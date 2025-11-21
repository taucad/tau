import type { MDXComponents } from 'mdx/types.js';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { InlineCode, Pre } from '#components/code/code-block.js';
import { DocsCodeBlock } from '#routes/docs.$/docs-codeblock.js';
import { cn } from '#utils/ui.utils.js';
import { extractTextFromChildren } from '#utils/react.utils.js';

export function getMdxComponents(): MDXComponents {
  return {
    ...defaultMdxComponents,
    pre(properties) {
      const { className, children, title } = properties as {
        className: string;
        children: string;
        title: string | undefined;
      };
      // Extract language and title from className if available
      const match = /language-(\w+)/.exec(className);
      const language = match ? match[1] : '';
      const text = extractTextFromChildren(children).replace(/\n$/, '');

      return (
        <DocsCodeBlock className="bg-muted/60" title={title} text={text}>
          <Pre {...properties} language={language} />
        </DocsCodeBlock>
      );
    },
    code(properties) {
      const { children, className } = properties as {
        children: string;
        className: string;
      };

      // Only render InlineCode for inline code (strings)
      if (typeof children === 'string') {
        return (
          <InlineCode {...properties} className={className}>
            {children}
          </InlineCode>
        );
      }

      return (
        <code {...properties} className={cn(className, 'flex flex-col')}>
          {children}
        </code>
      );
    },
  };
}
