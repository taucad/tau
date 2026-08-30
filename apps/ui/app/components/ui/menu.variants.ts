import { cva } from 'class-variance-authority';
import { popoverSurfaceVariants } from '#components/ui/popover.variants.js';

/**
 * Shared item styling for all menu-like components (dropdown-menu, context-menu, command, select).
 * Compact macOS-inspired design with a neutral focus highlight.
 */
export const menuItemVariants = cva(
  "relative flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1 text-[13px] outline-hidden select-none data-disabled:pointer-events-none data-disabled:text-muted-foreground/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:-translate-y-[0.5px] [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-muted-foreground",
  {
    variants: {
      variant: {
        default: '',
        destructive: 'focus:bg-menu-highlight-destructive',
      },
      inset: {
        true: 'pl-8', // For items with left indicator (checkbox/radio)
        false: '',
      },
      highlight: {
        // Uses :not([class*='text-']) to match the same SVGs as the base muted rule with higher specificity
        focus: "focus:bg-menu-highlight focus:text-foreground focus:[&_svg:not([class*='text-'])]:text-foreground",
        selected:
          "hover:bg-menu-highlight hover:text-foreground hover:[&_svg:not([class*='text-'])]:text-foreground data-[selected=true]:bg-menu-highlight data-[selected=true]:text-foreground data-[selected=true]:[&_svg:not([class*='text-'])]:text-foreground",
      },
    },
    defaultVariants: {
      variant: 'default',
      inset: false,
      highlight: 'focus',
    },
  },
);

/**
 * Content container styling for menu popover/dropdown containers.
 * Instant open/close (no animation) by default for a snappy feel.
 */
export const menuContentVariants = cva(
  [popoverSurfaceVariants({ appearance: 'menu' }), 'z-50 flex min-w-32 flex-col gap-0.5 overflow-hidden p-0.75'],
  {
    variants: {
      animated: {
        true: 'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        false: '',
      },
    },
    defaultVariants: {
      animated: false,
    },
  },
);

/**
 * Shared open-state styling for sub-menu triggers.
 */
export const menuSubTriggerOpenClass =
  'data-[state=open]:bg-menu-highlight data-[state=open]:text-foreground data-[state=open]:[&_svg]:text-foreground';

/**
 * Shared shortcut styling for keyboard shortcut hints.
 */
export const menuShortcutClass = 'ml-auto text-[11px] tracking-normal text-muted-foreground';

/**
 * Label styling for menu section headers.
 */
export const menuLabelVariants = cva('px-3 py-1 text-xs font-medium text-muted-foreground', {
  variants: {
    inset: {
      true: 'pl-8',
      false: '',
    },
  },
  defaultVariants: {
    inset: false,
  },
});

/**
 * Separator styling for menu dividers.
 */
export const menuSeparatorVariants = cva('mx-1.5 my-1 h-px bg-border');

/**
 * Negative vertical offset for side-positioned menus (left/right) and sub-menus.
 * Aligns the first item's text with the trigger's text.
 * Derived from: content padding (p-0.75 = 3px), adjusted to 2.5px to account
 * for the visual inset of the items' rounded-sm corners.
 */
export const menuSideAlignOffset = -7;

export const subMenuSideAlignOffset = -2.5;

/**
 * Shared icon+label flex layout. Use inside menu items, sub-triggers, select values, commands, etc.
 */
export const menuItemLayoutClass = 'flex items-center gap-2';

/**
 * SVG icon rules for standalone label containers not inside a menuItemVariants parent.
 * Extracted from menuItemVariants (minus -translate-y-[0.5px] which is item-level only).
 */
export const menuItemIconClass =
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-muted-foreground";
