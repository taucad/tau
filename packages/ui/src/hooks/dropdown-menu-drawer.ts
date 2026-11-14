import * as React from 'react';

/** What a responsive menu's parts read while its items are in a phone drawer. */
export type DropdownMenuDrawerState = {
  /** Closes the drawer, as choosing an item closes a menu. */
  readonly close: () => void;
  /** The trigger, where focus returns when the drawer closes and nothing else took it. */
  readonly triggerRef: React.RefObject<HTMLElement | undefined>;
};

/**
 * A responsive menu's drawer on a phone; absent wherever the menu is a dropdown. Internal to the menu's parts: a row
 * kind outside `dropdown-menu` (the slider row) reads it to render its own drawer form.
 */
export const dropdownMenuDrawerContext = React.createContext<DropdownMenuDrawerState | undefined>(undefined);

/**
 * Whether the caller renders inside a responsive menu's phone drawer, where menu rows take their drawer forms.
 *
 * @returns True inside the drawer; false in a dropdown menu, including one nested in the drawer.
 */
export const useIsDropdownMenuDrawer = (): boolean => React.useContext(dropdownMenuDrawerContext) !== undefined;
