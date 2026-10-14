import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@taucad/ui/utils/cn';

const pageContentVariants = cva('container mx-auto px-4 pt-5 pb-8', {
  variants: {
    layout: {
      document: '',
      fill: 'flex flex-col gap-4 pb-4 md:h-full md:min-h-0',
    },
  },
  defaultVariants: { layout: 'document' },
});

type PageContentProps = React.ComponentProps<'div'> & VariantProps<typeof pageContentVariants>;

/** Shared gutters and top inset for product pages using PageHeader. */
export function PageContent({ layout, className, ...properties }: PageContentProps): React.JSX.Element {
  return <div className={cn(pageContentVariants({ layout }), className)} {...properties} />;
}
