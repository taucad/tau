import { cn } from '@taucad/ui/utils/cn';

type ChatTextareaSkeletonProps = {
  readonly className?: string;
  /** Match a collapsible composer's resting row on phones. */
  readonly enableMobileCollapse?: boolean;
};

/**
 * Lightweight placeholder matching the dimensions and chrome of the chat textarea.
 * Rendered during SSR / pre-hydration to prevent layout shift: 82 px is the
 * empty composer's measured height, on every device (F18) — except a
 * collapsible composer on a phone, which rests as one row.
 */
export function ChatTextareaSkeleton({
  className,
  enableMobileCollapse = false,
}: ChatTextareaSkeletonProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-h-20.5 w-full flex-col rounded-2xl border bg-background shadow-md',
        enableMobileCollapse && 'max-md:min-h-12.5 max-md:rounded-3xl',
        className,
      )}
    />
  );
}
