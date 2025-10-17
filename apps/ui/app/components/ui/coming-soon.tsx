import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { Badge } from '#components/ui/badge.js';
import { cn } from '#utils/ui.utils.js';

const comingSoonVariants = cva(
  // Font
  'text-[0.625rem] rounded-full h-4 p-0 px-2 font-normal inline-flex align-baseline',
  {
    variants: {
      variant: {
        tooltip: 'bg-primary text-primary-foreground border-none',
        default: 'bg-primary text-primary-foreground',
      },
      size: {
        default: '',
        landing: 'text-[2rem] rounded-full h-14 p-0 px-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ComingSoonProperties = {
  readonly asChild?: boolean;
} & React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof comingSoonVariants>;

/**
 * Renders a key combination with proper styling
 */
export function ComingSoon({
  className = '',
  variant = 'default',
  size = 'default',
  asChild = false,
}: ComingSoonProperties): React.JSX.Element {
  return (
    <Badge asChild={asChild} variant="outline" className={cn(comingSoonVariants({ variant, size, className }))}>
      coming soon
    </Badge>
  );
}
