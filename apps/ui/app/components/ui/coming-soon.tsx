import { cn } from '@/utils/ui';
import { VariantProps, cva } from 'class-variance-authority';
import { Badge } from './badge';

const comingSoonVariants = cva(
  // Font
  'text-[0.625rem] rounded-full h-4 p-0 px-2 font-normal inline-flex',
  {
    variants: {
      variant: {
        tooltip: 'bg-primary/80 dark:bg-primary/20 text-primary-foreground dark:text-primary-foreground border-none',
        default: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface ComingSoonProperties
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof comingSoonVariants> {
  asChild?: boolean;
}

/**
 * Renders a key combination with proper styling
 */
export const ComingSoon = ({ className = '', variant = 'default' }: ComingSoonProperties) => {
  return (
    <Badge variant="outline" className={cn(comingSoonVariants({ variant, className }))}>
      coming soon
    </Badge>
  );
};
