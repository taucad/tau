import * as React from 'react';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn } from '#utils/cn.js';

/**
 * Render an image with a delayed fallback. No APG pattern applies; provide useful
 * alternative text on {@link AvatarImage} when the image conveys identity.
 *
 * @public
 * @param properties - Radix avatar root properties.
 * @returns The avatar root.
 *
 * @example <caption>Create an avatar</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Avatar, AvatarFallback } from '@taucad/ui/components/avatar';
 *
 * export const example = createElement(Avatar, null, createElement(AvatarFallback, null, 'RF'));
 * ```
 */
function Avatar({ className, ...properties }: React.ComponentProps<typeof AvatarPrimitive.Root>): React.JSX.Element {
  return (
    <AvatarPrimitive.Root
      data-slot='avatar'
      className={cn('relative flex size-7 shrink-0 overflow-hidden rounded-full', className)}
      {...properties}
    />
  );
}

/**
 * Render the avatar image after it loads successfully.
 *
 * @public
 * @param properties - Radix avatar image properties.
 * @returns The avatar image.
 *
 * @example <caption>Load an avatar image</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AvatarImage } from '@taucad/ui/components/avatar';
 *
 * export const example = createElement(AvatarImage, { src: '/avatar.png', alt: 'Richard Fontein' });
 * ```
 */
function AvatarImage({
  className,
  ...properties
}: React.ComponentProps<typeof AvatarPrimitive.Image>): React.JSX.Element {
  return (
    <AvatarPrimitive.Image
      data-slot='avatar-image'
      className={cn('aspect-square size-full', className)}
      {...properties}
    />
  );
}

/**
 * Render initials or another fallback while the avatar image is unavailable.
 *
 * @public
 * @param properties - Radix avatar fallback properties.
 * @returns The avatar fallback.
 *
 * @example <caption>Show initials as a fallback</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { AvatarFallback } from '@taucad/ui/components/avatar';
 *
 * export const example = createElement(AvatarFallback, null, 'RF');
 * ```
 */
function AvatarFallback({
  className,
  ...properties
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>): React.JSX.Element {
  return (
    <AvatarPrimitive.Fallback
      data-slot='avatar-fallback'
      className={cn('flex size-full items-center justify-center rounded-full bg-muted', className)}
      {...properties}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
