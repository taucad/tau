/**
 * A Revisions pane region: the card and bordered heading row the Details,
 * Export and Console panes share (L3-F17), on the 14 px heading step.
 */
import type { ReactNode } from 'react';
import { cn } from '@taucad/ui/utils/cn';

/**
 * One region of the Revisions pane.
 *
 * @param props - The heading's id and title, an optional heading action, and the body.
 * @returns The region.
 */
export function RevisionRegion({
  id,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  /** The heading's id, which names the region for assistive technology and for tests. */
  readonly id: string;
  readonly title: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
}): React.JSX.Element {
  return (
    <section aria-labelledby={id} className={cn('rounded-xl border border-border bg-card', className)}>
      <div className='flex min-h-8 items-center justify-between gap-2 border-b px-3 py-1'>
        <h3 id={id} className='min-w-0 truncate text-sm font-medium text-foreground'>
          {title}
        </h3>
        {action}
      </div>
      <div className={bodyClassName ?? 'p-1.5'}>{children}</div>
    </section>
  );
}
