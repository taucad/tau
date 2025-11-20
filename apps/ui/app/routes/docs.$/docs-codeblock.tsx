import type { ComponentProps } from 'react';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockAction,
  CodeBlockContent,
} from '#components/code/code-block.js';
import { CopyButton } from '#components/copy-button.js';

type DocsCodeBlockProps = {
  readonly title?: string;
  readonly text: string;
  readonly children: React.ReactNode;
} & Omit<ComponentProps<typeof CodeBlock>, 'variant'>;

/**
 * Docs-specific code block component with floating actions
 * This is the intermediary component used throughout the documentation
 */
export function DocsCodeBlock({ title, text, children, className, ...rest }: DocsCodeBlockProps): React.JSX.Element {
  const hasTitle = title !== undefined && title !== '';
  const variant = hasTitle ? 'standard' : 'floating';
  return (
    <CodeBlock variant={variant} className={className} {...rest}>
      <CodeBlockHeader className="bg-transparent" variant={variant}>
        {title ? <CodeBlockTitle className="text-sm">{title}</CodeBlockTitle> : null}
        <CodeBlockAction variant={variant}>
          <CopyButton size="xs" variant="ghost" className="h-8 [&_[data-slot=label]]:hidden" getText={() => text} />
        </CodeBlockAction>
      </CodeBlockHeader>
      <CodeBlockContent>{children}</CodeBlockContent>
    </CodeBlock>
  );
}
