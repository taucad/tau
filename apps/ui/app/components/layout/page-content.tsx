import { cn } from '@taucad/ui/utils/cn';

/** Shared gutters and top inset for product pages using PageHeader. */
export function PageContent({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('container mx-auto px-4 pt-5 pb-8', className)} {...properties} />;
}
