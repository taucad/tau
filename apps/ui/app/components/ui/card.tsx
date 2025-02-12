import * as React from 'react';

import { cn } from '@/utils/ui';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div
      ref={reference}
      className={cn('rounded-xl border bg-card text-card-foreground shadow', className)}
      {...properties}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div ref={reference} className={cn('flex flex-col space-y-1.5 p-6', className)} {...properties} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div ref={reference} className={cn('font-semibold leading-none tracking-tight', className)} {...properties} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div ref={reference} className={cn('text-sm text-muted-foreground', className)} {...properties} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div ref={reference} className={cn('p-6 pt-0', className)} {...properties} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => (
    <div ref={reference} className={cn('flex items-center p-6 pt-0', className)} {...properties} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
