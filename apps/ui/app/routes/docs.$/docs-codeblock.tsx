import type { ComponentProps } from 'react';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockAction,
  CodeBlockContent,
} from '#components/code-block.js';
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
export function DocsCodeBlock({
  title,
  text,
  children,
  className,
  ...rest
}: DocsCodeBlockProps): React.JSX.Element {
  return (
    <CodeBlock variant="floating" className={className} {...rest}>
      <CodeBlockHeader variant="floating">
        {title && (
          <CodeBlockTitle variant="floating">{title}</CodeBlockTitle>
        )}
        <CodeBlockAction variant="floating">
          <CopyButton
            size="xs"
            variant={'ghost'}
            className="h-8 [&_[data-slot=label]]:hidden"
            getText={() => text}
          />
        </CodeBlockAction>
      </CodeBlockHeader>
      <CodeBlockContent>{children}</CodeBlockContent>
    </CodeBlock>
  );
}
