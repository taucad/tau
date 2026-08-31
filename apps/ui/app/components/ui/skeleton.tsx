import { cn } from '#utils/ui.utils.js';

function Skeleton({ className, ...properties }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...properties} />;
}

export { Skeleton };
