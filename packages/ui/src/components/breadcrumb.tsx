import * as React from 'react';
import { Slot as SlotPrimitive } from 'radix-ui';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '#utils/cn.js';

/**
 * Render the APG breadcrumb pattern as a labelled navigation landmark. Links use
 * native keyboard navigation; the current page is marked by {@link BreadcrumbPage}.
 *
 * @public
 * @param properties - Standard navigation properties.
 * @returns The breadcrumb landmark.
 *
 * @example <caption>Create breadcrumb navigation</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Breadcrumb, BreadcrumbList } from '@taucad/ui/components/breadcrumb';
 *
 * export const example = createElement(Breadcrumb, null, createElement(BreadcrumbList));
 * ```
 */
function Breadcrumb({ ...properties }: React.ComponentProps<'nav'>): React.JSX.Element {
  return <nav aria-label='breadcrumb' data-slot='breadcrumb' {...properties} />;
}

/**
 * Order breadcrumb items from the broadest location to the current page.
 *
 * @public
 * @param properties - Standard ordered-list properties.
 * @returns The breadcrumb list.
 *
 * @example <caption>Add a breadcrumb list</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { BreadcrumbList } from '@taucad/ui/components/breadcrumb';
 *
 * export const example = createElement(BreadcrumbList);
 * ```
 */
function BreadcrumbList({ className, ...properties }: React.ComponentProps<'ol'>): React.JSX.Element {
  return (
    <ol
      data-slot='breadcrumb-list'
      className={cn(
        'flex flex-wrap items-center gap-1.5 text-sm break-words text-muted-foreground sm:gap-2.5',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Group one breadcrumb link or current-page label with its separator.
 *
 * @public
 * @param properties - Standard list-item properties.
 * @returns The breadcrumb item.
 *
 * @example <caption>Add a breadcrumb item</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { BreadcrumbItem } from '@taucad/ui/components/breadcrumb';
 *
 * export const example = createElement(BreadcrumbItem, null, 'Models');
 * ```
 */
function BreadcrumbItem({ className, ...properties }: React.ComponentProps<'li'>): React.JSX.Element {
  return (
    <li data-slot='breadcrumb-item' className={cn('inline-flex items-center gap-1.5', className)} {...properties} />
  );
}

/**
 * Render a breadcrumb destination as a native link or semantic child.
 *
 * @public
 * @param properties - Anchor properties and optional slot composition.
 * @returns The breadcrumb link.
 *
 * @example <caption>Link to the projects page</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { BreadcrumbLink } from '@taucad/ui/components/breadcrumb';
 *
 * export const example = createElement(BreadcrumbLink, { href: '/projects' }, 'Projects');
 * ```
 */
function BreadcrumbLink({
  asChild,
  className,
  ...properties
}: React.ComponentProps<'a'> & {
  readonly asChild?: boolean;
}): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'a';

  return <Comp data-slot='breadcrumb-link' className={cn('hover:text-foreground', className)} {...properties} />;
}

/**
 * Mark the current, non-navigable page in a breadcrumb trail.
 *
 * @public
 * @param properties - Standard span properties.
 * @returns The current-page label.
 *
 * @example <caption>Identify the current page</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { BreadcrumbPage } from '@taucad/ui/components/breadcrumb';
 *
 * export const example = createElement(BreadcrumbPage, null, 'Gearbox');
 * ```
 */
function BreadcrumbPage({ className, ...properties }: React.ComponentProps<'span'>): React.JSX.Element {
  return (
    <span
      data-slot='breadcrumb-page'
      role='link'
      aria-disabled='true'
      aria-current='page'
      className={cn('font-normal text-foreground', className)}
      {...properties}
    />
  );
}

/**
 * Visually separate breadcrumb items while remaining hidden from assistive technology.
 *
 * @public
 * @param properties - Standard list-item properties.
 * @returns The presentational separator.
 *
 * @example <caption>Add the default separator</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { BreadcrumbSeparator } from '@taucad/ui/components/breadcrumb';
 *
 * export const example = createElement(BreadcrumbSeparator);
 * ```
 */
function BreadcrumbSeparator({ children, className, ...properties }: React.ComponentProps<'li'>): React.JSX.Element {
  return (
    <li
      data-slot='breadcrumb-separator'
      role='presentation'
      aria-hidden='true'
      className={cn('[&>svg]:size-3.5', className)}
      {...properties}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

/**
 * Indicate omitted breadcrumb levels without adding an interactive control.
 *
 * @public
 * @param properties - Standard span properties.
 * @returns The presentational ellipsis.
 *
 * @example <caption>Collapse intermediate breadcrumb levels</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { BreadcrumbEllipsis } from '@taucad/ui/components/breadcrumb';
 *
 * export const example = createElement(BreadcrumbEllipsis);
 * ```
 */
function BreadcrumbEllipsis({ className, ...properties }: React.ComponentProps<'span'>): React.JSX.Element {
  return (
    <span
      data-slot='breadcrumb-ellipsis'
      role='presentation'
      aria-hidden='true'
      className={cn('flex size-9 items-center justify-center', className)}
      {...properties}
    >
      <MoreHorizontal className='size-4' />
      <span className='sr-only'>More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
