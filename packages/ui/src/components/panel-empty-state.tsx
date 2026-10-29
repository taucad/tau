import { cn } from '#utils/cn.js';

type PanelEmptyStateProps = Omit<React.ComponentProps<'div'>, 'title'> & {
  /**
   * Any glyph that takes a className — every lucide icon, and the `Loader`
   * spinner a progress state puts in the same slot.
   */
  readonly icon: React.ComponentType<
    { readonly className?: string } & Pick<React.SVGProps<SVGSVGElement>, 'aria-hidden' | 'strokeWidth'>
  >;
  readonly title: string;
  /**
   * The title's heading level: one below the heading that owns the region. A pane under its pane header keeps the
   * default `3`; a page's own empty state, directly under the page `h1`, passes `2`.
   */
  readonly titleLevel?: 2 | 3 | 4;
  readonly description?: React.ReactNode;
  readonly iconClassName?: string;
};

/**
 * The empty state of a panel or pane: an icon, a title, an optional description and actions.
 *
 * @param props - The icon, copy and optional actions.
 * @returns The empty state.
 *
 * @public
 */
export const PanelEmptyState = ({
  icon: Icon,
  title,
  titleLevel = 3,
  description,
  iconClassName,
  className,
  children,
  ...properties
}: PanelEmptyStateProps): React.JSX.Element => {
  const Title = `h${String(titleLevel)}` as 'h2' | 'h3' | 'h4';
  return (
    <div
      {...properties}
      data-slot='panel-empty-state'
      className={cn(
        '@container/panel-empty-state [container-type:size] flex size-full flex-col items-center justify-center p-2 text-center',
        className,
      )}
    >
      <div data-slot='panel-empty-state-icon' className='rounded-xl border bg-card p-2'>
        <Icon aria-hidden='true' className={cn('size-5 text-muted-foreground', iconClassName)} strokeWidth={1.5} />
      </div>
      <div data-slot='panel-empty-state-copy' className='mt-3 flex max-w-xs flex-col items-center gap-1 px-3'>
        <Title data-slot='panel-empty-state-title' className='text-base font-medium text-foreground'>
          {title}
        </Title>
        {description ? (
          <p
            data-slot='panel-empty-state-description'
            className='text-sm leading-relaxed wrap-break-word text-muted-foreground'
          >
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div data-slot='panel-empty-state-content' className='mt-4 flex w-full justify-center'>
          {children}
        </div>
      ) : null}
    </div>
  );
};
