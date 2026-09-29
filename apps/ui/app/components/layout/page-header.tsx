import { cn } from '@taucad/ui/utils/cn';

type PageHeaderProps = Omit<React.ComponentProps<'div'>, 'title'> & {
  /** The page's one `h1`. */
  readonly title: string;
  /** Collection size shown beside the title, muted and tabular. */
  readonly count?: number;
  /** The page's one primary action, and any control that shares its row. */
  readonly action?: React.ReactNode;
};

/**
 * Title row of an index page: the page's one `h1` at 36 px weight 500, an optional
 * muted count and one action slot, wrapping on narrow viewports.
 */
export function PageHeader({ title, count, action, className, ...properties }: PageHeaderProps): React.JSX.Element {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center justify-between gap-4', className)} {...properties}>
      <div className='flex items-baseline gap-3'>
        <h1 className='text-4xl leading-[1.1] font-medium tracking-tight'>{title}</h1>
        {count === undefined ? null : <span className='text-muted-foreground tabular-nums'>{count}</span>}
      </div>
      {action}
    </div>
  );
}
