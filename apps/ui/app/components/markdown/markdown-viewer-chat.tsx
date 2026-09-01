import { memo, useMemo } from 'react';
import type { ComponentProps } from 'react';
import type { ControlsConfig, StreamdownProps } from 'streamdown';
import { cn } from '@taucad/ui/utils/cn';
import { defaultMarkdownControls, MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { rehypeAtReferences } from '#components/markdown/rehype-at-references.js';
import { AtReferenceChip } from '#components/chat/at-reference-chip.js';

const chatMarkdownControls: ControlsConfig = { ...defaultMarkdownControls, table: false };

const chatRehypePlugins: StreamdownProps['rehypePlugins'] = [rehypeAtReferences];

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/**
 * Factory function to create a chat-sized header component.
 * All headers in chat context are rendered smaller than standard markdown headers.
 */
function createChatHeader(
  Tag: HeadingTag,
  headingClassName: string,
): (properties: ComponentProps<HeadingTag>) => React.JSX.Element {
  function ChatHeader({ children, className, ...rest }: ComponentProps<HeadingTag>): React.JSX.Element {
    return (
      <Tag className={cn(headingClassName, className)} {...rest}>
        {children}
      </Tag>
    );
  }

  return ChatHeader;
}

/**
 * Markdown header components sized appropriately for chat context.
 * Headers are smaller than standard markdown headers since chat messages
 * are displayed in a more compact format.
 */
const chatHeaderComponents = {
  h1: createChatHeader('h1', 'text-lg font-bold'),
  h2: createChatHeader('h2', 'text-base font-semibold'),
  h3: createChatHeader('h3', 'text-sm font-semibold'),
  h4: createChatHeader('h4', 'text-sm font-medium'),
  h5: createChatHeader('h5', 'text-xs font-medium'),
  h6: createChatHeader('h6', 'text-xs font-medium'),
} as const satisfies StreamdownProps['components'];

type MarkdownViewerChatProps = Omit<ComponentProps<typeof MarkdownViewer>, 'controls'>;

/**
 * A MarkdownViewer variant optimized for chat context.
 * Uses smaller header sizes and enables table support by default.
 */
export const MarkdownViewerChat = memo(function ({
  children,
  isStreaming = false,
  className,
  components,
}: MarkdownViewerChatProps): React.JSX.Element {
  const memoizedComponents = useMemo(
    () => ({
      ...chatHeaderComponents,
      mark: AtReferenceChip,
      ...components,
    }),
    [components],
  );

  return (
    <MarkdownViewer
      className={className}
      streamdownClassName='space-y-2'
      isStreaming={isStreaming}
      components={memoizedComponents}
      controls={chatMarkdownControls}
      rehypePlugins={chatRehypePlugins}
    >
      {children}
    </MarkdownViewer>
  );
});
