import { cn } from '@taucad/ui/utils/cn';

type PageHeaderProps = Omit<React.ComponentProps<'div'>, 'title'> & {
  /** The page or section title. */
  readonly title: string;
  /** Use level two when the host already supplies the page heading. */
  readonly headingLevel?: 1 | 2;
  /** Collection size shown beside the title, muted and tabular. */
  readonly count?: number;
  /** The page's one primary action, and any control that shares its row. */
  readonly action?: React.ReactNode;
};

/**
 * Title row of a page or embedded section at 36 px weight 500, an optional
 * muted count and one action slot, wrapping on narrow viewports.
 */
export function PageHeader({
  title,
  count,
  action,
  headingLevel = 1,
  className,
  ...properties
}: PageHeaderProps): React.JSX.Element {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center justify-between gap-4', className)} {...properties}>
      <div className='flex items-baseline gap-3'>
        <Heading className='text-4xl leading-[1.1] font-medium tracking-tight'>{title}</Heading>
        {count === undefined ? null : <span className='text-muted-foreground tabular-nums'>{count}</span>}
      </div>
      {action}
    </div>
  );
}
