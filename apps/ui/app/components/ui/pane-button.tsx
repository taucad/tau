import type { ReactNode } from 'react';
import { Slot as SlotPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

type TooltipSide = 'left' | 'right' | 'top' | 'bottom';

const paneButtonVariants = cva(
  [
    'flex shrink-0 select-none items-center justify-center rounded-sm',
    'text-muted-foreground transition-colors',
    'hover:bg-muted-foreground/15 hover:text-foreground',
    'aria-pressed:bg-muted-foreground/15 aria-pressed:hover:bg-muted-foreground/20',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      size: {
        icon: 'size-7',
        label: 'h-7 gap-1.5 whitespace-nowrap px-2 text-xs',
      },
    },
    defaultVariants: { size: 'icon' },
  },
);

type PaneButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof paneButtonVariants> & {
    readonly asChild?: boolean;
    readonly tooltip?: ReactNode;
    readonly tooltipSide?: TooltipSide;
  };

/**
 * Shared button primitive for panel headers (Dockview tab-bar actions,
 * floating-panel header buttons, file actions, etc.).
 *
 * Renders a 28 px icon or labelled button with consistent hover colours,
 * pressed state, focus ring, and disabled state. Accepts `ref` as a regular prop
 * (React 19) and supports `asChild` via Radix `SlotPrimitive.Slot` for composition with
 * triggers (DropdownMenuTrigger, PopoverTrigger, etc.).
 *
 * An optional `tooltip` prop wraps the button in a Tooltip automatically.
 */
function PaneButton({
  asChild = false,
  tooltip,
  tooltipSide = 'top',
  size,
  className,
  ...properties
}: PaneButtonProps): React.JSX.Element {
  const Comp = asChild ? SlotPrimitive.Slot : 'button';

  const button = (
    <Comp
      data-slot='pane-button'
      type={asChild ? undefined : 'button'}
      className={paneButtonVariants({ size, className })}
      {...properties}
    />
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

export { PaneButton };
export type { PaneButtonProps };
