import { createContext, useContext } from 'react';
import { Heading } from '@taucad/ui/components/heading';
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

type HeaderRowProps = Omit<React.ComponentProps<'div'>, 'title'> & {
  /** Collection size shown beside the title, muted and tabular. */
  readonly count?: number;
  /** The one primary action, and any control that shares its row. */
  readonly action?: React.ReactNode;
};

type PageHeaderProps = HeaderRowProps & {
  /** The page title. */
  readonly title: string;
};

type SectionHeaderProps = HeaderRowProps & {
  /** The section title. */
  readonly title: string;
  /** The outline level: one below the heading that owns the region the section sits in. */
  readonly level: 2 | 3;
};

/** The row both headers share: the heading, an optional count beside it and the action at the inline end. */
function HeaderRow({
  heading,
  count,
  action,
  className,
  ...properties
}: HeaderRowProps & { readonly heading: React.ReactNode }): React.JSX.Element {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center justify-between gap-4', className)} {...properties}>
      <div data-slot='page-header-title' className='flex items-baseline gap-3'>
        {heading}
        {count === undefined ? null : <span className='text-muted-foreground tabular-nums'>{count}</span>}
      </div>
      {action}
    </div>
  );
}

/**
 * Title row of a page: its one `h1` in the `page` role, an optional muted count and one
 * action slot, wrapping on narrow viewports. A section inside a page uses `SectionHeader`.
 */
export function PageHeader({ title, ...row }: PageHeaderProps): React.JSX.Element {
  const isTitleInPhoneBar = usePhoneTopBar().hasTitle;
  return (
    <HeaderRow
      {...row}
      heading={
        /* Below `md` the bar shows the title; the heading stays in the outline and the count stays visible. */
        <Heading level={1} variant='page' className={isTitleInPhoneBar ? 'max-md:sr-only' : undefined}>
          {title}
        </Heading>
      }
    />
  );
}

/**
 * Title row of a section inside a page: a heading in the `section` role at the level its
 * host gives it, with the same count and action slots as `PageHeader`. It never repeats in
 * the phone top bar, so it stays visible at every width.
 */
export function SectionHeader({ title, level, ...row }: SectionHeaderProps): React.JSX.Element {
  return (
    <HeaderRow
      {...row}
      heading={
        <Heading level={level} variant='section'>
          {title}
        </Heading>
      }
    />
  );
}
