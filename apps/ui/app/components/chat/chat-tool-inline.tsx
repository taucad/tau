import type { LucideIcon } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { AnimatedShinyText } from '#components/magicui/animated-shiny-text.js';
import { cn } from '@taucad/ui/utils/cn';

type ChatToolInlineStatus = 'loading' | 'success' | 'error';

type ChatToolInlineProps = {
  readonly children: React.ReactNode;
  readonly status?: ChatToolInlineStatus;
  readonly icon?: LucideIcon;
  readonly className?: string;
  /**
   * Custom image to show instead of icon (e.g., favicon).
   */
  readonly image?: {
    src: string;
    alt: string;
  };
};

/**
 * Simple inline component for tool status badges and links.
 *
 * @example
 * // Loading state
 * <ChatToolInline status="loading" icon={File}>
 *   Reading main.kcl...
 * </ChatToolInline>
 *
 * // Success state
 * <ChatToolInline status="success" icon={Check}>
 *   Deleted file.kcl
 * </ChatToolInline>
 *
 * // With favicon image
 * <ChatToolInline status="success" image={{ src: faviconUrl, alt: domain }}>
 *   Visited google.com
 * </ChatToolInline>
 */
export function ChatToolInline({
  children,
  status = 'success',
  icon: Icon,
  className,
  image,
}: ChatToolInlineProps): React.JSX.Element {
  const isLoading = status === 'loading';
  const isError = status === 'error';

  return (
    <Badge
      variant={isError ? 'destructive' : 'outline'}
      className={cn('flex max-w-full flex-row items-center gap-2', className)}
    >
      {isLoading ? (
        <>
          <LoaderCircle className='size-3 shrink-0 animate-spin text-inherit' />
          <AnimatedShinyText className='min-w-0 truncate'>{children}</AnimatedShinyText>
        </>
      ) : (
        <>
          {image ? (
            <img src={image.src} alt={image.alt} className='size-3 shrink-0 rounded-full' />
          ) : Icon ? (
            <Icon className={cn('size-3 shrink-0', isError ? 'text-destructive' : 'text-muted-foreground')} />
          ) : undefined}
          <span className='min-w-0 truncate'>{children}</span>
        </>
      )}
    </Badge>
  );
}

type ChatToolInlineLinkProps = {
  readonly children: React.ReactNode;
  readonly status?: 'loading' | 'ready';
  readonly className?: string;
};

/**
 * Inline wrapper for file/path references that shows loading animation.
 *
 * Use with FileLink for clickable file references:
 *
 * @example
 * <ChatToolInlineLink status="loading">
 *   <ChatToolInlineAction>Reading</ChatToolInlineAction>{' '}
 *   <ChatToolInlineDescription>main.kcl...</ChatToolInlineDescription>
 * </ChatToolInlineLink>
 *
 * <ChatToolInlineLink status="ready">
 *   <ChatToolInlineAction>Read</ChatToolInlineAction>{' '}
 *   <FileLink path="main.kcl">
 *     <ChatToolInlineDescription>main.kcl</ChatToolInlineDescription>
 *   </FileLink>
 * </ChatToolInlineLink>
 */
export function ChatToolInlineLink({
  children,
  status = 'ready',
  className,
}: ChatToolInlineLinkProps): React.JSX.Element {
  const isLoading = status === 'loading';

  return (
    <span className={cn('text-sm text-muted-foreground', className)}>
      {isLoading ? <AnimatedShinyText>{children}</AnimatedShinyText> : children}
    </span>
  );
}
