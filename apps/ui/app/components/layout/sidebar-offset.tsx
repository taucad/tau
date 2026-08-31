import { Slot as SlotPrimitive } from 'radix-ui';
import { cn } from '#utils/ui.utils.js';

/**
 * Positioning constants for floating sidebar routes.
 */
const sidebarOffsetPadding = 'transition-[padding-left] duration-200 ease-linear md:pl-(--sidebar-padding-offset)';

const sidebarOffsetMargin =
  'transition-[margin] duration-200 ease-linear md:ml-[calc(var(--sidebar-width-current)-var(--spacing)*2)]';

const sidebarOffsetLeft = 'transition-[left] duration-200 ease-linear md:left-(--sidebar-width-current)';

type SidebarOffsetProps = {
  /** How the offset is applied: 'padding', 'margin', or 'left'. */
  readonly via: 'padding' | 'margin' | 'left';
  /** When true, merges props onto child element instead of wrapping. */
  readonly asChild?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
};

/**
 * Offsets content to account for the sidebar width on floating sidebar routes.
 *
 * @example
 * // Padding offset
 * <SidebarOffset via="padding"><Content /></SidebarOffset>
 *
 * @example
 * // Margin offset with asChild (no extra DOM node)
 * <SidebarOffset via="margin" asChild>
 *   <footer>...</footer>
 * </SidebarOffset>
 *
 * @example
 * // Left positioning for fixed/absolute elements
 * <SidebarOffset via="left" asChild>
 *   <div className="fixed">...</div>
 * </SidebarOffset>
 */
export function SidebarOffset({ via, asChild = false, className, children }: SidebarOffsetProps): React.JSX.Element {
  const Component = asChild ? SlotPrimitive.Slot : 'div';

  const offsetClass = {
    padding: sidebarOffsetPadding,
    margin: sidebarOffsetMargin,
    left: sidebarOffsetLeft,
  }[via];

  return <Component className={cn(offsetClass, className)}>{children}</Component>;
}
