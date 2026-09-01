import { cva } from 'class-variance-authority';
import { cn } from '@taucad/ui/utils/cn';

export const collectionEmptyStateVariants = cva(
  'flex flex-col h-full items-center justify-center m-2 border border-dashed text-muted-foreground rounded-xs py-4 px-2 text-center text-sm',
);

export const CollectionEmptyState = ({ className, ...properties }: React.ComponentProps<'div'>): React.JSX.Element => (
  <div {...properties} data-slot='collection-empty-state' className={cn(collectionEmptyStateVariants(), className)} />
);
