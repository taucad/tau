import { createContext, useContext } from 'react';
import { cn } from '@taucad/ui/utils/cn';

/**
 * What the shell's phone top bar (D11) carries for the current route, from route
 * facts only so the server markup already matches a phone's first paint.
 */
export type PhoneTopBar = {
  /**
   * The bar shows the page's title. The page's heading then hides visually below `md`
   * but stays in the outline (its count stays visible), so a phone reads one title and
   * the document keeps exactly one `<h1>`.
   */
  readonly hasTitle: boolean;
  /**
   * The bar shows the route's one action (`Handle.actions`). The page hides its own
   * copy of that control below `md`, so a phone has one control per destination (I4).
   */
  readonly hasAction: boolean;
};

export const PhoneTopBarContext = createContext<PhoneTopBar>({ hasTitle: false, hasAction: false });

/** Reads what the phone top bar carries for the current route. */
export const usePhoneTopBar = (): PhoneTopBar => useContext(PhoneTopBarContext);

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
  // Only the page's own title row repeats the bar; an embedded section's `h2` keeps showing.
  const isTitleInPhoneBar = usePhoneTopBar().hasTitle && headingLevel === 1;
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center justify-between gap-4', className)} {...properties}>
      <div data-slot='page-header-title' className='flex items-baseline gap-3'>
        {/* Below `md` the bar shows the title; the heading stays in the outline and the count stays visible. */}
        <Heading
          className={cn('text-4xl leading-[1.1] font-medium tracking-tight', isTitleInPhoneBar && 'max-md:sr-only')}
        >
          {title}
        </Heading>
        {count === undefined ? null : <span className='text-muted-foreground tabular-nums'>{count}</span>}
      </div>
      {action}
    </div>
  );
}
