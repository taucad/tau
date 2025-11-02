import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { cn } from '#utils/ui.utils.js';

const keyboardShortcutVariants = cva(
  'font-normal select-none text-xs flex items-center rounded-xs p-0 pl-1 pr-0.5 hidden md:inline-flex',
  {
    variants: {
      variant: {
        tooltip: 'bg-white/30 dark:bg-white/20 text-white dark:text-white',
        ghost: 'bg-transparent text-muted-foreground',
        default: 'bg-neutral/10 text-muted-foreground',
      },
      tracking: {
        normal: 'tracking-[0.1em]',
        tight: 'tracking-[0.05em]',
      },
    },
    defaultVariants: {
      variant: 'default',
      tracking: 'normal',
    },
  },
);

export type KeyShortcutProperties = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof keyboardShortcutVariants>;

/**
 * Checks if a value is a string containing only alphanumeric characters
 */
function isAlphanumericString(value: unknown): boolean {
  return typeof value === 'string' && /^[a-zA-Z\d]+$/.test(value);
}

/**
 * Renders a key combination with proper styling
 */
export function KeyShortcut({
  children,
  className = '',
  variant = 'default',
}: KeyShortcutProperties): React.JSX.Element {
  const tracking = isAlphanumericString(children) ? 'tight' : 'normal';

  return <span className={cn(keyboardShortcutVariants({ variant, tracking, className }))}>{children}</span>;
}
