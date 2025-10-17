import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '#utils/ui.utils.js';

function Avatar({ className, ...properties }: React.ComponentProps<typeof AvatarPrimitive.Root>): React.JSX.Element {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn('relative flex size-7 shrink-0 overflow-hidden rounded-full', className)}
      {...properties}
    />
  );
}

function AvatarImage({
  className,
  ...properties
}: React.ComponentProps<typeof AvatarPrimitive.Image>): React.JSX.Element {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full', className)}
      {...properties}
    />
  );
}

function AvatarFallback({
  className,
  ...properties
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>): React.JSX.Element {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn('flex size-full items-center justify-center rounded-full bg-muted', className)}
      {...properties}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
