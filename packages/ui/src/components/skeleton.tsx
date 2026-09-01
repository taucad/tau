import { cn } from '#utils/cn.js';

/**
 * Render a non-interactive loading placeholder. No APG pattern applies; pair it
 * with status text when loading state must be announced.
 *
 * @public
 * @param properties - Standard div properties.
 * @returns The loading placeholder.
 *
 * @example <caption>Reserve space while content loads</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Skeleton } from '@taucad/ui/components/skeleton';
 *
 * export const example = createElement(Skeleton, { 'aria-hidden': true });
 * ```
 */
function Skeleton({ className, ...properties }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div data-slot='skeleton' className={cn('animate-pulse rounded-md bg-muted', className)} {...properties} />;
}

export { Skeleton };
