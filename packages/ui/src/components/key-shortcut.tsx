import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { cn } from '#utils/cn.js';
import { usePlatform } from '#hooks/use-platform.js';
import { formatKeyCombination } from '#utils/keys.js';
import type { KeyCombination } from '#utils/keys.js';

/* A key chip only helps someone with a keyboard: phones hide it by width and touch tablets by pointer. */
const keyboardShortcutVariants = cva(
  'font-normal select-none text-xs flex items-center rounded-xs p-0 pl-1 pr-0.5 hidden md:inline-flex pointer-coarse:hidden',
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

/**
 * Properties of {@link KeyShortcut}: the key combination and its visual variant.
 *
 * @public
 */
export type KeyShortcutProperties = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof keyboardShortcutVariants> & {
    /**
     * The combination to label, in place of `children`. The chip then carries both platforms' labels and shows the
     * one `<html data-platform>` names before hydration (`other` for Windows and Linux, absent for macOS), so a
     * chip drawn at first paint keeps its box when the page learns the platform. Without that attribute the chip
     * follows `usePlatform`, as a label passed as `children` does.
     */
    readonly combination?: KeyCombination;
  };

/**
 * Checks if a value is a string containing only alphanumeric characters
 */
function isAlphanumericString(value: unknown): boolean {
  return typeof value === 'string' && /^[\dA-Za-z]+$/.test(value);
}

/**
 * Renders a key combination with proper styling
 * @public
 */
export function KeyShortcut({
  children,
  className = '',
  variant = 'default',
  combination,
}: KeyShortcutProperties): React.JSX.Element {
  if (combination !== undefined) {
    return <PlatformKeyShortcut combination={combination} className={className} variant={variant} />;
  }
  const tracking = isAlphanumericString(children) ? 'tight' : 'normal';

  return <span className={cn(keyboardShortcutVariants({ variant, tracking, className }))}>{children}</span>;
}

/* Before hydration `usePlatform` reports the server's platform (macOS), so the head script's attribute decides. */
const macLabelClass = '[:root[data-platform=other]_&]:hidden';
const otherLabelClass = 'hidden [:root[data-platform=other]_&]:inline';

function PlatformKeyShortcut({
  combination,
  className,
  variant,
}: Readonly<{
  combination: KeyCombination;
  className: string;
  variant: KeyShortcutProperties['variant'];
}>): React.JSX.Element {
  const platform = usePlatform();
  const mac = formatKeyCombination(combination, 'mac');
  const other = formatKeyCombination(combination, 'other');
  const tracking = isAlphanumericString(platform === 'mac' ? mac : other) ? 'tight' : 'normal';
  return (
    <span className={cn(keyboardShortcutVariants({ variant, tracking, className }))}>
      <span className={platform === 'mac' ? macLabelClass : 'hidden'}>{mac}</span>
      <span className={platform === 'mac' ? otherLabelClass : undefined}>{other}</span>
    </span>
  );
}
