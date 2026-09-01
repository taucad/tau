import * as React from 'react';
import { cn } from '#utils/cn.js';

/**
 * Render a visual content surface. No APG pattern applies; consumers choose
 * semantic descendants appropriate to the card's content.
 *
 * @public
 * @param properties - Standard div properties.
 * @returns The card container.
 *
 * @example <caption>Create a card</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Card } from '@taucad/ui/components/card';
 *
 * export const example = createElement(Card, null, 'Model summary');
 * ```
 */
function Card({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='card'
      className={cn('flex flex-col gap-4 rounded-xl border bg-card py-4 text-card-foreground shadow-sm', className)}
      {...properties}
    />
  );
}

/**
 * Lay out a card title, description, and optional action.
 *
 * @public
 * @param properties - Standard div properties.
 * @returns The card header.
 *
 * @example <caption>Add a card header</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CardHeader } from '@taucad/ui/components/card';
 *
 * export const example = createElement(CardHeader, null, 'Model');
 * ```
 */
function CardHeader({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='card-header'
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4',
        className,
      )}
      {...properties}
    />
  );
}

/**
 * Render a card title slot without imposing a heading level.
 *
 * @public
 * @param properties - Standard div properties.
 * @returns The card title slot.
 *
 * @example <caption>Add a card title</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CardTitle } from '@taucad/ui/components/card';
 *
 * export const example = createElement(CardTitle, null, 'Model');
 * ```
 */
function CardTitle({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot='card-title' className={cn('leading-none font-semibold', className)} {...properties} />;
}

/**
 * Render secondary explanatory text in a card header.
 *
 * @public
 * @param properties - Standard div properties.
 * @returns The card description slot.
 *
 * @example <caption>Describe a card</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CardDescription } from '@taucad/ui/components/card';
 *
 * export const example = createElement(CardDescription, null, 'Updated moments ago');
 * ```
 */
function CardDescription({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div data-slot='card-description' className={cn('text-sm text-muted-foreground', className)} {...properties} />
  );
}

/**
 * Position an action at the inline end of a card header.
 *
 * @public
 * @param properties - Standard div properties.
 * @returns The card action slot.
 *
 * @example <caption>Add a card action</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CardAction } from '@taucad/ui/components/card';
 *
 * export const example = createElement(CardAction, null, 'Actions');
 * ```
 */
function CardAction({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='card-action'
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...properties}
    />
  );
}

/**
 * Render the primary card content region.
 *
 * @public
 * @param properties - Standard div properties.
 * @returns The card content slot.
 *
 * @example <caption>Add card content</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CardContent } from '@taucad/ui/components/card';
 *
 * export const example = createElement(CardContent, null, '20 parameters');
 * ```
 */
function CardContent({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot='card-content' className={cn('px-4', className)} {...properties} />;
}

/**
 * Render the action or metadata row at the end of a card.
 *
 * @public
 * @param properties - Standard div properties.
 * @returns The card footer slot.
 *
 * @example <caption>Add a card footer</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { CardFooter } from '@taucad/ui/components/card';
 *
 * export const example = createElement(CardFooter, null, 'Last saved today');
 * ```
 */
function CardFooter({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div data-slot='card-footer' className={cn('flex items-center px-4 [.border-t]:pt-4', className)} {...properties} />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
