import * as React from 'react';
import { cn } from '#utils/ui.utils.js';

function Card({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card"
      className={cn('flex flex-col gap-4 rounded-xl border bg-card py-4 text-card-foreground shadow-sm', className)}
      {...properties}
    />
  );
}

function CardHeader({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4',
        className,
      )}
      {...properties}
    />
  );
}

function CardTitle({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="card-title" className={cn('leading-none font-semibold', className)} {...properties} />;
}

function CardDescription({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...properties} />
  );
}

function CardAction({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...properties}
    />
  );
}

function CardContent({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="card-content" className={cn('px-4', className)} {...properties} />;
}

function CardFooter({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div data-slot="card-footer" className={cn('flex items-center px-4 [.border-t]:pt-4', className)} {...properties} />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
