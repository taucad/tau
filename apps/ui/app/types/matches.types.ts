import type { UIMatch } from 'react-router';
import type { ReactNode } from 'react';
import type { SetNonNullable } from 'type-fest';

export type Handle = {
  breadcrumb?: (match: UIMatch) => ReactNode | ReactNode[];
  actions?: (match: UIMatch) => ReactNode;
  commandPalette?: (match: UIMatch) => ReactNode;
  noPageWrapper?: boolean;
  /**
   * Enable floating sidebar. You will become responsible for setting content boundaries using:
   * - var(--sidebar-width) (for the sidebar width)
   * - var(--sidebar-width-current) (for the current sidebar width)
   * - var(--header-height) (for the header height)
   */
  enableFloatingSidebar?: boolean;
  /**
   * Enable overflow-y on the page. Use this when you have scrollable content in the page.
   */
  enableOverflowY?: boolean;
};

export type TypedUiMatch = UIMatch & {
  handle?: Handle;
};

export type TypedUiMatchWithHandle = SetNonNullable<TypedUiMatch, 'handle'>;
