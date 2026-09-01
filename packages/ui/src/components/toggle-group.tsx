import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '#utils/cn.js';
import { toggleVariants } from '#components/toggle.js';

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
  }
>({
  size: 'default',
  variant: 'default',
  spacing: 0,
});

/**
 * Render the APG toolbar-style group of single- or multiple-selection toggle
 * buttons. Arrow keys move focus; Space or Enter changes an item's pressed state.
 *
 * @public
 * @param properties - Radix toggle-group properties and shared Tau variants.
 * @returns The toggle group.
 *
 * @example <caption>Create a single-selection toggle group</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ToggleGroup } from '@taucad/ui/components/toggle-group';
 *
 * export const example = createElement(ToggleGroup, { type: 'single', 'aria-label': 'View mode' });
 * ```
 */
function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    readonly spacing?: number;
  }): React.JSX.Element {
  const contextValue = React.useMemo(() => ({ variant, size, spacing }), [variant, size, spacing]);
  return (
    <ToggleGroupPrimitive.Root
      data-slot='toggle-group'
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(
        'group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs',
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={contextValue}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

/**
 * Render one pressed-state item inside a toggle group.
 *
 * @public
 * @param properties - Radix item properties and optional Tau variant overrides.
 * @returns The toggle-group item.
 *
 * @example <caption>Add a toggle-group item</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ToggleGroupItem } from '@taucad/ui/components/toggle-group';
 *
 * export const example = createElement(ToggleGroupItem, { value: 'solid', 'aria-label': 'Solid view' });
 * ```
 */
function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>): React.JSX.Element {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot='toggle-group-item'
      data-variant={context.variant ?? variant}
      data-size={context.size ?? size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant ?? variant,
          size: context.size ?? size,
        }),
        'w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10',
        'data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l',
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
