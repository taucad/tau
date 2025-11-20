import type { MDXComponents } from 'mdx/types.js';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { InlineCode, Pre } from '#components/code/code-block.js';
import { DocsCodeBlock } from '#routes/docs.$/docs-codeblock.js';

export function getMdxComponents(): MDXComponents {
  return {
    ...defaultMdxComponents,
    pre(props) {
      // Extract language and title from className if available
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- props is not typed correctly.
      const className = props.className ?? '';
      const match = /language-(\w+)/.exec(className as string);
      const language = match ? match[1] : '';
      const text = String(props.children).replace(/\n$/, '');

      return (
        <DocsCodeBlock title={language} text={text}>
          <Pre {...props} language={language} />
        </DocsCodeBlock>
      );
    },
    code(properties) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- properties is not typed correctly.
      const { children, className, ref, node, style, ...rest } = properties;

      // Only render InlineCode for inline code (strings)
      if (typeof children === 'string') {
        return (
          <InlineCode {...rest} className={className as string}>
            {children}
          </InlineCode>
        );
      }

      return (
        <code {...rest} className={className as string}>
          {children}
        </code>
      );
    },
  };
}
