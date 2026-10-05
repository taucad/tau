import type * as React from 'react';
import { menuItemLayoutClass, menuSwitchRowDescriptionClass } from '#components/menu.variants.js';
import { cn } from '#utils/cn.js';

/**
 * The label half of a switch row: an optional icon, the title and, when there is one, a
 * description under it. `DropdownMenuSwitchItem` and `SwitchRow` both draw it, so their rows
 * cannot drift apart.
 *
 * @internal
 * @param properties - The icon, title, description and the ids that name and describe the switch.
 * @returns The row's label content.
 */
export function SwitchRowLabel({
  icon,
  description,
  titleId,
  descriptionId,
  children,
}: {
  readonly icon?: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly titleId?: string;
  readonly descriptionId?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span className={cn(menuItemLayoutClass, 'min-w-0')}>
      {icon}
      {description === undefined ? (
        <span id={titleId} className={menuItemLayoutClass}>
          {children}
        </span>
      ) : (
        <span className='flex min-w-0 flex-col'>
          <span id={titleId} className='flex items-center gap-1'>
            {children}
          </span>
          <span id={descriptionId} className={menuSwitchRowDescriptionClass}>
            {description}
          </span>
        </span>
      )}
    </span>
  );
}
