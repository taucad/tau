import type { ComponentProps } from 'react';
import { InlineCode } from '@taucad/ui/components/inline-code';
import { extractTextFromChildren } from '@taucad/ui-core/utils/react.utils';
import { CollapsibleCodeBlock } from '#components/ui/collapsible-code-block.js';
import { extractLanguageFromClassName } from '@taucad/ui-core/lib/code-language-resolution';

/**
 * Custom code component for markdown rendering.
 * Renders code blocks with syntax highlighting using CollapsibleCodeBlock,
 * and inline code using InlineCode.
 */
export function MarkdownCode({
  children,
  className,
  node: _node,
  ...rest
}: ComponentProps<'code'> & { readonly node?: unknown }): React.JSX.Element {
  const language = extractLanguageFromClassName(className);
  const text = extractTextFromChildren(children).replace(/\n$/, '');

  // Render as code block with syntax highlighting if language is detected
  if (language) {
    return <CollapsibleCodeBlock language={language} title={language} text={text} className={className ?? ''} />;
  }

  // Render as inline code
  return (
    <InlineCode {...rest} className={className}>
      {children}
    </InlineCode>
  );
}
