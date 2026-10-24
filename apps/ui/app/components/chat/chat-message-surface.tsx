import type { ComponentProps } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { chatUserMessagePaddingClassName } from '#components/chat/chat-input-styles.js';

/** The transcript's message surface, with the same user bubble geometry in every host. */
export function ChatMessageSurface({
  isUser,
  className,
  ...props
}: ComponentProps<'div'> & { readonly isUser: boolean }): React.JSX.Element {
  return (
    <div
      {...props}
      className={cn(
        'flex flex-col gap-0 min-w-0',
        isUser &&
          'relative z-10 cursor-action rounded-lg border bg-background px-3 outline-none hover:border-foreground/20 focus-visible:focus-outline',
        isUser && chatUserMessagePaddingClassName,
        className,
      )}
    />
  );
}
