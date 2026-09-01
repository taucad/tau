import { cn } from '@taucad/ui/utils/cn';

type ChatTextareaSkeletonProps = {
  readonly className?: string;
};

/**
 * Lightweight placeholder matching the dimensions and chrome of the chat textarea.
 * Rendered during SSR / pre-hydration to prevent layout shift.
 */
export function ChatTextareaSkeleton({ className }: ChatTextareaSkeletonProps): React.JSX.Element {
  return (
    <div className={cn('flex min-h-[52px] w-full flex-col rounded-2xl border bg-background shadow-md', className)} />
  );
}
