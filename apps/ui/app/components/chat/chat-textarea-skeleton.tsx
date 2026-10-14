import { cn } from '@taucad/ui/utils/cn';

type ChatTextareaSkeletonProps = {
  readonly className?: string;
};

/**
 * Lightweight placeholder matching the dimensions and chrome of the chat textarea.
 * Rendered during SSR / pre-hydration to prevent layout shift: 86 px is the
 * empty composer's measured height, on every device (F18).
 */
export function ChatTextareaSkeleton({ className }: ChatTextareaSkeletonProps): React.JSX.Element {
  return (
    <div className={cn('flex min-h-21.5 w-full flex-col rounded-2xl border bg-background shadow-md', className)} />
  );
}
