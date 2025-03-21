import { cn } from '@/utils/ui';
import { VariantProps, cva } from 'class-variance-authority';

const keyboardShortcutVariants = cva(
  // Font
  'font-normal text-sm tracking-[0.2em] rounded-md h-5 p-0 pl-1 pr-0.5 hidden md:inline-flex',
  {
    variants: {
      variant: {
        tooltip: 'bg-white/30 dark:bg-white/20 text-white dark:text-white',
        ghost: 'bg-transparent text-muted-foreground',
        default: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface KeyShortcutProperties
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof keyboardShortcutVariants> {
  asChild?: boolean;
}

/**
 * Renders a key combination with proper styling
 */
export const KeyShortcut = ({ children, className = '', variant = 'default' }: KeyShortcutProperties) => {
  return <span className={cn(keyboardShortcutVariants({ variant, className }))}>{children}</span>;
};
