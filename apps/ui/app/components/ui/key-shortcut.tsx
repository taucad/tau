import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { cn } from '#utils/ui.js';

const keyboardShortcutVariants = cva(
  'font-normal text-xs tracking-[0.1em] flex items-center rounded-xs p-0 pl-1 pr-0.5 hidden md:inline-flex',
  {
    variants: {
      variant: {
        tooltip: 'bg-white/30 dark:bg-white/20 text-white dark:text-white',
        ghost: 'bg-transparent text-muted-foreground',
        default: 'bg-neutral/10 text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type KeyShortcutProperties = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof keyboardShortcutVariants>;

/**
 * Renders a key combination with proper styling
 */
export function KeyShortcut({
  children,
  className = '',
  variant = 'default',
}: KeyShortcutProperties): React.JSX.Element {
  return <span className={cn(keyboardShortcutVariants({ variant, className }))}>{children}</span>;
}
